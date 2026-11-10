import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
test("bank GET lists only posted, unused journal lines for the mapped GL accounts", () => {
  const source = readFileSync(join(root, "src/app/api/erp/finance/bank/route.ts"), "utf8");
  expect(source).toContain("listReconcilableLines(ctx.companyId)");
  const service = readFileSync(join(root, "src/server/services/treasury.ts"), "utf8");
  expect(service).toContain('accountId: { in: glIds }, journal: { companyId, status: "POSTED" }');
  expect(service).toContain('.filter((l) => !usedSet.has(l.id))');
});
test("bank UI submits selected journal line ID; no synthetic reference", () => {
  const source = readFileSync(join(root, "src/app/(erp)/finance/bank/bank-client.tsx"), "utf8");
  expect(source).toContain("matchedRef: selectedJournalLineId");
  expect(source).not.toContain("MANUAL-");
});
test("bank route does not default missing reference to MATCHED", () => {
  const source = readFileSync(join(root, "src/app/api/erp/finance/bank/route.ts"), "utf8");
  expect(source).not.toContain('body.matchedRef ?? "MATCHED"');
});
