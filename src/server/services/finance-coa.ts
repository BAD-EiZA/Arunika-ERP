import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";

const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "COGS",
  "EXPENSE",
  "OTHER_INCOME",
  "OTHER_EXPENSE",
] as const;

export async function createAccount(input: {
  companyId: string;
  code: string;
  name: string;
  type: string;
  normalBalance?: string;
  parentId?: string;
  allowManual?: boolean;
}) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw validationError("Kode dan nama akun wajib");
  if (!ACCOUNT_TYPES.includes(input.type as (typeof ACCOUNT_TYPES)[number])) {
    throw validationError("Tipe akun tidak valid");
  }
  const exists = await prisma.account.findUnique({
    where: { companyId_code: { companyId: input.companyId, code } },
  });
  if (exists) throw conflict("Kode akun sudah dipakai");

  return prisma.account.create({
    data: {
      companyId: input.companyId,
      code,
      name,
      type: input.type as (typeof ACCOUNT_TYPES)[number],
      normalBalance: input.normalBalance === "CREDIT" ? "CREDIT" : "DEBIT",
      parentId: input.parentId || null,
      allowManual: input.allowManual ?? true,
    },
  });
}

export async function updateAccount(input: {
  companyId: string;
  id: string;
  name?: string;
  type?: string;
  normalBalance?: string;
  parentId?: string | null;
  isActive?: boolean;
  allowManual?: boolean;
}) {
  const account = await prisma.account.findFirst({
    where: { id: input.id, companyId: input.companyId },
  });
  if (!account) throw notFound("Akun tidak ditemukan");
  if (input.type && !ACCOUNT_TYPES.includes(input.type as (typeof ACCOUNT_TYPES)[number])) {
    throw validationError("Tipe akun tidak valid");
  }
  return prisma.account.update({
    where: { id: account.id },
    data: {
      name: input.name?.trim() || account.name,
      type: (input.type as (typeof ACCOUNT_TYPES)[number]) || account.type,
      normalBalance:
        input.normalBalance === "CREDIT" || input.normalBalance === "DEBIT"
          ? input.normalBalance
          : account.normalBalance,
      parentId:
        input.parentId === undefined ? account.parentId : input.parentId || null,
      isActive: input.isActive ?? account.isActive,
      allowManual: input.allowManual ?? account.allowManual,
    },
  });
}

/** Hard-delete if no journal lines/children; else soft-disable. */
export async function deleteAccount(companyId: string, id: string) {
  const account = await prisma.account.findFirst({
    where: { id, companyId },
    include: {
      _count: { select: { journalLines: true, children: true } },
    },
  });
  if (!account) throw notFound("Akun tidak ditemukan");
  if (account._count.journalLines > 0 || account._count.children > 0) {
    return prisma.account.update({
      where: { id },
      data: { isActive: false },
    });
  }
  return prisma.account.delete({ where: { id } });
}

export async function listCostCenters(companyId: string) {
  return prisma.costCenter.findMany({
    where: { companyId },
    orderBy: { code: "asc" },
  });
}

export async function upsertCostCenter(input: {
  companyId: string;
  id?: string;
  code: string;
  name: string;
  isActive?: boolean;
}) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw validationError("Kode dan nama cost center wajib");
  if (input.id) {
    const row = await prisma.costCenter.findFirst({
      where: { id: input.id, companyId: input.companyId },
    });
    if (!row) throw notFound("Cost center tidak ditemukan");
    return prisma.costCenter.update({
      where: { id: row.id },
      data: { name, isActive: input.isActive ?? row.isActive },
    });
  }
  return prisma.costCenter.create({
    data: {
      companyId: input.companyId,
      code,
      name,
      isActive: input.isActive ?? true,
    },
  });
}
