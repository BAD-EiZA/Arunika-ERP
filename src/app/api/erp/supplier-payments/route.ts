import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { postSupplierPayment } from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [payments, openBills] = await Promise.all([
      prisma.supplierPayment.findMany({
        where: { companyId: ctx.companyId },
        include: { supplier: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.supplierBill.findMany({
        where: {
          companyId: ctx.companyId,
          status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
        },
        include: { supplier: true },
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
        supplier: { name: p.supplier.name },
      })),
      openBills: openBills.map((b) => ({
        id: b.id,
        number: b.number,
        supplierId: b.supplierId,
        supplierName: b.supplier.name,
        balance: b.balance.toString(),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("supplier_payment:create");
    const body = (await req.json()) as {
      supplierId?: string;
      billId?: string;
      amount?: string | number;
      reference?: string;
      method?: string;
    };
    const payment = await postSupplierPayment({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      supplierId: String(body.supplierId ?? ""),
      amount: body.amount ?? 0,
      method: body.method,
      reference: body.reference,
      allocations: [
        {
          billId: String(body.billId ?? ""),
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
