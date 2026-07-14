"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useClosePeriodMutation,
  useFinancePeriodsQuery,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Periode fiskal"
        description="Tutup · buka · kunci · tutup tahun"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <MutationError error={mutation.error} />
        {!data || data.years.length === 0 ? (
          <EmptyState message="Belum ada fiscal year" />
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
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2">
                      {formatDateId(p.startDate)}
                    </td>
                    <td className="px-3 py-2">{formatDateId(p.endDate)}</td>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          ))
        )}
      </QueryBoundary>
    </div>
  );
}
