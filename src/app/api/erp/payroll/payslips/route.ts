import { requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { hasPermission } from "@/lib/permissions";
import { getPayslips } from "@/server/services/payroll";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const session = await requireTenant();
    const employeeId = new URL(req.url).searchParams.get("employeeId") ?? undefined;
    const sensitive = hasPermission(session.permissions, "employee_sensitive:view");
    // ESS authorization is the explicit payrollUserId predicate in getPayslips,
    // not payroll:view: every authenticated employee can read their own slip.
    return { payslips: await getPayslips({ companyId: session.companyId, userId: session.user.id, employeeId, sensitive: Boolean(employeeId && sensitive) }) };
  });
}
