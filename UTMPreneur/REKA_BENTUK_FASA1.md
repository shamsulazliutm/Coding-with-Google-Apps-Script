# UTMPreneur: Reka Bentuk Fasa 1 (untuk semakan)

Status: **reka bentuk fasa 1 lengkap, menunggu arahan mula membina. Belum ada kod.** Dihasilkan daripada perbincangan dan borang lama yang dikongsi.
Platform: Google Apps Script (web app) + Google Sheets. Pemilik skrip dan penghantar OTP: `utmxcite@utm.my`.

Tanda: **[LALAI]** = andaian saya yang belum disahkan Tuan. **[TERBUKA]** = perlu keputusan.

---

## 1. Prinsip

1. **Isi sekali, guna di mana-mana.** Pelajar tidak menaip semula data yang sudah ada dalam `PELAJAR`, profil atau SSU.
2. **Satu modul, satu spreadsheet**, ditambah spreadsheet **Induk**. Semua pautan fail dan folder didaftar dalam tab `Link_Dokumen` (Induk). Kod hanya merujuk **Kod**, bukan URL.
3. **Pelajar tidak menyentuh spreadsheet.** Semua capaian melalui web app. Peranan disemak di **server**, bukan di antara muka.
4. **Rujukan dan kadar boleh diubah urusetia tanpa mengubah kod** (`Rujukan`, `KADAR`, `PERALATAN`, `ALAT`, `Lot`, `Tetapan`).
5. Setiap tindakan penting direkod dalam `Audit` (siapa, bila, nilai lama dan baharu).
6. Sheet KPI membaca spreadsheet ini (`IMPORTRANGE` atau GAS). Hanya data berstatus rasmi (contohnya laporan **Diterima**) dikira.

---

## 2. Pengguna dan akses

| Peranan | Dikenal pasti melalui | Akses |
|---|---|---|
| **Pelajar** | Emel UTM, No. Matrik dalam `PELAJAR` | Profiling (terbuka); SSU (perlu profil lengkap); Ruang Niaga (perlu SSU Diluluskan); Kewangan (usahawan SSU); Makerspace |
| **Staf** | Emel `@utm.my`, isi sendiri kali pertama (No. Staf, jabatan, telefon) | **Makerspace sahaja** |
| **Orang luar** | Mana-mana emel, daftar sendiri (nama, No. KP/pasport, telefon, organisasi) | **Makerspace sahaja** |
| **Admin Penuh** | Tab `Admin`; `utmxcite@utm.my` (dikunci) | Semua, urus admin, `Tetapan`, `Rujukan`, kadar; lihat data sensitif |
| **Pegawai Modul** | Tab `Admin` + senarai modul | Kelulusan dan pengurusan modul yang ditetapkan sahaja |
| **Pemerhati** | Tab `Admin` | Baca sahaja (dashboard, laporan) |
| **Penilai** | Tab `Admin` (staf `@utm.my`, didaftar admin) | Hanya menskor permohonan lot yang ditugaskan dalam sesi penilaian; tidak boleh meluluskan atau mengubah kadar |

- Admin **boleh meluluskan permohonan sendiri**; rekod `Audit` ditanda "Kelulusan sendiri".
- Penyelia pelajar (perakuan Makerspace) **tidak perlu akaun**; mereka bertindak melalui pautan sekali guna.

### Rantaian kelayakan pelajar
`Log masuk` → `Profiling` (terbuka) → `SSU` (memerlukan profil lengkap) → `Ruang Niaga` (memerlukan SSU Diluluskan). Laporan kewangan: semua perniagaan SSU Diluluskan.

---

## 3. Log masuk (emel + OTP)

1. Pengguna masukkan emel → OTP 6 digit dihantar (`MailApp`, hash dalam `CacheService`, tamat 5 minit, had percubaan).
2. Kali pertama pelajar: masukkan **No. Matrik** → sistem semak `PELAJAR` (emel mesti sepadan, atau No. Matrik dikunci kepada emel pertama yang menuntutnya) → pasangan emel ↔ No. Matrik disimpan dalam `Pengguna`.
3. Staf dan orang luar: borang daftar ringkas pada kali pertama.
4. Token sesi disimpan; setiap panggilan menyemak token dan peranan.
5. Kawalan: had OTP bagi setiap emel (cth 3/jam), had global harian, mesej generik (tidak mendedahkan emel berdaftar), admin boleh menyekat akaun.

---

## 4. Spreadsheet dan tab

### SS_INDUK
| Tab | Isi |
|---|---|
| `PELAJAR` | Data rasmi pelajar, **diimport pihak Tuan**. Identiti dikunci. Medan semester (`Tahun_Pengajian`, `Program`, `Fakulti`, `Bidang_Pengajian`, `Status_Pelajar`) dan hubungan (`No_Telefon`, `Alamat_Kolej`, `Alamat_Rumah`) boleh dikemas kini pelajar melalui aplikasi |
| `Pengguna` | Emel ↔ No. Matrik, peranan, staf/luar: nama, No. Staf atau No. KP, telefon, jabatan/organisasi, status (Aktif/Disekat), log masuk terakhir |
| `Perniagaan` | Dicipta apabila SSU diluluskan: `ID_Perniagaan`, nama, kluster, no. SSM, pemilik |
| `Link_Dokumen` | `Kod`, `Jenis` (Spreadsheet/Folder/Dokumen/Templat), `Modul`, `Nama`, `URL`, `ID` (auto), `Status`, `Catatan` |
| `Tetapan` (+ sub-bahagian `Admin`) | Parameter sistem (tarikh semester, selang peringatan, had OTP, dan lain-lain). `Admin`: emel, nama, peranan, modul, aktif |
| `Rujukan` | Senarai pilihan: fakulti, bidang, kluster perniagaan, sumber pembiayaan, pemberi dana, produk/perkhidmatan, negeri, dan lain-lain |
| `Audit` | Log semua tindakan penting |
| `Peringatan` | Log emel peringatan yang dihantar |

