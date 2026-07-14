import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { postStockMovement } from "@/server/services/inventory";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [balances, products, warehouses, movements] = await Promise.all([
      prisma.stockBalance.findMany({
        where: { companyId: ctx.companyId },
        include: { product: true, warehouse: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, type: "STOCK", isArchived: false },
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.stockMovement.findMany({
        where: { companyId: ctx.companyId },
        include: { product: true, warehouse: true },
        orderBy: { postedAt: "desc" },
        take: 20,
      }),
    ]);

    return {
      balances: balances.map((b) => ({
        id: b.id,
        quantityOnHand: b.quantityOnHand.toString(),
        quantityReserved: b.quantityReserved.toString(),
        averageCost: b.averageCost.toString(),
        product: { sku: b.product.sku, name: b.product.name },
        warehouse: { code: b.warehouse.code },
      })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
      })),
      warehouses: warehouses.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
      })),
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity.toString(),
        referenceNumber: m.referenceNumber,
        postedAt: m.postedAt.toISOString(),
        product: { sku: m.product.sku },
        warehouse: { code: m.warehouse.code },
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("stock:adjust");
    const body = (await req.json()) as {
      warehouseId?: string;
      productId?: string;
      quantity?: string | number;
      unitCost?: string | number;
    };

    const movement = await prisma.$transaction((tx) =>
      postStockMovement(tx, {
        companyId: ctx.companyId,
        warehouseId: String(body.warehouseId ?? ""),
        productId: String(body.productId ?? ""),
        type: "OPENING_BALANCE",
        quantity: body.quantity ?? 0,
        unitCost: body.unitCost ?? 0,
        referenceType: "OpeningBalance",
        createdById: ctx.user.id,
        idempotencyKey: `open:${body.productId}:${Date.now()}`,
      }),
    );

    return {
      movement: {
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity.toString(),
      },
    };
  });
}
