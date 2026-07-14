import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  closeProductionOrder,
  completeProductionOrder,
  createBom,
  createProductionOrder,
  createRouting,
  createWorkCenter,
  getProductionCosting,
  issueProductionMaterials,
  releaseProductionOrder,
  reportProductionLabor,
} from "@/server/services/manufacturing";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [
      workCenters,
      boms,
      routings,
      orders,
      products,
      warehouses,
    ] = await Promise.all([
      prisma.workCenter.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { code: "asc" },
      }),
      prisma.billOfMaterials.findMany({
        where: { companyId: ctx.companyId },
        include: {
          finishedProduct: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.routing.findMany({
        where: { companyId: ctx.companyId },
        include: { steps: { include: { workCenter: true }, orderBy: { sequence: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.productionOrder.findMany({
        where: { companyId: ctx.companyId },
        include: {
          finishedProduct: true,
          materials: true,
          steps: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, isArchived: false },
      }),
      prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    return {
      workCenters: workCenters.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        isActive: w.isActive,
      })),
      boms: boms.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        version: b.version,
        quantity: b.quantity.toString(),
        finishedProduct: {
          id: b.finishedProduct.id,
          sku: b.finishedProduct.sku,
          name: b.finishedProduct.name,
        },
        items: b.items.map((i) => ({
          productId: i.productId,
          sku: i.product.sku,
          quantity: i.quantity.toString(),
          scrapPct: i.scrapPct.toString(),
        })),
      })),
      routings: routings.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        version: r.version,
        steps: r.steps.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          name: s.name,
          workCenterCode: s.workCenter.code,
          setupMinutes: s.setupMinutes.toString(),
          runMinutes: s.runMinutes.toString(),
        })),
      })),
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        plannedQty: o.plannedQty.toString(),
        completedQty: o.completedQty.toString(),
        warehouseId: o.warehouseId,
        materialCost: o.materialCost.toString(),
        laborCost: o.laborCost.toString(),
        overheadCost: o.overheadCost.toString(),
        totalCost: o.totalCost.toString(),
        unitCost: o.unitCost.toString(),
        finishedProduct: {
          id: o.finishedProduct.id,
          sku: o.finishedProduct.sku,
          name: o.finishedProduct.name,
        },
        materials: o.materials.map((m) => ({
          productId: m.productId,
          plannedQty: m.plannedQty.toString(),
          issuedQty: m.issuedQty.toString(),
          totalCost: m.totalCost.toString(),
        })),
        steps: o.steps.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          name: s.name,
          isDone: s.isDone,
          laborCost: s.laborCost.toString(),
          overheadCost: s.overheadCost.toString(),
        })),
      })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        purchasePrice: p.purchasePrice.toString(),
      })),
      warehouses: warehouses.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?:
        | "work_center"
        | "bom"
        | "routing"
        | "create_order"
        | "release"
        | "issue"
        | "labor"
        | "costing"
        | "complete"
        | "close";
      id?: string;
      code?: string;
      name?: string;
      description?: string;
      finishedProductId?: string;
      quantity?: string | number;
      notes?: string;
      bomId?: string;
      routingId?: string;
      warehouseId?: string;
      plannedQty?: string | number;
      unitCost?: string | number;
      stepId?: string;
      minutes?: string | number;
      items?: Array<{
        productId: string;
        quantity: string | number;
        scrapPct?: string | number;
      }>;
      steps?: Array<{
        workCenterId: string;
        sequence: number;
        name: string;
        setupMinutes?: string | number;
        runMinutes?: string | number;
      }>;
      issueItems?: Array<{ productId: string; quantity: string | number }>;
    };

    if (body.action === "work_center") {
      const ctx = await requirePermission("work_center:manage");
      const wc = await createWorkCenter({
        companyId: ctx.companyId,
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        description: body.description,
      });
      return { workCenter: { id: wc.id, code: wc.code } };
    }

    if (body.action === "bom") {
      const ctx = await requirePermission("bom:manage");
      const bom = await createBom({
        companyId: ctx.companyId,
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        finishedProductId: String(body.finishedProductId ?? ""),
        quantity: body.quantity ?? 1,
        notes: body.notes,
        items: body.items ?? [],
      });
      return { bom: { id: bom.id, code: bom.code } };
    }

    if (body.action === "routing") {
      const ctx = await requirePermission("routing:manage");
      const routing = await createRouting({
        companyId: ctx.companyId,
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        notes: body.notes,
        steps: body.steps ?? [],
      });
      return { routing: { id: routing.id, code: routing.code } };
    }

    if (body.action === "create_order") {
      const ctx = await requirePermission("production_order:create");
      const order = await createProductionOrder({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        finishedProductId: String(body.finishedProductId ?? ""),
        bomId: body.bomId || undefined,
        routingId: body.routingId || undefined,
        warehouseId: body.warehouseId || undefined,
        plannedQty: body.plannedQty ?? 0,
        notes: body.notes,
      });
      return {
        productionOrder: {
          id: order.id,
          number: order.number,
          status: order.status,
        },
      };
    }

    if (body.action === "release") {
      const ctx = await requirePermission("production_order:release");
      const order = await releaseProductionOrder(
        ctx.companyId,
        ctx.user.id,
        String(body.id ?? ""),
      );
      return { productionOrder: { id: order.id, status: order.status } };
    }

    if (body.action === "issue") {
      const ctx = await requirePermission("production_order:report");
      const result = await issueProductionMaterials({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        productionOrderId: String(body.id ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
        items: body.issueItems,
      });
      return result;
    }

    if (body.action === "labor") {
      const ctx = await requirePermission("production_order:report");
      return reportProductionLabor({
        companyId: ctx.companyId,
        productionOrderId: String(body.id ?? ""),
        stepId: String(body.stepId ?? ""),
        minutes: body.minutes ?? 0,
      });
    }

    if (body.action === "costing") {
      const ctx = await requirePermission("production_order:view");
      return getProductionCosting(ctx.companyId, String(body.id ?? ""));
    }

    if (body.action === "complete") {
      const ctx = await requirePermission("production_order:report");
      const order = await completeProductionOrder({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        productionOrderId: String(body.id ?? ""),
        warehouseId: String(body.warehouseId ?? ""),
        quantity: body.quantity ?? 0,
        unitCost: body.unitCost,
      });
      return {
        productionOrder: {
          id: order.id,
          status: order.status,
          completedQty: order.completedQty.toString(),
          totalCost: order.totalCost.toString(),
          unitCost: order.unitCost.toString(),
        },
      };
    }

    if (body.action === "close") {
      const ctx = await requirePermission("production_order:close");
      const order = await closeProductionOrder(
        ctx.companyId,
        ctx.user.id,
        String(body.id ?? ""),
      );
      return { productionOrder: { id: order.id, status: order.status } };
    }

    await requireTenant();
    throw new Error("Action tidak dikenal");
  });
}