**Lajur `PELAJAR` yang dicadangkan:** `No_Matrik` (unik), `Nama_Penuh`, `Emel`, `No_KP_Pasport`, `Jantina`, `Etnik`, `Kewarganegaraan`, `Fakulti`, `Program`, `Bidang_Pengajian`, `Tahun_Pengajian`, `No_Telefon`, `Alamat_Kolej`, `Alamat_Rumah`, `Status_Pelajar`, `Sesi_Kemasukan`.
Import mempunyai semakan: No. Matrik pendua, emel tidak sah, nilai tidak sepadan `Rujukan`.

### SS_PROFILING
| Tab | Isi |
|---|---|
| `Profil` | Satu baris bagi setiap pelajar bagi setiap sesi/semester (sejarah): telefon, kampung halaman/negeri, keluarga berniaga?, pernah berniaga?, jenis (kluster), tempoh, motivasi, berminat berniaga?, jenis diminati (kluster + Lain-lain), mahu berniaga di kampus (Ya/Tidak/Mungkin), aliran pilihan |
| `Perniagaan_Keluarga` | `ID_Profil`, hubungan, jenis perniagaan, tempoh (menggantikan Q9 dan Q10 lama) |

### SS_SSU
| Tab | Isi |
|---|---|
| `Permohonan_SSU` | `ID_Permohonan`, **`Jenis_SSU` (Perniagaan / Startup pembangunan produk-inovasi; lalai Perniagaan, ditambah dalam fasa 1 supaya tiada migrasi kemudian)**, No. Matrik pemilik, nama perniagaan (HURUF BESAR), produk/perkhidmatan (berbilang), syarat subjek (UBSS1032 / ULRS3032 / **MFMS1143** / SBSF1023 / Tiada / Lain-lain) + pensyarah/seksyen/kumpulan, status SSM (Ya/Tidak/Dalam proses), sijil SSM + maklumat SSM (jika Ya), jenis perniagaan, kluster, sumber pembiayaan, modal permulaan (RM tepat), pendapatan kasar bulanan (RM tepat), alamat perniagaan, tarikh mula, laman/media sosial, bil. rakan kongsi, **status**, tarikh keputusan, catatan admin, no. sijil, pautan sijil PDF |
| `Ahli_Pasukan` | `ID_Permohonan`, **No. Matrik** rakan kongsi + salinan butiran semasa hantar. **Hanya pelajar UTM**; **had 12 ahli keseluruhan termasuk pemilik** (disahkan; selaras sijil yang memuatkan 12 nama; had dalam `Tetapan`); butang "Tambah rakan kongsi" dilumpuhkan apabila had dicapai |

Status: Baharu / Disemak / Diluluskan / Ditolak / Perlu Pembetulan. 

**Sijil SSU (disahkan):** dijana sebagai PDF selepas kelulusan admin daripada **templat dalam folder Google Drive** (didaftar dalam `Link_Dokumen`: `FLD_TEMPLAT_SIJIL`, `FLD_SIJIL_SSU`). Templat dibaca pada masa penjanaan, tidak ditetapkan dalam kod; tandatangan, logo dan bingkai ialah sebahagian templat.
- Tajuk templat: *Perakuan Pendaftaran Syarikat Pemula Pelajar, Universiti Teknologi Malaysia* (BM sahaja, mengikut templat Tuan).
- **No. pendaftaran:** `XCITE-{tahun}S{5 digit}`, contoh `XCITE-2026S00001`, jujukan berasingan bagi setiap tahun. **Pembaharuan (disahkan): nombor asal (tahun dan jujukan) dikekalkan, dengan akhiran 2 digit yang menunjukkan kali ke berapa sijil dikeluarkan.** Sijil asal `XCITE-2026S00001-01` (kali pertama dikeluarkan), pembaharuan pertama `-02`, kedua `-03`. Akhiran sentiasa ada.
- **Had 12 ahli keseluruhan (termasuk pemilik)**, jadi semua nama muat pada sijil.
- Penanda dalam templat: `{{NAMA_PERNIAGAAN}}`, `{{NO_PENDAFTARAN}}`, `{{TARIKH_PENDAFTARAN}}`, `{{ALAMAT_PERNIAGAAN}}`, `{{KOD_SUBJEK}}` (jika berkaitan; jika tiada, `-`), `{{SENARAI_AHLI}}` (semua ahli termasuk pemilik, bernombor), `{{JUMLAH_AHLI}}`, `{{TEMPOH_SAH_LAKU}}`.
- **Tempoh sah laku (disahkan): satu tahun dari tarikh pendaftaran** (`{{TEMPOH_SAH_LAKU}}` = tarikh pendaftaran + 1 tahun). Peraturan pembaharuan dan kesan tamat tempoh: lihat bahagian 8, perkara 13.
- Penandatangan dalam templat: Pengarah UTMXCITE. Tiada kod QR.
- Penanda tidak dikenali: dibiarkan kosong dan admin diberi amaran.
Semakan automatik: tiada "UTM" pada nama atau alamat; alamat bukan kolej/fakulti; satu permohonan aktif bagi setiap pelajar; No. Matrik rakan kongsi wujud dan tidak pendua; pemilik bukan rakan kongsi dalam permohonan yang sama.

