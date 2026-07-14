import { Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { requireTenant } from "@/lib/auth";
import { formatDateTimeId } from "@/lib/dates";
import { prisma } from "@/lib/db";

export default async function AuditPage() {
  const ctx = await requireTenant();
  const logs = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" />
      <Card title="100 aktivitas terakhir">
        {logs.length === 0 ? (
          <EmptyState message="Belum ada audit log" />
        ) : (
          <Table headers={["Waktu", "User", "Aksi", "Entitas", "Nomor"]}>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{formatDateTimeId(l.createdAt)}</td>
                <td className="px-3 py-2">{l.user?.email || "-"}</td>
                <td className="px-3 py-2">{l.action}</td>
                <td className="px-3 py-2">
                  {l.entityType}
                  {l.entityId ? ` #${l.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-2">{l.entityNumber || "-"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
