import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createFixedAsset,
  disposeFixedAsset,
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
        residualValue: a.residualValue.toString(),
        usefulLifeMonths: a.usefulLifeMonths,
        isActive: a.isActive,
        disposedAt: a.disposedAt?.toISOString() ?? null,
        acquisitionDate: a.acquisitionDate.toISOString(),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "depreciate" | "dispose";
      id?: string;
      code?: string;
      name?: string;
      category?: string;
      acquisitionDate?: string;
      acquisitionCost?: string | number;
      residualValue?: string | number;
      usefulLifeMonths?: number;
      disposeAmount?: string | number;
    };
    const ctx = await requirePermission("fixed_asset:manage");
    if (body.action === "depreciate") {
      const asset = await runStraightLineDepreciation(
        ctx.companyId,
        String(body.id ?? ""),
        ctx.user.id,
      );
      return {
        asset: {
          id: asset.id,
          bookValue: asset.bookValue.toString(),
          accumulatedDep: asset.accumulatedDep.toString(),
        },
      };
    }
    if (body.action === "dispose") {
      const asset = await disposeFixedAsset({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        assetId: String(body.id ?? ""),
        disposeAmount: body.disposeAmount,
      });
      return {
        asset: {
          id: asset.id,
          disposedAt: asset.disposedAt?.toISOString() ?? null,
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
