# Student Mall & SUB Financial Monthly Report

Sistem laporan kewangan bulanan penyewa Student Mall dan Student Union Building (SUB), UTMXCITE.
Dibina dengan Google Apps Script (Web App) dan Google Sheets sebagai pangkalan data.

## Fail

| Fail | Fungsi |
|---|---|
| `Code.gs` | Semua logik pelayan: log masuk OTP, penyewa, admin, peringatan, setup |
| `Index.html` | Antara muka (log masuk, tab penyewa, tab admin) |
| `appsscript.json` | Manifest: zon masa Kuala Lumpur, skop kebenaran, tetapan web app |

## Pemasangan

1. Cipta Google Sheet baharu, contohnya "Laporan Kewangan Penyewa".
2. Buka **Extensions > Apps Script**.
3. Salin kandungan `Code.gs` ke fail `Code.gs`, dan cipta fail HTML bernama **`Index`** (tanpa sambungan di dalam editor) lalu tampal `Index.html`.
4. Dalam **Project Settings**, tandakan *Show "appsscript.json" manifest file in editor*, dan ganti kandungannya dengan `appsscript.json`.
5. Pilih fungsi **`setupSystem`** dan tekan **Run**. Luluskan kebenaran yang diminta. Fungsi ini:
   - mencipta sheet `Pengguna`, `Lot`, `Peniaga`, `Laporan`, `Log` dan `Peringatan`;
   - mengisi 15 lot (Student Mall 1 hingga 10, SUB 1 hingga 5);
   - mendaftarkan `utmxcite@utm.my` sebagai admin lalai (ubah `APP.DEFAULT_ADMIN` dalam `Config` di bahagian atas `Code.gs` jika perlu);
   - mengesahkan akses kepada folder simpanan PDF (lihat bahagian di bawah);
   - memasang trigger harian untuk peringatan.
6. Dalam sistem (tab **Penyewaan**), tambah penyewaan bagi setiap lot: pilih lot, bulan mula, bulan tamat (jika ada) dan sewa bulanan. Lot tanpa penyewaan tidak mempunyai bulan laporan.
7. **Deploy > New deployment > Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   
   Salin URL web app dan kongsi kepada penyewa.
8. Log masuk sebagai admin, dan daftarkan penyewa di tab **Pengguna** (e-mel, nama, peranan Penyewa, lot).

Setiap kali kod diubah, buat **New version** pada deployment yang sama supaya URL kekal.

## Folder simpanan PDF

Semua PDF disimpan dalam folder Drive yang ditetapkan oleh `ROOT_FOLDER_ID` di bahagian atas `Code.gs`
(kini `1n7GPr2AIOQ4qBWJCZxWBID4RvbfKHONE`, iaitu pautan `https://drive.google.com/drive/folders/1n7GPr2AIOQ4qBWJCZxWBID4RvbfKHONE`).

- Akaun yang menjalankan skrip (pemilik deployment) mesti mempunyai akses **Editor** pada folder itu. Jika tidak, `setupSystem` dan muat naik PDF memaparkan mesej "Folder simpanan Drive tidak dapat diakses", dan sistem tidak mencipta folder lain secara diam-diam.
- Folder ini sepatutnya dikongsi sebagai **Restricted** (hanya orang tertentu). Fail PDF mewarisi tetapan kongsi folder, jadi jangan gunakan "Anyone with the link" kerana laporan kewangan penyewa akan boleh dibuka oleh sesiapa yang mempunyai pautan. Penyewa dan admin membuka fail melalui sistem, bukan terus dari Drive.
- Untuk menukar folder, ubah `ROOT_FOLDER_ID`. Fail yang sudah dimuat naik kekal di tempat asal dan masih boleh dibuka melalui sistem. Kosongkan `ROOT_FOLDER_ID` (`''`) untuk membiarkan sistem mencipta folder baharu sendiri.

## Penyelesaian masalah

Jika skrin menunjukkan **"Ralat sistem (rujukan XXXXXX)"**, buka sheet **Log**. Baris dengan tindakan `Ralat sistem XXXXXX` mengandungi punca sebenar. Sebab paling biasa:

| Punca | Penyelesaian |
|---|---|
| Kebenaran e-mel belum diberi (`MailApp.sendEmail` tiada permission) | Jalankan `setupSystem` atau `checkSystem` dari editor, tekan **Review permissions**, dan luluskan semua. |
| Web app masih guna versi kod lama | **Deploy > Manage deployments > ikon pensel > Version: New version > Deploy**. Kod yang disimpan dalam editor tidak digunakan sehingga versi baharu dibuat. |
| Sheet belum disediakan | Jalankan `setupSystem`. |
| Folder simpanan tidak boleh diakses | Berikan akaun pemilik skrip akses Editor pada folder Drive, kemudian jalankan `checkSystem`. |
| Fail HTML tersalah nama | Nama fail mesti tepat `Index` (tanpa `.html` dalam editor). |

