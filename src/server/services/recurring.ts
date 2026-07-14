import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, sumMoney, toPrismaMoney } from "@/lib/money";
import { postManualJournal } from "@/server/services/accounting";

type JeLine = {
  accountCode: string;
  debit?: string | number;
  credit?: string | number;
  description?: string;
  costCenterCode?: string;
  tag?: string;
};

type InvLine = {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  productId?: string;
};

function advanceDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  switch (frequency) {
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "YEARLY":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    case "QUARTERLY":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

export async function createRecurringJournal(input: {
  companyId: string;
  name: string;
  description?: string;
  frequency?: string;
  nextRunAt: Date;
  endDate?: Date;
  currency?: string;
  exchangeRate?: number | string;
  lines: JeLine[];
}) {
  if (!input.name.trim()) throw validationError("Nama wajib");
  if (!input.lines || input.lines.length < 2) {
    throw validationError("Minimal 2 baris jurnal");
  }
  return prisma.recurringJournal.create({
    data: {
      companyId: input.companyId,
      name: input.name.trim(),
      description: input.description,
      frequency: input.frequency || "MONTHLY",
      nextRunAt: input.nextRunAt,
      endDate: input.endDate,
      currency: input.currency || "IDR",
      exchangeRate: toPrismaMoney(money(input.exchangeRate ?? 1)),
      lines: input.lines as object[],
    },
  });
}

export async function createRecurringInvoice(input: {
  companyId: string;
  customerId: string;
  name: string;
  frequency?: string;
  nextRunAt: Date;
  endDate?: Date;
  paymentTermDays?: number;
  currency?: string;
  exchangeRate?: number | string;
  taxRate?: number | string;
  lines: InvLine[];
}) {
  if (!input.name.trim()) throw validationError("Nama wajib");
  if (!input.lines?.length) throw validationError("Minimal 1 baris");
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: input.companyId },
  });
  if (!customer) throw notFound("Pelanggan tidak ditemukan");
  return prisma.recurringInvoice.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      name: input.name.trim(),
      frequency: input.frequency || "MONTHLY",
      nextRunAt: input.nextRunAt,
      endDate: input.endDate,
      paymentTermDays: input.paymentTermDays ?? customer.paymentTermDays ?? 30,
      currency: input.currency || "IDR",
      exchangeRate: toPrismaMoney(money(input.exchangeRate ?? 1)),
      taxRate: toPrismaMoney(money(input.taxRate ?? 0)),
      lines: input.lines as object[],
    },
  });
}

export async function runDueRecurring(input: {
  companyId: string;
  userId: string;
  asOf?: Date;
}) {
  const asOf = input.asOf ?? new Date();
  const results: Array<{ type: string; id: string; created?: string }> = [];

  const journals = await prisma.recurringJournal.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
      nextRunAt: { lte: asOf },
      OR: [{ endDate: null }, { endDate: { gte: asOf } }],
    },
  });

  for (const r of journals) {
    const lines = r.lines as JeLine[];
    const journal = await postManualJournal({
      companyId: input.companyId,
      userId: input.userId,
      description: r.description || `Recurring: ${r.name}`,
      postingDate: r.nextRunAt,
      currency: r.currency,
      exchangeRate: r.exchangeRate.toString(),
      lines,
      status: "POSTED",
    });
    const next = advanceDate(r.nextRunAt, r.frequency);
    const deactivate = r.endDate && next > r.endDate;
    await prisma.recurringJournal.update({
      where: { id: r.id },
      data: {
        lastRunAt: asOf,
        nextRunAt: next,
        isActive: deactivate ? false : true,
      },
    });
    results.push({ type: "journal", id: r.id, created: journal.number });
  }

  const invoices = await prisma.recurringInvoice.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
      nextRunAt: { lte: asOf },
      OR: [{ endDate: null }, { endDate: { gte: asOf } }],
    },
  });

  for (const r of invoices) {
    const invLines = r.lines as InvLine[];
    const mapped = invLines.map((l) => {
      const quantity = qty(l.quantity);
      const unitPrice = money(l.unitPrice);
      const lineSub = quantity.mul(unitPrice);
      const taxAmount = lineSub.mul(money(r.taxRate)).div(100);
      return {
        productId: l.productId,
        description: l.description,
        quantity: quantity.toFixed(4),
        unitPrice: toPrismaMoney(unitPrice),
        taxAmount: toPrismaMoney(taxAmount),
        total: toPrismaMoney(lineSub.plus(taxAmount)),
      };
    });
    const subtotal = sumMoney(
      mapped.map((l) => qty(l.quantity).mul(money(l.unitPrice))),
    );
    const taxAmount = sumMoney(mapped.map((l) => l.taxAmount));
    const total = subtotal.plus(taxAmount);
    const number = await prisma.$transaction((tx) =>
      nextDocumentNumber(tx, input.companyId, "INV"),
    );
    const dueDate = new Date(r.nextRunAt);
    dueDate.setUTCDate(dueDate.getUTCDate() + r.paymentTermDays);

    const invoice = await prisma.salesInvoice.create({
      data: {
        companyId: input.companyId,
        customerId: r.customerId,
        number,
        status: "ISSUED",
        invoiceDate: r.nextRunAt,
        dueDate,
        paymentTermDays: r.paymentTermDays,
        currency: r.currency,
        exchangeRate: r.exchangeRate,
        subtotal: toPrismaMoney(subtotal),
        taxAmount: toPrismaMoney(taxAmount),
        total: toPrismaMoney(total),
        balance: toPrismaMoney(total),
        issuedAt: new Date(),
        notes: `Recurring: ${r.name}`,
        items: {
          create: mapped.map((l) => ({
            productId: l.productId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            total: l.total,
          })),
        },
      },
    });

    const next = advanceDate(r.nextRunAt, r.frequency);
    const deactivate = r.endDate && next > r.endDate;
    await prisma.recurringInvoice.update({
      where: { id: r.id },
      data: {
        lastRunAt: asOf,
        nextRunAt: next,
        isActive: deactivate ? false : true,
      },
    });
    results.push({ type: "invoice", id: r.id, created: invoice.number });
  }

  return results;
}

export async function setRecurringActive(
  companyId: string,
  kind: "journal" | "invoice",
  id: string,
  isActive: boolean,
) {
  if (kind === "journal") {
    const row = await prisma.recurringJournal.findFirst({
      where: { id, companyId },
    });
    if (!row) throw notFound("Recurring journal tidak ditemukan");
    return prisma.recurringJournal.update({
      where: { id },
      data: { isActive },
    });
  }
  const row = await prisma.recurringInvoice.findFirst({
    where: { id, companyId },
  });
  if (!row) throw notFound("Recurring invoice tidak ditemukan");
  if (!isActive && row.isActive === false) throw conflict("Sudah nonaktif");
  return prisma.recurringInvoice.update({
    where: { id },
    data: { isActive },
  });
}
