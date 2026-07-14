import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createWarehouseBin,
  pickFromBin,
  putawayToBin,
} from "@/server/services/wms";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [bins, balances, warehouses, products] = await Promise.all([
      prisma.warehouseBin.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { code: "asc" },
      }),
      prisma.stockBinBalance.findMany({
        where: { companyId: ctx.companyId },
        include: { bin: true },
        take: 100,
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, isArchived: false, type: "STOCK" },
        take: 100,
      }),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    return {
      bins: bins.map((b) => ({
        id: b.id,
        warehouseId: b.warehouseId,
        code: b.code,
        name: b.name,
        aisle: b.aisle,
        rack: b.rack,
        level: b.level,
      })),
      balances: balances.map((b) => ({
        id: b.id,
        binCode: b.bin.code,
        productId: b.productId,
        sku: productMap.get(b.productId)?.sku ?? b.productId,
        quantity: b.quantity.toString(),
      })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "bin" | "putaway" | "pick";
      warehouseId?: string;
      binId?: string;
      productId?: string;
      quantity?: string | number;
      code?: string;
      name?: string;
      aisle?: string;
      rack?: string;
      level?: string;
    };

    if (body.action === "putaway") {
      const ctx = await requirePermission("stock:transfer");
      const bal = await putawayToBin({
        companyId: ctx.companyId,
        warehouseId: String(body.warehouseId ?? ""),
        binId: String(body.binId ?? ""),
        productId: String(body.productId ?? ""),
        quantity: body.quantity ?? 0,
      });
      return { balance: { id: bal.id, quantity: bal.quantity.toString() } };
    }

    if (body.action === "pick") {
      const ctx = await requirePermission("stock:transfer");
      const bal = await pickFromBin({
        companyId: ctx.companyId,
        binId: String(body.binId ?? ""),
        productId: String(body.productId ?? ""),
        quantity: body.quantity ?? 0,
      });
      return { balance: { id: bal.id, quantity: bal.quantity.toString() } };
    }

    const ctx = await requirePermission("warehouse:create");
    const bin = await createWarehouseBin({
      companyId: ctx.companyId,
      warehouseId: String(body.warehouseId ?? ""),
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      aisle: body.aisle,
      rack: body.rack,
      level: body.level,
    });
    return { bin: { id: bin.id, code: bin.code } };
  });
}
