import type { Prisma } from "@/generated/prisma/client";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, validationError } from "@/lib/errors";
import { money, sumMoney, toPrismaMoney } from "@/lib/money";

type Tx = Prisma.TransactionClient;

type JournalLineInput = {
  accountCode: string;
  debit?: string | number | { toString(): string };
  credit?: string | number | { toString(): string };
  description?: string;
};

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

  const postingDate = input.postingDate ?? new Date();
  const period = await tx.fiscalPeriod.findFirst({
    where: {
      fiscalYear: { companyId: input.companyId },
      startDate: { lte: postingDate },
      endDate: { gte: postingDate },
    },
  });
  if (period && period.status !== "OPEN") {
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

  const number = await nextDocumentNumber(tx, input.companyId, "JE");

  return tx.journal.create({
    data: {
      companyId: input.companyId,
      number,
      journalType: input.journalType ?? "AUTO",
      postingDate,
      documentDate: postingDate,
      fiscalPeriodId: period?.id,
      sourceModule: input.sourceModule,
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      description: input.description,
      status: "POSTED",
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById,
      postedAt: new Date(),
      lines: {
        create: lines.map((l) => ({
          accountId: accountByCode.get(l.accountCode)!.id,
          debit: toPrismaMoney(money(l.debit ?? 0)),
          credit: toPrismaMoney(money(l.credit ?? 0)),
          description: l.description,
        })),
      },
    },
    include: { lines: true },
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
    lines: Array<{ side: "DEBIT" | "CREDIT"; accountCode: string; tax?: boolean }>;
  };

  const base = money(input.amount);
  const tax = money(input.taxAmount ?? 0);
  const gross = base.plus(tax);

  // Special-case balanced commercial postings
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
