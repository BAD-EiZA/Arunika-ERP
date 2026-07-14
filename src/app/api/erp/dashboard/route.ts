import { requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastNMonths(n: number) {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
}

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const companyId = ctx.companyId;
    const months = lastNMonths(6);
    const from = new Date(`${months[0]}-01T00:00:00.000Z`);

    const [
      productCount,
      customerCount,
      supplierCount,
      openPo,
      openSo,
      stockRows,
      salesInvoices,
      supplierBills,
      recentInvoices,
      recentBills,
      recentSo,
      recentPo,
      stockAll,
      arAgg,
      apAgg,
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
      prisma.salesInvoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: from },
          status: { notIn: ["CANCELLED", "VOID"] },
        },
        select: { invoiceDate: true, total: true },
      }),
      prisma.supplierBill.findMany({
        where: {
          companyId,
          invoiceDate: { gte: from },
          status: { notIn: ["CANCELLED", "VOID"] },
        },
        select: { invoiceDate: true, total: true },
      }),
      prisma.salesOrder.findMany({
        where: { companyId, orderDate: { gte: from } },
        select: { status: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { companyId, orderDate: { gte: from } },
        select: { status: true },
      }),
      prisma.stockBalance.findMany({
        where: { companyId },
        select: {
          quantityOnHand: true,
          averageCost: true,
          product: { select: { sku: true, name: true } },
        },
        orderBy: { quantityOnHand: "desc" },
        take: 8,
      }),
      prisma.salesInvoice.aggregate({
        where: {
          companyId,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "OPEN"] },
        },
        _sum: { balance: true },
      }),
      prisma.supplierBill.aggregate({
        where: {
          companyId,
          status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
        },
        _sum: { balance: true },
      }),
    ]);

    const salesByMonth: Record<string, number> = Object.fromEntries(
      months.map((m) => [m, 0]),
    );
    const purchaseByMonth: Record<string, number> = Object.fromEntries(
      months.map((m) => [m, 0]),
    );
    for (const inv of recentInvoices) {
      const k = monthKey(new Date(inv.invoiceDate));
      if (k in salesByMonth) salesByMonth[k] += Number(inv.total);
    }
    for (const bill of recentBills) {
      const k = monthKey(new Date(bill.invoiceDate));
      if (k in purchaseByMonth) purchaseByMonth[k] += Number(bill.total);
    }

    const soStatus: Record<string, number> = {};
    for (const so of recentSo) {
      soStatus[so.status] = (soStatus[so.status] ?? 0) + 1;
    }
    const poStatus: Record<string, number> = {};
    for (const po of recentPo) {
      poStatus[po.status] = (poStatus[po.status] ?? 0) + 1;
    }

    const stockValue = stockAll.map((s) => ({
      label: s.product.sku,
      name: s.product.name,
      value: Number(s.quantityOnHand) * Number(s.averageCost),
      qty: Number(s.quantityOnHand),
    }));

    return {
      roleCode: ctx.roleCode,
      productCount,
      customerCount,
      supplierCount,
      openPo,
      openSo,
      arTotal: Number(arAgg._sum.balance ?? 0).toFixed(2),
      apTotal: Number(apAgg._sum.balance ?? 0).toFixed(2),
      charts: {
        months,
        salesByMonth: months.map((m) => ({
          month: m,
          value: Number(salesByMonth[m].toFixed(2)),
        })),
        purchaseByMonth: months.map((m) => ({
          month: m,
          value: Number(purchaseByMonth[m].toFixed(2)),
        })),
        soStatus: Object.entries(soStatus).map(([label, value]) => ({
          label,
          value,
        })),
        poStatus: Object.entries(poStatus).map(([label, value]) => ({
          label,
          value,
        })),
        stockValue,
        mix: [
          { label: "Produk", value: productCount },
          { label: "Pelanggan", value: customerCount },
          { label: "Pemasok", value: supplierCount },
          { label: "PO aktif", value: openPo },
          { label: "SO aktif", value: openSo },
        ],
      },
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
