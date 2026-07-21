"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  ListPageShell,
  PageHeader,
  PaginationBar,
  Select,
  StatCard,
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
import {
  Building2,
  Landmark,
  Plus,
  Upload,
  Wallet,
} from "lucide-react";

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

type FormMode = "none" | "account" | "import";

export function BankClient() {
  const query = useFinanceBankQuery();
  const mutation = useFinanceBankMutation();
  const data = query.data as BankData | undefined;
  const [formMode, setFormMode] = useState<FormMode>("none");

  const accounts = data?.accounts ?? [];
  const accountsPage = useClientPage(accounts, 20);

  const statementLines = useMemo(
    () =>
      accounts.flatMap((a) =>
        a.statements.flatMap((s) =>
          s.lines.map((l) => ({
            ...l,
            accountCode: a.code,
          })),
        ),
      ),
    [accounts],
  );
  const linesPage = useClientPage(statementLines, 20);

  const stats = useMemo(() => {
    const open = statementLines.filter((l) => !l.isReconciled).length;
    const matched = statementLines.filter((l) => l.isReconciled).length;
    return {
      accounts: accounts.length,
      lines: statementLines.length,
      open,
      matched,
    };
  }, [accounts, statementLines]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Kas & Bank"
        description="Rekening · import statement · rekonsiliasi baris"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "import" ? "primary" : "secondary"}
              onClick={() => toggle("import")}
            >
              <Upload className="mr-1.5 size-4" />
              Import
            </Button>
            <Button
              type="button"
              variant={formMode === "account" ? "secondary" : "primary"}
              onClick={() => toggle("account")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "account" ? "Tutup" : "Tambah rekening"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat kas & bank..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Rekening"
                value={stats.accounts}
                icon={Landmark}
              />
              <StatCard
                label="Baris statement"
                value={stats.lines}
                icon={Wallet}
              />
              <StatCard
                label="Belum match"
                value={stats.open}
                icon={Building2}
              />
              <StatCard label="Matched" value={stats.matched} icon={Upload} />
            </div>

            {formMode === "account" ? (
              <Card title="Tambah rekening">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "create",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
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
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {formMode === "import" ? (
              <Card title="Import / bank feed (CSV line)">
                {accounts.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Landmark}
                    title="Buat rekening dulu"
                    message="Tambah rekening bank sebelum import statement."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("account")}
                      >
                        Tambah rekening
                      </Button>
                    }
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = formToObject(e.currentTarget);
                      mutation.mutate(
                        {
                          action: f.mode === "feed" ? "feed_sync" : "import",
                          ...f,
                        },
                        { onSuccess: () => setFormMode("none") },
                      );
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
                          defaultValue={accounts[0]?.id}
                        >
                          {accounts.map((a) => (
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
                        <Input
                          name="openingBalance"
                          type="number"
                          step="0.01"
                          defaultValue="0"
                        />
                      </Field>
                      <Field label="Saldo akhir">
                        <Input
                          name="closingBalance"
                          type="number"
                          step="0.01"
                          defaultValue="0"
                        />
                      </Field>
                      <Field label="Tanggal baris">
                        <Input name="lineDate" type="date" required />
                      </Field>
                      <Field label="Deskripsi baris">
                        <Input name="lineDescription" />
                      </Field>
                      <Field label="Jumlah baris">
                        <Input
                          name="lineAmount"
                          type="number"
                          step="0.01"
                          required
                        />
                      </Field>
                    </FormGrid>
                    <MutationError error={mutation.error} />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={mutation.isPending}
                      >
                        Import / Sync feed
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setFormMode("none")}
                      >
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            ) : null}

            <Card title={`Rekening (${accountsPage.total})`}>
              {accountsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Landmark}
                  title="Belum ada rekening"
                  message="Tambah rekening kas/bank untuk mutasi dan rekonsiliasi."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("account")}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Tambah rekening
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table
                    headers={["Kode", "Nama", "Bank", "No. rek", "Statement"]}
                  >
                    {accountsPage.items.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {a.code}
                        </td>
                        <td className="px-3 py-2">{a.name}</td>
                        <td className="px-3 py-2">{a.bankName || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {a.accountNumber || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {a.statements.length}
                        </td>
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
                <EmptyState
                  compact
                  icon={Wallet}
                  title="Belum ada statement"
                  message="Import baris statement atau sync bank feed."
                  action={
                    accounts.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("import")}
                      >
                        Import
                      </Button>
                    ) : undefined
                  }
                />
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
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {l.accountCode}
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(l.lineDate)}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2">
                          {l.description || "—"}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(l.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={l.isReconciled ? "success" : "warning"}
                          >
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
    </ListPageShell>
  );
}
