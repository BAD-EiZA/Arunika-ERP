import Link from "next/link";
import {
  LoginLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";
import { Button as HeroButton, Chip } from "@heroui/react";
import {
  ArrowRight,
  Building2,
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Wallet,
  Warehouse,
} from "lucide-react";
import { getSessionUser, listUserCompanies } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    icon: Warehouse,
    title: "Inventori & WMS",
    points: [
      "Stok multi-gudang dengan saldo on-hand & reserved",
      "Bin location (WMS), transfer antar gudang, opname",
      "Reservasi stok otomatis saat SO disetujui",
      "Rata-rata cost & mutasi stok tercatat rapi",
    ],
  },
  {
    icon: Truck,
    title: "Procurement",
    points: [
      "Purchase Request → RFQ → Purchase Order",
      "Goods Receipt & tagihan pemasok (bill)",
      "3-way match: PO · GR · Bill",
      "Pembayaran multi-alokasi ke beberapa bill",
    ],
  },
  {
    icon: ShoppingCart,
    title: "Sales, CRM & POS",
    points: [
      "Sales Order · Delivery · Invoice (termasuk cicilan)",
      "Credit limit pelanggan dicek saat SO & invoice",
      "CRM lead & opportunity, plus POS kasir",
      "Credit/debit note & return pelanggan/pemasok",
    ],
  },
  {
    icon: Wallet,
    title: "Keuangan",
    points: [
      "Chart of Accounts, jurnal multi-baris, draft & reverse",
      "Cost center & tag per baris jurnal",
      "Periode buka/tutup/kunci, year-end close ke laba ditahan",
      "Bank recon, bank feed CSV, budget vs actual, aset tetap, biaya",
      "Recurring jurnal & invoice, approval matrix",
    ],
  },
  {
    icon: FileSpreadsheet,
    title: "Laporan & Pajak",
    points: [
      "Laporan FS: neraca, laba rugi, arus kas, general ledger",
      "Aging piutang (AR) & utang (AP)",
      "Tax code, NPWP/PKP, dokumen pajak",
      "Export e-Faktur CSV (offline prep)",
    ],
  },
  {
    icon: Factory,
    title: "Operasi & SDM",
    points: [
      "Manufaktur: BOM, routing, production order",
      "MRP planning & convert ke PR/PO",
      "HR, absensi, cuti, payroll",
      "Project, claim, AI insight operasional",
    ],
  },
];

const HIGHLIGHTS = [
  { label: "Hak akses", value: "Role & audit" },
  { label: "Posting GL", value: "Otomatis per dokumen" },
  { label: "Pajak", value: "PPN · PPh · PKP" },
  { label: "AI", value: "Insight & forecast" },
];

