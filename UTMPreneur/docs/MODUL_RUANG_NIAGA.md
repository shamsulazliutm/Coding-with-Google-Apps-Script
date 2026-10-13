# UTMPreneur: Modul Ruang Niaga

Lot Student Mall dan SUB: permohonan, penilaian jawatankuasa, surat tawaran, perjanjian, sewaan dan bil sewa.
Kod: `src/RuangNiaga*.gs` (objek global `RuangNiaga`: `routes()`, `jobHarian()`), UI: `src/ViewsRn.html`, `src/AppRn.html`. RPC `rn.*`; tindakan pelajar juga `rn.bp.*` (admin bagi pihak pelajar).

## 1. Selepas `npm run push:uji`
1. Jalankan `setup()` semula (lajur dan tab baharu: `Dokumen_Sewaan`, `Tawaran_Sewa`, `Cagaran`, `Jadual_Sewa`, `Pekerja_Penyewa`, `Peralatan_Lot`; kunci Tetapan baharu).
2. Daftar templat Google Docs dalam `Link_Dokumen` (lajur URL): `TEMPLAT_PERJANJIAN_SEWA_FNB`, `TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB` (wajib; jika tiada: ralat `TEMPLAT_TIADA`), `TEMPLAT_SURAT_TAWARAN` (pilihan; jika kosong atau tidak boleh dibuka, surat lalai dijana daripada kod).
3. Semak Tetapan penandatangan (`SURAT_PENANDATANGAN_*`, `PERJANJIAN_*`, `ALAMAT_UTMXCITE`, `AKAUN_BANK_UTM`): nilai awal diambil daripada contoh dan mesti disemak.
4. Admin: isi kadar, jenis (F&B/Retail/Lain-lain), alamat surat lot, buka lot, tetapkan tempoh permohonan (tab Ringkasan). Daftar penilai (peranan Penilai dalam "Urus admin"). `pasangPencetus()` sedia ada menjalankan `jobHarian`.

