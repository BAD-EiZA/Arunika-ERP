import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { runMrp } from "@/server/services/mrp";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("mrp:view");
    const runs = await prisma.mrpRun.findMany({
      where: { companyId: ctx.companyId },
      include: {
        lines: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const productIds = [
      ...new Set(runs.flatMap((r) => r.lines.map((l) => l.productId))),
    ];
    const products = await prisma.product.findMany({
      where: { companyId: ctx.companyId, id: { in: productIds } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return {
      runs: runs.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        horizonDays: r.horizonDays,
        ranAt: r.ranAt.toISOString(),
        lineCount: r.lines.length,
        lines: r.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          sku: byId.get(l.productId)?.sku ?? l.productId,
          name: byId.get(l.productId)?.name ?? "",
          suggestionType: l.suggestionType,
          quantity: l.quantity.toString(),
          onHand: l.onHand.toString(),
          demand: l.demand.toString(),
          supply: l.supply.toString(),
          isConverted: l.isConverted,
          sourceRef: l.sourceRef,
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("mrp:run");
    const body = (await req.json()) as {
      horizonDays?: number;
      notes?: string;
    };
    const run = await runMrp({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      horizonDays: body.horizonDays,
      notes: body.notes,
    });
    return {
      mrpRun: {
        id: run.id,
        number: run.number,
        lineCount: run.lines.length,
      },
    };
  });
}
