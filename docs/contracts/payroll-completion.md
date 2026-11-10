# Payroll completion contract

## Parent schema/SQL additions (needed before Prisma generation)

Owner: parent; this agent does not edit schema/migration. Two standalone models, no relation/backrelation additions required:

```prisma
model HrPayrollSource {
  id String @id @default(cuid())
  companyId String
  employeeId String
  kind String
  workDate DateTime
  payload Json
  status String @default("PENDING_APPROVAL")
  createdById String
  approvedById String?
  approvedAt DateTime?
  createdAt DateTime @default(now())
  @@index([companyId, employeeId, workDate])
}
model LeaveLedger {
  id String @id @default(cuid())
  companyId String
  employeeId String
  leaveType String
  effectiveDate DateTime
  days Decimal @db.Decimal(8, 2)
  sourceKey String
  reason String
  createdById String
  createdAt DateTime @default(now())
  @@unique([companyId, sourceKey])
  @@index([companyId, employeeId, leaveType, effectiveDate])
}
```

SQL equivalent: create quoted tables matching fields, TEXT ids supplied by Prisma cuid; timestamp(3) dates; JSONB payload; DECIMAL(8,2) days; unique(companyId,sourceKey), above indexes. Add composite FK(companyId,employeeId) REFERENCES Employee(companyId,id) ON DELETE RESTRICT to both tables. Add CHECK(kind IN ('ATTENDANCE','OVERTIME','ADJUSTMENT','LEAVE_GRANT')); CHECK status pending/approved/rejected. Preserve all existing append-only posted payroll protections. HR source payload/identity immutable after creation; only pending status may transition once with distinct checker. LeaveLedger append-only. Approved-source rows consumed through pinned payrollLine.detail snapshots, not mutated.

```sql
CREATE TABLE "HrPayrollSource" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('ATTENDANCE','OVERTIME','ADJUSTMENT','LEAVE_GRANT')),
 "workDate" TIMESTAMP(3) NOT NULL, "payload" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED')),
 "createdById" TEXT NOT NULL, "approvedById" TEXT, "approvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT,
 CHECK ("status" <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "approvedById" <> "createdById" AND "approvedAt" IS NOT NULL))
);
CREATE INDEX "HrPayrollSource_companyId_employeeId_workDate_idx" ON "HrPayrollSource"("companyId","employeeId","workDate");
CREATE TABLE "LeaveLedger" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
 "leaveType" TEXT NOT NULL, "effectiveDate" TIMESTAMP(3) NOT NULL,
 "days" DECIMAL(8,2) NOT NULL, "sourceKey" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT,
 UNIQUE ("companyId","sourceKey")
);
CREATE INDEX "LeaveLedger_companyId_employeeId_leaveType_effectiveDate_idx" ON "LeaveLedger"("companyId","employeeId","leaveType","effectiveDate");
```
Parent must add immutable-row triggers to existing migration conventions; SQL above intentionally does not replace those protections.

No new packages. Existing PayrollPolicy.config carries bounded effective dates, provenance, employee/proration/leave rules. Legacy policies remain bounded to 2026; extensions require explicit bounded policy config and maker-checker.

## Scope checklist

- [x] Effective-dated policy beyond 2026, explicit validThrough + source URL/check date, annual JP ceiling required. Existing policies expire at 2026-12-31.
- [x] PERMANENT / full-time resident CONTRACT under approved employmentTypes; join/end calendar-day proration only when proration=CALENDAR_DAYS and residentPartialYear=true. Final tax month follows endDate. Missing earlier employer payroll months fail closed.
- [x] Post-2026 approved attendance/overtime source reconciliation and pinned source snapshots. Legacy 2026 manual-hour path retained for regression compatibility, still approved with payroll; not equivalent to independent approved-source control.
- [x] Approved reasoned taxable-earning adjustment referencing a POSTED source run, consumed in next regular payroll. Historical posted run unchanged.
- [x] Entitlement and explicit carry/expiry adjustments through maker-checker LEAVE_GRANT; monthly policy accrual; balance as-of ledger; half-days and approval debit with serializable insufficient-balance guard.
- [x] Configurable BPJS/PPh21; JP default remains empty. No verified-regulation claim or automatic activation.
- [x] HR source/approval/accrual/balance/offboarding API and UI; payroll policy/profile UI; focused tests and lint pass.
- [ ] Parent models/migration/client generation; live PostgreSQL concurrency and browser checks.
- [ ] Daily/casual/freelancer/nonresident, tax-subject arrival/departure annualization, prior-employer certificate import, gross-up, severance, off-cycle after termination, loan/reimbursement treatment, JKP funding/export, holiday overtime formula, automatic carry/expiry scheduler, raw attendance correction history, shift calendars. These remain unimplemented, not silently approximated.

