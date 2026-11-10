import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, toPrismaMoney } from "@/lib/money";
import { Decimal } from "decimal.js";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const positiveHours = z.string().refine(v => { try { const n = new Decimal(v); return n.isFinite() && n.gt(0) && n.lte(24) && n.decimalPlaces() <= 2; } catch { return false; } }, "Jam tidak valid");
const sourcePayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ATTENDANCE"), payload: z.object({ hours: positiveHours, source: z.string().min(1), reason: z.string().min(1) }).strict() }),
  z.object({ kind: z.literal("OVERTIME"), payload: z.object({ hours: positiveHours, attendanceId: z.string().min(1), category: z.enum(["WORKDAY", "HOLIDAY"]), reason: z.string().min(1) }).strict() }),
  z.object({ kind: z.literal("ADJUSTMENT"), payload: z.object({ amount: z.string().refine(v => { try { const n = new Decimal(v); return n.isFinite() && !n.eq(0) && n.decimalPlaces() <= 2; } catch { return false; } }), reason: z.string().min(1), sourceRunId: z.string().min(1) }).strict() }),
  z.object({ kind: z.literal("LEAVE_GRANT"), payload: z.object({ days: z.string().refine(v => { try { const n = new Decimal(v); return n.isFinite() && !n.eq(0) && n.mod(.5).eq(0); } catch { return false; } }), leaveType: z.string().min(1), reason: z.string().min(1), sourceKey: z.string().min(1) }).strict() }),
]);
export async function createHrPayrollSource(input: {companyId: string; userId: string; employeeId: string; kind: string; workDate: Date; payload: unknown}) {
  if (!Number.isFinite(input.workDate.getTime()) || !input.userId) throw validationError("Tanggal/sumber pengguna tidak valid");
  const parsed = sourcePayload.parse({kind: input.kind, payload: input.payload});
  if (!await prisma.employee.findFirst({where:{companyId:input.companyId,id:input.employeeId}})) throw notFound("Karyawan tidak ditemukan");
  return prisma.hrPayrollSource.create({data:{companyId:input.companyId,employeeId:input.employeeId,workDate:input.workDate,kind:parsed.kind,payload:parsed.payload as Prisma.InputJsonValue,status:"PENDING_APPROVAL",createdById:input.userId}});
}
export async function approveHrPayrollSource(input:{companyId:string;userId:string;id:string}) {
  return prisma.$transaction(async tx => {
    const row = await tx.hrPayrollSource.findFirst({where:{companyId:input.companyId,id:input.id,status:"PENDING_APPROVAL"}});
    if (!row) throw notFound("Sumber pending tidak ditemukan");
    if (row.createdById === input.userId) throw conflict("Maker-checker: pembuat tidak boleh menyetujui sumber sendiri");
    const parsed = sourcePayload.parse({kind:row.kind,payload:row.payload});
    if (parsed.kind === "OVERTIME") {
      const attendance = await tx.hrPayrollSource.findFirst({where:{id:parsed.payload.attendanceId,companyId:input.companyId,employeeId:row.employeeId,kind:"ATTENDANCE",status:"APPROVED",workDate:row.workDate}});
      if (!attendance) throw validationError("Lembur memerlukan absensi approved pada tanggal sama");
      const actual = sourcePayload.parse({kind:attendance.kind,payload:attendance.payload});
      const others = await tx.hrPayrollSource.findMany({where:{companyId:input.companyId,employeeId:row.employeeId,kind:"OVERTIME",status:"APPROVED",workDate:row.workDate}});
      const hours = others.reduce((n,s) => n.plus((s.payload as {hours:string}).hours), new Decimal(parsed.payload.hours));
      if (actual.kind !== "ATTENDANCE" || hours.gt(actual.payload.hours)) throw validationError("Jam lembur melebihi absensi approved");
    }
    if (parsed.kind === "ADJUSTMENT" && !await tx.payrollRun.findFirst({where:{id:parsed.payload.sourceRunId,companyId:input.companyId,status:"POSTED",lines:{some:{employeeId:row.employeeId}}}})) throw validationError("Adjustment wajib merujuk payroll POSTED karyawan");
    const claimed = await tx.hrPayrollSource.updateMany({where:{id:row.id,companyId:input.companyId,status:"PENDING_APPROVAL"},data:{status:"APPROVED",approvedById:input.userId,approvedAt:new Date()}});
    if (claimed.count !== 1) throw conflict("Sumber sudah diproses");
    if (parsed.kind === "LEAVE_GRANT") await tx.leaveLedger.create({data:{companyId:input.companyId,employeeId:row.employeeId,leaveType:parsed.payload.leaveType,effectiveDate:row.workDate,days:parsed.payload.days,sourceKey:parsed.payload.sourceKey,reason:parsed.payload.reason,createdById:input.userId}});
    return {...row,status:"APPROVED"};
  }, {isolationLevel:"Serializable"});
}
export async function accrueLeave(input:{companyId:string;userId:string;employeeId:string;leaveType:string;month:Date}) {
  const {month}=input;
  if (!Number.isFinite(month.getTime()) || month.getUTCDate()!==1 || month.getUTCHours()!==0) throw validationError("Bulan akrual harus tanggal pertama UTC");
  const policy=await prisma.payrollPolicy.findFirst({where:{companyId:input.companyId,status:"APPROVED",effectiveFrom:{lte:month}},orderBy:{effectiveFrom:"desc"}});
  const config=z.object({validThrough:z.string(),leave:z.record(z.string(),z.object({monthlyAccrual:z.string(),allowNegative:z.boolean()}))}).safeParse(policy?.config);
  const rule=config.success?config.data.leave[input.leaveType]:undefined;
  if (!config.success || !rule || config.data.validThrough<month.toISOString().slice(0,10)) throw validationError("Kebijakan akrual cuti tidak tersedia");
  const days=new Decimal(rule.monthlyAccrual);
  if (!days.isFinite() || days.lte(0) || !days.mod(.5).eq(0)) throw validationError("Akrual cuti tidak valid");
  const employee=await prisma.employee.findFirst({where:{companyId:input.companyId,id:input.employeeId}});
  if (!employee?.joinDate || employee.joinDate>month || (employee.endDate && employee.endDate<month)) throw validationError("Karyawan tidak aktif pada bulan akrual");
  return prisma.leaveLedger.create({data:{companyId:input.companyId,employeeId:input.employeeId,leaveType:input.leaveType,effectiveDate:month,days:days.toString(),sourceKey:`accrual:${input.employeeId}:${input.leaveType}:${month.toISOString().slice(0,7)}`,reason:`Akrual ${policy!.id}`,createdById:input.userId}});
}
export async function getLeaveBalance(input:{companyId:string;employeeId:string;leaveType:string;asOf:Date}) {
  if (!Number.isFinite(input.asOf.getTime())) throw validationError("Tanggal saldo tidak valid");
  const rows=await prisma.leaveLedger.findMany({where:{companyId:input.companyId,employeeId:input.employeeId,leaveType:input.leaveType,effectiveDate:{lte:input.asOf}}});
  return rows.reduce((n,r)=>n.plus(r.days.toString()),new Decimal(0)).toFixed(2);
}

