import { prisma } from "@/lib/db";
import { notFound, validationError } from "@/lib/errors";
import { money, toPrismaMoney } from "@/lib/money";

export async function createBankAccount(input: {
  companyId: string;
  code: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama rekening wajib");
  }
  return prisma.bankAccount.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      bankName: input.bankName,
      accountNumber: input.accountNumber,
    },
  });
}

export async function importBankStatement(input: {
  companyId: string;
  bankAccountId: string;
  statementDate: Date;
  openingBalance: number | string;
  closingBalance: number | string;
  lines: Array<{
    lineDate: Date;
    description?: string;
    amount: number | string;
  }>;
}) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, companyId: input.companyId },
  });
  if (!account) throw notFound("Rekening tidak ditemukan");

  return prisma.bankStatement.create({
    data: {
      bankAccountId: input.bankAccountId,
      statementDate: input.statementDate,
      openingBalance: toPrismaMoney(money(input.openingBalance)),
      closingBalance: toPrismaMoney(money(input.closingBalance)),
      lines: {
        create: input.lines.map((l) => ({
          lineDate: l.lineDate,
          description: l.description,
          amount: toPrismaMoney(money(l.amount)),
        })),
      },
    },
    include: { lines: true },
  });
}

export async function reconcileStatementLine(
  companyId: string,
  lineId: string,
  matchedRef: string,
) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: lineId, statement: { bankAccount: { companyId } } },
  });
  if (!line) throw notFound("Baris statement tidak ditemukan");
  return prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { isReconciled: true, matchedRef },
  });
}

export async function createBudget(input: {
  companyId: string;
  name: string;
  year: number;
  lines: Array<{ accountCode: string; period: number; amount: number | string }>;
}) {
  return prisma.budget.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      year: input.year,
      status: "DRAFT",
      lines: {
        create: input.lines.map((l) => ({
          accountCode: l.accountCode,
          period: l.period,
          amount: toPrismaMoney(money(l.amount)),
        })),
      },
    },
    include: { lines: true },
  });
}

export async function createFixedAsset(input: {
  companyId: string;
  code: string;
  name: string;
  category?: string;
  acquisitionDate: Date;
  acquisitionCost: number | string;
  residualValue?: number | string;
  usefulLifeMonths: number;
}) {
  const cost = money(input.acquisitionCost);
  return prisma.fixedAsset.create({
    data: {
      companyId: input.companyId,
      code: input.code,
      name: input.name,
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: toPrismaMoney(cost),
      residualValue: toPrismaMoney(money(input.residualValue ?? 0)),
      usefulLifeMonths: input.usefulLifeMonths,
      bookValue: toPrismaMoney(cost),
    },
  });
}

export async function runStraightLineDepreciation(
  companyId: string,
  assetId: string,
) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, companyId, isActive: true },
  });
  if (!asset) throw notFound("Aset tidak ditemukan");

  const depreciable = money(asset.acquisitionCost).minus(money(asset.residualValue));
  const monthly = depreciable.div(asset.usefulLifeMonths);
  const nextAccum = money(asset.accumulatedDep).plus(monthly);
  const nextBook = money(asset.acquisitionCost).minus(nextAccum);
  if (nextBook.lt(money(asset.residualValue))) {
    return asset;
  }

  return prisma.fixedAsset.update({
    where: { id: asset.id },
    data: {
      accumulatedDep: toPrismaMoney(nextAccum),
      bookValue: toPrismaMoney(nextBook),
    },
  });
}

export async function closeFiscalPeriod(companyId: string, periodId: string) {
  const period = await prisma.fiscalPeriod.findFirst({
    where: { id: periodId, fiscalYear: { companyId } },
  });
  if (!period) throw notFound("Periode tidak ditemukan");
  return prisma.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: "CLOSED" },
  });
}