export default async function HomePage() {
  let user = null as Awaited<ReturnType<typeof getSessionUser>>;
  let memberships: Awaited<ReturnType<typeof listUserCompanies>> = [];
  try {
    user = await getSessionUser();
    memberships = user ? await listUserCompanies(user.id) : [];
  } catch {
    // DB may be offline during first setup
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5fafd] text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-[28rem] rounded-full bg-[#BBE1FA]/25 blur-3xl" />
        <div className="absolute right-0 top-1/4 size-[22rem] rounded-full bg-[#0F4C75]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-[20rem] rounded-full bg-[#3282B8]/12 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(50,130,184,0.18),_transparent_55%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-6 md:px-8">
        <header className="mb-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B262C] to-[#3282B8] text-sm font-bold text-[#BBE1FA] shadow-md">
              A
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">Arunika ERP</div>
              <div className="text-[11px] text-muted">Operasi & keuangan</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href={memberships.length ? "/dashboard" : "/onboarding"}>
                <HeroButton variant="primary" size="sm">
                  <LayoutDashboard className="mr-1.5 size-3.5" />
                  {memberships.length ? "Dashboard" : "Onboarding"}
                </HeroButton>
              </Link>
            ) : (
              <>
                <LoginLink>
                  <HeroButton variant="ghost" size="sm">
                    Masuk
                  </HeroButton>
                </LoginLink>
                <RegisterLink>
                  <HeroButton variant="primary" size="sm">
                    Daftar
                  </HeroButton>
                </RegisterLink>
              </>
            )}
          </div>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <Chip color="accent" size="sm" variant="soft" className="mb-4">
              <Chip.Label className="flex items-center gap-1.5">
                <Sparkles className="size-3" />
                ERP lengkap untuk bisnis
              </Chip.Label>
            </Chip>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.1] tracking-tight text-[#1B262C] md:text-5xl lg:text-[3.25rem]">
              Operasi, stok, dan keuangan{" "}
              <span className="bg-gradient-to-r from-[#0F4C75] to-[#3282B8] bg-clip-text text-transparent">
                dalam satu alur
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted md:text-lg">
              Dari pembelian dan penjualan hingga jurnal, bank, pajak,
              manufaktur, SDM, dan laporan — satu sistem untuk menjalankan
              operasional harian.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <Link href={memberships.length ? "/dashboard" : "/onboarding"}>
                  <HeroButton variant="primary" size="lg">
                    {memberships.length
                      ? "Buka dashboard"
                      : "Buat perusahaan"}
                    <ArrowRight className="ml-1.5 size-4" />
                  </HeroButton>
                </Link>
              ) : (
                <>
                  <RegisterLink>
                    <HeroButton variant="primary" size="lg">
                      Mulai gratis
                      <ArrowRight className="ml-1.5 size-4" />
                    </HeroButton>
                  </RegisterLink>
                  <LoginLink>
                    <HeroButton variant="secondary" size="lg">
                      Masuk
                    </HeroButton>
                  </LoginLink>
                </>
              )}
            </div>
            {user ? (
              <p className="mt-4 text-sm text-muted">
                Halo,{" "}
                <span className="font-medium text-foreground">
                  {user.name || user.email}
                </span>
                {memberships.length
                  ? ` · ${memberships.length} perusahaan`
                  : " · belum punya perusahaan"}
              </p>
            ) : null}
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rounded-[1.75rem] bg-gradient-to-br from-[#1B262C]/20 via-[#3282B8]/25 to-transparent blur-xl" />
            <div className="relative overflow-hidden rounded-3xl border border-[#1B262C]/10 bg-gradient-to-br from-[#1B262C] via-[#0F4C75] to-[#3282B8] p-6 text-[#BBE1FA] shadow-2xl md:p-8">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-10 left-8 size-28 rounded-full bg-[#BBE1FA]/30 blur-2xl" />
              <div className="relative">
                <div className="mb-6 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wider text-white/70">
                    Ringkasan kemampuan
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px]">
                    <span className="size-1.5 rounded-full bg-emerald-300" />
                    Siap pakai
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {HIGHLIGHTS.map((h) => (
                    <div
                      key={h.label}
                      className="rounded-2xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-sm"
                    >
                      <div className="text-[11px] text-white/65">{h.label}</div>
                      <div className="mt-1 text-sm font-semibold">{h.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-white/70">
                    <ShieldCheck className="size-3.5" />
                    Kontrol & keamanan
                  </div>
                  <p className="text-sm leading-relaxed text-white/90">
                    Hak akses per peran, audit log, kunci periode, tutup tahun,
                    batasan kredit pelanggan, dan matriks approval dokumen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { n: "14+", l: "Modul bisnis" },
            { n: "GL", l: "Jurnal multi-line" },
            { n: "AR/AP", l: "Aging & payment" },
            { n: "AI", l: "Insight cerdas" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-2xl border border-[#1B262C]/8 bg-white/70 px-4 py-4 text-center shadow-sm backdrop-blur-sm"
            >
              <div className="text-xl font-bold text-[#0F4C75] md:text-2xl">
                {s.n}
              </div>
              <div className="mt-0.5 text-xs text-muted md:text-sm">{s.l}</div>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-[#1B262C]">
              Fitur lengkap
            </h2>
            <p className="mt-1 text-sm text-muted">
              Detail modul dari master data hingga laporan dan operasi.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.title}
                  className="group rounded-2xl border border-[#1B262C]/8 bg-white/75 p-5 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[#3282B8]/40 hover:shadow-md"
                >
                  <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B262C]/10 to-[#BBE1FA]/40 text-[#0F4C75] transition group-hover:from-[#0F4C75] group-hover:to-[#3282B8] group-hover:text-[#BBE1FA]">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold text-foreground">{m.title}</h3>
                  <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
                    {m.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-[#3282B8]" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-16">
          <div className="relative overflow-hidden rounded-3xl border border-[#1B262C]/10 bg-gradient-to-br from-[#1B262C] to-[#0F4C75] p-6 text-[#BBE1FA] shadow-lg md:p-8">
            <div className="pointer-events-none absolute -right-6 -top-6 size-28 rounded-full bg-[#3282B8]/35 blur-2xl" />
            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="size-4" />
                  Siap dipakai tim Anda
                </div>
                <p className="max-w-md text-sm leading-relaxed text-[#BBE1FA]/85">
                  Onboarding perusahaan, bagan akun default, aturan posting,
                  multi-user, dan dashboard operasional — langsung mulai kerja.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {user ? (
                  <Link
                    href={memberships.length ? "/dashboard" : "/onboarding"}
                  >
                    <HeroButton
                      variant="secondary"
                      className="bg-white text-[#1B262C] data-[hovered=true]:bg-[#BBE1FA]"
                    >
                      Lanjut ke ERP
                      <ArrowRight className="ml-1.5 size-4" />
                    </HeroButton>
                  </Link>
                ) : (
                  <>
                    <RegisterLink>
                      <HeroButton
                        variant="secondary"
                        className="bg-white text-[#1B262C] data-[hovered=true]:bg-[#BBE1FA]"
                      >
                        Buat akun
                      </HeroButton>
                    </RegisterLink>
                    <LoginLink>
                      <HeroButton
                        variant="ghost"
                        className="text-[#BBE1FA] data-[hovered=true]:bg-white/10"
                      >
                        Sudah punya akun?
                      </HeroButton>
                    </LoginLink>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-[#1B262C]/10 pt-6 text-center text-xs text-muted">
          © 2026 BAD-EiZA. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