export async function endEmployment(input:{companyId:string;employeeId:string;endDate:Date;reason:string}) {
  if (!Number.isFinite(input.endDate.getTime()) || !input.reason.trim()) throw validationError("Tanggal akhir dan alasan wajib");
  const employee=await prisma.employee.findFirst({where:{companyId:input.companyId,id:input.employeeId}});
  if (!employee) throw notFound("Karyawan tidak ditemukan");
  if (!employee.joinDate || input.endDate<employee.joinDate || employee.endDate) throw conflict("Tanggal akhir tidak valid atau sudah ditetapkan");
  if (await prisma.payrollLine.findFirst({where:{employeeId:employee.id,payrollRun:{companyId:input.companyId,status:{in:["APPROVED","POSTED"]},periodEnd:{gt:input.endDate}}}})) throw conflict("Payroll final sudah ada; gunakan adjustment bukan ubah lifecycle historis");
  return prisma.employee.update({where:{id:employee.id},data:{endDate:input.endDate,isActive:false,notes:`${employee.notes ?? ""}\nOffboarding: ${input.reason.trim()}`}});
}
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
      joinDate: input.joinDate && Number.isFinite(input.joinDate.getTime()) ? input.joinDate : undefined,
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
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: input.companyId },
  });
  if (!employee) throw notFound("Karyawan tidak ditemukan");
  return prisma.attendanceRecord.upsert({
    where: {
      companyId: input.companyId,
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
  if (!Number.isFinite(input.startDate.getTime()) || !Number.isFinite(input.endDate.getTime())) throw validationError("Tanggal cuti tidak valid");
  const days = qty(input.days);
  if (!days.isFinite() || days.lte(0) || !days.mod(.5).eq(0)) throw validationError("Hari cuti harus kelipatan setengah hari positif");
  if (input.endDate < input.startDate || days.gt(Math.floor((input.endDate.getTime()-input.startDate.getTime())/86400000)+1)) throw validationError("Periode cuti tidak valid");
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: input.companyId },
  });
  if (!employee) throw notFound("Karyawan tidak ditemukan");
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

export async function approveLeaveRequest(companyId: string, id: string, userId?: string) {
  if (!userId) throw validationError("Checker cuti wajib");
  return prisma.$transaction(async tx => {
    const leave = await tx.leaveRequest.findFirst({where:{id,companyId}});
    if (!leave) throw notFound("Pengajuan cuti tidak ditemukan");
    if (leave.status !== "PENDING_APPROVAL") throw conflict("Cuti tidak dalam status pending");
    const policy = await tx.payrollPolicy.findFirst({where:{companyId,status:"APPROVED",effectiveFrom:{lte:leave.startDate}},orderBy:{effectiveFrom:"desc"}});
    const rules = z.object({leave:z.record(z.string(),z.object({allowNegative:z.boolean()}))}).safeParse(policy?.config);
    const rule = rules.success ? rules.data.leave[leave.leaveType] : undefined;
    if (!rule) throw validationError("Kebijakan saldo cuti belum tersedia");
    const entries = await tx.leaveLedger.findMany({where:{companyId,employeeId:leave.employeeId,leaveType:leave.leaveType,effectiveDate:{lte:leave.startDate}}});
    const balance = entries.reduce((n,r)=>n.plus(r.days.toString()),new Decimal(0));
    if (!rule.allowNegative && balance.lt(leave.days.toString())) throw validationError("Saldo cuti tidak cukup");
    const claimed = await tx.leaveRequest.updateMany({where:{id,companyId,status:"PENDING_APPROVAL"},data:{status:"APPROVED",approvedAt:new Date()}});
    if (claimed.count !== 1) throw conflict("Cuti sudah diproses");
    await tx.leaveLedger.create({data:{companyId,employeeId:leave.employeeId,leaveType:leave.leaveType,effectiveDate:leave.startDate,days:new Decimal(leave.days.toString()).neg().toString(),sourceKey:`leave:${id}`,reason:`Cuti ${id}`,createdById:userId}});
    return {...leave,status:"APPROVED"};
  },{isolationLevel:"Serializable"});
}
