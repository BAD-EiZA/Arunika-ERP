"use client";

import {
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  PaginationBar,
  Select,
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

export function StockClient() {
  const query = useStockQuery();
  const opening = useOpeningStockMutation();
  const data = query.data;
  const balancesPage = useClientPage(data?.balances ?? [], 20);
  const movementsPage = useClientPage(data?.movements ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Persediaan"
        description="Saldo & mutasi via TanStack Query"
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Stok awal / penyesuaian masuk">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = formToObject(e.currentTarget);
                  opening.mutate(body, {
                    onSuccess: () => e.currentTarget.reset(),
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
                <Button type="submit" disabled={opening.isPending}>
                  {opening.isPending ? "Memposting..." : "Posting stok awal"}
                </Button>
              </form>
            </Card>

            <Card title={`Saldo stok (${balancesPage.total})`}>
              {balancesPage.total === 0 ? (
                <EmptyState message="Belum ada saldo" />
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
                    {balancesPage.items.map((b) => {
                      const available = qty(b.quantityOnHand).minus(
                        qty(b.quantityReserved),
                      );
                      return (
                        <tr key={b.id}>
                          <td className="px-3 py-2">{b.product.sku}</td>
                          <td className="px-3 py-2">{b.product.name}</td>
                          <td className="px-3 py-2">{b.warehouse.code}</td>
                          <td className="px-3 py-2">
                            {qty(b.quantityOnHand).toString()}
                          </td>
                          <td className="px-3 py-2">
                            {qty(b.quantityReserved).toString()}
                          </td>
                          <td className="px-3 py-2">{available.toString()}</td>
                          <td className="px-3 py-2">
                            {formatIdr(b.averageCost)}
                          </td>
                        </tr>
                      );
                    })}
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
                <EmptyState message="Belum ada mutasi" />
              ) : (
                <>
                  <Table
                    headers={["Waktu", "Tipe", "SKU", "Gudang", "Qty", "Ref"]}
                  >
                    {movementsPage.items.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2">
                          {m.postedAt.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="px-3 py-2">{m.type}</td>
                        <td className="px-3 py-2">{m.product.sku}</td>
                        <td className="px-3 py-2">{m.warehouse.code}</td>
                        <td className="px-3 py-2">
                          {qty(m.quantity).toString()}
                        </td>
                        <td className="px-3 py-2">
                          {m.referenceNumber || "-"}
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
    </div>
  );
}
