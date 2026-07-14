"use client";

import { Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { QueryBoundary } from "@/components/query-state";
import { useTaxCodesQuery } from "@/hooks/use-erp-queries";
import { formatDateId } from "@/lib/dates";

export function TaxCodesClient() {
  const query = useTaxCodesQuery();
  const codes =
    (
      query.data as {
        codes?: Array<{
          id: string;
          code: string;
          name: string;
          taxType: string;
          direction: string;
          rate: string;
          effectiveFrom: string;
        }>;
      }
    )?.codes ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Tax code" description="Effective-dated · Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Daftar">
          {codes.length === 0 ? (
            <EmptyState message="Belum ada tax code" />
          ) : (
            <Table headers={["Kode", "Nama", "Tipe", "Arah", "Rate %", "Berlaku"]}>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.code}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.taxType}</td>
                  <td className="px-3 py-2">{c.direction}</td>
                  <td className="px-3 py-2">{c.rate}</td>
                  <td className="px-3 py-2">{formatDateId(c.effectiveFrom)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
