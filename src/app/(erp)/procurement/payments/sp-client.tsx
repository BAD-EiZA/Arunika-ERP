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
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useSupplierPaymentMutation,
  useSupplierPaymentsQuery,
} from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

export function SupplierPaymentsClient() {
  const query = useSupplierPaymentsQuery();
  const mutation = useSupplierPaymentMutation();
  const data = query.data;
  const [billId, setBillId] = useState("");

  const selected = useMemo(
    () => data?.openBills.find((b) => b.id === (billId || data.openBills[0]?.id)),
    [data?.openBills, billId],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Pembayaran pemasok" description="TanStack Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Bayar tagihan">
              {data.openBills.length === 0 ? (
                <EmptyState message="Tidak ada tagihan terbuka" />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selected) return;
                    const fd = new FormData(e.currentTarget);
                    mutation.mutate({
                      supplierId: selected.supplierId,
                      billId: selected.id,
                      amount: String(fd.get("amount") ?? selected.balance),
                      reference: String(fd.get("reference") ?? "") || undefined,
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Tagihan">
                      <Select
                        name="billId"
                        value={billId || data.openBills[0]?.id}
                        onChange={(e) => setBillId(e.target.value)}
                      >
                        {data.openBills.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.number} — {b.supplierName} —{" "}
                            {formatIdr(b.balance)}
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

            <Card title="Riwayat">
              {data.payments.length === 0 ? (
                <EmptyState message="Belum ada pembayaran" />
              ) : (
                <Table
                  headers={["Nomor", "Pemasok", "Jumlah", "Status", "Tanggal"]}
                >
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{p.number}</td>
                      <td className="px-3 py-2">{p.supplier.name}</td>
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
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
