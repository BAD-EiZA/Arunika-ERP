# Product Requirements Document

## ERP SaaS Terintegrasi untuk Dagang, Distribusi, Manufaktur, Keuangan, HR, dan Project

**Nama sementara produk:** Arunika ERP  
**Versi dokumen:** 2.0  
**Status:** Draft untuk perencanaan produk dan pengembangan  
**Platform:** Web application responsif  
**Bahasa awal:** Bahasa Indonesia  
**Target pasar:** Perusahaan dagang, distributor, manufaktur, kontraktor, jasa profesional, dan bisnis multi-cabang  
**Model produk:** SaaS multi-tenant  
**Timezone default:** Asia/Jakarta  
**Mata uang default:** IDR  
**Tanggal dokumen:** 14 Juli 2026  

---

# 1. Ringkasan Eksekutif

Arunika ERP adalah aplikasi Enterprise Resource Planning berbasis web untuk membantu perusahaan dagang, distribusi, manufaktur, kontraktor, dan jasa profesional mengelola operasional dalam satu sistem terintegrasi.

Produk ini menggabungkan pengelolaan:

- Pengguna, organisasi, dan hak akses
- Perusahaan, legal entity, cabang, dan gudang
- Produk, bahan baku, barang jadi, jasa, dan aset
- Pelanggan, pemasok, dan kontrak
- Persediaan dan pergerakan barang
- Procurement dan pembelian
- Penjualan, pengiriman, return, dan klaim
- Akuntansi double-entry dan keuangan
- Perpajakan Indonesia
- Manufaktur, produksi, dan costing
- Human resources, absensi, dan payroll
- Project management dan project accounting
- Dokumen dan lampiran
- Laporan operasional, finansial, dan manajerial
- Audit aktivitas dan kontrol internal

Aplikasi dirancang sebagai sistem multi-tenant. Satu akun pengguna dapat memiliki akses ke satu atau beberapa perusahaan. Setiap perusahaan dapat memiliki beberapa cabang, gudang, pengguna, pelanggan, pemasok, dan transaksi.

Identitas pengguna dikelola menggunakan Kinde. Seluruh data bisnis disimpan di PostgreSQL melalui Supabase dan diakses menggunakan Prisma ORM. Dokumen serta gambar disimpan di Cloudinary. Aplikasi Next.js dijalankan di Vercel.

Arsitektur utama:

```text
Pengguna
   │
   ▼
Next.js di Vercel
   │
   ├── Kinde Auth
   ├── Prisma ORM
   ├── Cloudinary
   │
   ▼
Supabase PostgreSQL
```

Produk dikembangkan bertahap, tetapi rancangan target mencakup alur bisnis lintas-fungsi:

```text
Procurement
Purchase Request → RFQ → Vendor Selection → Purchase Order
→ Goods Receipt → Supplier Invoice → Payment

Sales
Quotation → Sales Order → Delivery → Invoice → Receipt
→ Return / Claim / Credit Note

Manufacturing
Demand → MRP → Production Order → Material Issue
→ Work in Process → Finished Goods → Production Costing

Human Resources
Recruitment → Employee → Attendance → Payroll
→ Tax and BPJS → Payslip → Accounting Posting

Project
Opportunity / Contract → Project → Tasks and Timesheets
→ Cost and Billing → Revenue and Profitability

Accounting
Source Transaction → Posting Rule → Journal Entry
→ General Ledger → Closing → Financial Statements
```

---

# 2. Latar Belakang

Banyak bisnis kecil dan menengah masih menggunakan kombinasi spreadsheet, aplikasi kasir, grup chat, dokumen fisik, dan sistem terpisah untuk mengelola operasional.

Kondisi tersebut menimbulkan sejumlah masalah:

1. Data stok tidak akurat.
2. Data penjualan dan pembelian tidak terhubung.
3. Dokumen sulit dilacak.
4. Persetujuan transaksi dilakukan melalui chat.
5. Tidak tersedia audit aktivitas yang jelas.
6. Pemilik bisnis kesulitan melihat kondisi perusahaan secara real-time.
7. Data sering diinput berulang kali.
8. Tidak ada pembatasan akses berdasarkan jabatan.
9. Laporan membutuhkan pengolahan manual.
10. Risiko manipulasi atau perubahan data sulit terdeteksi.

Arunika ERP dirancang untuk menjadi pusat kendali operasional perusahaan. Sistem harus cukup sederhana untuk digunakan staf operasional, tetapi tetap memiliki kontrol, keamanan, dan jejak audit yang dibutuhkan oleh perusahaan.

---

# 3. Visi Produk

Menyediakan ERP modern yang mudah digunakan, aman, modular, dan dapat berkembang bersama bisnis pengguna.

Produk harus membantu perusahaan mendapatkan satu sumber data yang konsisten untuk stok, pembelian, penjualan, pelanggan, pemasok, dan transaksi keuangan dasar.

---

# 4. Prinsip Produk

## 4.1 Satu sumber kebenaran

Data transaksi, stok, pelanggan, pemasok, dan dokumen harus berasal dari database terpusat.

## 4.2 Aman secara default

Setiap operasi harus memeriksa:

- Status autentikasi
- Keanggotaan perusahaan
- Cabang yang dapat diakses
- Role
- Permission
- Status transaksi
- Kepemilikan data

## 4.3 Mudah diaudit

Perubahan penting harus tercatat dalam audit log.

## 4.4 Tidak menghapus sejarah transaksi

Transaksi yang telah diposting tidak boleh dihapus secara permanen. Perubahan harus dilakukan melalui pembatalan, reversal, atau dokumen koreksi.

## 4.5 Mobile-friendly

Aplikasi harus dapat digunakan melalui laptop, tablet, dan ponsel.

## 4.6 Modular

Modul dapat dikembangkan secara bertahap tanpa merombak keseluruhan sistem.

## 4.7 Konsistensi lebih penting daripada kecepatan semu

Proses yang memengaruhi stok, pembayaran, dan saldo harus berjalan dalam transaksi database yang konsisten.

---

# 5. Tujuan Produk

## 5.1 Tujuan bisnis

1. Mengurangi penggunaan spreadsheet operasional.
2. Meningkatkan akurasi stok.
3. Mempercepat proses pembelian dan penjualan.
4. Menyediakan visibilitas kondisi bisnis.
5. Mengurangi duplikasi input data.
6. Membantu perusahaan menerapkan kontrol internal.
7. Menyediakan dasar bagi integrasi sistem di masa depan.
8. Mendukung bisnis multi-cabang.
9. Mendukung pertumbuhan jumlah transaksi dan pengguna.
10. Menjadi produk SaaS dengan paket berlangganan.

## 5.2 Tujuan pengguna

Pengguna harus dapat:

- Menemukan data dengan cepat.
- Membuat transaksi tanpa pelatihan yang rumit.
- Melihat status transaksi dengan jelas.
- Mengetahui siapa yang membuat atau mengubah transaksi.
- Mengetahui jumlah stok per gudang.
- Melacak dokumen dari awal sampai selesai.
- Mengekspor laporan ke spreadsheet.
- Mengunggah lampiran yang berhubungan dengan transaksi.
- Menggunakan sistem sesuai kewenangan masing-masing.

---

# 6. Sasaran Keberhasilan

Produk dianggap berhasil ketika:

1. Pengguna dapat menyelesaikan alur pembelian tanpa spreadsheet eksternal.
2. Pengguna dapat menyelesaikan alur penjualan tanpa spreadsheet eksternal.
3. Selisih stok dapat diketahui melalui riwayat mutasi.
4. Setiap perubahan transaksi memiliki jejak audit.
5. Data dari perusahaan berbeda tidak dapat saling diakses.
6. Pengguna dapat melihat laporan stok, pembelian, dan penjualan.
7. Proses posting transaksi menghasilkan perubahan stok yang konsisten.
8. Pengguna dapat mengelola dokumen melalui Cloudinary secara aman.
9. Deployment dapat dilakukan secara otomatis melalui Vercel.
10. Migrasi database dapat dijalankan secara terkontrol.

---

# 7. Ruang Lingkup Produk

## 7.1 Fondasi platform

Fondasi yang berlaku untuk seluruh modul:

1. Authentication menggunakan Kinde
2. Multi-company dan multi-legal-entity
3. Cabang, gudang, department, dan cost center
4. Role, permission, segregation of duties, dan approval matrix
5. Audit log
6. Document numbering
7. Cloudinary document management
8. Notification
9. Import dan export
10. Search
11. Workflow dan state machine
12. Idempotency dan optimistic locking
13. Reporting framework
14. Integration framework
15. Vercel deployment dan observability

## 7.2 Core operational release

Core operational release mencakup:

1. Onboarding perusahaan
2. Manajemen pengguna
3. Master produk
4. Kategori dan satuan
5. Pelanggan dan pemasok
6. Gudang dan persediaan
7. Purchase order
8. Penerimaan barang
9. Sales order
10. Pengiriman barang
11. Invoice dan pembayaran
12. Dashboard dan laporan dasar

## 7.3 Full ERP target scope

Target produk lengkap mencakup:

### Akuntansi dan keuangan

- Chart of Accounts
- Double-entry journal
- General ledger
- Accounts receivable
- Accounts payable
- Cash and bank
- Bank reconciliation
- Budgeting
- Cost center dan analytic dimensions
- Fixed assets dan depreciation
- Multi-currency
- Period closing
- Financial statements
- Consolidation readiness

### Pajak Indonesia

- Profil wajib pajak dan PKP
- PPN masukan dan keluaran
- PPh pemotongan dan pemungutan
- PPh 21 payroll
- Bukti potong
- Faktur pajak
- Tax period dan tax reconciliation
- Tax payment dan billing reference
- Correction dan amendment
- Ekspor atau integrasi data untuk layanan DJP/Coretax
- Audit trail pajak

### Manufaktur dan produksi

- Bill of Materials
- Routing
- Work center
- Production calendar
- Master Production Schedule
- Material Requirements Planning
- Production order
- Material issue dan return
- Work in process
- Finished goods receipt
- Batch, lot, serial, dan expiry
- Quality inspection
- Subcontract manufacturing
- Scrap dan rework
- Capacity planning
- Standard dan actual costing

### Human resources dan payroll

- Employee master
- Organization dan position
- Recruitment
- Onboarding dan offboarding
- Contract dan employment history
- Attendance
- Shift
- Leave
- Overtime
- Payroll
- BPJS Kesehatan
- BPJS Ketenagakerjaan
- PPh 21
- Reimbursement
- Employee loan
- Payslip
- Performance review
- Employee self-service
- Payroll accounting

### Advanced procurement

- Purchase request
- Request for quotation
- Vendor quotation
- Bid comparison
- Vendor selection
- Approval bertingkat
- Purchase contract
- Blanket purchase order
- Vendor evaluation
- Three-way matching
- Procurement budget control
- Procurement analytics

### Return dan claim

- Sales return
- Purchase return
- Customer claim
- Supplier claim
- Warranty claim
- Replacement
- Refund
- Credit note
- Debit note
- Inspection dan disposition
- Return merchandise authorization

### Project management

- Project dan program
- Work breakdown structure
- Task dan milestone
- Resource allocation
- Timesheet
- Project expense
- Project procurement
- Material issue ke project
- Project budget
- Project billing
- Project accounting
- Project profitability
- Risk, issue, dan change request

## 7.4 Modul opsional setelah full ERP core

- CRM dan sales pipeline
- Point of Sale
- Warehouse management lanjutan
- Fleet management
- Maintenance management
- Enterprise asset management
- Quality management lanjutan
- E-commerce dan marketplace integration
- Customer dan supplier portal
- Mobile native application
- Offline-first operation
- Advanced planning and scheduling
- AI forecasting dan anomaly detection
- Industry-specific extensions

## 7.5 Di luar tanggung jawab sistem

Sistem tidak memberikan nasihat hukum, pajak, akuntansi, atau ketenagakerjaan. Konfigurasi regulasi harus dapat diperbarui dan divalidasi oleh tenaga profesional perusahaan.

Arunika ERP tidak boleh mengasumsikan bahwa tarif, batas, formulir, atau metode perhitungan yang berlaku pada satu periode tetap berlaku selamanya. Semua aturan regulasi harus mendukung tanggal efektif dan histori versi.

---

# 8. Asumsi Produk

1. Produk awal digunakan oleh bisnis dagang dan distribusi.
2. Satu perusahaan dapat memiliki beberapa cabang.
3. Satu cabang dapat memiliki beberapa gudang.
4. Pengguna dapat menjadi anggota lebih dari satu perusahaan.
5. Hak akses pengguna dapat berbeda pada setiap perusahaan.
6. Satu pengguna memiliki satu identitas Kinde.
7. Database internal memiliki ID pengguna sendiri.
8. Kinde user ID disimpan sebagai external identity.
9. Data bisnis hanya diakses melalui server Next.js.
10. Browser tidak melakukan query langsung ke PostgreSQL.
11. Semua operasi Prisma menggunakan Node.js runtime.
12. Dokumen sensitif menggunakan akses authenticated di Cloudinary.
13. Foto produk dan logo dapat menggunakan akses public.
14. Mata uang awal adalah IDR.
15. Sistem menggunakan format tanggal Indonesia.
16. Waktu transaksi disimpan dalam UTC dan ditampilkan dalam timezone pengguna.
17. Sistem menggunakan soft delete untuk master data tertentu.
18. Transaksi yang telah diposting tidak dapat dihapus langsung.
19. Perubahan stok hanya boleh terjadi melalui stock movement.
20. Harga dan nilai uang menggunakan decimal, bukan floating point.
21. Akuntansi menggunakan prinsip double-entry.
22. Setiap sumber transaksi memiliki posting rule yang terversi.
23. Pajak dan payroll menggunakan konfigurasi bertanggal efektif.
24. Periode akuntansi yang telah ditutup tidak dapat menerima posting biasa.
25. Transaksi regulasi dapat dikoreksi tanpa menghapus sejarah awal.
26. Production order dan payroll run yang telah diposting bersifat immutable.
27. Setiap proyek dapat memiliki budget, cost center, dan analytic dimension.
28. Payroll data diklasifikasikan sebagai data sangat sensitif.
29. Integrasi pemerintah dipisahkan melalui adapter agar perubahan portal tidak merusak domain utama.
30. Sistem mendukung perbedaan kebijakan perusahaan melalui configuration, bukan fork kode.

---

# 9. Pemangku Kepentingan

## 9.1 Product owner

Bertanggung jawab atas:

- Prioritas fitur
- Validasi kebutuhan bisnis
- Persetujuan scope
- Keputusan produk
- Roadmap
- Go-live

## 9.2 Pemilik bisnis

Membutuhkan:

- Dashboard
- Laporan
- Kontrol pengguna
- Visibilitas transaksi
- Pengawasan cabang
- Informasi stok
- Informasi piutang dan utang

## 9.3 Admin perusahaan

Bertanggung jawab atas:

- Konfigurasi perusahaan
- Pengguna
- Role
- Cabang
- Gudang
- Nomor dokumen
- Master data

## 9.4 Staf pembelian

Bertanggung jawab atas:

- Purchase order
- Penerimaan barang
- Data pemasok
- Harga pembelian
- Dokumen pembelian

## 9.5 Staf penjualan

Bertanggung jawab atas:

- Pelanggan
- Sales order
- Harga jual
- Pengiriman
- Invoice

## 9.6 Staf gudang

Bertanggung jawab atas:

- Penerimaan barang
- Pengiriman barang
- Transfer stok
- Stock opname
- Penyesuaian stok

## 9.7 Staf keuangan

Bertanggung jawab atas:

- Invoice
- Pembayaran pelanggan
- Tagihan pemasok
- Pembayaran pemasok
- Laporan piutang
- Laporan utang

## 9.8 Auditor atau viewer

Membutuhkan akses baca terhadap:

- Transaksi
- Audit log
- Laporan
- Lampiran
- Riwayat perubahan

## 9.9 Chief Financial Officer atau Finance Manager

Bertanggung jawab atas:

- Kebijakan akuntansi
- Struktur Chart of Accounts
- Closing period
- Cash flow
- Budget
- Laporan keuangan
- Kontrol finansial

## 9.10 Accounting staff

Bertanggung jawab atas:

- Journal review
- General ledger
- Rekonsiliasi
- Accounts receivable
- Accounts payable
- Fixed assets
- Financial reporting

## 9.11 Tax officer

Bertanggung jawab atas:

- Tax master
- Faktur pajak
- Bukti potong
- Tax reconciliation
- Tax period closing
- Persiapan data pelaporan
- Koreksi dokumen pajak

## 9.12 Procurement manager

Bertanggung jawab atas:

- Sourcing
- RFQ
- Vendor comparison
- Contract
- Approval
- Vendor performance
- Procurement compliance

## 9.13 Production planner dan production supervisor

Bertanggung jawab atas:

- MPS dan MRP
- Production order
- Material availability
- Capacity
- Output
- Scrap
- Production performance

## 9.14 HR dan payroll administrator

Bertanggung jawab atas:

- Employee data
- Attendance
- Leave
- Payroll
- BPJS
- PPh 21
- Payslip
- Employee lifecycle

## 9.15 Project manager

Bertanggung jawab atas:

- Scope
- WBS
- Task
- Resource
- Budget
- Progress
- Billing
- Profitability
- Risk dan issue

---

# 10. Persona Pengguna

## 10.1 Pemilik bisnis

**Tujuan:** mengetahui kondisi perusahaan tanpa membaca banyak spreadsheet.

**Kebutuhan utama:**

- Ringkasan penjualan
- Ringkasan pembelian
- Nilai stok
- Produk hampir habis
- Piutang jatuh tempo
- Utang jatuh tempo
- Aktivitas terbaru
- Perbandingan antar-cabang

## 10.2 Admin operasional

**Tujuan:** memastikan data sistem tersusun dan pengguna memiliki akses yang benar.

**Kebutuhan utama:**

- Mengundang pengguna
- Mengelola cabang
- Mengelola gudang
- Mengelola role
- Mengelola nomor dokumen
- Memperbaiki master data

## 10.3 Staf gudang

**Tujuan:** mencatat barang masuk dan keluar dengan cepat dan akurat.

**Kebutuhan utama:**

- Daftar penerimaan
- Daftar pengiriman
- Pencarian SKU
- Tampilan stok
- Input kuantitas
- Upload foto atau dokumen
- Cetak dokumen

## 10.4 Staf penjualan

**Tujuan:** memproses pesanan pelanggan dari order sampai invoice.

**Kebutuhan utama:**

- Mencari pelanggan
- Menambahkan produk
- Melihat stok tersedia
- Menentukan harga
- Membuat sales order
- Memantau status pengiriman
- Membuat invoice

## 10.5 Staf pembelian

**Tujuan:** memastikan barang dibeli dari pemasok dan diterima sesuai pesanan.

**Kebutuhan utama:**

- Membuat purchase order
- Memilih pemasok
- Melihat harga pembelian terakhir
- Memantau barang belum diterima
- Mencatat penerimaan parsial
- Melampirkan dokumen pemasok

## 10.6 Finance controller

**Tujuan:** memastikan setiap transaksi tercatat benar, periode dapat ditutup, dan laporan keuangan dapat dipercaya.

**Kebutuhan utama:**

- Journal review
- Trial balance
- Closing checklist
- Reconciliation
- Budget variance
- Financial statements
- Drill-down ke dokumen sumber

## 10.7 Tax specialist

**Tujuan:** memastikan transaksi memiliki perlakuan pajak yang benar dan data siap direkonsiliasi serta dilaporkan.

**Kebutuhan utama:**

- Tax code bertanggal efektif
- Faktur dan bukti potong
- Tax period
- Exception report
- Rekonsiliasi subledger dengan GL
- Ekspor data regulasi
- Correction workflow

## 10.8 Production planner

**Tujuan:** memenuhi demand dengan bahan, kapasitas, dan jadwal yang tersedia.

**Kebutuhan utama:**

- Demand dan forecast
- MRP suggestion
- Material shortage
- Work center capacity
- Production schedule
- WIP dan output
- Production variance

## 10.9 HR dan payroll administrator

**Tujuan:** menjaga data tenaga kerja dan menghasilkan payroll yang akurat serta rahasia.

**Kebutuhan utama:**

- Employee lifecycle
- Attendance dan leave
- Overtime
- Payroll simulation
- BPJS dan pajak
- Payslip
- Payroll journal
- Access confidentiality

## 10.10 Project manager

**Tujuan:** menyelesaikan proyek sesuai scope, waktu, biaya, dan margin.

**Kebutuhan utama:**

- WBS dan milestone
- Resource allocation
- Timesheet
- Procurement dan material project
- Budget versus actual
- Billing
- Profitability
- Risk dan issue

---

# 11. Role dan Permission

## 11.1 Role bawaan

Sistem menyediakan role bawaan:

- Owner
- Admin
- General Manager
- Finance Manager
- Accountant
- Treasury
- Tax Officer
- Procurement Manager
- Buyer
- Sales Manager
- Sales
- Warehouse Manager
- Warehouse
- Production Planner
- Production Supervisor
- Quality Inspector
- HR Manager
- HR Administrator
- Payroll Administrator
- Project Manager
- Project Member
- Auditor
- Viewer

## 11.2 Permission dasar

