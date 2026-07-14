import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { newIdempotencyKey } from "@/lib/idempotency";
import { money, qty, toPrismaDecimal, toPrismaMoney } from "@/lib/money";
import { postStockMovement } from "@/server/services/inventory";
import { postFromRule } from "@/server/services/accounting";

export async function createWorkCenter(input: {
  companyId: string;
  code: string;
  name: string;
  description?: string;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama work center wajib");
  }
  return prisma.workCenter.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description,
    },
  });
}

export async function createBom(input: {
  companyId: string;
  code: string;
  name: string;
  finishedProductId: string;
  quantity?: string | number;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: string | number;
    scrapPct?: string | number;
  }>;
}) {
  if (!input.items.length) throw validationError("BOM minimal 1 komponen");
  if (input.items.some((i) => i.productId === input.finishedProductId)) {
    throw validationError("Komponen tidak boleh sama dengan finished good");
  }
  return prisma.billOfMaterials.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      finishedProductId: input.finishedProductId,
      quantity: toPrismaDecimal(qty(input.quantity ?? 1)),
      notes: input.notes,
      items: {
        create: input.items.map((i) => ({
          productId: i.productId,
          quantity: toPrismaDecimal(qty(i.quantity)),
          scrapPct: toPrismaDecimal(qty(i.scrapPct ?? 0)),
        })),
      },
    },
    include: { items: true, finishedProduct: true },
  });
}

export async function createRouting(input: {
  companyId: string;
  code: string;
  name: string;
  notes?: string;
  steps: Array<{
    workCenterId: string;
    sequence: number;
    name: string;
    setupMinutes?: string | number;
    runMinutes?: string | number;
  }>;
}) {
  if (!input.steps.length) throw validationError("Routing minimal 1 step");
  return prisma.routing.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      notes: input.notes,
      steps: {
        create: input.steps.map((s) => ({
          workCenterId: s.workCenterId,
          sequence: s.sequence,
          name: s.name,
          setupMinutes: toPrismaMoney(money(s.setupMinutes ?? 0)),
          runMinutes: toPrismaMoney(money(s.runMinutes ?? 0)),
        })),
      },
    },
    include: { steps: true },
  });
}

export async function createProductionOrder(input: {
  companyId: string;
  userId: string;
  finishedProductId: string;
  bomId?: string;
  routingId?: string;
  warehouseId?: string;
  plannedQty: string | number;
  notes?: string;
}) {
  const plannedQty = qty(input.plannedQty);
  if (plannedQty.lte(0)) throw validationError("Qty rencana harus > 0");

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "MO");
    let materials: Array<{
      productId: string;
      plannedQty: string;
      unitCost: string;
    }> = [];

    if (input.bomId) {
      const bom = await tx.billOfMaterials.findFirst({
        where: { id: input.bomId, companyId: input.companyId, isActive: true },
        include: { items: { include: { product: true } } },
      });
      if (!bom) throw notFound("BOM tidak ditemukan");
      const bomQty = qty(bom.quantity);
      materials = bom.items.map((item) => {
        const factor = plannedQty.div(bomQty.gt(0) ? bomQty : qty(1));
        const scrap = qty(item.scrapPct).div(100);
        const need = qty(item.quantity).mul(factor).mul(qty(1).plus(scrap));
        return {
          productId: item.productId,
          plannedQty: toPrismaDecimal(need),
          unitCost: toPrismaMoney(money(item.product.purchasePrice)),
        };
      });
    }

    let steps: Array<{
      workCenterId?: string;
      sequence: number;
      name: string;
      plannedMinutes: string;
      laborRate: string;
      overheadRate: string;
    }> = [];
    if (input.routingId) {
      const routing = await tx.routing.findFirst({
        where: {
          id: input.routingId,
          companyId: input.companyId,
          isActive: true,
        },
        include: { steps: { orderBy: { sequence: "asc" } } },
      });
      if (!routing) throw notFound("Routing tidak ditemukan");
      steps = routing.steps.map((s) => ({
        workCenterId: s.workCenterId,
        sequence: s.sequence,
        name: s.name,
        plannedMinutes: toPrismaMoney(
          money(s.setupMinutes).plus(money(s.runMinutes).mul(plannedQty)),
        ),
        laborRate: "50000",
        overheadRate: "15000",
      }));
    }

    const order = await tx.productionOrder.create({
      data: {
        companyId: input.companyId,
        number,
        status: "DRAFT",
        finishedProductId: input.finishedProductId,
        bomId: input.bomId,
        routingId: input.routingId,
        warehouseId: input.warehouseId,
        plannedQty: toPrismaDecimal(plannedQty),
        notes: input.notes,
        createdById: input.userId,
        materials: {
          create: materials.map((m) => ({
            productId: m.productId,
            plannedQty: m.plannedQty,
            unitCost: m.unitCost,
            totalCost: "0",
          })),
        },
        steps: {
          create: steps.map((s) => ({
            workCenterId: s.workCenterId,
            sequence: s.sequence,
            name: s.name,
            plannedMinutes: s.plannedMinutes,
            laborRate: s.laborRate,
            overheadRate: s.overheadRate,
          })),
        },
      },
      include: {
        materials: true,
        steps: true,
        finishedProduct: true,
      },
    });

    await writeAudit({
      companyId: input.companyId,
      userId: input.userId,
      action: "production_order.create",
      entityType: "ProductionOrder",
      entityId: order.id,
      entityNumber: order.number,
    });

    return order;
  });
}

