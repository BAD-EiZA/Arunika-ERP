import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { newIdempotencyKey } from "@/lib/idempotency";
import {
  lineTotal,
  money,
  qty,
  sumMoney,
  toPrismaDecimal,
  toPrismaMoney,
} from "@/lib/money";
import { postFromRule } from "@/server/services/accounting";
import { postStockMovement } from "@/server/services/inventory";
import { notifyUser } from "@/server/services/notifications";

type LineInput = {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  description?: string;
};

function calcHeader(items: ReturnType<typeof mapItems>) {
  const subtotal = sumMoney(items.map((i) => qty(i.quantity).mul(money(i.unitPrice))));
  const discountAmount = sumMoney(items.map((i) => i.discountAmount));
  const taxAmount = sumMoney(items.map((i) => i.taxAmount));
  const total = subtotal.minus(discountAmount).plus(taxAmount);
  return {
    subtotal: toPrismaMoney(subtotal),
    discountAmount: toPrismaMoney(discountAmount),
    taxAmount: toPrismaMoney(taxAmount),
    total: toPrismaMoney(total),
  };
}

function mapItems(items: LineInput[]) {
  if (!items.length) throw validationError("Minimal 1 item");
  return items.map((item) => {
    const quantity = qty(item.quantity);
    const unitPrice = money(item.unitPrice);
    const discountAmount = money(item.discountAmount ?? 0);
    const taxAmount = money(item.taxAmount ?? 0);
    if (quantity.lte(0)) throw validationError("Kuantitas harus > 0");
    return {
      productId: item.productId,
      description: item.description,
      quantity: toPrismaDecimal(quantity),
      unitPrice: toPrismaMoney(unitPrice),
      discountAmount: toPrismaMoney(discountAmount),
      taxAmount: toPrismaMoney(taxAmount),
      total: toPrismaMoney(lineTotal(quantity, unitPrice, discountAmount, taxAmount)),
    };
  });
}

export async function createPurchaseOrder(input: {
  companyId: string;
  userId: string;
  supplierId: string;
  branchId?: string;
  warehouseId?: string;
  notes?: string;
  items: LineInput[];
}) {
  const items = mapItems(input.items);
  const header = calcHeader(items);

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "PO", input.branchId);
    const po = await tx.purchaseOrder.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        number,
        status: "DRAFT",
        notes: input.notes,
        createdById: input.userId,
        ...header,
        items: { create: items },
      },
      include: { items: true, supplier: true },
    });
    await writeAudit({
      companyId: input.companyId,
      userId: input.userId,
      action: "purchase_order.create",
      entityType: "PurchaseOrder",
      entityId: po.id,
      entityNumber: po.number,
    });
    return po;
  });
}

export async function submitPurchaseOrder(companyId: string, userId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
  if (!po) throw notFound("PO tidak ditemukan");
  if (po.status !== "DRAFT") throw conflict("PO tidak dalam status draft");
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: "PENDING_APPROVAL" },
  });
}

