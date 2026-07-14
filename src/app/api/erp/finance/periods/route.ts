import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { closeFiscalPeriod } from "@/server/services/treasury";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const years = await prisma.fiscalYear.findMany({
      where: { companyId: ctx.companyId },
      include: { periods: { orderBy: { startDate: "asc" } } },
      orderBy: { startDate: "desc" },
    });
    return {
      years: years.map((y) => ({
        id: y.id,
        name: y.name,
        periods: y.periods.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("period:close");
    const body = (await req.json()) as { id?: string };
    const period = await closeFiscalPeriod(ctx.companyId, String(body.id ?? ""));
    return { period: { id: period.id, status: period.status } };
  });
}
