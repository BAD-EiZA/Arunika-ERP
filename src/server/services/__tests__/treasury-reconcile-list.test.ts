const mockDb = {
  bankAccount: { findFirst: jest.fn(), findMany: jest.fn() },
  bankStatementLine: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  journalLine: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ prisma: mockDb }));
import { listReconcilableLines } from "../treasury";
beforeEach(() => jest.clearAllMocks());
it("lists posted, unreconciled journal lines for bank GL accounts", async () => {
  mockDb.bankAccount.findMany.mockResolvedValue([{ glAccountId: "1110" }, { glAccountId: null }]);
  mockDb.journalLine.findMany.mockResolvedValue([
    { id: "jl1", debit: "150", credit: "0", description: null, accountId: "1110", journal: { number: "JE/1" } },
    { id: "jl2", debit: "0", credit: "80", description: "out", accountId: "1110", journal: { number: "JE/2" } },
  ]);
  mockDb.bankStatementLine.findMany.mockResolvedValue([{ matchedRef: "jl2" }]);
  await expect(listReconcilableLines("c")).resolves.toEqual([
    { id: "jl1", accountId: "1110", journalNumber: "JE/1", description: null, amount: "150" },
  ]);
  expect(mockDb.journalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ accountId: { in: ["1110"] } }),
  }));
});
it("returns empty when no bank GL mapping", async () => {
  mockDb.bankAccount.findMany.mockResolvedValue([{ glAccountId: null }]);
  await expect(listReconcilableLines("c")).resolves.toEqual([]);
  expect(mockDb.journalLine.findMany).not.toHaveBeenCalled();
});
