import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, sumMoney, toPrismaDecimal, toPrismaMoney } from "@/lib/money";
import { postStockMovement, assertWarehouseOwnership } from "./inventory";
import { postJournal } from "./accounting";
import { assertApprovalRole } from "./approvals";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
type Line = { productId: string; quantity: string | number; sourceItemId?: string; sourceReceiptItemId?: string };
type Base = { companyId: string; userId: string; warehouseId?: string; reason?: string; idempotencyKey?: string; items: Line[] };
function validate(input: Base, source: "sourceItemId" | "sourceReceiptItemId") {
  if (!input.items.length) throw validationError("Minimal 1 item");
  if (new Set(input.items.map(i => i.productId)).size !== input.items.length) throw validationError("Produk duplikat");
  if (input.items.some(i => !qty(i.quantity).isFinite() || qty(i.quantity).lte(0) || qty(i.quantity).decimalPlaces() > 4)) throw validationError("Kuantitas harus > 0 dan maksimal 4 desimal");
  if (!input.warehouseId || !input.idempotencyKey?.trim() || input.items.some(i => !i[source])) throw validationError("Sumber item, gudang dan idempotencyKey wajib");
  if (new Set(input.items.map(i => i[source])).size !== input.items.length) throw validationError("Sumber item duplikat");
}
async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
function hash(input: unknown) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
function share(total: unknown, quantity: unknown, returned: unknown) {
  return money(total as string).mul(qty(returned as string)).div(qty(quantity as string)).toDecimalPlaces(2);
}

export async function createSalesReturn(input: Base & { customerId: string; salesInvoiceId?: string; items: (Line & { unitPrice?: string | number })[] }) {
  validate(input, "sourceItemId");
  if (!input.salesInvoiceId) throw validationError("Sales invoice wajib");
  return prisma.$transaction(async tx => {
    await lock(tx, `return:create:sales:${input.companyId}:${input.idempotencyKey}`);
    const requestHash = hash({ ...input, items: input.items.map(i => ({ productId: i.productId, quantity: toPrismaDecimal(qty(i.quantity)), sourceItemId: i.sourceItemId })) });
    const existing = await tx.salesReturn.findUnique({ where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: input.idempotencyKey! } }, include: { items: true } });
    if (existing) { if (existing.requestHash !== requestHash) throw conflict("Idempotency key digunakan untuk request berbeda"); return existing; }
    await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: input.warehouseId! });
    const invoice = await tx.salesInvoice.findFirst({ where: { id: input.salesInvoiceId, companyId: input.companyId, customerId: input.customerId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } }, include: { items: true, deliveryOrder: true } });
    if (!invoice || !invoice.deliveryOrder || invoice.deliveryOrder.status !== "POSTED") throw validationError("Invoice dan delivery posted dari pelanggan wajib");
    const origin = await tx.warehouse.findFirst({ where: { id: invoice.deliveryOrder.warehouseId, companyId: input.companyId } });
    if (!origin) throw validationError("Gudang sumber delivery tidak valid");
    const quarantine = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: input.companyId, isActive: true, type: { in: ["RETURN", "DAMAGED"] }, branchId: origin.branchId } });
    if (!quarantine) throw validationError("Gudang karantina satu cabang dengan delivery wajib");
    const lines = [];
    for (const item of input.items) {
      const source = invoice.items.find(i => i.id === item.sourceItemId && i.productId === item.productId);
      if (!source) throw validationError("Item bukan milik invoice");
      await lock(tx, `return:sales:${source.id}`);
      const prior = await tx.salesReturnItem.findMany({ where: { sourceItemId: source.id, salesReturn: { companyId: input.companyId, status: { notIn: ["CANCELLED", "VOID", "REJECTED"] } } } });
      if (qty(item.quantity).plus(sumMoney(prior.map(i => i.quantity))).gt(qty(source.quantity))) throw conflict("Qty return melebihi invoice");
      const movements = await tx.stockMovement.findMany({ where: { companyId: input.companyId, referenceType: "DeliveryOrder", referenceId: invoice.deliveryOrderId!, productId: item.productId, type: "SALES_DELIVERY" } });
      if (movements.length !== 1 || qty(movements[0].quantity).lt(qty(source.quantity))) throw conflict("Biaya historis delivery tidak ambigu");
      await lock(tx, `return:sales:movement:${movements[0].id}`);
      const movementPrior = await tx.salesReturnItem.findMany({ where: { sourceMovementId: movements[0].id, salesReturn: { companyId: input.companyId, status: { notIn: ["CANCELLED", "VOID", "REJECTED"] } } } });
      if (qty(item.quantity).plus(sumMoney(movementPrior.map(i => i.quantity))).gt(qty(movements[0].quantity))) throw conflict("Qty return melebihi delivery");
      lines.push({ productId: item.productId, sourceItemId: source.id, sourceMovementId: movements[0].id, historicalUnitCost: movements[0].unitCost, quantity: toPrismaDecimal(qty(item.quantity)), unitPrice: source.unitPrice, total: toPrismaMoney(share(money(source.total).minus(money(source.taxAmount)), source.quantity, item.quantity)), taxAmount: toPrismaMoney(share(source.taxAmount, source.quantity, item.quantity)) });
    }
    const subtotal = sumMoney(lines.map(l => l.total));
    const taxAmount = sumMoney(lines.map(l => l.taxAmount));
    return tx.salesReturn.create({ data: { companyId: input.companyId, number: await nextDocumentNumber(tx, input.companyId, "SR"), customerId: input.customerId, salesInvoiceId: invoice.id, warehouseId: input.warehouseId, idempotencyKey: input.idempotencyKey, requestHash, status: "DRAFT", reason: input.reason, subtotal: toPrismaMoney(subtotal), taxAmount: toPrismaMoney(taxAmount), total: toPrismaMoney(subtotal.plus(taxAmount)), createdById: input.userId, items: { create: lines } }, include: { items: true } });
  }, { isolationLevel: "Serializable" });
}

