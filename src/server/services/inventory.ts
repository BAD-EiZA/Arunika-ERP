import type { Prisma, StockMovementType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { conflict, validationError } from "@/lib/errors";
import { money, qty, toPrismaDecimal, toPrismaMoney } from "@/lib/money";

type Tx = Prisma.TransactionClient;

type PostMovementInput = {
  companyId: string;
  warehouseId: string;
  productId: string;
  type: StockMovementType;
  quantity: string | number;
  unitCost?: string | number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  createdById?: string;
  idempotencyKey?: string;
  allowNegative?: boolean;
};

export async function postStockMovement(tx: Tx, input: PostMovementInput) {
  if (input.idempotencyKey) {
    const existing = await tx.stockMovement.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: input.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
  }

  const quantity = qty(input.quantity);
  if (quantity.lte(0)) {
    throw validationError("Kuantitas mutasi harus lebih dari 0");
  }

  const product = await tx.product.findFirst({
    where: { id: input.productId, companyId: input.companyId },
  });
  if (!product) throw validationError("Produk tidak ditemukan");
  if (product.type !== "STOCK") {
    throw validationError("Hanya produk stok yang menghasilkan mutasi");
  }

  const isInbound = [
    "PURCHASE_RECEIPT",
    "TRANSFER_IN",
    "ADJUSTMENT_IN",
    "SALES_RETURN",
    "OPENING_BALANCE",
    "OPNAME_CORRECTION",
    "PRODUCTION_RECEIPT",
  ].includes(input.type);

  const signedQty = isInbound ? quantity : quantity.neg();
  const unitCost = money(input.unitCost ?? product.purchasePrice);
  const totalCost = unitCost.mul(quantity);

  let balance = await tx.stockBalance.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });

  if (!balance) {
    balance = await tx.stockBalance.create({
      data: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantityOnHand: "0",
        quantityReserved: "0",
        averageCost: toPrismaMoney(unitCost),
      },
    });
  }

  const onHand = qty(balance.quantityOnHand);
  const nextOnHand = onHand.plus(signedQty);

  if (nextOnHand.lt(0) && !input.allowNegative) {
    throw conflict(
      `Stok tidak mencukupi untuk produk ${product.sku} di gudang ini`,
    );
  }

  let nextAvg = money(balance.averageCost);
  if (isInbound && nextOnHand.gt(0)) {
    const currentValue = onHand.mul(nextAvg);
    const inboundValue = quantity.mul(unitCost);
    nextAvg = currentValue.plus(inboundValue).div(nextOnHand);
  }

  await tx.stockBalance.update({
    where: { id: balance.id },
    data: {
      quantityOnHand: toPrismaDecimal(nextOnHand),
      averageCost: toPrismaMoney(nextAvg),
    },
  });

  return tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: input.type,
      quantity: toPrismaDecimal(quantity),
      unitCost: toPrismaMoney(unitCost),
      totalCost: toPrismaMoney(totalCost),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      createdById: input.createdById,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function adjustReservation(
  tx: Tx,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    delta: string | number;
  },
) {
  const delta = qty(input.delta);
  let balance = await tx.stockBalance.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });
  if (!balance) {
    balance = await tx.stockBalance.create({
      data: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantityOnHand: "0",
        quantityReserved: "0",
        averageCost: "0",
      },
    });
  }
  const next = qty(balance.quantityReserved).plus(delta);
  if (next.lt(0)) throw conflict("Reservasi tidak valid");
  await tx.stockBalance.update({
    where: { id: balance.id },
    data: { quantityReserved: toPrismaDecimal(next) },
  });
}

export async function getAvailableQty(
  companyId: string,
  warehouseId: string,
  productId: string,
) {
  const balance = await prisma.stockBalance.findFirst({
    where: { companyId, warehouseId, productId },
  });
  if (!balance) return qty(0);
  return qty(balance.quantityOnHand).minus(qty(balance.quantityReserved));
}
