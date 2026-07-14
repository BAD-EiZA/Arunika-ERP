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
  useCreateSupplierBillMutation,
  useSupplierBillsQuery,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

export function SupplierBillsClient() {
  const query = useSupplierBillsQuery();
  const mutation = useCreateSupplierBillMutation();
  const data = query.data;
  const [lines, setLines] = useState<LineItemDraft[]>([]);

  useEffect(() => {
    if (data?.products?.length && lines.length === 0) {
      setLines(
        createInitialLines(
          data.products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            purchasePrice: p.purchasePrice,
          })),
          "buy",
        ),
      );
    }
  }, [data?.products, lines.length]);

  return (
    <div className="space-y-6">
      <PageHeader title="Tagihan pemasok" description="Multi-item · Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Buat tagihan">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const items = linesToPayload(lines).map((i) => ({
                    productId: i.productId,
                    description:
                      data.products.find((p) => p.id === i.productId)?.name ||
                      "Item",
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    taxAmount: i.taxAmount,
                  }));
                  if (!items.length) return;
                  mutation.mutate(
                    {
                      supplierId: String(fd.get("supplierId") ?? ""),
                      purchaseOrderId:
                        String(fd.get("purchaseOrderId") ?? "") || undefined,
                      supplierInvoiceNo:
                        String(fd.get("supplierInvoiceNo") ?? "") || undefined,
                      items,
                    },
                    {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setLines(
                          createInitialLines(
                            data.products.map((p) => ({
                              id: p.id,
                              sku: p.sku,
                              name: p.name,
                              purchasePrice: p.purchasePrice,
                            })),
                            "buy",
                          ),
                        );
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
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="PO (opsional)">
                    <Select name="purchaseOrderId" defaultValue="">
                      <option value="">—</option>
                      {data.purchaseOrders.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.number}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="No. invoice pemasok">
                    <Input name="supplierInvoiceNo" />
                  </Field>
                </FormGrid>

                <LineItemsEditor
                  products={data.products.map((p) => ({
                    id: p.id,
                    sku: p.sku,
                    name: p.name,
                    purchasePrice: p.purchasePrice,
                  }))}
                  mode="buy"
                  lines={lines}
                  onChange={setLines}
                />

                <MutationError error={mutation.error} />
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Menyimpan..." : "Simpan tagihan"}
                </Button>
              </form>
            </Card>

            <Card title="Daftar">
              {data.bills.length === 0 ? (
                <EmptyState message="Belum ada tagihan" />
              ) : (
                <Table
                  headers={[
                    "Nomor",
                    "Pemasok",
                    "Total",
                    "Saldo",
                    "Status",
                    "Tanggal",
                  ]}
                >
                  {data.bills.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">{b.number}</td>
                      <td className="px-3 py-2">{b.supplier.name}</td>
                      <td className="px-3 py-2">{formatIdr(b.total)}</td>
                      <td className="px-3 py-2">{formatIdr(b.balance)}</td>
                      <td className="px-3 py-2">
                        <Badge>{b.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(b.invoiceDate)}
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
