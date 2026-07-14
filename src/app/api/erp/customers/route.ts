import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/server/services/master-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const customers = await prisma.customer.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { createdAt: "desc" },
    });
    return {
      customers: customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        email: c.email,
        phone: c.phone,
        paymentTermDays: c.paymentTermDays,
      })),
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
