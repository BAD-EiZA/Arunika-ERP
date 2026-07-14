import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, toPrismaMoney } from "@/lib/money";

export async function createEmployee(input: {
  companyId: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  baseSalary?: string | number;
  bankAccount?: string;
  joinDate?: Date;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama karyawan wajib");
  }
  return prisma.employee.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      email: input.email,
      phone: input.phone,
      position: input.position,
      baseSalary: toPrismaMoney(money(input.baseSalary ?? 0)),
      bankAccount: input.bankAccount,
      joinDate: input.joinDate,
    },
  });
}

export async function recordAttendance(input: {
  companyId: string;
  employeeId: string;
  workDate: Date;
  checkIn?: Date;
  checkOut?: Date;
  status?: string;
  notes?: string;
}) {
  return prisma.attendanceRecord.upsert({
    where: {
      employeeId_workDate: {
        employeeId: input.employeeId,
        workDate: input.workDate,
      },
    },
    create: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      status: input.status ?? "PRESENT",
      notes: input.notes,
    },
    update: {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      status: input.status ?? "PRESENT",
      notes: input.notes,
    },
  });
}

export async function createLeaveRequest(input: {
  companyId: string;
  employeeId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: string | number;
  reason?: string;
}) {
  if (qty(input.days).lte(0)) throw validationError("Hari cuti harus > 0");
  return prisma.leaveRequest.create({
    data: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      days: toPrismaMoney(money(input.days)),
      status: "PENDING_APPROVAL",
      reason: input.reason,
    },
  });
}

export async function approveLeaveRequest(
  companyId: string,
  id: string,
) {
  const leave = await prisma.leaveRequest.findFirst({
    where: { id, companyId },
  });
  if (!leave) throw notFound("Pengajuan cuti tidak ditemukan");
  if (leave.status !== "PENDING_APPROVAL") {
    throw conflict("Cuti tidak dalam status pending");
  }
  return prisma.leaveRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
}
