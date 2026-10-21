# Penilaian Permohonan Student Mall & SUB (UTMPreneur · UTMXCITE)

Web app Google Apps Script dengan rekod disimpan dalam Google Sheets.

## Fail

| Fail | Fungsi |
|---|---|
| `Code.gs` | Pelayan: pengesahan peranan, API panel dan admin, pengiraan keputusan |
| `Setup.gs` | Mencipta sheet dan mengisi data awal (6 panel, admin, rubrik, 6 permohonan) |
| `Index.html`, `Style.html`, `Client.html` | Antara muka (tema maroon dan emas) |
| `appsscript.json` | Manifes: web app dijalankan sebagai pemilik, akses DOMAIN |

## Pemasangan

1. Cipta satu **Google Sheet** baharu (guna akaun `utmxcite@utm.my`).
2. **Extensions > Apps Script**, lalu salin kandungan semua fail di atas ke dalam projek.
   Dalam editor, aktifkan "Show appsscript.json manifest file" (Project Settings) dan tampal `appsscript.json`.
3. Muat semula Sheet, kemudian pilih menu **Penilaian > Sediakan sheet (kali pertama)** dan beri kebenaran.
   Sheet berikut dicipta: `Panel`, `Pemohon`, `Pelajar`, `Sesi`, `Rubrik`, `Chip`, `Penilaian`, `Keputusan`, `Log`.
4. **Deploy > New deployment > Web app**
   - Execute as: **Me** (pemilik skrip)
   - Who has access: **Anyone within UTM** (domain)
5. Kongsikan pautan web app kepada panel. Setiap panel log masuk dengan e-mel UTM yang tersenarai dalam sheet `Panel`.

> `Session.getActiveUser().getEmail()` hanya memulangkan e-mel pengguna jika pengguna berada dalam domain yang sama dengan pemilik skrip. Semua panel menggunakan e-mel `@utm.my`, jadi pemilik skrip mesti juga akaun `@utm.my`.

## Peranan dan akses

- **Panel** (sheet `Panel`, Peranan = Panel, Status = Aktif): hanya nampak maklumat calon (No. KP bertopeng) dan penilaian miliknya sendiri. Tiada panel lain atau keputusan dihantar kepada pelayar panel.
- **Admin** (`utmxcite@utm.my`): semua tab. Boleh mengedit permohonan, sesi, panel, rubrik, menetapkan status akhir, menutup atau membuka semula sesi dan membuka semula penilaian yang dikunci.
- Tambah panel: tab **Panel > + Tambah panel**, atau tambah baris dalam sheet `Panel`. Panel yang dinyahaktifkan tidak boleh log masuk, tetapi markah lamanya kekal.

## Peraturan penilaian

- 6 kriteria, jumlah **100 markah** (10 / 20 / 20 / 20 / 20 / 10). Maksimum boleh diubah di tab Rubrik, jumlahnya mesti 100.
- Panel memilih **tahap 1–5**, markah = tahap ÷ 5 × maksimum, dan boleh melaraskan markah (**nombor bulat**, 0 hingga maksimum). Pelayan mengesahkan semula setiap markah.
- Draf disimpan automatik. **Hantar skor & kunci** mengunci penilaian; hanya admin boleh membukanya semula.
- **Purata** panel dipaparkan dua tempat perpuluhan. Ranking daripada purata (purata sama berkongsi ranking). Status akhir ditetapkan admin.
- Output ke sheet `Keputusan` dikemas kini automatik apabila penilaian dihantar, dibuka semula atau status akhir ditukar.
- Rubrik disimpan mengikut versi. Versi baharu hanya boleh digunakan oleh sesi jika belum ada penilaian dihantar.
- Semua suntingan penting direkodkan dalam sheet `Log`.

## Logo

Tetapkan `LOGO_URL` di atas `Code.gs` kepada URL atau `data:` URI imej logo UTM/UTMXCITE. Jika kosong, logo teks sementara digunakan.

## Data

Dalam fail `Setup.gs`, 6 permohonan (Marzmell, Nanel, Cheval, Voltro, The Cube, Majora) dan pautan pelan perniagaan Drive diisi awal daripada fail penilaian sedia ada. Marzmell ialah SUB dengan dua pelajar.
