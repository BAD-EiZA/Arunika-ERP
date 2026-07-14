import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
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
import { postFromRule } from "@/server/services/accounting";
import {
  adjustReservation,
  postStockMovement,
} from "@/server/services/inventory";
import { notifyUser } from "@/server/services/notifications";

type LineInput = {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  description?: string;
};

function mapItems(items: LineInput[]) {
  if (!items.length) throw validationError("Minimal 1 item");
  return items.map((item) => {
    const quantity = qty(item.quantity);
    const unitPrice = money(item.unitPrice);
    const discountAmount = money(item.discountAmount ?? 0);
    const taxAmount = money(item.taxAmount ?? 0);
    if (quantity.lte(0)) throw validationError("Kuantitas harus > 0");
    return {
      productId: item.productId,
      description: item.description,
      quantity: toPrismaDecimal(quantity),
      unitPrice: toPrismaMoney(unitPrice),
      discountAmount: toPrismaMoney(discountAmount),
      taxAmount: toPrismaMoney(taxAmount),
      total: toPrismaMoney(lineTotal(quantity, unitPrice, discountAmount, taxAmount)),
    };
  });
}

function calcHeader(items: ReturnType<typeof mapItems>) {
  const subtotal = sumMoney(items.map((i) => qty(i.quantity).mul(money(i.unitPrice))));
  const discountAmount = sumMoney(items.map((i) => i.discountAmount));
  const taxAmount = sumMoney(items.map((i) => i.taxAmount));
  const total = subtotal.minus(discountAmount).plus(taxAmount);
  return {
    subtotal: toPrismaMoney(subtotal),
    discountAmount: toPrismaMoney(discountAmount),
    taxAmount: toPrismaMoney(taxAmount),
    total: toPrismaMoney(total),
  };
}

async function assertCustomerCreditLimit(
  companyId: string,
  customerId: string,
  additional: ReturnType<typeof money>,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
  });
  if (!customer) throw notFound("Pelanggan tidak ditemukan");
  if (customer.creditLimit == null) return customer;

  const open = await prisma.salesInvoice.aggregate({
    where: {
      companyId,
      customerId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "OPEN"] },
      balance: { gt: 0 },
    },
    _sum: { balance: true },
  });
  const exposure = money(open._sum.balance ?? 0).plus(additional);
  if (exposure.gt(money(customer.creditLimit))) {
    throw conflict(
      `Melebihi credit limit ${customer.creditLimit} (exposure ${exposure.toFixed(2)})`,
    );
  }
  return customer;
}

export async function createSalesOrder(input: {
  companyId: string;
  userId: string;
  customerId: string;
  branchId?: string;
  warehouseId?: string;
  notes?: string;
  items: LineInput[];
}) {
  const items = mapItems(input.items);
  const header = calcHeader(items);
  await assertCustomerCreditLimit(
    input.companyId,
    input.customerId,
    money(header.total),
  );
  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "SO", input.branchId);
    const so = await tx.salesOrder.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        number,
        status: "DRAFT",
        notes: input.notes,
        createdById: input.userId,
        ...header,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
    await writeAudit({
      companyId: input.companyId,
      userId: input.userId,
      action: "sales_order.create",
      entityType: "SalesOrder",
      entityId: so.id,
      entityNumber: so.number,
    });
    return so;
  });
}

export async function approveSalesOrder(companyId: string, userId: string, id: string) {
  const soPre = await prisma.salesOrder.findFirst({
    where: { id, companyId },
  });
  if (!soPre) throw notFound("SO tidak ditemukan");
  const { assertApprovalRole } = await import("@/server/services/approvals");
  await assertApprovalRole({
    companyId,
    userId,
    docType: "SALES_ORDER",
    amount: soPre.total.toString(),
  });

  return prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findFirst({
      where: { id, companyId },
      include: { items: true, company: { include: { settings: true } } },
    });
    if (!so) throw notFound("SO tidak ditemukan");
    if (!["DRAFT", "PENDING_APPROVAL"].includes(so.status)) {
      throw conflict("SO tidak dapat disetujui");
    }

    const reserve = so.company.settings?.reserveOnSoApprove ?? true;
    if (reserve && so.warehouseId) {
      for (const item of so.items) {
        await tx.stockReservation.create({
          data: {
            companyId,
            warehouseId: so.warehouseId,
            productId: item.productId,
            salesOrderId: so.id,
            quantity: item.quantity,
          },
        });
        await adjustReservation(tx, {
          companyId,
          warehouseId: so.warehouseId,
          productId: item.productId,
          delta: item.quantity.toString(),
        });
      }
    }

    const updated = await tx.salesOrder.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    await writeAudit({
      companyId,
      userId,
      action: "sales_order.approve",
      entityType: "SalesOrder",
      entityId: id,
      entityNumber: so.number,
    });

    // in-app only here (no user email lookup inside tx mock surface)
    await notifyUser({
      companyId,
      userId,
      type: "SALES_ORDER",
      title: `SO ${so.number} disetujui`,
      message: `Sales Order ${so.number} status APPROVED.`,
      entityType: "SalesOrder",
      entityId: id,
    });

    return updated;
  });
}

