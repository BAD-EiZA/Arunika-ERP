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
  useInvoicesQuery,
  useIssueInvoiceMutation,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

export function InvoicesClient() {
  const query = useInvoicesQuery();
  const mutation = useIssueInvoiceMutation();
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice penjualan" description="TanStack Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Terbitkan dari delivery">
              {data.openDeliveries.length === 0 ? (
                <EmptyState message="Tidak ada delivery siap diinvoice" />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    mutation.mutate({
                      deliveryOrderId: String(fd.get("deliveryOrderId") ?? ""),
                      taxRate: String(fd.get("taxRate") ?? "11"),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Delivery">
                      <Select name="deliveryOrderId" required>
                        {data.openDeliveries.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.number} — {d.customerName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Tarif PPN %">
                      <Input
                        name="taxRate"
                        type="number"
                        step="0.01"
                        defaultValue="11"
                      />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Menerbitkan..." : "Issue invoice"}
                  </Button>
                </form>
              )}
            </Card>

            <Card title="Daftar invoice">
              {data.invoices.length === 0 ? (
                <EmptyState message="Belum ada invoice" />
              ) : (
                <Table
                  headers={[
                    "Nomor",
                    "Pelanggan",
                    "Total",
                    "Saldo",
                    "Status",
                    "Jatuh tempo",
                  ]}
                >
                  {data.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-3 py-2">
                        <a
                          className="font-medium text-accent underline"
                          href={`/api/erp/pdf/invoice/${inv.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {inv.number}
                        </a>
                      </td>
                      <td className="px-3 py-2">{inv.customer.name}</td>
                      <td className="px-3 py-2">{formatIdr(inv.total)}</td>
                      <td className="px-3 py-2">{formatIdr(inv.balance)}</td>
                      <td className="px-3 py-2">
                        <Badge>{inv.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(inv.dueDate)}
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
