import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  awardRfq,
  createRfq,
  submitVendorQuotation,
} from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [rfqs, suppliers, products, prs, warehouses, branches, quotations] =
      await Promise.all([
        prisma.requestForQuotation.findMany({
          where: { companyId: ctx.companyId },
          include: {
            vendors: { include: { supplier: true } },
            quotations: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.supplier.findMany({
          where: { companyId: ctx.companyId, isActive: true },
        }),
        prisma.product.findMany({
          where: { companyId: ctx.companyId, isArchived: false },
        }),
        prisma.purchaseRequest.findMany({
          where: { companyId: ctx.companyId, status: "APPROVED" },
        }),
        prisma.warehouse.findMany({
          where: { companyId: ctx.companyId, isActive: true },
        }),
        prisma.branch.findMany({
          where: { companyId: ctx.companyId, isActive: true },
        }),
        prisma.vendorQuotation.findMany({
          where: { companyId: ctx.companyId },
          include: { supplier: true, rfq: true, items: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    return {
      rfqs: rfqs.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        notes: r.notes,
        vendors: r.vendors.map((v) => ({
          supplierId: v.supplierId,
          supplierName: v.supplier.name,
        })),
        quotationCount: r.quotations.length,
      })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        purchasePrice: p.purchasePrice.toString(),
      })),
      purchaseRequests: prs.map((pr) => ({ id: pr.id, number: pr.number })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code })),
      branches: branches.map((b) => ({ id: b.id, code: b.code })),
      quotations: quotations.map((q) => ({
        id: q.id,
        rfqId: q.rfqId,
        rfqNumber: q.rfq.number,
        supplierId: q.supplierId,
        supplierName: q.supplier.name,
        total: q.total.toString(),
        isAwarded: q.isAwarded,
        items: q.items.map((i) => ({
          productId: i.productId,
          description: i.description,
          quantity: i.quantity.toString(),
          unitPrice: i.unitPrice.toString(),
          total: i.total.toString(),
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "quotation" | "award";
      purchaseRequestId?: string;
      supplierIds?: string[];
      notes?: string;
      rfqId?: string;
      supplierId?: string;
      quotationId?: string;
      warehouseId?: string;
      branchId?: string;
      items?: Array<{
        productId?: string;
        description: string;
        quantity: string | number;
        unitPrice: string | number;
      }>;
    };

    if (body.action === "quotation") {
      const ctx = await requirePermission("rfq:create");
      const q = await submitVendorQuotation({
        companyId: ctx.companyId,
        rfqId: String(body.rfqId ?? ""),
        supplierId: String(body.supplierId ?? ""),
        items: body.items ?? [],
      });
      return { quotation: { id: q.id, total: q.total.toString() } };
    }

    if (body.action === "award") {
      const ctx = await requirePermission("rfq:award");
      const result = await awardRfq({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        rfqId: String(body.rfqId ?? ""),
        quotationId: String(body.quotationId ?? ""),
        warehouseId: body.warehouseId || undefined,
        branchId: body.branchId || undefined,
      });
      return {
        awarded: true,
        purchaseOrder: result.purchaseOrder
          ? {
              id: result.purchaseOrder.id,
              number: result.purchaseOrder.number,
            }
          : null,
      };
    }

    const ctx = await requirePermission("rfq:create");
    const rfq = await createRfq({
      companyId: ctx.companyId,
      purchaseRequestId: body.purchaseRequestId || undefined,
      supplierIds: body.supplierIds ?? [],
      notes: body.notes || undefined,
    });
    return { rfq: { id: rfq.id, number: rfq.number, status: rfq.status } };
  });
}
