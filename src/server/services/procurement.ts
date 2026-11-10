import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { newIdempotencyKey } from "@/lib/idempotency";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
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
  if (new Set(items.map((i) => i.productId)).size !== items.length) throw validationError("Produk duplikat");
  return items.map((item) => {
    const quantity = qty(item.quantity);
    const unitPrice = money(item.unitPrice);
    if (!quantity.isFinite() || !unitPrice.isFinite() || unitPrice.lt(0)) throw validationError("Harga/kuantitas tidak valid");
    const discountAmount = money(item.discountAmount ?? 0);
    const taxAmount = money(item.taxAmount ?? 0);
    if (quantity.lte(0) || discountAmount.lt(0) || taxAmount.lt(0) || discountAmount.gt(quantity.mul(unitPrice))) throw validationError("Kuantitas harus > 0");
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

export async function createPurchaseContract(input: {
  companyId: string; userId: string; supplierId: string; effectiveFrom: Date; effectiveTo: Date;
  ceilingAmount: string | number; items: Array<{ productId: string; quantity: string | number; ceilingAmount: string | number; unitPrice: string | number }>;
}) {
  if (!Number.isFinite(input.effectiveFrom.getTime()) || !Number.isFinite(input.effectiveTo.getTime()) || input.effectiveFrom >= input.effectiveTo) throw validationError("Periode kontrak tidak valid");
  if (!input.items.length || new Set(input.items.map((i) => i.productId)).size !== input.items.length) throw validationError("Item kontrak tidak valid");
  const ceiling = money(input.ceilingAmount);
  if (!ceiling.isFinite() || ceiling.lte(0)) throw validationError("Plafon kontrak harus positif");
  const items = input.items.map((i) => {
    const quantity = qty(i.quantity), cap = money(i.ceilingAmount), price = money(i.unitPrice);
    if (!quantity.isFinite() || quantity.lte(0) || !cap.isFinite() || cap.lte(0) || !price.isFinite() || price.lt(0) || price.mul(quantity).gt(cap)) throw validationError("Plafon item tidak valid");
    return { productId: i.productId, quantity: toPrismaDecimal(quantity), ceilingAmount: toPrismaMoney(cap), unitPrice: toPrismaDecimal(price) };
  });
  if (sumMoney(items.map((i) => i.ceilingAmount)).gt(ceiling)) throw validationError("Total plafon item melebihi kontrak");
  return prisma.$transaction(async (tx) => tx.purchaseContract.create({ data: {
    companyId: input.companyId, supplierId: input.supplierId, number: await nextDocumentNumber(tx, input.companyId, "PC"),
    status: "DRAFT", startDate: input.effectiveFrom, endDate: input.effectiveTo,
    ceilingAmount: toPrismaMoney(ceiling), items: { create: items },
  }, include: { items: true } }));
}

export async function approvePurchaseContract(companyId: string, userId: string, id: string) {
  const result = await prisma.purchaseContract.updateMany({ where: { id, companyId, status: "PENDING_APPROVAL" }, data: { status: "APPROVED" } });
  if (!result.count) throw conflict("Kontrak belum menunggu persetujuan");
  return prisma.purchaseContract.findFirst({ where: { id, companyId }, include: { items: true } });
}

export async function amendPurchaseContract(input: { companyId: string; id: string; ceilingAmount: string | number; items: Array<{ productId: string; quantity: string | number; ceilingAmount: string | number }> }) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.purchaseContract.findFirst({ where: { id: input.id, companyId: input.companyId }, include: { items: true } });
    if (!contract) throw notFound("Kontrak tidak ditemukan");
    if (contract.status !== "APPROVED") throw conflict("Kontrak belum disetujui");
    const ceiling = money(input.ceilingAmount);
    if (!ceiling.isFinite() || ceiling.lt(money(contract.ceilingAmount ?? 0))) throw validationError("Amendment hanya boleh menaikkan plafon");
    if (input.items.length !== contract.items.length || new Set(input.items.map((i) => i.productId)).size !== contract.items.length) throw validationError("Item amendment tidak sesuai");
    for (const item of input.items) {
      const old = contract.items.find((i) => i.productId === item.productId);
      if (!old || !qty(item.quantity).isFinite() || qty(item.quantity).lt(qty(old.quantity ?? 0)) || !money(item.ceilingAmount).isFinite() || money(item.ceilingAmount).lt(money(old.ceilingAmount))) throw validationError("Amendment hanya boleh menaikkan plafon");
    }
    if (sumMoney(input.items.map((i) => i.ceilingAmount)).gt(ceiling)) throw validationError("Total plafon item melebihi kontrak");
    const updated = await tx.purchaseContract.updateMany({ where: { id: contract.id, version: contract.version, status: "APPROVED" }, data: { version: { increment: 1 }, status: "PENDING_APPROVAL", ceilingAmount: toPrismaMoney(ceiling) } });
    if (!updated.count) throw conflict("Kontrak berubah");
    for (const item of input.items) await tx.purchaseContractItem.update({ where: { id: contract.items.find((i) => i.productId === item.productId)!.id }, data: { quantity: toPrismaDecimal(qty(item.quantity)), ceilingAmount: toPrismaMoney(money(item.ceilingAmount)) } });
    return tx.purchaseContract.findFirst({ where: { id: contract.id }, include: { items: true } });
  }, { isolationLevel: "Serializable" });
}

