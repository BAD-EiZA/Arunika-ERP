BEGIN;

-- Existing schema declared this tenant key, but prior migrations omitted it.
CREATE UNIQUE INDEX "Employee_companyId_id_key" ON "Employee"("companyId", "id");

-- AlterTable
ALTER TABLE "CompanySetting" ADD COLUMN     "inventoryAccountCode" TEXT,
ADD COLUMN     "stockGainAccountCode" TEXT,
ADD COLUMN     "stockLossAccountCode" TEXT;

-- AlterTable
ALTER TABLE "TaxRegistration" ADD COLUMN     "authorizationMetadata" JSONB,
ADD COLUMN     "changedById" TEXT,
ADD COLUMN     "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "effectiveTo" TIMESTAMP(3),
ADD COLUMN     "nik" TEXT,
ADD COLUMN     "signingAuthority" TEXT,
ADD COLUMN     "taxAddress" TEXT,
ADD COLUMN     "taxCalendar" TEXT,
ADD COLUMN     "taxContact" TEXT;

-- AlterTable
ALTER TABLE "TaxCode" ADD COLUMN     "baseMultiplier" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "inclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalReference" TEXT,
ADD COLUMN     "recoverablePercent" DECIMAL(8,4) NOT NULL DEFAULT 100,
ADD COLUMN     "rounding" TEXT NOT NULL DEFAULT 'HALF_UP';

-- AlterTable
ALTER TABLE "TaxDocument" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "glAccountCode" TEXT,
ADD COLUMN     "ruleSnapshot" JSONB,
ADD COLUMN     "taxCodeId" TEXT;

-- AlterTable
ALTER TABLE "MrpRun" ADD COLUMN     "parameters" JSONB;

-- AlterTable
ALTER TABLE "MrpSuggestion" ADD COLUMN     "decision" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "releaseDate" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "ProjectExpense" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "creditAccountCode" TEXT,
ADD COLUMN     "debitAccountCode" TEXT,
ADD COLUMN     "journalId" TEXT;

