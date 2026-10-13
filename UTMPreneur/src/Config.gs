/**
 * UTMPreneur: konfigurasi tetap dan skema spreadsheet.
 * Skema ini ialah satu-satunya sumber nama tab dan tajuk lajur. Skrip persediaan
 * (Setup.gs) dan pengesah struktur menggunakannya.
 */

var APP = { NAMA: 'UTMPreneur', VERSI: '0.1.0', TZ: 'Asia/Kuala_Lumpur' };

/** Kunci Script Properties */
var PROPS = { INDUK_ID: 'INDUK_ID', MODE: 'MODE', PEPPER: 'OTP_PEPPER' };

var MODE = { UJI: 'UJI', PRODUKSI: 'PRODUKSI' };

var ROLE = {
  ADMIN_PENUH: 'Admin Penuh',
  PEGAWAI_MODUL: 'Pegawai Modul',
  PEMERHATI: 'Pemerhati',
  PENILAI: 'Penilai',
  PELAJAR: 'Pelajar',
  STAF: 'Staf',
  LUAR: 'Luar'
};
var ADMIN_ROLES = [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI, ROLE.PENILAI];
var ADMIN_UTAMA = 'utmxcite@utm.my';

/** Nama spreadsheet dan tab. Kunci SS_* ialah Kod dalam Link_Dokumen. */
var SCHEMA = {
  SS_INDUK: {
    nama: 'UTMPreneur - Induk',
    modul: 'Induk',
    tabs: {
      PELAJAR: ['No_Matrik', 'Nama_Penuh', 'Emel', 'No_KP_Pasport', 'Jantina', 'Etnik', 'Kewarganegaraan', 'Fakulti', 'Program', 'Bidang_Pengajian', 'Tahun_Pengajian', 'No_Telefon', 'Alamat_Kolej', 'Alamat_Rumah', 'Status_Pelajar', 'Sesi_Kemasukan'],
      Pengguna: ['Emel', 'Peranan', 'No_Matrik', 'No_Staf', 'Nama', 'No_KP_Pasport', 'Telefon', 'Jabatan_Organisasi', 'Status', 'Tarikh_Daftar', 'Log_Masuk_Terakhir'],
      Perniagaan: ['ID_Perniagaan', 'Nama_Perniagaan', 'ID_Permohonan_SSU', 'No_Matrik_Pemilik', 'Jenis_SSU', 'Kluster', 'Jenis_Perniagaan', 'No_SSM', 'Alamat', 'No_Pendaftaran', 'Bil_Sijil', 'Tarikh_Pendaftaran', 'Tarikh_Tamat', 'Status_SSU', 'Dicipta_Pada'],
      Link_Dokumen: ['Kod', 'Jenis', 'Modul', 'Nama', 'URL', 'ID', 'Status', 'Catatan'],
      Tetapan: ['Kunci', 'Nilai', 'Penerangan'],
      Admin: ['Emel', 'Nama', 'Peranan', 'Modul', 'Aktif', 'Ditambah_Oleh', 'Tarikh'],
      Cuti: ['Tarikh', 'Nama', 'Jenis'],
      Rujukan: ['Kumpulan', 'Kod', 'BM', 'EN', 'Susunan', 'Aktif'],
      Audit: ['Masa', 'Emel', 'Peranan', 'Tindakan', 'Modul', 'Rujukan', 'Nilai_Lama', 'Nilai_Baharu', 'Catatan'],
      Peringatan: ['Masa', 'Emel', 'Jenis', 'Rujukan', 'Status', 'Catatan'],
      Ringkasan_KPI: ['Petunjuk', 'Nilai', 'Kemas_Kini']
    }
  },
  SS_PROFILING: {
    nama: 'UTMPreneur - Profiling',
    modul: 'Profiling',
    tabs: {
      Profil: ['ID_Profil', 'No_Matrik', 'Sesi', 'Tarikh_Kemas_Kini', 'No_Telefon', 'Kampung_Halaman', 'Keluarga_Berniaga', 'Pernah_Berniaga', 'Jenis_Perniagaan_Dijalankan', 'Tempoh_Perniagaan', 'Motivasi', 'Berminat_Berniaga', 'Kluster_Diminati', 'Kluster_Lain', 'Mahu_Kampus', 'Aliran_Pilihan'],
      Perniagaan_Keluarga: ['ID_Profil', 'Hubungan', 'Jenis_Perniagaan', 'Tempoh']
    }
  },
  SS_SSU: {
    nama: 'UTMPreneur - SSU',
    modul: 'SSU',
    tabs: {
      Permohonan_SSU: ['ID_Permohonan', 'Jenis_SSU', 'Jenis_Permohonan', 'ID_Perniagaan', 'No_Matrik_Pemilik', 'Nama_Perniagaan', 'Produk', 'Syarat_Subjek', 'Pensyarah', 'Seksyen', 'Kumpulan', 'Status_SSM', 'No_SSM', 'Fail_SSM', 'Fail_Maklumat_SSM', 'Jenis_Perniagaan', 'Kluster', 'Sumber_Pembiayaan', 'Modal_RM', 'Pendapatan_Bulanan_RM', 'Alamat_Perniagaan', 'Tarikh_Mula_Perniagaan', 'Laman_Media_Sosial', 'Bil_Ahli', 'Status', 'Tarikh_Hantar', 'Tarikh_Keputusan', 'Diluluskan_Oleh', 'Catatan_Admin', 'No_Pendaftaran', 'Bil_Sijil', 'Pautan_Sijil', 'Tarikh_Pendaftaran', 'Tarikh_Tamat'],
      Ahli_Pasukan: ['ID_Permohonan', 'No_Matrik', 'Nama', 'Fakulti', 'Jantina', 'Etnik', 'Tahun', 'Peranan_Ahli']
    }
  },
  SS_RUANG_NIAGA: {
    nama: 'UTMPreneur - Ruang Niaga',
    modul: 'Ruang Niaga',
    tabs: {
      Lot: ['Kod_Lot', 'Nama_Paparan', 'Lokasi', 'Blok', 'Saiz_m2', 'Jenis', 'Kadar_Sewa_RM', 'Status_Buka', 'Status_Lot', 'Catatan', 'Didaftar_Oleh', 'Tarikh_Daftar', 'Alamat_Surat'],
      Permohonan_Lot: ['ID_Permohonan', 'ID_Perniagaan', 'No_Matrik', 'Kod_Lot', 'Tempoh_Mula', 'Tempoh_Tamat', 'Vaksin_Kepialu', 'Fail_Vaksin', 'Kursus_Makanan', 'Fail_Kursus', 'Sumber_Pembiayaan', 'Pemberi_Dana', 'Jumlah_Dana_RM', 'Jangkaan_Jualan_RM', 'Bil_Pekerja', 'Fail_Cadangan', 'Sebab_Berniaga', 'Lokasi_Dirancang', 'Status', 'Tarikh_Hantar', 'Keputusan', 'Tarikh_Keputusan', 'Catatan_Admin', 'Jenis_Permohonan', 'Ulasan_Pemohon', 'Diputuskan_Oleh', 'ID_Sewaan'],
      Sewaan: ['ID_Sewaan', 'Kod_Lot', 'ID_Perniagaan', 'ID_Permohonan', 'Kadar_RM', 'Tarikh_Mula', 'Tarikh_Tamat', 'Status', 'Didaftar_Oleh', 'Tarikh_Tamat_Sebenar', 'Sebab_Tamat', 'Jenis_Daftar', 'Bil_Pembaharuan', 'Tarikh_Daftar'],
      Bayaran_Sewa: ['ID_Bil', 'ID_Sewaan', 'Kod_Lot', 'ID_Perniagaan', 'Bulan', 'Tahun', 'Jumlah_RM', 'Tarikh_Akhir', 'Status', 'Tarikh_Bayar', 'Kaedah', 'No_Rujukan', 'Fail_Resit', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Catatan', 'Sewa_RM', 'Caj_Utiliti_RM', 'Catatan_Utiliti', 'Tarikh_Jana', 'Bulan_Sewa_Ke'],
      Rubrik: ['Jenis', 'Versi', 'Kod_Kriteria', 'Kriteria_BM', 'Kriteria_EN', 'Sub_Perkara', 'Markah_Maks', 'Tertib', 'Tahap5', 'Tahap3', 'Tahap1', 'Aktif'],
      Sesi_Penilaian: ['ID_Sesi', 'Tarikh', 'Masa', 'Tempat', 'Status', 'Versi_Rubrik', 'Penilai', 'Senarai_Permohonan', 'Dicipta_Oleh', 'Jemputan_Dihantar'],
      Skor_Penilaian: ['ID_Sesi', 'ID_Permohonan', 'Emel_Penilai', 'Kod_Kriteria', 'Tahap', 'Markah', 'Ulasan', 'Masa_Hantar', 'Dikunci', 'Masa_Simpan'],
      Dokumen_Sewaan: ['ID_Dokumen', 'ID_Permohonan', 'ID_Sewaan', 'Jenis', 'Versi', 'Tajuk', 'Fail', 'Nama_Fail', 'Tarikh', 'Dijana_Oleh', 'Status', 'Kelihatan', 'Catatan'],
      Tawaran_Sewa: ['ID_Permohonan', 'No_Rujukan', 'Tarikh_Surat', 'Jenis_Perniagaan', 'Tarikh_Mula', 'Tarikh_Tamat', 'Bil_Bulan', 'Sewa_Bulanan_RM', 'Utiliti', 'Cagaran_Sewaan_RM', 'Cagaran_Utiliti_RM', 'Waktu_Operasi', 'Penandatangan_Nama', 'Penandatangan_Jawatan', 'Versi_Semasa', 'Status', 'Tarikh_Hantar', 'Tarikh_Luput', 'Respons', 'Tarikh_Respons', 'Emel_Respons', 'Salinan_Fizikal_Tarikh', 'Salinan_Fizikal_Penerima', 'Catatan'],
      Cagaran: ['ID_Cagaran', 'ID_Permohonan', 'ID_Sewaan', 'ID_Perniagaan', 'Jenis', 'Jumlah_RM', 'Tarikh_Akhir_Bayar', 'No_Resit_Rasmi', 'Tarikh_Resit', 'Fail_Resit', 'Tarikh_Muat_Naik', 'Status', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Tarikh_Akhir_Pulang', 'Jumlah_Pulang_RM', 'Tarikh_Pulang', 'Sebab_Potongan', 'Catatan'],
      Jadual_Sewa: ['ID_Permohonan', 'ID_Sewaan', 'Dari_Bulan', 'Hingga_Bulan', 'Kadar_RM'],
      Pekerja_Penyewa: ['ID_Pekerja', 'ID_Permohonan', 'ID_Sewaan', 'ID_Perniagaan', 'Nama', 'Umur', 'Fakulti', 'Tugas', 'Pelajar_UTM', 'No_Matrik', 'Status', 'Ditambah_Oleh', 'Tarikh', 'Catatan_Admin'],
      Peralatan_Lot: ['ID_Peralatan', 'Kod_Lot', 'Nama_Alat', 'Bilangan', 'Catatan', 'Aktif']
    }
  },
  SS_KEWANGAN: {
    nama: 'UTMPreneur - Kewangan',
    modul: 'Kewangan',
    tabs: {
      Laporan_Bulanan: ['ID_Laporan', 'ID_Perniagaan', 'ID_Sewaan', 'Bulan', 'Tahun', 'Tiada_Aktiviti', 'Pendapatan_RM', 'Perbelanjaan_RM', 'Untung_RM', 'Fail_Laporan', 'Perakuan', 'Status', 'Tarikh_Hantar', 'Tarikh_Akhir', 'Disemak_Oleh', 'Tarikh_Semakan', 'Catatan_Semakan']
    }
  },
  SS_TEMPAHAN_RUANG: {
    nama: 'UTMPreneur - Makerspace',
    modul: 'Makerspace',
    tabs: {
      Tempahan: ['ID_Tempahan', 'Jenis', 'Kod_Sumber', 'Jenis_Pengguna', 'Emel_Pemohon', 'Nama_Pemohon', 'Tarikh_Mula', 'Masa_Mula', 'Tarikh_Tamat', 'Masa_Tamat', 'Tujuan', 'Emel_Penyelia', 'Status_Perakuan', 'Tarikh_Perakuan', 'Status', 'Diluluskan_Oleh', 'Tarikh_Keputusan', 'Catatan', 'No_Matrik', 'Telefon', 'Jabatan', 'Anggaran_RM', 'Dicipta_Pada', 'Didaftar_Oleh', 'Token_Hash', 'Token_Tamat', 'Catatan_Penyelia', 'Bil_Pembaharuan'],
      Butiran_Ruang: ['ID_Tempahan', 'Nama_Program', 'Bil_Hari', 'Bil_Peserta', 'Kaedah_Bayaran', 'No_VOT', 'Nama_Staf_Kewangan', 'Tel_Staf_Kewangan', 'Fail_Kertas_Kerja', 'Fail_Surat', 'Kaedah_Lain', 'Hari_Sebenar'],
      Item_Peralatan_Ruang: ['ID_Tempahan', 'Kod_Alat', 'Kuantiti'],
      Butiran_LaserCut: ['ID_Tempahan', 'Nama_Projek', 'Jenis_Bahan', 'Masa_Dijangka_Min', 'Masa_Sebenar_Min'],
      Butiran_3DP: ['ID_Tempahan', 'Nama_Projek', 'Fail_Gambar', 'Berat_g', 'Warna', 'No_Mesin', 'Masa_Dijangka_Min', 'Masa_Sebenar_Min', 'Berat_Sebenar_g'],
      Item_Pinjaman: ['ID_Tempahan', 'Kod_Alat', 'Kuantiti', 'Tarikh_Dijangka_Pulang', 'Tarikh_Pulang', 'Status'],
      ALAT: ['Kod_Alat', 'Nama_Alat', 'Kategori', 'Kuantiti_Jumlah', 'Kuantiti_Rosak_Hilang', 'Boleh_Dipinjam', 'Aktif', 'Catatan'],
      PERALATAN: ['Kod_Mesin', 'Jenis', 'No_Mesin', 'Nama_Model', 'Kapasiti', 'Kod_Kadar', 'Status', 'Catatan'],
      KADAR: ['Kod_Sumber', 'Nama_Sumber', 'Jenis_Pengguna', 'Unit', 'Kadar_RM', 'Berkuat_Kuasa', 'Aktif'],
      Bayaran_Makerspace: ['ID_Bayaran', 'ID_Tempahan', 'Emel_Pemohon', 'Anggaran_RM', 'Penggunaan_Sebenar', 'Kos_Sebenar_RM', 'Status', 'Tarikh_Akhir', 'Tarikh_Bayar', 'Kaedah', 'No_Rujukan', 'Fail_Resit', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Tarikh_Jana', 'Catatan'],
      Laporan_Aktiviti: ['ID_Tempahan', 'Fail_Laporan', 'Tarikh_Hantar', 'Status']
    }
  }
};

/** Lajur yang mesti disimpan sebagai teks (kekalkan sifar di hadapan, elak penukaran tarikh). */
var TEXT_COLS = {
  PELAJAR: ['No_Matrik', 'No_KP_Pasport', 'No_Telefon'],
  Pengguna: ['No_Matrik', 'No_Staf', 'No_KP_Pasport', 'Telefon'],
  Perniagaan: ['No_Matrik_Pemilik', 'No_SSM', 'No_Pendaftaran'],
  Profil: ['No_Matrik', 'No_Telefon'],
  Ahli_Pasukan: ['No_Matrik'],
  Permohonan_SSU: ['No_Matrik_Pemilik', 'No_Pendaftaran'],
  Permohonan_Lot: ['No_Matrik'],
  Tempahan: ['No_Matrik', 'Telefon', 'Masa_Mula', 'Masa_Tamat', 'Token_Hash'],
  PERALATAN: ['Kod_Mesin', 'No_Mesin'],
  Butiran_3DP: ['No_Mesin'],
  Tawaran_Sewa: ['No_Rujukan'],
  Cagaran: ['No_Resit_Rasmi'],
  Bayaran_Sewa: ['No_Rujukan'],
  Pekerja_Penyewa: ['No_Matrik'],
  Butiran_Ruang: ['No_VOT', 'Tel_Staf_Kewangan']
};

/** Folder lampiran dan dokumen yang didaftar dalam Link_Dokumen. */
var FOLDERS = [
  { kod: 'FLD_LAMPIRAN_SSU', nama: 'Lampiran SSU', modul: 'SSU' },
  { kod: 'FLD_SIJIL_SSU', nama: 'Sijil SSU (dijana)', modul: 'SSU' },
  { kod: 'FLD_TEMPLAT_SIJIL', nama: 'Templat sijil SSU', modul: 'SSU' },
  { kod: 'FLD_LAMPIRAN_LOT', nama: 'Lampiran permohonan lot', modul: 'Ruang Niaga' },
  { kod: 'FLD_RESIT_SEWA', nama: 'Resit sewa lot', modul: 'Ruang Niaga' },
  { kod: 'FLD_LAPORAN_KEWANGAN', nama: 'Laporan kewangan', modul: 'Kewangan' },
  { kod: 'FLD_LAMPIRAN_MAKERSPACE', nama: 'Lampiran Makerspace', modul: 'Makerspace' },
  { kod: 'FLD_RESIT_MAKERSPACE', nama: 'Resit Makerspace', modul: 'Makerspace' },
  { kod: 'FLD_SANDARAN', nama: 'Sandaran', modul: 'Sistem' }
];

var DOKUMEN = [
  { kod: 'TEMPLAT_SIJIL_SSU', jenis: 'Templat', modul: 'SSU', nama: 'Templat sijil SSU (Google Slides)', catatan: 'Letak fail Google Slides dalam folder FLD_TEMPLAT_SIJIL dan tampal URL di sini' },
  { kod: 'TEMPLAT_LAPORAN_KEWANGAN', jenis: 'Templat', modul: 'Kewangan', nama: 'Templat laporan kewangan', catatan: 'Tampal URL templat laporan kewangan' },
  { kod: 'TEMPLAT_SURAT_TAWARAN', jenis: 'Templat', modul: 'Ruang Niaga', nama: 'Templat surat tawaran / setuju terima (Google Docs, pilihan)', catatan: 'Pilihan: tampal URL Google Docs. Jika kosong, sistem guna surat lalai. Penanda: lihat docs/MODUL_RUANG_NIAGA.md' },
  { kod: 'TEMPLAT_PERJANJIAN_SEWA_FNB', jenis: 'Templat', modul: 'Ruang Niaga', nama: 'Templat perjanjian sewa F&B (Google Docs)', catatan: 'Wajib sebelum perjanjian F&B boleh dijana. Penanda: lihat docs/MODUL_RUANG_NIAGA.md' },
  { kod: 'TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', jenis: 'Templat', modul: 'Ruang Niaga', nama: 'Templat perjanjian sewa bukan F&B (Google Docs)', catatan: 'Wajib sebelum perjanjian bukan F&B boleh dijana. Penanda: lihat docs/MODUL_RUANG_NIAGA.md' },
  { kod: 'LOGO_UTMXCITE', jenis: 'Dokumen', modul: 'Sistem', nama: 'Logo UTM + UTMXCITE (PNG)', catatan: 'Pilihan: tampal URL fail PNG Drive untuk menggantikan logo lalai' }
];

/** Peta tab -> kod spreadsheet. */
var TAB_SS = (function () {
  var m = {};
  Object.keys(SCHEMA).forEach(function (kod) {
    Object.keys(SCHEMA[kod].tabs).forEach(function (t) { m[t] = kod; });
  });
  return m;
})();

/** Nilai lalai Tetapan (Kunci, Nilai, Penerangan). */
var TETAPAN_LALAI = [
  ['DOMAIN_PELAJAR', '@graduate.utm.my', 'Domain emel pelajar'],
  ['DOMAIN_STAF', '@utm.my', 'Domain emel staf (juga domain penyelia)'],
  ['NAMA_PENGHANTAR', 'UTMPreneur · UTMXCITE', 'Nama penghantar emel'],
  ['WEBAPP_URL', '', 'URL web app (digunakan dalam emel)'],
  ['PENGUJI_EMEL', '', 'MOD UJI sahaja: emel penguji dibenarkan menerima emel, dipisah koma'],
  ['OTP_TAMAT_MINIT', '5', 'Tempoh sah OTP (minit)'],
  ['OTP_MAKS_PERCUBAAN', '5', 'Percubaan maksimum bagi satu OTP'],
  ['OTP_MAKS_SEJAM', '3', 'Bilangan OTP maksimum bagi setiap emel sejam'],
  ['OTP_JEDA_SAAT', '60', 'Jeda minimum antara dua permintaan OTP (saat)'],
  ['OTP_MAKS_HARIAN', '1000', 'Bilangan OTP maksimum sehari (kuota emel Workspace sekitar 1500)'],
  ['SESI_JAM', '6', 'Tempoh sesi log masuk (jam, maksimum 6)'],
  ['MAKS_SAIZ_FAIL_MB', '10', 'Saiz fail muat naik maksimum (MB)'],
  ['JENIS_FAIL', 'pdf,jpg,jpeg,png,xlsx,xls', 'Jenis fail dibenarkan'],
  ['MAKS_AHLI_SSU', '12', 'Bilangan ahli maksimum bagi SSU termasuk pemilik'],
  ['MIKRO_KREDIT_MIN', '500', 'Mikro kredit minimum (RM), fasa 2'],
  ['MIKRO_KREDIT_MAKS', '3000', 'Mikro kredit maksimum (RM), fasa 2'],
  ['PROGRAM_PERUNTUKAN_MAKS', '3000', 'Peruntukan program maksimum (RM), fasa 2'],
  ['HARI_OPERASI', '1,2,3,4,5', 'Hari operasi Makerspace (1=Isnin ... 7=Ahad)'],
  ['JAM_MULA', '08:00', 'Waktu mula operasi Makerspace'],
  ['JAM_TAMAT', '17:00', 'Waktu tamat operasi Makerspace'],
  ['SLOT_MINIT', '30', 'Panjang satu slot mesin (minit)'],
  ['SLOT_MAKS_JAM', '4', 'Tempoh maksimum satu tempahan mesin (jam)'],
  ['NOTIS_HARI_BEKERJA_RUANG', '3', 'Notis minimum tempahan ruang (hari bekerja)'],
  ['JANA_BIL_SEWA_HARI', '5', 'Hari dalam bulan bil sewa dijana'],
  ['TARIKH_AKHIR_SEWA_HARI', '7', 'Hari dalam bulan tarikh akhir bayaran sewa'],
  ['JANA_LAPORAN_HARI', '1', 'Hari dalam bulan laporan kewangan dijana'],
  ['TARIKH_AKHIR_LAPORAN_HARI', '7', 'Hari dalam bulan tarikh akhir laporan kewangan'],
  ['PERINGATAN_SUSULAN_HARI', '3', 'Selang peringatan susulan (hari)'],
  ['TARIKH_AKHIR_BAYARAN_MAKERSPACE_HARI', '7', 'Hari selepas sesi untuk bayaran Makerspace'],
  ['TEMPOH_PERMOHONAN_LOT_BUKA', '', 'Tarikh buka permohonan lot (YYYY-MM-DD)'],
  ['TEMPOH_PERMOHONAN_LOT_TUTUP', '', 'Tarikh tutup permohonan lot (YYYY-MM-DD)'],
  ['SESI_SEMASA', '', 'Sesi akademik semasa, contoh 2026/2027-1'],
  ['TARIKH_MULA_SEMESTER', '', 'Tarikh mula semester semasa (YYYY-MM-DD)'],
  ['AWALAN_SIJIL', 'XCITE', 'Awalan nombor pendaftaran sijil'],
  ['SIJIL_SAH_BULAN', '12', 'Tempoh sah sijil SSU (bulan)'],
  ['SSU_PERINGATAN_HARI', '60,30,7', 'Hari sebelum tamat sijil SSU untuk emel peringatan pembaharuan'],
  ['SSU_PEMBAHARUAN_AWAL_HARI', '60', 'Pembaharuan SSU dibenarkan bermula sekian hari sebelum tamat']
];
