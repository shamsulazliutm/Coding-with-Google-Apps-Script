/**
 * UTMPreneur: Tetapan khusus modul Ruang Niaga (digabungkan ke Seed.tetapan()).
 * Setiap baris: [Kunci, Nilai lalai, Penerangan]. Nilai boleh diubah urusetia dalam tab Tetapan.
 * Nama dan jawatan penandatangan ialah DATA (bukan kod); nilai lalai di bawah diambil daripada contoh surat/perjanjian
 * dan mesti disemak sebelum pelancaran.
 */
var TETAPAN_RN = [
  ['TAWARAN_TEMPOH_HARI', '7', 'Tempoh menerima tawaran sewa lot (hari dari tarikh surat tawaran dihantar)'],
  ['TAWARAN_PERINGATAN_HARI', '4,6', 'Hari selepas tawaran dihantar untuk emel peringatan kepada pemohon (belum menjawab)'],
  ['CAGARAN_BAYAR_HARI', '14', 'Tempoh membayar cagaran (hari dari tarikh surat tawaran dihantar)'],
  ['CAGARAN_PERINGATAN_SEBELUM_HARI', '3', 'Emel peringatan bayar cagaran sekian hari sebelum tarikh akhir'],
  ['CAGARAN_PULANG_HARI', '90', 'Tempoh pemulangan cagaran selepas tamat kontrak (hari)'],
  ['CAGARAN_PERINGATAN_HARI', '60,80', 'Hari selepas tamat kontrak untuk peringatan emel kepada admin (pulangkan cagaran)'],
  ['SALINAN_FIZIKAL_HARI', '14', 'Tempoh pemulangan salinan fizikal Surat Setuju Terima (hari dari tarikh surat dihantar)'],
  ['SALINAN_FIZIKAL_PERINGATAN_HARI', '7,12', 'Hari selepas surat dihantar untuk peringatan salinan fizikal kepada pemohon'],
  ['SURAT_PENANDATANGAN_NAMA', 'PROFESOR TS DR. ALI BIN SELAMAT', 'Nama penandatangan surat tawaran (semak dan kemas kini)'],
  ['SURAT_PENANDATANGAN_JAWATAN', 'Timbalan Naib Canselor (Hal Ehwal Pelajar dan Alumni)', 'Jawatan penandatangan surat tawaran'],
  ['PERJANJIAN_PENANDATANGAN_NAMA', 'Ybrs. Prof. Ts. Dr. Ali bin Selamat', 'Nama penandatangan perjanjian bagi pihak Universiti'],
  ['PERJANJIAN_PENANDATANGAN_JAWATAN', 'Timbalan Naib Canselor (Hal Ehwal Pelajar & Alumni)', 'Jawatan penandatangan perjanjian bagi pihak Universiti'],
  ['PERJANJIAN_SAKSI_UTM_NAMA', 'Prof. Madya Dr. Syed Norris Hikmi bin Syed Abdullah', 'Nama saksi Universiti pada perjanjian'],
  ['PERJANJIAN_SAKSI_UTM_JAWATAN', 'Pengarah UTMXCITE', 'Jawatan saksi Universiti pada perjanjian'],
  ['PERJANJIAN_SAKSI_SYARIKAT_NAMA', 'Pn. Siti Noraziah binti Satapah', 'Nama saksi bagi pihak Syarikat (pegawai UTMXCITE) pada perjanjian'],
  ['PERJANJIAN_SAKSI_SYARIKAT_JAWATAN', 'Pegawai Tadbir UTMXCITE', 'Jawatan saksi bagi pihak Syarikat pada perjanjian'],
  ['ALAMAT_UTMXCITE', 'UTMXCITE, Jabatan Timbalan Naib Canselor (Hal Ehwal Pelajar dan Alumni), Universiti Teknologi Malaysia, 81310 Johor Bahru, Johor', 'Alamat notis Universiti (perjanjian dan surat)'],
  ['AKAUN_BANK_UTM', 'CIMB: 8006053536', 'Akaun bank rasmi Universiti untuk bayaran sewa dan cagaran'],
  ['PENILAIAN_BEZA_JAUH', '20', 'Beza jumlah skor (daripada 100) antara dua penilai yang ditanda sebagai berbeza jauh'],
  ['SEWA_PERINGATAN_SEBELUM_HARI', '2', 'Emel peringatan bil sewa sekian hari sebelum tarikh akhir'],
  ['TUNGGAKAN_HARI', '30', 'Bil sewa lewat lebih sekian hari ditanda sebagai tunggakan lebih satu bulan'],
  ['NOTIS_PENAMATAN_HARI', '7', 'Tempoh mengosongkan premis dalam Notis Penamatan (hari)']
];
