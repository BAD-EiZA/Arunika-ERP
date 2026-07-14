import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, toPrismaMoney } from "@/lib/money";
import { postJournal } from "@/server/services/accounting";
import { newIdempotencyKey } from "@/lib/idempotency";

export async function createBankAccount(input: {
  companyId: string;
  code: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
  glAccountCode?: string;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama rekening wajib");
  }
  let glAccountId: string | undefined;
  if (input.glAccountCode) {
    const gl = await prisma.account.findUnique({
      where: {
        companyId_code: {
          companyId: input.companyId,
          code: input.glAccountCode,
        },
      },
    });
    glAccountId = gl?.id;
  }
  return prisma.bankAccount.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      glAccountId,
    },
  });
}

export async function updateBankAccount(input: {
  companyId: string;
  id: string;
  name?: string;
  bankName?: string;
  accountNumber?: string;
  glAccountCode?: string | null;
  isActive?: boolean;
}) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: input.id, companyId: input.companyId },
  });
  if (!account) throw notFound("Rekening tidak ditemukan");
  let glAccountId = account.glAccountId;
  if (input.glAccountCode === null) glAccountId = null;
  else if (input.glAccountCode) {
    const gl = await prisma.account.findUnique({
      where: {
        companyId_code: {
          companyId: input.companyId,
          code: input.glAccountCode,
        },
      },
    });
    glAccountId = gl?.id ?? null;
  }
  return prisma.bankAccount.update({
    where: { id: account.id },
    data: {
      name: input.name?.trim() || account.name,
      bankName: input.bankName ?? account.bankName,
      accountNumber: input.accountNumber ?? account.accountNumber,
      glAccountId,
      isActive: input.isActive ?? account.isActive,
    },
  });
}

export async function importBankStatement(input: {
  companyId: string;
  bankAccountId: string;
  statementDate: Date;
  openingBalance: number | string;
  closingBalance: number | string;
  lines: Array<{
    lineDate: Date;
    description?: string;
    amount: number | string;
  }>;
}) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, companyId: input.companyId },
  });
  if (!account) throw notFound("Rekening tidak ditemukan");
  if (!input.lines.length) throw validationError("Minimal 1 baris statement");

  return prisma.bankStatement.create({
    data: {
      bankAccountId: input.bankAccountId,
      statementDate: input.statementDate,
      openingBalance: toPrismaMoney(money(input.openingBalance)),
      closingBalance: toPrismaMoney(money(input.closingBalance)),
      lines: {
        create: input.lines.map((l) => ({
          lineDate: l.lineDate,
          description: l.description,
          amount: toPrismaMoney(money(l.amount)),
        })),
      },
    },
    include: { lines: true },
  });
}

export async function reconcileStatementLine(
  companyId: string,
  lineId: string,
  matchedRef: string,
) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: lineId, statement: { bankAccount: { companyId } } },
  });
  if (!line) throw notFound("Baris statement tidak ditemukan");
  return prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { isReconciled: true, matchedRef },
  });
}

export async function unreconcileStatementLine(
  companyId: string,
  lineId: string,
) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: lineId, statement: { bankAccount: { companyId } } },
  });
  if (!line) throw notFound("Baris statement tidak ditemukan");
  return prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { isReconciled: false, matchedRef: null },
  });
}

export async function createBudget(input: {
  companyId: string;
  name: string;
  year: number;
  lines: Array<{ accountCode: string; period: number; amount: number | string }>;
}) {
  if (!input.lines.length) throw validationError("Minimal 1 baris budget");
  return prisma.budget.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      year: input.year,
      status: "DRAFT",
      lines: {
        create: input.lines.map((l) => ({
          accountCode: l.accountCode,
          period: l.period,
          amount: toPrismaMoney(money(l.amount)),
        })),
      },
    },
    include: { lines: true },
  });
}

export async function approveBudget(companyId: string, id: string) {
  const budget = await prisma.budget.findFirst({
    where: { id, companyId },
  });
  if (!budget) throw notFound("Budget tidak ditemukan");
  if (budget.status !== "DRAFT") throw conflict("Hanya DRAFT yang bisa disetujui");
  return prisma.budget.update({
    where: { id },
    data: { status: "APPROVED" },
  });
}

