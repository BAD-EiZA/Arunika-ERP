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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  usePayrollMutation,
  usePayrollQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { Banknote, FileEdit, Plus, Wallet } from "lucide-react";

type PayrollData = {
  disbursements: Array<{ id: string; accountCode: string; amount: string; status: string }>;
  policyTemplate: unknown;
  policies: Array<{ id: string; status: string; effectiveFrom: string; config: unknown }>;
  employees: Array<{ id: string; name: string }>;
  profiles: Array<{ id: string; employeeId: string; taxStatus: string; jkkRiskClass: string; effectiveFrom: string }>;
  runs: Array<{
    id: string;
    number: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    totalGross: string;
    totalDeduction: string;
    totalNet: string;
    lines: Array<{
      employeeId: string;
      detail: unknown;
      employeeName: string;
      baseSalary: string;
      grossPay: string;
      netPay: string;
      taxAmount: string;
      bpjsAmount: string;
    }>;
  }>;
};

function payTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "POSTED" || s === "PAID") return "success";
  if (s === "APPROVED") return "success";
  if (s === "DRAFT") return "warning";
  return "default";
}

export function PayrollClient() {
  const query = usePayrollQuery();
  const mutation = usePayrollMutation();
  const data = query.data as PayrollData | undefined;
  const [showPrepare, setShowPrepare] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const runs = useMemo(() => data?.runs ?? [], [data]);

  const stats = useMemo(() => {
    let draft = 0;
    let net = 0;
    for (const r of runs) {
      if (r.status === "DRAFT") draft += 1;
      net += Number(r.totalNet) || 0;
    }
    return { count: runs.length, draft, net };
  }, [runs]);

  return (
    <ListPageShell>
      <PageHeader
        title="Payroll"
        description="Bulanan · policy efektif tervalidasi · kontrak resident dengan prorata eksplisit · sumber lembur approved · pajak direkonsiliasi bulan akhir"
        actions={
          <Button
            type="button"
            onClick={() => setShowPrepare((v) => !v)}
            variant={showPrepare ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showPrepare ? "Tutup form" : "Siapkan payroll"}
          </Button>
        }
      />

      <MutationError error={mutation.error} />
      <p className="text-sm">Kebijakan wajib dikonfirmasi tenaga profesional; maker dan checker terpisah. Tahun setelah 2026 memerlukan validThrough, sources, ceiling JP per tahun, serta konfigurasi employmentTypes/proration/residentPartialYear. Pegawai harian, nonresident, dan lembur hari libur tetap ditolak. Siapkan sumber absensi/lembur di <a className="underline" href="/hr">HR</a>. Akun 5200/5300 (EXPENSE), 2105/2106/2101 (LIABILITY) wajib tersedia di <a className="underline" href="/finance/accounts">manajemen akun</a>.</p>
      <p className="text-sm"><a href="/api/erp/payroll/payslips" className="underline">Slip saya (ESS)</a> · Potongan sukarela memerlukan akun 2107 LIABILITY; pencairannya di luar settlement 2101/2105/2106. THR/bonus masuk TER bulanan; Desember menghitung ulang bruto tahunan. Tarif lembur profil harus diverifikasi HR; checker menyetujui jam bersama payroll.</p>
      <Card title="Pencairan payroll">{(data?.disbursements ?? []).map(d => <div key={d.id} className="flex gap-3 p-2"><span>{d.accountCode} · {formatIdr(d.amount)} · {d.status}</span>{d.status === "PENDING_APPROVAL" && <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "settleDisbursement", id: d.id })}>Checker: setujui dan posting pembayaran</Button>}</div>)}</Card>
      <Card title="1. Kebijakan efektif (immutable; buat versi baru untuk perubahan)">
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          const values = formToObject(e.currentTarget);
          try {
            const config = JSON.parse(String(values.config));
            setPolicyError("");
            mutation.mutate({ action: "createPolicy", effectiveFrom: values.effectiveFrom, notes: values.notes, config });
          } catch { setPolicyError("JSON konfigurasi tidak valid"); }
        }}>
          <Field label="Tanggal efektif"><Input type="date" name="effectiveFrom" required /></Field>
          <Field label="Konfigurasi JSON — isi bpjs.JP.ceilings dengan tanggal dan cap yang diverifikasi; periksa seluruh tarif">
            <textarea aria-label="Konfigurasi kebijakan JSON" name="config" required rows={10} className="w-full rounded border p-2 font-mono text-xs" defaultValue={data ? JSON.stringify(data.policyTemplate, null, 2) : ""} key={data ? "loaded" : "loading"} />
          </Field>
          <Field label="Sumber JP dan catatan verifikasi manusia"><Input name="notes" required /></Field>
          <p role="alert">{policyError}</p>
          <Button type="submit" disabled={mutation.isPending || !data}>Ajukan kebijakan untuk checker</Button>
        </form>
        {(data?.policies ?? []).map(p => <div key={p.id} className="mt-3 border-t pt-2">
          <span>{formatDateId(p.effectiveFrom)} · {p.status} </span>
          <details><summary>Lihat snapshot kebijakan sebelum menyetujui</summary><pre className="overflow-auto text-xs">{JSON.stringify(p.config, null, 2)}</pre></details>
          {p.status === "PENDING_APPROVAL" && <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "approvePolicy", id: p.id })}>Konfirmasi aturan dan setujui kebijakan</Button>}
        </div>)}
      </Card>
      <Card title="2. Profil pajak karyawan resident">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); mutation.mutate({ action: "createProfile", employmentType: "PERMANENT", ...formToObject(e.currentTarget) }); }}>
          <Field label="Karyawan"><select name="employeeId" aria-label="Karyawan" required className="rounded border p-2">{(data?.employees ?? []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Tipe pegawai"><select name="employmentType" aria-label="Tipe pegawai" className="rounded border p-2"><option value="PERMANENT">Tetap</option><option value="CONTRACT">Kontrak resident (wajib policy approved)</option></select></Field>
          <Field label="Efektif"><Input type="date" name="effectiveFrom" required /></Field>
          <Field label="PTKP"><select name="taxStatus" aria-label="PTKP" className="rounded border p-2">{["TK/0","TK/1","TK/2","TK/3","K/0","K/1","K/2","K/3"].map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Kelas risiko JKK"><select name="jkkRiskClass" aria-label="Kelas risiko JKK" className="rounded border p-2">{["SANGAT_RENDAH","RENDAH","SEDANG","TINGGI","SANGAT_TINGGI"].map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Tunjangan tetap"><Input name="fixedAllowance" type="number" min="0" step="0.01" defaultValue="0" /></Field>
          <Field label="Tarif lembur per jam (diverifikasi HR)"><Input name="overtimeRate" type="number" min="0" step="0.01" defaultValue="0" /></Field>
          <Field label="User ID ESS (anggota aktif, opsional)"><Input name="payrollUserId" /></Field>
          <label><input type="checkbox" required /> Saya konfirmasi resident; metode pajak, prorata join/terminasi ditinjau profesional sesuai policy.</label>
          <Button type="submit" disabled={mutation.isPending || !data?.employees.length}>Simpan profil baru</Button>
        </form>
        {(data?.profiles ?? []).map(p => <p key={p.id}>{data?.employees.find(e => e.id === p.employeeId)?.name ?? p.employeeId} · {p.taxStatus} · {p.jkkRiskClass} · {formatDateId(p.effectiveFrom)}</p>)}
      </Card>
      {showPrepare ? (
        <Card title="Siapkan payroll">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                {
                  action: "prepare",
                  ...formToObject(e.currentTarget),
                  components: (data?.employees ?? []).map(employee => { const values = formToObject(e.currentTarget); return { employeeId: employee.id, thr: String(values[`thr_${employee.id}`] ?? "0"), bonusRegular: String(values[`regular_${employee.id}`] ?? "0"), bonusIrregular: String(values[`irregular_${employee.id}`] ?? "0"), overtimeHours: String(values[`hours_${employee.id}`] ?? "0"), voluntaryDeduction: String(values[`deduction_${employee.id}`] ?? "0") }; }),
                },
                {
                  onSuccess: () => {
                    setShowPrepare(false);
                  },
                },
              );
            }}
          >
            <FormGrid>
              <Field label="Periode mulai">
                <Input name="periodStart" type="date" required />
              </Field>
              <Field label="Periode selesai">
                <Input name="periodEnd" type="date" required />
              </Field>
            </FormGrid>
            {(data?.employees ?? []).map(employee => <fieldset key={employee.id} className="rounded border p-3"><legend>{employee.name}</legend><FormGrid>{[["thr", "THR"], ["regular", "Bonus teratur"], ["irregular", "Bonus tidak teratur"], ["hours", "Jam lembur diajukan (disetujui checker payroll)"], ["deduction", "Potongan sukarela disetujui karyawan"]].map(([key, label]) => <Field key={key} label={label}><Input name={`${key}_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" /></Field>)}</FormGrid></fieldset>)}
            <MutationError error={mutation.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                Prepare payroll
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPrepare(false)}
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
        loadingLabel="Memuat payroll..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Runs" value={stats.count} icon={Banknote} />
            <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
            <StatCard
              label="Total net"
              value={formatIdr(stats.net)}
              icon={Wallet}
            />
          </div>

          <Card title="Payroll runs">
            {runs.length === 0 ? (
              <EmptyState
                compact
                icon={Banknote}
                title="Belum ada payroll run"
                message="Siapkan payroll untuk periode gaji karyawan."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPrepare(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Siapkan payroll
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {runs.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-border/70 bg-white p-4 shadow-[0_2px_8px_rgba(15,76,117,0.04)]"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#0F4C75]">
                          {r.number}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDateId(r.periodStart)} —{" "}
                          {formatDateId(r.periodEnd)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={payTone(r.status)}>{r.status}</Badge>
                        {r.status === "DRAFT" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({
                                action: "approve",
                                id: r.id,
                              })
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {r.status === "APPROVED" ? (
                          <Button
                            type="button"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({ action: "post", id: r.id })
                            }
                          >
                            Post
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        Gross:{" "}
                        <span className="font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(r.totalGross)}
                        </span>
                      </div>
                      <div>
                        Potongan:{" "}
                        <span className="tabular-nums">
                          {formatIdr(r.totalDeduction)}
                        </span>
                      </div>
                      <div>
                        Net:{" "}
                        <span className="font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(r.totalNet)}
                        </span>
                      </div>
                    </div>
                    {r.status === "POSTED" ? (
                      <details className="mb-3">
                        <summary className="text-sm">Pencairan utang payroll (maker–checker, idempotent)</summary>
                        <form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); const v = formToObject(e.currentTarget); mutation.mutate({ action: "createDisbursement", payrollRunId: r.id, ...v }); }}>
                          <FormGrid>
                            <Field label="Utang"><select name="accountCode" aria-label="Akun utang" className="rounded border p-2"><option value="2101">2101 Gaji ({formatIdr(r.totalNet)})</option><option value="2105">2105 BPJS</option><option value="2106">2106 PPh 21</option></select></Field>
                            <Field label="Nominal (wajib = utang)"><Input name="amount" type="number" min="0" step="0.01" required defaultValue={r.totalNet} /></Field>
                            <Field label="Akun bank (ASSET)"><Input name="bankAccountCode" required defaultValue="1102" /></Field>
                            <Field label="Tanggal"><Input name="paymentDate" type="date" required /></Field>
                            <Field label="Idempotency key"><Input name="idempotencyKey" required defaultValue={`disb-${r.id}-2101`} /></Field>
                          </FormGrid>
                          <Button type="submit" disabled={mutation.isPending}>Ajukan pencairan untuk checker</Button>
                        </form>
                      </details>
                    ) : null}
                    <Table
                      headers={[
                        "Karyawan",
                        "Gaji",
                        "Gross",
                        "PPh",
                        "BPJS",
                        "Net",
                      ]}
                    >
                      {r.lines.map((l, idx) => (
                        <tr key={`${r.id}-${idx}`}>
                          <td className="px-3 py-2">{l.employeeName}<a className="ml-2 underline" href={`/api/erp/payroll/payslips?employeeId=${encodeURIComponent(l.employeeId)}`}>Slip privat</a><details><summary>THR / komponen / rekalkulasi Desember</summary><pre className="text-xs">{JSON.stringify(l.detail, null, 2)}</pre></details></td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.baseSalary)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.grossPay)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.taxAmount)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.bpjsAmount)}
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                            {formatIdr(l.netPay)}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
