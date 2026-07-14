import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import {
  getApAging,
  getArAging,
  getCashFlow,
  getFinancialStatements,
  getGeneralLedger,
  toCsv,
} from "@/server/services/reports";

export const dynamic = "force-dynamic";

function parseRange(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("report:view");
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";
    const type = url.searchParams.get("type") || "fs";
    const range = parseRange(url);

    if (type === "ar_aging") {
      return getArAging(ctx.companyId);
    }
    if (type === "ap_aging") {
      return getApAging(ctx.companyId);
    }
    if (type === "cashflow") {
      return getCashFlow(ctx.companyId, range);
    }
    if (type === "gl") {
      return getGeneralLedger(
        ctx.companyId,
        String(url.searchParams.get("account") || "1110"),
        range,
      );
    }

    const data = await getFinancialStatements(ctx.companyId, range);

    if (format === "csv") {
      const rows = data.trialBalance.rows.map((r) => [
        r.code,
        r.name,
        r.type,
        r.debit,
        r.credit,
        r.netDebit,
        r.netCredit,
      ]);
      const csv = toCsv(
        ["code", "name", "type", "debit", "credit", "netDebit", "netCredit"],
        rows,
      );
      return {
        filename: `trial-balance-${ctx.companyId.slice(0, 6)}.csv`,
        csv,
        incomeStatement: data.incomeStatement,
        balanceSheet: {
          totalAssets: data.balanceSheet.totalAssets,
          totalLiabilities: data.balanceSheet.totalLiabilities,
          totalEquity: data.balanceSheet.totalEquity,
        },
      };
    }

    return data;
  });
}
