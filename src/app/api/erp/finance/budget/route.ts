import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { createBudget } from "@/server/services/treasury";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const budgets = await prisma.budget.findMany({
      where: { companyId: ctx.companyId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      budgets: budgets.map((b) => ({
        id: b.id,
        name: b.name,
        year: b.year,
        status: b.status,
        lineCount: b.lines.length,
        total: b.lines.reduce((acc, l) => acc + Number(l.amount), 0).toFixed(2),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("budget:manage");
    const body = (await req.json()) as {
      name?: string;
      year?: number;
      accountCode?: string;
      period?: number;
      amount?: string | number;
    };
    const budget = await createBudget({
      companyId: ctx.companyId,
      name: String(body.name ?? ""),
      year: Number(body.year || new Date().getFullYear()),
      lines: [
        {
          accountCode: String(body.accountCode ?? "6100"),
          period: Number(body.period || 1),
          amount: body.amount ?? 0,
        },
      ],
    });
    return { budget: { id: budget.id, name: budget.name } };
  });
}
