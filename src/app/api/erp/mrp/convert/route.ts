import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { convertMrpSuggestion } from "@/server/services/mrp-convert";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("mrp:run");
    const body = (await req.json()) as {
      suggestionId?: string;
      supplierId?: string;
      warehouseId?: string;
      branchId?: string;
      bomId?: string;
      routingId?: string;
    };
    const result = await convertMrpSuggestion({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      suggestionId: String(body.suggestionId ?? ""),
      supplierId: body.supplierId,
      warehouseId: body.warehouseId,
      branchId: body.branchId,
      bomId: body.bomId,
      routingId: body.routingId,
    });
    return { converted: result };
  });
}
