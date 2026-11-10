import { replaceSalesReturn } from "../returns";
import { postStockMovement } from "../inventory";
import { postJournal } from "../accounting";
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "RPL-1") }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(async () => ({ totalCost: "24" })), assertWarehouseOwnership: jest.fn() }));
jest.mock("../accounting", () => ({ postJournal: jest.fn() }));
const input = { companyId: "c", userId: "u", id: "r", targetWarehouseId: "main", idempotencyKey: "key" };
function fixture() {
  const doc = { id: "r", customerId: "customer", salesInvoiceId: "invoice", warehouseId: "q", number: "SR-1", status: "POSTED", approvedById: "manager", inspectedAt: new Date(), settlementStatus: "DRAFT", items: [{ id: "i", productId: "p", sourceItemId: "si", sourceMovementId: "sm", quantity: "2" }] };
  return {
    $executeRaw: jest.fn(), salesReturn: { findFirst: jest.fn(async () => doc), update: jest.fn() },
    returnReplacement: { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }) => ({ ...data, id: "replacement", items: [{ ...data.items.create[0], id: "ri" }] })), update: jest.fn(async ({ data }) => ({ id: "replacement", ...data })) },
    creditNote: { findFirst: jest.fn(async () => null) },
    warehouse: { findFirst: jest.fn(async ({ where }) => ({ id: where.id, branchId: "b", type: where.id === "q" ? "RETURN" : "MAIN", isActive: true })) },
    salesInvoiceItem: { findFirst: jest.fn(async () => ({ id: "si", quantity: "5" })) },
    stockMovement: { findFirst: jest.fn(async () => ({ id: "sm", quantity: "5", referenceId: "delivery" })) },
    salesInvoice: { findFirst: jest.fn(async () => ({ deliveryOrderId: "delivery" })) },
    salesReturnItem: { findMany: jest.fn(async () => [{ quantity: "2" }]) },
    stockBalance: { findUnique: jest.fn(async () => ({ quantityOnHand: "10", quantityReserved: "1", averageCost: "12" })) },
    postingRule: { findMany: jest.fn(async () => [{ versions: [{ id: "v", config: { lines: [{ side: "DEBIT", accountCode: "COGS" }, { side: "CREDIT", accountCode: "INV" }] } }] }]) },
    account: { findMany: jest.fn(async () => [{ code: "COGS", type: "COGS", isActive: true }, { code: "INV", type: "ASSET", isActive: true }]) },
    salesOrder: { update: jest.fn() }, salesOrderItem: { update: jest.fn() }, deliveryOrder: { create: jest.fn() },
  };
}
it.each(["rule", "account", "stock", "ceiling", "CN", "settlement", "branch"])("rejects unsafe %s before writes", async scenario => {
  if (scenario === "rule") tx.postingRule.findMany.mockResolvedValueOnce([]);
  if (scenario === "account") tx.account.findMany.mockResolvedValueOnce([]);
  if (scenario === "stock") tx.stockBalance.findUnique.mockResolvedValueOnce({ quantityOnHand: "1", quantityReserved: "1", averageCost: "12" });
  if (scenario === "ceiling") tx.salesReturnItem.findMany.mockResolvedValueOnce([{ quantity: "6" }]);
  if (scenario === "CN") tx.creditNote.findFirst.mockResolvedValueOnce({ id: "cn" } as never);
  if (scenario === "settlement") (await tx.salesReturn.findFirst()).settlementStatus = "APPROVED";
  if (scenario === "branch") tx.warehouse.findFirst.mockResolvedValueOnce({ id: "q", branchId: "other", type: "RETURN", isActive: true });
  await expect(replaceSalesReturn(input)).rejects.toThrow();
  expect(tx.returnReplacement.create).not.toHaveBeenCalled(); expect(postStockMovement).not.toHaveBeenCalled(); expect(postJournal).not.toHaveBeenCalled();
});
it("replays the persisted document without more stock or journals", async () => {
  await replaceSalesReturn(input);
  const data = tx.returnReplacement.create.mock.calls[0][0].data;
  jest.clearAllMocks();
  tx.returnReplacement.findUnique.mockResolvedValueOnce({ ...data, id: "replacement", status: "POSTED" } as never);
  await expect(replaceSalesReturn(input)).resolves.toMatchObject({ id: "replacement" });
  expect(postStockMovement).not.toHaveBeenCalled(); expect(postJournal).not.toHaveBeenCalled();
});
it("rejects a key reused for another payload", async () => {
  tx.returnReplacement.findUnique.mockResolvedValueOnce({ status: "POSTED", requestHash: "different" } as never);
  await expect(replaceSalesReturn(input)).rejects.toThrow("Idempotency");
  expect(postStockMovement).not.toHaveBeenCalled();
});
it("propagates journal failure through the transaction without marking posted", async () => {
  (postJournal as jest.Mock).mockRejectedValueOnce(new Error("closed period"));
  await expect(replaceSalesReturn(input)).rejects.toThrow("closed period");
  expect(tx.returnReplacement.update).not.toHaveBeenCalled(); expect(tx.salesReturn.update).not.toHaveBeenCalled();
});
let tx: ReturnType<typeof fixture>;
beforeEach(() => { jest.clearAllMocks(); tx = fixture(); db.$transaction.mockImplementation(fn => fn(tx)); });
it("posts an independent replacement at issuing average cost without original fulfillment writes", async () => {
  await expect(replaceSalesReturn(input)).resolves.toMatchObject({ id: "replacement", status: "POSTED" });
  expect(tx.returnReplacement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salesReturnId: "r", postingRuleVersionId: "v", items: { create: [expect.objectContaining({ sourceReturnItemId: "i", quantity: "2.0000", unitCost: "12.00" })] } }) }));
  expect(postStockMovement).toHaveBeenCalledWith(tx, expect.objectContaining({ referenceType: "ReturnReplacement", referenceId: "replacement", type: "SALES_DELIVERY", unitCost: "12.00" }));
  expect(postJournal).toHaveBeenCalledWith(tx, expect.objectContaining({ lines: [{ accountCode: "COGS", debit: "24.00" }, { accountCode: "INV", credit: "24.00" }] }));
  expect(tx.salesOrder.update).not.toHaveBeenCalled(); expect(tx.salesOrderItem.update).not.toHaveBeenCalled(); expect(tx.deliveryOrder.create).not.toHaveBeenCalled(); expect(tx.salesReturn.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { settlementStatus: "REPLACED" } });
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});
