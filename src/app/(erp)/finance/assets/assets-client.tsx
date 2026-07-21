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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceAssetMutation,
  useFinanceAssetsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { Building2, Package, Plus, Wallet } from "lucide-react";

type AssetsData = {
  assets: Array<{
    id: string;
    code: string;
    name: string;
    acquisitionCost: string;
    accumulatedDep: string;
    bookValue: string;
    acquisitionDate: string;
    isActive?: boolean;
    disposedAt?: string | null;
  }>;
};

export function AssetsClient() {
  const query = useFinanceAssetsQuery();
  const mutation = useFinanceAssetMutation();
  const data = query.data as AssetsData | undefined;
  const [showCreate, setShowCreate] = useState(false);
  const assets = data?.assets ?? [];
  const assetsPage = useClientPage(assets, 20);

  const stats = useMemo(() => {
    let book = 0;
    let active = 0;
    let disposed = 0;
    for (const a of assets) {
      book += Number(a.bookValue) || 0;
      if (a.isActive === false || a.disposedAt) disposed += 1;
      else active += 1;
    }
    return { total: assets.length, active, disposed, book };
  }, [assets]);

  return (
    <ListPageShell>
      <PageHeader
        title="Aset tetap"
        description="Perolehan · penyusutan · dispose"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Tambah aset"}
          </Button>
        }
      />

      {showCreate ? (
        <Card title="Tambah aset">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                {
                  action: "create",
                  ...formToObject(e.currentTarget),
                },
                {
                  onSuccess: () => {
                    e.currentTarget.reset();
                    setShowCreate(false);
                  },
                },
              );
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
                <Input
                  name="acquisitionCost"
                  type="number"
                  step="0.01"
                  required
                />
              </Field>
              <Field label="Nilai sisa">
                <Input
                  name="residualValue"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </Field>
              <Field label="Umur (bulan)">
                <Input
                  name="usefulLifeMonths"
                  type="number"
                  defaultValue="36"
                />
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                Simpan aset
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreate(false)}
              >
                Batal
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat aset..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total aset" value={stats.total} icon={Building2} />
            <StatCard label="Aktif" value={stats.active} icon={Package} />
            <StatCard label="Disposed" value={stats.disposed} />
            <StatCard
              label="Nilai buku"
              value={formatIdr(stats.book)}
              icon={Wallet}
            />
          </div>

          <Card title={`Daftar aset (${assetsPage.total})`}>
            {assetsPage.total === 0 ? (
              <EmptyState
                compact
                icon={Building2}
                title="Belum ada aset"
                message="Tambah aset tetap untuk penyusutan bulanan."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Tambah aset
                  </Button>
                }
              />
            ) : (
              <>
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
                  {assetsPage.items.map((a) => {
                    const disposed =
                      a.isActive === false || Boolean(a.disposedAt);
                    return (
                      <tr key={a.id} className={disposed ? "opacity-60" : undefined}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {a.code}
                        </td>
                        <td className="px-3 py-2">{a.name}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(a.acquisitionCost)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(a.accumulatedDep)}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(a.bookValue)}
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(a.acquisitionDate)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {!disposed ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={mutation.isPending}
                                  onClick={() =>
                                    mutation.mutate({
                                      action: "depreciate",
                                      id: a.id,
                                    })
                                  }
                                >
                                  Susut 1 bln
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={mutation.isPending}
                                  onClick={() =>
                                    mutation.mutate({
                                      action: "dispose",
                                      id: a.id,
                                      disposeAmount: a.bookValue,
                                    })
                                  }
                                >
                                  Dispose
                                </Button>
                              </>
                            ) : (
                              <Badge tone="danger">Disposed</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <PaginationBar
                  page={assetsPage.page}
                  totalPages={assetsPage.totalPages}
                  total={assetsPage.total}
                  limit={assetsPage.limit}
                  onPageChange={assetsPage.setPage}
                />
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