## 2. Peraturan dan lalai
| Perkara | Peraturan |
|---|---|
| Siapa memohon | Pemilik perniagaan SSU Diluluskan berstatus Aktif. Ahli pasukan hanya lihat/muat turun. SSU Tamat Tempoh disekat. |
| Tempoh | `TEMPOH_PERMOHONAN_LOT_BUKA/TUTUP` (inklusif). **[LALAI]** kosong = ditutup. Bagi pihak tertakluk tempoh yang sama. |
| Satu lot satu pelajar | Disemak atas pemilik dan ahli pasukan perniagaan. Permohonan baharu dibenarkan jika terdahulu Ditolak, Dibatalkan, Tamat. **[LALAI]** Tawaran Luput dan Ditolak Pemohon juga dibenarkan. |
| Borang | Tempoh dipohon (maks 36 bulan), F&B: vaksin/kursus direkod sahaja, sumber dana, jumlah dana, jangkaan jualan, bil. pekerja, cadangan PDF wajib, sebab, lokasi (pilihan). |
| Penilaian | Baharu, Disemak, Disenarai Pendek (melalui sesi), Dinilai (apabila sesi ditutup dan ada skor dihantar), admin memutuskan Diluluskan/Ditolak. Tiada skor minimum/kelulusan automatik. |
| Skor | Rubrik 6 kriteria (/100). Skala 100/80/60/40/20%; markah automatik, boleh dilaras dalam julat tahap (tahap 4 bagi 20 markah = 12-16). Hantar mengunci; admin boleh buka semula (audit). Penilai tidak nampak skor lain; selepas ditutup nampak purata dan kedudukan sendiri sahaja. No. KP bertopeng untuk penilai. Beza jauh ditanda (`PENILAIAN_BEZA_JAUH`, 20). |
| Tawaran | No. rujukan ditaip admin (wajib). Pratonton PDF (versi), hantar, luput 7 hari (`TAWARAN_TEMPOH_HARI`), peringatan hari ke-4 dan ke-6. Menghantar: lot jadi Dipohon (ditempah), cagaran dicipta (tarikh akhir 14 hari). Mengubah butiran membatalkan pratonton. |
| Penerimaan | "Saya terima/tolak" disahkan OTP ke emel pemohon (bagi pihak: OTP tetap ke emel pelajar). Rekod penerimaan PDF. Tidak boleh ditarik balik; admin boleh Batalkan (audit). |
| Dokumen | Senarai bernombor, muat turun melalui pelayan (tiada pautan Drive), akses pemilik dan ahli disemak setiap panggilan. Lampiran 1 (sijil SSM) muncul dari status Perjanjian. **[LALAI]** Perjanjian kelihatan kepada pemilik sebaik dijana. |
| Salinan fizikal | 2 salinan, 14 hari; peringatan hari ke-7 dan ke-12; lewat: admin dimaklumkan sekali; bukan syarat sewaan aktif. |
| Cagaran | Resit rasmi dimuat naik pemilik, disahkan admin. Pulang dalam 90 hari selepas tamat (peringatan admin hari ke-60 dan ke-80, tanda Lewat Pulang). Pulang hanya selepas sewaan tamat atau permohonan gugur; potongan perlu sebab; rampas perlu sebab. |
| Sewaan aktif | Hanya selepas perjanjian bertandatangan disahkan DAN cagaran sewaan disahkan (atau tiada cagaran sewaan). Tarikh mula/tamat daripada tawaran, boleh ditetapkan admin semasa mengesahkan. Cipta Sewaan, salin Jadual_Sewa, lot Disewa, bil bulan semasa. |
| Bil | Hari ke-5 (`JANA_BIL_SEWA_HARI`), tarikh akhir hari ke-7 (`TARIKH_AKHIR_SEWA_HARI`), kadar ikut jadual berperingkat, caj utiliti pilihan oleh admin. **[LALAI]** bil bulan semasa yang dijana selepas tarikh akhir mendapat tempoh bayar 7 hari dari hari dijana. Belum Bayar jadi Lewat; peringatan: hari jana, 2 hari sebelum, susulan setiap 3 hari. |
| Tunggakan | Ditanda jika 2 bil Lewat atau bil terlama lewat lebih 30 hari (`TUNGGAKAN_HARI`). Admin dicadangkan Notis Peringatan 1, 2, Penamatan (PDF, 7 hari); tiada tindakan automatik. |
| Pembaharuan | Admin menyambung 12 bulan, kadar baharu pilihan, dokumen pembaharuan daripada templat (jika tiada: amaran, pembaharuan tetap berjaya). |
| Daftar sedia ada | Lot Kosong + perniagaan SSU sedia ada, jadual/kadar, tarikh mula/tamat, cagaran pilihan (terus Diterima). Bil dijana kerja harian. |
| Kebenaran | Admin Penuh dan Pegawai Modul (modul kosong/Semua/mengandungi "Ruang Niaga") memutuskan. Pemerhati baca sahaja. Penilai hanya skrin penilaian (mesti disenarai dalam sesi). No. KP penuh Admin Penuh sahaja. |

## 3. Penanda templat Google Docs
Penanda `[nama]` (huruf kecil) atau `{{NAMA}}` (huruf besar). Penanda tidak dikenali dibiarkan dan diamaran kepada admin.

**Surat tawaran** (`TEMPLAT_SURAT_TAWARAN`): `no_rujukan` `tarikh_surat` `id_permohonan` `nama_perniagaan` `nama_wakil` `no_matrik` `no_telefon` `alamat_penyewa` `no_ssm` `nama_lot` `kod_lot` `alamat_lot` `jenis_perniagaan` `tarikh_mula` `tarikh_tamat` `bil_bulan` `tempoh_kontrak` `sewa_bulanan` `jadual_sewa` `utiliti` `cagaran_sewaan` `cagaran_utiliti` `waktu_operasi` `tarikh_luput` `tempoh_terima_hari` `hari_bayar_cagaran` `tarikh_akhir_cagaran` `hari_salinan_fizikal` `akaun_bank` `penandatangan_nama` `penandatangan_jawatan` `alamat_utmxcite`.

