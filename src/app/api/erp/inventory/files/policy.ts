import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/auth";
import { forbidden, notFound, validationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { assertWarehouseOwnership } from "@/server/services/inventory";
export { DOCUMENT_FORMATS, IMAGE_FORMATS, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "@/app/api/files/policy";
export async function authorizeInventoryFile(ctx: TenantContext, entityType: unknown, entityId: unknown, operation: "upload" | "view" = "upload", access = "AUTHENTICATED") {
 if (access !== "AUTHENTICATED") throw forbidden("Lampiran persediaan harus privat");
 if (typeof entityId !== "string" || !/^[\w-]{1,128}$/.test(entityId)) throw validationError("ID tidak valid");
 if (!["StockTransfer", "StockAdjustment", "StockOpname"].includes(String(entityType))) throw validationError("Entitas tidak didukung");
 const permission = operation === "view" ? "stock:view" : entityType === "StockTransfer" ? "stock:transfer" : entityType === "StockAdjustment" ? "stock:adjust" : "stock:opname";
 if (!hasPermission(ctx.permissions, permission)) throw forbidden();
 const where = { id: entityId, companyId: ctx.companyId };
 const doc = entityType === "StockTransfer" ? await prisma.stockTransfer.findFirst({ where }) : entityType === "StockAdjustment" ? await prisma.stockAdjustment.findFirst({ where }) : await prisma.stockOpname.findFirst({ where });
 if (!doc) throw notFound();
 const warehouseId = "warehouseId" in doc ? doc.warehouseId : doc.fromWarehouseId;
 // Transfer attachment access requires both locations: avoid leaking destination evidence to origin-only members.
 await assertWarehouseOwnership(prisma, { companyId: ctx.companyId, warehouseId, access: ctx });
 if ("toWarehouseId" in doc) await assertWarehouseOwnership(prisma, { companyId: ctx.companyId, warehouseId: doc.toWarehouseId, access: ctx });
 if (operation === "upload" && ["POSTED", "RECEIVED", "CANCELLED"].includes(doc.status)) throw forbidden("Dokumen final tidak dapat diubah");
 return { entityType: String(entityType), entityId };
}
export const authorizeUpload = authorizeInventoryFile;
export function authorizeDownload(ctx: TenantContext, entityType: string | null) { if (!entityType || !["StockTransfer", "StockAdjustment", "StockOpname"].includes(entityType) || !hasPermission(ctx.permissions, "stock:view")) throw forbidden(); }
