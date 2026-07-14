"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { apiGet, apiPost, formToObject } from "@/lib/api-client";

type WmsData = {
  bins: Array<{
    id: string;
    warehouseId: string;
    code: string;
    name: string;
    aisle: string | null;
  }>;
  balances: Array<{
    id: string;
    binCode: string;
    sku: string;
    quantity: string;
  }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  products: Array<{ id: string; sku: string; name: string }>;
};

export function WmsClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["wms"],
    queryFn: () => apiGet<WmsData>("/api/erp/wms"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/wms", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["wms"] });
    },
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader title="WMS lanjutan" description="Bin · putaway · pick" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Buat bin">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "bin",
                      ...formToObject(e.currentTarget),
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
                    <Field label="Kode bin">
                      <Input name="code" required placeholder="A-01-01" />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Aisle">
                      <Input name="aisle" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan bin
                  </Button>
                </form>
              </Card>
              <Card title="Putaway / Pick">
                <form
                  className="mb-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({ action: "putaway", ...body });
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
                    <Field label="Bin">
                      <Select name="binId" required>
                        {data.bins.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code}
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
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Putaway
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={mutation.isPending}
                      onClick={() => {
                        const binId = data.bins[0]?.id;
                        const productId = data.products[0]?.id;
                        if (!binId || !productId) return;
                        mutation.mutate({
                          action: "pick",
                          binId,
                          productId,
                          quantity: 1,
                        });
                      }}
                    >
                      Pick 1 (bin pertama)
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
            <Card title="Bin">
              {data.bins.length === 0 ? (
                <EmptyState message="Belum ada bin" />
              ) : (
                <Table headers={["Kode", "Nama", "Aisle"]}>
                  {data.bins.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">{b.code}</td>
                      <td className="px-3 py-2">{b.name}</td>
                      <td className="px-3 py-2">{b.aisle || "-"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Card title="Saldo bin">
              {data.balances.length === 0 ? (
                <EmptyState message="Belum ada saldo bin" />
              ) : (
                <Table headers={["Bin", "SKU", "Qty"]}>
                  {data.balances.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">{b.binCode}</td>
                      <td className="px-3 py-2">{b.sku}</td>
                      <td className="px-3 py-2">{b.quantity}</td>
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