export async function createPurchaseReturn(input: Base & { supplierId: string; purchaseOrderId?: string; items: (Line & { unitCost?: string | number; sourceReceiptItemId?: string })[] }) {
  validate(input, "sourceReceiptItemId");
  return prisma.$transaction(async tx => {
    await lock(tx, `return:create:purchase:${input.companyId}:${input.idempotencyKey}`);
    const requestHash = hash({ ...input, items: input.items.map(i => ({ productId: i.productId, quantity: toPrismaDecimal(qty(i.quantity)), sourceReceiptItemId: i.sourceReceiptItemId })) });
    const existing = await tx.purchaseReturn.findUnique({ where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: input.idempotencyKey! } }, include: { items: true } });
    if (existing) { if (existing.requestHash !== requestHash) throw conflict("Idempotency key digunakan untuk request berbeda"); return existing; }
    await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: input.warehouseId! });
    const lines = [];
    let poId: string | undefined;
    for (const item of input.items) {
      await lock(tx, `return:purchase:${item.sourceReceiptItemId}`);
      const receiptItem = await tx.goodsReceiptItem.findUnique({ where: { id: item.sourceReceiptItemId! }, include: { goodsReceipt: true } });
      const receipt = receiptItem?.goodsReceipt;
      if (!receiptItem || !receipt || receipt.companyId !== input.companyId || receipt.supplierId !== input.supplierId || receipt.warehouseId !== input.warehouseId || receipt.status !== "POSTED" || receiptItem.productId !== item.productId) throw validationError("Receipt posted milik pemasok/gudang wajib");
      if (poId && poId !== receipt.purchaseOrderId) throw validationError("Satu PO per return");
      poId = receipt.purchaseOrderId;
      if (input.purchaseOrderId && input.purchaseOrderId !== poId) throw validationError("PO tidak sesuai receipt");
      const prior = await tx.purchaseReturnItem.findMany({ where: { sourceReceiptItemId: receiptItem.id, purchaseReturn: { companyId: input.companyId, status: { notIn: ["CANCELLED", "VOID", "REJECTED"] } } } });
      if (qty(item.quantity).plus(sumMoney(prior.map(i => i.quantity))).gt(qty(receiptItem.quantityReceived))) throw conflict("Qty return melebihi receipt");
      const movements = await tx.stockMovement.findMany({ where: { companyId: input.companyId, referenceType: "GoodsReceipt", referenceId: receipt.id, productId: item.productId, type: "PURCHASE_RECEIPT" } });
      if (movements.length !== 1 || qty(movements[0].quantity).lt(qty(receiptItem.quantityReceived))) throw conflict("Biaya historis receipt tidak ambigu");
      const bills = await tx.supplierBillItem.findMany({ where: { productId: item.productId, bill: { companyId: input.companyId, supplierId: input.supplierId, purchaseOrderId: poId, status: { not: "DRAFT" } } } });
      if (bills.length !== 1 || qty(bills[0].quantity).lt(qty(receiptItem.quantityReceived))) throw conflict("Bill item harus tidak ambigu untuk koreksi AP/pajak");
      lines.push({ productId: item.productId, sourceReceiptItemId: receiptItem.id, sourceMovementId: movements[0].id, sourceBillItemId: bills[0].id, historicalUnitCost: movements[0].unitCost, quantity: toPrismaDecimal(qty(item.quantity)), unitCost: movements[0].unitCost, total: toPrismaMoney(share(money(bills[0].total).minus(money(bills[0].taxAmount)), bills[0].quantity, item.quantity)), taxAmount: toPrismaMoney(share(bills[0].taxAmount, bills[0].quantity, item.quantity)) });
    }
    const subtotal = sumMoney(lines.map(l => l.total));
    const taxAmount = sumMoney(lines.map(l => l.taxAmount));
    return tx.purchaseReturn.create({ data: { companyId: input.companyId, number: await nextDocumentNumber(tx, input.companyId, "PRN"), supplierId: input.supplierId, purchaseOrderId: poId, warehouseId: input.warehouseId, idempotencyKey: input.idempotencyKey, requestHash, status: "DRAFT", reason: input.reason, subtotal: toPrismaMoney(subtotal), total: toPrismaMoney(subtotal.plus(taxAmount)), createdById: input.userId, items: { create: lines } }, include: { items: true } });
  }, { isolationLevel: "Serializable" });
}

