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
  useCreateCategoryMutation,
  useCreateProductMutation,
  useProductsQuery,
} from "@/hooks/use-erp-queries";
import { AppDropdown, toast } from "@/components/heroui-kit";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import { FolderTree, Package, Plus, Search, Tags } from "lucide-react";

const PAGE_SIZE = 20;

type FormMode = "none" | "product" | "category";

export function ProductsClient() {
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<FormMode>("none");
  const [search, setSearch] = useState("");
  const query = useProductsQuery(page, PAGE_SIZE);
  const createProduct = useCreateProductMutation();
  const createCategory = useCreateCategoryMutation();
  const data = query.data;

  const pageStats = useMemo(() => {
    const list = data?.products ?? [];
    return {
      archived: list.filter((p) => p.isArchived).length,
      active: list.filter((p) => !p.isArchived).length,
    };
  }, [data?.products]);

  const visible = useMemo(() => {
    const list = data?.products ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.category?.name ?? "").toLowerCase().includes(q),
    );
  }, [data?.products, search]);

  return (
    <ListPageShell>
      <PageHeader
        title="Produk"
        description="SKU, harga, kategori, dan status inventori"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Master", href: "/master-data/products" },
          { label: "Produk" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "category" ? "primary" : "secondary"}
              onClick={() =>
                setFormMode((m) => (m === "category" ? "none" : "category"))
              }
            >
              <Tags className="mr-1.5 size-4" />
              {formMode === "category" ? "Tutup" : "Kategori"}
            </Button>
            <Button
              type="button"
              variant={formMode === "product" ? "secondary" : "primary"}
              onClick={() =>
                setFormMode((m) => (m === "product" ? "none" : "product"))
              }
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "product" ? "Tutup form" : "Tambah produk"}
            </Button>
          </div>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat produk..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total produk"
                value={data.total}
                icon={Package}
              />
              <StatCard
                label="Kategori"
                value={data.categories.length}
                icon={FolderTree}
              />
              <StatCard
                label="Aktif (halaman)"
                value={pageStats.active}
                hint="Di halaman ini"
              />
              <StatCard
                label="Arsip (halaman)"
                value={pageStats.archived}
                hint="Di halaman ini"
              />
            </div>

            {formMode === "product" ? (
              <Card title="Tambah produk">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    createProduct.mutate(body, {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setPage(1);
                        setFormMode("none");
                        toast.success("Produk disimpan");
                      },
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={createProduct.isPending}
                    >
                      {createProduct.isPending
                        ? "Menyimpan..."
                        : "Simpan produk"}
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

            {formMode === "category" ? (
              <Card title="Tambah kategori">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    createCategory.mutate(body, {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setFormMode("none");
                        toast.success("Kategori disimpan");
                      },
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={createCategory.isPending}
                    >
                      {createCategory.isPending
                        ? "Menyimpan..."
                        : "Simpan kategori"}
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

            <Card
              title={`Daftar produk (${
                search ? `${visible.length} cocok` : data.total
              })`}
            >
              <div className="relative mb-4 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-8"
                  placeholder="Cari SKU / nama di halaman ini..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {visible.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title={
                    data.products.length === 0
                      ? "Belum ada produk"
                      : "Tidak cocok di halaman ini"
                  }
                  message={
                    data.products.length === 0
                      ? "Tambah produk STOCK untuk stok, SO, dan POS."
                      : "Ubah kata kunci atau ganti halaman."
                  }
                  action={
                    data.products.length === 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("product")}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Tambah produk
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "SKU",
                      "Nama",
                      "Satuan",
                      "Beli",
                      "Jual",
                      "Status",
                      "Aksi",
                    ]}
                  >
                    {visible.map((p) => (
                      <tr
                        key={p.id}
                        className={cn(p.isArchived && "opacity-60")}
                      >
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {p.sku}
                        </td>
                        <td className="px-3 py-2">
                          <div>{p.name}</div>
                          {p.category?.name ? (
                            <div className="text-[11px] text-muted">
                              {p.category.name}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{p.unit.symbol}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(p.purchasePrice)}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(p.salePrice)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={p.isArchived ? "danger" : "success"}>
                            {p.isArchived ? "Arsip" : p.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <AppDropdown
                            label={
                              <Button type="button" variant="ghost">
                                ···
                              </Button>
                            }
                            items={[
                              {
                                key: "copy",
                                label: "Salin SKU",
                                onAction: () => {
                                  void navigator.clipboard?.writeText(p.sku);
                                  toast.success(`SKU ${p.sku} disalin`);
                                },
                              },
                              {
                                key: "info",
                                label: "Detail",
                                onAction: () => toast.info(p.name),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </Table>
                  {!search ? (
                    <PaginationBar
                      page={data.page}
                      totalPages={data.totalPages}
                      total={data.total}
                      limit={data.limit}
                      disabled={query.isFetching}
                      onPageChange={setPage}
                    />
                  ) : (
                    <p className="mt-3 text-xs text-muted">
                      Filter hanya di halaman ini — hapus pencarian untuk
                      paginasi penuh.
                    </p>
                  )}
                </>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
