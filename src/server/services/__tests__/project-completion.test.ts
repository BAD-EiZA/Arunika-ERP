import { allocateProjectCost, reverseProjectAllocation, approveProjectExpense, postProjectExpense, getProjectProfitability } from "../projects";

const tx = {
  projectExpense: { findFirst: jest.fn(), updateMany: jest.fn() },
  account: { findMany: jest.fn() },
  project: { findFirst: jest.fn() },
  stockMovement: { findMany: jest.fn() },
  journalLine: { findFirst: jest.fn() },
  payrollRun: { findFirst: jest.fn() },
  deliveryOrder: { findFirst: jest.fn() },
  projectCostAllocation: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
};
const db = { ...tx, $transaction: jest.fn((fn) => fn(tx)) };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("../accounting", () => ({ postJournal: jest.fn(), postFromRule: jest.fn() }));
import { postJournal } from "../accounting";
jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(), assertRequestAccess: jest.fn() }));
import { requirePermission, assertRequestAccess } from "@/lib/auth";
import { POST } from "@/app/api/erp/projects/route";
import { forbidden } from "@/lib/errors";

beforeEach(() => {
  jest.clearAllMocks();
  tx.projectExpense.findFirst.mockResolvedValue({ id: "e", projectId: "p", status: "DRAFT", amount: "80", expenseDate: new Date("2026-11-10"), description: "Travel", project: { companyId: "c", status: "OPEN" } });
  tx.projectExpense.updateMany.mockResolvedValue({ count: 1 });
  tx.account.findMany.mockResolvedValue([{ code: "cost", type: "EXPENSE", isActive: true }, { code: "payable", type: "LIABILITY", isActive: true }]);
  (postJournal as jest.Mock).mockResolvedValue({ id: "j" });
});

it("approves only explicit active expense and settlement accounts", async () => {
  await approveProjectExpense({ companyId: "c", userId: "u", id: "e", debitAccountCode: "cost", creditAccountCode: "payable" });
  expect(tx.account.findMany).toHaveBeenCalledWith({ where: { companyId: "c", code: { in: ["cost", "payable"] }, isActive: true } });
  expect(tx.projectExpense.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT" }), data: expect.objectContaining({ status: "APPROVED", debitAccountCode: "cost", creditAccountCode: "payable", approvedById: "u" }) }));
  expect(postJournal).not.toHaveBeenCalled();
});

it.each([{ accounts: [] }, { accounts: [{ code: "cost", type: "ASSET" }, { code: "payable", type: "LIABILITY" }] }, { accounts: [{ code: "cost", type: "EXPENSE" }, { code: "payable", type: "REVENUE" }] }])("rejects missing or inappropriate accounts", async ({ accounts }) => {
  tx.account.findMany.mockResolvedValue(accounts);
  await expect(approveProjectExpense({ companyId: "c", userId: "u", id: "e", debitAccountCode: "cost", creditAccountCode: "payable" })).rejects.toThrow();
  expect(tx.projectExpense.updateMany).not.toHaveBeenCalled();
});

it("posts approved expense with saved accounts and deterministic journal key atomically", async () => {
  const expense = await tx.projectExpense.findFirst();
  tx.projectExpense.findFirst.mockResolvedValue({ ...expense, status: "APPROVED", debitAccountCode: "cost", creditAccountCode: "payable" });
  await postProjectExpense({ companyId: "c", userId: "u", id: "e" });
  expect(postJournal).toHaveBeenCalledWith(tx, expect.objectContaining({ companyId: "c", sourceDocType: "ProjectExpense", sourceDocId: "e", idempotencyKey: "project-expense:e", postedById: "u", lines: [{ accountCode: "cost", debit: "80" }, { accountCode: "payable", credit: "80" }] }));
  expect(tx.projectExpense.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ journalId: "j", status: "POSTED" }) }));
});

it("rejects unapproved posting and concurrent transition", async () => {
  await expect(postProjectExpense({ companyId: "c", userId: "u", id: "e" })).rejects.toThrow();
  expect(postJournal).not.toHaveBeenCalled();
  tx.projectExpense.updateMany.mockResolvedValue({ count: 0 });
  await expect(approveProjectExpense({ companyId: "c", userId: "u", id: "e", debitAccountCode: "cost", creditAccountCode: "payable" })).rejects.toThrow();
});

