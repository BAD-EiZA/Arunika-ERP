import { createHash, randomUUID } from "node:crypto";
import type { Prisma, WarehouseType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { Decimal, qty, toPrismaDecimal } from "@/lib/money";
import { assertWarehouseOwnership, postStockMovement, type WarehouseAccess } from "./inventory";
import { postJournal } from "./accounting";
import { toPrismaMoney } from "@/lib/money";

type Tx = Prisma.TransactionClient;
type Base = { companyId: string; userId: string; access: WarehouseAccess };
type Line = { productId: string; quantity: string | number };
async function lock(tx: Tx, key: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`; }
function decimal(value: string | number, signed = false) {
 try { const n = new Decimal(value); if (!n.isFinite() || n.decimalPlaces() > 4 || n.abs().gte("100000000000000") || (!signed && n.lt(0))) throw Error(); return n; } catch { throw validationError("Kuantitas tidak valid (maksimal 4 desimal)"); }
}
function lines(items: Line[]) {
 if (!Array.isArray(items) || !items.length || items.length > 500 || new Set(items.map(i => i.productId)).size !== items.length) throw validationError("Minimal satu produk, tanpa duplikat (maksimal 500)");
 for (const i of items) if (!i.productId || decimal(i.quantity, true).isZero()) throw validationError("Produk dan kuantitas bukan nol wajib");
}
async function warehouse(tx: Tx, input: Base, warehouseId: string) {
 const w = await assertWarehouseOwnership(tx, { ...input, warehouseId });
 if (!w.isActive) throw conflict("Gudang nonaktif");
 const b = await tx.branch.findFirst({ where: { id: w.branchId, companyId: input.companyId, isActive: true } });
 if (!b) throw conflict("Cabang nonaktif"); return w;
}
async function balance(tx: Tx, warehouseId: string, productId: string) {
 await lock(tx, `${warehouseId}:${productId}`);
 return tx.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId, productId } } });
}
async function product(tx: Tx, companyId: string, productId: string) {
 if (!await tx.product.findFirst({ where: { id: productId, companyId, type: "STOCK", isArchived: false } })) throw validationError("Produk stok tidak ditemukan");
}
function number(prefix: string, key?: string) { return `${prefix}-${key ? createHash("sha256").update(key).digest("hex").slice(0, 32) : randomUUID()}`; }
async function audit(tx: Tx, input: Base, entityType: string, entityId: string, action: string, valuation?: string) {
 await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, entityType, entityId, action, ...(valuation != null ? { metadata: { valuation } } : {}) } });
}
async function assertApprovedValuation(tx: Tx, input: Base, entityType: string, entityId: string, amount: string) {
 const log = await tx.auditLog.findFirst({ where: { companyId: input.companyId, entityType, entityId, action: "approve" }, orderBy: { createdAt: "desc" } });
 const metadata = log?.metadata;
 if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || typeof metadata.valuation !== "string" || !qty(metadata.valuation).eq(qty(amount))) throw conflict("Valuasi approval berubah atau tidak tersedia; buat dokumen baru");
}
// ponytail: use existing document status + transactional audit; dedicated approval fields need a coordinated schema migration.
async function approve(tx: Tx, input: Base, docType: string, amount: string) {
 const matrices = await tx.approvalMatrix.findMany({ where: { companyId: input.companyId, docType, isActive: true } });
 const roles = matrices.filter(r => qty(amount).gte(qty(r.minAmount)) && (r.maxAmount == null || qty(amount).lte(qty(r.maxAmount)))).map(r => r.roleCode);
 if (roles.length) {
  const membership = await tx.membership.findFirst({ where: { companyId: input.companyId, userId: input.userId, status: "ACTIVE" }, include: { role: true } });
  if (!membership || !["OWNER", "ADMIN", ...roles].includes(membership.role.code)) throw forbidden("Role approval tidak mencukupi");
 }
}
export async function createTransfer(input: Base & { fromWarehouseId: string; toWarehouseId: string; items: Line[]; notes?: string; idempotencyKey?: string }) {
 lines(input.items);
 if (!input.fromWarehouseId || input.fromWarehouseId === input.toWarehouseId || input.items.some(i => decimal(i.quantity).lte(0))) throw validationError("Gudang asal dan tujuan harus berbeda; kuantitas positif");
 return prisma.$transaction(async tx => {
  await warehouse(tx, input, input.fromWarehouseId);
  // The sender needs origin access; receiving always checks destination access separately.
  await warehouse(tx, { ...input, access: { branchIds: [], warehouseIds: [] } }, input.toWarehouseId);
  const num = number("TR", input.idempotencyKey); await lock(tx, `${input.companyId}:${num}`);
  const old = await tx.stockTransfer.findFirst({ where: { companyId: input.companyId, number: num }, include: { items: true } });
  if (old) {
   if (old.fromWarehouseId !== input.fromWarehouseId || old.toWarehouseId !== input.toWarehouseId || old.notes !== (input.notes ?? null) || JSON.stringify(old.items.map(i => [i.productId, qty(i.quantity).toString()]).sort()) !== JSON.stringify(input.items.map(i => [i.productId, qty(i.quantity).toString()]).sort())) throw conflict("Idempotency key berbeda payload");
   return old;
  }
  for (const i of [...input.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
   await product(tx, input.companyId, i.productId); const b = await balance(tx, input.fromWarehouseId, i.productId);
   if (qty(b?.quantityOnHand ?? 0).minus(qty(b?.quantityReserved ?? 0)).lt(qty(i.quantity))) throw conflict("Stok tersedia tidak cukup");
  }
  return tx.stockTransfer.create({ data: { companyId: input.companyId, number: num, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, notes: input.notes, createdById: input.userId, items: { create: input.items.map(i => ({ productId: i.productId, quantity: toPrismaDecimal(qty(i.quantity)) })) } }, include: { items: true } });
 }, { isolationLevel: "Serializable" });
}
type Receipt = { itemId: string; quantity: string | number };
export async function advanceTransfer(input: Base & { id: string; action: "request" | "approve" | "send" | "receive" | "cancel" | "reverse"; items?: Receipt[]; final?: boolean; reason?: string }) {
 return prisma.$transaction(async tx => {
  await lock(tx, `transfer:${input.companyId}:${input.id}`);
  const doc = await tx.stockTransfer.findFirst({ where: { id: input.id, companyId: input.companyId }, include: { items: true } }); if (!doc) throw notFound("Transfer tidak ditemukan");
  await warehouse(tx, input, input.action === "receive" ? doc.toWarehouseId : doc.fromWarehouseId);
  if (input.action === "receive") {
   if (input.final) await warehouse(tx, input, doc.fromWarehouseId);
   if (doc.status === "RECEIVED" && !input.items) return doc;
   if (!["IN_TRANSIT", "RECEIVED"].includes(doc.status)) throw conflict("Transfer tidak dalam perjalanan");
   const requested = input.items ?? doc.items.filter(i => qty(i.receivedQty).lt(qty(i.quantity))).map(i => ({ itemId: i.id, quantity: qty(i.quantity).toString() }));
   if (!requested.length || requested.length > 500 || new Set(requested.map(i => i.itemId)).size !== requested.length) throw validationError("Baris penerimaan tidak valid");
   for (const row of requested) decimal(row.quantity);
   const receiptKey = createHash("sha256").update(JSON.stringify({ rows: [...requested].sort((a,b) => a.itemId.localeCompare(b.itemId)).map(r => [r.itemId, qty(r.quantity).toString()]), final: !!input.final, reason: input.reason?.trim() ?? "" })).digest("hex");
   // Retry of a completed receipt must match the exact original payload; metadata is committed atomically.
   const prior = await tx.auditLog.findFirst({ where: { companyId: input.companyId, entityType: "StockTransfer", entityId: doc.id, action: "receive", metadata: { path: ["receiptHash"], equals: receiptKey } } });
   if (prior?.metadata && typeof prior.metadata === "object" && !Array.isArray(prior.metadata) && prior.metadata.receiptHash === receiptKey) return doc;
   for (const row of requested) {
    const item = doc.items.find(i => i.id === row.itemId); if (!item || decimal(row.quantity).lt(qty(item.receivedQty)) || qty(row.quantity).gt(qty(item.quantity))) throw validationError("Kuantitas penerimaan melampaui pengiriman atau berkurang");
   }
   if (input.final && !input.reason?.trim() && doc.items.some(i => qty(requested.find(r => r.itemId === i.id)?.quantity ?? i.receivedQty).lt(qty(i.quantity)))) throw validationError("Alasan selisih wajib");
   if (doc.status !== "IN_TRANSIT") throw conflict("Penerimaan sudah final");
   for (const row of requested) {
    const item = doc.items.find(i => i.id === row.itemId)!;
    const sent = await tx.stockMovement.findUnique({ where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: `transfer:${doc.id}:${item.id}:out` } } });
    if (!sent) throw conflict("Mutasi pengiriman tidak ditemukan");
    const received = qty(row.quantity), increment = received.minus(qty(item.receivedQty));
    if (increment.isZero()) continue;
    await postStockMovement(tx, { ...input, warehouseId: doc.toWarehouseId, productId: item.productId, type: "TRANSFER_IN", quantity: increment.toString(), unitCost: sent.unitCost.toString(), referenceType: "StockTransfer", referenceId: doc.id, referenceNumber: doc.number, createdById: input.userId, idempotencyKey: input.items ? `transfer:${doc.id}:${item.id}:in:${receiptKey}` : `transfer:${doc.id}:${item.id}:in` });
    await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQty: toPrismaDecimal(received) } });
   }
   const remaining = doc.items.map(i => qty(i.quantity).minus(qty(requested.find(r => r.itemId === i.id)?.quantity ?? i.receivedQty)));
   if (input.final) {
    await warehouse(tx, input, doc.fromWarehouseId);
    for (let n = 0; n < doc.items.length; n++) if (remaining[n].gt(0)) {
     const i = doc.items[n], sent = await tx.stockMovement.findUnique({ where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: `transfer:${doc.id}:${i.id}:out` } } });
     if (!sent) throw conflict("Mutasi pengiriman tidak ditemukan");
     await postStockMovement(tx, { ...input, warehouseId: doc.fromWarehouseId, productId: i.productId, type: "TRANSFER_IN", quantity: remaining[n].toString(), unitCost: sent.unitCost.toString(), referenceType: "StockTransfer", referenceId: doc.id, referenceNumber: doc.number, notes: input.reason!.trim(), createdById: input.userId, idempotencyKey: `transfer:${doc.id}:${i.id}:difference` });
    }
   }
   if (input.final || remaining.every(n => n.isZero())) await tx.stockTransfer.update({ where: { id: doc.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
   await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, entityType: "StockTransfer", entityId: doc.id, action: "receive", metadata: { receiptHash: receiptKey, final: !!input.final, reason: input.reason?.trim() ?? null } } });
   return doc;
  }
  if (input.action === "reverse") {
   await warehouse(tx, input, doc.toWarehouseId);
   if (doc.status === "CANCELLED") return doc;
   if (!["IN_TRANSIT", "RECEIVED"].includes(doc.status) || !input.reason?.trim()) throw conflict("Reversal setelah kirim memerlukan alasan");
   for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
    const sent = await tx.stockMovement.findUnique({ where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: `transfer:${doc.id}:${i.id}:out` } } });
    if (!sent) throw conflict("Mutasi pengiriman tidak ditemukan");
    const received = qty(i.receivedQty), unreceived = qty(i.quantity).minus(received);
    if (received.gt(0)) {
     const b = await balance(tx, doc.toWarehouseId, i.productId);
     if (qty(b?.quantityOnHand ?? 0).minus(qty(b?.quantityReserved ?? 0)).lt(received)) throw conflict("Stok tujuan tidak cukup untuk reversal");
     if (!qty(b?.averageCost ?? 0).eq(qty(sent.unitCost))) throw conflict("Valuasi tujuan berubah; reversal langsung tidak aman; lakukan koreksi bernilai terpisah");
     await postStockMovement(tx, { ...input, warehouseId: doc.toWarehouseId, productId: i.productId, type: "TRANSFER_OUT", quantity: received.toString(), unitCost: sent.unitCost.toString(), referenceType: "StockTransfer", referenceId: doc.id, referenceNumber: doc.number, notes: input.reason.trim(), createdById: input.userId, idempotencyKey: `transfer:${doc.id}:${i.id}:reverse:out` });
    }
    if (received.plus(doc.status === "IN_TRANSIT" ? unreceived : qty(0)).gt(0)) await postStockMovement(tx, { ...input, warehouseId: doc.fromWarehouseId, productId: i.productId, type: "TRANSFER_IN", quantity: received.plus(doc.status === "IN_TRANSIT" ? unreceived : qty(0)).toString(), unitCost: sent.unitCost.toString(), referenceType: "StockTransfer", referenceId: doc.id, referenceNumber: doc.number, notes: input.reason.trim(), createdById: input.userId, idempotencyKey: `transfer:${doc.id}:${i.id}:reverse:in` });
   }
   const result = await tx.stockTransfer.update({ where: { id: doc.id }, data: { status: "CANCELLED" } }); await audit(tx, input, "StockTransfer", doc.id, "reverse"); return result;
  }
  if (input.action === "send" && ["IN_TRANSIT", "RECEIVED"].includes(doc.status)) return doc;
  const transitions = { request: ["DRAFT", "PENDING_APPROVAL"], approve: ["PENDING_APPROVAL", "APPROVED"], send: ["APPROVED", "IN_TRANSIT"], receive: ["IN_TRANSIT", "RECEIVED"], cancel: ["DRAFT", "CANCELLED"] } as const;
  const step = transitions[input.action]; if (!step) throw validationError("Aksi tidak valid"); if (doc.status === step[1]) return doc; if (doc.status !== step[0]) throw conflict("Transisi transfer tidak valid; sesudah kirim perlu reversal");
  let amount = qty(0);
  if (["approve", "send"].includes(input.action)) {
   for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
    const b = await balance(tx, doc.fromWarehouseId, i.productId);
    if (input.action === "send" && qty(b?.quantityOnHand ?? 0).minus(qty(b?.quantityReserved ?? 0)).lt(qty(i.quantity))) throw conflict("Stok tersedia tidak cukup");
    amount = amount.plus(qty(i.quantity).mul(qty(b?.averageCost ?? 0)));
   }
   if (input.action === "approve") await approve(tx, input, "StockTransfer", amount.toString());
   else await assertApprovedValuation(tx, input, "StockTransfer", doc.id, amount.toString());
  }
  if (input.action === "send") for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
   const b = await balance(tx, doc.fromWarehouseId, i.productId);
   await postStockMovement(tx, { ...input, warehouseId: doc.fromWarehouseId, productId: i.productId, type: "TRANSFER_OUT", quantity: i.quantity.toString(), unitCost: (b?.averageCost ?? 0).toString(), referenceType: "StockTransfer", referenceId: doc.id, referenceNumber: doc.number, createdById: input.userId, idempotencyKey: `transfer:${doc.id}:${i.id}:out` });
  }
  const result = await tx.stockTransfer.update({ where: { id: doc.id }, data: { status: step[1], ...(input.action === "send" ? { transferredAt: new Date() } : {}) } });
  await audit(tx, input, "StockTransfer", doc.id, input.action, input.action === "approve" ? amount.toString() : undefined); return result;
 }, { isolationLevel: "Serializable" });
}
export async function createAdjustment(input: Base & { warehouseId: string; reason: string; notes?: string; items: { productId: string; delta: string | number }[]; idempotencyKey?: string }) {
 if (!input.reason?.trim()) throw validationError("Alasan wajib"); lines(input.items?.map(i => ({ productId: i.productId, quantity: i.delta })));
 return prisma.$transaction(async tx => {
  await warehouse(tx, input, input.warehouseId);
  const num = number("ADJ", input.idempotencyKey); await lock(tx, `${input.companyId}:${num}`);
  const old = await tx.stockAdjustment.findFirst({ where: { companyId: input.companyId, number: num }, include: { items: true } });
  if (old) {
   if (old.warehouseId !== input.warehouseId || old.reason !== input.reason.trim() || old.notes !== (input.notes ?? null) || JSON.stringify(old.items.map(i => [i.productId, qty(i.quantityDelta).toString()]).sort()) !== JSON.stringify(input.items.map(i => [i.productId, qty(i.delta).toString()]).sort())) throw conflict("Idempotency key berbeda payload"); return old;
  }
  const items = [];
  for (const i of [...input.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
   await product(tx, input.companyId, i.productId); const b = await balance(tx, input.warehouseId, i.productId); const before = qty(b?.quantityOnHand ?? 0), delta = decimal(i.delta, true);
   if (before.plus(delta).lt(qty(b?.quantityReserved ?? 0))) throw conflict("Stok tersedia tidak cukup");
   items.push({ productId: i.productId, quantityBefore: toPrismaDecimal(before), quantityDelta: toPrismaDecimal(delta), quantityAfter: toPrismaDecimal(before.plus(delta)) });
  }
  return tx.stockAdjustment.create({ data: { companyId: input.companyId, warehouseId: input.warehouseId, number: num, reason: input.reason.trim(), notes: input.notes, createdById: input.userId, items: { create: items } }, include: { items: true } });
 }, { isolationLevel: "Serializable" });
}
export async function advanceAdjustment(input: Base & { id: string; action: "request" | "approve" | "post" | "cancel" }) {
 return prisma.$transaction(async tx => {
  await lock(tx, `adjustment:${input.companyId}:${input.id}`);
  const doc = await tx.stockAdjustment.findFirst({ where: { companyId: input.companyId, id: input.id }, include: { items: true } }); if (!doc) throw notFound("Adjustment tidak ditemukan"); await warehouse(tx, input, doc.warehouseId);
  const steps = { request: ["DRAFT", "PENDING_APPROVAL"], approve: ["PENDING_APPROVAL", "APPROVED"], post: ["APPROVED", "POSTED"], cancel: ["DRAFT", "CANCELLED"] } as const;
  const step = steps[input.action]; if (!step) throw validationError("Aksi tidak valid"); if (doc.status === step[1]) return doc; if (doc.status !== step[0]) throw conflict("Transisi adjustment tidak valid");
  if (input.action === "post") {
   let valuation = qty(0);
   for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
    const b = await balance(tx, doc.warehouseId, i.productId);
    if (!qty(b?.quantityOnHand ?? 0).eq(qty(i.quantityBefore))) throw conflict("Snapshot stok berubah; buat adjustment baru");
    if (qty(b?.quantityOnHand ?? 0).plus(qty(i.quantityDelta)).lt(qty(b?.quantityReserved ?? 0))) throw conflict("Stok tersedia tidak cukup");
    valuation = valuation.plus(qty(i.quantityDelta).abs().mul(qty(b?.averageCost ?? 0)));
   }
   await assertApprovedValuation(tx, input, "StockAdjustment", doc.id, valuation.toString());
   await correctionJournal(tx, input, "StockAdjustment", doc, doc.items.map(i => ({ productId: i.productId, delta: qty(i.quantityDelta) })));
  }
  let amount = qty(0);
  for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
   if (!["post", "approve"].includes(input.action)) break;
   const b = await balance(tx, doc.warehouseId, i.productId); const delta = qty(i.quantityDelta); amount = amount.plus(delta.abs().mul(qty(b?.averageCost ?? 0)));
   if (input.action === "post") {
    if (!qty(b?.quantityOnHand ?? 0).eq(qty(i.quantityBefore))) throw conflict("Snapshot stok berubah; buat adjustment baru");
    await postStockMovement(tx, { ...input, warehouseId: doc.warehouseId, productId: i.productId, type: delta.gt(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: delta.abs().toString(), unitCost: (b?.averageCost ?? 0).toString(), referenceType: "StockAdjustment", referenceId: doc.id, referenceNumber: doc.number, notes: doc.reason, createdById: input.userId, idempotencyKey: `adjustment:${doc.id}:${i.id}` });
   }
  }
  if (input.action === "approve") await approve(tx, input, "StockAdjustment", amount.toString());
  const result = await tx.stockAdjustment.update({ where: { id: doc.id }, data: { status: step[1], ...(input.action === "post" ? { postedAt: new Date() } : {}) } }); await audit(tx, input, "StockAdjustment", doc.id, input.action, input.action === "approve" ? amount.toString() : undefined); return result;
 }, { isolationLevel: "Serializable" });
}
export async function createOpname(input: Base & { warehouseId: string; notes?: string; idempotencyKey?: string }) {
 return prisma.$transaction(async tx => {
  await warehouse(tx, input, input.warehouseId); await lock(tx, `opname:${input.companyId}:${input.warehouseId}`);
  const num = number("OP", input.idempotencyKey);
  const old = await tx.stockOpname.findFirst({ where: { companyId: input.companyId, number: num }, include: { items: true } });
  if (old) { if (old.warehouseId !== input.warehouseId || old.notes !== (input.notes ?? null)) throw conflict("Idempotency key berbeda payload"); return old; }
  if (await tx.stockOpname.findFirst({ where: { companyId: input.companyId, warehouseId: input.warehouseId, status: { notIn: ["POSTED", "CANCELLED"] } } })) throw conflict("Opname aktif sudah ada");
  const products = await tx.product.findMany({ where: { companyId: input.companyId, type: "STOCK", isArchived: false }, select: { id: true }, orderBy: { id: "asc" } });
  const balances = await tx.stockBalance.findMany({ where: { companyId: input.companyId, warehouseId: input.warehouseId, product: { type: "STOCK", isArchived: false } } });
  if (!products.length) throw validationError("Tidak ada produk untuk dihitung");
  const byProduct = new Map(balances.map(b => [b.productId, b.quantityOnHand]));
  return tx.stockOpname.create({ data: { companyId: input.companyId, warehouseId: input.warehouseId, number: num, notes: input.notes, createdById: input.userId, status: "DRAFT", items: { create: products.map(p => ({ productId: p.id, systemQty: toPrismaDecimal(qty(byProduct.get(p.id) ?? 0)) })) } }, include: { items: true } });
 }, { isolationLevel: "Serializable" });
}
export async function saveOpnameCount(input: Base & { id: string; itemId: string; count: string | number }) {
 const count = decimal(input.count);
 return prisma.$transaction(async tx => {
  await lock(tx, `opname:doc:${input.companyId}:${input.id}`);
  const doc = await tx.stockOpname.findFirst({ where: { companyId: input.companyId, id: input.id }, include: { items: true } }); if (!doc) throw notFound("Opname tidak ditemukan"); await warehouse(tx, input, doc.warehouseId);
  if (doc.status !== "COUNTING") throw conflict("Opname harus COUNTING"); const i = doc.items.find(i => i.id === input.itemId); if (!i) throw validationError("Item bukan snapshot opname");
  return tx.stockOpnameItem.update({ where: { id: i.id }, data: { countedQty: toPrismaDecimal(count), differenceQty: toPrismaDecimal(count.minus(qty(i.systemQty))) } });
 }, { isolationLevel: "Serializable" });
}
export async function advanceOpname(input: Base & { id: string; action: "start" | "review" | "approve" | "post" | "cancel" }) {
 return prisma.$transaction(async tx => {
  await lock(tx, `opname:doc:${input.companyId}:${input.id}`);
  const doc = await tx.stockOpname.findFirst({ where: { id: input.id, companyId: input.companyId }, include: { items: true } }); if (!doc) throw notFound("Opname tidak ditemukan"); await warehouse(tx, input, doc.warehouseId);
  const steps = { start: ["DRAFT", "COUNTING"], review: ["COUNTING", "REVIEW"], approve: ["REVIEW", "APPROVED"], post: ["APPROVED", "POSTED"], cancel: ["DRAFT", "CANCELLED"] } as const;
  const step = steps[input.action]; if (!step) throw validationError("Aksi tidak valid"); if (doc.status === step[1]) return doc; if (doc.status !== step[0]) throw conflict("Transisi opname tidak valid");
  if (["review", "approve", "post"].includes(input.action) && doc.items.some(i => i.countedQty == null)) throw conflict("Semua produk harus dihitung");
  if (input.action === "post") {
   let valuation = qty(0);
   for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
    const b = await balance(tx, doc.warehouseId, i.productId);
    if (!qty(b?.quantityOnHand ?? 0).eq(qty(i.systemQty))) throw conflict("Snapshot stok berubah; ulang opname");
    if (qty(i.countedQty!).lt(qty(b?.quantityReserved ?? 0))) throw conflict("Stok tersedia tidak cukup");
    valuation = valuation.plus(qty(i.countedQty!).minus(qty(i.systemQty)).abs().mul(qty(b?.averageCost ?? 0)));
   }
   await assertApprovedValuation(tx, input, "StockOpname", doc.id, valuation.toString());
   await correctionJournal(tx, input, "StockOpname", doc, doc.items.map(i => ({ productId: i.productId, delta: qty(i.countedQty!).minus(qty(i.systemQty)) })));
  }
  let amount = qty(0);
  for (const i of [...doc.items].sort((a,b) => a.productId.localeCompare(b.productId))) {
   if (!["approve", "post"].includes(input.action)) break;
   const delta = qty(i.countedQty!).minus(qty(i.systemQty)); const b = await balance(tx, doc.warehouseId, i.productId); amount = amount.plus(delta.abs().mul(qty(b?.averageCost ?? 0)));
   if (input.action === "post") {
    if (!qty(b?.quantityOnHand ?? 0).eq(qty(i.systemQty))) throw conflict("Snapshot stok berubah; ulang opname");
    if (!delta.isZero()) await postStockMovement(tx, { ...input, warehouseId: doc.warehouseId, productId: i.productId, type: delta.gt(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: delta.abs().toString(), unitCost: (b?.averageCost ?? 0).toString(), referenceType: "StockOpname", referenceId: doc.id, referenceNumber: doc.number, createdById: input.userId, idempotencyKey: `opname:${doc.id}:${i.id}` });
   }
  }
  if (input.action === "approve") await approve(tx, input, "StockOpname", amount.toString());
  const result = await tx.stockOpname.update({ where: { id: doc.id }, data: { status: step[1], ...(input.action === "post" ? { postedAt: new Date() } : {}) } }); await audit(tx, input, "StockOpname", doc.id, input.action, input.action === "approve" ? amount.toString() : undefined); return result;
 }, { isolationLevel: "Serializable" });
}
type Accounts = { inventoryAccountCode: string; stockGainAccountCode: string; stockLossAccountCode: string };
async function validateAccounts(tx: Tx, companyId: string, config: Partial<Record<keyof Accounts, string | null>> | null) {
 if (!config || !config.inventoryAccountCode || !config.stockGainAccountCode || !config.stockLossAccountCode) throw validationError("Konfigurasi akun persediaan wajib");
 const codes = [config.inventoryAccountCode, config.stockGainAccountCode, config.stockLossAccountCode];
 if (new Set(codes).size !== 3) throw validationError("Akun persediaan harus berbeda");
 const accounts = await tx.account.findMany({ where: { companyId, code: { in: codes }, isActive: true } });
 const types = [["ASSET"], ["REVENUE", "OTHER_INCOME"], ["EXPENSE", "OTHER_EXPENSE"]];
 if (codes.some((code, i) => !accounts.some(a => a.code === code && a.isActive && types[i].includes(a.type)))) throw validationError("Akun persediaan aktif dengan tipe sesuai wajib");
 return config as Accounts;
}
export async function configureInventoryAccounts(input: Base & Accounts) {
 return prisma.$transaction(async tx => {
  await lock(tx, `inventory-accounts:${input.companyId}`);
  const config = await validateAccounts(tx, input.companyId, input);
  const data = { inventoryAccountCode: config.inventoryAccountCode, stockGainAccountCode: config.stockGainAccountCode, stockLossAccountCode: config.stockLossAccountCode };
  const result = await tx.companySetting.upsert({ where: { companyId: input.companyId }, create: { companyId: input.companyId, ...data }, update: data });
  await audit(tx, input, "CompanySetting", input.companyId, "inventory.accounts"); return result;
 }, { isolationLevel: "Serializable" });
}
async function correctionJournal(tx: Tx, input: Base, entityType: string, doc: { id: string; number: string; warehouseId: string }, items: { productId: string; delta: Decimal }[]) {
 const config = await validateAccounts(tx, input.companyId, await tx.companySetting.findUnique({ where: { companyId: input.companyId } }));
 let gain = qty(0), loss = qty(0);
 for (const i of items) {
  const b = await balance(tx, doc.warehouseId, i.productId);
  if (i.delta.gt(0) && qty(b?.averageCost ?? 0).lte(0)) throw validationError("Biaya stok positif wajib untuk koreksi masuk; buat saldo awal bernilai dahulu");
  const value = new Decimal(toPrismaMoney(i.delta.mul(qty(b?.averageCost ?? 0)))); if (value.gt(0)) gain = gain.plus(value); else loss = loss.plus(value.abs());
 }
 const journalLines: { accountCode: string; debit?: string; credit?: string }[] = [];
 if (new Decimal(toPrismaMoney(gain)).gt(0)) journalLines.push({ accountCode: config.inventoryAccountCode, debit: toPrismaMoney(gain) }, { accountCode: config.stockGainAccountCode, credit: toPrismaMoney(gain) });
 if (new Decimal(toPrismaMoney(loss)).gt(0)) journalLines.push({ accountCode: config.stockLossAccountCode, debit: toPrismaMoney(loss) }, { accountCode: config.inventoryAccountCode, credit: toPrismaMoney(loss) });
 if (journalLines.length) await postJournal(tx, { companyId: input.companyId, sourceModule: "inventory", sourceDocType: entityType, sourceDocId: doc.id, description: `Koreksi ${doc.number}`, postedById: input.userId, idempotencyKey: `inventory:${entityType}:${doc.id}:journal`, lines: journalLines });
}
export async function importOpnameCsv(input: Base & { id: string; csv: string }) {
 if (typeof input.csv !== "string" || input.csv.length > 1000000) throw validationError("CSV terlalu besar");
 const rows = input.csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
 if (rows.shift() !== "itemId,count" || !rows.length || rows.length > 10000) throw validationError("Header CSV harus itemId,count");
 const counts = rows.map(row => { const cells = row.split(","); if (cells.length !== 2 || !/^[\w-]+$/.test(cells[0])) throw validationError("Baris CSV tidak valid"); return { itemId: cells[0], count: decimal(cells[1]) }; });
 if (new Set(counts.map(c => c.itemId)).size !== counts.length) throw validationError("Duplikat item CSV");
 return prisma.$transaction(async tx => {
  await lock(tx, `opname:doc:${input.companyId}:${input.id}`);
  const doc = await tx.stockOpname.findFirst({ where: { companyId: input.companyId, id: input.id }, include: { items: true } }); if (!doc) throw notFound();
  await warehouse(tx, input, doc.warehouseId); if (doc.status !== "COUNTING") throw conflict("Opname harus COUNTING");
  if (counts.some(c => !doc.items.some(i => i.id === c.itemId))) throw validationError("Item bukan snapshot opname");
  for (const c of counts) { const i = doc.items.find(i => i.id === c.itemId)!; await tx.stockOpnameItem.update({ where: { id: i.id }, data: { countedQty: toPrismaDecimal(c.count), differenceQty: toPrismaDecimal(c.count.minus(qty(i.systemQty))) } }); }
  await audit(tx, input, "StockOpname", doc.id, "count.import"); return { imported: counts.length };
 }, { isolationLevel: "Serializable" });
}
export async function saveLocation(input: Base & { kind: "branch" | "warehouse"; id?: string; code?: string; name?: string; branchId?: string; address?: string; city?: string; province?: string; phone?: string; email?: string; type?: WarehouseType; isActive?: boolean; remove?: boolean }) {
 if (!["branch", "warehouse"].includes(input.kind)) throw validationError("Jenis lokasi tidak valid");
 return prisma.$transaction(async tx => {
  await lock(tx, `locations:${input.companyId}`);
  const scoped = (id: string, ids: string[]) => { if (ids.length && !ids.includes(id)) throw forbidden("Lokasi di luar akses"); };
  if (input.kind === "branch" && input.access.warehouseIds.length) throw forbidden("Administrasi cabang memerlukan akses seluruh gudang");
  if (input.id) scoped(input.id, input.kind === "branch" ? input.access.branchIds : input.access.warehouseIds);
  if (!input.id && (input.access.branchIds.length || input.access.warehouseIds.length)) throw forbidden("Pembuatan lokasi memerlukan akses seluruh lokasi");
  const old = input.id ? input.kind === "branch" ? await tx.branch.findFirst({ where: { companyId: input.companyId, id: input.id } }) : await tx.warehouse.findFirst({ where: { companyId: input.companyId, id: input.id } }) : null;
  if (input.id && !old) throw notFound("Lokasi tidak ditemukan");
  if (input.kind === "warehouse") {
   const branchId = input.branchId ?? (old && "branchId" in old ? old.branchId : ""); scoped(branchId, input.access.branchIds);
   if (old && input.branchId && "branchId" in old && input.branchId !== old.branchId) throw conflict("Cabang gudang tidak dapat dipindah; buat gudang baru");
   if (!await tx.branch.findFirst({ where: { id: branchId, companyId: input.companyId, isActive: true } })) throw validationError("Cabang aktif wajib");
  }
  if (old?.isActive && (input.isActive === false || input.remove)) {
   if (input.kind === "warehouse" && await tx.stockTransfer.count({ where: { companyId: input.companyId, status: "IN_TRANSIT", OR: [{ fromWarehouseId: old.id }, { toWarehouseId: old.id }] } })) throw conflict("Gudang memiliki transfer dalam perjalanan");
   const count = input.kind === "branch" ? await tx.branch.count({ where: { companyId: input.companyId, isActive: true } }) : await tx.warehouse.count({ where: { companyId: input.companyId, isActive: true } });
   if (count <= 1) throw conflict("Minimal satu lokasi aktif wajib");
   if (input.kind === "branch" && await tx.warehouse.count({ where: { companyId: input.companyId, branchId: old.id, isActive: true } })) throw conflict("Nonaktifkan gudang cabang dahulu");
  }
  if (input.remove && old) {
   if (input.kind === "warehouse") {
    if (await tx.stockBalance.count({ where: { companyId: input.companyId, warehouseId: old.id, OR: [{ quantityOnHand: { not: 0 } }, { quantityReserved: { not: 0 } }] } }) || await tx.stockMovement.count({ where: { companyId: input.companyId, warehouseId: old.id } })) throw conflict("Gudang memiliki stok/transaksi; nonaktifkan saja");
    return tx.warehouse.delete({ where: { id: old.id } });
   }
   if (await tx.warehouse.count({ where: { companyId: input.companyId, branchId: old.id } }) || await tx.purchaseOrder.count({ where: { companyId: input.companyId, branchId: old.id } }) || await tx.salesOrder.count({ where: { companyId: input.companyId, branchId: old.id } }) || await tx.purchaseRequest.count({ where: { companyId: input.companyId, branchId: old.id } })) throw conflict("Cabang memiliki gudang/transaksi; nonaktifkan saja");
   return tx.branch.delete({ where: { id: old.id } });
  }
  if ((!old && (!input.code?.trim() || !input.name?.trim())) || input.code === "" || input.name === "") throw validationError("Kode dan nama wajib");
  const data = { ...(input.code != null ? { code: input.code.trim() } : {}), ...(input.name != null ? { name: input.name.trim() } : {}), ...(input.address != null ? { address: input.address } : {}), ...(input.isActive != null ? { isActive: input.isActive } : {}) };
  if (input.kind === "branch") {
   const branchData = { ...data, ...(input.city != null ? { city: input.city } : {}), ...(input.province != null ? { province: input.province } : {}), ...(input.phone != null ? { phone: input.phone } : {}), ...(input.email != null ? { email: input.email } : {}) };
   return old ? tx.branch.update({ where: { id: old.id }, data: branchData }) : tx.branch.create({ data: { ...branchData, companyId: input.companyId, code: input.code!.trim(), name: input.name!.trim() } });
  }
  return old ? tx.warehouse.update({ where: { id: old.id }, data: { ...data, ...(input.type ? { type: input.type } : {}) } }) : tx.warehouse.create({ data: { ...data, companyId: input.companyId, code: input.code!.trim(), name: input.name!.trim(), branchId: input.branchId!, type: input.type } });
 }, { isolationLevel: "Serializable" });
}
