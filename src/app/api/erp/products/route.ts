import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { pageMeta, parsePageParams } from "@/lib/pagination";
import { createCategory, createProduct } from "@/server/services/master-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePageParams(searchParams);

    const where = { companyId: ctx.companyId };
    const [total, products, units, categories] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { unit: true, category: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.unit.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.productCategory.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    const meta = pageMeta(total, page, limit);

    return {
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        type: p.type,
        isArchived: p.isArchived,
        purchasePrice: p.purchasePrice.toString(),
        salePrice: p.salePrice.toString(),
        unit: { symbol: p.unit.symbol },
        category: p.category ? { name: p.category.name } : null,
      })),
      units: units.map((u) => ({
        id: u.id,
        name: u.name,
        symbol: u.symbol,
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
      })),
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.totalPages,
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("product:create");
    const body = (await req.json()) as {
      action?: "product" | "category";
      sku?: string;
      name?: string;
      unitId?: string;
      categoryId?: string;
      purchasePrice?: string | number;
      salePrice?: string | number;
      minStock?: string | number;
      description?: string;
      code?: string;
    };

    if (body.action === "category") {
      const category = await createCategory({
        companyId: ctx.companyId,
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
      });
      return { type: "category" as const, category };
    }

    const product = await createProduct({
      companyId: ctx.companyId,
      sku: String(body.sku ?? ""),
      name: String(body.name ?? ""),
      unitId: String(body.unitId ?? ""),
      categoryId: body.categoryId || undefined,
      purchasePrice: body.purchasePrice ?? 0,
      salePrice: body.salePrice ?? 0,
      minStock: body.minStock ?? 0,
      description: body.description || undefined,
    });
    return { type: "product" as const, product };
  });
}