export async function approvePurchaseOrder(companyId: string, userId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
  if (!po) throw notFound("PO tidak ditemukan");
  if (!["DRAFT", "PENDING_APPROVAL"].includes(po.status)) {
    throw conflict("PO tidak dapat disetujui");
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
  await writeAudit({
    companyId,
    userId,
    action: "purchase_order.approve",
    entityType: "PurchaseOrder",
    entityId: id,
    entityNumber: po.number,
  });

  await notifyUser({
    companyId,
    userId,
    type: "PURCHASE_ORDER",
    title: `PO ${po.number} disetujui`,
    message: `Purchase Order ${po.number} status APPROVED.`,
    entityType: "PurchaseOrder",
    entityId: id,
  });

  return updated;
}

export async function postGoodsReceipt(input: {
  companyId: string;
  userId: string;
  purchaseOrderId: string;
  warehouseId: string;
  supplierDeliveryNote?: string;
  notes?: string;
  items: Array<{ productId: string; quantityReceived: number | string; unitCost?: number | string }>;
  idempotencyKey?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const key = input.idempotencyKey ?? newIdempotencyKey("gr");
    const existing = await tx.goodsReceipt.findUnique({
      where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: key } },
    });
    if (existing) return existing;

    const po = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, companyId: input.companyId },
      include: { items: true, company: true },
    });
    if (!po) throw notFound("PO tidak ditemukan");
    if (!["APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw conflict("PO belum siap diterima");
    }

    if (!input.items.length) throw validationError("Minimal 1 item diterima");
    const number = await nextDocumentNumber(tx, input.companyId, "GR");
    const grItems = input.items.map((item) => {
      const poItem = po.items.find((i) => i.productId === item.productId);
      if (!poItem) throw validationError("Produk tidak ada di PO");
      const received = qty(item.quantityReceived);
      if (received.lte(0)) throw validationError("Qty diterima harus > 0");
      const remaining = qty(poItem.quantity).minus(qty(poItem.quantityReceived));
      if (received.gt(remaining)) {
        throw conflict(`Penerimaan melebihi sisa PO untuk produk`);
      }
      return {
        productId: item.productId,
        quantityOrdered: poItem.quantity,
        quantityReceived: toPrismaDecimal(received),
        unitCost: toPrismaMoney(money(item.unitCost ?? poItem.unitPrice)),
      };
    });

    const gr = await tx.goodsReceipt.create({
      data: {
        companyId: input.companyId,
        purchaseOrderId: po.id,
        warehouseId: input.warehouseId,
        supplierId: po.supplierId,
        number,
        status: "POSTED",
        supplierDeliveryNote: input.supplierDeliveryNote,
        notes: input.notes,
        postedAt: new Date(),
        createdById: input.userId,
        idempotencyKey: key,
        items: { create: grItems },
      },
      include: { items: true },
    });

    for (const item of gr.items) {
      await postStockMovement(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        type: "PURCHASE_RECEIPT",
        quantity: item.quantityReceived.toString(),
        unitCost: item.unitCost.toString(),
        referenceType: "GoodsReceipt",
        referenceId: gr.id,
        referenceNumber: gr.number,
        createdById: input.userId,
        idempotencyKey: `${key}:${item.productId}`,
        allowNegative: po.company.allowNegativeStock,
      });

      const poItem = po.items.find((i) => i.productId === item.productId)!;
      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: {
          quantityReceived: toPrismaDecimal(
            qty(poItem.quantityReceived).plus(qty(item.quantityReceived)),
          ),
        },
      });
    }

    const refreshed = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: po.id },
    });
    const allReceived = refreshed.every((i) =>
      qty(i.quantityReceived).gte(qty(i.quantity)),
    );
    const anyReceived = refreshed.some((i) => qty(i.quantityReceived).gt(0));
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status,
      },
    });

    const amount = sumMoney(gr.items.map((i) => qty(i.quantityReceived).mul(money(i.unitCost))));
    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "goods_receipt.post",
      sourceDocType: "GoodsReceipt",
      sourceDocId: gr.id,
      description: `GR ${gr.number}`,
      amount: amount.toString(),
      idempotencyKey: `je:${key}`,
      postedById: input.userId,
    });

    await writeAudit({
      companyId: input.companyId,
      userId: input.userId,
      action: "goods_receipt.post",
      entityType: "GoodsReceipt",
      entityId: gr.id,
      entityNumber: gr.number,
    });

    return gr;
  }, { maxWait: 15000, timeout: 60000 });
}

export async function createSupplierBill(input: {
  companyId: string;
  userId: string;
  supplierId: string;
  purchaseOrderId?: string;
  supplierInvoiceNo?: string;
  dueDate?: Date;
  items: Array<{
    productId?: string;
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    taxAmount?: number | string;
  }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item");
  const lines = input.items.map((i) => {
    const total = lineTotal(i.quantity, i.unitPrice, 0, i.taxAmount ?? 0);
    return {
      productId: i.productId,
      description: i.description,
      quantity: toPrismaDecimal(qty(i.quantity)),
      unitPrice: toPrismaMoney(money(i.unitPrice)),
      taxAmount: toPrismaMoney(money(i.taxAmount ?? 0)),
      total: toPrismaMoney(total),
    };
  });
  const subtotal = sumMoney(lines.map((l) => qty(l.quantity).mul(money(l.unitPrice))));
  const taxAmount = sumMoney(lines.map((l) => l.taxAmount));
  const total = subtotal.plus(taxAmount);

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "SB");
    const bill = await tx.supplierBill.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId,
        number,
        supplierInvoiceNo: input.supplierInvoiceNo,
        status: "OPEN",
        dueDate: input.dueDate,
        subtotal: toPrismaMoney(subtotal),
        taxAmount: toPrismaMoney(taxAmount),
        total: toPrismaMoney(total),
        balance: toPrismaMoney(total),
        items: { create: lines },
      },
      include: { items: true },
    });

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "supplier_bill.open",
      sourceDocType: "SupplierBill",
      sourceDocId: bill.id,
      description: `Bill ${bill.number}`,
      amount: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      idempotencyKey: `je:sb:${bill.id}`,
      postedById: input.userId,
    });

    return bill;
  });
}

