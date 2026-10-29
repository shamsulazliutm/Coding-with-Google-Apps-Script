# Penilaian Permohonan Student Mall & SUB (UTMPreneur · UTMXCITE)

Web app Google Apps Script dengan rekod disimpan dalam Google Sheets.

## Fail (hanya dua)

| Fail | Isi |
|---|---|
| `Code.gs` | Pelayan: pengesahan peranan, API panel dan admin, mesyuarat dan agenda, borang pelajar, pengiraan keputusan, serta penyediaan sheet dan data awal |
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

Tiada akaun Google/Gmail diperlukan untuk masuk ke sistem.

**Kaedah utama: e-mel kemudian OTP** (satu skrin, dua medan dan dua butang)
1. Pengguna memasukkan **e-mel** yang didaftarkan dalam sheet `Panel` (atau e-mel admin), kemudian menekan **Hantar / Hantar Semula Kod**.
2. Sistem menghantar **kod OTP 6 digit** ke e-mel itu. Kod sah 10 minit. Butang hantar semula dikunci 60 saat.
3. Pengguna memasukkan kod dan menekan **Sahkan dan Log Masuk**. Sesi 6 jam kekal walaupun tab ditutup. Butang **Log keluar** menamatkan sesi.
- Skrin memberi jawapan yang sama sama ada e-mel berdaftar atau tidak, supaya senarai panel tidak terdedah.
- Had: 3 permintaan kod bagi satu e-mel dalam 10 minit, 5 cubaan salah bagi satu kod, dan kod hanya sekali guna.

**Kaedah tambahan: kod 8 digit daripada admin (tanpa e-mel)**
- Admin buka tab **Panel**, kemudian **Jana kod semua panel** atau **Jana OTP** pada satu baris. Kod dihantar ke e-mel panel (boleh dimatikan) dan dipaparkan sekali kepada admin untuk disalin.
- Panel mengosongkan medan e-mel dan menaip kod 8 digit itu pada ruang **Kod OTP**, kemudian menekan **Sahkan dan Log Masuk**.
- Kod sekali guna, sah 48 jam (`CODE_TTL_HOURS`), disimpan sebagai hash. Had 30 cubaan salah dalam 10 minit bagi seluruh kaedah ini, dan menu Sheet **Penilaian > Buka kunci log masuk** membukanya semula.
- Menu Sheet **Penilaian > Jana kod OTP admin** sedia untuk pemulihan jika e-mel tidak diterima.

Peranan disemak semula pada setiap permintaan, jadi panel yang dinyahaktifkan terus ditolak. Panel bukan @utm.my juga boleh menilai kerana tiada akaun Google diperlukan. Kuota e-mel Apps Script: 1,500 sehari (Workspace) atau 100 sehari (Gmail biasa). Kebenaran menghantar e-mel diminta semasa menjalankan menu kali pertama.

## Admin memberi markah bagi pihak panel

- **Tab Panel > "Nilai bagi panel"**, atau **tab Keputusan > klik pemohon > "Isi markah" / "Lihat / sunting"** bagi seorang panel.
- Admin masuk ke paparan penilaian panel itu (dengan banner "Mod admin") dan memberi tahap, markah dan catatan seperti panel. Markah disimpan **atas nama panel itu** dan dikira dalam purata dan ranking.
- Rekod ditanda "diisi oleh admin" (lajur `DiisiOleh`, lencana "admin" dalam Keputusan) dan direkodkan dalam sheet `Log`.
- Penilaian yang sudah dihantar mesti dibuka semula dahulu ("Buka semula untuk disunting"). Admin boleh menilai walaupun sesi sudah ditutup.
- Panel tidak boleh menggunakan fungsi ini.

## Tab Laporan (PDF)

Admin boleh memuat turun laporan PDF A4 dengan **logo UTM dan UTMXCITE pada kepala setiap halaman**.

| Format | Kandungan |
|---|---|
| Ringkasan keputusan (melintang) | Maklumat sesi, jadual ranking semua pemohon (markah P1–Pn, dinilai, purata, layak, status akhir), senarai panel dan ruang tandatangan "Disediakan oleh" / "Disahkan oleh" |
| Terperinci setiap pemohon (menegak) | Satu halaman bagi setiap pemohon: maklumat pelajar (No. KP bertopeng), markah mengikut kriteria dan panel, purata, jumlah, keputusan, serta catatan panel (boleh dimatikan) |
| Laporan lengkap | Ringkasan diikuti halaman terperinci semua pemohon dalam satu fail |

