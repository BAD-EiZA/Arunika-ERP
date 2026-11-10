-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;

ALTER TABLE "CustomerPayment" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_companyId_idempotencyKey_key" ON "SupplierPayment"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_companyId_idempotencyKey_key" ON "CustomerPayment"("companyId", "idempotencyKey");
