"use client";

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
  useCreateCategoryMutation,
  useCreateProductMutation,
  useProductsQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

export function ProductsClient() {
  const query = useProductsQuery();
  const createProduct = useCreateProductMutation();
  const createCategory = useCreateCategoryMutation();
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produk"
        description="Master produk via TanStack Query"
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Tambah produk">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    createProduct.mutate(body, {
                      onSuccess: () => e.currentTarget.reset(),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="SKU">
                      <Input name="sku" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Satuan">
                      <Select
                        name="unitId"
                        required
                        defaultValue={data.units[0]?.id}
                      >
                        {data.units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.symbol} — {u.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Kategori">
                      <Select name="categoryId" defaultValue="">
                        <option value="">—</option>
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Harga beli">
                      <Input
                        name="purchasePrice"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Harga jual">
                      <Input
                        name="salePrice"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Min stok">
                      <Input
                        name="minStock"
                        type="number"
                        step="0.0001"
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Deskripsi">
                      <Input name="description" />
                    </Field>
                  </FormGrid>
                  <MutationError error={createProduct.error} />
                  <Button
                    type="submit"
                    disabled={createProduct.isPending}
                  >
                    {createProduct.isPending ? "Menyimpan..." : "Simpan produk"}
                  </Button>
                </form>
              </Card>

              <Card title="Tambah kategori">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    createCategory.mutate(body, {
                      onSuccess: () => e.currentTarget.reset(),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Kode">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                  </FormGrid>
                  <MutationError error={createCategory.error} />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={createCategory.isPending}
                  >
                    {createCategory.isPending
                      ? "Menyimpan..."
                      : "Simpan kategori"}
                  </Button>
                </form>
              </Card>
            </div>

            <Card title="Daftar produk">
              {data.products.length === 0 ? (
                <EmptyState message="Belum ada produk" />
              ) : (
                <Table
                  headers={["SKU", "Nama", "Satuan", "Beli", "Jual", "Status"]}
                >
                  {data.products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-medium">{p.sku}</td>
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2">{p.unit.symbol}</td>
                      <td className="px-3 py-2">
                        {formatIdr(p.purchasePrice)}
                      </td>
                      <td className="px-3 py-2">{formatIdr(p.salePrice)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={p.isArchived ? "danger" : "success"}>
                          {p.isArchived ? "Arsip" : p.type}
                        </Badge>
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
