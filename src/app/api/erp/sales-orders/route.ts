import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { approveSalesOrder, createSalesOrder } from "@/server/services/sales";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [orders, customers, products, warehouses, branches] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { companyId: ctx.companyId },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, isArchived: false },
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.branch.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    return {
      orders: orders.map((so) => ({
        id: so.id,
        number: so.number,
        status: so.status,
        total: so.total.toString(),
        orderDate: so.orderDate.toISOString(),
        warehouseId: so.warehouseId,
        customer: { id: so.customer.id, name: so.customer.name },
        items: so.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          sku: i.product.sku,
          quantity: i.quantity.toString(),
          quantityDelivered: i.quantityDelivered.toString(),
          unitPrice: i.unitPrice.toString(),
          total: i.total.toString(),
        })),
      })),
      customers: customers.map((c) => ({ id: c.id, code: c.code, name: c.name })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        purchasePrice: p.purchasePrice.toString(),
        salePrice: p.salePrice.toString(),
      })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
      branches: branches.map((b) => ({ id: b.id, code: b.code, name: b.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "approve";
      id?: string;
      customerId?: string;
      branchId?: string;
      warehouseId?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        quantity: string | number;
        unitPrice: string | number;
        taxAmount?: string | number;
        description?: string;
      }>;
    };

    if (body.action === "approve") {
      const ctx = await requirePermission("sales_order:approve");
      const so = await approveSalesOrder(ctx.companyId, ctx.user.id, String(body.id));
      return { salesOrder: { id: so.id, status: so.status } };
    }

    const ctx = await requirePermission("sales_order:create");
    const so = await createSalesOrder({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      customerId: String(body.customerId ?? ""),
      branchId: body.branchId || undefined,
      warehouseId: body.warehouseId || undefined,
      notes: body.notes || undefined,
      items: body.items ?? [],
    });
    return {
      salesOrder: {
        id: so.id,
        number: so.number,
        status: so.status,
        total: so.total.toString(),
      },
    };
  });
}
