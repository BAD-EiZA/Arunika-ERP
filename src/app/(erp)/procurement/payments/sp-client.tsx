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
  useSupplierPaymentMutation,
  useSupplierPaymentsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import {
  Banknote,
  Building2,
  FileText,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";

export function SupplierPaymentsClient() {
  const query = useSupplierPaymentsQuery();
  const mutation = useSupplierPaymentMutation();
  const data = query.data;
  const [showPost, setShowPost] = useState(false);
  const [billId, setBillId] = useState("");

  const openBills = data?.openBills ?? [];
  const payments = data?.payments ?? [];
  const openKey = openBills.map((b) => b.id).join("|");

  const selected = useMemo(() => {
    if (!data?.openBills?.length) return undefined;
    const id = billId || data.openBills[0]?.id;
    return data.openBills.find((b) => b.id === id);
  }, [data, billId, openKey]);

  const stats = useMemo(() => {
    let openBalance = 0;
    for (const b of openBills) {
      openBalance += Number(b.balance) || 0;
    }
    let paidTotal = 0;
    for (const p of payments) {
      paidTotal += Number(p.amount) || 0;
    }
    return {
      openCount: openBills.length,
      openBalance,
      paymentCount: payments.length,
      paidTotal,
    };
  }, [openBills, payments]);

  const paymentsPage = useClientPage(payments, 20);

  return (
    <ListPageShell>
      <PageHeader
        title="Pembayaran pemasok"
        description="Bayar tagihan · tutup utang usaha"
        actions={
          <Button
            type="button"
            onClick={() => setShowPost((v) => !v)}
            variant={showPost ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showPost ? "Tutup form" : "Bayar tagihan"}
            {openBills.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {openBills.length}
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
        loadingLabel="Memuat pembayaran pemasok..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Tagihan terbuka"
                value={stats.openCount}
                icon={FileText}
              />
              <StatCard
                label="Saldo utang"
                value={formatIdr(stats.openBalance)}
                icon={Wallet}
              />
              <StatCard
                label="Pembayaran"
                value={stats.paymentCount}
                icon={Receipt}
              />
              <StatCard
                label="Total dibayar"
                value={formatIdr(stats.paidTotal)}
                icon={Banknote}
                hint="Di riwayat"
              />
            </div>

            {showPost ? (
              <Card title="Bayar tagihan">
                {openBills.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Building2}
                    title="Tidak ada tagihan terbuka"
                    message="Buat tagihan pemasok dulu agar bisa dibayar."
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
                          supplierId: selected.supplierId,
                          billId: selected.id,
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
                      <Field label="Tagihan">
                        <Select
                          name="billId"
                          value={billId || openBills[0]?.id}
                          onChange={(e) => setBillId(e.target.value)}
                        >
                          {openBills.map((b) => (
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
                    openBills.length > 0
                      ? "Bayar tagihan terbuka ke pemasok."
                      : "Tagihan dengan saldo akan muncul untuk dibayar."
                  }
                  action={
                    openBills.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowPost(true)}
                      >
                        Bayar tagihan
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "Pemasok",
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
                        <td className="px-3 py-2">{p.supplier.name}</td>
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
