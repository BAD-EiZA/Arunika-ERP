import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createRecurringInvoice,
  createRecurringJournal,
  runDueRecurring,
  setRecurringActive,
} from "@/server/services/recurring";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [journals, invoices, customers] = await Promise.all([
      prisma.recurringJournal.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { nextRunAt: "asc" },
      }),
      prisma.recurringInvoice.findMany({
        where: { companyId: ctx.companyId },
        include: { customer: true },
        orderBy: { nextRunAt: "asc" },
      }),
      prisma.customer.findMany({
        where: { companyId: ctx.companyId, isActive: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
    ]);
    return {
      journals: journals.map((j) => ({
        id: j.id,
        name: j.name,
        description: j.description,
        frequency: j.frequency,
        nextRunAt: j.nextRunAt.toISOString(),
        isActive: j.isActive,
        lastRunAt: j.lastRunAt?.toISOString() ?? null,
        currency: j.currency,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        name: i.name,
        customerName: i.customer.name,
        frequency: i.frequency,
        nextRunAt: i.nextRunAt.toISOString(),
        isActive: i.isActive,
        lastRunAt: i.lastRunAt?.toISOString() ?? null,
        currency: i.currency,
      })),
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?:
        | "create_journal"
        | "create_invoice"
        | "run"
        | "toggle";
      kind?: "journal" | "invoice";
      id?: string;
      isActive?: boolean;
      name?: string;
      description?: string;
      frequency?: string;
      nextRunAt?: string;
      endDate?: string;
      currency?: string;
      exchangeRate?: string | number;
      customerId?: string;
      paymentTermDays?: number;
      taxRate?: string | number;
      lines?: Array<Record<string, unknown>>;
    };

    if (body.action === "run") {
      const ctx = await requirePermission("journal:post");
      const results = await runDueRecurring({
        companyId: ctx.companyId,
        userId: ctx.user.id,
      });
      return { results };
    }

    if (body.action === "toggle") {
      const ctx = await requirePermission("journal:create");
      const row = await setRecurringActive(
        ctx.companyId,
        body.kind === "invoice" ? "invoice" : "journal",
        String(body.id ?? ""),
        body.isActive !== false,
      );
      return { id: row.id, isActive: row.isActive };
    }

    if (body.action === "create_invoice") {
      const ctx = await requirePermission("invoice:create");
      const row = await createRecurringInvoice({
        companyId: ctx.companyId,
        customerId: String(body.customerId ?? ""),
        name: String(body.name ?? ""),
        frequency: body.frequency,
        nextRunAt: new Date(body.nextRunAt || Date.now()),
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        paymentTermDays: body.paymentTermDays,
        currency: body.currency,
        exchangeRate: body.exchangeRate,
        taxRate: body.taxRate,
        lines: (body.lines || []) as Array<{
          description: string;
          quantity: number | string;
          unitPrice: number | string;
          productId?: string;
        }>,
      });
      return { invoice: { id: row.id, name: row.name } };
    }

    const ctx = await requirePermission("journal:create");
    const row = await createRecurringJournal({
      companyId: ctx.companyId,
      name: String(body.name ?? ""),
      description: body.description,
      frequency: body.frequency,
      nextRunAt: new Date(body.nextRunAt || Date.now()),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      currency: body.currency,
      exchangeRate: body.exchangeRate,
      lines: (body.lines || []) as Array<{
        accountCode: string;
        debit?: string | number;
        credit?: string | number;
        description?: string;
      }>,
    });
    return { journal: { id: row.id, name: row.name } };
  });
}
