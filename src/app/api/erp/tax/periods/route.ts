import { z } from "zod";
import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { validationError, forbidden } from "@/lib/errors";
import { closeTaxPeriod, reopenTaxPeriod, reconcileTaxPeriod, createOfflineTaxExport, importTaxExportResponse, normalizeTaxPeriod } from "@/server/services/tax";

export const dynamic = "force-dynamic";
const input = z.object({ action: z.enum(["reconcile", "close", "reopen", "export", "response"]), period: z.string().min(6).max(7), reason: z.string().max(4000).optional(), batchId: z.string().max(100).optional(), status: z.enum(["REPORTED_ACCEPTED", "REPORTED_REJECTED"]).optional(), reference: z.string().max(200).optional(), evidence: z.string().max(20000).optional() }).strict();

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("tax:view");
    const period = normalizeTaxPeriod(new URL(req.url).searchParams.get("period") ?? "");
    const [lifecycle, batches, reconciliation] = await Promise.all([
      prisma.taxPeriod.findUnique({ where: { companyId_period: { companyId: ctx.companyId, period } } }),
      prisma.taxExportBatch.findMany({ where: { companyId: ctx.companyId, period }, orderBy: { revision: "desc" } }),
      reconcileTaxPeriod(ctx.companyId, period),
    ]);
    const canExport = ctx.permissions === "*" || ctx.permissions.has("tax_export:generate");
    return { lifecycle, batches: batches.map(b => ({ id: b.id, revision: b.revision, status: b.status, checksum: b.checksum, payload: canExport ? b.payload : undefined, responses: canExport ? b.responses : undefined })), reconciliation, adapter: "OFFLINE_ONLY", liveSubmissionEnabled: false };
  });
}
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("tax:view");
    const parsed = input.safeParse(await req.json());
    if (!parsed.success) throw validationError("Invalid tax operation", parsed.error.flatten());
    const body = parsed.data;
    await assertRequestAccess(ctx, body);
    const allowed = (permission: string) => { if (ctx.permissions !== "*" && !ctx.permissions.has(permission)) throw forbidden("Permission required: " + permission); };
    if (body.action === "reconcile") return reconcileTaxPeriod(ctx.companyId, body.period);
    if (body.action === "close") { allowed("tax_period:close"); return closeTaxPeriod(ctx.companyId, body.period, ctx.user.id, body.reason); }
    if (body.action === "reopen") {
      allowed("tax_period:close"); allowed("tax:configure");
      return reopenTaxPeriod(ctx.companyId, body.period, ctx.user.id, body.reason ?? "");
    }
    allowed("tax_export:generate");
    if (body.action === "export") return createOfflineTaxExport(ctx.companyId, body.period, ctx.user.id);
    if (!body.batchId || !body.status) throw validationError("Batch and status required");
    return importTaxExportResponse(ctx.companyId, body.batchId, ctx.user.id, { status: body.status, reference: body.reference ?? "", evidence: body.evidence ?? "" });
  });
}
