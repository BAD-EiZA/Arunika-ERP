import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import {
  lineTotal,
  money,
  qty,
  sumMoney,
  toPrismaDecimal,
  toPrismaMoney,
} from "@/lib/money";
import { postFromRule } from "@/server/services/accounting";

export async function createCreditNoteFromReturn(input: {
  companyId: string;
  userId: string;
  salesReturnId: string;
  reason?: string;
}) {
  const salesReturn = await prisma.salesReturn.findFirst({
    where: { id: input.salesReturnId, companyId: input.companyId },
    include: { items: true },
  });
  if (!salesReturn) throw notFound("Sales return tidak ditemukan");
  if (salesReturn.status !== "POSTED") {
    throw conflict("Sales return harus POSTED dulu");
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "CN");
    const lines = salesReturn.items.map((i) => ({
      productId: i.productId,
      description: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    }));
    const note = await tx.creditNote.create({
      data: {
        companyId: input.companyId,
        number,
        customerId: salesReturn.customerId,
        salesReturnId: salesReturn.id,
        status: "ISSUED",
        reason: input.reason || salesReturn.reason,
        subtotal: salesReturn.subtotal,
        taxAmount: salesReturn.taxAmount,
        total: salesReturn.total,
        postedAt: new Date(),
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "credit_note.issue",
      sourceDocType: "CreditNote",
      sourceDocId: note.id,
      description: `CN ${note.number}`,
      amount: note.subtotal.toString(),
      taxAmount: note.taxAmount.toString(),
      idempotencyKey: `je:cn:${note.id}`,
      postedById: input.userId,
    });

    return note;
  });
}

export async function createCreditNoteManual(input: {
  companyId: string;
  userId: string;
  customerId: string;
  reason?: string;
  taxAmount?: string | number;
  items: Array<{
    productId?: string;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
  }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item");
  const lines = input.items.map((i) => ({
    productId: i.productId,
    description: i.description,
    quantity: toPrismaDecimal(qty(i.quantity)),
    unitPrice: toPrismaMoney(money(i.unitPrice)),
    total: toPrismaMoney(lineTotal(i.quantity, i.unitPrice)),
  }));
  const subtotal = sumMoney(lines.map((l) => l.total));
  const taxAmount = money(input.taxAmount ?? 0);
  const total = subtotal.plus(taxAmount);

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "CN");
    const note = await tx.creditNote.create({
      data: {
        companyId: input.companyId,
        number,
        customerId: input.customerId,
        status: "ISSUED",
        reason: input.reason,
        subtotal: toPrismaMoney(subtotal),
        taxAmount: toPrismaMoney(taxAmount),
        total: toPrismaMoney(total),
        postedAt: new Date(),
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "credit_note.issue",
      sourceDocType: "CreditNote",
      sourceDocId: note.id,
      description: `CN ${note.number}`,
      amount: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      idempotencyKey: `je:cn:${note.id}`,
      postedById: input.userId,
    });

    return note;
  });
}

export async function createDebitNoteFromPurchaseReturn(input: {
  companyId: string;
  userId: string;
  purchaseReturnId: string;
  reason?: string;
}) {
  const purchaseReturn = await prisma.purchaseReturn.findFirst({
    where: { id: input.purchaseReturnId, companyId: input.companyId },
    include: { items: true },
  });
  if (!purchaseReturn) throw notFound("Purchase return tidak ditemukan");
  if (purchaseReturn.status !== "POSTED") {
    throw conflict("Purchase return harus POSTED dulu");
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "DN");
    const lines = purchaseReturn.items.map((i) => ({
      productId: i.productId,
      description: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitCost,
      total: i.total,
    }));
    const note = await tx.debitNote.create({
      data: {
        companyId: input.companyId,
        number,
        supplierId: purchaseReturn.supplierId,
        purchaseReturnId: purchaseReturn.id,
        status: "ISSUED",
        reason: input.reason || purchaseReturn.reason,
        subtotal: purchaseReturn.subtotal,
        total: purchaseReturn.total,
        postedAt: new Date(),
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "debit_note.issue",
      sourceDocType: "DebitNote",
      sourceDocId: note.id,
      description: `DN ${note.number}`,
      amount: note.subtotal.toString(),
      idempotencyKey: `je:dn:${note.id}`,
      postedById: input.userId,
    });

    return note;
  });
}
