import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/shell";
import {
  getSessionUser,
  getTenantContext,
  listUserCompanies,
} from "@/lib/auth";
import { canAccessPath, firstAllowedPath } from "@/lib/nav-access";

export const dynamic = "force-dynamic";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const memberships = await listUserCompanies(user.id);
  if (memberships.length === 0) redirect("/onboarding");

  const ctx = await getTenantContext();
  if (!ctx) redirect("/onboarding");

  const company = memberships.find((m) => m.companyId === ctx.companyId)?.company;
  const permissions: "*" | string[] =
    ctx.permissions === "*" ? "*" : Array.from(ctx.permissions);

  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  if (pathname && !canAccessPath(pathname, permissions)) {
    redirect(firstAllowedPath(permissions));
  }

  return (
    <AppShell
      companyName={company?.name ?? "Perusahaan"}
      userName={user.name || user.email}
      activeCompanyId={ctx.companyId}
      companies={memberships.map((m) => ({
        id: m.companyId,
        name: m.company.name,
      }))}
      permissions={permissions}
      roleCode={ctx.roleCode}
    >
      {children}
    </AppShell>
  );
}
