# Penilaian Permohonan Student Mall & SUB (UTMPreneur · UTMXCITE)

Web app Google Apps Script dengan rekod disimpan dalam Google Sheets.

## Fail (hanya dua)

| Fail | Isi |
|---|---|
| `Code.gs` | Pelayan: pengesahan peranan, API panel dan admin, pengiraan keputusan, serta penyediaan sheet dan data awal |
| `Index.html` | Antara muka lengkap (tema maroon dan emas, CSS dan JavaScript dalam satu fail) |

## Pemasangan

1. Cipta satu **Google Sheet** baharu (guna akaun `utmxcite@utm.my`), kemudian **Extensions > Apps Script**.
2. Tampal kandungan `Code.gs` ke dalam fail `Code.gs` yang sedia ada. Tambah satu fail **HTML** bernama `Index` dan tampal kandungan `Index.html`.
3. Simpan, muat semula Sheet, kemudian pilih menu **Penilaian > Sediakan sheet (kali pertama)** dan beri kebenaran.
   Sheet berikut dicipta: `Panel`, `Pemohon`, `Pelajar`, `Sesi`, `Rubrik`, `Chip`, `Penilaian`, `Keputusan`, `Log`.
4. **Deploy > New deployment > Web app**
   - Execute as: **Me** (pemilik skrip)
   - Who has access: **Anyone**
5. Kongsikan pautan web app kepada panel.

## Log masuk OTP

- Pengguna memasukkan e-mel, dan sistem menghantar **kod OTP 6 digit** ke e-mel itu melalui `MailApp`. Kod sah 10 minit.
- Hanya e-mel yang ada dalam sheet `Panel` (Status = Aktif) dan admin `utmxcite@utm.my` menerima kod. Jawapan skrin sentiasa sama untuk e-mel berdaftar atau tidak, supaya senarai panel tidak terdedah.
- Had: 3 permintaan kod setiap e-mel dalam 10 minit, 5 cubaan salah bagi satu kod, dan kod hanya boleh digunakan sekali.
- Selepas berjaya, pengguna mendapat sesi 6 jam. Peranan disemak semula pada setiap permintaan, jadi panel yang dinyahaktifkan terus ditolak.
- Tiada akaun Google diperlukan, jadi panel **bukan @utm.my** juga boleh menilai: tambah e-melnya dalam tab Panel.
- Kuota e-mel Apps Script: sehingga 1,500 e-mel sehari bagi akaun Workspace (100 bagi akaun Gmail biasa). Kebenaran menghantar e-mel diminta semasa kali pertama menjalankan "Sediakan sheet".
- Pautan web app yang terbuka kepada umum hanya menunjukkan skrin log masuk. Semua data dilindungi oleh token sesi di pelayan.

## Peranan dan akses

- **Panel** (sheet `Panel`, Peranan = Panel, Status = Aktif): hanya nampak maklumat calon (No. KP bertopeng) dan penilaian miliknya sendiri. Tiada panel lain atau keputusan dihantar kepada pelayar panel.
- **Admin** (`utmxcite@utm.my`): semua tab. Boleh mengedit permohonan, sesi, panel, rubrik, menetapkan status akhir, menutup atau membuka semula sesi dan membuka semula penilaian yang dikunci.
- Tambah panel: tab **Panel > + Tambah panel**, atau tambah baris dalam sheet `Panel`. Panel yang dinyahaktifkan tidak boleh log masuk, tetapi markah lamanya kekal.

## Peraturan penilaian

- 6 kriteria, jumlah **100 markah** (10 / 20 / 20 / 20 / 20 / 10). Maksimum boleh diubah di tab Rubrik, jumlahnya mesti 100.
- Panel memilih **tahap 1–5**, markah = tahap ÷ 5 × maksimum, dan boleh melaraskan markah (**nombor bulat**, 0 hingga maksimum). Pelayan mengesahkan semula setiap markah.
- **Catatan:** setiap kriteria ada ruang catatan (butang "+ Catatan"), selain catatan keseluruhan dan cip ulasan pantas. Admin melihat semua catatan dalam tab Keputusan (klik baris pemohon).
- Draf disimpan automatik. **Hantar skor & kunci** mengunci penilaian; hanya admin boleh membukanya semula.
- **Purata** panel dipaparkan dua tempat perpuluhan. Ranking daripada purata (purata sama berkongsi ranking). Status akhir ditetapkan admin.
- Output ke sheet `Keputusan` dikemas kini automatik apabila penilaian dihantar, dibuka semula atau status akhir ditukar.
- Rubrik disimpan mengikut versi. Versi baharu hanya boleh digunakan oleh sesi jika belum ada penilaian dihantar.
- Semua suntingan penting direkodkan dalam sheet `Log`.

## Logo

Tetapkan `LOGO_URL` di atas `Code.gs` kepada URL atau `data:` URI imej logo UTM/UTMXCITE. Jika kosong, logo teks sementara digunakan.

## Data

Dalam `Code.gs` (fungsi `setupSheets`), 6 permohonan (Marzmell, Nanel, Cheval, Voltro, The Cube, Majora) dan pautan pelan perniagaan Drive diisi awal daripada fail penilaian sedia ada. Marzmell ialah SUB dengan dua pelajar.

## Kemas kini daripada versi lama

Sheet `Penilaian` versi lama dilanjutkan secara automatik dengan lajur `Catatan1`–`Catatan6` apabila sistem dibuka. Data lama tidak terjejas.
