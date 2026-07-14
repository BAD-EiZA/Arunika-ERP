import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { qty, toPrismaDecimal } from "@/lib/money";

export async function createWarehouseBin(input: {
  companyId: string;
  warehouseId: string;
  code: string;
  name: string;
  aisle?: string;
  rack?: string;
  level?: string;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama bin wajib");
  }
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: input.companyId },
  });
  if (!warehouse) throw notFound("Gudang tidak ditemukan");

  return prisma.warehouseBin.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      code: input.code.trim(),
      name: input.name.trim(),
      aisle: input.aisle,
      rack: input.rack,
      level: input.level,
    },
  });
}

export async function putawayToBin(input: {
  companyId: string;
  warehouseId: string;
  binId: string;
  productId: string;
  quantity: string | number;
}) {
  const q = qty(input.quantity);
  if (q.lte(0)) throw validationError("Qty putaway harus > 0");

  const bin = await prisma.warehouseBin.findFirst({
    where: {
      id: input.binId,
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      isActive: true,
    },
  });
  if (!bin) throw notFound("Bin tidak ditemukan");

  const balance = await prisma.stockBalance.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });
  const onHand = qty(balance?.quantityOnHand ?? 0);
  const binTotal = await prisma.stockBinBalance.aggregate({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
    },
    _sum: { quantity: true },
  });
  const allocated = qty(binTotal._sum.quantity ?? 0);
  if (allocated.plus(q).gt(onHand)) {
    throw conflict("Qty bin melebihi stok gudang");
  }

  const existing = await prisma.stockBinBalance.findUnique({
    where: {
      binId_productId: {
        binId: input.binId,
        productId: input.productId,
      },
    },
  });

  if (existing) {
    return prisma.stockBinBalance.update({
      where: { id: existing.id },
      data: { quantity: toPrismaDecimal(qty(existing.quantity).plus(q)) },
    });
  }

  return prisma.stockBinBalance.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      binId: input.binId,
      productId: input.productId,
      quantity: toPrismaDecimal(q),
    },
  });
}

export async function pickFromBin(input: {
  companyId: string;
  binId: string;
  productId: string;
  quantity: string | number;
}) {
  const q = qty(input.quantity);
  if (q.lte(0)) throw validationError("Qty pick harus > 0");
  const existing = await prisma.stockBinBalance.findUnique({
    where: {
      binId_productId: {
        binId: input.binId,
        productId: input.productId,
      },
    },
  });
  if (!existing || qty(existing.quantity).lt(q)) {
    throw conflict("Stok bin tidak cukup");
  }
  return prisma.stockBinBalance.update({
    where: { id: existing.id },
    data: { quantity: toPrismaDecimal(qty(existing.quantity).minus(q)) },
  });
}
