import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  approveLeaveRequest,
  createEmployee,
  createLeaveRequest,
  recordAttendance, createHrPayrollSource, approveHrPayrollSource, getLeaveBalance, accrueLeave, endEmployment,
} from "@/server/services/hr";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("employee:view");
    const [employees, attendance, leaves] = await Promise.all([
      prisma.employee.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.attendanceRecord.findMany({
        where: { companyId: ctx.companyId },
        include: { employee: true },
        orderBy: { workDate: "desc" },
        take: 30,
      }),
      prisma.leaveRequest.findMany({
        where: { companyId: ctx.companyId },
        include: { employee: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    const canManageSources = hasPermission(ctx.permissions, "payroll:prepare") && hasPermission(ctx.permissions, "employee_sensitive:view");
    return {
      ...(canManageSources ? { sources: await prisma.hrPayrollSource.findMany({where:{companyId:ctx.companyId},orderBy:{createdAt:"desc"},take:50}) } : {}),
      employees: employees.map((e) => ({
        id: e.id,
        code: e.code,
        name: e.name,
        email: e.email,
        position: e.position,
        ...(hasPermission(ctx.permissions, "employee_sensitive:view")
          ? { baseSalary: e.baseSalary.toString() }
          : {}),
        isActive: e.isActive,
      })),
      attendance: attendance.map((a) => ({
        id: a.id,
        employeeName: a.employee.name,
        workDate: a.workDate.toISOString(),
        status: a.status,
      })),
      leaves: leaves.map((l) => ({
        id: l.id,
        employeeName: l.employee.name,
        leaveType: l.leaveType,
        days: l.days.toString(),
        status: l.status,
        startDate: l.startDate.toISOString(),
        endDate: l.endDate.toISOString(),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "employee" | "attendance" | "leave" | "approve_leave" | "source" | "approve_source" | "leave_balance" | "accrue_leave" | "end_employment";
      kind?: string; payload?: unknown; asOf?: string; joinDate?: string;
      id?: string;
      code?: string;
      name?: string;
      email?: string;
      phone?: string;
      position?: string;
      baseSalary?: string | number;
      employeeId?: string;
      workDate?: string;
      status?: string;
      leaveType?: string;
      startDate?: string;
      endDate?: string;
      days?: string | number;
      reason?: string;
    };

    if (body.action === "end_employment") {
      const ctx=await requirePermission(["employee:manage","employee_sensitive:view"]); await assertRequestAccess(ctx,body);
      return {employee:await endEmployment({companyId:ctx.companyId,employeeId:String(body.employeeId??""),endDate:new Date(body.endDate??""),reason:String(body.reason??"")})};
    }
    if (body.action === "source" || body.action === "approve_source" || body.action === "leave_balance" || body.action === "accrue_leave") {
      const ctx=await requirePermission([body.action === "approve_source" ? "payroll:approve" : "payroll:prepare", "employee_sensitive:view"]);
      await assertRequestAccess(ctx,body);
      if (body.action === "accrue_leave") return {entry:await accrueLeave({companyId:ctx.companyId,userId:ctx.user.id,employeeId:String(body.employeeId??""),leaveType:String(body.leaveType??"ANNUAL"),month:new Date(body.workDate??"")})};
      if (body.action === "approve_source") return {source:await approveHrPayrollSource({companyId:ctx.companyId,userId:ctx.user.id,id:String(body.id??"")})};
      if (body.action === "leave_balance") return {balance:await getLeaveBalance({companyId:ctx.companyId,employeeId:String(body.employeeId??""),leaveType:String(body.leaveType??"ANNUAL"),asOf:new Date(body.asOf??"")})};
      return {source:await createHrPayrollSource({companyId:ctx.companyId,userId:ctx.user.id,employeeId:String(body.employeeId??""),kind:String(body.kind??""),workDate:new Date(body.workDate??""),payload:body.payload})};
    }
    if (body.action === "attendance") {
      const ctx = await requirePermission("attendance:manage");
    await assertRequestAccess(ctx, body);
      const rec = await recordAttendance({
        companyId: ctx.companyId,
        employeeId: String(body.employeeId ?? ""),
        workDate: new Date(body.workDate || Date.now()),
        status: body.status,
      });
      return { attendance: { id: rec.id } };
    }

    if (body.action === "leave") {
      const ctx = await requirePermission("leave:view");
    await assertRequestAccess(ctx, body);
      const leave = await createLeaveRequest({
        companyId: ctx.companyId,
        employeeId: String(body.employeeId ?? ""),
        leaveType: String(body.leaveType ?? "ANNUAL"),
        startDate: new Date(body.startDate || Date.now()),
        endDate: new Date(body.endDate || Date.now()),
        days: body.days ?? 1,
        reason: body.reason,
      });
      return { leave: { id: leave.id, status: leave.status } };
    }

    if (body.action === "approve_leave") {
      const ctx = await requirePermission("leave:approve");
    await assertRequestAccess(ctx, body);
      const leave = await approveLeaveRequest(ctx.companyId, String(body.id ?? ""), ctx.user.id);
      return { leave: { id: leave.id, status: leave.status } };
    }

    const ctx = await requirePermission("employee:manage");
    await assertRequestAccess(ctx, body);
    const emp = await createEmployee({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      email: body.email,
      phone: body.phone,
      position: body.position,
      baseSalary: body.baseSalary, joinDate: body.joinDate ? new Date(body.joinDate) : undefined,
    });
    return { employee: { id: emp.id, code: emp.code } };
  });
}
