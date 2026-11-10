ALTER TABLE "SalesInvoice" ADD COLUMN "idempotencyKey" TEXT, ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "SalesInvoice_companyId_idempotencyKey_key" ON "SalesInvoice"("companyId", "idempotencyKey");
