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

## Log masuk dengan kod OTP (tanpa e-mel)

Pengguna **hanya menaip kod OTP 8 digit**. Tiada e-mel atau kata laluan.

1. Admin buka tab **Panel**, kemudian tekan **Jana kod semua panel** (atau **Jana OTP** pada satu baris). Kod dihantar ke e-mel setiap panel secara automatik (boleh dimatikan) dan dipaparkan sekali kepada admin untuk disalin, sebagai cadangan jika e-mel gagal.
2. Panel membuka pautan sistem dan menaip kod itu.
3. Kod **sekali guna**, sah 48 jam (`CODE_TTL_HOURS` dalam `Code.gs`), dan disimpan sebagai hash dalam sheet `Panel`, bukan teks asal. Menjana kod baharu membatalkan kod lama.
4. Selepas berjaya, pengguna mendapat sesi 6 jam yang kekal walaupun tab ditutup. Butang **Log keluar** menamatkan sesi. Jika sesi tamat atau pelayar bertukar, admin menjana kod baharu.

**Admin pertama kali / pemulihan:** dalam Google Sheet, pilih menu **Penilaian > Jana kod OTP admin**. Kod dipaparkan kepada pemilik skrip sahaja. Menu **Jana & e-mel kod OTP semua panel** dan **Buka kunci log masuk** juga tersedia.

**Keselamatan**
- Kod 8 digit rawak, dan panel tidak aktif ditolak serta-merta kerana peranan disemak setiap permintaan.
- Had 30 cubaan salah dalam 10 minit bagi seluruh sistem. Selepas had itu semua log masuk disekat sehingga tamat 10 minit, atau admin memilih **Buka kunci log masuk** dalam menu Sheet. Ini menghalang tekaan kod, dengan kos sekatan sementara.
- Kod tidak direkodkan dalam sheet `Log`. Hanya tindakan "Jana kod OTP" dan "Log masuk" dicatat.
- Tiada akaun Google diperlukan, jadi panel bukan @utm.my juga boleh menilai.
- Kuota e-mel Apps Script: 1,500 sehari (Workspace) atau 100 sehari (Gmail biasa). Kebenaran menghantar e-mel diminta semasa menjalankan menu kali pertama.
- Pautan web app terbuka kepada umum tetapi hanya menunjukkan skrin log masuk tanpa kod sah.

## Admin memberi markah bagi pihak panel

- **Tab Panel > "Nilai bagi panel"**, atau **tab Keputusan > klik pemohon > "Isi markah" / "Lihat / sunting"** bagi seorang panel.
- Admin masuk ke paparan penilaian panel itu (dengan banner "Mod admin") dan memberi tahap, markah dan catatan seperti panel. Markah disimpan **atas nama panel itu** dan dikira dalam purata dan ranking.
- Rekod ditanda "diisi oleh admin" (lajur `DiisiOleh`, lencana "admin" dalam Keputusan) dan direkodkan dalam sheet `Log`.
- Penilaian yang sudah dihantar mesti dibuka semula dahulu ("Buka semula untuk disunting"). Admin boleh menilai walaupun sesi sudah ditutup.
- Panel tidak boleh menggunakan fungsi ini.

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
