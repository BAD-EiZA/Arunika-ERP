import {
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
import { ScrollText } from "lucide-react";

export default async function AuditPage() {
  const ctx = await requireTenant();
  const logs = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <ListPageShell>
      <PageHeader
        title="Audit log"
        description="100 aktivitas terakhir di perusahaan"
      />
      <StatCard
        label="Entri ditampilkan"
        value={logs.length}
        icon={ScrollText}
        hint="Maks. 100 terbaru"
      />
      <Card title="Aktivitas">
        {logs.length === 0 ? (
          <EmptyState
            compact
            icon={ScrollText}
            title="Belum ada audit log"
            message="Aksi create/update/post akan tercatat di sini."
          />
        ) : (
          <Table headers={["Waktu", "User", "Aksi", "Entitas", "Nomor"]}>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-xs text-muted">
                  {formatDateTimeId(l.createdAt)}
                </td>
                <td className="px-3 py-2">{l.user?.email || "—"}</td>
                <td className="px-3 py-2 font-medium text-[#0F4C75]">
                  {l.action}
                </td>
                <td className="px-3 py-2 text-sm">
                  {l.entityType}
                  {l.entityId ? ` #${l.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-2">{l.entityNumber || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </ListPageShell>
  );
}