export async function postDeliveryOrder(input: {
  companyId: string;
  userId: string;
  salesOrderId: string;
  warehouseId: string;
  notes?: string;
  items: Array<{ productId: string; quantityDelivered: number | string }>;
  idempotencyKey?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const key = input.idempotencyKey ?? newIdempotencyKey("do");
    const existing = await tx.deliveryOrder.findUnique({
      where: {
        companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: key },
      },
    });
    if (existing) return existing;

    const so = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, companyId: input.companyId },
      include: { items: true, company: true, reservations: { where: { isActive: true } } },
    });
    if (!so) throw notFound("SO tidak ditemukan");
    if (!["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"].includes(so.status)) {
      throw conflict("SO belum siap dikirim");
    }

    const number = await nextDocumentNumber(tx, input.companyId, "DO");
    const doItems = input.items.map((item) => {
      const soItem = so.items.find((i) => i.productId === item.productId);
      if (!soItem) throw validationError("Produk tidak ada di SO");
      const delivered = qty(item.quantityDelivered);
      if (delivered.lte(0)) throw validationError("Qty kirim harus > 0");
      const remaining = qty(soItem.quantity).minus(qty(soItem.quantityDelivered));
      if (delivered.gt(remaining)) throw conflict("Pengiriman melebihi sisa SO");
      return {
        productId: item.productId,
        quantityOrdered: soItem.quantity,
        quantityDelivered: toPrismaDecimal(delivered),
      };
    });

    const delivery = await tx.deliveryOrder.create({
      data: {
        companyId: input.companyId,
        salesOrderId: so.id,
        customerId: so.customerId,
        warehouseId: input.warehouseId,
        number,
        status: "POSTED",
        notes: input.notes,
        postedAt: new Date(),
        createdById: input.userId,
        idempotencyKey: key,
        items: { create: doItems },
      },
      include: { items: true },
    });

    let cogsTotal = money(0);
    for (const item of delivery.items) {
      const balance = await tx.stockBalance.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: input.warehouseId,
            productId: item.productId,
          },
        },
      });
      const unitCost = money(balance?.averageCost ?? 0);
      cogsTotal = cogsTotal.plus(unitCost.mul(qty(item.quantityDelivered)));

      await postStockMovement(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        type: "SALES_DELIVERY",
        quantity: item.quantityDelivered.toString(),
        unitCost: unitCost.toString(),
        referenceType: "DeliveryOrder",
        referenceId: delivery.id,
        referenceNumber: delivery.number,
        createdById: input.userId,
        idempotencyKey: `${key}:${item.productId}`,
        allowNegative: so.company.allowNegativeStock,
      });

      const soItem = so.items.find((i) => i.productId === item.productId)!;
      await tx.salesOrderItem.update({
        where: { id: soItem.id },
        data: {
          quantityDelivered: toPrismaDecimal(
            qty(soItem.quantityDelivered).plus(qty(item.quantityDelivered)),
          ),
        },
      });

      await adjustReservation(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        delta: qty(item.quantityDelivered).neg().toString(),
      });
    }

    for (const reservation of so.reservations) {
      const deliveredItem = delivery.items.find(
        (i) => i.productId === reservation.productId,
      );
      if (!deliveredItem) continue;
      const left = qty(reservation.quantity).minus(qty(deliveredItem.quantityDelivered));
      if (left.lte(0)) {
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { isActive: false, releasedAt: new Date(), quantity: "0" },
        });
      } else {
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { quantity: toPrismaDecimal(left) },
        });
      }
    }

    const refreshed = await tx.salesOrderItem.findMany({
      where: { salesOrderId: so.id },
    });
    const allDelivered = refreshed.every((i) =>
      qty(i.quantityDelivered).gte(qty(i.quantity)),
    );
    const anyDelivered = refreshed.some((i) => qty(i.quantityDelivered).gt(0));
    await tx.salesOrder.update({
      where: { id: so.id },
      data: {
        status: allDelivered
          ? "DELIVERED"
          : anyDelivered
            ? "PARTIALLY_DELIVERED"
            : so.status,
      },
    });

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "delivery_order.post",
      sourceDocType: "DeliveryOrder",
      sourceDocId: delivery.id,
      description: `DO ${delivery.number}`,
      amount: cogsTotal.toString(),
      idempotencyKey: `je:${key}`,
      postedById: input.userId,
    });

    await writeAudit({
      companyId: input.companyId,
      userId: input.userId,
      action: "delivery_order.post",
      entityType: "DeliveryOrder",
      entityId: delivery.id,
      entityNumber: delivery.number,
    });

    return delivery;
  }, { maxWait: 15000, timeout: 60000 });
}

