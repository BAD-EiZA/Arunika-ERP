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
  usePurchaseRequestMutation,
  usePurchaseRequestsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  CheckCircle2,
  ClipboardList,
  FileEdit,
  Plus,
} from "lucide-react";

type PrFilter = "ALL" | "DRAFT" | "APPROVED" | "OTHER";

function prTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "CLOSED" || s === "COMPLETED") return "success";
  if (s === "DRAFT" || s === "PENDING") return "warning";
  if (s === "CANCELLED" || s === "REJECTED") return "danger";
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

export function PurchaseRequestsClient() {
  const query = usePurchaseRequestsQuery();
  const mutation = usePurchaseRequestMutation();
  const data = query.data as
    | {
        requests: Array<{
          id: string;
          number: string;
          status: string;
          items: Array<{ sku: string; quantity: string }>;
        }>;
        products: Array<{ id: string; sku: string; name: string }>;
        branches: Array<{ id: string; code: string; name: string }>;
      }
    | undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<PrFilter>("ALL");

  const requests = data?.requests ?? [];

  const stats = useMemo(() => {
    let draft = 0;
    let approved = 0;
    for (const r of requests) {
      const s = r.status.toUpperCase();
      if (s === "DRAFT") draft += 1;
      else if (s === "APPROVED") approved += 1;
    }
    return { draft, approved, total: requests.length };
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const s = r.status.toUpperCase();
      if (filter === "DRAFT") return s === "DRAFT";
      if (filter === "APPROVED") return s === "APPROVED";
      if (filter === "OTHER") return s !== "DRAFT" && s !== "APPROVED";
      return true;
    });
  }, [requests, filter]);

  const requestsPage = useClientPage(filtered, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Purchase Request"
        description="Permintaan pembelian · approve sebelum RFQ/PO"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat PR"}
          </Button>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat PR..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Total PR"
                value={stats.total}
                icon={ClipboardList}
              />
              <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
              <StatCard
                label="Approved"
                value={stats.approved}
                icon={CheckCircle2}
              />
            </div>

            {showCreate ? (
              <Card title="Buat PR">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
                        action: "create",
                        branchId: body.branchId || undefined,
                        notes: body.notes || undefined,
                        items: [
                          {
                            productId: body.productId,
                            quantity: body.quantity,
                          },
                        ],
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
                    <Field label="Produk">
                      <Select name="productId" required>
                        <option value="">Pilih</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty">
                      <Input
                        name="quantity"
                        type="number"
                        step="0.0001"
                        required
                      />
                    </Field>
                    <Field label="Catatan">
                      <Input name="notes" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? "Menyimpan..." : "Simpan PR"}
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
              title={`Daftar (${filtered.length}${
                filter !== "ALL" ? ` / ${requests.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    requestsPage.setPage(1);
                  }}
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
                    { id: "OTHER" as const, label: "Lainnya" },
                  ]}
                />
              </div>

              {requestsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title={
                    filter === "ALL" ? "Belum ada PR" : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Buat purchase request untuk memulai alur pengadaan."
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
                        Buat PR
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table headers={["Nomor", "Status", "Item", "Aksi"]}>
                    {requestsPage.items.map((pr) => (
                      <tr key={pr.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {pr.number}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={prTone(pr.status)}>{pr.status}</Badge>
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-muted">
                          {pr.items
                            .map((i) => `${i.sku}×${i.quantity}`)
                            .join(", ")}
                        </td>
                        <td className="px-3 py-2">
                          {pr.status === "DRAFT" ? (
                            <Button
                              type="button"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({
                                  action: "approve",
                                  id: pr.id,
                                })
                              }
                            >
                              Approve
                            </Button>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={requestsPage.page}
                    totalPages={requestsPage.totalPages}
                    total={requestsPage.total}
                    limit={requestsPage.limit}
                    onPageChange={requestsPage.setPage}
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
