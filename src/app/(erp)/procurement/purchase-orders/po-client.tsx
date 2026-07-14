"use client";

import { useEffect, useState } from "react";
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
  createInitialLines,
  LineItemsEditor,
  linesToPayload,
  type LineItemDraft,
} from "@/components/line-items-editor";
import {
  usePurchaseOrderMutation,
  usePurchaseOrdersQuery,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

export function PurchaseOrdersClient() {
  const query = usePurchaseOrdersQuery();
  const mutation = usePurchaseOrderMutation();
  const data = query.data;
  const [lines, setLines] = useState<LineItemDraft[]>([]);

  useEffect(() => {
    if (data?.products?.length && lines.length === 0) {
      setLines(createInitialLines(data.products, "buy"));
    }
  }, [data?.products, lines.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Order"
        description="Multi-item · TanStack Query"
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Buat PO">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const items = linesToPayload(lines);
                  if (!items.length) return;
                  mutation.mutate(
                    {
                      action: "create",
                      supplierId: String(fd.get("supplierId") ?? ""),
                      warehouseId: String(fd.get("warehouseId") ?? "") || undefined,
                      branchId: String(fd.get("branchId") ?? "") || undefined,
                      notes: String(fd.get("notes") ?? "") || undefined,
                      items,
                    },
                    {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setLines(createInitialLines(data.products, "buy"));
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
                          {s.code} — {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Gudang">
                    <Select name="warehouseId" defaultValue={data.warehouses[0]?.id}>
                      {data.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cabang">
                    <Select name="branchId" defaultValue={data.branches[0]?.id}>
                      {data.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Catatan">
                    <Input name="notes" />
                  </Field>
                </FormGrid>

                <LineItemsEditor
                  products={data.products}
                  mode="buy"
                  lines={lines}
                  onChange={setLines}
                />

                <MutationError error={mutation.error} />
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Menyimpan..." : "Buat draft PO"}
                </Button>
              </form>
            </Card>

            <Card title="Daftar PO">
              {data.orders.length === 0 ? (
                <EmptyState message="Belum ada PO" />
              ) : (
                <Table
                  headers={["Nomor", "Pemasok", "Item", "Total", "Status", "Tanggal", "Aksi"]}
                >
                  {data.orders.map((po) => (
                    <tr key={po.id}>
                      <td className="px-3 py-2 font-medium">
                        <a
                          className="text-accent underline"
                          href={`/api/erp/pdf/po/${po.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {po.number}
                        </a>
                      </td>
                      <td className="px-3 py-2">{po.supplier.name}</td>
                      <td className="px-3 py-2 text-xs">
                        {po.items.map((i) => `${i.sku}×${i.quantity}`).join(", ")}
                      </td>
                      <td className="px-3 py-2">{formatIdr(po.total)}</td>
                      <td className="px-3 py-2">
                        <Badge>{po.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{formatDateId(po.orderDate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {po.status === "DRAFT" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ action: "submit", id: po.id })
                              }
                            >
                              Submit
                            </Button>
                          ) : null}
                          {["DRAFT", "PENDING_APPROVAL"].includes(po.status) ? (
                            <Button
                              type="button"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ action: "approve", id: po.id })
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                        </div>
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
