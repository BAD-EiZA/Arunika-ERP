import { postFromRule, postJournal } from "@/server/services/accounting";

jest.mock("@/lib/document-number", () => ({
  nextDocumentNumber: jest.fn(async () => "JE/202607/000001"),
}));

function makeTx(opts: {
  existingJournal?: unknown;
  periodStatus?: "OPEN" | "CLOSED" | null;
  accounts?: Array<{ id: string; code: string }>;
  rule?: unknown;
} = {}) {
  return {
    journal: {
      findUnique: jest.fn(async () => opts.existingJournal ?? null),
      create: jest.fn(async ({ data }: { data: unknown }) => ({
        id: "j1",
        ...(data as object),
        lines: [],
      })),
    },
    fiscalPeriod: {
      findFirst: jest.fn(async () =>
        opts.periodStatus === null
          ? null
          : opts.periodStatus
            ? { id: "fp1", status: opts.periodStatus }
            : { id: "fp1", status: "OPEN" },
      ),
    },
    account: {
      findMany: jest.fn(async () =>
        opts.accounts ?? [
          { id: "a1", code: "1100" },
          { id: "a2", code: "2100" },
          { id: "a3", code: "1120" },
          { id: "a4", code: "4100" },
          { id: "a5", code: "2120" },
          { id: "a6", code: "2110" },
          { id: "a7", code: "1140" },
          { id: "a8", code: "1130" },
        ],
      ),
    },
    postingRule: {
      findFirst: jest.fn(async () => opts.rule ?? null),
    },
  };
}

