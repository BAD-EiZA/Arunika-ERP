import type { Prisma } from "@/generated/prisma/client";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, sumMoney, toPrismaMoney } from "@/lib/money";

type Tx = Prisma.TransactionClient;

type JournalLineInput = {
  accountCode: string;
  debit?: string | number | { toString(): string };
  credit?: string | number | { toString(): string };
  description?: string;
  costCenterCode?: string;
  tag?: string;
};

async function resolveCostCenters(
  tx: Tx,
  companyId: string,
  lines: JournalLineInput[],
) {
  const codes = [
    ...new Set(
      lines.map((l) => l.costCenterCode?.trim()).filter(Boolean) as string[],
    ),
  ];
  if (!codes.length) return new Map<string, string>();
  const rows = await tx.costCenter.findMany({
    where: { companyId, code: { in: codes }, isActive: true },
  });
  const map = new Map(rows.map((r) => [r.code, r.id]));
  for (const code of codes) {
    if (!map.has(code)) throw validationError(`Cost center ${code} tidak ditemukan`);
  }
  return map;
}

export async function postJournal(
  tx: Tx,
  input: {
    companyId: string;
    journalType?: string;
    postingDate?: Date;
    sourceModule: string;
    sourceDocType: string;
    sourceDocId: string;
    description: string;
    lines: JournalLineInput[];
    idempotencyKey: string;
    postedById?: string;
    currency?: string;
    exchangeRate?: string | number;
    status?: "DRAFT" | "POSTED";
  },
) {
  if (input.idempotencyKey) {
    const existing = await tx.journal.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: input.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
  }

  const lines = input.lines.filter((l) => {
    const debit = money(l.debit == null ? 0 : l.debit);
    const credit = money(l.credit == null ? 0 : l.credit);
    return debit.gt(0) || credit.gt(0);
  });
  if (lines.length < 2) {
    throw validationError("Jurnal minimal 2 baris");
  }

  const totalDebit = sumMoney(lines.map((l) => l.debit ?? 0));
  const totalCredit = sumMoney(lines.map((l) => l.credit ?? 0));
  if (!totalDebit.equals(totalCredit)) {
    throw validationError(
      `Jurnal tidak seimbang: debit ${totalDebit} != credit ${totalCredit}`,
    );
  }

  const status = input.status ?? "POSTED";
  const postingDate = input.postingDate ?? new Date();
  const period = await tx.fiscalPeriod.findFirst({
    where: {
      fiscalYear: { companyId: input.companyId },
      startDate: { lte: postingDate },
      endDate: { gte: postingDate },
    },
  });
  if (status === "POSTED" && period && period.status !== "OPEN") {
    throw conflict("Periode akuntansi sudah ditutup");
  }

  const accountCodes = [...new Set(lines.map((l) => l.accountCode))];
  const accounts = await tx.account.findMany({
    where: { companyId: input.companyId, code: { in: accountCodes } },
  });
  const accountByCode = new Map(accounts.map((a) => [a.code, a]));
  for (const code of accountCodes) {
    if (!accountByCode.has(code)) {
      throw validationError(`Akun ${code} tidak ditemukan`);
    }
  }

  const ccMap = await resolveCostCenters(tx, input.companyId, lines);
  const rate = money(input.exchangeRate ?? 1);
  if (rate.lte(0)) throw validationError("Kurs harus > 0");

  const number = await nextDocumentNumber(tx, input.companyId, "JE");

  return tx.journal.create({
    data: {
      companyId: input.companyId,
      number,
      journalType: input.journalType ?? "AUTO",
      postingDate,
      documentDate: postingDate,
      fiscalPeriodId: period?.id,
      currency: input.currency || "IDR",
      exchangeRate: toPrismaMoney(rate),
      sourceModule: input.sourceModule,
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      status,
      idempotencyKey: input.idempotencyKey,
      postedById: status === "POSTED" ? input.postedById : undefined,
      postedAt: status === "POSTED" ? new Date() : undefined,
      lines: {
        create: lines.map((l) => ({
          accountId: accountByCode.get(l.accountCode)!.id,
          debit: toPrismaMoney(money(l.debit ?? 0)),
          credit: toPrismaMoney(money(l.credit ?? 0)),
          description: l.description,
          costCenterId: l.costCenterCode
            ? ccMap.get(l.costCenterCode.trim())
            : undefined,
          tag: l.tag?.trim() || undefined,
        })),
      },
    },
    include: { lines: { include: { account: true, costCenter: true } } },
  });
}