Jalankan **`checkSystem`** dari editor untuk senarai semakan automatik (sheet, admin, kebenaran e-mel, folder Drive, trigger). Hasilnya ada dalam Execution log.

## Cara ia berfungsi

- **Log masuk**: e-mel berdaftar dan OTP 6 digit (sah 5 minit, sekali guna, maksimum 5 percubaan). Tiada akaun Google diperlukan. Peranan (`Admin` atau `Penyewa`) dibaca daripada sheet **Pengguna**.
- **Penyewa**: dua tab, *Maklumat Peniaga* dan *Laporan Kewangan*. Satu baris bagi setiap bulan dalam tempoh sewa penyewa itu, dari bulan mula sewa hingga bulan semasa. Laporan disimpan sebagai draf, dihantar, dan boleh diedit sehingga disahkan.
- **Lampiran**: PDF sahaja, maksimum 10 MB (laporan kewangan, resit sewa, resit incubator jika menyewa peralatan UTMXCITE). Nama fail dijana: `StudentMall_Lot3_September_<Perniagaan>_FinancialReport.pdf`. Fail disimpan di folder simpanan Drive: `tahun / 09 September / <kod lot>`.
- **Tarikh akhir**: asalnya hari ke-7 bulan berikutnya. Apabila e-mel peringatan dihantar, tarikh akhir dalam e-mel itu ialah **tarikh e-mel dihantar + 7 hari** (contohnya e-mel 5 November memberi tarikh akhir 12 November). Tarikh akhir baharu itu juga dipaparkan dalam sistem dan menjadi had *Lewat*. Peringatan tidak pernah memendekkan tarikh akhir asal. Bilangan hari ditetapkan oleh `REMINDER_DEADLINE_DAYS` di bahagian atas `Code.gs`.
- **Dashboard penyewa**: tab pertama. Menunjukkan laporan yang perlu tindakan dengan butang terus ke borang, komen admin terkini, jumlah pendapatan, perbelanjaan, untung atau rugi dan purata bulanan (laporan yang sudah dihantar sahaja), carta bulanan, kepatuhan penghantaran, dan senarai bulan yang perlu dihantar atau dibetulkan.
- **Dashboard admin**: tab pertama. Penapis bulan dan tahun (lalai: semua bulan, tahun semasa). Menunjukkan kadar penghantaran, jumlah kewangan, bilangan lewat, senarai yang menunggu semakan, perlu dibetulkan dan belum dihantar (dengan butang Semak, Lihat dan Ingatkan), status laporan, ringkasan mengikut lokasi, carta kadar penghantaran dan kewangan bulanan semua lot, lot berpendapatan tertinggi dan lot rugi.
- **Admin**: lihat semua lot mengikut bulan, semak laporan (Sahkan atau Minta pembetulan dengan komen), hantar peringatan manual, eksport CSV, urus lot dan pengguna.
- **Status**: `Belum dihantar` (termasuk draf), `Dihantar`, `Perlu dibetulkan`, `Disahkan`. Laporan yang disahkan dikunci.
- **Peringatan automatik**: pada 5hb setiap bulan (sekitar jam 9 pagi), e-mel dihantar kepada penyewa yang belum menghantar laporan bulan lepas. Setiap lot hanya diingatkan sekali pada hari itu. Setiap peringatan (automatik atau manual dari dashboard) direkod dalam sheet **Peringatan** bersama tarikh akhirnya.

## Struktur sheet

Lajur tarikh (Tarikh mula sewa, Tarikh akhir sewa, Tarikh hantar, Tarikh disemak, Dikemas kini, Masa) menggunakan format tarikh sebenar `dd/mm/yyyy`. Pada sheet **Lot**, sel tarikh mempunyai pemilih tarikh (klik dua kali sel) dan menolak teks yang bukan tarikh. Jika anda mengemas kini daripada versi lama, jalankan `setupSystem` semula untuk menukar tarikh teks lama kepada format tarikh.

Jangan ubah susunan lajur. Kod membaca lajur mengikut kedudukan. Anda boleh menambah lajur di sebelah kanan, mewarna, atau menapis.

