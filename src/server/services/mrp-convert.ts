import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { createPurchaseOrder } from "@/server/services/procurement";
import { createProductionOrder } from "@/server/services/manufacturing";

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
  const line = await prisma.mrpSuggestion.findFirst({
    where: { id: input.suggestionId, mrpRun: { companyId: input.companyId } },
    include: { mrpRun: true },
  });
  if (!line) throw notFound("Suggestion MRP tidak ditemukan");
  if (line.isConverted) throw conflict("Suggestion sudah dikonversi");

  const product = await prisma.product.findFirst({
    where: { id: line.productId, companyId: input.companyId },
  });
  if (!product) throw notFound("Produk suggestion tidak ditemukan");

  if (line.suggestionType === "PURCHASE") {
    let supplierId = input.supplierId;
    if (!supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { companyId: input.companyId, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      supplierId = supplier?.id;
    }
    if (!supplierId) {
      throw validationError("supplierId wajib / buat pemasok dulu");
    }
    const po = await createPurchaseOrder({
      companyId: input.companyId,
      userId: input.userId,
      supplierId,
      warehouseId: input.warehouseId,
      branchId: input.branchId,
      notes: `Dari MRP ${line.mrpRun.number}`,
      items: [
        {
          productId: line.productId,
          quantity: line.quantity.toString(),
          unitPrice: product.purchasePrice.toString(),
        },
      ],
    });
    await prisma.mrpSuggestion.update({
      where: { id: line.id },
      data: { isConverted: true },
    });
    return { type: "PO" as const, id: po.id, number: po.number };
  }

  if (line.suggestionType === "PRODUCE") {
    const bom =
      input.bomId
        ? await prisma.billOfMaterials.findFirst({
            where: {
              id: input.bomId,
              companyId: input.companyId,
              finishedProductId: line.productId,
              isActive: true,
            },
          })
        : await prisma.billOfMaterials.findFirst({
            where: {
              companyId: input.companyId,
              finishedProductId: line.productId,
              isActive: true,
            },
            orderBy: { version: "desc" },
          });

    const mo = await createProductionOrder({
      companyId: input.companyId,
      userId: input.userId,
      finishedProductId: line.productId,
      bomId: bom?.id,
      routingId: input.routingId,
      warehouseId: input.warehouseId,
      plannedQty: line.quantity.toString(),
      notes: `Dari MRP ${line.mrpRun.number}`,
    });
    await prisma.mrpSuggestion.update({
      where: { id: line.id },
      data: { isConverted: true },
    });
    return { type: "MO" as const, id: mo.id, number: mo.number };
  }

  throw validationError(`Tipe suggestion tidak didukung: ${line.suggestionType}`);
}
