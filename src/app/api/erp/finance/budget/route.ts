import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approveBudget,
  createBudget,
  getBudgetVsActual,
} from "@/server/services/treasury";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const url = new URL(req.url);
    const vs = url.searchParams.get("vsActual");
    if (vs) {
      return getBudgetVsActual(ctx.companyId, vs);
    }
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
        lines: b.lines.map((l) => ({
          accountCode: l.accountCode,
          period: l.period,
          amount: l.amount.toString(),
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("budget:manage");
    const body = (await req.json()) as {
      action?: "create" | "approve";
      id?: string;
      name?: string;
      year?: number;
      accountCode?: string;
      period?: number;
      amount?: string | number;
      lines?: Array<{
        accountCode: string;
        period: number;
        amount: string | number;
      }>;
    };

    if (body.action === "approve") {
      const budget = await approveBudget(ctx.companyId, String(body.id ?? ""));
      return { budget: { id: budget.id, status: budget.status } };
    }

    const lines =
      body.lines && body.lines.length
        ? body.lines
        : [
            {
              accountCode: String(body.accountCode ?? "6100"),
              period: Number(body.period || 1),
              amount: body.amount ?? 0,
            },
          ];

    const budget = await createBudget({
      companyId: ctx.companyId,
      name: String(body.name ?? ""),
      year: Number(body.year || new Date().getFullYear()),
      lines,
    });
    return { budget: { id: budget.id, name: budget.name } };
  });
}