describe("accounting", () => {
  it("returns existing journal for idempotency", async () => {
    const existing = { id: "old" };
    const tx = makeTx({ existingJournal: existing });
    const r = await postJournal(tx as never, {
      companyId: "c1",
      sourceModule: "m",
      sourceDocType: "t",
      sourceDocId: "1",
      description: "d",
      idempotencyKey: "k",
      lines: [
        { accountCode: "1100", debit: 10 },
        { accountCode: "2100", credit: 10 },
      ],
    });
    expect(r).toBe(existing);
  });

  it("validates min lines and balance", async () => {
    const tx = makeTx();
    await expect(
      postJournal(tx as never, {
        companyId: "c1",
        sourceModule: "m",
        sourceDocType: "t",
        sourceDocId: "1",
        description: "d",
        idempotencyKey: "k1",
        lines: [{ accountCode: "1100", debit: 10 }],
      }),
    ).rejects.toThrow("Jurnal minimal 2 baris");

    await expect(
      postJournal(tx as never, {
        companyId: "c1",
        sourceModule: "m",
        sourceDocType: "t",
        sourceDocId: "1",
        description: "d",
        idempotencyKey: "k2",
        lines: [
          { accountCode: "1100", debit: 10 },
          { accountCode: "2100", credit: 5 },
        ],
      }),
    ).rejects.toThrow("Jurnal tidak seimbang");
  });

  it("rejects closed period and missing account", async () => {
    const txClosed = makeTx({ periodStatus: "CLOSED" });
    await expect(
      postJournal(txClosed as never, {
        companyId: "c1",
        sourceModule: "m",
        sourceDocType: "t",
        sourceDocId: "1",
        description: "d",
        idempotencyKey: "k3",
        lines: [
          { accountCode: "1100", debit: 10 },
          { accountCode: "2100", credit: 10 },
        ],
      }),
    ).rejects.toThrow("Periode akuntansi sudah ditutup");

    const txMissing = makeTx({ accounts: [{ id: "a1", code: "1100" }] });
    await expect(
      postJournal(txMissing as never, {
        companyId: "c1",
        sourceModule: "m",
        sourceDocType: "t",
        sourceDocId: "1",
        description: "d",
        idempotencyKey: "k4",
        lines: [
          { accountCode: "1100", debit: 10 },
          { accountCode: "9999", credit: 10 },
        ],
      }),
    ).rejects.toThrow("Akun 9999 tidak ditemukan");
  });

  it("posts balanced journal without period", async () => {
    const tx = makeTx({ periodStatus: null });
    const r = await postJournal(tx as never, {
      companyId: "c1",
      sourceModule: "m",
      sourceDocType: "t",
      sourceDocId: "1",
      description: "d",
      idempotencyKey: "",
      journalType: "GENERAL",
      postedById: "u1",
      postingDate: new Date("2026-07-01"),
      lines: [
        { accountCode: "1100", debit: 10, description: "dr" },
        { accountCode: "2100", credit: 10 },
        { accountCode: "1100", debit: 0, credit: 0 },
      ],
    });
    expect(r.id).toBe("j1");
    expect(tx.journal.create).toHaveBeenCalled();
    expect(tx.journal.findUnique).not.toHaveBeenCalled();
  });

  it("postJournal default postingDate and credit-only filter", async () => {
    const tx = makeTx();
    await postJournal(tx as never, {
      companyId: "c1",
      sourceModule: "m",
      sourceDocType: "t",
      sourceDocId: "1",
      description: "d",
      idempotencyKey: "k-default-date",
      lines: [
        { accountCode: "1100", debit: 5 },
        { accountCode: "2100", credit: 5 },
        { accountCode: "1100" },
      ],
    });
    expect(tx.journal.create).toHaveBeenCalled();
  });

  it("postFromRule returns null without rule", async () => {
    const tx = makeTx({ rule: null });
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "x",
      sourceDocType: "t",
      sourceDocId: "1",
      description: "d",
      amount: 100,
      idempotencyKey: "k",
    });
    expect(r).toBeNull();
  });

  it("postFromRule returns null when no versions", async () => {
    const tx = makeTx({ rule: { versions: [] } });
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "x",
      sourceDocType: "t",
      sourceDocId: "1",
      description: "d",
      amount: 100,
      idempotencyKey: "k",
    });
    expect(r).toBeNull();
  });

  it("postFromRule sales invoice with tax", async () => {
    const tx = makeTx({
      rule: {
        versions: [
          {
            config: {
              lines: [
                { side: "DEBIT", accountCode: "1120" },
                { side: "CREDIT", accountCode: "4100" },
              ],
            },
          },
        ],
      },
    });
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "sales_invoice.issue",
      sourceDocType: "SalesInvoice",
      sourceDocId: "1",
      description: "inv",
      amount: 100,
      taxAmount: 11,
      idempotencyKey: "k-inv",
    });
    expect(r).not.toBeNull();
  });

  it("postFromRule sales invoice without tax and catch error", async () => {
    const tx = makeTx({
      accounts: [],
      rule: {
        versions: [{ config: { lines: [] } }],
      },
    });
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "sales_invoice.issue",
      sourceDocType: "SalesInvoice",
      sourceDocId: "1",
      description: "inv",
      amount: 100,
      taxAmount: 0,
      idempotencyKey: "k-inv2",
    });
    expect(r).toBeNull();
  });

  it("postFromRule supplier bill with tax", async () => {
    const tx = makeTx({
      rule: {
        versions: [{ config: { lines: [] } }],
      },
    });
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "supplier_bill.open",
      sourceDocType: "SupplierBill",
      sourceDocId: "1",
      description: "bill",
      amount: 100,
      taxAmount: 11,
      idempotencyKey: "k-bill",
    });
    expect(r).not.toBeNull();
  });

  it("postFromRule supplier bill without tax error path", async () => {
    const tx = makeTx({
      accounts: [],
      rule: { versions: [{ config: { lines: [] } }] },
    });
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "supplier_bill.open",
      sourceDocType: "SupplierBill",
      sourceDocId: "1",
      description: "bill",
      amount: 100,
      taxAmount: 0,
      idempotencyKey: "k-bill2",
    });
    expect(r).toBeNull();
  });

  it("postFromRule generic config path success and fail", async () => {
    const tx = makeTx({
      rule: {
        versions: [
          {
            config: {
              lines: [
                { side: "DEBIT", accountCode: "1130" },
                { side: "CREDIT", accountCode: "2110" },
                { side: "DEBIT", accountCode: "1140", tax: true },
              ],
            },
          },
        ],
      },
    });
    // tax line 0 keeps balance for non-tax lines
    const r = await postFromRule(tx as never, {
      companyId: "c1",
      sourceEvent: "goods_receipt.post",
      sourceDocType: "GoodsReceipt",
      sourceDocId: "1",
      description: "gr",
      amount: 100,
      taxAmount: 0,
      idempotencyKey: "k-gr",
      postedById: "u",
    });
    expect(r).not.toBeNull();

    const txFail = makeTx({
      accounts: [{ id: "a1", code: "1130" }],
      rule: {
        versions: [
          {
            config: {
              lines: [
                { side: "DEBIT", accountCode: "1130" },
                { side: "CREDIT", accountCode: "2110" },
              ],
            },
          },
        ],
      },
    });
    const r2 = await postFromRule(txFail as never, {
      companyId: "c1",
      sourceEvent: "goods_receipt.post",
      sourceDocType: "GoodsReceipt",
      sourceDocId: "1",
      description: "gr",
      amount: 100,
      idempotencyKey: "k-gr2",
    });
    expect(r2).toBeNull();
  });
});
