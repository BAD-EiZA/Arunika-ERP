import { requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approvePayrollRun,
  postPayrollRun,
  preparePayrollRun,
} from "@/server/services/payroll";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("payroll:view");
    const runs = await prisma.payrollRun.findMany({
      where: { companyId: ctx.companyId },
      include: { lines: { include: { employee: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
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
          employeeName: l.employee.name,
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
      action?: "prepare" | "approve" | "post";
      id?: string;
      periodStart?: string;
      periodEnd?: string;
    };

    if (body.action === "approve") {
      const ctx = await requirePermission("payroll:approve");
      const run = await approvePayrollRun(ctx.companyId, String(body.id ?? ""));
      return { payrollRun: { id: run.id, status: run.status } };
    }

    if (body.action === "post") {
      const ctx = await requirePermission("payroll:post");
      const run = await postPayrollRun({
        companyId: ctx.companyId,
        userId: ctx.user.id,
        id: String(body.id ?? ""),
      });
      return { payrollRun: { id: run.id, status: run.status } };
    }

    const ctx = await requirePermission("payroll:prepare");
    const start = new Date(body.periodStart || Date.now());
    const end = new Date(body.periodEnd || Date.now());
    const run = await preparePayrollRun({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      periodStart: start,
      periodEnd: end,
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
