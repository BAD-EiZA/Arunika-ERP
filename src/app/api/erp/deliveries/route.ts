import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { postDeliveryOrder } from "@/server/services/sales";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [deliveries, openSos, warehouses] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where: { companyId: ctx.companyId },
        include: {
          customer: true,
          items: { include: { product: true } },
          salesInvoices: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.salesOrder.findMany({
        where: {
          companyId: ctx.companyId,
          status: { in: ["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"] },
        },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    return {
      deliveries: deliveries.map((d) => ({
        id: d.id,
        number: d.number,
        status: d.status,
        deliveryDate: d.deliveryDate.toISOString(),
        invoiced: d.salesInvoices.length > 0,
        customer: { name: d.customer.name },
        items: d.items.map((i) => ({
          sku: i.product.sku,
          quantityDelivered: i.quantityDelivered.toString(),
        })),
      })),
      openSos: openSos.map((so) => ({
        id: so.id,
        number: so.number,
        customerId: so.customerId,
        customerName: so.customer.name,
        warehouseId: so.warehouseId,
        items: so.items.map((i) => ({
          productId: i.productId,
          sku: i.product.sku,
          name: i.product.name,
          quantity: i.quantity.toString(),
          quantityDelivered: i.quantityDelivered.toString(),
        })),
      })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("delivery_order:post");
    const body = (await req.json()) as {
      salesOrderId?: string;
      warehouseId?: string;
      notes?: string;
      items?: Array<{ productId: string; quantityDelivered: string | number }>;
    };

    const delivery = await postDeliveryOrder({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      salesOrderId: String(body.salesOrderId ?? ""),
      warehouseId: String(body.warehouseId ?? ""),
      notes: body.notes || undefined,
      items: body.items ?? [],
    });

    return {
      deliveryOrder: {
        id: delivery.id,
        number: delivery.number,
        status: delivery.status,
      },
    };
  });
}
