import { prisma } from "@/lib/db";
import { money } from "@/lib/money";

type DateRange = { from?: Date; to?: Date };

function journalDateFilter(range?: DateRange) {
  if (!range?.from && !range?.to) return {};
  return {
    postingDate: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    },
  };
}

export async function getTrialBalance(companyId: string, range?: DateRange) {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: "asc" },
  });
  const lines = await prisma.journalLine.findMany({
    where: {
      journal: {
        companyId,
        status: "POSTED",
        ...journalDateFilter(range),
      },
    },
    include: { account: true },
  });

  const map = new Map<
    string,
    {
      code: string;
      name: string;
      type: string;
      debit: ReturnType<typeof money>;
      credit: ReturnType<typeof money>;
    }
  >();
  for (const a of accounts) {
    map.set(a.id, {
      code: a.code,
      name: a.name,
      type: a.type,
      debit: money(0),
      credit: money(0),
    });
  }
  for (const l of lines) {
    const row = map.get(l.accountId);
    if (!row) continue;
    row.debit = row.debit.plus(money(l.debit));
    row.credit = row.credit.plus(money(l.credit));
  }

  const rows = [...map.values()]
    .map((r) => {
      const netDebit = r.debit.gt(r.credit) ? r.debit.minus(r.credit) : money(0);
      const netCredit = r.credit.gt(r.debit) ? r.credit.minus(r.debit) : money(0);
      return {
        code: r.code,
        name: r.name,
        type: r.type,
        debit: r.debit.toFixed(2),
        credit: r.credit.toFixed(2),
        netDebit: netDebit.toFixed(2),
        netCredit: netCredit.toFixed(2),
      };
    })
    .filter((r) => Number(r.debit) !== 0 || Number(r.credit) !== 0);

  const totalDebit = rows.reduce((a, r) => a + Number(r.netDebit), 0);
  const totalCredit = rows.reduce((a, r) => a + Number(r.netCredit), 0);

  return {
    rows,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    from: range?.from?.toISOString() ?? null,
    to: range?.to?.toISOString() ?? null,
  };
}

export async function getFinancialStatements(
  companyId: string,
  range?: DateRange,
) {
  const tb = await getTrialBalance(companyId, range);
  const byType = (types: string[]) =>
    tb.rows.filter((r) => types.includes(r.type));

  const assets = byType(["ASSET"]);
  const liabilities = byType(["LIABILITY"]);
  const equity = byType(["EQUITY"]);
  const revenue = byType(["REVENUE", "OTHER_INCOME"]);
  const expenses = byType(["EXPENSE", "COGS", "OTHER_EXPENSE"]);

  const sumNet = (
    rows: typeof tb.rows,
    side: "debit" | "credit",
  ) =>
    rows
      .reduce(
        (a, r) => a + Number(side === "debit" ? r.netDebit : r.netCredit),
        0,
      )
      .toFixed(2);

  const totalRevenue = sumNet(revenue, "credit");
  const totalExpense = sumNet(expenses, "debit");
  const netIncome = (Number(totalRevenue) - Number(totalExpense)).toFixed(2);

  return {
    trialBalance: tb,
    balanceSheet: {
      assets,
      liabilities,
      equity,
      totalAssets: sumNet(assets, "debit"),
      totalLiabilities: sumNet(liabilities, "credit"),
      totalEquity: sumNet(equity, "credit"),
    },
    incomeStatement: {
      revenue,
      expenses,
      totalRevenue,
      totalExpense,
      netIncome,
    },
  };
}

export async function getGeneralLedger(
  companyId: string,
  accountCode: string,
  range?: DateRange,
) {
  const account = await prisma.account.findUnique({
    where: { companyId_code: { companyId, code: accountCode } },
  });
  if (!account) return { account: null, lines: [] };

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: account.id,
      journal: {
        companyId,
        status: "POSTED",
        ...journalDateFilter(range),
      },
    },
    include: {
      journal: true,
    },
    orderBy: { journal: { postingDate: "asc" } },
  });

  let running = money(0);
  const mapped = lines.map((l) => {
    running = running.plus(money(l.debit)).minus(money(l.credit));
    return {
      journalId: l.journalId,
      journalNumber: l.journal.number,
      postingDate: l.journal.postingDate.toISOString(),
      description: l.description || l.journal.description,
      debit: l.debit.toString(),
      credit: l.credit.toString(),
      balance: running.toFixed(2),
    };
  });

  return {
    account: {
      code: account.code,
      name: account.name,
      type: account.type,
    },
    lines: mapped,
  };
}

