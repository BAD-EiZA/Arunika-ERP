"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

type Option = { id: string; name: string };
type Member = { id: string; roleId: string; status: string; user: { name: string | null; email: string }; branchAccess: { branchId: string }[]; warehouseAccess: { warehouseId: string }[] };
type Role = Option & { code: string; description: string | null; isSystem: boolean; isActive: boolean; permissionCodes: "*" | string[]; memberCount: number };
type Data = { availablePermissions: string[]; members: Member[]; roles: Role[]; branches: Option[]; warehouses: Option[]; invitations: { id: string; email: string; expiresAt: string }[]; selfId: string; permissions: "*" | string[] };
const field = "rounded border border-slate-300 bg-white p-2 text-sm";

export default function UsersClient() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [delivery, setDelivery] = useState("");
  const { data, error: loadError, refetch: load } = useQuery<Data>({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await fetch("/api/erp/users", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat anggota");
      return result;
    },
  });
  const can = (permission: string) => data?.permissions === "*" || data?.permissions.includes(permission);
  async function send(payload: object) {
    setBusy(true); setError(""); setLink(""); setDelivery("");
    try {
      const response = await fetch("/api/erp/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Perubahan gagal");
      if (result.inviteLink) {
        setLink(new URL(result.inviteLink, location.origin).href);
        setDelivery(result.delivery === "QUEUED" ? "Email masuk antrean; belum ada konfirmasi pengiriman." : "Email belum diantrekan: URL aplikasi belum dikonfigurasi. Bagikan tautan secara privat.");
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Perubahan gagal"); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>, action: string, id?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send({ action, id, email: form.get("email"), roleId: form.get("roleId"), branchIds: form.getAll("branchIds"), warehouseIds: form.getAll("warehouseIds") });
  }
  function roleForm(role?: Role) {
    return <form className="grid gap-3 rounded border p-4" onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void send({ action: role ? "role.update" : "role.create", id: role?.id, name: form.get("name"), description: form.get("description"), permissionCodes: form.getAll("permissionCodes") });
    }}>
      <label className="grid gap-1">Nama role<input className={field} name="name" required maxLength={254} defaultValue={role?.name} /></label>
      <label className="grid gap-1">Deskripsi<input className={field} name="description" maxLength={254} defaultValue={role?.description ?? ""} /></label>
      <label className="grid gap-1">Permission<select className={field} name="permissionCodes" multiple size={8} defaultValue={role?.permissionCodes === "*" ? data?.availablePermissions : role?.permissionCodes ?? []}>{[...new Set([...(data?.availablePermissions ?? []), ...(role?.permissionCodes === "*" ? [] : role?.permissionCodes ?? [])])].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      <button className={field} disabled={busy}>{role ? "Simpan role" : "Buat role"}</button>
    </form>;
  }
  function accessFields(member?: Member) {
    return <>
      <label className="grid gap-1">Role<select className={field} name="roleId" required defaultValue={member?.roleId}>{data?.roles.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="grid gap-1">Cabang<select className={field} name="branchIds" multiple defaultValue={member?.branchAccess.map((b) => b.branchId) ?? []}>{data?.branches.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="grid gap-1">Gudang<select className={field} name="warehouseIds" multiple defaultValue={member?.warehouseAccess.map((w) => w.warehouseId) ?? []}>{data?.warehouses.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    </>;
  }
  return <main className="grid gap-5">
    <h1 className="text-2xl font-semibold">Pengguna & keanggotaan</h1>
    <p>Undangan berlaku 72 jam. Email diantrekan otomatis bila URL aplikasi dikonfigurasi; antrean bukan konfirmasi pengiriman. Tautan juga dapat dibagikan secara privat.</p>
    {delivery && <p role="status">{delivery}</p>}
    <p className="text-sm">Pilihan akses kosong berarti semua cabang/gudang. Gunakan Ctrl/Cmd untuk memilih beberapa atau membatalkan pilihan.</p>
    {(error || loadError) && <p role="alert" className="text-red-700">{error || loadError?.message}</p>}
    {link && <section className="grid gap-2 rounded border p-4" aria-label="Tautan undangan baru"><label>Tautan undangan (simpan sekarang)<input className={`${field} w-full`} readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label><button className={field} type="button" onClick={() => setLink("")}>Tutup tautan</button></section>}
    {!data ? <p role="status">Memuat anggota…</p> : <>
      {can("user:invite") && <form className="grid gap-3 rounded border p-4 sm:grid-cols-4" onSubmit={(e) => submit(e, "invite")}>
        <h2 className="font-semibold sm:col-span-4">Undang pengguna</h2>
        <label className="grid gap-1">Email<input className={field} name="email" type="email" maxLength={254} required /></label>
        {accessFields()}
        <button className={field} disabled={busy}>Buat undangan</button>
      </form>}
      {can("role:manage") && <section className="grid gap-3" aria-label="Role dan permission">
        <h2 className="text-xl font-semibold">Role dan permission</h2>
        {roleForm()}
        {data.roles.map((role) => <details key={`${role.id}-${role.name}-${role.permissionCodes}`} className="rounded border p-3">
          <summary>{role.name} · {role.isSystem ? "Bawaan" : "Kustom"} · {role.isActive ? "Aktif" : "Nonaktif"} · {role.memberCount} anggota</summary>
          <p className="my-2 text-sm">{role.permissionCodes === "*" ? "Semua permission" : role.permissionCodes.join(", ") || "Tanpa permission"}</p>
          {!role.isSystem && roleForm(role)}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={field} disabled={busy} onClick={() => { const name = prompt("Nama role salinan", `${role.name} (salinan)`); if (name?.trim()) void send({ action: "role.copy", id: role.id, name }); }}>Salin role</button>
            {!role.isSystem && <>
              <button className={field} disabled={busy} onClick={() => { if (confirm(`${role.isActive ? "Nonaktifkan" : "Aktifkan"} role ${role.name}?`)) void send({ action: role.isActive ? "role.disable" : "role.activate", id: role.id }); }}>{role.isActive ? "Nonaktifkan role" : "Aktifkan role"}</button>
              <button className={field} disabled={busy} onClick={() => { if (confirm(`Hapus role ${role.name}? Role yang digunakan tidak dapat dihapus.`)) void send({ action: "role.delete", id: role.id }); }}>Hapus role</button>
            </>}
          </div>
        </details>)}
      </section>}
      {data.members.map((m) => <section key={m.id} className="grid gap-3 rounded border p-4">
        <h2 className="font-semibold">{m.user.name || m.user.email}</h2>
        <p>{m.user.email} · {m.status}{m.id === data.selfId ? " · Anda" : ""}</p>
        {m.status === "INVITED" && data.invitations.filter((i) => i.email === m.user.email).map((i) => <p key={i.id} className="text-sm">Berlaku sampai {new Date(i.expiresAt).toLocaleString("id-ID")}</p>)}
        {m.id !== data.selfId && <>
          {m.status === "ACTIVE" && can("user:update") && can("role:manage") && <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => submit(e, "update", m.id)}>{accessFields(m)}<button className={field} disabled={busy}>Simpan akses</button></form>}
          {m.status === "DISABLED" && can("user:update") && can("role:manage") && <button className={field} disabled={busy} onClick={() => { if (confirm(`Aktifkan kembali ${m.user.email} dengan akses tersimpan?`)) void send({ action: "reactivate", id: m.id }); }}>Aktifkan kembali</button>}
          <div className="flex flex-wrap gap-2">
            {m.status === "INVITED" && can("user:invite") && <button className={field} disabled={busy} onClick={() => void send({ action: "resend", id: m.id })}>Buat ulang tautan</button>}
            {can("user:disable") && <>
              {m.status !== "DISABLED" && <button className={field} disabled={busy} onClick={() => { if (confirm(`Nonaktifkan ${m.user.email}? Akses perusahaan akan dicabut.`)) void send({ action: "disable", id: m.id }); }}>Nonaktifkan</button>}
              <button className={field} disabled={busy} onClick={() => { if (confirm(`Hapus keanggotaan ${m.user.email}? Akun global tidak dihapus.`)) void send({ action: "remove", id: m.id }); }}>Hapus keanggotaan</button>
            </>}
          </div>
        </>}
      </section>)}
    </>}
  </main>;
}