export async function issueInvoiceFromDelivery(input: {
  companyId: string;
  userId: string;
  deliveryOrderId: string;
  taxRate?: number | string;
  currency?: string;
  exchangeRate?: number | string;
  /** Split into N equal installments (1 = single invoice). */
  installments?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.deliveryOrder.findFirst({
      where: { id: input.deliveryOrderId, companyId: input.companyId },
      include: {
        items: true,
        salesOrder: { include: { items: true, customer: true } },
      },
    });
    if (!delivery) throw notFound("Delivery tidak ditemukan");
    if (delivery.status !== "POSTED") throw conflict("Delivery belum diposting");

    const taxRate = money(input.taxRate ?? 0);
    const lines = delivery.items.map((item) => {
      const soItem = delivery.salesOrder.items.find(
        (i) => i.productId === item.productId,
      );
      const unitPrice = money(soItem?.unitPrice ?? 0);
      const quantity = qty(item.quantityDelivered);
      const lineSub = quantity.mul(unitPrice);
      const taxAmount = lineSub.mul(taxRate).div(100);
      return {
        productId: item.productId,
        description: soItem?.description || item.productId,
        quantity: toPrismaDecimal(quantity),
        unitPrice: toPrismaMoney(unitPrice),
        taxAmount: toPrismaMoney(taxAmount),
        total: toPrismaMoney(lineSub.plus(taxAmount)),
      };
    });

    const subtotal = sumMoney(lines.map((l) => qty(l.quantity).mul(money(l.unitPrice))));
    const taxAmount = sumMoney(lines.map((l) => l.taxAmount));
    const total = subtotal.plus(taxAmount);

    await assertCustomerCreditLimit(
      input.companyId,
      delivery.customerId,
      total,
    );

    const parts = Math.max(1, Math.min(12, Math.floor(input.installments ?? 1)));
    const currency = input.currency || "IDR";
    const exchangeRate = money(input.exchangeRate ?? 1);
    if (exchangeRate.lte(0)) throw validationError("Kurs harus > 0");

    const invoices = [];
    for (let i = 0; i < parts; i++) {
      const isLast = i === parts - 1;
      const share = isLast
        ? total.minus(total.div(parts).toDecimalPlaces(2).mul(parts - 1))
        : total.div(parts).toDecimalPlaces(2);
      const shareSub = isLast
        ? subtotal.minus(subtotal.div(parts).toDecimalPlaces(2).mul(parts - 1))
        : subtotal.div(parts).toDecimalPlaces(2);
      const shareTax = share.minus(shareSub);

      const number = await nextDocumentNumber(tx, input.companyId, "INV");
      const dueDate = new Date();
      dueDate.setUTCDate(
        dueDate.getUTCDate() +
          (delivery.salesOrder.paymentTermDays || 30) * (i + 1),
      );

      const invLines =
        parts === 1
          ? lines
          : [
              {
                productId: null as string | null,
                description: `Cicilan ${i + 1}/${parts} dari DO ${delivery.number}`,
                quantity: toPrismaDecimal(qty(1)),
                unitPrice: toPrismaMoney(shareSub),
                taxAmount: toPrismaMoney(shareTax),
                total: toPrismaMoney(share),
              },
            ];

      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: input.companyId,
          customerId: delivery.customerId,
          salesOrderId: delivery.salesOrderId,
          deliveryOrderId: delivery.id,
          number,
          status: "ISSUED",
          dueDate,
          paymentTermDays: delivery.salesOrder.paymentTermDays,
          currency,
          exchangeRate: toPrismaMoney(exchangeRate),
          subtotal: toPrismaMoney(shareSub),
          taxAmount: toPrismaMoney(shareTax),
          total: toPrismaMoney(share),
          balance: toPrismaMoney(share),
          installmentOf: parts > 1 ? parts : null,
          installmentNo: parts > 1 ? i + 1 : null,
          issuedAt: new Date(),
          items: { create: invLines },
        },
        include: { items: true },
      });

      await postFromRule(tx, {
        companyId: input.companyId,
        sourceEvent: "sales_invoice.issue",
        sourceDocType: "SalesInvoice",
        sourceDocId: invoice.id,
        description: `INV ${invoice.number}`,
        amount: shareSub.toString(),
        taxAmount: shareTax.toString(),
        idempotencyKey: `je:inv:${invoice.id}`,
        postedById: input.userId,
      });

      invoices.push(invoice);
    }

    if (parts === 1) {
      for (const item of invoices[0].items) {
        if (!item.productId) continue;
        const soItem = delivery.salesOrder.items.find(
          (i) => i.productId === item.productId,
        );
        if (!soItem) continue;
        await tx.salesOrderItem.update({
          where: { id: soItem.id },
          data: {
            quantityInvoiced: toPrismaDecimal(
              qty(soItem.quantityInvoiced).plus(qty(item.quantity)),
            ),
          },
        });
      }
    } else {
      for (const soItem of delivery.salesOrder.items) {
        const delivered = delivery.items.find(
          (d) => d.productId === soItem.productId,
        );
        if (!delivered) continue;
        await tx.salesOrderItem.update({
          where: { id: soItem.id },
          data: {
            quantityInvoiced: toPrismaDecimal(
              qty(soItem.quantityInvoiced).plus(qty(delivered.quantityDelivered)),
            ),
          },
        });
      }
    }

    return parts === 1 ? invoices[0] : invoices;
  });
}

