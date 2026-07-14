"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  PageHeader,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMatchingMutation, useMatchingQuery } from "@/hooks/use-erp-queries";
import { formatIdr, qty } from "@/lib/money";

type MatchData = {
  matches: Array<{
    id: string;
    status: string;
    isMatched: boolean;
    qtyVariance: string;
    priceVariance: string;
  }>;
  receipts: Array<{ id: string; number: string; supplierName: string }>;
  bills: Array<{ id: string; number: string; total: string; supplierName: string }>;
};

export function MatchingClient() {
  const query = useMatchingQuery();
  const mutation = useMatchingMutation();
  const data = query.data as MatchData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Three-way matching" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Review match">
              {data.receipts.length === 0 || data.bills.length === 0 ? (
                <EmptyState message="Butuh minimal 1 GR dan 1 tagihan" />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    mutation.mutate({
                      goodsReceiptId: String(fd.get("goodsReceiptId") ?? ""),
                      supplierBillId: String(fd.get("supplierBillId") ?? ""),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Goods receipt">
                      <Select name="goodsReceiptId" required>
                        {data.receipts.map((gr) => (
                          <option key={gr.id} value={gr.id}>
                            {gr.number} — {gr.supplierName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Supplier bill">
                      <Select name="supplierBillId" required>
                        {data.bills.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.number} — {formatIdr(b.total)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Jalankan matching
                  </Button>
                </form>
              )}
            </Card>
            <Card title="Hasil">
              {data.matches.length === 0 ? (
                <EmptyState message="Belum ada hasil match" />
              ) : (
                <Table headers={["Status", "Matched", "Qty var", "Price var"]}>
                  {data.matches.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2">
                        <Badge tone={m.isMatched ? "success" : "warning"}>
                          {m.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{m.isMatched ? "Ya" : "Tidak"}</td>
                      <td className="px-3 py-2">{qty(m.qtyVariance).toString()}</td>
                      <td className="px-3 py-2">{formatIdr(m.priceVariance)}</td>
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
