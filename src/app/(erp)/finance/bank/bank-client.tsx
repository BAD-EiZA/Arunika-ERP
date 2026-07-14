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
  useFinanceBankMutation,
  useFinanceBankQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

type BankData = {
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    bankName: string | null;
    accountNumber: string | null;
    statements: Array<{
      id: string;
      lines: Array<{
        id: string;
        lineDate: string;
        description: string | null;
        amount: string;
        isReconciled: boolean;
      }>;
    }>;
  }>;
};

export function BankClient() {
  const query = useFinanceBankQuery();
  const mutation = useFinanceBankMutation();
  const data = query.data as BankData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Kas & Bank" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Tambah rekening">
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
                    <Field label="Kode">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Bank">
                      <Input name="bankName" />
                    </Field>
                    <Field label="No. rekening">
                      <Input name="accountNumber" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan
                  </Button>
                </form>
              </Card>
              <Card title="Import statement (1 baris)">
                {data.accounts.length === 0 ? (
                  <EmptyState message="Buat rekening dulu" />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutation.mutate({
                        action: "import",
                        ...formToObject(e.currentTarget),
                      });
                    }}
                  >
                    <FormGrid>
                      <Field label="Rekening">
                        <Select
                          name="bankAccountId"
                          required
                          defaultValue={data.accounts[0]?.id}
                        >
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Tanggal statement">
                        <Input name="statementDate" type="date" required />
                      </Field>
                      <Field label="Saldo awal">
                        <Input name="openingBalance" type="number" step="0.01" defaultValue="0" />
                      </Field>
                      <Field label="Saldo akhir">
                        <Input name="closingBalance" type="number" step="0.01" defaultValue="0" />
                      </Field>
                      <Field label="Tanggal baris">
                        <Input name="lineDate" type="date" required />
                      </Field>
                      <Field label="Deskripsi baris">
                        <Input name="lineDescription" />
                      </Field>
                      <Field label="Jumlah baris">
                        <Input name="lineAmount" type="number" step="0.01" required />
                      </Field>
                    </FormGrid>
                    <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                      Import
                    </Button>
                  </form>
                )}
              </Card>
            </div>
            <Card title="Rekening">
              {data.accounts.length === 0 ? (
                <EmptyState message="Belum ada rekening" />
              ) : (
                <Table headers={["Kode", "Nama", "Bank", "No. rek", "Statement"]}>
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2">{a.code}</td>
                      <td className="px-3 py-2">{a.name}</td>
                      <td className="px-3 py-2">{a.bankName || "-"}</td>
                      <td className="px-3 py-2">{a.accountNumber || "-"}</td>
                      <td className="px-3 py-2">{a.statements.length}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Card title="Baris statement">
              {data.accounts.every((a) => a.statements.length === 0) ? (
                <EmptyState message="Belum ada statement" />
              ) : (
                <Table headers={["Rekening", "Tanggal", "Deskripsi", "Jumlah", "Rekonsiliasi"]}>
                  {data.accounts.flatMap((a) =>
                    a.statements.flatMap((s) =>
                      s.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2">{a.code}</td>
                          <td className="px-3 py-2">{formatDateId(l.lineDate)}</td>
                          <td className="px-3 py-2">{l.description || "-"}</td>
                          <td className="px-3 py-2">{formatIdr(l.amount)}</td>
                          <td className="px-3 py-2">
                            <Badge tone={l.isReconciled ? "success" : "warning"}>
                              {l.isReconciled ? "Ya" : "Belum"}
                            </Badge>
                          </td>
                        </tr>
                      )),
                    ),
                  )}
                </Table>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