export async function releaseProductionOrder(
  companyId: string,
  userId: string,
  id: string,
) {
  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId },
  });
  if (!order) throw notFound("Production order tidak ditemukan");
  if (order.status !== "DRAFT") {
    throw conflict("Hanya draft yang bisa di-release");
  }
  return prisma.productionOrder.update({
    where: { id },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
}

export async function issueProductionMaterials(input: {
  companyId: string;
  userId: string;
  productionOrderId: string;
  warehouseId: string;
  items?: Array<{ productId: string; quantity: string | number }>;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: input.productionOrderId, companyId: input.companyId },
      include: { materials: true, company: true },
    });
    if (!order) throw notFound("Production order tidak ditemukan");
    if (!["RELEASED", "IN_PROGRESS"].includes(order.status)) {
      throw conflict("Order belum release");
    }

    const key = newIdempotencyKey("mo-issue");
    const issueItems =
      input.items?.length
        ? input.items
        : order.materials.map((m) => ({
            productId: m.productId,
            quantity: qty(m.plannedQty).minus(qty(m.issuedQty)).toString(),
          }));

    for (const item of issueItems) {
      const material = order.materials.find((m) => m.productId === item.productId);
      if (!material) throw validationError("Material tidak ada di order");
      const q = qty(item.quantity);
      if (q.lte(0)) continue;
      const remaining = qty(material.plannedQty).minus(qty(material.issuedQty));
      if (q.gt(remaining)) {
        throw conflict("Issue melebihi sisa planned material");
      }

      await postStockMovement(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        type: "PRODUCTION_ISSUE",
        quantity: q.toString(),
        unitCost: material.unitCost.toString(),
        referenceType: "ProductionOrder",
        referenceId: order.id,
        referenceNumber: order.number,
        createdById: input.userId,
        idempotencyKey: `${key}:${item.productId}`,
        allowNegative: order.company.allowNegativeStock,
      });

      const issuedTotal = qty(material.issuedQty).plus(q);
      const lineCost = q.mul(money(material.unitCost));
      await tx.productionMaterial.update({
        where: { id: material.id },
        data: {
          issuedQty: toPrismaDecimal(issuedTotal),
          totalCost: toPrismaMoney(money(material.totalCost).plus(lineCost)),
        },
      });

      await tx.productionCostEntry.create({
        data: {
          productionOrderId: order.id,
          costType: "MATERIAL",
          amount: toPrismaMoney(lineCost),
          quantity: toPrismaDecimal(q),
          reference: item.productId,
          notes: "Material issue",
        },
      });
    }

    const refreshed = await tx.productionMaterial.findMany({
      where: { productionOrderId: order.id },
    });
    const materialCost = refreshed.reduce(
      (acc, m) => acc.plus(money(m.totalCost)),
      money(0),
    );

    await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: "IN_PROGRESS",
        materialCost: toPrismaMoney(materialCost),
        totalCost: toPrismaMoney(
          materialCost.plus(money(order.laborCost)).plus(money(order.overheadCost)),
        ),
      },
    });

    return { ok: true, productionOrderId: order.id };
  });
}

