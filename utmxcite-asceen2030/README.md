# UTMXCITE 4 ASCEND 2030 Report

Aplikasi web Google Apps Script (GAS) + Google Sheets untuk melaporkan 7 KPI UTMXCITE di bawah **DS 04 · Pekerjaan Premium Tier 1** (KAI 1-6 dan DKAI 1), serta 8 **CKAI** (Center Key Amal Indicator).
Rujukan sebenar: Dokumen Pelan Tindakan UTMXCITE (PDF).

- **Dashboard awam** (tanpa log masuk): kemajuan 7 KPI, data agregat sahaja.
- **Log masuk e-mel + OTP** untuk PIC fakulti dan Admin. Tiada kata laluan.
- **Sidebar kiri** (gaya portal UTM, cerah): pengepala dengan butang menu dan **logo UTM ASCEND**, kad profil (nama dan e-mel), **Dashboard**, dan satu bahagian **PERINGKAT** dengan tiga kumpulan boleh dilipat: **KAI · Universiti** (subtajuk Growth / Transform), **DKAI · Jabatan (JTNC HEPA)** dan **CKAI · Pusat (UTMXCITE)** (subtajuk enam fungsi). Admin mempunyai bahagian **Admin**. Kumpulan yang mengandungi halaman aktif dibuka automatik. Butang menu mengecilkan sidebar kepada ikon (pada telefon ia menutup laci menu).
- **Sub-tab Senarai / Masuk Data** pada bar atas setiap KAI, DKAI dan CKAI.
- Semua data disimpan dalam satu Google Sheet, **satu tab bagi setiap KPI**.

## Tiga peringkat penunjuk

| Peringkat | KPI | Tag kad |
|---|---|---|
| **KAI · Peringkat Universiti** | KAI 1 hingga KAI 6 | Growth (KAI 1-3), Transform (KAI 4-6) |
| **DKAI · Peringkat Jabatan (JTNC HEPA)** | DKAI 1 | Department |
| **CKAI · Peringkat Pusat (UTMXCITE)** | CKAI 1 hingga CKAI 9 (dikelompokkan mengikut enam fungsi) | Center |

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
| KAI 4 GiGA | ≥ 20 setahun | Pelajar mendaftar pada tahun itu (cadangan 2 setiap fakulti) |
| KAI 5 F-SIP | ≥ 4 setahun | Pelajar mendaftar pada tahun itu |
| KAI 6 UTM AI Start Up | ≥ 20 setahun, minimum 5 setiap fakulti | Pelajar dilatih membentuk startup AI pada tahun itu |
| DKAI 1 Pelan Keusahawanan | 100% pada 2026 (sekali sahaja) | Milestone berpemberat (bengkel pra-pelan 50%, kelulusan JKE HEPA/JPU 50%) |

Sasaran tahunan, sasaran suku tahun (kumulatif) dan bajet disimpan dalam tab **Sasaran** dan boleh disunting melalui menu Admin → Sasaran (atau terus dalam Sheet). Bajet tidak dipaparkan kepada awam.

## Enam fungsi UTMXCITE dan CKAI (Center Key Amal Indicator)

Enam fungsi ialah mandat peringkat Universiti kepada UTMXCITE dan menjadi **aliran proses kerja**. Setiap indikator (KAI, DKAI dan CKAI) ditanda dengan satu fungsi. Dashboard boleh dipaparkan **mengikut peringkat** (KAI / DKAI / CKAI) atau **mengikut fungsi**, dan dalam bahagian CKAI indikator dikelompokkan di bawah fungsi masing-masing.

| Fungsi | KAI / DKAI berkaitan | CKAI | Penginput CKAI |
|---|---|---|---|
| **1 · Identify Student Entrepreneurship Interest** (kenal pasti minat) | | CKAI 1 · Bilangan **profiling pelajar yang didaftarkan** | PIC fakulti dan Admin |
| **2 · Conduct Entrepreneurship Training** (latihan) | KAI 4 | CKAI 2 · Bilangan program keusahawanan | PIC fakulti dan Admin |
| **3 · Support Student Business Ideation** (pengideaan) | | CKAI 3 · Bilangan program inovasi | PIC fakulti dan Admin |
| **4 · Facilitate Student Startup Development** (pembangunan startup) | KAI 1, 2, 3, 5, 6 | CKAI 4 · Pendaftaran SSU; CKAI 5 · Penggunaan Makerspace; CKAI 6 · Pendapatan sewaan ruang niaga | Admin |
| **5 · Monitor Student Enterprise Performance** (pantau prestasi) | | CKAI 7 · Pendapatan usahawan pelajar | PIC fakulti dan Admin |
| **6 · Showcase Student Innovation Venture** (pameran inovasi) | | CKAI 8 · Inovasi pelajar yang dihasilkan; CKAI 9 · Anugerah & pengiktirafan | PIC fakulti dan Admin |
| Merentas fungsi | DKAI 1 | | |

