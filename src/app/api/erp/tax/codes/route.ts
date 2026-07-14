import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { createTaxCode } from "@/server/services/tax";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
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
            npwp: registration.npwp,
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
      npwp?: string;
      isPkp?: boolean;
      pkpDate?: string;
      taxOffice?: string;
    };

    if (body.action === "registration") {
      const { upsertTaxRegistration } = await import("@/server/services/tax");
      const reg = await upsertTaxRegistration({
        companyId: ctx.companyId,
        npwp: body.npwp,
        isPkp: body.isPkp,
        pkpDate: body.pkpDate ? new Date(body.pkpDate) : undefined,
        taxOffice: body.taxOffice,
      });
      return { registration: { id: reg.id, npwp: reg.npwp, isPkp: reg.isPkp } };
    }

    const dir = body.direction === "INPUT" || body.direction === "WITHHOLDING" ? body.direction : "OUTPUT";
    const code = await createTaxCode({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      taxType: body.taxType || "PPN",
      direction: dir,
      rate: body.rate ?? 11,
      glAccountCode: body.glAccountCode,
    });
    return { code: { id: code.id, code: code.code } };
  });
}