export async function approveReturn(input: { companyId: string; userId: string; id: string; kind: "sales" | "purchase"; inspectionNotes: string; disposition?: "QUARANTINE" | "REJECTED" }) {
  if (!input.inspectionNotes?.trim()) throw validationError("Catatan inspeksi wajib");
  return prisma.$transaction(async tx => {
    await lock(tx, `return:${input.kind}:${input.id}`);
    if (input.kind === "sales") {
      const doc = await tx.salesReturn.findFirst({ where: { id: input.id, companyId: input.companyId } });
      if (!doc) throw notFound("Sales return tidak ditemukan");
      if (doc.status !== "DRAFT") throw conflict("Return harus DRAFT");
      return tx.salesReturn.update({ where: { id: doc.id }, data: { status: input.disposition === "REJECTED" ? "REJECTED" : "APPROVED", inspectionNotes: input.inspectionNotes, disposition: input.disposition ?? "QUARANTINE", inspectedAt: new Date(), approvedAt: new Date(), approvedById: input.userId } });
    }
    const doc = await tx.purchaseReturn.findFirst({ where: { id: input.id, companyId: input.companyId } });
    if (!doc) throw notFound("Purchase return tidak ditemukan");
    if (doc.status !== "DRAFT") throw conflict("Return harus DRAFT");
    return tx.purchaseReturn.update({ where: { id: doc.id }, data: { status: "APPROVED", inspectionNotes: input.inspectionNotes, inspectedAt: new Date(), approvedAt: new Date(), approvedById: input.userId } });
  }, { isolationLevel: "Serializable" });
}

