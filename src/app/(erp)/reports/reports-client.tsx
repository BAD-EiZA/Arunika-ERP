"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, PageHeader, Table } from "@/components/ui";
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
  csv?: string;
  filename?: string;
};

export function ReportsClient() {
  const query = useQuery({
    queryKey: ["reports", "financial"],
    queryFn: () => apiGet<FsData>("/api/erp/reports/financial"),
  });
  const csvQuery = useQuery({
    queryKey: ["reports", "financial", "csv"],
    queryFn: () =>
      apiGet<FsData & { csv: string; filename: string }>(
        "/api/erp/reports/financial?format=csv",
      ),
    enabled: false,
  });

  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan keuangan"
        description="Trial balance · P/L · Neraca"
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const res = await csvQuery.refetch();
              const payload = res.data;
              if (!payload?.csv) return;
              const blob = new Blob([payload.csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = payload.filename || "trial-balance.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
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
              <Card title="TB balance">
                <Badge tone={data.trialBalance.balanced ? "success" : "danger"}>
                  {data.trialBalance.balanced ? "Seimbang" : "Tidak seimbang"}
                </Badge>
                <p className="mt-2 text-xs text-muted">
                  Dr {formatIdr(data.trialBalance.totalDebit)} / Cr{" "}
                  {formatIdr(data.trialBalance.totalCredit)}
                </p>
              </Card>
            </div>
            <Card title="Neraca ringkas">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>Aset: {formatIdr(data.balanceSheet.totalAssets)}</div>
                <div>Liabilitas: {formatIdr(data.balanceSheet.totalLiabilities)}</div>
                <div>Ekuitas: {formatIdr(data.balanceSheet.totalEquity)}</div>
              </div>
            </Card>
            <Card title="Trial balance">
              {data.trialBalance.rows.length === 0 ? (
                <EmptyState message="Belum ada mutasi jurnal posted" />
              ) : (
                <Table
                  headers={[
                    "Kode",
                    "Nama",
                    "Tipe",
                    "Debit",
                    "Kredit",
                    "Net Dr",
                    "Net Cr",
                  ]}
                >
                  {data.trialBalance.rows.map((r) => (
                    <tr key={r.code}>
                      <td className="px-3 py-2 font-medium">{r.code}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{r.type}</td>
                      <td className="px-3 py-2">{formatIdr(r.debit)}</td>
                      <td className="px-3 py-2">{formatIdr(r.credit)}</td>
                      <td className="px-3 py-2">{formatIdr(r.netDebit)}</td>
                      <td className="px-3 py-2">{formatIdr(r.netCredit)}</td>
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
