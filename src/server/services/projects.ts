import { prisma } from "@/lib/db";
import { AppError, conflict, notFound, validationError } from "@/lib/errors";
import { money, qty, toPrismaMoney, toPrismaDecimal } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/document-number";
import { postFromRule, postJournal } from "@/server/services/accounting";
import type { Prisma } from "@/generated/prisma/client";
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
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw validationError("Nilai biaya harus > 0 dan maksimal 2 desimal");
  if (!input.description?.trim()) throw validationError("Deskripsi biaya wajib");
  const expense = await prisma.projectExpense.create({
    data: {
      projectId: input.projectId,
      description: input.description.trim(),
      amount: toPrismaMoney(amount),
      expenseDate: input.expenseDate ?? new Date(),
      // No debit/credit accounts or settlement source supplied: never imply GL posting.
      status: "DRAFT",
    },
  });

  return expense;
}

type ProjectActor = { companyId: string; userId: string; id: string };

export async function approveProjectExpense(input: ProjectActor & { debitAccountCode: string; creditAccountCode: string }) {
  if (!input.debitAccountCode?.trim() || !input.creditAccountCode?.trim() || input.debitAccountCode === input.creditAccountCode) throw validationError("Dua akun biaya dan penyelesaian berbeda wajib");
  return prisma.$transaction(async (tx) => {
    const expense = await tx.projectExpense.findFirst({ where: { id: input.id, project: { companyId: input.companyId } }, include: { project: true } });
    if (!expense) throw notFound("Expense tidak ditemukan");
    if (expense.status !== "DRAFT" || expense.project.status === "CLOSED") throw conflict("Expense tidak dapat disetujui");
    const accounts = await tx.account.findMany({ where: { companyId: input.companyId, code: { in: [input.debitAccountCode, input.creditAccountCode] }, isActive: true } });
    if (!accounts.some((a) => a.code === input.debitAccountCode && ["EXPENSE", "COGS", "OTHER_EXPENSE"].includes(a.type)) || !accounts.some((a) => a.code === input.creditAccountCode && ["ASSET", "LIABILITY"].includes(a.type))) throw validationError("Akun biaya/penyelesaian tidak valid");
    const result = await tx.projectExpense.updateMany({ where: { id: input.id, status: "DRAFT", project: { companyId: input.companyId, status: { not: "CLOSED" } } }, data: { status: "APPROVED", debitAccountCode: input.debitAccountCode, creditAccountCode: input.creditAccountCode, approvedById: input.userId, approvedAt: new Date() } });
    if (result.count !== 1) throw conflict("Expense sudah berubah");
    return { id: input.id, status: "APPROVED" as const };
  }, { isolationLevel: "Serializable" });
}

export async function postProjectExpense(input: ProjectActor) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.projectExpense.findFirst({ where: { id: input.id, project: { companyId: input.companyId } }, include: { project: true } });
    if (!expense) throw notFound("Expense tidak ditemukan");
    if (expense.status !== "APPROVED" || expense.project.status === "CLOSED" || !expense.debitAccountCode || !expense.creditAccountCode) throw conflict("Expense belum disetujui atau project ditutup");
    const accounts = await tx.account.findMany({ where: { companyId: input.companyId, code: { in: [expense.debitAccountCode, expense.creditAccountCode] }, isActive: true } });
    if (!accounts.some((a) => a.code === expense.debitAccountCode && ["EXPENSE", "COGS", "OTHER_EXPENSE"].includes(a.type)) || !accounts.some((a) => a.code === expense.creditAccountCode && ["ASSET", "LIABILITY"].includes(a.type))) throw validationError("Akun tidak aktif/tidak valid");
    const journal = await postJournal(tx, { companyId: input.companyId, sourceModule: "projects", sourceDocType: "ProjectExpense", sourceDocId: expense.id, description: expense.description, postingDate: expense.expenseDate, idempotencyKey: `project-expense:${expense.id}`, postedById: input.userId, lines: [{ accountCode: expense.debitAccountCode, debit: expense.amount.toString() }, { accountCode: expense.creditAccountCode, credit: expense.amount.toString() }] });
    const result = await tx.projectExpense.updateMany({ where: { id: expense.id, status: "APPROVED", journalId: null, project: { companyId: input.companyId, status: { not: "CLOSED" } } }, data: { status: "POSTED", journalId: journal.id } });
    if (result.count !== 1) throw conflict("Expense sudah diposting");
    return { id: expense.id, status: "POSTED" as const, journalId: journal.id };
  }, { isolationLevel: "Serializable" });
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