export async function postSalesReturn(input: { companyId: string; userId: string; id: string; warehouseId: string }) {
  return prisma.$transaction(async tx => {
    await lock(tx, `return:sales:${input.id}`);
    const doc = await tx.salesReturn.findFirst({ where: { id: input.id, companyId: input.companyId }, include: { items: true } });
    if (!doc) throw notFound("Sales return tidak ditemukan");
    if (doc.status === "POSTED") return doc;
    if (doc.warehouseId !== input.warehouseId) throw validationError("Gudang harus sesuai return");
    if (doc.status !== "APPROVED" || !doc.approvedById || !doc.inspectedAt || doc.disposition !== "QUARANTINE") throw conflict("Inspeksi dan approval wajib");
    await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: input.warehouseId });
    let cost = money(0);
    for (const item of doc.items) {
      if (!item.sourceItemId || !item.sourceMovementId || !item.historicalUnitCost) throw conflict("Sumber biaya historis tidak tersedia");
      const movement = await tx.stockMovement.findFirst({ where: { id: item.sourceMovementId, companyId: input.companyId, productId: item.productId, type: "SALES_DELIVERY" } });
      if (!movement || !money(movement.unitCost).eq(money(item.historicalUnitCost))) throw conflict("Biaya historis berubah");
      cost = cost.plus(qty(item.quantity).mul(money(movement.unitCost)).toDecimalPlaces(2));
      await postStockMovement(tx, { companyId: input.companyId, warehouseId: input.warehouseId, productId: item.productId, type: "SALES_RETURN", quantity: item.quantity.toString(), unitCost: movement.unitCost.toString(), referenceType: "SalesReturn", referenceId: doc.id, referenceNumber: doc.number, idempotencyKey: `return:sales:${item.id}`, createdById: input.userId });
    }
    // Quarantine quantities remain reserved until release or disposal.
    for (const item of doc.items) {
      await tx.stockBalance.update({ where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: item.productId } }, data: { quantityReserved: { increment: item.quantity } } });
    }
    if (cost.gt(0)) await postJournal(tx, { companyId: input.companyId, sourceModule: "returns", sourceDocType: "SalesReturn", sourceDocId: doc.id, description: `Quarantine ${doc.number}`, idempotencyKey: `je:return:sales:${doc.id}`, postedById: input.userId, lines: [{ accountCode: "1130", debit: toPrismaMoney(cost) }, { accountCode: "5100", credit: toPrismaMoney(cost) }] });
    return tx.salesReturn.update({ where: { id: doc.id }, data: { status: "POSTED", receivedAt: new Date(), postedAt: new Date() }, include: { items: true } });
  }, { isolationLevel: "Serializable" });
}

export async function postPurchaseReturn(input: { companyId: string; userId: string; id: string; warehouseId: string }) {
  return prisma.$transaction(async tx => {
    await lock(tx, `return:purchase:${input.id}`);
    const doc = await tx.purchaseReturn.findFirst({ where: { id: input.id, companyId: input.companyId }, include: { items: true } });
    if (!doc) throw notFound("Purchase return tidak ditemukan");
    if (doc.status === "POSTED") return doc;
    if (doc.warehouseId !== input.warehouseId) throw validationError("Gudang harus sesuai return");
    if (doc.status !== "APPROVED" || !doc.approvedById || !doc.inspectedAt) throw conflict("Inspeksi dan approval wajib");
    await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: input.warehouseId });
    let cost = money(0);
    for (const item of doc.items) {
      if (!item.sourceReceiptItemId || !item.sourceMovementId || !item.historicalUnitCost) throw conflict("Sumber biaya historis tidak tersedia");
      const movement = await tx.stockMovement.findFirst({ where: { id: item.sourceMovementId, companyId: input.companyId, productId: item.productId, type: "PURCHASE_RECEIPT" } });
      if (!movement || !money(movement.unitCost).eq(money(item.historicalUnitCost))) throw conflict("Biaya historis berubah");
      cost = cost.plus(qty(item.quantity).mul(money(movement.unitCost)).toDecimalPlaces(2));
      await postStockMovement(tx, { companyId: input.companyId, warehouseId: input.warehouseId, productId: item.productId, type: "PURCHASE_RETURN", quantity: item.quantity.toString(), unitCost: movement.unitCost.toString(), referenceType: "PurchaseReturn", referenceId: doc.id, referenceNumber: doc.number, idempotencyKey: `return:purchase:${item.id}`, createdById: input.userId });
    }
    if (cost.gt(0)) await postJournal(tx, { companyId: input.companyId, sourceModule: "returns", sourceDocType: "PurchaseReturn", sourceDocId: doc.id, description: `Return stock ${doc.number}`, idempotencyKey: `je:return:purchase:${doc.id}`, postedById: input.userId, lines: [{ accountCode: "2110", debit: toPrismaMoney(cost) }, { accountCode: "1130", credit: toPrismaMoney(cost) }] });
    return tx.purchaseReturn.update({ where: { id: doc.id }, data: { status: "POSTED", postedAt: new Date(), releasedAt: new Date() }, include: { items: true } });
  }, { isolationLevel: "Serializable" });
}

