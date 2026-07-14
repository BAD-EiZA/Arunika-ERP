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
  PaginationBar,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceJournalMutation,
  useFinanceJournalsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

type JournalsData = {
  journals: Array<{
    id: string;
    number: string;
    status: string;
    description: string | null;
    postingDate: string;
    debit: string;
    credit: string;
  }>;
  accounts: Array<{ id: string; code: string; name: string }>;
};

export function JournalsClient() {
  const query = useFinanceJournalsQuery();
  const mutation = useFinanceJournalMutation();
  const data = query.data as JournalsData | undefined;
  const journalsPage = useClientPage(data?.journals ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Jurnal" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Jurnal manual">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(formToObject(e.currentTarget));
                }}
              >
                <FormGrid>
                  <Field label="Deskripsi">
                    <Input name="description" required />
                  </Field>
                  <Field label="Jumlah">
                    <Input name="amount" type="number" step="0.01" required />
                  </Field>
                  <Field label="Akun debit">
                    <Select name="debitAccount" required defaultValue="6100">
                      {data.accounts.map((a) => (
                        <option key={a.id} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Akun kredit">
                    <Select name="creditAccount" required defaultValue="1110">
                      {data.accounts.map((a) => (
                        <option key={a.id} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <MutationError error={mutation.error} />
                <Button type="submit" disabled={mutation.isPending}>
                  Posting jurnal
                </Button>
              </form>
            </Card>
            <Card title={`Daftar jurnal (${journalsPage.total})`}>
              {journalsPage.total === 0 ? (
                <EmptyState message="Belum ada jurnal" />
              ) : (
                <>
                  <Table headers={["Nomor", "Tanggal", "Deskripsi", "Status", "Debit", "Kredit"]}>
                    {journalsPage.items.map((j) => (
                      <tr key={j.id}>
                        <td className="px-3 py-2">{j.number}</td>
                        <td className="px-3 py-2">{formatDateId(j.postingDate)}</td>
                        <td className="px-3 py-2">{j.description}</td>
                        <td className="px-3 py-2">
                          <Badge tone="success">{j.status}</Badge>
                        </td>
                        <td className="px-3 py-2">{formatIdr(j.debit)}</td>
                        <td className="px-3 py-2">{formatIdr(j.credit)}</td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={journalsPage.page}
                    totalPages={journalsPage.totalPages}
                    total={journalsPage.total}
                    limit={journalsPage.limit}
                    onPageChange={journalsPage.setPage}
                  />
                </>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