type CostKind = "PAYROLL" | "MATERIAL";
const sourceInclude = { account: true, journal: { include: { lines: { include: { account: true } }, reversals: { where: { status: "POSTED" as const } } } } } as const;

async function verifiedCostSource(tx: Prisma.TransactionClient, companyId: string, journalLineId: string, kind: CostKind) {
  const line = await tx.journalLine.findFirst({ where: { id: journalLineId, journal: { companyId } }, include: sourceInclude });
  if (!line) throw notFound("Baris jurnal tidak ditemukan");
  const j = line.journal;
  const amount = money(line.debit);
  const expenseLines = j.lines.filter((l) => l.account && ["EXPENSE", "COGS", "OTHER_EXPENSE"].includes(l.account.type));
  if (j.companyId !== companyId || line.account.companyId !== companyId || j.status !== "POSTED" || j.reversalOfId || j.reversals.length || j.currency !== "IDR" || !money(j.exchangeRate).eq(1) || !["EXPENSE", "COGS", "OTHER_EXPENSE"].includes(line.account.type) || !amount.isFinite() || amount.lte(0) || !money(line.credit).eq(0) || !j.lines.reduce((n, l) => n.plus(money(l.debit)), money(0)).eq(j.lines.reduce((n, l) => n.plus(money(l.credit)), money(0)))) throw conflict("Sumber biaya bukan jurnal biaya POSTED IDR yang seimbang dan belum dibalik");
  if (kind === "PAYROLL") {
    if (j.sourceDocType !== "payroll_run" || !j.sourceDocId) throw conflict("Sumber bukan payroll");
    const run = await tx.payrollRun.findFirst({ where: { id: j.sourceDocId, companyId, status: "POSTED" } });
    const expense = expenseLines.reduce((n, l) => n.plus(money(l.debit).minus(l.credit)), money(0));
    if (!run || !expense.eq(money(run.totalGross).plus(money(run.totalEmployerBpjs)))) throw conflict("Biaya payroll tidak cocok dengan run POSTED");
  } else {
    if (j.sourceDocType !== "DeliveryOrder" || !j.sourceDocId || line.account.type !== "COGS") throw conflict("Sumber bukan pemakaian material/COGS delivery");
    const delivery = await tx.deliveryOrder.findFirst({ where: { id: j.sourceDocId, companyId, status: "POSTED" } });
    const movements = await tx.stockMovement.findMany({ where: { companyId, referenceType: "DeliveryOrder", referenceId: j.sourceDocId, type: "SALES_DELIVERY" } });
    const stockCost = movements.reduce((n, m) => n.plus(money(m.totalCost).abs()), money(0));
    const cost = expenseLines.reduce((n, l) => n.plus(money(l.debit).minus(l.credit)), money(0));
    if (!delivery || !movements.length || !stockCost.eq(cost)) throw conflict("COGS tidak cocok dengan mutasi material");
  }
  return { line, amount };
}

export async function allocateProjectCost(input: { companyId: string; userId: string; projectId: string; journalLineId: string; kind: CostKind }) {
  if (!["PAYROLL", "MATERIAL"].includes(input.kind) || !input.journalLineId) throw validationError("Jenis/sumber alokasi wajib");
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: input.projectId, companyId: input.companyId } });
    if (!project) throw notFound("Project tidak ditemukan");
    if (project.status === "CLOSED") throw conflict("Project ditutup");
    if (await tx.projectCostAllocation.findUnique({ where: { journalLineId: input.journalLineId } })) throw conflict("Sumber pernah dialokasikan; tidak dapat digunakan ulang");
    const { amount } = await verifiedCostSource(tx, input.companyId, input.journalLineId, input.kind);
    return tx.projectCostAllocation.create({ data: { companyId: input.companyId, projectId: project.id, journalLineId: input.journalLineId, kind: input.kind, amount: amount.toFixed(2), status: "POSTED", createdById: input.userId } });
  }, { isolationLevel: "Serializable" });
}

