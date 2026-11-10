# Inventory completion contract

Ownership: inventory-workflows.ts, api/erp/inventory/**, inventory/**, settings/locations/**, inventory-completion.test.ts. No schema edits by this agent.

## Parent schema request (apply before integration)
Add nullable `String?` fields to `CompanySetting`: `inventoryAccountCode`, `stockGainAccountCode`, `stockLossAccountCode`. No defaults: never infer account codes. API configuration validates active tenant accounts: inventory ASSET, gain REVENUE/OTHER_INCOME, loss EXPENSE/OTHER_EXPENSE; distinct codes. Posting revalidates configuration in the same Serializable transaction. Scalar codes deliberately use existing tenant+code Account unique key; no new relation needed.

SQL proposal:
```sql
ALTER TABLE "CompanySetting"
  ADD COLUMN "inventoryAccountCode" TEXT,
  ADD COLUMN "stockGainAccountCode" TEXT,
  ADD COLUMN "stockLossAccountCode" TEXT;
ALTER TABLE "CompanySetting" ADD CONSTRAINT "inventory_accounts_distinct" CHECK (
  "inventoryAccountCode" IS NULL OR "stockGainAccountCode" IS NULL OR "stockLossAccountCode" IS NULL OR
  ("inventoryAccountCode" <> "stockGainAccountCode" AND "inventoryAccountCode" <> "stockLossAccountCode" AND "stockGainAccountCode" <> "stockLossAccountCode")
);
```
Existing transfers use `receivedQty` cumulative targets; `IN_TRANSIT` covers partial receipts. Final difference receipt returns unreceived quantity to origin at historic dispatch cost, never silently writes off stock. A receipt with explicit `items` is a cumulative target, not an increment; no-items legacy receive fills all remaining quantities. A final difference requires `stock:adjust`, both warehouse scopes, and reason; ordinary receive requires destination scope. Post-send reversal uses `CANCELLED` plus audit action `reverse`, requires both warehouse scopes and `stock:adjust`. Reversal rejects reserved/insufficient destination balance or changed moving-average cost, requiring a separate valued correction; no new movement enum or invented `OPNAME_CORRECTION` sign behavior. Existing TRANSFER_IN/OUT and ADJUSTMENT_IN/OUT remain authoritative. All movement keys document+item+operation; receipt replay payload validated via audit hash under document lock. Approval valuation, stock snapshot, reservations, tenant/access checks remain required.

CSV count import format: exact header `itemId,count`; snapshot item IDs only, decimal <=4 places, nonnegative, duplicate/unknown rows reject whole transaction. Printable authenticated count sheet includes full snapshot, blank count fields, no public attachment URL.

Private attachments reuse FileAsset and existing authenticated upload/download service, with inventory-specific entity/access checks in owned API paths. No schema addition for attachments.

## Delivered surfaces
- `/inventory/workflows`: cumulative partial receipts, final difference return, post-send reversal reason, zero-balance snapshot, CSV paste/file input, authenticated printable sheet, private upload/download, validated account selectors.
- `POST /api/erp/inventory`: existing commands plus `count-import` (`id,csv`), `accounts` (three code fields), transfer-action `items:[{itemId,quantity}]`, `final`, `reason`, `reverse`. Configuration requires `company:update`; difference/reverse additionally require `stock:adjust`.
- `/api/erp/inventory/count-sheet?id=...`: scoped HTML, escaped text, CSP, private/no-store; browser Ctrl+P prints.
- `/api/erp/inventory/files/{signature,complete,[id]/download}`: existing hardened Cloudinary protocol copied into owned inventory namespace; strict private inventory allowlist, document status and both transfer locations checked. `/files?entityType=...&entityId=...` lists IDs/names only.
- Adjustment/opname corrections call existing `postJournal` in same Serializable stock transaction; fiscal-period guards remain in accounting service. Gain/loss journal amounts sum individually rounded movement costs, never binary floating-point. Missing/wrong-type/inactive accounts fail closed.

## Integration requirements / honest ceilings
Parent must apply three CompanySetting fields above then regenerate Prisma. Typecheck currently reports exactly two inventory errors from those missing fields, plus parallel modules' pending-schema errors; no casts suppress them.
Existing `inventory-workflows.test.ts` fixtures need parent updates: add `product.findMany` returning `[{id:"p"}]`; add companySetting/account delegates for configured INV/GAIN/LOSS and mock `postJournal`. Existing full-receipt movement key is preserved. Do not weaken production GL requirement to satisfy pre-GL mocks. This agent did not edit that unowned test file.
Positive count/adjustment at a zero-cost product is intentionally rejected at posting: no guessed purchase cost. Establish an explicitly valued opening balance, recreate snapshot/approval. Zero-balance products remain countable including zero counts.
Difference finalization here means physical return to origin, not transit-loss writeoff; confirmed loss must use a separate approved adjustment. Destination moving-average change blocks reversal rather than silently corrupting value. CSV intentionally strict two unquoted columns (IDs/numeric counts contain no commas). Manual print, no generated PDF dependency.
Verified: `npm test -- --coverage=false inventory-completion.test.ts inventory.test.ts` → 41/41 pass; scoped `npx eslint` → 0 errors; `git diff --check` → clean. `npm run typecheck` blocked by missing parent schema fields and parallel modules. Existing `inventory-workflows.test.ts` has 3 pre-GL/stale-snapshot fixture failures; parent must update fixtures as above. Focused tests mock persistence and movement/journal boundaries. No live PostgreSQL concurrency/rollback, Cloudinary upload, browser acceptance, or production readiness claimed.
