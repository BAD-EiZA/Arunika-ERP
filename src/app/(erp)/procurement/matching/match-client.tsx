"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  ListPageShell,
  PageHeader,
  Select,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMatchingMutation, useMatchingQuery } from "@/hooks/use-erp-queries";
import { formatIdr, qty } from "@/lib/money";
import {
  CheckCircle2,
  GitCompare,
  Plus,
  Scale,
} from "lucide-react";

type MatchData = {
  matches: Array<{
    id: string;
    status: string;
    isMatched: boolean;
    qtyVariance: string;
    priceVariance: string;
  }>;
  receipts: Array<{ id: string; number: string; supplierName: string }>;
  bills: Array<{
    id: string;
    number: string;
    total: string;
    supplierName: string;
  }>;
};

export function MatchingClient() {
  const query = useMatchingQuery();
  const mutation = useMatchingMutation();
  const data = query.data as MatchData | undefined;
  const [showForm, setShowForm] = useState(false);

  const matches = data?.matches ?? [];
  const receipts = data?.receipts ?? [];
  const bills = data?.bills ?? [];

  const stats = useMemo(() => {
    const ok = matches.filter((m) => m.isMatched).length;
    return {
      matches: matches.length,
      ok,
      fail: matches.length - ok,
      gr: receipts.length,
      bills: bills.length,
    };
  }, [matches, receipts, bills]);

  return (
    <ListPageShell>
      <PageHeader
        title="Three-way matching"
        description="Bandingkan GR vs tagihan pemasok · qty & harga"
        actions={
          <Button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            variant={showForm ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showForm ? "Tutup form" : "Review match"}
          </Button>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat matching..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Hasil" value={stats.matches} icon={GitCompare} />
              <StatCard
                label="Matched"
                value={stats.ok}
                icon={CheckCircle2}
              />
              <StatCard label="Variance" value={stats.fail} icon={Scale} />
              <StatCard
                label="GR / Bill siap"
                value={`${stats.gr} / ${stats.bills}`}
              />
            </div>

            {showForm ? (
              <Card title="Review match">
                {receipts.length === 0 || bills.length === 0 ? (
                  <EmptyState
                    compact
                    icon={GitCompare}
                    title="Butuh GR dan tagihan"
                    message="Minimal 1 goods receipt dan 1 supplier bill untuk matching."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      mutation.mutate(
                        {
                          goodsReceiptId: String(
                            fd.get("goodsReceiptId") ?? "",
                          ),
                          supplierBillId: String(
                            fd.get("supplierBillId") ?? "",
                          ),
                        },
                        { onSuccess: () => setShowForm(false) },
                      );
                    }}
                  >
                    <FormGrid>
                      <Field label="Goods receipt">
                        <Select name="goodsReceiptId" required>
                          {receipts.map((gr) => (
                            <option key={gr.id} value={gr.id}>
                              {gr.number} — {gr.supplierName}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Supplier bill">
                        <Select name="supplierBillId" required>
                          {bills.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.number} — {formatIdr(b.total)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FormGrid>
                    <MutationError error={mutation.error} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={mutation.isPending}>
                        Jalankan matching
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowForm(false)}
                      >
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            ) : null}

            <Card title={`Hasil (${matches.length})`}>
              {matches.length === 0 ? (
                <EmptyState
                  compact
                  icon={GitCompare}
                  title="Belum ada hasil match"
                  message="Pilih GR dan tagihan, lalu jalankan matching."
                  action={
                    receipts.length > 0 && bills.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowForm(true)}
                      >
                        Review match
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table
                  headers={["Status", "Matched", "Qty var", "Price var"]}
                >
                  {matches.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2">
                        <Badge tone={m.isMatched ? "success" : "warning"}>
                          {m.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {m.isMatched ? "Ya" : "Tidak"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {qty(m.qtyVariance).toString()}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                        {formatIdr(m.priceVariance)}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
