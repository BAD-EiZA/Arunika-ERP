import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { conflict, validationError } from "@/lib/errors";
import { amendPurchaseContract, approvePurchaseContract, createPurchaseContract, createPurchaseOrder, listPurchaseContracts } from "@/server/services/procurement";

export const dynamic = "force-dynamic";
export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("purchase_order:view");
    const [contracts, suppliers, products] = await Promise.all([
      listPurchaseContracts(ctx.companyId),
      prisma.supplier.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true } }),
    ]);
    return { contracts: contracts.map((c) => ({ ...c, remainingAmount: Number(c.ceilingAmount) - Number(c.usedAmount), items: c.items.map((i) => ({ ...i, remainingQuantity: Number(i.quantity) - Number(i.usedQuantity), remainingAmount: Number(i.ceilingAmount) - Number(i.usedAmount) })) })), suppliers, products };
  });
}
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = await req.json();
    const ctx = await requirePermission(body.action === "approve" ? "purchase_order:approve" : "purchase_order:create");
    await assertRequestAccess(ctx, body);
    const companyId = ctx.companyId, userId = ctx.user.id;
    if (body.action === "approve") return { contract: await approvePurchaseContract(companyId, userId, String(body.id ?? "")) };
    if (body.action === "submit") {
      const result = await prisma.purchaseContract.updateMany({ where: { id: String(body.id ?? ""), companyId, status: "DRAFT" }, data: { status: "PENDING_APPROVAL" } });
      if (!result.count) throw conflict("Kontrak bukan draft");
      return { success: true };
    }
    if (body.action === "deactivate") {
      await prisma.purchaseContract.updateMany({ where: { id: String(body.id ?? ""), companyId }, data: { isActive: false } });
      return { success: true };
    }
    if (!Array.isArray(body.items)) throw validationError("Items wajib");
    if (body.action === "amend") return { contract: await amendPurchaseContract({ companyId, id: String(body.id ?? ""), ceilingAmount: body.ceilingAmount, items: body.items }) };
    if (body.action === "call_off") {
      if (!body.contractId || !String(body.contractId).trim()) throw validationError("Contract ID wajib untuk call-off");
      return { purchaseOrder: await createPurchaseOrder({ companyId, userId, supplierId: String(body.supplierId ?? ""), contractId: String(body.contractId ?? ""), idempotencyKey: req.headers.get("Idempotency-Key") ?? body.idempotencyKey, items: body.items }) };
    }
    if (body.action !== "create") throw validationError("Action tidak valid");
    return { contract: await createPurchaseContract({ companyId, userId, supplierId: String(body.supplierId ?? ""), effectiveFrom: new Date(body.effectiveFrom), effectiveTo: new Date(body.effectiveTo), ceilingAmount: body.ceilingAmount, items: body.items }) };
  });
}