export async function postFromRule(
  tx: Tx,
  input: {
    companyId: string;
    sourceEvent: string;
    sourceDocType: string;
    sourceDocId: string;
    description: string;
    amount: string | number;
    taxAmount?: string | number;
    idempotencyKey: string;
    postedById?: string;
    /** Extra lines for COGS variance etc. */
    extraLines?: JournalLineInput[];
  },
) {
  const rule = await tx.postingRule.findFirst({
    where: {
      companyId: input.companyId,
      sourceEvent: input.sourceEvent,
      isActive: true,
    },
    include: {
      versions: {
        where: {
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!rule || rule.versions.length === 0) {
    return null;
  }

  const config = rule.versions[0].config as {
    lines: Array<{
      side: "DEBIT" | "CREDIT";
      accountCode: string;
      tax?: boolean;
    }>;
  };

  const base = money(input.amount);
  const tax = money(input.taxAmount ?? 0);
  const gross = base.plus(tax);

  if (input.sourceEvent === "sales_invoice.issue") {
    return postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
      lines: [
        { accountCode: "1120", debit: gross },
        { accountCode: "4100", credit: base },
        ...(tax.gt(0) ? [{ accountCode: "2120", credit: tax }] : []),
      ],
    }).catch(() => null);
  }

  if (input.sourceEvent === "supplier_bill.open") {
    return postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
      lines: [
        { accountCode: "2110", debit: base },
        ...(tax.gt(0) ? [{ accountCode: "1140", debit: tax }] : []),
        { accountCode: "2100", credit: gross },
      ],
    }).catch(() => null);
  }

  if (input.sourceEvent === "credit_note.issue") {
    return postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
      lines: [
        { accountCode: "4100", debit: base },
        ...(tax.gt(0) ? [{ accountCode: "2120", debit: tax }] : []),
        { accountCode: "1120", credit: gross },
      ],
    }).catch(() => null);
  }

  if (input.sourceEvent === "debit_note.issue") {
    return postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
      lines: [
        { accountCode: "2100", debit: base },
        { accountCode: "1130", credit: base },
      ],
    }).catch(() => null);
  }

  // delivery_order.post: COGS with optional variance lines
  if (input.sourceEvent === "delivery_order.post") {
    const lines: JournalLineInput[] = [
      { accountCode: "5100", debit: base, description: "COGS" },
      { accountCode: "1130", credit: base, description: "Inventory out" },
      ...(input.extraLines ?? []),
    ];
    // rebalance if extra lines shift totals — fold variance into inventory
    const d = sumMoney(lines.map((l) => l.debit ?? 0));
    const c = sumMoney(lines.map((l) => l.credit ?? 0));
    if (!d.equals(c)) {
      const diff = d.minus(c);
      if (diff.gt(0)) {
        lines.push({
          accountCode: "1130",
          credit: diff,
          description: "COGS balance",
        });
      } else {
        lines.push({
          accountCode: "5100",
          debit: diff.abs(),
          description: "COGS balance",
        });
      }
    }
    return postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      lines,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
    }).catch(() => null);
  }

  const lines = config.lines.map((l) => {
    const amount = l.tax ? tax : base;
    return {
      accountCode: l.accountCode,
      debit: l.side === "DEBIT" ? amount : 0,
      credit: l.side === "CREDIT" ? amount : 0,
    };
  });

  try {
    return await postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      lines,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
    });
  } catch {
    return null;
  }
}

export async function postManualJournal(input: {
  companyId: string;
  userId: string;
  description: string;
  postingDate?: Date;
  lines: JournalLineInput[];
  idempotencyKey?: string;
  currency?: string;
  exchangeRate?: string | number;
  status?: "DRAFT" | "POSTED";
}) {
  const { prisma } = await import("@/lib/db");
  return prisma.$transaction((tx) =>
    postJournal(tx, {
      companyId: input.companyId,
      journalType: "MANUAL",
      postingDate: input.postingDate,
      sourceModule: "manual",
      sourceDocType: "ManualJournal",
      sourceDocId: input.idempotencyKey || `manual-${Date.now()}`,
      description: input.description || "Jurnal manual",
      lines: input.lines,
      idempotencyKey:
        input.idempotencyKey || `manual:${input.companyId}:${Date.now()}`,
      postedById: input.userId,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      status: input.status ?? "POSTED",
    }),
  );
}

