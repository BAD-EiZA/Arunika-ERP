"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import { apiGet } from "@/lib/api-client";

type Readiness = {
  ok: boolean;
  time: string;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  modules: string[];
  version: string;
};

export function ReadinessClient() {
  const query = useQuery({
    queryKey: ["readiness"],
    queryFn: () => apiGet<Readiness>("/api/health/ready"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production readiness"
        description="Fase 14 · health & module checklist"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <>
            <Card title="Status">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge tone={query.data.ok ? "success" : "danger"}>
                  {query.data.ok ? "READY" : "NOT READY"}
                </Badge>
                <span className="text-muted">v{query.data.version}</span>
                <span className="text-muted">
                  {query.data.time.slice(0, 19).replace("T", " ")}
                </span>
              </div>
            </Card>
            <Card title="Checks">
              <Table headers={["Check", "Status", "Detail"]}>
                {query.data.checks.map((c) => (
                  <tr key={c.name}>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2">
                      <Badge tone={c.ok ? "success" : "danger"}>
                        {c.ok ? "OK" : "FAIL"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {c.detail || "—"}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Modules scaffolded">
              <div className="flex flex-wrap gap-2">
                {query.data.modules.map((m) => (
                  <Badge key={m}>{m}</Badge>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
