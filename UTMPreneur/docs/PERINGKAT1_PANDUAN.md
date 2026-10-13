# UTMPreneur: Panduan Peringkat 1 (asas dan log masuk)

Peringkat 1 menyediakan: projek `clasp`, skrip persediaan, log masuk emel + OTP, peranan (pelajar, staf,
orang luar, admin), tab `Admin`, `Tetapan`, `Rujukan`, `Audit`, import data `PELAJAR`, dan antara muka asas
(log masuk, sahkan No. Matrik, daftar staf/luar, laman utama, panel admin). Modul Profiling, SSU, Ruang Niaga,
Kewangan dan Makerspace dibina pada peringkat seterusnya.

> **Nota jujur:** kod ini diuji dengan 77 ujian setempat (logik, persediaan, log masuk, import, dan antara muka
> dalam Chromium dengan Google Apps Script ditiru). Ujian itu **tidak** menyentuh Google sebenar. Perkara yang hanya
> boleh dipastikan selepas `clasp push`: kebenaran OAuth, kuota emel, kelajuan, dan tingkah laku `HtmlService`.
> Sebab itu disediakan senarai semak ujian manual di bahagian 5. Jalankannya dalam projek **UJI** dahulu.

---

## 1. Prasyarat

| Perkara | Keterangan |
|---|---|
| Akaun Google | `utmxcite@utm.my` (pemilik skrip dan penghantar OTP) |
| Node.js | Versi 18 atau lebih baru |
| `clasp` | `npm install -g @google/clasp` kemudian `clasp login` dengan `utmxcite@utm.my` |
| Apps Script API | Dayakan di <https://script.google.com/home/usersettings>. Jika disekat, minta pentadbir Google Workspace UTM membenarkannya |
| Web app "Anyone" | Pentadbir Workspace mesti membenarkan web app boleh diakses oleh **Anyone** (kerana orang luar dan pelajar log masuk dengan OTP, bukan akaun Google) |

## 2. Cipta dua projek Apps Script (UJI dan PRODUKSI)

Ulang langkah ini dua kali (satu untuk UJI, satu untuk PRODUKSI):

1. Buka <https://script.google.com> sebagai `utmxcite@utm.my` > **Projek baharu**. Namakan `UTMPreneur UJI` (atau `UTMPreneur`).
2. **Tetapan Projek** > salin **Script ID**.
3. Dalam folder `UTMPreneur/`, salin fail contoh dan isi `scriptId`:
   ```sh
   cp .clasp.uji.json.example  .clasp.uji.json     # isi scriptId projek UJI
   cp .clasp.prod.json.example .clasp.prod.json    # isi scriptId projek PRODUKSI
   ```
   Fail ini tidak dimasukkan ke Git (`.gitignore`).

## 3. Cipta SS_INDUK dan tetapkan Script Properties

Lakukan **bagi setiap persekitaran** (UJI dan PRODUKSI mesti menggunakan Induk yang berbeza):

1. Dalam Google Drive `utmxcite@utm.my`, pilih folder yang Tuan mahu (contoh `UTMPreneur UJI`) dan cipta satu
   **Google Spreadsheet kosong**. Namakan `UTMPreneur - Induk (UJI)`.
   Semua spreadsheet dan folder lain akan dicipta oleh skrip **dalam folder yang sama** dengan Induk ini.
2. Salin URL spreadsheet itu.
3. Dalam projek Apps Script > **Tetapan Projek** > **Script Properties** > tambah:

   | Kunci | Nilai |
   |---|---|
   | `INDUK_ID` | URL atau ID spreadsheet Induk |
   | `MODE` | `UJI` (projek UJI) atau `PRODUKSI` (projek PRODUKSI) |

   (`OTP_PEPPER` dijana automatik pada penggunaan pertama. Jangan dikongsi atau dimasukkan ke Git.)

## 4. Hantar kod dan jalankan persediaan

```sh
cd UTMPreneur
npm test                  # 77 ujian setempat mesti lulus
npm run push:uji          # clasp push ke projek UJI
```

Kemudian dalam editor Apps Script (projek UJI):

1. Pilih fungsi **`setup`** > **Run**. Kali pertama, luluskan kebenaran (Drive, Sheets, Gmail/emel). Amaran
   "Google hasn't verified this app" ialah normal untuk skrip sendiri: **Advanced > Go to ... (unsafe)**.
2. Lihat **Execution log**. Ia mencatat apa yang dicipta dan baris `Pengesahan struktur: OK`.
   Jika log berkata `SETUP BELUM SELESAI`, jalankan `setup` sekali lagi (selamat dijalankan semula).
