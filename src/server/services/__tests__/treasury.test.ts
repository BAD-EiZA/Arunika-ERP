import { closeFiscalYear, importBankStatement, reconcileStatementLine, runStraightLineDepreciation, disposeFixedAsset } from "../treasury";
const mockDb = {
  bankAccount: { findFirst: jest.fn() },
  bankStatement: { create: jest.fn() },
  bankStatementLine: { findFirst: jest.fn(), update: jest.fn() },
  fixedAsset: { findFirst: jest.fn(), update: jest.fn() },
  fiscalPeriod: { findFirst: jest.fn(), updateMany: jest.fn() },
  fiscalYear: { findFirst: jest.fn(), update: jest.fn() },
  journalLine: { findMany: jest.fn() },
  account: { findMany: jest.fn() },
  journal: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: (_t, k) => mockDb[k as keyof typeof mockDb] }) }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "JE/1") }));
const date = new Date("2026-01-31");
const asset = { id: "a", code: "A", name: "Asset", acquisitionDate: new Date("2025-01-01"), acquisitionCost: "1200", residualValue: "0", usefulLifeMonths: 12, accumulatedDep: "0", bookValue: "1200" };
beforeEach(() => {
  jest.resetAllMocks();
  mockDb.$transaction.mockImplementation(async fn => fn(mockDb));
  mockDb.account.findMany.mockResolvedValue(["6200", "1210", "4100", "3200", "1110", "1200", "6100"].map(code => ({ id: code, code, isActive: true })));
  mockDb.fiscalPeriod.findFirst.mockResolvedValue({ id: "p", status: "OPEN", startDate: new Date("2026-01-01"), endDate: date, fiscalYear: { isClosed: false } });
  mockDb.fixedAsset.findFirst.mockResolvedValue(asset);
  mockDb.journal.findUnique.mockResolvedValue(null);
  mockDb.journal.create.mockResolvedValue({ id: "j" });
  mockDb.fixedAsset.update.mockResolvedValue({ id: "a" });
  mockDb.fiscalYear.findFirst.mockResolvedValue({ id: "y", name: "2026", startDate: new Date("2026-01-01"), endDate: date, isClosed: false, periods: [{ id: "p", status: "OPEN" }] });
  mockDb.journalLine.findMany.mockResolvedValue([{ accountId: "4100", account: { code: "4100", type: "REVENUE" }, debit: "0", credit: "500" }]);
});
describe("depreciation", () => {
  it("rejects missing asset", async () => {
    mockDb.fixedAsset.findFirst.mockResolvedValue(null);
    await expect(runStraightLineDepreciation("c", "a", "u", date)).rejects.toThrow("Aset tidak ditemukan");
  });
  it("posts period-stable journal before asset mutation", async () => {
    await runStraightLineDepreciation("c", "a", "u", date);
    expect(mockDb.journal.create.mock.calls[0][0].data.idempotencyKey).toBe("dep:a:p");
    expect(mockDb.fixedAsset.update.mock.calls[0][0].data.accumulatedDep).toBe("100.00");
    expect(mockDb.journal.create.mock.invocationCallOrder[0]).toBeLessThan(mockDb.fixedAsset.update.mock.invocationCallOrder[0]);
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("rejects duplicate period without updating asset", async () => {
    mockDb.journal.findUnique.mockResolvedValue({ id: "duplicate" });
    await expect(runStraightLineDepreciation("c", "a", "u", date)).rejects.toThrow("sudah disusutkan");
    expect(mockDb.fixedAsset.update).not.toHaveBeenCalled();
  });
  it("journal failure prevents mutation", async () => {
    mockDb.journal.create.mockRejectedValue(new Error("post fail"));
    await expect(runStraightLineDepreciation("c", "a", "u", date)).rejects.toThrow("post fail");
    expect(mockDb.fixedAsset.update).not.toHaveBeenCalled();
  });
  it("caps final depreciation at residual", async () => {
    mockDb.fixedAsset.findFirst.mockResolvedValue({ ...asset, accumulatedDep: "1199.99", bookValue: "0.01" });
    await runStraightLineDepreciation("c", "a", "u", date);
    expect(mockDb.fixedAsset.update.mock.calls[0][0].data.bookValue).toBe("0.00");
  });
  it("rejects missing period", async () => {
    mockDb.fiscalPeriod.findFirst.mockResolvedValue(null);
    await expect(runStraightLineDepreciation("c", "a", "u", date)).rejects.toThrow("Periode");
  });
});
describe("disposal", () => {
  it("journal failure prevents asset disposal", async () => {
    mockDb.journal.create.mockRejectedValue(new Error("post fail"));
    await expect(disposeFixedAsset({ companyId: "c", userId: "u", assetId: "a" })).rejects.toThrow("post fail");
    expect(mockDb.fixedAsset.update).not.toHaveBeenCalled();
  });
});
describe("fiscal closing", () => {
  const close = () => closeFiscalYear({ companyId: "c", userId: "u", fiscalYearId: "y" });
  it("posts before closing periods in single serializable transaction", async () => {
    await close();
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mockDb.journal.create.mock.invocationCallOrder[0]).toBeLessThan(mockDb.fiscalPeriod.updateMany.mock.invocationCallOrder[0]);
    expect(mockDb.fiscalYear.update).toHaveBeenCalledWith({ where: { id: "y" }, data: { isClosed: true } });
  });
  it("posting failure leaves periods and year unchanged", async () => {
    mockDb.journal.create.mockRejectedValue(new Error("post fail"));
    await expect(close()).rejects.toThrow("post fail");
    expect(mockDb.fiscalPeriod.updateMany).not.toHaveBeenCalled();
    expect(mockDb.fiscalYear.update).not.toHaveBeenCalled();
  });
  it("closes empty year without creating empty journal", async () => {
    mockDb.journalLine.findMany.mockResolvedValue([]);
    await close();
    expect(mockDb.journal.create).not.toHaveBeenCalled();
    expect(mockDb.fiscalPeriod.updateMany).toHaveBeenCalled();
  });
  it("normalizes contra income balance without negative lines", async () => {
    mockDb.journalLine.findMany.mockResolvedValue([{ accountId: "4100", account: { code: "4100", type: "REVENUE" }, debit: "500", credit: "0" }]);
    await close();
    expect(mockDb.journal.create.mock.calls[0][0].data.lines.create[0].credit).toBe("500.00");
  });
});
describe("bank reconciliation", () => {
  beforeEach(() => {
    mockDb.bankAccount.findFirst.mockResolvedValue({ id: "b", glAccountId: "1110" });
    mockDb.bankStatementLine.findFirst.mockResolvedValue(null).mockResolvedValueOnce({ id: "s", amount: "150", isReconciled: false, statement: { bankAccount: { id: "b", glAccountId: "1110" } } });
    mockDb.journalLine.findMany.mockResolvedValue([{ id: "jl", accountId: "1110", debit: "150", credit: "0", journal: { status: "POSTED" } }]);
  });
  it("requires actual posted GL line ID with matching signed amount", async () => {
    await reconcileStatementLine("c", "s", "jl");
    expect(mockDb.bankStatementLine.update).toHaveBeenCalledWith({ where: { id: "s" }, data: { isReconciled: true, matchedRef: "jl" } });
    expect(mockDb.journalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "jl", accountId: "1110", journal: { companyId: "c", status: "POSTED" } }) }));
  });
  it("rejects nonexistent reference", async () => {
    mockDb.journalLine.findMany.mockResolvedValue([]);
    await expect(reconcileStatementLine("c", "s", "fake")).rejects.toThrow();
    expect(mockDb.bankStatementLine.update).not.toHaveBeenCalled();
  });
  it("rejects amount mismatch", async () => {
    mockDb.journalLine.findMany.mockResolvedValue([{ id: "jl", accountId: "1110", debit: "149", credit: "0" }]);
    await expect(reconcileStatementLine("c", "s", "jl")).rejects.toThrow("Jumlah");
  });
  it("rejects reused journal line", async () => {
    mockDb.bankStatementLine.findFirst.mockResolvedValueOnce({ id: "s", amount: "150", statement: { bankAccount: { glAccountId: "1110" } } }).mockResolvedValueOnce({ id: "other" });
    await expect(reconcileStatementLine("c", "s", "jl")).rejects.toThrow("sudah");
  });
  it("validates statement saldo on import", async () => {
    await expect(importBankStatement({ companyId: "c", bankAccountId: "b", statementDate: date, openingBalance: 10, closingBalance: 20, lines: [{ lineDate: date, amount: 5 }] })).rejects.toThrow("Saldo");
    expect(mockDb.bankStatement.create).not.toHaveBeenCalled();
  });
});
