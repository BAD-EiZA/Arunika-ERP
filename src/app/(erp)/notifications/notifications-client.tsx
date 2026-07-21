"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListPageShell,
  PageHeader,
  PaginationBar,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDateTimeId } from "@/lib/dates";
import { Bell, Mail, Send } from "lucide-react";

type NotifData = {
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    readAt: string | null;
    createdAt: string;
  }>;
};

export function NotificationsClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<NotifData>("/api/erp/notifications"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/notifications", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const data = query.data;
  const notifications = data?.notifications ?? [];
  const page = useClientPage(notifications, 20);

  const stats = useMemo(() => {
    const unread = notifications.filter((n) => !n.readAt).length;
    return {
      total: notifications.length,
      unread,
      read: notifications.length - unread,
    };
  }, [notifications]);

  return (
    <ListPageShell>
      <PageHeader
        title="Notifikasi"
        description="In-app + email outbox"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: "test" })}
            >
              <Send className="mr-1.5 size-4" />
              Kirim uji
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: "flush_email" })}
            >
              <Mail className="mr-1.5 size-4" />
              Flush email
            </Button>
          </div>
        }
      />
      <MutationError error={mutation.error} />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat notifikasi..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total" value={stats.total} icon={Bell} />
            <StatCard label="Belum dibaca" value={stats.unread} />
            <StatCard label="Dibaca" value={stats.read} />
          </div>

          <Card title={`Kotak masuk (${page.total})`}>
            {page.total === 0 ? (
              <EmptyState
                icon={Bell}
                title="Belum ada notifikasi"
                message="Notifikasi sistem dan email outbox muncul di sini."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: "test" })}
                  >
                    Kirim uji
                  </Button>
                }
              />
            ) : (
              <>
                <Table
                  headers={["Waktu", "Judul", "Pesan", "Status", "Aksi"]}
                >
                  {page.items.map((n) => (
                    <tr
                      key={n.id}
                      className={!n.readAt ? "bg-amber-50/40" : undefined}
                    >
                      <td className="px-3 py-2 text-xs text-muted">
                        {formatDateTimeId(n.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {n.title}
                      </td>
                      <td className="max-w-[16rem] px-3 py-2 text-sm">
                        {n.message}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={n.readAt ? "default" : "warning"}>
                          {n.readAt ? "Dibaca" : "Baru"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {!n.readAt ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({ action: "read", id: n.id })
                            }
                          >
                            Tandai dibaca
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={page.page}
                  totalPages={page.totalPages}
                  total={page.total}
                  limit={page.limit}
                  onPageChange={page.setPage}
                />
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
