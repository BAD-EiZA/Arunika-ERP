# Independent return replacement contract

Parent schema owner: add these exact Prisma models before generate/typecheck. No DeliveryOrder or SO relationship. One full replacement per return; no partial replacement API.

```prisma
model ReturnReplacement {
  id String @id @default(cuid())
  companyId String
  salesReturnId String @unique
  warehouseId String
  number String
  idempotencyKey String
  requestHash String
  status DocumentStatus @default(DRAFT)
  postingRuleVersionId String
  createdById String
  postedAt DateTime?
  createdAt DateTime @default(now())
  items ReturnReplacementItem[]
  @@unique([companyId, number])
  @@unique([companyId, idempotencyKey])
}
model ReturnReplacementItem {
  id String @id @default(cuid())
  replacementId String
  sourceReturnItemId String @unique
  productId String
  quantity Decimal @db.Decimal(18, 4)
  unitCost Decimal @db.Decimal(18, 4)
  replacement ReturnReplacement @relation(fields: [replacementId], references: [id], onDelete: Restrict)
  @@unique([replacementId, productId])
}
```

SQL migration proposal (Prisma supplies cuid IDs application-side):
```sql
CREATE TABLE "ReturnReplacement" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "salesReturnId" TEXT NOT NULL UNIQUE REFERENCES "SalesReturn"("id"), "warehouseId" TEXT NOT NULL REFERENCES "Warehouse"("id"), "number" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', "postingRuleVersionId" TEXT NOT NULL REFERENCES "PostingRuleVersion"("id"), "createdById" TEXT NOT NULL, "postedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("companyId", "number"), UNIQUE ("companyId", "idempotencyKey"));
CREATE TABLE "ReturnReplacementItem" ("id" TEXT PRIMARY KEY, "replacementId" TEXT NOT NULL REFERENCES "ReturnReplacement"("id") ON DELETE RESTRICT, "sourceReturnItemId" TEXT NOT NULL UNIQUE REFERENCES "SalesReturnItem"("id"), "productId" TEXT NOT NULL REFERENCES "Product"("id"), "quantity" DECIMAL(18,4) NOT NULL CHECK ("quantity" > 0), "unitCost" DECIMAL(18,4) NOT NULL CHECK ("unitCost" >= 0), UNIQUE ("replacementId", "productId"));
```

## Mandatory parent integration

Implementation writes `SalesReturn.settlementStatus = "REPLACED"` atomically after journal success. Existing settlement/refund status guards reject this value. Credit-notes service currently checks ONLY legacy replacementDeliveryId: parent MUST extend its locked `current` guard to reject `current.settlementStatus === "REPLACED"` or dedicated replacement existence. This is a shipping blocker; UI disabling CN is not a security boundary.

Verification: focused returns 40 tests / 4 suites passed; focused ESLint clean; diff check clean. Typecheck blocked by missing generated ReturnReplacement model (parent schema/generate), plus concurrent other-module schema changes. Unit transaction failure propagation checked, not real PostgreSQL rollback/concurrency. No schema/service files outside owned paths edited.

Keep legacy SalesReturn.replacementDeliveryId unused: old non-null values block replacement/refund. Dedicated replacement lookup is authoritative for new records. Parent must add the same `return:sales:${id}` advisory lock and `returnReplacement.findUnique({where:{salesReturnId:id}})` guard to credit-note creation AND issuance; reject replacement before any financial write. Returns service owns reciprocal CN/refund guard. Without the CN-side guard concurrent exclusion is incomplete. Parent owns credit-notes service; do not ship without integration.

Posting config: exactly one active PostingRule `sourceEvent = return_replacement.post`, exactly one effective version. JSON `{ "lines": [{"side":"DEBIT","accountCode":"<approved COGS>"},{"side":"CREDIT","accountCode":"<approved inventory>"}] }`. No tax, formulas or extra keys. Accounts active, distinct, company-owned; debit type COGS, credit ASSET. No guessed codes. Save version ID. Stock outgoing SALES_DELIVERY, referenceType ReturnReplacement; never use DeliveryOrder, never update original SO or reservation. Cost is current issuing warehouse averageCost under the inventory pair advisory lock, not original return historical cost. Journal debit COGS / credit inventory at rounded movement cost.

`replaceSalesReturn({companyId,userId,id,targetWarehouseId,idempotencyKey})`: validates key/warehouse; serializable transaction, return lock then key lock; replay requires matching request hash. Return POSTED, inspected/approved; settlement DRAFT, no refund, legacy replacement or any non-cancelled CN. MAIN active replacement warehouse must share quarantine branch. Revalidate original invoice item/movement quantity ceilings under source locks. Full return quantity only. Dedicated document, stock and journal committed atomically; failure rolls all back. Serializable conflicts return retryable conflict via existing API; no unsafe partial retry.

API action `replacement` accepts idempotencyKey. GET returns replacement object `{id,number,status,warehouseId}`. UI stores key across retry and disables CN/refund when replacement exists. Live PostgreSQL concurrency/rollback remains parent integration verification, not established by mocked unit tests.