Semua CKAI ialah sasaran **minimum** dan **belum ditetapkan**: isi melalui menu Admin → Sasaran (sehingga itu kad menunjukkan "Tiada sasaran"). Dashboard awam hanya menunjukkan jumlah agregat (kiraan atau jumlah RM), tanpa nama pelajar, projek, perniagaan atau penyewa.
**PIC diberi akses** dengan menambah kod pada lajur `kpi_akses` (tab `Pengguna` atau menu Urus Pengguna): `CKAI1,CKAI2,CKAI3,CKAI7,CKAI8,CKAI9` (semua CKAI yang boleh diisi fakulti). CKAI 4, 5 dan 6 hanya untuk Admin.

| CKAI | Unit rekod | Dikira |
|---|---|---|
| 1 Profiling | Satu pelajar yang diprofilkan (satu profil bagi setiap no. matrik) | Profiling didaftarkan pada tahun **tarikh profiling** |
| 2, 3 Program | Satu program | Program berstatus **Selesai** pada tahun tarikh tamat |
| 4 SSU | Satu syarikat / perniagaan pelajar | Pendaftaran pada tahun tarikh daftar |
| 5 Makerspace | Satu baris sebulan | Jumlah penggunaan bagi bulan dalam tahun itu |
| 6 Sewaan ruang niaga | Satu baris sebulan bagi setiap penyewa | Jumlah RM berstatus **Dibayar** (belum bayar / tertunggak dipaparkan berasingan) |
| 7 Pendapatan usahawan | Satu baris sebulan bagi setiap perniagaan | Jumlah RM bagi bulan dalam tahun itu |
| 8 Inovasi pelajar | Satu projek inovasi | Projek yang **telah menyertai pertandingan** (sekurang-kurangnya peringkat Fakulti) pada tahun tarikh pertandingan |
| 9 Anugerah | Satu anugerah / pengiktirafan | Bilangan yang diterima pada tahun tarikh |

**CKAI 1 · profiling pelajar:** proses profiling pelajar akan dibangunkan oleh UTMXCITE, jadi medan sekarang ialah set asas dan akan diperhalusi kemudian: pelajar (fakulti, nama, no. matrik, e-mel, telefon, program, tahun), **tarikh profiling**, sumber profiling (tinjauan, saringan fakulti, pendaftaran minat, rujukan, penyertaan program), **tahap minat** (Tiada / Rendah / Sederhana / Tinggi), bidang minat, pengalaman perniagaan, **tahap kesediaan** (Belum ada idea / Ada idea / Ada prototaip / Sudah beroperasi), kemahiran, cadangan tindakan seterusnya (latihan, pengideaan, pembangunan startup), dan **persetujuan pelajar menggunakan data peribadi (PDPA), wajib "Ya"**. No. matrik mesti unik (tidak peka huruf besar/kecil). PIC tidak dapat melihat ID rekod fakulti lain apabila no. matrik pendua dikesan. Senarai boleh ditapis mengikut tahap minat dan tahap kesediaan.

**CKAI 2 dan 3 · daftar program (borang sama):** nama program, kategori, peringkat, penganjur / rakan kerjasama, pegawai program, objektif; **tarikh mula dan tamat**, **tempat**; **penyertaan** (jumlah peserta, dan daripada itu pelajar / staf UTM / luar UTM, serta skor kepuasan 0-5); **kewangan** (**kos penganjuran**, sumber peruntukan, **pendapatan**, sumber pendapatan); bilangan hasil (projek / prototaip / idea / startup), laporan program (PDF, pilihan), pautan dan catatan. Bagi program berstatus **Selesai**, tarikh mula dan tamat, tempat, jumlah peserta, kos dan pendapatan wajib diisi (0 dibenarkan). Tarikh tamat tidak boleh sebelum tarikh mula, dan pelajar + staf + luar UTM tidak boleh melebihi jumlah peserta. Kad dashboard menjumlahkan peserta, kos dan pendapatan bagi program yang selesai pada tahun dipilih.