function agingBuckets(dueDate: Date | null, balance: number, asOf: Date) {
  if (balance <= 0) {
    return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  }
  const due = dueDate ?? asOf;
  const days = Math.floor(
    (asOf.getTime() - due.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return { current: balance, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  if (days <= 30) return { current: 0, d1_30: balance, d31_60: 0, d61_90: 0, d90p: 0 };
  if (days <= 60) return { current: 0, d1_30: 0, d31_60: balance, d61_90: 0, d90p: 0 };
  if (days <= 90) return { current: 0, d1_30: 0, d31_60: 0, d61_90: balance, d90p: 0 };
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: balance };
}

export async function getArAging(companyId: string, asOf = new Date()) {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      companyId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      balance: { gt: 0 },
    },
    include: { customer: true },
    orderBy: { dueDate: "asc" },
  });

  const rows = invoices.map((inv) => {
    const bal = Number(inv.balance);
    const b = agingBuckets(inv.dueDate, bal, asOf);
    return {
      id: inv.id,
      number: inv.number,
      partner: inv.customer.name,
      partnerId: inv.customerId,
      dueDate: inv.dueDate?.toISOString() ?? null,
      balance: bal.toFixed(2),
      ...Object.fromEntries(
        Object.entries(b).map(([k, v]) => [k, v.toFixed(2)]),
      ),
    };
  });

  const sum = (key: string) =>
    rows.reduce((a, r) => a + Number((r as Record<string, string>)[key]), 0).toFixed(2);

  return {
    asOf: asOf.toISOString(),
    rows,
    totals: {
      balance: sum("balance"),
      current: sum("current"),
      d1_30: sum("d1_30"),
      d31_60: sum("d31_60"),
      d61_90: sum("d61_90"),
      d90p: sum("d90p"),
    },
  };
}

export async function getApAging(companyId: string, asOf = new Date()) {
  const bills = await prisma.supplierBill.findMany({
    where: {
      companyId,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
      balance: { gt: 0 },
    },
    include: { supplier: true },
    orderBy: { dueDate: "asc" },
  });

  const rows = bills.map((bill) => {
    const bal = Number(bill.balance);
    const b = agingBuckets(bill.dueDate, bal, asOf);
    return {
      id: bill.id,
      number: bill.number,
      partner: bill.supplier.name,
      partnerId: bill.supplierId,
      dueDate: bill.dueDate?.toISOString() ?? null,
      balance: bal.toFixed(2),
      ...Object.fromEntries(
        Object.entries(b).map(([k, v]) => [k, v.toFixed(2)]),
      ),
    };
  });

  const sum = (key: string) =>
    rows.reduce((a, r) => a + Number((r as Record<string, string>)[key]), 0).toFixed(2);

  return {
    asOf: asOf.toISOString(),
    rows,
    totals: {
      balance: sum("balance"),
      current: sum("current"),
      d1_30: sum("d1_30"),
      d31_60: sum("d31_60"),
      d61_90: sum("d61_90"),
      d90p: sum("d90p"),
    },
  };
}

/** Indirect cash flow (simplified from P/L + BS movement proxy). */
export async function getCashFlow(companyId: string, range?: DateRange) {
  const fs = await getFinancialStatements(companyId, range);
  const netIncome = Number(fs.incomeStatement.netIncome);

  // Operating: net income + proxy non-cash (dep expense 6200)
  const dep = fs.trialBalance.rows.find((r) => r.code === "6200");
  const depreciation = dep ? Number(dep.netDebit) : 0;

  // Investing: fixed asset acquisitions proxy (1200 net debit increase) — simplified 0 if no date range
  const investing = 0;

  // Financing: equity / loan movements simplified 0
  const financing = 0;

  const operating = netIncome + depreciation;
  const netChange = operating + investing + financing;

  // Cash ending from TB 1100+1110
  const cashAccounts = fs.trialBalance.rows.filter((r) =>
    ["1100", "1110"].includes(r.code),
  );
  const endingCash = cashAccounts
    .reduce((a, r) => a + Number(r.netDebit), 0)
    .toFixed(2);

  return {
    operating: {
      netIncome: netIncome.toFixed(2),
      depreciation: depreciation.toFixed(2),
      total: operating.toFixed(2),
    },
    investing: { total: investing.toFixed(2) },
    financing: { total: financing.toFixed(2) },
    netChange: netChange.toFixed(2),
    endingCash,
  };
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join(
    "\n",
  );
}
