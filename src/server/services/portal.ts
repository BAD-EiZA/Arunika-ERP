import { prisma } from "@/lib/db";
import { notFound, unauthorized, validationError } from "@/lib/errors";

export async function createPortalToken(input: {
  companyId: string;
  portalType: "CUSTOMER" | "SUPPLIER";
  partnerId: string;
  partnerEmail: string;
  daysValid?: number;
}) {
  if (!input.partnerEmail.includes("@")) {
    throw validationError("Email portal tidak valid");
  }
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + (input.daysValid ?? 30));

  return prisma.portalToken.create({
    data: {
      companyId: input.companyId,
      portalType: input.portalType,
      partnerId: input.partnerId,
      partnerEmail: input.partnerEmail.toLowerCase(),
      expiresAt,
      isActive: true,
    },
  });
}

export async function resolvePortalToken(token: string) {
  const row = await prisma.portalToken.findFirst({
    where: { token, isActive: true },
    include: { company: true },
  });
  if (!row) throw unauthorized("Token portal tidak valid");
  if (row.expiresAt < new Date()) throw unauthorized("Token portal kedaluwarsa");

  await prisma.portalToken.update({
    where: { id: row.id },
    data: { lastAccessAt: new Date() },
  });

  return row;
}

export async function getCustomerPortalData(companyId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
  });
  if (!customer) throw notFound("Pelanggan tidak ditemukan");

  const [orders, invoices, payments] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.salesInvoice.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.customerPayment.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    customer: {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      email: customer.email,
    },
    orders: orders.map((o) => ({
      number: o.number,
      status: o.status,
      total: o.total.toString(),
      orderDate: o.orderDate.toISOString(),
    })),
    invoices: invoices.map((i) => ({
      number: i.number,
      status: i.status,
      total: i.total.toString(),
      balance: i.balance.toString(),
      dueDate: i.dueDate?.toISOString() ?? null,
    })),
    payments: payments.map((p) => ({
      number: p.number,
      amount: p.amount.toString(),
      paymentDate: p.paymentDate.toISOString(),
      status: p.status,
    })),
  };
}

export async function getSupplierPortalData(companyId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, companyId },
  });
  if (!supplier) throw notFound("Pemasok tidak ditemukan");

  const [orders, bills, payments] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId, supplierId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.supplierBill.findMany({
      where: { companyId, supplierId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.supplierPayment.findMany({
      where: { companyId, supplierId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    supplier: {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      email: supplier.email,
    },
    orders: orders.map((o) => ({
      number: o.number,
      status: o.status,
      total: o.total.toString(),
      orderDate: o.orderDate.toISOString(),
    })),
    bills: bills.map((b) => ({
      number: b.number,
      status: b.status,
      total: b.total.toString(),
      balance: b.balance.toString(),
    })),
    payments: payments.map((p) => ({
      number: p.number,
      amount: p.amount.toString(),
      paymentDate: p.paymentDate.toISOString(),
      status: p.status,
    })),
  };
}
