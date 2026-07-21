"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import {
  Boxes,
  MapPin,
  Package,
  Plus,
  Warehouse,
} from "lucide-react";

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

type FormMode = "none" | "bin" | "move";

export function WmsClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["wms"],
    queryFn: () => apiGet<WmsData>("/api/erp/wms"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/wms", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["wms"] });
    },
  });
  const data = query.data;
  const [formMode, setFormMode] = useState<FormMode>("none");

  const bins = data?.bins ?? [];
  const balances = data?.balances ?? [];
  const binsPage = useClientPage(bins, 20);
  const balancesPage = useClientPage(balances, 20);

  const stats = useMemo(() => {
    let qty = 0;
    for (const b of balances) {
      qty += Number(b.quantity) || 0;
    }
    return {
      bins: bins.length,
      balances: balances.length,
      warehouses: data?.warehouses.length ?? 0,
      qty,
    };
  }, [bins, balances, data?.warehouses]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="WMS lanjutan"
        description="Bin · putaway · pick"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "move" ? "primary" : "secondary"}
              onClick={() => toggle("move")}
            >
              <Package className="mr-1.5 size-4" />
              Putaway / Pick
            </Button>
            <Button
              type="button"
              variant={formMode === "bin" ? "secondary" : "primary"}
              onClick={() => toggle("bin")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "bin" ? "Tutup" : "Buat bin"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat WMS..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Gudang"
                value={stats.warehouses}
                icon={Warehouse}
              />
              <StatCard label="Bin" value={stats.bins} icon={MapPin} />
              <StatCard
                label="Saldo bin"
                value={stats.balances}
                icon={Boxes}
              />
              <StatCard
                label="Qty di bin"
                value={stats.qty}
                icon={Package}
              />
            </div>

            {formMode === "bin" ? (
              <Card title="Buat bin">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "bin",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
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
                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan bin
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {formMode === "move" ? (
              <Card title="Putaway / Pick">
                {bins.length === 0 ? (
                  <EmptyState
                    compact
                    icon={MapPin}
                    title="Belum ada bin"
                    message="Buat bin dulu sebelum putaway."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("bin")}
                      >
                        Buat bin
                      </Button>
                    }
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = formToObject(e.currentTarget);
                      mutation.mutate(
                        { action: "putaway", ...body },
                        { onSuccess: () => setFormMode("none") },
                      );
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
                        <Input
                          name="quantity"
                          type="number"
                          step="0.0001"
                          required
                        />
                      </Field>
                    </FormGrid>
                    <MutationError error={mutation.error} />
                    <div className="flex flex-wrap gap-2">
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
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setFormMode("none")}
                      >
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            ) : null}

            <Card title={`Bin (${binsPage.total})`}>
              {binsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={MapPin}
                  title="Belum ada bin"
                  message="Buat lokasi bin di gudang untuk putaway/pick."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("bin")}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Buat bin
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table headers={["Kode", "Nama", "Aisle"]}>
                    {binsPage.items.map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {b.code}
                        </td>
                        <td className="px-3 py-2">{b.name}</td>
                        <td className="px-3 py-2">{b.aisle || "—"}</td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={binsPage.page}
                    totalPages={binsPage.totalPages}
                    total={binsPage.total}
                    limit={binsPage.limit}
                    onPageChange={binsPage.setPage}
                  />
                </>
              )}
            </Card>

            <Card title={`Saldo bin (${balancesPage.total})`}>
              {balancesPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Boxes}
                  title="Belum ada saldo bin"
                  message="Putaway stok ke bin untuk melihat saldo."
                  action={
                    bins.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("move")}
                      >
                        Putaway
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table headers={["Bin", "SKU", "Qty"]}>
                    {balancesPage.items.map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {b.binCode}
                        </td>
                        <td className="px-3 py-2">{b.sku}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">
                          {b.quantity}
                        </td>
                      </tr>
                    ))}
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
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
