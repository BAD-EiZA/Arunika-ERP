import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";

export async function createProduct(input: {
  companyId: string;
  sku: string;
  name: string;
  unitId: string;
  categoryId?: string;
  type?: "STOCK" | "NON_STOCK" | "SERVICE";
  purchasePrice?: number | string;
  salePrice?: number | string;
  minStock?: number | string;
  barcode?: string;
  description?: string;
}) {
  if (!input.sku.trim() || !input.name.trim()) {
    throw validationError("SKU dan nama wajib");
  }
  const exists = await prisma.product.findUnique({
    where: {
      companyId_sku: { companyId: input.companyId, sku: input.sku.trim() },
    },
  });
  if (exists) throw conflict("SKU sudah digunakan");

  return prisma.product.create({
    data: {
      companyId: input.companyId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      unitId: input.unitId,
      categoryId: input.categoryId,
      type: input.type ?? "STOCK",
      purchasePrice: String(input.purchasePrice ?? 0),
      salePrice: String(input.salePrice ?? 0),
      minStock: String(input.minStock ?? 0),
      barcode: input.barcode,
      description: input.description,
    },
  });
}

export async function createCustomer(input: {
  companyId: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  paymentTermDays?: number;
  creditLimit?: number | string;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama pelanggan wajib");
  }
  return prisma.customer.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      email: input.email,
      phone: input.phone,
      paymentTermDays: input.paymentTermDays ?? 30,
      creditLimit: input.creditLimit ? String(input.creditLimit) : null,
    },
  });
}

export async function createSupplier(input: {
  companyId: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  paymentTermDays?: number;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama pemasok wajib");
  }
  return prisma.supplier.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      email: input.email,
      phone: input.phone,
      paymentTermDays: input.paymentTermDays ?? 30,
    },
  });
}

export async function createCategory(input: {
  companyId: string;
  code: string;
  name: string;
  parentId?: string;
}) {
  return prisma.productCategory.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      parentId: input.parentId,
    },
  });
}

export async function getProductOrThrow(companyId: string, id: string) {
  const product = await prisma.product.findFirst({ where: { id, companyId } });
  if (!product) throw notFound("Produk tidak ditemukan");
  return product;
}
