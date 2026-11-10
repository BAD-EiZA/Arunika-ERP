import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { validationError } from "@/lib/errors";
import { getStockMovementReport, getInventoryValuation, getOpenOrders, getUnbilledDocuments, toCsv } from "@/server/services/reports";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const p = new URL(req.url).searchParams;
    const csv = p.get("format") === "csv";
    const ctx = await requirePermission(csv ? ["report:view", "report:export"] : "report:view");
    const date = (key: string) => {
      const value = p.get(key);
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw validationError("Tanggal tidak valid");
      return new Date(`${value}T${key === "to" ? "23:59:59.999" : "00:00:00.000"}Z`);
    };
    const integer = (key: string, fallback: number, max: number) => {
      const n = Number(p.get(key) ?? fallback);
      if (!Number.isSafeInteger(n) || n < 1 || n > max) throw validationError(`${key} tidak valid`);
      return n;
    };
    const filters = { from: date("from"), to: date("to"), warehouseId: p.get("warehouseId") || undefined, productId: p.get("productId") || undefined, page: integer("page", 1, 1000000), limit: integer("limit", 20, 100) };
    if (filters.from && filters.to && filters.from > filters.to) throw validationError("Periode tidak valid");
    const type = p.get("type") ?? "movements";
    const data = type === "movements" ? await getStockMovementReport(ctx, filters) : type === "valuation" ? await getInventoryValuation(ctx, filters) : type === "open-orders" ? await getOpenOrders(ctx) : type === "unbilled" ? await getUnbilledDocuments(ctx) : null;
    if (!data) throw validationError("Jenis laporan tidak valid");
    if (!csv) return data;
    const headers = data.rows.length ? Object.keys(data.rows[0]) : ["id"];
    return { filename: `${type}.csv`, csv: toCsv(headers, data.rows.map(r => headers.map(k => String((r as Record<string, unknown>)[k] ?? "")))) };
  });
}
