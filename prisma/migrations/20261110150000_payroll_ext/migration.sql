-- Payroll extensions: components (THR/bonus/allowance/overtime), private payslips, liability settlement.
ALTER TABLE "EmployeePayrollProfile" ADD COLUMN "fixedAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "EmployeePayrollProfile" ADD COLUMN "overtimeRate" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Self-service payslip scoping: only an explicitly linked user account may read the employee payslip.
ALTER TABLE "Employee" ADD COLUMN "payrollUserId" TEXT;
CREATE UNIQUE INDEX "Employee_payrollUserId_key" ON "Employee"("payrollUserId");

-- Disbursement posting for payroll liabilities (2101 gaji, 2105 BPJS, 2106 PPh 21).
CREATE TABLE "PayrollDisbursement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "bankAccountCode" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollDisbursement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollDisbursement_companyId_idx" ON "PayrollDisbursement"("companyId");
CREATE INDEX "PayrollDisbursement_companyId_accountCode_status_idx" ON "PayrollDisbursement"("companyId", "accountCode", "status");
CREATE UNIQUE INDEX "PayrollDisbursement_companyId_idempotencyKey_key" ON "PayrollDisbursement"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "PayrollDisbursement_companyId_payrollRunId_accountCode_key" ON "PayrollDisbursement"("companyId", "payrollRunId", "accountCode");
