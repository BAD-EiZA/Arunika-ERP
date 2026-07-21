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
  useCreateSupplierBillMutation,
  useSupplierBillsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  FileText,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";

type BillFilter = "ALL" | "OPEN" | "PAID";

function billTone(
  status: string,
  open: boolean,
): "default" | "success" | "warning" | "danger" {
  if (!open) return "success";
  const s = status.toUpperCase();
  if (s === "PAID" || s === "CLOSED") return "success";
  if (s === "PARTIAL" || s === "OPEN" || s === "POSTED") return "warning";
  if (s === "VOID" || s === "CANCELLED") return "danger";
  return open ? "warning" : "default";
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

function productLines(
  products: Array<{
    id: string;
    sku: string;
    name: string;
    purchasePrice: string;
  }>,
) {
  return createInitialLines(
    products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      purchasePrice: p.purchasePrice,
    })),
    "buy",
  );
}

export function SupplierBillsClient() {
  const query = useSupplierBillsQuery();
  const mutation = useCreateSupplierBillMutation();
  const data = query.data;
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<BillFilter>("ALL");

  const bills = data?.bills ?? [];

  useEffect(() => {
    if (data?.products?.length && lines.length === 0) {
      setLines(productLines(data.products));
    }
  }, [data?.products, lines.length]);

  const stats = useMemo(() => {
    let openCount = 0;
    let openBalance = 0;
    let paidCount = 0;
    for (const b of bills) {
      const bal = Number(b.balance) || 0;
      if (bal > 0) {
        openCount += 1;
        openBalance += bal;
      } else {
        paidCount += 1;
      }
    }
    return { openCount, openBalance, paidCount };
  }, [bills]);

  const filtered = useMemo(() => {
    return bills.filter((b) => {
      const bal = Number(b.balance) || 0;
      if (filter === "OPEN") return bal > 0;
      if (filter === "PAID") return bal <= 0;
      return true;
    });
  }, [bills, filter]);

  const billsPage = useClientPage(filtered, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Tagihan pemasok"
        description="AP multi-item · pantau saldo utang"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat tagihan"}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat tagihan..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Terbuka"
                value={stats.openCount}
                icon={FileText}
                hint="Saldo > 0"
              />
              <StatCard
                label="Saldo utang (AP)"
                value={formatIdr(stats.openBalance)}
                icon={Wallet}
              />
              <StatCard
                label="Lunas"
                value={stats.paidCount}
                icon={Receipt}
              />
            </div>

            {showCreate ? (
              <Card title="Buat tagihan">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const items = linesToPayload(lines).map((i) => ({
                      productId: i.productId,
                      description:
                        data.products.find((p) => p.id === i.productId)
                          ?.name || "Item",
                      quantity: i.quantity,
                      unitPrice: i.unitPrice,
                      taxAmount: i.taxAmount,
                    }));
                    if (!items.length) return;
                    mutation.mutate(
                      {
                        supplierId: String(fd.get("supplierId") ?? ""),
                        purchaseOrderId:
                          String(fd.get("purchaseOrderId") ?? "") ||
                          undefined,
                        supplierInvoiceNo:
                          String(fd.get("supplierInvoiceNo") ?? "") ||
                          undefined,
                        items,
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setLines(productLines(data.products));
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
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="PO (opsional)">
                      <Select name="purchaseOrderId" defaultValue="">
                        <option value="">—</option>
                        {data.purchaseOrders.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.number}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="No. invoice pemasok">
                      <Input name="supplierInvoiceNo" />
                    </Field>
                  </FormGrid>

                  <LineItemsEditor
                    products={data.products.map((p) => ({
                      id: p.id,
                      sku: p.sku,
                      name: p.name,
                      purchasePrice: p.purchasePrice,
                    }))}
                    mode="buy"
                    lines={lines}
                    onChange={setLines}
                  />

                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? "Menyimpan..." : "Simpan tagihan"}
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
              title={`Daftar tagihan (${filtered.length}${
                filter !== "ALL" ? ` / ${bills.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    billsPage.setPage(1);
                  }}
                  options={[
                    {
                      id: "ALL" as const,
                      label: "Semua",
                      count: bills.length,
                    },
                    {
                      id: "OPEN" as const,
                      label: "Terbuka",
                      count: stats.openCount,
                    },
                    {
                      id: "PAID" as const,
                      label: "Lunas",
                      count: stats.paidCount,
                    },
                  ]}
                />
              </div>

              {billsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title={
                    filter === "ALL"
                      ? "Belum ada tagihan"
                      : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Buat tagihan multi-item dari pemasok atau tautkan ke PO."
                      : "Coba filter lain atau buat tagihan baru."
                  }
                  action={
                    filter === "ALL" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Buat tagihan
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
                      "Total",
                      "Saldo",
                      "Status",
                      "Tanggal",
                    ]}
                  >
                    {billsPage.items.map((b) => {
                      const bal = Number(b.balance) || 0;
                      const open = bal > 0;
                      return (
                        <tr key={b.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {b.number}
                          </td>
                          <td className="px-3 py-2">{b.supplier.name}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(b.total)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 tabular-nums font-semibold",
                              open
                                ? "text-[#0F4C75]"
                                : "font-normal text-muted",
                            )}
                          >
                            {formatIdr(b.balance)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={billTone(b.status, open)}>
                              {b.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {formatDateId(b.invoiceDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                  <PaginationBar
                    page={billsPage.page}
                    totalPages={billsPage.totalPages}
                    total={billsPage.total}
                    limit={billsPage.limit}
                    onPageChange={billsPage.setPage}
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
