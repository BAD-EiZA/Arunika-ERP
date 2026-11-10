"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { Button, Card, Field, Input, Table } from "@/components/ui";

type Report = { rows: Record<string, string | number>[]; total?: string | number; warehouses?: { warehouseId: string; warehouse: string; total: string }[] };
export function OperationalReports() {
  const [type, setType] = useState("movements");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [warehouseId, setWarehouse] = useState(""); const [productId, setProduct] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ type, page: String(page), limit: "20", ...(from ? { from } : {}), ...(to ? { to } : {}), ...(warehouseId ? { warehouseId } : {}), ...(productId ? { productId } : {}) });
  const url = `/api/erp/reports/operational?${params}`;
  const query = useQuery({ queryKey: ["reports", "operational", params.toString()], queryFn: () => apiGet<Report>(url) });
  const rows = query.data?.rows ?? []; const headers = rows.length ? Object.keys(rows[0]).filter(k => k !== "id") : [];
  return <Card title="Laporan operasional">
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Laporan"><select value={type} onChange={e => { setType(e.target.value); setPage(1); }} className="rounded border p-2"><option value="movements">Mutasi stok</option><option value="valuation">Valuasi inventori</option><option value="open-orders">Order terbuka</option><option value="unbilled">GR / DO belum ditagih</option></select></Field>
      <Field label="Dari"><Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></Field>
      <Field label="Sampai"><Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></Field>
      <Field label="ID gudang"><Input value={warehouseId} onChange={e => { setWarehouse(e.target.value); setPage(1); }} /></Field>
      <Field label="ID produk"><Input value={productId} onChange={e => { setProduct(e.target.value); setPage(1); }} /></Field>
      <Button type="button" onClick={async () => { try { const data = await apiGet<{ csv: string; filename: string }>(`${url}&format=csv`); const blob = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = blob; a.download = data.filename; a.click(); URL.revokeObjectURL(blob); } catch (e) { alert(e instanceof Error ? e.message : "Ekspor gagal"); } }}>Export CSV halaman ini</Button>
    </div>
    {query.isError ? <p role="alert">{query.error.message}</p> : query.isLoading ? <p>Memuat…</p> : rows.length ? <Table headers={headers}>{rows.map((r, i) => <tr key={String(r.id ?? i)}>{headers.map(k => <td key={k} className="px-3 py-2">{r[k]}</td>)}</tr>)}</Table> : <p>Tidak ada data</p>}
    {query.data?.total !== undefined ? <p>Total: {query.data.total}</p> : null}
    {query.data?.warehouses?.map(w => <p key={w.warehouseId}>{w.warehouse}: {w.total}</p>)}
    {type === "movements" ? <div className="flex gap-2"><Button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button><span>Halaman {page}</span><Button disabled={page * 20 >= Number(query.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Berikutnya</Button></div> : null}
  </Card>;
}
