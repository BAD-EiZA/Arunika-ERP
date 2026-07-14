import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { requireTenant } from "@/lib/auth";
import { formatDateTimeId } from "@/lib/dates";
import { prisma } from "@/lib/db";

export default async function UsersPage() {
  const ctx = await requireTenant();
  const memberships = await prisma.membership.findMany({
    where: { companyId: ctx.companyId },
    include: { user: true, role: true },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Pengguna & membership" />
      <Card title="Anggota perusahaan">
        {memberships.length === 0 ? (
          <EmptyState message="Tidak ada anggota" />
        ) : (
          <Table headers={["Nama", "Email", "Role", "Status", "Bergabung"]}>
            {memberships.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2">{m.user.name || "-"}</td>
                <td className="px-3 py-2">{m.user.email}</td>
                <td className="px-3 py-2">{m.role.name}</td>
                <td className="px-3 py-2">
                  <Badge tone={m.status === "ACTIVE" ? "success" : "warning"}>
                    {m.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">{formatDateTimeId(m.joinedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
