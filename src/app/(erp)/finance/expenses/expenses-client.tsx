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
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceExpenseMutation,
  useFinanceExpensesQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

type ExpData = {
  claims: Array<{
    id: string;
    number: string;
    title: string;
    accountCode: string;
    amount: string;
    taxAmount: string;
    expenseDate: string;
    status: string;
  }>;
  accounts: Array<{ code: string; name: string }>;
};

export function ExpensesClient() {
  const query = useFinanceExpensesQuery();
  const mutation = useFinanceExpenseMutation();
  const data = query.data as ExpData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biaya / Expense"
        description="Klaim biaya → approve → post GL"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Buat klaim biaya">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate({
                    action: "create",
                    ...formToObject(e.currentTarget),
                  });
                }}
              >
                <FormGrid>
                  <Field label="Judul">
                    <Input name="title" required />
                  </Field>
                  <Field label="Tanggal">
                    <Input name="expenseDate" type="date" required />
                  </Field>
                  <Field label="Jumlah">
                    <Input name="amount" type="number" step="0.01" required />
                  </Field>
                  <Field label="Pajak">
                    <Input
                      name="taxAmount"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                    />
                  </Field>
                  <Field label="Akun beban">
                    <Select
                      name="accountCode"
                      defaultValue={data.accounts[0]?.code || "6100"}
                    >
                      {data.accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Catatan">
                    <Input name="notes" />
                  </Field>
                </FormGrid>
                <MutationError error={mutation.error} />
                <Button type="submit" disabled={mutation.isPending}>
                  Simpan draft
                </Button>
              </form>
            </Card>
            <Card title={`Daftar klaim (${data.claims.length})`}>
              {data.claims.length === 0 ? (
                <EmptyState message="Belum ada klaim" />
              ) : (
                <Table
                  headers={[
                    "Nomor",
                    "Judul",
                    "Akun",
                    "Jumlah",
                    "Tanggal",
                    "Status",
                    "Aksi",
                  ]}
                >
                  {data.claims.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-medium">{c.number}</td>
                      <td className="px-3 py-2">{c.title}</td>
                      <td className="px-3 py-2">{c.accountCode}</td>
                      <td className="px-3 py-2">{formatIdr(c.amount)}</td>
                      <td className="px-3 py-2">
                        {formatDateId(c.expenseDate)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge>{c.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {c.status === "DRAFT" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({
                                  action: "approve",
                                  id: c.id,
                                })
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                          {c.status === "APPROVED" || c.status === "DRAFT" ? (
                            <Button
                              type="button"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ action: "post", id: c.id })
                              }
                            >
                              Post GL
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
