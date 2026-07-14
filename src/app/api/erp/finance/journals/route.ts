import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { postJournal } from "@/server/services/accounting";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [journals, accounts] = await Promise.all([
      prisma.journal.findMany({
        where: { companyId: ctx.companyId },
        include: { lines: { include: { account: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.account.findMany({
        where: { companyId: ctx.companyId, isActive: true },
        orderBy: { code: "asc" },
      }),
    ]);
    return {
      journals: journals.map((j) => ({
        id: j.id,
        number: j.number,
        status: j.status,
        description: j.description,
        postingDate: j.postingDate.toISOString(),
        debit: j.lines
          .reduce((acc, l) => acc + Number(l.debit), 0)
          .toFixed(2),
        credit: j.lines
          .reduce((acc, l) => acc + Number(l.credit), 0)
          .toFixed(2),
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("journal:post");
    const body = (await req.json()) as {
      description?: string;
      amount?: string | number;
      debitAccount?: string;
      creditAccount?: string;
    };
    const journal = await prisma.$transaction((tx) =>
      postJournal(tx, {
        companyId: ctx.companyId,
        sourceModule: "manual",
        sourceDocType: "ManualJournal",
        sourceDocId: `manual-${Date.now()}`,
        description: body.description || "Jurnal manual",
        idempotencyKey: `manual:${Date.now()}`,
        postedById: ctx.user.id,
        lines: [
          {
            accountCode: String(body.debitAccount ?? ""),
            debit: body.amount ?? 0,
          },
          {
            accountCode: String(body.creditAccount ?? ""),
            credit: body.amount ?? 0,
          },
        ],
      }),
    );
    return {
      journal: {
        id: journal.id,
        number: journal.number,
        status: journal.status,
      },
    };
  });
}
