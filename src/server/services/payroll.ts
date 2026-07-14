import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, sumMoney, toPrismaMoney } from "@/lib/money";
import { postFromRule } from "@/server/services/accounting";

export async function preparePayrollRun(input: {
  companyId: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  if (input.periodEnd < input.periodStart) {
    throw validationError("Periode payroll tidak valid");
  }

  const employees = await prisma.employee.findMany({
    where: { companyId: input.companyId, isActive: true },
  });
  if (!employees.length) throw validationError("Tidak ada karyawan aktif");

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "PAY");
    const lines = employees.map((e) => {
      const base = money(e.baseSalary);
      const allowances = money(0);
      const overtime = money(0);
      const bpjs = base.mul(0.04);
      const tax = base.mul(0.05);
      const deductions = bpjs.plus(tax);
      const gross = base.plus(allowances).plus(overtime);
      const net = gross.minus(deductions);
      return {
        employeeId: e.id,
        baseSalary: toPrismaMoney(base),
        allowances: toPrismaMoney(allowances),
        overtime: toPrismaMoney(overtime),
        deductions: toPrismaMoney(deductions),
        taxAmount: toPrismaMoney(tax),
        bpjsAmount: toPrismaMoney(bpjs),
        grossPay: toPrismaMoney(gross),
        netPay: toPrismaMoney(net),
      };
    });

    const totalGross = sumMoney(lines.map((l) => l.grossPay));
    const totalDeduction = sumMoney(lines.map((l) => l.deductions));
    const totalNet = sumMoney(lines.map((l) => l.netPay));

    return tx.payrollRun.create({
      data: {
        companyId: input.companyId,
        number,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "DRAFT",
        totalGross: toPrismaMoney(totalGross),
        totalDeduction: toPrismaMoney(totalDeduction),
        totalNet: toPrismaMoney(totalNet),
        createdById: input.userId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  });
}

export async function approvePayrollRun(
  companyId: string,
  id: string,
) {
  const run = await prisma.payrollRun.findFirst({ where: { id, companyId } });
  if (!run) throw notFound("Payroll run tidak ditemukan");
  if (run.status !== "DRAFT") throw conflict("Hanya draft yang bisa disetujui");
  return prisma.payrollRun.update({
    where: { id },
    data: { status: "APPROVED" },
  });
}

export async function postPayrollRun(input: {
  companyId: string;
  userId: string;
  id: string;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findFirst({
      where: { id: input.id, companyId: input.companyId },
      include: { lines: true },
    });
    if (!run) throw notFound("Payroll run tidak ditemukan");
    if (run.status !== "APPROVED") {
      throw conflict("Payroll harus disetujui dulu");
    }

    await postFromRule(tx, {
      companyId: input.companyId,
      sourceEvent: "payroll.post",
      sourceDocType: "PayrollRun",
      sourceDocId: run.id,
      description: `Payroll ${run.number}`,
      amount: run.totalGross.toString(),
      taxAmount: run.totalDeduction.toString(),
      idempotencyKey: `je:payroll:${run.id}`,
      postedById: input.userId,
    });

    return tx.payrollRun.update({
      where: { id: run.id },
      data: { status: "POSTED", postedAt: new Date() },
    });
  });
}
