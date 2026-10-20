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
3. Jalankan fungsi **`setup`** sekali dan beri kebenaran. Ia mencipta Spreadsheet dengan 3 sheet:
   `Responses`, `Admins`, `Faculties`. URL Spreadsheet dipaparkan dalam Execution log.
4. Isi sheet **Admins**:

   | Email | Name | Role | FacultyCode | Active |
   |---|---|---|---|---|
   | ahmad@utm.my | Ahmad | SUPER | | Yes |
   | siti@utm.my | Siti | PIC | FC | Yes |

   - `SUPER` melihat semua fakulti dan data penuh (IC, telefon).
   - `PIC` hanya melihat fakulti sendiri; IC dan telefon dimask.
   - Kod fakulti: AHIBS, FABU, FAI, FC, FEST, FKA, FKE, FKM, FKT, FM, FS, FSSK, MJIIT, SPACE, UTMXCITE.
   - Tukar `Active` kepada `No` untuk mematikan akses serta-merta.
5. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*.
6. (Pilihan) Letak logo UTM + UTMXCITE: muat naik ke Drive, kongsi *Anyone with the link*, kemudian isi
   `CONFIG.LOGO_URL` dalam `Code.gs` dengan `https://drive.google.com/thumbnail?id=FILE_ID&sz=w600`.

Selepas mengubah kod, deploy semula (*Manage deployments → Edit → New version*).

## Ciri keselamatan

- Emel pelajar mesti `@graduate.utm.my` atau `@utm.my` (disemak di klien dan pelayan).
- OTP 6 digit, sah 5 minit, sekali guna, disimpan sebagai hash. Had 5 percubaan salah, kemudian dikunci 15 minit. Permintaan kod semula dihadkan 1 minit.
- Respons permintaan OTP sama sama ada emel berdaftar atau tidak.
- Sesi 6 jam, dan peranan disemak semula pada Sheet **Admins** setiap kali data dimuat.
- Penapisan fakulti dan mask dibuat di pelayan, bukan di pelayar.
- Medan sheet berformat teks (elak formula injection, kekalkan sifar di depan). Eksport CSV melindungi sel yang bermula dengan `=`, `+`, `-`, `@`.

## Had

- Kuota emel `MailApp`: sekitar 100/hari (akaun Gmail biasa) atau 1,500/hari (Workspace).
- Tiada semakan pendua (pelajar yang sama boleh hantar lebih daripada sekali).
