# Rencana Kerja Berikutnya — Arunika ERP

Pembaruan: 10 November 2026. Basis: PRD v2, gelombang perbaikan 1–20, modul payroll/retur/dokumen privat, batch C1–C7 dan D1–D4. Semua perubahan masih di working tree; belum commit/push/deploy.

Status verifikasi terbaru: 681 tes / 76 suite lulus (`npm test -- --coverage=false`), typecheck dan build produksi dengan env dummy lulus, lint 0 error / 58 warning, `git diff --check` bersih. Sepuluh migrasi sampai `20261110160000_completion` diterapkan pada PostgreSQL disposable tanpa drift; integrity, retur, backup/restore lulus (131 tabel, 290 baris cocok). Sebagian besar tes fitur baru memakai mock; alur browser, Kinde/Cloudinary/DJP nyata dan DB produksi belum diverifikasi. Belum commit/push/deploy.

## Status setelah gelombang pelengkapan

- Manajemen role kustom dan reaktivasi anggota tersedia. Undangan masuk outbox, tetapi transport email belum tersedia: jangan klaim terkirim; tautan manual tetap dipakai.
- Transfer parsial, selisih dikembalikan ke asal, reversal terkendali, opname stok nol/impor CSV/cetak, lampiran privat, dan jurnal koreksi memakai akun tervalidasi tersedia. Uji browser/Cloudinary belum ada; loss transit bukan write-off otomatis.
- MRP memiliki konfigurasi eksplisit lead time/lot/safety/calendar, reservasi, rekomendasi RESCHEDULE/CANCEL, review, dan konversi bertanggal. Rekomendasi tidak memodifikasi order sumber secara otomatis.
- Biaya proyek dapat disetujui/posting ke GL dan alokasi sumber payroll/material terverifikasi; pembagian parsial lintas proyek dan biaya produksi/retur belum tercakup. Margin total tetap tidak diketahui bila sumber belum lengkap.
- Replacement retur memakai dokumen dan posting stok/COGS independen; CN/refund sesudah replacement ditolak. Belum diuji konkurensi replacement dengan transaksi PostgreSQL nyata.
- HR/payroll: kebijakan bertanggal, pegawai kontrak resident, prorata join/end, sumber lembur terverifikasi, cuti ledger tersedia. Daily/nonresident, prior-employer income, gross-up, pesangon, JKP, holiday overtime, dan aturan subjektif pajak tetap di luar cakupan otomatis.
- Pajak: period close/reopen, rekonsiliasi parsial, aturan/profil bertanggal, pembayaran dan ekspor offline tersedia. Format resmi/Coretax dan integrasi live tidak ada. Plafon JP 2026 tidak diaktifkan tanpa konfirmasi resmi dan persetujuan policy maker-checker.
- Uji DB disposable belum mencakup seluruh alur baru; semua fitur sensitif perlu acceptance browser/konkurensi dan review akuntansi/pajak sebelum go-live.

## Keamanan dan kontrak

Login tetap berdasarkan identitas Kinde terikat. Klaim undangan wajib token sekali pakai, email Kinde terverifikasi, dan binding cocok/kosong. Approval persediaan menyimpan valuasi; perubahan snapshot/valuasi/reservasi ditolak. Detail batasan dan sumber regulasi berada pada `docs/contracts/*-completion.md`.

## Blok A — Operasional belum dikerjakan

| ID | Pekerjaan | Status |
|---|---|---|
| A1 | UI lampiran privat pada dokumen transaksi; API upload/download sudah tersedia | Belum |
| A2 | Pelepasan/disposal stok karantina | Diimplementasikan pada C3 (perlu verifikasi DB) |
| A3 | Undangan/manajemen role, akses cabang/gudang, nonaktifkan, proteksi owner tunggal | Kode+tes tersedia termasuk role kustom dan reaktivasi; transport email dan browser belum diverifikasi. |
| A4 | Administrasi cabang/gudang CRUD + invariant minimal satu aktif | Kode+tes ada; belum uji DB/browser. |

## Blok B — Persediaan belum dikerjakan

| ID | Pekerjaan | Status |
|---|---|---|
| B1 | Transfer gudang: ajukan–approve–kirim–terima; idempotent, mutasi berpasangan | Kode+tes termasuk penerimaan parsial, selisih dikembalikan dan reversal; DB/browser alur baru belum diuji. |
| B2 | Stock opname: sesi/snapshot/hitung/review/approval/koreksi | Kode+tes termasuk stok nol, CSV, cetak; DB/browser alur baru belum diuji. |
| B3 | Penyesuaian stok berdokumen dan alasan, bukan OPENING_BALANCE | Kode+tes termasuk lampiran privat dan jurnal dari akun tervalidasi; Cloudinary/browser belum diuji. |

## Blok C — Melengkapi modul (hasil kode; belum uji DB/browser)

| ID | Pekerjaan | Status dan batas |
|---|---|---|
| C1 | Payroll THR/bonus, tunjangan, lembur, payslip privat, settlement utang 2101/2105/2106 | Kode+tes ada. Scope: pegawai tetap resident setahun penuh; settlement sekali penuh per run/akun; lembur disetujui bersama payroll; perlu akun 2107 untuk potongan sukarela. |
| C2 | Plafon JP 2026 | Tetap blokir by design. Admin harus memasukkan plafon berdasar sumber resmi dan persetujuan policy maker-checker; jangan isi tebakan. |
| C3 | Retur: release/scrap karantina, refund, replacement, klaim owner/SLA/evidence | Kode+tes ada. Replacement independen stok/COGS tersedia; harus konfigurasi posting rule tervalidasi, belum uji DB/browser replacement. Refund menolak replacement/refund sebelumnya; settlement harus approved. |
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
- [x] Build Next.js terbaru dengan env dummy lulus setelah implementasi audit; bukan verifikasi integrasi eksternal.
- [ ] Uji browser E2E: onboarding, PO→GR→bill→payment, SO→DO→invoice→payment, retur+inspeksi+release, payroll+settlement, upload–unduh privat, kontrak→call-off, project billing, search/laporan.
- [ ] Verifikasi integrasi Kinde dan Cloudinary nyata; backup/restore drill.
- [ ] Validasi plafon JP 2026 terhadap pengumuman BPJSTK resmi, lalu aktifkan policy payroll.
- [ ] Jadwalkan `files:cleanup` secara berkala; uji retensi/hapus pada Cloudinary nyata.
- [ ] Commit/push perubahan; jalankan CI GitHub Actions untuk pertama kali.

Keputusan kualitas: fitur yang belum ada jangan ditandai selesai hanya karena tabel/menu tersedia. Semua status "kode+tes" adalah implementasi terbatas, bukan kesiapan produksi.