export async function reverseProjectAllocation(input: ProjectActor & { reason: string }) {
  if (!input.reason?.trim()) throw validationError("Alasan pembalikan wajib");
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.projectCostAllocation.findFirst({ where: { id: input.id, companyId: input.companyId, project: { companyId: input.companyId } } });
    if (!allocation) throw notFound("Alokasi tidak ditemukan");
    const result = await tx.projectCostAllocation.updateMany({ where: { id: allocation.id, companyId: input.companyId, status: "POSTED" }, data: { status: "VOID", reversedAt: new Date(), reversedById: input.userId, reversalReason: input.reason.trim() } });
    if (result.count !== 1) throw conflict("Alokasi sudah dibalik");
    return { id: allocation.id, status: "VOID" as const };
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
      costAllocations: true,
    },
  });
  if (!project) throw notFound("Project tidak ditemukan");

  const hours = project.timesheets
    .filter((t) => t.status === "APPROVED" || t.status === "POSTED")
    .reduce((acc, t) => acc.plus(money(t.hours)), money(0));
  // No project-level posted payroll allocation exists; hours are not a cost basis.
  const laborCost = project.timesheets.length ? null : money(0);
  const postedExpenses = project.expenses.filter((e) => e.status === "POSTED");
  const journals = postedExpenses.length ? await prisma.journal.findMany({
    where: { companyId, sourceDocType: "ProjectExpense", sourceDocId: { in: postedExpenses.map((e) => e.id) }, status: "POSTED", reversalOfId: null, reversals: { none: { status: "POSTED" } } },
    include: { lines: { include: { account: true } } },
  }) : [];
  const verified = new Map<string, ReturnType<typeof money>>();
  for (const e of postedExpenses) {
    const entries = journals.filter((j) => j.sourceDocId === e.id);
    if (entries.length !== 1 || entries[0].currency !== "IDR" || !money(entries[0].exchangeRate).eq(1)) continue;
    const lines = entries[0].lines;
    const debit = lines.reduce((sum, line) => sum.plus(money(line.debit)), money(0));
    const credit = lines.reduce((sum, line) => sum.plus(money(line.credit)), money(0));
    const cost = lines.filter((line) => ["EXPENSE", "COGS", "OTHER_EXPENSE"].includes(line.account.type))
      .reduce((sum, line) => sum.plus(money(line.debit).minus(money(line.credit))), money(0));
    if (debit.eq(credit) && cost.eq(money(e.amount))) verified.set(e.id, cost);
  }
  const expenseCost = [...verified.values()].reduce((sum, cost) => sum.plus(cost), money(0));
  const unverifiedExpenseCount = project.expenses.filter((e) => e.status !== "CANCELLED" && e.status !== "VOID" && !verified.has(e.id)).length;
  let allocatedLabor = money(0), materialCost = money(0), invalidAllocationCount = 0;
  for (const allocation of project.costAllocations ?? []) {
    if (allocation.status !== "POSTED") continue;
    try {
      if (allocation.kind !== "PAYROLL" && allocation.kind !== "MATERIAL") throw conflict("Jenis alokasi tidak valid");
      const { amount } = await verifiedCostSource(prisma, companyId, allocation.journalLineId, allocation.kind);
      if (!amount.eq(money(allocation.amount))) throw conflict("Nilai sumber berubah");
      if (allocation.kind === "PAYROLL") allocatedLabor = allocatedLabor.plus(amount);
      else materialCost = materialCost.plus(amount);
    } catch (error) {
      if (!(error instanceof AppError) || ![404, 409].includes(error.status)) throw error;
      invalidAllocationCount++;
    }
  }
  const knownCost = expenseCost.plus(allocatedLabor).plus(materialCost);
  // ponytail: whole-source attribution only; complete coverage needs employee-period/material demand links.
  const actual = laborCost === null || unverifiedExpenseCount || invalidAllocationCount || (project.costAllocations?.length ?? 0) > 0 ? null : expenseCost;
  const budget = money(project.budgetAmount);
  const billed = money(project.billedAmount);

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
    },
    budget: budget.toFixed(2),
    actualCost: actual?.toFixed(2) ?? null,
    knownCost: knownCost.toFixed(2),
    allocatedLaborCost: allocatedLabor.toFixed(2),
    materialCost: materialCost.toFixed(2),
    invalidAllocationCount,
    coverage: "PARTIAL",
    recordedMargin: billed.minus(knownCost).toFixed(2),
    costStatus: actual === null ? "UNKNOWN" : "KNOWN",
    unverifiedExpenseCount,
    costNote: "Biaya hanya dari jurnal biaya project POSTED yang cocok, belum dibalik, IDR. Alokasi payroll/material seluruh baris sumber terverifikasi tersedia; cakupan biaya belum lengkap. Margin sumber tercatat bukan laba bersih lengkap.",
    laborCost: laborCost?.toFixed(2) ?? null,
    expenseCost: expenseCost.toFixed(2),
    billedAmount: billed.toFixed(2),
    margin: actual === null ? null : billed.minus(actual).toFixed(2),
    variance: actual === null ? null : budget.minus(actual).toFixed(2),
    approvedHours: hours.toFixed(2),
  };
}