**Laporan Jawatankuasa (JPPPDKP)** mengikut templat rasmi `draf_laporan.docx`: 1 Tujuan, 2 Pelantikan Jawatankuasa (surat, keanggotaan), 3 Pemerhatian (sidang, bilangan permohonan, **Jadual 1** markah dan ranking), **4 Analisis**, 5 Syor, dan tandatangan setiap ahli.
Perkara 4 dijana automatik daripada data sistem (catatan panel tidak dimasukkan supaya laporan ringkas): **4.1** kelayakan asas (CGPA minimum, pelan perniagaan, SSM; Jadual 2), **4.2** kaedah penilaian dan rubrik (Jadual 3), **4.3** analisis markah dan kriteria paling kukuh/lemah (Jadual 4), **4.4** kesepakatan panel tentang kelayakan (Jadual 5). Perkara 5 memaparkan **Jadual 6: Syor Jawatankuasa** (Bil, Nama Pemohon, Syor: Diluluskan / Tidak diluluskan / Belum diputuskan) berdasarkan **Status akhir** dalam tab Keputusan. Pengerusi lalai ialah PM. Dr. Syed Norris Hikmi Syed Abdullah (`CHAIR_DEFAULT` dalam `Index.html`), ditanda "Pengerusi" dalam tab Panel dan dikecualikan daripada senarai Ahli; boleh ditukar dalam borang. **Syor tambahan (5.2)** boleh lebih daripada satu: tambah atau buang baris dalam borang, dicetak sebagai (i), (ii), (iii). Pelantik jawatankuasa (para 2.1) lalai ialah Timbalan Naib Canselor Hal Ehwal Pelajar dan Alumni dan boleh ditukar dalam borang. Bil laporan, tarikh, masa dan tempat bersidang diambil daripada rekod mesyuarat (tab Mesyuarat). Butiran pelantikan (surat, pengerusi, jawatan, CGPA minimum) sama bagi semua mesyuarat dan disimpan dalam sheet `Tetapan`; syor tambahan disimpan bagi setiap mesyuarat.

**Panel dalam laporan:** semua format hanya memaparkan panel yang telah memberi markah (penilaian dihantar), dinomborkan semula P1, P2, ... tanpa jurang. Dalam laporan jawatankuasa, ahli dan ruang tandatangan mengikut panel itu, manakala Pengerusi sentiasa disenaraikan walaupun tidak memberi markah.

Pilihan: tapis jenis (Student Mall / SUB) dan pilih satu pemohon. Kaki halaman memaparkan tarikh jana, nama admin dan "Halaman x / y". Hanya penilaian yang dihantar dikira. Jana laporan direkodkan dalam `Log`.

PDF dijana dalam pelayar menggunakan jsPDF 2.5.1 dan jspdf-autotable 3.8.2 yang dimuat daripada cdnjs, jadi sambungan internet diperlukan. Jika muat turun disekat oleh pelayar, gunakan **Buka dalam tab baharu** kemudian simpan.

## Permohonan dan mesyuarat berbilang

Semua maklumat disimpan. Pemohon tidak terikat kepada satu mesyuarat; urusetia menentukan mesyuarat mana yang menilai setiap pemohon.

**1. Pelajar memohon** melalui borang awam (tiada log masuk): pautan web app dengan `?page=mohon` (cth. `https://script.google.com/macros/s/.../exec?page=mohon`), atau pautan "Isi borang permohonan" pada skrin log masuk.
- Pelajar mengisi jenis permohonan (Student Mall / SUB), maklumat perniagaan, maklumat pelajar (sehingga 4 bagi SUB: nama, matrik, No. KP, tahun, fakulti, kursus, CGPA, e-mel, telefon) dan memuat naik pelan perniagaan (PDF, maksimum 8 MB) atau memberi pautan https.
- Rekod disimpan dengan Sumber = Pelajar, dan **belum masuk mana-mana mesyuarat**. Pelajar menerima no. rujukan (PM-0007) melalui skrin dan e-mel; admin menerima e-mel pemberitahuan.
- **Templat pelan perniagaan:** pautan dibaca daripada sel **B15** dalam sheet `Tetapan` (A15 ialah label `TemplatPelan`). Jika sel itu mengandungi pautan https, borang pelajar memaparkan butang "Muat turun templat" pada bahagian Pelan perniagaan. Kosongkan sel itu untuk menyembunyikan butang. Tukar pautan pada bila-bila masa tanpa mengubah kod.
- **Folder simpanan pelan:** dibaca daripada sel **B16** dalam sheet `Tetapan` (A16 ialah label `FolderPelan`). Tampal pautan folder Drive (atau ID folder) di situ dan semua pelan yang dimuat naik pelajar disimpan dalam folder itu. Jika B16 kosong, sistem mencipta folder "Pelan Perniagaan UTMXCITE" dalam Drive pemilik skrip dan menulis pautannya ke B16. Jika pautan tidak sah atau folder tidak boleh diakses, folder lalai digunakan dan perkara itu dicatat dalam `Log`. Pemilik skrip mesti mempunyai hak menyunting folder itu.
- Setiap fail ditetapkan "sesiapa yang mempunyai pautan boleh melihat" supaya panel boleh membukanya. Jika dasar domain menyekatnya, permohonan tetap disimpan dan perkara itu dicatat dalam `Log`; kongsi folder kepada panel secara manual.
- Perlindungan: pengesahan di pelayan bagi setiap medan, semakan permohonan berganda (matrik + nama perniagaan), had 60 penghantaran sejam, medan perangkap bot, dan pengesahan fail PDF. Identiti pelajar tidak disahkan, jadi urusetia menyemak sebelum memasukkan ke mesyuarat.

