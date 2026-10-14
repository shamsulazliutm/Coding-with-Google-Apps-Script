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
   - mencipta folder Drive "Laporan Kewangan Penyewa" untuk fail PDF;
   - memasang trigger harian untuk peringatan.
6. Dalam sheet **Lot**, isi **Tarikh mula sewa** (format `2026-01-01`), **Tarikh akhir sewa** dan **Sewa bulanan** bagi setiap lot. Lot tanpa tarikh mula tidak mempunyai bulan laporan.
7. **Deploy > New deployment > Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   
   Salin URL web app dan kongsi kepada penyewa.
8. Log masuk sebagai admin, dan daftarkan penyewa di tab **Pengguna** (e-mel, nama, peranan Penyewa, lot).

Setiap kali kod diubah, buat **New version** pada deployment yang sama supaya URL kekal.

## Penyelesaian masalah

Jika skrin menunjukkan **"Ralat sistem (rujukan XXXXXX)"**, buka sheet **Log**. Baris dengan tindakan `Ralat sistem XXXXXX` mengandungi punca sebenar. Sebab paling biasa:

| Punca | Penyelesaian |
|---|---|
| Kebenaran e-mel belum diberi (`MailApp.sendEmail` tiada permission) | Jalankan `setupSystem` atau `checkSystem` dari editor, tekan **Review permissions**, dan luluskan semua. |
| Web app masih guna versi kod lama | **Deploy > Manage deployments > ikon pensel > Version: New version > Deploy**. Kod yang disimpan dalam editor tidak digunakan sehingga versi baharu dibuat. |
| Sheet belum disediakan | Jalankan `setupSystem`. |
| Fail HTML tersalah nama | Nama fail mesti tepat `Index` (tanpa `.html` dalam editor). |

Jalankan **`checkSystem`** dari editor untuk senarai semakan automatik (sheet, admin, kebenaran e-mel, folder Drive, trigger). Hasilnya ada dalam Execution log.

## Cara ia berfungsi

- **Log masuk**: e-mel berdaftar dan OTP 6 digit (sah 5 minit, sekali guna, maksimum 5 percubaan). Tiada akaun Google diperlukan. Peranan (`Admin` atau `Penyewa`) dibaca daripada sheet **Pengguna**.
- **Penyewa**: dua tab, *Maklumat Peniaga* dan *Laporan Kewangan*. Satu baris bagi setiap bulan sewa, dari bulan mula sewa hingga bulan semasa. Laporan disimpan sebagai draf, dihantar, dan boleh diedit sehingga disahkan.
- **Lampiran**: PDF sahaja, maksimum 10 MB (laporan kewangan, resit sewa, resit incubator jika menyewa peralatan UTMXCITE). Nama fail dijana: `StudentMall_Lot3_September_<Perniagaan>_FinancialReport.pdf`. Fail disimpan di Drive: `tahun / 09 September / <kod lot>`.
- **Tarikh akhir**: hari ke-7 bulan berikutnya. Hantaran selepas tarikh itu ditanda *Lewat*.
- **Admin**: lihat semua lot mengikut bulan, semak laporan (Sahkan atau Minta pembetulan dengan komen), hantar peringatan manual, eksport CSV, urus lot dan pengguna.
- **Status**: `Belum dihantar` (termasuk draf), `Dihantar`, `Perlu dibetulkan`, `Disahkan`. Laporan yang disahkan dikunci.
- **Peringatan automatik**: pada 5hb setiap bulan (sekitar jam 9 pagi), e-mel dihantar kepada penyewa yang belum menghantar laporan bulan lepas. Setiap lot hanya diingatkan sekali.

## Struktur sheet

Lajur tarikh (Tarikh mula sewa, Tarikh akhir sewa, Tarikh hantar, Tarikh disemak, Dikemas kini, Masa) menggunakan format tarikh sebenar `dd/mm/yyyy`. Pada sheet **Lot**, sel tarikh mempunyai pemilih tarikh (klik dua kali sel) dan menolak teks yang bukan tarikh. Jika anda mengemas kini daripada versi lama, jalankan `setupSystem` semula untuk menukar tarikh teks lama kepada format tarikh.

Jangan ubah susunan lajur. Kod membaca lajur mengikut kedudukan. Anda boleh menambah lajur di sebelah kanan, mewarna, atau menapis.

| Sheet | Lajur |
|---|---|
| Pengguna | E-mel, Nama, **Peranan** (Admin / Penyewa), Kod lot, Status (Aktif / Tidak aktif) |
| Lot | Kod lot, Lokasi, No lot, Status, Tarikh mula sewa, Tarikh akhir sewa, Sewa bulanan (RM) |
| Peniaga | Kod lot, Nama perniagaan, Jenis, No SSM, Nama pelajar, No KP, No matrik, Fakulti, No telefon, Dikemas kini |
| Laporan | ID, Kod lot, Tahun, Bulan, Pendapatan, Perbelanjaan, Bayaran sewa, Sewa peralatan, 3 lajur fail, Status, Lewat, Komen admin, Disemak oleh, Tarikh disemak, Tarikh hantar, Akuan, Dikemas kini |
| Log | Masa, E-mel, Tindakan, Butiran (audit semua tindakan penting) |
| Peringatan | Rekod peringatan automatik yang telah dihantar |

Lot baharu ditambah melalui tab **Lot** dalam sistem (butang *+ Tambah lot*), atau terus dalam sheet **Lot**. Kod lot dijana daripada lokasi dan nombor, contohnya `StudentMall-Lot3`.

## Keselamatan dan privasi

- Penyewa hanya boleh melihat dan mengubah lot sendiri. Lot dikenal pasti daripada akaun dalam sesi pelayan, bukan daripada input pelayar.
- Peranan dan status akaun disemak semula pada setiap permintaan. Akaun yang dinyahaktifkan hilang akses serta-merta.
- OTP disimpan sebagai hash dan tidak pernah dikembalikan kepada pelayar. Mesej log masuk sama sama ada e-mel berdaftar atau tidak.
- No. KP dipaparkan separa tersembunyi kepada admin dan tidak disertakan dalam eksport CSV. Data penuh hanya wujud dalam sheet **Peniaga**, jadi hadkan akses kepada Google Sheet itu kepada admin yang perlu.
- Fail PDF disimpan dalam folder Drive peribadi (tidak dikongsi secara awam) dan disampaikan melalui sistem selepas semakan akses.
- Kuota e-mel harian Apps Script: sekitar 100 (akaun Gmail biasa) atau 1,500 (Google Workspace). Gunakan akaun Workspace UTM sebagai pemilik skrip.

## Ujian

Logik pelayan diuji dengan tiruan API Apps Script (46 ujian: OTP, kebenaran, tarikh akhir dan lewat, muat naik PDF, semakan, peringatan, keselamatan). Antara muka diuji hujung ke hujung dengan Playwright. Skrip ujian ada dalam folder `tests/`.
