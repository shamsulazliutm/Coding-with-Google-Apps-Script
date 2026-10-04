# UTMXCITE 4 ASCEEN 2030 Report

Aplikasi web Google Apps Script (GAS) + Google Sheets untuk melaporkan 7 KPI UTMXCITE di bawah **DS 04 · Pekerjaan Premium Tier 1** (KAI 1-6 dan DKAI 1), serta 8 **CKAI** (Center Key Amal Indicator).
Rujukan sebenar: Dokumen Pelan Tindakan UTMXCITE (PDF).

- **Dashboard awam** (tanpa log masuk): kemajuan 7 KPI, data agregat sahaja.
- **Log masuk e-mel + OTP** untuk PIC fakulti dan Admin. Tiada kata laluan.
- **Sidebar kiri** (kad profil: nama dan e-mel) dan **sub-tab Senarai / Masuk Data** pada bar atas setiap KAI.
- Semua data disimpan dalam satu Google Sheet, **satu tab bagi setiap KPI**.

## Tiga peringkat penunjuk

| Peringkat | KPI | Tag kad |
|---|---|---|
| **KAI · Peringkat Universiti** | KAI 1 hingga KAI 6 | Growth (KAI 1-3), Transform (KAI 4-6) |
| **DKAI · Peringkat Jabatan (JTNC HEPA)** | DKAI 1 | Department |
| **CKAI · Peringkat Pusat (UTMXCITE)** | CKAI 1 hingga CKAI 7 | Center |

Dashboard dan sidebar dikelompokkan mengikut tiga peringkat ini.

## Peranan dan akses

| Peranan | Dashboard | KAI 1, 4, 6 (fakulti) | KAI 2, 3, 5, DKAI 1 | Urus pengguna / sasaran / audit |
|---|---|---|---|---|
| Awam | Ya | – | – | – |
| PIC Fakulti | Ya | Fakulti sendiri sahaja, bagi KPI yang diberi akses | – | – |

| Admin | Ya | Semua fakulti | Ya | Ya |

KAI 6 terhad kepada **FAI, FC, FKE, MJIIT**. Semua semakan akses dibuat di pelayar **dan** di pelayan (menyembunyikan menu sahaja tidak digunakan sebagai kawalan).

## Sasaran (semua ialah MINIMUM, boleh dilebihi)

| KPI | Sasaran | Cara kiraan |
|---|---|---|
| KAI 1 UTM Launchpad | ≥ 20 setiap tahun (2026-2030) | Inkubator **aktif**: didaftarkan dan dalam pembangunan / beroperasi, termasuk yang sedia ada |
| KAI 2 Makerspace | 60% (2026), 80% (2027), 100% (2028) | Kemajuan milestone berpemberat (4 fasa, 25% setiap satu secara lalai) |
| KAI 3 Ruang Perniagaan | 25 (2026), +5 setahun hingga 45 (2030) | Ruang **ditawarkan** kepada pelajar untuk disewa (kumulatif); disewa dan kadar penggunaan ialah maklumat sokongan |
| KAI 4 GiGAUTM Ascend | ≥ 20 setahun | Pelajar mendaftar pada tahun itu (cadangan 2 setiap fakulti) |
| KAI 5 F-SIP | ≥ 4 setahun | Pelajar mendaftar pada tahun itu |
| KAI 6 UTM AI Start Up | ≥ 20 setahun, minimum 5 setiap fakulti | Pelajar dilatih membentuk startup AI pada tahun itu |
| DKAI 1 Pelan Keusahawanan | 100% pada 2026 (sekali sahaja) | Milestone berpemberat (bengkel pra-pelan 50%, kelulusan JKE HEPA/JPU 50%) |

Sasaran tahunan, sasaran suku tahun (kumulatif) dan bajet disimpan dalam tab **Sasaran** dan boleh disunting melalui menu Admin → Sasaran (atau terus dalam Sheet). Bajet tidak dipaparkan kepada awam.

