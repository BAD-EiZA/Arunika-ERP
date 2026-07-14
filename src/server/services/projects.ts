import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, toPrismaMoney } from "@/lib/money";

export async function createProject(input: {
  companyId: string;
  code: string;
  name: string;
  customerId?: string;
  budgetAmount?: string | number;
  managerName?: string;
  startDate?: Date;
  endDate?: Date;
  notes?: string;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama project wajib");
  }
  return prisma.project.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      customerId: input.customerId,
      budgetAmount: toPrismaMoney(money(input.budgetAmount ?? 0)),
      managerName: input.managerName,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
      status: "OPEN",
    },
  });
}

export async function createProjectTask(input: {
  projectId: string;
  companyId: string;
  code: string;
  name: string;
  plannedHours?: string | number;
  dueDate?: Date;
}) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
  });
  if (!project) throw notFound("Project tidak ditemukan");
  return prisma.projectTask.create({
    data: {
      projectId: input.projectId,
      code: input.code.trim(),
      name: input.name.trim(),
      plannedHours: toPrismaMoney(money(input.plannedHours ?? 0)),
      dueDate: input.dueDate,
      status: "OPEN",
    },
  });
}

export async function submitTimesheet(input: {
  projectId: string;
  taskId?: string;
  employeeId?: string;
  workDate: Date;
  hours: string | number;
  notes?: string;
}) {
  if (qty(input.hours).lte(0)) throw validationError("Jam harus > 0");
  const ts = await prisma.timesheet.create({
    data: {
      projectId: input.projectId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      hours: toPrismaMoney(money(input.hours)),
      notes: input.notes,
      status: "PENDING_APPROVAL",
    },
  });
  if (input.taskId) {
    const task = await prisma.projectTask.findUnique({
      where: { id: input.taskId },
    });
    if (task) {
      await prisma.projectTask.update({
        where: { id: task.id },
        data: {
          actualHours: toPrismaMoney(
            money(task.actualHours).plus(money(input.hours)),
          ),
        },
      });
    }
  }
  return ts;
}

export async function approveTimesheet(id: string, companyId: string) {
  const ts = await prisma.timesheet.findFirst({
    where: { id, project: { companyId } },
  });
  if (!ts) throw notFound("Timesheet tidak ditemukan");
  if (ts.status !== "PENDING_APPROVAL") {
    throw conflict("Timesheet tidak pending");
  }
  return prisma.timesheet.update({
    where: { id },
    data: { status: "APPROVED" },
  });
}

export async function addProjectExpense(input: {
  companyId: string;
  projectId: string;
  description: string;
  amount: string | number;
  expenseDate?: Date;
}) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
  });
  if (!project) throw notFound("Project tidak ditemukan");
  if (project.status === "CLOSED") throw conflict("Project sudah ditutup");

  const amount = money(input.amount);
  const expense = await prisma.projectExpense.create({
    data: {
      projectId: input.projectId,
      description: input.description,
      amount: toPrismaMoney(amount),
      expenseDate: input.expenseDate ?? new Date(),
      status: "POSTED",
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      actualCost: toPrismaMoney(money(project.actualCost).plus(amount)),
    },
  });

  return expense;
}

export async function getProjectProfitability(
  companyId: string,
  projectId: string,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: {
      tasks: true,
      timesheets: true,
      expenses: true,
    },
  });
  if (!project) throw notFound("Project tidak ditemukan");

  const hours = project.timesheets
    .filter((t) => t.status === "APPROVED" || t.status === "POSTED")
    .reduce((acc, t) => acc.plus(money(t.hours)), money(0));
  const laborCost = hours.mul(75000);
  const expenseCost = project.expenses.reduce(
    (acc, e) => acc.plus(money(e.amount)),
    money(0),
  );
  const actual = laborCost.plus(expenseCost);
  const budget = money(project.budgetAmount);
  const billed = money(project.billedAmount);
  const margin = billed.minus(actual);

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
    },
    budget: budget.toFixed(2),
    actualCost: actual.toFixed(2),
    laborCost: laborCost.toFixed(2),
    expenseCost: expenseCost.toFixed(2),
    billedAmount: billed.toFixed(2),
    margin: margin.toFixed(2),
    variance: budget.minus(actual).toFixed(2),
    approvedHours: hours.toFixed(2),
  };
}
