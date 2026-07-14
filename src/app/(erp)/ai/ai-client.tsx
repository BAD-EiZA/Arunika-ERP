"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PaginationBar,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDateTimeId } from "@/lib/dates";

type AiData = {
  insights: Array<{
    id: string;
    insightType: string;
    title: string;
    summary: string;
    severity: string;
    model: string | null;
    createdAt: string;
  }>;
};

export function AiClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["ai"],
    queryFn: () => apiGet<AiData>("/api/erp/ai"),
  });
  const mutation = useMutation({
    mutationFn: () => apiPost("/api/erp/ai", {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai"] });
    },
  });
  const insightsPage = useClientPage(query.data?.insights ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Forecast & Anomaly"
        description="Gemini Flash Lite · butuh GEMINI_API_KEY"
        actions={
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Menganalisis..." : "Jalankan analisis"}
          </Button>
        }
      />
      <MutationError error={mutation.error} />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title={`Insight (${insightsPage.total})`}>
          {insightsPage.total === 0 ? (
            <EmptyState message="Belum ada insight. Jalankan analisis." />
          ) : (
            <>
              <Table headers={["Waktu", "Model", "Severity", "Ringkasan"]}>
                {insightsPage.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 text-xs">
                      {formatDateTimeId(i.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">{i.model || "-"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          i.severity === "warning"
                            ? "warning"
                            : i.severity === "danger"
                              ? "danger"
                              : "default"
                        }
                      >
                        {i.severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-pre-wrap text-sm">
                      {i.summary.slice(0, 500)}
                      {i.summary.length > 500 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </Table>
              <PaginationBar
                page={insightsPage.page}
                totalPages={insightsPage.totalPages}
                total={insightsPage.total}
                limit={insightsPage.limit}
                onPageChange={insightsPage.setPage}
              />
            </>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