export async function getBudgetVsActual(companyId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId },
    include: { lines: true },
  });
  if (!budget) throw notFound("Budget tidak ditemukan");

  const yearStart = new Date(Date.UTC(budget.year, 0, 1));
  const yearEnd = new Date(Date.UTC(budget.year, 11, 31, 23, 59, 59, 999));
  const codes = [...new Set(budget.lines.map((l) => l.accountCode))];
  const accounts = await prisma.account.findMany({
    where: { companyId, code: { in: codes } },
  });
  const accountIds = accounts.map((a) => a.id);
  const codeById = new Map(accounts.map((a) => [a.id, a.code]));

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: accountIds },
      journal: {
        companyId,
        status: "POSTED",
        postingDate: { gte: yearStart, lte: yearEnd },
      },
    },
    include: { journal: true },
  });

  const actualByCodePeriod = new Map<string, number>();
  for (const l of lines) {
    const code = codeById.get(l.accountId);
    if (!code) continue;
    const period = l.journal.postingDate.getUTCMonth() + 1;
    const key = `${code}:${period}`;
    const net = Number(l.debit) - Number(l.credit);
    actualByCodePeriod.set(key, (actualByCodePeriod.get(key) ?? 0) + Math.abs(net));
  }

  const rows = budget.lines.map((bl) => {
    const actual = actualByCodePeriod.get(`${bl.accountCode}:${bl.period}`) ?? 0;
    const budgetAmt = Number(bl.amount);
    return {
      accountCode: bl.accountCode,
      period: bl.period,
      budget: budgetAmt.toFixed(2),
      actual: actual.toFixed(2),
      variance: (budgetAmt - actual).toFixed(2),
    };
  });

  return {
    budget: {
      id: budget.id,
      name: budget.name,
      year: budget.year,
      status: budget.status,
    },
    rows,
  };
}

export async function createFixedAsset(input: {
  companyId: string;
  code: string;
  name: string;
  category?: string;
  acquisitionDate: Date;
  acquisitionCost: number | string;
  residualValue?: number | string;
  usefulLifeMonths: number;
}) {
  const cost = money(input.acquisitionCost);
  return prisma.fixedAsset.create({
    data: {
      companyId: input.companyId,
      code: input.code,
      name: input.name,
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: toPrismaMoney(cost),
      residualValue: toPrismaMoney(money(input.residualValue ?? 0)),
      usefulLifeMonths: input.usefulLifeMonths,
      bookValue: toPrismaMoney(cost),
    },
  });
}

export async function runStraightLineDepreciation(
  companyId: string,
  assetId: string,
  userId?: string,
) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, companyId, isActive: true },
  });
  if (!asset) throw notFound("Aset tidak ditemukan");
  if (asset.disposedAt) throw conflict("Aset sudah di-dispose");

  const depreciable = money(asset.acquisitionCost).minus(money(asset.residualValue));
  const monthly = depreciable.div(asset.usefulLifeMonths);
  const nextAccum = money(asset.accumulatedDep).plus(monthly);
  const nextBook = money(asset.acquisitionCost).minus(nextAccum);
  if (nextBook.lt(money(asset.residualValue))) {
    return asset;
  }

  const depAmount = monthly.toFixed(2);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.fixedAsset.update({
      where: { id: asset.id },
      data: {
        accumulatedDep: toPrismaMoney(nextAccum),
        bookValue: toPrismaMoney(nextBook),
      },
    });

    await postJournal(tx, {
      companyId,
      journalType: "DEPRECIATION",
      sourceModule: "fixed_asset",
      sourceDocType: "FixedAssetDep",
      sourceDocId: `${asset.id}:${nextAccum.toFixed(2)}`,
      description: `Penyusutan ${asset.code} ${asset.name}`,
      idempotencyKey: `dep:${asset.id}:${nextAccum.toFixed(2)}`,
      postedById: userId,
      lines: [
        { accountCode: "6200", debit: depAmount, description: "Beban penyusutan" },
        { accountCode: "1210", credit: depAmount, description: "Akumulasi penyusutan" },
      ],
    }).catch(() => null);

    return updated;
  });
}

