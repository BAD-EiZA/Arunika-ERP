import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  addProjectExpense,
  approveTimesheet,
  createProject,
  createProjectTask,
  getProjectProfitability,
  submitTimesheet,
} from "@/server/services/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("project:view");
    const [projects, employees, customers] = await Promise.all([
      prisma.project.findMany({
        where: { companyId: ctx.companyId },
        include: {
          tasks: true,
          timesheets: true,
          expenses: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employee.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
      prisma.customer.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);

    return {
      projects: projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        budgetAmount: p.budgetAmount.toString(),
        actualCost: p.actualCost.toString(),
        billedAmount: p.billedAmount.toString(),
        managerName: p.managerName,
        tasks: p.tasks.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          plannedHours: t.plannedHours.toString(),
          actualHours: t.actualHours.toString(),
        })),
        timesheets: p.timesheets.map((t) => ({
          id: t.id,
          hours: t.hours.toString(),
          status: t.status,
          workDate: t.workDate.toISOString(),
        })),
        expenses: p.expenses.map((e) => ({
          id: e.id,
          description: e.description,
          amount: e.amount.toString(),
        })),
      })),
      employees: employees.map((e) => ({ id: e.id, name: e.name, code: e.code })),
      customers: customers.map((c) => ({ id: c.id, name: c.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?:
        | "create"
        | "task"
        | "timesheet"
        | "approve_timesheet"
        | "expense"
        | "profitability";
      id?: string;
      projectId?: string;
      code?: string;
      name?: string;
      customerId?: string;
      budgetAmount?: string | number;
      managerName?: string;
      taskId?: string;
      employeeId?: string;
      workDate?: string;
      hours?: string | number;
      notes?: string;
      description?: string;
      amount?: string | number;
      plannedHours?: string | number;
    };

    if (body.action === "task") {
      const ctx = await requirePermission("project:manage");
      const task = await createProjectTask({
        companyId: ctx.companyId,
        projectId: String(body.projectId ?? ""),
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        plannedHours: body.plannedHours,
      });
      return { task: { id: task.id, code: task.code } };
    }

    if (body.action === "timesheet") {
      const ctx = await requirePermission("timesheet:view");
      const ts = await submitTimesheet({
        projectId: String(body.projectId ?? ""),
        taskId: body.taskId || undefined,
        employeeId: body.employeeId || undefined,
        workDate: new Date(body.workDate || Date.now()),
        hours: body.hours ?? 0,
        notes: body.notes,
      });
      return { timesheet: { id: ts.id, status: ts.status } };
    }

    if (body.action === "approve_timesheet") {
      const ctx = await requirePermission("timesheet:approve");
      const ts = await approveTimesheet(String(body.id ?? ""), ctx.companyId);
      return { timesheet: { id: ts.id, status: ts.status } };
    }

    if (body.action === "expense") {
      const ctx = await requirePermission("project:manage");
      const expense = await addProjectExpense({
        companyId: ctx.companyId,
        projectId: String(body.projectId ?? ""),
        description: String(body.description ?? ""),
        amount: body.amount ?? 0,
      });
      return { expense: { id: expense.id } };
    }

    if (body.action === "profitability") {
      const ctx = await requirePermission("project_profitability:view");
      return getProjectProfitability(
        ctx.companyId,
        String(body.projectId ?? ""),
      );
    }

    const ctx = await requirePermission("project:create");
    const project = await createProject({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      customerId: body.customerId || undefined,
      budgetAmount: body.budgetAmount,
      managerName: body.managerName,
    });
    return { project: { id: project.id, code: project.code } };
  });
}
