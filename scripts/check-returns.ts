/**
 * Returns integration check — runnable against the scratch Postgres ONLY.
 * Usage: RETURNS_SCRATCH_DATABASE_URL=<scratch> npx tsx scripts/check-returns.ts
 * Creates isolated scratch company fixtures. Never run against production.
 */
import { rejects } from "node:assert/strict";
if (!process.env.RETURNS_SCRATCH_DATABASE_URL) throw new Error("RETURNS_SCRATCH_DATABASE_URL required; scratch database ONLY");
process.env.DATABASE_URL = process.env.RETURNS_SCRATCH_DATABASE_URL;

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`ok - ${msg}`); }

async function main() {
const { prisma } = await import("../src/lib/db");
const { createSalesReturn, approveReturn, postSalesReturn, createPurchaseReturn, postPurchaseReturn } = await import("../src/server/services/returns");
const { createCreditNoteFromReturn, createDebitNoteFromPurchaseReturn } = await import("../src/server/services/credit-notes");
const { money } = await import("../src/lib/money");

const token = Date.now().toString();
const company = await prisma.company.create({ data: { code: `RET-${token}`, name: "Returns scratch" } });
const user = { id: "scratch-user" };
const branch = await prisma.branch.create({ data: { companyId: company.id, code: "HQ", name: "HQ" } });
const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, branchId: branch.id, code: "MAIN", name: "Main" } });
const unit = await prisma.unit.create({ data: { companyId: company.id, name: "Piece", symbol: "pc" } });
const product = await prisma.product.create({ data: { companyId: company.id, unitId: unit.id, sku: "TEST", name: "Test" } });
const supplier = await prisma.supplier.create({ data: { companyId: company.id, code: "SUP", name: "Supplier" } });
const customer = await prisma.customer.create({ data: { companyId: company.id, code: "CUS", name: "Customer" } });
const now = Date.now();
await prisma.fiscalYear.create({ data: { companyId: company.id, name: "Test", startDate: new Date(now-86400000), endDate: new Date(now+86400000), periods: { create: [{name: "Test", startDate: new Date(now-86400000), endDate: new Date(now+86400000)}] } } });
for (const code of ["1130","2110","2100","1120","1140","2120","4100","5100"]) await prisma.account.create({ data: { companyId: company.id, code, name: code, type: "ASSET", normalBalance: "DEBIT" } });
await prisma.postingRule.create({ data: { companyId: company.id, code: "CN", name: "CN", sourceEvent: "credit_note.issue", versions: { create: [{version: 1,effectiveFrom: new Date(now-86400000),config: {lines: []}}] } } });
// ── Purchase leg: PO → GR → SRN/PRN ──
const po = await prisma.purchaseOrder.create({ data: { companyId: company.id, number: `INT-PO-${Date.now()}`, supplierId: supplier.id, warehouseId: warehouse.id, status: "CONFIRMED", orderDate: new Date(), expectedDate: new Date(), items: { create: [{ productId: product.id, description: "x", quantity: "10", unitPrice: "150", total: "1500" }] } } });
const gr = await prisma.goodsReceipt.create({ data: { companyId: company.id, purchaseOrderId: po.id, warehouseId: warehouse.id, supplierId: supplier.id, number: `INT-GR-${Date.now()}`, status: "POSTED", postedAt: new Date(), createdById: user.id, items: { create: [{ productId: product.id, quantityOrdered: "10", quantityReceived: "10", unitCost: "150" }] } } });
await prisma.stockMovement.create({ data: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, type: "PURCHASE_RECEIPT", quantity: "10", unitCost: "150", totalCost: "1500", referenceType: "GoodsReceipt", referenceId: gr.id, referenceNumber: gr.number } });
const bill = await prisma.supplierBill.create({ data: { companyId: company.id, supplierId: supplier.id, purchaseOrderId: po.id, number: `INT-SB-${Date.now()}`, status: "OPEN", subtotal: "1500", taxAmount: "165", total: "1665", balance: "1665", items: { create: [{ productId: product.id, description: "x", quantity: "10", unitPrice: "150", taxAmount: "165", total: "1665" }] } } });
await prisma.stockBalance.upsert({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } }, create: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, quantityOnHand: "10", averageCost: "150" }, update: { quantityOnHand: "10", averageCost: "150" } });

const grItem = (await prisma.goodsReceiptItem.findFirst({ where: { goodsReceiptId: gr.id } }))!;
const prn = await createPurchaseReturn({ companyId: company.id, userId: user.id, supplierId: supplier.id, warehouseId: warehouse.id, idempotencyKey: `int-prn-${Date.now()}`, reason: "rusak", items: [{ productId: product.id, quantity: 4, sourceReceiptItemId: grItem.id }] });
assert(money(prn.total).eq(money("666")), `PRN total proporsional bill 666 (got ${prn.total})`);
await rejects(() => postPurchaseReturn({ companyId: company.id, userId: user.id, id: prn.id, warehouseId: warehouse.id }), /Inspeksi dan approval wajib/, "posting tanpa approval ditolak");
await approveReturn({ companyId: company.id, userId: user.id, id: prn.id, kind: "purchase", inspectionNotes: "retak" });
const prnPosted = await postPurchaseReturn({ companyId: company.id, userId: user.id, id: prn.id, warehouseId: warehouse.id });
assert(prnPosted.status === "POSTED", "PRN POSTED");
const balAfterPrn = await prisma.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } });
assert(money(balAfterPrn!.quantityOnHand).eq(money("6")), "stok keluar 4 → 6");
const jePrn = await prisma.journal.findFirst({ where: { companyId: company.id, sourceDocId: prn.id }, include: { lines: true } });
assert(jePrn?.lines.length === 2, "jurnal PRN 2 baris (2110/1130)");
const dn = await createDebitNoteFromPurchaseReturn({ companyId: company.id, userId: user.id, purchaseReturnId: prn.id });
assert(money(dn.total).eq(money("666")), `DN total 666 (got ${dn.total})`);
const billAfter = await prisma.supplierBill.findUnique({ where: { id: bill.id } });
assert(money(billAfter!.balance).eq(money("999")), `AP balance 1665-666=999 (got ${billAfter!.balance})`);
const dnAgain = await createDebitNoteFromPurchaseReturn({ companyId: company.id, userId: user.id, purchaseReturnId: prn.id });
assert(dnAgain.id === dn.id, "DN idempoten");
const cnStockJournals = await prisma.journal.count({ where: { companyId: company.id, sourceDocId: dn.id } });
assert(cnStockJournals === 1, "satu jurnal DN saja");

