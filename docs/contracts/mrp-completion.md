# MRP completion contract

Parent-owned schema additions (exact):
```prisma
// MrpRun
parameters Json?
// MrpSuggestion
releaseDate DateTime?
decision String @default("PENDING") // PENDING / ACCEPTED / MODIFIED / REJECTED
reviewedById String?
reviewedAt DateTime?
```
SQL proposal (PostgreSQL):
```sql
ALTER TABLE "MrpRun" ADD COLUMN "parameters" JSONB;
ALTER TABLE "MrpSuggestion" ADD COLUMN "releaseDate" TIMESTAMP(3),
 ADD COLUMN "decision" TEXT NOT NULL DEFAULT 'PENDING',
 ADD COLUMN "reviewedById" TEXT, ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "MrpSuggestion" ADD CONSTRAINT "MrpSuggestion_decision_check"
 CHECK ("decision" IN ('PENDING','ACCEPTED','MODIFIED','REJECTED'));
```
No backfilled planning guesses. POST /api/erp/mrp requires `planning` object:
`{calendar:{workingDays:[1,2,3,4,5],holidays:["2026-12-25"]},products:[{productId,leadTimeDays:2,lotSize:"10",safetyStock:"0"}]}`.
Working days UTC Sunday=0; explicit calendar and parameters required for every demanded/BOM/supply product. Values above examples only, never defaults. Lead time integer 0..3660 working days; lot size >0; safety >=0; quantities <= 99999999999999.9999, max four decimals. Run snapshots planning + horizon. Calendar applies backward to receipt/release; components required on parent's release. Missing configuration fails closed.
Company-wide scope; transaction-scoped PostgreSQL advisory try-lock acquired before reads; concurrent overlapping company run returns 409. All reads and writes within same transaction. No process-local lock.
Reservation: active SO reservations already represented by remaining SO demand are not counted twice; excess/unlinked active reservations reduce available inventory. Company-level stock scope (all warehouses).
Per-order `sourceRef`: `PO:<purchaseOrderItem.id>` / `MO:<productionOrder.id>`. RESCHEDULE moves an identified receipt to shortage date (full remaining order quantity); CANCEL only completely unused receipts within horizon; both advisory, never mutate orders. Partial excess retained (no speculative quantity reduction).
POST /api/erp/mrp/review: `{suggestionId,action:"accept"|"modify"|"reject",quantity?,dueDate?}`. Modify requires positive quantity/date; cancel cannot modify quantity. Review CAS only PENDING; converted/reviewed returns 409. Audit reviewer/time persisted. Conversion only ACCEPTED/MODIFIED PURCHASE/PRODUCE; dueDate copied to PO expectedDate / MO plannedEnd; releaseDate to MO plannedStart. Recommendation accept only records decision, never changes posted source orders.
UI exposes explicit configuration JSON, per-row review form, conversion supplier/warehouse inputs. No automatic commit.
Verification: mocked persistence tests establish application producer-consumer behavior, not live PostgreSQL concurrency or browser acceptance. Parent must apply migration/regenerate client, verify live advisory lock and browser.
