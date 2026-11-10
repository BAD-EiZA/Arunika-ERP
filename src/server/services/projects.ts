import { prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, toPrismaMoney, toPrismaDecimal } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/document-number";
import { postFromRule } from "@/server/services/accounting";
import { createHash } from "node:crypto";

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
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, companyId: input.companyId },
    });
    if (!customer) throw notFound("Customer tidak ditemukan");
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
  billableAmount?: string | number;
  plannedHours?: string | number;
  dueDate?: Date;
}) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
  });
  if (!project) throw notFound("Project tidak ditemukan");
  if (project.status === "CLOSED") throw conflict("Project sudah ditutup");
  return prisma.projectTask.create({
    data: {
      projectId: input.projectId,
      code: input.code.trim(),
      name: input.name.trim(),
      billableAmount: toPrismaMoney(money(input.billableAmount ?? 0)),
      plannedHours: toPrismaMoney(money(input.plannedHours ?? 0)),
      dueDate: input.dueDate,
      status: "OPEN",
    },
  });
}

export async function submitTimesheet(input: {
  companyId: string;
  projectId: string;
  taskId?: string;
  employeeId?: string;
  workDate: Date;
  hours: string | number;
  notes?: string;
}) {
  if (qty(input.hours).lte(0)) throw validationError("Jam harus > 0");
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
  });
  if (!project) throw notFound("Project tidak ditemukan");
  if (project.status === "CLOSED") throw conflict("Project sudah ditutup");

  if (input.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId },
    });
    if (!employee) throw notFound("Karyawan tidak ditemukan");
  }
  if (input.taskId) {
    const task = await prisma.projectTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
    });
    if (!task) throw notFound("Task tidak ditemukan di project ini");
  }

  return prisma.timesheet.create({
    data: {
      companyId: input.companyId,
      projectId: input.projectId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      hours: toPrismaMoney(money(input.hours)),
      notes: input.notes,
      status: "PENDING_APPROVAL",
    },
  });
}

export async function approveTimesheet(id: string, companyId: string) {
  const ts = await prisma.timesheet.findFirst({
    where: { id, companyId, project: { companyId } },
  });
  if (!ts) throw notFound("Timesheet tidak ditemukan");
  if (ts.status !== "PENDING_APPROVAL") {
    throw conflict("Timesheet tidak pending");
  }
  return prisma.$transaction(async (tx) => {
    if (ts.taskId && !await tx.projectTask.findFirst({ where: { id: ts.taskId, projectId: ts.projectId, project: { companyId } } })) throw notFound("Task tidak ditemukan di project ini");
    if (ts.employeeId && !await tx.employee.findFirst({ where: { id: ts.employeeId, companyId } })) throw notFound("Karyawan tidak ditemukan");
    const updated = await tx.timesheet.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: "APPROVED" },
    });
    if (updated.count === 0) throw conflict("Timesheet tidak pending");
    if (ts.taskId) {
      await tx.projectTask.update({
        where: { id: ts.taskId },
        data: { actualHours: { increment: ts.hours } },
      });
    }
    return { ...ts, status: "APPROVED" as const };
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
  if (amount.lte(0)) throw validationError("Nilai biaya harus > 0");
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

export async function billProjectSource(input: { companyId: string; userId: string; projectId: string; sourceType: "task" | "timesheet"; sourceId: string; hourlyRate?: string | number; idempotencyKey: string }) {
  if (!input.idempotencyKey?.trim() || !["task", "timesheet"].includes(input.sourceType) || !input.sourceId) throw validationError("Sumber/key billing wajib");
  const requestHash = createHash("sha256").update(JSON.stringify([input.projectId, input.sourceType, input.sourceId, money(input.hourlyRate ?? 0).toString()])).digest("hex");
  return prisma.$transaction(async (tx) => {
    const replay = await tx.projectBilling.findFirst({ where: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } });
    if (replay) {
      if (replay.requestHash !== requestHash) throw conflict("Idempotensi: payload berbeda");
      return tx.salesInvoice.findFirst({ where: { id: replay.invoiceId, companyId: input.companyId } });
    }
    const project = await tx.project.findFirst({ where: { id: input.projectId, companyId: input.companyId } });
    if (!project) throw notFound("Project tidak ditemukan");
    if (!project.customerId || project.status === "CLOSED") throw conflict("Project tidak dapat ditagih");
    if (await tx.projectBilling.findFirst({ where: { projectId: project.id, sourceType: input.sourceType, sourceId: input.sourceId } })) throw conflict("Sumber sudah ditagih");
    let quantity = qty(1), unitPrice = money(0), description = "";
    if (input.sourceType === "timesheet") {
      const source = await tx.timesheet.findFirst({ where: { id: input.sourceId, projectId: project.id, project: { companyId: input.companyId } } });
      if (!source || !["APPROVED", "POSTED"].includes(source.status)) throw conflict("Timesheet belum approved");
      if (source.taskId && await tx.projectBilling.findFirst({ where: { projectId: project.id, sourceType: "task", sourceId: source.taskId } })) throw conflict("Task timesheet sudah ditagih");
      quantity = qty(source.hours); unitPrice = money(input.hourlyRate ?? 0); description = `Timesheet ${source.id}`;
    } else {
      const source = await tx.projectTask.findFirst({ where: { id: input.sourceId, projectId: project.id, project: { companyId: input.companyId } } });
      if (!source || !["APPROVED", "CLOSED"].includes(source.status)) throw conflict("Task/milestone belum selesai");
      const sheets = await tx.timesheet.findMany({ where: { taskId: source.id, projectId: project.id }, select: { id: true } });
      if (await tx.projectBilling.findFirst({ where: { projectId: project.id, sourceType: "timesheet", sourceId: { in: sheets.map((s) => s.id) } } })) throw conflict("Timesheet task sudah ditagih");
      unitPrice = money(source.billableAmount); description = source.name;
    }
    if (!quantity.isFinite() || quantity.lte(0) || !unitPrice.isFinite() || unitPrice.lte(0)) throw validationError("Nilai billing harus positif");
    const total = toPrismaMoney(quantity.mul(unitPrice));
    const invoice = await tx.salesInvoice.create({ data: {
      companyId: input.companyId, customerId: project.customerId, projectId: project.id,
      number: await nextDocumentNumber(tx, input.companyId, "INV"), status: "ISSUED", issuedAt: new Date(),
      subtotal: total, total, balance: total,
      items: { create: [{ description, quantity: toPrismaDecimal(quantity), unitPrice: toPrismaMoney(unitPrice), total, taxAmount: "0" }] },
    }, include: { items: true } });
    await tx.projectBilling.create({ data: { companyId: input.companyId, projectId: project.id, sourceType: input.sourceType, sourceId: input.sourceId, idempotencyKey: input.idempotencyKey, requestHash, invoiceId: invoice.id } });
    await postFromRule(tx, { companyId: input.companyId, sourceEvent: "sales_invoice.issue", sourceDocType: "SalesInvoice", sourceDocId: invoice.id, description: `INV ${invoice.number}`, amount: total.toString(), taxAmount: "0", idempotencyKey: `je:inv:${invoice.id}`, postedById: input.userId });
    const billed = await tx.salesInvoice.aggregate({ where: { projectId: project.id, companyId: input.companyId, status: { notIn: ["DRAFT", "CANCELLED", "VOID"] } }, _sum: { total: true } });
    await tx.project.update({ where: { id: project.id }, data: { billedAmount: billed._sum.total ?? "0" } });
    return invoice;
  }, { isolationLevel: "Serializable" });
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