export async function reportProductionLabor(input: {
  companyId: string;
  productionOrderId: string;
  stepId: string;
  minutes: string | number;
}) {
  const order = await prisma.productionOrder.findFirst({
    where: { id: input.productionOrderId, companyId: input.companyId },
    include: { steps: true },
  });
  if (!order) throw notFound("Production order tidak ditemukan");
  const step = order.steps.find((s) => s.id === input.stepId);
  if (!step) throw notFound("Step tidak ditemukan");

  const minutes = money(input.minutes);
  if (minutes.lte(0)) throw validationError("Menit harus > 0");

  const labor = minutes.div(60).mul(money(step.laborRate));
  const overhead = minutes.div(60).mul(money(step.overheadRate));

  await prisma.$transaction(async (tx) => {
    await tx.productionStep.update({
      where: { id: step.id },
      data: {
        reportedMinutes: toPrismaMoney(money(step.reportedMinutes).plus(minutes)),
        laborCost: toPrismaMoney(money(step.laborCost).plus(labor)),
        overheadCost: toPrismaMoney(money(step.overheadCost).plus(overhead)),
        isDone: true,
      },
    });
    await tx.productionCostEntry.createMany({
      data: [
        {
          productionOrderId: order.id,
          costType: "LABOR",
          amount: toPrismaMoney(labor),
          quantity: toPrismaDecimal(minutes),
          reference: step.id,
          notes: step.name,
        },
        {
          productionOrderId: order.id,
          costType: "OVERHEAD",
          amount: toPrismaMoney(overhead),
          quantity: toPrismaDecimal(minutes),
          reference: step.id,
          notes: step.name,
        },
      ],
    });
    const nextLabor = money(order.laborCost).plus(labor);
    const nextOverhead = money(order.overheadCost).plus(overhead);
    await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        laborCost: toPrismaMoney(nextLabor),
        overheadCost: toPrismaMoney(nextOverhead),
        totalCost: toPrismaMoney(
          money(order.materialCost).plus(nextLabor).plus(nextOverhead),
        ),
        status: order.status === "RELEASED" ? "IN_PROGRESS" : order.status,
      },
    });
  }, { maxWait: 15000, timeout: 60000 });

  return { ok: true };
}

