/**
 * UTMPreneur: data awal yang diisi oleh skrip persediaan (hanya jika tab kosong,
 * kecuali Tetapan dan Admin yang melengkapkan kunci/baris yang tiada).
 * Nama BM sesetengah rujukan ialah draf untuk disemak urusetia.
 */

var Seed = (function () {
  function ruj(kumpulan, items) {
    return items.map(function (it, i) {
      return { Kumpulan: kumpulan, Kod: it[0], BM: it[1], EN: it[2], Susunan: i + 1, Aktif: 'Ya' };
    });
  }

  function rujukan_() {
    var out = [];
    out = out.concat(ruj('FAKULTI', [
      ['FKA', 'Fakulti Kejuruteraan Awam', 'Faculty of Civil Engineering'],
      ['FKE', 'Fakulti Kejuruteraan Elektrik', 'Faculty of Electrical Engineering'],
      ['FKM', 'Fakulti Kejuruteraan Mekanikal', 'Faculty of Mechanical Engineering'],
      ['FKT', 'Fakulti Kejuruteraan Kimia dan Tenaga', 'Faculty of Chemical and Energy Engineering'],
      ['FC', 'Fakulti Komputeran', 'Faculty of Computing'],
      ['FS', 'Fakulti Sains', 'Faculty of Science'],
      ['FABU', 'Fakulti Alam Bina dan Ukur', 'Faculty of Built Environment and Survey'],
      ['FM', 'Fakulti Pengurusan', 'Faculty of Management'],
      ['AHIBS', 'Sekolah Perniagaan Antarabangsa Azman Hashim', 'Azman Hashim International Business School'],
      ['FSSK-PEND', 'Sekolah Pendidikan / Fakulti Sains Sosial dan Kemanusiaan', 'School of Education / Faculty of Social Science and Humanities'],
      ['FSSK-PSI', 'Sekolah Pembangunan Sumber Manusia dan Psikologi / Fakulti Sains Sosial dan Kemanusiaan', 'School of Human Resource Development and Psychology / Faculty of Social Science and Humanities'],
      ['FSSK-BHS', 'Akademi Bahasa / Fakulti Sains Sosial dan Kemanusiaan', 'Academy Language / Faculty of Social Science and Humanities'],
      ['FEST', 'Fakulti Teknologi dan Informatik Razak', 'Razak Faculty of Technology and Informatics'],
      ['MJIIT', 'Institut Teknologi Antarabangsa Malaysia-Jepun (MJIIT)', 'Malaysia-Japan International Institute of Technology (MJIIT)'],
      ['FAI', 'Fakulti Kecerdasan Buatan', 'Faculty of Artificial Intelligence'],
      ['SPACE', 'SPACE', 'SPACE']
    ]));
    out = out.concat(ruj('BIDANG', [
      ['SSH', 'Sains Sosial dan Kemanusiaan', 'Social Science & Humanities'],
      ['ICT', 'Teknologi Maklumat dan Komunikasi', 'Information, Technology and Communication'],
      ['MATH', 'Sains Matematik', 'Mathematical Science'],
      ['EDU', 'Pendidikan', 'Education'],
      ['ADM', 'Pentadbiran', 'Administration'],
      ['ECO', 'Ekonomi', 'Economy'],
      ['BMA', 'Pengurusan Perniagaan dan Perakaunan', 'Business Management and Accounting'],
      ['CIV', 'Kejuruteraan Awam', 'Civil Engineering'],
      ['ELE', 'Kejuruteraan Elektrik', 'Electrical Engineering'],
      ['MEK', 'Kejuruteraan Mekanikal', 'Mechanical Engineering'],
      ['CHE', 'Kejuruteraan Kimia dan Tenaga', 'Chemical Engineering And Energy Engineering'],
      ['APS', 'Senibina, Perancangan dan Ukur', 'Architecture, Planning and Survey'],
      ['PHC', 'Fizik dan Kimia', 'Physics and Chemistry'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('KLUSTER', [
      ['BEAUTY', 'Produk Kecantikan', 'Beauty Product'],
      ['ICT', 'IT / Digital / ICT', 'IT / Digital / ICT'],
      ['COMPUTING', 'Pengkomputeran', 'Computing'],
      ['REPAIR', 'Pembaikan (Gajet dan lain-lain)', 'Repairing (Gadget etc.)'],
      ['MANUF', 'Pembuatan', 'Manufacturing'],
      ['AGRI', 'Pertanian', 'Agriculture'],
      ['RETAIL', 'Peruncitan', 'Retailing'],
      ['AIRCOND', 'Pemasangan / Pembaikan Penyaman Udara', 'Install / Repair Air Conditioning'],
      ['ELEC', 'Kerja Elektrik', 'Electrical Work'],
      ['SPA', 'Spa dan Urutan', 'Spa & Massage'],
      ['PRODMANUF', 'Pembuatan Produk', 'Product manufacturing'],
      ['TUITION', 'Tuisyen', 'Tuition'],
      ['PRINT', 'Percetakan', 'Printing'],
      ['COURIER', 'Pos / Kurier', 'Post / Courier'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('PRODUK', [
      ['RETAIL', 'Peruncitan', 'Retail'],
      ['FNB', 'Makanan dan Minuman', 'Food & Beverage'],
      ['FASHION', 'Fesyen, Pakaian dan Aksesori', 'Fashion, Clothes & Accessories'],
      ['MOBILE', 'Telefon Mudah Alih dan Gajet', 'Mobiles & Gadgets'],
      ['COMPUTER', 'Komputer dan Aksesori', 'Computer & Accessories'],
      ['HEALTH', 'Kesihatan dan Kecantikan', 'Health & Beauty'],
      ['GAMES', 'Permainan, Buku dan Hobi', 'Games, Books and Hobbies'],
      ['PROOF', 'Penyuntingan, Terjemahan dan Semakan Bahasa', 'Proofreading, Translation and Editing Services'],
      ['DESIGN', 'Reka Bentuk Grafik, Laman Web dan Perkhidmatan Digital', 'Graphic Design, Website and Digital Services'],
      ['TRANSPORT', 'Pengangkutan', 'Transportation'],
      ['AGRI', 'Pertanian', 'Agriculture'],
      ['CONSTRUCT', 'Pembinaan', 'Construction'],
      ['SPORTS', 'Sukan dan Luar Bangunan', 'Sports & Outdoor'],
      ['PRINT3D', 'Percetakan 3D dan Robotik', '3D Printing and Robotics'],
      ['LAIN', 'Lain-lain', 'Others']
    ]));
    out = out.concat(ruj('JENIS_PERNIAGAAN', [
      ['SOLE', 'Milikan Tunggal', 'Sole Proprietorship'],
      ['PARTNER', 'Perkongsian', 'Partnership'],
      ['SDNBHD', 'Sdn. Bhd.', 'Sdn. Bhd.'],
      ['PLL', 'Perkongsian Liabiliti Terhad (PLL)', 'Partnership Limited Liability (PLL)'],
      ['FREELANCE', 'Pekerja Bebas (Freelance)', 'Free Lance'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('SUMBER_PEMBIAYAAN', [
      ['SENDIRI', 'Wang sendiri / simpanan', 'Own money / savings'],
      ['IBUBAPA', 'Sumbangan ibu bapa', 'Contribution from parents'],
      ['GERAN', 'Geran', 'Grant'],
      ['PINJAMAN', 'Pinjaman', 'Loan'],
      ['IPT', 'Bantuan kewangan IPT', 'Financial assistance from IPT'],
      ['HADIAH', 'Hadiah pertandingan', 'Competition prizes'],
      ['AGENSI', 'Dana agensi lain', 'Funding from other agencies'],
      ['NGO', 'NGO', 'NGO'],
      ['CROWD', 'Pembiayaan ramai (crowdfunding)', 'Crowdfunding'],
      ['TIADA', 'Tiada', 'None'],
      ['LAIN', 'Lain-lain', 'Others']
    ]));
    out = out.concat(ruj('PEMBERI_DANA', [
      ['KERAJAAN', 'Agensi kerajaan', 'Government agency'],
      ['SWASTA', 'Agensi swasta / industri', 'Private agency / industry'],
      ['BANK', 'Bank', 'Bank'],
      ['NGO', 'NGO', 'NGO'],
      ['IPT', 'IPT', 'IPT'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('SYARAT_SUBJEK', [
      ['UBSS1032', 'UBSS1032', 'UBSS1032'],
      ['ULRS3032', 'ULRS3032', 'ULRS3032'],
      ['MFMS1143', 'MFMS1143', 'MFMS1143'],
      ['SBSF1023', 'SBSF1023', 'SBSF1023'],
      ['TIADA', 'Tidak didaftarkan di bawah mana-mana subjek', 'Not registered under any subject requirement'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('STATUS_SSM', [
      ['YA', 'Ya', 'Yes'], ['TIDAK', 'Tidak', 'No'], ['PROSES', 'Dalam proses', 'In progress']
    ]));
    out = out.concat(ruj('ETNIK', [
      ['MELAYU', 'Melayu', 'Malay'], ['CINA', 'Cina', 'Chinese'], ['INDIA', 'India', 'Indian'],
      ['BSABAH', 'Bumiputera Sabah', 'Bumiputera Sabah'], ['BSARAWAK', 'Bumiputera Sarawak', 'Bumiputera Sarawak'],
      ['BUKANWN', 'Bukan Warganegara', 'Non-Malaysian']
    ]));
    out = out.concat(ruj('JENIS_LOT', [
      ['FNB', 'Makanan dan Minuman', 'F&B'], ['RETAIL', 'Peruncitan', 'Retail'], ['LAIN', 'Lain-lain', 'Other']
    ]));
    return out;
  }

  function lot_() {
    var out = [], i, now = new Date();
    for (i = 1; i <= 10; i++) {
      out.push({ Kod_Lot: 'SM-' + Util.pad(i, 2), Nama_Paparan: 'Student Mall - Lot ' + i, Lokasi: 'Student Mall', Blok: '', Saiz_m2: '', Jenis: '', Kadar_Sewa_RM: '', Status_Buka: 'Ditutup', Status_Lot: 'Kosong', Catatan: '', Didaftar_Oleh: 'Persediaan', Tarikh_Daftar: now });
    }
    for (i = 1; i <= 5; i++) {
      out.push({ Kod_Lot: 'SUB-' + Util.pad(i, 2), Nama_Paparan: 'SUB - Lot ' + i, Lokasi: 'SUB (Student Union Building)', Blok: '', Saiz_m2: '', Jenis: '', Kadar_Sewa_RM: '', Status_Buka: 'Ditutup', Status_Lot: 'Kosong', Catatan: '', Didaftar_Oleh: 'Persediaan', Tarikh_Daftar: now });
    }
    return out;
  }

  /** Rubrik penilaian permohonan lot (draf, boleh disunting urusetia). Jumlah 100. */
  function rubrik_() {
    var c = function (n, kod, bm, en, sub, maks, t5, t3, t1) {
      return { Jenis: 'LOT', Versi: 1, Kod_Kriteria: kod, Kriteria_BM: bm, Kriteria_EN: en, Sub_Perkara: sub, Markah_Maks: maks, Tertib: n, Tahap5: t5, Tahap3: t3, Tahap1: t1, Aktif: 'Ya' };
    };
    return [
      c(1, 'ORG', 'Organisasi keseluruhan', 'Overall organization', 'Tersusun; perintah logik yang jelas; agihan tugas yang jelas', 10,
        'Sangat tersusun, aliran logik jelas, tugas ahli jelas', 'Kebanyakannya tersusun, ada bahagian kurang jelas', 'Tidak tersusun, tugas tidak dinyatakan'),
      c(2, 'KANDUNGAN', 'Kandungan pelan perniagaan', 'Business proposal content', 'Penerangan perniagaan; misi dan visi; objektif; analisis persaingan dan tinjauan pasaran; pelan operasi; pelan pemasaran; perancangan kewangan', 20,
        'Ketujuh-tujuh elemen lengkap dan berkualiti', '4 hingga 5 elemen lengkap', '2 elemen atau kurang'),
      c(3, 'PENERANGAN', 'Penerangan perniagaan', 'Description of business', 'Cadangan perniagaan; objektif yang jelas; strategi keseluruhan', 20,
        'Cadangan jelas, objektif spesifik dan boleh diukur, strategi menyeluruh', 'Jelas tetapi umum', 'Kabur, tiada objektif'),
      c(4, 'PASARAN', 'Kebolehpasaran produk / perkhidmatan', 'Marketability of product / services', 'Strategi pemasaran; tahap permintaan produk/perkhidmatan', 20,
        'Pasaran sasaran jelas, strategi sesuai, ada bukti permintaan', 'Ada strategi tanpa bukti', 'Tiada strategi atau permintaan tidak dinyatakan'),
      c(5, 'INOVASI', 'Inovasi', 'Innovativeness', 'Sesuatu yang baharu; keunikan yang memberi kelebihan daya saing', 20,
        'Baharu dan kelebihan daya saing jelas', 'Penambahbaikan kecil daripada yang sedia ada', 'Meniru yang sedia ada'),
      c(6, 'KEWANGAN', 'Pengurusan kewangan', 'Financial management', 'Pengurusan modal dan sumber; tempoh pulangan modal; perancangan jualan; pengurusan penggajian pekerja (HR plan)', 10,
        'Modal, kos, jualan, tempoh pulangan dan pelan penggajian realistik', 'Sebahagian dirancang', 'Tiada perancangan')
    ];
  }

  /** Kadar daripada borang Makerspace. Kadar kosong = belum ditetapkan oleh urusetia. */
  function kadar_() {
    var base = [
      ['RUANG_CAJ_PERKHIDMATAN', 'Caj perkhidmatan tempahan ruang', 'per tempahan', 150],
      ['RUANG_MAKER_LAB', 'Maker Lab (kapasiti 200)', 'per hari', ''],
      ['RUANG_BILIK_MESYUARAT', 'Bilik Mesyuarat (kapasiti 20)', 'per hari', ''],
      ['LASER_CUT', 'Mesin Laser Cut', 'per 5 minit', 1],
      ['3D_PRINTER_GRAM', '3D Printer (bahan)', 'per gram', ''],
      ['3D_PRINTER_JAM', '3D Printer (masa mesin)', 'per jam', ''],
      ['PERALATAN_TANGAN', 'Peralatan tangan (pinjaman)', 'per pinjaman', ''],
      ['ALAT_FLIP_CHART', 'Flip chart', 'per hari', 10],
      ['ALAT_WHITE_BOARD', 'White board', 'per hari', 20],
      ['ALAT_SPEAKER_MIC', 'Portable speaker dan mic', 'per hari', 50],
      ['ALAT_BEANIE_BAG', 'Beanie bag', 'per hari', 5],
      ['ALAT_MEJA_PANJANG', 'Meja panjang', 'per hari', 5],
      ['ALAT_KERUSI_PLASTIK', 'Kerusi plastik / bankuet', 'per hari', 5],
      ['ALAT_LCD_PROJECTOR', 'Projektor LCD (disediakan)', 'per hari', 0],
      ['ALAT_WHITE_SCREEN', 'Skrin putih (disediakan)', 'per hari', 0],
      ['ALAT_PA_SYSTEM', 'Sistem PA (disediakan)', 'per hari', 0],
      ['ALAT_MEJA_BIASA', 'Meja biasa (disediakan)', 'per hari', 0],
      ['ALAT_KERUSI', 'Kerusi (disediakan)', 'per hari', 0],
      ['ALAT_EXTENSION_WIRE', 'Extension wire', 'per hari', '']
    ];
    var today = new Date();
    var out = [];
    base.forEach(function (b) {
      [ROLE.PELAJAR, ROLE.STAF, ROLE.LUAR].forEach(function (u) {
        out.push({ Kod_Sumber: b[0], Nama_Sumber: b[1], Jenis_Pengguna: u, Unit: b[2], Kadar_RM: b[3], Berkuat_Kuasa: today, Aktif: 'Ya' });
      });
    });
    return out;
  }

  /** Pelajar contoh rekaan (MOD UJI sahaja). Bukan data sebenar. */
  function pelajarContoh_() {
    var d = function (m, nama, emel, kp, j, etnik, kw, fak, prog, bid, thn, tel) {
      return { No_Matrik: m, Nama_Penuh: nama, Emel: emel, No_KP_Pasport: kp, Jantina: j, Etnik: etnik, Kewarganegaraan: kw, Fakulti: fak, Program: prog, Bidang_Pengajian: bid, Tahun_Pengajian: thn, No_Telefon: tel, Alamat_Kolej: 'Kolej Contoh, UTM Johor Bahru', Alamat_Rumah: 'No. 1, Jalan Contoh, 81310 Skudai', Status_Pelajar: 'Aktif', Sesi_Kemasukan: '2023/2024' };
    };
    return [
      d('A23UJ0001', 'NURUL AINA BINTI HASSAN', 'aina.contoh@graduate.utm.my', '010101-01-0001', 'Perempuan', 'Melayu', 'Warganegara', 'Fakulti Komputeran', 'BSc Sains Komputer', 'Teknologi Maklumat dan Komunikasi', 3, '0111111101'),
      d('A23UJ0002', 'AMIRUL HAKIM BIN ROSLI', 'amirul.contoh@graduate.utm.my', '010101-01-0002', 'Lelaki', 'Melayu', 'Warganegara', 'Fakulti Komputeran', 'BSc Sains Komputer', 'Teknologi Maklumat dan Komunikasi', 3, '0111111102'),
      d('A22UJ0003', 'LIM WEI JIE', 'weijie.contoh@graduate.utm.my', '010101-01-0003', 'Lelaki', 'Cina', 'Warganegara', 'Fakulti Pengurusan', 'BSc Pengurusan', 'Pengurusan Perniagaan dan Perakaunan', 4, '0111111103'),
      d('A24UJ0004', 'KAVITHA A/P RAJAN', 'kavitha.contoh@graduate.utm.my', '010101-01-0004', 'Perempuan', 'India', 'Warganegara', 'Fakulti Kejuruteraan Elektrik', 'BEng Kejuruteraan Elektrik', 'Kejuruteraan Elektrik', 2, '0111111104'),
      d('A23UJ0005', 'SYAFIQ BIN DAUD', 'syafiq.contoh@graduate.utm.my', '010101-01-0005', 'Lelaki', 'Melayu', 'Warganegara', 'Fakulti Kejuruteraan Mekanikal', 'BEng Kejuruteraan Mekanikal', 'Kejuruteraan Mekanikal', 3, '0111111105'),
      d('A24UJ0006', 'AISYAH BINTI MOHD', 'aisyah.contoh@graduate.utm.my', '010101-01-0006', 'Perempuan', 'Melayu', 'Warganegara', 'Fakulti Alam Bina dan Ukur', 'BSc Senibina', 'Senibina, Perancangan dan Ukur', 2, '0111111106'),
      d('A21UJ0007', 'JOHN DOE', 'john.contoh@graduate.utm.my', 'P1234567', 'Lelaki', 'Bukan Warganegara', 'Bukan Warganegara', 'Fakulti Sains', 'BSc Fizik', 'Fizik dan Kimia', 4, '0111111107'),
      d('A25UJ0008', 'SITI NABILAH BINTI ZAKARIA', 'nabilah.contoh@graduate.utm.my', '010101-01-0008', 'Perempuan', 'Bumiputera Sabah', 'Warganegara', 'Fakulti Sains', 'BSc Kimia', 'Fizik dan Kimia', 1, '0111111108')
    ];
  }

  function tetapan_() {
    return TETAPAN_LALAI.map(function (t) { return { Kunci: t[0], Nilai: t[1], Penerangan: t[2] }; });
  }

  function admin_() {
    return [{ Emel: ADMIN_UTAMA, Nama: 'UTMXCITE', Peranan: ROLE.ADMIN_PENUH, Modul: 'Semua', Aktif: 'Ya', Ditambah_Oleh: 'Persediaan', Tarikh: new Date() }];
  }

  return {
    rujukan: rujukan_, lot: lot_, rubrik: rubrik_, kadar: kadar_,
    pelajarContoh: pelajarContoh_, tetapan: tetapan_, admin: admin_
  };
})();
