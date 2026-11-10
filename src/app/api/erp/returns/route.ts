import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approveReturn, approveReturnSettlement, releaseSalesReturn, disposeSalesReturn, refundSalesReturn, replaceSalesReturn, advanceClaim,
  createClaim,
  createPurchaseReturn,
  createSalesReturn,
  postPurchaseReturn,
  postSalesReturn,
} from "@/server/services/returns";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("return:view");
    const [salesReturns, purchaseReturns, claims, customers, suppliers, products, warehouses, salesInvoices, goodsReceipts] =
      await Promise.all([
        prisma.salesReturn.findMany({
          where: { ...(ctx.warehouseIds.length ? { warehouseId: { in: ctx.warehouseIds } } : {}),  companyId: ctx.companyId },
          include: { items: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.purchaseReturn.findMany({
          where: { ...(ctx.warehouseIds.length ? { warehouseId: { in: ctx.warehouseIds } } : {}),  companyId: ctx.companyId },
          include: { items: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.claim.findMany({
          where: { companyId: ctx.companyId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.customer.findMany({
          where: { companyId: ctx.companyId, isActive: true },
        }),
        prisma.supplier.findMany({
          where: { companyId: ctx.companyId, isActive: true },
        }),
        prisma.product.findMany({
          where: { companyId: ctx.companyId, isArchived: false },
        }),
        prisma.warehouse.findMany({
          where: { ...(ctx.warehouseIds.length ? { id: { in: ctx.warehouseIds } } : {}), ...(ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {}),  companyId: ctx.companyId, isActive: true },
        }),
        prisma.salesInvoice.findMany({
          where: { companyId: ctx.companyId, status: { not: "DRAFT" }, deliveryOrder: { status: "POSTED" } },
          include: { items: true, deliveryOrder: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.goodsReceipt.findMany({
          where: { ...(ctx.warehouseIds.length ? { warehouseId: { in: ctx.warehouseIds } } : {}), companyId: ctx.companyId, status: "POSTED" },
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

    const returnedByInvoiceItem = await prisma.salesReturnItem.groupBy({
      by: ["sourceItemId"],
      where: { sourceItemId: { not: null }, salesReturn: { companyId: ctx.companyId, status: { notIn: ["CANCELLED", "VOID", "REJECTED"] } } },
      _sum: { quantity: true },
    });
    const returnedByReceiptItem = await prisma.purchaseReturnItem.groupBy({
      by: ["sourceReceiptItemId"],
      where: { sourceReceiptItemId: { not: null }, purchaseReturn: { companyId: ctx.companyId, status: { notIn: ["CANCELLED", "VOID", "REJECTED"] } } },
      _sum: { quantity: true },
    });
    const invReturned = new Map(returnedByInvoiceItem.map((r) => [r.sourceItemId, r._sum.quantity ?? 0]));
    const grReturned = new Map(returnedByReceiptItem.map((r) => [r.sourceReceiptItemId, r._sum.quantity ?? 0]));

    const replacements = await prisma.returnReplacement.findMany({ where: { companyId: ctx.companyId, salesReturnId: { in: salesReturns.map(r => r.id) } }, select: { id: true, salesReturnId: true, number: true, status: true, warehouseId: true } });
    const replacementByReturn = new Map(replacements.map(r => [r.salesReturnId, r]));
    return {
      salesReturns: salesReturns.map((r) => ({
        replacement: replacementByReturn.get(r.id) ?? null,
        id: r.id,
        number: r.number,
        status: r.status,
        total: r.total.toString(),
        reason: r.reason,
        warehouseId: r.warehouseId,
        disposition: r.disposition, settlementStatus: r.settlementStatus, refundAmount: r.refundAmount?.toString(), refundedAt: r.refundedAt, replacementDeliveryId: r.replacementDeliveryId,
        approved: Boolean(r.approvedById && r.inspectedAt),
        items: r.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity.toString(),
          historicalUnitCost: i.historicalUnitCost?.toString() ?? null,
        })),
      })),
      purchaseReturns: purchaseReturns.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        total: r.total.toString(),
        reason: r.reason,
        warehouseId: r.warehouseId,
        approved: Boolean(r.approvedById && r.inspectedAt),
        items: r.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity.toString(),
          historicalUnitCost: i.historicalUnitCost?.toString() ?? null,
        })),
      })),
      claims: claims.map((c) => ({
        id: c.id,
        number: c.number,
        claimType: c.claimType,
        status: c.status,
        amount: c.amount.toString(),
        partnerName: c.partnerName, ownerId: c.ownerId, dueAt: c.dueAt, evidenceFileId: c.evidenceFileId, resolution: c.resolution,
      })),
      customers: customers.map((c) => ({ id: c.id, name: c.name })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        salePrice: p.salePrice.toString(),
        purchasePrice: p.purchasePrice.toString(),
      })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, type: w.type })),
      salesInvoices: salesInvoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        customerId: inv.customerId,
        warehouseId: inv.deliveryOrder?.warehouseId ?? null,
        items: inv.items
          .filter((i) => i.productId)
          .map((i) => ({
            id: i.id,
            productId: i.productId as string,
            description: i.description,
            quantity: i.quantity.toString(),
            unitPrice: i.unitPrice.toString(),
            returned: (invReturned.get(i.id) ?? "0").toString(),
          })),
      })),
      goodsReceipts: goodsReceipts.map((gr) => ({
        id: gr.id,
        number: gr.number,
        supplierId: gr.supplierId,
        warehouseId: gr.warehouseId,
        items: gr.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantityReceived.toString(),
          unitCost: i.unitCost.toString(),
          returned: (grReturned.get(i.id) ?? "0").toString(),
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?:
        | "sales_return"
        | "approve_sales_return"
        | "approve_purchase_return"
        | "post_sales_return"
        | "post_purchase_return"
        | "purchase_return"
        | "claim" | "release" | "dispose" | "approve_settlement" | "refund" | "replacement" | "advance_claim";
        id?: string;
        targetWarehouseId?: string; bankAccountId?: string; ownerId?: string; dueAt?: string; evidenceFileId?: string; salesReturnId?: string; claimStatus?: "IN_PROGRESS" | "RESOLVED"; resolution?: string;
        customerId?: string;
        supplierId?: string;
        warehouseId?: string;
        reason?: string;
        inspectionNotes?: string;
        disposition?: "QUARANTINE" | "REJECTED";
        salesInvoiceId?: string;
        purchaseOrderId?: string;
        idempotencyKey?: string;
      claimType?: string;
      partnerName?: string;
      amount?: string | number;
      items?: Array<{
        productId: string;
        sourceItemId?: string;
        sourceReceiptItemId?: string;
        quantity: string | number;
        unitPrice?: string | number;
        unitCost?: string | number;
      }>;
    };

    if (["release", "dispose", "approve_settlement", "refund", "replacement"].includes(body.action ?? "")) {
      const ctx = await requirePermission("return:post");
      await requirePermission("return:approve");
      const doc = await prisma.salesReturn.findFirst({ where: { id: String(body.id ?? ""), companyId: ctx.companyId } });
      await assertRequestAccess(ctx, { warehouseId: doc?.warehouseId });
      if (body.targetWarehouseId) await assertRequestAccess(ctx, { warehouseId: body.targetWarehouseId });
      const input = { companyId: ctx.companyId, userId: ctx.user.id, id: String(body.id ?? "") };
      if (body.action === "release") return releaseSalesReturn({ ...input, targetWarehouseId: String(body.targetWarehouseId ?? ""), inspectionNotes: body.inspectionNotes });
      if (body.action === "dispose") return disposeSalesReturn(input);
      if (body.action === "approve_settlement") return approveReturnSettlement({ ...input, amount: body.amount ?? 0 });
      if (body.action === "refund") return refundSalesReturn({ ...input, bankAccountId: String(body.bankAccountId ?? ""), amount: body.amount ?? 0 });
      return replaceSalesReturn({ ...input, targetWarehouseId: String(body.targetWarehouseId ?? ""), idempotencyKey: body.idempotencyKey });
    }
    if (body.action === "advance_claim") {
      const ctx = await requirePermission("claim:manage");
      if (body.claimStatus === "RESOLVED") await requirePermission("return:approve");
      return advanceClaim({ companyId: ctx.companyId, userId: ctx.user.id, id: String(body.id ?? ""), status: body.claimStatus === "RESOLVED" ? "RESOLVED" : "IN_PROGRESS", resolution: body.resolution });
    }

    if (body.action === "approve_sales_return" || body.action === "approve_purchase_return") {
      const ctx = await requirePermission("return:approve");
      const doc = body.action === "approve_sales_return" ? await prisma.salesReturn.findFirst({ where: { id: body.id, companyId: ctx.companyId } }) : await prisma.purchaseReturn.findFirst({ where: { id: body.id, companyId: ctx.companyId } });
      await assertRequestAccess(ctx, { ...body, warehouseId: doc?.warehouseId });
      return approveReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
        kind: body.action === "approve_sales_return" ? "sales" : "purchase",
        inspectionNotes: String(body.inspectionNotes ?? ""),
        disposition: body.disposition === "REJECTED" ? "REJECTED" : undefined,
      });
    }

    if (body.action === "post_sales_return") {
      const ctx = await requirePermission("return:approve");
    await assertRequestAccess(ctx, body);
      return postSalesReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
      });
    }

    if (body.action === "post_purchase_return") {
      const ctx = await requirePermission("return:approve");
    await assertRequestAccess(ctx, body);
      return postPurchaseReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
      });
    }

    if (body.action === "claim") {
      const ctx = await requirePermission("claim:manage");
    await assertRequestAccess(ctx, body);
      const claim = await createClaim({
        companyId: ctx.companyId,
        claimType: String(body.claimType ?? "CUSTOMER"),
        partnerName: body.partnerName,
        amount: body.amount ?? 0,
        reason: body.reason, ownerId: body.ownerId, dueAt: body.dueAt ? new Date(body.dueAt) : undefined, evidenceFileId: body.evidenceFileId || undefined, salesReturnId: body.salesReturnId || undefined,
      });
      return { claim: { id: claim.id, number: claim.number } };
    }

    if (body.action === "purchase_return") {
      const ctx = await requirePermission("return:create");
    await assertRequestAccess(ctx, body);
      const doc = await createPurchaseReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        supplierId: String(body.supplierId ?? ""),
        warehouseId: body.warehouseId,
        purchaseOrderId: body.purchaseOrderId,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
        items: (body.items ?? []).map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          sourceReceiptItemId: i.sourceReceiptItemId,
        })),
      });
      return { purchaseReturn: { id: doc.id, number: doc.number } };
    }

    const ctx = await requirePermission("return:create");
    await assertRequestAccess(ctx, body);
    const doc = await createSalesReturn({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      customerId: String(body.customerId ?? ""),
      warehouseId: body.warehouseId,
      salesInvoiceId: body.salesInvoiceId,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      items: (body.items ?? []).map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        sourceItemId: i.sourceItemId,
      })),
    });
    return { salesReturn: { id: doc.id, number: doc.number } };
  });
}
