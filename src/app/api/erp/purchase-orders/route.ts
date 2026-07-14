import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approvePurchaseOrder,
  createPurchaseOrder,
  submitPurchaseOrder,
} from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [orders, suppliers, products, warehouses, branches] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { companyId: ctx.companyId },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.supplier.findMany({
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
      orders: orders.map((po) => ({
        id: po.id,
        number: po.number,
        status: po.status,
        total: po.total.toString(),
        orderDate: po.orderDate.toISOString(),
        supplier: { id: po.supplier.id, name: po.supplier.name },
        warehouseId: po.warehouseId,
        items: po.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          sku: i.product.sku,
          quantity: i.quantity.toString(),
          quantityReceived: i.quantityReceived.toString(),
          unitPrice: i.unitPrice.toString(),
          total: i.total.toString(),
        })),
      })),
      suppliers: suppliers.map((s) => ({ id: s.id, code: s.code, name: s.name })),
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
      action?: "create" | "submit" | "approve";
      id?: string;
      supplierId?: string;
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

    if (body.action === "submit") {
      const ctx = await requirePermission("purchase_order:submit");
      const po = await submitPurchaseOrder(ctx.companyId, ctx.user.id, String(body.id));
      return { purchaseOrder: { id: po.id, status: po.status } };
    }

    if (body.action === "approve") {
      const ctx = await requirePermission("purchase_order:approve");
      const po = await approvePurchaseOrder(ctx.companyId, ctx.user.id, String(body.id));
      return { purchaseOrder: { id: po.id, status: po.status } };
    }

    const ctx = await requirePermission("purchase_order:create");
    const po = await createPurchaseOrder({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      supplierId: String(body.supplierId ?? ""),
      branchId: body.branchId || undefined,
      warehouseId: body.warehouseId || undefined,
      notes: body.notes || undefined,
      items: body.items ?? [],
    });
    return {
      purchaseOrder: {
        id: po.id,
        number: po.number,
        status: po.status,
        total: po.total.toString(),
      },
    };
  });
}
