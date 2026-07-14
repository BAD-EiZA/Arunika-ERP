import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { runForecastAndAnomaly } from "@/server/services/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const insights = await prisma.aiInsight.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      insights: insights.map((i) => ({
        id: i.id,
        insightType: i.insightType,
        title: i.title,
        summary: i.summary,
        severity: i.severity,
        model: i.model,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  });
}

export async function POST() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("report:view");
    const insight = await runForecastAndAnomaly(ctx.companyId);
    return {
      insight: {
        id: insight.id,
        title: insight.title,
        summary: insight.summary,
        severity: insight.severity,
        model: insight.model,
      },
    };
  });
}
