import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Factory,
  FileSpreadsheet,
  Handshake,
  Layers,
  LayoutDashboard,
  MapPin,
  Package,
  Receipt,
  Rocket,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  Warehouse,
  Zap,
} from "lucide-react";

export const WA =
  "https://wa.me/6281296659251?text=Halo%2C%20saya%20tertarik%20dengan%20Arunika%20ERP";

export const PRODUCTS = [
  {
    key: "sales",
    icon: ShoppingCart,
    name: "Penjualan & CRM",
    benefit: "Kelola pelanggan dari penawaran hingga pembayaran",
    desc: "Order, pengiriman, invoice, POS, dan pipeline pelanggan",
    cat: "ops",
  },
  {
    key: "buy",
    icon: Truck,
    name: "Pembelian",
    benefit: "Kontrol pembelian dan biaya dengan alur persetujuan",
    desc: "PR, RFQ, PO, penerimaan, tagihan, dan 3-way match",
    cat: "ops",
  },
  {
    key: "inv",
    icon: Warehouse,
    name: "Inventori & WMS",
    benefit: "Ketahui stok di setiap gudang secara real time",
    desc: "Multi-gudang, bin, transfer, opname, dan reservasi stok",
    cat: "ops",
  },
  {
    key: "fin",
    icon: Wallet,
    name: "Akuntansi",
    benefit: "Laporan keuangan selalu mengikuti transaksi",
    desc: "COA, jurnal, bank, budget, aset, dan closing",
    cat: "fin",
  },
  {
    key: "tax",
    icon: FileSpreadsheet,
    name: "Pajak",
    benefit: "Pantau performa dan siapkan kebutuhan pajak",
    desc: "Tax code, dokumen pajak, PPN/PPh, ekspor e-Faktur",
    cat: "fin",
  },
  {
    key: "mfg",
    icon: Factory,
    name: "Produksi & MRP",
    benefit: "Hubungkan produksi, proyek, dan tenaga kerja",
    desc: "BOM, routing, production order, dan perencanaan bahan",
    cat: "ops",
  },
  {
    key: "hr",
    icon: Users,
    name: "SDM & Payroll",
    benefit: "SDM terhubung ke operasional dan payroll",
    desc: "Karyawan, absensi, cuti, dan penggajian",
    cat: "people",
  },
  {
    key: "prj",
    icon: Building2,
    name: "Proyek",
    benefit: "Budget, timesheet, dan profitabilitas proyek",
    desc: "Budget proyek, timesheet, dan profitabilitas",
    cat: "ops",
  },
  {
    key: "ai",
    icon: Sparkles,
    name: "AI Insight",
    benefit: "Insight yang tidak berhenti di grafik",
    desc: "Prediksi stok, risiko piutang, dan anomali transaksi",
    cat: "ai",
  },
] as const;

export const PAINS = [
  {
    title: "Data tersebar",
    desc: "Penjualan, stok, bank, dan laporan berada di file atau aplikasi yang berbeda.",
  },
  {
    title: "Pencatatan berulang",
    desc: "Tim memasukkan informasi yang sama ke beberapa sistem.",
  },
  {
    title: "Sulit membaca kondisi bisnis",
    desc: "Laporan baru tersedia setelah data dikumpulkan secara manual.",
  },
  {
    title: "Risiko kesalahan lebih tinggi",
    desc: "Stok, piutang, pajak, dan jurnal tidak selalu sinkron.",
  },
] as const;

export const FLOW_STEPS = [
  { label: "Sales Order", detail: "Reservasi stok otomatis" },
  { label: "Pengiriman", detail: "Mutasi gudang real-time" },
  { label: "Invoice", detail: "Piutang & pajak terbit" },
  { label: "Pembayaran", detail: "Kas & bank sinkron" },
  { label: "Jurnal", detail: "Posting rules tanpa double entry" },
] as const;

