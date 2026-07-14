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
  useFinanceAccountsQuery,
  useFinanceAccountMutation,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";

const TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "COGS",
  "EXPENSE",
  "OTHER_INCOME",
  "OTHER_EXPENSE",
];

export function AccountsClient() {
  const query = useFinanceAccountsQuery();
  const mutation = useFinanceAccountMutation();
  const accounts =
    (
      query.data as {
        accounts?: Array<{
          id: string;
          code: string;
          name: string;
          type: string;
          normalBalance: string;
          isActive: boolean;
        }>;
      }
    )?.accounts ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        description="Kelola akun GL"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Keuangan" },
          { label: "COA" },
        ]}
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Tambah akun">
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
              <Field label="Tipe">
                <Select name="type" defaultValue="EXPENSE">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Saldo normal">
                <Select name="normalBalance" defaultValue="DEBIT">
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </Select>
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <Button type="submit" disabled={mutation.isPending}>
              Simpan akun
            </Button>
          </form>
        </Card>
        <Card title={`Daftar akun (${accounts.length})`}>
          {accounts.length === 0 ? (
            <EmptyState message="COA belum tersedia" />
          ) : (
            <Table headers={["Kode", "Nama", "Tipe", "Normal", "Aktif", "Aksi"]}>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{a.code}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">{a.type}</td>
                  <td className="px-3 py-2">{a.normalBalance}</td>
                  <td className="px-3 py-2">
                    <Badge tone={a.isActive ? "success" : "danger"}>
                      {a.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({
                            action: "update",
                            id: a.id,
                            isActive: !a.isActive,
                          })
                        }
                      >
                        {a.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={mutation.isPending}
                        onClick={() => {
                          if (
                            !confirm(
                              `Hapus akun ${a.code}? (soft-disable jika sudah dipakai)`,
                            )
                          )
                            return;
                          mutation.mutate({ action: "delete", id: a.id });
                        }}
                      >
                        Hapus
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Cost center">
          <form
            className="mb-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                action: "cost_center",
                ...formToObject(e.currentTarget),
              });
              e.currentTarget.reset();
            }}
          >
            <FormGrid>
              <Field label="Kode">
                <Input name="code" required />
              </Field>
              <Field label="Nama">
                <Input name="name" required />
              </Field>
            </FormGrid>
            <Button type="submit" disabled={mutation.isPending}>
              Tambah cost center
            </Button>
          </form>
          {(
            (
              query.data as {
                costCenters?: Array<{
                  id: string;
                  code: string;
                  name: string;
                  isActive: boolean;
                }>;
              }
            )?.costCenters ?? []
          ).length === 0 ? (
            <EmptyState message="Belum ada cost center" />
          ) : (
            <Table headers={["Kode", "Nama", "Aktif"]}>
              {(
                (
                  query.data as {
                    costCenters?: Array<{
                      id: string;
                      code: string;
                      name: string;
                      isActive: boolean;
                    }>;
                  }
                )?.costCenters ?? []
              ).map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium">{c.code}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">
                    <Badge tone={c.isActive ? "success" : "danger"}>
                      {c.isActive ? "Aktif" : "Off"}
                    </Badge>
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
