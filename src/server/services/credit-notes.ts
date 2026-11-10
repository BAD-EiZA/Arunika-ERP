import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { lineTotal, money, qty, sumMoney, toPrismaDecimal, toPrismaMoney } from "@/lib/money";
import { postFromRule, postJournal } from "@/server/services/accounting";

/** Financial leg only: stock/COGS was already corrected once when the return was posted. */
export async function createCreditNoteFromReturn(input: { companyId: string; userId: string; salesReturnId: string; reason?: string }) {
  const salesReturn = await prisma.salesReturn.findFirst({
    where: { id: input.salesReturnId, companyId: input.companyId },
    include: { items: true },
  });
  if (!salesReturn) throw notFound("Sales return tidak ditemukan");
  if (salesReturn.status !== "POSTED") throw conflict("Sales return harus POSTED dulu");
  // Exclusive source settlement: a return already settled by refund or replacement must not also issue a CN.
  if (salesReturn.refundedAt) throw conflict("Refund sudah diposting untuk return ini");
  if (salesReturn.replacementDeliveryId || salesReturn.settlementStatus === "REPLACED") throw conflict("Replacement sudah ada untuk return ini");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`return:sales:${salesReturn.id}`}, 0))`;
    const current = await tx.salesReturn.findFirst({ where: { id: salesReturn.id, companyId: input.companyId } });
    const replacement = await tx.returnReplacement.findUnique({ where: { salesReturnId: salesReturn.id } });
    if (!current || current.status !== "POSTED" || current.refundedAt || current.replacementDeliveryId || current.settlementStatus === "REPLACED" || replacement) throw conflict("Return sudah diselesaikan via refund/replacement");
    const existing = await tx.creditNote.findUnique({ where: { companyId_salesReturnId: { companyId: input.companyId, salesReturnId: salesReturn.id } } });
    if (existing) return existing;
    const number = await nextDocumentNumber(tx, input.companyId, "CN");
    const lines = salesReturn.items.map((i) => ({
      productId: i.productId,
      sourceReturnItemId: i.id,
      description: `SR ${salesReturn.number}`,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    }));
    const note = await tx.creditNote.create({
      data: {
        companyId: input.companyId,
        number,
        customerId: salesReturn.customerId,
        salesInvoiceId: salesReturn.salesInvoiceId,
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

    // Never rewrite payment history: credit reduces only the open AR, excess remains customer credit.
    if (salesReturn.salesInvoiceId) {
      const invoice = await tx.salesInvoice.findUnique({ where: { id: salesReturn.salesInvoiceId } });
      if (!invoice || invoice.companyId !== input.companyId) throw conflict("Invoice sumber tidak ditemukan");
      const remaining = money(invoice.balance).minus(money(note.total));
      await tx.salesInvoice.update({ where: { id: invoice.id }, data: { balance: toPrismaMoney(remaining) } });
    }

    return note;
  }, { isolationLevel: "Serializable" });
}

export async function createCreditNoteManual(input: {
  companyId: string;
  userId: string;
  customerId: string;
  reason?: string;
  taxAmount?: string | number;
  items: Array<{ productId?: string; description: string; quantity: string | number; unitPrice: string | number }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item");
  const lines = input.items.map((i) => ({ productId: i.productId, description: i.description, quantity: toPrismaDecimal(qty(i.quantity)), unitPrice: toPrismaMoney(money(i.unitPrice)), total: toPrismaMoney(lineTotal(i.quantity, i.unitPrice)) }));
  const subtotal = sumMoney(lines.map((l) => l.total));
  const taxAmount = money(input.taxAmount ?? 0);
  const total = subtotal.plus(taxAmount);

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "CN");
    const note = await tx.creditNote.create({
      data: { companyId: input.companyId, number, customerId: input.customerId, status: "ISSUED", reason: input.reason, subtotal: toPrismaMoney(subtotal), taxAmount: toPrismaMoney(taxAmount), total: toPrismaMoney(total), postedAt: new Date(), createdById: input.userId, items: { create: lines } },
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
  }, { isolationLevel: "Serializable" });
}

/** Financial leg only: stock was already corrected once when the return was posted. */
export async function createDebitNoteFromPurchaseReturn(input: { companyId: string; userId: string; purchaseReturnId: string; reason?: string }) {
  const purchaseReturn = await prisma.purchaseReturn.findFirst({
    where: { id: input.purchaseReturnId, companyId: input.companyId },
    include: { items: true },
  });
  if (!purchaseReturn) throw notFound("Purchase return tidak ditemukan");
  if (purchaseReturn.status !== "POSTED") throw conflict("Purchase return harus POSTED dulu");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dn:${input.companyId}:${purchaseReturn.id}`}, 0))`;
    const existing = await tx.debitNote.findUnique({ where: { companyId_purchaseReturnId: { companyId: input.companyId, purchaseReturnId: purchaseReturn.id } } });
    if (existing) return existing;
    const number = await nextDocumentNumber(tx, input.companyId, "DN");
    const lines = purchaseReturn.items.map((i) => ({
      productId: i.productId,
      sourceReturnItemId: i.id,
      description: `PRN ${purchaseReturn.number}`,
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
        taxAmount: purchaseReturn.items.reduce((acc, i) => acc.plus(money(i.taxAmount ?? 0)), money(0)),
        total: purchaseReturn.total,
        postedAt: new Date(),
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });

    const stockCost = sumMoney(purchaseReturn.items.map(i => qty(i.quantity).mul(money(i.historicalUnitCost ?? 0)).toDecimalPlaces(2))).toDecimalPlaces(2);
    if (stockCost.lte(0) || purchaseReturn.items.some(i => !i.historicalUnitCost)) throw conflict("Biaya historis wajib");
    const variance = money(note.subtotal).minus(stockCost).toDecimalPlaces(2);
    await postJournal(tx, {
      companyId: input.companyId,
      sourceModule: "auto",
      sourceDocType: "DebitNote",
      sourceDocId: note.id,
      description: `DN ${note.number}`,
      idempotencyKey: `je:dn:${note.id}`,
      postedById: input.userId,
      lines: [
        { accountCode: "2100", debit: money(note.total).toDecimalPlaces(2).toString() },
        { accountCode: "2110", credit: stockCost.toString() },
        ...(money(note.taxAmount).gt(0) ? [{ accountCode: "1140", credit: money(note.taxAmount).toDecimalPlaces(2).toString() }] : []),
        ...(variance.gt(0) ? [{ accountCode: "5100", credit: variance.toString(), description: "Selisih harga pemasok" }] : []),
        ...(variance.lt(0) ? [{ accountCode: "5100", debit: variance.abs().toString(), description: "Selisih harga pemasok" }] : []),
      ],
    });

    // Preserve payment history; a negative balance records supplier credit.
    for (const item of purchaseReturn.items) {
      if (!item.sourceBillItemId) throw conflict("Bill sumber wajib");
      const source = await tx.supplierBillItem.findUnique({ where: { id: item.sourceBillItemId }, include: { bill: true } });
      if (!source || source.bill.companyId !== input.companyId || source.bill.supplierId !== purchaseReturn.supplierId) throw conflict("Bill sumber tidak ditemukan");
      await tx.supplierBill.update({ where: { id: source.bill.id }, data: { balance: { decrement: toPrismaMoney(money(item.total).plus(money(item.taxAmount))) } } });
    }

    return note;
  }, { isolationLevel: "Serializable" });
}
