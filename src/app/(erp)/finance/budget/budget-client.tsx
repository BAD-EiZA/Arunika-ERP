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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceBudgetMutation,
  useFinanceBudgetQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  CheckCircle2,
  FileEdit,
  PieChart,
  Plus,
} from "lucide-react";

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

type BudgetFilter = "ALL" | "DRAFT" | "APPROVED" | "OTHER";

function budgetTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "ACTIVE" || s === "CLOSED") return "success";
  if (s === "DRAFT") return "warning";
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

export function BudgetClient() {
  const query = useFinanceBudgetQuery();
  const mutation = useFinanceBudgetMutation();
  const data = query.data as BudgetData | undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<BudgetFilter>("ALL");
  const budgets = data?.budgets ?? [];

  const stats = useMemo(() => {
    let draft = 0;
    let approved = 0;
    let total = 0;
    for (const b of budgets) {
      const s = b.status.toUpperCase();
      if (s === "DRAFT") draft += 1;
      else if (s === "APPROVED") approved += 1;
      total += Number(b.total) || 0;
    }
    return { count: budgets.length, draft, approved, total };
  }, [budgets]);

  const filtered = useMemo(() => {
    return budgets.filter((b) => {
      const s = b.status.toUpperCase();
      if (filter === "DRAFT") return s === "DRAFT";
      if (filter === "APPROVED") return s === "APPROVED";
      if (filter === "OTHER") return s !== "DRAFT" && s !== "APPROVED";
      return true;
    });
  }, [budgets, filter]);

  return (
    <ListPageShell>
      <PageHeader
        title="Budget"
        description="Rencana anggaran per akun & periode"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat budget"}
          </Button>
        }
      />

      {showCreate ? (
        <Card title="Buat budget">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(formToObject(e.currentTarget), {
                onSuccess: () => {
                  e.currentTarget.reset();
                  setShowCreate(false);
                },
              });
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
                <Input
                  name="period"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue="1"
                />
              </Field>
              <Field label="Jumlah">
                <Input name="amount" type="number" step="0.01" required />
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
                onClick={() => setShowCreate(false)}
              >
                Batal
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat budget..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Budget" value={stats.count} icon={PieChart} />
            <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
            <StatCard
              label="Approved"
              value={stats.approved}
              icon={CheckCircle2}
            />
            <StatCard label="Total nilai" value={formatIdr(stats.total)} />
          </div>

          <Card
            title={`Daftar (${filtered.length}${
              filter !== "ALL" ? ` / ${budgets.length}` : ""
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
                    count: stats.count,
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
                  { id: "OTHER" as const, label: "Lainnya" },
                ]}
              />
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                compact
                icon={PieChart}
                title={
                  filter === "ALL"
                    ? "Belum ada budget"
                    : "Tidak ada di filter ini"
                }
                message={
                  filter === "ALL"
                    ? "Buat budget draft, lalu approve untuk kontrol belanja."
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
                      Buat budget
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table
                headers={[
                  "Nama",
                  "Tahun",
                  "Status",
                  "Baris",
                  "Total",
                  "Aksi",
                ]}
              >
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {b.name}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{b.year}</td>
                    <td className="px-3 py-2">
                      <Badge tone={budgetTone(b.status)}>{b.status}</Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{b.lineCount}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                      {formatIdr(b.total)}
                    </td>
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
                          className="text-sm font-medium text-[#0F4C75] underline decoration-[#0F4C75]/30 underline-offset-2"
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
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