export async function listPurchaseContracts(companyId: string) {
  return prisma.purchaseContract.findMany({ where: { companyId }, include: { items: true, orders: { select: { id: true, number: true, total: true, status: true } } }, orderBy: { createdAt: "desc" } });
}

export async function createPurchaseOrder(input: {
  companyId: string;
  userId: string;
  supplierId: string;
  branchId?: string;
  warehouseId?: string;
  notes?: string;
  contractId?: string;
  idempotencyKey?: string;
  items: LineInput[];
}) {
  const items = mapItems(input.items);
  const header = calcHeader(items);

  return prisma.$transaction(async (tx) => {
    if (input.contractId) {
      if (!input.idempotencyKey?.trim()) throw validationError("Idempotency key wajib untuk call-off");
      const hash = createHash("sha256").update(JSON.stringify({ supplierId: input.supplierId, contractId: input.contractId, items })).digest("hex");
      const existing = await tx.purchaseOrder.findFirst({ where: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } });
      if (existing) {
        if (existing.requestHash !== hash) throw conflict("Idempotensi: payload berbeda");
        return existing;
      }
      const contract = await tx.purchaseContract.findFirst({ where: { id: input.contractId, companyId: input.companyId }, include: { items: true } });
      if (!contract) throw notFound("Kontrak tidak ditemukan");
      const now = new Date();
      if (contract.status !== "APPROVED" || !contract.isActive || (contract.startDate && contract.startDate > now) || (contract.endDate && contract.endDate < now)) throw conflict("Kontrak tidak aktif/berlaku");
      if (contract.supplierId !== input.supplierId) throw conflict("Pemasok kontrak tidak sesuai");
      const amount = money(header.total);
      if (amount.lte(0) || !contract.ceilingAmount || money(contract.usedAmount).plus(amount).gt(money(contract.ceilingAmount ?? 0))) throw conflict("Plafon nilai kontrak terlampaui");
      const reserved = await tx.purchaseContract.updateMany({ where: { id: contract.id, version: contract.version, status: "APPROVED", usedAmount: contract.usedAmount }, data: { usedAmount: { increment: toPrismaMoney(amount) } } });
      if (!reserved.count) throw conflict("Kontrak berubah; ulangi call-off");
      for (const item of items) {
        const limit = contract.items.find((i) => i.productId === item.productId);
        if (!limit || !limit.quantity || qty(limit.usedQuantity).plus(qty(item.quantity)).gt(qty(limit.quantity)) || money(limit.usedAmount).plus(money(item.total)).gt(money(limit.ceilingAmount))) throw conflict("Plafon item kontrak terlampaui");
        const claimed = await tx.purchaseContractItem.updateMany({ where: { id: limit.id, usedQuantity: limit.usedQuantity, usedAmount: limit.usedAmount }, data: { usedQuantity: { increment: item.quantity }, usedAmount: { increment: item.total } } });
        if (!claimed.count) throw conflict("Kontrak berubah; ulangi call-off");
      }
    }
    const number = await nextDocumentNumber(tx, input.companyId, "PO", input.branchId);
    const po = await tx.purchaseOrder.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        contractId: input.contractId,
        idempotencyKey: input.contractId ? input.idempotencyKey : undefined,
        requestHash: input.contractId ? createHash("sha256").update(JSON.stringify({ supplierId: input.supplierId, contractId: input.contractId, items })).digest("hex") : undefined,
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
  }, { isolationLevel: "Serializable" });
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
    const requestHash = createHash("sha256").update(JSON.stringify({ purchaseOrderId: input.purchaseOrderId, warehouseId: input.warehouseId, notes: input.notes ?? null, supplierDeliveryNote: input.supplierDeliveryNote ?? null, items: input.items.map(i => ({ productId: i.productId, quantityReceived: qty(i.quantityReceived).toString(), unitCost: i.unitCost == null ? null : money(i.unitCost).toString() })) })).digest("hex");
    const existing = await tx.goodsReceipt.findUnique({
      where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict("Idempotensi: payload berbeda untuk key yang sama");
      return existing;
    }

    const po = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, companyId: input.companyId },
      include: { items: true, company: true },
    });
    if (!po) throw notFound("PO tidak ditemukan");
    if (!["APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw conflict("PO belum siap diterima");
    }

    if (!input.items.length) throw validationError("Minimal 1 item diterima");
    if (new Set(input.items.map((i) => i.productId)).size !== input.items.length || new Set(po.items.map((i) => i.productId)).size !== po.items.length) throw validationError("Produk duplikat");
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
        requestHash,
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
  }, { maxWait: 15000, timeout: 60000, isolationLevel: "Serializable" });
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
    if (!qty(i.quantity).isFinite() || qty(i.quantity).lte(0) || !money(i.unitPrice).isFinite() || money(i.unitPrice).lt(0)) throw validationError("Item tagihan tidak valid");
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
    const supplierInvoiceNo = input.supplierInvoiceNo?.trim() || undefined;
    if (supplierInvoiceNo && await tx.supplierBill.findFirst({ where: { companyId: input.companyId, supplierId: input.supplierId, supplierInvoiceNo } })) throw conflict("Nomor invoice pemasok sudah digunakan");
    if (input.purchaseOrderId) {
      const po = await tx.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, companyId: input.companyId } });
      if (!po || po.supplierId !== input.supplierId) throw conflict("Pemasok PO tidak sesuai");
      const receipts = await tx.goodsReceipt.findMany({ where: { purchaseOrderId: po.id, companyId: input.companyId } });
      if (receipts.some((gr) => gr.supplierId !== input.supplierId)) throw conflict("Pemasok GR tidak sesuai");
    }
    const number = await nextDocumentNumber(tx, input.companyId, "SB");
    const bill = await tx.supplierBill.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId,
        number,
        supplierInvoiceNo,
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
  }, { isolationLevel: "Serializable" });
}

