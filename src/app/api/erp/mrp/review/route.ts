import { z } from "zod";
import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { validationError } from "@/lib/errors";
import { reviewMrpSuggestion } from "@/server/services/mrp-convert";

export const dynamic = "force-dynamic";

const input = z.object({
  suggestionId: z.string().min(1),
  action: z.enum(["accept", "modify", "reject"]),
  quantity: z.union([z.string(), z.number()]).optional(),
  dueDate: z.string().optional(),
}).strict();

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("mrp:run");
    const parsed = input.safeParse(await req.json());
    if (!parsed.success) throw validationError("Review MRP tidak valid", parsed.error.flatten());
    const body = parsed.data;
    await assertRequestAccess(ctx, body);
    const reviewed = await reviewMrpSuggestion({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      ...body,
    });
    return { reviewed };
  });
}