type ReturnAction = { companyId: string; userId: string; id: string };
async function postedReturn(tx: Tx, input: ReturnAction) {
  await lock(tx, `return:sales:${input.id}`);
  const doc = await tx.salesReturn.findFirst({ where: { id: input.id, companyId: input.companyId }, include: { items: true } });
  if (!doc) throw notFound("Return tidak ditemukan");
  if (doc.status !== "POSTED" || !doc.approvedById || !doc.inspectedAt || !doc.items.length) throw conflict("Return posted dengan inspeksi approved wajib");
  return doc;
}

export async function releaseSalesReturn(input: ReturnAction & { targetWarehouseId: string; inspectionNotes?: string }) {
  return prisma.$transaction(async tx => {
    const doc = await postedReturn(tx, input);
    if (doc.releasedAt && doc.disposition === "RELEASE_TO_STOCK") return doc;
    if (doc.disposition !== "QUARANTINE" || doc.disposedAt || !doc.warehouseId) throw conflict("Return bukan karantina");
    if (!input.inspectionNotes?.trim()) throw validationError("Catatan inspeksi release wajib");
    if (doc.items.some(i => i.historicalUnitCost == null)) throw conflict("Biaya historis wajib");
    const source = await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: doc.warehouseId });
    const target = await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: input.targetWarehouseId });
    if (!["RETURN", "DAMAGED"].includes(source.type) || target.type !== "MAIN" || source.id === target.id) throw validationError("Release harus dari karantina ke gudang utama");
    for (const item of doc.items) {
      const released = await tx.stockBalance.updateMany({ where: { companyId: input.companyId, warehouseId: doc.warehouseId, productId: item.productId, quantityReserved: { gte: item.quantity } }, data: { quantityReserved: { decrement: item.quantity } } });
      if (released.count !== 1) throw conflict("Reservasi karantina tidak cukup");
      for (const [warehouseId, type] of [[doc.warehouseId, "TRANSFER_OUT"], [target.id, "TRANSFER_IN"]] as const) await postStockMovement(tx, { companyId: input.companyId, warehouseId, productId: item.productId, type, quantity: item.quantity.toString(), unitCost: item.historicalUnitCost!.toString(), referenceType: "ReturnRelease", referenceId: doc.id, idempotencyKey: `return:release:${item.id}:${type}`, createdById: input.userId });
    }
    return tx.salesReturn.update({ where: { id: doc.id }, data: { disposition: "RELEASE_TO_STOCK", releasedAt: new Date(), inspectionNotes: input.inspectionNotes, approvedById: input.userId, approvedAt: new Date() } });
  }, { isolationLevel: "Serializable" });
}

