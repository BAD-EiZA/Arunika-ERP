import { z } from "zod";
import { requirePermission, requireTenant, requireIdempotencyKey } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import { createTransfer, advanceTransfer, createAdjustment, advanceAdjustment, createOpname, saveOpnameCount, advanceOpname, saveLocation, importOpnameCsv, configureInventoryAccounts } from "@/server/services/inventory-workflows";

export const dynamic = "force-dynamic";
const id = z.string().trim().min(1).max(200);
const value = z.union([z.string().min(1).max(40), z.number().finite()]);
const notes = z.string().max(2000).optional();
const location = z.object({ kind: z.enum(["branch", "warehouse"]), id: id.optional(), code: z.string().trim().min(1).max(40).optional(), name: z.string().trim().min(1).max(200).optional(), branchId: id.optional(), address: notes, city: z.string().max(200).optional(), province: z.string().max(200).optional(), phone: z.string().max(60).optional(), email: z.email().optional(), type: z.enum(["MAIN", "TRANSIT", "RETURN", "DAMAGED", "VIRTUAL"]).optional(), isActive: z.boolean().optional(), remove: z.boolean().optional() });
const command = z.discriminatedUnion("kind", [
 z.object({ kind: z.literal("transfer"), fromWarehouseId: id, toWarehouseId: id, notes, items: z.array(z.object({ productId: id, quantity: value })).min(1).max(500) }),
 z.object({ kind: z.literal("adjustment"), warehouseId: id, reason: z.string().trim().min(1).max(2000), notes, items: z.array(z.object({ productId: id, delta: value })).min(1).max(500) }),
 z.object({ kind: z.literal("opname"), warehouseId: id, notes }),
 z.object({ kind: z.literal("transfer-action"), id, action: z.enum(["request", "approve", "send", "receive", "cancel", "reverse"]), items: z.array(z.object({ itemId: id, quantity: value })).min(1).max(500).optional(), final: z.boolean().optional(), reason: notes }),
 z.object({ kind: z.literal("adjustment-action"), id, action: z.enum(["request", "approve", "post", "cancel"]) }),
 z.object({ kind: z.literal("opname-action"), id, action: z.enum(["start", "review", "approve", "post", "cancel"]) }),
 z.object({ kind: z.literal("accounts"), inventoryAccountCode: id, stockGainAccountCode: id, stockLossAccountCode: id }),
 z.object({ kind: z.literal("count-import"), id, csv: z.string().min(1).max(1000000) }),
 z.object({ kind: z.literal("count"), id, itemId: id, count: value }),
 z.object({ kind: z.literal("location"), location }),
]);
export async function GET(req: Request) {
 return withApiHandler(async () => {
  const locations = new URL(req.url).searchParams.get("locations") === "1";
  const ctx = await requirePermission(locations ? ["branch:view", "warehouse:view"] : "stock:view");
  const warehouseScope = { ...(ctx.warehouseIds.length ? { id: { in: ctx.warehouseIds } } : {}), ...(ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {}) };
  const scoped = { companyId: ctx.companyId, ...warehouseScope };
  const [warehouses, branches] = await Promise.all([
   prisma.warehouse.findMany({ where: scoped, orderBy: { code: "asc" } }),
   prisma.branch.findMany({ where: { companyId: ctx.companyId, ...(ctx.branchIds.length ? { id: { in: ctx.branchIds } } : {}), ...(ctx.warehouseIds.length ? { warehouses: { some: { id: { in: ctx.warehouseIds } } } } : {}) }, orderBy: { code: "asc" } }),
  ]);
  if (locations) return { warehouses, branches };
  const ids = warehouses.map(w => w.id);
  const [transfers, adjustments, opnames, products] = await Promise.all([
   prisma.stockTransfer.findMany({ where: { companyId: ctx.companyId, OR: [{ fromWarehouseId: { in: ids } }, { toWarehouseId: { in: ids } }] }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 }),
   prisma.stockAdjustment.findMany({ where: { companyId: ctx.companyId, warehouseId: { in: ids } }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 }),
   prisma.stockOpname.findMany({ where: { companyId: ctx.companyId, warehouseId: { in: ids } }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 }),
   prisma.product.findMany({ where: { companyId: ctx.companyId, type: "STOCK", isArchived: false }, select: { id: true, sku: true, name: true } }),
  ]);
  const accounts = await prisma.account.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { code: true, name: true, type: true }, orderBy: { code: "asc" } });
  const accountConfig = await prisma.companySetting.findUnique({ where: { companyId: ctx.companyId } });
  return { warehouses, branches, transfers, adjustments, opnames, products, accounts, accountConfig };
 });
}
export async function POST(req: Request) {
 return withApiHandler(async () => {
  // Authenticate before parsing or querying document references.
  const ctx = await requireTenant();
  const parsed = command.safeParse(await req.json());
  if (!parsed.success) throw validationError(parsed.error.issues.map(i => i.message).join("; "));
  const c = parsed.data;
  const base = { companyId: ctx.companyId, userId: ctx.user.id, access: { branchIds: ctx.branchIds, warehouseIds: ctx.warehouseIds } };
  if (c.kind === "location") {
   const l = c.location;
   await requirePermission(l.kind === "branch" ? l.remove ? "branch:delete" : l.id ? "branch:update" : "branch:create" : l.id ? "warehouse:update" : "warehouse:create");
   return saveLocation({ ...base, ...l });
  }
  if (c.kind === "accounts") { await requirePermission("company:update"); return configureInventoryAccounts({ ...base, ...c }); }
  if (c.kind === "transfer-action" && (c.action === "reverse" || c.final)) await requirePermission("stock:adjust");
  await requirePermission(c.kind.startsWith("transfer") ? "stock:transfer" : c.kind.startsWith("adjustment") ? "stock:adjust" : "stock:opname");
  switch (c.kind) {
   case "transfer": return createTransfer({ ...base, ...c, idempotencyKey: requireIdempotencyKey(req) });
   case "adjustment": return createAdjustment({ ...base, ...c, idempotencyKey: requireIdempotencyKey(req) });
   case "opname": return createOpname({ ...base, ...c, idempotencyKey: requireIdempotencyKey(req) });
   case "transfer-action": return advanceTransfer({ ...base, ...c });
   case "adjustment-action": return advanceAdjustment({ ...base, ...c });
   case "opname-action": return advanceOpname({ ...base, ...c });
   case "count-import": return importOpnameCsv({ ...base, ...c });
   case "count": return saveOpnameCount({ ...base, ...c });
  }
 });
}