-- CreateTable
CREATE TABLE "ProjectCostAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "ProjectCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnReplacement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "postingRuleVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnReplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnReplacementItem" (
    "id" TEXT NOT NULL,
    "replacementId" TEXT NOT NULL,
    "sourceReturnItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "ReturnReplacementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPayrollSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPayrollSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveLedger" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "days" DECIMAL(8,2) NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "history" JSONB,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "TaxPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxExportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE_READY',
    "submissionReference" TEXT,
    "responses" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxExportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "billingReference" TEXT NOT NULL,
    "bankReference" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "allocations" JSONB NOT NULL,
    "journalId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCostAllocation_journalLineId_key" ON "ProjectCostAllocation"("journalLineId");

-- CreateIndex
CREATE INDEX "ProjectCostAllocation_companyId_projectId_idx" ON "ProjectCostAllocation"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReplacement_salesReturnId_key" ON "ReturnReplacement"("salesReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReplacement_companyId_number_key" ON "ReturnReplacement"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReplacement_companyId_idempotencyKey_key" ON "ReturnReplacement"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReplacementItem_sourceReturnItemId_key" ON "ReturnReplacementItem"("sourceReturnItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReplacementItem_replacementId_productId_key" ON "ReturnReplacementItem"("replacementId", "productId");

-- CreateIndex
CREATE INDEX "HrPayrollSource_companyId_employeeId_workDate_idx" ON "HrPayrollSource"("companyId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "LeaveLedger_companyId_employeeId_leaveType_effectiveDate_idx" ON "LeaveLedger"("companyId", "employeeId", "leaveType", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveLedger_companyId_sourceKey_key" ON "LeaveLedger"("companyId", "sourceKey");

-- CreateIndex
CREATE INDEX "TaxPeriod_companyId_idx" ON "TaxPeriod"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxPeriod_companyId_period_key" ON "TaxPeriod"("companyId", "period");

-- CreateIndex
CREATE INDEX "TaxExportBatch_companyId_idx" ON "TaxExportBatch"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxExportBatch_companyId_period_revision_format_key" ON "TaxExportBatch"("companyId", "period", "revision", "format");

-- CreateIndex
CREATE INDEX "TaxPayment_companyId_idx" ON "TaxPayment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxPayment_companyId_bankReference_key" ON "TaxPayment"("companyId", "bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDocument_companyId_replacesId_key" ON "TaxDocument"("companyId", "replacesId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExpense_journalId_key" ON "ProjectExpense"("journalId");

-- AddForeignKey
ALTER TABLE "ProjectCostAllocation" ADD CONSTRAINT "ProjectCostAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCostAllocation" ADD CONSTRAINT "ProjectCostAllocation_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReplacement" ADD CONSTRAINT "ReturnReplacement_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReplacement" ADD CONSTRAINT "ReturnReplacement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReplacement" ADD CONSTRAINT "ReturnReplacement_postingRuleVersionId_fkey" FOREIGN KEY ("postingRuleVersionId") REFERENCES "PostingRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReplacementItem" ADD CONSTRAINT "ReturnReplacementItem_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReturnReplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReplacementItem" ADD CONSTRAINT "ReturnReplacementItem_sourceReturnItemId_fkey" FOREIGN KEY ("sourceReturnItemId") REFERENCES "SalesReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReplacementItem" ADD CONSTRAINT "ReturnReplacementItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPayrollSource" ADD CONSTRAINT "HrPayrollSource_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Legacy taxpayer profiles retain their original effective date; no rollout-date guess.
UPDATE "TaxRegistration" SET "effectiveFrom" = "createdAt";
ALTER TABLE "ProjectExpense" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
-- Existing POSTED expenses are intentionally not rewritten or assigned guessed journals.

ALTER TABLE "CompanySetting" ADD CONSTRAINT "inventory_accounts_distinct" CHECK (
  "inventoryAccountCode" IS NULL OR "stockGainAccountCode" IS NULL OR "stockLossAccountCode" IS NULL OR
  ("inventoryAccountCode" <> "stockGainAccountCode" AND "inventoryAccountCode" <> "stockLossAccountCode" AND "stockGainAccountCode" <> "stockLossAccountCode")
);
ALTER TABLE "MrpSuggestion" ADD CONSTRAINT "MrpSuggestion_decision_check"
 CHECK ("decision" IN ('PENDING','ACCEPTED','MODIFIED','REJECTED'));
ALTER TABLE "ProjectCostAllocation"
 ADD CONSTRAINT "ProjectCostAllocation_kind_check" CHECK ("kind" IN ('PAYROLL','MATERIAL')),
 ADD CONSTRAINT "ProjectCostAllocation_amount_check" CHECK ("amount" > 0),
 ADD CONSTRAINT "ProjectCostAllocation_status_check" CHECK ("status" IN ('POSTED','VOID'));
ALTER TABLE "ReturnReplacementItem"
 ADD CONSTRAINT "ReturnReplacementItem_quantity_check" CHECK ("quantity" > 0),
 ADD CONSTRAINT "ReturnReplacementItem_unitCost_check" CHECK ("unitCost" >= 0);
ALTER TABLE "HrPayrollSource"
 ADD CONSTRAINT "HrPayrollSource_kind_check" CHECK ("kind" IN ('ATTENDANCE','OVERTIME','ADJUSTMENT','LEAVE_GRANT')),
 ADD CONSTRAINT "HrPayrollSource_status_check" CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED')),
 ADD CONSTRAINT "HrPayrollSource_checker_check" CHECK (
   ("status" = 'PENDING_APPROVAL' AND "approvedById" IS NULL AND "approvedAt" IS NULL) OR
   ("status" IN ('APPROVED','REJECTED') AND "approvedById" IS NOT NULL AND "approvedById" <> "createdById" AND "approvedAt" IS NOT NULL)
 );

CREATE FUNCTION completion_hr_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW."status" <> 'PENDING_APPROVAL' THEN RAISE EXCEPTION 'HR source must start pending approval'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'HR source is immutable'; END IF;
 IF OLD."status" <> 'PENDING_APPROVAL' OR NEW."status" NOT IN ('APPROVED','REJECTED') OR
    (to_jsonb(NEW) - ARRAY['status','approvedById','approvedAt']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','approvedById','approvedAt']) THEN
   RAISE EXCEPTION 'HR source permits only one pending approval transition';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "HrPayrollSource_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "HrPayrollSource"
 FOR EACH ROW EXECUTE FUNCTION completion_hr_source_guard();

CREATE FUNCTION completion_leave_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Leave ledger is append-only';
END;
$$;
CREATE TRIGGER "LeaveLedger_append_only" BEFORE UPDATE OR DELETE ON "LeaveLedger"
 FOR EACH ROW EXECUTE FUNCTION completion_leave_ledger_guard();

CREATE FUNCTION completion_replacement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status" = 'POSTED' THEN RAISE EXCEPTION 'Posted replacement is immutable'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "ReturnReplacement_posted_immutable" BEFORE UPDATE OR DELETE ON "ReturnReplacement"
 FOR EACH ROW EXECUTE FUNCTION completion_replacement_guard();

CREATE FUNCTION completion_replacement_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "DocumentStatus";
BEGIN
 -- Lock both parents in stable order on moves; serialize item changes against posting.
 IF TG_OP IN ('UPDATE','DELETE') THEN
   PERFORM 1 FROM "ReturnReplacement" WHERE "id" IN (OLD."replacementId", CASE WHEN TG_OP = 'UPDATE' THEN NEW."replacementId" ELSE OLD."replacementId" END) ORDER BY "id" FOR UPDATE;
   SELECT "status" INTO parent_status FROM "ReturnReplacement" WHERE "id" = OLD."replacementId";
   IF parent_status = 'POSTED' THEN RAISE EXCEPTION 'Posted replacement items are immutable'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
   SELECT "status" INTO parent_status FROM "ReturnReplacement" WHERE "id" = NEW."replacementId" FOR UPDATE;
   IF parent_status = 'POSTED' THEN RAISE EXCEPTION 'Posted replacement items are immutable'; END IF;
   RETURN NEW;
 END IF;
 RETURN OLD;
END;
$$;
CREATE TRIGGER "ReturnReplacementItem_posted_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "ReturnReplacementItem"
 FOR EACH ROW EXECUTE FUNCTION completion_replacement_item_guard();

COMMIT;