## API/config details

`POST /api/erp/hr`: `source` (employeeId, kind, workDate, payload), `approve_source` (id), `leave_balance` (employeeId, leaveType, asOf), `accrue_leave` (employeeId, leaveType, workDate=month first), `end_employment` (employeeId, endDate, reason). Source/read operations require payroll permission plus employee_sensitive:view; source checker cannot be maker. Existing payroll createPolicy/createProfile/prepare API remains compatible.

Policy extension JSON: `validThrough`, `sources:[{url,checkedAt}]`, `employmentTypes:["PERMANENT","CONTRACT"]`, `residentPartialYear:true`, `proration:"CALENDAR_DAYS"`, optional `leave:{ANNUAL:{monthlyAccrual:"1",allowNegative:false}}`. Values shown are **configuration examples**, not legal entitlement/rate defaults. Mid-month policy changes fail closed, not silently ignored. Salary profile changes mid-month are not segmented. Leave monthly accrual grants only employees employed at month start; no automatic join-month accrual. Manual carry/expiry negative/positive entries must be reviewed. Leave approval currently uses leave:approve, not configurable manager hierarchy.

## Verification / parent action

Strict RED→GREEN observed for 15 completion tests. Focused aggregate: 60 tests / 4 suites pass (completion + payroll + integrity + payroll API). Owned-path ESLint: zero issues; git diff --check passes. Whole-repo test run during parallel work: 640 pass / 5 fail in inventory-workflows and mrp-completion, unrelated paths. Whole-repo typecheck blocked by absent parent-generated Prisma additions plus concurrent tax/returns/projects changes. No DB/browser/build claimed. Parent must add models above, generate client, rerun typecheck/full test/build, verify PostgreSQL FK/immutability/concurrency before enabling.

## Regulatory research (retrieved 2026-11-10)

The official BPJS participant page says “Dasar perhitungan iuran dengan upah maksimal sebesar Rp 10.547.400,00”; the page also shows 2026 pension *benefit* amounts but does not establish the March 2026 *contribution wage ceiling*.[1]

A third-party-hosted copy of BPJS letter B/1226/022026, dated 25 February 2026, says the contribution wage ceiling from 1 March 2026 is Rp11,086,300.[2] Its document appears to be an official letter, but the hosted copy is **not independent official-host confirmation**. Do not automatically seed/activate this ceiling. Obtain BPJS-hosted announcement or direct agency confirmation; human checker approves the effective-dated policy.

PMK 168/2023 defines a full-time contract worker as potentially Pegawai Tetap; last payroll tax month is December or termination month. Pasal 15(3) requires annualization and proportional tax when **subjective tax liability** begins after January or ends before December, distinct from merely changing employers.[3] Current partial-year calculation does **not** collect subjective tax-liability status or prior-employer income. It is not safe to automate those cases. Employee type CONTRACT requires HR attestation of full-time resident tax treatment; DAILY/freelancer/nonresident are rejected.

## Sources

[1] https://www.bpjsketenagakerjaan.go.id/penerima-upah.html
[2] https://494075.fs1.hubspotusercontent-na1.net/hubfs/494075/compliance-portal/notification-number-b1226022026.pdf
[3] https://jdih.kemenkeu.go.id/api/download/e60a82e0-b218-40f5-9d18-b924aa1e11ce/2023pmkeuangan168.pdf
