"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AppTabs,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Table,
} from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import { apiGet } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type FsData = {
  trialBalance: {
    rows: Array<{
      code: string;
      name: string;
      type: string;
      debit: string;
      credit: string;
      netDebit: string;
      netCredit: string;
    }>;
    totalDebit: string;
    totalCredit: string;
    balanced: boolean;
  };
  incomeStatement: {
    totalRevenue: string;
    totalExpense: string;
    netIncome: string;
  };
  balanceSheet: {
    totalAssets: string;
    totalLiabilities: string;
    totalEquity: string;
  };
};

type AgingData = {
  asOf: string;
  rows: Array<{
    number: string;
    partner: string;
    dueDate: string | null;
    balance: string;
    current: string;
    d1_30: string;
    d31_60: string;
    d61_90: string;
    d90p: string;
  }>;
  totals: {
    balance: string;
    current: string;
    d1_30: string;
    d31_60: string;
    d61_90: string;
    d90p: string;
  };
};

type CashFlowData = {
  operating: { netIncome: string; depreciation: string; total: string };
  investing: { total: string };
  financing: { total: string };
  netChange: string;
  endingCash: string;
};

type GlData = {
  account: { code: string; name: string; type: string } | null;
  lines: Array<{
    journalNumber: string;
    postingDate: string;
    description: string | null;
    debit: string;
    credit: string;
    balance: string;
  }>;
};

function rangeQs(from: string, to: string) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const s = p.toString();
  return s ? `&${s}` : "";
}

