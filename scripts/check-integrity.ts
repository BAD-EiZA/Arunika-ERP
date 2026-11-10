// Run only against a migrated, disposable PostgreSQL database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL wajib menunjuk database pengujian terpisah");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { prisma } = await import("../src/lib/db");
  const { postStockMovement, adjustReservation } = await import("../src/server/services/inventory");
  const { postFromRule } = await import("../src/server/services/accounting");
  const ids: string[] = [];
  try {
    const fixtures = [];
    for (let i = 0; i < 2; i++) {
      const company = await prisma.company.create({ data: { code: `test-${randomUUID()}`, name: "Integrity test" } });
      ids.push(company.id);
      const branch = await prisma.branch.create({ data: { companyId: company.id, code: "HQ", name: "HQ" } });
      const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, branchId: branch.id, code: "MAIN", name: "Main" } });
      const unit = await prisma.unit.create({ data: { companyId: company.id, name: "Piece", symbol: "pc" } });
      const product = await prisma.product.create({ data: { companyId: company.id, unitId: unit.id, sku: "TEST", name: "Test" } });
      fixtures.push({ companyId: company.id, warehouseId: warehouse.id, productId: product.id });
    }
    const [a, b] = fixtures;
    const inbound = { ...a, type: "OPENING_BALANCE" as const, quantity: "1", unitCost: "10" };
    await assert.rejects(prisma.$transaction(tx => postStockMovement(tx, { ...inbound, warehouseId: b.warehouseId })));
    assert.equal(await prisma.stockMovement.count({ where: { companyId: a.companyId } }), 0);
    await Promise.all(Array.from({ length: 8 }, (_, i) => prisma.$transaction(tx => postStockMovement(tx, { ...inbound, idempotencyKey: `parallel-${i}` }), { timeout: 30000 })));
    const balance = await prisma.stockBalance.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId: a.warehouseId, productId: a.productId } } });
    assert.equal(balance.quantityOnHand.toString(), "8");
    assert.equal(await prisma.stockMovement.count({ where: { companyId: a.companyId } }), 8);
    await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction(tx => postStockMovement(tx, { ...inbound, idempotencyKey: "same-request" }), { timeout: 30000 })));
    const afterRetry = await prisma.stockBalance.findUniqueOrThrow({ where: { id: balance.id } });
    assert.equal(afterRetry.quantityOnHand.toString(), "9");
    const reservations = await Promise.allSettled(Array.from({ length: 2 }, () => prisma.$transaction(tx => adjustReservation(tx, { ...a, delta: "6" }), { timeout: 30000 })));
    assert.equal(reservations.filter(r => r.status === "fulfilled").length, 1);
    await assert.rejects(prisma.$transaction(async tx => {
      await postStockMovement(tx, { ...inbound, idempotencyKey: "must-rollback" });
      await postFromRule(tx, { companyId: a.companyId, sourceEvent: "missing.rule", sourceDocType: "Test", sourceDocId: "test", description: "Rollback test", amount: "10", idempotencyKey: "missing-journal" });
    }));
    assert.equal(await prisma.stockMovement.count({ where: { companyId: a.companyId, idempotencyKey: "must-rollback" } }), 0);
    console.log("PASS: cross-tenant rejection, concurrent stock updates, retry idempotency, reservation contention, journal rollback");
  } finally {
    for (const companyId of ids) await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