## CKAI (Center Key Amal Indicator)

Lapan ukuran peringkat pusat, dipaparkan dalam bahagian **CKAI · Peringkat Pusat (UTMXCITE)** pada dashboard. Semuanya sasaran **minimum** dan **belum ditetapkan**: isi melalui menu Admin → Sasaran (sehingga itu kad menunjukkan "Tiada sasaran").

| CKAI | Ukuran | Unit rekod | Dikira | Penginput |
|---|---|---|---|---|
| 1 | Bilangan program keusahawanan | Satu program | Program berstatus **Selesai** pada tahun tarikh tamat | PIC fakulti (fakulti sendiri) dan Admin |
| 2 | Bilangan program inovasi | Satu program | Sama seperti CKAI 1 | PIC fakulti dan Admin |
| 3 | Bilangan pendaftaran SSU (Sistem Syarikat Universiti) | Satu syarikat / perniagaan pelajar | Pendaftaran pada tahun tarikh daftar | Admin |
| 4 | Pendapatan usahawan pelajar | Satu baris sebulan bagi setiap perniagaan | Jumlah RM bagi bulan dalam tahun itu | PIC fakulti dan Admin |
| 5 | Bilangan penggunaan Makerspace | Satu baris sebulan (jumlah bulanan) | Jumlah penggunaan bagi bulan dalam tahun itu | Admin |
| 6 | Pendapatan sewaan inkubator | Satu baris sebulan bagi setiap penyewa | Jumlah RM berstatus **Dibayar** (belum bayar / tertunggak dipaparkan berasingan) | Admin |
| 7 | Anugerah & pengiktirafan inovasi dan keusahawanan | Satu anugerah / pengiktirafan | Bilangan yang diterima pada tahun tarikh (dipecahkan mengikut peringkat, kategori, program dan fakulti) | PIC fakulti (pencapaian fakulti sendiri) dan Admin (pencapaian pusat: Fakulti = UTMXCITE) |
| 8 | Bilangan inovasi pelajar yang dihasilkan | Satu projek inovasi pelajar | **OD:** projek yang **telah menyertai pertandingan**, sekurang-kurangnya peringkat Fakulti, pada tahun tarikh pertandingan (status "Telah menyertai"; "Akan menyertai" dipaparkan berasingan sebagai dirancang) | PIC fakulti (fakulti sendiri) dan Admin |

Dashboard awam hanya menunjukkan jumlah agregat (kiraan atau jumlah RM), tanpa nama pelajar, perniagaan atau penyewa.

**CKAI 1 dan 2 · daftar program (borang sama):** nama program, kategori, peringkat, penganjur / rakan kerjasama, pegawai program, objektif; **tarikh mula dan tamat**, **tempat**; **penyertaan** (jumlah peserta, dan daripada itu pelajar / staf UTM / luar UTM, serta skor kepuasan 0-5); **kewangan** (**kos penganjuran**, sumber peruntukan, **pendapatan**, sumber pendapatan); bilangan hasil (projek / prototaip / idea / startup), laporan program (PDF, pilihan), pautan dan catatan. Bagi program berstatus **Selesai**, tarikh mula dan tamat, tempat, jumlah peserta, kos dan pendapatan wajib diisi (0 dibenarkan). Tarikh tamat tidak boleh sebelum tarikh mula, dan pelajar + staf + luar UTM tidak boleh melebihi jumlah peserta. Kad dashboard menjumlahkan peserta, kos dan pendapatan bagi program yang selesai pada tahun dipilih.

