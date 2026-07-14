"use client";

import { useMemo, useState } from "react";
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
  PaginationBar,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type PosData = {
  sessions: Array<{
    id: string;
    status: string;
    cashierName: string | null;
    orderCount: number;
    orders: Array<{ id: string; number: string; total: string; paymentMethod: string }>;
  }>;
  products: Array<{ id: string; sku: string; name: string; salePrice: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
};

export function PosClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["pos"],
    queryFn: () => apiGet<PosData>("/api/erp/pos"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/pos", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pos"] });
    },
  });
  const data = query.data;
  const openSession = useMemo(
    () => data?.sessions.find((s) => s.status === "OPEN"),
    [data?.sessions],
  );
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const ordersPage = useClientPage(openSession?.orders ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="POS" description="Sesi kasir + order stok" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Sesi">
              {openSession ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="success">OPEN · {openSession.cashierName}</Badge>
                  <span className="text-sm text-muted">
                    {openSession.orderCount} order
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      mutation.mutate({
                        action: "close",
                        sessionId: openSession.id,
                        closingCash: 0,
                      })
                    }
                  >
                    Tutup sesi
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    mutation.mutate({
                      action: "open",
                      warehouseId: String(fd.get("warehouseId") ?? ""),
                      cashierName: String(fd.get("cashierName") ?? ""),
                      openingCash: String(fd.get("openingCash") ?? "0"),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Gudang">
                      <Select name="warehouseId" required defaultValue={data.warehouses[0]?.id}>
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Kasir">
                      <Input name="cashierName" placeholder="Nama kasir" />
                    </Field>
                    <Field label="Kas awal">
                      <Input name="openingCash" type="number" defaultValue="0" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Buka sesi
                  </Button>
                </form>
              )}
            </Card>

            <Card title="Transaksi POS">
              {!openSession ? (
                <EmptyState message="Buka sesi dulu" />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const p =
                      data.products.find((x) => x.id === productId) ||
                      data.products[0];
                    if (!p) return;
                    mutation.mutate({
                      action: "order",
                      sessionId: openSession.id,
                      warehouseId: data.warehouses[0]?.id,
                      paymentMethod: "CASH",
                      items: [
                        {
                          productId: p.id,
                          quantity: qty,
                          unitPrice: p.salePrice,
                        },
                      ],
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Produk">
                      <Select
                        value={productId || data.products[0]?.id}
                        onChange={(e) => setProductId(e.target.value)}
                      >
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {formatIdr(p.salePrice)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty">
                      <Input
                        type="number"
                        step="0.0001"
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                      />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Bayar & post stok
                  </Button>
                </form>
              )}
            </Card>

            <Card title={`Order sesi terbuka (${ordersPage.total})`}>
              {ordersPage.total === 0 ? (
                <EmptyState message="Belum ada order" />
              ) : (
                <>
                  <Table headers={["Nomor", "Total", "Metode"]}>
                    {ordersPage.items.map((o) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2">{o.number}</td>
                        <td className="px-3 py-2">{formatIdr(o.total)}</td>
                        <td className="px-3 py-2">{o.paymentMethod}</td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={ordersPage.page}
                    totalPages={ordersPage.totalPages}
                    total={ordersPage.total}
                    limit={ordersPage.limit}
                    onPageChange={ordersPage.setPage}
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