export async function completeProductionOrder(input: {
  companyId: string;
  userId: string;
  productionOrderId: string;
  warehouseId: string;
  quantity: string | number;
  unitCost?: string | number;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: input.productionOrderId, companyId: input.companyId },
      include: { materials: true, company: true, finishedProduct: true },
    });
    if (!order) throw notFound("Production order tidak ditemukan");
    if (!["RELEASED", "IN_PROGRESS"].includes(order.status)) {
      throw conflict("Order tidak bisa di-complete");
    }

    const completeQty = qty(input.quantity);
    if (completeQty.lte(0)) throw validationError("Qty selesai harus > 0");
    const remaining = qty(order.plannedQty).minus(qty(order.completedQty));
    if (completeQty.gt(remaining)) {
      throw conflict("Qty selesai melebihi sisa planned");
    }

    const materialCost = order.materials.reduce(
      (acc, m) => acc.plus(money(m.totalCost)),
      money(0),
    );
    const totalCost = materialCost
      .plus(money(order.laborCost))
      .plus(money(order.overheadCost));
    const unitCost = input.unitCost
      ? money(input.unitCost)
      : completeQty.gt(0)
        ? totalCost.div(completeQty)
        : money(0);

    const key = newIdempotencyKey("mo-fg");
    await postStockMovement(tx, {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: order.finishedProductId,
      type: "PRODUCTION_RECEIPT",
      quantity: completeQty.toString(),
      unitCost: unitCost.toString(),
      referenceType: "ProductionOrder",
      referenceId: order.id,
      referenceNumber: order.number,
      createdById: input.userId,
      idempotencyKey: key,
      allowNegative: order.company.allowNegativeStock,
    });

    const nextCompleted = qty(order.completedQty).plus(completeQty);
    const done = nextCompleted.gte(qty(order.plannedQty));

    await tx.productionCostEntry.create({
      data: {
        productionOrderId: order.id,
        costType: "FINISHED_GOOD",
        amount: toPrismaMoney(unitCost.mul(completeQty)),
        quantity: toPrismaDecimal(completeQty),
        reference: order.finishedProductId,
        notes: "FG receipt costing",
      },
    });

    const updated = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        completedQty: toPrismaDecimal(nextCompleted),
        materialCost: toPrismaMoney(materialCost),
        totalCost: toPrismaMoney(totalCost),
        unitCost: toPrismaMoney(unitCost),
        status: done ? "COMPLETED" : "IN_PROGRESS",
        completedAt: done ? new Date() : order.completedAt,
      },
    });

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "production.complete",
      sourceDocType: "ProductionOrder",
      sourceDocId: order.id,
      description: `MO FG ${order.number}`,
      amount: unitCost.mul(completeQty).toString(),
      idempotencyKey: `je:${key}`,
      postedById: input.userId,
    });

    return updated;
  }, { maxWait: 15000, timeout: 60000 });
}

export async function getProductionCosting(
  companyId: string,
  productionOrderId: string,
) {
  const order = await prisma.productionOrder.findFirst({
    where: { id: productionOrderId, companyId },
    include: {
      materials: true,
      steps: true,
      costEntries: { orderBy: { createdAt: "asc" } },
      finishedProduct: true,
    },
  });
  if (!order) throw notFound("Production order tidak ditemukan");

  return {
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      plannedQty: order.plannedQty.toString(),
      completedQty: order.completedQty.toString(),
      materialCost: order.materialCost.toString(),
      laborCost: order.laborCost.toString(),
      overheadCost: order.overheadCost.toString(),
      totalCost: order.totalCost.toString(),
      unitCost: order.unitCost.toString(),
      finishedProduct: {
        sku: order.finishedProduct.sku,
        name: order.finishedProduct.name,
      },
    },
    materials: order.materials.map((m) => ({
      productId: m.productId,
      plannedQty: m.plannedQty.toString(),
      issuedQty: m.issuedQty.toString(),
      unitCost: m.unitCost.toString(),
      totalCost: m.totalCost.toString(),
    })),
    steps: order.steps.map((s) => ({
      id: s.id,
      name: s.name,
      reportedMinutes: s.reportedMinutes.toString(),
      laborCost: s.laborCost.toString(),
      overheadCost: s.overheadCost.toString(),
      isDone: s.isDone,
    })),
    entries: order.costEntries.map((e) => ({
      id: e.id,
      costType: e.costType,
      amount: e.amount.toString(),
      quantity: e.quantity.toString(),
      reference: e.reference,
      notes: e.notes,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function closeProductionOrder(
  companyId: string,
  userId: string,
  id: string,
) {
  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId },
  });
  if (!order) throw notFound("Production order tidak ditemukan");
  if (!["COMPLETED", "IN_PROGRESS"].includes(order.status)) {
    throw conflict("Order belum bisa ditutup");
  }
  return prisma.productionOrder.update({
    where: { id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}