**CKAI 8 · medan borang (inovasi pelajar):** tajuk inovasi, jenis, bidang, penerangan, tahap kesediaan teknologi (TRL), status harta intelek; pasukan, mentor / penyelia, pelajar (nama dan no. matrik, **tanpa no. KP**); pertandingan (status penyertaan, nama, penganjur, **peringkat** Fakulti / Universiti / Kebangsaan / Antarabangsa, tarikh, tempat); **anugerah (pilihan, jika menang)**: pingat / kedudukan, nama anugerah, nilai hadiah, sijil PDF; dan **peningkatan ke peringkat lebih tinggi**: status (Belum dinilai, Calon peningkatan, Sedang disokong, Telah dibawa ke peringkat lebih tinggi, Tidak diteruskan), peringkat sasaran, pertandingan seterusnya, tarikh dan sokongan diperlukan. Senarai boleh ditapis mengikut peringkat dan status peningkatan, jadi XCITE dapat mengenal pasti projek untuk dibawa naik.

**CKAI 9 · medan borang (anugerah):** nama anugerah, tarikh, agensi / badan penganugerah, peringkat (Fakulti / Universiti / Kebangsaan / Antarabangsa), kategori (Inovasi / Keusahawanan), program (UTM Launchpad, Makerspace, GiGAUTM Ascend, F-SIP, UTM AI Start Up, program fakulti, atau Lain-lain + nama), nama mentor / fasilitator, **pelajar (nama, no. matrik, no. KP; tambah seberapa banyak yang perlu)** dan **sijil PDF**. Medan tambahan: pingat / kedudukan, nilai hadiah (RM), lokasi / negara, nama pasukan, produk / projek / syarikat, pautan berita dan catatan.

Tab Sheet dinamakan mengikut nombor: `CKAI1_Profiling_Pelajar`, `CKAI2_Program_Keusahawanan`, `CKAI3_Program_Inovasi`, `CKAI4_SSU`, `CKAI5_Makerspace`, `CKAI6_Sewaan_Inkubator`, `CKAI7_Pendapatan_Pelajar`, `CKAI8_Inovasi_Pelajar`, `CKAI9_Anugerah`.

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
- Fail disimpan dalam folder Drive **peribadi** "UTMXCITE ASCEND2030 - Lampiran" milik pemilik skrip dan **tidak dikongsi**. Fail hanya boleh dimuat turun melalui aplikasi selepas semakan akses: PIC bagi fakulti sendiri, Admin bagi semua. Setiap muat naik dan muat turun direkod dalam `Log_Audit`.
- Satu rekod hanya boleh merujuk fail yang baru dimuat naik oleh pengguna itu sendiri melalui aplikasi (tidak boleh merujuk fail Drive sembarangan). Fail yang diganti atau yang rekodnya dipadam dibuang ke tong sampah Drive.
- Manifest meminta skop `https://www.googleapis.com/auth/drive` (diperlukan oleh `DriveApp`). Skop ini luas, jadi gunakan akaun pemilik skrip yang sesuai dan jangan kongsi projek Apps Script dengan orang yang tidak perlu.
- **No. KP dan no. matrik pelajar** (no. KP hanya dalam CKAI 9; no. matrik, e-mel dan telefon juga dalam profiling CKAI 1, SSU CKAI 4, inovasi CKAI 8 dan KAI 4 hingga 6) ialah data peribadi (PDPA 2010). Ia hanya dipaparkan kepada Admin dan PIC fakulti berkenaan, tidak dipaparkan dalam jadual senarai (hanya nama), tidak dimasukkan dalam `Log_Audit`, dan tidak pernah muncul pada dashboard awam. Dalam Google Sheet, no. KP disimpan sebagai teks biasa, jadi **hadkan akses kepada Sheet** (jangan kongsi) dan tetapkan tempoh simpanan mengikut dasar universiti.

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

## Prototaip pra-demo

`demo/utmxcite-demo.html` ialah satu fail HTML yang menjalankan kod sistem sebenar dalam pelayar dengan data contoh (tanpa Google), untuk pra-demo. Lihat `demo/README.md`. Bina semula dengan `node tools/build_demo.js`.

## Ujian

Logik pelayan diuji dengan tiruan API GAS (Node 18+):

```
node tests/run.js        # ujian logik: OTP, akses, pengesahan, kiraan KPI dan CKAI, dashboard awam
node tests/demo.js       # ujian prototaip pra-demo (fail HTML tunggal, file://)
node tests/e2e.js        # ujian pelayar sebenar (Playwright + Chromium) menggunakan pelayan tiruan yang sama, termasuk muat naik/muat turun PDF
```

