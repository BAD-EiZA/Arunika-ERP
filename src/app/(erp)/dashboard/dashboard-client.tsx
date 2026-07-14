"use client";

import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useDashboardQuery } from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr, qty } from "@/lib/money";

export function DashboardClient() {
  const query = useDashboardQuery();
  const data = query.data;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          data
            ? `Role ${data.roleCode} · data via TanStack Query`
            : "Memuat ringkasan perusahaan..."
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Produk" value={data.productCount} />
              <StatCard label="Pelanggan" value={data.customerCount} />
              <StatCard label="Pemasok" value={data.supplierCount} />
              <StatCard label="PO aktif" value={data.openPo} />
              <StatCard label="SO aktif" value={data.openSo} />
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <Card title="Stok terbaru">
                {data.stockRows.length === 0 ? (
                  <EmptyState message="Belum ada saldo stok" />
                ) : (
                  <Table
                    headers={["SKU", "Gudang", "On hand", "Reserved", "Avg cost"]}
                  >
                    {data.stockRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">{row.product.sku}</td>
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
                  <Table headers={["Nomor", "Jatuh tempo", "Saldo", "Status"]}>
                    {data.salesInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-3 py-2">{inv.number}</td>
                        <td className="px-3 py-2">
                          {formatDateId(inv.dueDate)}
                        </td>
                        <td className="px-3 py-2">{formatIdr(inv.balance)}</td>
                        <td className="px-3 py-2">
                          <Badge tone="warning">{inv.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>

              <Card title="Utang terbuka">
                {data.supplierBills.length === 0 ? (
                  <EmptyState message="Tidak ada tagihan terbuka" />
                ) : (
                  <Table headers={["Nomor", "Jatuh tempo", "Saldo", "Status"]}>
                    {data.supplierBills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="px-3 py-2">{bill.number}</td>
                        <td className="px-3 py-2">
                          {formatDateId(bill.dueDate)}
                        </td>
                        <td className="px-3 py-2">{formatIdr(bill.balance)}</td>
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
        <p className="mt-3 text-xs text-muted">Menyegarkan...</p>
      ) : null}
      <MutationError error={query.error} />
    </div>
  );
}
