"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDateTimeId } from "@/lib/dates";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifikasi"
        description="In-app + email outbox"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => mutation.mutate({ action: "test" })}
            >
              Kirim uji
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => mutation.mutate({ action: "flush_email" })}
            >
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
      >
        <Card title="Kotak masuk">
          {!data || data.notifications.length === 0 ? (
            <EmptyState message="Belum ada notifikasi" />
          ) : (
            <Table headers={["Waktu", "Judul", "Pesan", "Status", "Aksi"]}>
              {data.notifications.map((n) => (
                <tr key={n.id}>
                  <td className="px-3 py-2 text-xs">
                    {formatDateTimeId(n.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-medium">{n.title}</td>
                  <td className="px-3 py-2 text-sm">{n.message}</td>
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
                        onClick={() =>
                          mutation.mutate({ action: "read", id: n.id })
                        }
                      >
                        Tandai dibaca
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
