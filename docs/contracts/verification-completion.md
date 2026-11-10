# Disposable infrastructure verification

2026-11-10. Real local PostgreSQL; no production access, no existing containers modified. Concurrent feature/schema work means results describe this migration snapshot only.

## Handles

- Docker Desktop engine 28.2.2. Initial `docker info` failed: missing `dockerDesktopLinuxEngine` pipe. `docker desktop start` succeeded; subsequent info returned 28.2.2.
- New container `arunika-audit-test`, ID `b6c1e2deed5b2befb26b9ed9d24b5be9f225e1aa2274bed8d556f4022f17262c`, image `postgres:17-alpine`. Kept running for parent tests.
- PostgreSQL bound exclusively to `127.0.0.1:60476`; user `audit`, database `arunika_audit`.
- Full generated disposable connection URL stored outside repository: `C:/Users/User/AppData/Local/hermes/cache/scratch/arunika-audit-url`. Template: `postgresql://audit:<generated-password>@127.0.0.1:60476/arunika_audit`. No provider credentials used.

## Commands and actual results

`DATABASE_URL=<scratch-url> DIRECT_URL=<scratch-url> npx prisma migrate deploy`: exit 0; all 9 migrations applied, `20261110000000_init` through `20261110150400_posting_hash`. Subsequent runs: no pending migrations. No schema push used.

`TEST_DATABASE_URL=<scratch-url> npx tsx scripts/check-integrity.ts`: exit 0, repeated three times. Output: `PASS: cross-tenant rejection, concurrent stock updates, retry idempotency, reservation contention, journal rollback`.

`RETURNS_SCRATCH_DATABASE_URL=<scratch-url> npx tsx scripts/check-returns.ts`: exit 1, reproducible. Eight purchase assertions passed: PRN total 666; posted; stock 6; two journal lines; DN 666; AP 999; DN idempotency; one DN journal. Sales leg blocked at line 65: `AppError: Gudang karantina satu cabang dengan delivery wajib` (422). Fixture creates default warehouse but current service requires active `RETURN`/`DAMAGED` warehouse in delivery branch. Script/service not edited; feature owner must align fixture with quarantine contract. Failed runs intentionally remain in disposable DB; no claim of complete returns verification.

`npx tsx scripts/verify-disposable.ts`: repeats migrations and both live scripts, then performs real `docker exec ... pg_dump -Fc`, creates a new restore database, feeds actual binary dump to `pg_restore --exit-on-error`, compares exact public table names and every table's SQL row count through `pg`. Fails overall if either integration script fails even when restore succeeds.

Latest actual restore passed: 123 tables; 156 total rows, source and restored counts identical. Restore DB `arunika_restore_1794296774751`. Dump 360051 bytes, SHA256 `88bc9864b7ea3b4a383f23b3fe2e689056dc4c8b9d8599e552149c4ca803937b`.

Artifacts: `C:/Users/User/AppData/Local/hermes/cache/scratch/arunika-audit-VEDl5Q/audit.dump` and `report.json` (all table counts, statuses, container ID). Runner overall exit 1 accurately preserves returns blocker. Earlier restore also passed (123 tables/107 rows); row increase is retained isolated return fixtures, not production data.

## CI review

`.github/workflows/ci.yml` uses PostgreSQL 17 Alpine, Node 22, migrations, lint, typecheck, Jest, integrity, build. Does not execute returns, backup/restore, browser E2E, Kinde or Cloudinary integration. Dummy Kinde values cannot establish provider success. No CI/config changes made.

## Browser scope

Local HTTP port 3000 responds 307 to `/login`, but browser title is `🐴 Atlaz Academy | The Next Step to World-Class Education`, not verified as this ERP. Port 3001 refused connection. Existing local server untouched. No ERP browser acceptance claim. Authenticated E2E requires a separately started ERP instance on a distinct port, scratch DB, legitimate configured Kinde app/test identity. Real Kinde and Cloudinary untested; no credentials present/used.

## Re-run

From repository: `npx tsx scripts/verify-disposable.ts`. Runner only targets exact named container/image and loopback binding, derives generated disposable password internally, overrides both Prisma migration URLs, retains backup/restore handles, never stops or deletes containers. Set `AUDIT_DOCKER` only if executable location differs; set `AUDIT_ARTIFACT_DIR` to an existing scratch directory if needed. After parent regenerates client/migrations, rerun. No commit created.