export const BENTO = [
  {
    key: "flow",
    span: "lg:col-span-7 lg:row-span-2",
    title: "Satu transaksi menggerakkan seluruh proses",
    desc: "Sales Order hingga jurnal otomatis — tanpa input ulang.",
    image: "https://picsum.photos/seed/arunika-ops/1200/900",
  },
  {
    key: "stock",
    span: "lg:col-span-5",
    title: "Multi-gudang & bin",
    desc: "Stok, transfer, dan reservasi dalam satu sumber data.",
    image: "https://picsum.photos/seed/arunika-warehouse/900/600",
  },
  {
    key: "ledger",
    span: "lg:col-span-5",
    title: "Jurnal dari dokumen bisnis",
    desc: "Posting rules menjaga FS, aging, dan cash flow selaras.",
    image: "https://picsum.photos/seed/arunika-finance/900/600",
  },
  {
    key: "tax",
    span: "lg:col-span-4",
    title: "Pajak Indonesia",
    desc: "PPN/PPh, tax code, ekspor e-Faktur CSV.",
  },
  {
    key: "ai",
    span: "lg:col-span-4",
    title: "AI dengan aksi",
    desc: "Prediksi stok, risiko AR, anomali margin.",
  },
  {
    key: "access",
    span: "lg:col-span-4",
    title: "Kontrol & audit",
    desc: "Role, approval, period lock, audit log.",
  },
] as const;

export const AI_INSIGHTS = [
  {
    title: "Prediksi stok",
    body: "Produk A diperkirakan habis dalam 9 hari berdasarkan tren penjualan empat minggu terakhir.",
    action: "Buat Purchase Request",
  },
  {
    title: "Risiko pembayaran",
    body: "Tiga pelanggan memiliki pola keterlambatan pembayaran lebih dari 30 hari.",
    action: "Tinjau limit kredit",
  },
  {
    title: "Perubahan margin",
    body: "Margin kategori Elektronik menurun 4,6% karena kenaikan biaya pembelian.",
    action: "Lihat analisis",
  },
  {
    title: "Anomali transaksi",
    body: "Ditemukan kenaikan nilai retur sebesar 28% dibanding bulan sebelumnya.",
    action: "Periksa transaksi",
  },
] as const;

export const USPS = [
  {
    icon: Boxes,
    title: "Ekosistem terintegrasi",
    desc: "Konsolidasikan penjualan, stok, pembelian, keuangan, dan SDM dalam satu sistem.",
  },
  {
    icon: Zap,
    title: "Operasional efisien",
    desc: "Automasikan jurnal, matching tagihan, dan alur approval.",
  },
  {
    icon: ShieldCheck,
    title: "Kontrol & kepatuhan",
    desc: "RBAC, audit log, period lock, credit limit, dan pajak Indonesia.",
  },
  {
    icon: BarChart3,
    title: "Insight berbasis data",
    desc: "Dashboard real-time dan AI insight untuk kas, stok, dan piutang.",
  },
  {
    icon: Package,
    title: "Siap berkembang",
    desc: "Modul diaktifkan sesuai tahap pertumbuhan bisnis Anda.",
  },
  {
    icon: Building2,
    title: "Dibangun untuk Indonesia",
    desc: "Alur bisnis, pajak, dan bahasa lokal — dukungan implementasi Arunika.",
  },
] as const;

export const TESTIMONIALS = [
  {
    id: "dist",
    industry: "Distribusi",
    icon: Truck,
    metric: "1 sistem",
    metricLabel: "untuk gudang & piutang",
    quote:
      "Stok multi-gudang dan piutang pelanggan akhirnya sinkron. Tim tidak lagi menunggu rekap spreadsheet di akhir bulan.",
    name: "Rina S.",
    role: "Finance Manager",
    company: "Distribusi Nusantara",
    initials: "RS",
  },
  {
    id: "retail",
    industry: "Retail",
    icon: Store,
    metric: "3-way",
    metricLabel: "match PO · GR · Bill",
    quote:
      "Approval pembelian dan matching tagihan jadi terkontrol. Tidak lagi lewat chat yang hilang.",
    name: "Budi H.",
    role: "Operations Lead",
    company: "Retail Sejahtera",
    initials: "BH",
  },
  {
    id: "mfg",
    industry: "Manufaktur",
    icon: Factory,
    metric: "End-to-end",
    metricLabel: "PO sampai jurnal",
    quote:
      "Satu alur dari PO sampai jurnal otomatis mengurangi double entry dan kesalahan stok bahan.",
    name: "Maya K.",
    role: "Owner",
    company: "Manufaktur Prima",
    initials: "MK",
  },
] as const;

