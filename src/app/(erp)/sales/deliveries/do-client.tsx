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
  PageHeader,
  PaginationBar,
  Select,
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

export function DeliveriesClient() {
  const query = useDeliveriesQuery();
  const mutation = usePostDeliveryMutation();
  const data = query.data;
  const [soId, setSoId] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});

  const selectedSo = useMemo(
    () => data?.openSos.find((s) => s.id === (soId || data.openSos[0]?.id)),
    [data?.openSos, soId],
  );
  const deliveriesPage = useClientPage(data?.deliveries ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Pengiriman" description="Multi-item · Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Posting delivery">
              {data.openSos.length === 0 ? (
                <EmptyState message="Tidak ada SO siap kirim" />
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
                      { onSuccess: () => setQtyMap({}) },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Sales Order">
                      <Select
                        name="salesOrderId"
                        value={soId || data.openSos[0]?.id}
                        onChange={(e) => {
                          setSoId(e.target.value);
                          setQtyMap({});
                        }}
                      >
                        {data.openSos.map((so) => (
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
                      <p className="text-sm font-medium">Item dikirim</p>
                      {selectedSo.items.map((item) => {
                        const remaining = qty(item.quantity).minus(
                          qty(item.quantityDelivered),
                        );
                        return (
                          <div
                            key={item.productId}
                            className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3"
                          >
                            <div className="text-sm sm:col-span-2">
                              <div className="font-medium">
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
                                  qtyMap[item.productId] ?? remaining.toString()
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
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Memposting..." : "Posting pengiriman"}
                  </Button>
                </form>
              )}
            </Card>

            <Card title={`Riwayat (${deliveriesPage.total})`}>
              {deliveriesPage.total === 0 ? (
                <EmptyState message="Belum ada pengiriman" />
              ) : (
                <>
                  <Table headers={["Nomor", "Pelanggan", "Status", "Tanggal", "Item"]}>
                    {deliveriesPage.items.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">{d.number}</td>
                        <td className="px-3 py-2">{d.customer.name}</td>
                        <td className="px-3 py-2">
                          <Badge tone="success">{d.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(d.deliveryDate)}
                        </td>
                        <td className="px-3 py-2 text-xs">
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
    </div>
  );
}
