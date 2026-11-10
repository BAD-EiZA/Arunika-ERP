import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  billProjectSource,
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
          invoices: true,
          billings: true,
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
        invoices: p.invoices.map((i) => ({ id: i.id, number: i.number, total: i.total.toString(), status: i.status })),
        billings: p.billings,
        customerId: p.customerId,
        tasks: p.tasks.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          status: t.status,
          billableAmount: t.billableAmount.toString(),
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
        | "bill"
        | "complete_task"
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
      sourceType?: "task" | "timesheet";
      sourceId?: string;
      hourlyRate?: string | number;
      idempotencyKey?: string;
      billableAmount?: string | number;
      employeeId?: string;
      workDate?: string;
      hours?: string | number;
      notes?: string;
      description?: string;
      amount?: string | number;
      plannedHours?: string | number;
    };

    if (body.action === "bill") {
      const ctx = await requirePermission(["project_billing:create", "invoice:issue"]);
      await assertRequestAccess(ctx, body);
      return { invoice: await billProjectSource({ companyId: ctx.companyId, userId: ctx.user.id, projectId: String(body.projectId ?? ""), sourceType: body.sourceType!, sourceId: String(body.sourceId ?? ""), hourlyRate: body.hourlyRate, idempotencyKey: req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? "" }) };
    }
    if (body.action === "complete_task") {
      const ctx = await requirePermission("project:manage");
      await assertRequestAccess(ctx, body);
      const result = await prisma.projectTask.updateMany({ where: { id: String(body.taskId ?? ""), projectId: String(body.projectId ?? ""), project: { companyId: ctx.companyId } }, data: { status: "CLOSED" } });
      return { updated: result.count };
    }
    if (body.action === "task") {
      const ctx = await requirePermission("project:manage");
    await assertRequestAccess(ctx, body);
      const task = await createProjectTask({
        companyId: ctx.companyId,
        projectId: String(body.projectId ?? ""),
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        plannedHours: body.plannedHours,
        billableAmount: body.billableAmount,
      });
      return { task: { id: task.id, code: task.code } };
    }

    if (body.action === "timesheet") {
      const ctx = await requirePermission("timesheet:view");
    await assertRequestAccess(ctx, body);
      const ts = await submitTimesheet({
        companyId: ctx.companyId,
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
    await assertRequestAccess(ctx, body);
      const ts = await approveTimesheet(String(body.id ?? ""), ctx.companyId);
      return { timesheet: { id: ts.id, status: ts.status } };
    }

    if (body.action === "expense") {
      const ctx = await requirePermission("project:manage");
    await assertRequestAccess(ctx, body);
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
    await assertRequestAccess(ctx, body);
      return getProjectProfitability(
        ctx.companyId,
        String(body.projectId ?? ""),
      );
    }

    const ctx = await requirePermission("project:create");
    await assertRequestAccess(ctx, body);
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