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
import { AlertTriangle, Sparkles } from "lucide-react";

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
  const insights = query.data?.insights ?? [];
  const insightsPage = useClientPage(insights, 20);

  const stats = useMemo(() => {
    let warn = 0;
    let danger = 0;
    for (const i of insights) {
      if (i.severity === "warning") warn += 1;
      if (i.severity === "danger") danger += 1;
    }
    return { total: insights.length, warn, danger };
  }, [insights]);

  return (
    <ListPageShell>
      <PageHeader
        title="AI Forecast & Anomaly"
        description="Gemini Flash Lite · butuh GEMINI_API_KEY"
        actions={
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Sparkles className="mr-1.5 size-4" />
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
        loadingLabel="Memuat insight..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Insight"
              value={stats.total}
              icon={Sparkles}
            />
            <StatCard
              label="Warning"
              value={stats.warn}
              icon={AlertTriangle}
            />
            <StatCard label="Danger" value={stats.danger} />
          </div>

          <Card title={`Insight (${insightsPage.total})`}>
            {insightsPage.total === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Belum ada insight"
                message="Jalankan analisis untuk prediksi stok, risiko AR, dan anomali."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    Jalankan analisis
                  </Button>
                }
              />
            ) : (
              <>
                <div className="space-y-3">
                  {insightsPage.items.map((i) => (
                    <div
                      key={i.id}
                      className="rounded-2xl border border-border/70 bg-[#f7fafc] p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
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
                        <span className="text-xs text-muted">
                          {formatDateTimeId(i.createdAt)}
                        </span>
                        {i.model ? (
                          <span className="text-xs text-muted">· {i.model}</span>
                        ) : null}
                      </div>
                      {i.title ? (
                        <div className="mb-1 text-sm font-semibold text-[#0F4C75]">
                          {i.title}
                        </div>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1B262C]/80">
                        {i.summary.slice(0, 800)}
                        {i.summary.length > 800 ? "…" : ""}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <PaginationBar
                    page={insightsPage.page}
                    totalPages={insightsPage.totalPages}
                    total={insightsPage.total}
                    limit={insightsPage.limit}
                    onPageChange={insightsPage.setPage}
                  />
                </div>
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
