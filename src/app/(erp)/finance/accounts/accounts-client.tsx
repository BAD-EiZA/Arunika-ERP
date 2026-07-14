"use client";

import { Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import { useFinanceAccountsQuery } from "@/hooks/use-erp-queries";

export function AccountsClient() {
  const query = useFinanceAccountsQuery();
  const accounts = (query.data as { accounts?: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    normalBalance: string;
    isActive: boolean;
  }> })?.accounts ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Chart of Accounts" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Daftar akun">
          {accounts.length === 0 ? (
            <EmptyState message="COA belum tersedia" />
          ) : (
            <Table headers={["Kode", "Nama", "Tipe", "Normal", "Aktif"]}>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{a.code}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">{a.type}</td>
                  <td className="px-3 py-2">{a.normalBalance}</td>
                  <td className="px-3 py-2">{a.isActive ? "Ya" : "Tidak"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
