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
  useCustomerPaymentMutation,
  useCustomerPaymentsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import {
  Banknote,
  FileText,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";

export function CustomerPaymentsClient() {
  const query = useCustomerPaymentsQuery();
  const mutation = useCustomerPaymentMutation();
  const data = query.data;
  const [showPost, setShowPost] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");

  const openInvoices = data?.openInvoices ?? [];
  const payments = data?.payments ?? [];
  const openKey = openInvoices.map((i) => i.id).join("|");

  const selected = useMemo(() => {
    if (!data?.openInvoices?.length) return undefined;
    const id = invoiceId || data.openInvoices[0]?.id;
    return data.openInvoices.find((i) => i.id === id);
  }, [data, invoiceId, openKey]);

  const stats = useMemo(() => {
    let openBalance = 0;
    for (const inv of openInvoices) {
      openBalance += Number(inv.balance) || 0;
    }
    let paidTotal = 0;
    for (const p of payments) {
      paidTotal += Number(p.amount) || 0;
    }
    return {
      openCount: openInvoices.length,
      openBalance,
      paymentCount: payments.length,
      paidTotal,
    };
  }, [openInvoices, payments]);

  const paymentsPage = useClientPage(payments, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Pembayaran pelanggan"
        description="Terima pelunasan invoice · tutup piutang"
        actions={
          <Button
            type="button"
            onClick={() => setShowPost((v) => !v)}
            variant={showPost ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showPost ? "Tutup form" : "Terima pembayaran"}
            {openInvoices.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {openInvoices.length}
              </span>
            ) : null}
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat pembayaran..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Invoice terbuka"
                value={stats.openCount}
                icon={FileText}
              />
              <StatCard
                label="Saldo piutang"
                value={formatIdr(stats.openBalance)}
                icon={Wallet}
              />
              <StatCard
                label="Pembayaran"
                value={stats.paymentCount}
                icon={Receipt}
              />
              <StatCard
                label="Total diterima"
                value={formatIdr(stats.paidTotal)}
                icon={Banknote}
                hint="Di riwayat"
              />
            </div>

            {showPost ? (
              <Card title="Terima pembayaran">
                {openInvoices.length === 0 ? (
                  <EmptyState
                    compact
                    icon={FileText}
                    title="Tidak ada invoice terbuka"
                    message="Terbitkan invoice dulu agar bisa menerima pembayaran."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!selected) return;
                      const fd = new FormData(e.currentTarget);
                      mutation.mutate(
                        {
                          customerId: selected.customerId,
                          invoiceId: selected.id,
                          amount: String(
                            fd.get("amount") ?? selected.balance,
                          ),
                          reference:
                            String(fd.get("reference") ?? "") || undefined,
                        },
                        {
                          onSuccess: () => setShowPost(false),
                        },
                      );
                    }}
                  >
                    <FormGrid>
                      <Field label="Invoice">
                        <Select
                          name="invoiceId"
                          value={invoiceId || openInvoices[0]?.id}
                          onChange={(e) => setInvoiceId(e.target.value)}
                        >
                          {openInvoices.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} — {inv.customerName} —{" "}
                              {formatIdr(inv.balance)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Jumlah">
                        <Input
                          name="amount"
                          type="number"
                          step="0.01"
                          required
                          defaultValue={selected?.balance}
                          key={selected?.id}
                        />
                      </Field>
                      <Field label="Referensi">
                        <Input name="reference" />
                      </Field>
                    </FormGrid>
                    <MutationError error={mutation.error} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={mutation.isPending}>
                        {mutation.isPending
                          ? "Memposting..."
                          : "Posting pembayaran"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowPost(false)}
                      >
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            ) : null}

            <Card title={`Riwayat (${paymentsPage.total})`}>
              {paymentsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Banknote}
                  title="Belum ada pembayaran"
                  message={
                    openInvoices.length > 0
                      ? "Terima pelunasan dari invoice terbuka."
                      : "Invoice dengan saldo akan muncul untuk dibayar."
                  }
                  action={
                    openInvoices.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowPost(true)}
                      >
                        Terima pembayaran
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "Pelanggan",
                      "Jumlah",
                      "Status",
                      "Tanggal",
                    ]}
                  >
                    {paymentsPage.items.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {p.number}
                        </td>
                        <td className="px-3 py-2">{p.customer.name}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(p.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone="success">{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(p.paymentDate)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={paymentsPage.page}
                    totalPages={paymentsPage.totalPages}
                    total={paymentsPage.total}
                    limit={paymentsPage.limit}
                    onPageChange={paymentsPage.setPage}
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
