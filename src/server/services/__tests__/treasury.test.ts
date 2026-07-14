import {
  closeFiscalPeriod,
  createBankAccount,
  createBudget,
  createFixedAsset,
  importBankStatement,
  reconcileStatementLine,
  runStraightLineDepreciation,
} from "@/server/services/treasury";

const prismaMock = {
  bankAccount: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  bankStatement: { create: jest.fn() },
  bankStatementLine: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  budget: { create: jest.fn() },
  fixedAsset: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  fiscalPeriod: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  prisma: {
    bankAccount: {
      create: (...a: unknown[]) => prismaMock.bankAccount.create(...a),
      findFirst: (...a: unknown[]) => prismaMock.bankAccount.findFirst(...a),
    },
    bankStatement: {
      create: (...a: unknown[]) => prismaMock.bankStatement.create(...a),
    },
    bankStatementLine: {
      findFirst: (...a: unknown[]) => prismaMock.bankStatementLine.findFirst(...a),
      update: (...a: unknown[]) => prismaMock.bankStatementLine.update(...a),
    },
    budget: { create: (...a: unknown[]) => prismaMock.budget.create(...a) },
    fixedAsset: {
      create: (...a: unknown[]) => prismaMock.fixedAsset.create(...a),
      findFirst: (...a: unknown[]) => prismaMock.fixedAsset.findFirst(...a),
      update: (...a: unknown[]) => prismaMock.fixedAsset.update(...a),
    },
    fiscalPeriod: {
      findFirst: (...a: unknown[]) => prismaMock.fiscalPeriod.findFirst(...a),
      update: (...a: unknown[]) => prismaMock.fiscalPeriod.update(...a),
    },
  },
}));

describe("treasury", () => {
  beforeEach(() => jest.clearAllMocks());

  it("createBankAccount", async () => {
    await expect(
      createBankAccount({ companyId: "c", code: " ", name: "n" }),
    ).rejects.toThrow("Kode dan nama rekening wajib");
    await expect(
      createBankAccount({ companyId: "c", code: "B", name: " " }),
    ).rejects.toThrow("Kode dan nama rekening wajib");
    prismaMock.bankAccount.create.mockResolvedValue({ id: "ba" });
    await createBankAccount({
      companyId: "c",
      code: " B1 ",
      name: " Bank ",
      bankName: "BCA",
      accountNumber: "123",
    });
    expect(prismaMock.bankAccount.create).toHaveBeenCalled();
  });

  it("importBankStatement", async () => {
    prismaMock.bankAccount.findFirst.mockResolvedValue(null);
    await expect(
      importBankStatement({
        companyId: "c",
        bankAccountId: "x",
        statementDate: new Date(),
        openingBalance: 0,
        closingBalance: 0,
        lines: [],
      }),
    ).rejects.toThrow("Rekening tidak ditemukan");

    prismaMock.bankAccount.findFirst.mockResolvedValue({ id: "ba" });
    prismaMock.bankStatement.create.mockResolvedValue({ id: "st" });
    await importBankStatement({
      companyId: "c",
      bankAccountId: "ba",
      statementDate: new Date(),
      openingBalance: 10,
      closingBalance: 20,
      lines: [{ lineDate: new Date(), description: "d", amount: 5 }],
    });
    expect(prismaMock.bankStatement.create).toHaveBeenCalled();
  });

  it("reconcileStatementLine", async () => {
    prismaMock.bankStatementLine.findFirst.mockResolvedValue(null);
    await expect(reconcileStatementLine("c", "l", "ref")).rejects.toThrow(
      "Baris statement tidak ditemukan",
    );
    prismaMock.bankStatementLine.findFirst.mockResolvedValue({ id: "l" });
    prismaMock.bankStatementLine.update.mockResolvedValue({ id: "l" });
    await reconcileStatementLine("c", "l", "REF");
    expect(prismaMock.bankStatementLine.update).toHaveBeenCalledWith({
      where: { id: "l" },
      data: { isReconciled: true, matchedRef: "REF" },
    });
  });

  it("createBudget and createFixedAsset", async () => {
    prismaMock.budget.create.mockResolvedValue({ id: "b" });
    await createBudget({
      companyId: "c",
      name: "B",
      year: 2026,
      lines: [{ accountCode: "6100", period: 1, amount: 100 }],
    });
    expect(prismaMock.budget.create).toHaveBeenCalled();

    prismaMock.fixedAsset.create.mockResolvedValue({ id: "a" });
    await createFixedAsset({
      companyId: "c",
      code: "A1",
      name: "Laptop",
      acquisitionDate: new Date(),
      acquisitionCost: 1200,
      residualValue: 0,
      usefulLifeMonths: 12,
      category: "IT",
    });
    await createFixedAsset({
      companyId: "c",
      code: "A2",
      name: "Desk",
      acquisitionDate: new Date(),
      acquisitionCost: 100,
      usefulLifeMonths: 10,
    });
    expect(prismaMock.fixedAsset.create).toHaveBeenCalledTimes(2);
  });

  it("runStraightLineDepreciation", async () => {
    prismaMock.fixedAsset.findFirst.mockResolvedValue(null);
    await expect(runStraightLineDepreciation("c", "a")).rejects.toThrow(
      "Aset tidak ditemukan",
    );

    const asset = {
      id: "a",
      acquisitionCost: "1200",
      residualValue: "0",
      usefulLifeMonths: 12,
      accumulatedDep: "0",
    };
    prismaMock.fixedAsset.findFirst.mockResolvedValue(asset);
    prismaMock.fixedAsset.update.mockResolvedValue({ id: "a" });
    await runStraightLineDepreciation("c", "a");
    expect(prismaMock.fixedAsset.update).toHaveBeenCalled();

    // residual floor hit
    prismaMock.fixedAsset.findFirst.mockResolvedValue({
      id: "a",
      acquisitionCost: "100",
      residualValue: "90",
      usefulLifeMonths: 12,
      accumulatedDep: "20",
    });
    const r = await runStraightLineDepreciation("c", "a");
    expect(r.accumulatedDep).toBe("20");
  });

  it("closeFiscalPeriod", async () => {
    prismaMock.fiscalPeriod.findFirst.mockResolvedValue(null);
    await expect(closeFiscalPeriod("c", "p")).rejects.toThrow(
      "Periode tidak ditemukan",
    );
    prismaMock.fiscalPeriod.findFirst.mockResolvedValue({ id: "p" });
    prismaMock.fiscalPeriod.update.mockResolvedValue({ id: "p", status: "CLOSED" });
    await closeFiscalPeriod("c", "p");
    expect(prismaMock.fiscalPeriod.update).toHaveBeenCalledWith({
      where: { id: "p" },
      data: { status: "CLOSED" },
    });
  });
});
