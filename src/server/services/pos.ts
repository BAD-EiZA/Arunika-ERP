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

export async function openPosSession(input: {
  companyId: string;
  warehouseId?: string;
  branchId?: string;
  cashierName?: string;
  openingCash?: string | number;
}) {
  const open = await prisma.posSession.findFirst({
    where: { companyId: input.companyId, status: "OPEN" },
  });
  if (open) throw conflict("Masih ada sesi POS terbuka");

  return prisma.posSession.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      branchId: input.branchId,
      cashierName: input.cashierName,
      openingCash: toPrismaMoney(money(input.openingCash ?? 0)),
      status: "OPEN",
    },
  });
}

export async function closePosSession(
  companyId: string,
  sessionId: string,
  closingCash?: string | number,
) {
  const session = await prisma.posSession.findFirst({
    where: { id: sessionId, companyId },
  });
  if (!session) throw notFound("Sesi POS tidak ditemukan");
  if (session.status !== "OPEN") throw conflict("Sesi sudah ditutup");
  return prisma.posSession.update({
    where: { id: sessionId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closingCash: toPrismaMoney(money(closingCash ?? 0)),
    },
  });
}

export async function createPosOrder(input: {
  companyId: string;
  userId: string;
  sessionId: string;
  warehouseId: string;
  paymentMethod?: string;
  paidAmount?: string | number;
  items: Array<{
    productId: string;
    quantity: string | number;
    unitPrice: string | number;
  }>;
}) {
  if (!input.items.length) throw validationError("Minimal 1 item POS");
  const session = await prisma.posSession.findFirst({
    where: { id: input.sessionId, companyId: input.companyId, status: "OPEN" },
  });
  if (!session) throw notFound("Sesi POS terbuka tidak ditemukan");

  const lines = input.items.map((i) => ({
    productId: i.productId,
    quantity: toPrismaDecimal(qty(i.quantity)),
    unitPrice: toPrismaMoney(money(i.unitPrice)),
    total: toPrismaMoney(lineTotal(i.quantity, i.unitPrice)),
  }));
  const subtotal = sumMoney(lines.map((l) => l.total));
  const total = subtotal;

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "POS");
    const order = await tx.posOrder.create({
      data: {
        companyId: input.companyId,
        sessionId: input.sessionId,
        number,
        status: "POSTED",
        subtotal: toPrismaMoney(subtotal),
        total: toPrismaMoney(total),
        paidAmount: toPrismaMoney(money(input.paidAmount ?? total)),
        paymentMethod: input.paymentMethod ?? "CASH",
        warehouseId: input.warehouseId,
        createdById: input.userId,
        items: { create: lines },
      },
      include: { items: true },
    });

    const key = newIdempotencyKey("pos");
    for (const item of order.items) {
      await postStockMovement(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        type: "SALES_DELIVERY",
        quantity: item.quantity.toString(),
        unitCost: item.unitPrice.toString(),
        referenceType: "PosOrder",
        referenceId: order.id,
        referenceNumber: order.number,
        createdById: input.userId,
        idempotencyKey: `${key}:${item.productId}`,
      });
    }

    return order;
  });
}
