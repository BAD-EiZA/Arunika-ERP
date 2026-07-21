import {
  Badge,
  Card,
  EmptyState,
  ListPageShell,
  PageHeader,
  StatCard,
  Table,
} from "@/components/ui";
import { requireTenant } from "@/lib/auth";
import { formatDateTimeId } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { Users } from "lucide-react";

export default async function UsersPage() {
  const ctx = await requireTenant();
  const memberships = await prisma.membership.findMany({
    where: { companyId: ctx.companyId },
    include: { user: true, role: true },
    orderBy: { joinedAt: "asc" },
  });

  const active = memberships.filter((m) => m.status === "ACTIVE").length;

  return (
    <ListPageShell>
      <PageHeader
        title="Pengguna & membership"
        description="Anggota perusahaan dan role"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Anggota"
          value={memberships.length}
          icon={Users}
        />
        <StatCard label="Aktif" value={active} />
      </div>
      <Card title="Anggota perusahaan">
        {memberships.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="Tidak ada anggota"
            message="Membership muncul setelah undangan atau onboarding."
          />
        ) : (
          <Table headers={["Nama", "Email", "Role", "Status", "Bergabung"]}>
            {memberships.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 font-medium text-[#0F4C75]">
                  {m.user.name || "—"}
                </td>
                <td className="px-3 py-2">{m.user.email}</td>
                <td className="px-3 py-2">{m.role.name}</td>
                <td className="px-3 py-2">
                  <Badge tone={m.status === "ACTIVE" ? "success" : "warning"}>
                    {m.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {formatDateTimeId(m.joinedAt)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </ListPageShell>
  );
}
