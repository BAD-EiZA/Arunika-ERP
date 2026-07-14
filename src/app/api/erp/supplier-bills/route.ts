import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { createSupplierBill } from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [bills, suppliers, products, pos] = await Promise.all([
      prisma.supplierBill.findMany({
        where: { companyId: ctx.companyId },
        include: { supplier: true, items: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.supplier.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, isArchived: false },
      }),
      prisma.purchaseOrder.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      bills: bills.map((b) => ({
        id: b.id,
        number: b.number,
        status: b.status,
        total: b.total.toString(),
        balance: b.balance.toString(),
        invoiceDate: b.invoiceDate.toISOString(),
        supplier: { id: b.supplier.id, name: b.supplier.name },
      })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        purchasePrice: p.purchasePrice.toString(),
      })),
      purchaseOrders: pos.map((po) => ({ id: po.id, number: po.number })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("supplier_bill:create");
    const body = (await req.json()) as {
      supplierId?: string;
      purchaseOrderId?: string;
      supplierInvoiceNo?: string;
      items?: Array<{
        productId?: string;
        description: string;
        quantity: string | number;
        unitPrice: string | number;
        taxAmount?: string | number;
      }>;
    };
    const bill = await createSupplierBill({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      supplierId: String(body.supplierId ?? ""),
      purchaseOrderId: body.purchaseOrderId || undefined,
      supplierInvoiceNo: body.supplierInvoiceNo || undefined,
      items: body.items ?? [],
    });
    return {
      bill: {
        id: bill.id,
        number: bill.number,
        total: bill.total.toString(),
        status: bill.status,
      },
    };
  });
}