// ── Sales leg: SO → DO → INV → SR ──
const so = await prisma.salesOrder.create({ data: { companyId: company.id, number: `INT-SO-${Date.now()}`, customerId: customer.id, warehouseId: warehouse.id, status: "CONFIRMED", orderDate: new Date(), paymentTermDays: 30, items: { create: [{ productId: product.id, description: "x", quantity: "6", unitPrice: "250", total: "1500" }] } } });
const delivery = await prisma.deliveryOrder.create({ data: { companyId: company.id, salesOrderId: so.id, customerId: customer.id, warehouseId: warehouse.id, number: `INT-DO-${Date.now()}`, status: "POSTED", deliveryDate: new Date(), postedAt: new Date(), createdById: user.id, items: { create: [{ productId: product.id, quantityOrdered: "6", quantityDelivered: "6" }] } } });
await prisma.stockMovement.create({ data: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, type: "SALES_DELIVERY", quantity: "6", unitCost: "150", totalCost: "900", referenceType: "DeliveryOrder", referenceId: delivery.id, referenceNumber: delivery.number } });
await prisma.stockBalance.update({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } }, data: { quantityOnHand: "0" } });
const inv = await prisma.salesInvoice.create({ data: { companyId: company.id, customerId: customer.id, salesOrderId: so.id, deliveryOrderId: delivery.id, number: `INT-INV-${Date.now()}`, status: "ISSUED", issuedAt: new Date(), subtotal: "1500", taxAmount: "0", total: "1500", balance: "1500", items: { create: [{ productId: product.id, description: "x", quantity: "6", unitPrice: "250", total: "1500" }] } } });
const invItem = (await prisma.salesInvoiceItem.findFirst({ where: { invoiceId: inv.id } }))!;
const sr = await createSalesReturn({ companyId: company.id, userId: user.id, customerId: customer.id, salesInvoiceId: inv.id, warehouseId: warehouse.id, idempotencyKey: `int-sr-${Date.now()}`, reason: "salah kirim", items: [{ productId: product.id, quantity: 3, sourceItemId: invItem.id }] });
assert(money(sr.total).eq(money("750")), `SR total proporsional 750 (got ${sr.total})`);
assert(money(sr.items[0].historicalUnitCost ?? 0).eq(money("150")), "SR pakai biaya historis 150, bukan harga jual");
await createSalesReturn({ companyId: company.id, userId: user.id, customerId: customer.id, salesInvoiceId: inv.id, warehouseId: warehouse.id, idempotencyKey: `int-sr-${Date.now()}`, items: [{ productId: product.id, quantity: 3, sourceItemId: invItem.id }] });
await rejects(() => createSalesReturn({ companyId: company.id, userId: user.id, customerId: customer.id, salesInvoiceId: inv.id, warehouseId: warehouse.id, idempotencyKey: `int-sr2-${Date.now()}`, items: [{ productId: product.id, quantity: 4, sourceItemId: invItem.id }] }), /melebihi/, "return melebihi sisa qty ditolak");
await rejects(() => postSalesReturn({ companyId: company.id, userId: user.id, id: sr.id, warehouseId: warehouse.id }), /Inspeksi dan approval wajib/, "posting SR tanpa approval ditolak");
await approveReturn({ companyId: company.id, userId: user.id, id: sr.id, kind: "sales", inspectionNotes: "cek fisik", disposition: "QUARANTINE" });
const srPosted = await postSalesReturn({ companyId: company.id, userId: user.id, id: sr.id, warehouseId: warehouse.id });
assert(srPosted.status === "POSTED", "SR POSTED (karantina)");
const balAfterSr = await prisma.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } });
assert(money(balAfterSr!.quantityOnHand).eq(money("3")) && money(balAfterSr!.quantityReserved).eq(money("3")), `karantina: onHand 3 reserved 3 (got ${balAfterSr!.quantityOnHand}/${balAfterSr!.quantityReserved})`);
const cn = await createCreditNoteFromReturn({ companyId: company.id, userId: user.id, salesReturnId: sr.id });
assert(money(cn.total).eq(money("750")), `CN total 750 (got ${cn.total})`);
const invAfter = await prisma.salesInvoice.findUnique({ where: { id: inv.id } });
assert(money(invAfter!.balance).eq(money("750")), `AR balance 1500-750=750 (got ${invAfter!.balance})`);
const srJournals = await prisma.journal.findMany({ where: { companyId: company.id, sourceDocId: sr.id } });
assert(srJournals.length === 1, "satu jurnal stok SR saja, CN terpisah");
const cnJournal = await prisma.journal.findFirst({ where: { companyId: company.id, sourceDocId: cn.id } });
assert(cnJournal !== null, "jurnal CN (financial leg) ada");

console.log("\nRETURNS INTEGRATION OK");
await prisma.$disconnect();
}
main().catch(async error => { console.error(error); process.exitCode = 1; });
