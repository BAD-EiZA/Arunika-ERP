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
  useInvoicesQuery,
  useIssueInvoiceMutation,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  AlertTriangle,
  FileText,
  Plus,
  Receipt,
  Truck,
  Wallet,
} from "lucide-react";

type InvFilter = "ALL" | "OPEN" | "OVERDUE" | "PAID";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOverdue(dueDate: string | null, balance: string | number) {
  const bal = Number(balance) || 0;
  if (bal <= 0 || !dueDate) return false;
  return new Date(dueDate) < startOfToday();
}

function invTone(
  status: string,
  overdue: boolean,
): "default" | "success" | "warning" | "danger" {
  if (overdue) return "danger";
  const s = status.toUpperCase();
  if (s === "PAID" || s === "CLOSED") return "success";
  if (s === "PARTIAL" || s === "OPEN" || s === "POSTED") return "warning";
  if (s === "VOID" || s === "CANCELLED") return "danger";
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

export function InvoicesClient() {
  const query = useInvoicesQuery();
  const mutation = useIssueInvoiceMutation();
  const data = query.data;
  const [showIssue, setShowIssue] = useState(false);
  const [filter, setFilter] = useState<InvFilter>("ALL");

  const invoices = data?.invoices ?? [];

  const stats = useMemo(() => {
    let openCount = 0;
    let openBalance = 0;
    let overdueCount = 0;
    let paidCount = 0;
    for (const inv of invoices) {
      const bal = Number(inv.balance) || 0;
      if (bal > 0) {
        openCount += 1;
        openBalance += bal;
        if (isOverdue(inv.dueDate, inv.balance)) overdueCount += 1;
      } else {
        paidCount += 1;
      }
    }
    return { openCount, openBalance, overdueCount, paidCount };
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const bal = Number(inv.balance) || 0;
      if (filter === "OPEN") return bal > 0;
      if (filter === "OVERDUE") return isOverdue(inv.dueDate, inv.balance);
      if (filter === "PAID") return bal <= 0;
      return true;
    });
  }, [invoices, filter]);

  const invoicesPage = useClientPage(filtered, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Invoice penjualan"
        description="Terbitkan dari delivery · pantau saldo & jatuh tempo"
        actions={
          <Button
            type="button"
            onClick={() => setShowIssue((v) => !v)}
            variant={showIssue ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showIssue ? "Tutup form" : "Terbitkan"}
            {data && data.openDeliveries.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {data.openDeliveries.length}
              </span>
            ) : null}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat invoice..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Terbuka"
                value={stats.openCount}
                icon={FileText}
                hint="Saldo > 0"
              />
              <StatCard
                label="Saldo piutang"
                value={formatIdr(stats.openBalance)}
                icon={Wallet}
              />
              <StatCard
                label="Jatuh tempo"
                value={stats.overdueCount}
                icon={AlertTriangle}
                hint="Lewat due date"
              />
              <StatCard
                label="Lunas"
                value={stats.paidCount}
                icon={Receipt}
              />
            </div>

            {showIssue ? (
              <Card title="Terbitkan dari delivery">
                {data.openDeliveries.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Truck}
                    title="Tidak ada delivery siap"
                    message="Selesaikan pengiriman dulu sebelum menerbitkan invoice."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      mutation.mutate(
                        {
                          deliveryOrderId: String(
                            fd.get("deliveryOrderId") ?? "",
                          ),
                          taxRate: String(fd.get("taxRate") ?? "11"),
                        },
                        { onSuccess: () => setShowIssue(false) },
                      );
                    }}
                  >
                    <FormGrid>
                      <Field label="Delivery">
                        <Select name="deliveryOrderId" required>
                          {data.openDeliveries.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.number} — {d.customerName}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Tarif PPN %">
                        <Input
                          name="taxRate"
                          type="number"
                          step="0.01"
                          defaultValue="11"
                        />
                      </Field>
                    </FormGrid>
                    <MutationError error={mutation.error} />
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending
                        ? "Menerbitkan..."
                        : "Issue invoice"}
                    </Button>
                  </form>
                )}
              </Card>
            ) : null}

            <Card
              title={`Daftar invoice (${filtered.length}${
                filter !== "ALL" ? ` / ${invoices.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    invoicesPage.setPage(1);
                  }}
                  options={[
                    { id: "ALL" as const, label: "Semua", count: invoices.length },
                    {
                      id: "OPEN" as const,
                      label: "Terbuka",
                      count: stats.openCount,
                    },
                    {
                      id: "OVERDUE" as const,
                      label: "Overdue",
                      count: stats.overdueCount,
                    },
                    {
                      id: "PAID" as const,
                      label: "Lunas",
                      count: stats.paidCount,
                    },
                  ]}
                />
              </div>

              {invoicesPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title={
                    filter === "ALL"
                      ? "Belum ada invoice"
                      : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Terbitkan invoice dari delivery yang sudah dikirim."
                      : "Coba filter lain atau terbitkan invoice baru."
                  }
                  action={
                    filter === "ALL" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowIssue(true)}
                      >
                        Terbitkan
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "Pelanggan",
                      "Total",
                      "Saldo",
                      "Status",
                      "Jatuh tempo",
                    ]}
                  >
                    {invoicesPage.items.map((inv) => {
                      const bal = Number(inv.balance) || 0;
                      const overdue = isOverdue(inv.dueDate, inv.balance);
                      return (
                        <tr
                          key={inv.id}
                          className={cn(overdue && "bg-red-50/60")}
                        >
                          <td className="px-3 py-2">
                            <a
                              className="font-medium text-[#0F4C75] underline decoration-[#0F4C75]/30 underline-offset-2 hover:decoration-[#0F4C75]"
                              href={`/api/erp/pdf/invoice/${inv.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {inv.number}
                            </a>
                          </td>
                          <td className="px-3 py-2">{inv.customer.name}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(inv.total)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 tabular-nums font-semibold",
                              bal > 0
                                ? "text-[#0F4C75]"
                                : "text-muted font-normal",
                              overdue && "text-red-700",
                            )}
                          >
                            {formatIdr(inv.balance)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={invTone(inv.status, overdue)}>
                              {overdue ? "OVERDUE" : inv.status}
                            </Badge>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2",
                              overdue && "font-medium text-red-700",
                            )}
                          >
                            {formatDateId(inv.dueDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                  <PaginationBar
                    page={invoicesPage.page}
                    totalPages={invoicesPage.totalPages}
                    total={invoicesPage.total}
                    limit={invoicesPage.limit}
                    onPageChange={invoicesPage.setPage}
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
