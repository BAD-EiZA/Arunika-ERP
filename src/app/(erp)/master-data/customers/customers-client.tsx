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
  useCreateCustomerMutation,
  useCustomersQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { Plus, Users } from "lucide-react";

const PAGE_SIZE = 20;

export function CustomersClient() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const query = useCustomersQuery(page, PAGE_SIZE);
  const createCustomer = useCreateCustomerMutation();
  const data = query.data;

  return (
    <ListPageShell>
      <PageHeader
        title="Pelanggan"
        description="Master pelanggan untuk SO, invoice, dan CRM"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Master" },
          { label: "Pelanggan" },
        ]}
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Tambah pelanggan"}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat pelanggan..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Total pelanggan"
                value={data.total}
                icon={Users}
              />
              <StatCard
                label="Halaman ini"
                value={data.customers.length}
                hint={`${data.page} / ${data.totalPages || 1}`}
              />
            </div>

            {showCreate ? (
              <Card title="Tambah pelanggan">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    createCustomer.mutate(body, {
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
                  <MutationError error={createCustomer.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={createCustomer.isPending}
                    >
                      {createCustomer.isPending ? "Menyimpan..." : "Simpan"}
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
              {data.customers.length === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title="Belum ada pelanggan"
                  message="Tambah pelanggan untuk dipakai di sales order dan invoice."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowCreate(true)}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Tambah pelanggan
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table
                    headers={["Kode", "Nama", "Email", "Telepon", "Termin"]}
                  >
                    {data.customers.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {c.code}
                        </td>
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2">{c.email || "—"}</td>
                        <td className="px-3 py-2">{c.phone || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {c.paymentTermDays} hari
                        </td>
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
