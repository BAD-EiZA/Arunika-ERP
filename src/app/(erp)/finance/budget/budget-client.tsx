"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceBudgetMutation,
  useFinanceBudgetQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type BudgetData = {
  budgets: Array<{
    id: string;
    name: string;
    year: number;
    status: string;
    lineCount: number;
    total: string;
  }>;
};

export function BudgetClient() {
  const query = useFinanceBudgetQuery();
  const mutation = useFinanceBudgetMutation();
  const data = query.data as BudgetData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Budget" description="TanStack Query" />
      <Card title="Buat budget">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(formToObject(e.currentTarget));
          }}
        >
          <FormGrid>
            <Field label="Nama">
              <Input name="name" required />
            </Field>
            <Field label="Tahun">
              <Input
                name="year"
                type="number"
                defaultValue={String(new Date().getFullYear())}
              />
            </Field>
            <Field label="Kode akun">
              <Input name="accountCode" defaultValue="6100" required />
            </Field>
            <Field label="Periode (bulan)">
              <Input name="period" type="number" min={1} max={12} defaultValue="1" />
            </Field>
            <Field label="Jumlah">
              <Input name="amount" type="number" step="0.01" required />
            </Field>
          </FormGrid>
          <MutationError error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending}>
            Simpan
          </Button>
        </form>
      </Card>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Daftar">
          {!data || data.budgets.length === 0 ? (
            <EmptyState message="Belum ada budget" />
          ) : (
            <Table headers={["Nama", "Tahun", "Status", "Baris", "Total", "Aksi"]}>
              {data.budgets.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2">{b.name}</td>
                  <td className="px-3 py-2">{b.year}</td>
                  <td className="px-3 py-2">
                    <Badge>{b.status}</Badge>
                  </td>
                  <td className="px-3 py-2">{b.lineCount}</td>
                  <td className="px-3 py-2">{formatIdr(b.total)}</td>
                  <td className="px-3 py-2">
                    {b.status === "DRAFT" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({ action: "approve", id: b.id })
                        }
                      >
                        Approve
                      </Button>
                    ) : (
                      <a
                        className="text-sm text-accent underline"
                        href={`/api/erp/finance/budget?vsActual=${b.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Vs actual
                      </a>
                    )}
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
