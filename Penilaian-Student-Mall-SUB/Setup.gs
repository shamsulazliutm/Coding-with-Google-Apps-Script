/**
 * Menyediakan sheet dan data awal. Selamat dijalankan semula: sheet yang sudah ada isi tidak ditimpa.
 * Jalankan daripada menu Penilaian > Sediakan sheet (kali pertama).
 */
function setupSheets() {
  const book = ss_();
  Object.keys(HEAD).forEach(function (name) {
    const sh = book.getSheetByName(name) || book.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]])
        .setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  // KP, matrik dan SSM mesti kekal sebagai teks
  book.getSheetByName(SH.PELAJAR).getRange('C:D').setNumberFormat('@');
  book.getSheetByName(SH.PEMOHON).getRange('D:D').setNumberFormat('@');

  seedIfEmpty_(SH.PANEL, seedPanel_());
  seedIfEmpty_(SH.SESI, [['Penilaian Student Mall & SUB', '21 Oktober 2026 (Rabu)', '9.00 pagi', 1, 'Dibuka']]);
  seedIfEmpty_(SH.RUBRIK, seedRubrik_());
  seedIfEmpty_(SH.CHIP, [['Pelan kewangan kurang realistik'], ['Idea inovatif'], ['Strategi pemasaran jelas'],
    ['Objektif tidak boleh diukur'], ['Analisis pesaing lemah'], ['Pembentangan yakin']]);
  const s = seedPemohon_();
  seedIfEmpty_(SH.PEMOHON, s.pemohon);
  seedIfEmpty_(SH.PELAJAR, s.pelajar);

  const def = book.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(def);
  writeKeputusan_();
  SpreadsheetApp.getActive().toast('Sheet sedia. Seterusnya: Deploy > New deployment > Web app.');
}

