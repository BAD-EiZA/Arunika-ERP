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
  useGoodsReceiptsQuery,
  usePostGoodsReceiptMutation,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { qty } from "@/lib/money";
import {
  Building2,
  ClipboardList,
  PackageCheck,
  Plus,
  Truck,
} from "lucide-react";

export function GoodsReceiptsClient() {
  const query = useGoodsReceiptsQuery();
  const mutation = usePostGoodsReceiptMutation();
  const data = query.data;
  const [showPost, setShowPost] = useState(false);
  const [poId, setPoId] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});

  const openPos = data?.openPos ?? [];
  const receipts = data?.receipts ?? [];
  const openPosKey = openPos.map((p) => p.id).join("|");

  const selectedPo = useMemo(() => {
    if (!data?.openPos?.length) return undefined;
    const id = poId || data.openPos[0]?.id;
    return data.openPos.find((p) => p.id === id);
  }, [data, poId, openPosKey]);

  const stats = useMemo(() => {
    const suppliers = new Set(receipts.map((r) => r.supplier.name)).size;
    return {
      ready: openPos.length,
      total: receipts.length,
      suppliers,
    };
  }, [openPos, receipts]);

  const receiptsPage = useClientPage(receipts, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Penerimaan barang"
        description="Post GR dari PO approved · multi-item"
        actions={
          <Button
            type="button"
            onClick={() => setShowPost((v) => !v)}
            variant={showPost ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showPost ? "Tutup form" : "Posting GR"}
            {openPos.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {openPos.length}
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
        loadingLabel="Memuat penerimaan..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="PO siap terima"
                value={stats.ready}
                icon={ClipboardList}
                hint="Open purchase orders"
              />
              <StatCard
                label="GR tercatat"
                value={stats.total}
                icon={PackageCheck}
              />
              <StatCard
                label="Pemasok (riwayat)"
                value={stats.suppliers}
                icon={Building2}
              />
            </div>

            {showPost ? (
              <Card title="Posting GR">
                {openPos.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Truck}
                    title="Tidak ada PO siap diterima"
                    message="Approve purchase order dulu agar barang bisa diterima."
                  />
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!selectedPo) return;
                      const fd = new FormData(e.currentTarget);
                      const items = selectedPo.items
                        .map((item) => {
                          const remaining = qty(item.quantity).minus(
                            qty(item.quantityReceived),
                          );
                          const received =
                            qtyMap[item.productId] ?? remaining.toString();
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
                            String(fd.get("supplierDeliveryNote") ?? "") ||
                            undefined,
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
                      <Field label="PO">
                        <Select
                          name="purchaseOrderId"
                          value={poId || openPos[0]?.id}
                          onChange={(e) => {
                            setPoId(e.target.value);
                            setQtyMap({});
                          }}
                        >
                          {openPos.map((po) => (
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
                        <p className="text-sm font-semibold text-[#0F4C75]">
                          Item diterima
                        </p>
                        {selectedPo.items.map((item) => {
                          const remaining = qty(item.quantity).minus(
                            qty(item.quantityReceived),
                          );
                          return (
                            <div
                              key={item.productId}
                              className="grid gap-2 rounded-2xl border border-border/70 bg-[#f7fafc] p-3 sm:grid-cols-4"
                            >
                              <div className="text-sm sm:col-span-2">
                                <div className="font-medium text-[#0F4C75]">
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
                              <div className="self-end pb-2 text-xs text-muted">
                                Cost {item.unitPrice}
                              </div>
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
                          : "Posting penerimaan"}
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

            <Card title={`Riwayat GR (${receiptsPage.total})`}>
              {receiptsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={PackageCheck}
                  title="Belum ada penerimaan"
                  message={
                    openPos.length > 0
                      ? "Post GR dari PO yang siap diterima."
                      : "Approve PO dulu, lalu posting penerimaan di sini."
                  }
                  action={
                    openPos.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowPost(true)}
                      >
                        Posting GR
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
                      "Status",
                      "Tanggal",
                      "Item",
                    ]}
                  >
                    {receiptsPage.items.map((gr) => (
                      <tr key={gr.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {gr.number}
                        </td>
                        <td className="px-3 py-2">{gr.supplier.name}</td>
                        <td className="px-3 py-2">
                          <Badge tone="success">{gr.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(gr.receiptDate)}
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-muted">
                          {gr.items
                            .map((i) => `${i.sku}×${i.quantityReceived}`)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={receiptsPage.page}
                    totalPages={receiptsPage.totalPages}
                    total={receiptsPage.total}
                    limit={receiptsPage.limit}
                    onPageChange={receiptsPage.setPage}
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
