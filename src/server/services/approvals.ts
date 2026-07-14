import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, toPrismaMoney } from "@/lib/money";

export async function listApprovalMatrix(companyId: string, docType?: string) {
  return prisma.approvalMatrix.findMany({
    where: {
      companyId,
      isActive: true,
      ...(docType ? { docType } : {}),
    },
    orderBy: [{ docType: "asc" }, { stepOrder: "asc" }],
  });
}

export async function upsertApprovalMatrix(input: {
  companyId: string;
  id?: string;
  docType: string;
  minAmount?: number | string;
  maxAmount?: number | string | null;
  roleCode: string;
  stepOrder?: number;
  isActive?: boolean;
}) {
  const docType = input.docType.trim();
  const roleCode = input.roleCode.trim();
  if (!docType || !roleCode) throw validationError("docType dan roleCode wajib");

  if (input.id) {
    const row = await prisma.approvalMatrix.findFirst({
      where: { id: input.id, companyId: input.companyId },
    });
    if (!row) throw notFound("Approval matrix tidak ditemukan");
    return prisma.approvalMatrix.update({
      where: { id: row.id },
      data: {
        docType,
        minAmount: toPrismaMoney(money(input.minAmount ?? 0)),
        maxAmount:
          input.maxAmount == null || input.maxAmount === ""
            ? null
            : toPrismaMoney(money(input.maxAmount)),
        roleCode,
        stepOrder: input.stepOrder ?? row.stepOrder,
        isActive: input.isActive ?? row.isActive,
      },
    });
  }

  return prisma.approvalMatrix.create({
    data: {
      companyId: input.companyId,
      docType,
      minAmount: toPrismaMoney(money(input.minAmount ?? 0)),
      maxAmount:
        input.maxAmount == null || input.maxAmount === ""
          ? null
          : toPrismaMoney(money(input.maxAmount)),
      roleCode,
      stepOrder: input.stepOrder ?? 1,
      isActive: input.isActive ?? true,
    },
  });
}

export async function deleteApprovalMatrix(companyId: string, id: string) {
  const row = await prisma.approvalMatrix.findFirst({
    where: { id, companyId },
  });
  if (!row) throw notFound("Approval matrix tidak ditemukan");
  return prisma.approvalMatrix.update({
    where: { id },
    data: { isActive: false },
  });
}

/** Returns required role codes for amount, ordered by step. Empty = no matrix (auto-ok). */
export async function requiredApprovalRoles(
  companyId: string,
  docType: string,
  amount: number | string,
) {
  const amt = money(amount);
  const rows = await prisma.approvalMatrix.findMany({
    where: { companyId, docType, isActive: true },
    orderBy: { stepOrder: "asc" },
  });
  return rows
    .filter((r) => {
      const min = money(r.minAmount);
      const max = r.maxAmount == null ? null : money(r.maxAmount);
      if (amt.lt(min)) return false;
      if (max && amt.gt(max)) return false;
      return true;
    })
    .map((r) => r.roleCode);
}

export async function assertApprovalRole(input: {
  companyId: string;
  userId: string;
  docType: string;
  amount: number | string;
}) {
  const roles = await requiredApprovalRoles(
    input.companyId,
    input.docType,
    input.amount,
  );
  if (roles.length === 0) return;

  const membership = await prisma.membership.findFirst({
    where: {
      companyId: input.companyId,
      userId: input.userId,
      status: "ACTIVE",
    },
    include: { role: true },
  });
  if (!membership) throw conflict("Membership tidak ditemukan");
  const code = membership.role.code;
  if (code === "OWNER" || code === "ADMIN") return;
  if (!roles.includes(code)) {
    throw conflict(
      `Butuh approval role: ${roles.join(" → ")} (anda: ${code})`,
    );
  }
}
