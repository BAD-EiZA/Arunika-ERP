"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Field, Input, ListPageShell, PageHeader, Select, Table } from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useReturnsMutation, useReturnsQuery } from "@/hooks/use-erp-queries";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type ReturnDoc = { id: string; number: string; status: string; total: string; warehouseId: string; disposition?: string; reason?: string; settlementStatus?: string; refundAmount?: string; refundedAt?: string; replacementDeliveryId?: string; replacement?: { id: string; number: string; status: string; warehouseId: string } };
type SourceItem = { id: string; productId: string; quantity: string; returned: string; description?: string };
type Data = {
  warehouses: { id: string; code: string; type: string }[];
  salesReturns: ReturnDoc[]; purchaseReturns: ReturnDoc[];
  salesInvoices: { id: string; number: string; customerId: string; warehouseId: string; items: SourceItem[] }[];
  goodsReceipts: { id: string; number: string; supplierId: string; warehouseId: string; items: SourceItem[] }[];
  claims: { id: string; number: string; status: string; amount: string; partnerName: string; ownerId?: string; dueAt?: string; evidenceFileId?: string }[];
};
type Notes = { creditNotes: ReturnDoc[]; debitNotes: ReturnDoc[] };

export function ReturnsClient() {
  const query = useReturnsQuery();
  const mutation = useReturnsMutation();
  const qc = useQueryClient();
  const notes = useQuery({ queryKey: ["credit-notes"], queryFn: () => apiGet<Notes>("/api/erp/credit-notes") });
  const noteMutation = useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/credit-notes", body), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["credit-notes"] }); } });
  const data = query.data as Data | undefined;
  const [kind, setKind] = useState("sales");
  const [sourceId, setSourceId] = useState("");
  const [sourceItemId, setSourceItemId] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [inspection, setInspection] = useState<Record<string, string>>({});
  const [replacementKeys, setReplacementKeys] = useState<Record<string, string>>({});
  const source = kind === "sales" ? data?.salesInvoices.find(s => s.id === sourceId) : data?.goodsReceipts.find(s => s.id === sourceId);
  const item = source?.items.find(i => i.id === sourceItemId);

  return <ListPageShell>
    <PageHeader title="Return & Claim" description="Retur karantina, release stok, scrap, refund approved, DO pengganti, SLA claim." />
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={() => void query.refetch()}>
      <MutationError error={mutation.error} />
      <MutationError error={noteMutation.error} />
      {data && <>
        <Card title="Buat return dari sumber">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => {
            e.preventDefault();
            if (!source || !item) return;
            const body = formToObject(e.currentTarget);
            const key = requestKey || crypto.randomUUID();
            setRequestKey(key);
            mutation.mutate({ action: kind === "sales" ? "sales_return" : "purchase_return", warehouseId: kind === "sales" ? body.warehouseId : source.warehouseId, ...(kind === "sales" ? { salesInvoiceId: source.id, customerId: "customerId" in source ? source.customerId : "" } : { supplierId: "supplierId" in source ? source.supplierId : "" }), idempotencyKey: key, reason: body.reason, items: [{ productId: item.productId, quantity: body.quantity, ...(kind === "sales" ? { sourceItemId: item.id } : { sourceReceiptItemId: item.id }) }] }, { onSuccess: () => { setSourceId(""); setSourceItemId(""); setRequestKey(""); } });
          }}>
            <Field label="Tipe"><Select value={kind} onChange={e => { setKind(e.target.value); setSourceId(""); setSourceItemId(""); setRequestKey(""); }}><option value="sales">Sales return</option><option value="purchase">Purchase return</option></Select></Field>
            <Field label="Invoice / receipt posted"><Select required value={sourceId} onChange={e => { setSourceId(e.target.value); setSourceItemId(""); setRequestKey(""); }}><option value="">Pilih sumber</option>{(kind === "sales" ? data.salesInvoices : data.goodsReceipts).map(s => <option key={s.id} value={s.id}>{s.number}</option>)}</Select></Field>
            <Field label="Item sumber"><Select required value={sourceItemId} onChange={e => { setSourceItemId(e.target.value); setRequestKey(""); }}><option value="">Pilih item</option>{source?.items.map(i => <option key={i.id} value={i.id}>{i.description || i.productId} · sumber {i.quantity} · return {i.returned}</option>)}</Select></Field>
            {kind === "sales" && <Field label="Gudang karantina"><Select required name="warehouseId"><option value="">Pilih karantina</option>{data.warehouses.filter(w => ["RETURN", "DAMAGED"].includes(w.type)).map(w => <option key={w.id} value={w.id}>{w.code}</option>)}</Select></Field>}
            <Field label="Qty"><Input required min="0.0001" step="0.0001" type="number" name="quantity" onChange={() => setRequestKey("")} /></Field>
            <Field label="Alasan"><Input name="reason" onChange={() => setRequestKey("")} /></Field>
            <Button type="submit" disabled={mutation.isPending || !item}>Buat draft · biaya/pajak dari sumber</Button>
          </form>
        </Card>
        {(["sales", "purchase"] as const).map(k => <Card key={k} title={k === "sales" ? "Sales returns · karantina" : "Purchase returns"}>
          <Table headers={["Nomor", "Total", "Status", "Inspeksi / aksi"]}>
            {(k === "sales" ? data.salesReturns : data.purchaseReturns).map(r => <tr key={r.id}>
              <td className="p-3">{r.number}</td><td className="p-3">{formatIdr(r.total)}</td><td className="p-3"><Badge>{r.status}</Badge>{r.disposition && <span> {r.disposition}</span>}</td>
              <td className="p-3">
                {r.status === "DRAFT" && <div className="flex gap-2"><Input aria-label={`Catatan inspeksi ${r.number}`} placeholder="Catatan inspeksi wajib" value={inspection[r.id] || ""} onChange={e => setInspection({ ...inspection, [r.id]: e.target.value })} /><Button disabled={mutation.isPending || !inspection[r.id]?.trim()} onClick={() => mutation.mutate({ action: `approve_${k}_return`, id: r.id, warehouseId: r.warehouseId, inspectionNotes: inspection[r.id], disposition: "QUARANTINE" })}>Approve</Button></div>}
                {r.status === "APPROVED" && <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: `post_${k}_return`, id: r.id, warehouseId: r.warehouseId })}>{k === "sales" ? "Terima karantina" : "Kirim ke pemasok"}</Button>}
                {k === "sales" && r.status === "POSTED" && <form className="grid gap-2" onSubmit={e => { e.preventDefault(); const body = formToObject(e.currentTarget); const signature = `${r.id}:${body.targetWarehouseId}`; const key = replacementKeys[signature] || crypto.randomUUID(); if (body.action === "replacement") setReplacementKeys({ ...replacementKeys, [signature]: key }); mutation.mutate({ ...body, id: r.id, ...(body.action === "replacement" ? { idempotencyKey: key } : {}) }); }}>
                  <Select aria-label="Aksi lanjutan" name="action"><option value="release">Release to stock</option><option value="dispose">Scrap</option><option value="approve_settlement" disabled={Boolean(r.replacement)}>Approve settlement refund</option><option value="refund" disabled={Boolean(r.replacement)}>Bayar refund</option><option value="replacement" disabled={Boolean(r.replacement || r.replacementDeliveryId || r.refundedAt || r.settlementStatus !== "DRAFT")}>Replacement independen · kirim semua qty</option></Select>
                  <Select aria-label="Gudang utama tujuan" name="targetWarehouseId"><option value="">Gudang utama tujuan</option>{data.warehouses.filter(w => w.type === "MAIN").map(w => <option key={w.id} value={w.id}>{w.code}</option>)}</Select>
                  <Input aria-label="Catatan inspeksi release" name="inspectionNotes" placeholder="Catatan inspeksi release" />
                  <Input aria-label="Jumlah settlement atau refund" name="amount" type="number" min="0.01" step="0.01" placeholder="Jumlah settlement / refund" />
                  <Input aria-label="Bank account ID refund" name="bankAccountId" placeholder="Bank account ID refund" />
                  <span>Settlement: {r.settlementStatus} {r.refundAmount && formatIdr(r.refundAmount)} {r.refundedAt && "· sudah refund"} {r.replacementDeliveryId && `· DO ${r.replacementDeliveryId}`} {r.replacement && `· ${r.replacement.number} ${r.replacement.status}`}</span>
                  <Button disabled={mutation.isPending} type="submit">Jalankan aksi approved</Button>
                </form>}
                {r.status === "POSTED" && <Button disabled={noteMutation.isPending || (k === "sales" && Boolean(r.replacement || r.replacementDeliveryId))} onClick={() => noteMutation.mutate(k === "sales" ? { action: "from_sales_return", salesReturnId: r.id } : { action: "from_purchase_return", purchaseReturnId: r.id })}>{k === "sales" ? "CN" : "DN"} dari {r.number}</Button>}
              </td>
            </tr>)}
          </Table>
        </Card>)}
        <Card title="Credit / debit notes · financial only"><Table headers={["Tipe", "Nomor", "Total", "Status"]}>{[...(notes.data?.creditNotes || []).map(n => ({ ...n, kind: "CN" })), ...(notes.data?.debitNotes || []).map(n => ({ ...n, kind: "DN" }))].map(n => <tr key={n.id}><td className="p-3">{n.kind}</td><td className="p-3">{n.number}</td><td className="p-3">{formatIdr(n.total)}</td><td className="p-3">{n.status}</td></tr>)}</Table></Card>
        <Card title="Claim"><form className="flex gap-3" onSubmit={e => { e.preventDefault(); mutation.mutate({ action: "claim", ...formToObject(e.currentTarget) }); }}><Select name="claimType"><option value="CUSTOMER">Customer</option><option value="SUPPLIER">Supplier</option><option value="WARRANTY">Warranty</option></Select><Input aria-label="Partner" name="partnerName" placeholder="Partner" /><Input aria-label="Jumlah" required name="amount" type="number" min="0.01" step="0.01" /><Input aria-label="Owner user ID" name="ownerId" required placeholder="Owner user ID" /><Input aria-label="SLA due" name="dueAt" type="date" required /><Input aria-label="Evidence FileAsset ID" name="evidenceFileId" placeholder="Evidence FileAsset ID" /><Button disabled={mutation.isPending} type="submit">Buat claim</Button></form><Table headers={["Nomor", "Partner", "Jumlah", "Status"]}>{data.claims.map(c => <tr key={c.id}><td className="p-3">{c.number}</td><td className="p-3">{c.partnerName}</td><td className="p-3">{formatIdr(c.amount)}</td><td className="p-3">{c.status} · {c.ownerId} · {c.dueAt?.slice(0, 10)} {c.evidenceFileId && `· evidence ${c.evidenceFileId}`}{c.status === "DRAFT" && <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "advance_claim", id: c.id, claimStatus: "IN_PROGRESS" })}>Mulai</Button>}{c.status === "IN_PROGRESS" && <form onSubmit={e => { e.preventDefault(); mutation.mutate({ action: "advance_claim", id: c.id, claimStatus: "RESOLVED", ...formToObject(e.currentTarget) }); }}><Input aria-label="Resolution" required name="resolution" placeholder="Resolution untuk approval" /><Button disabled={mutation.isPending} type="submit">Approve resolution</Button></form>}</td></tr>)}</Table></Card>
      </>}
    </QueryBoundary>
  </ListPageShell>;
}
