# Project completion contract

## Schema proposal — parent owns Prisma/migration

Add to Project: `costAllocations ProjectCostAllocation[]`.
Add to JournalLine: `projectCostAllocation ProjectCostAllocation?`.
Add to ProjectExpense (nullable for legacy drafts):
```prisma
  debitAccountCode String?
  creditAccountCode String?
  approvedById String?
  approvedAt DateTime?
  journalId String? @unique
```
New model:
```prisma
model ProjectCostAllocation {
  id String @id @default(cuid())
  companyId String
  projectId String
  journalLineId String @unique
  kind String
  amount Decimal @db.Decimal(18, 2)
  status DocumentStatus @default(POSTED)
  createdById String
  createdAt DateTime @default(now())
  reversedById String?
  reversedAt DateTime?
  reversalReason String?
  project Project @relation(fields: [projectId], references: [id])
  journalLine JournalLine @relation(fields: [journalLineId], references: [id])
  @@index([companyId, projectId])
}
```
SQL proposal: ALTER TABLE "ProjectExpense" ADD COLUMN "debitAccountCode" TEXT, ADD COLUMN "creditAccountCode" TEXT, ADD COLUMN "approvedById" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "journalId" TEXT; CREATE UNIQUE INDEX "ProjectExpense_journalId_key" ON "ProjectExpense"("journalId"); create ProjectCostAllocation matching above, PK id, FK projectId→Project(id) RESTRICT, FK journalLineId→JournalLine(id) RESTRICT, UNIQUE(journalLineId), INDEX(companyId,projectId), CHECK(kind IN ('PAYROLL','MATERIAL')), CHECK(amount>0), CHECK(status IN ('POSTED','VOID')). Default ProjectExpense status should become DRAFT; legacy POSTED rows require verified journals, never backfilled accounts.

## Semantics

Expense: DRAFT → APPROVED (explicit active same-company expense debit + ASSET/LIABILITY credit accounts) → POSTED through existing postJournal, actor recorded; CAS + serializable transaction; deterministic GL key. Approved accounts immutable. No guessed account/rate.
Allocation: entire positive expense/COGS journal-line debit only, not arbitrary manual amounts. PAYROLL consumes posted PayrollRun journal; MATERIAL consumes posted DeliveryOrder journal. Source document, journal, company, IDR/rate=1, balanced lines, unreversed original all verified. One source line ever belongs to one allocation; reversal VOID releases project attribution, not source accounting, never permits re-use. Partial splits intentionally unsupported. Existing services unchanged.
Profitability: verified posted allocations only; source reversal invalidates attribution immediately. Recorded-source subtotal not full project profitability: payroll hours/material completeness cannot be proven from present source schema; disclose PARTIAL coverage and keep complete margin unknown where uncovered work exists. No new GL for allocations (avoid double counting).

## API/UI
POST /api/erp/projects actions approve_expense (id,debitAccountCode,creditAccountCode), post_expense (id), allocate_cost (projectId,journalLineId,kind), reverse_allocation (id,reason). Expense approval/posting and allocations require project:manage + journal:post; payroll allocation additionally payroll:view + employee_sensitive:view. Whole payroll run expense lines may be attributed only when the entire source is project-specific; splitting employee hours across projects is not supported. GET returns accounts and eligible posted journal lines only with appropriate permissions; UI explicit source/account selectors and reversal reason. Existing billing unchanged.

## Verification boundary
18 new unit/mock transaction/API tests; 45 project tests total pass. Full shared suite attempted: 636 passed, 5 failed (inventory-workflows 3, mrp-completion 2; concurrent owner work). Targeted ESLint: zero errors, one existing useMemo warning. Typecheck attempted: blocked by parent-owned schema/client additions (ProjectExpense fields, ProjectCostAllocation + relations), plus concurrent modules. Parent must apply schema and regenerate Prisma then rerun. No live PostgreSQL/concurrency/browser verification.

Material scope: posted DeliveryOrder COGS only, reconciled against SALES_DELIVERY stock movements. Production issues, returns/net material consumption, split employee-period payroll allocations not represented; coverage remains PARTIAL. Whole source lines only; no guessed amounts/rates. Expense posting replay after successful POSTED returns conflict, not a second journal.
