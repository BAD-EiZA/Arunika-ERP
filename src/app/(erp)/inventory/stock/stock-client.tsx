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
  useOpeningStockMutation,
  useStockQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatIdr, qty } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  AlertTriangle,
  Boxes,
  Package,
  Plus,
  Search,
  Warehouse,
} from "lucide-react";

// ponytail: hard-coded low-stock ceiling; add company setting when multi-tenant thresholds needed
const LOW_STOCK = 5;

type StockFilter = "ALL" | "LOW" | "IN_STOCK" | "ZERO";

type BalanceRow = {
  id: string;
  quantityOnHand: string;
  quantityReserved: string;
  averageCost: string;
  product: { sku: string; name: string };
  warehouse: { code: string };
  availableStr: string;
  availableNum: number;
  isLow: boolean;
  isZero: boolean;
};

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

export function StockClient() {
  const query = useStockQuery();
  const opening = useOpeningStockMutation();
  const data = query.data;
  const [showOpening, setShowOpening] = useState(false);
  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [search, setSearch] = useState("");

  const enriched = useMemo((): BalanceRow[] => {
    return (data?.balances ?? []).map((b) => {
      const available = qty(b.quantityOnHand).minus(qty(b.quantityReserved));
      const availableNum = Number(available.toString()) || 0;
      return {
        ...b,
        availableStr: available.toString(),
        availableNum,
        isZero: availableNum <= 0,
        isLow: availableNum > 0 && availableNum <= LOW_STOCK,
      };
    });
  }, [data?.balances]);

  const stats = useMemo(() => {
    let low = 0;
    let zero = 0;
    let reservedTotal = 0;
    for (const b of enriched) {
      if (b.isLow) low += 1;
      if (b.isZero) zero += 1;
      reservedTotal += Number(qty(b.quantityReserved).toString()) || 0;
    }
    return {
      rows: enriched.length,
      low,
      zero,
      inStock: enriched.filter((b) => !b.isZero && !b.isLow).length,
      reservedTotal,
      warehouses: data?.warehouses.length ?? 0,
    };
  }, [enriched, data?.warehouses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((b) => {
      if (filter === "LOW" && !b.isLow) return false;
      if (filter === "ZERO" && !b.isZero) return false;
      if (filter === "IN_STOCK" && (b.isZero || b.isLow)) return false;
      if (!q) return true;
      return (
        b.product.sku.toLowerCase().includes(q) ||
        b.product.name.toLowerCase().includes(q) ||
        b.warehouse.code.toLowerCase().includes(q)
      );
    });
  }, [enriched, filter, search]);

  const balancesPage = useClientPage(filtered, 20);
  const movementsPage = useClientPage(data?.movements ?? [], 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Persediaan"
        description="Saldo multi-gudang, reserved, dan mutasi stok"
        actions={
          <Button
            type="button"
            onClick={() => setShowOpening((v) => !v)}
            variant={showOpening ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showOpening ? "Tutup form" : "Stok awal"}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat stok..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Baris saldo"
                value={stats.rows}
                icon={Package}
              />
              <StatCard
                label="Stok menipis"
                value={stats.low}
                icon={AlertTriangle}
                hint={`Available ≤ ${LOW_STOCK}`}
              />
              <StatCard
                label="Reserved"
                value={stats.reservedTotal}
                icon={Boxes}
                hint="Total unit reserved"
              />
              <StatCard
                label="Gudang"
                value={stats.warehouses}
                icon={Warehouse}
              />
            </div>

            {showOpening ? (
              <Card title="Stok awal / penyesuaian masuk">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    opening.mutate(body, {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setShowOpening(false);
                      },
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Gudang">
                      <Select
                        name="warehouseId"
                        required
                        defaultValue={data.warehouses[0]?.id}
                      >
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Produk">
                      <Select name="productId" required>
                        <option value="">Pilih produk</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Kuantitas">
                      <Input
                        name="quantity"
                        type="number"
                        step="0.0001"
                        required
                      />
                    </Field>
                    <Field label="Unit cost">
                      <Input
                        name="unitCost"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                      />
                    </Field>
                  </FormGrid>
                  <MutationError error={opening.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={opening.isPending}>
                      {opening.isPending
                        ? "Memposting..."
                        : "Posting stok awal"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowOpening(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            <Card
              title={`Saldo stok (${filtered.length}${
                filter !== "ALL" || search ? ` / ${enriched.length}` : ""
              })`}
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    balancesPage.setPage(1);
                  }}
                  options={[
                    {
                      id: "ALL" as const,
                      label: "Semua",
                      count: stats.rows,
                    },
                    {
                      id: "LOW" as const,
                      label: "Menipis",
                      count: stats.low,
                    },
                    {
                      id: "IN_STOCK" as const,
                      label: "Aman",
                      count: stats.inStock,
                    },
                    {
                      id: "ZERO" as const,
                      label: "Habis",
                      count: stats.zero,
                    },
                  ]}
                />
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <Input
                    className="pl-8"
                    placeholder="Cari SKU, nama, gudang..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      balancesPage.setPage(1);
                    }}
                  />
                </div>
              </div>

              {balancesPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Boxes}
                  title={
                    enriched.length === 0
                      ? "Belum ada saldo"
                      : "Tidak ada di filter ini"
                  }
                  message={
                    enriched.length === 0
                      ? "Posting stok awal atau terima barang untuk mengisi saldo."
                      : "Ubah filter atau kata kunci pencarian."
                  }
                  action={
                    enriched.length === 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowOpening(true)}
                      >
                        Stok awal
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "SKU",
                      "Produk",
                      "Gudang",
                      "On hand",
                      "Reserved",
                      "Available",
                      "Avg cost",
                    ]}
                  >
                    {balancesPage.items.map((b) => (
                      <tr
                        key={b.id}
                        className={cn(
                          b.isZero && "bg-slate-50/80",
                          b.isLow && "bg-amber-50/70",
                        )}
                      >
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {b.product.sku}
                        </td>
                        <td className="px-3 py-2">{b.product.name}</td>
                        <td className="px-3 py-2">{b.warehouse.code}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {qty(b.quantityOnHand).toString()}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {qty(b.quantityReserved).toString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "font-bold tabular-nums",
                                b.isZero
                                  ? "text-slate-500"
                                  : b.isLow
                                    ? "text-amber-700"
                                    : "text-[#0F4C75]",
                              )}
                            >
                              {b.availableStr}
                            </span>
                            {b.isLow ? <Badge tone="warning">Low</Badge> : null}
                            {b.isZero ? <Badge tone="danger">Habis</Badge> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(b.averageCost)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={balancesPage.page}
                    totalPages={balancesPage.totalPages}
                    total={balancesPage.total}
                    limit={balancesPage.limit}
                    onPageChange={balancesPage.setPage}
                  />
                </>
              )}
            </Card>

            <Card title={`Mutasi terbaru (${movementsPage.total})`}>
              {movementsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Boxes}
                  title="Belum ada mutasi"
                  message="Mutasi muncul setelah posting stok, SO, GR, atau penyesuaian."
                />
              ) : (
                <>
                  <Table
                    headers={["Waktu", "Tipe", "SKU", "Gudang", "Qty", "Ref"]}
                  >
                    {movementsPage.items.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2 text-xs text-muted">
                          {m.postedAt.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="px-3 py-2">
                          <Badge>{m.type}</Badge>
                        </td>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {m.product.sku}
                        </td>
                        <td className="px-3 py-2">{m.warehouse.code}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold">
                          {qty(m.quantity).toString()}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.referenceNumber || "—"}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={movementsPage.page}
                    totalPages={movementsPage.totalPages}
                    total={movementsPage.total}
                    limit={movementsPage.limit}
                    onPageChange={movementsPage.setPage}
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