export async function disposeFixedAsset(input: {
  companyId: string;
  userId: string;
  assetId: string;
  disposeAmount?: number | string;
}) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: input.assetId, companyId: input.companyId, isActive: true },
  });
  if (!asset) throw notFound("Aset tidak ditemukan");
  if (asset.disposedAt) throw conflict("Aset sudah di-dispose");

  const proceeds = money(input.disposeAmount ?? 0);
  const book = money(asset.bookValue);
  const gain = proceeds.minus(book);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.fixedAsset.update({
      where: { id: asset.id },
      data: {
        isActive: false,
        disposedAt: new Date(),
        disposeAmount: toPrismaMoney(proceeds),
        bookValue: toPrismaMoney(money(0)),
      },
    });

    const lines = [
      { accountCode: "1110", debit: proceeds.toFixed(2), description: "Penerimaan dispose" },
      {
        accountCode: "1210",
        debit: money(asset.accumulatedDep).toFixed(2),
        description: "Hapus akumulasi",
      },
      {
        accountCode: "1200",
        credit: money(asset.acquisitionCost).toFixed(2),
        description: "Hapus aset",
      },
    ];
    if (gain.gt(0)) {
      lines.push({
        accountCode: "4100",
        credit: gain.toFixed(2),
        description: "Laba dispose",
      });
    } else if (gain.lt(0)) {
      lines.push({
        accountCode: "6100",
        debit: gain.abs().toFixed(2),
        description: "Rugi dispose",
      });
    }

    await postJournal(tx, {
      companyId: input.companyId,
      journalType: "DISPOSAL",
      sourceModule: "fixed_asset",
      sourceDocType: "FixedAssetDispose",
      sourceDocId: asset.id,
      description: `Dispose ${asset.code}`,
      idempotencyKey: `dispose:${asset.id}`,
      postedById: input.userId,
      lines,
    }).catch(() => null);

    return updated;
  });
}

export async function closeFiscalPeriod(companyId: string, periodId: string) {
  const period = await prisma.fiscalPeriod.findFirst({
    where: { id: periodId, fiscalYear: { companyId } },
  });
  if (!period) throw notFound("Periode tidak ditemukan");
  if (period.status === "LOCKED") throw conflict("Periode terkunci");
  return prisma.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: "CLOSED" },
  });
}

export async function reopenFiscalPeriod(companyId: string, periodId: string) {
  const period = await prisma.fiscalPeriod.findFirst({
    where: { id: periodId, fiscalYear: { companyId } },
  });
  if (!period) throw notFound("Periode tidak ditemukan");
  if (period.status === "LOCKED") throw conflict("Periode terkunci, tidak bisa dibuka");
  return prisma.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: "OPEN" },
  });
}

export async function lockFiscalPeriod(companyId: string, periodId: string) {
  const period = await prisma.fiscalPeriod.findFirst({
    where: { id: periodId, fiscalYear: { companyId } },
  });
  if (!period) throw notFound("Periode tidak ditemukan");
  return prisma.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: "LOCKED" },
  });
}