export async function postSupplierPayment(input: {
  companyId: string;
  userId: string;
  supplierId: string;
  amount: number | string;
  method?: string;
  reference?: string;
  allocations: Array<{ billId: string; amount: number | string }>;
}) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw validationError("Jumlah pembayaran harus > 0");
  const allocTotal = sumMoney(input.allocations.map((a) => a.amount));
  if (!allocTotal.equals(amount)) {
    throw validationError("Total alokasi harus sama dengan jumlah pembayaran");
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "SP");
    const payment = await tx.supplierPayment.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        number,
        status: "POSTED",
        method: input.method ?? "BANK_TRANSFER",
        amount: toPrismaMoney(amount),
        reference: input.reference,
        postedAt: new Date(),
        createdById: input.userId,
        allocations: {
          create: input.allocations.map((a) => ({
            billId: a.billId,
            amount: toPrismaMoney(money(a.amount)),
          })),
        },
      },
    });

    for (const a of input.allocations) {
      const bill = await tx.supplierBill.findFirst({
        where: { id: a.billId, companyId: input.companyId },
      });
      if (!bill) throw notFound("Tagihan tidak ditemukan");
      const pay = money(a.amount);
      if (pay.gt(money(bill.balance))) throw conflict("Alokasi melebihi saldo tagihan");
      const amountPaid = money(bill.amountPaid).plus(pay);
      const balance = money(bill.total).minus(amountPaid);
      await tx.supplierBill.update({
        where: { id: bill.id },
        data: {
          amountPaid: toPrismaMoney(amountPaid),
          balance: toPrismaMoney(balance),
          status: balance.lte(0) ? "PAID" : "PARTIALLY_PAID",
        },
      });
    }

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "supplier_payment.post",
      sourceDocType: "SupplierPayment",
      sourceDocId: payment.id,
      description: `SP ${payment.number}`,
      amount: amount.toString(),
      idempotencyKey: `je:sp:${payment.id}`,
      postedById: input.userId,
    });

    return payment;
  });
}

// Advanced procurement
export async function createPurchaseRequest(input: {
  companyId: string;
  userId: string;
  branchId?: string;
  notes?: string;
  items: Array<{ productId: string; quantity: number | string; notes?: string }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item");
  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "PR", input.branchId);
    return tx.purchaseRequest.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId,
        number,
        status: "DRAFT",
        notes: input.notes,
        requestedById: input.userId,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            quantity: toPrismaDecimal(qty(i.quantity)),
            notes: i.notes,
          })),
        },
      },
      include: { items: true },
    });
  });
}

export async function approvePurchaseRequest(
  companyId: string,
  userId: string,
  id: string,
) {
  const pr = await prisma.purchaseRequest.findFirst({ where: { id, companyId } });
  if (!pr) throw notFound("PR tidak ditemukan");
  return prisma.purchaseRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
}

export async function createRfq(input: {
  companyId: string;
  purchaseRequestId?: string;
  supplierIds: string[];
  notes?: string;
  dueDate?: Date;
}) {
  if (!input.supplierIds.length) throw validationError("Pilih minimal 1 pemasok");
  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "RFQ");
    return tx.requestForQuotation.create({
      data: {
        companyId: input.companyId,
        purchaseRequestId: input.purchaseRequestId,
        number,
        status: "SENT",
        notes: input.notes,
        dueDate: input.dueDate,
        vendors: {
          create: input.supplierIds.map((supplierId) => ({ supplierId })),
        },
      },
      include: { vendors: true },
    });
  });
}

