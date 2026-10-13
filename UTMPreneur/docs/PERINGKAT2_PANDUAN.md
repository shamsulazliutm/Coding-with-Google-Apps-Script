# UTMPreneur: Panduan Peringkat 2 (Profiling dan SSU)

Peringkat 2 menambah: **Profiling pelajar**, **permohonan SSU** (Syarikat Pemula Pelajar), semakan dan kelulusan admin,
**sijil PDF** daripada templat Google Slides, **pembaharuan**, **SSU tamat tempoh**, dan **daftar SSU sedia ada** oleh admin.
Peringkat 1 mesti sudah berjalan (log masuk OTP, import PELAJAR).

> **Nota jujur:** 101 ujian setempat lulus (logik, pelayar Chromium dengan Google ditiru). Ujian itu tidak menyentuh
> Google sebenar. Perkara yang hanya boleh dipastikan selepas `clasp push`: kebenaran **Slides**, penjanaan PDF sebenar,
> kuota emel, dan muat naik fail besar. Gunakan senarai semak di bahagian 4 dalam projek **UJI** dahulu.

## 1. Langkah selepas `npm run push:uji`

1. **Benarkan skop baharu.** `appsscript.json` kini meminta akses Google Slides. Jalankan `setup()` sekali dari editor
   dan terima permintaan kebenaran semula.
2. Jalankan **`setup()`** semula. Ia menambah kumpulan `Rujukan` baharu (NEGERI, HUBUNGAN, TEMPOH_NIAGA, MOTIVASI, ALIRAN)
   dan lajur `No_SSM` pada `Permohonan_SSU`, tanpa mengubah data sedia ada.
3. **Letak templat sijil.** Salin fail Slides templat ke folder **"Templat sijil SSU"** (dalam folder induk), kemudian tampal URL-nya
   dalam `Link_Dokumen` pada baris `TEMPLAT_SIJIL_SSU` (lajur `URL`). Akaun yang menjalankan web app mesti boleh membukanya.
   Penanda yang disokong: `[nama_syarikat]` `[no_sijil]` `[tarikh_daftar]` `[alamat_berdaftar]` `[kod_kursus]` `[nama_ahli]`
   `[bil_ahli]` `[tarikh_tamat]` (juga bentuk `{{NAMA_PERNIAGAAN}}`, `{{NO_PENDAFTARAN}}`, `{{TARIKH_PENDAFTARAN}}`,
   `{{ALAMAT_PERNIAGAAN}}`, `{{KOD_SUBJEK}}`, `{{SENARAI_AHLI}}`, `{{JUMLAH_AHLI}}`, `{{TEMPOH_SAH_LAKU}}`).
4. **Pasang pencetus harian.** Jalankan `pasangPencetus()` sekali dari editor (kerja `jobHarian` pukul 7 pagi:
   tandakan SSU tamat tempoh dan hantar peringatan pembaharuan 60, 30 dan 7 hari). Boleh diulang dengan selamat.
5. Isi `Tetapan`: `SESI_SEMASA` (contoh `2026/2027-1`), `WEBAPP_URL`. Pilihan: `SIJIL_SAH_BULAN` (12), `MAKS_AHLI_SSU` (12),
   `SSU_PERINGATAN_HARI` (60,30,7), `SSU_PEMBAHARUAN_AWAL_HARI` (60), `AWALAN_SIJIL` (XCITE).

## 2. Peraturan yang dilaksanakan

| Perkara | Peraturan |
|---|---|
| Profiling | Pelajar sahaja. Data rasmi (nama, KP bertopeng, jantina, etnik) hanya baca. Pelajar boleh kemas kini fakulti, program, bidang, tahun, telefon, alamat. Satu baris `Profil` bagi satu sesi (`SESI_SEMASA`), sejarah disimpan. Sesi baharu hanya mencetuskan peringatan di skrin. |
| Syarat memohon SSU | Profiling lengkap. Seorang pemilik hanya satu permohonan aktif (Baharu/Disemak/Perlu Pembetulan) atau satu SSU. |
| Pengesahan | Nama ditukar HURUF BESAR, tiada "UTM", tidak sama dengan SSU lain. Alamat bukan kolej/fakulti/UTM. SSM "Ya" wajib No. SSM dan sijil SSM. Rakan kongsi: pelajar aktif dalam PELAJAR, tiada pendua, bukan pemilik, maksimum 12 ahli termasuk pemilik. Modal dan pendapatan: RM tepat. Perakuan wajib. |
| Fail | PDF/JPG/PNG, had `MAKS_SAIZ_FAIL_MB`, jenis disemak di pelayan melalui sambungan dan tandatangan fail. Disimpan dalam folder "Lampiran SSU". Pelajar tidak menerima pautan Drive; muat turun melalui pelayan. |
| Status | Baharu → Disemak → Diluluskan / Ditolak / Perlu Pembetulan. Catatan wajib bagi Ditolak dan Perlu Pembetulan. Pelajar membetulkan dan menghantar semula (kembali Baharu). Selepas Ditolak, pelajar boleh memohon semula. |
| Kelulusan | Mencipta `Perniagaan` (`PRN-0001`), nombor `XCITE-2026S00001-01`, tamat sah laku = tarikh daftar + 12 bulan, janaan sijil PDF, emel kepada pemilik dan ahli. Jika sijil gagal dijana (templat tiada/tiada akses), kelulusan tetap berjaya dan admin diberi amaran; tekan **Jana sijil** selepas dibetulkan. Jana semula memindahkan sijil lama ke tong sampah Drive. |
| Pembaharuan | Dibuka 60 hari sebelum tamat dan selepas tamat. Borang diisi awal. Nombor asal kekal, akhiran bertambah (`-02`). Tamat baharu = tarikh tamat lama (jika masih sah) + 12 bulan, atau hari kelulusan + 12 bulan jika sudah tamat. |
| Tamat tempoh | `jobHarian` menukar status kepada Tamat Tempoh. Permohonan SSU baharu disekat tetapi pembaharuan dibenarkan. Tiada tindakan automatik terhadap sewaan. |
| Kebenaran admin | Admin Penuh dan Pegawai Modul (modul kosong, "Semua" atau mengandungi "SSU") boleh memutuskan. Pemerhati baca sahaja. Penilai tiada akses. No. KP hanya Admin Penuh. Setiap paparan lampiran oleh admin direkod dalam `Audit`. |
| Daftar SSU sedia ada | Admin memasukkan No. Matrik pemilik, butiran dan tarikh pendaftaran asal (tidak boleh akan datang). Terus Diluluskan, tanda "sedia ada". Emel hanya dihantar jika dipilih. |

