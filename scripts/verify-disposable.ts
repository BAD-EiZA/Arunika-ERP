// Only the explicitly named local audit container is permitted. Never accepts a production URL.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const docker = process.env.AUDIT_DOCKER || (process.platform === "win32" ? "C:/Program Files/Docker/Docker/resources/bin/docker.exe" : "docker");
const container = "arunika-audit-test";
const run = (...args: string[]) => execFileSync(docker, args, { encoding: "utf8" });
async function main() {
  const info = JSON.parse(run("inspect", container))[0];
  assert.equal(info.Name, `/${container}`);
  assert.equal(info.Config.Image, "postgres:17-alpine");
  const binding = info.NetworkSettings.Ports["5432/tcp"];
  assert.equal(binding.length, 1);
  assert.equal(binding[0].HostIp, "127.0.0.1");
  const password = info.Config.Env.find((value: string) => value.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert.ok(password);
  const url = `postgresql://audit:${encodeURIComponent(password)}@127.0.0.1:${binding[0].HostPort}/arunika_audit`;
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, TEST_DATABASE_URL: url, RETURNS_SCRATCH_DATABASE_URL: url };
  const npm = process.platform === "win32" ? "npx.cmd" : "npx";
  const checks: Record<string, number> = {};
  for (const [name, args] of [["migrations", ["prisma", "migrate", "deploy"]], ["integrity", ["tsx", "scripts/check-integrity.ts"]], ["returns", ["tsx", "scripts/check-returns.ts"]]] as const) {
    try { execFileSync(npm, [...args], { env, stdio: "inherit", shell: process.platform === "win32" }); checks[name] = 0; }
    catch (error) { checks[name] = Number((error as { status?: number }).status ?? 1); }
  }
  const directory = mkdtempSync(join(process.env.AUDIT_ARTIFACT_DIR || join(homedir(), "AppData", "Local", "hermes", "cache", "scratch"), "arunika-audit-"));
  const dump = execFileSync(docker, ["exec", container, "pg_dump", "-U", "audit", "-d", "arunika_audit", "-Fc"], { maxBuffer: 128 * 1024 * 1024 });
  const backup = join(directory, "audit.dump");
  writeFileSync(backup, dump);
  const restored = `arunika_restore_${Date.now()}`;
  run("exec", container, "createdb", "-U", "audit", restored);
  execFileSync(docker, ["exec", "-i", container, "pg_restore", "-U", "audit", "-d", restored, "--exit-on-error"], { input: readFileSync(backup), stdio: ["pipe", "inherit", "inherit"] });
  const source = new Client({ connectionString: url });
  const target = new Client({ connectionString: url.replace("/arunika_audit", `/${restored}`) });
  const counts: Record<string, number> = {};
  try {
    await source.connect(); await target.connect();
    const tables = (await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename as string);
    const restoredTables = (await target.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename as string);
    assert.deepEqual(tables, restoredTables);
    for (const table of tables) {
      const sql = `SELECT count(*)::int AS count FROM "${table.replaceAll('"', '""')}"`;
      counts[table] = (await source.query(sql)).rows[0].count;
      assert.equal((await target.query(sql)).rows[0].count, counts[table], table);
    }
  } finally { await source.end(); await target.end(); }
  const report = { containerId: info.Id, host: `127.0.0.1:${binding[0].HostPort}`, checks, restored, backup, bytes: dump.length, sha256: createHash("sha256").update(dump).digest("hex"), tables: Object.keys(counts).length, totalRows: Object.values(counts).reduce((sum, n) => sum + n, 0), counts };
  const reportPath = join(directory, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, counts: undefined, reportPath }, null, 2));
  assert.ok(Object.values(checks).every(code => code === 0), "One or more live checks failed; backup comparison completed; inspect report");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
