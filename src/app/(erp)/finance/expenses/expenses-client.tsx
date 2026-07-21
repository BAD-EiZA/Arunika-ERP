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
  useFinanceExpenseMutation,
  useFinanceExpensesQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  CheckCircle2,
  FileEdit,
  Plus,
  Receipt,
  Send,
} from "lucide-react";

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

type ExpFilter = "ALL" | "DRAFT" | "APPROVED" | "POSTED" | "OTHER";

function expTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "POSTED" || s === "PAID" || s === "CLOSED") return "success";
  if (s === "APPROVED") return "success";
  if (s === "DRAFT" || s === "SUBMITTED") return "warning";
  if (s === "REJECTED" || s === "CANCELLED") return "danger";
  return "default";
}

function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              active
                ? "border-[#0F4C75] bg-[#0F4C75] text-white"
                : "border-border/70 bg-white text-muted hover:border-[#0F4C75]/30 hover:text-[#0F4C75]",
            )}
          >
            {o.label}
            {typeof o.count === "number" ? (
              <span
                className={cn(
                  "ml-1.5 tabular-nums",
                  active ? "text-white/80" : "text-muted",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ExpensesClient() {
  const query = useFinanceExpensesQuery();
  const mutation = useFinanceExpenseMutation();
  const data = query.data as ExpData | undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<ExpFilter>("ALL");

  const claims = data?.claims ?? [];

  const stats = useMemo(() => {
    let draft = 0;
    let approved = 0;
    let posted = 0;
    let totalAmount = 0;
    for (const c of claims) {
      const s = c.status.toUpperCase();
      if (s === "DRAFT") draft += 1;
      else if (s === "APPROVED") approved += 1;
      else if (s === "POSTED") posted += 1;
      totalAmount += Number(c.amount) || 0;
    }
    return { draft, approved, posted, total: claims.length, totalAmount };
  }, [claims]);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      const s = c.status.toUpperCase();
      if (filter === "DRAFT") return s === "DRAFT";
      if (filter === "APPROVED") return s === "APPROVED";
      if (filter === "POSTED") return s === "POSTED";
      if (filter === "OTHER")
        return !["DRAFT", "APPROVED", "POSTED"].includes(s);
      return true;
    });
  }, [claims, filter]);

  return (
    <ListPageShell>
      <PageHeader
        title="Biaya / Expense"
        description="Klaim biaya → approve → post GL"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat klaim"}
          </Button>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat klaim biaya..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Klaim" value={stats.total} icon={Receipt} />
              <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
              <StatCard
                label="Approved"
                value={stats.approved}
                icon={CheckCircle2}
              />
              <StatCard
                label="Nilai total"
                value={formatIdr(stats.totalAmount)}
                icon={Send}
                hint={`${stats.posted} posted`}
              />
            </div>

            {showCreate ? (
              <Card title="Buat klaim biaya">
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
                          setShowCreate(false);
                        },
                      },
                    );
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
                      <Input
                        name="amount"
                        type="number"
                        step="0.01"
                        required
                      />
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
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan draft
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCreate(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            <Card
              title={`Daftar klaim (${filtered.length}${
                filter !== "ALL" ? ` / ${claims.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={setFilter}
                  options={[
                    {
                      id: "ALL" as const,
                      label: "Semua",
                      count: stats.total,
                    },
                    {
                      id: "DRAFT" as const,
                      label: "Draft",
                      count: stats.draft,
                    },
                    {
                      id: "APPROVED" as const,
                      label: "Approved",
                      count: stats.approved,
                    },
                    {
                      id: "POSTED" as const,
                      label: "Posted",
                      count: stats.posted,
                    },
                    { id: "OTHER" as const, label: "Lainnya" },
                  ]}
                />
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title={
                    filter === "ALL"
                      ? "Belum ada klaim"
                      : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Buat klaim biaya draft, lalu approve dan post ke GL."
                      : "Coba filter lain."
                  }
                  action={
                    filter === "ALL" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Buat klaim
                      </Button>
                    ) : undefined
                  }
                />
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
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {c.number}
                      </td>
                      <td className="px-3 py-2">{c.title}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {c.accountCode}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                        {formatIdr(c.amount)}
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(c.expenseDate)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={expTone(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
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
                          {c.status === "POSTED" ? (
                            <span className="text-xs text-muted">—</span>
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
    </ListPageShell>
  );
}
