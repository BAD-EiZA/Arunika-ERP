import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/auth";
import { forbidden, notFound, validationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";

const PUBLIC_ENTITIES = {
  Product: { permission: "product:update" as const },
  Company: { permission: "company:update" as const },
};

// Private document entities: explicit allow-list only; anything else fails closed.
const PRIVATE_ENTITIES = {
  Customer: { model: "customer", folder: "customers", upload: "customer:update", view: "customer:view" },
  Supplier: { model: "supplier", folder: "suppliers", upload: "supplier:update", view: "supplier:view" },
  PurchaseOrder: { model: "purchaseOrder", folder: "purchasing", upload: "purchase_order:update", view: "purchase_order:view" },
  SupplierBill: { model: "supplierBill", folder: "purchasing", upload: "supplier_bill:create", view: "supplier_bill:view" },
  SupplierPayment: { model: "supplierPayment", folder: "payments", upload: "supplier_payment:create", view: "supplier_payment:view" },
  SalesInvoice: { model: "salesInvoice", folder: "sales", upload: "invoice:create", view: "invoice:view" },
  CustomerPayment: { model: "customerPayment", folder: "payments", upload: "payment:create", view: "payment:view" },
  DeliveryOrder: { model: "deliveryOrder", folder: "sales", upload: "delivery_order:create", view: "delivery_order:view" },
} as const;

export type PublicEntityType = keyof typeof PUBLIC_ENTITIES;
export type PrivateEntityType = keyof typeof PRIVATE_ENTITIES;

function checkId(entityId: unknown): asserts entityId is string {
  if (typeof entityId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(entityId)) throw validationError("Jenis atau ID entitas tidak didukung");
}

export async function authorizeUpload(ctx: TenantContext, entityType: unknown, entityId: unknown, operation: "upload" | "view" = "upload") {
  checkId(entityId);
  if (entityType === "Product" || entityType === "Company") {
    const permission = PUBLIC_ENTITIES[entityType].permission;
    if (!hasPermission(ctx.permissions, permission)) throw forbidden();
    const entity = entityType === "Product"
      ? await prisma.product.findFirst({ where: { id: entityId, companyId: ctx.companyId } })
      : entityId === ctx.companyId && await prisma.company.findFirst({ where: { id: entityId, isActive: true } });
    if (!entity) throw notFound();
    return { entityType, entityId, folderSegment: entityType };
  }
  if (typeof entityType === "string" && Object.hasOwn(PRIVATE_ENTITIES, entityType)) {
    const policy = PRIVATE_ENTITIES[entityType as PrivateEntityType];
    if (!hasPermission(ctx.permissions, policy[operation])) throw forbidden();
    // ponytail: polymorphic lookup via shared companyId-scoped findFirst; add per-entity scoping if a model lacks companyId.
    const delegate = prisma[policy.model] as unknown as { findFirst: (args: { where: { id: string; companyId: string } }) => Promise<unknown> };
    const entity = await delegate.findFirst({ where: { id: entityId, companyId: ctx.companyId } }) as { companyId?: string; branchId?: string | null; warehouseId?: string | null } | null;
    if (!entity || entity.companyId !== ctx.companyId) throw notFound();
    if (entity.branchId && ctx.branchIds.length && !ctx.branchIds.includes(entity.branchId)) throw forbidden();
    if (entity.warehouseId && ctx.warehouseIds.length && !ctx.warehouseIds.includes(entity.warehouseId)) throw forbidden();
    return { entityType, entityId, folderSegment: policy.folder };
  }
  throw validationError("Jenis atau ID entitas tidak didukung");
}

export function authorizeDownload(ctx: TenantContext, entityType: string | null): asserts entityType is PrivateEntityType {
  if (!entityType || !(Object.hasOwn(PRIVATE_ENTITIES, entityType))) throw forbidden("Entitas tidak mendukung unduhan privat");
  if (!hasPermission(ctx.permissions, PRIVATE_ENTITIES[entityType as PrivateEntityType].view)) throw forbidden();
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_FORMATS = ["jpg", "png", "webp"];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // ponytail: PRD §24.2 allows 15MB PDF; raise when per-plan limits land.
export const DOCUMENT_FORMATS = ["pdf", "jpg", "png", "webp"];
