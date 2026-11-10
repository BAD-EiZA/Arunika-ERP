"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { Button, Card, Field, Input, Select, Table } from "@/components/ui";

type Item = { productId: string; quantity: string; ceilingAmount: string; unitPrice: string; remainingQuantity: number; remainingAmount: number };
type Contract = { id: string; number: string; supplierId: string; status: string; version: number; isActive: boolean; ceilingAmount: string; usedAmount: string; remainingAmount: number; items: Item[] };
type Data = { contracts: Contract[]; suppliers: { id: string; name: string }[]; products: { id: string; name: string }[] };
export default function ContractsPage() {
  const query = useQuery({ queryKey: ["purchase-contracts"], queryFn: () => apiGet<Data>("/api/erp/procurement?contracts") });
  const [selected, setSelected] = useState<Contract | null>(null);
  const [key, setKey] = useState("");
  const mutation = useMutation({ mutationFn: (body: unknown) => apiPost("/api/erp/procurement?contracts", body), onSuccess: () => { void query.refetch(); setSelected(null); setKey(""); } });
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Purchase contracts / blanket PO</h1>
    {query.isLoading && <p>Memuat...</p>}{query.error && <p role="alert">{query.error.message}</p>}{mutation.error && <p role="alert">{mutation.error.message}</p>}
    <Card title="Buat kontrak"><form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const f = formToObject(e.currentTarget); mutation.mutate({ action: "create", ...f, items: [{ productId: f.productId, quantity: f.quantity, unitPrice: f.unitPrice, ceilingAmount: f.itemCeiling }] }); }}>
      <Field label="Pemasok"><Select name="supplierId" required>{query.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <Field label="Effective from"><Input name="effectiveFrom" type="date" required /></Field><Field label="Effective to"><Input name="effectiveTo" type="date" required /></Field>
      <Field label="Plafon nilai kontrak"><Input name="ceilingAmount" type="number" min="0.01" step="0.01" required /></Field>
      <Field label="Produk"><Select name="productId" required>{query.data?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Plafon kuantitas"><Input name="quantity" type="number" min="0.0001" step="0.0001" required /></Field><Field label="Harga"><Input name="unitPrice" type="number" min="0" step="0.01" required /></Field><Field label="Plafon nilai item"><Input name="itemCeiling" type="number" min="0.01" step="0.01" required /></Field><Button disabled={mutation.isPending}>Buat draft</Button>
    </form><p className="text-sm">Form satu item; API mendukung beberapa item.</p></Card>
    <Card title="Utilization"><Table headers={["Kontrak", "Version / status", "Plafon", "Terpakai", "Sisa", "Aksi"]}><tbody>{query.data?.contracts.map((c) => <tr key={c.id}><td>{c.number}</td><td>{c.version} / {c.status}{!c.isActive && " / Nonaktif"}</td><td>{c.ceilingAmount}</td><td>{c.usedAmount}</td><td>{c.remainingAmount}<ul>{c.items.map((i) => <li key={i.productId}>{query.data?.products.find((p) => p.id === i.productId)?.name}: qty {i.remainingQuantity}; nilai {i.remainingAmount}</li>)}</ul></td><td>
      {c.status === "DRAFT" && <Button onClick={() => mutation.mutate({ action: "submit", id: c.id })}>Submit</Button>}
      {c.status === "PENDING_APPROVAL" && <Button onClick={() => mutation.mutate({ action: "approve", id: c.id })}>Approve</Button>}
      {c.status === "APPROVED" && c.isActive && <><Button onClick={() => { setSelected(c); setKey(crypto.randomUUID()); }}>Call-off / amendment</Button><Button onClick={() => mutation.mutate({ action: "deactivate", id: c.id })}>Nonaktifkan</Button></>}
    </td></tr>)}</tbody></Table></Card>
    {selected && <Card title={selected.number}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = formToObject(e.currentTarget); mutation.mutate({ action: "call_off", supplierId: selected.supplierId, contractId: selected.id, idempotencyKey: key, items: selected.items.map((i) => ({ productId: i.productId, quantity: f[`qty:${i.productId}`], unitPrice: i.unitPrice })) }); }}>
      {selected.items.map((i) => <Field key={i.productId} label={`Qty call-off ${i.productId}`}><Input name={`qty:${i.productId}`} type="number" step="0.0001" min="0.0001" max={i.remainingQuantity} required /></Field>)}<Button disabled={mutation.isPending}>Buat PO</Button>
    </form><form className="space-y-3 mt-4" onSubmit={(e) => { e.preventDefault(); const f = formToObject(e.currentTarget); mutation.mutate({ action: "amend", id: selected.id, ceilingAmount: f.ceilingAmount, items: selected.items.map((i) => ({ productId: i.productId, quantity: f[`capQty:${i.productId}`], ceilingAmount: f[`cap:${i.productId}`] })) }); }}>
      <Field label="Plafon kontrak baru"><Input name="ceilingAmount" type="number" min={selected.ceilingAmount} defaultValue={selected.ceilingAmount} required /></Field>{selected.items.map((i) => <div key={i.productId}><Field label={`Plafon qty ${i.productId}`}><Input name={`capQty:${i.productId}`} type="number" min={i.quantity} defaultValue={i.quantity} required /></Field><Field label="Plafon nilai item baru"><Input name={`cap:${i.productId}`} type="number" min={i.ceilingAmount} defaultValue={i.ceilingAmount} required /></Field></div>)}<Button disabled={mutation.isPending}>Amendment (approve ulang)</Button></form></Card>}
  </div>;
}
