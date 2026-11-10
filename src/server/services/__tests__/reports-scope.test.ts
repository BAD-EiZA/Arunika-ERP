jest.mock("@/lib/db", () => ({ prisma: {
  stockMovement: { findMany: jest.fn(), count: jest.fn() },
  stockBalance: { findMany: jest.fn() },
  purchaseOrder: { findMany: jest.fn() }, salesOrder: { findMany: jest.fn() },
  goodsReceipt: { findMany: jest.fn() }, deliveryOrder: { findMany: jest.fn() },
} }));
import { prisma } from "@/lib/db";
import { getStockMovementReport, getInventoryValuation, getOpenOrders, getUnbilledDocuments } from "../reports";
const scope = { companyId: "c", warehouseIds: ["w"], branchIds: ["b"] };
beforeEach(() => jest.resetAllMocks());
test("stock movements retain tenant/access filters alongside user filters and paginate", async () => {
  (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.stockMovement.count as jest.Mock).mockResolvedValue(55);
  const from = new Date("2026-01-01"), to = new Date("2026-01-31");
  expect(await getStockMovementReport(scope, { from, to, warehouseId: "other", productId: "p", page: 2, limit: 20 })).toMatchObject({ total: 55, page: 2 });
  expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, where: expect.objectContaining({ companyId: "c", warehouseId: { in: ["w"] }, warehouse: { companyId: "c", branchId: { in: ["b"] } }, AND: [{ warehouseId: "other" }], productId: "p", postedAt: { gte: from, lte: to } }) }));
});
test("valuation multiplies decimal onhand by average cost and totals by warehouse", async () => {
  (prisma.stockBalance.findMany as jest.Mock).mockResolvedValue([
    { id: "1", warehouseId: "w", warehouse: { name: "Gudang" }, product: { sku: "A", name: "Produk" }, quantityOnHand: "3", averageCost: "0.1" },
    { id: "2", warehouseId: "w", warehouse: { name: "Gudang" }, product: { sku: "B", name: "Produk" }, quantityOnHand: "2", averageCost: "0.2" },
  ]);
  const data = await getInventoryValuation(scope, {});
  expect(data.total).toBe("0.70");
  expect(data.warehouses).toEqual([{ warehouseId: "w", warehouse: "Gudang", total: "0.70" }]);
  expect(prisma.stockBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "c", warehouseId: { in: ["w"] } }) }));
});
test("open orders exclude fully fulfilled quantities and compute age", async () => {
  (prisma.purchaseOrder.findMany as jest.Mock).mockResolvedValue([
    { id: "p1", number: "PO1", orderDate: new Date("2026-01-01"), status: "APPROVED", items: [{ quantity: "5", quantityReceived: "2" }] },
    { id: "p2", number: "PO2", orderDate: new Date("2026-01-01"), items: [{ quantity: "5", quantityReceived: "5" }] },
  ]);
  (prisma.salesOrder.findMany as jest.Mock).mockResolvedValue([{ id: "s", number: "SO1", orderDate: new Date("2026-01-03"), status: "APPROVED", items: [{ quantity: "4", quantityDelivered: "1" }] }]);
  const data = await getOpenOrders(scope, new Date("2026-01-11"));
  expect(data.rows).toEqual(expect.arrayContaining([expect.objectContaining({ number: "PO1", remaining: "3.0000", ageDays: 10 }), expect.objectContaining({ number: "SO1", remaining: "3.0000", ageDays: 8 })]));
  expect(data.rows).toHaveLength(2);
});
test("unbilled documents exclude cancelled bills/invoices through tenant-scoped relations", async () => {
  (prisma.goodsReceipt.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.deliveryOrder.findMany as jest.Mock).mockResolvedValue([]);
  await getUnbilledDocuments(scope);
  expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "c", purchaseOrder: expect.objectContaining({ companyId: "c", supplierBills: { none: { companyId: "c", status: { notIn: ["CANCELLED", "VOID"] } } } }) }) }));
  expect(prisma.deliveryOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "c", salesInvoices: { none: { companyId: "c", status: { notIn: ["CANCELLED", "VOID"] } } } }) }));
});
