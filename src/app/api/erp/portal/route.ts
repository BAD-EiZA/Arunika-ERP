import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createPortalToken,
  getCustomerPortalData,
  getSupplierPortalData,
  resolvePortalToken,
} from "@/server/services/portal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (token) {
      const row = await resolvePortalToken(token);
      if (row.portalType === "CUSTOMER") {
        return {
          portalType: "CUSTOMER",
          company: { name: row.company.name },
          data: await getCustomerPortalData(row.companyId, row.partnerId),
        };
      }
      return {
        portalType: "SUPPLIER",
        company: { name: row.company.name },
        data: await getSupplierPortalData(row.companyId, row.partnerId),
      };
    }

    const ctx = await requireTenant();
    const tokens = await prisma.portalToken.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      tokens: tokens.map((t) => ({
        id: t.id,
        portalType: t.portalType,
        partnerId: t.partnerId,
        partnerEmail: t.partnerEmail,
        token: t.token,
        expiresAt: t.expiresAt.toISOString(),
        isActive: t.isActive,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("settings:manage");
    const body = (await req.json()) as {
      portalType?: "CUSTOMER" | "SUPPLIER";
      partnerId?: string;
      partnerEmail?: string;
      daysValid?: number;
    };
    const token = await createPortalToken({
      companyId: ctx.companyId,
      portalType: body.portalType ?? "CUSTOMER",
      partnerId: String(body.partnerId ?? ""),
      partnerEmail: String(body.partnerEmail ?? ""),
      daysValid: body.daysValid,
    });
    return {
      token: {
        id: token.id,
        token: token.token,
        portalUrl: `/portal?token=${token.token}`,
        expiresAt: token.expiresAt.toISOString(),
      },
    };
  });
}