export async function postCustomerPayment(input: {
  companyId: string;
  userId: string;
  customerId: string;
  amount: number | string;
  method?: string;
  reference?: string;
  allocations: Array<{ invoiceId: string; amount: number | string }>;
}) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw validationError("Jumlah pembayaran harus > 0");
  const allocTotal = sumMoney(input.allocations.map((a) => a.amount));
  if (!allocTotal.equals(amount)) {
    throw validationError("Total alokasi harus sama dengan jumlah pembayaran");
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "CP");
    const payment = await tx.customerPayment.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        number,
        status: "POSTED",
        method: input.method ?? "BANK_TRANSFER",
        amount: toPrismaMoney(amount),
        reference: input.reference,
        postedAt: new Date(),
        createdById: input.userId,
        allocations: {
          create: input.allocations.map((a) => ({
            invoiceId: a.invoiceId,
            amount: toPrismaMoney(money(a.amount)),
          })),
        },
      },
    });

    for (const a of input.allocations) {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: a.invoiceId, companyId: input.companyId },
      });
      if (!invoice) throw notFound("Invoice tidak ditemukan");
      const pay = money(a.amount);
      if (pay.gt(money(invoice.balance))) {
        throw conflict("Alokasi melebihi saldo invoice");
      }
      const amountPaid = money(invoice.amountPaid).plus(pay);
      const balance = money(invoice.total).minus(amountPaid);
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: toPrismaMoney(amountPaid),
          balance: toPrismaMoney(balance),
          status: balance.lte(0) ? "PAID" : "PARTIALLY_PAID",
        },
      });
    }

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "customer_payment.post",
      sourceDocType: "CustomerPayment",
      sourceDocId: payment.id,
      description: `CP ${payment.number}`,
      amount: amount.toString(),
      idempotencyKey: `je:cp:${payment.id}`,
      postedById: input.userId,
    });

    return payment;
  });
}