export async function submitVendorQuotation(input: {
  companyId: string;
  rfqId: string;
  supplierId: string;
  items: Array<{
    productId?: string;
    description: string;
    quantity: number | string;
    unitPrice: number | string;
  }>;
}) {
  const lines = input.items.map((i) => {
    const total = qty(i.quantity).mul(money(i.unitPrice));
    return {
      productId: i.productId,
      description: i.description,
      quantity: toPrismaDecimal(qty(i.quantity)),
      unitPrice: toPrismaMoney(money(i.unitPrice)),
      total: toPrismaMoney(total),
    };
  });
  const subtotal = sumMoney(lines.map((l) => l.total));
  return prisma.vendorQuotation.create({
    data: {
      companyId: input.companyId,
      rfqId: input.rfqId,
      supplierId: input.supplierId,
      status: "SENT",
      subtotal: toPrismaMoney(subtotal),
      total: toPrismaMoney(subtotal),
      items: { create: lines },
    },
    include: { items: true },
  });
}

export async function awardRfq(input: {
  companyId: string;
  userId: string;
  rfqId: string;
  quotationId: string;
  warehouseId?: string;
  branchId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.vendorQuotation.findFirst({
      where: { id: input.quotationId, companyId: input.companyId, rfqId: input.rfqId },
      include: { items: true },
    });
    if (!quotation) throw notFound("Quotation tidak ditemukan");

    await tx.vendorQuotation.updateMany({
      where: { rfqId: input.rfqId },
      data: { isAwarded: false },
    });
    await tx.vendorQuotation.update({
      where: { id: quotation.id },
      data: { isAwarded: true },
    });
    await tx.requestForQuotation.update({
      where: { id: input.rfqId },
      data: { status: "CLOSED", awardedAt: new Date() },
    });

    const productItems = quotation.items.filter((i) => i.productId);
    if (!productItems.length) {
      return { quotation, purchaseOrder: null };
    }

    const number = await nextDocumentNumber(tx, input.companyId, "PO", input.branchId);
    const items = productItems.map((i) => ({
      productId: i.productId!,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: "0",
      taxAmount: "0",
      total: i.total,
    }));
    const header = {
      subtotal: quotation.subtotal,
      discountAmount: "0",
      taxAmount: quotation.taxAmount,
      total: quotation.total,
    };
    const po = await tx.purchaseOrder.create({
      data: {
        companyId: input.companyId,
        supplierId: quotation.supplierId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        number,
        status: "APPROVED",
        approvedById: input.userId,
        approvedAt: new Date(),
        createdById: input.userId,
        notes: `Dari RFQ award ${input.rfqId}`,
        ...header,
        items: { create: items },
      },
      include: { items: true },
    });
    return { quotation, purchaseOrder: po };
  });
}

export async function reviewThreeWayMatch(input: {
  companyId: string;
  userId: string;
  goodsReceiptId: string;
  supplierBillId: string;
}) {
  const gr = await prisma.goodsReceipt.findFirst({
    where: { id: input.goodsReceiptId, companyId: input.companyId },
    include: { items: true, purchaseOrder: { include: { items: true } } },
  });
  const bill = await prisma.supplierBill.findFirst({
    where: { id: input.supplierBillId, companyId: input.companyId },
    include: { items: true },
  });
  if (!gr || !bill) throw notFound("Dokumen match tidak lengkap");

  const grQty = sumMoney(gr.items.map((i) => i.quantityReceived));
  const billQty = sumMoney(bill.items.map((i) => i.quantity));
  const grValue = sumMoney(
    gr.items.map((i) => qty(i.quantityReceived).mul(money(i.unitCost))),
  );
  const billValue = money(bill.subtotal);
  const qtyVariance = billQty.minus(grQty);
  const priceVariance = billValue.minus(grValue);
  const isMatched = qtyVariance.abs().lte(0.0001) && priceVariance.abs().lte(1);

  return prisma.threeWayMatch.create({
    data: {
      companyId: input.companyId,
      purchaseOrderId: gr.purchaseOrderId,
      goodsReceiptId: gr.id,
      supplierBillId: bill.id,
      status: isMatched ? "APPROVED" : "REVIEW",
      qtyVariance: toPrismaDecimal(qtyVariance),
      priceVariance: toPrismaMoney(priceVariance),
      isMatched,
      reviewedById: input.userId,
      reviewedAt: new Date(),
    },
  });
}