### SS_RUANG_NIAGA
| Tab | Isi |
|---|---|
| `Lot` | `Kod_Lot` (unik), lokasi/blok, saiz, jenis (F&B/Retail/Lain-lain), kadar sewa, `Status_Buka` (Dibuka/Ditutup), `Status_Lot` (Kosong/Dipohon/Disewa/Penyelenggaraan), catatan, didaftar oleh. **Diisi awal dengan 15 lot:** `SM-01`..`SM-10` (Student Mall Lot 1-10), `SUB-01`..`SUB-05` (SUB Lot 1-5). `Status_Buka` awal = Ditutup; kadar kosong |
| `Permohonan_Lot` | Pemohon (melalui `ID_Perniagaan`), lot dipilih, tempoh sewa dipohon, F&B (vaksin kepialu, kursus pengendali makanan; **hanya direkod, bukan syarat**) + lampiran pilihan, sumber pembiayaan, pemberi dana, jumlah dana, jangkaan jualan bulanan, bil. pekerja, **cadangan perniagaan (wajib, PDF)**, sebab berniaga, lokasi dirancang, status, keputusan admin |
| `Sewaan` | `ID_Sewaan`, lot, `ID_Perniagaan`, kadar, tarikh mula/tamat, status (Aktif/Tamat). **Admin boleh daftar sewaan sedia ada** melalui borang khas |
| `Bayaran_Sewa` | Satu baris bagi setiap lot setiap bulan: jumlah, tarikh akhir (10hb), status (Belum Bayar / Menunggu Pengesahan / Dibayar / Lewat / Dikecualikan), tarikh bayar, kaedah, no. rujukan, resit, disahkan oleh |
| `Rubrik` | **Satu rubrik** untuk semua permohonan (jumlah 100): Organisasi Keseluruhan 10; Kandungan Pelan Perniagaan 20; Penerangan Perniagaan 20; Kebolehpasaran Produk/Perkhidmatan 20; Inovasi 20; Pengurusan Kewangan 10. Setiap kriteria: sub-perkara, huraian tahap 5/3/1 (draf, BM + *English*). **Skala 5 tahap** (Cemerlang 100%, Baik 80%, Memuaskan 60%, Kurang 40%, Lemah 20%) yang mengisi markah secara automatik; **panel boleh melaras markah** dalam julat tahap (disahkan). Kriteria 2 ada senarai semak 7 elemen yang mencadangkan tahap. Diisi awal; diubah urusetia; versi disimpan bersama sesi. **[LALAI]** huraian tahap ialah draf untuk disemak jawatankuasa |
| `Sesi_Penilaian` | Tarikh, tempat, status (Dirancang / Berjalan / Ditutup), versi rubrik, senarai penilai, senarai permohonan disenarai pendek **dengan slot pembentangan** (masa bagi setiap pemohon) |
| `Skor_Penilaian` | Satu baris bagi setiap penilai x permohonan x kriteria: markah (dihadkan pada maksimum), ulasan, masa hantar, dikunci. Jumlah /100 dikira automatik |

Peraturan: hanya SSU Diluluskan; pelajar nampak lot Dibuka + Kosong sahaja; **satu lot bagi satu pelajar/perniagaan** (semakan atas No. Matrik pemilik dan rakan kongsi); permohonan lain dibenarkan jika terdahulu Ditolak/Dibatalkan/Tamat; kelulusan menukar `Status_Lot` kepada Disewa dan mencipta `Sewaan`. Q35/Q36 lama (kad matrik, salinan IC) dibuang.

**Surat tawaran, setuju terima dan perjanjian (tambahan, disahkan sebagai keperluan):**
- Selepas admin memutuskan **Diluluskan**, sistem menyediakan **surat tawaran** (PDF dijana daripada templat dalam Drive, didaftar dalam `Link_Dokumen`: `TEMPLAT_SURAT_TAWARAN`), kemudian **setuju terima** oleh pemohon, kemudian **perjanjian sewa** (templat `TEMPLAT_PERJANJIAN_SEWA`).
- **Pemohon melihat semua dokumen ini dalam tab Ruang Niaga mereka dan boleh memuat turunnya bila-bila masa** (surat tawaran, rekod penerimaan, perjanjian, termasuk versi lama). Muat turun melalui pelayan kerana fail dimiliki akaun UTMXCITE.
- Tab baharu `Dokumen_Sewaan` dalam `SS_RUANG_NIAGA`: `ID_Dokumen`, `ID_Permohonan`, `ID_Sewaan`, `Jenis` (Surat Tawaran / Penerimaan / Perjanjian / Perjanjian Bertandatangan), `Versi`, `Fail`, `Tarikh`, `Dijana_Oleh`, `Status`. Status permohonan lot ditambah: Ditawarkan, Diterima, Perjanjian, Sewaan Aktif (dan Tawaran Luput / Ditolak Pemohon).
- **Paparan dokumen (rujukan contoh daripada Tuan, ilustrasi `11` dan `12`):** tab Ruang Niaga memaparkan kad **Penerimaan tawaran** ("Tawaran telah diterima pada <tarikh masa>") dan kad **Dokumen penyertaan** (senarai bernombor: Surat Tawaran, Rekod Penerimaan, Perjanjian Sewa, dan dokumen lain yang dimuat naik admin). Klik nama dokumen membuka **PDF dalam tab baharu**; muat turun melalui paparan PDF bila-bila masa. Pelaksanaan: pelayan mencipta **pautan sekali guna tamat dalam 5 minit** yang membuka halaman paparan PDF (tidak mendedahkan fail Drive).
- **Perjanjian (disahkan): dicetak, ditandatangani, salinan bertandatangan dimuat naik oleh pemohon dan disahkan admin.** Status dokumen: Menunggu salinan bertandatangan -> Dimuat naik -> Disahkan (atau Dikembalikan dengan catatan).
- **Surat tawaran (disahkan): admin menyemak pratonton dahulu, kemudian menekan "Hantar surat tawaran".** Sistem menjana pratonton PDF; hanya selepas admin menghantar, dokumen kelihatan kepada pemohon dan emel pemberitahuan dihantar. Admin boleh menjana semula (versi baharu) sebelum menghantar.
- **Tempoh menerima tawaran (disahkan): 7 hari** dari tarikh surat tawaran dihantar (`TAWARAN_TEMPOH_HARI` dalam `Tetapan`). Peringatan emel pada hari ke-4 dan ke-6. **[LALAI]** jika tamat tanpa jawapan: status **Tawaran Luput**, lot kembali Kosong, admin dimaklumkan dan boleh menawar pemohon seterusnya mengikut kedudukan.
- **Setuju terima (disahkan): pemohon menekan "Saya terima" atau "Saya tolak" dalam sistem, disahkan dengan OTP ke emel mereka.** Sistem merekod tarikh, masa dan emel, lalu menjana **Rekod Penerimaan Tawaran (PDF)** yang dipaparkan dalam senarai dokumen ("Tawaran telah diterima pada <tarikh masa>"). Penerimaan tidak boleh ditarik balik oleh pemohon (hanya admin boleh membatalkan, direkod dalam `Audit`).
- **Siapa boleh melihat dokumen (disahkan): pemilik dan semua ahli pasukan SSU, baca dan muat turun sahaja.** Hanya pemilik boleh menekan Saya terima/Saya tolak dan memuat naik salinan perjanjian bertandatangan. Akses disemak di pelayan melalui `Perniagaan` dan `Ahli_Pasukan` setiap kali dokumen dibuka; pautan paparan sekali guna dikaitkan dengan pengguna yang memintanya.
- **[TERBUKA]** bila sewaan bermula dan penanda templat (menunggu contoh surat tawaran dan perjanjian).