export async function disposeSalesReturn(input: ReturnAction & { approvedById?: string }) {
  return prisma.$transaction(async tx => {
    const doc = await postedReturn(tx, input);
    if (doc.disposedAt) return doc;
    if (doc.disposition !== "QUARANTINE" || !doc.warehouseId) throw conflict("Return bukan karantina");
    const warehouse = await assertWarehouseOwnership(tx, { companyId: input.companyId, warehouseId: doc.warehouseId });
    if (!["RETURN", "DAMAGED"].includes(warehouse.type)) throw validationError("Gudang karantina wajib");
    if (doc.items.some(i => i.historicalUnitCost == null)) throw conflict("Biaya historis wajib");
    const cost = sumMoney(doc.items.map(i => qty(i.quantity).mul(money(i.historicalUnitCost!)).toDecimalPlaces(2)));
    await assertApprovalRole({ companyId: input.companyId, userId: input.userId, docType: "ReturnDisposal", amount: cost.toString() });
    const account = await tx.account.findFirst({ where: { companyId: input.companyId, isActive: true, code: { startsWith: "520" }, type: { in: ["EXPENSE", "OTHER_EXPENSE"] } }, orderBy: { code: "asc" } });
    if (!account) throw conflict("Konfigurasi COA rugi 5200-family wajib");
    for (const item of doc.items) {
      const released = await tx.stockBalance.updateMany({ where: { companyId: input.companyId, warehouseId: doc.warehouseId, productId: item.productId, quantityReserved: { gte: item.quantity } }, data: { quantityReserved: { decrement: item.quantity } } });
      if (released.count !== 1) throw conflict("Reservasi karantina tidak cukup");
      await postStockMovement(tx, { companyId: input.companyId, warehouseId: doc.warehouseId, productId: item.productId, type: "ADJUSTMENT_OUT", quantity: item.quantity.toString(), unitCost: item.historicalUnitCost!.toString(), referenceType: "ReturnDisposal", referenceId: doc.id, idempotencyKey: `return:disposal:${item.id}`, createdById: input.userId });
    }
    if (cost.gt(0)) await postJournal(tx, { companyId: input.companyId, sourceModule: "returns", sourceDocType: "ReturnDisposal", sourceDocId: doc.id, idempotencyKey: `je:return:disposal:${doc.id}`, description: `Scrap ${doc.number}`, postedById: input.userId, lines: [{ accountCode: account.code, debit: cost.toString() }, { accountCode: "1130", credit: cost.toString() }] });
    return tx.salesReturn.update({ where: { id: doc.id }, data: { disposedAt: new Date(), disposition: "DISPOSED", approvedById: input.userId, approvedAt: new Date() } });
  }, { isolationLevel: "Serializable" });
}

export async function approveReturnSettlement(input: ReturnAction & { amount: string | number }) {
  const amount = money(input.amount);
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw validationError("Jumlah settlement tidak valid");
  return prisma.$transaction(async tx => {
    const doc = await postedReturn(tx, input);
    if (doc.settlementStatus !== "DRAFT") throw conflict("Settlement sudah diajukan/disetujui");
    const note = await tx.creditNote.findFirst({ where: { companyId: input.companyId, salesReturnId: doc.id, customerId: doc.customerId, status: "ISSUED" } });
    if (!note || amount.gt(money(note.total))) throw conflict("Settlement melebihi credit note sumber");
    await assertApprovalRole({ companyId: input.companyId, userId: input.userId, docType: "ReturnRefund", amount: amount.toString() });
    return tx.salesReturn.update({ where: { id: doc.id }, data: { settlementStatus: "APPROVED", settlementApprovedById: input.userId, settlementApprovedAt: new Date(), refundAmount: toPrismaMoney(amount) } });
  }, { isolationLevel: "Serializable" });
}

