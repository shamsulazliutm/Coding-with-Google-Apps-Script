# Modul Kewangan (laporan kewangan bulanan)

Fail: `src/Kewangan.gs` (pelayan), `src/ViewsKew.html` + `src/AppKew.html` (antara muka). Ujian: `tests/kewangan.test.js`, `tests/ui-kewangan.test.js` (pembantu: `tests/kew-helpers.js`).

## Peraturan yang dilaksanakan
- Setiap perniagaan dalam `Perniagaan` berstatus Aktif atau Tamat Tempoh melapor bulanan, sebelum atau pada hari ke-`TARIKH_AKHIR_LAPORAN_HARI` (lalai 7) bulan berikutnya.
- Status: Belum Dihantar, Dihantar, Lewat, Perlu Pembetulan, Diterima. Admin: Terima, atau Perlu Pembetulan (catatan wajib). Diterima dikunci. Hanya Diterima dijumlahkan dalam ringkasan dan `Ringkasan_KPI`.
- Pelajar: hanya pemilik menghantar/menyunting (selagi Belum Dihantar, Lewat, Perlu Pembetulan); ahli pasukan SSU melihat sahaja. Akses disemak di pelayan setiap panggilan. Pelajar tidak menerima pautan Drive.
- Medan: pendapatan dan perbelanjaan RM tepat tidak negatif; untung dikira pelayan (boleh negatif); "Tiada aktiviti" menjadikan nilai 0 dan fail pilihan; fail PDF/Excel (`MAKS_SAIZ_FAIL_MB`); fail wajib bagi penyewa lot (baris `Sewaan` Aktif bagi perniagaan; dibaca dengan selamat jika tab kosong/tiada) kecuali tiada aktiviti; perakuan wajib.
- Kerja harian `Kewangan.jobHarian()` (idempotent, menampung hari terlepas): jana baris bulan lepas yang belum ada bermula bulan terkemudian antara `Tarikh_Pendaftaran` dan `Dicipta_Pada` (hanya apabila hari >= `JANA_LAPORAN_HARI`); Belum Dihantar menjadi Lewat selepas tarikh akhir; emel peringatan kepada pemilik; kemas kini `Ringkasan_KPI`.
- Admin Penuh dan Pegawai Modul (modul kosong/Semua/mengandungi "Kewangan") memutuskan; Pemerhati baca sahaja; Penilai tiada akses. Admin boleh "Isi bagi pihak pemilik" (`Bantu.ctx(..., 'kewangan')`). Semua tindakan direkod dalam `Audit`.
- Admin: senarai dengan penapis (bulan, tahun, status, carian), butiran, muat turun fail, ringkasan kepatuhan, eksport CSV (dikembalikan sebagai teks), "Jana laporan bulan ini sekarang".

## Keputusan [LALAI]
- [LALAI] Bulan laporan pertama = bulan tarikh terkemudian antara `Tarikh_Pendaftaran` dan `Dicipta_Pada` (bulan pendaftaran sendiri dilaporkan). Tertunggak dihadkan 36 bulan.
- [LALAI] ID laporan `LKB-<tahun laporan>-0001`.
- [LALAI] Peringatan: sekali pada/selepas hari jana (kunci `KEW_JANA_<ID>`); sekali apabila baki <= `KEW_PERINGATAN_HARI_SEBELUM` (lalai 2, kunci baharu dalam Tetapan; `KEW_H2_<ID>`); susulan Lewat pada hari pertama lewat, kemudian setiap `PERINGATAN_SUSULAN_HARI` hari (`KEW_LEWAT_<ID>_<n>`). Dalam MOD UJI penerima di luar senarai penguji dicatat "Dilangkau" sekali. Jika hari jana terlepas dan sudah dalam dua hari terakhir, hanya peringatan dua hari dihantar.
- [LALAI] Pematuhan % = (Diterima + Dihantar) / bilangan baris laporan tempoh itu. Perlu Pembetulan dikira belum patuh.
- [LALAI] Tanda "Dihantar lewat" = `Tarikh_Hantar` (penghantaran terakhir) > `Tarikh_Akhir`; penghantaran semula selepas pembetulan boleh ditanda lewat.
- [LALAI] "Jana laporan bulan ini sekarang" menjana hingga bulan semasa tanpa menunggu hari jana, dan tidak menghantar emel.
- [LALAI] Penyewa lot ditentukan oleh `Sewaan` Aktif pada masa hantar; `ID_Sewaan` diisi pada masa itu.
- [LALAI] Ahli pasukan diambil daripada `Ahli_Pasukan` bagi permohonan Diluluskan perniagaan itu.
- Templat: `Link_Dokumen` kod `TEMPLAT_LAPORAN_KEWANGAN` mesti fail Drive (bukan pautan pendek seperti bit.ly); jika tidak, mesej jelas dipaparkan.

## Had
- Laporan Diterima tidak boleh dikembalikan melalui aplikasi (ubah terus dalam sheet jika tersilap).
- Resit sewa dan resit inkubator dikendalikan modul Ruang Niaga/Makerspace, bukan di sini.
- Senarai admin dihadkan 500 baris; fail lama tidak dibuang daripada Drive apabila diganti.

## Ujian manual (MOD UJI)
1. Jalankan `setup()` dan `pasangPencetus()`; daftar templat pada `Link_Dokumen` (TEMPLAT_LAPORAN_KEWANGAN).
2. Luluskan satu SSU (atau "Daftar SSU sedia ada"); sebagai admin tekan "Jana laporan bulan ini sekarang".
3. Log masuk pemilik: menu "Laporan kewangan" > isi, lampir PDF, tandakan perakuan, hantar. Cuba nilai negatif dan tanpa perakuan.
4. Log masuk ahli pasukan: hanya baca. Pelajar lain: tiada perniagaan.
5. Admin: buka senarai, semak butiran, muat turun fail, "Perlu pembetulan" tanpa catatan (ditolak), dengan catatan; pemilik membetulkan; "Terima" (klik dua kali); cuba sunting (terkunci).
6. "Isi bagi pihak pemilik" bagi laporan Belum Dihantar; semak Audit.
7. Eksport CSV dan semak `Ringkasan_KPI` (kunci `KEW_*_YYYY_MM`).
8. Jalankan `jobHarian()` dua kali: tiada baris atau emel berganda; semak tab `Peringatan`.
