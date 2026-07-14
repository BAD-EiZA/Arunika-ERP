import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approveLeaveRequest,
  createEmployee,
  createLeaveRequest,
  recordAttendance,
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
    return {
      employees: employees.map((e) => ({
        id: e.id,
        code: e.code,
        name: e.name,
        email: e.email,
        position: e.position,
        baseSalary: e.baseSalary.toString(),
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
      action?: "employee" | "attendance" | "leave" | "approve_leave";
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

    if (body.action === "attendance") {
      const ctx = await requirePermission("attendance:manage");
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
      const leave = await approveLeaveRequest(ctx.companyId, String(body.id ?? ""));
      return { leave: { id: leave.id, status: leave.status } };
    }

    const ctx = await requirePermission("employee:manage");
    const emp = await createEmployee({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      email: body.email,
      phone: body.phone,
      position: body.position,
      baseSalary: body.baseSalary,
    });
    return { employee: { id: emp.id, code: emp.code } };
  });
}