**Penilaian jawatankuasa (disahkan):**
- Permohonan dikumpul dalam **tempoh tertentu** (tarikh buka dan tutup ditetapkan admin dalam `Tetapan`/`Lot`), kemudian dinilai dalam satu sesi.
- Aliran: Baharu -> Disemak (kelayakan) -> Disenarai pendek -> **Pembentangan dan penilaian** -> Dinilai -> admin memutuskan Diluluskan/Ditolak -> **Surat tawaran -> Setuju terima -> Perjanjian** -> `Sewaan` dicipta.
- **Pemohon hadir membentang.** Sistem menghantar jemputan emel (tarikh, tempat, slot masa) kepada pemohon yang disenarai pendek.
- **Penilai** menskor secara bebas dan tidak melihat skor penilai lain sehingga sesi ditutup. Skor dikunci selepas Hantar (admin boleh membuka semula, direkod dalam `Audit`).
- Antara muka penilai (cadangan): satu skrin, jumlah /100 serta-merta, ulasan pantas, simpan draf automatik, berfungsi pada telefon/tablet; admin ditanda jika skor dua penilai berbeza jauh bagi pemohon sama.
- Skrin penilai: maklumat calon diisi automatik (nama, No. Matrik, No. KP, tahun, fakulti, kursus, nama syarikat/No. SSM, jenis perniagaan) + pautan **cadangan perniagaan**.
- Apabila sesi ditutup: purata skor dan **kedudukan** dipaparkan. **Admin memutuskan selepas melihat kedudukan; tiada skor minimum dan tiada kelulusan automatik.**
- Pemohon tidak melihat skor; hanya keputusan (dan ulasan ringkas jika admin mahu).
- Pertindihan lot diselesaikan oleh penilaian jawatankuasa.

### SS_KEWANGAN
| Tab | Isi |
|---|---|
| `Laporan_Bulanan` | Kunci: `ID_Perniagaan` + bulan + tahun. Pendapatan, perbelanjaan, **untung (dikira)**, fail laporan (wajib bagi penyewa lot; pilihan lain), "Tiada aktiviti bulan ini", sewa peralatan UTMXCITE (dipaut ke `Bayaran_Makerspace`), pautan ke `Bayaran_Sewa` (jika ada lot), perakuan, tarikh hantar, status, catatan semakan |

Semua perniagaan SSU Diluluskan melapor **bulanan, sebelum atau pada 7hb bulan berikutnya**. Status: Belum Dihantar / Dihantar / Lewat / Perlu Pembetulan / Diterima. Admin menyemak (**Terima** atau **Perlu Pembetulan** dengan catatan). Laporan Diterima dikunci. Hanya Diterima dikira dalam KPI rasmi. Templat laporan: pautan dalam `Link_Dokumen` (`TEMPLAT_LAPORAN_KEWANGAN`).