Permission menggunakan format:

```text
resource:action
```

Contoh:

```text
company:view
company:update
branch:view
branch:create
branch:update
branch:delete
user:view
user:invite
user:update
user:disable
role:view
role:manage
product:view
product:create
product:update
product:archive
customer:view
customer:create
customer:update
supplier:view
supplier:create
supplier:update
warehouse:view
warehouse:create
warehouse:update
stock:view
stock:adjust
stock:transfer
stock:opname
purchase_order:view
purchase_order:create
purchase_order:update
purchase_order:submit
purchase_order:approve
purchase_order:cancel
goods_receipt:view
goods_receipt:create
goods_receipt:post
sales_order:view
sales_order:create
sales_order:update
sales_order:submit
sales_order:approve
sales_order:cancel
delivery_order:view
delivery_order:create
delivery_order:post
invoice:view
invoice:create
invoice:issue
invoice:void
payment:view
payment:create
payment:void
report:view
report:export
audit:view
settings:manage

account:view
account:manage
journal:view
journal:create
journal:post
journal:reverse
period:view
period:close
period:reopen
bank_account:view
bank_account:manage
bank_reconciliation:perform
budget:view
budget:manage
fixed_asset:view
fixed_asset:manage
financial_statement:view

tax:view
tax:configure
tax_document:create
tax_document:approve
tax_document:correct
tax_period:close
tax_export:generate

purchase_request:view
purchase_request:create
purchase_request:approve
rfq:view
rfq:create
rfq:award
contract:view
contract:manage
vendor_evaluation:view
vendor_evaluation:manage
three_way_match:review

bom:view
bom:manage
routing:view
routing:manage
mrp:view
mrp:run
production_order:view
production_order:create
production_order:release
production_order:report
production_order:close
quality_inspection:view
quality_inspection:record

employee:view
employee:manage
employee_sensitive:view
attendance:view
attendance:manage
leave:view
leave:approve
payroll:view
payroll:prepare
payroll:approve
payroll:post
payslip:view_all

return:view
return:create
return:approve
return:post
claim:view
claim:manage
credit_note:create
debit_note:create

project:view
project:create
project:manage
project_budget:view
project_budget:manage
timesheet:view
timesheet:approve
project_billing:create
project_profitability:view
```

## 11.3 Sumber otorisasi

Kinde digunakan untuk autentikasi dan permission tingkat aplikasi.

PostgreSQL digunakan sebagai sumber utama untuk:

- Membership perusahaan
- Role pengguna
- Akses cabang
- Akses gudang
- Batas persetujuan
- Permission tambahan
- Status aktif pengguna
- Aturan transaksi

## 11.4 Aturan akses

1. Pengguna hanya dapat mengakses perusahaan tempat ia menjadi anggota aktif.
2. Pengguna yang dinonaktifkan tidak dapat mengakses data perusahaan.
3. Akses cabang harus diperiksa pada setiap transaksi terkait cabang.
4. Akses gudang harus diperiksa pada transaksi stok.
5. Role tidak boleh menjadi satu-satunya pemeriksaan.
6. Server Action dan Route Handler harus melakukan pemeriksaan permission.
7. Menu yang disembunyikan di UI bukan bentuk keamanan.
8. Pengguna tidak boleh menentukan `companyId` tanpa validasi server.
9. Owner tidak dapat dihapus apabila menjadi satu-satunya owner.
10. Pengguna tidak boleh menaikkan role miliknya sendiri tanpa permission khusus.

---

# 12. Arsitektur Sistem

## 12.1 Komponen utama

### Frontend dan backend

- Next.js App Router
- React Server Components
- Server Actions
- Route Handlers
- TypeScript
- Zod
- Prisma Client

### Authentication

- Kinde Auth
- Kinde Organizations opsional
- Kinde Roles dan Permissions opsional

### Database

- Supabase PostgreSQL
- Prisma ORM
- Prisma Migrate
- Supavisor connection pooling

### Storage

- Cloudinary
- Signed direct upload
- Authenticated assets
- Public image assets
- Signed temporary download URL

### Hosting

- Vercel
- Node.js runtime
- Vercel preview deployments
- Vercel environment variables

## 12.2 Pola akses data

```text
Browser
   │
   ▼
Server Component / Server Action / Route Handler
   │
   ├── Verifikasi Kinde
   ├── Verifikasi membership
   ├── Verifikasi permission
   ├── Validasi input
   │
   ▼
Prisma ORM
   │
   ▼
Supabase PostgreSQL
```

Browser tidak boleh memiliki akses langsung menggunakan credential database.

## 12.3 Pola upload file

```text
Browser
   │
   ├── Meminta upload signature
   ▼
Next.js Server
   │
   ├── Verifikasi Kinde
   ├── Verifikasi membership
   ├── Membuat record file PENDING
   ├── Membuat Cloudinary signature
   ▼
Browser
   │
   ├── Upload langsung
   ▼
Cloudinary
   │
   ├── Mengembalikan metadata dan signature
   ▼
Browser
   │
   ├── Mengirim completion request
   ▼
Next.js Server
   │
   ├── Verifikasi signature Cloudinary
   ├── Memperbarui record menjadi READY
   ▼
PostgreSQL
```

---

# 13. Struktur Navigasi

Navigasi utama:

```text
Dashboard
├── Executive
├── Finance
├── Sales
├── Procurement
├── Inventory
├── Manufacturing
├── HR
└── Project

Master Data
├── Produk dan Material
├── Kategori
├── Satuan
├── Bill of Materials
├── Routing dan Work Center
├── Pelanggan
├── Pemasok
├── Karyawan
├── Chart of Accounts
├── Tax Code
├── Cost Center
├── Department
├── Cabang
└── Gudang

Persediaan
├── Stok Saat Ini
├── Mutasi Stok
├── Reservasi
├── Transfer Gudang
├── Penyesuaian
├── Stock Opname
├── Batch dan Serial
└── Inventory Valuation

Procurement
├── Purchase Request
├── Request for Quotation
├── Vendor Quotation
├── Bid Comparison
├── Purchase Contract
├── Blanket Purchase Order
├── Purchase Order
├── Penerimaan Barang
├── Three-Way Matching
├── Tagihan Pemasok
├── Pembayaran Pemasok
└── Vendor Evaluation

Penjualan
├── Quotation
├── Sales Order
├── Pengiriman Barang
├── Invoice
├── Pembayaran Pelanggan
├── Sales Return
├── Customer Claim
└── Credit Note

Manufaktur
├── Demand Planning
├── Master Production Schedule
├── Material Requirements Planning
├── Production Order
├── Material Issue
├── Work in Process
├── Production Reporting
├── Quality Inspection
├── Subcontracting
└── Production Costing

Keuangan
├── General Ledger
├── Journal Entry
├── Accounts Receivable
├── Accounts Payable
├── Cash dan Bank
├── Bank Reconciliation
├── Budget
├── Fixed Asset
├── Period Closing
└── Financial Statements

Pajak Indonesia
├── Tax Configuration
├── PPN
├── Withholding Tax
├── Faktur Pajak
├── Bukti Potong
├── Tax Payment
├── Tax Reconciliation
├── Tax Period
└── Regulatory Export

Human Resources
├── Employee
├── Organization dan Position
├── Recruitment
├── Attendance
├── Shift
├── Leave
├── Overtime
├── Payroll
├── BPJS
├── PPh 21
├── Reimbursement
├── Performance
└── Employee Self-Service

Project
├── Project Portfolio
├── Project
├── WBS dan Task
├── Milestone
├── Resource
├── Timesheet
├── Project Expense
├── Project Procurement
├── Project Billing
├── Risk dan Issue
└── Project Profitability

Return dan Claim
├── Sales Return
├── Purchase Return
├── Customer Claim
├── Supplier Claim
├── Warranty
├── Inspection
├── Replacement
├── Refund
├── Credit Note
└── Debit Note

Laporan
├── Operational
├── Inventory
├── Procurement
├── Sales
├── Manufacturing
├── Finance
├── Tax
├── HR dan Payroll
├── Project
└── Audit

Administrasi
├── Pengguna
├── Role dan Permission
├── Approval Matrix
├── Workflow
├── Audit Log
├── Nomor Dokumen
├── Integration
└── Pengaturan Perusahaan
```

---

# 14. Kebutuhan Fungsional

## 14.1 Authentication

### Deskripsi

Pengguna harus dapat masuk dan keluar menggunakan Kinde.

### Fitur

- Login
- Logout
- Registrasi berdasarkan undangan
- Lupa password melalui Kinde
- Session management
- Redirect setelah login
- Redirect setelah logout
- Proteksi route
- Penanganan session expired
- Sinkronisasi user Kinde ke database internal

### Alur login

1. Pengguna membuka halaman terlindungi.
2. Sistem memeriksa session Kinde.
3. Jika belum login, pengguna diarahkan ke Kinde.
4. Setelah berhasil, Kinde mengembalikan pengguna ke callback.
5. Sistem mencari user berdasarkan `kindeUserId`.
6. Jika belum ada, sistem membuat user internal.
7. Sistem memeriksa membership.
8. Jika hanya memiliki satu perusahaan, sistem membuka dashboard.
9. Jika memiliki beberapa perusahaan, sistem membuka pemilih perusahaan.
10. Jika tidak memiliki perusahaan, sistem membuka onboarding.

### Acceptance criteria

- Pengguna tanpa session tidak dapat membuka dashboard.
- Pengguna yang login dapat melihat profil.
- User internal dibuat tanpa menyimpan password.
- Session invalid menghasilkan redirect login.
- Pengguna nonaktif ditolak meskipun session Kinde masih aktif.
- Logout mengakhiri session dan mengembalikan pengguna ke halaman publik.

## 14.2 Onboarding Perusahaan

### Tujuan

Membantu pengguna baru membuat perusahaan pertama dan konfigurasi dasar.

### Tahapan

1. Informasi perusahaan
2. Alamat
3. Mata uang
4. Timezone
5. Cabang pertama
6. Gudang pertama
7. Format nomor dokumen
8. Undang tim
9. Impor produk opsional

### Data perusahaan

- Nama perusahaan
- Nama legal
- Kode perusahaan
- Logo
- Email
- Nomor telepon
- Nomor pajak opsional
- Alamat
- Kota
- Provinsi
- Negara
- Kode pos
- Timezone
- Mata uang
- Bahasa
- Status aktif

### Aturan

- Pembuat perusahaan otomatis menjadi Owner.
- Perusahaan harus memiliki minimal satu cabang.
- Perusahaan harus memiliki minimal satu gudang.
- Kode perusahaan harus unik.
- Logo disimpan di Cloudinary.
- Data onboarding dapat disimpan sebagai draft.

### Acceptance criteria

- Pengguna dapat membuat perusahaan.
- Owner membership dibuat secara otomatis.
- Cabang dan gudang awal dibuat dalam satu proses.
- Proses onboarding aman terhadap submit berulang.
- Kegagalan salah satu tahap tidak menghasilkan data setengah jadi.

## 14.3 Pemilihan Perusahaan

### Fitur

- Menampilkan perusahaan yang dapat diakses pengguna.
- Menampilkan role pengguna.
- Menampilkan status perusahaan.
- Mengingat perusahaan aktif.
- Mengganti perusahaan aktif.
- Menolak akses ke perusahaan nonaktif.

### Aturan

- Perusahaan aktif disimpan dalam session atau cookie terenkripsi.
- Nilai cookie harus diverifikasi terhadap membership.
- Pergantian perusahaan membersihkan filter cabang dan gudang.
- Query tidak boleh hanya mengandalkan company ID dari URL.

## 14.4 Manajemen Pengguna

### Fitur

- Daftar pengguna
- Undang pengguna
- Kirim ulang undangan
- Ubah role
- Atur akses cabang
- Atur akses gudang
- Aktifkan atau nonaktifkan pengguna
- Lihat aktivitas terakhir
- Hapus membership
- Cari pengguna
- Filter berdasarkan role dan status

### Data membership

- Company
- User
- Role
- Status aktif
- Cabang yang dapat diakses
- Gudang yang dapat diakses
- Approval limit
- Tanggal bergabung
- Diundang oleh
- Tanggal undangan
- Tanggal terakhir aktif

### Aturan

- Pengguna tidak boleh menghapus satu-satunya Owner.
- Pengguna tidak dapat menonaktifkan dirinya sendiri jika satu-satunya Owner.
- Undangan memiliki waktu kedaluwarsa.
- Email undangan harus dinormalisasi.
- Satu user hanya memiliki satu membership per perusahaan.
- Perubahan role dicatat di audit log.

## 14.5 Role dan Permission

### Fitur

- Daftar role
- Role bawaan
- Role kustom
- Salin role
- Pilih permission
- Aktifkan atau nonaktifkan role
- Lihat jumlah pengguna per role

### Aturan

- Role bawaan tertentu tidak dapat dihapus.
- Role yang masih digunakan tidak dapat dihapus.
- Perubahan role tidak mengubah transaksi historis.
- Permission harus diperiksa server-side.
- Role kustom hanya berlaku dalam perusahaan pembuatnya.

## 14.6 Dashboard

### Komponen dashboard

#### Ringkasan

- Penjualan hari ini
- Penjualan bulan berjalan
- Pembelian bulan berjalan
- Nilai persediaan
- Piutang berjalan
- Utang berjalan
- Jumlah order aktif
- Jumlah invoice jatuh tempo

#### Grafik

- Tren penjualan
- Tren pembelian
- Penjualan per cabang
- Produk terlaris
- Pelanggan terbesar
- Pemasok terbesar

#### Alert

- Produk di bawah minimum stok
- Invoice jatuh tempo
- Purchase order terlambat
- Sales order belum dikirim
- Penerimaan parsial
- File upload gagal

#### Aktivitas terbaru

- Transaksi dibuat
- Transaksi disetujui
- Barang diterima
- Barang dikirim
- Pembayaran dicatat
- Pengguna diundang

### Filter

- Rentang tanggal
- Cabang
- Gudang
- Kategori produk
- Mata uang apabila tersedia

### Acceptance criteria

- Data dashboard hanya berasal dari perusahaan aktif.
- Filter cabang mengikuti akses pengguna.
- Nilai dashboard memiliki definisi yang konsisten.
- Dashboard tidak menampilkan transaksi draft sebagai realisasi.
- Grafik tetap dapat ditampilkan ketika data kosong.

## 14.7 Master Produk

### Data produk

- SKU
- Barcode
- Nama produk
- Deskripsi
- Kategori
- Merek
- Satuan dasar
- Harga beli default
- Harga jual default
- Minimum stok
- Maksimum stok
- Berat
- Panjang
- Lebar
- Tinggi
- Status aktif
- Tipe produk
- Foto
- Catatan

### Tipe produk

- Stock item
- Non-stock item
- Service

### Fitur

- Buat produk
- Ubah produk
- Arsipkan produk
- Upload gambar
- Cari produk
- Filter kategori
- Filter status
- Impor CSV
- Ekspor
- Riwayat harga
- Riwayat stok
- Duplikasi produk

### Aturan

- SKU unik per perusahaan.
- Barcode unik per perusahaan apabila diisi.
- Produk dengan transaksi tidak boleh dihapus permanen.
- Produk arsip tidak dapat dipilih pada transaksi baru.
- Produk arsip tetap terlihat pada transaksi historis.
- Harga menggunakan decimal.
- Foto produk menggunakan Cloudinary public image.
- File tidak boleh melebihi batas ukuran yang ditentukan.
- Format gambar dibatasi.

### Acceptance criteria

- Produk dapat dibuat tanpa stok awal.
- Produk dapat memiliki stok di beberapa gudang.
- Perubahan nama produk tidak mengubah nama snapshot pada transaksi lama apabila snapshot digunakan.
- Produk yang memiliki transaksi dapat diarsipkan.
- SKU tidak dapat diduplikasi dalam perusahaan yang sama.

## 14.8 Kategori dan Satuan

### Kategori

Data:

- Nama
- Kode
- Parent category
- Deskripsi
- Status

Aturan:

- Mendukung kategori bertingkat.
- Tidak boleh membentuk circular relationship.
- Kategori yang digunakan tidak dapat dihapus langsung.
- Kategori dapat dinonaktifkan.

### Satuan

Data:

- Nama
- Simbol
- Presisi
- Status

Contoh:

- Pcs
- Box
- Kg
- Gram
- Liter
- Meter

Fase lanjutan dapat mendukung konversi satuan.

## 14.9 Pelanggan

### Data pelanggan

- Kode pelanggan
- Nama
- Nama perusahaan
- Email
- Telepon
- Nomor pajak
- Alamat penagihan
- Alamat pengiriman
- Kota
- Provinsi
- Negara
- Kode pos
- Termin pembayaran
- Batas kredit
- Salesperson
- Catatan
- Status aktif

### Fitur

- Buat pelanggan
- Ubah pelanggan
- Arsipkan pelanggan
- Daftar alamat
- Riwayat penjualan
- Riwayat invoice
- Saldo piutang
- Lampiran
- Impor dan ekspor

### Aturan

- Kode pelanggan unik per perusahaan.
- Email tidak wajib unik.
- Pelanggan arsip tidak dapat digunakan pada transaksi baru.
- Batas kredit dapat menghasilkan peringatan atau blokir.
- Override batas kredit membutuhkan permission.

## 14.10 Pemasok

### Data pemasok

- Kode pemasok
- Nama
- Nama legal
- Email
- Telepon
- Nomor pajak
- Alamat
- Termin pembayaran
- Mata uang
- Kontak utama
- Rekening bank opsional
- Catatan
- Status aktif

### Fitur

- Buat pemasok
- Ubah pemasok
- Arsipkan pemasok
- Riwayat pembelian
- Tagihan pemasok
- Saldo utang
- Lampiran
- Impor dan ekspor

### Aturan

- Kode pemasok unik per perusahaan.
- Pemasok yang digunakan tidak dapat dihapus permanen.
- Informasi rekening bank dianggap data sensitif.
- Perubahan data rekening harus tercatat di audit log.

## 14.11 Cabang

### Data cabang

- Kode
- Nama
- Alamat
- Kota
- Provinsi
- Telepon
- Email
- Manager
- Status aktif

### Aturan

- Kode unik per perusahaan.
- Cabang yang memiliki transaksi tidak dapat dihapus.
- Cabang dapat dinonaktifkan.
- Pengguna hanya dapat melihat cabang yang diizinkan.
- Perusahaan harus memiliki minimal satu cabang aktif.

## 14.12 Gudang

### Data gudang

- Kode
- Nama
- Cabang
- Alamat
- Penanggung jawab
- Tipe gudang
- Status aktif

### Tipe gudang

- Main
- Transit
- Return
- Damaged
- Virtual

### Aturan

- Kode unik per perusahaan.
- Gudang terkait satu cabang.
- Gudang nonaktif tidak dapat digunakan untuk transaksi baru.
- Gudang dengan stok tidak dapat dihapus.
- Transfer antar-gudang harus menghasilkan dua mutasi terkait.

## 14.13 Persediaan

### Konsep utama

Semua perubahan stok terjadi melalui tabel stock movement.

Jenis mutasi:

- Purchase receipt
- Sales delivery
- Transfer out
- Transfer in
- Adjustment in
- Adjustment out
- Sales return
- Purchase return
- Opening balance
- Stock opname correction

### Data mutasi stok

- Company
- Branch
- Warehouse
- Product
- Tanggal transaksi
- Tipe mutasi
- Kuantitas
- Unit cost
- Total cost
- Reference type
- Reference ID
- Reference number
- Notes
- Created by
- Posted at

### Stock balance

Sistem dapat menggunakan tabel saldo untuk performa:

- Company
- Warehouse
- Product
- Quantity on hand
- Quantity reserved
- Quantity available
- Average cost
- Updated at

Rumus:

```text
Quantity Available = Quantity On Hand - Quantity Reserved
```

### Aturan

- Stock movement yang sudah diposting bersifat immutable.
- Koreksi dilakukan dengan reversal.
- Stok negatif dapat diatur per perusahaan.
- Posting stok harus menggunakan database transaction.
- Transfer stok menghasilkan pasangan mutasi.
- Kuantitas tidak boleh nol.
- Presisi mengikuti satuan produk.
- Produk non-stock tidak menghasilkan stock movement.
- Produk service tidak memiliki saldo stok.
- Saldo stok tidak boleh diubah langsung dari UI.

## 14.14 Tampilan Stok Saat Ini

### Kolom

- SKU
- Produk
- Kategori
- Gudang
- On hand
- Reserved
- Available
- Minimum stock
- Average cost
- Inventory value

### Filter

- Cabang
- Gudang
- Kategori
- Produk
- Status stok
- Di bawah minimum
- Stok nol
- Stok negatif

### Fitur

- Ekspor
- Lihat mutasi
- Lihat dokumen sumber
- Lihat stok seluruh gudang
- Pilih tanggal untuk historical stock pada fase lanjutan

## 14.15 Transfer Gudang

### Data

- Nomor transfer
- Tanggal
- Gudang asal
- Gudang tujuan
- Produk
- Kuantitas
- Catatan
- Status
- Lampiran

### Status

```text
DRAFT
PENDING_APPROVAL
APPROVED
IN_TRANSIT
RECEIVED
CANCELLED
```

### Alur

