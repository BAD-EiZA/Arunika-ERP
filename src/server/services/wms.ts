import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { qty, toPrismaDecimal } from "@/lib/money";

export type WarehouseAccess = {
  branchIds: string[];
  warehouseIds: string[];
};

async function assertWarehouseAccess(input: {
  companyId: string;
  warehouseId: string;
  access?: WarehouseAccess;
}) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: input.companyId },
  });
  if (!warehouse) throw notFound("Gudang tidak ditemukan");
  if (input.access) {
    if (
      input.access.warehouseIds.length > 0 &&
      !input.access.warehouseIds.includes(warehouse.id)
    ) {
      throw forbidden("Gudang di luar akses Anda");
    }
    if (
      input.access.branchIds.length > 0 &&
      !input.access.branchIds.includes(warehouse.branchId)
    ) {
      throw forbidden("Gudang di luar akses Anda");
    }
  }
  return warehouse;
}

export async function createWarehouseBin(input: {
  companyId: string;
  warehouseId: string;
  code: string;
  name: string;
  aisle?: string;
  rack?: string;
  level?: string;
  access?: WarehouseAccess;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama bin wajib");
  }
  await assertWarehouseAccess(input);

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
  access?: WarehouseAccess;
}) {
  const q = qty(input.quantity);
  if (q.lte(0)) throw validationError("Qty putaway harus > 0");

  await assertWarehouseAccess(input);

  const bin = await prisma.warehouseBin.findFirst({
    where: {
      id: input.binId,
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      isActive: true,
    },
  });
  if (!bin) throw notFound("Bin tidak ditemukan");
  const product = await prisma.product.findFirst({
    where: { id: input.productId, companyId: input.companyId, type: "STOCK" },
  });
  if (!product) throw notFound("Produk tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.warehouseId}:${input.productId}`}, 0))`;
  const balance = await tx.stockBalance.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });
  const onHand = qty(balance?.quantityOnHand ?? 0);
  const binTotal = await tx.stockBinBalance.aggregate({
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

  const existing = await tx.stockBinBalance.findUnique({
    where: {
      binId_productId: {
        binId: input.binId,
        productId: input.productId,
      },
    },
  });

  if (existing) {
    return tx.stockBinBalance.update({
      where: { id: existing.id },
      data: { quantity: toPrismaDecimal(qty(existing.quantity).plus(q)) },
    });
  }

  return tx.stockBinBalance.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      binId: input.binId,
      productId: input.productId,
      quantity: toPrismaDecimal(q),
    },
  });
  });
}

export async function pickFromBin(input: {
  companyId: string;
  binId: string;
  productId: string;
  quantity: string | number;
  access?: WarehouseAccess;
}) {
  const q = qty(input.quantity);
  if (q.lte(0)) throw validationError("Qty pick harus > 0");
  const bin = await prisma.warehouseBin.findFirst({
    where: { id: input.binId, companyId: input.companyId, isActive: true },
  });
  if (!bin) throw notFound("Bin tidak ditemukan");
  await assertWarehouseAccess({ ...input, warehouseId: bin.warehouseId });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${bin.warehouseId}:${input.productId}`}, 0))`;
    const existing = await tx.stockBinBalance.findUnique({
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
  return tx.stockBinBalance.update({
    where: { id: existing.id },
    data: { quantity: toPrismaDecimal(qty(existing.quantity).minus(q)) },
  });
  });
}
