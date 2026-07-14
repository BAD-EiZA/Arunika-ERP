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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";

type RecurringData = {
  journals: Array<{
    id: string;
    name: string;
    frequency: string;
    nextRunAt: string;
    isActive: boolean;
    lastRunAt: string | null;
    currency: string;
  }>;
  invoices: Array<{
    id: string;
    name: string;
    customerName: string;
    frequency: string;
    nextRunAt: string;
    isActive: boolean;
    currency: string;
  }>;
  customers: Array<{ id: string; name: string; code: string }>;
};

export function RecurringClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["finance", "recurring"],
    queryFn: () => apiGet<RecurringData>("/api/erp/finance/recurring"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/finance/recurring", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance", "recurring"] });
    },
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring"
        description="JE & invoice berulang"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Keuangan" },
          { label: "Recurring" },
        ]}
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ action: "run" })}
              >
                Jalankan due sekarang
              </Button>
              <MutationError error={mutation.error} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Buat recurring jurnal">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = formToObject(e.currentTarget);
                    mutation.mutate({
                      action: "create_journal",
                      name: f.name,
                      description: f.description,
                      frequency: f.frequency,
                      nextRunAt: f.nextRunAt,
                      currency: f.currency || "IDR",
                      lines: [
                        {
                          accountCode: f.debitAccount,
                          debit: f.amount,
                        },
                        {
                          accountCode: f.creditAccount,
                          credit: f.amount,
                        },
                      ],
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <FormGrid>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Frekuensi">
                      <Select name="frequency" defaultValue="MONTHLY">
                        <option value="WEEKLY">Mingguan</option>
                        <option value="MONTHLY">Bulanan</option>
                        <option value="QUARTERLY">Kuartal</option>
                        <option value="YEARLY">Tahunan</option>
                      </Select>
                    </Field>
                    <Field label="Next run">
                      <Input name="nextRunAt" type="date" required />
                    </Field>
                    <Field label="Currency">
                      <Select name="currency" defaultValue="IDR">
                        <option value="IDR">IDR</option>
                        <option value="USD">USD</option>
                      </Select>
                    </Field>
                    <Field label="Debit akun">
                      <Input name="debitAccount" defaultValue="6100" required />
                    </Field>
                    <Field label="Kredit akun">
                      <Input
                        name="creditAccount"
                        defaultValue="1110"
                        required
                      />
                    </Field>
                    <Field label="Jumlah">
                      <Input name="amount" type="number" required />
                    </Field>
                    <Field label="Deskripsi">
                      <Input name="description" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan JE recurring
                  </Button>
                </form>
              </Card>
              <Card title="Buat recurring invoice">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = formToObject(e.currentTarget);
                    mutation.mutate({
                      action: "create_invoice",
                      name: f.name,
                      customerId: f.customerId,
                      frequency: f.frequency,
                      nextRunAt: f.nextRunAt,
                      taxRate: f.taxRate || 0,
                      currency: f.currency || "IDR",
                      lines: [
                        {
                          description: f.lineDesc || "Langganan",
                          quantity: 1,
                          unitPrice: f.amount,
                        },
                      ],
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <FormGrid>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Pelanggan">
                      <Select name="customerId" required>
                        <option value="">Pilih…</option>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Frekuensi">
                      <Select name="frequency" defaultValue="MONTHLY">
                        <option value="MONTHLY">Bulanan</option>
                        <option value="QUARTERLY">Kuartal</option>
                        <option value="YEARLY">Tahunan</option>
                      </Select>
                    </Field>
                    <Field label="Next run">
                      <Input name="nextRunAt" type="date" required />
                    </Field>
                    <Field label="Jumlah">
                      <Input name="amount" type="number" required />
                    </Field>
                    <Field label="Tax %">
                      <Input name="taxRate" type="number" defaultValue="11" />
                    </Field>
                    <Field label="Deskripsi baris">
                      <Input name="lineDesc" defaultValue="Langganan" />
                    </Field>
                    <Field label="Currency">
                      <Select name="currency" defaultValue="IDR">
                        <option value="IDR">IDR</option>
                        <option value="USD">USD</option>
                      </Select>
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan INV recurring
                  </Button>
                </form>
              </Card>
            </div>
            <Card title={`Recurring jurnal (${data.journals.length})`}>
              {data.journals.length === 0 ? (
                <EmptyState message="Belum ada" />
              ) : (
                <Table
                  headers={[
                    "Nama",
                    "Freq",
                    "Next",
                    "CCY",
                    "Status",
                    "Aksi",
                  ]}
                >
                  {data.journals.map((j) => (
                    <tr key={j.id}>
                      <td className="px-3 py-2 font-medium">{j.name}</td>
                      <td className="px-3 py-2">{j.frequency}</td>
                      <td className="px-3 py-2">
                        {formatDateId(j.nextRunAt)}
                      </td>
                      <td className="px-3 py-2">{j.currency}</td>
                      <td className="px-3 py-2">
                        <Badge tone={j.isActive ? "success" : "danger"}>
                          {j.isActive ? "Aktif" : "Off"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({
                              action: "toggle",
                              kind: "journal",
                              id: j.id,
                              isActive: !j.isActive,
                            })
                          }
                        >
                          {j.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Card title={`Recurring invoice (${data.invoices.length})`}>
              {data.invoices.length === 0 ? (
                <EmptyState message="Belum ada" />
              ) : (
                <Table
                  headers={[
                    "Nama",
                    "Pelanggan",
                    "Freq",
                    "Next",
                    "Status",
                    "Aksi",
                  ]}
                >
                  {data.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 font-medium">{i.name}</td>
                      <td className="px-3 py-2">{i.customerName}</td>
                      <td className="px-3 py-2">{i.frequency}</td>
                      <td className="px-3 py-2">
                        {formatDateId(i.nextRunAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={i.isActive ? "success" : "danger"}>
                          {i.isActive ? "Aktif" : "Off"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({
                              action: "toggle",
                              kind: "invoice",
                              id: i.id,
                              isActive: !i.isActive,
                            })
                          }
                        >
                          {i.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
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