const payrollSource = () => ({ id: "line", debit: "100", credit: "0", account: { type: "EXPENSE", companyId: "c" }, journal: { companyId: "c", status: "POSTED", currency: "IDR", exchangeRate: "1", reversalOfId: null, reversals: [], sourceDocType: "payroll_run", sourceDocId: "run", lines: [{ debit: "100", credit: "0", account: { type: "EXPENSE" } }, { debit: "0", credit: "100", account: { type: "LIABILITY" } }] } });
beforeEach(() => {
  tx.project.findFirst.mockResolvedValue({ id: "p", status: "OPEN" });
  tx.journalLine.findFirst.mockResolvedValue(payrollSource());
  tx.payrollRun.findFirst.mockResolvedValue({ id: "run", totalGross: "100", totalEmployerBpjs: "0" });
  tx.projectCostAllocation.findUnique.mockResolvedValue(null);
  tx.projectCostAllocation.create.mockResolvedValue({ id: "a" });
  tx.projectCostAllocation.updateMany.mockResolvedValue({ count: 1 });
});
it("allocates whole verified posted payroll line, never inventing a rate or GL entry", async () => {
  await allocateProjectCost({ companyId: "c", userId: "u", projectId: "p", journalLineId: "line", kind: "PAYROLL" });
  expect(tx.projectCostAllocation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: "100.00", journalLineId: "line", kind: "PAYROLL", status: "POSTED" }) });
  expect(postJournal).not.toHaveBeenCalled();
});
it.each(["reversed", "foreign", "unbalanced", "wrongSource", "missingDocument", "duplicate", "credit"])("rejects %s allocation source", async (kind) => {
  const source = payrollSource();
  if (kind === "reversed") source.journal.reversals = [{ status: "POSTED" }] as never[];
  if (kind === "foreign") source.journal.currency = "USD";
  if (kind === "unbalanced") source.journal.lines[1].credit = "90";
  if (kind === "wrongSource") source.journal.sourceDocType = "Manual";
  if (kind === "credit") source.credit = "10";
  if (kind === "missingDocument") tx.payrollRun.findFirst.mockResolvedValue(null);
  if (kind === "duplicate") tx.projectCostAllocation.findUnique.mockResolvedValue({ id: "old", status: "VOID" });
  tx.journalLine.findFirst.mockResolvedValue(source);
  await expect(allocateProjectCost({ companyId: "c", userId: "u", projectId: "p", journalLineId: "line", kind: "PAYROLL" })).rejects.toThrow();
  expect(tx.projectCostAllocation.create).not.toHaveBeenCalled();
});
it("allocates verified material cost only against posted delivery and matching stock movement", async () => {
  const source = payrollSource();
  source.account.type = "COGS";
  source.journal.lines[0].account.type = "COGS";
  source.journal.sourceDocType = "DeliveryOrder";
  source.journal.sourceDocId = "do";
  tx.journalLine.findFirst.mockResolvedValue(source);
  tx.deliveryOrder.findFirst.mockResolvedValue({ id: "do", status: "POSTED" });
  tx.stockMovement.findMany.mockResolvedValue([{ totalCost: "100" }]);
  await allocateProjectCost({ companyId: "c", userId: "u", projectId: "p", journalLineId: "line", kind: "MATERIAL" });
  expect(tx.projectCostAllocation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "MATERIAL", amount: "100.00" }) });
  tx.stockMovement.findMany.mockResolvedValue([{ totalCost: "99" }]);
  await expect(allocateProjectCost({ companyId: "c", userId: "u", projectId: "p", journalLineId: "line", kind: "MATERIAL" })).rejects.toThrow();
});
it("reports allocated payroll subtotal without claiming complete profitability; source reversal invalidates it", async () => {
  tx.project.findFirst.mockResolvedValue({ id: "p", code: "P", name: "Project", status: "OPEN", budgetAmount: "1000", billedAmount: "500", timesheets: [{ hours: "2", status: "APPROVED" }], expenses: [], costAllocations: [{ id: "a", journalLineId: "line", kind: "PAYROLL", status: "POSTED", amount: "100" }] });
  expect(await getProjectProfitability("c", "p")).toMatchObject({ knownCost: "100.00", allocatedLaborCost: "100.00", coverage: "PARTIAL", actualCost: null, margin: null });
  const source = payrollSource();
  source.journal.reversals = [{ status: "POSTED" }] as never[];
  tx.journalLine.findFirst.mockResolvedValue(source);
  expect(await getProjectProfitability("c", "p")).toMatchObject({ knownCost: "0.00", invalidAllocationCount: 1, margin: null });
});
it("API refuses payroll allocation without sensitive payroll permission before writing", async () => {
  (requirePermission as jest.Mock).mockImplementation(async (codes) => {
    if (Array.isArray(codes) && codes.includes("payroll:view")) throw forbidden("No payroll permission");
    return { companyId: "c", user: { id: "u" } };
  });
  const result = await POST(new Request("http://localhost/api/erp/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "allocate_cost", projectId: "p", journalLineId: "line", kind: "PAYROLL" }) }));
  expect(result.status).toBe(403);
  expect(assertRequestAccess).toHaveBeenCalled();
  expect(tx.projectCostAllocation.create).not.toHaveBeenCalled();
});
it("voids attribution with actor and reason without reversing source GL", async () => {
  tx.projectCostAllocation.findFirst.mockResolvedValue({ id: "a", status: "POSTED" });
  await reverseProjectAllocation({ companyId: "c", userId: "u", id: "a", reason: "Wrong project" });
  expect(tx.projectCostAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "VOID", reversedById: "u", reversalReason: "Wrong project" }) }));
  expect(postJournal).not.toHaveBeenCalled();
});
