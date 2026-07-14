"use client";

import { useMemo } from "react";
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
  useFinanceBankMutation,
  useFinanceBankQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
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
        matchedRef?: string | null;
      }>;
    }>;
  }>;
  glAccounts?: Array<{ code: string; name: string }>;
};

export function BankClient() {
  const query = useFinanceBankQuery();
  const mutation = useFinanceBankMutation();
  const data = query.data as BankData | undefined;
  const accountsPage = useClientPage(data?.accounts ?? [], 20);
  const statementLines = useMemo(
    () =>
      (data?.accounts ?? []).flatMap((a) =>
        a.statements.flatMap((s) =>
          s.lines.map((l) => ({
            ...l,
            accountCode: a.code,
          })),
        ),
      ),
    [data?.accounts],
  );
  const linesPage = useClientPage(statementLines, 20);

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
                    <Field label="GL akun (opsional)">
                      <Select name="glAccountCode" defaultValue="1110">
                        <option value="">—</option>
                        {(data.glAccounts || []).map((g) => (
                          <option key={g.code} value={g.code}>
                            {g.code} — {g.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan
                  </Button>
                </form>
              </Card>
              <Card title="Import / bank feed (CSV line)">
                {data.accounts.length === 0 ? (
                  <EmptyState message="Buat rekening dulu" />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = formToObject(e.currentTarget);
                      mutation.mutate({
                        action: f.mode === "feed" ? "feed_sync" : "import",
                        ...f,
                      });
                    }}
                  >
                    <FormGrid>
                      <Field label="Mode">
                        <Select name="mode" defaultValue="import">
                          <option value="import">Import statement</option>
                          <option value="feed">Bank feed sync</option>
                        </Select>
                      </Field>
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
                      Import / Sync feed
                    </Button>
                  </form>
                )}
              </Card>
            </div>
            <Card title={`Rekening (${accountsPage.total})`}>
              {accountsPage.total === 0 ? (
                <EmptyState message="Belum ada rekening" />
              ) : (
                <>
                  <Table headers={["Kode", "Nama", "Bank", "No. rek", "Statement"]}>
                    {accountsPage.items.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">{a.code}</td>
                        <td className="px-3 py-2">{a.name}</td>
                        <td className="px-3 py-2">{a.bankName || "-"}</td>
                        <td className="px-3 py-2">{a.accountNumber || "-"}</td>
                        <td className="px-3 py-2">{a.statements.length}</td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={accountsPage.page}
                    totalPages={accountsPage.totalPages}
                    total={accountsPage.total}
                    limit={accountsPage.limit}
                    onPageChange={accountsPage.setPage}
                  />
                </>
              )}
            </Card>
            <Card title={`Baris statement (${linesPage.total})`}>
              {linesPage.total === 0 ? (
                <EmptyState message="Belum ada statement" />
              ) : (
                <>
                  <Table
                    headers={[
                      "Rekening",
                      "Tanggal",
                      "Deskripsi",
                      "Jumlah",
                      "Status",
                      "Aksi",
                    ]}
                  >
                    {linesPage.items.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2">{l.accountCode}</td>
                        <td className="px-3 py-2">
                          {formatDateId(l.lineDate)}
                        </td>
                        <td className="px-3 py-2">{l.description || "-"}</td>
                        <td className="px-3 py-2">{formatIdr(l.amount)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={l.isReconciled ? "success" : "warning"}>
                            {l.isReconciled ? "Matched" : "Open"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {!l.isReconciled ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({
                                  action: "reconcile",
                                  lineId: l.id,
                                  matchedRef: `MANUAL-${l.id.slice(0, 6)}`,
                                })
                              }
                            >
                              Rekonsiliasi
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({
                                  action: "unreconcile",
                                  lineId: l.id,
                                })
                              }
                            >
                              Batal
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={linesPage.page}
                    totalPages={linesPage.totalPages}
                    total={linesPage.total}
                    limit={linesPage.limit}
                    onPageChange={linesPage.setPage}
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
