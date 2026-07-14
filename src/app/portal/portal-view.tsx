"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
} from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import { apiGet } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

export function PortalView({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["portal", token],
    enabled: Boolean(token),
    queryFn: () =>
      apiGet<{
        portalType: string;
        company: { name: string };
        data: {
          customer?: { name: string; code: string };
          supplier?: { name: string; code: string };
          orders: Array<{ number: string; status: string; total: string; orderDate?: string }>;
          invoices?: Array<{
            number: string;
            status: string;
            total: string;
            balance: string;
          }>;
          bills?: Array<{
            number: string;
            status: string;
            total: string;
            balance: string;
          }>;
          payments: Array<{ number: string; amount: string; status: string }>;
        };
      }>(`/api/erp/portal?token=${encodeURIComponent(token)}`),
  });

  if (!token) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState message="Token portal wajib di URL: /portal?token=..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Portal mitra"
        description={
          query.data
            ? `${query.data.company.name} · ${query.data.portalType}`
            : "Memuat portal..."
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <>
            <Card title="Identitas">
              <p className="text-sm">
                {query.data.portalType === "CUSTOMER"
                  ? query.data.data.customer?.name
                  : query.data.data.supplier?.name}
              </p>
            </Card>
            <Card title="Orders">
              <Table headers={["Nomor", "Status", "Total", "Tanggal"]}>
                {query.data.data.orders.map((o) => (
                  <tr key={o.number}>
                    <td className="px-3 py-2">{o.number}</td>
                    <td className="px-3 py-2">
                      <Badge>{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2">{formatIdr(o.total)}</td>
                    <td className="px-3 py-2">
                      {o.orderDate ? formatDateId(o.orderDate) : "-"}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Invoice / Tagihan">
              <Table headers={["Nomor", "Status", "Total", "Saldo"]}>
                {(query.data.data.invoices || query.data.data.bills || []).map(
                  (i) => (
                    <tr key={i.number}>
                      <td className="px-3 py-2">{i.number}</td>
                      <td className="px-3 py-2">
                        <Badge>{i.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{formatIdr(i.total)}</td>
                      <td className="px-3 py-2">{formatIdr(i.balance)}</td>
                    </tr>
                  ),
                )}
              </Table>
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
