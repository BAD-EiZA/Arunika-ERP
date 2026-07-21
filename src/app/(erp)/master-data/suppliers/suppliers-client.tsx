"use client";

import { useState } from "react";
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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useCreateSupplierMutation,
  useSuppliersQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { Building2, Plus } from "lucide-react";

const PAGE_SIZE = 20;

export function SuppliersClient() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const query = useSuppliersQuery(page, PAGE_SIZE);
  const createSupplier = useCreateSupplierMutation();
  const data = query.data;

  return (
    <ListPageShell>
      <PageHeader
        title="Pemasok"
        description="Master pemasok untuk PO, GR, dan tagihan"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Master" },
          { label: "Pemasok" },
        ]}
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Tambah pemasok"}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat pemasok..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Total pemasok"
                value={data.total}
                icon={Building2}
              />
              <StatCard
                label="Halaman ini"
                value={data.suppliers.length}
                hint={`${data.page} / ${data.totalPages || 1}`}
              />
            </div>

            {showCreate ? (
              <Card title="Tambah pemasok">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    createSupplier.mutate(body, {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setPage(1);
                        setShowCreate(false);
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
                    <Field label="Email">
                      <Input name="email" type="email" />
                    </Field>
                    <Field label="Telepon">
                      <Input name="phone" />
                    </Field>
                  </FormGrid>
                  <MutationError error={createSupplier.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={createSupplier.isPending}
                    >
                      {createSupplier.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCreate(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            <Card title={`Daftar (${data.total})`}>
              {data.suppliers.length === 0 ? (
                <EmptyState
                  compact
                  icon={Building2}
                  title="Belum ada pemasok"
                  message="Tambah pemasok untuk dipakai di purchase order dan tagihan."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowCreate(true)}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Tambah pemasok
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table headers={["Kode", "Nama", "Email", "Telepon"]}>
                    {data.suppliers.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {s.code}
                        </td>
                        <td className="px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2">{s.email || "—"}</td>
                        <td className="px-3 py-2">{s.phone || "—"}</td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={data.page}
                    totalPages={data.totalPages}
                    total={data.total}
                    limit={data.limit}
                    disabled={query.isFetching}
                    onPageChange={setPage}
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