export async function saveDraftJournal(input: {
  companyId: string;
  userId: string;
  description: string;
  postingDate?: Date;
  lines: JournalLineInput[];
  currency?: string;
  exchangeRate?: string | number;
  journalId?: string;
}) {
  const { prisma } = await import("@/lib/db");

  if (input.journalId) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.journal.findFirst({
        where: {
          id: input.journalId,
          companyId: input.companyId,
          status: "DRAFT",
        },
      });
      if (!existing) throw notFound("Draft jurnal tidak ditemukan");

      const lines = input.lines.filter((l) => {
        const debit = money(l.debit == null ? 0 : l.debit);
        const credit = money(l.credit == null ? 0 : l.credit);
        return debit.gt(0) || credit.gt(0);
      });
      if (lines.length < 2) throw validationError("Jurnal minimal 2 baris");
      const totalDebit = sumMoney(lines.map((l) => l.debit ?? 0));
      const totalCredit = sumMoney(lines.map((l) => l.credit ?? 0));
      if (!totalDebit.equals(totalCredit)) {
        throw validationError(
          `Jurnal tidak seimbang: debit ${totalDebit} != credit ${totalCredit}`,
        );
      }

      const accountCodes = [...new Set(lines.map((l) => l.accountCode))];
      const accounts = await tx.account.findMany({
        where: { companyId: input.companyId, code: { in: accountCodes } },
      });
      const accountByCode = new Map(accounts.map((a) => [a.code, a]));
      for (const code of accountCodes) {
        if (!accountByCode.has(code)) {
          throw validationError(`Akun ${code} tidak ditemukan`);
        }
      }
      const ccMap = await resolveCostCenters(tx, input.companyId, lines);
      const postingDate = input.postingDate ?? existing.postingDate;

      await tx.journalLine.deleteMany({ where: { journalId: existing.id } });
      return tx.journal.update({
        where: { id: existing.id },
        data: {
          description: input.description || existing.description,
          postingDate,
          currency: input.currency || existing.currency,
          exchangeRate: toPrismaMoney(
            money(input.exchangeRate ?? existing.exchangeRate),
          ),
          lines: {
            create: lines.map((l) => ({
              accountId: accountByCode.get(l.accountCode)!.id,
              debit: toPrismaMoney(money(l.debit ?? 0)),
              credit: toPrismaMoney(money(l.credit ?? 0)),
              description: l.description,
              costCenterId: l.costCenterCode
                ? ccMap.get(l.costCenterCode.trim())
                : undefined,
              tag: l.tag?.trim() || undefined,
            })),
          },
        },
        include: { lines: { include: { account: true, costCenter: true } } },
      });
    });
  }

  return postManualJournal({ ...input, status: "DRAFT" });
}

export async function postDraftJournal(input: {
  companyId: string;
  userId: string;
  journalId: string;
}) {
  const { prisma } = await import("@/lib/db");
  return prisma.$transaction(async (tx) => {
    const draft = await tx.journal.findFirst({
      where: {
        id: input.journalId,
        companyId: input.companyId,
        status: "DRAFT",
      },
      include: { lines: true },
    });
    if (!draft) throw notFound("Draft jurnal tidak ditemukan");
    if (draft.lines.length < 2) throw validationError("Jurnal minimal 2 baris");

    const period = await tx.fiscalPeriod.findFirst({
      where: {
        fiscalYear: { companyId: input.companyId },
        startDate: { lte: draft.postingDate },
        endDate: { gte: draft.postingDate },
      },
    });
    if (period && period.status !== "OPEN") {
      throw conflict("Periode akuntansi sudah ditutup");
    }

    return tx.journal.update({
      where: { id: draft.id },
      data: {
        status: "POSTED",
        postedById: input.userId,
        postedAt: new Date(),
        fiscalPeriodId: period?.id ?? draft.fiscalPeriodId,
      },
      include: { lines: { include: { account: true, costCenter: true } } },
    });
  });
}

export async function reverseJournal(input: {
  companyId: string;
  userId: string;
  journalId: string;
  description?: string;
}) {
  const { prisma } = await import("@/lib/db");

  return prisma.$transaction(async (tx) => {
    const original = await tx.journal.findFirst({
      where: { id: input.journalId, companyId: input.companyId },
      include: {
        lines: { include: { account: true, costCenter: true } },
      },
    });
    if (!original) throw notFound("Jurnal tidak ditemukan");
    if (original.status !== "POSTED") {
      throw conflict("Hanya jurnal POSTED yang bisa direverse");
    }
    const existing = await tx.journal.findFirst({
      where: { companyId: input.companyId, reversalOfId: original.id },
    });
    if (existing) throw conflict("Jurnal sudah direverse");

    const reverse = await postJournal(tx, {
      companyId: input.companyId,
      journalType: "REVERSAL",
      postingDate: new Date(),
      sourceModule: "manual",
      sourceDocType: "JournalReversal",
      sourceDocId: original.id,
      description:
        input.description ||
        `Reversal ${original.number}: ${original.description || ""}`,
      idempotencyKey: `rev:${original.id}`,
      postedById: input.userId,
      currency: original.currency,
      exchangeRate: original.exchangeRate.toString(),
      lines: original.lines.map((l) => ({
        accountCode: l.account.code,
        debit: l.credit,
        credit: l.debit,
        description: `REV ${l.description || ""}`.trim(),
        costCenterCode: l.costCenter?.code,
        tag: l.tag || undefined,
      })),
    });

    await tx.journal.update({
      where: { id: reverse.id },
      data: { reversalOfId: original.id },
    });

    return reverse;
  });
}

export async function getJournalDetail(companyId: string, id: string) {
  const { prisma } = await import("@/lib/db");
  const journal = await prisma.journal.findFirst({
    where: { id, companyId },
    include: {
      lines: {
        include: { account: true, costCenter: true },
        orderBy: { id: "asc" },
      },
      fiscalPeriod: true,
      reversalOf: true,
      reversals: true,
    },
  });
  if (!journal) throw notFound("Jurnal tidak ditemukan");
  return journal;
}
