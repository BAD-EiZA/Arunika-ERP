import { addProjectExpense, getProjectProfitability } from "../projects";

const db = {
  project: { findFirst: jest.fn(), update: jest.fn() },
  projectExpense: { create: jest.fn() },
  journal: { findMany: jest.fn() },
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));

beforeEach(() => {
  jest.clearAllMocks();
  db.project.findFirst.mockResolvedValue({ id: "p", companyId: "c", code: "P", name: "Project", status: "OPEN", budgetAmount: "1000", billedAmount: "500", actualCost: "200", timesheets: [], expenses: [] });
  db.journal.findMany.mockResolvedValue([]);
});

it("does not invent labor cost or claim profit for approved hours without posted allocation", async () => {
  db.project.findFirst.mockResolvedValueOnce({ id: "p", code: "P", name: "Project", status: "OPEN", budgetAmount: "1000", billedAmount: "500", timesheets: [{ hours: "2", status: "APPROVED" }], expenses: [] });
  const result = await getProjectProfitability("c", "p");
  expect(result).toMatchObject({ approvedHours: "2.00", laborCost: null, actualCost: null, margin: null, variance: null, knownCost: "0.00", costStatus: "UNKNOWN" });
});

it("excludes legacy POSTED expenses without a matching GL journal and flags unknown costs", async () => {
  const project = await db.project.findFirst();
  db.project.findFirst.mockResolvedValueOnce({ ...project, expenses: [{ id: "legacy", amount: "80", status: "POSTED" }, { id: "draft", amount: "20", status: "DRAFT" }, { id: "void", amount: "10", status: "CANCELLED" }] });
  expect(await getProjectProfitability("c", "p")).toMatchObject({ knownCost: "0.00", expenseCost: "0.00", actualCost: null, margin: null, unverifiedExpenseCount: 2 });
});

it("derives verified expense costs only from scoped posted unreversed matching GL", async () => {
  const project = await db.project.findFirst();
  db.project.findFirst.mockResolvedValueOnce({ ...project, expenses: [{ id: "e", amount: "80", status: "POSTED" }] });
  db.journal.findMany.mockResolvedValueOnce([{ sourceDocId: "e", currency: "IDR", exchangeRate: "1", lines: [{ debit: "80", credit: "0", account: { type: "EXPENSE" } }, { debit: "0", credit: "80", account: { type: "LIABILITY" } }] }]);
  expect(await getProjectProfitability("c", "p")).toMatchObject({ knownCost: "80.00", expenseCost: "80.00", actualCost: "80.00", margin: "420.00", costStatus: "KNOWN" });
  expect(db.journal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "c", sourceDocType: "ProjectExpense", sourceDocId: { in: ["e"] }, status: "POSTED", reversalOfId: null, reversals: { none: { status: "POSTED" } } } }));
});

it.each(["mismatch", "unbalanced", "foreign", "duplicate"])("leaves %s GL costs unknown", async (kind: string) => {
  const project = await db.project.findFirst();
  db.project.findFirst.mockResolvedValueOnce({ ...project, expenses: [{ id: "e", amount: "80", status: "POSTED" }] });
  const entry = { sourceDocId: "e", currency: kind === "foreign" ? "USD" : "IDR", exchangeRate: "1", lines: [{ debit: kind === "mismatch" ? "70" : "80", credit: "0", account: { type: "EXPENSE" } }, { debit: "0", credit: kind === "unbalanced" ? "70" : "80", account: { type: "LIABILITY" } }] };
  db.journal.findMany.mockResolvedValueOnce(kind === "duplicate" ? [entry, entry] : [entry]);
  expect(await getProjectProfitability("c", "p")).toMatchObject({ knownCost: "0.00", actualCost: null, margin: null });
});

it.each(["PENDING_APPROVAL", "DRAFT"])("does not interpret %s hours as zero labor cost", async (status: string) => {
  const project = await db.project.findFirst();
  db.project.findFirst.mockResolvedValueOnce({ ...project, timesheets: [{ hours: "2", status }] });
  expect(await getProjectProfitability("c", "p")).toMatchObject({ approvedHours: "0.00", laborCost: null, actualCost: null, margin: null });
});

it.each(["NaN", "Infinity", "0", "-1"])("rejects invalid expense amount %s before writing", async (amount: string) => {
  await expect(addProjectExpense({ companyId: "c", projectId: "p", description: "Travel", amount })).rejects.toThrow();
  expect(db.projectExpense.create).not.toHaveBeenCalled();
});

it("rejects blank expense description", async () => {
  await expect(addProjectExpense({ companyId: "c", projectId: "p", description: "  ", amount: "80" })).rejects.toThrow();
  expect(db.projectExpense.create).not.toHaveBeenCalled();
});

it("records expenses as draft without mutating actual costs when accounts are not supplied", async () => {
  db.projectExpense.create.mockResolvedValueOnce({ id: "e", status: "DRAFT" });
  expect(await addProjectExpense({ companyId: "c", projectId: "p", description: "Travel", amount: "80" })).toMatchObject({ status: "DRAFT" });
  expect(db.projectExpense.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "DRAFT" }) });
  expect(db.project.update).not.toHaveBeenCalled();
});