**2. Urusetia menentukan mesyuarat** (tab Permohonan): tapis "Belum dijadualkan", tanda satu atau lebih pemohon, pilih mesyuarat dan tekan **Masukkan ke mesyuarat**. Pemohon yang sudah dinilai dalam Bil 1 (contohnya "Belum diputuskan" atau tidak lulus) boleh dibawa semula ke Bil 2: penilaian Bil 1 kekal sebagai sejarah dan Bil 2 bermula dengan penilaian kosong.

**3. Mesyuarat** (tab Mesyuarat): cipta mesyuarat baharu (bermula sebagai Draf, tidak kelihatan kepada panel), tetapkan bil laporan, tarikh, masa dan tempat, susun agenda dan slot masa.
- **Hanya satu mesyuarat dibuka kepada panel pada satu masa.** Tutup Bil 1 dahulu sebelum membuka Bil 2. Selepas ditutup, Bil 1 terkunci dan dianggap selesai.
- Panel hanya nampak pemohon dalam agenda mesyuarat yang sedang dibuka. Jika tiada mesyuarat dibuka, panel melihat mesej menunggu.
- Penilaian, markah purata, ranking, status akhir dan syor tambahan disimpan **bagi setiap mesyuarat**. Pemilih "Mesyuarat" di menu sisi menukar paparan Dashboard, Keputusan, Rubrik dan Laporan.
- Pemohon yang sudah dinilai dalam sesuatu mesyuarat tidak boleh dikeluarkan daripada agendanya.
- Tab Keputusan dalam Sheet menyatukan semua mesyuarat dengan lajur "Mesyuarat".

**Naik taraf daripada versi satu mesyuarat:** jalankan menu **Penilaian > Sediakan sheet** sekali. Sheet Agenda dicipta, mesyuarat sedia ada menjadi Bil 1, semua pemohon sedia ada dimasukkan ke agenda Bil 1, dan penilaian lama dipautkan kepada Bil 1. Tiada data hilang. Google akan meminta kebenaran baharu (Drive, untuk muat naik pelan) selepas Deploy versi baharu.

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
- Hanya penilaian yang telah **dihantar** ("Hantar skor & kunci") dikira dalam purata dan ranking. Draf ditunjukkan sebagai "draf" tetapi tidak dikira. Tab Keputusan memaparkan status setiap panel (dihantar/draf) dan dimuat semula automatik setiap 30 saat; butang **Muat semula** mengemas kini serta-merta.
- Output ke sheet `Keputusan` dikemas kini automatik apabila penilaian dihantar, dibuka semula atau status akhir ditukar.
- Rubrik disimpan mengikut versi. Versi baharu hanya boleh digunakan oleh sesi jika belum ada penilaian dihantar.
- Semua suntingan penting direkodkan dalam sheet `Log`.

## Logo

Tetapkan `LOGO_URL` di atas `Code.gs` kepada URL atau `data:` URI imej logo UTM/UTMXCITE. Jika kosong, logo teks sementara digunakan.

## Data

Dalam `Code.gs` (fungsi `setupSheets`), 6 permohonan (Marzmell, Nanel, Cheval, Voltro, The Cube, Majora) dan pautan pelan perniagaan Drive diisi awal daripada fail penilaian sedia ada. Marzmell ialah SUB dengan dua pelajar.

## Kemas kini daripada versi lama

Sheet `Penilaian` versi lama dilanjutkan secara automatik dengan lajur `Catatan1`–`Catatan6` apabila sistem dibuka. Data lama tidak terjejas.
