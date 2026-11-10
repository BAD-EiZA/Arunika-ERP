import { billProjectSource } from "../projects";
const tx = { project: { findFirst: jest.fn(), update: jest.fn() }, projectBilling: { findFirst: jest.fn(), create: jest.fn() }, timesheet: { findFirst: jest.fn() }, projectTask: { findFirst: jest.fn() }, salesInvoice: { create: jest.fn(), findFirst: jest.fn(), aggregate: jest.fn() } };
const db = { $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "INV/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
const input = { companyId: "c", userId: "u", projectId: "p", sourceType: "timesheet" as const, sourceId: "ts", hourlyRate: 100, idempotencyKey: "key" };
beforeEach(() => { jest.clearAllMocks(); tx.projectBilling.findFirst.mockResolvedValue(null); tx.project.findFirst.mockResolvedValue({ id: "p", customerId: "cu", status: "OPEN" }); });
it("links invoice to project and derives billedAmount from invoice sum", async () => {
 tx.timesheet.findFirst.mockResolvedValue({ id: "ts", status: "APPROVED", hours: "2", taskId: null });
 tx.salesInvoice.create.mockResolvedValue({ id: "inv", number: "INV/1", total: "200" });
 tx.salesInvoice.aggregate.mockResolvedValue({ _sum: { total: "450" } });
 await expect(billProjectSource(input)).resolves.toMatchObject({ id: "inv" });
 expect(tx.salesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "p", total: "200.00" }) }));
 expect(tx.project.update).toHaveBeenCalledWith({ where: { id: "p" }, data: { billedAmount: "450" } });
 expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});
it("rejects duplicate billing source", async () => {
 tx.projectBilling.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing" });
 await expect(billProjectSource(input)).rejects.toThrow("Sumber sudah ditagih");
 expect(tx.salesInvoice.create).not.toHaveBeenCalled();
});