export async function postSupplierPayment(input: {
  companyId: string;
  userId: string;
  supplierId: string;
  amount: number | string;
  method?: string;
  reference?: string;
  idempotencyKey?: string;
  allocations: Array<{ billId: string; amount: number | string }>;
}) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw validationError("Jumlah pembayaran harus > 0");
  if (!input.allocations.length) throw validationError("Minimal 1 alokasi");
  if (input.allocations.some((a) => money(a.amount).lte(0))) throw validationError("Alokasi harus > 0");
  if (new Set(input.allocations.map((a) => a.billId)).size !== input.allocations.length) throw validationError("Alokasi duplikat");
  const allocTotal = sumMoney(input.allocations.map((a) => a.amount));
  if (!allocTotal.equals(amount)) {
    throw validationError("Total alokasi harus sama dengan jumlah pembayaran");
  }

  const requestHash = input.idempotencyKey ? createHash("sha256").update(JSON.stringify({
    partnerId: input.supplierId, amount: amount.toFixed(2),
    method: input.method ?? "BANK_TRANSFER", reference: input.reference ?? null,
    allocations: input.allocations.map((a) => [a.billId, money(a.amount).toFixed(2)])
      .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  })).digest("hex") : undefined;

  return prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["sp", input.companyId, input.idempotencyKey])}, 0))::text`;
      const existing = await tx.supplierPayment.findUnique({
        where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) throw conflict("Idempotensi: payload berbeda untuk key yang sama");
        return existing;
      }
    }
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
        idempotencyKey: input.idempotencyKey || undefined,
        requestHash,
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
      if (bill.purchaseOrderId) {
        const match = await tx.threeWayMatch.findFirst({ where: { companyId: input.companyId, supplierBillId: bill.id }, orderBy: { createdAt: "desc" } });
        if (!match?.isMatched || match.status !== "APPROVED") throw conflict("Three-way match belum disetujui");
      }
      const pay = money(a.amount);
      if (bill.supplierId !== input.supplierId) throw conflict("Pemasok tagihan tidak sesuai");
      if (!["OPEN", "PARTIALLY_PAID", "OVERDUE"].includes(bill.status)) throw conflict("Tagihan tidak bisa dibayar");
      if (pay.gt(money(bill.balance))) throw conflict("Alokasi melebihi saldo tagihan");
      const amountPaid = money(bill.amountPaid).plus(pay);
      const balance = money(bill.balance).minus(pay);
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
  }, { isolationLevel: "ReadCommitted" });
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
    const rfq = await tx.requestForQuotation.findFirst({ where: { id: input.rfqId, companyId: input.companyId } });
    if (!rfq) throw notFound("RFQ tidak ditemukan");
    if (rfq.status === "CLOSED") throw conflict("RFQ sudah ditutup");

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
  }, { isolationLevel: "Serializable" });
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

  if (!gr.purchaseOrderId) throw validationError("GR tanpa PO tidak bisa match");
  if (bill.purchaseOrderId && bill.purchaseOrderId !== gr.purchaseOrderId) throw validationError("Bill dan GR dari PO berbeda");
  if (gr.supplierId !== bill.supplierId) throw validationError("Pemasok GR dan bill tidak sesuai");
  if (gr.status !== "POSTED") throw validationError("GR belum diposting");
  if (bill.status === "PAID" || bill.status === "VOID") throw validationError("Bill tidak bisa di-match");

  const grLines = new Set(gr.items.map((i) => i.productId).filter(Boolean));
  const unknown = bill.items.filter((i) => i.productId && !grLines.has(i.productId));
  if (unknown.length) throw validationError("Item bill tidak ada di GR");

  const qtyByProduct = new Map<string, Decimal>();
  for (const i of bill.items) {
    if (!i.productId) continue;
    qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) ?? new Decimal(0)).plus(qty(i.quantity)));
  }
  const grQtyMap = new Map<string, Decimal>();
  for (const i of gr.items) {
    grQtyMap.set(i.productId, (grQtyMap.get(i.productId) ?? new Decimal(0)).plus(qty(i.quantityReceived)));
  }
  const qtyVariance = [...qtyByProduct.entries()].reduce(
    (acc, [pid, q]) => acc.plus(q.minus(grQtyMap.get(pid) ?? new Decimal(0))), new Decimal(0),
  );
  const grValue = sumMoney(
    gr.items.map((i) => qty(i.quantityReceived).mul(money(i.unitCost))),
  );
  const billValue = money(bill.subtotal);
  const priceVariance = billValue.minus(grValue);
  const uniqueLines = (items: Array<{ productId: string | null }>) =>
    items.every((i) => !!i.productId) && new Set(items.map((i) => i.productId)).size === items.length;
  const isMatched = uniqueLines(bill.items) && uniqueLines(gr.items) &&
    bill.purchaseOrderId === gr.purchaseOrderId && gr.purchaseOrder?.supplierId === bill.supplierId &&
    bill.items.length === gr.items.length && bill.items.every((line) => {
      const received = gr.items.find((i) => i.productId === line.productId);
      const ordered = gr.purchaseOrder?.items.find((i) => i.productId === line.productId);
      return received && ordered && qty(line.quantity).gt(0) &&
        qty(line.quantity).equals(qty(received.quantityReceived)) &&
        qty(line.quantity).lte(qty(ordered.quantity)) &&
        money(line.unitPrice).equals(money(received.unitCost)) &&
        money(line.unitPrice).equals(money(ordered.unitPrice));
    }) && priceVariance.abs().lte(0.01);

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
