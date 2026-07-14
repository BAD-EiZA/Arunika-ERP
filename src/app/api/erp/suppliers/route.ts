import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { pageMeta, parsePageParams } from "@/lib/pagination";
import { createSupplier } from "@/server/services/master-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePageParams(searchParams);
    const where = { companyId: ctx.companyId };

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const meta = pageMeta(total, page, limit);

    return {
      suppliers: suppliers.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        email: s.email,
        phone: s.phone,
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
    const ctx = await requirePermission("supplier:create");
    const body = (await req.json()) as {
      code?: string;
      name?: string;
      email?: string;
      phone?: string;
    };
    const supplier = await createSupplier({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      email: body.email || undefined,
      phone: body.phone || undefined,
    });
    return { supplier };
  });
}
