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
  Select,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceAccountsQuery,
  useFinanceAccountMutation,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  BookOpen,
  FolderTree,
  Plus,
  Search,
} from "lucide-react";

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

type FormMode = "none" | "account" | "cost_center";

type AccountsPayload = {
  accounts?: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    normalBalance: string;
    isActive: boolean;
  }>;
  costCenters?: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  }>;
};

export function AccountsClient() {
  const query = useFinanceAccountsQuery();
  const mutation = useFinanceAccountMutation();
  const payload = query.data as AccountsPayload | undefined;
  const accounts = payload?.accounts ?? [];
  const costCenters = payload?.costCenters ?? [];
  const [formMode, setFormMode] = useState<FormMode>("none");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const stats = useMemo(() => {
    const active = accounts.filter((a) => a.isActive).length;
    return {
      total: accounts.length,
      active,
      inactive: accounts.length - active,
      cc: costCenters.length,
    };
  }, [accounts, costCenters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== "ALL" && a.type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q)
      );
    });
  }, [accounts, search, typeFilter]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Chart of Accounts"
        description="Kelola akun GL dan cost center"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Keuangan" },
          { label: "COA" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "cost_center" ? "primary" : "secondary"}
              onClick={() => toggle("cost_center")}
            >
              <FolderTree className="mr-1.5 size-4" />
              Cost center
            </Button>
            <Button
              type="button"
              variant={formMode === "account" ? "secondary" : "primary"}
              onClick={() => toggle("account")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "account" ? "Tutup" : "Tambah akun"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat COA..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total akun" value={stats.total} icon={BookOpen} />
            <StatCard label="Aktif" value={stats.active} />
            <StatCard label="Nonaktif" value={stats.inactive} />
            <StatCard
              label="Cost center"
              value={stats.cc}
              icon={FolderTree}
            />
          </div>

          {formMode === "account" ? (
            <Card title="Tambah akun">
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
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan akun
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

          {formMode === "cost_center" ? (
            <Card title="Tambah cost center">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(
                    {
                      action: "cost_center",
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
                </FormGrid>
                <MutationError error={mutation.error} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={mutation.isPending}>
                    Tambah cost center
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

          <Card
            title={`Daftar akun (${filtered.length}${
              search || typeFilter !== "ALL" ? ` / ${accounts.length}` : ""
            })`}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-8"
                  placeholder="Cari kode / nama..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTypeFilter("ALL")}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    typeFilter === "ALL"
                      ? "border-[#0F4C75] bg-[#0F4C75] text-white"
                      : "border-border/70 bg-white text-muted",
                  )}
                >
                  Semua
                </button>
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      typeFilter === t
                        ? "border-[#0F4C75] bg-[#0F4C75] text-white"
                        : "border-border/70 bg-white text-muted hover:border-[#0F4C75]/30",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                compact
                icon={BookOpen}
                title={
                  accounts.length === 0
                    ? "COA belum tersedia"
                    : "Tidak cocok filter"
                }
                message={
                  accounts.length === 0
                    ? "Tambah akun GL atau seed COA bawaan."
                    : "Ubah pencarian atau tipe akun."
                }
                action={
                  accounts.length === 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("account")}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Tambah akun
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table
                headers={["Kode", "Nama", "Tipe", "Normal", "Aktif", "Aksi"]}
              >
                {filtered.map((a) => (
                  <tr key={a.id} className={cn(!a.isActive && "opacity-60")}>
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {a.code}
                    </td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">
                      <Badge>{a.type}</Badge>
                    </td>
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

          <Card title={`Cost center (${costCenters.length})`}>
            {costCenters.length === 0 ? (
              <EmptyState
                compact
                icon={FolderTree}
                title="Belum ada cost center"
                message="Tambah cost center untuk alokasi jurnal."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setFormMode("cost_center")}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Cost center
                  </Button>
                }
              />
            ) : (
              <Table headers={["Kode", "Nama", "Aktif"]}>
                {costCenters.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {c.code}
                    </td>
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
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
