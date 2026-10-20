# Student Entrepreneurship Profiling (Profil Keusahawanan Pelajar)

Web app Google Apps Script untuk UTMXCITE. Borang pelajar dwibahasa (BM, *English* italic), dashboard admin dengan log masuk emel UTM + OTP, data dalam Google Sheet.

| URL | Fungsi |
|---|---|
| `…/exec` | Borang pelajar (terbuka, tanpa login) |
| `…/exec?page=admin` | Dashboard admin (emel + OTP) |

## Pemasangan

1. Pergi ke <https://script.google.com> dan buat projek baharu.
2. Salin `Code.gs`, `Index.html`, `Dashboard.html` dan kandungan `appsscript.json`
   (Project Settings → *Show "appsscript.json" manifest file*).
3. Sheet yang digunakan ditetapkan dalam `CONFIG.SPREADSHEET_ID` (`Code.gs`). Akaun yang deploy mesti ada akses **Editor** pada sheet itu.
   Jalankan fungsi **`setup`** sekali dan beri kebenaran. Ia menambah tab yang belum ada (`Responses`, `Admins`, `Students`, `Faculties`)
   tanpa memadam atau mengubah tab dan data sedia ada. Nama tab mesti sama seperti di atas.
   Jika `CONFIG.SPREADSHEET_ID` dikosongkan, `setup()` mencipta spreadsheet baharu dan URLnya dipaparkan dalam Execution log.
4. Isi sheet **Students** (senarai induk pelajar). Pelajar hanya masukkan No. Matrik, dan profil dibaca dari sini:

   | Matric | Name | Email | Phone | FacultyCode | Program | IC | Hometown |
   |---|---|---|---|---|---|---|---|
   | A24CS0001 | AHMAD FAIZ BIN RAZAK | ahmad@graduate.utm.my | 0123456789 | FC | Sarjana Muda Sains Komputer | 020304011234 | |

   - Nama lajur boleh berbeza (contoh `No Matrik`, `Nama`, `Emel`, `No Telefon`, `Fakulti`, `No KP`).
   - `FacultyCode` boleh kod (FC) atau nama penuh fakulti.
   - Jika senarai pelajar ada dalam spreadsheet lain, isi `CONFIG.STUDENTS.SPREADSHEET_ID` dalam `Code.gs`.
   - Jika matrik tiada, atau ada medan kosong / tidak sah (contoh emel bukan UTM), tingkap akan terbuka supaya pelajar mengisi
     medan yang kurang. Lajur `profileSource` dalam `Responses` menunjukkan sumber: `Students sheet`, `Students sheet + manual` atau `Manual`.
   - Pelayar hanya menerima data yang dimask. Data sebenar diisi oleh pelayan semasa hantar, dan pelayar tidak boleh menimpa data dalam senarai.

5. Isi sheet **Admins**:

   | Email | Name | Role | FacultyCode | Active |
   |---|---|---|---|---|
   | ahmad@utm.my | Ahmad | SUPER | | Yes |
   | siti@utm.my | Siti | PIC | FC | Yes |

   - `SUPER` melihat semua fakulti dan data penuh (IC, telefon).
   - `PIC` hanya melihat fakulti sendiri; IC dan telefon dimask.
   - Kod fakulti: AHIBS, FABU, FAI, FC, FEST, FKA, FKE, FKM, FKT, FM, FS, FSSK, MJIIT, SPACE, UTMXCITE.
   - Tukar `Active` kepada `No` untuk mematikan akses serta-merta.
6. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*.
7. (Pilihan) Letak logo UTMXCITE (satu imej, sudah termasuk logo UTM) pada header borang dan dashboard: muat naik ke Drive, kongsi *Anyone with the link*, kemudian isi
   `CONFIG.LOGO_URL` dalam `Code.gs` dengan `https://drive.google.com/thumbnail?id=FILE_ID&sz=w600`. Tanpa logo, header memaparkan teks "UNIVERSITI TEKNOLOGI MALAYSIA · UTMXCITE".

Selepas mengubah kod, deploy semula (*Manage deployments → Edit → New version*).

## Ciri keselamatan

- **Pengesahan identiti:** pelajar memasukkan No. Matrik dan 4 digit akhir No. KP/Pasport. Maklumat dipaparkan (dimask) hanya jika digit sepadan dengan senarai. Lima kali salah bagi satu no. matrik mengunci no. itu selama 15 minit. Jika matrik ada dalam senarai tetapi tiada IC, rekod tidak dipaparkan dan pelajar mengisi IC sendiri (mesti berakhir dengan 4 digit yang dimasukkan).
- **Satu hantaran bagi satu no. matrik:** semakan dibuat semasa Semak dan semasa Hantar. Untuk membenarkan pelajar menghantar semula, padam barisnya dalam sheet `Responses`.
- **Persetujuan PDPA:** kotak wajib pada halaman Arahan, disimpan dalam lajur `consent`. Teks persetujuan ialah draf umum, sila semak dengan pegawai undang-undang atau data UTM sebelum guna.
- Emel pelajar mesti `@graduate.utm.my` atau `@utm.my` (disemak di klien dan pelayan).
- OTP 6 digit, sah 5 minit, sekali guna, disimpan sebagai hash. Had 5 percubaan salah, kemudian dikunci 15 minit. Permintaan kod semula dihadkan 1 minit.
- Respons permintaan OTP sama sama ada emel berdaftar atau tidak.
- Sesi 6 jam, dan peranan disemak semula pada Sheet **Admins** setiap kali data dimuat.
- Penapisan fakulti dan mask dibuat di pelayan, bukan di pelayar.
- Medan sheet berformat teks (elak formula injection, kekalkan sifar di depan). Eksport CSV melindungi sel yang bermula dengan `=`, `+`, `-`, `@`.

## Had

- Kuota emel `MailApp`: sekitar 100/hari (akaun Gmail biasa) atau 1,500/hari (Workspace).
- Sheet `Responses` lama (sebelum lajur matrik ditambah) tidak serasi. Padam sheet itu dan jalankan `setup()` semula sebelum guna.
