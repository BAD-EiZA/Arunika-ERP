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
  Select,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import {
  BookOpen,
  FileText,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";

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

type FormMode = "none" | "journal" | "invoice";

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
  const [formMode, setFormMode] = useState<FormMode>("none");

  const journals = data?.journals ?? [];
  const invoices = data?.invoices ?? [];

  const stats = useMemo(() => {
    const jActive = journals.filter((j) => j.isActive).length;
    const iActive = invoices.filter((i) => i.isActive).length;
    return {
      journals: journals.length,
      invoices: invoices.length,
      jActive,
      iActive,
    };
  }, [journals, invoices]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Recurring"
        description="JE & invoice berulang · jalankan due"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Keuangan" },
          { label: "Recurring" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: "run" })}
            >
              <Play className="mr-1.5 size-4" />
              Jalankan due
            </Button>
            <Button
              type="button"
              variant={formMode === "invoice" ? "primary" : "secondary"}
              onClick={() => toggle("invoice")}
            >
              <FileText className="mr-1.5 size-4" />
              Invoice
            </Button>
            <Button
              type="button"
              variant={formMode === "journal" ? "secondary" : "primary"}
              onClick={() => toggle("journal")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "journal" ? "Tutup" : "Jurnal"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat recurring..."
      >
        {data ? (
          <>
            <MutationError error={mutation.error} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="JE recurring"
                value={stats.journals}
                icon={BookOpen}
              />
              <StatCard
                label="JE aktif"
                value={stats.jActive}
                icon={RefreshCw}
              />
              <StatCard
                label="INV recurring"
                value={stats.invoices}
                icon={FileText}
              />
              <StatCard label="INV aktif" value={stats.iActive} />
            </div>

            {formMode === "journal" ? (
              <Card title="Buat recurring jurnal">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
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
                      <Input
                        name="debitAccount"
                        defaultValue="6100"
                        required
                      />
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
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan JE recurring
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

            {formMode === "invoice" ? (
              <Card title="Buat recurring invoice">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
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
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan INV recurring
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

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title={`Recurring jurnal (${journals.length})`}>
                {journals.length === 0 ? (
                  <EmptyState
                    compact
                    icon={BookOpen}
                    title="Belum ada JE recurring"
                    message="Buat jurnal berulang untuk beban/pendapatan rutin."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("journal")}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Jurnal
                      </Button>
                    }
                  />
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
                    {journals.map((j) => (
                      <tr key={j.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {j.name}
                        </td>
                        <td className="px-3 py-2 text-xs">{j.frequency}</td>
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

              <Card title={`Recurring invoice (${invoices.length})`}>
                {invoices.length === 0 ? (
                  <EmptyState
                    compact
                    icon={FileText}
                    title="Belum ada INV recurring"
                    message="Buat invoice berulang untuk langganan."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("invoice")}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Invoice
                      </Button>
                    }
                  />
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
                    {invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {i.name}
                        </td>
                        <td className="px-3 py-2">{i.customerName}</td>
                        <td className="px-3 py-2 text-xs">{i.frequency}</td>
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
            </div>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
