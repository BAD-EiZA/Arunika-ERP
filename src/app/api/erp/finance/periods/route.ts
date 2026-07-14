import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  closeFiscalPeriod,
  closeFiscalYear,
  lockFiscalPeriod,
  reopenFiscalPeriod,
} from "@/server/services/treasury";

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
        isClosed: y.isClosed,
        startDate: y.startDate.toISOString(),
        endDate: y.endDate.toISOString(),
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
    const body = (await req.json()) as {
      action?: "close" | "reopen" | "lock" | "close_year";
      id?: string;
      fiscalYearId?: string;
    };

    if (body.action === "reopen") {
      const ctx = await requirePermission("period:reopen");
      const period = await reopenFiscalPeriod(
        ctx.companyId,
        String(body.id ?? ""),
      );
      return { period: { id: period.id, status: period.status } };
    }
    if (body.action === "lock") {
      const ctx = await requirePermission("period:close");
      const period = await lockFiscalPeriod(
        ctx.companyId,
        String(body.id ?? ""),
      );
      return { period: { id: period.id, status: period.status } };
    }
    if (body.action === "close_year") {
      const ctx = await requirePermission("period:close");
      const year = await closeFiscalYear({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        fiscalYearId: String(body.fiscalYearId ?? body.id ?? ""),
      });
      return { year: { id: year.id, isClosed: year.isClosed } };
    }

    const ctx = await requirePermission("period:close");
    const period = await closeFiscalPeriod(
      ctx.companyId,
      String(body.id ?? ""),
    );
    return { period: { id: period.id, status: period.status } };
  });
}
