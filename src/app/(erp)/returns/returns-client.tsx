"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  useReturnsMutation,
  useReturnsQuery,
} from "@/hooks/use-erp-queries";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type ReturnsData = {
  salesReturns: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    reason: string | null;
  }>;
  purchaseReturns: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
  }>;
  claims: Array<{
    id: string;
    number: string;
    claimType: string;
    status: string;
    amount: string;
    partnerName: string | null;
  }>;
  customers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    salePrice: string;
    purchasePrice: string;
  }>;
  warehouses: Array<{ id: string; code: string }>;
};

export function ReturnsClient() {
  const qc = useQueryClient();
  const query = useReturnsQuery();
  const mutation = useReturnsMutation();
  const cnQuery = useQuery({
    queryKey: ["credit-notes"],
    queryFn: () =>
      apiGet<{
        creditNotes: Array<{ id: string; number: string; total: string; status: string }>;
        debitNotes: Array<{ id: string; number: string; total: string; status: string }>;
        salesReturns: Array<{ id: string; number: string; total: string }>;
        purchaseReturns: Array<{ id: string; number: string; total: string }>;
      }>("/api/erp/credit-notes"),
  });
  const cnMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/credit-notes", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });
  const data = query.data as ReturnsData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Return & Claim" description="Fase 12" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Sales return">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
                      action: "sales_return",
                      customerId: body.customerId,
                      warehouseId: body.warehouseId,
                      reason: body.reason,
                      items: [
                        {
                          productId: body.productId,
                          quantity: body.quantity,
                          unitPrice: body.unitPrice,
                        },
                      ],
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Pelanggan">
                      <Select name="customerId" required>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
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
                    <Field label="Produk">
                      <Select name="productId" required>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty">
                      <Input name="quantity" type="number" step="0.0001" required />
                    </Field>
                    <Field label="Harga">
                      <Input name="unitPrice" type="number" step="0.01" required />
                    </Field>
                    <Field label="Alasan">
                      <Input name="reason" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Buat sales return
                  </Button>
                </form>
              </Card>

              <Card title="Purchase return">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
                      action: "purchase_return",
                      supplierId: body.supplierId,
                      warehouseId: body.warehouseId,
                      reason: body.reason,
                      items: [
                        {
                          productId: body.productId,
                          quantity: body.quantity,
                          unitCost: body.unitCost,
                        },
                      ],
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Pemasok">
                      <Select name="supplierId" required>
                        {data.suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
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
                    <Field label="Produk">
                      <Select name="productId" required>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty">
                      <Input name="quantity" type="number" step="0.0001" required />
                    </Field>
                    <Field label="Cost">
                      <Input name="unitCost" type="number" step="0.01" required />
                    </Field>
                  </FormGrid>
                  <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                    Buat purchase return
                  </Button>
                </form>
              </Card>
            </div>

            <Card title="Sales returns">
              {data.salesReturns.length === 0 ? (
                <EmptyState message="Belum ada sales return" />
              ) : (
                <Table headers={["Nomor", "Total", "Status", "Alasan", "Aksi"]}>
                  {data.salesReturns.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.number}</td>
                      <td className="px-3 py-2">{formatIdr(r.total)}</td>
                      <td className="px-3 py-2">
                        <Badge>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{r.reason || "-"}</td>
                      <td className="px-3 py-2">
                        {r.status !== "POSTED" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              mutation.mutate({
                                action: "post_sales_return",
                                id: r.id,
                                warehouseId: data.warehouses[0]?.id,
                              })
                            }
                          >
                            Post
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card title="Purchase returns">
              {data.purchaseReturns.length === 0 ? (
                <EmptyState message="Belum ada purchase return" />
              ) : (
                <Table headers={["Nomor", "Total", "Status", "Aksi"]}>
                  {data.purchaseReturns.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.number}</td>
                      <td className="px-3 py-2">{formatIdr(r.total)}</td>
                      <td className="px-3 py-2">
                        <Badge>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.status !== "POSTED" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              mutation.mutate({
                                action: "post_purchase_return",
                                id: r.id,
                                warehouseId: data.warehouses[0]?.id,
                              })
                            }
                          >
                            Post
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card title="Credit / Debit note (accounting)">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={cnMutation.isPending}
                  onClick={() => {
                    const id = cnQuery.data?.salesReturns[0]?.id;
                    if (!id) return;
                    cnMutation.mutate({
                      action: "from_sales_return",
                      salesReturnId: id,
                    });
                  }}
                >
                  CN dari sales return terbaru
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={cnMutation.isPending}
                  onClick={() => {
                    const id = cnQuery.data?.purchaseReturns[0]?.id;
                    if (!id) return;
                    cnMutation.mutate({
                      action: "from_purchase_return",
                      purchaseReturnId: id,
                    });
                  }}
                >
                  DN dari purchase return terbaru
                </Button>
              </div>
              <MutationError error={cnMutation.error} />
              <Table headers={["Tipe", "Nomor", "Total", "Status"]}>
                {(cnQuery.data?.creditNotes || []).map((n) => (
                  <tr key={n.id}>
                    <td className="px-3 py-2">CN</td>
                    <td className="px-3 py-2">{n.number}</td>
                    <td className="px-3 py-2">{formatIdr(n.total)}</td>
                    <td className="px-3 py-2">
                      <Badge>{n.status}</Badge>
                    </td>
                  </tr>
                ))}
                {(cnQuery.data?.debitNotes || []).map((n) => (
                  <tr key={n.id}>
                    <td className="px-3 py-2">DN</td>
                    <td className="px-3 py-2">{n.number}</td>
                    <td className="px-3 py-2">{formatIdr(n.total)}</td>
                    <td className="px-3 py-2">
                      <Badge>{n.status}</Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card title="Claim">
              <form
                className="mb-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate({
                    action: "claim",
                    ...formToObject(e.currentTarget),
                  });
                }}
              >
                <FormGrid>
                  <Field label="Tipe">
                    <Select name="claimType" defaultValue="CUSTOMER">
                      <option value="CUSTOMER">Customer</option>
                      <option value="SUPPLIER">Supplier</option>
                      <option value="WARRANTY">Warranty</option>
                    </Select>
                  </Field>
                  <Field label="Partner">
                    <Input name="partnerName" />
                  </Field>
                  <Field label="Jumlah">
                    <Input name="amount" type="number" step="0.01" required />
                  </Field>
                  <Field label="Alasan">
                    <Input name="reason" />
                  </Field>
                </FormGrid>
                <Button type="submit" disabled={mutation.isPending}>
                  Buat claim
                </Button>
              </form>
              {data.claims.length === 0 ? (
                <EmptyState message="Belum ada claim" />
              ) : (
                <Table headers={["Nomor", "Tipe", "Partner", "Jumlah", "Status"]}>
                  {data.claims.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2">{c.number}</td>
                      <td className="px-3 py-2">{c.claimType}</td>
                      <td className="px-3 py-2">{c.partnerName || "-"}</td>
                      <td className="px-3 py-2">{formatIdr(c.amount)}</td>
                      <td className="px-3 py-2">
                        <Badge>{c.status}</Badge>
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