export async function closeFiscalYear(input: {
  companyId: string;
  userId: string;
  fiscalYearId: string;
  retainedEarningsCode?: string;
}) {
  const year = await prisma.fiscalYear.findFirst({
    where: { id: input.fiscalYearId, companyId: input.companyId },
    include: { periods: true },
  });
  if (!year) throw notFound("Tahun fiskal tidak ditemukan");
  if (year.isClosed) throw conflict("Tahun fiskal sudah ditutup");

  for (const p of year.periods) {
    if (p.status === "OPEN") {
      await prisma.fiscalPeriod.update({
        where: { id: p.id },
        data: { status: "CLOSED" },
      });
    }
  }

  const reCode = input.retainedEarningsCode || "3200";
  const plTypes = [
    "REVENUE",
    "OTHER_INCOME",
    "EXPENSE",
    "COGS",
    "OTHER_EXPENSE",
  ] as const;

  // Per-account P&L balances for full close
  const lines = await prisma.journalLine.findMany({
    where: {
      journal: {
        companyId: input.companyId,
        status: "POSTED",
        postingDate: { gte: year.startDate, lte: year.endDate },
      },
      account: { type: { in: [...plTypes] } },
    },
    include: { account: true },
  });

  const byAccount = new Map<
    string,
    { code: string; type: string; balance: ReturnType<typeof money> }
  >();
  for (const l of lines) {
    const cur = byAccount.get(l.accountId) ?? {
      code: l.account.code,
      type: l.account.type,
      balance: money(0),
    };
    const isIncome = ["REVENUE", "OTHER_INCOME"].includes(l.account.type);
    // natural income balance = credit - debit; expense = debit - credit
    if (isIncome) {
      cur.balance = cur.balance.plus(money(l.credit)).minus(money(l.debit));
    } else {
      cur.balance = cur.balance.plus(money(l.debit)).minus(money(l.credit));
    }
    byAccount.set(l.accountId, cur);
  }

  const closeLines: Array<{
    accountCode: string;
    debit?: string;
    credit?: string;
    description: string;
  }> = [];
  let net = money(0);

  for (const row of byAccount.values()) {
    if (row.balance.isZero()) continue;
    const isIncome = ["REVENUE", "OTHER_INCOME"].includes(row.type);
    if (isIncome) {
      // close income: debit income, reduce credit balance
      closeLines.push({
        accountCode: row.code,
        debit: row.balance.toFixed(2),
        description: `Tutup ${row.code}`,
      });
      net = net.plus(row.balance);
    } else {
      // close expense: credit expense
      closeLines.push({
        accountCode: row.code,
        credit: row.balance.toFixed(2),
        description: `Tutup ${row.code}`,
      });
      net = net.minus(row.balance);
    }
  }

  if (closeLines.length > 0) {
    if (net.gt(0)) {
      closeLines.push({
        accountCode: reCode,
        credit: net.toFixed(2),
        description: "Laba ditahan",
      });
    } else if (net.lt(0)) {
      closeLines.push({
        accountCode: reCode,
        debit: net.abs().toFixed(2),
        description: "Rugi ditahan",
      });
    }

    await prisma.$transaction(async (tx) => {
      await postJournal(tx, {
        companyId: input.companyId,
        journalType: "YEAR_END",
        postingDate: year.endDate,
        sourceModule: "closing",
        sourceDocType: "FiscalYearClose",
        sourceDocId: year.id,
        description: `Tutup tahun ${year.name} — roll-forward P&L → ${reCode}`,
        idempotencyKey: `yec:${year.id}`,
        postedById: input.userId,
        lines: closeLines,
      });
    });
  }

  return prisma.fiscalYear.update({
    where: { id: year.id },
    data: { isClosed: true },
  });
}

export async function syncBankFeed(input: {
  companyId: string;
  bankAccountId: string;
  provider?: string;
  lines: Array<{
    lineDate: string | Date;
    description?: string;
    amount: number | string;
    externalRef?: string;
  }>;
}) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, companyId: input.companyId },
  });
  if (!account) throw notFound("Rekening bank tidak ditemukan");

  const provider = input.provider || "CSV";
  let feed = await prisma.bankFeed.findFirst({
    where: {
      companyId: input.companyId,
      bankAccountId: account.id,
      provider,
    },
  });
  if (!feed) {
    feed = await prisma.bankFeed.create({
      data: {
        companyId: input.companyId,
        bankAccountId: account.id,
        provider,
        isActive: true,
      },
    });
  }

  const statement = await importBankStatement({
    companyId: input.companyId,
    bankAccountId: account.id,
    statementDate: new Date(),
    openingBalance: 0,
    closingBalance: input.lines.reduce(
      (acc, l) => acc + Number(l.amount || 0),
      0,
    ),
    lines: input.lines.map((l) => ({
      lineDate: new Date(l.lineDate),
      description: l.description || l.externalRef || "Feed",
      amount: l.amount,
    })),
  });

  await prisma.bankFeed.update({
    where: { id: feed.id },
    data: {
      lastSyncAt: new Date(),
      meta: { lastLineCount: input.lines.length },
    },
  });

  return { feed, statement };
}
