import { postFromRule, postJournal, postDraftJournal, saveDraftJournal } from "@/server/services/accounting";

jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "JE/1") }));
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ prisma: { $transaction: (...args: unknown[]) => db.$transaction(...args) } }));
const journalInput = {
  companyId: "c", sourceModule: "m", sourceDocType: "t", sourceDocId: "1",
  description: "test", idempotencyKey: "key",
  lines: [{ accountCode: "1100", debit: 10 }, { accountCode: "2100", credit: 10 }],
};
const ruleInput = { companyId: "c", sourceEvent: "generic", sourceDocType: "t", sourceDocId: "1", description: "test", amount: 10, idempotencyKey: "rule" };
function makeTx() {
  return {
    journal: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: "j" }), update: jest.fn() },
    journalLine: { deleteMany: jest.fn() },
    fiscalPeriod: { findFirst: jest.fn().mockResolvedValue({ id: "p", status: "OPEN", fiscalYear: { isClosed: false } }) },
    account: { findMany: jest.fn().mockResolvedValue(["1100", "2100", "1120", "4100", "2120", "2110", "1140", "1130", "5100"].map(code => ({ id: code, code, isActive: true, isPosting: true }))) },
    postingRule: { findFirst: jest.fn().mockResolvedValue({ versions: [{ config: { lines: [{ side: "DEBIT", accountCode: "1100" }, { side: "CREDIT", accountCode: "2100" }] } }] }) },
  };
}

describe("accounting fail-closed posting", () => {
  beforeEach(() => jest.clearAllMocks());
  it.each([null, { versions: [] }])("rejects absent effective rule %p", async rule => {
    const tx = makeTx(); tx.postingRule.findFirst.mockResolvedValue(rule);
    await expect(postFromRule(tx as never, ruleInput)).rejects.toThrow("Posting rule");
    expect(tx.journal.create).not.toHaveBeenCalled();
  });
  it.each(["generic", "sales_invoice.issue", "supplier_bill.open", "credit_note.issue", "debit_note.issue", "delivery_order.post"])("propagates journal failure for %s", async sourceEvent => {
    const tx = makeTx(); tx.journal.create.mockRejectedValue(new Error("journal failed"));
    await expect(postFromRule(tx as never, { ...ruleInput, sourceEvent })).rejects.toThrow("journal failed");
  });
  it("creates a balanced journal", async () => {
    const tx = makeTx(); await postJournal(tx as never, journalInput);
    expect(tx.journal.create).toHaveBeenCalled();
  });
  it("rejects posted journal without a fiscal period", async () => {
    const tx = makeTx(); tx.fiscalPeriod.findFirst.mockResolvedValue(null);
    await expect(postJournal(tx as never, journalInput)).rejects.toThrow("Periode akuntansi tidak ditemukan");
    expect(tx.journal.create).not.toHaveBeenCalled();
  });
  it.each([[-1, 11], [10, 10], [0, 0]])("rejects invalid debit/credit line %s %s", async (debit, credit) => {
    const tx = makeTx();
    await expect(postJournal(tx as never, { ...journalInput, lines: [{ accountCode: "1100", debit, credit }, { accountCode: "2100", debit: credit, credit: debit }] })).rejects.toThrow("Baris jurnal");
  });
  it("rejects inactive accounts", async () => {
    const tx = makeTx(); tx.account.findMany.mockResolvedValue([{ id: "1100", code: "1100", isActive: false }, { id: "2100", code: "2100", isActive: true }]);
    await expect(postJournal(tx as never, journalInput)).rejects.toThrow("tidak aktif");
  });
  it("rejects closed fiscal year", async () => {
    const tx = makeTx(); tx.fiscalPeriod.findFirst.mockResolvedValue({ id: "p", status: "OPEN", fiscalYear: { isClosed: true } });
    await expect(postJournal(tx as never, journalInput)).rejects.toThrow("tahun fiskal");
  });
  it("rejects invalid stored draft before posting", async () => {
    const tx = makeTx(); tx.journal.findFirst.mockResolvedValue({ id: "draft", postingDate: new Date(), lines: [{ accountId: "1100", debit: 10, credit: 0 }, { accountId: "2100", debit: 0, credit: 5 }] });
    db.$transaction.mockImplementation(async fn => fn(tx));
    await expect(postDraftJournal({ companyId: "c", userId: "u", journalId: "draft" })).rejects.toThrow("Jurnal tidak seimbang");
    expect(tx.journal.update).not.toHaveBeenCalled();
  });
  it("rejects invalid draft edit before deleting lines", async () => {
    const tx = makeTx(); tx.journal.findFirst.mockResolvedValue({ id: "draft", postingDate: new Date(), exchangeRate: 1 });
    db.$transaction.mockImplementation(async fn => fn(tx));
    await expect(saveDraftJournal({ companyId: "c", userId: "u", journalId: "draft", description: "edit", lines: [{ accountCode: "1100", debit: 10 }, { accountCode: "2100", credit: 5 }] })).rejects.toThrow("Jurnal tidak seimbang");
    expect(tx.journalLine.deleteMany).not.toHaveBeenCalled();
  });
  it("rejects stored draft with inactive accounts", async () => {
    const tx = makeTx(); tx.journal.findFirst.mockResolvedValue({ id: "draft", postingDate: new Date(), exchangeRate: 1, lines: [{ accountId: "1100", debit: 10 }, { accountId: "2100", credit: 10 }] });
    tx.account.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async fn => fn(tx));
    await expect(postDraftJournal({ companyId: "c", userId: "u", journalId: "draft" })).rejects.toThrow("Akun");
  });
  it("rejects invalid draft edit exchange rate", async () => {
    const tx = makeTx(); tx.journal.findFirst.mockResolvedValue({ id: "draft", postingDate: new Date(), exchangeRate: 1 });
    db.$transaction.mockImplementation(async fn => fn(tx));
    await expect(saveDraftJournal({ companyId: "c", userId: "u", journalId: "draft", description: "edit", lines: journalInput.lines, exchangeRate: -1 })).rejects.toThrow("Kurs");
    expect(tx.journalLine.deleteMany).not.toHaveBeenCalled();
  });
  it("reuses an existing journal", async () => {
    const tx = makeTx(); tx.journal.findUnique.mockResolvedValue({ id: "old" });
    await expect(postJournal(tx as never, journalInput)).resolves.toEqual({ id: "old" });
    expect(tx.journal.create).not.toHaveBeenCalled();
  });
  it.each([
    [{ accountCode: "1100", debit: 10 }],
    [{ accountCode: "1100", debit: 10 }, { accountCode: "2100", credit: 9 }],
  ])("rejects invalid totals %p", async (...lines) => {
    await expect(postJournal(makeTx() as never, { ...journalInput, lines: lines as typeof journalInput.lines })).rejects.toThrow();
  });
});
