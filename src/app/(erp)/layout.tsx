import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import {
  getSessionUser,
  getTenantContext,
  listUserCompanies,
} from "@/lib/auth";

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

  return (
    <AppShell
      companyName={company?.name ?? "Perusahaan"}
      userName={user.name || user.email}
      activeCompanyId={ctx.companyId}
      companies={memberships.map((m) => ({
        id: m.companyId,
        name: m.company.name,
      }))}
    >
      {children}
    </AppShell>
  );
}
