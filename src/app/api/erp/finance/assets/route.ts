import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createFixedAsset,
  runStraightLineDepreciation,
} from "@/server/services/treasury";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const assets = await prisma.fixedAsset.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { createdAt: "desc" },
    });
    return {
      assets: assets.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        acquisitionCost: a.acquisitionCost.toString(),
        accumulatedDep: a.accumulatedDep.toString(),
        bookValue: a.bookValue.toString(),
        acquisitionDate: a.acquisitionDate.toISOString(),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "depreciate";
      id?: string;
      code?: string;
      name?: string;
      category?: string;
      acquisitionDate?: string;
      acquisitionCost?: string | number;
      residualValue?: string | number;
      usefulLifeMonths?: number;
    };
    const ctx = await requirePermission("fixed_asset:manage");
    if (body.action === "depreciate") {
      const asset = await runStraightLineDepreciation(
        ctx.companyId,
        String(body.id ?? ""),
      );
      return {
        asset: {
          id: asset.id,
          bookValue: asset.bookValue.toString(),
          accumulatedDep: asset.accumulatedDep.toString(),
        },
      };
    }
    const asset = await createFixedAsset({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      category: body.category || undefined,
      acquisitionDate: new Date(body.acquisitionDate || Date.now()),
      acquisitionCost: body.acquisitionCost ?? 0,
      residualValue: body.residualValue ?? 0,
      usefulLifeMonths: Number(body.usefulLifeMonths || 36),
    });
    return { asset: { id: asset.id, code: asset.code } };
  });
}
