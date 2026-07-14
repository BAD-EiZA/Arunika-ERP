# Arunika ERP

ERP SaaS modular (Fase 0–7) untuk dagang, distribusi, inventory, procurement, sales, accounting, treasury, tax, dan advanced procurement.

## Stack

- Next.js 16 (App Router) + TypeScript
- Prisma 7 + PostgreSQL (Supabase-ready)
- Kinde Auth (mock auth untuk dev lokal)
- Cloudinary-ready
- HeroUI + Tailwind v4
- TanStack Query (client data/mutations)
- Vercel-ready

## Setup

```bash
cp .env.example .env
# isi DATABASE_URL, DIRECT_URL, Kinde, Cloudinary

npm install
npx prisma generate
npx prisma db push
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Kinde dashboard
Callback URL:
```
http://localhost:3000/api/auth/kinde_callback
```
Logout redirect:
```
http://localhost:3000
```

`MOCK_AUTH=false` memakai Kinde. Set `true` hanya untuk demo lokal tanpa Kinde.

Onboarding membuat company + branch + warehouse + COA + tax + roles.

## Modul (Fase 0–7)

| Fase | Isi |
|------|-----|
| 0 | Bootstrap, lib, auth, health |
| 1 | Tenant, membership, role, branch, warehouse, onboarding, audit |
| 2 | Product, customer, supplier, stock engine |
| 3 | PO, GR, bill, payment, SO, delivery, invoice, payment |
| 4 | COA, journal, posting rules, fiscal period |
| 5 | Bank, budget, fixed asset, period close |
| 6 | Tax code effective-dated, tax documents, correction, export |
| 7 | PR, RFQ, quotation, award→PO, three-way match |
| 8 | Manufacturing: WC, BOM, routing, MO, issue, complete, costing |
| 9 | MRP net requirements + suggestions |
| 10 | HR: employee, attendance, leave |
| 11 | Payroll prepare/approve/post |
| 12 | Sales/purchase return + claims |
| 13 | Projects, tasks, timesheet, expense, profitability |
| 14 | Readiness checks (`/api/health/ready`) |

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm test              # jest + coverage 100% (lib + services)
npm run test:coverage
npm run db:generate
npm run db:push
npm run db:migrate
```

## TanStack Query

Provider global di `src/components/providers/query-provider.tsx`.

Halaman client-query (TanStack Query):
- Dashboard, Produk, Pelanggan, Pemasok, Stok
- Purchase Order / Goods Receipt / Supplier Bill / Supplier Payment
- Sales Order / Delivery / Invoice / Customer Payment
- PR / RFQ / Matching / Finance / Tax
- Manufacturing (`/manufacturing`) + costing detail
- MRP (`/mrp`)
- HR (`/hr`) · Payroll (`/payroll`)
- Returns (`/returns`) · Projects (`/projects`)
- Readiness (`/settings/readiness`)

Multi-item form: `src/components/line-items-editor.tsx` (PO, SO, tagihan)

Manufacturing permissions: `bom:*`, `routing:*`, `work_center:*`, `mrp:*`, `production_order:*`  
Roles baru: Production Planner/Supervisor, HR Manager/Admin, Payroll Admin, Project Manager/Member

Hooks: `src/hooks/use-erp-queries.ts`  
Keys: `src/lib/query-keys.ts`

## Catatan

- Transaksi posted immutable; stok lewat `StockMovement` saja.
- Money/qty pakai `decimal.js`.
- Permission dicek di API route / server actions.
- Production: set `MOCK_AUTH=false` + kredensial Kinde.
