import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { validationError } from "@/lib/errors";
import { qty, toPrismaDecimal } from "@/lib/money";

export async function runMrp(input: {
  companyId: string;
  userId: string;
  horizonDays?: number;
  notes?: string;
}) {
  const horizonDays = input.horizonDays ?? 30;
  if (horizonDays <= 0) throw validationError("Horizon harus > 0");

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + horizonDays);

  const [balances, openSoItems, openPoItems, openMo, boms] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { companyId: input.companyId },
    }),
    prisma.salesOrderItem.findMany({
      where: {
        salesOrder: {
          companyId: input.companyId,
          status: {
            in: ["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"],
          },
        },
      },
    }),
    prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          companyId: input.companyId,
          status: {
            in: ["APPROVED", "SENT", "PARTIALLY_RECEIVED"],
          },
        },
      },
    }),
    prisma.productionOrder.findMany({
      where: {
        companyId: input.companyId,
        status: { in: ["RELEASED", "IN_PROGRESS", "DRAFT"] },
      },
      include: { materials: true },
    }),
    prisma.billOfMaterials.findMany({
      where: { companyId: input.companyId, isActive: true },
      include: { items: true },
    }),
  ]);

  const onHand = new Map<string, ReturnType<typeof qty>>();
  for (const b of balances) {
    const prev = onHand.get(b.productId) ?? qty(0);
    onHand.set(b.productId, prev.plus(qty(b.quantityOnHand)));
  }

  const demand = new Map<string, ReturnType<typeof qty>>();
  for (const item of openSoItems) {
    const remaining = qty(item.quantity).minus(qty(item.quantityDelivered));
    if (remaining.lte(0)) continue;
    demand.set(
      item.productId,
      (demand.get(item.productId) ?? qty(0)).plus(remaining),
    );
  }
  for (const mo of openMo) {
    const remainingFg = qty(mo.plannedQty).minus(qty(mo.completedQty));
    if (remainingFg.lte(0)) continue;
    for (const mat of mo.materials) {
      const rem = qty(mat.plannedQty).minus(qty(mat.issuedQty));
      if (rem.lte(0)) continue;
      demand.set(
        mat.productId,
        (demand.get(mat.productId) ?? qty(0)).plus(rem),
      );
    }
  }

  const supply = new Map<string, ReturnType<typeof qty>>();
  for (const item of openPoItems) {
    const remaining = qty(item.quantity).minus(qty(item.quantityReceived));
    if (remaining.lte(0)) continue;
    supply.set(
      item.productId,
      (supply.get(item.productId) ?? qty(0)).plus(remaining),
    );
  }
  for (const mo of openMo) {
    const remainingFg = qty(mo.plannedQty).minus(qty(mo.completedQty));
    if (remainingFg.lte(0)) continue;
    supply.set(
      mo.finishedProductId,
      (supply.get(mo.finishedProductId) ?? qty(0)).plus(remainingFg),
    );
  }

  // explode FG demand through BOM for make items
  for (const bom of boms) {
    const fgDemand = demand.get(bom.finishedProductId) ?? qty(0);
    const fgSupply = supply.get(bom.finishedProductId) ?? qty(0);
    const fgOnHand = onHand.get(bom.finishedProductId) ?? qty(0);
    const netFg = fgDemand.minus(fgSupply).minus(fgOnHand);
    if (netFg.lte(0)) continue;
    const bomQty = qty(bom.quantity).gt(0) ? qty(bom.quantity) : qty(1);
    for (const item of bom.items) {
      const need = qty(item.quantity)
        .mul(netFg)
        .div(bomQty)
        .mul(qty(1).plus(qty(item.scrapPct).div(100)));
      demand.set(
        item.productId,
        (demand.get(item.productId) ?? qty(0)).plus(need),
      );
    }
  }

  const productIds = new Set<string>([
    ...onHand.keys(),
    ...demand.keys(),
    ...supply.keys(),
  ]);

  const suggestions: Array<{
    productId: string;
    suggestionType: string;
    quantity: string;
    onHand: string;
    demand: string;
    supply: string;
    dueDate: Date;
    sourceRef: string;
  }> = [];

  for (const productId of productIds) {
    const oh = onHand.get(productId) ?? qty(0);
    const d = demand.get(productId) ?? qty(0);
    const s = supply.get(productId) ?? qty(0);
    const net = d.minus(s).minus(oh);
    if (net.lte(0)) continue;

    const hasBom = boms.some((b) => b.finishedProductId === productId);
    suggestions.push({
      productId,
      suggestionType: hasBom ? "PRODUCE" : "PURCHASE",
      quantity: toPrismaDecimal(net),
      onHand: toPrismaDecimal(oh),
      demand: toPrismaDecimal(d),
      supply: toPrismaDecimal(s),
      dueDate: until,
      sourceRef: hasBom ? "BOM_EXPLOSION" : "NET_REQUIREMENT",
    });
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "MRP");
    const run = await tx.mrpRun.create({
      data: {
        companyId: input.companyId,
        number,
        status: "POSTED",
        horizonDays,
        notes: input.notes,
        createdById: input.userId,
        lines: {
          create: suggestions.map((s) => ({
            productId: s.productId,
            suggestionType: s.suggestionType,
            quantity: s.quantity,
            onHand: s.onHand,
            demand: s.demand,
            supply: s.supply,
            dueDate: s.dueDate,
            sourceRef: s.sourceRef,
          })),
        },
      },
      include: { lines: true },
    });
    return run;
  });
}
