"use client";

import { useMemo } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListPageShell,
  PageHeader,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useClosePeriodMutation,
  useFinancePeriodsQuery,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { CalendarRange, Lock, Unlock } from "lucide-react";

type PeriodsData = {
  years: Array<{
    id: string;
    name: string;
    isClosed?: boolean;
    periods: Array<{
      id: string;
      name: string;
      status: string;
      startDate: string;
      endDate: string;
    }>;
  }>;
};

export function PeriodsClient() {
  const query = useFinancePeriodsQuery();
  const mutation = useClosePeriodMutation();
  const data = query.data as PeriodsData | undefined;

  const stats = useMemo(() => {
    const years = data?.years ?? [];
    let open = 0;
    let closed = 0;
    let locked = 0;
    for (const y of years) {
      for (const p of y.periods) {
        if (p.status === "OPEN") open += 1;
        else if (p.status === "LOCKED") locked += 1;
        else closed += 1;
      }
    }
    return {
      years: years.length,
      open,
      closed,
      locked,
    };
  }, [data]);

  return (
    <ListPageShell>
      <PageHeader
        title="Periode fiskal"
        description="Tutup · buka · kunci · tutup tahun"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat periode..."
      >
        <>
          <MutationError error={mutation.error} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Tahun fiskal"
              value={stats.years}
              icon={CalendarRange}
            />
            <StatCard label="Open" value={stats.open} icon={Unlock} />
            <StatCard label="Closed" value={stats.closed} />
            <StatCard label="Locked" value={stats.locked} icon={Lock} />
          </div>

          {!data || data.years.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Belum ada fiscal year"
              message="Fiscal year dibuat saat onboarding perusahaan."
            />
          ) : (
            data.years.map((year) => (
              <Card
                key={year.id}
                title={`Tahun ${year.name}${year.isClosed ? " (CLOSED)" : ""}`}
              >
                <div className="mb-3">
                  {!year.isClosed ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          action: "close_year",
                          fiscalYearId: year.id,
                        })
                      }
                    >
                      Tutup tahun (P/L → RE)
                    </Button>
                  ) : (
                    <Badge tone="warning">Tahun ditutup</Badge>
                  )}
                </div>
                <Table
                  headers={["Periode", "Mulai", "Selesai", "Status", "Aksi"]}
                >
                  {year.periods.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {p.name}
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(p.startDate)}
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(p.endDate)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            p.status === "OPEN"
                              ? "success"
                              : p.status === "LOCKED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.status === "OPEN" ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "close",
                                    id: p.id,
                                  })
                                }
                              >
                                Tutup
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "lock",
                                    id: p.id,
                                  })
                                }
                              >
                                Kunci
                              </Button>
                            </>
                          ) : null}
                          {p.status === "CLOSED" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({
                                  action: "reopen",
                                  id: p.id,
                                })
                              }
                            >
                              Buka ulang
                            </Button>
                          ) : null}
                          {p.status === "LOCKED" ? (
                            <span className="text-xs text-muted">Terkunci</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </Card>
            ))
          )}
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
