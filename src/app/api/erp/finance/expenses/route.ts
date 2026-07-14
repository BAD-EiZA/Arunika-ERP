import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approveExpenseClaim,
  createExpenseClaim,
  postExpenseClaim,
} from "@/server/services/expenses";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [claims, accounts] = await Promise.all([
      prisma.expenseClaim.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.account.findMany({
        where: {
          companyId: ctx.companyId,
          isActive: true,
          type: { in: ["EXPENSE", "COGS", "OTHER_EXPENSE"] },
        },
        orderBy: { code: "asc" },
      }),
    ]);
    return {
      claims: claims.map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        accountCode: c.accountCode,
        amount: c.amount.toString(),
        taxAmount: c.taxAmount.toString(),
        expenseDate: c.expenseDate.toISOString(),
        status: c.status,
        notes: c.notes,
      })),
      accounts: accounts.map((a) => ({ code: a.code, name: a.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "approve" | "post";
      id?: string;
      title?: string;
      amount?: string | number;
      taxAmount?: string | number;
      accountCode?: string;
      expenseDate?: string;
      notes?: string;
    };

    if (body.action === "approve") {
      const ctx = await requirePermission("journal:create");
      const claim = await approveExpenseClaim(
        ctx.companyId,
        String(body.id ?? ""),
      );
      return { claim: { id: claim.id, status: claim.status } };
    }
    if (body.action === "post") {
      const ctx = await requirePermission("journal:post");
      const claim = await postExpenseClaim({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
      });
      return { claim: { id: claim.id, status: claim.status } };
    }

    const ctx = await requirePermission("journal:create");
    const claim = await createExpenseClaim({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      title: String(body.title ?? ""),
      amount: body.amount ?? 0,
      taxAmount: body.taxAmount,
      accountCode: body.accountCode,
      expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
      notes: body.notes,
    });
    return { claim: { id: claim.id, number: claim.number } };
  });
}
