import { requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const companyId = ctx.companyId;
    const [
      productCount,
      customerCount,
      supplierCount,
      openPo,
      openSo,
      stockRows,
      salesInvoices,
      supplierBills,
    ] = await Promise.all([
      prisma.product.count({ where: { companyId, isArchived: false } }),
      prisma.customer.count({ where: { companyId, isArchived: false } }),
      prisma.supplier.count({ where: { companyId, isArchived: false } }),
      prisma.purchaseOrder.count({
        where: {
          companyId,
          status: { in: ["APPROVED", "SENT", "PARTIALLY_RECEIVED"] },
        },
      }),
      prisma.salesOrder.count({
        where: {
          companyId,
          status: { in: ["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"] },
        },
      }),
      prisma.stockBalance.findMany({
        where: { companyId },
        include: { product: true, warehouse: true },
        take: 10,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.salesInvoice.findMany({
        where: {
          companyId,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.supplierBill.findMany({
        where: {
          companyId,
          status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      roleCode: ctx.roleCode,
      productCount,
      customerCount,
      supplierCount,
      openPo,
      openSo,
      stockRows: stockRows.map((row) => ({
        id: row.id,
        quantityOnHand: row.quantityOnHand.toString(),
        quantityReserved: row.quantityReserved.toString(),
        averageCost: row.averageCost.toString(),
        product: { sku: row.product.sku, name: row.product.name },
        warehouse: { code: row.warehouse.code },
      })),
      salesInvoices: salesInvoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        balance: inv.balance.toString(),
        dueDate: inv.dueDate?.toISOString() ?? null,
      })),
      supplierBills: supplierBills.map((bill) => ({
        id: bill.id,
        number: bill.number,
        status: bill.status,
        balance: bill.balance.toString(),
        dueDate: bill.dueDate?.toISOString() ?? null,
      })),
    };
  });
}
