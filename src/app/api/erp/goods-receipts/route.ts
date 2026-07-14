import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { postGoodsReceipt } from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [receipts, openPos, warehouses] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where: { companyId: ctx.companyId },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          companyId: ctx.companyId,
          status: { in: ["APPROVED", "SENT", "PARTIALLY_RECEIVED"] },
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    return {
      receipts: receipts.map((gr) => ({
        id: gr.id,
        number: gr.number,
        status: gr.status,
        receiptDate: gr.receiptDate.toISOString(),
        supplier: { name: gr.supplier.name },
        items: gr.items.map((i) => ({
          sku: i.product.sku,
          quantityReceived: i.quantityReceived.toString(),
        })),
      })),
      openPos: openPos.map((po) => ({
        id: po.id,
        number: po.number,
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        warehouseId: po.warehouseId,
        items: po.items.map((i) => ({
          productId: i.productId,
          sku: i.product.sku,
          name: i.product.name,
          quantity: i.quantity.toString(),
          quantityReceived: i.quantityReceived.toString(),
          unitPrice: i.unitPrice.toString(),
        })),
      })),
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("goods_receipt:post");
    const body = (await req.json()) as {
      purchaseOrderId?: string;
      warehouseId?: string;
      supplierDeliveryNote?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        quantityReceived: string | number;
        unitCost?: string | number;
      }>;
    };

    const gr = await postGoodsReceipt({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      purchaseOrderId: String(body.purchaseOrderId ?? ""),
      warehouseId: String(body.warehouseId ?? ""),
      supplierDeliveryNote: body.supplierDeliveryNote || undefined,
      notes: body.notes || undefined,
      items: body.items ?? [],
    });

    return {
      goodsReceipt: {
        id: gr.id,
        number: gr.number,
        status: gr.status,
      },
    };
  });
}
