-- Return sources: source linkage, inspection/disposition/approval, idempotency (additive; returns section only)

ALTER TABLE "SalesReturn" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT,
ADD COLUMN "inspectionNotes" TEXT,
ADD COLUMN "disposition" TEXT,
ADD COLUMN "inspectedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "releasedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "SalesReturn_companyId_idempotencyKey_key" ON "SalesReturn"("companyId", "idempotencyKey");

ALTER TABLE "SalesReturnItem" ADD COLUMN "sourceItemId" TEXT,
ADD COLUMN "sourceMovementId" TEXT,
ADD COLUMN "historicalUnitCost" DECIMAL(18,4),
ADD COLUMN "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
CREATE INDEX "SalesReturnItem_sourceItemId_idx" ON "SalesReturnItem"("sourceItemId");

ALTER TABLE "PurchaseReturn" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT,
ADD COLUMN "inspectionNotes" TEXT,
ADD COLUMN "inspectedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "releasedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PurchaseReturn_companyId_idempotencyKey_key" ON "PurchaseReturn"("companyId", "idempotencyKey");

ALTER TABLE "PurchaseReturnItem" ADD COLUMN "sourceReceiptItemId" TEXT,
ADD COLUMN "sourceMovementId" TEXT,
ADD COLUMN "sourceBillItemId" TEXT,
ADD COLUMN "historicalUnitCost" DECIMAL(18,4),
ADD COLUMN "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
CREATE INDEX "PurchaseReturnItem_sourceReceiptItemId_idx" ON "PurchaseReturnItem"("sourceReceiptItemId");

CREATE UNIQUE INDEX "CreditNote_companyId_salesReturnId_key" ON "CreditNote"("companyId", "salesReturnId");
CREATE UNIQUE INDEX "DebitNote_companyId_purchaseReturnId_key" ON "DebitNote"("companyId", "purchaseReturnId");

ALTER TABLE "CreditNoteItem" ADD COLUMN "sourceReturnItemId" TEXT;
ALTER TABLE "DebitNoteItem" ADD COLUMN "sourceReturnItemId" TEXT;