3. Semak dalam Drive: dalam folder Induk kini ada 5 spreadsheet lain dan 9 folder (lampiran, sijil, templat, sandaran).
4. Dalam `SS_INDUK` > tab **Tetapan**:
   - **MOD UJI**: isi `PENGUJI_EMEL` dengan emel penguji (dipisah koma). Hanya emel ini akan menerima OTP.
   - Selepas deploy: isi `WEBAPP_URL`.
5. Dalam `SS_INDUK` > tab **Link_Dokumen**: letak URL `TEMPLAT_SIJIL_SSU` dan `TEMPLAT_LAPORAN_KEWANGAN` bila sedia
   (tidak diperlukan pada peringkat 1).

### Deploy web app

1. Editor Apps Script > **Deploy** > **New deployment** > jenis **Web app**.
2. *Execute as*: **Me** (`utmxcite@utm.my`). *Who has access*: **Anyone**.
3. Salin **URL web app** dan **Deployment ID**. Letak URL dalam Tetapan `WEBAPP_URL`.
4. Untuk kemas kini kod kemudian dengan URL yang sama:
   ```sh
   sh scripts/deploy.sh uji deploy <DEPLOYMENT_ID>
   ```

### Import data pelajar

1. Sediakan CSV dengan lajur (tajuk tepat): `No_Matrik, Nama_Penuh, Emel, No_KP_Pasport, Jantina, Etnik,
   Kewarganegaraan, Fakulti, Program, Tahun_Pengajian` dan, jika ada, `Bidang_Pengajian, No_Telefon,
   Alamat_Kolej, Alamat_Rumah, Status_Pelajar, Sesi_Kemasukan`.
2. Log masuk sebagai `utmxcite@utm.my` > **Import data pelajar** > tampal CSV > **Semak dahulu** > baiki ralat >
   **Import** (tekan dua kali untuk mengesahkan).
3. Mod **Gabung** menambah dan mengemas kini mengikut No. Matrik. Mod **Ganti** menggantikan semua data `PELAJAR`.
4. Lajur `Emel` ialah kunci keselamatan: pelajar hanya boleh menuntut No. Matrik jika emel log masuknya sepadan.
   Jika lajur `Emel` kosong bagi seorang pelajar, No. Matrik itu dikunci kepada emel pertama yang menuntutnya.

---

## 5. Senarai semak ujian manual (jalankan dalam projek UJI)

Tandakan setiap baris. Jika ada yang gagal, catat langkah dan mesej, dan hantar kepada saya.

### A. Persediaan
- [ ] `setup()` selesai tanpa ralat; log berkata `Pengesahan struktur: OK`.
- [ ] 5 spreadsheet baharu wujud dalam folder yang sama dengan Induk, bernama `... (UJI)`.
- [ ] 9 folder wujud (Lampiran SSU, Sijil SSU, Templat sijil, dan lain-lain), bernama `... (UJI)`.
- [ ] Tab `Link_Dokumen` mengandungi 18 baris; lajur `ID` terisi automatik.
- [ ] Tab `Lot` mempunyai 15 lot (SM-01..SM-10, SUB-01..SUB-05), semuanya `Ditutup`.
- [ ] Tab `Rubrik` mempunyai 6 kriteria berjumlah 100. Tab `KADAR` mempunyai kadar daripada borang.
- [ ] Tab `PELAJAR` mempunyai 8 pelajar contoh (MOD UJI sahaja).
- [ ] Menjalankan `setup()` sekali lagi **tidak** mencipta pendua (bilangan fail dan baris sama).
- [ ] `validateStructure()` pulang `ok: true`.

### B. Log masuk (gunakan emel penguji dalam `PENGUJI_EMEL`)
- [ ] Buka URL web app: skrin log masuk dengan logo dan sepanduk **MOD UJIAN** (selepas log masuk).
- [ ] Emel tidak sah: mesej ralat dwibahasa.
- [ ] Emel di luar senarai penguji: mesej "MOD UJIAN: emel ini tiada dalam senarai penguji" dan **tiada emel dihantar**.
- [ ] Emel penguji: emel OTP tiba dalam 1 minit, subjek bermula `[UJI]`, kandungan BM dan English.
- [ ] Kod salah: "Kod tidak betul". Selepas 5 kali salah: "Terlalu banyak percubaan".
- [ ] Menekan "Hantar semula" dalam 60 saat tidak dibenarkan; selepas 60 saat boleh. Kali ke-4 dalam sejam ditolak.
- [ ] Kod yang betul membawa ke langkah seterusnya. Kod yang sama tidak boleh digunakan dua kali.
- [ ] Menampal 6 digit ke dalam kotak OTP berfungsi (telefon dan komputer).