### SS_TEMPAHAN_RUANG (Makerspace)
| Tab | Isi |
|---|---|
| `Tempahan` | Baris umum: pemohon (pelajar/staf/luar), jenis (Ruang / Laser Cut / 3D Printer / Pinjaman Peralatan), sumber, tarikh/masa mula dan tamat, tujuan, status, perakuan, kelulusan |
| `Butiran_Ruang` | Tujuan/program, bil. hari, peserta (≤ kapasiti), kaedah bayaran (Tunai / Invois Dalaman / Lain-lain), VOT/cajline (no. VOT, nama staf kewangan, telefon), lampiran |
| `Item_Peralatan_Ruang` | Peralatan tambahan dan kuantiti |
| `Butiran_LaserCut` | Nama projek, jenis bahan, masa dijangka dan sebenar |
| `Butiran_3DP` | Nama projek, gambar, berat, warna, no. mesin, masa |
| `Item_Pinjaman` | Alat, kuantiti, tarikh dijangka pulang, tarikh pulang sebenar, status |
| `ALAT` | Stok alat dipinjam: kod, nama, kategori, kuantiti jumlah, rosak/hilang, boleh dipinjam, aktif. **Kosong; diisi urusetia** |
| `PERALATAN` | Mesin dan ruang yang ditempah: kod, jenis (3D Printer/Laser Cut/**Ruang**), no. mesin, model, kapasiti, kod kadar, status. **Kosong; diisi urusetia** |
| `KADAR` | Kod sumber, nama, jenis pengguna (Pelajar/Staf/Luar), unit, kadar RM, berkuat kuasa, aktif. **Diisi awal** daripada borang: caj perkhidmatan ruang RM150 (per tempahan), Laser Cut RM1/5 minit, flip chart RM10, white board RM20, speaker+mic RM50, beanie bag RM5, meja panjang RM5, kerusi plastik/bankuet RM5; projektor, skrin, PA, meja biasa, kerusi = percuma. Kadar sewa Maker Lab/Bilik Mesyuarat, extension wire, 3D Printer (dua baris: per gram, per jam) **kosong** |
| `Bayaran_Makerspace` | Anggaran kos, penggunaan sebenar, kos sebenar, status (Belum Bayar / Menunggu Pengesahan / Dibayar / Dikecualikan), resit |
| `Laporan_Aktiviti` | Laporan selepas aktiviti ruang (dalam 3 hari) |

Alur: **pelajar** → penyelia/pensyarah memperakui melalui pautan (emel `@utm.my`, OTP, bukan emel pemohon) → admin meluluskan. **Staf dan orang luar** → admin memperakui dan meluluskan dalam satu langkah. Perakuan diperlukan bagi **semua jenis tempahan pelajar**.
Kawalan: semakan konflik masa bagi setiap mesin/ruang; notis 3 hari bekerja bagi ruang; kapasiti ruang; baki stok pinjaman; tempoh pinjaman maksimum satu bulan dengan pembaharuan; bil Lewat Makerspace menyekat tempahan Makerspace baharu (modul berasingan, tiada sekatan silang); laporan aktiviti lewat menyekat tempahan ruang baharu.
Bil dijana selepas sesi, **tarikh akhir 7 hari**, peringatan emel (hari ke-4), Lewat selepas hari ke-7, susulan setiap 3 hari.

---

## 5. Jadual automatik (pencetus masa GAS)

| Bila | Tindakan |
|---|---|
| Harian | Ringkasan harian kepada admin (permohonan baharu, bil dan laporan Lewat, tempahan akan datang). Pembaharuan peringatan |
| **1hb** | Jana baris `Laporan_Bulanan` "Belum Dihantar" + peringatan |
| **5hb** | Jana `Bayaran_Sewa` bulan itu + emel peringatan; peringatan laporan kewangan kedua |
| **7hb** | Laporan kewangan Belum Dihantar menjadi **Lewat** |
| **10hb** | `Bayaran_Sewa` Belum Bayar menjadi **Lewat** |
| Selepas tarikh akhir | Peringatan susulan setiap 3 hari (boleh ditetapkan dalam `Tetapan`) |
| Awal semester | Peringatan kemas kini profil dan data pelajar (peringatan sahaja, tanpa sekatan) |
| Sentiasa | Peringatan pemulangan pinjaman; ingat tempahan akan datang |

---

## 6. Keselamatan dan PDPA

- Semua tab sensitif (`PELAJAR`, `Pengguna`) tidak dibaca terus oleh pelajar. Server memulangkan medan yang diperlukan sahaja.
- No. KP, etnik, alamat: hanya Admin Penuh; paparan separa kepada yang lain.
- Lampiran dalam folder Drive berdaftar (`Link_Dokumen`), diakses melalui server. Jenis dan saiz fail dihadkan.
- Perakuan penyelia: token rawak sekali guna, tamat tempoh, OTP pengesahan; direkod dalam `Audit`.
- Dua peranan pelaksana: skrip berjalan sebagai `utmxcite@utm.my`.

---

## 7. Pemetaan KPI

| Petunjuk | Sumber |
|---|---|
| Bil. usahawan SSU berdaftar (fakulti, jantina, etnik, kluster, tahun) | `Permohonan_SSU` Diluluskan + `PELAJAR` |
| Minat berniaga, aliran pilihan, keluarga berniaga | `Profil` |
| Okupansi dan kutipan sewa | `Lot`, `Sewaan`, `Bayaran_Sewa` |
| Pendapatan, perbelanjaan, untung usahawan; kadar pematuhan laporan | `Laporan_Bulanan` (Diterima) |
| Sesi dan jam penggunaan Makerspace; kutipan Makerspace | `Tempahan`, `Bayaran_Makerspace` |

---

## 8. Keputusan terbuka dan lalai (sila semak)

| # | Perkara | Status |
|---|---|---|
| 1 | Penyewa lot sedia ada: admin mendaftar **SSU sedia ada** (terus Diluluskan, ditanda "Didaftar admin (sedia ada)") melalui borang ringkas, kemudian **sewaan sedia ada** melalui borang "Daftar sewaan sedia ada" | Disahkan |
| 2 | Kadar sewa 15 lot, kadar sewa Maker Lab/Bilik Mesyuarat, kadar 3D Printer, extension wire, kadar bagi staf/luar | Diisi urusetia |
| 3 | Pemulangan pinjaman lewat menyekat pinjaman baharu | **[LALAI]** |
| 4 | Kertas kerja HEPA dan surat permohonan bagi tempahan ruang: kekal dimuat naik (surat penasihat digantikan perakuan sistem) | **[LALAI]** |
| 5 | Bayaran Invois Dalaman (UTM): penanda dan pengesahan admin tanpa resit | Disahkan |
| 6 | Resit inkubator dipaut ke `Bayaran_Makerspace` (tiada muat naik berasingan dalam laporan kewangan); tiada medan tambahan lain dalam laporan | Disahkan |
| 7 | Pautan templat laporan kewangan dan templat sijil SSU (templat sijil diterima; format dan penanda dipersetujui). **[TERBUKA]** peraturan **tempoh sah laku** sijil dan pembaharuan | Separa |
| 8 | Visual: logo UTM + UTMXCITE (diterima); warna maroon UTM dan emas "X" diambil daripada logo; reka bentuk telefon dahulu; logo didaftar dalam `Link_Dokumen` (`LOGO_UTMXCITE`) supaya boleh diganti | Disahkan |
| 9 | Bahasa antara muka: **dwibahasa**. Bahasa Melayu sebagai teks utama, terjemahan English dalam *italik* bersaiz kecil di bawah atau di sebelah label (seperti borang Makerspace lama) | Disahkan |
| 10 | Domain emel: pelajar `@graduate.utm.my`, staf `@utm.my` (disimpan dalam `Tetapan`) | Disahkan |
| 13 | **Pembaharuan SSU** (sijil sah satu tahun): pembaharuan melalui sistem (borang ringkas diisi awal, admin lulus, sijil baharu dengan nombor asal + akhiran kali dikeluarkan); peringatan emel 60, 30 dan 7 hari sebelum tamat; status bertukar **Tamat Tempoh** selepas tarikh itu. **Disahkan:** usahawan yang SSU-nya tamat **masih dibenarkan menyewa lot yang sedang disewa dan melapor kewangan, tetapi PERLU memperbaharui SSU** (peringatan susulan dan sepanduk dalam aplikasi; senarai SSU tamat dalam dashboard admin). **[LALAI]** permohonan lot/kredit baharu disekat sehingga diperbaharui; nombor pendaftaran asal dikekalkan dengan akhiran kali sijil dikeluarkan (-01 asal, -02 pembaharuan pertama, -03 kedua) | **Disahkan:** tiada tempoh tangguh dan tiada tindakan automatik terhadap sewaan; admin memutuskan secara manual |
| 11 | **CGPA tidak diperlukan**: dibuang daripada skrin penilai dan tiada lajur dalam `PELAJAR` | Disahkan |
| 14 | **Skrip persediaan (*setup*) automatik** dalam Drive `utmxcite@utm.my` (disahkan, menggantikan keputusan awal "cipta sendiri"): Tuan hanya mencipta **`SS_INDUK`** dalam folder pilihan Tuan; skrip mencipta **semua spreadsheet lain** (`SS_PROFILING`, `SS_SSU`, `SS_RUANG_NIAGA`, `SS_KEWANGAN`, `SS_TEMPAHAN_RUANG`) dan folder lampiran/sijil/templat **dalam folder yang sama dengan `SS_INDUK`**, menyediakan tab, tajuk lajur dan data awal (15 lot, rubrik, kadar, `Rujukan`), serta mendaftar semuanya dalam `Link_Dokumen`. Selamat dijalankan semula (*idempotent*: yang sudah wujud dilangkau), dan disertai pengesah struktur. `INDUK_ID` disimpan dalam *Script Properties* | Disahkan |
| 15 | **Deploy menggunakan `clasp`**: struktur projek `UTMPreneur/` sedia untuk `clasp push` (`.clasp.json` dengan `scriptId` diisi Tuan, `appsscript.json`, `.claspignore`, folder `src/`), ujian logik setempat dengan Node, dan panduan langkah demi langkah (pasang Node dan clasp, `clasp login` dengan `utmxcite@utm.my`, dayakan Apps Script API, `clasp push`, `clasp deploy`). Web app: *Execute as: Me*, *Access: Anyone* | Disahkan |
| 16 | **Pautan sistem: URL web app Apps Script** (`.../exec`), dipaut oleh Tuan dari laman UTMXCITE. URL disimpan dalam `Tetapan` (`WEBAPP_URL`) dan digunakan dalam emel (OTP, perakuan penyelia, peringatan). Kemas kini kod menggunakan **`clasp deploy --deploymentId`** supaya URL kekal sama | Disahkan |
| 17 | **Persekitaran ujian (disahkan):** satu projek Apps Script **UJI** berasingan daripada **PRODUKSI**, dengan kod sama (dua fail `clasp`: UJI dan PRODUKSI), `INDUK_ID` dan spreadsheet berasingan (skrip persediaan menyokong `MOD=UJI`), dan **data contoh rekaan** (pelajar, SSU, lot, sewaan, laporan, tempahan; tiada data peribadi sebenar). Mod UJI: sepanduk "MOD UJIAN", emel hanya dihantar kepada senarai putih penguji dan ditanda `[UJI]`. Kumpulan perintis diuji sebelum pelancaran | Disahkan |
| 18 | **Sandaran (disahkan):** salinan automatik **mingguan** semua spreadsheet berdaftar ke folder Drive khas (`Sandaran`, dalam folder induk), **simpan 8 salinan terkini** setiap spreadsheet, yang lebih lama dipadam secara automatik. Pencetus masa mingguan; kegagalan dimaklumkan kepada admin; fungsi **pemulihan** manual (salinan sandaran dibuka dan dipulihkan oleh admin). Lampiran dalam folder Drive tidak disalin (hanya spreadsheet) | Disahkan |
| 19 | **Fail muat naik (disahkan):** jenis **PDF, JPG, PNG, Excel (`.xlsx`/`.xls`)**; **maksimum 10 MB** setiap fail (had dalam `Tetapan`). Semakan jenis (sambungan dan MIME) dan saiz dibuat di **server**. Muat naik berbahagian (*chunked*) untuk kebolehpercayaan pada talian lemah. **[LALAI]** sesetengah medan lebih ketat: cadangan perniagaan dan kertas cadangan PDF sahaja; gambar projek 3D JPG/PNG sahaja; laporan kewangan PDF atau Excel; resit PDF/JPG/PNG | Disahkan |
| 20 | **Waktu operasi Makerspace (disahkan):** Isnin hingga Jumaat, 8.00 pagi hingga 5.00 petang; **cuti umum/universiti diisi urusetia dalam `Tetapan`** (tab `Cuti`: tarikh, nama, jenis). Digunakan untuk mengira "3 hari bekerja" notis tempahan ruang dan menyekat slot di luar waktu operasi atau pada hari cuti. Hari dan jam dalam `Tetapan`, boleh diubah. Zon waktu `Asia/Kuala_Lumpur` | Disahkan |
| 12 | Kriteria rubrik dan markah daripada borang penilaian 11 Mei 2026 dijadikan rubrik awal; Tuan boleh ubah dalam tab `Rubrik` | Disahkan |

---

## 9. Pelan pembinaan (cadangan, dalam satu penghantaran, diuji peringkat demi peringkat)

1. **Asas:** projek GAS, `SS_INDUK`, `Link_Dokumen`, `Tetapan`/`Admin`, auth OTP, peranan, `Audit`, import `PELAJAR`.
2. **Profiling** dan kemas kini data pelajar.
3. **SSU** (borang, perakuan data, kelulusan, janaan sijil PDF).
4. **Ruang niaga:** `Lot`, permohonan, `Sewaan` (termasuk daftar sewaan sedia ada), `Bayaran_Sewa`, peringatan.
5. **Kewangan:** laporan bulanan, semakan admin, peringatan.
6. **Makerspace:** `PERALATAN`/`ALAT`/`KADAR`, empat jenis tempahan, perakuan penyelia, konflik masa, bil dan pembayaran.
7. **Dashboard admin** dan ringkasan harian; panduan *deploy*.

---

## 10. Fasa 2 (nota awal, belum direka sepenuhnya)

### Mikro Kredit (`SS_MIKRO_KREDIT`)
Borang lama: 32 soalan. Pemetaan yang dicadangkan:
- **Had pinjaman: minimum RM500, maksimum RM3,000** (disahkan; disimpan dalam `Tetapan`). Percabangan RM5,000 dalam borang lama **dibuang**, jadi butiran syarikat (Q20-Q27) tidak lagi menjadi laluan wajib. Jumlah dimohon ialah satu medan nombor (RM tepat), antara RM500 dan RM3,000.
- **Auto-isi:** emel, nama, No. KP, No. Matrik, program, tahun, jantina, alamat tetap, telefon (daripada `PELAJAR`); status Bumiputera (diterbitkan daripada etnik + kewarganegaraan). **Kelayakan (disahkan): profiling lengkap wajib dan SSU Diluluskan wajib**; permohonan dipaut kepada `ID_Perniagaan` pemohon.
- **Dibuang:** salinan KP dan kad matrik (selaras PDPA).
- **Medan baharu (sensitif, admin sahaja):** agama, taraf perkahwinan, semester, alamat surat menyurat.
- **Lampiran:** keputusan peperiksaan semester terkini, kertas cadangan projek/perniagaan.
- **Isu dalam borang lama:** jumlah dalam julat (cadangan: nilai tepat RM); tiada medan pinjaman diluluskan, tempoh, bayaran balik, penjamin.
- **Tab dicadangkan:** `Permohonan_Kredit`, `Pinjaman`, `Bayaran_Balik` (aliran bayaran seperti sewaan lot).
- **Kelulusan (disahkan): admin sahaja** (Admin Penuh / Pegawai Modul); tiada perakuan penyelia dan tiada jawatankuasa dalam sistem.
- **Had permohonan (disahkan): seorang pelajar satu permohonan.** Permohonan baharu hanya dibenarkan jika yang terdahulu Ditolak atau Dibatalkan (peraturan jika yang terdahulu Diluluskan: lihat soalan terbuka).
- **Soalan terbuka:** jejak pinjaman dan bayaran balik; adakah "satu permohonan" bermaksud satu seumur hidup, atau satu bagi setiap pinjaman belum selesai.

### Modul lain (belum dibincangkan; borang dan peraturan dibekalkan semasa fasa 2)
- **Daftar startup: sama seperti SSU (disahkan)**, dengan **dua jenis**: (1) **Perniagaan** dan (2) **Startup untuk pembangunan produk/inovasi**. Satu proses, satu borang asas, satu sijil; medan `Jenis_SSU` membezakannya. **[TERBUKA]** medan khusus startup (peringkat produk, penerangan inovasi, hak harta intelek), kelayakan startup untuk lot/kewangan/kredit, dan sama ada tajuk sijil berbeza.
- **Permohonan program keusahawanan dan inovasi pelajar / peruntukan (fasa 2; borang contoh diterima, kod `SNS_PKHS_V1_2022`):**
  - **Medan borang:** pemohon (nama, No. Matrik, jawatan dalam program, fakulti, telefon, emel; auto-isi daripada `PELAJAR`), penasihat jika ada (staf: nama, jawatan, jabatan, telefon, emel), tajuk kertas kerja/program, tempat/platform, tarikh program, nama program dan penganjur, jenis bantuan (**peruntukan wang kurang RM3,000**, hebahan media sosial, merit UTMAcad, lain-lain), justifikasi/objektif/impak (senarai bernombor), sasaran peserta dan bilangan, senarai jemputan/VIP/penceramah/ahli panel (nama, jawatan, organisasi), sumber pembiayaan, anggaran kos keseluruhan, pengurusan risiko (jika berkenaan), pengakuan (laporan lengkap dalam **dua minggu** selepas program; data peserta dikongsi dengan UTMXCITE untuk pelaporan).
  - **Aliran kelulusan (untuk kegunaan pejabat):** (1) ulasan **Pengurus** (kepentingan UTMXCITE) -> (2) ulasan, semakan dan sokongan **Timbalan Pengarah** (kaitan KPI / KAI enVision UTM) -> (3) kelulusan **Pengarah** (Diluluskan / Tidak diluluskan, dengan ulasan). Pegawai dan urutan dikonfigurasi dalam `Tetapan`, tidak ditetapkan dalam kod (nama dalam borang 2022 mungkin telah berubah).
  - **Penilaian panel** untuk kelulusan program (dinyatakan Tuan; rubrik belum dikongsi): menggunakan semula mekanisme sesi penilaian dan rubrik fasa 1.
  - **Selepas program:** laporan lengkap dalam dua minggu (muat naik), dijejak dan diingatkan.
  - **Disahkan ("ya"):** aliran tiga peringkat (Pengurus, Timbalan Pengarah, Pengarah) dalam sistem, setiap peringkat boleh memulangkan untuk pembetulan, dan pegawai ialah akaun admin (Pegawai Modul) dengan emel masing-masing; ketiga-tiga jenis bantuan (peruntukan wang, hebahan media sosial, merit UTMAcad) boleh dalam satu permohonan, dengan had RM3,000 bagi setiap permohonan (had dalam `Tetapan`); pemohon ialah pelajar yang mewakili kelab/persatuan (medan **nama kelab/persatuan penganjur**; penasihat wajib bagi kelab); **perakuan penasihat melalui pautan emel** seperti Makerspace; lampiran **kertas kerja penuh (PDF)** dan **bajet terperinci**.
  - **Rubrik panel program (draf cadangan saya, [LALAI], boleh disunting urusetia dalam tab `Rubrik`; jumlah 100; skala 5 tahap, markah boleh dilaras):** kaitan strategik dengan UTMXCITE dan KPI/KAI enVision UTM 20; justifikasi dan impak kepada pelajar 20; perancangan dan pelaksanaan program 20; kewajaran bajet dan sumber pembiayaan 20; keupayaan penganjur dan pasukan 10; pengurusan risiko dan pelaporan 10. Penilai juga mengisi **jumlah peruntukan disyorkan (RM, tidak melebihi jumlah dimohon dan had)** dan syor (Disokong / Disokong dengan pindaan / Tidak disokong).
  - **[LALAI] kedudukan panel:** Pengurus (semakan kelayakan) -> panel (skor) -> Timbalan Pengarah (sokongan) -> Pengarah (kelulusan); panel wajib bagi peruntukan wang, boleh dilangkau bagi hebahan/merit sahaja; penilaian berdasarkan dokumen dalam tempoh skor tanpa pembentangan.
  - **[TERBUKA]** pengesahan rubrik dan kedudukan panel; pelaporan perbelanjaan, cara bayar dan sekatan jika laporan lewat; senarai kod KPI/KAI enVision UTM.
- **Inovasi** (pendaftaran projek/produk inovasi pelajar).
- **Anugerah** (rekod anugerah, pertandingan dan pencapaian usahawan/inovator).
- Penyelenggaraan, Pendaftaran Aktiviti Usahawan dan Inovasi, padanan mentor, dashboard statistik lanjutan.
- Modul baharu menggunakan semula asas fasa 1 (auth, peranan, `Link_Dokumen`, `Audit`, perakuan, penilaian jawatankuasa, auto-isi daripada `PELAJAR` dan `Perniagaan`) dan didaftar sebagai spreadsheet baharu dalam `Link_Dokumen`.

---

## 11. Keputusan muktamad: lalai diterima ("guna lalai")

| # | Perkara | Keputusan |
|---|---|---|
| 9 | Teks emel automatik | Saya tulis dwibahasa (BM dahulu, *English* italik); nama penghantar "UTMPreneur · UTMXCITE"; Tuan semak sebelum pelancaran |
| 10 | Format ID | `SSU-2026-0001` (permohonan SSU), `PRN-0001` (perniagaan), `PLT-2026-0001` (permohonan lot), `SWA-0001` (sewaan), `BSW-` (bil sewa), `LKB-` (laporan kewangan), `TMP-2026-0001` (tempahan Makerspace), `SES-` (sesi penilaian). Awalan dalam `Tetapan` |
| 12 | Slot Laser Cut / 3D Printer | Slot 30 minit, maksimum 4 jam, tiada jeda; nilai dalam `Tetapan` |
| 13 | Sewaan lot | Tempoh dimasukkan admin; tiada deposit; admin menamatkan atau memperbaharui sewaan secara manual |
| 14 | Tempoh permohonan lot | Satu tempoh global (tarikh buka dan tutup) dalam `Tetapan` |
| 15 | Sistem KPI sedia ada | Tab `Ringkasan_KPI` mudah dalam `SS_INDUK` yang boleh dibaca oleh `IMPORTRANGE`; padanan terperinci dibuat kemudian apabila senarai petunjuk dibekalkan |
| 16 | Data lama | **Mula kosong** (disahkan, menggantikan lalai alat import CSV). Tiada import data lama. Usahawan sedia ada didaftar melalui borang admin "Daftar SSU sedia ada" atau memohon melalui sistem |
| 17 | Laporan universiti/KPT | Eksport CSV/Excel bagi setiap senarai; tiada laporan PDF khas |
| 18 | PDPA | Notis privasi dwibahasa umum pada log masuk pertama untuk disemak Tuan; tiada penghapusan automatik |
| 19 | Panduan | Panduan pengguna pelajar dan panduan admin (BM) dalam `UTMPreneur/docs/` |
| 20 | Semester/sesi | Format `2026/2027-1`; tarikh mula diisi admin dalam `Tetapan` |
| - | Waktu rehat Makerspace | Tiada |
| - | Tempoh ujian | Dua minggu sebelum pelancaran |
| - | Templat sijil | Google Slides |
| - | Kumpulan perintis | Disediakan Tuan sebelum fasa ujian (tidak menghalang pembinaan) |

### Maklumat yang Tuan sediakan semasa atau selepas pembinaan (tidak menghalang pembinaan)
1. Fail templat sijil (Google Slides) dalam folder templat, dengan penanda dalam bahagian 4.
2. Data `PELAJAR` (import).
3. Kadar sewa 15 lot, kadar Maker Lab/Bilik Mesyuarat, kadar 3D Printer, senarai `PERALATAN` dan `ALAT`.
4. Senarai cuti umum/universiti dalam `Tetapan`.
5. Senarai petunjuk KPI sedia ada (untuk padanan lanjut).
6. Senarai penguji kumpulan perintis dan penilai jawatankuasa.
7. Nama admin tambahan (selain `utmxcite@utm.my`).