export async function refundSalesReturn(input: ReturnAction & { bankAccountId: string; amount: string | number }) {
  const amount = money(input.amount);
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw validationError("Jumlah refund harus positif maksimal 2 desimal");
  return prisma.$transaction(async tx => {
    const doc = await postedReturn(tx, input);
    if (doc.replacementDeliveryId) throw conflict("Replacement sudah ada; refund tidak tersedia");
    if (doc.refundedAt) throw conflict("Refund sudah diposting");
    if (doc.settlementStatus !== "APPROVED" || !doc.settlementApprovedById || !doc.settlementApprovedAt) throw conflict("Refund wajib settlement APPROVED");
    if (!money(doc.refundAmount ?? 0).eq(amount)) throw conflict("Refund tidak sesuai settlement disetujui");
    const note = await tx.creditNote.findFirst({ where: { companyId: input.companyId, salesReturnId: doc.id, customerId: doc.customerId, status: "ISSUED" } });
    if (!note || amount.gt(money(note.total))) throw conflict("Refund melebihi credit note sumber");
    const invoice = await tx.salesInvoice.findFirst({ where: { id: doc.salesInvoiceId ?? "", companyId: input.companyId, customerId: doc.customerId } });
    if (!invoice || money(invoice.balance).gt(amount.neg())) throw conflict("Kredit pelanggan dari CN tidak cukup untuk refund");
    const bank = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: input.companyId, isActive: true } });
    if (!bank?.glAccountId) throw conflict("Akun bank aktif dengan GL wajib");
    const gl = await tx.account.findFirst({ where: { id: bank.glAccountId, companyId: input.companyId, isActive: true } });
    if (!gl) throw conflict("GL bank tidak aktif");
    await postJournal(tx, { companyId: input.companyId, sourceModule: "returns", sourceDocType: "ReturnRefund", sourceDocId: doc.id, description: `Refund ${doc.number}`, idempotencyKey: `je:return:refund:${doc.id}`, postedById: input.userId, lines: [{ accountCode: "1120", debit: amount.toString() }, { accountCode: gl.code, credit: amount.toString() }] });
    await tx.salesInvoice.update({ where: { id: invoice.id }, data: { balance: { increment: toPrismaMoney(amount) } } });
    return tx.salesReturn.update({ where: { id: doc.id }, data: { refundedAt: new Date(), refundAmount: toPrismaMoney(amount) } });
  }, { isolationLevel: "Serializable" });
}

export async function replaceSalesReturn(input: ReturnAction & { targetWarehouseId: string }) {
  return prisma.$transaction(async tx => {
    await postedReturn(tx, input);
    // ponytail: replacement is disabled until dedicated inventory/COGS posting avoids original SO fulfillment.
    throw conflict("Replacement belum tersedia. Gunakan credit note/refund; jangan buat delivery dari SO sumber.");
  }, { isolationLevel: "Serializable" });
}

export async function createClaim(input: { companyId: string; claimType: string; partnerName?: string; amount: string | number; reason?: string; ownerId?: string; dueAt?: Date; evidenceFileId?: string; salesReturnId?: string }) {
  if (!money(input.amount).isFinite() || money(input.amount).lte(0) || !input.ownerId || !input.dueAt || !Number.isFinite(input.dueAt.getTime())) throw validationError("Jumlah positif, owner dan SLA due wajib");
  return prisma.$transaction(async tx => {
    if (input.evidenceFileId && !await tx.fileAsset.findFirst({ where: { id: input.evidenceFileId, companyId: input.companyId, status: "READY", deletedAt: null } })) throw validationError("Evidence FileAsset tidak valid");
    if (!await tx.membership.findFirst({ where: { companyId: input.companyId, userId: input.ownerId, status: "ACTIVE" } })) throw validationError("Owner bukan anggota aktif");
    if (input.salesReturnId && !await tx.salesReturn.findFirst({ where: { id: input.salesReturnId, companyId: input.companyId } })) throw validationError("Return claim tidak valid");
    return tx.claim.create({ data: { ...input, amount: toPrismaMoney(money(input.amount)), number: await nextDocumentNumber(tx, input.companyId, "CLM"), status: "DRAFT" } });
  });
}

export async function advanceClaim(input: { companyId: string; userId: string; id: string; status: "IN_PROGRESS" | "RESOLVED"; resolution?: string }) {
  return prisma.$transaction(async tx => {
    await lock(tx, `claim:${input.id}`);
    const doc = await tx.claim.findFirst({ where: { id: input.id, companyId: input.companyId } });
    if (!doc) throw notFound("Claim tidak ditemukan");
    if (doc.status !== (input.status === "IN_PROGRESS" ? "DRAFT" : "IN_PROGRESS")) throw conflict("Transisi claim tidak valid");
    if (input.status === "RESOLVED" && (!input.resolution?.trim() || doc.ownerId === input.userId)) throw conflict("Resolution dan approver berbeda dari owner wajib");
    return tx.claim.update({ where: { id: doc.id }, data: { status: input.status, ...(input.status === "RESOLVED" ? { resolution: input.resolution, approvedById: input.userId, approvedAt: new Date() } : {}) } });
  }, { isolationLevel: "Serializable" });
}
