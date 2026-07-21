"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMrpMutation, useMrpQuery } from "@/hooks/use-erp-queries";
import { apiPost, formToObject } from "@/lib/api-client";
import {
  Lightbulb,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";

type MrpData = {
  runs: Array<{
    id: string;
    number: string;
    status: string;
    horizonDays: number;
    ranAt: string;
    lineCount: number;
    lines: Array<{
      id: string;
      sku: string;
      name: string;
      suggestionType: string;
      quantity: string;
      onHand: string;
      demand: string;
      supply: string;
      isConverted?: boolean;
    }>;
  }>;
};

export function MrpClient() {
  const qc = useQueryClient();
  const query = useMrpQuery();
  const mutation = useMrpMutation();
  const convert = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/mrp/convert", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mrp"] });
    },
  });
  const data = query.data as MrpData | undefined;
  const [showRun, setShowRun] = useState(false);
  const runs = data?.runs ?? [];
  const latest = runs[0];

  const stats = useMemo(() => {
    const lines = latest?.lines ?? [];
    const open = lines.filter((l) => !l.isConverted).length;
    return {
      runs: runs.length,
      lines: latest?.lineCount ?? 0,
      open,
      produce: lines.filter((l) => l.suggestionType === "PRODUCE").length,
    };
  }, [runs, latest]);

  return (
    <ListPageShell>
      <PageHeader
        title="MRP"
        description="Net requirements · convert ke PO / MO"
        actions={
          <Button
            type="button"
            onClick={() => setShowRun((v) => !v)}
            variant={showRun ? "secondary" : "primary"}
          >
            <Play className="mr-1.5 size-4" />
            {showRun ? "Tutup form" : "Jalankan MRP"}
          </Button>
        }
      />

      {showRun ? (
        <Card title="Jalankan MRP">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const body = formToObject(e.currentTarget);
              mutation.mutate(
                {
                  horizonDays: Number(body.horizonDays || 30),
                  notes: body.notes || undefined,
                },
                {
                  onSuccess: () => {
                    e.currentTarget.reset();
                    setShowRun(false);
                  },
                },
              );
            }}
          >
            <FormGrid>
              <Field label="Horizon (hari)">
                <Input name="horizonDays" type="number" defaultValue="30" />
              </Field>
              <Field label="Catatan">
                <Input name="notes" />
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Menjalankan..." : "Run MRP"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowRun(false)}
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
        loadingLabel="Memuat MRP..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Runs" value={stats.runs} icon={RefreshCw} />
            <StatCard
              label="Lines (latest)"
              value={stats.lines}
              icon={Lightbulb}
            />
            <StatCard label="Belum convert" value={stats.open} />
            <StatCard label="Produce" value={stats.produce} />
          </div>

          <Card title="Riwayat run">
            {runs.length === 0 ? (
              <EmptyState
                compact
                icon={RefreshCw}
                title="Belum ada MRP run"
                message="Jalankan MRP untuk menghasilkan suggestion net requirements."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowRun(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Jalankan MRP
                  </Button>
                }
              />
            ) : (
              <Table
                headers={["Nomor", "Horizon", "Lines", "Status", "Waktu"]}
              >
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {r.number}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.horizonDays} hari
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.lineCount}</td>
                    <td className="px-3 py-2">
                      <Badge tone="success">{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {r.ranAt.slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Suggestion terbaru">
            {!latest || latest.lines.length === 0 ? (
              <EmptyState
                compact
                icon={Lightbulb}
                title="Tidak ada suggestion"
                message="Jalankan MRP atau cek master stok / demand."
              />
            ) : (
              <>
                <p className="mb-3 text-xs text-muted">
                  Convert PURCHASE butuh supplier default di master. PRODUCE
                  memakai BOM FG jika ada.
                </p>
                <MutationError error={convert.error} />
                <Table
                  headers={[
                    "SKU",
                    "Nama",
                    "Tipe",
                    "On hand",
                    "Demand",
                    "Supply",
                    "Suggest",
                    "Aksi",
                  ]}
                >
                  {latest.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {l.sku}
                      </td>
                      <td className="px-3 py-2">{l.name}</td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            l.suggestionType === "PRODUCE"
                              ? "warning"
                              : "default"
                          }
                        >
                          {l.suggestionType}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{l.onHand}</td>
                      <td className="px-3 py-2 tabular-nums">{l.demand}</td>
                      <td className="px-3 py-2 tabular-nums">{l.supply}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                        {l.quantity}
                      </td>
                      <td className="px-3 py-2">
                        {l.isConverted ? (
                          <Badge tone="success">Converted</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={convert.isPending}
                            onClick={() =>
                              convert.mutate({ suggestionId: l.id })
                            }
                          >
                            →{" "}
                            {l.suggestionType === "PRODUCE" ? "MO" : "PO"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
