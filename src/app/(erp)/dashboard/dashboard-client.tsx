"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListPageShell,
  SectionLabel,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  ArApCompare,
  DonutChart,
  GroupedBarChart,
  HorizontalBarChart,
} from "@/components/dashboard-charts";
import { useDashboardQuery } from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr, qty } from "@/lib/money";
import {
  ArrowRight,
  Boxes,
  Building2,
  FileText,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Wallet,
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
    <ListPageShell>
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1B262C] via-[#0F4C75] to-[#3282B8] p-6 text-[#BBE1FA] shadow-[0_16px_48px_rgba(15,76,117,0.2)] md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[#BBE1FA]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 size-48 rounded-full bg-[#3282B8]/25 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-[1.85rem]">
              Dashboard
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[#BBE1FA]/80">
              {data
                ? `Role ${data.roleCode} · ringkasan + chart real-time`
                : "Memuat ringkasan perusahaan..."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/orders">
              <Button
                variant="primary"
                className="bg-white text-[#0F4C75] hover:bg-[#BBE1FA]"
              >
                Buat SO
              </Button>
            </Link>
            <Link href="/procurement/purchase-orders">
              <Button
                variant="secondary"
                className="border-white/30 bg-white/10 text-white hover:bg-white/15"
              >
                Buat PO
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat dashboard..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Produk"
                value={data.productCount}
                icon={Package}
              />
              <StatCard
                label="Pelanggan"
                value={data.customerCount}
                icon={Users}
              />
              <StatCard
                label="Pemasok"
                value={data.supplierCount}
                icon={Building2}
              />
              <StatCard
                label="PO aktif"
                value={data.openPo}
                icon={Truck}
                hint="Open purchase orders"
              />
              <StatCard
                label="SO aktif"
                value={data.openSo}
                icon={ShoppingCart}
                hint="Open sales orders"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Total piutang (AR)"
                value={formatIdr(data.arTotal ?? 0)}
                icon={Wallet}
                className="sm:col-span-1"
              />
              <StatCard
                label="Total utang (AP)"
                value={formatIdr(data.apTotal ?? 0)}
                icon={FileText}
              />
            </div>

            <div>
              <SectionLabel>Analitik</SectionLabel>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Penjualan vs pembelian (6 bln)">
                  <GroupedBarChart
                    labels={data.charts.months}
                    seriesA={data.charts.salesByMonth.map((x) => x.value)}
                    seriesB={data.charts.purchaseByMonth.map((x) => x.value)}
                  />
                </Card>

                <Card title="Piutang vs utang">
                  <ArApCompare
                    ar={Number(data.arTotal ?? 0)}
                    ap={Number(data.apTotal ?? 0)}
                  />
                </Card>

                <Card title="Status SO (6 bln)">
                  {data.charts.soStatus.length === 0 ? (
                    <EmptyState
                      compact
                      title="Belum ada SO"
                      message="Buat sales order untuk melihat distribusi status."
                    />
                  ) : (
                    <DonutChart
                      items={data.charts.soStatus}
                      centerLabel="SO"
                      centerValue={String(
                        data.charts.soStatus.reduce((a, b) => a + b.value, 0),
                      )}
                    />
                  )}
                </Card>

                <Card title="Status PO (6 bln)">
                  {data.charts.poStatus.length === 0 ? (
                    <EmptyState
                      compact
                      title="Belum ada PO"
                      message="Buat purchase order untuk melihat distribusi status."
                    />
                  ) : (
                    <DonutChart
                      items={data.charts.poStatus}
                      centerLabel="PO"
                      centerValue={String(
                        data.charts.poStatus.reduce((a, b) => a + b.value, 0),
                      )}
                    />
                  )}
                </Card>

                <Card title="Nilai stok (top SKU)">
                  <HorizontalBarChart
                    items={data.charts.stockValue.map((s) => ({
                      label: s.label,
                      value: s.value,
                      sub: `qty ${s.qty}`,
                    }))}
                  />
                </Card>

                <Card title="Komposisi master">
                  <DonutChart
                    items={data.charts.mix}
                    centerLabel="entitas"
                    centerValue={String(
                      data.charts.mix.reduce((a, b) => a + b.value, 0),
                    )}
                  />
                </Card>
              </div>
            </div>

            <div>
              <SectionLabel>Akses cepat</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {QUICK.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-[0_2px_8px_rgba(15,76,117,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-[#0F4C75]/25 hover:shadow-[0_8px_24px_rgba(15,76,117,0.08)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#E8F4FC] text-[#0F4C75] transition group-hover:bg-[#0F4C75] group-hover:text-white">
                          <Icon className="size-5" />
                        </div>
                        <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-[#0F4C75]" />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-[#0F4C75]">
                        {item.label}
                      </div>
                      <div className="text-xs text-muted">{item.desc}</div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <SectionLabel>Operasional terkini</SectionLabel>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Stok terbaru">
                  {data.stockRows.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Boxes}
                      title="Belum ada saldo stok"
                      message="Saldo muncul setelah penerimaan atau penyesuaian."
                      action={
                        <Link href="/inventory/stock">
                          <Button variant="secondary">Buka stok</Button>
                        </Link>
                      }
                    />
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
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {row.product.sku}
                          </td>
                          <td className="px-3 py-2">{row.warehouse.code}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {qty(row.quantityOnHand).toString()}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {qty(row.quantityReserved).toString()}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(row.averageCost)}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Card>

                <Card title="Piutang terbuka">
                  {data.salesInvoices.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Wallet}
                      title="Tidak ada invoice terbuka"
                      message="Invoice dengan saldo akan tampil di sini."
                      action={
                        <Link href="/sales/invoices">
                          <Button variant="secondary">Lihat invoice</Button>
                        </Link>
                      }
                    />
                  ) : (
                    <Table
                      headers={["Nomor", "Jatuh tempo", "Saldo", "Status"]}
                    >
                      {data.salesInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {inv.number}
                          </td>
                          <td className="px-3 py-2">
                            {formatDateId(inv.dueDate)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
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
                    <EmptyState
                      compact
                      icon={FileText}
                      title="Tidak ada tagihan terbuka"
                      message="Tagihan pemasok dengan saldo akan tampil di sini."
                      action={
                        <Link href="/procurement/bills">
                          <Button variant="secondary">Lihat tagihan</Button>
                        </Link>
                      }
                    />
                  ) : (
                    <Table
                      headers={["Nomor", "Jatuh tempo", "Saldo", "Status"]}
                    >
                      {data.supplierBills.map((bill) => (
                        <tr key={bill.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {bill.number}
                          </td>
                          <td className="px-3 py-2">
                            {formatDateId(bill.dueDate)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
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
            </div>
          </>
        ) : null}
      </QueryBoundary>

      {query.isFetching && !query.isLoading ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <RefreshCw className="size-3 animate-spin" />
          Menyegarkan data…
        </p>
      ) : null}
      <MutationError error={query.error} />
    </ListPageShell>
  );
}
