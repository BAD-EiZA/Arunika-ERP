"use client";

import { useEffect, useMemo, useState } from "react";
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
  createInitialLines,
  LineItemsEditor,
  linesToPayload,
  type LineItemDraft,
} from "@/components/line-items-editor";
import {
  useSalesOrderMutation,
  useSalesOrdersQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  CheckCircle2,
  ClipboardList,
  FileEdit,
  Hourglass,
  Plus,
  ShoppingCart,
} from "lucide-react";

type SoFilter =
  | "ALL"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "OTHER";

function soTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED" || s === "CLOSED") return "success";
  if (s === "PENDING_APPROVAL" || s === "SUBMITTED") return "warning";
  if (s === "CANCELLED" || s === "VOID" || s === "REJECTED") return "danger";
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

export function SalesOrdersClient() {
  const query = useSalesOrdersQuery();
  const mutation = useSalesOrderMutation();
  const data = query.data;
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<SoFilter>("ALL");

  const orders = data?.orders ?? [];

  useEffect(() => {
    if (data?.products?.length && lines.length === 0) {
      setLines(createInitialLines(data.products, "sell"));
    }
  }, [data?.products, lines.length]);

  const stats = useMemo(() => {
    let draft = 0;
    let pending = 0;
    let approved = 0;
    let openValue = 0;
    for (const so of orders) {
      const s = so.status.toUpperCase();
      if (s === "DRAFT") draft += 1;
      else if (s === "PENDING_APPROVAL" || s === "SUBMITTED") pending += 1;
      else if (s === "APPROVED") approved += 1;
      if (!["CANCELLED", "VOID", "CLOSED", "COMPLETED"].includes(s)) {
        openValue += Number(so.total) || 0;
      }
    }
    return { draft, pending, approved, openValue };
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((so) => {
      const s = so.status.toUpperCase();
      if (filter === "DRAFT") return s === "DRAFT";
      if (filter === "PENDING_APPROVAL")
        return s === "PENDING_APPROVAL" || s === "SUBMITTED";
      if (filter === "APPROVED") return s === "APPROVED";
      if (filter === "OTHER")
        return !["DRAFT", "PENDING_APPROVAL", "SUBMITTED", "APPROVED"].includes(
          s,
        );
      return true;
    });
  }, [orders, filter]);

  const ordersPage = useClientPage(filtered, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Sales Order"
        description="Multi-item · approve & reserve stok"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat SO"}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat sales order..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Draft"
                value={stats.draft}
                icon={FileEdit}
              />
              <StatCard
                label="Menunggu approve"
                value={stats.pending}
                icon={Hourglass}
                hint="Pending approval"
              />
              <StatCard
                label="Approved"
                value={stats.approved}
                icon={CheckCircle2}
              />
              <StatCard
                label="Nilai terbuka"
                value={formatIdr(stats.openValue)}
                icon={ClipboardList}
              />
            </div>

            {showCreate ? (
              <Card title="Buat SO">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const items = linesToPayload(lines);
                    if (!items.length) return;
                    mutation.mutate(
                      {
                        action: "create",
                        customerId: String(fd.get("customerId") ?? ""),
                        warehouseId:
                          String(fd.get("warehouseId") ?? "") || undefined,
                        branchId:
                          String(fd.get("branchId") ?? "") || undefined,
                        notes: String(fd.get("notes") ?? "") || undefined,
                        items,
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setLines(createInitialLines(data.products, "sell"));
                          setShowCreate(false);
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Pelanggan">
                      <Select name="customerId" required>
                        <option value="">Pilih</option>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Gudang">
                      <Select
                        name="warehouseId"
                        defaultValue={data.warehouses[0]?.id}
                      >
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Cabang">
                      <Select
                        name="branchId"
                        defaultValue={data.branches[0]?.id}
                      >
                        {data.branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Catatan">
                      <Input name="notes" />
                    </Field>
                  </FormGrid>

                  <LineItemsEditor
                    products={data.products}
                    mode="sell"
                    lines={lines}
                    onChange={setLines}
                  />

                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? "Menyimpan..." : "Buat draft SO"}
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
              title={`Daftar SO (${filtered.length}${
                filter !== "ALL" ? ` / ${orders.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    ordersPage.setPage(1);
                  }}
                  options={[
                    { id: "ALL" as const, label: "Semua", count: orders.length },
                    {
                      id: "DRAFT" as const,
                      label: "Draft",
                      count: stats.draft,
                    },
                    {
                      id: "PENDING_APPROVAL" as const,
                      label: "Pending",
                      count: stats.pending,
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

              {ordersPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={ShoppingCart}
                  title={
                    filter === "ALL" ? "Belum ada SO" : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Buat draft sales order multi-item untuk pelanggan."
                      : "Coba filter lain atau buat SO baru."
                  }
                  action={
                    filter === "ALL" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Buat SO
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
                      "Item",
                      "Total",
                      "Status",
                      "Tanggal",
                      "Aksi",
                    ]}
                  >
                    {ordersPage.items.map((so) => {
                      const canApprove = [
                        "DRAFT",
                        "PENDING_APPROVAL",
                      ].includes(so.status);
                      return (
                        <tr key={so.id}>
                          <td className="px-3 py-2">
                            <a
                              className="font-medium text-[#0F4C75] underline decoration-[#0F4C75]/30 underline-offset-2 hover:decoration-[#0F4C75]"
                              href={`/api/erp/pdf/so/${so.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {so.number}
                            </a>
                          </td>
                          <td className="px-3 py-2">{so.customer.name}</td>
                          <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted">
                            {so.items
                              .map((i) => `${i.sku}×${i.quantity}`)
                              .join(", ")}
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                            {formatIdr(so.total)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={soTone(so.status)}>{so.status}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            {formatDateId(so.orderDate)}
                          </td>
                          <td className="px-3 py-2">
                            {canApprove ? (
                              <Button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "approve",
                                    id: so.id,
                                  })
                                }
                              >
                                Approve + reserve
                              </Button>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                  <PaginationBar
                    page={ordersPage.page}
                    totalPages={ordersPage.totalPages}
                    total={ordersPage.total}
                    limit={ordersPage.limit}
                    onPageChange={ordersPage.setPage}
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
