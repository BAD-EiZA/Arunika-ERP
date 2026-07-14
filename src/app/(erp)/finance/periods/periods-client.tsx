"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
} from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import {
  useClosePeriodMutation,
  useFinancePeriodsQuery,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";

type PeriodsData = {
  years: Array<{
    id: string;
    name: string;
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
      <PageHeader title="Periode fiskal" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {!data || data.years.length === 0 ? (
          <EmptyState message="Belum ada fiscal year" />
        ) : (
          data.years.map((year) => (
            <Card key={year.id} title={`Tahun ${year.name}`}>
              <Table headers={["Periode", "Mulai", "Selesai", "Status", "Aksi"]}>
                {year.periods.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2">{formatDateId(p.startDate)}</td>
                    <td className="px-3 py-2">{formatDateId(p.endDate)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "OPEN" ? "success" : "warning"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {p.status === "OPEN" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate({ id: p.id })}
                        >
                          Tutup
                        </Button>
                      ) : null}
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
