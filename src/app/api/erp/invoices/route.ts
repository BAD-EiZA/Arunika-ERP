import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { issueInvoiceFromDelivery } from "@/server/services/sales";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [invoices, deliveries] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: { companyId: ctx.companyId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.deliveryOrder.findMany({
        where: { companyId: ctx.companyId, status: "POSTED" },
        include: { customer: true, salesInvoices: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        total: inv.total.toString(),
        balance: inv.balance.toString(),
        dueDate: inv.dueDate?.toISOString() ?? null,
        customer: { id: inv.customer.id, name: inv.customer.name },
      })),
      openDeliveries: deliveries
        .filter((d) => d.salesInvoices.length === 0)
        .map((d) => ({
          id: d.id,
          number: d.number,
          customerName: d.customer.name,
        })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("invoice:issue");
    const body = (await req.json()) as {
      deliveryOrderId?: string;
      taxRate?: string | number;
    };
    const invoice = await issueInvoiceFromDelivery({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      deliveryOrderId: String(body.deliveryOrderId ?? ""),
      taxRate: body.taxRate ?? 11,
    });
    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        total: invoice.total.toString(),
        status: invoice.status,
      },
    };
  });
}