**CKAI 8 · medan borang:** tajuk inovasi, jenis, bidang, penerangan, tahap kesediaan teknologi (TRL), status harta intelek; pasukan, mentor / penyelia, pelajar (nama dan no. matrik, **tanpa no. KP**); pertandingan (status penyertaan, nama, penganjur, **peringkat** Fakulti / Universiti / Kebangsaan / Antarabangsa, tarikh, tempat); **anugerah (pilihan, jika menang)**: pingat / kedudukan, nama anugerah, nilai hadiah, sijil PDF; dan **peningkatan ke peringkat lebih tinggi**: status (Belum dinilai, Calon peningkatan, Sedang disokong, Telah dibawa ke peringkat lebih tinggi, Tidak diteruskan), peringkat sasaran, pertandingan seterusnya, tarikh dan sokongan diperlukan. Senarai boleh ditapis mengikut peringkat dan status peningkatan, jadi XCITE dapat mengenal pasti projek untuk dibawa naik. Kad dashboard menunjukkan bilangan inovasi, pelajar terlibat, yang memenang, peringkat Universiti ke atas, dan calon peningkatan.

**CKAI 7 · medan borang:** nama anugerah, tarikh, agensi / badan penganugerah, peringkat (Fakulti / Universiti / Kebangsaan / Antarabangsa), kategori (Inovasi / Keusahawanan), program (UTM Launchpad, Makerspace, GiGAUTM Ascend, F-SIP, UTM AI Start Up, program fakulti, atau Lain-lain + nama), nama mentor / fasilitator, **pelajar (nama, no. matrik, no. KP; tambah seberapa banyak yang perlu)** dan **sijil PDF**. Medan tambahan: pingat / kedudukan, nilai hadiah (RM), lokasi / negara, nama pasukan, produk / projek / syarikat, pautan berita dan catatan.
**PIC diberi akses CKAI 1, 2, 4, 7 dan 8** dengan menambah `CKAI1,CKAI2,CKAI4,CKAI7,CKAI8` pada lajur `kpi_akses` (tab `Pengguna` atau menu Urus Pengguna). CKAI 3, 5 dan 6 hanya untuk Admin.

## Pemasangan

