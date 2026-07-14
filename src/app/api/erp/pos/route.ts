import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  closePosSession,
  createPosOrder,
  openPosSession,
} from "@/server/services/pos";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [sessions, products, warehouses] = await Promise.all([
      prisma.posSession.findMany({
        where: { companyId: ctx.companyId },
        include: { orders: { include: { items: true }, take: 20 } },
        orderBy: { openedAt: "desc" },
        take: 10,
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, isArchived: false, type: "STOCK" },
        take: 100,
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        cashierName: s.cashierName,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
        orderCount: s.orders.length,
        orders: s.orders.map((o) => ({
          id: o.id,
          number: o.number,
          total: o.total.toString(),
          paymentMethod: o.paymentMethod,
        })),
      })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        salePrice: p.salePrice.toString(),
      })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "open" | "close" | "order";
      sessionId?: string;
      warehouseId?: string;
      branchId?: string;
      cashierName?: string;
      openingCash?: string | number;
      closingCash?: string | number;
      paymentMethod?: string;
      paidAmount?: string | number;
      items?: Array<{
        productId: string;
        quantity: string | number;
        unitPrice: string | number;
      }>;
    };

    if (body.action === "close") {
      const ctx = await requirePermission("invoice:create");
      const session = await closePosSession(
        ctx.companyId,
        String(body.sessionId ?? ""),
        body.closingCash,
      );
      return { session: { id: session.id, status: session.status } };
    }

    if (body.action === "order") {
      const ctx = await requirePermission("invoice:create");
      const order = await createPosOrder({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        sessionId: String(body.sessionId ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
        paymentMethod: body.paymentMethod,
        paidAmount: body.paidAmount,
        items: body.items ?? [],
      });
      return {
        order: {
          id: order.id,
          number: order.number,
          total: order.total.toString(),
        },
      };
    }

    const ctx = await requirePermission("invoice:create");
    const session = await openPosSession({
      companyId: ctx.companyId,
      warehouseId: body.warehouseId,
      branchId: body.branchId,
      cashierName: body.cashierName || ctx.user.name || ctx.user.email,
      openingCash: body.openingCash,
    });
    return { session: { id: session.id, status: session.status } };
  });
}
