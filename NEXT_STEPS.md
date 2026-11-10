# Rencana Kerja Berikutnya — Arunika ERP

Pembaruan: 10 November 2026. Basis: PRD v2, gelombang perbaikan 1–20, modul payroll/retur/dokumen privat, batch C1–C7 dan D1–D4. Semua perubahan masih di working tree; belum commit/push/deploy.

Status verifikasi batch terakhir: 436 tes lulus (`npm test -- --coverage=false`), typecheck lulus, lint 0 error, `git diff --check` bersih. Ini tes unit/mock, bukan verifikasi DB/browser. Migrasi tambahan 20261110130000 sampai 20261110150400 belum diterapkan ke DB pengujian maupun produksi. Build produksi terakhir lulus sebelum batch C/D; build terbaru belum diverifikasi. Atas permintaan pengguna, verifikasi DB dan browser ditunda.

## Blok A — Operasional belum dikerjakan

| ID | Pekerjaan | Status |
|---|---|---|
| A1 | UI lampiran privat pada dokumen transaksi; API upload/download sudah tersedia | Belum |
| A2 | Pelepasan/disposal stok karantina | Diimplementasikan pada C3 (perlu verifikasi DB) |
| A3 | Undangan/manajemen role, akses cabang/gudang, nonaktifkan, proteksi owner tunggal | Belum |
| A4 | Administrasi cabang/gudang CRUD + invariant minimal satu aktif | Belum |

## Blok B — Persediaan belum dikerjakan

| ID | Pekerjaan | Status |
|---|---|---|
| B1 | Transfer gudang: ajukan–approve–kirim–terima; idempotent, mutasi berpasangan | Belum (C3 hanya transfer karantina khusus) |
| B2 | Stock opname: sesi/snapshot/hitung/review/approval/koreksi | Belum |
| B3 | Penyesuaian stok berdokumen dan alasan, bukan OPENING_BALANCE | Belum |

## Blok C — Melengkapi modul (hasil kode; belum uji DB/browser)

| ID | Pekerjaan | Status dan batas |
|---|---|---|
| C1 | Payroll THR/bonus, tunjangan, lembur, payslip privat, settlement utang 2101/2105/2106 | Kode+tes ada. Scope: pegawai tetap resident setahun penuh; settlement sekali penuh per run/akun; lembur disetujui bersama payroll; perlu akun 2107 untuk potongan sukarela. |
| C2 | Plafon JP 2026 | Tetap blokir by design. Admin harus memasukkan plafon berdasar sumber resmi dan persetujuan policy maker-checker; jangan isi tebakan. |
| C3 | Retur: release/scrap karantina, refund, replacement, klaim owner/SLA/evidence | Kode+tes ada. Replacement dinonaktifkan (fail-closed) karena draft belum memiliki jalur posting aman; belum selesai. Refund menolak replacement/refund sebelumnya; settlement harus approved. |
| C4 | Kontrak pembelian/blanket PO + call-off/ceiling/version/utilization | Kode+tes ada; UI create baru satu item, API mendukung multi-item. |
| C5 | Project billing task/timesheet → invoice, kunci sumber dobel tagih | Kode+tes ada; perlu migrasi dan uji jurnal DB. |
| C6 | Pencarian global produk/partner/dokumen dengan scope tenant+permission | Kode+UI+tes ada; browser belum diuji. |
| C7 | Laporan operasional stok/valuasi/open order/GR–DO outstanding/CSV | Kode+UI+tes ada; GR unbilled disimpulkan dari bill PO, bukan alokasi GR langsung. |

## Blok D — Penguatan (hasil kode; belum uji DB/browser)

| ID | Pekerjaan | Status dan batas |
|---|---|---|
| D1 | Cache query per company + clear saat switch | Kode+tes ada. |
| D2 | Idempotency invoice/GR/DO/MRP | Invoice/GR/DO persist key+requestHash; replay payload beda → 409 (migrasi 20261110150400). Konversi MRP CAS dalam transaksi; hash payload MRP belum ada. |
| D3 | Cleanup file PENDING kedaluwarsa, hapus Cloudinary tombstone >30 hari | Skrip `npm run files:cleanup` ada; scheduler belum terpasang, Cloudinary nyata belum diuji. |
| D4 | Tagihan pemasok: invoice duplikat/vendor sumber | Guard+constraint kode ada; migrasi belum diuji di DB. |

## Langkah verifikasi yang sengaja ditunda

- [ ] Terapkan seluruh migrasi sampai `20261110150400_posting_hash` pada PostgreSQL disposable; pastikan drift nol. Jangan pakai DB produksi tanpa audit skema.
- [ ] Jalankan `scripts/check-integrity.ts` dan `scripts/check-returns.ts` di DB disposable; tes konkurensi dan rollback sumber→stok→jurnal.
- [ ] Build Next.js terbaru dengan env dummy (batch C/D belum dibuild).
- [ ] Uji browser E2E: onboarding, PO→GR→bill→payment, SO→DO→invoice→payment, retur+inspeksi+release, payroll+settlement, upload–unduh privat, kontrak→call-off, project billing, search/laporan.
- [ ] Verifikasi integrasi Kinde dan Cloudinary nyata; backup/restore drill.
- [ ] Validasi plafon JP 2026 terhadap pengumuman BPJSTK resmi, lalu aktifkan policy payroll.
- [ ] Jadwalkan `files:cleanup` secara berkala; uji retensi/hapus pada Cloudinary nyata.
- [ ] Commit/push perubahan; jalankan CI GitHub Actions untuk pertama kali.

Keputusan kualitas: fitur yang belum ada jangan ditandai selesai hanya karena tabel/menu tersedia. Semua status "kode+tes" adalah implementasi terbatas, bukan kesiapan produksi.
