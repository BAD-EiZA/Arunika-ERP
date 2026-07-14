import { requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const codes = await prisma.taxCode.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
    });
    return {
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        taxType: c.taxType,
        direction: c.direction,
        rate: c.rate.toString(),
        effectiveFrom: c.effectiveFrom.toISOString(),
      })),
    };
  });
}
