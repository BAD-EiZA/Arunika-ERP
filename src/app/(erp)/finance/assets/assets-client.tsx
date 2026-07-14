"use client";

import {
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceAssetMutation,
  useFinanceAssetsQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

type AssetsData = {
  assets: Array<{
    id: string;
    code: string;
    name: string;
    acquisitionCost: string;
    accumulatedDep: string;
    bookValue: string;
    acquisitionDate: string;
  }>;
};

export function AssetsClient() {
  const query = useFinanceAssetsQuery();
  const mutation = useFinanceAssetMutation();
  const data = query.data as AssetsData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Aset tetap" description="TanStack Query" />
      <Card title="Tambah aset">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              action: "create",
              ...formToObject(e.currentTarget),
            });
          }}
        >
          <FormGrid>
            <Field label="Kode">
              <Input name="code" required />
            </Field>
            <Field label="Nama">
              <Input name="name" required />
            </Field>
            <Field label="Kategori">
              <Input name="category" />
            </Field>
            <Field label="Tanggal perolehan">
              <Input name="acquisitionDate" type="date" required />
            </Field>
            <Field label="Nilai perolehan">
              <Input name="acquisitionCost" type="number" step="0.01" required />
            </Field>
            <Field label="Nilai sisa">
              <Input name="residualValue" type="number" step="0.01" defaultValue="0" />
            </Field>
            <Field label="Umur (bulan)">
              <Input name="usefulLifeMonths" type="number" defaultValue="36" />
            </Field>
          </FormGrid>
          <MutationError error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending}>
            Simpan aset
          </Button>
        </form>
      </Card>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Daftar aset">
          {!data || data.assets.length === 0 ? (
            <EmptyState message="Belum ada aset" />
          ) : (
            <Table
              headers={[
                "Kode",
                "Nama",
                "Perolehan",
                "Akumulasi",
                "Nilai buku",
                "Tanggal",
                "Aksi",
              ]}
            >
              {data.assets.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2">{a.code}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">{formatIdr(a.acquisitionCost)}</td>
                  <td className="px-3 py-2">{formatIdr(a.accumulatedDep)}</td>
                  <td className="px-3 py-2">{formatIdr(a.bookValue)}</td>
                  <td className="px-3 py-2">{formatDateId(a.acquisitionDate)}</td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ action: "depreciate", id: a.id })
                      }
                    >
                      Susut 1 bln
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
