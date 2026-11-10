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

type ReportScope = { companyId: string; branchIds: string[]; warehouseIds: string[] };
type StockFilters = DateRange & { warehouseId?: string; productId?: string; page?: number; limit?: number };

function stockScope(ctx: ReportScope, filters: StockFilters = {}) {
  return {
    companyId: ctx.companyId,
    ...(ctx.warehouseIds.length ? { warehouseId: { in: ctx.warehouseIds } } : {}),
    warehouse: { companyId: ctx.companyId, ...(ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {}) },
    ...(filters.warehouseId ? { AND: [{ warehouseId: filters.warehouseId }] } : {}),
    ...(filters.productId ? { productId: filters.productId } : {}),
  };
}

export async function getStockMovementReport(ctx: ReportScope, filters: StockFilters = {}) {
  const page = filters.page ?? 1, limit = filters.limit ?? 20;
  const where = { ...stockScope(ctx, filters), ...(filters.from || filters.to ? { postedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}) };
  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({ where, include: { product: true, warehouse: true }, orderBy: [{ postedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.stockMovement.count({ where }),
  ]);
  return { rows: data.map(r => ({ id: r.id, date: r.postedAt.toISOString(), warehouse: r.warehouse.name, sku: r.product.sku, product: r.product.name, type: r.type, quantity: r.quantity.toString(), unitCost: r.unitCost.toString(), totalCost: r.totalCost.toString(), reference: r.referenceNumber ?? "" })), total, page, limit };
}

export async function getInventoryValuation(ctx: ReportScope, filters: StockFilters = {}) {
  const data = await prisma.stockBalance.findMany({ where: stockScope(ctx, filters), include: { product: true, warehouse: true }, orderBy: [{ warehouseId: "asc" }, { productId: "asc" }] });
  const totals = new Map<string, { warehouse: string; total: ReturnType<typeof money> }>();
  let total = money(0);
  const rows = data.map(r => {
    const value = money(r.quantityOnHand).mul(money(r.averageCost));
    total = total.plus(value);
    const group = totals.get(r.warehouseId) ?? { warehouse: r.warehouse.name, total: money(0) };
    group.total = group.total.plus(value); totals.set(r.warehouseId, group);
    return { id: r.id, warehouse: r.warehouse.name, sku: r.product.sku, product: r.product.name, onHand: r.quantityOnHand.toString(), averageCost: r.averageCost.toString(), value: value.toFixed(2) };
  });
  return { rows, total: total.toFixed(2), warehouses: [...totals].map(([warehouseId, r]) => ({ warehouseId, warehouse: r.warehouse, total: r.total.toFixed(2) })) };
}

function orderScope(ctx: ReportScope) {
  return { companyId: ctx.companyId, ...(ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {}), ...(ctx.warehouseIds.length ? { warehouseId: { in: ctx.warehouseIds } } : {}) };
}

export async function getOpenOrders(ctx: ReportScope, asOf = new Date()) {
  const where = { ...orderScope(ctx), status: { in: ["APPROVED", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED", "PARTIALLY_DELIVERED"] as ("APPROVED" | "SENT" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "PARTIALLY_DELIVERED")[] } };
  const [po, so] = await Promise.all([prisma.purchaseOrder.findMany({ where, include: { items: true }, orderBy: { orderDate: "asc" } }), prisma.salesOrder.findMany({ where, include: { items: true }, orderBy: { orderDate: "asc" } })]);
  const rows = [...po.map(r => ({ ...r, type: "PO", remaining: r.items.reduce((n, i) => n.plus(money(i.quantity).minus(money(i.quantityReceived))), money(0)) })), ...so.map(r => ({ ...r, type: "SO", remaining: r.items.reduce((n, i) => n.plus(money(i.quantity).minus(money(i.quantityDelivered))), money(0)) }))].filter(r => r.remaining.gt(0)).map(r => ({ id: r.id, type: r.type, number: r.number, status: r.status, date: r.orderDate.toISOString(), remaining: r.remaining.toFixed(4), ageDays: Math.max(0, Math.floor((asOf.getTime() - r.orderDate.getTime()) / 86400000)) }));
  return { rows };
}

export async function getUnbilledDocuments(ctx: ReportScope) {
  const valid = { companyId: ctx.companyId, status: { notIn: ["CANCELLED", "VOID"] as ("CANCELLED" | "VOID")[] } };
  const branch = ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {};
  const where = { ...stockScope(ctx), status: "POSTED" as const };
  const [gr, delivery] = await Promise.all([
    // ponytail: bills link to PO, not GR; report means no active bill for that PO. Add GR allocation when schema supports it.
    prisma.goodsReceipt.findMany({ where: { ...where, purchaseOrder: { companyId: ctx.companyId, ...branch, supplierBills: { none: valid } } }, orderBy: { receiptDate: "asc" } }),
    prisma.deliveryOrder.findMany({ where: { ...where, salesOrder: { companyId: ctx.companyId, ...branch }, salesInvoices: { none: valid } }, orderBy: { deliveryDate: "asc" } }),
  ]);
  return { rows: [...gr.map(r => ({ id: r.id, type: "GR", number: r.number, date: r.receiptDate.toISOString(), warehouseId: r.warehouseId })), ...delivery.map(r => ({ id: r.id, type: "DO", number: r.number, date: r.deliveryDate.toISOString(), warehouseId: r.warehouseId }))] };
}

function csvCell(v: string | number) {
  const s = String(v ?? "");
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR).
  const neutral = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n\r]/.test(neutral) ? `"${neutral.replaceAll('"', '""')}"` : neutral;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