**Lalai yang saya pilih (sila semak):** (a) seorang pelajar boleh menjadi rakan kongsi dalam lebih daripada satu SSU
(admin diberi amaran); (b) tarikh sijil pembaharuan ialah hari kelulusan; (c) kelulusan dibuat di dalam sistem tanpa
perakuan rakan kongsi; (d) pilihan "Motivasi", "Hubungan keluarga" dan "Tempoh berniaga" ialah draf senarai.
Aliran pilihan ialah empat pilihan daripada borang lama.

## 3. Had yang diketahui

- Muat naik fail dihantar sebagai satu panggilan (base64). Fail hampir 10 MB pada talian lemah mungkin gagal; muat naik berbahagian belum dibina.
- Medan khusus startup (peringkat produk, harta intelek) belum ditambah (menunggu keputusan).
- Pegawai Modul disekat mengikut medan `Modul` sahaja (teks bebas).
- Ruang Niaga, Kewangan dan Makerspace belum dibina; kad "Akan datang" kekal.

## 4. Senarai semak ujian manual (UJI)

**A. Persediaan**
1. `setup()` selesai; "Pengesahan struktur: OK". `Rujukan` ada NEGERI, ALIRAN dan lain-lain.
2. `TEMPLAT_SIJIL_SSU` ada URL. `pasangPencetus()` dijalankan; Pencetus kelihatan dalam editor.

**B. Pelajar (aina.contoh / amirul.contoh)**
1. Log masuk, kad Profiling berpil "Belum lengkap". SSU: mesej perlu profiling.
2. Isi profiling; cuba simpan kosong (ralat bertanda); simpan sah; pil "Lengkap". Semak `Profil` dan `PELAJAR` dikemas kini.
3. Mohon SSU: cuba alamat kolej (ditolak), nama mengandungi UTM (ditolak), SSM "Ya" tanpa fail (ditolak), fail `.exe` (ditolak). Hantar sah. Emel pengesahan sampai.
4. Cuba hantar kali kedua (disekat).

**C. Admin (`utmxcite@utm.my`)**
1. Senarai SSU, cari, buka butiran. Cuba Perlu pembetulan tanpa catatan (ditolak). Hantar dengan catatan; pelajar nampak catatan, edit dan hantar semula.
2. **Luluskan** (dua tekan). Sijil PDF dijana: buka dan semak semua penanda terisi, 12 nama muat, tiada penanda tertinggal.
3. Jika templat tidak boleh dibuka: kelulusan berjaya, amaran jelas; betulkan akses; tekan Jana sijil.
4. Pelajar dan ahli memuat turun sijil; pelajar lain tidak boleh.
5. Daftar SSU sedia ada dengan tarikh lampau; pastikan status Tamat Tempoh.

**D. Pembaharuan dan tamat**
1. Ubah `Tarikh_Tamat` Perniagaan kepada 20 hari lagi; pelajar nampak butang Perbaharui; hantar; admin lulus; nombor berakhir `-02`.
2. Jalankan `jobHarian()` secara manual; peringatan masuk `Peringatan` sekali sahaja.

## 5. Versi dua fail (Code.gs + Index.html)

`npm run bundle` menjana folder `dist/`: **`Code.gs`** (semua fail .gs), **`Index.html`** (semua antara muka, termasuk gaya dan logo) dan
`appsscript.json`. Dalam editor Apps Script: padam fail lama, tampal kandungan `Code.gs` dan `Index.html`, dan dalam Tetapan Projek tandakan
"Tunjukkan fail manifes appsscript.json" kemudian ganti kandungannya (perlu untuk skop Slides). Sunting sentiasa di `src/` dan jana semula.
