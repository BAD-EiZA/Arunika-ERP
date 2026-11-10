import { assertRequestAccess, requireIdempotencyKey, assertResourceAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { postCustomerPayment } from "@/server/services/sales";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("payment:view");
    const [payments, openInvoices] = await Promise.all([
      prisma.customerPayment.findMany({
        where: { companyId: ctx.companyId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.salesInvoice.findMany({
        where: {
          companyId: ctx.companyId,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      payments: payments.map((p) => ({
        id: p.id,
        number: p.number,
        status: p.status,
        amount: p.amount.toString(),
        paymentDate: p.paymentDate.toISOString(),
        customer: { name: p.customer.name },
      })),
      openInvoices: openInvoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        balance: inv.balance.toString(),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const idempotencyKey = requireIdempotencyKey(req);
    const ctx = await requirePermission("payment:create");
    const body = (await req.json()) as {
      customerId?: string;
      invoiceId?: string;
      amount?: string | number;
      reference?: string;
      method?: string;
    };
    await assertRequestAccess(ctx, body);
    await assertResourceAccess(ctx, "customer", body.customerId);
    await assertResourceAccess(ctx, "salesInvoice", body.invoiceId);
    const payment = await postCustomerPayment({
      idempotencyKey,
      companyId: ctx.companyId,
      userId: ctx.user.id,
      customerId: String(body.customerId ?? ""),
      amount: body.amount ?? 0,
      method: body.method,
      reference: body.reference,
      allocations: [
        {
          invoiceId: String(body.invoiceId ?? ""),
          amount: body.amount ?? 0,
        },
      ],
    });
    return {
      payment: {
        id: payment.id,
        number: payment.number,
        status: payment.status,
      },
    };
  });
}