**Perjanjian** (F&B dan bukan F&B): `no_rujukan` `tarikh_perjanjian` `tarikh_surat_setuju_terima` `id_permohonan` `nama_syarikat` `no_ssm` `no_pendaftaran_syarikat` `alamat_syarikat` `nama_wakil` `jawatan_wakil` `no_matrik` `no_telefon_syarikat` `emel_syarikat` `kod_lot` `nama_lot` `alamat_lot` `jenis_perniagaan` `tarikh_mula` `tarikh_tamat` `bil_bulan` `tempoh_kontrak` `jadual_sewa` `sewa_bulanan` `hari_akhir_bayar` `utiliti` `cagaran_sewaan` `cagaran_utiliti` `waktu_operasi` `akaun_bank` `alamat_utmxcite` `penandatangan_utm_nama` `penandatangan_utm_jawatan` `saksi_utm_nama` `saksi_utm_jawatan` `wakil_syarikat_nama` `wakil_syarikat_jawatan` `saksi_syarikat_nama` `saksi_syarikat_jawatan` `senarai_pekerja` (Lampiran 2, satu baris setiap pekerja diluluskan) `senarai_peralatan` (Lampiran 3) `bil_pekerja` `bil_peralatan`.
Tarikh perjanjian lalai = tarikh surat tawaran. Lampiran 1 (sijil SSM) dimuat turun sebagai dokumen berasingan. Klausa F&B (polisterina, grease trap, gas bersubsidi, sijil pengendali makanan, vaksin) hanya dalam templat F&B; jenis ditentukan oleh `Jenis` lot (FNB).

## 4. Had
- Tiada jadual kelas Lampiran 2/3 dalam Docs (teks berbaris); jadual perlu disusun dalam templat jika mahu.
- Papar PDF dalam tab baharu menggunakan Blob; jika dihalang pelayar, fail dimuat turun.
- Bil dijana hanya bagi bulan semasa (bulan terlepas tidak dijana susulan). Pembaharuan tidak mempunyai aliran tandatangan dalam sistem.
- Satu perniagaan seorang pemilik (mengikut Peringkat 2). Tiada pengiraan nisbah (pro-rata) sewa.
- Tidak diuji pada Google sebenar: kebenaran Docs/Drive, kuota emel, penjanaan PDF sebenar (hanya tiruan).

## 5. Ujian manual (UJI)
1. Admin: buka lot SM-01 (kadar, jenis, alamat surat), tetapkan tempoh, daftar penilai.
2. Pelajar (pemilik SSU): mohon lot; cuba tanpa PDF (ralat); ahli pasukan tidak boleh memohon; pelajar lain tiada akses.
3. Admin: Tandakan disemak; cipta sesi (penilai, calon, slot); hantar jemputan; mula sesi.
4. Penilai (telefon): pilih tahap, laras markah, simpan draf, hantar (terkunci); penilai kedua tidak nampak skor pertama.
5. Admin: tutup sesi, lihat kedudukan, Luluskan; isi tawaran (jadual berperingkat), jana pratonton, semak PDF, hantar.
6. Pelajar: terima dengan OTP; semak rekod penerimaan; muat naik resit cagaran. Tunggu 7 hari (atau ubah `Tarikh_Luput`) untuk menguji luput.
7. Admin: sahkan cagaran, jana perjanjian (templat Docs), pelajar muat naik salinan, admin sahkan: sewaan aktif.
8. Jalankan `jobHarian()`: bil dijana, peringatan masuk `Peringatan` sekali sahaja.
9. Pelajar rekod bayaran; admin sahkan; cuba kembalikan dan kecualikan. Cipta tunggakan dan jana notis.