1. Pengguna membuat transfer.
2. Produk dan kuantitas ditambahkan.
3. Sistem memeriksa stok tersedia.
4. Transfer diajukan.
5. Transfer disetujui bila diperlukan.
6. Saat dikirim, stok keluar dari gudang asal.
7. Saat diterima, stok masuk ke gudang tujuan.
8. Selisih penerimaan membutuhkan catatan dan permission.

### Acceptance criteria

- Gudang asal dan tujuan tidak boleh sama.
- Pengguna harus memiliki akses ke gudang asal.
- Penerima harus memiliki akses ke gudang tujuan.
- Transfer tidak boleh dikirim dua kali.
- Receive request harus idempotent.
- Pembatalan setelah dikirim membutuhkan reversal.

## 14.16 Penyesuaian Stok

### Tujuan

Mencatat koreksi stok karena:

- Barang rusak
- Barang hilang
- Kesalahan pencatatan
- Selisih fisik
- Sampel
- Pemakaian internal

### Data

- Nomor dokumen
- Gudang
- Tanggal
- Produk
- Kuantitas sebelum
- Penyesuaian
- Kuantitas sesudah
- Alasan
- Catatan
- Lampiran
- Status

### Status

```text
DRAFT
PENDING_APPROVAL
APPROVED
POSTED
CANCELLED
```

### Aturan

- Adjustment bernilai besar dapat memerlukan approval.
- Alasan wajib diisi.
- Lampiran dapat diwajibkan berdasarkan nilai.
- Posting menghasilkan stock movement.
- Transaksi tidak dapat diedit setelah diposting.

## 14.17 Stock Opname

### Fitur

- Membuat sesi opname
- Memilih gudang
- Membekukan daftar produk
- Input hasil hitung
- Impor hasil hitung
- Hitung selisih
- Persetujuan selisih
- Posting koreksi
- Cetak lembar opname

### Status

```text
DRAFT
COUNTING
REVIEW
APPROVED
POSTED
CANCELLED
```

### Aturan

- Satu gudang hanya boleh memiliki satu opname aktif apabila mode lock digunakan.
- Produk yang belum dihitung ditandai.
- Selisih tidak otomatis memengaruhi stok sebelum diposting.
- Posting menghasilkan adjustment movement.
- Data awal opname harus menggunakan snapshot.

## 14.18 Purchase Order

### Data header

- Nomor PO
- Pemasok
- Cabang
- Gudang tujuan
- Tanggal order
- Tanggal estimasi
- Termin pembayaran
- Mata uang
- Referensi pemasok
- Alamat pengiriman
- Catatan
- Status
- Subtotal
- Diskon
- Pajak
- Biaya lain
- Total
- Dibuat oleh
- Disetujui oleh

### Data item

- Produk
- Deskripsi
- Kuantitas
- Satuan
- Harga
- Diskon
- Pajak
- Total
- Kuantitas diterima

### Status

```text
DRAFT
PENDING_APPROVAL
APPROVED
SENT
PARTIALLY_RECEIVED
RECEIVED
CLOSED
CANCELLED
```

### Alur

1. Staf membuat PO.
2. Produk ditambahkan.
3. Harga dan kuantitas dihitung.
4. PO disimpan sebagai draft.
5. PO diajukan.
6. Manager menyetujui atau menolak.
7. PO dikirim ke pemasok.
8. Barang diterima sebagian atau seluruhnya.
9. PO ditutup setelah selesai.

### Aturan

- Nomor PO dibuat otomatis.
- Nomor harus unik per perusahaan.
- Total dihitung server-side.
- Harga dari browser tidak boleh dipercaya tanpa validasi.
- PO approved tidak dapat diedit langsung.
- Perubahan setelah approved harus melalui revision atau reopen.
- Penerimaan tidak boleh melebihi kuantitas tanpa permission.
- Pembatalan memerlukan alasan.
- PO tidak memengaruhi stok sebelum goods receipt diposting.

## 14.19 Penerimaan Barang

### Data

- Nomor penerimaan
- Purchase order
- Pemasok
- Gudang
- Tanggal penerimaan
- Nomor surat jalan
- Produk
- Kuantitas dipesan
- Kuantitas sebelumnya diterima
- Kuantitas diterima sekarang
- Kuantitas ditolak
- Catatan
- Lampiran
- Status

### Status

```text
DRAFT
POSTED
CANCELLED
```

### Alur

1. Pengguna memilih PO.
2. Sistem menampilkan barang yang belum diterima.
3. Pengguna memasukkan kuantitas diterima.
4. Pengguna mengunggah surat jalan.
5. Sistem memvalidasi data.
6. Pengguna memposting penerimaan.
7. Sistem membuat stock movement.
8. Sistem memperbarui quantity received pada PO.
9. Sistem memperbarui status PO.

### Aturan

- Posting harus atomik.
- Penerimaan parsial diperbolehkan.
- Nomor surat jalan dapat disimpan.
- Produk tidak boleh ditambahkan di luar PO tanpa permission.
- Penerimaan yang sudah diposting tidak dapat diedit.
- Pembatalan menghasilkan stock reversal.
- Proses posting harus idempotent.

## 14.20 Tagihan Pemasok

### Data

- Nomor tagihan internal
- Nomor invoice pemasok
- Pemasok
- Purchase order
- Goods receipt
- Tanggal invoice
- Jatuh tempo
- Subtotal
- Pajak
- Diskon
- Total
- Jumlah dibayar
- Saldo
- Status
- Lampiran

### Status

```text
DRAFT
OPEN
PARTIALLY_PAID
PAID
OVERDUE
VOID
```

### Aturan

- Nomor invoice pemasok dapat diwajibkan unik per pemasok.
- Total dihitung server-side.
- Overpayment tidak diperbolehkan tanpa mekanisme deposit.
- Void memerlukan alasan dan permission.
- Invoice pemasok tidak mengubah stok.
- Hubungan invoice dengan receipt dapat parsial.

## 14.21 Pembayaran Pemasok

### Data

- Nomor pembayaran
- Pemasok
- Tanggal
- Metode pembayaran
- Rekening
- Jumlah
- Referensi bank
- Alokasi ke tagihan
- Catatan
- Lampiran
- Status

### Status

```text
DRAFT
POSTED
VOID
```

### Metode pembayaran

- Cash
- Bank transfer
- Giro
- Card
- Other

### Aturan

- Pembayaran dapat dialokasikan ke beberapa tagihan.
- Total alokasi tidak boleh melebihi jumlah pembayaran.
- Pembayaran yang diposting tidak dapat diedit.
- Void mengembalikan saldo tagihan.
- Bukti transfer dapat diunggah.
- Akses file pembayaran harus authenticated.

## 14.22 Sales Order

### Data header

- Nomor SO
- Pelanggan
- Cabang
- Gudang
- Tanggal order
- Tanggal pengiriman
- Termin pembayaran
- Alamat pengiriman
- Salesperson
- Referensi pelanggan
- Catatan
- Status
- Subtotal
- Diskon
- Pajak
- Biaya lain
- Total

### Data item

- Produk
- Deskripsi
- Kuantitas
- Satuan
- Harga
- Diskon
- Pajak
- Total
- Kuantitas dikirim
- Kuantitas diinvoiced

### Status

```text
DRAFT
PENDING_APPROVAL
APPROVED
CONFIRMED
PARTIALLY_DELIVERED
DELIVERED
PARTIALLY_INVOICED
INVOICED
CLOSED
CANCELLED
```

### Aturan

- Sistem menampilkan stok tersedia.
- Sistem dapat memberikan peringatan stok tidak cukup.
- Sistem dapat melakukan reservasi stok.
- Batas kredit pelanggan harus diperiksa.
- Harga jual dapat berasal dari default produk.
- Override harga dapat membutuhkan permission.
- Total dihitung server-side.
- SO tidak mengurangi stok sebelum delivery diposting.
- SO approved tidak dapat diedit langsung.
- Pembatalan memerlukan alasan.

## 14.23 Reservasi Stok

### Tujuan

Mencegah stok yang sama dijanjikan kepada beberapa sales order.

### Aturan

- Reservasi dibuat saat SO approved atau confirmed.
- Reservasi dilepas ketika SO dibatalkan.
- Reservasi berkurang saat delivery diposting.
- Reservasi tidak mengubah quantity on hand.
- Quantity available memperhitungkan reserved quantity.
- Reservasi harus menggunakan transaksi database.
- Reservasi yang kedaluwarsa dapat dilepas otomatis pada fase lanjutan.

## 14.24 Pengiriman Barang

### Data

- Nomor pengiriman
- Sales order
- Pelanggan
- Gudang
- Tanggal pengiriman
- Alamat
- Kurir
- Nomor kendaraan
- Nomor resi
- Produk
- Kuantitas dipesan
- Kuantitas telah dikirim
- Kuantitas dikirim sekarang
- Catatan
- Lampiran
- Status

### Status

```text
DRAFT
POSTED
CANCELLED
```

### Alur

1. Pengguna memilih sales order.
2. Sistem menampilkan produk belum dikirim.
3. Pengguna memasukkan kuantitas.
4. Sistem memeriksa stok.
5. Pengguna memposting.
6. Sistem membuat stock movement keluar.
7. Sistem mengurangi reservasi.
8. Sistem memperbarui status sales order.

### Aturan

- Pengiriman parsial diperbolehkan.
- Stok negatif mengikuti pengaturan perusahaan.
- Posting harus atomik dan idempotent.
- Delivery yang sudah diposting tidak dapat diedit.
- Pembatalan menghasilkan stock reversal.
- Dokumen surat jalan dapat dicetak.

## 14.25 Invoice Penjualan

### Data

- Nomor invoice
- Pelanggan
- Sales order
- Delivery order
- Tanggal invoice
- Jatuh tempo
- Termin pembayaran
- Subtotal
- Diskon
- Pajak
- Total
- Jumlah dibayar
- Saldo
- Status
- Catatan
- Lampiran

### Status

```text
DRAFT
ISSUED
PARTIALLY_PAID
PAID
OVERDUE
VOID
```

### Aturan

- Invoice dapat dibuat dari SO atau delivery.
- Sistem harus mencegah invoicing melebihi jumlah yang diizinkan.
- Invoice yang issued tidak dapat diedit langsung.
- Void memerlukan alasan.
- Nomor invoice unik.
- PDF invoice dapat dibuat.
- PDF dapat disimpan di Cloudinary atau dibuat secara dinamis.
- Invoice public download tidak diperbolehkan untuk dokumen sensitif.
- Status overdue dihitung berdasarkan jatuh tempo dan saldo.

## 14.26 Pembayaran Pelanggan

### Data

- Nomor pembayaran
- Pelanggan
- Tanggal
- Metode
- Rekening
- Jumlah
- Referensi
- Alokasi invoice
- Catatan
- Lampiran
- Status

### Status

```text
DRAFT
POSTED
VOID
```

### Aturan

- Pembayaran dapat dialokasikan ke beberapa invoice.
- Pembayaran parsial diperbolehkan.
- Total alokasi tidak boleh melebihi jumlah pembayaran.
- Overpayment ditolak pada MVP.
- Posting memperbarui saldo invoice.
- Void mengembalikan saldo invoice.
- Bukti pembayaran disimpan sebagai authenticated asset.
- Proses posting harus idempotent.

## 14.27 Nomor Dokumen

### Fitur

Admin dapat mengatur pola nomor untuk:

- Purchase order
- Goods receipt
- Supplier bill
- Supplier payment
- Sales order
- Delivery order
- Sales invoice
- Customer payment
- Stock transfer
- Stock adjustment
- Stock opname

### Token pola

```text
{PREFIX}
{YYYY}
{YY}
{MM}
{DD}
{BRANCH}
{SEQUENCE}
```

Contoh:

```text
PO/JKT/2026/000001
SO/SBY/2026/000087
INV/202607/000143
```

### Aturan

- Nomor dibuat server-side.
- Sequence harus aman terhadap concurrency.
- Nomor tidak boleh diduplikasi.
- Nomor posted transaction tidak boleh digunakan ulang.
- Nomor draft dapat dibuat saat submit untuk menghindari celah nomor.
- Setiap cabang dapat memiliki sequence sendiri.

## 14.28 Lampiran dan Cloudinary

### Kategori file

- Product image
- Company logo
- Purchase order
- Supplier invoice
- Delivery document
- Sales invoice
- Payment proof
- Stock adjustment evidence
- General attachment

### Status file

```text
PENDING
READY
FAILED
DELETED
```

### Akses

#### Public

Digunakan untuk:

- Logo perusahaan
- Foto produk

#### Authenticated

Digunakan untuk:

- Invoice
- Bukti pembayaran
- Surat jalan
- Dokumen pembelian
- Dokumen pelanggan
- Dokumen pemasok

### Metadata yang disimpan

- Cloudinary asset ID
- Public ID
- Resource type
- Delivery type
- Version
- Format
- MIME type
- Size
- Width
- Height
- Original filename
- Company ID
- Uploader ID
- Entity type
- Entity ID
- Status
- Created at
- Deleted at

### Aturan

- API secret hanya tersedia di server.
- Browser menggunakan signed direct upload.
- Hasil upload harus diverifikasi.
- File PENDING yang tidak selesai harus dibersihkan.
- Penghapusan file menggunakan soft delete lebih dahulu.
- Penghapusan Cloudinary dilakukan melalui background job atau admin action.
- URL dokumen authenticated dibuat setelah authorization.
- Temporary URL memiliki masa aktif pendek.
- Nama file harus disanitasi.
- Jenis dan ukuran file harus dibatasi.
- Malware scanning dapat ditambahkan pada fase lanjutan.

## 14.29 Notifikasi

### Jenis notifikasi

- Undangan pengguna
- PO menunggu approval
- SO menunggu approval
- Stok di bawah minimum
- Invoice jatuh tempo
- Tagihan pemasok jatuh tempo
- Transfer menunggu penerimaan
- Upload file gagal
- Approval ditolak
- Transaksi dibatalkan

### Channel MVP

- In-app notification
- Email untuk undangan dan transaksi penting

### Data notifikasi

- Company
- User
- Type
- Title
- Message
- Entity type
- Entity ID
- Read at
- Created at

### Aturan

- Notifikasi tidak menggantikan audit log.
- Notifikasi dapat ditandai sudah dibaca.
- Pengguna hanya menerima notifikasi yang relevan.
- Email tidak boleh mengandung data sensitif secara berlebihan.

## 14.30 Audit Log

### Aktivitas yang dicatat

- Login penting
- Pembuatan perusahaan
- Undangan pengguna
- Perubahan role
- Perubahan permission
- Aktivasi atau deaktivasi user
- Pembuatan transaksi
- Perubahan transaksi
- Submit
- Approval
- Rejection
- Posting
- Cancellation
- Void
- Pengunggahan file
- Penghapusan file
- Perubahan pengaturan
- Perubahan data sensitif

### Data audit log

- Company ID
- User ID
- Action
- Entity type
- Entity ID
- Entity number
- Before data
- After data
- Metadata
- IP address
- User agent
- Request ID
- Timestamp

### Aturan

- Audit log tidak dapat diubah melalui UI.
- Data sensitif seperti password dan secret tidak boleh dicatat.
- Before dan after data dapat disimpan sebagai JSON.
- Retensi audit ditentukan berdasarkan paket atau kebijakan perusahaan.
- Audit log harus memiliki indeks berdasarkan perusahaan, user, entity, dan waktu.

## 14.31 Pencarian Global

### Fitur

Pengguna dapat mencari:

- Produk
- SKU
- Barcode
- Pelanggan
- Pemasok
- Purchase order
- Sales order
- Invoice
- Delivery
- Receipt

### Aturan

- Hasil dibatasi perusahaan aktif.
- Hasil mengikuti permission.
- Dokumen sensitif tidak ditampilkan kepada pengguna tanpa akses.
- Pencarian menggunakan debounce.
- MVP dapat menggunakan PostgreSQL trigram atau full-text search.
- Search index eksternal dapat ditambahkan kemudian.

## 14.32 Impor Data

### Data yang dapat diimpor

- Produk
- Pelanggan
- Pemasok
- Stok awal

### Alur

1. Pengguna mengunduh template.
2. Pengguna mengisi file.
3. Pengguna mengunggah file.
4. Sistem memvalidasi.
5. Sistem menampilkan preview.
6. Pengguna memperbaiki error.
7. Pengguna mengonfirmasi.
8. Sistem memproses data.
9. Sistem menampilkan hasil.

### Aturan

- Impor tidak langsung menulis data sebelum preview.
- Baris invalid tidak boleh diam-diam diabaikan.
- Sistem menampilkan nomor baris dan pesan error.
- Proses harus aman terhadap duplikasi.
- File impor memiliki batas ukuran dan jumlah baris.
- Stok awal menghasilkan stock movement.

## 14.33 Ekspor Data

### Format

- CSV
- XLSX
- PDF untuk dokumen tertentu

### Aturan

- Ekspor mengikuti filter aktif.
- Ekspor mengikuti permission.
- Ekspor besar dapat diproses secara asynchronous pada fase lanjutan.
- Data sensitif dapat dikecualikan berdasarkan role.
- Aktivitas ekspor dapat dicatat dalam audit log.

## 14.34 Laporan

### Laporan penjualan

- Penjualan per periode
- Penjualan per cabang
- Penjualan per salesperson
- Penjualan per pelanggan
- Penjualan per produk
- Sales order terbuka
- Pengiriman belum selesai
- Invoice belum dibayar
- Umur piutang

### Laporan pembelian

- Pembelian per periode
- Pembelian per pemasok
- Pembelian per produk
- Purchase order terbuka
- Barang belum diterima
- Tagihan belum dibayar
- Umur utang

### Laporan persediaan

- Stok per gudang
- Nilai persediaan
- Mutasi stok
- Produk di bawah minimum
- Produk tanpa pergerakan
- Penyesuaian stok
- Hasil stock opname

### Filter umum

- Tanggal
- Cabang
- Gudang
- Produk
- Kategori
- Pelanggan
- Pemasok
- Status

### Aturan

- Draft tidak termasuk realisasi kecuali dipilih.
- Laporan menyebutkan definisi setiap metrik.
- Nilai transaksi dibulatkan sesuai mata uang.
- Export menggunakan data yang sama dengan tampilan.
- Query laporan harus memiliki indeks pendukung.
- Laporan berat dapat menggunakan materialized view pada fase lanjutan.

---

## 14.35 Akuntansi dan Keuangan Lengkap

### Tujuan

Modul akuntansi dan keuangan menjadi sumber kebenaran finansial seluruh perusahaan. Modul ini menerima posting dari penjualan, procurement, inventory, produksi, payroll, proyek, aset, dan transaksi manual.

### 14.35.1 Konfigurasi keuangan perusahaan

Data konfigurasi:

- Legal entity
- Fiscal year
- Fiscal period
- Base currency
- Reporting currency
- Accounting method
- Tax registration
- Default retained earnings account
- Default gain and loss account
- Rounding account
- Suspense account
- Intercompany clearing account
- Inventory valuation method
- Revenue recognition policy
- Numbering sequence
- Posting tolerance
- Approval threshold

Aturan:

- Konfigurasi kritis memiliki tanggal efektif.
- Perubahan tidak boleh mengubah posting historis.
- Perubahan akun default dicatat dalam audit log.
- Legal entity dapat memiliki kalender fiskal berbeda.

### 14.35.2 Chart of Accounts

Data akun:

- Account code
- Account name
- Account type
- Account subtype
- Parent account
- Normal balance
- Currency restriction
- Reconciliation required
- Manual posting allowed
- Tax relevant
- Active period
- Financial statement mapping

Jenis akun minimum:

- Asset
- Liability
- Equity
- Revenue
- Cost of goods sold
- Expense
- Other income
- Other expense

Aturan:

- Kode akun unik per legal entity atau template.
- Akun yang telah digunakan tidak boleh dihapus.
- Akun dapat dinonaktifkan untuk transaksi baru.
- Control account tidak menerima posting manual kecuali permission khusus.
- Hierarki akun tidak boleh circular.

### 14.35.3 Analytic dimensions

Dimensi minimum:

- Branch
- Department
- Cost center
- Profit center
- Project
- Product line
- Customer segment
- Custom dimension

Aturan:

- Dimensi dapat diwajibkan berdasarkan akun.
- Kombinasi dimensi dapat divalidasi.
- Dimensi historis tidak berubah ketika master data diganti.
- Reporting harus dapat mengiris nilai berdasarkan dimensi.

### 14.35.4 Journal engine

Data journal header:

- Journal number
- Journal type
- Posting date
- Document date
- Fiscal period
- Currency
- Exchange rate
- Source module
- Source document type
- Source document ID
- Description
- Status
- Reversal reference
- Posted by
- Posted at

Data journal line:

- Account
- Debit
- Credit
- Currency amount
- Base amount
- Dimensions
- Customer atau supplier reference
- Tax code
- Due date
- Description

Status:

```text
DRAFT
PENDING_APPROVAL
APPROVED
POSTED
REVERSED
CANCELLED
```

Aturan:

- Total debit harus sama dengan total credit.
- Journal POSTED bersifat immutable.
- Koreksi dilakukan melalui reversal dan replacement journal.
- Source transaction tidak boleh membuat journal ganda.
- Posting menggunakan idempotency key.
- Journal harus berada pada periode terbuka.
- Nilai nol tidak boleh diposting kecuali tipe khusus.
- Currency conversion menyimpan rate dan sumber rate.