export const FAQS = [
  {
    q: "Apa itu Arunika ERP?",
    a: "Arunika ERP adalah software ERP berbasis cloud untuk mengelola penjualan, pembelian, inventori, akuntansi, pajak, produksi, SDM, dan proyek dalam satu sistem yang saling terhubung.",
  },
  {
    q: "Apakah cocok untuk UMKM dan perusahaan menengah?",
    a: "Ya. Anda dapat memulai dari modul inti (penjualan, stok, keuangan) lalu menambahkan manufaktur, HR, atau multi-company seiring pertumbuhan bisnis.",
  },
  {
    q: "Apakah modul saling terintegrasi?",
    a: "Ya. Setiap dokumen bisnis dapat memperbarui stok, piutang/utang, dan jurnal otomatis melalui posting rules — tanpa input berulang.",
  },
  {
    q: "Apakah mendukung multi-perusahaan dan multi-gudang?",
    a: "Ya. Arunika mendukung multi-company, multi-cabang, dan multi-gudang dengan hak akses per peran.",
  },
  {
    q: "Apakah mendukung pajak Indonesia?",
    a: "Arunika mendukung tax code, NPWP/PKP, dokumen pajak, serta ekspor e-Faktur CSV untuk persiapan pelaporan.",
  },
  {
    q: "Bagaimana cara mulai menggunakan Arunika?",
    a: "Daftar akun gratis, buat perusahaan melalui onboarding, atau hubungi kami via WhatsApp untuk demo dan konsultasi kebutuhan modul.",
  },
] as const;

export const CLIENT_PLACEHOLDERS: Array<{ name: string; icon: LucideIcon }> = [
  { name: "Distribusi", icon: Truck },
  { name: "Retail", icon: Store },
  { name: "Manufaktur", icon: Factory },
  { name: "F&B", icon: UtensilsCrossed },
  { name: "Jasa", icon: Handshake },
  { name: "Logistik", icon: MapPin },
  { name: "Konstruksi", icon: Building2 },
  { name: "Trading", icon: Scale },
];

export const STATS: Array<{ n: string; l: string; icon: LucideIcon }> = [
  { n: "14+", l: "Modul bisnis", icon: Layers },
  { n: "1", l: "Sumber data terpadu", icon: LayoutDashboard },
  { n: "Real-time", l: "Dashboard & laporan", icon: BarChart3 },
  { n: "ID", l: "Pajak & alur lokal", icon: Receipt },
];

export const PRICING = [
  {
    name: "Starter",
    icon: Rocket,
    desc: "Penjualan, stok, dan keuangan inti untuk usaha yang baru digital.",
    cta: "Coba gratis",
  },
  {
    name: "Business",
    icon: Star,
    desc: "Multi-divisi, multi-gudang, approval, pajak, dan laporan lengkap.",
    cta: "Konsultasi",
    featured: true,
  },
  {
    name: "Enterprise",
    icon: Building2,
    desc: "Multi-company, manufaktur, HR, kustomisasi, dan dukungan prioritas.",
    cta: "Hubungi sales",
  },
] as const;

export const NAV_LINKS: Array<{ id: string; label: string; icon: LucideIcon }> =
  [
    { id: "produk", label: "Produk", icon: Package },
    { id: "solusi", label: "Solusi", icon: Handshake },
    { id: "alur", label: "Alur", icon: Layers },
    { id: "harga", label: "Harga", icon: BadgePercent },
    { id: "faq", label: "FAQ", icon: BookOpen },
  ];

export const SCRUB_WORDS =
  "Arunika menghubungkan setiap proses sehingga satu transaksi memperbarui stok, piutang, pajak, dan laporan secara otomatis.";