Ujian tidak menggantikan ujian sebenar dalam Google (contoh: kebenaran OAuth, penghantaran e-mel sebenar, Drive sebenar, kelajuan Sheets, dan sama ada pelayar anda membenarkan muat turun PDF daripada halaman Apps Script). Lakukan ujian asap selepas deploy: log masuk Admin, tambah PIC, log masuk PIC, simpan satu rekod dan semak dashboard awam dalam tetingkap inkognito.

## Tab Persediaan (pautan, ID dan semakan sistem)

- **Dalam Google Sheet:** tab `Persediaan` ditulis semula setiap kali `setup()` dijalankan. Ia memuatkan ID/pautan Sheet, pautan web app, Script ID, pautan folder lampiran, pemilik skrip dan panduan jika paparan "404".
- **Dalam aplikasi:** Admin > Pentadbiran > Persediaan. Menunjukkan pautan/ID (butang Salin), senarai semakan ✓/✗ (tab, lajur, Admin aktif, folder, pautan /exec, kuota e-mel), butang "Jalankan persediaan" (baiki tab/lajur hilang) dan "Hantar e-mel ujian".
- **Punca biasa "404":** guna pautan `/exec` (bukan `/dev` atau pautan editor), Execute as = Me, Who has access = Anyone, dan deploy *New version* selepas ubah kod.

## Infografik (menu awam)

Menu **Infografik** (tajuk halaman: **Laporan Prestasi UTMXCITE**; menu pertama, sebelum Dashboard; ia juga halaman pertama apabila pautan dibuka, tanpa log masuk) memaparkan pencapaian UTMXCITE secara visual daripada data dashboard: cincin Pekerjaan Premium Tier 1 berbanding sasaran 40%, pencapaian mengikut tiga peringkat dan enam fungsi, nombor utama, trend premium, carta bulanan (pendapatan, sewaan, Makerspace), pecahan mengikut fakulti dan senarai semua indikator. Tahun boleh ditukar dan halaman boleh dicetak (butang Cetak / PDF). Hanya data agregat dipaparkan (titik akhir `api_trend` dan `api_dashboard`).

## CKAI 10 · Jumlah perbelanjaan operasi (Cross-cutting)

Laporan bulanan kedudukan kewangan tabung amanah UTMXCITE (berdasarkan laporan "Kedudukan Kewangan Baki Tabung Amanah"). **Admin sahaja** mengisi; satu rekod bagi setiap tabung setiap bulan.

- **Medan:** bulan laporan, nama tabung (lima tabung disenaraikan atau **Lain-lain** yang mesti dinamakan dan diberi chargeline), no. chargeline (automatik bagi tabung disenaraikan), peruntukan / baki awal (a), komitmen (b), perbelanjaan terkumpul sehingga bulan itu (c), lampiran laporan (PDF, tidak wajib) dan catatan. **Baki tabung d = a − (b + c)** dikira oleh sistem. **Peruntukan (a) dan komitmen (b) diisi sekali sahaja** (laporan pertama tabung bagi setiap tahun); bulan seterusnya hanya perbelanjaan (c) diisi, dan a/b diwarisi daripada rekod terdahulu. Isi komitmen semula hanya jika ia berubah.
- **Dashboard awam:** jumlah perbelanjaan, jumlah peruntukan, komitmen, baki, peratus penggunaan dan **butiran mengikut tabung** (% Penggunaan Tabung dan RM perbelanjaan; setiap tabung dilabel dengan 5 aksara terakhir no. chargeline, contoh 07078). No. chargeline serta peruntukan, komitmen dan baki setiap tabung hanya dalam senarai Admin.
- **Ukuran dan sasaran:** nilai KPI ialah **% perbelanjaan daripada peruntukan** (jumlah perbelanjaan terkumpul ÷ jumlah peruntukan tabung, rekod bulan terkini setiap tabung). Sasaran lalai **100%** (boleh diubah dalam Admin > Sasaran, maksimum 100%): makin hampir 100% makin cekap; lebih 100% ditandakan "Melebihi peruntukan". Medan pilihan **bajet disasarkan** membolehkan kiraan **penjimatan** (atau lebihan) berbanding bajet. % setiap tabung dipaparkan dalam senarai Admin.
- Maklumat perolehan tidak termasuk dalam KPI ini.
- Tambah tabung tetap baharu dengan menyunting `TABUNG_AMANAH` dalam `Config.gs`.
