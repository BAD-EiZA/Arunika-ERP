import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { newIdempotencyKey } from "@/lib/idempotency";
import {
  lineTotal,
  money,
  qty,
  sumMoney,
  toPrismaDecimal,
  toPrismaMoney,
} from "@/lib/money";
import { postStockMovement } from "@/server/services/inventory";

export async function createSalesReturn(input: {
  companyId: string;
  userId: string;
  customerId: string;
  warehouseId?: string;
  salesInvoiceId?: string;
  reason?: string;
  items: Array<{
    productId: string;
    quantity: string | number;
    unitPrice: string | number;
  }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item");
  const lines = input.items.map((i) => ({
    productId: i.productId,
    quantity: toPrismaDecimal(qty(i.quantity)),
    unitPrice: toPrismaMoney(money(i.unitPrice)),
    total: toPrismaMoney(lineTotal(i.quantity, i.unitPrice)),
  }));
  const subtotal = sumMoney(lines.map((l) => l.total));

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "SR");
    return tx.salesReturn.create({
      data: {
        companyId: input.companyId,
        number,
        customerId: input.customerId,
        warehouseId: input.warehouseId,
        salesInvoiceId: input.salesInvoiceId,
        status: "DRAFT",
        reason: input.reason,
        subtotal: toPrismaMoney(subtotal),
        total: toPrismaMoney(subtotal),
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });
  });
}

export async function postSalesReturn(input: {
  companyId: string;
  userId: string;
  id: string;
  warehouseId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.salesReturn.findFirst({
      where: { id: input.id, companyId: input.companyId },
      include: { items: true },
    });
    if (!doc) throw notFound("Sales return tidak ditemukan");
    if (doc.status !== "DRAFT" && doc.status !== "APPROVED") {
      throw conflict("Return tidak bisa diposting");
    }

    const key = newIdempotencyKey("sr");
    for (const item of doc.items) {
      await postStockMovement(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        type: "SALES_RETURN",
        quantity: item.quantity.toString(),
        unitCost: item.unitPrice.toString(),
        referenceType: "SalesReturn",
        referenceId: doc.id,
        referenceNumber: doc.number,
        createdById: input.userId,
        allowNegative: true,
      });
    }

    return tx.salesReturn.update({
      where: { id: doc.id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        warehouseId: input.warehouseId,
      },
    });
  });
}

export async function createPurchaseReturn(input: {
  companyId: string;
  userId: string;
  supplierId: string;
  warehouseId?: string;
  reason?: string;
  items: Array<{
    productId: string;
    quantity: string | number;
    unitCost: string | number;
  }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item");
  const lines = input.items.map((i) => ({
    productId: i.productId,
    quantity: toPrismaDecimal(qty(i.quantity)),
    unitCost: toPrismaMoney(money(i.unitCost)),
    total: toPrismaMoney(qty(i.quantity).mul(money(i.unitCost))),
  }));
  const subtotal = sumMoney(lines.map((l) => l.total));

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "PRN");
    return tx.purchaseReturn.create({
      data: {
        companyId: input.companyId,
        number,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        status: "DRAFT",
        reason: input.reason,
        subtotal: toPrismaMoney(subtotal),
        total: toPrismaMoney(subtotal),
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });
  });
}

export async function postPurchaseReturn(input: {
  companyId: string;
  userId: string;
  id: string;
  warehouseId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.purchaseReturn.findFirst({
      where: { id: input.id, companyId: input.companyId },
      include: { items: true },
    });
    if (!doc) throw notFound("Purchase return tidak ditemukan");
    if (doc.status === "POSTED") throw conflict("Sudah diposting");

    const key = newIdempotencyKey("prn");
    for (const item of doc.items) {
      await postStockMovement(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        type: "PURCHASE_RETURN",
        quantity: item.quantity.toString(),
        unitCost: item.unitCost.toString(),
        referenceType: "PurchaseReturn",
        referenceId: doc.id,
        referenceNumber: doc.number,
        createdById: input.userId,
        idempotencyKey: `${key}:${item.productId}`,
      });
    }

    return tx.purchaseReturn.update({
      where: { id: doc.id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        warehouseId: input.warehouseId,
      },
    });
  });
}

export async function createClaim(input: {
  companyId: string;
  claimType: string;
  partnerName?: string;
  amount: string | number;
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "CLM");
    return tx.claim.create({
      data: {
        companyId: input.companyId,
        number,
        claimType: input.claimType,
        partnerName: input.partnerName,
        amount: toPrismaMoney(money(input.amount)),
        reason: input.reason,
        status: "OPEN",
      },
    });
  });
}
