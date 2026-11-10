import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { createTaxRuleVersion, saveTaxProfile } from "@/server/services/tax";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("tax:view");
    const [codes, registration] = await Promise.all([
      prisma.taxCode.findMany({
        where: { companyId: ctx.companyId },
        orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
      }),
      prisma.taxRegistration.findFirst({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        taxType: c.taxType,
        direction: c.direction,
        rate: c.rate.toString(),
        glAccountCode: c.glAccountCode,
        isActive: c.isActive,
        effectiveFrom: c.effectiveFrom.toISOString(),
      })),
      registration: registration
        ? {
            id: registration.id,
            npwp: registration.npwp ? `***${registration.npwp.slice(-4)}` : null,
            isPkp: registration.isPkp,
            pkpDate: registration.pkpDate?.toISOString() ?? null,
            taxOffice: registration.taxOffice,
          }
        : null,
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("tax:configure");
    const body = (await req.json()) as {
      action?: "create_code" | "registration";
      code?: string;
      name?: string;
      taxType?: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER";
      direction?: string;
      rate?: string | number;
      glAccountCode?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
      legalReference?: string;
      npwp?: string;
      isPkp?: boolean;
      pkpDate?: string;
      taxOffice?: string;
    };
    await assertRequestAccess(ctx, body);

    if (body.action === "registration") {
      const reg = await saveTaxProfile({
        companyId: ctx.companyId, actorId: ctx.user.id,
        npwp: String(body.npwp ?? ""),
        isPkp: body.isPkp,
        effectiveFrom: new Date(body.effectiveFrom ?? ""),
        taxOffice: body.taxOffice,
      });
      return { registration: { id: reg.id, npwp: reg.npwp, isPkp: reg.isPkp } };
    }

    const dir = body.direction === "INPUT" || body.direction === "WITHHOLDING" ? body.direction : "OUTPUT";
    const code = await createTaxRuleVersion({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      taxType: body.taxType || "PPN",
      direction: dir,
      rate: String(body.rate ?? ""),
      effectiveFrom: new Date(body.effectiveFrom ?? ""),
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined,
      legalReference: String(body.legalReference ?? ""),
      glAccountCode: body.glAccountCode,
    });
    return { code: { id: code.id, code: code.code } };
  });
}
