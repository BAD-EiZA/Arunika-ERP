-- Additive payroll policy/profile columns and tables (PP 58/2023 + PMK 168/2023 TER, BPJS rules with effective dates).

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN "totalEmployerBpjs" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "policyId" TEXT,
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PayrollLine" ADD COLUMN "employerBpjs" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxStatus" TEXT,
ADD COLUMN "detail" JSONB;

-- CreateTable
CREATE TABLE "PayrollPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'APPROVED',
    "config" JSONB NOT NULL,
    "sourceUrls" JSONB NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayrollProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'PERMANENT',
    "taxStatus" TEXT NOT NULL,
    "jkkRiskClass" TEXT NOT NULL DEFAULT 'SANGAT_RENDAH',
    "bpjsPrograms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayrollProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPolicy_companyId_effectiveFrom_key" ON "PayrollPolicy"("companyId", "effectiveFrom");
CREATE INDEX "PayrollPolicy_companyId_idx" ON "PayrollPolicy"("companyId");
CREATE UNIQUE INDEX "EmployeePayrollProfile_employeeId_effectiveFrom_key" ON "EmployeePayrollProfile"("employeeId", "effectiveFrom");
CREATE INDEX "EmployeePayrollProfile_companyId_idx" ON "EmployeePayrollProfile"("companyId");
CREATE INDEX "PayrollRun_companyId_periodStart_periodEnd_idx" ON "PayrollRun"("companyId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "PayrollPolicy" ADD CONSTRAINT "PayrollPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeePayrollProfile" ADD CONSTRAINT "EmployeePayrollProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeePayrollProfile" ADD CONSTRAINT "EmployeePayrollProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PayrollPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
