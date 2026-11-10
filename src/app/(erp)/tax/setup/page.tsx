"use client";
import { useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { Button, Card, Field, Input, Select, PageHeader, ListPageShell } from "@/components/ui";
type Data = { profiles: Array<{ id: string; npwp: string; effectiveFrom: string; isPkp: boolean }>; rules: Array<{ id: string; code: string; rate: string; effectiveFrom: string; glAccountCode: string }>; payments: Array<{ id: string; amount: string; billingReference: string; bankReference: string }> };
export default function TaxSetupPage() {
 const [data, setData] = useState<Data>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
 async function load() { setData(await apiGet<Data>("/api/erp/tax/setup")); }
 async function submit(e: React.FormEvent<HTMLFormElement>, action: "profile" | "rule" | "payment") { e.preventDefault(); const form = e.currentTarget; setError(""); setBusy(true);
  try { const fields = formToObject(form); const payload = action === "payment" ? { ...fields, allocations: [{ documentId: fields.documentId, amount: fields.amount }] } : action === "profile" ? { ...fields, isPkp: fields.isPkp === "true" } : fields;
    await apiPost("/api/erp/tax/setup", { ...payload, action }); await load(); form.reset();
  } catch (err) { setError(err instanceof Error ? err.message : "Operation failed"); } finally { setBusy(false); }
 }
 return <ListPageShell><PageHeader title="Profil, aturan & pembayaran pajak" description="Tarif wajib diisi dari referensi legal; identitas dimasking pada daftar." /><Link href="/tax/periods" className="underline">Periode & rekonsiliasi</Link><p role="alert">{error}</p><Button onClick={() => void load()} disabled={busy}>Muat data</Button>
 <Card title="Profil pajak bertanggal efektif"><form className="space-y-2" onSubmit={e => void submit(e,"profile")}>
 <Field label="NPWP"><Input name="npwp" required /></Field><Field label="Mulai berlaku"><Input name="effectiveFrom" type="date" required /></Field><Field label="PKP"><Select name="isPkp"><option value="false">Tidak</option><option value="true">Ya</option></Select></Field>
 <Field label="KPP"><Input name="taxOffice" /></Field><Field label="Alamat pajak"><Input name="taxAddress" /></Field><Field label="Kontak pajak"><Input name="taxContact" /></Field><Field label="Penandatangan"><Input name="signingAuthority" /></Field><Field label="Kalender pajak"><Input name="taxCalendar" /></Field><Button type="submit" disabled={busy}>Simpan versi profil</Button></form>
 <ul>{data?.profiles.map(p => <li key={p.id}>{p.effectiveFrom.slice(0,10)} · {p.npwp} · PKP {p.isPkp ? "Ya" : "Tidak"}</li>)}</ul></Card>
 <Card title="Aturan pajak efektif"><form className="space-y-2" onSubmit={e => void submit(e,"rule")}>
 <Field label="Kode"><Input name="code" required /></Field><Field label="Nama"><Input name="name" required /></Field><Field label="Jenis"><Select name="taxType">{["PPN","PPH21","PPH22","PPH23","PPH4_2","PPH26","OTHER"].map(v => <option key={v}>{v}</option>)}</Select></Field>
 <Field label="Arah"><Select name="direction"><option>OUTPUT</option><option>INPUT</option><option>WITHHOLDING</option></Select></Field><Field label="Tarif % (konfigurasi, tanpa default)"><Input name="rate" required /></Field><Field label="Mulai berlaku"><Input name="effectiveFrom" type="date" required /></Field><Field label="Sampai"><Input name="effectiveTo" type="date" /></Field><Field label="Referensi legal"><Input name="legalReference" required /></Field><Field label="Akun GL"><Input name="glAccountCode" required /></Field><Field label="Multiplier basis"><Input name="baseMultiplier" defaultValue="1" /></Field><Field label="Persen dapat dikreditkan"><Input name="recoverablePercent" defaultValue="100" /></Field><Button type="submit" disabled={busy}>Tambah versi aturan</Button></form>
 <ul>{data?.rules.map(r => <li key={r.id}>{r.code} · {r.rate}% · {r.effectiveFrom.slice(0,10)} · {r.glAccountCode}</li>)}</ul></Card>
 <Card title="Pembayaran & alokasi"><p>Settlement membuat jurnal posted. Saat ini satu dokumen per pembayaran; alokasi multi dokumen tersedia via API.</p><form className="space-y-2" onSubmit={e => void submit(e,"payment")}>
 <Field label="Periode YYYYMM"><Input name="period" required /></Field><Field label="ID dokumen pajak"><Input name="documentId" required /></Field><Field label="Nilai alokasi/pembayaran"><Input name="amount" required /></Field><Field label="Billing reference"><Input name="billingReference" required /></Field><Field label="Bank reference"><Input name="bankReference" required /></Field><Field label="Akun bank GL"><Input name="bankAccountCode" required /></Field><Field label="Tanggal bayar"><Input name="paymentDate" type="date" required /></Field><Button type="submit" disabled={busy}>Catat & posting pembayaran</Button></form>
 <ul>{data?.payments.map(p => <li key={p.id}>{p.billingReference} · {p.bankReference} · {p.amount}</li>)}</ul></Card>
 </ListPageShell>;
}
