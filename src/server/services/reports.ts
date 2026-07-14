import { prisma } from "@/lib/db";
import { money } from "@/lib/money";

export async function getTrialBalance(companyId: string) {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: "asc" },
  });
  const lines = await prisma.journalLine.findMany({
    where: {
      journal: { companyId, status: "POSTED" },
    },
    include: { account: true },
  });

  const map = new Map<
    string,
    { code: string; name: string; type: string; debit: ReturnType<typeof money>; credit: ReturnType<typeof money> }
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
  };
}

export async function getFinancialStatements(companyId: string) {
  const tb = await getTrialBalance(companyId);
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
