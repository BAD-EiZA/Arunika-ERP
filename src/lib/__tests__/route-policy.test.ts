import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = join(process.cwd(), "src/app/api/erp");
function routes(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? routes(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : []); }
test.each(routes(root).filter(f => !f.includes("notifications") && !f.includes("pdf/")))("%s GET has resource permission", file => {
 const source = readFileSync(file, "utf8").split("export async function POST")[0];
 expect(source).not.toMatch(/const ctx = await requireTenant\(\)/);
});
test("stock uses caller idempotency and verifies resource ownership", () => {
 const source = readFileSync(join(root, "stock/route.ts"), "utf8");
 expect(source).toContain("requireIdempotencyKey(req)");
 expect(source).toContain("assertResourceAccess(ctx, \"warehouse\"");
 expect(source).not.toContain("Date.now()");
});

test("warehouse lists and stock reads apply membership scopes", () => {
 const source = readFileSync(join(root, "stock/route.ts"), "utf8");
 expect(source).toContain('warehouseId: { in: ctx.warehouseIds }');
 expect(source).toContain('id: { in: ctx.warehouseIds }');
});

test.each(["goods-receipts", "deliveries", "customer-payments", "supplier-payments", "finance/journals", "finance/expenses"])("%s posting accepts caller key", route => {
 const source = readFileSync(join(root, route, "route.ts"), "utf8");
 expect(source).toContain("requireIdempotencyKey(req)");
});

test.each(["purchase-orders", "sales-orders", "goods-receipts", "deliveries", "manufacturing", "returns", "wms", "pos"])("%s scopes warehouse access", route => {
 const source = readFileSync(join(root, route, "route.ts"), "utf8");
 expect(source).toContain("ctx.warehouseIds");
});
test("proxy blocks production mock auth", () => {
 const source = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
 expect(source).toContain('process.env.MOCK_AUTH === "true"');
 expect(source).toContain('process.env.NODE_ENV === "production"');
});

test("PDF requires resource permission before query", () => {
 const source = readFileSync(join(root, "pdf/[type]/[id]/route.ts"), "utf8");
 expect(source).toContain('requirePermission(');
 expect(source).toContain('assertResourceAccess(');
});

test.each(["purchase-orders", "sales-orders"])("%s target ID scope checked", route => {
 const source = readFileSync(join(root, route, "route.ts"), "utf8");
 expect(source).toMatch(/assertResourceAccess\(ctx, "(?:purchaseOrder|salesOrder)", body.id\)/);
});
