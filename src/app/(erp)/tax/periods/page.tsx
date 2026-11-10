"use client";

import { useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api-client";
import { Button, Card, Field, Input, Select, PageHeader, ListPageShell } from "@/components/ui";

type PeriodData = { lifecycle: { status: string; revision: number } | null; reconciliation: { taxTotal: string; coverage: string; exceptions: Array<{ documentId: string; code: string; expected?: string; actual?: string }> }; batches: Array<{ id: string; revision: number; status: string; checksum: string; payload: string }> };
export default function TaxPeriodsPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0,7).replace("-", ""));
  const [data, setData] = useState<PeriodData>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { setData(await apiGet<PeriodData>(`/api/erp/tax/periods?period=${encodeURIComponent(period)}`)); }
  async function run(action?: string, extra = {}) {
    setBusy(true); setError("");
    try { if (action) await apiPost("/api/erp/tax/periods", { action, period, reason, ...extra }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Operation failed"); } finally { setBusy(false); }
  }
  function download(batch: PeriodData["batches"][number]) {
    const url = URL.createObjectURL(new Blob([batch.payload], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `tax-internal-${period}-r${batch.revision}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <ListPageShell>
    <PageHeader title="Periode & rekonsiliasi pajak" description="Close pajak terpisah dari akuntansi. Ekspor offline internal; tidak ada pengiriman DJP." />
    <Link href="/tax/documents" className="underline">Dokumen pajak</Link>
    <Card title="Periode">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(); }}>
        <Field label="Periode YYYYMM"><Input required pattern="[0-9]{4}(0[1-9]|1[0-2])" value={period} onChange={e => { setPeriod(e.target.value); setData(undefined); }} /></Field>
        <Button type="submit" disabled={busy}>Rekonsiliasi</Button>
      </form>
      <p role="alert">{error}</p>
    </Card>
    {data && <>
      <Card title={`${data.lifecycle?.status ?? "OPEN"} · revisi ${data.lifecycle?.revision ?? 0}`}>
        <p>Total pajak {data.reconciliation.taxTotal}</p><p>{data.reconciliation.coverage}</p>
        <ul>{data.reconciliation.exceptions.map((ex, i) => <li key={i}>{ex.documentId}: {ex.code} {ex.expected ?? ""} / {ex.actual ?? ""}</li>)}</ul>
        <Field label="Alasan override/reopen (wajib jika ada exception/reopen)"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button disabled={busy || data.lifecycle?.status === "CLOSED"} onClick={() => void run("close")}>Approve & close</Button>
          <Button disabled={busy || data.lifecycle?.status !== "CLOSED" || !reason.trim()} onClick={() => void run("reopen")}>Reopen untuk koreksi</Button>
          <Button disabled={busy || data.lifecycle?.status !== "CLOSED"} onClick={() => void run("export")}>Buat ekspor offline</Button>
        </div>
      </Card>
      <Card title="Ekspor & respons manual">
        <p>Format internal belum divalidasi untuk upload resmi. Status REPORTED berasal dari bukti pengguna, bukan verifikasi DJP. Retry: unduh ulang batch yang sama; revisi baru memerlukan reopen.</p>
        {data.batches.map(batch => <div key={batch.id} className="py-3 break-all"><p>r{batch.revision} · {batch.status} · SHA256 {batch.checksum}</p><Button onClick={() => download(batch)}>Unduh JSON</Button></div>)}
        {data.batches.length > 0 && <form className="space-y-3" onSubmit={e => {
          e.preventDefault(); const fields = new FormData(e.currentTarget);
          void run("response", { batchId: String(fields.get("batchId")), status: String(fields.get("status")), reference: String(fields.get("reference")), evidence: String(fields.get("evidence")) });
        }}>
          <Field label="Batch"><Select name="batchId">{data.batches.map(b => <option key={b.id} value={b.id}>r{b.revision} {b.id}</option>)}</Select></Field>
          <Field label="Status dilaporkan"><Select name="status"><option value="REPORTED_ACCEPTED">Dilaporkan diterima</option><option value="REPORTED_REJECTED">Dilaporkan ditolak</option></Select></Field>
          <Field label="Referensi eksternal"><Input name="reference" required maxLength={200} /></Field>
          <Field label="Bukti respons / detail error"><Input name="evidence" required maxLength={20000} /></Field>
          <Button type="submit" disabled={busy}>Catat respons manual</Button>
        </form>}
      </Card>
    </>}
  </ListPageShell>;
}