export function ReportsClient() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [glAccount, setGlAccount] = useState("1110");

  const qs = rangeQs(from, to);
  const query = useQuery({
    queryKey: ["reports", "financial", from, to],
    queryFn: () =>
      apiGet<FsData>(`/api/erp/reports/financial?type=fs${qs}`),
  });
  const arQuery = useQuery({
    queryKey: ["reports", "ar_aging"],
    queryFn: () =>
      apiGet<AgingData>("/api/erp/reports/financial?type=ar_aging"),
  });
  const apQuery = useQuery({
    queryKey: ["reports", "ap_aging"],
    queryFn: () =>
      apiGet<AgingData>("/api/erp/reports/financial?type=ap_aging"),
  });
  const cfQuery = useQuery({
    queryKey: ["reports", "cashflow", from, to],
    queryFn: () =>
      apiGet<CashFlowData>(
        `/api/erp/reports/financial?type=cashflow${qs}`,
      ),
  });
  const glQuery = useQuery({
    queryKey: ["reports", "gl", glAccount, from, to],
    queryFn: () =>
      apiGet<GlData>(
        `/api/erp/reports/financial?type=gl&account=${glAccount}${qs}`,
      ),
  });

  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan keuangan"
        description="TB · P/L · Neraca · Aging · Arus kas · GL"
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const payload = await apiGet<{
                csv: string;
                filename: string;
              }>(`/api/erp/reports/financial?format=csv${qs}`);
              if (!payload?.csv) return;
              const blob = new Blob([payload.csv], {
                type: "text/csv;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = payload.filename || "trial-balance.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV TB
          </Button>
        }
      />

      <Card title="Filter tanggal">
        <FormGridLike>
          <Field label="Dari">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Sampai">
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void query.refetch();
                void cfQuery.refetch();
                void glQuery.refetch();
              }}
            >
              Terapkan
            </Button>
          </div>
        </FormGridLike>
      </Card>

      <AppTabs
        items={[
          {
            id: "fs",
            title: "Laporan FS",
            content: (
              <QueryBoundary
                isLoading={query.isLoading}
                isError={query.isError}
                error={query.error}
                onRetry={() => void query.refetch()}
              >
                {data ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Card title="Pendapatan">
                        <p className="text-xl font-semibold">
                          {formatIdr(data.incomeStatement.totalRevenue)}
                        </p>
                      </Card>
                      <Card title="Beban">
                        <p className="text-xl font-semibold">
                          {formatIdr(data.incomeStatement.totalExpense)}
                        </p>
                      </Card>
                      <Card title="Laba bersih">
                        <p className="text-xl font-semibold">
                          {formatIdr(data.incomeStatement.netIncome)}
                        </p>
                      </Card>
                      <Card title="Neraca saldo">
                        <Badge
                          tone={
                            data.trialBalance.balanced ? "success" : "danger"
                          }
                        >
                          {data.trialBalance.balanced
                            ? "Seimbang"
                            : "Tidak seimbang"}
                        </Badge>
                      </Card>
                    </div>
                    <Card title="Trial balance">
                      {data.trialBalance.rows.length === 0 ? (
                        <EmptyState message="Tidak ada mutasi" />
                      ) : (
                        <Table
                          headers={[
                            "Kode",
                            "Nama",
                            "Tipe",
                            "Debit",
                            "Kredit",
                            "Net D",
                            "Net C",
                          ]}
                        >
                          {data.trialBalance.rows.map((r) => (
                            <tr key={r.code}>
                              <td className="px-3 py-2 font-medium">
                                {r.code}
                              </td>
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2">{r.type}</td>
                              <td className="px-3 py-2">
                                {formatIdr(r.debit)}
                              </td>
                              <td className="px-3 py-2">
                                {formatIdr(r.credit)}
                              </td>
                              <td className="px-3 py-2">
                                {formatIdr(r.netDebit)}
                              </td>
                              <td className="px-3 py-2">
                                {formatIdr(r.netCredit)}
                              </td>
                            </tr>
                          ))}
                        </Table>
                      )}
                    </Card>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card title="Neraca (ringkas)">
                        <p>Aset: {formatIdr(data.balanceSheet.totalAssets)}</p>
                        <p>
                          Liabilitas:{" "}
                          {formatIdr(data.balanceSheet.totalLiabilities)}
                        </p>
                        <p>
                          Ekuitas: {formatIdr(data.balanceSheet.totalEquity)}
                        </p>
                      </Card>
                      <Card title="Laba rugi (ringkas)">
                        <p>
                          Pendapatan:{" "}
                          {formatIdr(data.incomeStatement.totalRevenue)}
                        </p>
                        <p>
                          Beban: {formatIdr(data.incomeStatement.totalExpense)}
                        </p>
                        <p className="font-semibold">
                          Laba: {formatIdr(data.incomeStatement.netIncome)}
                        </p>
                      </Card>
                    </div>
                  </div>
                ) : null}
              </QueryBoundary>
            ),
          },
          {
            id: "ar",
            title: "Aging AR",
            content: (
              <AgingTable
                title="Piutang"
                query={arQuery}
              />
            ),
          },
          {
            id: "ap",
            title: "Aging AP",
            content: (
              <AgingTable title="Utang" query={apQuery} />
            ),
          },
          {
            id: "cf",
            title: "Arus kas",
            content: (
              <QueryBoundary
                isLoading={cfQuery.isLoading}
                isError={cfQuery.isError}
                error={cfQuery.error}
                onRetry={() => void cfQuery.refetch()}
              >
                {cfQuery.data ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card title="Operating">
                      <p>
                        Laba:{" "}
                        {formatIdr(cfQuery.data.operating.netIncome)}
                      </p>
                      <p>
                        Dep:{" "}
                        {formatIdr(cfQuery.data.operating.depreciation)}
                      </p>
                      <p className="font-semibold">
                        Total: {formatIdr(cfQuery.data.operating.total)}
                      </p>
                    </Card>
                    <Card title="Ringkas">
                      <p>
                        Investing:{" "}
                        {formatIdr(cfQuery.data.investing.total)}
                      </p>
                      <p>
                        Financing:{" "}
                        {formatIdr(cfQuery.data.financing.total)}
                      </p>
                      <p>
                        Net change: {formatIdr(cfQuery.data.netChange)}
                      </p>
                      <p className="font-semibold">
                        Ending cash: {formatIdr(cfQuery.data.endingCash)}
                      </p>
                    </Card>
                  </div>
                ) : null}
              </QueryBoundary>
            ),
          },
          {
            id: "gl",
            title: "Buku besar",
            content: (
              <div className="space-y-3">
                <Field label="Kode akun">
                  <Input
                    value={glAccount}
                    onChange={(e) => setGlAccount(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void glQuery.refetch()}
                >
                  Muat GL
                </Button>
                <QueryBoundary
                  isLoading={glQuery.isLoading}
                  isError={glQuery.isError}
                  error={glQuery.error}
                  onRetry={() => void glQuery.refetch()}
                >
                  {glQuery.data?.account ? (
                    <Card
                      title={`${glQuery.data.account.code} — ${glQuery.data.account.name}`}
                    >
                      {glQuery.data.lines.length === 0 ? (
                        <EmptyState message="Tidak ada mutasi" />
                      ) : (
                        <Table
                          headers={[
                            "Jurnal",
                            "Tanggal",
                            "Ket",
                            "Debit",
                            "Kredit",
                            "Saldo",
                          ]}
                        >
                          {glQuery.data.lines.map((l, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2">
                                {l.journalNumber}
                              </td>
                              <td className="px-3 py-2">
                                {l.postingDate.slice(0, 10)}
                              </td>
                              <td className="px-3 py-2">
                                {l.description || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {formatIdr(l.debit)}
                              </td>
                              <td className="px-3 py-2">
                                {formatIdr(l.credit)}
                              </td>
                              <td className="px-3 py-2">
                                {formatIdr(l.balance)}
                              </td>
                            </tr>
                          ))}
                        </Table>
                      )}
                    </Card>
                  ) : (
                    <EmptyState message="Akun tidak ditemukan" />
                  )}
                </QueryBoundary>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function FormGridLike({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}

function AgingTable({
  title,
  query,
}: {
  title: string;
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    data?: AgingData;
  };
}) {
  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? (
        <Card title={`${title} · total ${formatIdr(query.data.totals.balance)}`}>
          <Table
            headers={[
              "Dokumen",
              "Mitra",
              "Jatuh tempo",
              "Saldo",
              "Current",
              "1-30",
              "31-60",
              "61-90",
              "90+",
            ]}
          >
            {query.data.rows.map((r) => (
              <tr key={r.number}>
                <td className="px-3 py-2 font-medium">{r.number}</td>
                <td className="px-3 py-2">{r.partner}</td>
                <td className="px-3 py-2">
                  {r.dueDate?.slice(0, 10) || "—"}
                </td>
                <td className="px-3 py-2">{formatIdr(r.balance)}</td>
                <td className="px-3 py-2">{formatIdr(r.current)}</td>
                <td className="px-3 py-2">{formatIdr(r.d1_30)}</td>
                <td className="px-3 py-2">{formatIdr(r.d31_60)}</td>
                <td className="px-3 py-2">{formatIdr(r.d61_90)}</td>
                <td className="px-3 py-2">{formatIdr(r.d90p)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </QueryBoundary>
  );
}
