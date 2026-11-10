-- C4+C5: purchase contract call-off + project billing
ALTER TABLE "PurchaseContract" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PurchaseContractItem" ADD COLUMN "ceilingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "usedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "usedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT;
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_companyId_supplierId_supplierInvoiceNo_key" UNIQUE ("companyId", "supplierId", "supplierInvoiceNo");
CREATE UNIQUE INDEX "PurchaseOrder_companyId_idempotencyKey_key" ON "PurchaseOrder"("companyId", "idempotencyKey");
ALTER TABLE "SalesInvoice" ADD COLUMN "projectId" TEXT REFERENCES "Project"("id");
CREATE INDEX "SalesInvoice_projectId_idx" ON "SalesInvoice"("projectId");
ALTER TABLE "ProjectTask" ADD COLUMN "billableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE TABLE "ProjectBilling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectBilling_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectBilling_companyId_idempotencyKey_key" ON "ProjectBilling"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "ProjectBilling_projectId_sourceType_sourceId_key" ON "ProjectBilling"("projectId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "ProjectBilling_invoiceId_key" ON "ProjectBilling"("invoiceId");
ALTER TABLE "ProjectBilling" ADD CONSTRAINT "ProjectBilling_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBilling" ADD CONSTRAINT "ProjectBilling_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