| Sheet | Lajur |
|---|---|
| Pengguna | E-mel, Nama, **Peranan** (Admin / Penyewa), ID penyewaan, Status (Aktif / Tidak aktif) |
| Lot | Kod lot, Lokasi, No lot, Status |
| Penyewaan | ID penyewaan, Kod lot, Tarikh mula sewa, Tarikh akhir sewa, Sewa bulanan (RM) |
| Peniaga | ID penyewaan, Nama perniagaan, Jenis, No SSM, Nama pelajar, No KP, No matrik, Fakulti, No telefon, Dikemas kini |
| Laporan | ID, Kod lot, Tahun, Bulan, Pendapatan, Perbelanjaan, Bayaran sewa, Sewa peralatan, 3 lajur fail, Status, Lewat, Komen admin, Disemak oleh, Tarikh disemak, Tarikh hantar, Akuan, Dikemas kini, ID penyewaan |
| Log | Masa, E-mel, Tindakan, Butiran (audit semua tindakan penting) |
| Peringatan | Rekod setiap peringatan yang dihantar (kunci, masa, tarikh akhir) |

Lot baharu ditambah melalui tab **Lot** dalam sistem (butang *+ Tambah lot*), atau terus dalam sheet **Lot**. Kod lot dijana daripada lokasi dan nombor, contohnya `StudentMall-Lot3`.

## Lot bertukar penyewa

Sebuah lot boleh mempunyai beberapa penyewaan pada masa berbeza. Contoh: Lot 6, Syarikat A dari Januari hingga Jun dan Syarikat B dari Julai hingga Disember.

1. Tab **Penyewaan > + Tambah penyewaan**: Lot 6, mula Januari 2026, tamat Jun 2026.
2. Tambah penyewaan kedua: Lot 6, mula Julai 2026, tamat Disember 2026.
3. Tab **Pengguna**: daftarkan pemilik A dengan penyewaan pertama dan pemilik B dengan penyewaan kedua.

Peraturan:
- **Penukaran dibuat pada awal bulan.** Tarikh mula mesti hari pertama bulan dan tarikh akhir mesti hari terakhir bulan (pemilih bulan dalam sistem menetapkannya secara automatik).
- Dua penyewaan pada lot yang sama tidak boleh bertindih.
- Setiap penyewa hanya melihat dan menghantar laporan bagi bulan dalam tempoh sewanya sendiri, dengan maklumat peniaga dan sewa sendiri. Penyewa lama tidak boleh melihat laporan atau fail penyewa baharu, dan sebaliknya.
- Dashboard admin menunjukkan syarikat yang betul pada setiap bulan. E-mel peringatan dan keputusan semakan hanya dihantar kepada penyewa pada bulan itu.
- Selepas tempoh sewa tamat, penyewa lama masih boleh melengkapkan laporan tertunggak dalam tempoh sewanya sehingga admin menyahaktifkan akaunnya (tab **Pengguna**).
- Penyewaan yang sudah ada laporan atau pengguna tidak boleh dipadam, dan tempohnya tidak boleh dikecilkan sehingga mengecualikan laporan sedia ada.

### Naik taraf daripada versi lama

Versi lama menyimpan tarikh sewa pada sheet **Lot** dan memautkan peniaga dan pengguna kepada kod lot. Selepas menampal `Code.gs` baharu, jalankan `setupSystem` sekali. Ia mencipta sheet **Penyewaan** daripada tarikh sewa lama, memautkan peniaga, pengguna dan laporan sedia ada kepada penyewaan itu, dan mengosongkan lajur tarikh lama pada sheet **Lot**. Selamat dijalankan berulang kali.

## Keselamatan dan privasi

- Penyewa hanya boleh melihat dan mengubah lot sendiri. Lot dikenal pasti daripada akaun dalam sesi pelayan, bukan daripada input pelayar.
- Peranan dan status akaun disemak semula pada setiap permintaan. Akaun yang dinyahaktifkan hilang akses serta-merta.
- OTP disimpan sebagai hash dan tidak pernah dikembalikan kepada pelayar. Mesej log masuk sama sama ada e-mel berdaftar atau tidak.
- No. KP dipaparkan separa tersembunyi kepada admin dan tidak disertakan dalam eksport CSV. Data penuh hanya wujud dalam sheet **Peniaga**, jadi hadkan akses kepada Google Sheet itu kepada admin yang perlu.
- Fail PDF disimpan dalam folder Drive peribadi (tidak dikongsi secara awam) dan disampaikan melalui sistem selepas semakan akses.
- Kuota e-mel harian Apps Script: sekitar 100 (akaun Gmail biasa) atau 1,500 (Google Workspace). Gunakan akaun Workspace UTM sebagai pemilik skrip.

## Ujian

Logik pelayan diuji dengan tiruan API Apps Script (79 ujian: OTP, kebenaran, tarikh akhir dan lewat, muat naik PDF, semakan, peringatan, keselamatan). Antara muka diuji hujung ke hujung dengan Playwright. Skrip ujian ada dalam folder `tests/`.