function seedIfEmpty_(name, rows) {
  const sh = ss_().getSheetByName(name);
  if (sh.getLastRow() > 1) return;
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function seedPanel_() {
  return [
    ['Dr. Noraindah binti Abdullah Fahim', 'noraindah@utm.my', 'Panel', 'Aktif'],
    ['Dr. Osman bin Ayop', 'osmanayop@utm.my', 'Panel', 'Aktif'],
    ['En. Shamsul Azli bin Shamsuray', 'shamsulazli@utm.my', 'Panel', 'Aktif'],
    ['PM. Dr. Syed Norris Hikmi Syed Abdullah', 'norris@utm.my', 'Panel', 'Aktif'],
    ['Pn. Ayu Azrin binti Abdul Aziz', 'ayuazrin@utm.my', 'Panel', 'Aktif'],
    ['Pn. Sri Nurul Izza Bte Zakaria', 'srinurulizza@utm.my', 'Panel', 'Aktif'],
    ['Admin UTMXCITE', ADMIN_EMAIL, 'Admin', 'Aktif']
  ];
}

function seedRubrik_() {
  const els = 'Penerangan perniagaan|Misi & visi|Objektif|Analisis persaingan & tinjauan pasaran|Pelan operasi|Pelan pemasaran|Perancangan kewangan';
  return [
    [1, 1, 'Organisasi keseluruhan', 'Overall organization', 10, 'Tersusun · perintah logik yang jelas · agihan tugas yang jelas',
      'Sangat tersusun, aliran logik jelas, tugas ahli jelas', 'Kebanyakannya tersusun, ada bahagian kurang jelas', 'Tidak tersusun, tugas tidak dinyatakan', ''],
    [1, 2, 'Kandungan pelan perniagaan', 'Business proposal content', 20, 'Penerangan perniagaan · misi & visi · objektif · analisis persaingan & tinjauan pasaran · pelan operasi · pelan pemasaran · perancangan kewangan',
      'Ketujuh-tujuh elemen lengkap dan berkualiti', '4 hingga 5 elemen lengkap', '2 elemen atau kurang', els],
    [1, 3, 'Penerangan perniagaan', 'Description of business', 20, 'Cadangan perniagaan · objektif yang jelas · strategi keseluruhan',
      'Cadangan jelas, objektif spesifik dan boleh diukur, strategi menyeluruh', 'Jelas tetapi umum', 'Kabur, tiada objektif', ''],
    [1, 4, 'Kebolehpasaran produk / perkhidmatan', 'Marketability of product / services', 20, 'Strategi pemasaran · tahap permintaan produk/perkhidmatan',
      'Pasaran sasaran jelas, strategi sesuai, ada bukti permintaan', 'Ada strategi tanpa bukti', 'Tiada strategi atau permintaan tidak dinyatakan', ''],
    [1, 5, 'Inovasi', 'Innovativeness', 20, 'Sesuatu yang baharu · keunikan yang memberi kelebihan daya saing',
      'Baharu dan kelebihan daya saing jelas', 'Penambahbaikan kecil daripada yang sedia ada', 'Meniru yang sedia ada', ''],
    [1, 6, 'Pengurusan kewangan', 'Financial management', 10, 'Pengurusan modal & sumber · tempoh pulangan modal · perancangan jualan · pelan penggajian (HR Plan)',
      'Modal, kos, jualan, tempoh pulangan dan pelan penggajian realistik', 'Sebahagian dirancang', 'Tiada perancangan', '']
  ];
}

function seedPemohon_() {
  const D = 'https://drive.google.com/file/d/';
  const L = '/view?usp=drive_link';
  const pemohon = [
    [1, 'MARZMELL ENTERPRISE', 'SUB', '202403283104 (003661701-A)', 'Menjual & membaiki telefon bimbit', D + '1H237JlG0IYujW2igMaexEc_SoU_c6Gar' + L, '', 1, ''],
    [2, 'NANEL ENTERPRISE', 'Student Mall', '202503046671 (003700610-V)', 'Mini mart', D + '1a8IuaqowH9BMhnE0NbU0Fgxi8mJ2EdUE' + L, '', 2, ''],
    [3, 'CHEVAL ENTERPRISE', 'Student Mall', '201803349713 (JM0883451-V)', 'Pengurusan acara / menjual pakaian & aksesori', D + '1rEoTHeiVEj8nTMxz8G5RrhPXLGNLLHVj' + L, '', 3, ''],
    [4, 'VOLTRO CAFE', 'Student Mall', '202403299581 (003667755-D)', 'Makanan & minuman (waffle & sparkling drink)', D + '1NonrrvvqHrvJDz1NlSXTEOeRcdnROfw9' + L, '', 4, ''],
    [5, 'THE CUBE', 'Student Mall', '202503075507 (JM1020317-T)', 'Makanan & minuman (shave ice)', D + '1MfMIWN1ezl3MrodD76ZOJqrlnpMH1Kun' + L, '', 5, ''],
    [6, 'MAJORA BARBER', 'Student Mall', '202503331550 (SA0646761-T)', 'Kedai gunting rambut', D + '1NdfydnbvyPuG27IzI_vf-XSJeqUcLpZD' + L, '', 6, '']
  ];
  const pelajar = [
    [1, 'UMAR ADDIN BIN ZAINAL ABIDIN', 'A24KE0315', '050205-01-0217', 3, 'FKE', 'SARJANA MUDA KEJURUTERAAN ELEKTRONIK', 2.62],
    [1, 'MUHAMMAD FAIZ HAKIMI BIN PAUZI', 'A24FM0084', '050214-11-0551', 3, 'FM', 'SARJANA MUDA PERAKAUNAN', 3.53],
    [2, 'NURUL LIYANA BINTI RAHMAD', 'A23SC0330', '040301-14-0098', 4, 'FS', 'SARJANA MUDA SAINS (KIMIA)', 2.48],
    [3, 'ARVINTHIRAN A/L THANA BALAN', 'A25KT0110', '060623-05-0341', 2, 'FKT', 'SARJANA MUDA KEJURUTERAAN KIMIA', 1.95],
    [4, 'MUHAMMAD HARITH DANIEL BIN MOHD FAWZI', 'A22EA0095', '031210-10-0619', 4, 'FKA', 'SARJANA MUDA KEJURUTERAAN AWAM', 2.39],
    [5, 'LEANNE CHUNG HUI RU', 'A24KT0314', '050505-13-1088', 3, 'FKT', 'SARJANA MUDA KEJURUTERAAN KIMIA', 3.71],
    [6, 'MUHAMMAD KHAIRUL IKHWAN BIN ABDUL RAZAK', 'A25HP0143', '031115-08-0613', 2, 'FEST', 'SARJANA MUDA TEKNOLOGI DENGAN PENDIDIKAN (KEJURUTERAAN ELEKTRIK DAN ELEKTRONIK)', 3.42]
  ];
  return { pemohon: pemohon, pelajar: pelajar };
}
