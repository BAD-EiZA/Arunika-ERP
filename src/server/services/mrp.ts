import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, validationError } from "@/lib/errors";
import { qty, toPrismaDecimal } from "@/lib/money";

type Planning = { calendar: { workingDays: number[]; holidays: string[] }; products: { productId: string; leadTimeDays: number; lotSize: string; safetyStock: string }[] };
export function planningQuantity(value: unknown, positive = false) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+(?:\.\d{1,4})?$/.test(String(value))) throw validationError("Kuantitas planning tidak valid");
  const n = qty(value);
  if (n.gt("99999999999999.9999") || (positive ? n.lte(0) : n.lt(0))) throw validationError("Kuantitas planning di luar rentang");
  return n;
}
function validatePlanning(value: unknown): Planning {
  const p = value as Planning;
  if (!p || !p.calendar || !Array.isArray(p.calendar.workingDays) || !p.calendar.workingDays.length || p.calendar.workingDays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || !Array.isArray(p.calendar.holidays) || p.calendar.holidays.some(d => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d) || !Array.isArray(p.products)) throw validationError("Planning/calendar eksplisit wajib");
  const ids = new Set<string>();
  for (const product of p.products) {
    if (!product || typeof product.productId !== "string" || !product.productId || ids.has(product.productId) || !Number.isInteger(product.leadTimeDays) || product.leadTimeDays < 0 || product.leadTimeDays > 3660) throw validationError("Parameter produk planning tidak valid");
    ids.add(product.productId); planningQuantity(product.lotSize, true); planningQuantity(product.safetyStock);
  }
  return p;
}
export async function runMrp(input: {
  companyId: string;
  userId: string;
  horizonDays?: number;
  notes?: string;
  planning?: unknown;
}) {
  const horizonDays = input.horizonDays === undefined ? 30 : input.horizonDays;
  if (!Number.isSafeInteger(horizonDays) || horizonDays <= 0) {
    throw validationError("Horizon harus bilangan bulat positif");
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + horizonDays);
  if (!Number.isFinite(until.getTime()) || until.getUTCFullYear() > 9999) {
    throw validationError("Horizon harus bilangan bulat positif dalam rentang tanggal database");
  }

  const planning = validatePlanning(input.planning);
  const configs = new Map(planning.products.map(p => [p.productId, p]));
  const config = (id: string) => { const p = configs.get(id); if (!p) throw validationError(`Planning produk wajib: ${id}`); return p; };
  const working = (date: Date, offset = 0) => {
    const d = new Date(date); d.setUTCHours(0,0,0,0);
    const valid = () => planning.calendar.workingDays.includes(d.getUTCDay()) && !planning.calendar.holidays.includes(d.toISOString().slice(0,10));
    while (!valid()) d.setUTCDate(d.getUTCDate()-1);
    while (offset > 0) { d.setUTCDate(d.getUTCDate()-1); if (valid()) offset--; }
    return d;
  };
  return prisma.$transaction(async (tx) => {
  const locks = await tx.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"MRP:" + input.companyId}, 0)) AS locked`;
  if (!locks[0]?.locked) throw conflict("MRP perusahaan sedang berjalan");
  const [balances, openSoItems, openPoItems, openMo, boms, reservations] = await Promise.all([
    tx.stockBalance.findMany({
      where: { companyId: input.companyId },
    }),
    tx.salesOrderItem.findMany({
      where: {
        salesOrder: {
          companyId: input.companyId,
          status: {
            in: ["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"],
          },
        },
      },
      include: { salesOrder: { select: { deliveryDate: true } } },
    }),
    tx.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          companyId: input.companyId,
          status: {
            in: ["APPROVED", "SENT", "PARTIALLY_RECEIVED"],
          },
        },
      },
      include: { purchaseOrder: { select: { expectedDate: true } } },
    }),
    tx.productionOrder.findMany({
      where: {
        companyId: input.companyId,
        status: { in: ["RELEASED", "IN_PROGRESS", "DRAFT"] },
      },
      include: { materials: true },
    }),
    tx.billOfMaterials.findMany({
      where: { companyId: input.companyId, isActive: true },
      include: { items: true },
    }),
    tx.stockReservation.findMany({where:{companyId:input.companyId,isActive:true}}),
  ]);

  const onHand = new Map<string, ReturnType<typeof qty>>();
  for (const b of balances) {
    const prev = onHand.get(b.productId) ?? qty(0);
    onHand.set(b.productId, prev.plus(qty(b.quantityOnHand)));
  }

  type Buckets = Map<string, Map<number, ReturnType<typeof qty>>>;
  const demand: Buckets = new Map();
  const supply: Buckets = new Map();
  const unconfirmedSupply = new Set<string>();
  function add(target: Buckets, productId: string, amount: ReturnType<typeof qty>, date: Date | null) {
    if (amount.lte(0)) return;
    config(productId);
    const due = new Date(date ?? today);
    due.setUTCHours(0, 0, 0, 0);
    if (due > until) return;
    const time = Math.max(today.getTime(), due.getTime());
    const buckets = target.get(productId) ?? new Map<number, ReturnType<typeof qty>>();
    buckets.set(time, (buckets.get(time) ?? qty(0)).plus(amount));
    target.set(productId, buckets);
  }
  const represented = new Map<string, ReturnType<typeof qty>>();
  for (const item of openSoItems) {
    const remaining = qty(item.quantity).minus(qty(item.quantityDelivered));
    add(demand, item.productId, remaining, item.salesOrder?.deliveryDate ?? null);
    if (item.salesOrderId && remaining.gt(0) && (!item.salesOrder?.deliveryDate || item.salesOrder.deliveryDate <= until)) {
      const key = `${item.salesOrderId}:${item.productId}`;
      represented.set(key, (represented.get(key) ?? qty(0)).plus(remaining));
    }
  }
  for (const reservation of reservations) {
    const key = `${reservation.salesOrderId}:${reservation.productId}`;
    const amount = qty(reservation.quantity);
    const covered = amount.lt(represented.get(key) ?? 0) ? amount : represented.get(key) ?? qty(0);
    represented.set(key, (represented.get(key) ?? qty(0)).minus(covered));
    onHand.set(reservation.productId, (onHand.get(reservation.productId) ?? qty(0)).minus(amount.minus(covered)));
    config(reservation.productId);
  }
  const orders: { productId: string; quantity: ReturnType<typeof qty>; date: number; sourceRef: string; used: ReturnType<typeof qty> }[] = [];
  const order = (productId: string, quantity: ReturnType<typeof qty>, date: Date, sourceRef: string) => {
    config(productId);
    if (date > until) return;
    orders.push({productId, quantity, date: Math.max(today.getTime(), date.getTime()), sourceRef, used: qty(0)});
    add(supply, productId, quantity, date);
  };
  for (const item of openPoItems) {
    // Missing/overdue delivery promise is not proof of available supply.
    const remaining = qty(item.quantity).minus(qty(item.quantityReceived));
    if (remaining.lte(0)) continue;
    if (item.purchaseOrder.expectedDate && item.purchaseOrder.expectedDate >= today) {
      order(item.productId, remaining, item.purchaseOrder.expectedDate, `PO:${item.id}`);
    } else {
      config(item.productId); unconfirmedSupply.add(item.productId);
    }
  }
  for (const mo of openMo) {
    const remaining = qty(mo.plannedQty).minus(qty(mo.completedQty));
    if (remaining.lte(0)) continue;
    if (mo.plannedEnd && mo.plannedEnd >= today) order(mo.finishedProductId, remaining, mo.plannedEnd, `MO:${mo.id}`);
    else { config(mo.finishedProductId); unconfirmedSupply.add(mo.finishedProductId); }
    for (const mat of mo.materials) {
      add(demand, mat.productId, qty(mat.plannedQty).minus(qty(mat.issuedQty)), mo.plannedStart);
    }
  }

  // Latest active BOM per finished product; DFS explodes unordered multilevel
  // requirements. Cycles cannot be planned safely and must fail closed.
  const selected = new Map<string, (typeof boms)[number]>();
  for (const bom of boms) {
    config(bom.finishedProductId);
    for (const item of bom.items) config(item.productId);
    const existing = selected.get(bom.finishedProductId);
    if (!existing || bom.version > existing.version) selected.set(bom.finishedProductId, bom);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  function visit(productId: string) {
    if (visiting.has(productId)) throw validationError("Siklus BOM terdeteksi pada MRP");
    if (visited.has(productId)) return;
    visiting.add(productId);
    for (const item of selected.get(productId)?.items ?? []) visit(item.productId);
    visiting.delete(productId);
    visited.add(productId);
    ordered.push(productId);
  }
  for (const productId of new Set([...selected.keys(), ...demand.keys(), ...supply.keys(), ...onHand.keys()])) visit(productId);
  const suggestions: Array<{
    productId: string; suggestionType: string; quantity: string;
    onHand: string; demand: string; supply: string; dueDate: Date; releaseDate: Date; sourceRef: string;
  }> = [];
  for (const productId of ordered.reverse()) {
    const p = config(productId);
    const safety = qty(p.safetyStock);
    const bom = selected.get(productId);
    if (bom && qty(bom.quantity).lte(0)) throw validationError("Kuantitas BOM tidak valid");
    let available = onHand.get(productId) ?? qty(0);
    const needs = demand.get(productId) ?? new Map<number, ReturnType<typeof qty>>();
    const receipts = supply.get(productId) ?? new Map<number, ReturnType<typeof qty>>();
    const dates = [...new Set([...needs.keys(), ...receipts.keys()])].sort((a, b) => a - b);
    for (const time of dates) {
      let receipt = receipts.get(time) ?? qty(0);
      const need = needs.get(time) ?? qty(0);
      const opening = available;
      available = available.plus(receipt).minus(need);
      if (available.lt(safety)) {
        for (const candidate of orders.filter(o => o.productId === productId && o.date > time).sort((a,b) => a.date-b.date)) {
          const previousDate = candidate.date;
          receipts.set(previousDate, (receipts.get(previousDate) ?? qty(0)).minus(candidate.quantity));
          candidate.date = time;
          available = available.plus(candidate.quantity);
          receipt = receipt.plus(candidate.quantity);
          suggestions.push({ productId, suggestionType: "RESCHEDULE", quantity: toPrismaDecimal(candidate.quantity),
            onHand: toPrismaDecimal(opening), demand: toPrismaDecimal(need), supply: toPrismaDecimal(receipt),
            dueDate: working(new Date(time)), releaseDate: working(new Date(time),p.leadTimeDays), sourceRef: candidate.sourceRef });
          if (available.gte(safety)) break;
        }
      }
      if (available.gte(safety)) continue;
      const net = safety.minus(available).div(qty(p.lotSize)).ceil().mul(qty(p.lotSize));
      planningQuantity(toPrismaDecimal(net), true);
      suggestions.push({
        productId, suggestionType: bom ? "PRODUCE" : "PURCHASE",
        quantity: toPrismaDecimal(net), onHand: toPrismaDecimal(opening),
        demand: toPrismaDecimal(need), supply: toPrismaDecimal(receipt),
        dueDate: working(new Date(time)),
        releaseDate: working(new Date(time),p.leadTimeDays),
        sourceRef: (bom ? "BOM_EXPLOSION" : "NET_REQUIREMENT")
          + ([...receipts.keys()].some((date) => date > time) ? ";LATE_SUPPLY" : "")
          + (unconfirmedSupply.has(productId) ? ";UNCONFIRMED_SUPPLY" : ""),
      });
      available = available.plus(net);
      for (const item of bom?.items ?? []) {
        add(demand, item.productId, qty(item.quantity).mul(net).div(qty(bom!.quantity))
          .mul(qty(1).plus(qty(item.scrapPct).div(100))), working(new Date(time),p.leadTimeDays));
      }
    }
  }

    for (const productId of new Set(orders.map(o => o.productId))) {
      const p = config(productId);
      const totalDemand = [...(demand.get(productId)?.values() ?? [])].reduce((a,b) => a.plus(b), qty(0));
      const totalSupply = orders.filter(o => o.productId === productId).reduce((a,b) => a.plus(b.quantity), qty(0));
      let excess = (onHand.get(productId) ?? qty(0)).plus(totalSupply).minus(totalDemand).minus(qty(p.safetyStock));
      for (const candidate of orders.filter(o => o.productId === productId).sort((a,b) => b.date-a.date)) {
        if (candidate.quantity.gt(excess) || suggestions.some(s => s.sourceRef === candidate.sourceRef)) continue;
        suggestions.push({productId, suggestionType:"CANCEL", quantity:toPrismaDecimal(candidate.quantity),
          onHand:toPrismaDecimal(onHand.get(productId) ?? qty(0)), demand:toPrismaDecimal(totalDemand), supply:toPrismaDecimal(candidate.quantity),
          dueDate:working(new Date(candidate.date)), releaseDate:working(new Date(candidate.date),p.leadTimeDays), sourceRef:candidate.sourceRef});
        excess = excess.minus(candidate.quantity);
      }
    }
    const number = await nextDocumentNumber(tx, input.companyId, "MRP");
    const run = await tx.mrpRun.create({
      data: {
        companyId: input.companyId,
        number,
        status: "POSTED",
        horizonDays,
        parameters: { planning, horizonDays, from: today.toISOString(), until: until.toISOString() },
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
            releaseDate: s.releaseDate,
            sourceRef: s.sourceRef,
          })),
        },
      },
      include: { lines: true },
    });
    return run;
  });
}
