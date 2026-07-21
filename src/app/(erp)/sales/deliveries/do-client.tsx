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
  useDeliveriesQuery,
  usePostDeliveryMutation,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { qty } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  ClipboardList,
  PackageCheck,
  Plus,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";

type DoFilter = "ALL" | "INVOICED" | "OPEN";

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

export function DeliveriesClient() {
  const query = useDeliveriesQuery();
  const mutation = usePostDeliveryMutation();
  const data = query.data;
  const [showPost, setShowPost] = useState(false);
  const [soId, setSoId] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<DoFilter>("ALL");

  const openSos = data?.openSos ?? [];
  const deliveries = data?.deliveries ?? [];

  const openSosKey = openSos.map((s) => s.id).join("|");
  const selectedSo = useMemo(() => {
    if (!data?.openSos?.length) return undefined;
    const id = soId || data.openSos[0]?.id;
    return data.openSos.find((s) => s.id === id);
    // openSosKey tracks list identity without deep data dep lint noise
  }, [data, soId, openSosKey]);

  const stats = useMemo(() => {
    const ready = openSos.length;
    const total = deliveries.length;
    const invoiced = deliveries.filter((d) => d.invoiced).length;
    const notInvoiced = total - invoiced;
    const customers = new Set(deliveries.map((d) => d.customer.name)).size;
    return { ready, total, invoiced, notInvoiced, customers };
  }, [openSos, deliveries]);

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (filter === "INVOICED") return d.invoiced;
      if (filter === "OPEN") return !d.invoiced;
      return true;
    });
  }, [deliveries, filter]);

  const deliveriesPage = useClientPage(filtered, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Pengiriman"
        description="Post delivery dari SO approved · multi-item"
        actions={
          <Button
            type="button"
            onClick={() => setShowPost((v) => !v)}
            variant={showPost ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showPost ? "Tutup form" : "Posting pengiriman"}
            {openSos.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {openSos.length}
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
        loadingLabel="Memuat pengiriman..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="SO siap kirim"
                value={stats.ready}
                icon={ShoppingCart}
                hint="Open sales orders"
              />
              <StatCard
                label="Delivery"
                value={stats.total}
                icon={Truck}
              />
              <StatCard
                label="Belum diinvoice"
                value={stats.notInvoiced}
                icon={PackageCheck}
              />
              <StatCard
                label="Pelanggan"
                value={stats.customers}
                icon={Users}
                hint="Di riwayat delivery"
              />
            </div>

            {showPost ? (
              <Card title="Posting delivery">
                {openSos.length === 0 ? (
                  <EmptyState
                    compact
                    icon={ClipboardList}
                    title="Tidak ada SO siap kirim"
                    message="Approve sales order dulu agar stok ter-reserve dan bisa dikirim."
                  />
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!selectedSo) return;
                      const fd = new FormData(e.currentTarget);
                      const items = selectedSo.items
                        .map((item) => {
                          const remaining = qty(item.quantity).minus(
                            qty(item.quantityDelivered),
                          );
                          const delivered =
                            qtyMap[item.productId] ?? remaining.toString();
                          return {
                            productId: item.productId,
                            quantityDelivered: delivered,
                          };
                        })
                        .filter((i) => Number(i.quantityDelivered) > 0);
                      if (!items.length) return;
                      mutation.mutate(
                        {
                          salesOrderId: selectedSo.id,
                          warehouseId: String(fd.get("warehouseId") ?? ""),
                          items,
                        },
                        {
                          onSuccess: () => {
                            setQtyMap({});
                            setShowPost(false);
                          },
                        },
                      );
                    }}
                  >
                    <FormGrid>
                      <Field label="Sales Order">
                        <Select
                          name="salesOrderId"
                          value={soId || openSos[0]?.id}
                          onChange={(e) => {
                            setSoId(e.target.value);
                            setQtyMap({});
                          }}
                        >
                          {openSos.map((so) => (
                            <option key={so.id} value={so.id}>
                              {so.number} — {so.customerName}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Gudang">
                        <Select
                          name="warehouseId"
                          required
                          defaultValue={
                            selectedSo?.warehouseId || data.warehouses[0]?.id
                          }
                        >
                          {data.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FormGrid>

                    {selectedSo ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-[#0F4C75]">
                          Item dikirim
                        </p>
                        {selectedSo.items.map((item) => {
                          const remaining = qty(item.quantity).minus(
                            qty(item.quantityDelivered),
                          );
                          return (
                            <div
                              key={item.productId}
                              className="grid gap-2 rounded-2xl border border-border/70 bg-[#f7fafc] p-3 sm:grid-cols-3"
                            >
                              <div className="text-sm sm:col-span-2">
                                <div className="font-medium text-[#0F4C75]">
                                  {item.sku} — {item.name}
                                </div>
                                <div className="text-xs text-muted">
                                  Sisa {remaining.toString()}
                                </div>
                              </div>
                              <Field label="Qty kirim">
                                <Input
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  max={remaining.toString()}
                                  value={
                                    qtyMap[item.productId] ??
                                    remaining.toString()
                                  }
                                  onChange={(e) =>
                                    setQtyMap((m) => ({
                                      ...m,
                                      [item.productId]: e.target.value,
                                    }))
                                  }
                                />
                              </Field>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <MutationError error={mutation.error} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={mutation.isPending}>
                        {mutation.isPending
                          ? "Memposting..."
                          : "Posting pengiriman"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowPost(false)}
                      >
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            ) : null}

            <Card
              title={`Riwayat delivery (${filtered.length}${
                filter !== "ALL" ? ` / ${deliveries.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    deliveriesPage.setPage(1);
                  }}
                  options={[
                    {
                      id: "ALL" as const,
                      label: "Semua",
                      count: stats.total,
                    },
                    {
                      id: "OPEN" as const,
                      label: "Belum invoice",
                      count: stats.notInvoiced,
                    },
                    {
                      id: "INVOICED" as const,
                      label: "Sudah invoice",
                      count: stats.invoiced,
                    },
                  ]}
                />
              </div>

              {deliveriesPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Truck}
                  title={
                    deliveries.length === 0
                      ? "Belum ada pengiriman"
                      : "Tidak ada di filter ini"
                  }
                  message={
                    deliveries.length === 0
                      ? openSos.length > 0
                        ? "Post delivery dari SO yang siap kirim."
                        : "Approve SO dulu, lalu posting pengiriman di sini."
                      : "Coba filter lain."
                  }
                  action={
                    deliveries.length === 0 && openSos.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowPost(true)}
                      >
                        Posting pengiriman
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
                      "Status",
                      "Invoice",
                      "Tanggal",
                      "Item",
                    ]}
                  >
                    {deliveriesPage.items.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {d.number}
                        </td>
                        <td className="px-3 py-2">{d.customer.name}</td>
                        <td className="px-3 py-2">
                          <Badge tone="success">{d.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={d.invoiced ? "success" : "warning"}>
                            {d.invoiced ? "Invoiced" : "Open"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(d.deliveryDate)}
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-muted">
                          {d.items
                            .map((i) => `${i.sku}×${i.quantityDelivered}`)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={deliveriesPage.page}
                    totalPages={deliveriesPage.totalPages}
                    total={deliveriesPage.total}
                    limit={deliveriesPage.limit}
                    onPageChange={deliveriesPage.setPage}
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
