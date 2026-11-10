import { readFileSync } from "node:fs";
import { join } from "node:path";

const actions = readFileSync(join(process.cwd(), "src/app/actions/index.ts"), "utf8");

function bodies(name: string): string {
  return actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("export async function", actions.indexOf(`export async function ${name}`) + 1) === -1 ? undefined : actions.indexOf("export async function", actions.indexOf(`export async function ${name}`) + 1));
}

test.each([
  ["actionOpeningStock", "access: { branchIds: ctx.branchIds, warehouseIds: ctx.warehouseIds }"],
  ["actionCreatePO", "assertRequestAccess(ctx, po);"],
  ["actionApprovePO", 'assertResourceAccess(ctx, "purchaseOrder", formStr(formData, "id"));'],
  ["actionSubmitPO", 'assertResourceAccess(ctx, "purchaseOrder", formStr(formData, "id"));'],
  ["actionPostGR", "assertRequestAccess(ctx, gr);"],
  ["actionCreateBill", "assertRequestAccess(ctx, bill);"],
  ["actionPaySupplier", "assertRequestAccess(ctx, payment);"],
  ["actionCreateSO", "assertRequestAccess(ctx, so);"],
  ["actionApproveSO", 'assertResourceAccess(ctx, "salesOrder", formStr(formData, "id"));'],
  ["actionPostDO", "assertRequestAccess(ctx, delivery);"],
  ["actionIssueInvoice", "assertRequestAccess(ctx, invoice);"],
  ["actionPayCustomer", "assertRequestAccess(ctx, payment);"],
  ["actionCreatePR", "assertRequestAccess(ctx, pr);"],
  ["actionSubmitQuotation", "assertRequestAccess(ctx, q);"],
  ["actionAwardRfq", "assertRequestAccess(ctx, rfq);"],
  ["actionImportStatement", "assertRequestAccess(ctx, statement);"],
  ["actionCreateProduct", "assertRequestAccess(ctx, Object.fromEntries(formData));"],
  ["actionCreateRfq", "assertRequestAccess(ctx, Object.fromEntries(formData));"],
  ["actionThreeWayMatch", "assertRequestAccess(ctx, Object.fromEntries(formData));"],
  ["actionOpeningStock", "assertRequestAccess(ctx, Object.fromEntries(formData));"],
  ["actionApprovePR", 'assertResourceAccess(ctx, "purchaseRequest", formStr(formData, "id"));'],
  ["actionClosePeriod", 'assertResourceAccess(ctx, "fiscalPeriod", formStr(formData, "id"));'],
  ["actionCreateRfq", 'assertResourceAccess(ctx, "supplier", supplierId);'],
  ["actionDepreciateAsset", 'assertResourceAccess(ctx, "fixedAsset", formStr(formData, "id"));'],
  ["actionCorrectTaxDoc", 'assertResourceAccess(ctx, "taxDocument", formStr(formData, "id"));'],
])("%s enforces branch/warehouse/resource access", (name, guard) => {
  expect(bodies(name)).toContain(guard);
});

test.each(["deliveries", "goods-receipts", "finance/journals"])("%s checks auth before idempotency key", route => {
  const source = readFileSync(join(process.cwd(), "src/app/api/erp", route, "route.ts"), "utf8");
  const key = source.indexOf("requireIdempotencyKey(req)");
  expect(key).toBeGreaterThan(-1);
  expect(key).toBeGreaterThan(source.indexOf("requirePermission("));
  expect(key).toBeGreaterThan(source.indexOf("assertRequestAccess("));
});
