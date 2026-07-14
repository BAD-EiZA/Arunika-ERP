import {
  correctTaxDocument,
  createTaxDocument,
  exportTaxPeriod,
  getEffectiveTaxCode,
} from "@/server/services/tax";

const prismaMock = {
  taxCode: { findFirst: jest.fn() },
  taxDocument: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    taxCode: {
      findFirst: (...a: unknown[]) => prismaMock.taxCode.findFirst(...a),
    },
    taxDocument: {
      findFirst: (...a: unknown[]) => prismaMock.taxDocument.findFirst(...a),
      create: (...a: unknown[]) => prismaMock.taxDocument.create(...a),
      findMany: (...a: unknown[]) => prismaMock.taxDocument.findMany(...a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      prismaMock.$transaction(fn),
  },
}));

jest.mock("@/lib/document-number", () => ({
  nextDocumentNumber: jest.fn(async () => "TAX/202607/000001"),
}));

describe("tax", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getEffectiveTaxCode", async () => {
    prismaMock.taxCode.findFirst.mockResolvedValue({ code: "PPN" });
    await expect(getEffectiveTaxCode("c", "PPN")).resolves.toEqual({
      code: "PPN",
    });
    await getEffectiveTaxCode("c", "PPN", new Date("2026-01-01"));
    expect(prismaMock.taxCode.findFirst).toHaveBeenCalled();
  });

  it("createTaxDocument validates and creates", async () => {
    await expect(
      createTaxDocument({
        companyId: "c",
        docType: "F",
        taxType: "PPN",
        dpp: -1,
        taxAmount: 0,
      }),
    ).rejects.toThrow("DPP/pajak tidak valid");

    await expect(
      createTaxDocument({
        companyId: "c",
        docType: "F",
        taxType: "PPN",
        dpp: 0,
        taxAmount: -1,
      }),
    ).rejects.toThrow("DPP/pajak tidak valid");

    prismaMock.$transaction.mockImplementation(async (fn) =>
      fn({
        taxDocument: {
          create: jest.fn(async ({ data }: { data: unknown }) => ({
            id: "t1",
            ...(data as object),
          })),
        },
      }),
    );

    const doc = await createTaxDocument({
      companyId: "c",
      docType: "FAKTUR",
      taxType: "PPN",
      dpp: 100,
      taxAmount: 11,
      partnerName: "A",
      partnerNpwp: "1",
      taxPeriod: "202607",
      sourceDocType: "INV",
      sourceDocId: "i1",
      notes: "n",
      documentDate: new Date("2026-07-01"),
    });
    expect(doc.id).toBe("t1");

    await createTaxDocument({
      companyId: "c",
      docType: "F",
      taxType: "PPN",
      dpp: 1,
      taxAmount: 0,
    });
  });

  it("correctTaxDocument", async () => {
    prismaMock.taxDocument.findFirst.mockResolvedValue(null);
    await expect(
      correctTaxDocument({
        companyId: "c",
        taxDocumentId: "x",
        dpp: 1,
        taxAmount: 1,
      }),
    ).rejects.toThrow("Dokumen pajak tidak ditemukan");

    prismaMock.taxDocument.findFirst.mockResolvedValue({
      id: "old",
      number: "T1",
      docType: "F",
      taxType: "PPN",
      partnerName: "A",
      partnerNpwp: "1",
      taxPeriod: "202607",
      sourceDocType: "INV",
      sourceDocId: "i1",
      version: 1,
    });
    prismaMock.taxDocument.create.mockResolvedValue({ id: "new", version: 2 });
    await correctTaxDocument({
      companyId: "c",
      taxDocumentId: "old",
      dpp: 2,
      taxAmount: 2,
      notes: "fix",
    });
    expect(prismaMock.taxDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2, notes: "fix" }),
      }),
    );

    await correctTaxDocument({
      companyId: "c",
      taxDocumentId: "old",
      dpp: 2,
      taxAmount: 2,
    });
    expect(prismaMock.taxDocument.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: "Koreksi v2" }),
      }),
    );
  });

  it("exportTaxPeriod", async () => {
    prismaMock.taxDocument.findMany.mockResolvedValue([
      {
        number: "T1",
        version: 1,
        docType: "F",
        taxType: "PPN",
        partnerName: "A",
        partnerNpwp: "1",
        dpp: { toString: () => "100" },
        taxAmount: { toString: () => "11" },
        documentDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]);
    const exp = await exportTaxPeriod("c", "202607");
    expect(exp.count).toBe(1);
    expect(exp.rows[0].dpp).toBe("100");
    expect(exp.taxPeriod).toBe("202607");
  });
});
