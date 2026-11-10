import { z } from "zod";
import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { validationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { createTaxRuleVersion, saveTaxProfile, recordTaxPayment } from "@/server/services/tax";
export const dynamic = "force-dynamic";
const text = z.string().min(1).max(200);
const amount = z.string().regex(/^\d+(\.\d{1,2})?$/);
const schema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("rule"), code: text, name: text, taxType: z.enum(["PPN", "PPH21", "PPH22", "PPH23", "PPH4_2", "PPH26", "OTHER"]), direction: z.enum(["INPUT", "OUTPUT", "WITHHOLDING"]), rate: amount, effectiveFrom: text, effectiveTo: z.string().optional(), legalReference: text, glAccountCode: text, category: text.optional(), baseMultiplier: z.string().optional(), inclusive: z.boolean().optional(), recoverablePercent: amount.optional() }),
 z.object({ action: z.literal("profile"), npwp: text, effectiveFrom: text, nik: z.string().max(100).optional(), isPkp: z.boolean().optional(), taxOffice: z.string().max(200).optional(), taxAddress: z.string().max(1000).optional(), taxContact: z.string().max(200).optional(), signingAuthority: z.string().max(200).optional(), taxCalendar: z.string().max(200).optional() }),
 z.object({ action: z.literal("payment"), period: text, amount, billingReference: text, bankReference: text, bankAccountCode: text, paymentDate: text, allocations: z.array(z.object({ documentId: text, amount })).min(1).max(100) }),
]);
export async function GET() { return withApiHandler(async () => {
 const ctx = await requirePermission("tax:configure");
 const [profiles, rules, payments] = await Promise.all([
 prisma.taxRegistration.findMany({ where: { companyId: ctx.companyId }, orderBy: { effectiveFrom: "desc" } }),
 prisma.taxCode.findMany({ where: { companyId: ctx.companyId }, orderBy: { effectiveFrom: "desc" } }),
 prisma.taxPayment.findMany({ where: { companyId: ctx.companyId }, orderBy: { paymentDate: "desc" } }),
 ]);
 return { profiles: profiles.map(p => ({ ...p, npwp: p.npwp ? `***${p.npwp.slice(-4)}` : null, nik: undefined, authorizationMetadata: undefined })), rules, payments };
}); }
export async function POST(req: Request) { return withApiHandler(async () => {
 const ctx = await requirePermission("tax:configure");
 const parsed = schema.safeParse(await req.json()); if (!parsed.success) throw validationError("Invalid tax setup", parsed.error.flatten());
 const body = parsed.data; await assertRequestAccess(ctx, body);
 if (body.action === "rule") { const { action: _action, ...rule } = body; void _action; return createTaxRuleVersion({ ...rule, companyId: ctx.companyId, effectiveFrom: new Date(body.effectiveFrom), effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined }); }
 if (body.action === "profile") return { id: (await saveTaxProfile({ ...body, companyId: ctx.companyId, actorId: ctx.user.id, effectiveFrom: new Date(body.effectiveFrom) })).id };
 await requirePermission("tax_document:approve");
 return recordTaxPayment({ ...body, companyId: ctx.companyId, actorId: ctx.user.id, paymentDate: new Date(body.paymentDate) });
}); }
