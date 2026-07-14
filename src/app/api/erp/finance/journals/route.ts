import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  getJournalDetail,
  postDraftJournal,
  postManualJournal,
  reverseJournal,
  saveDraftJournal,
} from "@/server/services/accounting";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const j = await getJournalDetail(ctx.companyId, id);
      return {
        journal: {
          id: j.id,
          number: j.number,
          status: j.status,
          description: j.description,
          postingDate: j.postingDate.toISOString(),
          journalType: j.journalType,
          currency: j.currency,
          exchangeRate: j.exchangeRate.toString(),
          reversalOfId: j.reversalOfId,
          reversalOfNumber: j.reversalOf?.number ?? null,
          reversedBy: j.reversals.map((r) => r.number),
          period: j.fiscalPeriod?.name ?? null,
          debit: j.lines
            .reduce((acc, l) => acc + Number(l.debit), 0)
            .toFixed(2),
          credit: j.lines
            .reduce((acc, l) => acc + Number(l.credit), 0)
            .toFixed(2),
          lines: j.lines.map((l) => ({
            id: l.id,
            accountCode: l.account.code,
            accountName: l.account.name,
            debit: l.debit.toString(),
            credit: l.credit.toString(),
            description: l.description,
            costCenterCode: l.costCenter?.code ?? null,
            costCenterName: l.costCenter?.name ?? null,
            tag: l.tag,
          })),
        },
      };
    }

    const [journals, accounts, costCenters] = await Promise.all([
      prisma.journal.findMany({
        where: { companyId: ctx.companyId },
        include: {
          lines: { include: { account: true, costCenter: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.account.findMany({
        where: { companyId: ctx.companyId, isActive: true },
        orderBy: { code: "asc" },
      }),
      prisma.costCenter.findMany({
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
        journalType: j.journalType,
        currency: j.currency,
        exchangeRate: j.exchangeRate.toString(),
        reversalOfId: j.reversalOfId,
        debit: j.lines
          .reduce((acc, l) => acc + Number(l.debit), 0)
          .toFixed(2),
        credit: j.lines
          .reduce((acc, l) => acc + Number(l.credit), 0)
          .toFixed(2),
        lines: j.lines.map((l) => ({
          accountCode: l.account.code,
          accountName: l.account.name,
          debit: l.debit.toString(),
          credit: l.credit.toString(),
          description: l.description,
          costCenterCode: l.costCenter?.code ?? null,
          tag: l.tag,
        })),
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
      })),
      costCenters: costCenters.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "post" | "reverse" | "draft" | "post_draft";
      id?: string;
      description?: string;
      postingDate?: string;
      currency?: string;
      exchangeRate?: string | number;
      amount?: string | number;
      debitAccount?: string;
      creditAccount?: string;
      lines?: Array<{
        accountCode: string;
        debit?: string | number;
        credit?: string | number;
        description?: string;
        costCenterCode?: string;
        tag?: string;
      }>;
    };

    if (body.action === "reverse") {
      const ctx = await requirePermission("journal:reverse");
      const journal = await reverseJournal({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        journalId: String(body.id ?? ""),
        description: body.description,
      });
      return {
        journal: {
          id: journal.id,
          number: journal.number,
          status: journal.status,
        },
      };
    }

    if (body.action === "post_draft") {
      const ctx = await requirePermission("journal:post");
      const journal = await postDraftJournal({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        journalId: String(body.id ?? ""),
      });
      return {
        journal: {
          id: journal.id,
          number: journal.number,
          status: journal.status,
        },
      };
    }

    const lines =
      body.lines && body.lines.length >= 2
        ? body.lines
        : [
            {
              accountCode: String(body.debitAccount ?? ""),
              debit: body.amount ?? 0,
            },
            {
              accountCode: String(body.creditAccount ?? ""),
              credit: body.amount ?? 0,
            },
          ];

    if (body.action === "draft") {
      const ctx = await requirePermission("journal:create");
      const journal = await saveDraftJournal({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        description: body.description || "Draft jurnal",
        postingDate: body.postingDate ? new Date(body.postingDate) : undefined,
        currency: body.currency,
        exchangeRate: body.exchangeRate,
        journalId: body.id,
        lines,
      });
      return {
        journal: {
          id: journal.id,
          number: journal.number,
          status: journal.status,
        },
      };
    }

    const ctx = await requirePermission("journal:post");
    const journal = await postManualJournal({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      description: body.description || "Jurnal manual",
      postingDate: body.postingDate ? new Date(body.postingDate) : undefined,
      currency: body.currency,
      exchangeRate: body.exchangeRate,
      lines,
      status: "POSTED",
    });
    return {
      journal: {
        id: journal.id,
        number: journal.number,
        status: journal.status,
      },
    };
  });
}
