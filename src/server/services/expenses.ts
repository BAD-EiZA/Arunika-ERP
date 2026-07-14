import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, toPrismaMoney } from "@/lib/money";
import { postJournal } from "@/server/services/accounting";

export async function createExpenseClaim(input: {
  companyId: string;
  userId: string;
  title: string;
  amount: number | string;
  taxAmount?: number | string;
  accountCode?: string;
  expenseDate?: Date;
  notes?: string;
  employeeId?: string;
}) {
  if (!input.title.trim()) throw validationError("Judul biaya wajib");
  const amount = money(input.amount);
  if (amount.lte(0)) throw validationError("Jumlah harus > 0");

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "EXP");
    return tx.expenseClaim.create({
      data: {
        companyId: input.companyId,
        number,
        title: input.title.trim(),
        accountCode: input.accountCode || "6100",
        amount: toPrismaMoney(amount),
        taxAmount: toPrismaMoney(money(input.taxAmount ?? 0)),
        expenseDate: input.expenseDate ?? new Date(),
        status: "DRAFT",
        notes: input.notes,
        employeeId: input.employeeId,
        createdById: input.userId,
      },
    });
  });
}

export async function approveExpenseClaim(companyId: string, id: string) {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id, companyId },
  });
  if (!claim) throw notFound("Klaim biaya tidak ditemukan");
  if (claim.status !== "DRAFT") throw conflict("Hanya DRAFT yang bisa disetujui");
  return prisma.expenseClaim.update({
    where: { id },
    data: { status: "APPROVED" },
  });
}

export async function postExpenseClaim(input: {
  companyId: string;
  userId: string;
  id: string;
}) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({
      where: { id: input.id, companyId: input.companyId },
    });
    if (!claim) throw notFound("Klaim biaya tidak ditemukan");
    if (claim.status !== "APPROVED" && claim.status !== "DRAFT") {
      throw conflict("Status tidak bisa diposting");
    }

    const base = money(claim.amount);
    const tax = money(claim.taxAmount);
    const gross = base.plus(tax);

    await postJournal(tx, {
      companyId: input.companyId,
      journalType: "EXPENSE",
      sourceModule: "expense",
      sourceDocType: "ExpenseClaim",
      sourceDocId: claim.id,
      description: `${claim.number} ${claim.title}`,
      idempotencyKey: `exp:${claim.id}`,
      postedById: input.userId,
      lines: [
        {
          accountCode: claim.accountCode,
          debit: base.toFixed(2),
          description: claim.title,
        },
        ...(tax.gt(0)
          ? [
              {
                accountCode: "1140",
                debit: tax.toFixed(2),
                description: "PPN masukan",
              },
            ]
          : []),
        {
          accountCode: "1110",
          credit: gross.toFixed(2),
          description: "Bayar biaya",
        },
      ],
    });

    return tx.expenseClaim.update({
      where: { id: claim.id },
      data: { status: "POSTED", postedAt: new Date() },
    });
  });
}