### 14.35.5 Posting rule

Posting rule memetakan transaksi sumber menjadi jurnal.

Contoh minimum:

```text
Goods Receipt
Dr Inventory / Expense Accrual
Cr Goods Received Not Invoiced

Supplier Invoice
Dr GRNI / Expense / Asset
Dr Input Tax
Cr Accounts Payable

Delivery
Dr Cost of Goods Sold
Cr Inventory

Sales Invoice
Dr Accounts Receivable
Cr Revenue
Cr Output Tax

Customer Payment
Dr Cash or Bank
Cr Accounts Receivable

Supplier Payment
Dr Accounts Payable
Cr Cash or Bank

Payroll
Dr Salary and Benefit Expense
Cr Payroll Payable
Cr Tax Payable
Cr BPJS Payable

Production Completion
Dr Finished Goods
Cr Work in Process
```

Aturan:

- Posting rule memiliki versi dan tanggal efektif.
- Rule dapat berbeda berdasarkan produk, kategori, cabang, tax code, atau legal entity.
- Sistem menyediakan preview journal sebelum posting.
- Perubahan rule hanya berlaku untuk transaksi baru.
- Exception masuk ke posting error queue, bukan hilang diam-diam.

### 14.35.6 General ledger dan subledger

Subledger:

- Customer receivable
- Supplier payable
- Inventory
- Fixed asset
- Payroll
- Project
- Tax

Fitur:

- Account inquiry
- Journal inquiry
- Drill-down ke transaksi sumber
- Opening balance
- Period movement
- Closing balance
- Subledger to GL reconciliation
- Suspense monitoring
- Unposted transaction report

### 14.35.7 Accounts receivable

Fitur tambahan:

- Customer statement
- Aging
- Credit limit
- Collection activity
- Dunning level
- Write-off
- Customer deposit
- Advance receipt
- Refund
- Bad debt provision
- Settlement dan offset
- Foreign currency revaluation

Aturan:

- Setiap saldo AR berasal dari invoice, debit note, payment, credit note, atau journal sah.
- Settlement tidak mengubah nilai dokumen asli.
- Write-off memerlukan permission dan approval.
- Customer deposit disimpan sebagai liability sampai dialokasikan.

### 14.35.8 Accounts payable

Fitur tambahan:

- Supplier statement
- Aging
- Advance payment
- Employee payable
- Payment proposal
- Payment batch
- Withholding
- Settlement dan offset
- Foreign currency revaluation
- Duplicate invoice detection

Aturan:

- Duplicate supplier invoice menghasilkan warning atau block.
- Payment proposal tidak otomatis menjadi payment posted.
- Perubahan rekening supplier memerlukan kontrol tambahan.
- Advance supplier disimpan sebagai asset sampai diterapkan.

### 14.35.9 Cash, bank, dan treasury

Fitur:

- Cash account
- Bank account
- Petty cash
- Cash transfer
- Bank transfer
- Cash receipt
- Cash payment
- Bank fee
- Interest
- Payment approval
- Cash forecast
- Bank balance
- Cheque dan giro opsional

Aturan:

- Rekening bank dibatasi berdasarkan legal entity dan currency.
- Transfer antar-bank menghasilkan journal seimbang.
- Payment batch memiliki maker-checker control.
- Rekening tujuan baru dapat membutuhkan approval.

### 14.35.10 Bank reconciliation

Fitur:

- Import bank statement
- Manual bank statement
- Automatic matching
- Suggested matching
- Split dan merge matching
- Unmatched transaction
- Bank adjustment
- Reconciliation statement
- Closing balance validation

Aturan:

- Statement line hanya dapat direkonsiliasi sekali.
- Rekonsiliasi dapat dibatalkan melalui controlled undo.
- Selisih memerlukan adjustment journal.
- Import file menyimpan checksum untuk mencegah duplikasi.

### 14.35.11 Budgeting

Fitur:

- Budget version
- Annual budget
- Monthly phasing
- Department budget
- Cost center budget
- Project budget
- Capex budget
- Budget transfer
- Revision
- Commitment
- Actual
- Forecast
- Variance

Status:

```text
DRAFT
SUBMITTED
APPROVED
ACTIVE
REVISED
CLOSED
```

Aturan:

- Purchase request dapat memeriksa available budget.
- Budget control dapat berupa warning atau hard block.
- Revision mempertahankan versi sebelumnya.
- Actual berasal dari posted journal.

### 14.35.12 Fixed assets

Fitur:

- Asset category
- Asset register
- Acquisition
- Capitalization
- Component asset
- Depreciation book
- Depreciation schedule
- Transfer
- Impairment
- Revaluation
- Disposal
- Asset count
- Asset document

Aturan:

- Asset capitalization membuat journal.
- Depreciation run idempotent.
- Disposal menghitung gain atau loss.
- Asset yang disposed tidak dapat didepresiasi lagi.
- Tax book dapat dipisahkan dari accounting book.

### 14.35.13 Multi-currency

Fitur:

- Currency master
- Exchange rate type
- Daily rate
- Manual contractual rate
- Transaction currency
- Base currency
- Reporting currency
- Realized gain or loss
- Unrealized revaluation

Aturan:

- Rate memiliki tanggal efektif.
- Posted journal menyimpan rate yang digunakan.
- Revaluation menghasilkan journal reversal pada periode berikutnya bila dikonfigurasi.
- Currency decimal mengikuti master currency.

### 14.35.14 Fiscal period dan closing

Fitur:

- Fiscal calendar
- Period open dan close
- Module-specific close
- Soft close
- Hard close
- Closing checklist
- Accrual
- Deferral
- Reclassification
- Year-end closing
- Retained earnings transfer

Aturan:

- Posting ke closed period ditolak.
- Reopen memerlukan permission tinggi dan alasan.
- Closing checklist menyimpan actor dan timestamp.
- Subledger harus direkonsiliasi sebelum hard close.
- Year-end closing tidak menghapus histori.

### 14.35.15 Laporan keuangan

Laporan minimum:

- Trial balance
- General ledger
- Balance sheet
- Profit and loss
- Cash flow
- Statement of changes in equity
- AR aging
- AP aging
- Budget versus actual
- Cost center report
- Project financial report
- Fixed asset register
- Bank reconciliation report

Fitur:

- Comparative period
- Drill-down
- Multi-dimension
- Export
- Saved report configuration
- Consolidation-ready mapping

### Acceptance criteria

- Setiap journal posted seimbang.
- Source transaction hanya menghasilkan satu set journal aktif.
- Trial balance selalu balance.
- Closed period tidak menerima posting biasa.
- Financial report dapat ditelusuri sampai dokumen sumber.
- Subledger AR, AP, inventory, payroll, project, dan tax dapat direkonsiliasi ke GL.
- Reversal tidak menghapus jurnal awal.
- Budget actual berasal dari journal posted.
- Data currency dan rate historis tidak berubah.

---

## 14.36 Pajak Indonesia

### Tujuan

Modul pajak membantu perusahaan menghitung, mencatat, merekonsiliasi, menyiapkan dokumen, dan mengekspor data perpajakan Indonesia. Modul harus bersifat configurable dan effective-dated karena regulasi, tarif, format dokumen, dan kanal administrasi dapat berubah.

Sistem harus disiapkan untuk interoperabilitas dengan layanan administrasi DJP seperti Coretax, faktur pajak, dan bukti potong. Implementasi integrasi wajib menggunakan adapter terpisah dan mengikuti dokumentasi resmi yang berlaku saat integrasi dibuat.

### 14.36.1 Profil pajak

Data:

- Legal entity
- NPWP atau identifier pajak
- NIK terkait bila relevan
- Status PKP
- KPP
- Tax address
- Tax contact
- Tax registration effective date
- Certificate atau authorization metadata
- Signing authority
- Tax calendar

Aturan:

- Data identifier dianggap sensitif.
- Perubahan profil dicatat.
- Status berlaku berdasarkan tanggal efektif.
- Sistem dapat menyimpan beberapa registration bila legal entity memerlukannya.

### 14.36.2 Tax master dan rule engine

Data:

- Tax code
- Tax category
- Tax type
- Rate
- Tax base formula
- Inclusive atau exclusive
- Recoverable percentage
- Withholding behavior
- Rounding rule
- Account mapping
- Effective from
- Effective to
- Legal reference
- Active status

Kategori minimum:

- PPN keluaran
- PPN masukan
- PPN tidak dapat dikreditkan
- PPh 21
- PPh 22
- PPh 23
- PPh 26
- PPh Pasal 4 ayat 2
- Non-taxable
- Exempt atau fasilitas khusus sesuai konfigurasi

Aturan:

- Tarif dan formula tidak di-hardcode dalam domain transaksi.
- Rule dipilih berdasarkan tanggal transaksi dan konteks.
- Perubahan rule tidak menghitung ulang transaksi posted tanpa proses koreksi.
- Manual override membutuhkan permission dan alasan.
- Legal reference dapat disimpan sebagai metadata.

### 14.36.3 PPN

Fitur:

- Output VAT
- Input VAT
- Tax invoice reference
- Creditable dan non-creditable input tax
- Prepayment tax handling
- Return dan credit note adjustment
- Tax base
- Rounding
- Tax period
- Reconciliation dengan sales, purchase, dan GL

Data faktur pajak:

- Document number
- Reference transaction
- Counterparty tax identity
- Transaction date
- Tax invoice date
- Tax base
- Tax amount
- Status
- Correction reference
- Export status
- External reference

Status:

```text
DRAFT
VALIDATED
APPROVED
EXPORTED
ACCEPTED
REJECTED
CORRECTED
CANCELLED
```

Aturan:

- Faktur koreksi menghubungkan dokumen lama dan baru.
- Dokumen yang telah diekspor tidak dihapus.
- Selisih antara invoice komersial dan dokumen pajak harus terlihat.
- Nomor dan format mengikuti konfigurasi periode.

### 14.36.4 Withholding tax

Fitur:

- Withholding calculation
- Supplier withholding
- Customer withholding evidence
- Employee withholding
- Gross-up atau net method
- Withholding payable
- Withholding certificate
- Settlement
- Reconciliation

Data bukti potong:

- Tax type
- Recipient
- Tax identity
- Gross amount
- Tax base
- Rate
- Tax amount
- Period
- Document number
- Source transaction
- Correction
- External status

Aturan:

- Bukti potong dapat berasal dari AP, payment, atau payroll sesuai konfigurasi.
- Penghasilan dan pajak historis tidak berubah karena perubahan rule baru.
- Correction mempertahankan dokumen awal.
- Sistem mendukung ekspor data sesuai format resmi yang berlaku.

### 14.36.5 PPh 21 payroll

PPh 21 menggunakan data payroll dan tax profile employee:

- Tax identity
- Marital atau dependent status sesuai kebutuhan konfigurasi
- Gross income
- Regular dan irregular income
- Deduction
- Employer-paid benefit
- Previous employer data
- Tax period
- Annualization atau period calculation
- Tax borne by employee atau employer
- Year-end reconciliation

Aturan:

- Calculation engine memiliki versi bertanggal efektif.
- Payroll preview menampilkan basis dan komponen pajak.
- Manual adjustment membutuhkan audit trail.
- Annual reconciliation dapat menghasilkan correction payroll atau tax adjustment.
- Bukti potong employee dapat dibuat dari payroll final.

### 14.36.6 Tax payment dan billing

Fitur:

- Tax payable summary
- Payment instruction
- Billing reference
- Payment date
- Bank reference
- Settlement allocation
- Underpayment
- Overpayment
- Refund atau compensation tracking

Aturan:

- Payment tidak mengubah nilai dokumen pajak sumber.
- Settlement menghasilkan journal.
- Reference eksternal disimpan untuk reconciliation.
- Satu payment dapat dialokasikan ke beberapa liability bila diizinkan.

### 14.36.7 Tax period dan reconciliation

Fitur:

- Open period
- Transaction validation
- Sales to output VAT reconciliation
- Purchase to input VAT reconciliation
- Payroll to PPh 21 reconciliation
- AP to withholding reconciliation
- Tax subledger to GL reconciliation
- Exception list
- Period approval
- Period close
- Correction period

Aturan:

- Tax period close terpisah dari accounting period close.
- Exception harus diselesaikan atau di-override dengan alasan.
- Close menyimpan snapshot.
- Reopen memerlukan permission khusus.

### 14.36.8 Regulatory export dan integration adapter

Fitur:

- Configurable export format
- XML, CSV, atau format lain sesuai spesifikasi
- Export batch
- Validation
- Checksum
- Submission reference
- Response import
- Error mapping
- Retry
- Manual status update

Aturan:

- Adapter regulasi terpisah dari core tax domain.
- Credential atau certificate hanya berada di server.
- Response eksternal disimpan untuk audit.
- Export yang sama tidak dibuat ganda tanpa revision.
- Sistem tidak mengklaim submission sukses sebelum menerima status yang dapat diverifikasi.

### 14.36.9 Referensi resmi

Implementasi harus diverifikasi terhadap sumber resmi terbaru, termasuk:

- [Coretax DJP](https://www.pajak.go.id/id/reformdjp/coretax)
- [Buku panduan Coretax DJP](https://pajak.go.id/coretaxpedia/buku-panduan-coretax-djp)
- [Informasi e-Bupot PPh 21/26](https://pajak.go.id/id/artikel/e-bupot-pph-pasal-2126-pelengkap-spt-masa-berbasis-web)
- JDIH Kementerian Keuangan dan Direktorat Jenderal Pajak
- Ketentuan resmi yang berlaku pada tanggal implementasi

### Acceptance criteria

- Tax rule dipilih berdasarkan tanggal efektif.
- Tax report dapat direkonsiliasi dengan transaksi dan GL.
- Correction tidak menghapus dokumen awal.
- Export batch memiliki audit trail dan checksum.
- Credential integrasi tidak tersedia di browser.
- Perubahan tarif tidak mengubah transaksi posted.
- Manual override tercatat dengan alasan dan approver.
- Tax period dapat ditutup setelah exception diselesaikan.

---

## 14.37 Manufaktur dan Produksi

### Tujuan

Modul manufaktur mengubah demand menjadi rencana material dan produksi, mencatat konsumsi, output, WIP, kualitas, serta biaya produksi.

### 14.37.1 Manufacturing item master

Data tambahan produk:

- Procurement type
- Make or buy
- Planning policy
- Lead time
- Lot size
- Safety stock
- Scrap percentage
- Yield
- Batch controlled
- Serial controlled
- Expiry controlled
- Shelf life
- Quality inspection required
- Costing method

### 14.37.2 Bill of Materials

Data BOM:

- BOM number
- Parent product
- Version
- Effective dates
- Base quantity
- Component
- Component quantity
- Unit
- Scrap factor
- Issue method
- Phantom flag
- Substitute group
- By-product
- Co-product
- Status

Status:

```text
DRAFT
PENDING_APPROVAL
APPROVED
ACTIVE
OBSOLETE
```

Aturan:

- BOM tidak boleh circular.
- Version memiliki tanggal efektif.
- Production order menyimpan snapshot BOM.
- Perubahan BOM tidak mengubah production order yang telah dirilis.
- Substitution membutuhkan rule dan audit.

### 14.37.3 Routing dan work center

Data routing:

- Operation sequence
- Work center
- Setup time
- Run time
- Queue time
- Move time
- Labor requirement
- Machine requirement
- Cost rate
- Quality checkpoint
- Outsource flag

Data work center:

- Capacity
- Calendar
- Efficiency
- Utilization
- Labor cost
- Machine cost
- Overhead rate
- Maintenance window

### 14.37.4 Demand planning dan MPS

Sumber demand:

- Sales order
- Forecast
- Safety stock
- Project requirement
- Transfer demand
- Dependent demand

Fitur:

- Forecast version
- Demand consolidation
- Master Production Schedule
- Time bucket
- Frozen horizon
- Available-to-promise
- Planning exception

### 14.37.5 Material Requirements Planning

Input:

- Demand
- Inventory
- Reservation
- Open purchase order
- Open production order
- BOM
- Lead time
- Lot size
- Safety stock
- Calendar

Output:

- Planned production order
- Planned purchase order
- Reschedule suggestion
- Cancel suggestion
- Shortage
- Exception message

Aturan:

- MRP run menyimpan parameter dan timestamp.
- Suggestion tidak otomatis menjadi order tanpa policy.
- Planner dapat accept, modify, atau reject suggestion.
- MRP tidak mengubah transaksi posted.
- Concurrent MRP run untuk scope sama harus dikendalikan.

### 14.37.6 Production order

Data:

- Production order number
- Product
- Quantity planned
- Quantity completed
- Quantity rejected
- BOM version
- Routing version
- Warehouse
- Planned start
- Planned finish
- Actual start
- Actual finish
- Priority
- Project
- Batch
- Status

Status:

```text
DRAFT
PLANNED
RELEASED
IN_PROGRESS
PARTIALLY_COMPLETED
COMPLETED
CLOSED
CANCELLED
```

Aturan:

- RELEASED membuat reservation atau material requirement.
- IN_PROGRESS memungkinkan issue dan labor reporting.
- COMPLETED menerima finished goods.
- CLOSED mengunci perubahan dan melakukan final costing.
- Cancellation setelah material issue membutuhkan reversal atau return.

### 14.37.7 Material issue dan return

Metode:

- Manual issue
- Backflush
- Pick list
- Batch issue
- Serial issue

Aturan:

- Issue mengurangi inventory dan menambah WIP.
- Return mengurangi WIP dan menambah inventory.
- Batch dan serial harus dapat ditelusuri.
- Over-issue membutuhkan tolerance atau permission.
- Material substitute tercatat.

### 14.37.8 Production reporting

Fitur:

- Operation start dan finish
- Labor time
- Machine time
- Good quantity
- Reject quantity
- Downtime
- Scrap
- Rework
- By-product
- Co-product
- Notes
- Attachment

Aturan:

- Quantity dan time divalidasi.
- Operation sequence dapat dipaksa atau fleksibel berdasarkan routing.
- Rework memiliki production order atau operation khusus.
- Downtime reason menggunakan master reason.

### 14.37.9 Quality inspection

Inspection point:

- Incoming material
- In-process
- Finished goods
- Return
- Supplier subcontract output

Data:

- Inspection plan
- Parameter
- Specification
- Sample size
- Result
- Pass atau fail
- Disposition
- Inspector
- Attachment

Disposition:

- Accept
- Reject
- Rework
- Use as is
- Scrap
- Return to supplier
- Hold

### 14.37.10 Batch, serial, dan expiry

Fitur:

- Batch generation
- Supplier batch
- Internal batch
- Serial number
- Manufacture date
- Expiry date
- Retest date
- Quarantine
- Recall traceability
- Genealogy

Aturan:

- Serial unik per perusahaan.
- Batch balance tidak boleh negatif.
- Expired material dapat diblokir.
- Traceability mendukung backward dan forward tracing.

### 14.37.11 Subcontract manufacturing

Fitur:

- Subcontract operation
- Material sent to vendor
- Vendor-owned atau company-owned stock
- Subcontract PO
- Receipt
- Service charge
- Material reconciliation
- Quality inspection

### 14.37.12 Production costing

Komponen:

- Material
- Labor
- Machine
- Subcontract
- Variable overhead
- Fixed overhead
- Scrap
- By-product credit

Metode:

- Standard cost
- Moving average
- Actual order cost
- Variance analysis

Laporan:

- Planned versus actual cost
- Material variance
- Labor variance
- Overhead variance
- Yield variance
- Scrap report
- WIP valuation
- Production profitability

### Acceptance criteria

- BOM circular ditolak.
- Production order menyimpan snapshot BOM dan routing.
- Material issue menghasilkan inventory dan WIP posting konsisten.
- Finished goods completion menghasilkan stok dan journal.
- Batch dan serial dapat ditelusuri.
- Production order tidak dapat ditutup bila ada material atau WIP yang belum diselesaikan tanpa override.
- MRP menghasilkan suggestion yang dapat diaudit.
- Production variance dapat dijelaskan dari transaksi sumber.

---

## 14.38 Human Resources dan Payroll

### Tujuan

Modul HR dan payroll mengelola lifecycle karyawan, waktu kerja, hak cuti, benefit, payroll, BPJS, PPh 21, dan posting ke akuntansi dengan perlindungan data yang ketat.

### 14.38.1 Employee master

Data:

- Employee number
- Full name
- Preferred name
- Personal identity
- Tax identity
- BPJS identifiers
- Contact
- Address
- Emergency contact
- Bank account
- Join date
- Employment status
- Department
- Position
- Grade
- Manager
- Work location
- Cost center
- Project assignment
- Contract
- Salary group
- Tax profile
- Status

Aturan:

- Data sensitif menggunakan field-level permission.
- Perubahan bank account, salary, tax profile, dan identity dicatat.
- Employee number unik.
- Employee record tidak dihapus setelah memiliki payroll.

### 14.38.2 Organization dan position

Fitur:

- Organization unit
- Department
- Position
- Job level
- Reporting line
- Position headcount
- Vacancy
- Organization chart
- Effective-dated assignment

### 14.38.3 Recruitment

Fitur:

- Manpower request
- Job opening
- Candidate
- Interview
- Assessment
- Offer
- Hiring approval
- Candidate document
- Conversion to employee

### 14.38.4 Onboarding dan offboarding

Onboarding:

- Checklist
- Document collection
- Account provisioning request
- Equipment assignment
- Orientation
- Probation
- Confirmation

Offboarding:

- Resignation atau termination
- Notice period
- Clearance
- Asset return
- Final payroll
- Access revocation
- Exit interview
- Employment certificate

### 14.38.5 Contract dan employment history

Fitur:

- Contract type
- Start dan end date
- Probation
- Renewal
- Amendment
- Transfer
- Promotion
- Demotion
- Salary change
- Organization assignment history

Aturan:

- Semua perubahan menggunakan tanggal efektif.
- Overlapping contract ditolak kecuali policy mengizinkan.
- Historical assignment tetap tersedia.

### 14.38.6 Attendance dan shift

Data:

- Work schedule
- Shift
- Clock-in
- Clock-out
- Break
- Work location
- Attendance status
- Correction request
- Approval
- Device atau source

Fitur:

- Fixed shift
- Rotating shift
- Flexible schedule
- Overnight shift
- Holiday calendar
- Late dan early leave
- Missing attendance
- Attendance correction

Aturan:

- Raw attendance tidak dihapus.
- Correction membuat versi atau adjustment.
- Timezone dan overnight shift ditangani eksplisit.
- Attendance final menjadi input payroll.

### 14.38.7 Leave

Fitur:

- Leave type
- Entitlement
- Accrual
- Carry forward
- Expiry
- Request
- Approval
- Half day
- Attachment
- Leave balance
- Encashment bila diizinkan

Aturan:

- Policy bertanggal efektif.
- Balance tidak boleh berubah tanpa ledger.
- Leave approval mempertimbangkan hierarchy.
- Negative balance mengikuti policy.

### 14.38.8 Overtime

Fitur:

- Overtime request
- Pre-approval
- Actual overtime
- Overtime category
- Holiday overtime
- Meal atau transport allowance
- Payroll integration

Aturan:

- Formula menggunakan configuration bertanggal efektif.
- Approval dan attendance harus dapat direkonsiliasi.
- Manual adjustment memerlukan alasan.
- Referensi ketenagakerjaan diverifikasi terhadap ketentuan resmi terbaru.

### 14.38.9 Payroll configuration

Master:

- Pay group
- Payroll calendar
- Earnings component
- Deduction component
- Benefit component
- Employer contribution
- Employee contribution
- Formula
- Rounding
- Proration
- Retroactive calculation
- Cost allocation
- GL mapping
- Effective date

Jenis komponen:

- Basic salary
- Fixed allowance
- Variable allowance
- Overtime
- Bonus
- Commission
- Reimbursement
- Loan deduction
- Attendance deduction
- BPJS
- PPh 21
- Other deduction

### 14.38.10 Payroll process

Status:

```text
DRAFT
CALCULATED
REVIEW
APPROVED
POSTED
PAID
CANCELLED
```

Alur:

1. Payroll period dibuat.
2. Employee population dibekukan.
3. Attendance, leave, overtime, dan variable input diambil.
4. Calculation dijalankan.
5. Exception diperiksa.
6. Payroll direview.
7. Payroll disetujui.
8. Payroll diposting ke GL.
9. Payment file atau instruction dibuat.
10. Payslip diterbitkan.
11. Period dikunci.

Aturan:

- Calculation dapat diulang sebelum approval.
- POSTED payroll immutable.
- Correction menggunakan off-cycle atau adjustment payroll.
- Payroll run idempotent.
- Employee yang sama tidak boleh masuk dua payroll final untuk pay group dan period sama.

### 14.38.11 BPJS

Ruang lingkup:

- BPJS Kesehatan
- JHT
- JKK
- JKM
- JP
- JKP
- Program lain sesuai konfigurasi resmi

Fitur:

- Participation status
- Wage base
- Employee contribution
- Employer contribution
- Ceiling atau floor
- Risk class bila relevan
- Effective-dated rate
- Reconciliation
- Payment summary
- Export

Aturan:

- Tarif dan batas tidak di-hardcode.
- Konfigurasi harus dapat diperbarui tanpa mengubah payroll historis.
- Perhitungan menyimpan basis, rate, dan hasil.
- Referensi implementasi harus diperiksa pada sumber resmi BPJS Kesehatan dan BPJS Ketenagakerjaan.

Referensi resmi awal:

- [BPJS Ketenagakerjaan](https://www.bpjsketenagakerjaan.go.id/)
- [Informasi program dan iuran BPJS Ketenagakerjaan](https://www.bpjsketenagakerjaan.go.id/artikel/18913/artikel-berapa-besaran-iuran-jht%2C-jkk%2C-jkm%2C-jp-dan-jkp)
- [BPJS Kesehatan](https://www.bpjs-kesehatan.go.id/)

### 14.38.12 PPh 21 payroll

Modul menggunakan tax engine pada bagian Pajak Indonesia dan menyediakan:

- Employee tax profile
- Regular dan irregular income
- Tax allowance atau gross-up
- Previous income
- Period calculation
- Annual reconciliation
- Tax adjustment
- Withholding certificate data

### 14.38.13 Reimbursement dan employee loan

Reimbursement:

- Expense claim
- Receipt
- Policy
- Approval
- Tax treatment
- Payment
- Project dan cost center allocation

Loan:

- Loan agreement
- Principal
- Interest
- Installment
- Payroll deduction
- Outstanding balance
- Early settlement

### 14.38.14 Payslip dan employee self-service

Fitur employee:

- Profile
- Attendance
- Leave request
- Overtime request
- Payslip
- Tax document
- BPJS summary
- Reimbursement
- Loan
- Personal document

Aturan:

- Employee hanya melihat data sendiri.
- Payslip authenticated dan tidak menggunakan public URL.
- Download memiliki audit log bila diperlukan.
- Manager access dibatasi sesuai policy.

### 14.38.15 Performance management

Fitur:

- Goal
- KPI
- Review cycle
- Self review
- Manager review
- Calibration
- Rating
- Development plan
- Performance history

### 14.38.16 Payroll accounting

Posting minimum:

```text
Dr Salary Expense
Dr Allowance Expense
Dr Employer BPJS Expense
Cr Payroll Payable
Cr Employee Tax Payable
Cr Employee BPJS Payable
Cr Employer BPJS Payable
Cr Loan Receivable / Other Deduction
```

Dimensi dapat berasal dari department, cost center, project, dan employee allocation.

### Acceptance criteria

- Payroll final tidak dapat diubah langsung.
- Calculation menyimpan input, formula version, dan hasil.
- Salary dan payslip hanya dapat diakses role berwenang.
- Employee dan employer contribution terpisah.
- Payroll dapat direkonsiliasi dengan payment dan GL.
- Attendance correction tidak menghapus raw data.
- Effective-dated policy tidak mengubah payroll historis.
- Final payroll dan tax documents dapat ditelusuri.

---

## 14.39 Advanced Procurement

### Tujuan

Advanced procurement mengelola kebutuhan pembelian dari permintaan internal sampai pemilihan vendor, kontrak, penerimaan, matching, dan evaluasi kinerja.

### 14.39.1 Purchase request

Data:

- Request number
- Requester
- Department
- Cost center
- Project
- Required date
- Item atau service
- Quantity
- Estimated price
- Preferred vendor
- Business justification
- Budget reference
- Attachment
- Status

Status:

```text
DRAFT
SUBMITTED
PENDING_APPROVAL
APPROVED
PARTIALLY_SOURCED
SOURCED
REJECTED
CANCELLED
```

Aturan:

- Approval berdasarkan nilai, category, department, dan budget.
- PR tidak membuat commitment sampai policy tertentu.
- Approved PR dapat dikonsolidasikan.
- Perubahan material setelah approval memerlukan resubmission.

### 14.39.2 Request for quotation

Fitur:

- RFQ batch
- Vendor invitation
- Item specification
- Terms
- Submission deadline
- Clarification
- Vendor response
- Attachment
- Revision
- Confidential opening opsional

Status:

```text
DRAFT
ISSUED
OPEN
CLOSED
EVALUATED
AWARDED
CANCELLED
```

### 14.39.3 Vendor quotation dan bid comparison

Data:

- Vendor
- Price
- Currency
- Lead time
- Payment term
- Delivery term
- Tax
- Warranty
- Validity
- Technical compliance
- Commercial compliance
- Score
- Notes

Fitur:

- Side-by-side comparison
- Weighted scoring
- Total cost comparison
- Landed cost
- Recommendation
- Approval
- Award split

Aturan:

- Scoring formula terdokumentasi.
- Perubahan score manual tercatat.
- Award dapat dibagi ke beberapa vendor.
- Conflict-of-interest declaration dapat ditambahkan.

### 14.39.4 Purchase contract dan blanket PO

Fitur:

- Contract number
- Vendor
- Effective period
- Item atau service
- Price agreement
- Quantity ceiling
- Value ceiling
- Call-off
- SLA
- Penalty
- Renewal
- Attachment
- Contract owner

Aturan:

- Call-off tidak boleh melebihi ceiling tanpa amendment.
- Expired contract tidak dapat digunakan.
- Amendment memiliki version history.
- Contract utilization dapat dilaporkan.

### 14.39.5 Approval matrix

Kriteria:

- Company
- Legal entity
- Department
- Category
- Amount
- Currency
- Project
- Budget status
- Risk level
- Vendor type

Fitur:

- Sequential approval
- Parallel approval
- Delegation
- Escalation
- Substitute approver
- Approval expiry
- Rejection reason

Aturan:

- Approver tidak dapat menyetujui transaksi sendiri bila segregation policy aktif.
- Delegation memiliki periode.
- Approval history immutable.

### 14.39.6 Three-way matching

Dokumen:

- Purchase order
- Goods receipt
- Supplier invoice

Match:

- Quantity
- Price
- Tax
- Freight
- Additional charge
- Tolerance

Hasil:

```text
MATCHED
WITHIN_TOLERANCE
EXCEPTION
BLOCKED
```

Aturan:

- Invoice EXCEPTION dapat diblokir dari payment.
- Override membutuhkan role dan reason.
- Service procurement dapat menggunakan two-way atau service acceptance.
- Matching result tersimpan untuk audit.

### 14.39.7 Vendor management dan evaluation

Data evaluasi:

- Quality
- Delivery
- Price competitiveness
- Responsiveness
- Compliance
- Claim rate
- Rejection rate
- Contract performance
- Risk

Fitur:

- Approved vendor list
- Vendor category
- Qualification
- Document expiry
- Blacklist atau hold
- Periodic scorecard
- Corrective action

### 14.39.8 Procurement analytics

Laporan:

- Spend by vendor
- Spend by category
- PR to PO lead time
- RFQ savings
- Contract utilization
- Maverick spend
- PO exception
- Vendor delivery performance
- Three-way match exception
- Budget commitment

### Acceptance criteria

- Purchase request mengikuti approval matrix.
- RFQ dan quotation memiliki revision history.
- Bid comparison dapat ditelusuri ke sumber data vendor.
- Contract ceiling tidak dapat dilampaui tanpa amendment.
- Supplier invoice exception dapat diblokir.
- Vendor evaluation menggunakan data transaksi dan input terkontrol.
- Procurement commitment terhubung ke budget.

---

## 14.40 Return dan Claim

### Tujuan

Modul return dan claim menangani pembalikan barang, nilai, pajak, dan tanggung jawab dari pelanggan atau pemasok tanpa merusak transaksi historis.

### 14.40.1 Return Merchandise Authorization

Data:

- RMA number
- Source invoice atau delivery
- Customer atau supplier
- Item
- Quantity
- Batch atau serial
- Reason
- Condition
- Requested resolution
- Attachment
- Status

Status:

```text
DRAFT
REQUESTED
AUTHORIZED
RECEIVED
INSPECTED
RESOLVED
CLOSED
REJECTED
CANCELLED
```

### 14.40.2 Sales return

Alur:

1. Customer claim atau return request dibuat.
2. Eligibility diperiksa.
3. RMA diotorisasi.
4. Barang diterima ke return atau quarantine warehouse.
5. Inspection dilakukan.
6. Disposition ditentukan.
7. Credit note, replacement, repair, atau rejection diproses.
8. Inventory, accounting, tax, dan sales history diperbarui.

Aturan:

- Return tidak boleh melebihi quantity eligible.
- Batch dan serial harus cocok bila digunakan.
- Barang return tidak otomatis menjadi available stock.
- Credit note terhubung ke invoice awal.
- Revenue dan tax correction menggunakan posting rule.

### 14.40.3 Purchase return

Alur:

1. Defect atau mismatch ditemukan.
2. Supplier claim dibuat.
3. Return authorization dicatat.
4. Barang dipindahkan ke return warehouse.
5. Shipment ke supplier diposting.
6. Debit note, replacement, atau refund dicatat.
7. AP, inventory, dan tax diperbarui.

### 14.40.4 Claim management

Tipe claim:

- Quantity shortage
- Damaged goods
- Quality failure
- Pricing difference
- Late delivery
- Warranty
- Service failure
- Lost shipment

Data:

- Claim amount
- Responsible party
- Evidence
- Investigation
- Root cause
- Proposed resolution
- Approved resolution
- Settlement
- SLA

### 14.40.5 Inspection dan disposition

Disposition:

- Return to stock
- Quarantine
- Repair
- Rework
- Scrap
- Return to supplier
- Replace
- No fault found

Aturan:

- Disposition menghasilkan stock movement yang sesuai.
- Scrap membutuhkan approval bila melewati threshold.
- Warranty serial dapat divalidasi terhadap penjualan dan periode warranty.

### 14.40.6 Credit note, debit note, refund, dan replacement

Aturan:

- Credit atau debit note adalah dokumen finansial terpisah.
- Refund hanya berasal dari approved settlement.
- Replacement dapat membuat delivery atau purchase receipt baru.
- Tax correction mengikuti tax period dan rule.
- Dokumen awal tidak dihapus.

### Acceptance criteria

- Return memiliki traceability ke dokumen sumber.
- Quantity return tidak melebihi eligibility tanpa override.
- Barang quarantine tidak dianggap available.
- Credit dan debit note menghasilkan journal seimbang.
- Tax correction tetap mempertahankan dokumen awal.
- Claim memiliki owner, SLA, evidence, dan resolution.
- Batch atau serial return dapat ditelusuri.

---

## 14.41 Project Management dan Project Accounting

### Tujuan

Modul project mengelola pekerjaan berbasis scope, waktu, resource, biaya, pendapatan, dan margin serta terintegrasi dengan procurement, inventory, HR, payroll, dan accounting.

### 14.41.1 Project master

Data:

- Project code
- Project name
- Customer
- Contract
- Project type
- Project manager
- Sponsor
- Department
- Cost center
- Currency
- Start date
- End date
- Billing method
- Revenue method
- Budget
- Status
- Confidentiality

Status:

```text
DRAFT
PLANNED
ACTIVE
ON_HOLD
COMPLETED
CLOSED
CANCELLED
```

### 14.41.2 Work Breakdown Structure

Data:

- WBS code
- Parent WBS
- Deliverable
- Task
- Milestone
- Owner
- Planned dates
- Dependency
- Progress method
- Budget
- Billing flag
- Capitalizable flag

Aturan:

- WBS hierarchy tidak boleh circular.
- Closed task tidak menerima time atau cost baru tanpa reopen.
- Baseline disimpan sebagai versi.

### 14.41.3 Task, milestone, dan dependency

Fitur:

- Task board
- List
- Gantt-ready data
- Dependency
- Priority
- Checklist
- Comment
- Attachment
- Progress
- Milestone approval
- Change history

### 14.41.4 Resource allocation

Resource:

- Employee
- Contractor
- Work center
- Equipment
- Generic role

Fitur:

- Allocation percentage
- Planned hours
- Capacity
- Availability
- Rate
- Conflict detection
- Resource calendar

### 14.41.5 Timesheet

Data:

- Employee
- Project
- WBS
- Task
- Date
- Hours
- Billable
- Activity
- Notes
- Approval status

Status:

```text
DRAFT
SUBMITTED
APPROVED
REJECTED
POSTED
```

Aturan:

- Hours divalidasi terhadap calendar.
- Approved timesheet menjadi project cost.
- Rate historis disimpan.
- Correction menggunakan adjustment.
- Billable time dapat masuk billing proposal.

### 14.41.6 Project expense

Sumber:

- Employee expense
- Supplier invoice
- Inventory issue
- Payroll allocation
- Fixed asset usage
- Journal
- Subcontractor

Aturan:

- Semua cost memiliki project dan WBS.
- Cost dapat billable atau non-billable.
- Cost yang telah ditagihkan tidak dihapus.
- Project cost direkonsiliasi ke GL.

### 14.41.7 Project procurement dan inventory

Fitur:

- Project purchase request
- Project purchase order
- Direct delivery
- Project warehouse
- Material reservation
- Material issue
- Material return
- Equipment assignment

Aturan:

- Procurement memeriksa project budget.
- Material issue menjadi project cost.
- Unused material dapat dikembalikan.
- Project-specific inventory dapat dipisahkan.

### 14.41.8 Project budget dan forecast

Kategori:

- Labor
- Material
- Subcontract
- Travel
- Equipment
- Overhead
- Contingency
- Revenue

Fitur:

- Baseline
- Revision
- Forecast at completion
- Estimate to complete
- Commitment
- Actual
- Variance
- Change budget

### 14.41.9 Project billing

Metode:

- Time and material
- Fixed price
- Milestone
- Progress percentage
- Cost plus
- Retainer
- Recurring

Fitur:

- Billing schedule
- Billing proposal
- Unbilled time
- Unbilled expense
- Holdback atau retention
- Advance
- Invoice generation
- Credit adjustment

Aturan:

- Billing proposal harus direview.
- Billed quantity atau amount tidak boleh ganda.
- Source time dan cost diberi billed status.
- Revenue dan AR diposting sesuai accounting rule.

### 14.41.10 Revenue recognition

Metode dapat dikonfigurasi sesuai kebijakan perusahaan:

- On invoice
- On delivery
- On milestone acceptance
- Percentage of completion
- Straight-line
- Manual schedule

Aturan:

- Method memiliki approval.
- Recognition journal dapat direversal.
- Contract modification tidak menghapus recognition historis.
- Revenue schedule dapat direkonsiliasi dengan contract dan GL.

### 14.41.11 Project risk, issue, dan change request

Risk:

- Probability
- Impact
- Owner
- Mitigation
- Residual risk

Issue:

- Severity
- Owner
- Due date
- Resolution
- Escalation

Change request:

- Scope impact
- Schedule impact
- Cost impact
- Revenue impact
- Approval
- Baseline revision

### 14.41.12 Project profitability

Metric:

- Contract value
- Recognized revenue
- Billed revenue
- Collected amount
- Committed cost
- Actual cost
- Forecast cost
- Gross margin
- Margin percentage
- Utilization
- Earned value optional

### Acceptance criteria

- Project cost dapat ditelusuri ke source transaction dan GL.
- Timesheet approved menghasilkan cost sesuai rate historis.
- Project procurement memeriksa budget.
- Billing source tidak dapat ditagihkan dua kali.
- Project profitability menggunakan posted revenue dan cost.
- Baseline dan revision tersimpan.
- Closed project tidak menerima transaksi baru tanpa reopen.
- Change request memperbarui scope, schedule, atau budget melalui approval.

---

# 15. Workflow dan State Machine

## 15.1 Aturan umum status

1. Status hanya dapat berubah melalui transition yang diizinkan.
2. Client tidak boleh menentukan status tujuan secara bebas.
3. Server menentukan transition berdasarkan status saat ini.
4. Setiap transition dicatat di audit log.
5. Transition yang menghasilkan stok atau pembayaran harus atomik.
6. Transition harus idempotent.
7. Pengguna harus memiliki permission yang sesuai.
8. Cancellation atau void memerlukan alasan.

## 15.2 Contoh transition Purchase Order

```text
DRAFT
  ├── submit → PENDING_APPROVAL
  └── cancel → CANCELLED

PENDING_APPROVAL
  ├── approve → APPROVED
  ├── reject → DRAFT
  └── cancel → CANCELLED

APPROVED
  ├── send → SENT
  └── cancel → CANCELLED

SENT
  ├── receive partial → PARTIALLY_RECEIVED
  ├── receive full → RECEIVED
  └── cancel → CANCELLED

PARTIALLY_RECEIVED
  ├── receive more → PARTIALLY_RECEIVED
  ├── receive full → RECEIVED
  └── close → CLOSED

RECEIVED
  └── close → CLOSED
```

## 15.3 Contoh transition Invoice

```text
DRAFT
  ├── issue → ISSUED
  └── delete → SOFT_DELETED

ISSUED
  ├── partial payment → PARTIALLY_PAID
  ├── full payment → PAID
  ├── due date passed → OVERDUE
  └── void → VOID

PARTIALLY_PAID
  ├── full payment → PAID
  ├── due date passed → OVERDUE
  └── void → VOID

OVERDUE
  ├── partial payment → OVERDUE
  ├── full payment → PAID
  └── void → VOID
```

---

## 15.4 Contoh transition Production Order

```text
DRAFT
  ├── plan → PLANNED
  └── cancel → CANCELLED

PLANNED
  ├── release → RELEASED
  ├── reschedule → PLANNED
  └── cancel → CANCELLED

RELEASED
  ├── start → IN_PROGRESS
  └── cancel with reversal → CANCELLED

IN_PROGRESS
  ├── partial completion → PARTIALLY_COMPLETED
  ├── full completion → COMPLETED
  └── hold → IN_PROGRESS

PARTIALLY_COMPLETED
  ├── report more → PARTIALLY_COMPLETED
  └── complete → COMPLETED

COMPLETED
  └── final cost and close → CLOSED
```

## 15.5 Contoh transition Payroll Run

```text
DRAFT
  └── calculate → CALCULATED

CALCULATED
  ├── recalculate → CALCULATED
  └── submit review → REVIEW

REVIEW
  ├── return → CALCULATED
  └── approve → APPROVED

APPROVED
  ├── post → POSTED
  └── cancel → CANCELLED

POSTED
  └── record payment → PAID
```

## 15.6 Contoh transition Purchase Request

```text
DRAFT
  ├── submit → SUBMITTED
  └── cancel → CANCELLED

SUBMITTED
  └── route approval → PENDING_APPROVAL

PENDING_APPROVAL
  ├── approve → APPROVED
  ├── reject → REJECTED
  └── return → DRAFT

APPROVED
  ├── source partial → PARTIALLY_SOURCED
  └── source full → SOURCED
```

## 15.7 Contoh transition Return

```text
DRAFT
  └── request → REQUESTED

REQUESTED
  ├── authorize → AUTHORIZED
  └── reject → REJECTED

AUTHORIZED
  └── receive → RECEIVED

RECEIVED
  └── inspect → INSPECTED

INSPECTED
  └── resolve → RESOLVED

RESOLVED
  └── close → CLOSED
```

## 15.8 Contoh transition Project

```text
DRAFT
  └── plan → PLANNED

PLANNED
  ├── activate → ACTIVE
  └── cancel → CANCELLED

ACTIVE
  ├── hold → ON_HOLD
  ├── complete → COMPLETED
  └── cancel → CANCELLED

ON_HOLD
  └── resume → ACTIVE

COMPLETED
  └── financial and operational close → CLOSED
```

---

# 16. Model Data Tingkat Tinggi

## 16.1 Identity dan tenant

- User
- Company
- LegalEntity
- Membership
- Role
- Permission
- RolePermission
- MembershipBranch
- MembershipWarehouse
- Invitation
- ApprovalMatrix
- ApprovalStep
- Delegation

## 16.2 Organisasi dan analytic dimension

- Branch
- Warehouse
- Department
- CostCenter
- ProfitCenter
- AnalyticDimension
- AnalyticDimensionValue
- CompanySetting
- DocumentSequence

## 16.3 Master data komersial

- Product
- ProductCategory
- Unit
- Customer
- CustomerAddress
- Supplier
- SupplierContact
- PriceList
- PaymentTerm
- Currency
- ExchangeRate

## 16.4 Inventory

- StockBalance
- StockMovement
- StockReservation
- StockTransfer
- StockTransferItem
- StockAdjustment
- StockAdjustmentItem
- StockOpname
- StockOpnameItem
- InventoryLot
- SerialNumber
- InventoryValuationLayer

## 16.5 Procurement dan purchasing

- PurchaseRequest
- PurchaseRequestItem
- RequestForQuotation
- RfqVendor
- VendorQuotation
- VendorQuotationItem
- BidComparison
- PurchaseContract
- PurchaseContractItem
- PurchaseOrder
- PurchaseOrderItem
- GoodsReceipt
- GoodsReceiptItem
- SupplierBill
- SupplierBillItem
- ThreeWayMatch
- SupplierPayment
- SupplierPaymentAllocation
- VendorEvaluation

## 16.6 Sales

- SalesQuotation
- SalesQuotationItem
- SalesOrder
- SalesOrderItem
- DeliveryOrder
- DeliveryOrderItem
- SalesInvoice
- SalesInvoiceItem
- CustomerPayment
- CustomerPaymentAllocation

## 16.7 Return dan claim

- ReturnAuthorization
- SalesReturn
- SalesReturnItem
- PurchaseReturn
- PurchaseReturnItem
- Claim
- ClaimEvidence
- Inspection
- ReturnDisposition
- CreditNote
- CreditNoteItem
- DebitNote
- DebitNoteItem
- Refund
- ReplacementOrder

## 16.8 Akuntansi dan keuangan

- Account
- AccountGroup
- FiscalYear
- FiscalPeriod
- Journal
- JournalLine
- PostingRule
- PostingRuleVersion
- SubledgerEntry
- BankAccount
- BankStatement
- BankStatementLine
- BankReconciliation
- Budget
- BudgetLine
- BudgetRevision
- PaymentBatch
- CashForecast
- RevaluationRun
- ClosingChecklist

## 16.9 Fixed assets

- AssetCategory
- FixedAsset
- AssetBook
- AssetTransaction
- DepreciationRun
- AssetTransfer
- AssetDisposal
- AssetCount

## 16.10 Pajak

- TaxRegistration
- TaxCode
- TaxRule
- TaxRuleVersion
- TaxTransaction
- TaxInvoice
- WithholdingDocument
- TaxPayment
- TaxSettlement
- TaxPeriod
- TaxReconciliation
- TaxExportBatch
- TaxExportItem
- TaxExternalResponse

## 16.11 Manufacturing

- BillOfMaterial
- BillOfMaterialItem
- Routing
- RoutingOperation
- WorkCenter
- WorkCenterCalendar
- Forecast
- MasterProductionSchedule
- MrpRun
- MrpSuggestion
- ProductionOrder
- ProductionMaterial
- ProductionOperation
- ProductionReport
- MaterialIssue
- MaterialReturn
- QualityPlan
- QualityInspection
- SubcontractOrder
- ProductionCost
- ProductionVariance

## 16.12 Human resources dan payroll

- Employee
- EmployeeIdentity
- EmployeeBankAccount
- OrganizationUnit
- Position
- EmploymentContract
- EmployeeAssignment
- RecruitmentRequest
- Candidate
- JobOffer
- OnboardingChecklist
- OffboardingChecklist
- Shift
- WorkSchedule
- AttendanceEvent
- AttendanceRecord
- LeaveType
- LeaveLedger
- LeaveRequest
- OvertimeRequest
- PayGroup
- PayrollPeriod
- PayrollRun
- PayrollEmployee
- PayrollComponent
- PayrollResult
- BpjsConfiguration
- EmployeeBpjs
- EmployeeTaxProfile
- Payslip
- Reimbursement
- EmployeeLoan
- PerformanceCycle
- PerformanceReview

## 16.13 Project management

- Project
- ProjectContract
- ProjectBaseline
- WorkBreakdownStructure
- ProjectTask
- ProjectMilestone
- ProjectResource
- ResourceAllocation
- Timesheet
- TimesheetLine
- ProjectExpense
- ProjectBudget
- ProjectBudgetLine
- ProjectForecast
- ProjectBillingSchedule
- ProjectBillingProposal
- ProjectRevenueSchedule
- ProjectRisk
- ProjectIssue
- ProjectChangeRequest

## 16.14 Supporting

- FileAsset
- AuditLog
- Notification
- Activity
- ImportJob
- ExportJob
- IdempotencyRecord
- IntegrationEndpoint
- IntegrationCredentialReference
- WebhookEvent
- PostingError
- BackgroundJob

---

# 17. Standar Model Database

Setiap tabel bisnis utama memiliki:

- `id`
- `companyId`
- `createdAt`
- `updatedAt`
- `createdById`
- `updatedById`
- `deletedAt` apabila mendukung soft delete

Tabel transaksi dapat memiliki:

- `number`
- `status`
- `documentDate`
- `postedAt`
- `postedById`
- `cancelledAt`
- `cancelledById`
- `cancellationReason`
- `version`

Tabel regulasi atau konfigurasi bertanggal efektif dapat memiliki:

- `effectiveFrom`
- `effectiveTo`
- `ruleVersion`
- `legalReference`
- `approvedAt`
- `approvedById`

Tabel akuntansi dapat memiliki:

- `legalEntityId`
- `fiscalPeriodId`
- `journalId`
- `sourceModule`
- `sourceDocumentType`
- `sourceDocumentId`
- `currencyId`
- `exchangeRate`
- `baseAmount`
- `dimensionSnapshot`

## Aturan tipe data

- ID internal menggunakan UUID.
- Kinde user ID menggunakan string.
- Nilai uang menggunakan Decimal.
- Kuantitas menggunakan Decimal.
- Timestamp disimpan dalam UTC.
- Metadata fleksibel menggunakan JSONB secara terbatas.
- Status menggunakan enum atau constrained string.
- Email disimpan dalam format ternormalisasi.
- Nomor telepon disimpan secara konsisten.

## Indeks minimum

Setiap tabel multi-tenant harus mempertimbangkan indeks:

```text
(companyId)
(companyId, status)
(companyId, createdAt)
(companyId, number)
(companyId, branchId)
(companyId, warehouseId)
(companyId, deletedAt)
```

---

# 18. Aturan Integritas Data

1. Semua data bisnis harus memiliki `companyId`.
2. Data finansial harus memiliki `legalEntityId` bila perusahaan memiliki lebih dari satu legal entity.
3. Relasi antar-entitas harus berasal dari tenant yang sama.
4. Produk dari perusahaan A tidak dapat digunakan pada transaksi perusahaan B.
5. Gudang harus berada dalam perusahaan dan cabang yang benar.
6. User actor harus memiliki membership aktif.
7. Total transaksi dihitung server-side.
8. Harga, diskon, tax, dan exchange rate divalidasi server-side.
9. Quantity received tidak boleh melebihi sisa order tanpa permission.
10. Quantity delivered tidak boleh melebihi sisa order tanpa permission.
11. Pembayaran tidak boleh dialokasikan melebihi saldo.
12. Posting stok dilakukan dalam database transaction.
13. Posting pembayaran dilakukan dalam database transaction.
14. Journal posted harus seimbang.
15. Source transaction tidak boleh menghasilkan duplicate active journal.
16. Posting ke closed period ditolak.
17. Accounting reversal tidak menghapus journal awal.
18. Tax rule dipilih berdasarkan tanggal efektif.
19. Payroll formula dan contribution rule dipilih berdasarkan tanggal efektif.
20. Payroll posted tidak dapat diedit langsung.
21. Production order menyimpan snapshot BOM dan routing.
22. Material issue dan finished goods receipt harus dapat direkonsiliasi dengan WIP.
23. Batch dan serial harus menjaga uniqueness dan traceability.
24. Project billing source tidak dapat ditagihkan dua kali.
25. Project cost harus dapat direkonsiliasi ke GL.
26. Return tidak boleh melebihi quantity eligible tanpa override.
27. Credit note dan debit note tidak menghapus invoice awal.
28. Nomor dokumen harus unik pada scope sequence.
29. Operasi posting harus menggunakan idempotency key.
30. Optimistic locking dapat menggunakan field `version`.
31. Record posted tidak dapat diedit langsung.
32. Semua cancellation, reversal, correction, reopen, dan void memerlukan alasan.
33. Semua konfigurasi regulasi menyimpan versi dan tanggal efektif.
34. Data salary, identity, bank, tax, dan health benefit mengikuti field-level access.
35. Semua financial amount menggunakan Decimal.
36. Semua timestamp disimpan dalam UTC.
37. Approval history bersifat immutable.
38. File sensitif tidak menggunakan public delivery.
39. Integration response tidak boleh diubah setelah diterima, hanya dapat ditandai superseded.
40. Delete fisik untuk transaksi dan audit log tidak tersedia melalui aplikasi biasa.

---

# 19. API dan Server Actions

## 19.1 Prinsip

- Query dapat menggunakan Server Components.
- Mutasi menggunakan Server Actions atau Route Handlers.
- Integrasi eksternal menggunakan Route Handlers.
- Setiap endpoint memeriksa autentikasi.
- Setiap endpoint memeriksa company access.
- Input divalidasi menggunakan Zod.
- Output tidak boleh mengekspos data sensitif.
- Error internal tidak dikirim mentah ke client.

## 19.2 Format respons API

Contoh sukses:

```json
{
  "success": true,
  "data": {},
  "requestId": "req_123"
}
```

Contoh gagal:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stok tidak mencukupi."
  },
  "requestId": "req_123"
}
```

## 19.3 Error code standar

- `UNAUTHENTICATED`
- `UNAUTHORIZED`
- `MEMBERSHIP_INACTIVE`
- `COMPANY_NOT_FOUND`
- `BRANCH_ACCESS_DENIED`
- `WAREHOUSE_ACCESS_DENIED`
- `VALIDATION_ERROR`
- `DUPLICATE_NUMBER`
- `INVALID_STATUS_TRANSITION`
- `INSUFFICIENT_STOCK`
- `CREDIT_LIMIT_EXCEEDED`
- `OVERPAYMENT_NOT_ALLOWED`
- `FILE_UPLOAD_INVALID`
- `FILE_NOT_READY`
- `CONFLICT`
- `NOT_FOUND`
- `ACCOUNTING_PERIOD_CLOSED`
- `JOURNAL_NOT_BALANCED`
- `POSTING_RULE_NOT_FOUND`
- `TAX_RULE_NOT_FOUND`
- `PAYROLL_PERIOD_LOCKED`
- `BOM_CIRCULAR_REFERENCE`
- `PRODUCTION_SHORTAGE`
- `BUDGET_EXCEEDED`
- `DUPLICATE_BILLING_SOURCE`
- `RETURN_QUANTITY_EXCEEDED`
- `MATCHING_EXCEPTION`
- `INTERNAL_ERROR`

## 19.4 Idempotency

Operasi berikut wajib mendukung idempotency:

- Posting penerimaan
- Posting pengiriman
- Posting transfer
- Posting adjustment
- Posting pembayaran
- Completion upload
- Webhook
- Pembuatan nomor transaksi
- Journal posting dan reversal
- Tax export
- Payroll calculation final dan posting
- MRP run
- Production completion
- Project billing
- Return settlement
- Bank statement import

Idempotency key disimpan dengan:

- Company ID
- User ID
- Action
- Key
- Response
- Created at
- Expires at

---

# 20. Persyaratan UX

## 20.1 Desain umum

- Antarmuka bersih dan profesional.
- Navigasi konsisten.
- Status menggunakan badge.
- Form panjang dibagi menjadi section.
- Tabel mendukung filter dan pagination.
- Aksi berbahaya membutuhkan konfirmasi.
- Error ditampilkan dekat field terkait.
- Pengguna mendapatkan feedback setelah submit.
- Loading state tidak mengunci seluruh aplikasi tanpa kebutuhan.

## 20.2 Form transaksi

Form transaksi harus memiliki:

- Header
- Informasi pihak terkait
- Tabel item
- Ringkasan nilai
- Catatan
- Lampiran
- Riwayat status
- Tombol aksi sesuai status

## 20.3 Tabel

Tabel utama harus mendukung:

- Search
- Filter
- Sort
- Pagination
- Column visibility
- Sticky header
- Empty state
- Loading skeleton
- Export
- Bulk action terbatas

## 20.4 Responsif

### Desktop

- Sidebar permanen
- Tabel penuh
- Multi-column form

### Tablet

- Sidebar collapsible
- Tabel dapat scroll horizontal
- Form dua kolom atau satu kolom

### Mobile

- Drawer navigation
- Card list sebagai alternatif tabel
- Action button mudah dijangkau
- Form satu kolom
- Pengunggahan kamera untuk dokumen atau foto

## 20.5 Accessibility

- Keyboard navigation
- Label form yang jelas
- Focus state
- Kontras warna memadai
- Tombol tidak hanya dibedakan oleh warna
- Error dapat dibaca screen reader
- Dialog mengelola focus dengan benar

## 20.6 Workbench khusus

Sistem menyediakan workbench berdasarkan peran:

- Finance close workbench
- Tax reconciliation workbench
- Procurement sourcing workbench
- Production planner workbench
- Shop floor reporting workbench
- Payroll review workbench
- Project manager workbench
- Return dan claim resolution workbench

Setiap workbench menampilkan exception, tugas menunggu, deadline, dan tindakan yang relevan.

## 20.7 Kerahasiaan UI

- Salary disamarkan bila pengguna tidak memiliki permission.
- Bank account ditampilkan sebagian.
- Tax identity dapat dimasking.
- Attachment sensitif tidak memiliki preview public.
- Screen dan export mengikuti field-level permission.
- Shared dashboard tidak menampilkan informasi payroll individu.

---

# 21. Persyaratan Non-Fungsional

## 21.1 Performa

Target awal:

- P95 halaman umum di bawah 2,5 detik.
- P95 query daftar di bawah 1,5 detik.
- P95 mutasi sederhana di bawah 1,5 detik.
- Posting transaksi stok di bawah 3 detik.
- Search menghasilkan respons di bawah 800 milidetik untuk dataset normal.
- Tabel menggunakan pagination.
- Data besar tidak dimuat sekaligus.

## 21.2 Skalabilitas

Sistem harus mendukung secara bertahap:

- Banyak perusahaan
- Banyak cabang
- Banyak gudang
- Ratusan pengguna per perusahaan
- Jutaan stock movement
- Ratusan ribu transaksi
- Banyak upload dokumen

Strategi:

- Compound index dengan company ID
- Pagination berbasis cursor untuk tabel besar
- Connection pooling
- Query select minimal
- Background processing untuk pekerjaan berat
- Cache untuk data referensi
- Materialized view untuk laporan berat

## 21.3 Availability

Target awal:

- Aplikasi tersedia 99,5% per bulan, tidak termasuk maintenance terjadwal.
- Error penting memiliki alert.
- Deployment memiliki rollback.
- Migrasi dilakukan secara backward-compatible.

## 21.4 Konsistensi

- Operasi stok menggunakan strong consistency.
- Operasi pembayaran menggunakan strong consistency.
- Dashboard dapat menerima sedikit keterlambatan untuk agregat.
- File upload menggunakan eventual consistency antara Cloudinary dan database.
- Financial ledger, payroll final, dan production posting menggunakan strong consistency.
- MRP, dashboard, forecasting, dan analytic aggregation dapat diproses asynchronous.
- Regulatory export menggunakan status machine dan retry yang dapat diaudit.

## 21.5 Data volume target

Target desain awal:

- 10 juta journal line per tenant besar
- 20 juta stock movement per tenant besar
- 1 juta payroll result line lintas periode
- 1 juta production transaction
- 500 ribu timesheet line per tahun
- 100 ribu dokumen Cloudinary per tenant besar

Angka tersebut merupakan target desain, bukan jaminan paket layanan. Pengujian aktual harus dilakukan menggunakan volume representatif.

## 21.6 Retention dan archival

- Financial journal mengikuti kebijakan retensi perusahaan dan regulasi.
- Payroll dan employee document memiliki retention policy terpisah.
- Tax document dan export response tidak dihapus selama periode retensi.
- Operational detail lama dapat diarsipkan tanpa kehilangan laporan.
- Archive tetap mempertahankan tenant isolation dan auditability.

---

# 22. Keamanan

## 22.1 Authentication

- Semua route ERP membutuhkan Kinde session.
- Session expired menghasilkan login ulang.
- User internal diperiksa status aktifnya.
- Password tidak disimpan di database aplikasi.

## 22.2 Authorization

- Semua mutasi memeriksa membership.
- Semua query memfilter company ID.
- Semua akses cabang dan gudang diperiksa.
- Permission diperiksa di server.
- UI permission hanya untuk pengalaman pengguna.

## 22.3 Secret management

Secret berikut hanya berada di server:

- Kinde client secret
- Database URL
- Direct database URL
- Cloudinary API secret
- Supabase secret apabila digunakan
- Webhook secret

Secret disimpan dalam Vercel Environment Variables.

## 22.4 Input validation

- Semua input eksternal divalidasi.
- File type dan file size divalidasi.
- String dinormalisasi.
- HTML tidak diterima kecuali disanitasi.
- Query dinamis tidak menggunakan raw SQL tanpa parameterisasi.

## 22.5 Protection

- Rate limiting untuk login-sensitive endpoint.
- Rate limiting untuk upload signature.
- CSRF protection sesuai pola framework.
- Secure cookies.
- SameSite cookies.
- Security headers.
- Content Security Policy bertahap.
- Clickjacking protection.
- MIME sniffing protection.

## 22.6 Data sensitif

Data berikut dianggap sensitif:

- Rekening bank
- Dokumen invoice
- Bukti pembayaran
- Nomor pajak
- Alamat pelanggan
- Data kontak pribadi
- Audit log
- Salary dan payroll result
- Employee identity
- Employee bank account
- Tax identity dan tax documents
- BPJS information
- Medical atau leave attachment tertentu
- Vendor bank account
- Project confidential contract
- Manufacturing formula atau BOM rahasia

Data sensitif:

- Tidak ditampilkan tanpa permission.
- Tidak dicatat dalam log aplikasi secara lengkap.
- Tidak dikirim ke analytics pihak ketiga.
- Tidak menggunakan public Cloudinary delivery.
- Dapat menggunakan field-level encryption untuk kolom tertentu.
- Memiliki access log untuk payroll dan dokumen sangat sensitif.
- Mengikuti prinsip least privilege dan segregation of duties.

## 22.7 Segregation of duties

Contoh konflik role:

- Pembuat vendor tidak boleh otomatis menyetujui perubahan rekening vendor.
- Pembuat payment batch tidak boleh menjadi satu-satunya approver.
- Pembuat journal manual tidak boleh menjadi satu-satunya poster.
- Payroll preparer dan payroll approver dipisahkan.
- Procurement requester dan final approver dapat dipisahkan.
- Tax preparer dan tax period closer dapat dipisahkan.
- Production reporter dan quality inspector dapat dipisahkan.

Sistem menyediakan conflict matrix dan exception approval.

---

# 23. Multi-Tenancy

## 23.1 Model

Shared database, shared schema, row-level tenant isolation melalui `companyId`.

## 23.2 Ketentuan

- Semua tabel bisnis memiliki `companyId`.
- Semua repository atau service menerima tenant context.
- Tidak ada query bisnis tanpa company filter.
- Unique constraint memasukkan company ID.
- Cache key memasukkan company ID.
- Job background membawa company context.
- Audit log membawa company ID.
- File path Cloudinary memasukkan company ID.

## 23.3 Pencegahan kebocoran tenant

- Helper `requireCompanyAccess`.
- Repository tenant-aware.
- Test lint atau unit untuk query tenant.
- Integration test cross-company.
- Tidak menerima company ID tanpa validasi membership.
- Tidak menggunakan global admin credential dari browser.

---

# 24. Cloudinary

## 24.1 Struktur folder

```text
erp/
└── {companyId}/
    ├── company/
    ├── products/
    ├── customers/
    ├── suppliers/
    ├── purchasing/
    ├── sales/
    ├── inventory/
    └── payments/
```

## 24.2 Batas file awal

Contoh batas produk:

- Gambar produk: 5 MB
- Logo: 2 MB
- Dokumen PDF: 15 MB
- Spreadsheet: 10 MB
- Lampiran umum: 15 MB

Batas dapat disesuaikan berdasarkan paket.

## 24.3 Format diperbolehkan

### Gambar

- JPEG
- PNG
- WebP

### Dokumen

- PDF
- XLSX
- DOCX
- CSV

File executable tidak diperbolehkan.

## 24.4 Lifecycle

1. Record PENDING dibuat.
2. Browser upload.
3. Signature diverifikasi.
4. Record READY.
5. File terhubung ke entitas.
6. Penghapusan menandai DELETED.
7. Cloudinary asset dihapus setelah retention atau langsung sesuai kebijakan.
8. Orphan file dibersihkan secara berkala.

---

# 25. Deployment Vercel

## 25.1 Environment

- Development
- Preview
- Production

Setiap environment memiliki:

- Database terpisah atau schema terpisah
- Kinde application URL
- Cloudinary configuration
- Environment variables
- Callback URL

## 25.2 Build

Build harus menjalankan:

```text
prisma generate
next build
```

## 25.3 Runtime

- Prisma menggunakan Node.js runtime.
- Proxy authentication tidak mengimpor Prisma.
- Region Vercel diselaraskan dengan region Supabase.
- Preview deployment tidak boleh menggunakan database production secara default.

## 25.4 Deployment flow

```text
Pull Request
   │
   ├── Lint
   ├── Type check
   ├── Unit test
   ├── Integration test
   ├── Build
   ▼
Vercel Preview

Merge main
   │
   ├── Database migration
   ├── Production build
   ├── Smoke test
   ▼
Vercel Production
```

## 25.5 Rollback

- Aplikasi dapat rollback ke deployment sebelumnya.
- Migration harus backward-compatible.
- Destructive migration dilakukan bertahap.
- Feature flag digunakan untuk fitur besar.
- Database backup diperiksa sebelum migration berisiko tinggi.

---

# 26. Database dan Migration

## 26.1 Development

- Prisma schema disimpan di repository.
- Migration dibuat menggunakan Prisma Migrate.
- Folder migration wajib di-commit.
- Seed digunakan untuk role dan permission bawaan.

## 26.2 Production

- Menggunakan `prisma migrate deploy`.
- Tidak menggunakan `db push`.
- Tidak menggunakan `migrate dev`.
- Migration dijalankan satu kali.
- Migration memiliki log.
- Failure menghentikan deployment bila perubahan dibutuhkan aplikasi.

## 26.3 Pola perubahan aman

Untuk menambah kolom wajib:

1. Tambahkan nullable column.
2. Deploy aplikasi kompatibel.
3. Backfill data.
4. Validasi.
5. Ubah menjadi required.
6. Hapus fallback lama.

---

# 27. Observability

## 27.1 Logging

Setiap log server memiliki:

- Timestamp
- Level
- Request ID
- User ID
- Company ID
- Route
- Action
- Duration
- Error code

Data sensitif tidak dicatat.

## 27.2 Error tracking

Sistem harus menangkap:

- Server errors
- Client errors
- Failed Server Actions
- Database errors
- Upload failures
- Authentication failures
- Webhook failures

## 27.3 Metrics

- Request count
- Error rate
- Query duration
- Database connection usage
- Upload success rate
- Posting success rate
- Login success rate
- Job failure rate

## 27.4 Alert

Alert untuk:

- Error rate tinggi
- Database connection saturation
- Migration failure
- Upload failure spike
- Posting transaction failure
- Authentication callback error
- Storage quota hampir habis

---

# 28. Backup dan Disaster Recovery

## 28.1 Database

- Backup PostgreSQL mengikuti kemampuan paket Supabase.
- Backup tambahan dapat diekspor secara berkala.
- Restore process harus diuji.
- Backup tidak boleh hanya diasumsikan berhasil.
- Data critical dapat memiliki point-in-time recovery pada paket yang mendukung.

## 28.2 Cloudinary

- Metadata aset disimpan di PostgreSQL.
- Cloudinary asset ID disimpan.
- Penghapusan dokumen sensitif mengikuti retention.
- Dokumen penting dapat memiliki salinan arsip sesuai kebijakan bisnis.

## 28.3 Recovery

Dokumentasi recovery mencakup:

- Kehilangan deployment
- Database corruption
- Migration gagal
- Kinde configuration salah
- Cloudinary credential bocor
- File orphan
- Tenant deletion tidak disengaja

---

# 29. Analytics Produk

## Event yang dilacak

- User logged in
- Company created
- User invited
- Product created
- Customer created
- Supplier created
- Purchase order created
- Purchase order approved
- Goods receipt posted
- Sales order created
- Delivery posted
- Invoice issued
- Payment posted
- Report exported
- File uploaded
- Import completed
- Journal posted
- Accounting period closed
- Bank reconciliation completed
- Tax export generated
- Tax period closed
- MRP run completed
- Production order released
- Production order completed
- Payroll run calculated
- Payroll run posted
- Purchase request approved
- RFQ awarded
- Three-way match exception created
- Return authorized
- Claim resolved
- Project activated
- Timesheet approved
- Project invoice generated

## Aturan analytics

- Tidak mengirim data finansial sensitif.
- Tidak mengirim nama pelanggan.
- Tidak mengirim isi invoice.
- Event menggunakan ID pseudonim.
- Analytics dipisahkan dari audit log.

---

# 30. KPI Produk

## Aktivasi

- Persentase pengguna yang menyelesaikan onboarding.
- Waktu dari registrasi ke transaksi pertama.
- Persentase perusahaan yang membuat produk.
- Persentase perusahaan yang mengundang tim.

## Engagement

- Pengguna aktif harian dan bulanan.
- Jumlah transaksi per perusahaan.
- Frekuensi penggunaan dashboard.
- Jumlah laporan yang dilihat.
- Jumlah upload dokumen.

## Operasional

- Persentase PO selesai.
- Persentase SO selesai.
- Rata-rata waktu approval.
- Rata-rata waktu penerimaan.
- Rata-rata waktu pengiriman.
- Persentase invoice dibayar tepat waktu.

## Finance

- Days sales outstanding
- Days payable outstanding
- Cash conversion cycle
- Close duration
- Reconciliation exception
- Budget variance
- Unposted transaction count

## Procurement

- PR to PO cycle time
- Sourcing savings
- Contract utilization
- Maverick spend
- Vendor on-time delivery
- Three-way match exception rate

## Manufacturing

- Schedule adherence
- Material shortage rate
- Yield
- Scrap rate
- Overall equipment effectiveness bila diterapkan
- Production cost variance
- WIP aging

## Human resources

- Headcount
- Turnover
- Absence rate
- Overtime
- Payroll exception rate
- Time to hire
- Leave utilization

## Project

- On-time milestone
- Budget variance
- Forecast at completion
- Billable utilization
- Gross margin
- Unbilled work
- Collection status

## Reliability

- Error rate
- Posting failure rate
- Upload failure rate
- Database timeout rate
- Authentication failure rate
- Journal imbalance attempt
- Payroll calculation exception
- MRP failure
- Integration retry rate

## Retention

- Retention perusahaan bulan pertama
- Retention pengguna
- Perusahaan aktif per paket
- Churn

---

# 31. Testing Strategy

## 31.1 Unit test

Meliputi:

- Perhitungan total, diskon, tax, dan currency
- State transition
- Permission dan segregation of duties
- Document number
- Stock calculation
- Payment allocation
- Journal balancing
- Posting rule mapping
- Fiscal period validation
- Bank matching
- Budget availability
- Tax rule effective date
- Payroll formula
- BPJS formula configuration
- PPh 21 calculation version
- BOM explosion
- MRP net requirement
- Production costing
- Return eligibility
- Project billing eligibility
- Revenue schedule
- File validation

## 31.2 Integration test

Meliputi:

- Kinde user synchronization
- Company membership
- Product creation
- PO dan goods receipt posting
- Three-way matching
- Sales delivery dan invoice posting
- Payment dan bank reconciliation
- Journal posting dan reversal
- Subledger to GL reconciliation
- Tax document generation
- Tax export batch
- Payroll calculation dan posting
- BPJS dan PPh 21 result
- MRP suggestion
- Production material issue dan completion
- Batch dan serial traceability
- Return, credit note, dan refund
- Project timesheet, cost, billing, dan profitability
- File completion
- Audit creation

## 31.3 End-to-end test core trading

1. User login.
2. User membuat perusahaan.
3. User membuat product, supplier, dan customer.
4. User membuat purchase request dan PO.
5. Warehouse menerima barang.
6. Supplier invoice melalui matching.
7. Finance membayar supplier.
8. Sales membuat SO.
9. Warehouse mengirim barang.
10. Finance menerbitkan invoice.
11. Customer payment direkonsiliasi.
12. Journal dan financial statements terbarui.

## 31.4 End-to-end test manufacturing

1. Planner membuat BOM dan routing.
2. Demand dibuat.
3. MRP dijalankan.
4. Planned order dikonversi.
5. Production order dirilis.
6. Material di-issue.
7. Operation dan labor dilaporkan.
8. Quality inspection dilakukan.
9. Finished goods diterima.
10. Production order ditutup.
11. WIP dan variance direkonsiliasi ke GL.

## 31.5 End-to-end test payroll

1. Employee dibuat.
2. Contract dan salary ditetapkan.
3. Attendance, leave, dan overtime masuk.
4. Payroll dihitung.
5. Exception diperbaiki.
6. Payroll disetujui.
7. BPJS dan PPh 21 dihitung.
8. Payroll diposting.
9. Payment instruction dibuat.
10. Payslip diterbitkan.
11. Payroll direkonsiliasi ke GL.

## 31.6 End-to-end test project

1. Project dan baseline dibuat.
2. Resource dialokasikan.
3. Timesheet dan expense diposting.
4. Purchase dan material issue dikaitkan.
5. Milestone disetujui.
6. Billing proposal dibuat.
7. Invoice diterbitkan.
8. Revenue dan cost masuk GL.
9. Profitability report diverifikasi.
10. Project ditutup.

## 31.7 Security test

- Cross-tenant access
- Unauthorized legal entity access
- Unauthorized branch dan warehouse
- Role escalation
- Segregation conflict
- IDOR
- Payroll field exposure
- Tax document exposure
- Invalid file upload
- Forged Cloudinary response
- Replay posting request
- Duplicate journal request
- Closed period bypass
- SQL injection
- XSS
- Secret exposure
- Export data leakage

## 31.8 Performance dan concurrency test

- Daftar produk besar
- Journal line besar
- Stock movement besar
- Payroll ribuan employee
- MRP multi-level BOM
- Production posting simultan
- Nomor dokumen concurrency
- Payment allocation simultan
- Bank statement besar
- Timesheet besar
- Dashboard multi-module
- Upload file simultan

## 31.9 Regulatory regression test

- Tax rule version
- Tax rounding
- Tax document correction
- Payroll contribution version
- Overtime formula version
- Export schema version
- Historical calculation preservation

---

# 32. Acceptance Criteria

## 32.1 Core operational release

Core operational release dianggap siap ketika:

1. Pengguna dapat login melalui Kinde.
2. Pengguna dapat membuat perusahaan.
3. Owner dapat mengundang pengguna.
4. Admin dapat mengatur role.
5. Admin dapat membuat cabang dan gudang.
6. Pengguna dapat membuat produk.
7. Pengguna dapat membuat customer dan supplier.
8. Pengguna dapat membuat purchase order.
9. Purchase order dapat disetujui.
10. Goods receipt dapat diposting.
11. Stok bertambah setelah receipt.
12. Pengguna dapat membuat sales order.
13. Sales order dapat disetujui.
14. Delivery dapat diposting.
15. Stok berkurang setelah delivery.
16. Invoice dapat diterbitkan.
17. Pembayaran dapat dicatat.
18. Saldo invoice diperbarui.
19. Dokumen dapat diunggah ke Cloudinary.
20. Dokumen sensitif tidak dapat diakses publik.
21. Semua transaksi terisolasi per perusahaan.
22. Semua posting kritis idempotent.
23. Audit log tersedia.
24. Laporan dasar tersedia.
25. Aplikasi dapat dideploy di Vercel.
26. Migration dapat dijalankan secara aman.
27. Tidak ada secret pada client bundle.
28. Cross-tenant test lulus.
29. Backup dan recovery procedure terdokumentasi.
30. Error monitoring aktif.

## 32.2 Full accounting dan finance release

1. Chart of Accounts dapat dikonfigurasi.
2. Semua journal posted seimbang.
3. Posting rule menghubungkan transaksi operasional dengan GL.
4. Trial balance seimbang.
5. AR dan AP dapat direkonsiliasi.
6. Inventory valuation dapat direkonsiliasi.
7. Bank statement dapat direkonsiliasi.
8. Budget commitment dan actual tersedia.
9. Fixed asset dapat didepresiasi.
10. Period dapat ditutup dan dikontrol.
11. Financial statements dapat dihasilkan.
12. Drill-down mencapai dokumen sumber.
13. Reversal mempertahankan journal awal.
14. Multi-currency menyimpan historical rate.
15. Closing checklist dan audit tersedia.

## 32.3 Tax Indonesia release

1. Tax code dan rate bertanggal efektif.
2. PPN masukan dan keluaran dapat direkonsiliasi.
3. Withholding tax dapat dihitung dan didokumentasikan.
4. PPh 21 menerima input payroll.
5. Faktur atau bukti potong memiliki correction history.
6. Tax payment dapat dialokasikan.
7. Tax period dapat ditutup.
8. Export batch dapat divalidasi dan diaudit.
9. Perubahan rule tidak mengubah transaksi historis.
10. Credential regulasi hanya tersedia di server.

## 32.4 Manufacturing release

1. BOM version dan routing tersedia.
2. MRP menghasilkan planned suggestion.
3. Production order dapat dirilis.
4. Material issue mengurangi inventory.
5. WIP tercatat.
6. Finished goods menambah inventory.
7. Batch atau serial dapat ditelusuri.
8. Quality inspection menghasilkan disposition.
9. Production order dapat ditutup.
10. Planned dan actual cost dapat dibandingkan.
11. Production posting dapat direkonsiliasi ke GL.

## 32.5 HR dan payroll release

1. Employee lifecycle tersedia.
2. Attendance, leave, shift, dan overtime tersedia.
3. Payroll dapat dihitung, direview, dan disetujui.
4. BPJS dan PPh 21 menggunakan rule bertanggal efektif.
5. Payslip hanya dapat diakses pihak berwenang.
6. Payroll posted immutable.
7. Correction menggunakan adjustment payroll.
8. Payment instruction dapat dibuat.
9. Payroll dapat direkonsiliasi ke GL.
10. Field-level security diuji.

## 32.6 Advanced procurement release

1. Purchase request menggunakan approval matrix.
2. RFQ dapat dikirim ke beberapa vendor.
3. Quotation dapat dibandingkan.
4. Award dapat dikonversi menjadi PO atau contract.
5. Contract ceiling dikontrol.
6. Three-way matching tersedia.
7. Exception dapat memblokir payment.
8. Vendor scorecard tersedia.
9. Commitment terhubung ke budget.

## 32.7 Return dan claim release

1. RMA terhubung ke transaksi sumber.
2. Sales dan purchase return tersedia.
3. Inspection dan disposition tersedia.
4. Credit note, debit note, refund, dan replacement tersedia.
5. Inventory, tax, dan accounting posting konsisten.
6. Batch dan serial return dapat ditelusuri.
7. Claim SLA dan resolution dapat dipantau.

## 32.8 Project release

1. Project, WBS, task, dan milestone tersedia.
2. Resource allocation tersedia.
3. Timesheet dapat disetujui.
4. Cost dari payroll, expense, purchase, dan inventory masuk project.
5. Budget versus commitment versus actual tersedia.
6. Billing proposal tidak menggandakan source.
7. Revenue dan cost terhubung ke GL.
8. Profitability dapat dihitung.
9. Change request menyimpan revision.
10. Project dapat ditutup secara operasional dan finansial.

---

# 33. Roadmap Implementasi

## Fase 0: Fondasi platform

- Repository
- Next.js
- TypeScript
- Prisma
- Supabase PostgreSQL
- Kinde Auth
- Cloudinary
- Vercel
- CI/CD
- Logging
- Error tracking
- Design system
- Tenant context
- Permission framework
- Workflow framework
- Integration adapter framework

## Fase 1: Tenant dan administrasi

- Company
- Legal entity
- Membership
- Role dan permission
- Approval matrix
- Branch
- Warehouse
- Department dan cost center
- Onboarding
- User invitation
- Audit log

## Fase 2: Master data dan inventory

- Product
- Category
- Unit
- Customer
- Supplier
- Stock balance
- Stock movement
- Transfer
- Adjustment
- Stock opname
- Batch dan serial foundation
- Import dan export

## Fase 3: Core procurement dan sales

- Purchase order
- Goods receipt
- Supplier bill
- Supplier payment
- Sales order
- Reservation
- Delivery
- Sales invoice
- Customer payment
- Operational reports

## Fase 4: Accounting foundation

- Chart of Accounts
- Journal engine
- Posting rule
- General ledger
- AR dan AP subledger
- Fiscal period
- Trial balance
- Financial statement foundation
- Subledger reconciliation

## Fase 5: Cash, bank, budget, dan fixed asset

- Cash dan bank
- Bank statement
- Bank reconciliation
- Payment batch
- Budget
- Commitment
- Fixed asset
- Depreciation
- Multi-currency
- Period closing

## Fase 6: Pajak Indonesia

- Tax profile
- Tax master
- PPN
- Withholding
- PPh 21 integration
- Tax document
- Tax reconciliation
- Tax period
- Regulatory export adapter
- Correction workflow

## Fase 7: Advanced procurement

- Purchase request
- RFQ
- Vendor quotation
- Bid comparison
- Contract
- Blanket PO
- Approval bertingkat
- Three-way matching
- Vendor evaluation
- Procurement analytics

## Fase 8: Manufacturing foundation

- BOM
- Routing
- Work center
- Production order
- Material issue
- Finished goods
- Batch dan serial
- Quality inspection
- Production costing

## Fase 9: Planning dan manufacturing lanjutan

- Forecast
- MPS
- MRP
- Capacity planning
- Subcontract manufacturing
- Rework
- By-product dan co-product
- Production variance
- WIP reconciliation

## Fase 10: Human resources

- Employee
- Organization dan position
- Contract
- Recruitment
- Onboarding
- Attendance
- Shift
- Leave
- Overtime
- Employee self-service

## Fase 11: Payroll

- Pay group
- Payroll component
- Payroll calculation
- BPJS
- PPh 21
- Reimbursement
- Employee loan
- Payslip
- Payroll payment
- Payroll accounting
- Performance review

## Fase 12: Return dan claim

- RMA
- Sales return
- Purchase return
- Customer claim
- Supplier claim
- Warranty
- Inspection
- Credit dan debit note
- Refund dan replacement

## Fase 13: Project management

- Project
- WBS
- Task dan milestone
- Resource
- Timesheet
- Project expense
- Project procurement
- Project budget
- Project billing
- Revenue schedule
- Project profitability
- Risk, issue, dan change request

## Fase 14: Reporting, consolidation readiness, dan hardening

- Executive dashboard
- Cross-module reporting
- Data warehouse readiness
- Consolidation mapping
- Performance optimization
- Security testing
- Regulatory regression
- Backup testing
- Disaster recovery drill
- Documentation
- Production readiness

## Release strategy

Setiap fase dapat dibagi menjadi beberapa release kecil. Fitur finansial atau regulasi tidak boleh diaktifkan untuk production sebelum:

- Posting matrix disetujui
- Reconciliation test lulus
- Historical scenario test lulus
- Role dan segregation test lulus
- Migration dan rollback plan tersedia
- User acceptance test selesai

---

# 34. Risiko dan Mitigasi

## Risiko 1: Kebocoran data antar-perusahaan

**Dampak:** sangat tinggi.

**Mitigasi:**

- Tenant-aware repository
- Mandatory company filter
- Cross-tenant integration test
- Central authorization helper
- Code review khusus security

## Risiko 2: Stok tidak konsisten

**Dampak:** sangat tinggi.

**Mitigasi:**

- Immutable stock movement
- Database transaction
- Idempotency
- Reversal
- Reconciliation report

## Risiko 3: Nomor dokumen ganda

**Dampak:** tinggi.

**Mitigasi:**

- Unique constraint
- Atomic sequence
- Retry pada conflict
- Server-generated number

## Risiko 4: Terlalu banyak koneksi database

**Dampak:** tinggi.

**Mitigasi:**

- Supavisor transaction pooler
- Pool kecil
- Singleton Prisma
- Monitoring connection
- Region berdekatan

## Risiko 5: Upload file gagal atau yatim

**Dampak:** menengah.

**Mitigasi:**

- PENDING status
- Completion verification
- Cleanup job
- Retry
- Orphan report

## Risiko 6: Permission terlalu rumit

**Dampak:** menengah.

**Mitigasi:**

- Role bawaan
- Permission naming konsisten
- Permission matrix
- Deny by default
- Role preview

## Risiko 7: Scope terlalu besar

**Dampak:** tinggi.

**Mitigasi:**

- MVP ketat
- Modul bertahap
- Feature flag
- Prioritas workflow inti
- Out-of-scope yang jelas

## Risiko 8: Migration merusak production

**Dampak:** tinggi.

**Mitigasi:**

- Backward-compatible migration
- Preview database
- Backup
- Migration review
- Rollback plan

## Risiko 9: Vendor lock-in

**Dampak:** menengah.

**Mitigasi:**

- Database standar PostgreSQL
- Metadata file disimpan lokal
- Abstraction untuk authentication
- Abstraction untuk storage
- Domain logic tidak bergantung langsung pada vendor

## Risiko 10: Salah posting akuntansi

**Dampak:** sangat tinggi.

**Mitigasi:**

- Versioned posting rule
- Journal preview
- Balanced journal constraint
- Reconciliation
- Controlled reversal
- Finance UAT

## Risiko 11: Perubahan regulasi pajak dan payroll

**Dampak:** sangat tinggi.

**Mitigasi:**

- Effective-dated configuration
- Adapter integrasi
- Regulatory regression test
- Legal reference metadata
- Review tenaga profesional
- Tidak meng-hardcode tarif

## Risiko 12: Kebocoran data payroll dan employee

**Dampak:** sangat tinggi.

**Mitigasi:**

- Field-level permission
- Masking
- Access log
- Encryption untuk field tertentu
- Segregation of duties
- Export restriction

## Risiko 13: MRP menghasilkan rencana yang tidak realistis

**Dampak:** tinggi.

**Mitigasi:**

- Planner review
- Calendar dan lead time validation
- Exception messages
- Frozen horizon
- Scenario run
- Capacity check

## Risiko 14: Production cost tidak dapat direkonsiliasi

**Dampak:** tinggi.

**Mitigasi:**

- WIP subledger
- Material, labor, dan overhead breakdown
- Order closing checklist
- Variance report
- GL reconciliation

## Risiko 15: Payroll salah dibayar

**Dampak:** sangat tinggi.

**Mitigasi:**

- Simulation
- Exception report
- Maker-checker
- Payroll lock
- Payment reconciliation
- Off-cycle correction

## Risiko 16: Procurement fraud atau konflik kepentingan

**Dampak:** tinggi.

**Mitigasi:**

- Approval matrix
- Segregation of duties
- Bid comparison audit
- Vendor bank change control
- Conflict declaration
- Spend analytics

## Risiko 17: Return dan claim menggelembungkan refund

**Dampak:** tinggi.

**Mitigasi:**

- Eligibility validation
- Source document traceability
- Inspection
- Approval threshold
- Duplicate claim detection
- Settlement reconciliation

## Risiko 18: Project margin tidak akurat

**Dampak:** tinggi.

**Mitigasi:**

- Mandatory project dimension
- Timesheet approval
- Cost allocation
- Billing source lock
- GL reconciliation
- Forecast review

## Risiko 19: Scope ERP terlalu besar

**Dampak:** sangat tinggi.

**Mitigasi:**

- Release bertahap
- Bounded context
- Feature flag
- Definition of done per module
- Integration contract
- Tidak mengaktifkan modul setengah matang

---

# 35. Keputusan Teknis Utama

1. Next.js App Router digunakan sebagai frontend dan backend.
2. Server Components digunakan untuk query awal.
3. Server Actions digunakan untuk mutasi internal.
4. Route Handlers digunakan untuk integrasi dan upload.
5. Kinde menjadi satu-satunya authentication provider.
6. Password tidak disimpan di aplikasi.
7. PostgreSQL menjadi sumber kebenaran data bisnis.
8. Prisma menjadi jalur utama akses database.
9. Supabase Auth tidak digunakan.
10. Supabase Storage tidak digunakan.
11. Cloudinary digunakan untuk file dan gambar.
12. Vercel digunakan untuk hosting.
13. Prisma berjalan pada Node.js runtime.
14. Multi-tenancy menggunakan `companyId`.
15. Semua data bisnis melalui server.
16. Transaksi posted tidak dapat diedit.
17. Stock movement menjadi sumber sejarah stok.
18. Audit log disimpan terpisah.
19. Nilai uang menggunakan Decimal.
20. Migration production menggunakan Prisma Migrate Deploy.
21. Akuntansi menggunakan double-entry journal.
22. Journal posted dan stock movement posted bersifat append-only.
23. Posting rule memiliki versi dan tanggal efektif.
24. Tax, payroll, BPJS, dan overtime rule tidak di-hardcode.
25. Closed period diperiksa pada service layer dan database constraint yang memungkinkan.
26. Module posting menggunakan outbox atau job queue bila proses lintas layanan menjadi asynchronous.
27. Financial report berasal dari posted journal.
28. MRP suggestion tidak otomatis menjadi committed order tanpa policy.
29. BOM dan routing disnapshot pada production order.
30. Payroll data menggunakan field-level authorization.
31. Project, cost center, dan department menjadi analytic dimensions.
32. Integrasi DJP, BPJS, bank, dan pihak ketiga menggunakan adapter.
33. Return dan correction membuat dokumen baru, bukan mengubah sejarah.
34. Semua calculation engine menyimpan version identifier.
35. Background job harus idempotent dan observable.

---

# 36. Struktur Folder Awal

```text
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── files/
│   │   ├── integrations/
│   │   ├── webhooks/
│   │   ├── exports/
│   │   └── health/
│   ├── (public)/
│   ├── (auth)/
│   ├── (onboarding)/
│   └── (erp)/
│       ├── dashboard/
│       ├── master-data/
│       ├── inventory/
│       ├── procurement/
│       ├── sales/
│       ├── returns/
│       ├── manufacturing/
│       ├── finance/
│       ├── tax/
│       ├── hr/
│       ├── payroll/
│       ├── projects/
│       ├── reports/
│       └── settings/
├── components/
│   ├── ui/
│   ├── forms/
│   ├── tables/
│   ├── workbenches/
│   └── layouts/
├── modules/
│   ├── identity/
│   ├── tenancy/
│   ├── organization/
│   ├── master-data/
│   ├── inventory/
│   ├── procurement/
│   ├── sales/
│   ├── returns/
│   ├── accounting/
│   ├── treasury/
│   ├── tax/
│   ├── manufacturing/
│   ├── hr/
│   ├── payroll/
│   ├── projects/
│   ├── files/
│   ├── approvals/
│   └── reporting/
├── server/
│   ├── services/
│   ├── repositories/
│   ├── policies/
│   ├── posting/
│   ├── workflows/
│   ├── calculations/
│   ├── integrations/
│   ├── jobs/
│   └── transactions/
├── lib/
│   ├── auth/
│   ├── db/
│   ├── cloudinary/
│   ├── permissions/
│   ├── validation/
│   ├── logging/
│   ├── errors/
│   ├── money/
│   ├── dates/
│   └── idempotency/
└── types/

prisma/
├── schema/
│   ├── identity.prisma
│   ├── organization.prisma
│   ├── inventory.prisma
│   ├── procurement.prisma
│   ├── sales.prisma
│   ├── accounting.prisma
│   ├── tax.prisma
│   ├── manufacturing.prisma
│   ├── hr.prisma
│   ├── payroll.prisma
│   ├── project.prisma
│   └── supporting.prisma
├── migrations/
└── seed/
```

Catatan: Prisma multi-file schema dapat digunakan bila versi Prisma yang dipilih mendukung dan tim menyepakati pola tersebut. Jika tidak, schema tetap dapat berada dalam satu file dengan pembagian komentar per bounded context.

---

# 37. Definition of Done

Sebuah fitur dianggap selesai ketika:

- Requirement telah dipenuhi.
- UI tersedia.
- Validasi client dan server tersedia.
- Authorization tersedia.
- Tenant isolation tersedia.
- Error state tersedia.
- Empty state tersedia.
- Loading state tersedia.
- Audit log tersedia bila diperlukan.
- Unit test tersedia.
- Integration test tersedia.
- Type check lulus.
- Lint lulus.
- Build lulus.
- Dokumentasi diperbarui.
- Acceptance criteria lulus.
- Tidak mengekspos secret.
- Tidak menghasilkan akses lintas tenant.
- Query telah ditinjau untuk performa.
- Migration telah direview.
- Fitur dapat digunakan pada mobile dan desktop.
- Posting rule telah diuji bila fitur memengaruhi finance.
- Reconciliation report tersedia bila fitur membuat subledger.
- Effective-date scenario diuji bila fitur bersifat regulasi.
- Segregation of duties diuji bila fitur memiliki approval atau payment.
- Historical data tetap dapat dibaca setelah perubahan configuration.
- Operational reversal dan financial reversal telah dirancang.
- Data privacy review selesai untuk HR, payroll, tax, dan bank.

---

# 38. Pertanyaan Produk yang Perlu Diputuskan

## 38.1 Organisasi dan tenant

1. Apakah satu company memiliki beberapa legal entity?
2. Apakah satu user dapat memiliki role berbeda per legal entity atau cabang?
3. Apakah intercompany transaction diperlukan?
4. Apakah consolidation masuk release awal finance?

## 38.2 Inventory dan sales

5. Apakah stok negatif diperbolehkan?
6. Apakah batch, serial, dan expiry wajib untuk industri target?
7. Apakah reservasi stok aktif saat SO approved atau confirmed?
8. Apakah invoice dibuat berdasarkan order, delivery, atau keduanya?
9. Apakah harga berbeda per cabang, customer group, atau contract?
10. Apakah landed cost diperlukan?

## 38.3 Akuntansi dan keuangan

11. Kalender fiskal apa yang digunakan?
12. Metode inventory valuation apa yang diaktifkan?
13. Apakah multi-currency masuk release pertama finance?
14. Dimensi apa yang wajib pada journal?
15. Apakah manual journal membutuhkan approval?
16. Apakah financial consolidation diperlukan?
17. Apakah cash flow menggunakan direct, indirect, atau keduanya?
18. Apakah fixed asset memiliki accounting book dan tax book terpisah?
19. Apakah project revenue recognition diperlukan pada release awal?

## 38.4 Pajak Indonesia

20. Tax type apa yang relevan untuk industri target?
21. Apakah perusahaan berstatus PKP?
22. Apakah regulatory export cukup atau diperlukan direct integration?
23. Siapa yang dapat mengoreksi dokumen pajak?
24. Bagaimana tax period close diselaraskan dengan accounting close?
25. Apakah setiap legal entity memiliki tax registration terpisah?
26. Apakah tax document perlu electronic signing integration?

## 38.5 Manufaktur

27. Make-to-stock, make-to-order, engineer-to-order, atau campuran?
28. Apakah BOM multi-level diperlukan?
29. Apakah routing dan capacity planning wajib?
30. Apakah backflush diperbolehkan?
31. Bagaimana metode standard dan actual costing?
32. Apakah co-product dan by-product diperlukan?
33. Apakah subcontract manufacturing digunakan?
34. Apakah quality inspection wajib?
35. Apakah shop floor membutuhkan barcode atau mobile terminal?

## 38.6 HR dan payroll

36. Berapa pay group dan payroll frequency?
37. Apakah attendance berasal dari perangkat eksternal?
38. Apakah shift rotating dan overnight diperlukan?
39. Apakah payroll untuk pekerja tetap, kontrak, harian, dan freelancer?
40. Apakah employee self-service masuk release awal?
41. Siapa yang boleh melihat salary?
42. Bagaimana approval overtime dan reimbursement?
43. Apakah payroll payment file perlu format bank tertentu?
44. Apakah performance management masuk release awal HR?

## 38.7 Procurement

45. Berapa tingkat approval?
46. Apakah confidential bidding diperlukan?
47. Apakah budget hard block atau warning?
48. Apakah contract dan blanket PO wajib?
49. Apa tolerance three-way matching?
50. Bagaimana approved vendor list dikelola?

## 38.8 Return dan claim

51. Berapa lama return window?
52. Apakah warranty berdasarkan produk, serial, atau kontrak?
53. Apakah barang return masuk quarantine?
54. Siapa yang menyetujui refund?
55. Apakah claim memiliki SLA dan escalation?
56. Bagaimana accounting dan tax treatment untuk replacement gratis?

## 38.9 Project

57. Jenis proyek apa yang didukung?
58. Billing model apa yang digunakan?
59. Apakah timesheet wajib?
60. Apakah project dapat memiliki gudang sendiri?
61. Bagaimana overhead dialokasikan?
62. Apakah percentage-of-completion dibutuhkan?
63. Apakah project change request mengubah contract value?
64. Apakah resource planning lintas proyek diperlukan?

## 38.10 Platform

65. Berapa batas maksimum file?
66. Berapa lama audit log disimpan?
67. Berapa lama file yang dihapus dipertahankan?
68. Apakah paket SaaS dibatasi user, transaction, module, atau storage?
69. Apakah diperlukan trial?
70. Bagaimana mekanisme export seluruh tenant?
71. Integrasi apa yang menjadi prioritas pertama?
72. Apakah background job menggunakan provider eksternal atau Vercel-compatible queue?

---

# 39. Rekomendasi Keputusan Implementasi

Untuk menjaga kompleksitas tetap terkendali:

## 39.1 Core operational

- Stok negatif dinonaktifkan secara default.
- Approval core hanya satu tingkat, tetapi data model mendukung multi-level.
- Role berlaku pada tingkat perusahaan dengan akses cabang dan gudang terpisah.
- Reservasi stok dibuat saat SO approved.
- Invoice dibuat berdasarkan delivery secara default.
- Metode inventory valuation awal menggunakan moving average.
- Batch dan serial diaktifkan hanya untuk produk yang memerlukannya.

## 39.2 Accounting

- Double-entry dan posting rule dibangun sebelum modul regulasi serta payroll final.
- Satu base currency per legal entity.
- Multi-currency diaktifkan setelah GL dan reconciliation stabil.
- Manual journal membutuhkan approval di atas threshold.
- Closed period tidak dapat dilewati oleh role operasional.
- Consolidation ditunda, tetapi account mapping disiapkan.

## 39.3 Pajak Indonesia

- Tax engine effective-dated sejak awal.
- Tidak meng-hardcode tarif atau batas.
- Regulatory export didahulukan sebelum direct integration.
- Semua correction membuat dokumen versi baru.
- Tax close terpisah dari accounting close.
- Validasi akhir dilakukan oleh tax professional perusahaan.

## 39.4 Manufaktur

- Mulai dari discrete manufacturing.
- BOM multi-level dan production order menjadi fondasi.
- MRP suggestion membutuhkan planner approval.
- Backflush opsional per product atau operation.
- Quality inspection sederhana masuk release awal manufacturing.
- Advanced scheduling ditunda.

## 39.5 HR dan payroll

- Employee, attendance, leave, dan overtime dibangun sebelum payroll.
- Payroll bulanan menjadi konfigurasi awal.
- Formula BPJS dan PPh 21 bertanggal efektif.
- Salary menggunakan field-level permission.
- Payroll preparation, approval, dan payment dipisahkan.
- Payslip menggunakan authenticated delivery.

## 39.6 Procurement

- Purchase request, approval, RFQ, comparison, dan three-way match menjadi prioritas.
- Confidential bidding dan supplier portal ditunda.
- Budget menggunakan warning terlebih dahulu, lalu hard block setelah proses matang.
- Vendor bank change memakai maker-checker.

## 39.7 Return dan claim

- Semua barang return masuk quarantine secara default.
- Credit note dan debit note tidak mengubah invoice awal.
- Refund membutuhkan approval finance.
- Warranty berbasis produk dan serial bila serial tracking aktif.

## 39.8 Project

- Task, milestone, timesheet, budget, cost, dan billing menjadi release awal.
- Revenue recognition kompleks ditunda setelah project accounting stabil.
- Semua project cost wajib menggunakan project dan WBS dimension.
- Billing proposal wajib direview.
- Closed project menolak transaction baru.

## 39.9 Platform

- File maksimum default 15 MB.
- Dokumen transaksi menggunakan authenticated delivery.
- Foto produk menggunakan public delivery.
- Audit log disimpan minimal sesuai kebijakan legal dan kontrak pelanggan.
- Transaksi posted menggunakan reversal, bukan edit.
- Satu Kinde Organization tidak wajib sama dengan satu Company internal.
- Company dan legal entity internal menjadi sumber kebenaran tenant dan accounting scope.
- Setiap modul besar berada dalam bounded context dengan service dan policy sendiri.

---

# 40. Kesimpulan

Arunika ERP dirancang sebagai ERP SaaS modular lintas-fungsi untuk perusahaan dagang, distribusi, manufaktur, kontraktor, dan jasa profesional.

Produk mengintegrasikan:

- Identity dan multi-tenancy
- Master data
- Inventory
- Procurement
- Sales
- Return dan claim
- Accounting dan finance
- Pajak Indonesia
- Manufacturing
- Human resources dan payroll
- Project management
- Document management
- Reporting dan audit

Fondasi teknis produk adalah:

```text
Kinde
untuk identitas dan session

Next.js
untuk UI, workflow, business service, dan API

Prisma
untuk data access dan database transaction

Supabase PostgreSQL
untuk sumber kebenaran data operasional dan finansial

Cloudinary
untuk penyimpanan gambar dan dokumen

Vercel
untuk deployment dan runtime aplikasi
```

Fondasi domain produk adalah:

```text
Source Transaction
→ Validation
→ Approval
→ Operational Posting
→ Accounting Posting
→ Reconciliation
→ Reporting
→ Controlled Correction
```

Prioritas utama implementasi:

1. Tenant isolation
2. Permission dan segregation of duties
3. Konsistensi inventory
4. Double-entry accounting
5. Effective-dated regulatory rules
6. Payroll confidentiality
7. Manufacturing traceability
8. Project cost dan billing integrity
9. Auditability
10. Controlled deployment dan migration

Produk harus dikembangkan bertahap. ERP lengkap bukan satu fitur besar, melainkan kota kecil dengan jalan, listrik, saluran air, dan aturan lalu lintas. Modul yang tampak indah tetapi tidak terhubung ke ledger, permission, audit, dan reconciliation akan menjadi gedung tanpa fondasi. 🏙️

---

# 41. Referensi Implementasi Resmi

Bagian regulasi harus selalu diverifikasi ulang sebelum development atau go-live.

## Perpajakan

- [Coretax DJP](https://www.pajak.go.id/id/reformdjp/coretax)
- [Buku panduan Coretax DJP](https://pajak.go.id/coretaxpedia/buku-panduan-coretax-djp)
- [Informasi e-Bupot PPh 21/26](https://pajak.go.id/id/artikel/e-bupot-pph-pasal-2126-pelengkap-spt-masa-berbasis-web)
- [JDIH Kementerian Keuangan](https://jdih.kemenkeu.go.id/)
- [Direktorat Jenderal Pajak](https://www.pajak.go.id/)

## Ketenagakerjaan dan jaminan sosial

- [JDIH Kementerian Ketenagakerjaan](https://jdih.kemnaker.go.id/)
- [BPJS Ketenagakerjaan](https://www.bpjsketenagakerjaan.go.id/)
- [BPJS Kesehatan](https://www.bpjs-kesehatan.go.id/)

## Catatan

PRD ini mendefinisikan kebutuhan produk dan kontrol sistem, bukan penetapan interpretasi hukum. Tarif, batas, formula, format, dan kewajiban harus dikonfirmasi terhadap ketentuan yang berlaku pada periode transaksi serta ditinjau oleh pihak profesional yang berwenang.
