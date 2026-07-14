import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
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
    const [salesReturns, purchaseReturns, claims, customers, suppliers, products, warehouses] =
      await Promise.all([
        prisma.salesReturn.findMany({
          where: { companyId: ctx.companyId },
          include: { items: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.purchaseReturn.findMany({
          where: { companyId: ctx.companyId },
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
          where: { companyId: ctx.companyId, isActive: true },
        }),
      ]);

    return {
      salesReturns: salesReturns.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        total: r.total.toString(),
        reason: r.reason,
      })),
      purchaseReturns: purchaseReturns.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        total: r.total.toString(),
        reason: r.reason,
      })),
      claims: claims.map((c) => ({
        id: c.id,
        number: c.number,
        claimType: c.claimType,
        status: c.status,
        amount: c.amount.toString(),
        partnerName: c.partnerName,
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
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?:
        | "sales_return"
        | "post_sales_return"
        | "purchase_return"
        | "post_purchase_return"
        | "claim";
      id?: string;
      customerId?: string;
      supplierId?: string;
      warehouseId?: string;
      reason?: string;
      claimType?: string;
      partnerName?: string;
      amount?: string | number;
      items?: Array<{
        productId: string;
        quantity: string | number;
        unitPrice?: string | number;
        unitCost?: string | number;
      }>;
    };

    if (body.action === "post_sales_return") {
      const ctx = await requirePermission("return:post");
      const doc = await postSalesReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
      });
      return { salesReturn: { id: doc.id, status: doc.status } };
    }

    if (body.action === "post_purchase_return") {
      const ctx = await requirePermission("return:post");
      const doc = await postPurchaseReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
      });
      return { purchaseReturn: { id: doc.id, status: doc.status } };
    }

    if (body.action === "claim") {
      const ctx = await requirePermission("claim:manage");
      const claim = await createClaim({
        companyId: ctx.companyId,
        claimType: String(body.claimType ?? "CUSTOMER"),
        partnerName: body.partnerName,
        amount: body.amount ?? 0,
        reason: body.reason,
      });
      return { claim: { id: claim.id, number: claim.number } };
    }

    if (body.action === "purchase_return") {
      const ctx = await requirePermission("return:create");
      const doc = await createPurchaseReturn({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        supplierId: String(body.supplierId ?? ""),
        warehouseId: body.warehouseId,
        reason: body.reason,
        items: (body.items ?? []).map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCost: i.unitCost ?? 0,
        })),
      });
      return { purchaseReturn: { id: doc.id, number: doc.number } };
    }

    const ctx = await requirePermission("return:create");
    const doc = await createSalesReturn({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      customerId: String(body.customerId ?? ""),
      warehouseId: body.warehouseId,
      reason: body.reason,
      items: (body.items ?? []).map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? 0,
      })),
    });
    return { salesReturn: { id: doc.id, number: doc.number } };
  });
}
