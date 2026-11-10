import { createPurchaseContract, amendPurchaseContract, approvePurchaseContract, createPurchaseOrder, createSupplierBill } from "../procurement";
const tx = { purchaseContract: { findFirst: jest.fn(), updateMany: jest.fn() }, purchaseContractItem: { updateMany: jest.fn(), update: jest.fn() }, purchaseOrder: { findFirst: jest.fn(), create: jest.fn() }, supplierBill: { findFirst: jest.fn(), create: jest.fn() }, goodsReceipt: { findMany: jest.fn() } };
const db = { purchaseContract: tx.purchaseContract, $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "DOC/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn() }));
const base = { companyId: "c", userId: "u", supplierId: "s", items: [{ productId: "p", quantity: 2, unitPrice: 10 }] };
beforeEach(() => { jest.clearAllMocks(); tx.purchaseOrder.findFirst.mockResolvedValue(null); });
it("amendment increments version and requires fresh approval", async () => {
 const contract = { id: "k", status: "APPROVED", version: 1, ceilingAmount: "100", items: [{ id: "i", productId: "p", quantity: "10", ceilingAmount: "100" }] };
 tx.purchaseContract.findFirst.mockResolvedValue(contract);
 tx.purchaseContract.updateMany.mockResolvedValue({ count: 1 });
 await amendPurchaseContract({ companyId: "c", id: "k", ceilingAmount: 200, items: [{ productId: "p", quantity: 20, ceilingAmount: 200 }] });
 expect(tx.purchaseContract.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "k", version: 1, status: "APPROVED" }, data: { version: { increment: 1 }, status: "PENDING_APPROVAL", ceilingAmount: "200.00" } }));
});
it("approval only changes pending contracts", async () => {
 tx.purchaseContract.updateMany.mockResolvedValue({ count: 1 });
 await approvePurchaseContract("c", "u", "k");
 expect(tx.purchaseContract.updateMany).toHaveBeenCalledWith({ where: { id: "k", companyId: "c", status: "PENDING_APPROVAL" }, data: { status: "APPROVED" } });
});
it("validates contract dates", async () => {
 await expect(createPurchaseContract({ ...base, effectiveFrom: new Date(10), effectiveTo: new Date(0), ceilingAmount: 100, items: [{ productId: "p", quantity: 2, unitPrice: 10, ceilingAmount: 100 }] })).rejects.toThrow("Periode kontrak");
});
it("blocks expired contract call-off", async () => {
 tx.purchaseContract.findFirst.mockResolvedValue({ id: "k", supplierId: "s", status: "APPROVED", isActive: true, endDate: new Date(0), items: [] });
 await expect(createPurchaseOrder({ ...base, contractId: "k", idempotencyKey: "key" } as Parameters<typeof createPurchaseOrder>[0])).rejects.toThrow("Kontrak tidak aktif/berlaku");
});
it("rejects exhausted contract quantity before creating PO", async () => {
 tx.purchaseContract.findFirst.mockResolvedValue({ id: "k", supplierId: "s", status: "APPROVED", isActive: true, version: 1, usedAmount: "0", ceilingAmount: "100", items: [{ id: "i", productId: "p", quantity: "2", usedQuantity: "1", ceilingAmount: "100", usedAmount: "10" }] });
 tx.purchaseContract.updateMany.mockResolvedValue({ count: 1 });
 await expect(createPurchaseOrder({ ...base, contractId: "k", idempotencyKey: "key" })).rejects.toThrow("Plafon item kontrak terlampaui");
 expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
});
it("rejects stale concurrent reservation", async () => {
 tx.purchaseContract.findFirst.mockResolvedValue({ id: "k", supplierId: "s", status: "APPROVED", isActive: true, version: 1, usedAmount: "0", ceilingAmount: "100", items: [] });
 tx.purchaseContract.updateMany.mockResolvedValue({ count: 0 });
 await expect(createPurchaseOrder({ ...base, contractId: "k", idempotencyKey: "key" })).rejects.toThrow("Kontrak berubah");
 expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
});
it("rejects supplier mismatch on PO", async () => {
 tx.purchaseOrder.findFirst.mockResolvedValue({ id: "po", supplierId: "other" });
 await expect(createSupplierBill({ ...base, purchaseOrderId: "po", items: [{ description: "x", quantity: 1, unitPrice: 1 }] })).rejects.toThrow("Pemasok PO tidak sesuai");
});
it("rejects supplier mismatch on GR", async () => {
 tx.purchaseOrder.findFirst.mockResolvedValue({ id: "po", supplierId: "s" });
 tx.goodsReceipt.findMany.mockResolvedValue([{ supplierId: "other" }]);
 await expect(createSupplierBill({ ...base, purchaseOrderId: "po", items: [{ description: "x", quantity: 1, unitPrice: 1 }] })).rejects.toThrow("Pemasok GR tidak sesuai");
});
it("reserves call-off quantities once on replay", async () => {
 const contract = { id: "k", supplierId: "s", status: "APPROVED", isActive: true, version: 1, usedAmount: "0", ceilingAmount: "100", items: [{ id: "i", productId: "p", quantity: "10", usedQuantity: "0", ceilingAmount: "100", usedAmount: "0" }] };
 tx.purchaseContract.findFirst.mockResolvedValue(contract);
 tx.purchaseContract.updateMany.mockResolvedValue({ count: 1 }); tx.purchaseContractItem.updateMany.mockResolvedValue({ count: 1 });
 tx.purchaseOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "po" }));
 const first = await createPurchaseOrder({ ...base, contractId: "k", idempotencyKey: "key" });
 tx.purchaseOrder.findFirst.mockResolvedValue(first);
 expect(await createPurchaseOrder({ ...base, contractId: "k", idempotencyKey: "key" })).toEqual(first);
 expect(tx.purchaseOrder.create).toHaveBeenCalledTimes(1);
 expect(tx.purchaseContractItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { usedQuantity: { increment: "2.0000" }, usedAmount: { increment: "20.00" } } }));
 expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});
it("rejects duplicate supplier invoice before posting", async () => {
 tx.supplierBill.findFirst.mockResolvedValue({ id: "old" });
 await expect(createSupplierBill({ ...base, supplierInvoiceNo: "INV/1", items: [{ description: "x", quantity: 1, unitPrice: 1 }] })).rejects.toThrow("Nomor invoice pemasok sudah digunakan");
});
