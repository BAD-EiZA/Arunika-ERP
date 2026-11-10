import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, toPrismaDecimal, toPrismaMoney } from "@/lib/money";

export async function convertMrpSuggestion(input: {
  companyId: string;
  userId: string;
  suggestionId: string;
  supplierId?: string;
  warehouseId?: string;
  branchId?: string;
  bomId?: string;
  routingId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.mrpSuggestion.findFirst({
      where: { id: input.suggestionId, mrpRun: { companyId: input.companyId } },
      include: { mrpRun: true },
    });
    if (!line) throw notFound("Suggestion MRP tidak ditemukan");
    if (line.isConverted) throw conflict("Suggestion sudah dikonversi");
    const product = await tx.product.findFirst({
      where: { id: line.productId, companyId: input.companyId },
    });
    if (!product) throw notFound("Produk suggestion tidak ditemukan");
    if (input.warehouseId && !await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: input.companyId } })) throw notFound("Warehouse tidak ditemukan");
    if (input.branchId && !await tx.branch.findFirst({ where: { id: input.branchId, companyId: input.companyId } })) throw notFound("Branch tidak ditemukan");
    if (qty(line.quantity).lte(0)) throw validationError("Kuantitas suggestion harus positif");
    const claimed = await tx.mrpSuggestion.updateMany({
      where: { id: line.id, isConverted: false, mrpRun: { companyId: input.companyId } },
      data: { isConverted: true },
    });
    if (claimed.count !== 1) throw conflict("Suggestion sudah dikonversi");

    if (line.suggestionType === "PURCHASE") {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, companyId: input.companyId, isActive: true },
      });
      if (!supplier) throw validationError("supplierId wajib dan harus pemasok aktif milik perusahaan");
      const number = await nextDocumentNumber(tx, input.companyId, "PO", input.branchId);
      const total = qty(line.quantity).mul(money(product.purchasePrice));
      const po = await tx.purchaseOrder.create({
        data: {
          companyId: input.companyId, supplierId: supplier.id,
          branchId: input.branchId, warehouseId: input.warehouseId,
          number, status: "DRAFT", createdById: input.userId,
          notes: `Dari MRP ${line.mrpRun.number}`,
          subtotal: toPrismaMoney(total), total: toPrismaMoney(total),
          items: { create: [{ productId: line.productId,
            quantity: toPrismaDecimal(qty(line.quantity)),
            unitPrice: toPrismaMoney(money(product.purchasePrice)),
            total: toPrismaMoney(total) }] },
        },
      });
      return { type: "PO" as const, id: po.id, number: po.number };
    }
    if (line.suggestionType === "PRODUCE") {
      const bom = await tx.billOfMaterials.findFirst({
        where: { id: input.bomId, companyId: input.companyId,
          finishedProductId: line.productId, isActive: true },
        include: { items: { include: { product: true } } },
        orderBy: { version: "desc" },
      });
      if (!bom) throw validationError("BOM aktif milik perusahaan wajib untuk produksi MRP");
      if (qty(bom.quantity).lte(0) || bom.items.some((i) => i.product.companyId !== input.companyId)) throw validationError("BOM tidak valid atau produk material bukan milik perusahaan");
      const routing = input.routingId ? await tx.routing.findFirst({
        where: { id: input.routingId, companyId: input.companyId, isActive: true },
        include: { steps: true },
      }) : null;
      if (input.routingId && !routing) throw notFound("Routing tidak ditemukan");
      const number = await nextDocumentNumber(tx, input.companyId, "MO");
      const mo = await tx.productionOrder.create({
        data: {
          companyId: input.companyId, number, status: "DRAFT",
          finishedProductId: line.productId, bomId: bom.id,
          routingId: routing?.id, warehouseId: input.warehouseId,
          plannedQty: toPrismaDecimal(qty(line.quantity)), createdById: input.userId,
          notes: `Dari MRP ${line.mrpRun.number}`,
          materials: { create: bom.items.map((i) => ({
            productId: i.productId,
            plannedQty: toPrismaDecimal(qty(i.quantity).mul(qty(line.quantity)).div(qty(bom.quantity)).mul(qty(1).plus(qty(i.scrapPct).div(100)))),
            unitCost: toPrismaMoney(money(i.product.purchasePrice)), totalCost: "0",
          })) },
          steps: { create: (routing?.steps ?? []).map((s) => ({
            workCenterId: s.workCenterId, sequence: s.sequence, name: s.name,
            plannedMinutes: toPrismaMoney(money(s.setupMinutes).plus(money(s.runMinutes).mul(qty(line.quantity)))),
            laborRate: "50000", overheadRate: "15000",
          })) },
        },
      });
      return { type: "MO" as const, id: mo.id, number: mo.number };
    }
    throw validationError(`Tipe suggestion tidak didukung: ${line.suggestionType}`);
  });
}
