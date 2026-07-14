import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import {
  getFinancialStatements,
  toCsv,
} from "@/server/services/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("report:view");
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";
    const data = await getFinancialStatements(ctx.companyId);

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
