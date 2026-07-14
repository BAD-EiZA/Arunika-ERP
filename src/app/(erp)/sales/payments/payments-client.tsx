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
  PageHeader,
  PaginationBar,
  Select,
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

export function CustomerPaymentsClient() {
  const query = useCustomerPaymentsQuery();
  const mutation = useCustomerPaymentMutation();
  const data = query.data;
  const [invoiceId, setInvoiceId] = useState("");

  const selected = useMemo(
    () =>
      data?.openInvoices.find(
        (i) => i.id === (invoiceId || data.openInvoices[0]?.id),
      ),
    [data?.openInvoices, invoiceId],
  );
  const paymentsPage = useClientPage(data?.payments ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Pembayaran pelanggan" description="TanStack Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Terima pembayaran">
              {data.openInvoices.length === 0 ? (
                <EmptyState message="Tidak ada invoice terbuka" />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selected) return;
                    const fd = new FormData(e.currentTarget);
                    mutation.mutate({
                      customerId: selected.customerId,
                      invoiceId: selected.id,
                      amount: String(fd.get("amount") ?? selected.balance),
                      reference: String(fd.get("reference") ?? "") || undefined,
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Invoice">
                      <Select
                        name="invoiceId"
                        value={invoiceId || data.openInvoices[0]?.id}
                        onChange={(e) => setInvoiceId(e.target.value)}
                      >
                        {data.openInvoices.map((inv) => (
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
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Memposting..." : "Posting pembayaran"}
                  </Button>
                </form>
              )}
            </Card>

            <Card title={`Riwayat (${paymentsPage.total})`}>
              {paymentsPage.total === 0 ? (
                <EmptyState message="Belum ada pembayaran" />
              ) : (
                <>
                  <Table
                    headers={["Nomor", "Pelanggan", "Jumlah", "Status", "Tanggal"]}
                  >
                    {paymentsPage.items.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2">{p.number}</td>
                        <td className="px-3 py-2">{p.customer.name}</td>
                        <td className="px-3 py-2">{formatIdr(p.amount)}</td>
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
    </div>
  );
}
