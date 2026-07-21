"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  ListPageShell,
  PageHeader,
  StatCard,
  Table,
} from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import { apiGet } from "@/lib/api-client";
import { Activity, CheckCircle2, Layers } from "lucide-react";

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

  const stats = useMemo(() => {
    const checks = query.data?.checks ?? [];
    const pass = checks.filter((c) => c.ok).length;
    return {
      pass,
      fail: checks.length - pass,
      modules: query.data?.modules.length ?? 0,
    };
  }, [query.data]);

  return (
    <ListPageShell>
      <PageHeader
        title="Production readiness"
        description="Health checks & module checklist"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat readiness..."
      >
        {query.data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Status"
                value={query.data.ok ? "READY" : "NOT READY"}
                icon={Activity}
              />
              <StatCard
                label="Checks OK"
                value={stats.pass}
                icon={CheckCircle2}
              />
              <StatCard label="Checks fail" value={stats.fail} />
              <StatCard
                label="Modules"
                value={stats.modules}
                icon={Layers}
              />
            </div>
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
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {c.name}
                    </td>
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
    </ListPageShell>
  );
}