### C. Pelajar
- [ ] Emel `@graduate.utm.my` penguji (yang sepadan dengan satu pelajar contoh): diminta No. Matrik.
- [ ] No. Matrik tidak wujud: "No. Matrik tidak ditemui". No. Matrik orang lain: "emel tidak sepadan".
- [ ] No. Matrik betul: laman utama menunjukkan nama pelajar dan No. Matrik. Modul dipaparkan "Akan datang".
- [ ] Log keluar, log masuk semula: tidak diminta No. Matrik lagi.
- [ ] Tab `Pengguna` mengandungi baris pelajar; tab `Audit` mencatat `LOG_MASUK` dan `DAFTAR_PELAJAR`.
- [ ] Pelajar **tidak** nampak menu Pentadbir.

### D. Staf dan orang luar
- [ ] Emel `@utm.my` (bukan admin): borang daftar staf (nama, No. Staf, jabatan, telefon). Selepas simpan, laman utama.
- [ ] Emel lain (contoh Gmail): borang daftar orang luar (nama, No. KP/pasport, organisasi pilihan, telefon).
- [ ] Menghantar borang tanpa maklumat wajib atau telefon tidak sah: mesej ralat jelas.

### E. Admin (`utmxcite@utm.my`)
- [ ] Menu Pentadbir kelihatan: Status sistem, Import data pelajar, Urus admin.
- [ ] **Status sistem**: `Struktur: OK`, kiraan rekod dan bilangan OTP hari ini.
- [ ] **Import**: CSV dengan ralat (No. Matrik pendua, emel tidak sah) menunjukkan jadual ralat dan butang Import dikunci.
      CSV betul: "Semakan lulus"; tekan Import dua kali; tab `PELAJAR` bertambah. Mengubah CSV mengunci semula butang.
- [ ] **Urus admin**: tambah `pegawai@utm.my` sebagai Pegawai Modul; log masuk dengan emel itu: nampak Status sistem
      sahaja (tiada Import dan Urus admin). Nyahaktifkan pegawai itu: kuasa hilang dalam masa 1 hingga 2 minit.
- [ ] Baris `utmxcite@utm.my` bertanda **Dikunci** (tidak boleh dinyahaktifkan).
- [ ] Tab `Audit` mencatat `IMPORT_PELAJAR`, `TAMBAH_ADMIN`, dan tindakan lain.

### F. Keselamatan asas
- [ ] Pelajar atau staf yang membuka Konsol Pelayar dan memanggil `google.script.run.rpc('admin.status', token, {})`
      mendapat `TIADA_KEBENARIAN`.
- [ ] Mengubah tab `Pengguna` > `Status` kepada `Disekat`: pengguna itu tidak boleh log masuk (berkuat kuasa dalam 1 minit).
- [ ] Tab `PELAJAR` dan `Pengguna` tidak dikongsi dengan pelajar (hanya `utmxcite@utm.my` ada akses Drive).

### G. Pelancaran PRODUKSI (selepas UJI lulus)
- [ ] Projek PRODUKSI: `MODE=PRODUKSI`, `INDUK_ID` Induk produksi, `setup()` (tiada pelajar contoh dan tiada akhiran `(UJI)`).
- [ ] Import data `PELAJAR` sebenar. `WEBAPP_URL` diisi. Sepanduk MOD UJIAN **tidak** muncul.
- [ ] Hantar satu OTP kepada diri sendiri (PRODUKSI tidak menggunakan senarai putih).

---

## 6. Had dan perkara yang perlu diketahui

- **Sesi** disimpan dalam `CacheService` (maksimum 6 jam). Cache boleh dikosongkan oleh Google bila-bila masa,
  jadi pengguna mungkin diminta log masuk semula lebih awal.
- **Menyekat pengguna** melalui tab `Pengguna` berkuat kuasa dalam 60 saat (cache). **Menukar admin** dalam 60 saat.
- **Kuota emel** `MailApp` bagi akaun Workspace sekitar 1,500 emel sehari. Had OTP harian lalai ialah 1,000 (`OTP_MAKS_HARIAN`).
- **Persediaan** berhenti selepas 4.5 minit dan boleh dijalankan semula (had Apps Script ialah 6 minit).
- **Skema berubah**: menjalankan semula `setup()` menambah lajur baharu pada tab sedia ada tanpa memadam data.
- **Logo**: logo lalai dibenamkan dalam `src/LogoData.html`. Jana semula dengan `node scripts/build-logo.js <fail.png>`.
- **Perlindungan formula**: semua teks yang ditulis ke Sheets dan bermula dengan `=`, `+`, `-`, `@` diawali apostrof pelepas
  (Sheets tidak memaparkannya dan nilai asal kekal apabila dibaca). Ini menghalang pengguna luar menyuntik formula melalui nama atau medan lain.
- **Nama BM** bagi sebahagian rujukan (fakulti, bidang, kluster) ialah draf dan boleh disunting dalam tab `Rujukan`.
