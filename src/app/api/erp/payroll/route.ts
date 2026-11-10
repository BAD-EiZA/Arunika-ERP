import { assertRequestAccess, assertResourceAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import {
  approvePayrollRun, createPayrollDisbursement, settlePayrollDisbursement, type PayrollComponents,
  createPayrollPolicy, approvePayrollPolicy, createPayrollProfile, defaultPolicyConfig,
  postPayrollRun,
  preparePayrollRun,
} from "@/server/services/payroll";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission(["payroll:view", "employee_sensitive:view"]);
    const runs = await prisma.payrollRun.findMany({
      where: { companyId: ctx.companyId },
      include: { lines: { include: { employee: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const [policies, employees, profiles] = await Promise.all([
      prisma.payrollPolicy.findMany({ where: { companyId: ctx.companyId }, orderBy: { effectiveFrom: "desc" } }),
      prisma.employee.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true } }),
      prisma.employeePayrollProfile.findMany({ where: { companyId: ctx.companyId }, orderBy: { effectiveFrom: "desc" } }),
    ]);
    return {
      disbursements: await prisma.payrollDisbursement.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
      policies, employees, profiles, policyTemplate: defaultPolicyConfig(),
      runs: runs.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        periodStart: r.periodStart.toISOString(),
        periodEnd: r.periodEnd.toISOString(),
        totalGross: r.totalGross.toString(),
        totalDeduction: r.totalDeduction.toString(),
        totalNet: r.totalNet.toString(),
        lines: r.lines.map((l) => ({
          employeeId: l.employeeId, employeeName: l.employee.name,
          allowances: l.allowances.toString(), overtime: l.overtime.toString(), detail: l.detail,
          baseSalary: l.baseSalary.toString(),
          grossPay: l.grossPay.toString(),
          netPay: l.netPay.toString(),
          taxAmount: l.taxAmount.toString(),
          bpjsAmount: l.bpjsAmount.toString(),
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "prepare" | "approve" | "post" | "createPolicy" | "approvePolicy" | "createProfile" | "createDisbursement" | "settleDisbursement";
      components?: PayrollComponents[]; fixedAllowance?: string; overtimeRate?: string; payrollUserId?: string;
      payrollRunId?: string; accountCode?: string; bankAccountCode?: string; amount?: string; paymentDate?: string; idempotencyKey?: string;
      config?: unknown; effectiveFrom?: string; notes?: string; employeeId?: string; taxStatus?: string; jkkRiskClass?: string; employmentType?: string;
      id?: string;
      periodStart?: string;
      periodEnd?: string;
    };

    if (body.action === "createDisbursement" || body.action === "settleDisbursement") {
      const ctx = await requirePermission(body.action === "createDisbursement" ? "payroll:prepare" : ["payroll:approve", "payroll:post"]);
      await assertRequestAccess(ctx, body);
      if (body.action === "settleDisbursement") {
        // Bank access must be verified against the persisted disbursement, not the request body.
        const disbursement = await prisma.payrollDisbursement.findFirst({ where: { id: String(body.id ?? ""), companyId: ctx.companyId }, select: { bankAccountCode: true } });
        const account = disbursement ? await prisma.account.findFirst({ where: { companyId: ctx.companyId, code: disbursement.bankAccountCode }, select: { id: true } }) : null;
        const bank = account ? await prisma.bankAccount.findFirst({ where: { companyId: ctx.companyId, glAccountId: account.id }, select: { id: true } }) : null;
        await assertResourceAccess(ctx, "bankAccount", bank?.id);
        return { disbursement: await settlePayrollDisbursement({ companyId: ctx.companyId, userId: ctx.user.id, id: String(body.id ?? "") }) };
      }
      return { disbursement: await createPayrollDisbursement({ companyId: ctx.companyId, userId: ctx.user.id, payrollRunId: String(body.payrollRunId ?? ""), accountCode: String(body.accountCode ?? ""), bankAccountCode: String(body.bankAccountCode ?? ""), amount: String(body.amount ?? ""), paymentDate: new Date(body.paymentDate ?? ""), idempotencyKey: String(body.idempotencyKey ?? "") }) };
    }
    if (body.action === "createPolicy" || body.action === "createProfile" || body.action === "approvePolicy") {
      const ctx = await requirePermission(body.action === "approvePolicy" ? "payroll:approve" : "payroll:prepare");
      await assertRequestAccess(ctx, body);
      if (body.action === "approvePolicy") return { policy: await approvePayrollPolicy(ctx.companyId, String(body.id ?? ""), ctx.user.id) };
      if (body.action === "createPolicy") return { policy: await createPayrollPolicy({ companyId: ctx.companyId, userId: ctx.user.id, effectiveFrom: new Date(body.effectiveFrom ?? ""), config: body.config, notes: body.notes }) };
      return { profile: await createPayrollProfile({ companyId: ctx.companyId, userId: ctx.user.id, employeeId: String(body.employeeId ?? ""), effectiveFrom: new Date(body.effectiveFrom ?? ""), employmentType: String(body.employmentType ?? ""), taxStatus: String(body.taxStatus ?? ""), jkkRiskClass: String(body.jkkRiskClass ?? ""), fixedAllowance: body.fixedAllowance, overtimeRate: body.overtimeRate, payrollUserId: body.payrollUserId }) };
    }
    if (body.action === "approve") {
      const ctx = await requirePermission("payroll:approve");
    await assertRequestAccess(ctx, body);
      const run = await approvePayrollRun(ctx.companyId, String(body.id ?? ""), ctx.user.id);
      return { payrollRun: { id: run.id, status: run.status } };
    }

    if (body.action === "post") {
      const ctx = await requirePermission("payroll:post");
    await assertRequestAccess(ctx, body);
      const run = await postPayrollRun({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
      });
      return { payrollRun: { id: run.id, status: run.status } };
    }

    if (body.action !== "prepare") throw validationError("Aksi payroll tidak valid");
    const ctx = await requirePermission("payroll:prepare");
    await assertRequestAccess(ctx, body);
    const start = new Date(body.periodStart ?? "");
    const end = new Date(body.periodEnd ?? "");
    const run = await preparePayrollRun({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      periodStart: start,
      periodEnd: end, components: body.components,
    });
    return {
      payrollRun: {
        id: run.id,
        number: run.number,
        status: run.status,
        totalNet: run.totalNet.toString(),
      },
    };
  });
}
