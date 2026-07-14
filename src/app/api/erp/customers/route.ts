import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { pageMeta, parsePageParams } from "@/lib/pagination";
import { createCustomer } from "@/server/services/master-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePageParams(searchParams);
    const where = { companyId: ctx.companyId };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const meta = pageMeta(total, page, limit);

    return {
      customers: customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        email: c.email,
        phone: c.phone,
        paymentTermDays: c.paymentTermDays,
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
    const ctx = await requirePermission("customer:create");
    const body = (await req.json()) as {
      code?: string;
      name?: string;
      email?: string;
      phone?: string;
    };
    const customer = await createCustomer({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      email: body.email || undefined,
      phone: body.phone || undefined,
    });
    return { customer };
  });
}
