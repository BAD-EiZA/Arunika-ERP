"use client";

import {
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useCreateSupplierMutation,
  useSuppliersQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";

export function SuppliersClient() {
  const query = useSuppliersQuery();
  const createSupplier = useCreateSupplierMutation();
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Pemasok" description="Data via TanStack Query" />

      <Card title="Tambah pemasok">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = formToObject(e.currentTarget);
            createSupplier.mutate(body, {
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
            <Field label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field label="Telepon">
              <Input name="phone" />
            </Field>
          </FormGrid>
          <MutationError error={createSupplier.error} />
          <Button type="submit" disabled={createSupplier.isPending}>
            {createSupplier.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </form>
      </Card>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Daftar">
          {!data || data.suppliers.length === 0 ? (
            <EmptyState message="Belum ada pemasok" />
          ) : (
            <Table headers={["Kode", "Nama", "Email", "Telepon"]}>
              {data.suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2">{s.code}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{s.email || "-"}</td>
                  <td className="px-3 py-2">{s.phone || "-"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