1. Buat projek Apps Script baharu (script.google.com) **atau** buka Sheet baharu → Extensions → Apps Script (projek terikat).
2. Salin semua fail dalam folder ini: `*.gs`, `*.html` dan `appsscript.json` (aktifkan "Show appsscript.json manifest file" dalam Project Settings). Dengan [clasp](https://github.com/google/clasp): `clasp push` (fail ujian dan README diabaikan melalui `.claspignore`). `tools/` turut diabaikan; `Logo.html` mesti ikut disalin.
3. Jalankan fungsi **`setup()`** sekali daripada editor dan luluskan kebenaran (Sheets, hantar e-mel, e-mel pengguna). (Pemasangan sedia ada yang dikemas kini kepada versi ini: jalankan `setup()` sekali lagi. Ia menambah tab CKAI dan baris sasaran CKAI tanpa menyentuh data sedia ada.) Ia:
   - mencipta (atau menggunakan semula) Sheet dan semua tab: `Pengguna`, `Fakulti`, `Sasaran`, `Risiko`, `Log_Audit` dan 7 tab KPI,
   - memasukkan sasaran awal, senarai fakulti, daftar risiko daripada PDF, dan milestone awal KAI 2 / DKAI 1,
   - mendaftarkan **pemilik skrip sebagai Admin pertama**.
   Selamat dijalankan semula (tidak menduplikasi data). ID Sheet disimpan dalam Script Properties (`SHEET_ID`).
4. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone** (diperlukan supaya dashboard boleh dilihat tanpa akaun Google; log masuk OTP dikendalikan oleh aplikasi). Salin URL web app.
5. Log masuk sebagai Admin → **Urus Pengguna** → daftar e-mel PIC (peranan PIC, fakulti, akses KPI contoh `KAI1,KAI4,KAI6`).

## Tab `Pengguna`

Satu tab untuk Admin dan PIC (e-mel di lajur A). Lajur: `emel`, `nama`, `peranan` (**Admin** atau **PIC**), `fakulti`, `kpi_akses` (contoh `KAI1,KAI4,KAI6`), `aktif` (**Ya** / **Tidak**), `dicipta_pada`.
Boleh disunting terus dalam Sheet (drop-down disediakan bagi `peranan` dan `aktif`) atau melalui menu Admin → Urus Pengguna. Huruf besar/kecil dan ruang kosong diabaikan. Peranan selain Admin/PIC bermakna **tiada akses** (bukan PIC secara lalai). Lajur dibaca mengikut nama tajuk, jadi susunan lajur tidak penting.

## Lampiran PDF (sijil) dan data peribadi

- Sijil dimuat naik sebagai **PDF sahaja, maksimum 5 MB**. Kandungan sebenar disemak (bermula dengan `%PDF-`), bukan sekadar nama fail. Nama fail dibersihkan. Had 20 muat naik sejam bagi setiap pengguna.
- Fail disimpan dalam folder Drive **peribadi** "UTMXCITE ASCEEN2030 - Lampiran" milik pemilik skrip dan **tidak dikongsi**. Fail hanya boleh dimuat turun melalui aplikasi selepas semakan akses: PIC bagi fakulti sendiri, Admin bagi semua. Setiap muat naik dan muat turun direkod dalam `Log_Audit`.
- Satu rekod hanya boleh merujuk fail yang baru dimuat naik oleh pengguna itu sendiri melalui aplikasi (tidak boleh merujuk fail Drive sembarangan). Fail yang diganti atau yang rekodnya dipadam dibuang ke tong sampah Drive.
- Manifest meminta skop `https://www.googleapis.com/auth/drive` (diperlukan oleh `DriveApp`). Skop ini luas, jadi gunakan akaun pemilik skrip yang sesuai dan jangan kongsi projek Apps Script dengan orang yang tidak perlu.
- **No. KP dan no. matrik pelajar** (CKAI 7, juga KAI 4 hingga 6 dan CKAI 3) ialah data peribadi (PDPA 2010). Ia hanya dipaparkan kepada Admin dan PIC fakulti berkenaan, tidak dipaparkan dalam jadual senarai (hanya nama), tidak dimasukkan dalam `Log_Audit`, dan tidak pernah muncul pada dashboard awam. Dalam Google Sheet, no. KP disimpan sebagai teks biasa, jadi **hadkan akses kepada Sheet** (jangan kongsi) dan tetapkan tempoh simpanan mengikut dasar universiti.

## Logo

Logo rasmi UTM ASCEND 2030 dipaparkan di atas sidebar pada panel putih. Ia disimpan dalam `Logo.html` sebagai data URI, jadi tiada hos imej luar diperlukan. Untuk menggantikannya (PNG lut sinar, lebar ~260px):

```
python3 tools/make_logo_html.py logo-baharu.png
```

Jika logo baharu memerlukan latar lain, ubah warna `.brandlogo` dalam `Styles.html`.

## Perkara yang perlu disemak selepas setup

- **Tab `Fakulti`**: senarai awal (13 fakulti + `UTMXCITE`) ialah andaian. Semak dan betulkan kod/nama mengikut senarai sebenar UTM. `FAI`, `FC`, `FKE`, `MJIIT` perlu kekal kerana digunakan oleh KAI 6.
- **Kemajuan awal ialah 0%.** Milestone KAI 2 dan DKAI 1 disemai dengan peratus siap 0 dan pemberat 25% (KAI 2) / 50% (DKAI 1). Kemas kini peratus siap mengikut kemajuan sebenar (contoh: pencapaian Q2 2026 dalam ringkasan: KAI 2 15%, DKAI 1 50%). Tiada pencapaian dimasukkan secara automatik.
- **Pencapaian lain** (contoh: 1 inkubator, 10 ruang, 1 pelajar GiGA, 5 pelajar AI pada Q2) perlu dimasukkan sebagai rekod sebenar melalui borang.
- `ALLOWED_EMAIL_DOMAINS` dalam `Config.gs` boleh dihadkan (contoh `['utm.my']`).

## Keselamatan

- OTP 6 digit, sah 5 minit, sekali guna, maksimum 5 percubaan, dan 5 permintaan sejam bagi setiap e-mel. OTP disimpan sebagai hash (dengan salt rahsia) dalam CacheService.
- Mesej "OTP dihantar" sama sama ada e-mel berdaftar atau tidak (tiada penghitungan akaun).
- Token sesi rawak 192-bit, disimpan sebagai hash, tamat dalam 6 jam, dan dibatalkan semasa log keluar. Peranan dan status aktif dibaca semula daripada Sheet pada setiap panggilan, jadi menyahaktifkan pengguna berkuat kuasa serta-merta.
- PIC dipaksa ke fakultinya di pelayan; rekod fakulti lain tidak boleh dibaca atau diubah. Padam: Admin sahaja. Admin terakhir tidak boleh dinyahaktif atau dipadam.
- Pengesahan medan di pelayan (wajib, pilihan, nombor, tarikh, e-mel, URL, peraturan bersyarat). Teks yang bermula dengan `= + - @` dilindungi daripada suntikan formula Sheets (awalan `'`; tidak dipaparkan dalam aplikasi).
- Semua output klien di-escape (tiada XSS). Ralat dalaman tidak dibocorkan kepada pengguna.
- `Log_Audit` merekod log masuk, tambah / kemas kini / padam, perubahan pengguna dan sasaran.
- Dashboard awam hanya mengandungi kiraan agregat: tiada nama, no. matrik, e-mel atau bajet.
- **Sheet tidak perlu dikongsi kepada awam.** Jangan kongsi tab data dengan sesiapa yang tidak sepatutnya melihat maklumat pelajar.

## Had yang perlu diketahui

- Kuota e-mel `MailApp`: kira-kira 100/hari (akaun Gmail biasa) atau 1,500/hari (Google Workspace). Pemilik skrip yang menghantar semua e-mel OTP.
- Sesi disimpan dalam CacheService (maksimum 6 jam, boleh dikosongkan oleh Google tanpa notis). Pengguna hanya perlu log masuk semula.
- Lampiran bukti disimpan sebagai **pautan** (Drive / URL), bukan muat naik fail.
- Pencapaian dikira daripada rekod semasa pada hari dilihat, bukan salinan sejarah. Untuk tahun lepas, ia bergantung pada tarikh dalam rekod (tarikh pendaftaran, daftar, mula latihan, ditawarkan).

## Susunan lajur

Semua penulisan ke Sheet mengikut **nama tajuk lajur**, bukan kedudukan. Jadi lajur boleh disusun semula, atau lajur anda sendiri boleh ditambah, tanpa merosakkan data. Nama tajuk yang dikenali oleh kod mesti kekal tepat. Apabila versi baharu menambah medan, `setup()` menambah lajur baharu di hujung tab sedia ada.

## Ujian

Logik pelayan diuji dengan tiruan API GAS (Node 18+):

```
node tests/run.js        # ujian logik: OTP, akses, pengesahan, kiraan KPI dan CKAI, dashboard awam
node tests/e2e.js        # ujian pelayar sebenar (Playwright + Chromium) menggunakan pelayan tiruan yang sama, termasuk muat naik/muat turun PDF
```

Ujian tidak menggantikan ujian sebenar dalam Google (contoh: kebenaran OAuth, penghantaran e-mel sebenar, Drive sebenar, kelajuan Sheets, dan sama ada pelayar anda membenarkan muat turun PDF daripada halaman Apps Script). Lakukan ujian asap selepas deploy: log masuk Admin, tambah PIC, log masuk PIC, simpan satu rekod dan semak dashboard awam dalam tetingkap inkognito.
