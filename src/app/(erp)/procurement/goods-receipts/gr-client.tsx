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
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useGoodsReceiptsQuery,
  usePostGoodsReceiptMutation,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { qty } from "@/lib/money";

export function GoodsReceiptsClient() {
  const query = useGoodsReceiptsQuery();
  const mutation = usePostGoodsReceiptMutation();
  const data = query.data;
  const [poId, setPoId] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});

  const selectedPo = useMemo(
    () => data?.openPos.find((p) => p.id === (poId || data.openPos[0]?.id)),
    [data?.openPos, poId],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Penerimaan barang" description="Multi-item · Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Posting GR">
              {data.openPos.length === 0 ? (
                <EmptyState message="Tidak ada PO siap diterima" />
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selectedPo) return;
                    const fd = new FormData(e.currentTarget);
                    const items = selectedPo.items
                      .map((item) => {
                        const received =
                          qtyMap[item.productId] ??
                          qty(item.quantity).minus(qty(item.quantityReceived)).toString();
                        return {
                          productId: item.productId,
                          quantityReceived: received,
                          unitCost: item.unitPrice,
                        };
                      })
                      .filter((i) => Number(i.quantityReceived) > 0);
                    if (!items.length) return;
                    mutation.mutate(
                      {
                        purchaseOrderId: selectedPo.id,
                        warehouseId: String(fd.get("warehouseId") ?? ""),
                        supplierDeliveryNote:
                          String(fd.get("supplierDeliveryNote") ?? "") || undefined,
                        items,
                      },
                      {
                        onSuccess: () => setQtyMap({}),
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="PO">
                      <Select
                        name="purchaseOrderId"
                        value={poId || data.openPos[0]?.id}
                        onChange={(e) => {
                          setPoId(e.target.value);
                          setQtyMap({});
                        }}
                      >
                        {data.openPos.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.number} — {po.supplierName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Gudang">
                      <Select
                        name="warehouseId"
                        required
                        defaultValue={
                          selectedPo?.warehouseId || data.warehouses[0]?.id
                        }
                      >
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Surat jalan">
                      <Input name="supplierDeliveryNote" />
                    </Field>
                  </FormGrid>

                  {selectedPo ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Item diterima</p>
                      {selectedPo.items.map((item) => {
                        const remaining = qty(item.quantity).minus(
                          qty(item.quantityReceived),
                        );
                        return (
                          <div
                            key={item.productId}
                            className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-4"
                          >
                            <div className="text-sm sm:col-span-2">
                              <div className="font-medium">
                                {item.sku} — {item.name}
                              </div>
                              <div className="text-xs text-muted">
                                Sisa {remaining.toString()}
                              </div>
                            </div>
                            <Field label="Qty diterima">
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
                            <div className="text-xs text-muted self-end pb-2">
                              Cost {item.unitPrice}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Memposting..." : "Posting penerimaan"}
                  </Button>
                </form>
              )}
            </Card>

            <Card title="Riwayat GR">
              {data.receipts.length === 0 ? (
                <EmptyState message="Belum ada penerimaan" />
              ) : (
                <Table headers={["Nomor", "Pemasok", "Status", "Tanggal", "Item"]}>
                  {data.receipts.map((gr) => (
                    <tr key={gr.id}>
                      <td className="px-3 py-2">{gr.number}</td>
                      <td className="px-3 py-2">{gr.supplier.name}</td>
                      <td className="px-3 py-2">
                        <Badge tone="success">{gr.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(gr.receiptDate)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {gr.items
                          .map((i) => `${i.sku}×${i.quantityReceived}`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
