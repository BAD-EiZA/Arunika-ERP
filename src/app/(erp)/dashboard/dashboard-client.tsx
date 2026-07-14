"use client";

import Link from "next/link";
import {
  AppAlert,
  Badge,
  Card,
  EmptyState,
  StatCard,
  Table,
  Button,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useDashboardQuery } from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr, qty } from "@/lib/money";
import {
  ArrowRight,
  Boxes,
  Package,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";

const QUICK = [
  {
    href: "/master-data/products",
    label: "Produk",
    desc: "SKU & harga",
    icon: Package,
  },
  {
    href: "/sales/orders",
    label: "Sales Order",
    desc: "Pesanan jual",
    icon: ShoppingCart,
  },
  {
    href: "/procurement/purchase-orders",
    label: "Purchase Order",
    desc: "Pesanan beli",
    icon: Truck,
  },
  {
    href: "/inventory/stock",
    label: "Stok",
    desc: "On hand",
    icon: Boxes,
  },
  {
    href: "/crm",
    label: "CRM",
    desc: "Lead & pipeline",
    icon: Users,
  },
  {
    href: "/ai",
    label: "AI Insight",
    desc: "Forecast Gemini",
    icon: Sparkles,
  },
] as const;

export function DashboardClient() {
  const query = useDashboardQuery();
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-[#60241E] via-[#95271D] to-[#E77B49] p-5 text-[#fff5f0] shadow-sm md:p-7">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[#E77B49]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 size-48 rounded-full bg-[#B34A44]/20 blur-3xl" />
        <div className="relative mb-0 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#fff5f0] md:text-[1.7rem]">
              Dashboard
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[#ffd5c4]">
              {data
                ? `Role ${data.roleCode} · ringkasan operasional real-time`
                : "Memuat ringkasan perusahaan..."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/orders">
              <Button variant="primary">Buat SO</Button>
            </Link>
            <Link href="/procurement/purchase-orders">
              <Button variant="secondary">Buat PO</Button>
            </Link>
          </div>
        </div>
      </div>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <AppAlert
              status="accent"
              title="Ringkasan operasional"
              description="Data real-time dari modul stok, penjualan, dan pembelian."
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Produk" value={data.productCount} />
              <StatCard label="Pelanggan" value={data.customerCount} />
              <StatCard label="Pemasok" value={data.supplierCount} />
              <StatCard label="PO aktif" value={data.openPo} />
              <StatCard label="SO aktif" value={data.openSo} />
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Akses cepat
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {QUICK.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group rounded-xl border border-border/80 bg-surface/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                          <Icon className="size-5" />
                        </div>
                        <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-foreground">
                        {item.label}
                      </div>
                      <div className="text-xs text-muted">{item.desc}</div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Stok terbaru">
                {data.stockRows.length === 0 ? (
                  <EmptyState message="Belum ada saldo stok" />
                ) : (
                  <Table
                    headers={[
                      "SKU",
                      "Gudang",
                      "On hand",
                      "Reserved",
                      "Avg cost",
                    ]}
                  >
                    {data.stockRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 font-medium">
                          {row.product.sku}
                        </td>
                        <td className="px-3 py-2">{row.warehouse.code}</td>
                        <td className="px-3 py-2">
                          {qty(row.quantityOnHand).toString()}
                        </td>
                        <td className="px-3 py-2">
                          {qty(row.quantityReserved).toString()}
                        </td>
                        <td className="px-3 py-2">
                          {formatIdr(row.averageCost)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>

              <Card title="Piutang terbuka">
                {data.salesInvoices.length === 0 ? (
                  <EmptyState message="Tidak ada invoice terbuka" />
                ) : (
                  <Table
                    headers={["Nomor", "Jatuh tempo", "Saldo", "Status"]}
                  >
                    {data.salesInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-3 py-2 font-medium">{inv.number}</td>
                        <td className="px-3 py-2">
                          {formatDateId(inv.dueDate)}
                        </td>
                        <td className="px-3 py-2">
                          {formatIdr(inv.balance)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone="warning">{inv.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>

              <Card title="Utang terbuka" className="xl:col-span-2">
                {data.supplierBills.length === 0 ? (
                  <EmptyState message="Tidak ada tagihan terbuka" />
                ) : (
                  <Table
                    headers={["Nomor", "Jatuh tempo", "Saldo", "Status"]}
                  >
                    {data.supplierBills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="px-3 py-2 font-medium">{bill.number}</td>
                        <td className="px-3 py-2">
                          {formatDateId(bill.dueDate)}
                        </td>
                        <td className="px-3 py-2">
                          {formatIdr(bill.balance)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge>{bill.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </QueryBoundary>

      {query.isFetching && !query.isLoading ? (
        <p className="text-xs text-muted">Menyegarkan...</p>
      ) : null}
      <MutationError error={query.error} />
    </div>
  );
}
