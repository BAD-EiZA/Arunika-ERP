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
      dueDate?: string | null;
      releaseDate?: string | null;
      decision: string;
      sourceRef?: string | null;
      exceptionMessage?: string | null;
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
  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/mrp/review", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mrp"] });
    },
  });
  const data = query.data as MrpData | undefined;
  const [showRun, setShowRun] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const runs = useMemo(() => data?.runs ?? [], [data]);
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
              const form = e.currentTarget;
              const body = formToObject(form);
              let planning: unknown;
              try {
                planning = JSON.parse(body.planning);
                if (!planning || typeof planning !== "object" || Array.isArray(planning)) {
                  throw new Error("Konfigurasi planning harus berupa objek JSON.");
                }
              } catch (error) {
                setPlanningError(`JSON planning tidak valid: ${error instanceof Error ? error.message : "Periksa format JSON."}`);
                return;
              }
              setPlanningError(null);
              mutation.mutate(
                {
                  horizonDays: Number(body.horizonDays),
                  notes: body.notes || undefined,
                  planning,
                },
                {
                  onSuccess: () => {
                    form.reset();
                    setShowRun(false);
                  },
                },
              );
            }}
          >
            <FormGrid>
              <Field label="Horizon (hari)">
                <Input name="horizonDays" type="number" min="1" required defaultValue="30" />
              </Field>
              <Field label="Catatan">
                <Input name="notes" />
              </Field>
            </FormGrid>
            <label className="block space-y-1.5">
              <span>Konfigurasi planning (JSON)</span>
              <textarea name="planning" required rows={8}
                className="w-full rounded-lg border border-border bg-background p-2 font-mono text-sm"
                aria-invalid={Boolean(planningError)} aria-describedby="planning-help planning-error"
                placeholder={'{"calendar":{"workingDays":[1,2,3,4,5],"holidays":[]},"products":[{"productId":"...","leadTimeDays":2,"lotSize":"10","safetyStock":"0"}]}'}
                onChange={() => setPlanningError(null)} />
            </label>
            <p id="planning-help" className="text-xs text-muted">Isi kalender UTC, lead time, lot size, safety stock setiap produk demand, BOM, dan pasokan. Contoh bukan nilai default.</p>
            <p id="planning-error" role="alert" className="text-sm text-danger">{planningError}</p>
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
                  Bucket harian UTC; demand tanpa tanggal atau terlambat masuk hari ini.
                  Pasokan tanpa jadwal pasti tidak mengurangi shortage. Komponen
                  mengikuti tanggal release induk sesuai kalender dan lead time.
                  Terima atau modifikasi suggestion sebelum convert. CANCEL / RESCHEDULE
                  hanya advisory; review tidak mengubah jadwal order sumber.
                </p>
                <MutationError error={convert.error} />
                <MutationError error={review.error} />
                <Table
                  headers={[
                    "SKU",
                    "Nama",
                    "Tipe",
                    "On hand",
                    "Demand",
                    "Supply",
                    "Suggest",
                    "Tanggal kebutuhan / release (UTC)",
                    "Keputusan / sumber / exception",
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div>Kebutuhan: {l.dueDate?.slice(0, 10) ?? "—"}</div>
                        <div>Release: {l.releaseDate?.slice(0, 10) ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <Badge tone={l.decision === "REJECTED" ? "danger" : "default"}>{l.decision}</Badge>
                        <div>{l.sourceRef ?? "—"}</div>
                        <div>{l.exceptionMessage ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2">
                        {l.isConverted ? (
                          <Badge tone="success">Converted</Badge>
                        ) : l.decision === "PENDING" ? (
                          <div className="min-w-56 space-y-2">
                            <div className="flex gap-2">
                              <Button disabled={review.isPending} onClick={() => review.mutate({ suggestionId: l.id, action: "accept" })}>Terima {l.sku}</Button>
                              <Button variant="danger" disabled={review.isPending} onClick={() => review.mutate({ suggestionId: l.id, action: "reject" })}>Tolak {l.sku}</Button>
                            </div>
                            <form aria-label={`Modifikasi ${l.sku}`} className="space-y-2" onSubmit={(e) => {
                              e.preventDefault();
                              const body = formToObject(e.currentTarget);
                              review.mutate({ suggestionId: l.id, action: "modify", dueDate: body.dueDate, ...(l.suggestionType !== "CANCEL" ? { quantity: body.quantity } : {}) });
                            }}>
                              {l.suggestionType !== "CANCEL" ? <label className="block">Kuantitas {l.sku}
                                <input className="w-full rounded border p-2" name="quantity" type="number" required min="0.0001" step="0.0001" max="99999999999999.9999" defaultValue={l.quantity} />
                              </label> : null}
                              <label className="block">Tanggal kebutuhan {l.sku} (UTC)
                                <input className="w-full rounded border p-2" name="dueDate" type="date" required defaultValue={l.dueDate?.slice(0, 10)} />
                              </label>
                              <Button type="submit" variant="secondary" disabled={review.isPending}>Modifikasi {l.sku}</Button>
                            </form>
                          </div>
                        ) : ["ACCEPTED", "MODIFIED"].includes(l.decision) && ["PURCHASE", "PRODUCE"].includes(l.suggestionType) ? (
                          <form aria-label={`Konversi ${l.sku}`} className="min-w-56 space-y-2" onSubmit={(e) => {
                            e.preventDefault();
                            const body = formToObject(e.currentTarget);
                            convert.mutate({ suggestionId: l.id, supplierId: body.supplierId || undefined, warehouseId: body.warehouseId || undefined, bomId: body.bomId || undefined });
                          }}>
                            {l.suggestionType === "PURCHASE" ? <label className="block">Supplier ID {l.sku}
                              <input className="w-full rounded border p-2" name="supplierId" required />
                            </label> : <label className="block">BOM ID {l.sku}
                              <input className="w-full rounded border p-2" name="bomId" required />
                            </label>}
                            <label className="block">Warehouse ID {l.sku} (opsional)
                              <input className="w-full rounded border p-2" name="warehouseId" />
                            </label>
                            <Button type="submit" variant="secondary" disabled={convert.isPending}>Buat draft {l.suggestionType === "PRODUCE" ? "MO" : "PO"} {l.sku}</Button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted">{l.decision === "REJECTED" ? "Ditolak" : "Advisory; order sumber tidak diubah."}</span>
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
