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
  useCreateCustomerMutation,
  useCustomersQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";

export function CustomersClient() {
  const query = useCustomersQuery();
  const createCustomer = useCreateCustomerMutation();
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Pelanggan" description="Data via TanStack Query" />

      <Card title="Tambah pelanggan">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = formToObject(e.currentTarget);
            createCustomer.mutate(body, {
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
          <MutationError error={createCustomer.error} />
          <Button type="submit" disabled={createCustomer.isPending}>
            {createCustomer.isPending ? "Menyimpan..." : "Simpan"}
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
          {!data || data.customers.length === 0 ? (
            <EmptyState message="Belum ada pelanggan" />
          ) : (
            <Table headers={["Kode", "Nama", "Email", "Telepon", "Termin"]}>
              {data.customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.code}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.email || "-"}</td>
                  <td className="px-3 py-2">{c.phone || "-"}</td>
                  <td className="px-3 py-2">{c.paymentTermDays} hari</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
