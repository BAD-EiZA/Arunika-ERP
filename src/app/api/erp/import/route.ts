import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import {
  importCustomersCsv,
  importOpeningStockCsv,
  importProductsCsv,
  importSuppliersCsv,
} from "@/server/services/import-csv";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      type?: "products" | "customers" | "suppliers" | "opening_stock";
      csv?: string;
    };
    const csv = String(body.csv ?? "");
    const type = body.type ?? "products";

    if (type === "customers") {
      const ctx = await requirePermission("customer:create");
      return importCustomersCsv(ctx.companyId, csv);
    }
    if (type === "suppliers") {
      const ctx = await requirePermission("supplier:create");
      return importSuppliersCsv(ctx.companyId, csv);
    }
    if (type === "opening_stock") {
      const ctx = await requirePermission("stock:adjust");
      return importOpeningStockCsv(ctx.companyId, ctx.user.id, csv);
    }

    const ctx = await requirePermission("product:create");
    return importProductsCsv(ctx.companyId, csv);
  });
}
