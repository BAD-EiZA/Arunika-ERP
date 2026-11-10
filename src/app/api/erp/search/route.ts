import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import { hasPermission, type PermissionCode } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("company:view");
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 3 || q.length > 100) throw validationError("Pencarian harus 3–100 karakter");
    const can = (p: PermissionCode) => hasPermission(ctx.permissions, p);
    const tenant = { companyId: ctx.companyId };
    const branch = ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {};
    const warehouse = ctx.warehouseIds.length ? { warehouseId: { in: ctx.warehouseIds } } : {};
    const orderScope = { ...branch, ...warehouse };
    const location = { ...warehouse, warehouse: { companyId: ctx.companyId, ...branch } };
    const number = { startsWith: q, mode: "insensitive" as const };
    const select = { id: true, number: true };
    const take = 5;
    const [products, customers, suppliers, po, so, inv, bill, gr, delivery, returns, purchaseReturns] = await Promise.all([
      can("product:view") ? prisma.product.findMany({ where: { ...tenant, isArchived: false, OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, select: { id: true, sku: true, name: true }, orderBy: { sku: "asc" }, take }) : [],
      can("customer:view") ? prisma.customer.findMany({ where: { ...tenant, isArchived: false, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take }) : [],
      can("supplier:view") ? prisma.supplier.findMany({ where: { ...tenant, isArchived: false, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take }) : [],
      can("purchase_order:view") ? prisma.purchaseOrder.findMany({ where: { ...tenant, ...orderScope, number }, select, orderBy: { number: "asc" }, take }) : [],
      can("sales_order:view") ? prisma.salesOrder.findMany({ where: { ...tenant, ...orderScope, number }, select, orderBy: { number: "asc" }, take }) : [],
      can("invoice:view") ? prisma.salesInvoice.findMany({ where: { ...tenant, number, ...(ctx.branchIds.length || ctx.warehouseIds.length ? { salesOrder: { ...tenant, ...orderScope } } : {}) }, select, orderBy: { number: "asc" }, take }) : [],
      can("supplier_bill:view") ? prisma.supplierBill.findMany({ where: { ...tenant, number, ...(ctx.branchIds.length || ctx.warehouseIds.length ? { purchaseOrder: { ...tenant, ...orderScope } } : {}) }, select, orderBy: { number: "asc" }, take }) : [],
      can("goods_receipt:view") ? prisma.goodsReceipt.findMany({ where: { ...tenant, ...location, number, purchaseOrder: { ...tenant, ...branch } }, select, orderBy: { number: "asc" }, take }) : [],
      can("delivery_order:view") ? prisma.deliveryOrder.findMany({ where: { ...tenant, ...location, number, salesOrder: { ...tenant, ...branch } }, select, orderBy: { number: "asc" }, take }) : [],
      // Returns have no warehouse relation: resolve allowed warehouses below when branch-restricted.
      can("return:view") ? prisma.salesReturn.findMany({ where: { ...tenant, number, ...warehouse, ...(ctx.branchIds.length ? { warehouseId: { in: await allowedWarehouseIds() } } : {}) }, select, orderBy: { number: "asc" }, take }) : [],
      can("return:view") ? prisma.purchaseReturn.findMany({ where: { ...tenant, number, ...warehouse, ...(ctx.branchIds.length ? { warehouseId: { in: await allowedWarehouseIds() } } : {}) }, select, orderBy: { number: "asc" }, take }) : [],
    ]);
    async function allowedWarehouseIds() {
      return (await prisma.warehouse.findMany({ where: { ...tenant, ...branch, ...(ctx.warehouseIds.length ? { id: { in: ctx.warehouseIds } } : {}) }, select: { id: true } })).map(w => w.id);
    }
    const docs = (rows: { id: string; number: string }[], href: string) => rows.map(r => ({ id: r.id, label: r.number, href: `${href}?id=${encodeURIComponent(r.id)}` }));
    return { companyId: ctx.companyId, results: {
      products: products.map(r => ({ id: r.id, label: `${r.sku} — ${r.name}`, href: `/master-data/products?id=${encodeURIComponent(r.id)}` })),
      customers: customers.map(r => ({ id: r.id, label: `${r.code} — ${r.name}`, href: `/master-data/customers?id=${encodeURIComponent(r.id)}` })),
      suppliers: suppliers.map(r => ({ id: r.id, label: `${r.code} — ${r.name}`, href: `/master-data/suppliers?id=${encodeURIComponent(r.id)}` })),
      purchaseOrders: docs(po, "/procurement/purchase-orders"), salesOrders: docs(so, "/sales/orders"), invoices: docs(inv, "/sales/invoices"), bills: docs(bill, "/procurement/bills"), goodsReceipts: docs(gr, "/procurement/goods-receipts"), deliveries: docs(delivery, "/sales/deliveries"), returns: [...docs(returns, "/returns"), ...docs(purchaseReturns, "/returns")].slice(0, take),
    } };
  });
}
