import { createTransfer, advanceTransfer, createAdjustment, advanceAdjustment, createOpname, advanceOpname, saveOpnameCount, saveLocation } from "../inventory-workflows";
import { postStockMovement, assertWarehouseOwnership } from "../inventory";
jest.mock("../accounting", () => ({ postJournal: jest.fn(async () => ({ id: "journal" })) }));
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(async () => ({ unitCost: "7" })), assertWarehouseOwnership: jest.fn(async (_tx, input) => ({ id: input.warehouseId, branchId: "b", isActive: true })) }));
const base = { companyId: "c", userId: "u", access: { branchIds: [], warehouseIds: [] } };
function tx(overrides: Record<string, unknown> = {}) {
 const t = { $executeRaw: jest.fn(), warehouse: { findFirst: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, companyId: "c", branchId: "b", isActive: true })), create: jest.fn(), update: jest.fn(), count: jest.fn(async () => 1) }, branch: { findFirst: jest.fn(async () => ({ id: "b", isActive: true })), create: jest.fn(), update: jest.fn(), count: jest.fn(async () => 1) }, product: { findFirst: jest.fn(async () => ({ id: "p", type: "STOCK" })), findMany: jest.fn(async () => [{ id: "p" }]) }, companySetting: { findUnique: jest.fn(async () => ({ inventoryAccountCode: "1130", stockGainAccountCode: "4100", stockLossAccountCode: "5100" })) }, account: { findMany: jest.fn(async () => [{ code: "1130", type: "ASSET", isActive: true }, { code: "4100", type: "REVENUE", isActive: true }, { code: "5100", type: "EXPENSE", isActive: true }]) }, stockBalance: { findUnique: jest.fn(async () => ({ quantityOnHand: "10", quantityReserved: "2", averageCost: "7" })), findMany: jest.fn(async () => [{ productId: "p", quantityOnHand: "10" }]) }, stockTransfer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(async () => 0) }, stockAdjustment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, stockOpname: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, stockOpnameItem: { update: jest.fn() }, auditLog: { create: jest.fn(), findFirst: jest.fn(async ({ where }: { where: { entityType: string } }) => ({ metadata: { valuation: where.entityType === "StockTransfer" ? "21" : where.entityType === "StockOpname" ? "14" : "7" } })) }, approvalMatrix: { findMany: jest.fn(async () => []) }, ...overrides };
 db.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(t)); return t;
}
beforeEach(() => jest.clearAllMocks());
it("send rejects newly reserved stock before any movement", async () => {
 tx({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", status: "APPROVED", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "9" }] })), update: jest.fn() } });
 await expect(advanceTransfer({ ...base, id: "t", action: "send" })).rejects.toThrow("Stok"); expect(postStockMovement).not.toHaveBeenCalled();
});
it.each(["transfer", "adjustment", "opname"] as const)("%s rejects changed approval valuation before movement", async kind => {
 const t = tx({
  stockTransfer: { findFirst: jest.fn(async () => ({ id: "d", status: "APPROVED", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "3" }] })), update: jest.fn() },
  stockAdjustment: { findFirst: jest.fn(async () => ({ id: "d", status: "APPROVED", warehouseId: "a", items: [{ id: "i", productId: "p", quantityBefore: "10", quantityDelta: "-1" }] })), update: jest.fn() },
  stockOpname: { findFirst: jest.fn(async () => ({ id: "d", status: "APPROVED", warehouseId: "a", items: [{ id: "i", productId: "p", systemQty: "10", countedQty: "8" }] })), update: jest.fn() },
 });
 t.stockBalance.findUnique.mockResolvedValue({ quantityOnHand: "10", quantityReserved: "2", averageCost: "70" });
 const action = kind === "transfer" ? advanceTransfer({ ...base, id: "d", action: "send" }) : kind === "adjustment" ? advanceAdjustment({ ...base, id: "d", action: "post" }) : advanceOpname({ ...base, id: "d", action: "post" });
 await expect(action).rejects.toThrow("Valuasi"); expect(postStockMovement).not.toHaveBeenCalled();
});
it.each(["", "1.00001", "-0.00001", "NaN"])("count rejects raw invalid decimal %s before persistence", async count => {
 tx(); await expect(saveOpnameCount({ ...base, id: "o", itemId: "i", count })).rejects.toThrow("Kuantitas"); expect(db.$transaction).not.toHaveBeenCalled();
});
it.each([null, { metadata: {} }])("send rejects missing approval valuation %j", async log => {
 tx({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", status: "APPROVED", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "3" }] })), update: jest.fn() }, auditLog: { findFirst: jest.fn(async () => log) } });
 await expect(advanceTransfer({ ...base, id: "t", action: "send" })).rejects.toThrow("Valuasi"); expect(postStockMovement).not.toHaveBeenCalled();
});
it.each(["transfer", "adjustment", "opname"] as const)("%s records exact approval valuation", async kind => {
 const t = tx({
  stockTransfer: { findFirst: jest.fn(async () => ({ id: "d", status: "PENDING_APPROVAL", fromWarehouseId: "a", toWarehouseId: "z", items: [{ productId: "p", quantity: "3" }] })), update: jest.fn() },
  stockAdjustment: { findFirst: jest.fn(async () => ({ id: "d", status: "PENDING_APPROVAL", warehouseId: "a", items: [{ productId: "p", quantityDelta: "-1" }] })), update: jest.fn() },
  stockOpname: { findFirst: jest.fn(async () => ({ id: "d", status: "REVIEW", warehouseId: "a", items: [{ productId: "p", systemQty: "10", countedQty: "8" }] })), update: jest.fn() },
 });
 if (kind === "transfer") await advanceTransfer({ ...base, id: "d", action: "approve" });
 else if (kind === "adjustment") await advanceAdjustment({ ...base, id: "d", action: "approve" });
 else await advanceOpname({ ...base, id: "d", action: "approve" });
 expect(t.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "approve", metadata: { valuation: kind === "transfer" ? "21" : kind === "adjustment" ? "7" : "14" } }) });
 expect(postStockMovement).not.toHaveBeenCalled();
});
it("rejects transfer of reserved stock before creating document", async () => {
 const t = tx(); await expect(createTransfer({ ...base, fromWarehouseId: "a", toWarehouseId: "z", items: [{ productId: "p", quantity: "9" }] })).rejects.toThrow("Stok"); expect(t.stockTransfer.create).not.toHaveBeenCalled();
});
it("send and receive transfer exactly once, with matched historic cost", async () => {
 let status = "APPROVED";
 const item = { id: "i", productId: "p", quantity: "3", receivedQty: "0" };
 const t = tx({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", number: "T", fromWarehouseId: "a", toWarehouseId: "z", status, items: [item] })), update: jest.fn(async ({ data }: { data: { status: string } }) => { status = data.status; return { status }; }) }, stockMovement: { findUnique: jest.fn(async () => ({ unitCost: "7" })) }, stockTransferItem: { update: jest.fn() } });
 await advanceTransfer({ ...base, id: "t", action: "send" }); await advanceTransfer({ ...base, id: "t", action: "send" }); await advanceTransfer({ ...base, id: "t", action: "receive" }); await advanceTransfer({ ...base, id: "t", action: "receive" });
 expect((postStockMovement as jest.Mock).mock.calls.map(c => c[1].type)).toEqual(["TRANSFER_OUT", "TRANSFER_IN"]); expect((postStockMovement as jest.Mock).mock.calls[1][1]).toEqual(expect.objectContaining({ unitCost: "7", idempotencyKey: "transfer:t:i:in" })); expect(t.stockTransferItem.update).toHaveBeenCalledTimes(1);
});
it("adjustment needs reason, approval, and posts once", async () => {
 tx(); await expect(createAdjustment({ ...base, warehouseId: "a", reason: " ", items: [{ productId: "p", delta: "-1" }] })).rejects.toThrow("Alasan");
 let status = "APPROVED"; tx({ stockAdjustment: { findFirst: jest.fn(async () => ({ id: "d", warehouseId: "a", number: "D", status, items: [{ id: "i", productId: "p", quantityDelta: "-1", quantityBefore: "10" }] })), update: jest.fn(async ({ data }: { data: { status: string } }) => { status = data.status; return { status }; }) } });
 await advanceAdjustment({ ...base, id: "d", action: "post" }); await advanceAdjustment({ ...base, id: "d", action: "post" }); expect(postStockMovement).toHaveBeenCalledTimes(1); expect((postStockMovement as jest.Mock).mock.calls[0][1].type).toBe("ADJUSTMENT_OUT");
});
it("opname snapshots balance and requires counted items before review", async () => {
 tx({ stockOpname: { create: jest.fn(async ({ data }: { data: { items: { create: { productId: string; systemQty: string }[] } } }) => data), findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ id: "o", warehouseId: "a", status: "COUNTING", items: [{ id: "i", productId: "p", systemQty: "10", countedQty: null }] }) } });
 const result = await createOpname({ ...base, warehouseId: "a" }); expect(result.items.create[0]).toEqual({ productId: "p", systemQty: "10.0000" }); await expect(advanceOpname({ ...base, id: "o", action: "review" })).rejects.toThrow("dihitung"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("opname count requires snapshot item; posting only signed differences", async () => {
 const t = tx({ stockOpname: { findFirst: jest.fn(async () => ({ id: "o", warehouseId: "a", status: "COUNTING", items: [{ id: "i", productId: "p", systemQty: "10", countedQty: null }] })), update: jest.fn() }, stockOpnameItem: { update: jest.fn() } });
 await saveOpnameCount({ ...base, id: "o", itemId: "i", count: "8" }); expect(t.stockOpnameItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { countedQty: "8.0000", differenceQty: "-2.0000" } }));
});
it.each(["NaN", "Infinity", "0.00001", "1.00001", "", "100000000000000"])("invalid quantity %s never creates transfer", async quantity => {
 const t = tx(); await expect(createTransfer({ ...base, fromWarehouseId: "a", toWarehouseId: "z", items: [{ productId: "p", quantity }] })).rejects.toThrow(); expect(t.stockTransfer.create).not.toHaveBeenCalled();
});
it("cannot send before approval", async () => {
 tx({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", status: "DRAFT", fromWarehouseId: "a", toWarehouseId: "z", items: [] })) } }); await expect(advanceTransfer({ ...base, id: "t", action: "send" })).rejects.toThrow("Transisi"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("unauthorized warehouse cannot receive even on retry", async () => {
 tx({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", status: "RECEIVED", fromWarehouseId: "a", toWarehouseId: "z", items: [] })) } });
 jest.mocked(assertWarehouseOwnership).mockRejectedValueOnce(new Error("Akses gudang")); await expect(advanceTransfer({ ...base, id: "t", action: "receive" })).rejects.toThrow("Akses"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("opname posting rejects stale snapshot", async () => {
 tx({ stockOpname: { findFirst: jest.fn(async () => ({ id: "o", warehouseId: "a", status: "APPROVED", items: [{ id: "i", productId: "p", systemQty: "9", countedQty: "8" }] })) } }); await expect(advanceOpname({ ...base, id: "o", action: "post" })).rejects.toThrow("Snapshot"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("opname posts negative correction once", async () => {
 let status = "APPROVED"; tx({ stockOpname: { findFirst: jest.fn(async () => ({ id: "o", warehouseId: "a", number: "O", status, items: [{ id: "i", productId: "p", systemQty: "10", countedQty: "8" }] })), update: jest.fn(async ({ data }: { data: { status: string } }) => { status=data.status; return data; }) } });
 await advanceOpname({ ...base, id: "o", action: "post" }); await advanceOpname({ ...base, id: "o", action: "post" }); expect(postStockMovement).toHaveBeenCalledTimes(1); expect(jest.mocked(postStockMovement).mock.calls[0][1]).toEqual(expect.objectContaining({ type: "ADJUSTMENT_OUT", quantity: "2", referenceType: "StockOpname" }));
});
it("approval matrix blocks unqualified approver", async () => {
 const t=tx({ stockAdjustment: { findFirst: jest.fn(async () => ({ id: "d", warehouseId: "a", status: "PENDING_APPROVAL", items: [{ productId: "p", quantityDelta: "-1" }] })), update: jest.fn() }, approvalMatrix: { findMany: jest.fn(async () => [{ minAmount: "0", maxAmount: null, roleCode: "MANAGER" }]) }, membership: { findFirst: jest.fn(async () => ({ role: { code: "STAFF" } })) } });
 await expect(advanceAdjustment({ ...base, id: "d", action: "approve" })).rejects.toThrow("approval"); expect(t.stockAdjustment.update).not.toHaveBeenCalled();
});
it("restricted warehouse membership cannot create unrestricted branch", async () => {
 tx(); await expect(saveLocation({ ...base, access: { branchIds: [], warehouseIds: ["a"] }, kind: "branch", code: "NEW", name: "New" })).rejects.toThrow("akses");
});
it("cannot deactivate warehouse while transfer is in transit", async () => {
 const t=tx({ warehouse: { findFirst: jest.fn(async () => ({ id: "a", branchId: "b", isActive: true })), count: jest.fn(async () => 2), update: jest.fn() }, stockTransfer: { count: jest.fn(async () => 1) } });
 await expect(saveLocation({ ...base, kind: "warehouse", id: "a", isActive: false })).rejects.toThrow("transfer"); expect(t.warehouse.update).not.toHaveBeenCalled();
});
it("cannot deactivate final active branch or warehouse", async () => {
 tx({ branch: { findFirst: jest.fn(async () => ({ id: "b", isActive: true })), count: jest.fn(async () => 1) } }); await expect(saveLocation({ ...base, kind: "branch", id: "b", isActive: false })).rejects.toThrow("aktif");
 tx({ warehouse: { findFirst: jest.fn(async () => ({ id: "a", branchId: "b", isActive: true })), count: jest.fn(async () => 1) } }); await expect(saveLocation({ ...base, kind: "warehouse", id: "a", isActive: false })).rejects.toThrow("aktif");
});
