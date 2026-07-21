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
  usePurchaseOrderMutation,
  usePurchaseOrdersQuery,
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
  Truck,
} from "lucide-react";

type PoFilter =
  | "ALL"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "OTHER";

function poTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED" || s === "CLOSED" || s === "RECEIVED")
    return "success";
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

export function PurchaseOrdersClient() {
  const query = usePurchaseOrdersQuery();
  const mutation = usePurchaseOrderMutation();
  const data = query.data;
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<PoFilter>("ALL");

  const orders = data?.orders ?? [];

  useEffect(() => {
    if (data?.products?.length && lines.length === 0) {
      setLines(createInitialLines(data.products, "buy"));
    }
  }, [data?.products, lines.length]);

  const stats = useMemo(() => {
    let draft = 0;
    let pending = 0;
    let approved = 0;
    let openValue = 0;
    for (const po of orders) {
      const s = po.status.toUpperCase();
      if (s === "DRAFT") draft += 1;
      else if (s === "PENDING_APPROVAL" || s === "SUBMITTED") pending += 1;
      else if (s === "APPROVED") approved += 1;
      if (!["CANCELLED", "VOID", "CLOSED", "COMPLETED"].includes(s)) {
        openValue += Number(po.total) || 0;
      }
    }
    return { draft, pending, approved, openValue };
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((po) => {
      const s = po.status.toUpperCase();
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
        title="Purchase Order"
        description="Multi-item · submit & approve pengadaan"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat PO"}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat purchase order..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
              <StatCard
                label="Menunggu approve"
                value={stats.pending}
                icon={Hourglass}
                hint="Pending / submitted"
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
              <Card title="Buat PO">
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
                        supplierId: String(fd.get("supplierId") ?? ""),
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
                          setLines(createInitialLines(data.products, "buy"));
                          setShowCreate(false);
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Pemasok">
                      <Select name="supplierId" required>
                        <option value="">Pilih</option>
                        {data.suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code} — {s.name}
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
                    mode="buy"
                    lines={lines}
                    onChange={setLines}
                  />

                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? "Menyimpan..." : "Buat draft PO"}
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
              title={`Daftar PO (${filtered.length}${
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
                    {
                      id: "ALL" as const,
                      label: "Semua",
                      count: orders.length,
                    },
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
                  icon={Truck}
                  title={
                    filter === "ALL" ? "Belum ada PO" : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Buat draft purchase order multi-item ke pemasok."
                      : "Coba filter lain atau buat PO baru."
                  }
                  action={
                    filter === "ALL" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Buat PO
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "Pemasok",
                      "Item",
                      "Total",
                      "Status",
                      "Tanggal",
                      "Aksi",
                    ]}
                  >
                    {ordersPage.items.map((po) => (
                      <tr key={po.id}>
                        <td className="px-3 py-2">
                          <a
                            className="font-medium text-[#0F4C75] underline decoration-[#0F4C75]/30 underline-offset-2 hover:decoration-[#0F4C75]"
                            href={`/api/erp/pdf/po/${po.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {po.number}
                          </a>
                        </td>
                        <td className="px-3 py-2">{po.supplier.name}</td>
                        <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted">
                          {po.items
                            .map((i) => `${i.sku}×${i.quantity}`)
                            .join(", ")}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(po.total)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={poTone(po.status)}>{po.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(po.orderDate)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {po.status === "DRAFT" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "submit",
                                    id: po.id,
                                  })
                                }
                              >
                                Submit
                              </Button>
                            ) : null}
                            {["DRAFT", "PENDING_APPROVAL"].includes(
                              po.status,
                            ) ? (
                              <Button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "approve",
                                    id: po.id,
                                  })
                                }
                              >
                                Approve
                              </Button>
                            ) : null}
                            {!["DRAFT", "PENDING_APPROVAL"].includes(
                              po.status,
                            ) ? (
                              <span className="text-xs text-muted">—</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
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
