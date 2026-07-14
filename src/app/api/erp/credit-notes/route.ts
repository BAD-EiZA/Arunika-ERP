import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createCreditNoteFromReturn,
  createCreditNoteManual,
  createDebitNoteFromPurchaseReturn,
} from "@/server/services/credit-notes";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [creditNotes, debitNotes, salesReturns, purchaseReturns, customers] =
      await Promise.all([
        prisma.creditNote.findMany({
          where: { companyId: ctx.companyId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.debitNote.findMany({
          where: { companyId: ctx.companyId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.salesReturn.findMany({
          where: { companyId: ctx.companyId, status: "POSTED" },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.purchaseReturn.findMany({
          where: { companyId: ctx.companyId, status: "POSTED" },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.customer.findMany({
          where: { companyId: ctx.companyId, isActive: true },
        }),
      ]);

    return {
      creditNotes: creditNotes.map((n) => ({
        id: n.id,
        number: n.number,
        status: n.status,
        total: n.total.toString(),
        reason: n.reason,
      })),
      debitNotes: debitNotes.map((n) => ({
        id: n.id,
        number: n.number,
        status: n.status,
        total: n.total.toString(),
        reason: n.reason,
      })),
      salesReturns: salesReturns.map((r) => ({
        id: r.id,
        number: r.number,
        total: r.total.toString(),
      })),
      purchaseReturns: purchaseReturns.map((r) => ({
        id: r.id,
        number: r.number,
        total: r.total.toString(),
      })),
      customers: customers.map((c) => ({ id: c.id, name: c.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "from_sales_return" | "manual" | "from_purchase_return";
      salesReturnId?: string;
      purchaseReturnId?: string;
      customerId?: string;
      reason?: string;
      taxAmount?: string | number;
      items?: Array<{
        productId?: string;
        description: string;
        quantity: string | number;
        unitPrice: string | number;
      }>;
    };

    if (body.action === "from_purchase_return") {
      const ctx = await requirePermission("debit_note:create");
      const note = await createDebitNoteFromPurchaseReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        purchaseReturnId: String(body.purchaseReturnId ?? ""),
        reason: body.reason,
      });
      return { debitNote: { id: note.id, number: note.number } };
    }

    if (body.action === "manual") {
      const ctx = await requirePermission("credit_note:create");
      const note = await createCreditNoteManual({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        customerId: String(body.customerId ?? ""),
        reason: body.reason,
        taxAmount: body.taxAmount,
        items: body.items ?? [],
      });
      return { creditNote: { id: note.id, number: note.number } };
    }

    const ctx = await requirePermission("credit_note:create");
    const note = await createCreditNoteFromReturn({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      salesReturnId: String(body.salesReturnId ?? ""),
      reason: body.reason,
    });
    return { creditNote: { id: note.id, number: note.number } };
  });
}
