# Modul Makerspace

Tempahan ruang (Maker Lab, Bilik Mesyuarat), Laser Cut, 3D Printer dan pinjaman peralatan. Fail: `src/Makerspace*.gs`, `src/ViewsMk.html`, `src/AppMk.html`. RPC berawalan `mk.*`.

## Peraturan
- **Pengguna:** pelajar (No. Matrik, tiada syarat SSU), staf (`@utm.my`) dan orang luar (mesti melengkapkan profil). Kadar mengikut jenis pengguna dalam tab `KADAR`.
- **Waktu operasi:** Tetapan `HARI_OPERASI`, `JAM_MULA`, `JAM_TAMAT`; cuti dalam tab `Cuti`. Mesin: slot `SLOT_MINIT` (30), maksimum `SLOT_MAKS_JAM` (4 jam). Ruang: notis `NOTIS_HARI_BEKERJA_RUANG` (3 hari bekerja; hari ini tidak dikira, hari penggunaan dikira).
- **Alur:** pelajar -> penyelia memperakui melalui pautan emel (`?perakuan=TOKEN`, tanpa log masuk, OTP ke emel penyelia, emel mesti `@utm.my` dan bukan emel pemohon, token sekali guna, hanya hash disimpan, tamat `PERAKUAN_TAMAT_HARI`) -> admin meluluskan. Staf/luar -> admin memperakui dan meluluskan serentak. Semua jenis tempahan pelajar perlu perakuan, termasuk tempahan bagi pihak.
- **Konflik:** Menunggu Perakuan (pautan masih sah), Menunggu Kelulusan dan Diluluskan dikira bertindih. Disemak semasa menempah dan semasa meluluskan.
- **Pinjaman:** baki stok = jumlah - rosak/hilang - sedang dipinjam atau ditempah; tempoh maksimum sebulan; satu pembaharuan.
- **Bil:** dijana oleh kerja harian selepas sesi (anggaran), atau apabila admin merekod penggunaan sebenar (kos sebenar). Tarikh akhir 7 hari dari tarikh bil dijana; peringatan hari ke-4; Lewat selepas hari ke-7; susulan setiap `PERINGATAN_SUSULAN_HARI`. Status: Belum Bayar / Menunggu Pengesahan / Dibayar / Dikecualikan / Lewat.
- **Sekatan:** bil Lewat menyekat semua tempahan Makerspace baharu; laporan aktiviti lewat menyekat tempahan **ruang** baharu; pinjaman lewat pulang menyekat **pinjaman** baharu.
- **Kebenaran:** Admin Penuh dan Pegawai Modul (modul kosong/Semua/Makerspace) memutuskan; Pemerhati baca sahaja; Penilai tiada akses; semak di pelayan.

## Persediaan (semua mula kosong kecuali KADAR)
1. Jalankan `setup()` semula (menambah lajur dan Tetapan baharu).
2. Admin > Makerspace (admin) > **Ruang dan mesin**: butang "Tambah ruang lalai" (Maker Lab 200, Bilik Mesyuarat 20), kemudian tambah mesin. Kod kadar: Ruang `RUANG_MAKER_LAB`/`RUANG_BILIK_MESYUARAT`; Laser Cut `LASER_CUT`; 3D Printer `3D_PRINTER` (sistem guna `3D_PRINTER_GRAM` dan `3D_PRINTER_JAM`).
3. **Alat pinjaman**: tambah alat dan stok.
4. **Kadar**: tetapkan kadar kosong (sewa ruang, 3D Printer, extension wire, kadar staf/luar). Kosong = "belum ditetapkan": bil tidak dijana dan admin diberi amaran (sepanduk dan emel sekali). Peralatan tambahan ruang ialah baris KADAR berkod `ALAT_*` (per hari).
5. Isi tab `Cuti` (SS_INDUK) dan Tetapan `WEBAPP_URL` (wajib untuk pautan perakuan).

## Keputusan [LALAI]
- Kadar yang berkuat ialah baris aktif terkini dengan `Berkuat_Kuasa` <= tarikh sesi. Menetapkan kadar kosong tanpa tarikh mengisi baris kosong sedia ada.
- Ruang: bilangan hari = hari operasi berturut-turut (hujung minggu/cuti dilangkau), maksimum `RUANG_MAKS_HARI` (14); kos = hari x kadar + RM150 + peralatan x kuantiti x hari. Kertas kerja PDF wajib; surat PDF wajib bagi staf/luar, pilihan bagi pelajar (perakuan sistem menggantikannya). Invois Dalaman (No. VOT, staf kewangan) untuk warga UTM sahaja.
- Mesin: kos Laser = ceil(minit/5) x RM1; 3D = gram x kadar + jam (pro-rata) x kadar. Masa tempahan dibundarkan ke slot.
- Pinjaman percuma melainkan kadar `PERALATAN_TANGAN` > 0 ditetapkan (bil dijana selepas pemulangan); kadar kosong tidak menyekat pinjaman. Pembaharuan: sekali sahaja, oleh pemohon (sebelum lewat) atau admin, sebulan dari tarikh pulang semasa, dilaraskan ke hari operasi. Stok dikira tanpa mengambil kira tarikh (konservatif).
- Pautan perakuan tamat dalam 5 hari; kerja harian membatalkan tempahan yang tidak diperakui. Penyelia boleh menolak (catatan wajib). Pemohon boleh menghantar semula pautan (pautan lama tidak sah).
- Pemohon boleh membatalkan tempahan yang menunggu, atau yang diluluskan sebelum hari mula.
- Bayaran yang direkod (Menunggu Pengesahan) membuka sekatan Lewat; ditolak admin -> kembali Lewat. Resit PDF/JPG/PNG wajib kecuali Invois Dalaman. Laporan aktiviti: PDF, dalam `LAPORAN_AKTIVITI_HARI` (3) selepas hari terakhir.
- Kerja harian menanda sesi Selesai, memberi peringatan tempahan esok, pemulangan pinjaman, bil dan laporan.

## Had
Tiada sambungan Kalendar Google; jadual ialah senarai mengikut tarikh. Tiada rekod kerosakan semasa pemulangan (ubah ALAT secara manual). Pelayan tidak boleh diuji untuk kuota emel sebenar.

## Ujian manual dalam MOD UJI
1. Letak emel penguji (pelajar, penyelia `@utm.my`) dalam `PENGUJI_EMEL`; tetapkan `WEBAPP_URL`.
2. Sediakan ruang/mesin/alat/kadar (atas). Log masuk pelajar contoh, tempah Laser Cut dengan emel penyelia.
3. Buka pautan dalam emel penyelia (tanpa log masuk), minta OTP, perakui.
4. Admin: luluskan. Selepas tarikh sesi jalankan `jobHarian()` dan semak bil; pelajar rekod bayaran; admin sahkan.
5. Cuba pinjaman, tempahan ruang (notis 3 hari bekerja) dan tempah bagi pihak.
