// ===== Config.gs =====
/**
 * UTMXCITE 4 ASCEND 2030 Report
 * Konfigurasi: pemalar aplikasi, definisi 7 KPI (medan borang), sasaran awal dan data awal.
 * Sumber rujukan: Dokumen Pelan Tindakan UTMXCITE (DS 04 - Premium Employment).
 */
var APP = {
  NAME: 'UTMXCITE 4 ASCEND 2030 Report',
  WEB_URL: 'https://script.google.com/a/macros/utm.my/s/AKfycbza7zjSdub5fOgDbS6q8LFM11ByewnyUTlm8Ft4fq4l9F1MSYDsPWkkb7HTuh_rTjyi/exec', // pautan web app (menu Sheet); kosong = dikesan automatik
  TZ: 'Asia/Kuala_Lumpur',
  OTP_TTL: 300,            // saat
  OTP_MAX_ATTEMPTS: 5,
  OTP_MAX_REQUESTS: 5,     // setiap jam bagi satu e-mel
  SESSION_TTL: 21600,      // 6 jam (had maksimum CacheService)
  DASH_CACHE_TTL: 120,
  YEARS: [2026, 2027, 2028, 2029, 2030],
  PREMIUM_INCOME_RM: 4000, // ambang purata pendapatan sebulan bagi "pekerjaan premium" (lebih daripada)
  PREMIUM_TARGET_PCT: 40,  // sasaran 40% menjelang 2030
  PREMIUM_TARGET_YEAR: 2030,
  ALLOWED_EMAIL_DOMAINS: [] // contoh: ['utm.my']; kosong = semua domain
};

var SHEETS = {
  USERS: 'Pengguna',
  TARGETS: 'Sasaran',
  FACULTIES: 'Fakulti',
  RISKS: 'Risiko',
  AUDIT: 'Log_Audit',
  SETUP: 'Persediaan'
};

var ROLES = { ADMIN: 'Admin', PIC: 'PIC' };

var SYS_COLS = ['dicipta_pada', 'dicipta_oleh', 'dikemas_kini_pada', 'dikemas_kini_oleh'];

var USER_COLS = ['emel', 'nama', 'peranan', 'fakulti', 'kpi_akses', 'aktif', 'dicipta_pada'];
var TARGET_COLS = ['kpi', 'tahun', 'sasaran', 'q1', 'q2', 'q3', 'q4', 'jenis', 'bajet_rm', 'catatan'];
var FACULTY_COLS = ['kod', 'nama'];
var RISK_COLS = ['kpi', 'risiko', 'sumber', 'mitigasi', 'status', 'dikemas_kini_pada'];
var AUDIT_COLS = ['masa', 'emel', 'tindakan', 'kpi', 'rekod_id', 'ringkasan'];

/**
 * Senarai fakulti awal. SILA SEMAK dalam tab "Fakulti" selepas setup(); tab itu boleh disunting.
 * 'UTMXCITE' disertakan supaya Admin boleh merekod entiti pusat (contoh: ruang co-working).
 */
var FACULTY_SEED = [
  ['AHIBS', 'Azman Hashim International Business School'],
  ['FABU', 'Fakulti Alam Bina dan Ukur'],
  ['FAI', 'Fakulti Kecerdasan Buatan'],
  ['FC', 'Fakulti Komputeran'],
  ['FEST', 'Fakulti Sains Pendidikan dan Teknologi'],
  ['FKA', 'Fakulti Kejuruteraan Awam'],
  ['FKE', 'Fakulti Kejuruteraan Elektrik'],
  ['FKM', 'Fakulti Kejuruteraan Mekanikal'],
  ['FKT', 'Fakulti Kejuruteraan Kimia dan Tenaga'],
  ['FM', 'Fakulti Pengurusan'],
  ['FS', 'Fakulti Sains'],
  ['FSSK', 'Fakulti Sains Sosial dan Kemanusiaan'],
  ['MJIIT', 'Malaysia-Japan International Institute of Technology'],
  ['SPACE', 'UTM School of Professional and Continuing Education (UTMSPACE)'],
  ['UTMXCITE', 'UTMXCITE (Pusat)']
];

var YES_NO = ['Ya', 'Tidak'];

/** Tabung amanah UTMXCITE (laporan kedudukan kewangan). Tabung lain dipilih melalui "Lain-lain" dan dinamakan. */
var TABUNG_AMANAH = [
  { nama: 'Tabung Induk UTM XCITE', chargeline: 'A.J060000.6600.07078' },
  { nama: 'Tabung Khas Program Keusahawanan KPM - UTM XCITE', chargeline: 'A.J060000.6800.08990' },
  { nama: 'Majlis Keusahawanan Universiti Awam Malaysia (MAKMUM)', chargeline: 'A.J061100.6700.09641' },
  { nama: 'UMUM-Tabung Usahawan Urusetia HEP', chargeline: 'A.J060000.5700.08004' },
  { nama: 'Tabung Program Mikro Kredit Pelajar UTM - MTDC', chargeline: 'A.J060000.6700.08117' }
];

function tabungValidate_(c, errors, rows, existing) {
  var listed = TABUNG_AMANAH.filter(function (t) { return t.nama === c.tabung; })[0];
  var name = c.tabung === 'Lain-lain' ? String(c.tabung_lain || '').trim() : (listed ? listed.nama : '');
  if (listed) c.no_chargeline = listed.chargeline;                       // diisi automatik bagi tabung yang disenaraikan
  c.kunci = String(c.tempoh || '') + '|' + name.toLowerCase();           // satu rekod bagi setiap tabung setiap bulan

  // Peruntukan (a) dan komitmen (b) tidak perlu diisi setiap bulan: jika kosong, gunakan nilai rekod terdahulu bagi tabung yang sama dalam tahun yang sama.
  var prev = null;
  if (name && c.tempoh && !errors.tempoh) {
    (rows || []).forEach(function (r) {
      if (existing && r.id === existing.id) return;
      if (String(r.kunci).split('|')[1] !== name.toLowerCase()) return;
      if (String(r.tempoh).slice(0, 4) !== String(c.tempoh).slice(0, 4) || String(r.tempoh) >= String(c.tempoh)) return;
      if (!prev || String(r.tempoh) > String(prev.tempoh)) prev = r;
    });
  }
  var blank = function (v) { return v === '' || v === undefined || v === null; };
  if (blank(c.peruntukan_awal)) {
    if (prev) c.peruntukan_awal = Number(prev.peruntukan_awal) || 0;
    else if (!errors.peruntukan_awal) errors.peruntukan_awal = 'Wajib diisi pada laporan pertama tabung ini bagi tahun tersebut (bulan seterusnya diisi automatik).';
  }
  if (blank(c.komitmen)) c.komitmen = prev ? (Number(prev.komitmen) || 0) : 0;
  var a = Number(c.peruntukan_awal) || 0, b = Number(c.komitmen) || 0, p = Number(c.perbelanjaan) || 0;
  c.baki = Math.round((a - (b + p)) * 100) / 100;                       // d = a - (b + c)
  c.peratus = a ? Math.round(p / a * 1000) / 10 : 0;                    // % perbelanjaan daripada peruntukan
}

var LOKASI_PERNIAGAAN = ['SUB - Lot 1', 'SUB - Lot 2', 'SUB - Lot 3', 'SUB - Lot 4', 'SUB - Lot 5',
  'Student Mall - Lot 1', 'Student Mall - Lot 2', 'Student Mall - Lot 3', 'Student Mall - Lot 4', 'Student Mall - Lot 5',
  'Student Mall - Lot 6', 'Student Mall - Lot 7', 'Student Mall - Lot 8', 'Student Mall - Lot 9', 'Student Mall - Lot 10', 'Lain-lain'];

var JENIS_PERNIAGAAN = ['Runcit', 'Makanan & Minuman', 'Fesyen, Pakaian & Aksesori', 'Telefon Mudah Alih & Gajet', 'Komputer & Aksesori',
  'Kesihatan & Kecantikan', 'Permainan, Buku & Hobi', 'Penyemakan Bukti, Terjemahan & Penyuntingan', 'Reka Bentuk Grafik, Laman Web & Perkhidmatan Digital',
  'Pengangkutan', 'Pertanian', 'Pembinaan', 'Sukan & Luar', 'Percetakan 3D & Robotik', 'Lain-lain'];

/**
 * Enam fungsi UTMXCITE (mandat peringkat Universiti) = aliran proses kerja. Setiap indikator (KAI, DKAI, CKAI)
 * ditanda dengan satu `fungsi`. DKAI 1 ialah pelan merentas semua fungsi.
 */
var FUNCTIONS = [
  { id: 'minat', nama: 'Kenal pasti minat', no: 1, short: 'Identify Interest', label: 'Identify Student Entrepreneurship Interest', ms: 'Kenal pasti minat keusahawanan pelajar' },
  { id: 'latihan', nama: 'Latihan keusahawanan', no: 2, short: 'Entrepreneurship Training', label: 'Conduct Entrepreneurship Training', ms: 'Jalankan latihan keusahawanan' },
  { id: 'ideasi', nama: 'Sokong pengideaan perniagaan', no: 3, short: 'Business Ideation', label: 'Support Student Business Ideation', ms: 'Sokong pengideaan perniagaan pelajar' },
  { id: 'startup', nama: 'Bangunkan startup pelajar', no: 4, short: 'Startup Development', label: 'Facilitate Student Startup Development', ms: 'Fasilitasi pembangunan startup pelajar' },
  { id: 'prestasi', nama: 'Pantau prestasi usahawan', no: 5, short: 'Enterprise Performance', label: 'Monitor Student Enterprise Performance', ms: 'Pantau prestasi perusahaan pelajar' },
  { id: 'pameran', nama: 'Pameran inovasi pelajar', no: 6, short: 'Showcase Innovation', label: 'Showcase Student Innovation Venture', ms: 'Pamerkan inovasi dan venture pelajar' },
  { id: 'rentas', no: null, label: 'Cross-cutting', ms: 'Pelan dan tadbir urus merentas fungsi' }
];

/** Tiga peringkat penunjuk. Setiap KPI tergolong dalam satu peringkat mengikut awalan ID (KAI / DKAI / CKAI). */
/** Tiga teras Kamus KPI Keusahawanan IPT 2026-2030 (peringkat KPT). */
var TERAS = [
  { id: 't1', no: 1, label: 'Ekosistem keusahawanan pelajar yang berdaya saing' },
  { id: 't2', no: 2, label: 'Inovasi dan teknologi dalam keusahawanan' },
  { id: 't3', no: 3, label: 'Kolaborasi berimpak tinggi' }
];

var LEVELS = [
  { id: 'KPT', label: 'KPT · Peringkat Kementerian (KPI Keusahawanan IPT)', short: 'KPT · Kementerian', section: 'Peringkat Kementerian · KPT' },
  { id: 'KAI', label: 'KAI · Peringkat Universiti', short: 'KAI · Universiti', section: 'Peringkat Universiti · KAI' },
  { id: 'DKAI', label: 'DKAI · Peringkat Jabatan (JTNC HEPA)', short: 'DKAI · Jabatan (JTNC HEPA)', section: 'Peringkat Jabatan · DKAI (JTNC HEPA)' },
  { id: 'CKAI', label: 'CKAI · Peringkat Pusat (UTMXCITE)', short: 'CKAI · Pusat (UTMXCITE)', section: 'Peringkat Pusat · CKAI (UTMXCITE)' }
];

function F_(key, label, type, o) {
  var f = { key: key, label: label, type: type || 'text' };
  o = o || {};
  for (var k in o) { if (o.hasOwnProperty(k)) f[k] = o[k]; }
  return f;
}


/**
 * Medan program (CKAI 1 dan CKAI 2): satu rekod = satu program.
 * Medan wajib bagi program Selesai: tarikh mula/tamat, tempat, jumlah peserta, kos penganjuran dan pendapatan (boleh 0).
 */
function programFields_(kategori) {
  return [
    F_('fakulti', 'Fakulti / penganjur', 'faculty', { required: true, sec: 'Program' }),
    F_('nama_program', 'Nama program', 'text', { required: true }),
    F_('kategori', 'Kategori', 'select', { required: true, options: kategori }),
    F_('tahap', 'Peringkat', 'select', { options: ['Fakulti', 'Pusat (UTMXCITE)', 'Universiti', 'Kebangsaan', 'Antarabangsa'] }),
    F_('penganjur', 'Penganjur / rakan kerjasama', 'text'),
    F_('pegawai', 'Pegawai / pengarah program', 'text'),
    F_('objektif', 'Objektif program', 'textarea', { full: true }),
    F_('status', 'Status', 'select', { required: true, sec: 'Tarikh & tempat', options: ['Dirancang', 'Sedang berjalan', 'Selesai', 'Dibatalkan'] }),
    F_('tarikh_mula', 'Tarikh mula', 'date'),
    F_('tarikh_tamat', 'Tarikh tamat', 'date'),
    F_('lokasi', 'Tempat', 'text'),
    F_('bil_peserta', 'Jumlah peserta', 'number', { min: 0, sec: 'Penyertaan' }),
    F_('bil_pelajar', 'Daripada itu: pelajar', 'number', { min: 0 }),
    F_('bil_staf', 'Daripada itu: staf UTM', 'number', { min: 0 }),
    F_('bil_luar', 'Daripada itu: luar UTM (industri / komuniti / lain-lain)', 'number', { min: 0 }),
    F_('skor_kepuasan', 'Skor kepuasan peserta (0-5)', 'number', { min: 0, max: 5 }),
    F_('bajet_rm', 'Kos penganjuran (RM)', 'number', { min: 0, sec: 'Kewangan' }),
    F_('sumber_peruntukan', 'Sumber peruntukan', 'select', { options: ['Peruntukan fakulti', 'Peruntukan UTMXCITE (Pusat)', 'Penajaan / sponsor', 'Yuran penyertaan', 'Geran', 'Lain-lain'] }),
    F_('pendapatan_rm', 'Pendapatan (RM)', 'number', { min: 0 }),
    F_('sumber_pendapatan', 'Sumber pendapatan', 'select', { options: ['Yuran penyertaan', 'Penajaan / sponsor', 'Jualan produk / tiket', 'Geran', 'Lain-lain'] }),
    F_('bil_output', 'Bilangan hasil (projek / prototaip / idea / startup)', 'number', { min: 0, sec: 'Hasil & pengurusan' }),
    F_('laporan', 'Laporan program (PDF, maksimum 5 MB)', 'file', { full: true }),
    F_('lampiran', 'Pautan lampiran / berita', 'url'),
    F_('catatan', 'Catatan', 'textarea', { full: true })
  ];
}

/** Peraturan program: tarikh tamat tidak sebelum mula; pecahan peserta tidak melebihi jumlah. */
function programValidate_(c, errors) {
  if (c.tarikh_mula && c.tarikh_tamat && c.tarikh_tamat < c.tarikh_mula && !errors.tarikh_tamat) {
    errors.tarikh_tamat = 'Tarikh tamat tidak boleh sebelum tarikh mula.';
  }
  var parts = (Number(c.bil_pelajar) || 0) + (Number(c.bil_staf) || 0) + (Number(c.bil_luar) || 0);
  if (parts > 0 && c.bil_peserta === '' && !errors.bil_peserta) errors.bil_peserta = 'Isi jumlah peserta.';
  else if (c.bil_peserta !== '' && parts > c.bil_peserta && !errors.bil_peserta) {
    errors.bil_peserta = 'Jumlah peserta (' + c.bil_peserta + ') kurang daripada pelajar + staf + luar UTM (' + parts + ').';
  }
}

/** Persetujuan data peribadi mesti Ya sebelum profil boleh disimpan. */
function profilingValidate_(c, errors) {
  if (c.persetujuan === 'Tidak' && !errors.persetujuan) errors.persetujuan = 'Profiling hanya boleh didaftarkan dengan persetujuan pelajar (PDPA).';
}

/** No. KP (12 digit, sengkang dibuang) atau no. pasport. */
function icValidate_(c, errors) {
  var kp = String(c.no_kp || '').replace(/\s+/g, '').toUpperCase();
  if (kp && !errors.no_kp) {
    if (/^\d{6}-?\d{2}-?\d{4}$/.test(kp)) kp = kp.replace(/-/g, '');
    if (!/^[A-Z0-9-]{6,20}$/.test(kp)) errors.no_kp = 'No. KP / pasport tidak sah.'; else c.no_kp = kp;
  }
}

function kai3Validate_(c, errors) {
  var kp = String(c.penyewa_kp || '').replace(/\s+/g, '').toUpperCase();
  if (kp && !errors.penyewa_kp) {
    if (/^\d{6}-?\d{2}-?\d{4}$/.test(kp)) kp = kp.replace(/-/g, '');
    if (!/^[A-Z0-9-]{6,20}$/.test(kp)) errors.penyewa_kp = 'No. KP / pasport tidak sah.'; else c.penyewa_kp = kp;
  }
}

function ssuValidate_(c, errors) {
  icValidate_(c, errors);
  var partners = parseJson_(c.rakan_kongsi, []) || [];
  if (partners.length && Number(c.bil_rakan_kongsi) && !errors.rakan_kongsi && !errors.bil_rakan_kongsi && partners.length > Number(c.bil_rakan_kongsi) - 1)
    errors.rakan_kongsi = 'Bilangan rakan kongsi yang disenaraikan (' + partners.length + ') melebihi bilangan rakan kongsi tolak pemilik (' + (Number(c.bil_rakan_kongsi) - 1) + ').';
}

function makerspaceValidate_(c, errors) {
  icValidate_(c, errors);
  if (c.status_bayaran === 'Tiada Caj') c.bayaran_rm = 0;
  else if (c.status_bayaran && !errors.status_bayaran && (c.bayaran_rm === '' || c.bayaran_rm === undefined) && !errors.bayaran_rm) errors.bayaran_rm = 'Masukkan nilai bayaran (lalai RM5).';
  if (c.telefon && !errors.telefon && !/^[0-9+\-\s()]{7,20}$/.test(String(c.telefon))) errors.telefon = 'Nombor telefon tidak sah.';
  if (c.tarikh_mula && c.tarikh_tamat && !errors.tarikh_tamat && c.tarikh_tamat < c.tarikh_mula) errors.tarikh_tamat = 'Tarikh tamat mesti pada atau selepas tarikh mula.';
  if (c.tarikh_mula && c.tarikh_mula === c.tarikh_tamat && c.masa_mula && c.masa_tamat && !errors.masa_tamat && c.masa_tamat <= c.masa_mula) errors.masa_tamat = 'Masa tamat mesti selepas masa mula.';
}

function addMonthsIso_(iso, n) {
  var y = parseInt(iso.slice(0, 4), 10), m = parseInt(iso.slice(5, 7), 10) - 1 + n, d = iso.slice(8, 10);
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + ('0' + (m + 1)).slice(-2) + '-' + d;
}

/** KPT2: dua jenis rekod (graduan usahawan / penyebut tahunan bagi fakulti). Graduan dikira sekali (no. KP). */
function kpt2Validate_(c, errors) {
  icValidate_(c, errors);
  var fak = c.fakulti || '';
  if (c.jenis_rekod === 'Penyebut tahunan') {
    c.kunci = 'p|' + c.tahun + '|' + fak;
  } else {
    c.kunci = 'g|' + String(c.no_kp || '').toLowerCase();
    if (c.tarikh_tamat && c.tarikh_penubuhan && !errors.tarikh_penubuhan && c.tarikh_penubuhan > addMonthsIso_(c.tarikh_tamat, 6))
      errors.tarikh_penubuhan = 'Perniagaan mesti ditubuhkan dalam tempoh 6 bulan selepas tamat pengajian (atau lebih awal).';
  }
}

/** KPT3: satu rekod bagi setiap staf setiap tahun. */
function kpt3Validate_(c, errors) {
  icValidate_(c, errors);
  c.kunci = String(c.tahun || '') + '|' + String(c.no_staf || '').trim().toLowerCase();
}

/** KPT7: satu syarikat/projek dikira sekali bagi setiap tahun pelaporan. */
function kpt7Validate_(c, errors) {
  c.kunci = String(c.tarikh || '').slice(0, 4) + '|' + String(c.nama_syarikat || '').trim().toLowerCase();
}

var PROGRAM_DONE_REQUIRE = ['tarikh_mula', 'tarikh_tamat', 'lokasi', 'bil_peserta', 'bajet_rm', 'pendapatan_rm'];

// ---------------------------------------------------------------------------
// Definisi KPI. entry: 'faculty' = PIC fakulti + Admin; 'admin' = Admin sahaja.
// ---------------------------------------------------------------------------
var KPIS = [
  {
    id: 'KPT1', sheet: null, auto: true, group: 'KPT', teras: 't1', entry: 'auto',
    title: 'KPT 1 · Jumlah jualan agregat usahawan pelajar', short: 'Jualan agregat usahawan',
    unit: 'RM jualan setahun', measure: 'kpt1', jenis: 'minimum', valueFormat: 'rm', listColumns: [], statusField: null, rules: [], fields: []
  },
  {
    id: 'KPT2', prefix: 'K2', sheet: 'KPT2_Graduan_Usahawan', group: 'KPT', teras: 't1', entry: 'faculty',
    title: 'KPT 2 · Peratus graduan yang menceburi keusahawanan dan mewujudkan peluang pekerjaan', short: '% graduan berusahawan',
    unit: '% graduan usahawan', measure: 'kpt2', jenis: 'minimum', valueFormat: 'pct',
    listColumns: ['id', 'jenis_rekod', 'fakulti', 'nama', 'tarikh_tamat', 'kategori', 'tahun', 'bil_penyebut'],
    statusField: 'jenis_rekod', unique: ['kunci'], validate: kpt2Validate_,
    rules: [
      { when: { field: 'jenis_rekod', in: ['Graduan usahawan'] }, require: ['nama', 'no_kp', 'no_matrik', 'tarikh_tamat', 'nama_perniagaan', 'no_pendaftaran', 'tarikh_penubuhan', 'kategori'] },
      { when: { field: 'jenis_rekod', in: ['Penyebut tahunan'] }, require: ['tahun', 'bil_penyebut'] }
    ],
    fields: [
      F_('jenis_rekod', 'Jenis rekod', 'select', { required: true, sec: 'Rekod', options: ['Graduan usahawan', 'Penyebut tahunan'], hint: 'Penyebut tahunan = bilangan usahawan pelajar tahun akhir bagi fakulti anda (satu rekod setahun).' }),
      F_('fakulti', 'Fakulti', 'faculty', { required: true }),
      F_('nama', 'Nama graduan', 'text', { sec: 'Graduan usahawan' }),
      F_('no_kp', 'No. KP / pasport', 'text'),
      F_('no_matrik', 'No. matrik', 'text'),
      F_('tarikh_tamat', 'Tarikh tamat pengajian', 'date'),
      F_('nama_perniagaan', 'Nama perniagaan', 'text'),
      F_('no_pendaftaran', 'No. pendaftaran SSM / SKM / PBT', 'text'),
      F_('tarikh_penubuhan', 'Tarikh penubuhan perniagaan', 'date'),
      F_('kategori', 'Kategori', 'select', { options: ['Menubuhkan perniagaan berdaftar', 'Menjana peluang pekerjaan', 'Berkembang daripada projek pelajar', 'Model perniagaan inovatif (IP-based startup / gig bernilai tinggi)'] }),
      F_('lampiran', 'Sijil SSM / SKM / lesen PBT (PDF)', 'file', { full: true }),
      F_('tahun', 'Tahun', 'number', { min: 2026, max: 2030, sec: 'Penyebut tahunan' }),
      F_('bil_penyebut', 'Bilangan usahawan pelajar tahun akhir', 'number', { min: 0 }),
      F_('kunci', 'Kunci', 'text', { hidden: true, errorOn: 'jenis_rekod' })
    ]
  },
  {
    id: 'KPT3', prefix: 'K3', sheet: 'KPT3_Tenaga_Pengajar', group: 'KPT', teras: 't1', entry: 'faculty',
    title: 'KPT 3 · Peratus tenaga pengajar keusahawanan dalam program peningkatan kompetensi', short: '% tenaga pengajar terlibat',
    unit: '% tenaga pengajar terlibat', measure: 'kpt3', jenis: 'minimum', valueFormat: 'pct',
    listColumns: ['id', 'tahun', 'fakulti', 'nama', 'no_staf', 'terlibat', 'program'],
    statusField: 'terlibat', unique: ['kunci'], validate: kpt3Validate_,
    rules: [{ when: { field: 'terlibat', in: ['Ya'] }, require: ['peranan', 'program', 'tarikh_program'] }],
    fields: [
      F_('tahun', 'Tahun', 'number', { required: true, min: 2026, max: 2030, sec: 'Tenaga pengajar keusahawanan (berdaftar dengan Pusat)' }),
      F_('fakulti', 'Fakulti', 'faculty', { required: true }),
      F_('nama', 'Nama', 'text', { required: true }),
      F_('no_staf', 'No. staf', 'text', { required: true, errorOn: 'no_staf' }),
      F_('no_kp', 'No. KP / pasport', 'text', { required: true }),
      F_('jenis_staf', 'Jenis staf', 'select', { required: true, options: ['Staf akademik', 'Staf bukan akademik'] }),
      F_('terlibat', 'Terlibat dalam program peningkatan kompetensi?', 'yesno', { required: true, sec: 'Penglibatan' }),
      F_('peranan', 'Peranan', 'select', { options: ['Mentor', 'Pengasas bersama', 'Penyelidik komersialisasi', 'Pembimbing inkubator'] }),
      F_('program', 'Program', 'select', { options: ['Inkubator', 'Pemecut (accelerator)', 'Pemula', 'Spin-off', 'Kolaborasi industri'] }),
      F_('tarikh_program', 'Tarikh penglibatan', 'date'),
      F_('lampiran', 'Surat lantikan / sijil kompetensi (PDF)', 'file', { full: true }),
      F_('kunci', 'Kunci', 'text', { hidden: true, errorOn: 'no_staf' })
    ]
  },
  {
    id: 'KPT4', prefix: 'K4', sheet: 'KPT4_Pelajar_Inovasi', group: 'KPT', teras: 't2', entry: 'faculty',
    title: 'KPT 4 · Jumlah pelajar yang memanfaatkan inovasi dan teknologi dalam keusahawanan', short: 'Pelajar inovasi dan teknologi',
    unit: 'pelajar', measure: 'kpt4', jenis: 'minimum',
    listColumns: ['id', 'nama', 'no_matrik', 'fakulti', 'projek', 'trl', 'tarikh'],
    statusField: 'trl', unique: ['no_matrik'], validate: icValidate_, rules: [],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pelajar' }),
      F_('nama', 'Nama pelajar', 'text', { required: true }),
      F_('no_kp', 'No. KP / pasport', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true, hint: 'Setiap pelajar dikira sekali sahaja sepanjang pengajian.' }),
      F_('projek', 'Inovasi / teknologi / projek', 'text', { required: true, sec: 'Inovasi dan teknologi' }),
      F_('trl', 'Tahap kesediaan teknologi (TRL 1 hingga 3)', 'select', { required: true, options: ['TRL 1', 'TRL 2', 'TRL 3'], short: 'TRL' }),
      F_('tarikh', 'Tarikh penyertaan', 'date', { required: true }),
      F_('lampiran', 'Bukti penyertaan / penilaian TRL atau CRL (PDF)', 'file', { full: true, sec: 'Dokumen' })
    ]
  },
  {
    id: 'KPT5', sheet: null, auto: true, group: 'KPT', teras: 't2', entry: 'auto',
    title: 'KPT 5 · Jumlah syarikat pemula pelajar / graduan berasaskan inovasi dan teknologi', short: 'Syarikat pemula inovasi dan teknologi',
    unit: 'syarikat pemula', measure: 'kpt5', jenis: 'minimum', listColumns: [], statusField: null, rules: [], fields: []
  },
  {
    id: 'KPT6', prefix: 'K6', sheet: 'KPT6_Kolaborasi', group: 'KPT', teras: 't3', entry: 'faculty',
    title: 'KPT 6 · Bilangan projek / aktiviti berimpak daripada kolaborasi rasmi (tempatan dan antarabangsa)', short: 'Kolaborasi berimpak',
    unit: 'projek / aktiviti', measure: 'kpt6', jenis: 'minimum',
    listColumns: ['id', 'tajuk', 'rakan', 'skop', 'jenis_dokumen', 'fakulti', 'tarikh'],
    statusField: 'skop', rules: [],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Projek / aktiviti' }),
      F_('tajuk', 'Tajuk projek / aktiviti', 'text', { required: true, full: true }),
      F_('rakan', 'Rakan kolaborasi', 'text', { required: true }),
      F_('skop', 'Tempatan atau antarabangsa', 'select', { required: true, options: ['Tempatan', 'Antarabangsa'] }),
      F_('jenis_dokumen', 'Dokumen rasmi', 'select', { required: true, options: ['MoU', 'MoA', 'LoA', 'LoI', 'Geran penyelidikan'] }),
      F_('tarikh', 'Tarikh dokumen / mula projek', 'date', { required: true }),
      F_('penerangan_impak', 'Penerangan impak', 'textarea', { full: true }),
      F_('lampiran', 'Dokumen rasmi / laporan / sijil (PDF)', 'file', { full: true, sec: 'Dokumen' })
    ]
  },
  {
    id: 'KPT7', prefix: 'K7', sheet: 'KPT7_Pembiayaan', group: 'KPT', teras: 't3', entry: 'faculty',
    title: 'KPT 7 · Jumlah syarikat, perusahaan atau projek perniagaan yang dibiayai', short: 'Syarikat atau projek dibiayai',
    unit: 'syarikat / projek dibiayai', measure: 'kpt7', jenis: 'minimum',
    listColumns: ['id', 'nama_syarikat', 'jenis_pembiaya', 'jumlah_rm', 'fakulti', 'tarikh'],
    statusField: 'jenis_pembiaya', unique: ['kunci'], validate: kpt7Validate_, rules: [],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pembiayaan' }),
      F_('nama_syarikat', 'Nama syarikat / perusahaan / projek', 'text', { required: true, full: true, errorOn: 'nama_syarikat' }),
      F_('jenis_pembiaya', 'Jenis pembiayaan', 'select', { required: true, options: ['Pelabur budiman (angel investor)', 'Pemodal teroka (venture capital)', 'Entiti pendanaan awam', 'Geran agensi kerajaan', 'Hadiah pertandingan keusahawanan', 'Pembiayaan in-kind'] }),
      F_('jumlah_rm', 'Nilai pembiayaan (RM)', 'number', { required: true, min: 0 }),
      F_('tarikh', 'Tarikh terima', 'date', { required: true }),
      F_('lampiran', 'Surat tawaran / rekod penerimaan / pengesahan (PDF)', 'file', { full: true, sec: 'Dokumen' }),
      F_('kunci', 'Kunci', 'text', { hidden: true, errorOn: 'nama_syarikat' })
    ]
  },
  {
    id: 'KAI1', prefix: 'L1', sheet: 'KAI1_Launchpad', group: 'Growth', fungsi: 'startup', entry: 'faculty',
    title: 'KAI 1 · Menggiatkan semula UTM Launchpad', short: 'UTM Launchpad',
    unit: 'inkubator aktif', measure: 'kai1', jenis: 'minimum',
    listColumns: ['id', 'nama_inkubator', 'aliran', 'jenis', 'fakulti', 'status', 'didaftarkan'],
    statusField: 'status',
    rules: [
      { when: { field: 'didaftarkan', in: ['Ya'] }, require: ['tarikh_pendaftaran'] },
      { when: { field: 'status', in: ['Tidak aktif'] }, require: ['tarikh_tidak_aktif'] },
      { when: { field: 'status', in: ['Beroperasi'] }, require: ['tarikh_beroperasi'] }
    ],
    fields: [
      F_('aliran', 'Aliran', 'select', { required: true, sec: 'Identiti', options: ['Technology Startup', 'High-Income Gig', 'Social Enterprise'] }),
      F_('jenis', 'Jenis pelaksanaan', 'select', { required: true, options: ['Inkubator Fakulti', 'Co-working / Ruang Individu'] }),
      F_('fakulti', 'Fakulti', 'faculty', { required: true }),
      F_('nama_inkubator', 'Nama inkubator / startup', 'text', { required: true }),
      F_('bidang_fokus', 'Bidang fokus', 'text'),
      F_('penerangan', 'Penerangan ringkas', 'textarea', { full: true }),
      F_('lokasi', 'Lokasi ruang', 'text', { sec: 'Lokasi' }),
      F_('kapasiti', 'Kapasiti (tempat duduk)', 'number', { min: 0 }),
      F_('didaftarkan', 'Didaftarkan?', 'yesno', { required: true, sec: 'Pengaktifan' }),
      F_('tarikh_pendaftaran', 'Tarikh pendaftaran', 'date'),
      F_('no_pendaftaran', 'No. pendaftaran / rujukan', 'text'),
      F_('status', 'Status pembangunan', 'select', { required: true, options: ['Dicadangkan', 'Dalam pembangunan', 'Beroperasi', 'Tidak aktif'] }),
      F_('tarikh_beroperasi', 'Tarikh beroperasi', 'date'),
      F_('tarikh_tidak_aktif', 'Tarikh tidak aktif', 'date'),
      F_('bil_ahli', 'Bilangan ahli pasukan', 'number', { min: 0, sec: 'Aktiviti' }),
      F_('bil_mentor', 'Bilangan mentor', 'number', { min: 0 }),
      F_('pic_nama', 'Nama PIC inkubator', 'text', { sec: 'Pengurusan' }),
      F_('pic_emel', 'E-mel PIC inkubator', 'email'),
      F_('lampiran', 'Pautan lampiran bukti', 'url'),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'KAI2', prefix: 'M2', sheet: 'KAI2_Makerspace', group: 'Growth', fungsi: 'startup', entry: 'admin',
    title: 'KAI 2 · Perkasa UTM Makerspace jadi Hab Inovasi Pelajar', short: 'UTM Makerspace',
    unit: '% kemajuan projek', measure: 'progress', jenis: 'kemajuan',
    listColumns: ['id', 'fasa', 'nama_milestone', 'ptj', 'status', 'peratus_siap', 'pemberat'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Siap'] }, require: ['tarikh_siap'] }
    ],
    fields: [
      F_('fasa', 'Fasa', 'select', { required: true, sec: 'Identiti', options: ['Perancangan & Reka Bentuk', 'Perolehan (Tender)', 'Pengubahsuaian & Pemasangan', 'Pelancaran Rasmi & Operasi Penuh'] }),
      F_('nama_milestone', 'Nama milestone', 'text', { required: true }),
      F_('ptj', 'PTJ bertanggungjawab', 'select', { options: ['BPA', 'JTNCP', 'Library', 'UTMD', 'UTMXCITE'] }),
      F_('pegawai', 'Pegawai bertanggungjawab', 'text'),
      F_('status', 'Status', 'select', { required: true, sec: 'Kemajuan', options: ['Belum mula', 'Dalam proses', 'Siap', 'Tertunda'] }),
      F_('peratus_siap', 'Peratus siap (0-100)', 'number', { required: true, min: 0, max: 100 }),
      F_('pemberat', 'Pemberat terhadap keseluruhan projek (%)', 'number', { required: true, min: 0, max: 100 }),
      F_('tarikh_mula', 'Tarikh mula', 'date', { sec: 'Jadual' }),
      F_('tarikh_sasaran', 'Tarikh sasaran siap', 'date'),
      F_('tarikh_siap', 'Tarikh sebenar siap', 'date'),
      F_('no_tender', 'No. rujukan tender', 'text', { sec: 'Perolehan' }),
      F_('status_tender', 'Status tender', 'select', { options: ['Tidak berkaitan', 'Penyediaan', 'Iklan', 'Penilaian', 'Anugerah'] }),
      F_('peruntukan_rm', 'Peruntukan (RM)', 'number', { min: 0 }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('isu', 'Isu / halangan', 'textarea', { full: true }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'KAI3', prefix: 'R3', sheet: 'KAI3_Ruang_Perniagaan', group: 'Growth', fungsi: 'startup', entry: 'admin',
    title: 'KAI 3 · Ruang & kemudahan perniagaan pelajar', short: 'Ruang Perniagaan',
    unit: 'ruang ditawarkan', measure: 'kai3', jenis: 'minimum',
    renamed: { kolej_fakulti: 'lokasi' }, // tajuk lajur lama dinamakan semula oleh setup() (data dikekalkan)
    retired: ['kaedah_perolehan', 'no_rujukan', 'anggaran_kos', 'ptj', 'pegawai', 'tarikh_dikenalpasti', 'tarikh_sasaran_siap', 'diwartakan', 'tarikh_diwartakan'], // lajur dibuang daripada Sheet oleh setup()
    listColumns: ['id', 'kod_lot', 'jenis_ruang', 'lokasi', 'status', 'tarikh_ditawarkan'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Ditawarkan', 'Disewa'] }, require: ['tarikh_ditawarkan'] },
      { when: { field: 'status', in: ['Disewa'] }, require: ['penyewa_nama', 'penyewa_kp', 'tarikh_mula_sewa'] }
    ],
    validate: kai3Validate_,
    fields: [
      F_('kod_lot', 'Nama / kod lot', 'text', { required: true, sec: 'Identiti' }),
      F_('jenis_ruang', 'Jenis ruang', 'select', { required: true, options: ['Student Mall', 'Student Union Building (SUB)', 'Kiosk / Lot Mudah Alih', 'Bilik / Ruang Perniagaan', 'Lain-lain'] }),
      F_('lokasi', 'Lokasi', 'text', { required: true }),
      F_('bangunan', 'Bangunan / zon', 'text'),
      F_('keluasan', 'Keluasan (m²)', 'number', { min: 0 }),
      F_('status', 'Status ruang', 'select', { required: true, sec: 'Status', options: ['Dikenal pasti', 'Spesifikasi disediakan', 'Dalam perolehan', 'Siap', 'Ditawarkan', 'Disewa', 'Tidak aktif'] }),
      F_('tarikh_ditawarkan', 'Tarikh ditawarkan kepada pelajar', 'date'),
      F_('penyewa_nama', 'Nama pelajar / pasukan penyewa', 'text', { sec: 'Sewaan' }),
      F_('penyewa_matrik', 'No. matrik penyewa', 'text'),
      F_('penyewa_kp', 'No. KP penyewa', 'text', { hint: 'No. KP 12 digit (tanpa sengkang) atau no. pasport. Wajib jika status Disewa.' }),
      F_('nama_perniagaan', 'Nama perniagaan', 'text'),
      F_('tarikh_mula_sewa', 'Tarikh mula sewa', 'date'),
      F_('tarikh_tamat_sewa', 'Tarikh tamat sewa', 'date'),
      F_('kadar_sewa', 'Kadar sewa (RM/bulan)', 'number', { min: 0 }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'KAI4', prefix: 'G4', sheet: 'KAI4_GiGA', group: 'Transform', fungsi: 'latihan', entry: 'faculty',
    title: 'KAI 4 · Premium Gig Academy (GiGA)', short: 'GiGA',
    unit: 'pelajar mendaftar', measure: 'kai4', jenis: 'minimum', perFacultyTarget: 2,
    listColumns: ['id', 'nama_pelajar', 'no_matrik', 'fakulti', 'status', 'bootcamp_status'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Mendaftar', 'Tamat'] }, require: ['tarikh_daftar'] }
    ],
    validate: icValidate_,
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pelajar' }),
      F_('nama_pelajar', 'Nama pelajar', 'text', { required: true }),
      F_('no_kp', 'No. KP / pasport', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('emel', 'E-mel', 'email'),
      F_('telefon', 'No. telefon', 'text'),
      F_('program', 'Program', 'text'),
      F_('tahun_pengajian', 'Tahun pengajian', 'number', { min: 1, max: 8 }),
      F_('tarikh_memohon', 'Tarikh memohon', 'date', { sec: 'Permohonan & pemilihan' }),
      F_('bidang_gig', 'Bidang gig', 'text'),
      F_('portfolio', 'Pautan portfolio', 'url'),
      F_('status', 'Status', 'select', { required: true, options: ['Memohon', 'Dalam semakan', 'Mendaftar', 'Tamat', 'Tidak dipilih', 'Tarik diri'] }),
      F_('tarikh_daftar', 'Tarikh mendaftar', 'date'),
      F_('mentor_nama', 'Nama mentor', 'text', { sec: 'Mentor 1:1' }),
      F_('mentor_organisasi', 'Organisasi mentor', 'text'),
      F_('sesi_mentor', 'Bilangan sesi mentor', 'number', { min: 0 }),
      F_('bootcamp_status', 'Status bootcamp 3+3', 'select', { sec: 'Bootcamp & pitching', options: ['Belum mula', 'Sedang berjalan', 'Tamat'] }),
      F_('bootcamp_mula', 'Tarikh mula bootcamp', 'date'),
      F_('bootcamp_tamat', 'Tarikh tamat bootcamp', 'date'),
      F_('kehadiran', 'Kehadiran (%)', 'number', { min: 0, max: 100 }),
      F_('gig_diperoleh', 'Gig diperoleh?', 'yesno', { sec: 'Hasil gig' }),
      F_('gig_klien', 'Klien / platform', 'text'),
      F_('gig_pendapatan', 'Pendapatan gig (RM)', 'number', { min: 0 }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'KAI5', prefix: 'F5', sheet: 'KAI5_FSIP', group: 'Transform', fungsi: 'startup', entry: 'admin',
    title: 'KAI 5 · Founder Self-Internship Program (F-SIP)', short: 'F-SIP',
    unit: 'pelajar mendaftar', measure: 'kai5', jenis: 'minimum',
    listColumns: ['id', 'nama_pelajar', 'no_matrik', 'fakulti', 'nama_startup', 'status'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Mendaftar', 'Tamat'] }, require: ['tarikh_daftar'] }
    ],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pelajar' }),
      F_('nama_pelajar', 'Nama pelajar', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('emel', 'E-mel', 'email'),
      F_('telefon', 'No. telefon', 'text'),
      F_('program', 'Program', 'text'),
      F_('tahun_pengajian', 'Tahun pengajian', 'number', { min: 1, max: 8 }),
      F_('tarikh_bincang_caq', 'Tarikh perbincangan dengan CAQ & Fakulti', 'date', { sec: 'Kelulusan' }),
      F_('kelulusan_caq', 'Kelulusan Curriculum and Academic Quality (CAQ)', 'select', { options: ['Belum', 'Dalam semakan', 'Diluluskan', 'Tidak diluluskan'] }),
      F_('kelulusan_senat', 'Kelulusan Senat', 'select', { options: ['Belum', 'Dalam semakan', 'Diluluskan', 'Tidak diluluskan'] }),
      F_('kertas_konsep_status', 'Status kertas konsep', 'select', { options: ['Belum mula', 'Dalam penyediaan', 'Dihantar', 'Diluluskan'] }),
      F_('tarikh_hantar_kertas', 'Tarikh hantar kertas konsep', 'date'),
      F_('tarikh_lulus_kertas', 'Tarikh kertas konsep diluluskan', 'date'),
      F_('nama_startup', 'Nama startup / projek', 'text', { sec: 'Startup & latihan industri (LI)' }),
      F_('bidang', 'Bidang', 'text'),
      F_('ringkasan', 'Ringkasan idea', 'textarea', { full: true }),
      F_('penyelia_li', 'Penyelia LI (staf akademik)', 'text'),
      F_('mentor_industri', 'Mentor industri', 'text'),
      F_('status', 'Status program', 'select', { required: true, options: ['Dicalonkan', 'Dalam kelulusan', 'Mendaftar', 'Tamat', 'Tarik diri'] }),
      F_('tarikh_daftar', 'Tarikh mendaftar', 'date'),
      F_('tarikh_mula_li', 'Tarikh mula LI', 'date'),
      F_('tarikh_tamat_li', 'Tarikh tamat LI', 'date'),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'KAI6', prefix: 'A6', sheet: 'KAI6_AI_Startup', group: 'Transform', fungsi: 'startup', entry: 'faculty',
    title: 'KAI 6 · Tubuhkan UTM AI Start Up', short: 'UTM AI Start Up',
    unit: 'pelajar dilatih', measure: 'kai6', jenis: 'minimum', perFacultyTarget: 5,
    facultyWhitelist: ['FAI', 'FC', 'FKE', 'MJIIT'],
    listColumns: ['id', 'nama_pelajar', 'no_matrik', 'fakulti', 'nama_startup', 'status'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Dalam latihan', 'Tamat latihan'] }, require: ['tarikh_mula_latihan'] },
      { when: { field: 'startup_ditubuhkan', in: ['Ya'] }, require: ['tarikh_penubuhan'] }
    ],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pelajar' }),
      F_('nama_pelajar', 'Nama pelajar', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('emel', 'E-mel', 'email'),
      F_('telefon', 'No. telefon', 'text'),
      F_('program', 'Program', 'text'),
      F_('tahun_pengajian', 'Tahun pengajian', 'number', { min: 1, max: 8 }),
      F_('hadir_taklimat', 'Hadir taklimat?', 'yesno', { sec: 'Taklimat & pencalonan' }),
      F_('tarikh_pencalonan', 'Tarikh pencalonan', 'date'),
      F_('dicalonkan_oleh', 'Dicalonkan oleh', 'text'),
      F_('status', 'Status', 'select', { required: true, options: ['Dicalonkan', 'Dipilih', 'Dalam latihan', 'Tamat latihan', 'Tarik diri'] }),
      F_('tarikh_mula_latihan', 'Tarikh mula latihan', 'date'),
      F_('nama_startup', 'Nama startup AI', 'text', { sec: 'Pasukan / startup' }),
      F_('nama_pasukan', 'Nama pasukan', 'text'),
      F_('peranan', 'Peranan dalam pasukan', 'text'),
      F_('bidang_ai', 'Bidang AI', 'text'),
      F_('ringkasan', 'Ringkasan idea', 'textarea', { full: true }),
      F_('mentor_industri', 'Mentor industri', 'text'),
      F_('bootcamp_status', 'Status bootcamp 5+5', 'select', { sec: 'Bootcamp & outreach', options: ['Belum mula', 'Sedang berjalan', 'Tamat'] }),
      F_('kehadiran', 'Kehadiran bootcamp (%)', 'number', { min: 0, max: 100 }),
      F_('showcase', 'Pameran produk (showcase) disertai?', 'yesno'),
      F_('top5', 'Disenarai Top 5?', 'yesno'),
      F_('negara_acara', 'Negara / acara Global Outreach', 'text'),
      F_('tarikh_outreach', 'Tarikh Global Outreach', 'date'),
      F_('startup_ditubuhkan', 'Startup ditubuhkan?', 'yesno', { sec: 'Penubuhan startup' }),
      F_('tarikh_penubuhan', 'Tarikh penubuhan', 'date'),
      F_('no_ssm', 'No. pendaftaran syarikat', 'text'),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'DKAI1', prefix: 'D1', sheet: 'DKAI1_Pelan', group: 'Department', fungsi: 'rentas', entry: 'admin',
    title: 'DKAI 1 · Pelan Pemerkasaan Keusahawanan Pelajar', short: 'Pelan Keusahawanan',
    unit: '% kemajuan pelan', measure: 'progress', jenis: 'kemajuan',
    listColumns: ['id', 'peringkat', 'nama_milestone', 'suku_sasaran', 'status', 'peratus_siap', 'pemberat'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Siap'] }, require: ['tarikh_siap'] }
    ],
    fields: [
      F_('peringkat', 'Peringkat', 'select', { required: true, sec: 'Identiti', options: ['Bengkel Pra-Pelan', 'Kelulusan'] }),
      F_('nama_milestone', 'Nama milestone', 'text', { required: true }),
      F_('suku_sasaran', 'Suku tahun sasaran', 'select', { options: ['Q1', 'Q2', 'Q3', 'Q4'] }),
      F_('status', 'Status', 'select', { required: true, sec: 'Kemajuan', options: ['Belum mula', 'Dalam proses', 'Siap'] }),
      F_('peratus_siap', 'Peratus siap (0-100)', 'number', { required: true, min: 0, max: 100 }),
      F_('pemberat', 'Pemberat terhadap keseluruhan pelan (%)', 'number', { required: true, min: 0, max: 100 }),
      F_('tarikh_mula', 'Tarikh mula', 'date', { sec: 'Jadual' }),
      F_('tarikh_sasaran', 'Tarikh sasaran siap', 'date'),
      F_('tarikh_siap', 'Tarikh sebenar siap', 'date'),
      F_('tarikh_bengkel', 'Tarikh bengkel', 'date', { sec: 'Bengkel pra-pelan (Q1-Q2)' }),
      F_('tempat', 'Tempat', 'text'),
      F_('bil_peserta', 'Bilangan peserta', 'number', { min: 0 }),
      F_('pihak_terlibat', 'Pihak terlibat', 'text'),
      F_('output_draf', 'Output / draf pelan (pautan)', 'url'),
      F_('badan_kelulusan', 'Badan kelulusan', 'select', { sec: 'Kelulusan (Q3-Q4)', options: ['JKE HEPA', 'JPU', 'Lain-lain'] }),
      F_('tarikh_mesyuarat', 'Tarikh mesyuarat', 'date'),
      F_('keputusan', 'Keputusan', 'select', { options: ['Belum dikemukakan', 'Dikemukakan', 'Diluluskan', 'Dipinda'] }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('isu', 'Isu / halangan', 'textarea', { full: true }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  // ------------------------------------------------------------------ CKAI (Center Key Amal Indicator) - mengikut enam fungsi UTMXCITE
  {
    id: 'CKAI1', prefix: 'PF', sheet: 'CKAI1_Profiling_Pelajar', fungsi: 'minat', group: 'Center', entry: 'faculty',
    title: 'CKAI 1 · Bilangan profiling pelajar yang didaftarkan', short: 'Profiling Pelajar',
    unit: 'profiling didaftarkan', measure: 'profiling', jenis: 'minimum',
    // Satu rekod = satu pelajar yang telah diprofilkan (satu profil bagi setiap no. matrik). Medan akan diperhalusi apabila proses profiling direka.
    listColumns: ['id', 'nama_pelajar', 'no_matrik', 'fakulti', 'tarikh_profiling', 'tahap_minat', 'tahap_kesediaan'],
    statusField: 'tahap_minat', filter2: 'tahap_kesediaan',
    unique: ['no_matrik'],
    validate: profilingValidate_,
    rules: [],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pelajar' }),
      F_('nama_pelajar', 'Nama pelajar', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('emel', 'E-mel', 'email'),
      F_('telefon', 'No. telefon', 'text'),
      F_('program', 'Program pengajian', 'text'),
      F_('tahun_pengajian', 'Tahun pengajian', 'number', { min: 1, max: 8 }),
      F_('tarikh_profiling', 'Tarikh profiling didaftarkan', 'date', { required: true, sec: 'Profiling' }),
      F_('sumber_profiling', 'Sumber profiling', 'select', { required: true, options: ['Tinjauan / soal selidik', 'Saringan fakulti', 'Pendaftaran minat', 'Rujukan pensyarah / mentor', 'Penyertaan program UTMXCITE', 'Lain-lain'] }),
      F_('tahap_minat', 'Tahap minat keusahawanan', 'select', { required: true, options: ['Tiada minat', 'Rendah', 'Sederhana', 'Tinggi'] }),
      F_('minat_bidang', 'Bidang minat', 'select', { options: ['Kejuruteraan & Teknologi', 'Digital / AI', 'Sains & Kesihatan', 'Alam Bina & Kemampanan', 'Sosial & Pendidikan', 'Perniagaan & Keusahawanan', 'Lain-lain'] }),
      F_('pengalaman_perniagaan', 'Pengalaman perniagaan', 'select', { options: ['Tiada', 'Pernah berniaga', 'Sedang berniaga'] }),
      F_('tahap_kesediaan', 'Tahap kesediaan', 'select', { options: ['Belum ada idea', 'Ada idea', 'Ada prototaip / MVP', 'Sudah beroperasi'] }),
      F_('kemahiran', 'Kemahiran / bakat', 'textarea', { full: true }),
      F_('cadangan_tindakan', 'Cadangan tindakan seterusnya', 'select', { options: ['Latihan keusahawanan', 'Sokongan pengideaan', 'Pembangunan startup', 'Tiada tindakan'] }),
      F_('persetujuan', 'Persetujuan pelajar menggunakan data peribadi (PDPA)', 'yesno', { required: true, sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'CKAI2', prefix: 'PK', sheet: 'CKAI2_Program_Keusahawanan', fungsi: 'latihan', group: 'Center', entry: 'faculty',
    title: 'CKAI 2 · Bilangan program keusahawanan', short: 'Program Keusahawanan',
    unit: 'program selesai', measure: 'program', jenis: 'minimum',
    listColumns: ['id', 'nama_program', 'kategori', 'fakulti', 'tarikh_mula', 'lokasi', 'bil_peserta', 'bajet_rm', 'pendapatan_rm', 'status'],
    statusField: 'status',
    rules: [{ when: { field: 'status', in: ['Selesai'] }, require: PROGRAM_DONE_REQUIRE }],
    validate: programValidate_,
    fields: programFields_(['Bengkel', 'Kursus / Latihan', 'Bootcamp', 'Pertandingan', 'Seminar / Forum', 'Mentoring', 'Lain-lain'])
  },
  {
    id: 'CKAI3', prefix: 'PI', sheet: 'CKAI3_Program_Inovasi', fungsi: 'ideasi', group: 'Center', entry: 'faculty',
    title: 'CKAI 3 · Bilangan program inovasi', short: 'Program Inovasi',
    unit: 'program selesai', measure: 'program', jenis: 'minimum',
    listColumns: ['id', 'nama_program', 'kategori', 'fakulti', 'tarikh_mula', 'lokasi', 'bil_peserta', 'bajet_rm', 'pendapatan_rm', 'status'],
    statusField: 'status',
    rules: [{ when: { field: 'status', in: ['Selesai'] }, require: PROGRAM_DONE_REQUIRE }],
    validate: programValidate_,
    fields: programFields_(['Bengkel', 'Hackathon / Pertandingan', 'Pameran / Showcase', 'Latihan Teknikal', 'Seminar / Forum', 'Lain-lain'])
  },
  {
    id: 'CKAI4', prefix: 'SS', sheet: 'CKAI4_SSU', fungsi: 'startup', group: 'Center', entry: 'admin',
    title: 'CKAI 4 · Bilangan pendaftaran SSU (Sistem Syarikat Universiti)', short: 'Pendaftaran SSU',
    unit: 'pendaftaran SSU', measure: 'ssu', jenis: 'minimum',
    listColumns: ['id', 'nama_syarikat', 'nama_pelajar', 'fakulti', 'tarikh_daftar', 'status'],
    statusField: 'status',
    rules: [{ when: { field: 'jenis_perniagaan', in: ['Lain-lain'] }, require: ['jenis_perniagaan_lain'] },
      { when: { field: 'status_ssm', in: ['Berdaftar'] }, require: ['tarikh_ssm'] },
      { when: { field: 'berasaskan_inovasi', in: ['Ya'] }, require: ['trl_syarikat'] }],
    validate: ssuValidate_,
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pemilik' }),
      F_('nama_pelajar', 'Nama pemilik', 'text', { required: true }),
      F_('no_kp', 'No. KP / pasport', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('emel', 'E-mel', 'email'),
      F_('telefon', 'No. telefon', 'text'),
      F_('nama_syarikat', 'Nama syarikat / perniagaan', 'text', { required: true, sec: 'Pendaftaran SSU' }),
      F_('jenis_perniagaan', 'Jenis perniagaan', 'select', { required: true, options: JENIS_PERNIAGAAN }),
      F_('jenis_perniagaan_lain', 'Nama jenis perniagaan lain', 'text', { hint: 'Wajib jika memilih Lain-lain.' }),
      F_('bil_rakan_kongsi', 'Bilangan rakan kongsi perniagaan (termasuk pemilik / ketua pasukan)', 'number', { required: true, min: 1, max: 13 }),
      F_('rakan_kongsi', 'Rakan kongsi lain (nama, no. matrik, no. KP)', 'people', { full: true, max: 12, noun: 'rakan kongsi' }),
      F_('no_ssu', 'No. pendaftaran SSU', 'text', { required: true }),
      F_('tarikh_daftar', 'Tarikh pendaftaran', 'date', { required: true }),
      F_('status_ssm', 'Status pendaftaran SSM', 'select', { required: true, options: ['Berdaftar', 'Tidak Berdaftar'] }),
      F_('tarikh_ssm', 'Tarikh pendaftaran SSM', 'date', { hint: 'Wajib jika status SSM Berdaftar.' }),
      F_('sijil_ssm', 'Attachment SSM (PDF)', 'file', { full: true, hint: 'Sijil / bukti pendaftaran SSM. PDF sahaja, maksimum 5 MB.' }),
      F_('status', 'Status', 'select', { required: true, options: ['Aktif', 'Tidak Aktif'] }),
      F_('berasaskan_inovasi', 'Berasaskan inovasi dan teknologi?', 'yesno', { sec: 'KPT 5 · inovasi dan teknologi' }),
      F_('trl_syarikat', 'TRL syarikat (TRL 4 hingga 6)', 'select', { options: ['TRL 4', 'TRL 5', 'TRL 6'], short: 'TRL' }),
      F_('catatan', 'Catatan', 'textarea', { full: true, sec: 'Pengurusan' })
    ]
  },
  {
    id: 'CKAI5', prefix: 'MS', sheet: 'CKAI5_Makerspace', fungsi: 'startup', group: 'Center', entry: 'admin',
    title: 'CKAI 5 · Bilangan penggunaan Makerspace', short: 'Penggunaan Makerspace',
    unit: 'permohonan penggunaan', measure: 'makerspace', jenis: 'minimum',
    listColumns: ['id', 'nama', 'no_matrik', 'peralatan', 'tarikh_mula', 'bil_peserta', 'status_bayaran', 'bayaran_rm', 'borang'],
    statusField: 'status_bayaran',
    rules: [{ when: { field: 'peralatan', in: ['Lain-lain (Other)'] }, require: ['peralatan_lain'] }],
    validate: makerspaceValidate_,
    fields: [
      F_('emel', 'E-mel', 'email', { required: true, sec: 'Pemohon' }),
      F_('nama', 'Nama penuh', 'text', { required: true }),
      F_('no_kp', 'No. KP / pasport', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('fakulti', 'Fakulti', 'faculty', { required: true }),
      F_('kelas', 'Jabatan / unit / kelas', 'text'),
      F_('telefon', 'No. telefon', 'text', { required: true }),
      F_('peralatan', 'Peralatan dipohon', 'select', { required: true, sec: 'Permohonan', options: ['3D Printer', 'Laser Cutter Machine', 'Peralatan Tangan (Tools)', 'Sewaan Ruang (Space Rental)', 'Lain-lain (Other)'] }),
      F_('peralatan_lain', 'Nama peralatan lain', 'text', { hint: 'Wajib jika memilih Lain-lain (Other).' }),
      F_('tujuan', 'Tujuan permohonan', 'textarea', { required: true, full: true }),
      F_('bil_peserta', 'Bil. peserta', 'number', { required: true, min: 1 }),
      F_('tarikh_mula', 'Tarikh mula', 'date', { required: true, sec: 'Tarikh dan masa' }),
      F_('tarikh_tamat', 'Tarikh tamat', 'date', { required: true }),
      F_('masa_mula', 'Masa mula', 'time', { required: true }),
      F_('masa_tamat', 'Masa tamat', 'time', { required: true }),
      F_('status_bayaran', 'Bayaran caj', 'select', { required: true, sec: 'Caj perkhidmatan', options: ['Bayar', 'Belum Dibayar', 'Tiada Caj'] }),
      F_('bayaran_rm', 'Bayaran (RM)', 'number', { short: 'Bayaran RM', min: 0, def: 5, hint: 'Lalai RM5. Diset RM0 secara automatik jika "Tiada Caj".' }),
      F_('borang', 'Borang permohonan (PDF)', 'file', { full: true, sec: 'Dokumen' })
    ]
  },
  {
    id: 'CKAI6', prefix: 'SI', sheet: 'CKAI6_Sewaan_Inkubator', fungsi: 'startup', group: 'Center', entry: 'admin',
    title: 'CKAI 6 · Pendapatan sewaan ruang niaga', short: 'Sewaan ruang niaga',
    unit: 'RM sewaan diterima', measure: 'rent', jenis: 'minimum', valueFormat: 'rm',
    listColumns: ['id', 'tempoh', 'inkubator', 'penyewa', 'jumlah_rm', 'status_bayaran'],
    statusField: 'status_bayaran',
    rules: [{ when: { field: 'status_bayaran', in: ['Dibayar'] }, require: ['tarikh_bayar'] }],
    fields: [
      F_('tempoh', 'Bulan', 'month', { required: true, sec: 'Sewaan bulanan' }),
      F_('inkubator', 'Ruang niaga', 'text', { required: true }),
      F_('penyewa', 'Penyewa (syarikat / pasukan)', 'text', { required: true }),
      F_('jumlah_rm', 'Jumlah sewa (RM)', 'number', { required: true, min: 0 }),
      F_('status_bayaran', 'Status bayaran', 'select', { required: true, options: ['Dibayar', 'Belum dibayar', 'Tertunggak'] }),
      F_('tarikh_bayar', 'Tarikh bayaran', 'date'),
      F_('no_resit', 'No. resit / rujukan', 'text'),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'CKAI7', prefix: 'PP', sheet: 'CKAI7_Pendapatan_Pelajar', fungsi: 'prestasi', group: 'Center', entry: 'faculty',
    title: 'CKAI 7 · Pendapatan usahawan pelajar', short: 'Pendapatan Usahawan',
    unit: 'RM pendapatan', measure: 'income', jenis: 'minimum', valueFormat: 'rm',
    listColumns: ['id', 'tempoh', 'nama_perniagaan', 'fakulti', 'jenis_pendapatan', 'pendapatan_rm'],
    statusField: 'jenis_pendapatan',
    rules: [{ when: { field: 'lokasi_perniagaan', in: ['Lain-lain'] }, require: ['lokasi_perniagaan_lain'] }],
    validate: icValidate_,
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pendapatan bulanan' }),
      F_('tempoh', 'Bulan', 'month', { required: true }),
      F_('nama_perniagaan', 'Nama perniagaan / syarikat', 'text', { required: true }),
      F_('lokasi_perniagaan', 'Lokasi perniagaan', 'select', { options: LOKASI_PERNIAGAAN }),
      F_('lokasi_perniagaan_lain', 'Nama lokasi lain', 'text', { hint: 'Wajib jika memilih Lain-lain.' }),
      F_('nama_pelajar', 'Nama pelajar', 'text'),
      F_('no_kp', 'No. KP / pasport', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text'),
      F_('no_ssu', 'No. pendaftaran SSU (jika ada)', 'text'),
      F_('jenis_pendapatan', 'Jenis pendapatan', 'select', { required: true, options: ['Jualan produk', 'Perkhidmatan / Gig', 'Geran / Pembiayaan', 'Lain-lain'] }),
      F_('pendapatan_rm', 'Pendapatan (RM)', 'number', { required: true, min: 0 }),
      F_('laporan_kewangan', 'Attach your Monthly Financial Report', 'file', { full: true, sec: 'Dokumen', hint: 'Laporan kewangan bulanan dalam format PDF, maksimum 5 MB.' }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', {}),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'CKAI8', prefix: 'IN', sheet: 'CKAI8_Inovasi_Pelajar', fungsi: 'pameran', group: 'Center', entry: 'faculty',
    title: 'CKAI 8 · Bilangan inovasi pelajar yang dihasilkan', short: 'Inovasi Pelajar',
    unit: 'inovasi menyertai pertandingan', measure: 'innovation', jenis: 'minimum',
    // OD: projek inovasi pelajar yang TELAH menyertai pertandingan, sekurang-kurangnya peringkat Fakulti.
    listColumns: ['id', 'tajuk_inovasi', 'fakulti', 'nama_pertandingan', 'peringkat', 'tarikh', 'pingat', 'status_peningkatan'],
    statusField: 'peringkat', filter2: 'status_peningkatan',
    rules: [
      { when: { field: 'status_peningkatan', in: ['Calon peningkatan', 'Sedang disokong', 'Telah dibawa ke peringkat lebih tinggi'] }, require: ['peringkat_sasaran'] }
    ],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Inovasi' }),
      F_('tajuk_inovasi', 'Tajuk inovasi / projek', 'text', { required: true }),
      F_('jenis_inovasi', 'Jenis inovasi', 'select', { required: true, options: ['Produk fizikal', 'Aplikasi / perisian', 'Perkhidmatan', 'Proses / kaedah', 'Model perniagaan', 'Lain-lain'] }),
      F_('bidang', 'Bidang', 'select', { options: ['Kejuruteraan & Teknologi', 'Digital / AI', 'Sains & Kesihatan', 'Alam Bina & Kemampanan', 'Sosial & Pendidikan', 'Perniagaan & Keusahawanan', 'Lain-lain'] }),
      F_('penerangan', 'Penerangan ringkas (masalah dan penyelesaian)', 'textarea', { full: true }),
      F_('trl', 'Tahap kesediaan teknologi (TRL)', 'select', { options: ['TRL 1', 'TRL 2', 'TRL 3', 'TRL 4', 'TRL 5', 'TRL 6', 'TRL 7', 'TRL 8', 'TRL 9'] }),
      F_('status_ip', 'Status harta intelek (IP)', 'select', { options: ['Tiada', 'Dalam proses permohonan', 'Didaftarkan (paten / hak cipta / reka bentuk)'] }),
      F_('nama_pasukan', 'Nama pasukan', 'text', { sec: 'Pasukan' }),
      F_('mentor', 'Nama mentor / penyelia', 'text', { required: true }),
      F_('pelajar', 'Pelajar (nama dan no. matrik)', 'people', { required: true, full: true, kp: false }),
      F_('status_penyertaan', 'Status penyertaan', 'select', { required: true, sec: 'Pertandingan', options: ['Akan menyertai', 'Telah menyertai'] }),
      F_('nama_pertandingan', 'Nama pertandingan', 'text', { required: true }),
      F_('penganjur_pertandingan', 'Penganjur pertandingan', 'text'),
      F_('peringkat', 'Peringkat pertandingan', 'select', { required: true, options: ['Fakulti', 'Universiti', 'Kebangsaan', 'Antarabangsa'] }),
      F_('tarikh', 'Tarikh pertandingan', 'date', { required: true }),
      F_('lokasi', 'Tempat / negara', 'text'),
      F_('pingat', 'Pingat / kedudukan (jika menang)', 'select', { sec: 'Anugerah (pilihan, jika menang)', options: ['Emas', 'Perak', 'Gangsa', 'Johan', 'Naib Johan', 'Tempat Ketiga', 'Anugerah Khas', 'Penghargaan / Pengiktirafan'] }),
      F_('nama_anugerah', 'Nama anugerah', 'text'),
      F_('nilai_hadiah_rm', 'Nilai hadiah / geran (RM)', 'number', { min: 0 }),
      F_('sijil', 'Sijil (PDF, maksimum 5 MB)', 'file', { full: true }),
      F_('status_peningkatan', 'Status peningkatan', 'select', { sec: 'Peningkatan ke peringkat lebih tinggi', options: ['Belum dinilai', 'Calon peningkatan', 'Sedang disokong', 'Telah dibawa ke peringkat lebih tinggi', 'Tidak diteruskan'] }),
      F_('peringkat_sasaran', 'Peringkat sasaran seterusnya', 'select', { options: ['Universiti', 'Kebangsaan', 'Antarabangsa'] }),
      F_('pertandingan_seterusnya', 'Pertandingan / program seterusnya', 'text'),
      F_('tarikh_seterusnya', 'Tarikh seterusnya', 'date'),
      F_('sokongan_diperlukan', 'Sokongan diperlukan (pembiayaan, mentor, IP, prototaip, dll.)', 'textarea', { full: true }),
      F_('pautan_demo', 'Pautan video / demo / poster', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'CKAI9', prefix: 'AN', sheet: 'CKAI9_Anugerah', fungsi: 'pameran', group: 'Center', entry: 'faculty',
    title: 'CKAI 9 · Anugerah & pengiktirafan inovasi dan keusahawanan', short: 'Anugerah & Pengiktirafan',
    unit: 'anugerah / pengiktirafan', measure: 'award', jenis: 'minimum',
    listColumns: ['id', 'nama_anugerah', 'agensi', 'peringkat', 'program', 'fakulti', 'tarikh', 'pelajar', 'sijil'],
    statusField: 'peringkat',
    rules: [{ when: { field: 'program', in: ['Lain-lain'] }, require: ['program_lain'] }],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Anugerah / pengiktirafan' }),
      F_('nama_anugerah', 'Nama anugerah / pengiktirafan', 'text', { required: true }),
      F_('tarikh', 'Tarikh', 'date', { required: true }),
      F_('agensi', 'Agensi / badan penganugerah', 'text', { required: true }),
      F_('peringkat', 'Peringkat', 'select', { required: true, options: ['Fakulti', 'Universiti', 'Kebangsaan', 'Antarabangsa'] }),
      F_('kategori', 'Kategori', 'select', { required: true, options: ['Inovasi', 'Keusahawanan'] }),
      F_('pingat', 'Pingat / kedudukan', 'select', { options: ['Emas', 'Perak', 'Gangsa', 'Johan', 'Naib Johan', 'Tempat Ketiga', 'Anugerah Khas', 'Penghargaan / Pengiktirafan'] }),
      F_('nilai_hadiah_rm', 'Nilai hadiah / geran (RM)', 'number', { min: 0 }),
      F_('lokasi', 'Lokasi / negara', 'text'),
      F_('program', 'Program', 'select', { required: true, sec: 'Program & projek', options: ['UTM Launchpad', 'UTM Makerspace', 'GiGAUTM Ascend (GiGA)', 'F-SIP', 'UTM AI Start Up', 'Program Keusahawanan Fakulti', 'Program Inovasi Fakulti', 'Lain-lain'] }),
      F_('program_lain', 'Nama program (jika Lain-lain)', 'text'),
      F_('nama_pasukan', 'Nama pasukan', 'text'),
      F_('produk_projek', 'Nama produk / projek / syarikat', 'text'),
      F_('mentor', 'Nama mentor / fasilitator', 'text', { required: true, sec: 'Mentor & pelajar' }),
      F_('pelajar', 'Pelajar (nama, no. matrik, no. KP)', 'people', { required: true, full: true }),
      F_('sijil', 'Sijil (PDF, maksimum 5 MB)', 'file', { required: true, full: true, sec: 'Bukti' }),
      F_('pautan_media', 'Pautan berita / media', 'url'),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'CKAI10', prefix: 'TA', sheet: 'CKAI10_Perbelanjaan_Operasi', fungsi: 'rentas', group: 'Center', entry: 'admin',
    title: 'CKAI 10 · Jumlah perbelanjaan operasi', short: 'Perbelanjaan Operasi',
    unit: '% peruntukan digunakan', measure: 'tabung', jenis: 'penggunaan',
    listColumns: ['id', 'tempoh', 'tabung', 'no_chargeline', 'peruntukan_awal', 'komitmen', 'perbelanjaan', 'baki', 'peratus'],
    statusField: null,
    unique: ['kunci'],
    rules: [{ when: { field: 'tabung', in: ['Lain-lain'] }, require: ['tabung_lain', 'no_chargeline'] }],
    validate: tabungValidate_,
    fields: [
      F_('tempoh', 'Bulan laporan', 'month', { required: true, sec: 'Kedudukan kewangan tabung', hint: 'Perbelanjaan dilaporkan terkumpul sehingga bulan ini (sejak awal tahun).' }),
      F_('tabung', 'Nama tabung', 'select', { required: true, errorOn: 'tabung', options: TABUNG_AMANAH.map(function (t) { return t.nama; }).concat(['Lain-lain']) }),
      F_('tabung_lain', 'Nama tabung lain', 'text', { hint: 'Wajib jika memilih Lain-lain.' }),
      F_('no_chargeline', 'No. chargeline', 'text', { short: 'Chargeline', autoFrom: 'tabung', autoMap: TABUNG_AMANAH.reduce(function (m, t) { m[t.nama] = t.chargeline; return m; }, {}), hint: 'Diisi automatik apabila tabung yang disenaraikan dipilih. Isi sendiri hanya bagi Lain-lain.' }),
      F_('peruntukan_awal', 'Peruntukan / baki awal (a)', 'number', { min: 0, short: 'Peruntukan (a)' }),
      F_('komitmen', 'Komitmen (b)', 'number', { min: 0, short: 'Komitmen (b)', hint: 'Isi hanya jika berubah. Jika kosong, nilai bulan sebelumnya digunakan.' }),
      F_('perbelanjaan', 'Perbelanjaan sehingga bulan ini (c)', 'number', { required: true, min: 0, short: 'Belanja (c)' }),
      F_('bajet_sasaran', 'Bajet disasarkan sehingga bulan ini (RM)', 'number', { min: 0, short: 'Bajet sasaran', hint: 'Pilihan. Digunakan untuk mengira penjimatan berbanding bajet yang disasarkan.' }),
      F_('baki', 'Baki tabung d = a - (b + c)', 'number', { hidden: true, short: 'Baki (d)' }),
      F_('peratus', '% perbelanjaan daripada peruntukan', 'number', { hidden: true, short: '% belanja' }),
      F_('kunci', 'Kunci', 'text', { hidden: true, errorOn: 'tabung' }),
      F_('lampiran', 'Lampiran laporan (PDF)', 'file', { full: true, sec: 'Dokumen', hint: 'Laporan kedudukan kewangan dalam format PDF, maksimum 5 MB.' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  }
];

KPIS.forEach(function (k) { k.level = k.id.replace(/\d+$/, ''); });

/** Baris milestone awal bagi KPI berasaskan kemajuan (pemberat boleh diubah Admin). */
var MILESTONE_SEED = {
  KAI2: [
    { fasa: 'Perancangan & Reka Bentuk', nama_milestone: 'Perancangan & reka bentuk ruang', ptj: 'BPA' },
    { fasa: 'Perolehan (Tender)', nama_milestone: 'Proses perolehan (tender)', ptj: 'BPA' },
    { fasa: 'Pengubahsuaian & Pemasangan', nama_milestone: 'Pengubahsuaian dan pemasangan', ptj: 'JTNCP' },
    { fasa: 'Pelancaran Rasmi & Operasi Penuh', nama_milestone: 'Pelancaran rasmi dan operasi penuh', ptj: 'UTMXCITE' }
  ].map(function (m) { m.pemberat = 25; m.peratus_siap = 0; m.status = 'Belum mula'; return m; }),
  DKAI1: [
    { peringkat: 'Bengkel Pra-Pelan', nama_milestone: 'Bengkel pra-pelan', suku_sasaran: 'Q2', pemberat: 50 },
    { peringkat: 'Kelulusan', nama_milestone: 'Kelulusan JKE HEPA & JPU', suku_sasaran: 'Q4', pemberat: 50 }
  ].map(function (m) { m.peratus_siap = 0; m.status = 'Belum mula'; return m; })
};

/** Sasaran awal (minimum). Boleh disunting dalam tab "Sasaran". [kpi, tahun, sasaran, q1..q4, jenis, bajet, catatan] */
function buildTargetSeed_() {
  var rows = [];
  function add(kpi, year, target, q, jenis, bajet, note) {
    q = q || [];
    rows.push([kpi, year, target, q[0] === undefined ? '' : q[0], q[1] === undefined ? '' : q[1],
      q[2] === undefined ? '' : q[2], q[3] === undefined ? '' : q[3], jenis, bajet || '', note || '']);
  }
  [2026, 2027, 2028, 2029, 2030].forEach(function (y) {
    add('KAI1', y, 20, y === 2026 ? [5, 10, 15, 20] : [], 'minimum', y === 2026 ? 130000 : '', y === 2026 ? 'Inisiatif: 13 inkubator fakulti (RM130,000) + 10 co-working/ruang individu' : '');
  });
  add('KAI2', 2026, 60, [15, 30, 45, 60], 'kemajuan', 1000000, 'Satu ruang strategik Makerspace moden (anggaran RM1 juta)');
  add('KAI2', 2027, 80, [65, 70, 75, 80], 'kemajuan', '', '');
  add('KAI2', 2028, 100, [85, 90, 95, 100], 'kemajuan', '', 'Siap 100% menjelang 2028');
  [25, 30, 35, 40, 45].forEach(function (t, i) {
    add('KAI3', 2026 + i, t, i === 0 ? [10, 15, 20, 25] : [], 'minimum', '', i === 0 ? 'Minimum ruang ditawarkan kepada pelajar untuk disewa (+5 setiap tahun)' : '');
  });
  [2026, 2027, 2028, 2029, 2030].forEach(function (y) {
    add('KAI4', y, 20, y === 2026 ? [5, 10, 15, 20] : [], 'minimum', y === 2026 ? 200000 : '', y === 2026 ? 'Cadangan 2 pelajar setiap fakulti' : '');
    add('KAI5', y, 4, y === 2026 ? ['', 2, '', 4] : [], 'minimum', '', '');
    add('KAI6', y, 20, [], 'minimum', y === 2026 ? 400000 : '', y === 2026 ? 'Minimum 5 pelajar setiap fakulti (FAI, FC, FKE, MJIIT). Sasaran sekunder startup AI: Q1 0, Q2 1, Q3 2, Q4 3' : '');
  });
  add('DKAI1', 2026, 100, [], 'kemajuan', '', 'Projek sekali sahaja, mesti siap pada 2026');
  // KPT: sasaran tahunan mengikut Kamus KPI Keusahawanan IPT 2026-2030
  var kptT = { KPT1: [80000, 85000, 90000, 95000, 100000], KPT2: [10, 10.5, 11, 11.5, 12], KPT3: [10, 10.5, 11, 11.5, 12], KPT4: [600, 700, 800, 900, 1000], KPT5: [60, 65, 70, 75, 80], KPT6: [80, 85, 90, 95, 100], KPT7: [210, 220, 230, 240, 250] };
  Object.keys(kptT).forEach(function (k) { kptT[k].forEach(function (t, i) { add(k, 2026 + i, t, [], 'minimum', '', i === 0 ? 'Sasaran mengikut Kamus KPI Keusahawanan IPT 2026-2030' : ''); }); });
  // CKAI: sasaran belum ditetapkan. Isi melalui menu Admin > Sasaran.
  ['CKAI1', 'CKAI2', 'CKAI3', 'CKAI4', 'CKAI5', 'CKAI6', 'CKAI7', 'CKAI8', 'CKAI9'].forEach(function (k) {
    [2026, 2027, 2028, 2029, 2030].forEach(function (y) { add(k, y, '', [], 'minimum', '', ''); });
  });
  [2026, 2027, 2028, 2029, 2030].forEach(function (y) { add('CKAI10', y, 100, [], 'penggunaan', '', y === 2026 ? 'Sasaran 100% penggunaan peruntukan tabung: makin hampir 100% makin cekap' : ''); });
  return rows;
}

/** Daftar risiko awal daripada dokumen Pelan Tindakan (Risk Management). [kpi, risiko, sumber, mitigasi] */
var RISK_SEED = [
  ['KAI1', 'Kekangan masa HEPA dan fakulti', 'S19 General Operation', 'Wujudkan pasukan petugas bersama HEPA-Fakulti dengan garis masa dan tanggungjawab tetap.'],
  ['KAI1', 'Ketersediaan ruang sesuai di fakulti untuk ditukar menjadi inkubator', 'S20 Asset and Facilities', 'Audit ruang awal dan dapatkan kelulusan rasmi fakulti bagi peruntukan inkubator.'],
  ['KAI1', 'Kelewatan perolehan, pelaksanaan dan aktiviti operasi', 'S2 Suppliers / 3rd party', 'Jadual projek terperinci dengan pemantauan berkala dan pelaporan kemajuan kepada pengurusan.'],
  ['KAI2', 'Penggunaan ruang yang rendah oleh pelajar', 'S2 Suppliers / 3rd party', 'Jelajah UTMXCITE ke kolej dan fakulti untuk promosi kemudahan.'],
  ['KAI2', 'Kenaikan kos peralatan dan kerja', 'S2 Suppliers / 3rd party', 'Anggaran kos awal, kelulusan bajet awal, perolehan berfasa dan pembelian pukal.'],
  ['KAI2', 'Kelewatan perolehan, pelaksanaan dan aktiviti operasi', 'S2 Suppliers / 3rd party', 'Jadual projek terperinci dengan pemantauan berkala dan pelaporan kemajuan kepada pengurusan.'],
  ['KAI2', 'Kelewatan bekalan peralatan dan proses perolehan', 'S2 Suppliers / 3rd party', 'Pantau garis masa perolehan dan susulan berkala dengan pembekal.'],
  ['KAI3', 'Perniagaan dikendalikan oleh individu tidak sah atau pihak ketiga', 'Regulatory / Government', 'Garis panduan jelas dan prosedur operasi standard (SOP).'],
  ['KAI3', 'Ruang sesuai di kolej dan fakulti terhad', 'S2 Suppliers / 3rd party', 'Penilaian tapak awal dan keutamaan lokasi strategik berpengunjung tinggi.'],
  ['KAI3', 'Pelajar gagal mengendalikan perniagaan pada waktu operasi biasa', 'Regulatory / Government', 'Tetapkan waktu operasi standard dan pemantauan berkala bagi pematuhan.'],
  ['KAI4', 'Bilangan pelajar berminat dan berpotensi tinggi yang rendah', 'Customer / Student', 'Promosi aktif, program penglibatan dan inisiatif strategik.'],
  ['KAI4', 'Kefahaman pelajar tentang konsep dan peluang gig entrepreneurship terhad', 'Customer / Student', 'Program kesedaran berstruktur dan latihan pengenalan gig entrepreneurship.'],
  ['KAI4', 'Kelewatan pelaksanaan', 'S19 General Operation', 'Garis masa jelas dan pemantauan berkala.'],
  ['KAI5', 'Proses kelulusan panjang melibatkan banyak peringkat dan jawatankuasa', 'Internal Fraud', 'Bangunkan garis panduan dan SOP yang jelas bagi F-SIP.'],
  ['KAI5', 'Kualiti hasil pembelajaran rendah dalam startup yang ditubuhkan pelajar', 'Customer / Student', 'Pemantauan dan penilaian berkala oleh penyelia akademik dan mentor industri.'],
  ['KAI5', 'Pelajar menarik diri atau tidak menamatkan program', 'Customer / Student', 'Bimbingan berterusan dan sokongan intervensi awal.'],
  ['KAI6', 'Idea / prototaip pelajar mungkin disalin pihak lain', 'Legal & Litigation', 'Latihan kesedaran pendaftaran IP dan perlindungan idea.'],
  ['KAI6', 'Pelajar menarik diri daripada program', 'Customer / Student', 'Proses pemilihan berstruktur serta pemantauan dan sokongan berterusan.'],
  ['KAI6', 'Komitmen mentor yang rendah', 'External Fraud', 'Pemantauan berkala dan mekanisme pengiktirafan mentor.']
];
// ===== Util.gs =====
/** Utiliti umum: ralat pengguna, hash, tarikh, akses Sheet. */

function userError_(message, extra) {
  var e = new Error(message);
  e.user = true;
  if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) e[k] = extra[k]; } }
  return e;
}

function authError_() {
  return userError_('Sesi tamat. Sila log masuk semula.', { auth: true });
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
}

function sha256Hex_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomHex_(n) {
  var out = '';
  while (out.length < n) { out += sha256Hex_(Utilities.getUuid() + Math.random() + Date.now()); }
  return out.slice(0, n);
}

function randomDigits_(n) {
  var h = randomHex_(n * 4), out = '';
  for (var i = 0; i < n; i++) { out += String(parseInt(h.substr(i * 4, 4), 16) % 10); }
  return out;
}

function getProp_(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function setProp_(key, value) { PropertiesService.getScriptProperties().setProperty(key, value); }

function getSalt_() {
  var s = getProp_('OTP_SALT');
  if (!s) { s = randomHex_(48); setProp_('OTP_SALT', s); }
  return s;
}

function normEmail_(e) { return String(e === null || e === undefined ? '' : e).trim().toLowerCase(); }

function isEmail_(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function emailDomainAllowed_(e) {
  if (!APP.ALLOWED_EMAIL_DOMAINS || !APP.ALLOWED_EMAIL_DOMAINS.length) return true;
  var d = e.split('@')[1];
  return APP.ALLOWED_EMAIL_DOMAINS.indexOf(d) >= 0;
}

function yearOf_(iso) {
  var m = /^(\d{4})-\d{2}(-\d{2})?/.exec(String(iso || '')); // YYYY-MM-DD atau YYYY-MM (bulan)
  return m ? parseInt(m[1], 10) : null;
}

/** Elak suntikan formula Sheets: teks bermula dengan = + - @ disimpan sebagai teks. */
function sanitizeText_(s) {
  s = String(s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function normalizeCell_(v, type) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  }
  if (type === 'number') {
    if (v === '') return '';
    var n = Number(v);
    return isFinite(n) ? n : '';
  }
  return typeof v === 'string' ? v.trim() : v;
}

// ---------------------------------------------------------------------------
// Akses Sheet
// ---------------------------------------------------------------------------
function getSS_() {
  var id = getProp_('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) return active;
  throw userError_('Sistem belum disediakan. Pentadbir perlu menjalankan fungsi setup().');
}

function getSheet_(name) {
  var sh = getSS_().getSheetByName(name);
  if (!sh) throw userError_('Tab "' + name + '" tiada. Pentadbir perlu menjalankan fungsi setup().');
  return sh;
}

function typesFor_(kpi) {
  var t = { id: 'text' };
  kpi.fields.forEach(function (f) { t[f.key] = f.type; });
  return t;
}

/** Baca satu tab sebagai senarai objek. Setiap objek ada _row (nombor baris sebenar). */
function readTable_(name, types) {
  var sh = getSheet_(name);
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lc < 1) return { headers: [], rows: [] };
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
  var rows = [];
  if (lr >= 2) {
    var vals = sh.getRange(2, 1, lr - 1, lc).getValues();
    for (var i = 0; i < vals.length; i++) {
      var empty = true, o = { _row: i + 2 };
      for (var j = 0; j < headers.length; j++) {
        var v = normalizeCell_(vals[i][j], types ? types[headers[j]] : null);
        if (v !== '') empty = false;
        o[headers[j]] = v;
      }
      if (!empty) rows.push(o);
    }
  }
  return { headers: headers, rows: rows };
}

/**
 * Tulis satu baris mengikut NAMA tajuk (bukan kedudukan lajur). Lajur yang tiada dalam `obj` dikekalkan
 * (kemas kini) atau dibiarkan kosong (baris baharu). Jadi susunan lajur dalam Sheet tidak penting.
 */
function writeRow_(sh, rowNum, obj) {
  var lc = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
  var base = rowNum ? sh.getRange(rowNum, 1, 1, lc).getValues()[0] : headers.map(function () { return ''; });
  var out = headers.map(function (h, i) {
    if (!Object.prototype.hasOwnProperty.call(obj, h)) return base[i];
    return obj[h] === null || obj[h] === undefined ? '' : obj[h];
  });
  if (rowNum) sh.getRange(rowNum, 1, 1, lc).setValues([out]); else sh.appendRow(out);
}

/** Tulis banyak baris sekaligus. `cols` = nama lajur bagi setiap elemen dalam `rows` (tatasusunan). */
function writeRows_(sh, cols, rows) {
  if (!rows.length) return;
  var lc = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
  var idx = headers.map(function (h) { return cols.indexOf(h); });
  var matrix = rows.map(function (r) { return idx.map(function (j) { return j < 0 || r[j] === undefined ? '' : r[j]; }); });
  sh.getRange(sh.getLastRow() + 1, 1, matrix.length, lc).setValues(matrix);
}

function rowArray_(headers, obj) {
  return headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
}

function listFaculties_() {
  return readTable_(SHEETS.FACULTIES).rows.map(function (r) { return { kod: String(r.kod), nama: String(r.nama) }; })
    .filter(function (r) { return r.kod; });
}

function getKpi_(id) {
  for (var i = 0; i < KPIS.length; i++) { if (KPIS[i].id === id) return KPIS[i]; }
  throw userError_('KPI tidak dikenali.');
}

function kpiColumns_(kpi) {
  var cols = ['id'];
  kpi.fields.forEach(function (f) { cols.push(f.key); if (f.type === 'file') cols.push(fileLinkCol_(f.key)); });
  return cols.concat(SYS_COLS);
}

/** Lajur pautan Drive bagi medan fail (untuk Admin klik terus dalam Sheet). Tidak dihantar kepada klien. */
function fileLinkCol_(key) { return key + '_pautan'; }

function driveFileUrl_(fileId) { return fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : ''; }

function setFileLinks_(kpi, clean, obj) {
  kpi.fields.forEach(function (f) {
    if (f.type !== 'file') return;
    obj[fileLinkCol_(f.key)] = driveFileUrl_((parseJson_(clean[f.key], {}) || {}).id);
  });
}

function audit_(user, action, kpi, recordId, summary) {
  try {
    var sh = getSheet_(SHEETS.AUDIT);
    writeRow_(sh, null, { masa: nowIso_(), emel: user ? user.emel : '', tindakan: action, kpi: kpi || '', rekod_id: recordId || '', ringkasan: sanitizeText_(String(summary || '').slice(0, 500)) });
  } catch (e) {
    console.error('Gagal merekod audit: ' + e);
  }
}

// ---------------------------------------------------------------------------
// Lampiran (Google Drive): satu folder peribadi yang dimiliki pemilik skrip.
// ---------------------------------------------------------------------------
function getAttachFolder_() {
  var id = getProp_('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* folder dipadam: cipta semula */ } }
  var f = DriveApp.createFolder('UTMXCITE ASCEND2030 - Lampiran');
  setProp_('FOLDER_ID', f.getId());
  return f;
}

function fileInFolder_(file) {
  var folderId = getAttachFolder_().getId();
  var it = file.getParents();
  while (it.hasNext()) { if (it.next().getId() === folderId) return true; }
  return false;
}

function parseJson_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

function trashFile_(id) {
  try {
    if (!id) return;
    var f = DriveApp.getFileById(id);
    if (fileInFolder_(f)) f.setTrashed(true);
  } catch (e) { console.warn('Gagal membuang fail lampiran: ' + e); }
}

function clearDashCache_() {
  var cache = CacheService.getScriptCache();
  APP.YEARS.forEach(function (y) { cache.remove('dash:' + y); });
  cache.remove('trend');
}
// ===== Setup.gs =====
/**
 * Persediaan: cipta (atau gunakan semula) Google Sheet laporan dan semua tab.
 * Jalankan setup() SEKALI daripada editor Apps Script. Selamat dijalankan semula (idempotent).
 */
function setup() {
  var ss = null;
  var id = getProp_('SHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
    if (!ss) ss = SpreadsheetApp.create('Laporan ASCEND 2030 - UTMXCITE');
    setProp_('SHEET_ID', ss.getId());
  }
  getSalt_();

  ensureSheet_(ss, SHEETS.USERS, USER_COLS, []);
  ensureSheet_(ss, SHEETS.FACULTIES, FACULTY_COLS, []);
  ensureSheet_(ss, SHEETS.TARGETS, TARGET_COLS, []);
  ensureSheet_(ss, SHEETS.RISKS, RISK_COLS, []);
  ensureSheet_(ss, SHEETS.AUDIT, AUDIT_COLS, []);
  renameColumns_(ss);
  KPIS.forEach(function (kpi) {
    if (!kpi.sheet) return;
    ensureSheet_(ss, kpi.sheet, kpiColumns_(kpi), kpi.fields.concat([{ key: 'id', type: 'text' }].concat(SYS_COLS.map(function (k) { return { key: k, type: 'text' }; }))));
  });

  listValidation_(ss.getSheetByName(SHEETS.USERS), 'peranan', [ROLES.ADMIN, ROLES.PIC]);
  listValidation_(ss.getSheetByName(SHEETS.USERS), 'aktif', YES_NO);

  seedIfEmpty_(ss, SHEETS.FACULTIES, FACULTY_COLS, FACULTY_SEED);
  seedIfEmpty_(ss, SHEETS.TARGETS, TARGET_COLS, buildTargetSeed_());
  addMissingTargetRows_(ss);
  seedIfEmpty_(ss, SHEETS.RISKS, RISK_COLS, RISK_SEED.map(function (r) { return [r[0], r[1], r[2], r[3], 'Terbuka', nowIso_()]; }));
  seedAdmin_(ss);
  seedMilestones_(ss);
  backfillFileLinks_(ss);
  dropRetiredColumns_(ss);

  var first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) { try { ss.deleteSheet(first); } catch (e) { /* abaikan */ } }

  adoptFolderFromTab_(ss);
  writeSetupTab_(ss);

  console.log('Setup selesai. Sheet: ' + ss.getUrl());
  return { id: ss.getId(), url: ss.getUrl() };
}

function ensureSheet_(ss, name, headers, fieldDefs) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // tambah lajur baharu di hujung jika definisi bertambah
    var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var missing = headers.filter(function (h) { return existing.indexOf(h) < 0; });
    if (missing.length) sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn());
  hdr.setFontWeight('bold').setBackground('#5c0f2a').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  // Lajur teks/tarikh disimpan sebagai teks supaya no. matrik/telefon tidak hilang sifar di hadapan.
  var all = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var textTypes = { text: 1, textarea: 1, email: 1, url: 1, select: 1, faculty: 1, yesno: 1, date: 1, month: 1, time: 1, file: 1, people: 1 };
  var typeOf = {};
  (fieldDefs || []).forEach(function (f) { typeOf[f.key] = f.type; });
  all.forEach(function (h, i) {
    var plain = fieldDefs && fieldDefs.length ? textTypes[typeOf[h]] : (h !== 'tahun' && h !== 'sasaran' && h !== 'bajet_rm' && h !== 'q1' && h !== 'q2' && h !== 'q3' && h !== 'q4');
    if (plain) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
}

/** Drop-down dalam Sheet supaya penyuntingan manual tab Pengguna kekal bersih. */
function listValidation_(sh, header, values) {
  var hdrs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var col = hdrs.indexOf(header) + 1;
  if (!col) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

function seedIfEmpty_(ss, name, cols, rows) {
  var sh = ss.getSheetByName(name);
  if (sh.getLastRow() > 1 || !rows.length) return;
  writeRows_(sh, cols, rows);
}

/**
 * Pemasangan sedia ada: tambah baris sasaran bagi KPI yang BELUM langsung ada dalam tab Sasaran (contoh CKAI yang baru ditambah).
 * KPI yang sudah ada tidak disentuh, jadi baris yang anda padam atau ubah tidak dihidupkan semula.
 */
function addMissingTargetRows_(ss) {
  var sh = ss.getSheetByName(SHEETS.TARGETS);
  if (sh.getLastRow() < 2) return;
  var present = {};
  readTable_(SHEETS.TARGETS).rows.forEach(function (r) { present[String(r.kpi)] = true; });
  var add = buildTargetSeed_().filter(function (r) { return !present[r[0]]; });
  writeRows_(sh, TARGET_COLS, add);
}

function seedAdmin_(ss) {
  var sh = ss.getSheetByName(SHEETS.USERS);
  if (sh.getLastRow() > 1) return;
  var email = '';
  try { email = Session.getEffectiveUser().getEmail(); } catch (e) { email = ''; }
  email = normEmail_(email);
  if (!email) {
    console.warn('E-mel pemilik skrip tidak dapat dikesan. Tambah pengguna Admin pertama secara manual dalam tab Pengguna.');
    return;
  }
  writeRow_(sh, null, { emel: email, nama: 'Pentadbir UTMXCITE', peranan: ROLES.ADMIN, fakulti: 'UTMXCITE', kpi_akses: '', aktif: 'Ya', dicipta_pada: nowIso_() });
}

function seedMilestones_(ss) {
  ['KAI2', 'DKAI1'].forEach(function (kid) {
    var kpi = getKpi_(kid);
    var sh = ss.getSheetByName(kpi.sheet);
    if (sh.getLastRow() > 1) return;
    var cols = kpiColumns_(kpi);
    var now = nowIso_();
    MILESTONE_SEED[kid].forEach(function (m, i) {
      var o = { id: kpi.prefix + '-' + ('00' + (i + 1)).slice(-3), dicipta_pada: now, dicipta_oleh: 'setup', dikemas_kini_pada: now, dikemas_kini_oleh: 'setup' };
      for (var k in m) { if (m.hasOwnProperty(k)) o[k] = m[k]; }
      writeRow_(sh, null, o);
    });
  });
}

/**
 * Tab "Persediaan" di dalam Google Sheet: ID dan pautan penting serta panduan jika paparan "404".
 * Ditulis semula setiap kali setup() dijalankan. Tab ini hanya maklumat (tiada data pengguna).
 */
function writeSetupTab_(ss) {
  var sh = ss.getSheetByName(SHEETS.SETUP) || ss.insertSheet(SHEETS.SETUP);
  var url = '', scriptId = '', owner = '', folder = null;
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  try { scriptId = ScriptApp.getScriptId(); } catch (e) { scriptId = ''; }
  try { owner = Session.getEffectiveUser().getEmail(); } catch (e) { owner = ''; }
  var fid = getProp_('FOLDER_ID');
  if (fid) { try { folder = DriveApp.getFolderById(fid); } catch (e) { folder = null; } }
  var rows = [
    ['PERSEDIAAN & PAUTAN', '', ''],
    ['Item', 'Nilai', 'Catatan'],
    ['Nama aplikasi', APP.NAME, ''],
    ['Google Sheet - ID', ss.getId(), 'Disimpan dalam Script Properties (SHEET_ID).'],
    ['Google Sheet - Pautan', ss.getUrl(), 'Hadkan akses Sheet kepada Admin sahaja (ada no. KP pelajar).'],
    ['Web app - Pautan', url || '(belum deploy)', url ? (/\/dev$/.test(url) ? 'Ini pautan ujian /dev. Gunakan pautan /exec untuk orang ramai.' : 'Kongsi pautan ini kepada pengguna.') : 'Deploy > New deployment > Web app. Salin pautan berakhir /exec.'],
    ['Apps Script - Script ID', scriptId || '(tidak dikesan)', 'Untuk clasp (.clasp.json).'],
    ['Folder lampiran Drive - Pautan', folder ? folder.getUrl() : '(belum dicipta)', 'Dicipta automatik. Untuk guna folder sendiri, tampal ID atau pautan folder di sini, kemudian jalankan setup().'],
    ['Pemilik skrip (Execute as)', owner || '(tidak dikesan)', 'Admin pertama dalam tab Pengguna ialah pemilik ini.'],
    ['Dikemas kini', Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd HH:mm"), 'Jalankan setup() semula untuk menyegarkan.'],
    ['', '', ''],
    ['JIKA "404 - PAGE NOT FOUND"', '', ''],
    ['1', 'Guna pautan /exec daripada Deploy > Manage deployments (bukan /dev, bukan pautan editor).', ''],
    ['2', 'Deploy sebagai Web app: Execute as = Me, Who has access = Anyone.', ''],
    ['3', 'Selepas ubah kod: Deploy > Manage deployments > Edit > Version: New version > Deploy.', ''],
    ['4', 'Pautan dengan /u/1/ atau akaun Google berbeza boleh menyebabkan 404. Cuba tetingkap incognito.', ''],
    ['5', 'Semak dalam aplikasi: log masuk Admin > Pentadbiran > Persediaan.', '']
  ];
  sh.clear();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  try {
    sh.getRange(1, 1, rows.length, 3).setNumberFormat('@');
    sh.getRange(1, 1).setFontWeight('bold');
    sh.getRange(2, 1, 1, 3).setFontWeight('bold').setBackground('#5c0f2a').setFontColor('#ffffff');
    sh.getRange(12, 1).setFontWeight('bold');
    sh.setColumnWidth(1, 230); sh.setColumnWidth(2, 520); sh.setColumnWidth(3, 420);
    sh.setFrozenRows(2);
  } catch (e) { /* pemformatan tidak kritikal */ }
}

function webUrl_() {
  var u = APP.WEB_URL || '';
  if (!u) { try { u = ScriptApp.getService().getUrl() || ''; } catch (e) { u = ''; } }
  return u;
}

/** Buka Dashboard KPI UTMXCITE JTNCHEPA dalam tab baharu. */
function linkSistem() {
  var url = webUrl_();
  if (!/^https:\/\/script\.google\.com\//.test(url)) throw new Error('Pautan web app belum ditetapkan (APP.WEB_URL dalam Config.gs).');
  var html = "<script>window.open(" + JSON.stringify(url) + ");google.script.host.close();<\/script>";
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (!ui) {   // dijalankan dari editor Apps Script (tiada antara muka Sheet)
    console.log('Pautan dashboard: ' + url);
    throw new Error('linkSistem() hanya berfungsi apabila dijalankan dari dalam Google Sheet (menu atau butang). Pautan: ' + url);
  }
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(1).setHeight(1), 'Dashboard KPI UTMXCITE JTNCHEPA');
}

/** Jika ID/pautan folder lampiran ditampal pada tab Persediaan, gunakan folder itu (mesti boleh dicapai oleh pemilik skrip). */
function adoptFolderFromTab_(ss) {
  var sh = ss.getSheetByName(SHEETS.SETUP);
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).indexOf('Folder lampiran Drive') !== 0) continue;
    var v = String(rows[i][1] || '').trim();
    var m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(v) || /^([A-Za-z0-9_-]{15,})$/.exec(v);
    if (!m || m[1] === getProp_('FOLDER_ID')) return;
    try { DriveApp.getFolderById(m[1]).getName(); } catch (e) { console.warn('Folder pada tab Persediaan tidak dapat dicapai: ' + m[1]); return; }
    setProp_('FOLDER_ID', m[1]);
    return;
  }
}

/** Isi lajur pautan Drive bagi rekod lama yang sudah ada fail lampiran tetapi belum ada pautan. */
function backfillFileLinks_(ss) {
  KPIS.forEach(function (kpi) {
    if (!kpi.sheet) return;
    var fileFields = kpi.fields.filter(function (f) { return f.type === 'file'; });
    var sh = ss.getSheetByName(kpi.sheet);
    if (!fileFields.length || !sh || sh.getLastRow() < 2) return;
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var n = sh.getLastRow() - 1;
    fileFields.forEach(function (f) {
      var src = hdr.indexOf(f.key), dst = hdr.indexOf(fileLinkCol_(f.key));
      if (src < 0 || dst < 0) return;
      var from = sh.getRange(2, src + 1, n, 1).getValues(), to = sh.getRange(2, dst + 1, n, 1).getValues(), changed = false;
      for (var i = 0; i < n; i++) {
        var id = (parseJson_(from[i][0], {}) || {}).id;
        var want = driveFileUrl_(id);
        if (want && to[i][0] !== want) { to[i][0] = want; changed = true; }
      }
      if (changed) sh.getRange(2, dst + 1, n, 1).setValues(to);
    });
  });
}

/**
 * Buang lajur yang sudah tidak digunakan (KPI.retired) daripada tab. Data dalam lajur itu dipadam kekal.
 * Hanya lajur yang tiada dalam definisi semasa dibuang.
 */
function dropRetiredColumns_(ss) {
  KPIS.forEach(function (kpi) {
    if (!kpi.sheet || !kpi.retired || !kpi.retired.length) return;
    var sh = ss.getSheetByName(kpi.sheet);
    if (!sh || sh.getLastColumn() < 1) return;
    var current = kpiColumns_(kpi);
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var removed = [];
    for (var i = hdr.length - 1; i >= 0; i--) {   // dari kanan supaya indeks tidak berubah
      if (kpi.retired.indexOf(hdr[i]) >= 0 && current.indexOf(hdr[i]) < 0) { sh.deleteColumn(i + 1); removed.push(hdr[i]); }
    }
    if (removed.length) audit_(null, 'LAJUR_DIBUANG', kpi.id, '', removed.reverse().join(', '));
  });
}

/** Namakan semula tajuk lajur lama (KPI.renamed: {lama: baharu}) supaya data dikekalkan. */
function renameColumns_(ss) {
  KPIS.forEach(function (kpi) {
    if (!kpi.sheet || !kpi.renamed) return;
    var sh = ss.getSheetByName(kpi.sheet);
    if (!sh || sh.getLastColumn() < 1) return;
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    for (var old in kpi.renamed) {
      if (!kpi.renamed.hasOwnProperty(old)) continue;
      var i = hdr.indexOf(old);
      if (i >= 0 && hdr.indexOf(kpi.renamed[old]) < 0) { sh.getRange(1, i + 1).setValue(kpi.renamed[old]); audit_(null, 'LAJUR_DINAMA_SEMULA', kpi.id, '', old + ' -> ' + kpi.renamed[old]); }
    }
  });
}
// ===== Auth.gs =====
/**
 * Pengesahan: log masuk e-mel + OTP, sesi berasaskan token, semakan peranan.
 * OTP dan sesi disimpan dalam CacheService (dalam bentuk hash); token tidak pernah disimpan dalam teks biasa.
 */

function normRole_(v) {
  var r = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return r === 'admin' ? ROLES.ADMIN : r === 'pic' ? ROLES.PIC : '';
}

/**
 * Tab Pengguna boleh disunting terus dalam Sheet, jadi nilai dinormalkan (huruf besar/kecil, ruang kosong).
 * Peranan selain Admin/PIC dianggap tidak sah: pengguna tidak aktif dan tiada akses (tidak jatuh ke PIC secara lalai).
 */
function parseUser_(row) {
  var akses = String(row.kpi_akses || '').split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(String);
  var role = normRole_(row.peranan);
  return {
    emel: normEmail_(row.emel),
    nama: String(row.nama || ''),
    peranan: role,
    fakulti: String(row.fakulti || '').trim(),
    kpiAkses: akses,
    aktif: /^ya$/i.test(String(row.aktif || '').trim()) && role !== '',
    _row: row._row
  };
}

function findUser_(email) {
  email = normEmail_(email);
  if (!email) return null;
  var rows = readTable_(SHEETS.USERS).rows;
  for (var i = 0; i < rows.length; i++) {
    if (normEmail_(rows[i].emel) === email) return parseUser_(rows[i]);
  }
  return null;
}

function publicUser_(u) {
  return { emel: u.emel, nama: u.nama, peranan: u.peranan, fakulti: u.fakulti, kpiAkses: u.kpiAkses };
}

function otpHash_(email, code) {
  return sha256Hex_(getSalt_() + '|' + email + '|' + code);
}

function requestOtp_(emailIn) {
  var email = normEmail_(emailIn);
  if (!isEmail_(email)) throw userError_('Alamat e-mel tidak sah.');

  var cache = CacheService.getScriptCache();
  var reqKey = 'otpreq:' + sha256Hex_(email);
  var count = parseInt(cache.get(reqKey) || '0', 10);
  if (count >= APP.OTP_MAX_REQUESTS) {
    throw userError_('Terlalu banyak permintaan OTP. Cuba lagi dalam satu jam.');
  }
  cache.put(reqKey, String(count + 1), 3600);

  var user = findUser_(email);
  if (user && user.aktif && emailDomainAllowed_(email)) {
    var code = randomDigits_(6);
    cache.put('otp:' + sha256Hex_(email), JSON.stringify({ h: otpHash_(email, code), a: 0 }), APP.OTP_TTL);
    MailApp.sendEmail({
      to: email,
      subject: '[' + APP.NAME + '] Kod OTP log masuk anda',
      name: APP.NAME,
      body: 'Salam ' + (user.nama || '') + ',\n\nKod OTP anda ialah: ' + code + '\n\n' +
        'Kod ini sah selama ' + Math.round(APP.OTP_TTL / 60) + ' minit dan hanya boleh digunakan sekali. ' +
        'Jika anda tidak membuat permintaan ini, abaikan e-mel ini.\n\n' + APP.NAME
    });
    audit_(user, 'OTP_DIMINTA', '', '', '');
  }
  // Mesej sama tanpa mengira sama ada e-mel berdaftar (elak penghitungan akaun).
  return { message: 'Jika e-mel itu berdaftar, kod OTP telah dihantar. Semak peti masuk anda.', ttl: APP.OTP_TTL };
}

function verifyOtp_(emailIn, codeIn) {
  var email = normEmail_(emailIn);
  var code = String(codeIn === null || codeIn === undefined ? '' : codeIn).replace(/\s+/g, '');
  var cache = CacheService.getScriptCache();
  var key = 'otp:' + sha256Hex_(email);
  var raw = cache.get(key);
  var bad = 'Kod OTP tidak sah atau telah tamat tempoh.';
  if (!raw || !/^\d{6}$/.test(code)) throw userError_(bad);
  var st = JSON.parse(raw);
  if (st.a >= APP.OTP_MAX_ATTEMPTS) { cache.remove(key); throw userError_('Terlalu banyak percubaan. Sila minta kod OTP baharu.'); }
  if (st.h !== otpHash_(email, code)) {
    st.a += 1;
    if (st.a >= APP.OTP_MAX_ATTEMPTS) cache.remove(key); else cache.put(key, JSON.stringify(st), APP.OTP_TTL);
    throw userError_(bad);
  }
  cache.remove(key);
  var user = findUser_(email);
  if (!user || !user.aktif) throw userError_(bad);

  var token = randomHex_(48);
  cache.put('sess:' + sha256Hex_(token), email, APP.SESSION_TTL);
  audit_(user, 'LOG_MASUK', '', '', '');
  return { token: token, user: publicUser_(user) };
}

function logout_(token) {
  if (!token) return true;
  var cache = CacheService.getScriptCache();
  var key = 'sess:' + sha256Hex_(String(token));
  var email = cache.get(key);
  cache.remove(key);
  if (email) audit_({ emel: email }, 'LOG_KELUAR', '', '', '');
  return true;
}

/** Pulangkan pengguna sah bagi token, atau lontar ralat pengesahan. Peranan dibaca semula daripada Sheet setiap kali. */
function requireUser_(token) {
  if (!token || typeof token !== 'string' || token.length < 32) throw authError_();
  var email = CacheService.getScriptCache().get('sess:' + sha256Hex_(token));
  if (!email) throw authError_();
  var user = findUser_(email);
  if (!user || !user.aktif) throw authError_();
  return user;
}

function requireAdmin_(token) {
  var user = requireUser_(token);
  if (user.peranan !== ROLES.ADMIN) throw userError_('Akses ditolak. Fungsi ini untuk Admin sahaja.');
  return user;
}

function facultyAllowedForKpi_(kpi, fakulti) {
  return !kpi.facultyWhitelist || kpi.facultyWhitelist.indexOf(fakulti) >= 0;
}

function canAccessKpi_(user, kpi) {
  if (kpi.entry === 'auto') return false;   // dikira automatik daripada KPI lain; tiada borang
  if (user.peranan === ROLES.ADMIN) return true;
  return kpi.entry === 'faculty' && user.kpiAkses.indexOf(kpi.id) >= 0 && facultyAllowedForKpi_(kpi, user.fakulti);
}

function accessibleKpis_(user) {
  return KPIS.filter(function (k) { return canAccessKpi_(user, k); });
}
// ===== Data.gs =====
/** Operasi rekod KPI: senarai, simpan (tambah/kemas kini), padam. Semua semakan akses dibuat di sini (pelayan). */

function kpiSchema_(kpi) {
  return {
    id: kpi.id, title: kpi.title, short: kpi.short, group: kpi.group, level: kpi.level, teras: kpi.teras || null, fungsi: kpi.fungsi || null, unit: kpi.unit, entry: kpi.entry,
    listColumns: kpi.listColumns, statusField: kpi.statusField, filter2: kpi.filter2 || null, facultyWhitelist: kpi.facultyWhitelist || null,
    fields: kpi.fields
  };
}

function sessionInfo_(token) {
  var user = requireUser_(token);
  return {
    user: publicUser_(user),
    faculties: listFaculties_(),
    levels: LEVELS,
    teras: TERAS,
    functions: FUNCTIONS,
    kpis: accessibleKpis_(user).map(kpiSchema_)
  };
}

function stripRow_(r) {
  var o = {};
  for (var k in r) { if (r.hasOwnProperty(k) && k !== '_row' && !/_pautan$/.test(k)) o[k] = r[k]; }
  return o;
}

function listRecords_(token, kpiId, filters) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  filters = filters || {};
  var rows = readTable_(kpi.sheet, typesFor_(kpi)).rows;

  if (user.peranan !== ROLES.ADMIN && kpi.entry === 'faculty') {
    rows = rows.filter(function (r) { return r.fakulti === user.fakulti; });
  }
  if (filters.fakulti && kpi.entry === 'faculty') rows = rows.filter(function (r) { return r.fakulti === String(filters.fakulti); });
  if (filters.status && kpi.statusField) rows = rows.filter(function (r) { return r[kpi.statusField] === String(filters.status); });
  if (filters.status2 && kpi.filter2) rows = rows.filter(function (r) { return r[kpi.filter2] === String(filters.status2); });
  if (filters.q) {
    var q = String(filters.q).toLowerCase();
    rows = rows.filter(function (r) {
      for (var k in r) { if (k !== '_row' && !/_pautan$/.test(k) && String(r[k]).toLowerCase().indexOf(q) >= 0) return true; }
      return false;
    });
  }
  rows.sort(function (a, b) { return String(b.dikemas_kini_pada).localeCompare(String(a.dikemas_kini_pada)); });
  return { rows: rows.map(stripRow_), canEdit: true, canDelete: user.peranan === ROLES.ADMIN };
}

function validateRecord_(kpi, rec, faculties, user, existing, rows) {
  var errors = {}, clean = {};
  var facCodes = faculties.map(function (f) { return f.kod; });

  kpi.fields.forEach(function (f) {
    var raw = rec[f.key];
    var v = raw === null || raw === undefined ? '' : (typeof raw === 'string' ? raw.trim() : raw);
    if (Array.isArray(v) && !v.length) v = '';
    if (v && typeof v === 'object' && !Array.isArray(v) && f.type === 'file' && !v.id) v = '';
    if (v === '') {
      if (f.required) errors[f.key] = 'Medan ini wajib diisi.';
      clean[f.key] = '';
      return;
    }
    switch (f.type) {
      case 'number':
        var n = Number(v);
        if (!isFinite(n)) { errors[f.key] = 'Mesti nombor.'; break; }
        if (f.min !== undefined && n < f.min) { errors[f.key] = 'Nilai minimum ialah ' + f.min + '.'; break; }
        if (f.max !== undefined && n > f.max) { errors[f.key] = 'Nilai maksimum ialah ' + f.max + '.'; break; }
        clean[f.key] = n;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T00:00:00Z').getTime()) ||
            new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) { errors[f.key] = 'Tarikh tidak sah (YYYY-MM-DD).'; break; }
        clean[f.key] = v;
        break;
      case 'month':
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v))) { errors[f.key] = 'Bulan tidak sah (YYYY-MM).'; break; }
        clean[f.key] = String(v);
        break;
      case 'time':
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) { errors[f.key] = 'Masa tidak sah (HH:MM).'; break; }
        clean[f.key] = String(v);
        break;
      case 'people':
        var list = Array.isArray(v) ? v : parseJson_(String(v), null);
        var noun = f.noun || 'pelajar', maxN = f.max || 30;
        if (!Array.isArray(list) || !list.length) { errors[f.key] = 'Tambah sekurang-kurangnya seorang ' + noun + '.'; break; }
        if (list.length > maxN) { errors[f.key] = 'Maksimum ' + maxN + ' ' + noun + ' bagi satu rekod.'; break; }
        var people = [], bad = [];
        list.forEach(function (p, i) {
          var nama = String(p && p.nama || '').trim(), matrik = String(p && p.matrik || '').trim(), kp = String(p && p.nokp || '').replace(/\s+/g, '').toUpperCase();
          if (/^\d{6}-?\d{2}-?\d{4}$/.test(kp)) kp = kp.replace(/-/g, ''); // No. KP 12 digit disimpan tanpa sengkang
          var miss = [];
          if (!nama || nama.length > 120) miss.push('nama');
          if (!matrik || matrik.length > 30) miss.push('no. matrik');
          if (f.kp === false) kp = ''; // medan no. KP tidak digunakan bagi KPI ini
          else if (!/^[A-Z0-9-]{6,20}$/.test(kp)) miss.push('no. KP / pasport');
          if (miss.length) bad.push(noun.charAt(0).toUpperCase() + noun.slice(1) + ' ' + (i + 1) + ': ' + miss.join(', ') + ' tidak sah'); else people.push({ nama: nama, matrik: matrik, nokp: kp });
        });
        if (bad.length) { errors[f.key] = bad.join('; ') + '.'; break; }
        clean[f.key] = JSON.stringify(people);
        break;
      case 'file':
        var fv = typeof v === 'string' ? parseJson_(v, null) : v;
        if (!fv || typeof fv.id !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(fv.id)) { errors[f.key] = 'Muat naik fail PDF.'; break; }
        var keep = existing ? parseJson_(existing[f.key], {}) : {};
        if (keep && keep.id === fv.id) { clean[f.key] = JSON.stringify({ id: keep.id, name: String(keep.name || 'sijil.pdf').slice(0, 100) }); break; }
        // Fail baharu mesti baru dimuat naik oleh pengguna ini melalui aplikasi (elak merujuk fail Drive sembarangan).
        var up = parseJson_(CacheService.getScriptCache().get('up:' + fv.id), null);
        if (!up || up.e !== user.emel || up.k !== kpi.id) { errors[f.key] = 'Fail tidak sah atau tamat tempoh. Sila muat naik semula.'; break; }
        clean[f.key] = JSON.stringify({ id: fv.id, name: String(up.n || 'sijil.pdf').slice(0, 100) });
        break;
      case 'select':
        if (f.options.indexOf(String(v)) < 0) { errors[f.key] = 'Pilihan tidak sah.'; break; }
        clean[f.key] = String(v);
        break;
      case 'yesno':
        if (YES_NO.indexOf(String(v)) < 0) { errors[f.key] = 'Pilih Ya atau Tidak.'; break; }
        clean[f.key] = String(v);
        break;
      case 'faculty':
        if (facCodes.indexOf(String(v)) < 0) { errors[f.key] = 'Fakulti tidak sah.'; break; }
        if (f.key === 'fakulti' && !facultyAllowedForKpi_(kpi, String(v))) { errors[f.key] = 'Fakulti ini tidak termasuk dalam KPI ini.'; break; }
        clean[f.key] = String(v);
        break;
      case 'email':
        v = String(v).toLowerCase();
        if (!isEmail_(v)) { errors[f.key] = 'E-mel tidak sah.'; break; }
        clean[f.key] = v;
        break;
      case 'url':
        if (!/^https?:\/\/[^\s]+$/i.test(String(v)) || String(v).length > 500) { errors[f.key] = 'Pautan mesti bermula dengan http:// atau https://.'; break; }
        clean[f.key] = String(v);
        break;
      case 'textarea':
        if (String(v).length > 2000) { errors[f.key] = 'Maksimum 2000 aksara.'; break; }
        clean[f.key] = sanitizeText_(v);
        break;
      default:
        if (String(v).length > 300) { errors[f.key] = 'Maksimum 300 aksara.'; break; }
        clean[f.key] = sanitizeText_(v);
    }
  });

  (kpi.rules || []).forEach(function (rule) {
    if (rule.when.in.indexOf(String(clean[rule.when.field])) >= 0) {
      rule.require.forEach(function (key) {
        if ((clean[key] === '' || clean[key] === undefined) && !errors[key]) {
          errors[key] = 'Wajib diisi apabila ' + labelOf_(kpi, rule.when.field) + ' = ' + clean[rule.when.field] + '.';
        }
      });
    }
  });
  if (kpi.validate) kpi.validate(clean, errors, rows || [], existing || null);
  return { clean: clean, errors: errors };
}

function labelOf_(kpi, key) {
  for (var i = 0; i < kpi.fields.length; i++) { if (kpi.fields[i].key === key) return kpi.fields[i].label; }
  return key;
}

function nextId_(kpi, rows) {
  var max = 0, re = new RegExp('^' + kpi.prefix + '-(\\d+)$');
  rows.forEach(function (r) { var m = re.exec(String(r.id)); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return kpi.prefix + '-' + ('000' + (max + 1)).slice(-3);
}

function saveRecord_(token, kpiId, rec) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  if (!rec || typeof rec !== 'object') throw userError_('Data tidak sah.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var isPic = user.peranan !== ROLES.ADMIN;
    var input = {};
    for (var k in rec) { if (rec.hasOwnProperty(k)) input[k] = rec[k]; }
    // PIC hanya boleh merekod bagi fakulti sendiri.
    if (isPic && kpi.entry === 'faculty') input.fakulti = user.fakulti;

    var table = readTable_(kpi.sheet, typesFor_(kpi));
    var missingCols = kpiColumns_(kpi).filter(function (c) { return table.headers.indexOf(c) < 0; });
    if (missingCols.length) throw userError_('Skema Sheet belum dikemas kini. Pentadbir perlu menjalankan setup() semula.');
    var sh = getSheet_(kpi.sheet);
    var now = nowIso_();
    var id = String(rec.id || '');
    var existing = null;
    if (id) {
      table.rows.forEach(function (r) { if (r.id === id) existing = r; });
      if (!existing) throw userError_('Rekod tidak dijumpai.');
      if (isPic && kpi.entry === 'faculty' && existing.fakulti !== user.fakulti) throw userError_('Akses ditolak: rekod ini milik fakulti lain.');
    }

    var v = validateRecord_(kpi, input, listFaculties_(), user, existing, table.rows);
    if (Object.keys(v.errors).length) throw userError_('Sila betulkan medan yang bertanda.', { fields: v.errors });

    // Medan unik (contoh: satu profil bagi setiap no. matrik).
    (kpi.unique || []).forEach(function (key) {
      var val = String(v.clean[key] === undefined ? '' : v.clean[key]).replace(/^'/, '').toLowerCase();
      if (!val) return;
      var dup = table.rows.filter(function (r) { return r.id !== id && String(r[key]).replace(/^'/, '').toLowerCase() === val; })[0];
      if (dup) {
        var dupFields = {};
        // ID rekod hanya didedahkan kepada Admin atau PIC fakulti yang sama (elak mendedahkan rekod fakulti lain).
        var sameScope = !isPic || dup.fakulti === undefined || dup.fakulti === user.fakulti;
        var dupFd = kpi.fields.filter(function (f) { return f.key === key; })[0];
        dupFields[(dupFd && dupFd.errorOn) || key] = 'Sudah didaftarkan' + (sameScope ? ' (' + dup.id + ')' : '') + '.';
        throw userError_('Sila betulkan medan yang bertanda.', { fields: dupFields });
      }
    });

    var obj, action, summary;
    if (existing) {
      var changed = [];
      kpi.fields.forEach(function (f) { if (String(existing[f.key]) !== String(v.clean[f.key])) changed.push(f.key); });
      obj = { id: id, dicipta_pada: existing.dicipta_pada, dicipta_oleh: existing.dicipta_oleh, dikemas_kini_pada: now, dikemas_kini_oleh: user.emel };
      for (var a in v.clean) { if (v.clean.hasOwnProperty(a)) obj[a] = v.clean[a]; }
      setFileLinks_(kpi, v.clean, obj);
      writeRow_(sh, existing._row, obj);
      // Fail lampiran yang diganti dibuang ke tong sampah Drive.
      kpi.fields.forEach(function (f) {
        if (f.type !== 'file') return;
        var oldId = (parseJson_(existing[f.key], {}) || {}).id, newId = (parseJson_(v.clean[f.key], {}) || {}).id;
        if (oldId && oldId !== newId) trashFile_(oldId);
      });
      action = 'KEMAS_KINI'; summary = 'Medan diubah: ' + (changed.join(', ') || '(tiada)');
    } else {
      id = nextId_(kpi, table.rows);
      obj = { id: id, dicipta_pada: now, dicipta_oleh: user.emel, dikemas_kini_pada: now, dikemas_kini_oleh: user.emel };
      for (var b in v.clean) { if (v.clean.hasOwnProperty(b)) obj[b] = v.clean[b]; }
      setFileLinks_(kpi, v.clean, obj);
      writeRow_(sh, null, obj);
      action = 'TAMBAH'; summary = 'Rekod baharu' + (kpi.entry === 'faculty' ? ' (' + obj.fakulti + ')' : '');
    }
    audit_(user, action, kpi.id, id, summary);
    clearDashCache_();
    return stripRow_(obj);
  } finally {
    lock.releaseLock();
  }
}


/**
 * Muat naik pukal (CSV): setiap baris melalui pengesahan dan pemeriksaan unik yang sama seperti borang tunggal (saveRecord_).
 * Baris yang gagal dilaporkan dengan nombor baris; baris yang sah disimpan. Rekod sedia ada tidak boleh diubah melalui pukal.
 */
var BULK_MAX_PER_CALL = 40;
function bulkSave_(token, kpiId, rows) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  if (!Array.isArray(rows) || !rows.length) throw userError_('Tiada baris untuk dimuat naik.');
  if (rows.length > BULK_MAX_PER_CALL) throw userError_('Terlalu banyak baris dalam satu panggilan (maksimum ' + BULK_MAX_PER_CALL + ').');
  var out = [], okCount = 0;
  rows.forEach(function (item) {
    var n = item && item.n, rec = {};
    try {
      var src = (item && item.rec) || {};
      kpi.fields.forEach(function (f) {
        if (f.type === 'file' || f.hidden) return;   // lampiran dimuat naik melalui Edit rekod
        if (src[f.key] !== undefined) rec[f.key] = src[f.key];
      });
      var saved = saveRecord_(token, kpi.id, rec);
      okCount++;
      out.push({ n: n, ok: true, id: saved.id });
    } catch (e) {
      if (!(e && e.user)) throw e;
      if (e.auth) throw e;
      out.push({ n: n, ok: false, error: e.message, fields: e.fields || null });
    }
  });
  audit_(user, 'MUAT_NAIK_PUKAL', kpi.id, '', okCount + ' berjaya, ' + (rows.length - okCount) + ' gagal');
  return { results: out, saved: okCount };
}

/** Ringkasan rekod untuk log audit: tiada nama pelajar, no. KP atau lampiran. */
function auditSummary_(kpi, row) {
  var parts = [];
  kpi.listColumns.forEach(function (c) {
    var f = kpi.fields.filter(function (x) { return x.key === c; })[0];
    if (c === 'id' || (f && (f.type === 'people' || f.type === 'file'))) return;
    if (row[c] !== '' && row[c] !== undefined) parts.push(c + '=' + row[c]);
  });
  return parts.join(', ').slice(0, 300);
}

function deleteRecord_(token, kpiId, id) {
  var user = requireAdmin_(token);
  var kpi = getKpi_(String(kpiId));
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = readTable_(kpi.sheet, typesFor_(kpi));
    var existing = null;
    table.rows.forEach(function (r) { if (r.id === String(id)) existing = r; });
    if (!existing) throw userError_('Rekod tidak dijumpai.');
    getSheet_(kpi.sheet).deleteRow(existing._row);
    kpi.fields.forEach(function (f) { if (f.type === 'file') trashFile_((parseJson_(existing[f.key], {}) || {}).id); });
    audit_(user, 'PADAM', kpi.id, existing.id, 'Rekod dipadam: ' + auditSummary_(kpi, existing));
    clearDashCache_();
    return true;
  } finally {
    lock.releaseLock();
  }
}
// ===== Files.gs =====
/**
 * Lampiran PDF (sijil). Fail disimpan dalam satu folder Drive peribadi milik pemilik skrip dan TIDAK dikongsi.
 * Muat turun hanya melalui aplikasi selepas semakan akses (PIC: fakulti sendiri; Admin: semua).
 */
var UPLOAD_MAX_BYTES = 5 * 1024 * 1024;   // 5 MB
var UPLOAD_MAX_PER_HOUR = 20;

function safeFileName_(name) {
  var n = String(name || 'sijil.pdf').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
  if (!/\.pdf$/i.test(n)) n += '.pdf';
  return n.slice(-100);
}

function uploadFile_(token, kpiId, fieldKey, payload) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  var field = kpi.fields.filter(function (f) { return f.key === fieldKey && f.type === 'file'; })[0];
  if (!field) throw userError_('Medan fail tidak sah.');
  if (!payload || typeof payload.data !== 'string' || !payload.data.length) throw userError_('Tiada fail diterima.');
  if (payload.data.length > Math.ceil(UPLOAD_MAX_BYTES * 4 / 3) + 8) throw userError_('Fail terlalu besar. Maksimum 5 MB.');

  var cache = CacheService.getScriptCache();
  var rateKey = 'uprate:' + sha256Hex_(user.emel);
  var n = parseInt(cache.get(rateKey) || '0', 10);
  if (n >= UPLOAD_MAX_PER_HOUR) throw userError_('Terlalu banyak muat naik. Cuba lagi dalam satu jam.');
  cache.put(rateKey, String(n + 1), 3600);

  var bytes;
  try { bytes = Utilities.base64Decode(payload.data); } catch (e) { throw userError_('Fail rosak atau tidak sah.'); }
  if (bytes.length > UPLOAD_MAX_BYTES) throw userError_('Fail terlalu besar. Maksimum 5 MB.');
  // Pengesahan kandungan sebenar: PDF bermula dengan "%PDF-" (bukan sekadar nama fail).
  var magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  for (var i = 0; i < magic.length; i++) { if ((bytes[i] & 0xff) !== magic[i]) throw userError_('Fail mesti dalam format PDF.'); }

  var name = safeFileName_(payload.name);
  var stored = kpi.id + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd-HHmmss') + '_' + randomHex_(6) + '.pdf';
  var file = getAttachFolder_().createFile(Utilities.newBlob(bytes, 'application/pdf', stored));
  cache.put('up:' + file.getId(), JSON.stringify({ e: user.emel, k: kpi.id, n: name }), 3600);
  audit_(user, 'MUAT_NAIK', kpi.id, '', name + ' (' + bytes.length + ' bait)');
  return { id: file.getId(), name: name, size: bytes.length };
}

function downloadFile_(token, kpiId, recordId, fieldKey) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  var field = kpi.fields.filter(function (f) { return f.key === fieldKey && f.type === 'file'; })[0];
  if (!field) throw userError_('Medan fail tidak sah.');
  var row = null;
  readTable_(kpi.sheet, typesFor_(kpi)).rows.forEach(function (r) { if (r.id === String(recordId)) row = r; });
  if (!row) throw userError_('Rekod tidak dijumpai.');
  if (user.peranan !== ROLES.ADMIN && kpi.entry === 'faculty' && row.fakulti !== user.fakulti) throw userError_('Akses ditolak: rekod ini milik fakulti lain.');
  var ref = parseJson_(row[fieldKey], null);
  if (!ref || !ref.id) throw userError_('Tiada fail pada rekod ini.');
  var file = DriveApp.getFileById(ref.id);
  if (!fileInFolder_(file)) throw userError_('Fail tidak sah.');
  var blob = file.getBlob();
  audit_(user, 'MUAT_TURUN', kpi.id, row.id, ref.name || '');
  return { name: ref.name || 'sijil.pdf', mime: 'application/pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}
// ===== Metrics.gs =====
/**
 * Pengiraan dashboard. Semua sasaran ialah MINIMUM (boleh dilebihi) kecuali KPI berjenis "kemajuan"
 * (KAI 2, DKAI 1) yang berakhir pada 100%. Dashboard awam hanya menerima data agregat (tiada data peribadi).
 */

function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function round1_(n) { return Math.round(n * 10) / 10; }
function round2_(n) { return Math.round(n * 100) / 100; }
function rm_(n) { return 'RM ' + round2_(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function sumBy_(rows, keyFn, valFn) {
  var m = {}, order = [];
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k === '' || k === undefined || k === null) k = '(tiada)';
    if (!(k in m)) { m[k] = 0; order.push(k); }
    m[k] += valFn(r);
  });
  return order.map(function (k) { return { label: k, value: round2_(m[k]) }; });
}
function sumOf_(rows, field) { var t = 0; rows.forEach(function (r) { t += num_(r[field]); }); return t; }
function distinctCount_(rows, field) {
  var seen = {};
  rows.forEach(function (r) { var v = String(r[field] || '').trim().toLowerCase(); if (v) seen[v] = 1; });
  return Object.keys(seen).length;
}
function byMonth_(items) { return items.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); }); }

function countBy_(rows, keyFn) {
  var m = {}, order = [];
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k === '' || k === undefined || k === null) k = '(tiada)';
    if (!(k in m)) { m[k] = 0; order.push(k); }
    m[k] += 1;
  });
  return order.map(function (k) { return { label: k, value: m[k] }; });
}

function sortDesc_(items) { return items.sort(function (a, b) { return b.value - a.value; }); }

function perFacultyItems_(kpi, rows, faculties) {
  var counts = {};
  rows.forEach(function (r) { counts[r.fakulti] = (counts[r.fakulti] || 0) + 1; });
  var codes = kpi.facultyWhitelist ? kpi.facultyWhitelist.slice() : Object.keys(counts);
  if (!kpi.facultyWhitelist && kpi.perFacultyTarget) {
    faculties.forEach(function (f) { if (f.kod !== 'UTMXCITE' && codes.indexOf(f.kod) < 0) codes.push(f.kod); });
  }
  return codes.map(function (c) {
    var it = { label: c, value: counts[c] || 0 };
    if (kpi.perFacultyTarget) it.target = kpi.perFacultyTarget;
    return it;
  });
}

function countedInYear_(rows, statuses, dateField, year) {
  return rows.filter(function (r) {
    return statuses.indexOf(r.status) >= 0 && yearOf_(r[dateField]) === year;
  });
}

var MEASURES = {
  // ---- KPT: KPI peringkat Kementerian (Kamus KPI Keusahawanan IPT 2026-2030). Paparan awam: agregat sahaja. ----
  // KPT 1: jumlah jualan agregat usahawan pelajar (CKAI 7), tidak termasuk geran / pembiayaan.
  kpt1: function (kpi, rows, year, ctx) {
    var sales = ctx.rows('CKAI7').filter(function (r) { return yearOf_(r.tempoh) === year && r.jenis_pendapatan !== 'Geran / Pembiayaan'; });
    var total = sumOf_(sales, 'pendapatan_rm');
    return {
      value: round2_(total),
      secondary: [
        { label: 'Usahawan melaporkan jualan', value: distinctCount_(sales.map(function (r) { return { k: r.no_kp || r.no_matrik || r.nama_perniagaan }; }), 'k') },
        { label: 'Geran / pembiayaan (dikecualikan)', value: rm_(sumOf_(ctx.rows('CKAI7').filter(function (r) { return yearOf_(r.tempoh) === year && r.jenis_pendapatan === 'Geran / Pembiayaan'; }), 'pendapatan_rm')) }
      ],
      breakdown: [
        { title: 'Jualan (RM) mengikut fakulti', items: sortDesc_(sumBy_(sales, function (r) { return r.fakulti; }, function (r) { return num_(r.pendapatan_rm); })) },
        { title: 'Jualan (RM) mengikut jenis pendapatan', items: sortDesc_(sumBy_(sales, function (r) { return r.jenis_pendapatan; }, function (r) { return num_(r.pendapatan_rm); })) }
      ]
    };
  },

  // KPT 2: % graduan usahawan (menubuhkan perniagaan berdaftar / menjana pekerjaan) daripada usahawan pelajar tahun akhir.
  kpt2: function (kpi, rows, year) {
    var grads = rows.filter(function (r) { return r.jenis_rekod === 'Graduan usahawan' && yearOf_(r.tarikh_tamat) === year; });
    var den = 0;
    rows.forEach(function (r) { if (r.jenis_rekod === 'Penyebut tahunan' && num_(r.tahun) === year) den += num_(r.bil_penyebut); });
    var w = [];
    if (!den && grads.length) w.push('Penyebut (bilangan usahawan pelajar tahun akhir) belum dilaporkan untuk tahun ini.');
    return {
      value: den ? round1_(grads.length * 100 / den) : 0,
      secondary: [{ label: 'Graduan usahawan', value: grads.length }, { label: 'Usahawan pelajar tahun akhir (penyebut)', value: den }],
      breakdown: [
        { title: 'Graduan mengikut kategori', items: countBy_(grads, function (r) { return r.kategori; }) },
        { title: 'Graduan mengikut fakulti', items: sortDesc_(countBy_(grads, function (r) { return r.fakulti; })) }
      ],
      warnings: w
    };
  },

  // KPT 3: % tenaga pengajar keusahawanan yang terlibat dalam program peningkatan kompetensi.
  kpt3: function (kpi, rows, year) {
    var all = rows.filter(function (r) { return num_(r.tahun) === year; });
    var done = all.filter(function (r) { return r.terlibat === 'Ya'; });
    return {
      value: all.length ? round1_(done.length * 100 / all.length) : 0,
      secondary: [{ label: 'Tenaga pengajar berdaftar', value: all.length }, { label: 'Terlibat dalam program', value: done.length }],
      breakdown: [
        { title: 'Terlibat mengikut program', items: sortDesc_(countBy_(done, function (r) { return r.program; })) },
        { title: 'Terlibat mengikut peranan', items: sortDesc_(countBy_(done, function (r) { return r.peranan; })) },
        { title: 'Terlibat mengikut fakulti', items: sortDesc_(countBy_(done, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // KPT 4: pelajar memanfaatkan inovasi dan teknologi (TRL 1-3), dikira sekali sahaja (tahun kemunculan pertama).
  // Sumber: daftar KPT 4 + pelajar dalam CKAI 8 (inovasi pelajar) yang TRL 1-3.
  kpt4: function (kpi, rows, year, ctx) {
    var first = {};
    function add(key, y, fakulti, sumber) {
      key = String(key || '').replace(/^'/, '').trim().toLowerCase();
      if (!key || !y) return;
      if (!first[key] || y < first[key].y) first[key] = { y: y, fakulti: fakulti, sumber: sumber };
    }
    rows.forEach(function (r) { add(r.no_matrik, yearOf_(r.tarikh), r.fakulti, 'Daftar fakulti (KPT 4)'); });
    ctx.rows('CKAI8').forEach(function (r) {
      if (['TRL 1', 'TRL 2', 'TRL 3'].indexOf(r.trl) < 0) return;
      var p = parseJson_(r.pelajar, []);
      if (Array.isArray(p)) p.forEach(function (x) { add(x && x.matrik, yearOf_(r.tarikh), r.fakulti, 'Inovasi pelajar (CKAI 8)'); });
    });
    var counted = Object.keys(first).map(function (k) { return first[k]; }).filter(function (x) { return x.y === year; });
    return {
      value: counted.length,
      secondary: [{ label: 'Terkumpul sehingga tahun ini', value: Object.keys(first).filter(function (k) { return first[k].y <= year; }).length }],
      breakdown: [
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(counted, function (x) { return x.fakulti; })) },
        { title: 'Mengikut sumber data', items: countBy_(counted, function (x) { return x.sumber; }) }
      ]
    };
  },

  // KPT 5: syarikat pemula (SSU aktif) berasaskan inovasi dan teknologi, TRL 4-6, didaftarkan pada tahun itu.
  kpt5: function (kpi, rows, year, ctx) {
    var cs = ctx.rows('CKAI4').filter(function (r) {
      return r.status === 'Aktif' && r.berasaskan_inovasi === 'Ya' && ['TRL 4', 'TRL 5', 'TRL 6'].indexOf(r.trl_syarikat) >= 0 && yearOf_(r.tarikh_daftar) === year;
    });
    return {
      value: cs.length,
      secondary: [{ label: 'Berdaftar SSM', value: cs.filter(function (r) { return r.status_ssm === 'Berdaftar'; }).length }],
      breakdown: [
        { title: 'Mengikut TRL', items: countBy_(cs, function (r) { return r.trl_syarikat; }).sort(function (a, b) { return a.label.localeCompare(b.label); }) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(cs, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // KPT 6: projek / aktiviti berimpak daripada kolaborasi rasmi pada tahun itu.
  kpt6: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh) === year; });
    return {
      value: inYear.length,
      secondary: [
        { label: 'Tempatan', value: inYear.filter(function (r) { return r.skop === 'Tempatan'; }).length },
        { label: 'Antarabangsa', value: inYear.filter(function (r) { return r.skop === 'Antarabangsa'; }).length }
      ],
      breakdown: [
        { title: 'Mengikut dokumen rasmi', items: sortDesc_(countBy_(inYear, function (r) { return r.jenis_dokumen; })) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // KPT 7: syarikat / projek dibiayai (unik setiap tahun). Sumber: daftar KPT 7 + hadiah pertandingan (CKAI 9, nilai hadiah > 0).
  kpt7: function (kpi, rows, year, ctx) {
    var items = [];
    rows.forEach(function (r) { if (yearOf_(r.tarikh) === year) items.push({ name: r.nama_syarikat, jenis: r.jenis_pembiaya, rm: num_(r.jumlah_rm), fakulti: r.fakulti }); });
    ctx.rows('CKAI9').forEach(function (r) {
      if (yearOf_(r.tarikh) === year && num_(r.nilai_hadiah_rm) > 0) items.push({ name: r.produk_projek || r.nama_anugerah, jenis: 'Hadiah pertandingan keusahawanan', rm: num_(r.nilai_hadiah_rm), fakulti: r.fakulti });
    });
    var seen = {}, uniq = [];
    items.forEach(function (x) { var k = String(x.name || '').trim().toLowerCase(); if (k && !seen[k]) { seen[k] = 1; uniq.push(x); } });
    return {
      value: uniq.length,
      secondary: [{ label: 'Jumlah nilai pembiayaan', value: rm_(sumOf_(items, 'rm')) }],
      breakdown: [
        { title: 'Mengikut jenis pembiayaan', items: sortDesc_(countBy_(items, function (x) { return x.jenis; })) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(uniq, function (x) { return x.fakulti; })) }
      ]
    };
  },

  // KAI 1: inkubator aktif = didaftarkan DAN (dalam pembangunan atau beroperasi); sasaran minimum 20 setiap tahun.
  kai1: function (kpi, rows, year, ctx) {
    var active = rows.filter(function (r) {
      if (r.didaftarkan !== 'Ya') return false;
      var reg = yearOf_(r.tarikh_pendaftaran), off = yearOf_(r.tarikh_tidak_aktif);
      if (!reg || reg > year) return false;
      if (off && off <= year) return false;
      if (r.status === 'Dalam pembangunan' || r.status === 'Beroperasi') return true;
      return r.status === 'Tidak aktif' && !!off && off > year;
    });
    var oper = active.filter(function (r) { return r.status === 'Beroperasi'; }).length;
    var jenis = countBy_(active, function (r) { return r.jenis; });
    jenis.forEach(function (it) {
      if (it.label === 'Inkubator Fakulti') it.target = 13;
      if (it.label === 'Co-working / Ruang Individu') it.target = 10;
    });
    return {
      value: active.length,
      secondary: [{ label: 'Sudah beroperasi', value: oper }],
      breakdown: [
        { title: 'Mengikut aliran', items: countBy_(active, function (r) { return r.aliran; }) },
        { title: 'Mengikut jenis (sasaran dalaman 13 + 10)', items: jenis },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(active, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // Kemajuan berpemberat (KAI 2, DKAI 1): jumlah (peratus siap x pemberat) / 100.
  progress: function (kpi, rows) {
    var sum = 0, weight = 0, done = 0;
    rows.forEach(function (r) {
      sum += num_(r.peratus_siap) * num_(r.pemberat) / 100;
      weight += num_(r.pemberat);
      if (r.status === 'Siap') done += 1;
    });
    var warnings = [];
    if (rows.length && Math.abs(weight - 100) > 0.01) warnings.push('Jumlah pemberat milestone ialah ' + round1_(weight) + '% (sepatutnya 100%).');
    return {
      value: Math.min(100, round1_(sum)),
      secondary: [{ label: 'Milestone siap', value: done + ' / ' + rows.length }],
      warnings: warnings,
      breakdown: [{
        title: 'Kemajuan milestone (%)',
        items: rows.map(function (r) { return { label: (r.fasa || r.peringkat || '') + ' - ' + r.nama_milestone + ' (' + num_(r.pemberat) + '%)', value: num_(r.peratus_siap), target: 100 }; })
      }]
    };
  },


  // CKAI 1: bilangan profiling pelajar yang didaftarkan pada tahun itu (satu profil bagi setiap pelajar).
  profiling: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh_profiling) === year; });
    var order = ['Tiada minat', 'Rendah', 'Sederhana', 'Tinggi'];
    var ready = ['Belum ada idea', 'Ada idea', 'Ada prototaip / MVP', 'Sudah beroperasi'];
    return {
      value: inYear.length,
      secondary: [
        { label: 'Berminat (sederhana / tinggi)', value: inYear.filter(function (r) { return r.tahap_minat === 'Sederhana' || r.tahap_minat === 'Tinggi'; }).length },
        { label: 'Sudah ada idea / prototaip / berniaga', value: inYear.filter(function (r) { return r.tahap_kesediaan && r.tahap_kesediaan !== 'Belum ada idea'; }).length },
        { label: 'Sedang berniaga', value: inYear.filter(function (r) { return r.pengalaman_perniagaan === 'Sedang berniaga'; }).length }
      ],
      breakdown: [
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) },
        { title: 'Mengikut tahap minat', items: countBy_(inYear, function (r) { return r.tahap_minat; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }) },
        { title: 'Mengikut tahap kesediaan', items: countBy_(inYear, function (r) { return r.tahap_kesediaan || '(tiada)'; }).sort(function (a, b) { return ready.indexOf(a.label) - ready.indexOf(b.label); }) },
        { title: 'Mengikut sumber profiling', items: sortDesc_(countBy_(inYear, function (r) { return r.sumber_profiling; })) }
      ]
    };
  },

  // CKAI 2 dan 3: program yang SELESAI pada tahun itu (mengikut tarikh tamat), termasuk penyertaan, kos dan pendapatan.
  program: function (kpi, rows, year) {
    var done = rows.filter(function (r) { return r.status === 'Selesai' && yearOf_(r.tarikh_tamat) === year; });
    var upcoming = rows.filter(function (r) { return (r.status === 'Dirancang' || r.status === 'Sedang berjalan') && yearOf_(r.tarikh_mula) === year; });
    var cost = sumOf_(done, 'bajet_rm'), income = sumOf_(done, 'pendapatan_rm');
    return {
      value: done.length,
      secondary: [
        { label: 'Jumlah peserta', value: sumOf_(done, 'bil_peserta') },
        { label: 'Daripada itu pelajar', value: sumOf_(done, 'bil_pelajar') },
        { label: 'Kos penganjuran', value: rm_(cost) },
        { label: 'Pendapatan', value: rm_(income) },
        { label: 'Dirancang / sedang berjalan', value: upcoming.length }
      ],
      breakdown: [
        { title: 'Program selesai mengikut fakulti / penganjur', items: sortDesc_(countBy_(done, function (r) { return r.fakulti; })) },
        { title: 'Mengikut kategori', items: sortDesc_(countBy_(done, function (r) { return r.kategori; })) },
        { title: 'Peserta mengikut fakulti / penganjur', items: sortDesc_(sumBy_(done, function (r) { return r.fakulti; }, function (r) { return num_(r.bil_peserta); })) }
      ]
    };
  },

  // CKAI 4: pendaftaran SSU (Sistem Syarikat Universiti) pada tahun itu.
  ssu: function (kpi, rows, year) {
    var reg = rows.filter(function (r) { return yearOf_(r.tarikh_daftar) === year; });
    return {
      value: reg.length,
      secondary: [{ label: 'Masih aktif', value: reg.filter(function (r) { return r.status === 'Aktif'; }).length }],
      breakdown: [{ title: 'Mengikut fakulti', items: sortDesc_(countBy_(reg, function (r) { return r.fakulti; })) }]
    };
  },

  // CKAI 7: jumlah pendapatan usahawan pelajar (RM) bagi bulan-bulan dalam tahun itu.
  income: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tempoh) === year; });
    var total = sumOf_(inYear, 'pendapatan_rm');
    return {
      value: round2_(total),
      secondary: [
        { label: 'Perniagaan melaporkan pendapatan', value: distinctCount_(inYear, 'nama_perniagaan') },
        { label: 'Purata setiap perniagaan', value: rm_(distinctCount_(inYear, 'nama_perniagaan') ? total / distinctCount_(inYear, 'nama_perniagaan') : 0) }
      ],
      breakdown: [
        { title: 'Pendapatan (RM) mengikut fakulti', items: sortDesc_(sumBy_(inYear, function (r) { return r.fakulti; }, function (r) { return num_(r.pendapatan_rm); })) },
        { title: 'Pendapatan (RM) mengikut jenis', items: sortDesc_(sumBy_(inYear, function (r) { return r.jenis_pendapatan; }, function (r) { return num_(r.pendapatan_rm); })) },
        { title: 'Pendapatan (RM) mengikut bulan', items: byMonth_(sumBy_(inYear, function (r) { return r.tempoh; }, function (r) { return num_(r.pendapatan_rm); })) }
      ]
    };
  },

  // CKAI 5: bilangan penggunaan Makerspace = bilangan permohonan (satu rekod = satu penggunaan), mengikut tahun tarikh mula.
  makerspace: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh_mula) === year; });
    var users = {};
    inYear.forEach(function (r) { users[String(r.no_matrik || r.emel).toUpperCase()] = 1; });
    return {
      value: inYear.length,
      secondary: [
        { label: 'Pengguna unik', value: Object.keys(users).length },
        { label: 'Jumlah peserta', value: sumOf_(inYear, 'bil_peserta') },
        { label: 'Caj diterima', value: rm_(sumOf_(inYear.filter(function (r) { return r.status_bayaran === 'Bayar'; }), 'bayaran_rm')) },
        { label: 'Caj belum dibayar', value: rm_(sumOf_(inYear.filter(function (r) { return r.status_bayaran === 'Belum Dibayar'; }), 'bayaran_rm')) }
      ],
      breakdown: [
        { title: 'Penggunaan mengikut bulan', items: byMonth_(countBy_(inYear, function (r) { return String(r.tarikh_mula).slice(0, 7); })) },
        { title: 'Penggunaan mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) },
        { title: 'Peralatan paling banyak dipohon', items: sortDesc_(countBy_(inYear, function (r) { return String(r.peralatan || '').trim(); })).slice(0, 5) }
      ]
    };
  },

  // CKAI 6: pendapatan sewaan ruang niaga yang DITERIMA (status Dibayar) pada tahun itu.
  rent: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tempoh) === year; });
    var paid = inYear.filter(function (r) { return r.status_bayaran === 'Dibayar'; });
    var due = inYear.filter(function (r) { return r.status_bayaran !== 'Dibayar'; });
    return {
      value: round2_(sumOf_(paid, 'jumlah_rm')),
      secondary: [
        { label: 'Belum dibayar / tertunggak', value: rm_(sumOf_(due, 'jumlah_rm')) },
        { label: 'Penyewa', value: distinctCount_(inYear, 'penyewa') }
      ],
      breakdown: [{ title: 'Sewaan diterima (RM) mengikut bulan', items: byMonth_(sumBy_(paid, function (r) { return r.tempoh; }, function (r) { return num_(r.jumlah_rm); })) }]
    };
  },

  // CKAI 8: inovasi pelajar yang TELAH menyertai pertandingan (sekurang-kurangnya peringkat Fakulti) pada tahun itu.
  innovation: function (kpi, rows, year) {
    var done = rows.filter(function (r) { return r.status_penyertaan === 'Telah menyertai' && yearOf_(r.tarikh) === year; });
    var order = ['Fakulti', 'Universiti', 'Kebangsaan', 'Antarabangsa'];
    var students = 0;
    done.forEach(function (r) { var p = parseJson_(r.pelajar, []); if (Array.isArray(p)) students += p.length; });
    var pipeOrder = ['Belum dinilai', 'Calon peningkatan', 'Sedang disokong', 'Telah dibawa ke peringkat lebih tinggi', 'Tidak diteruskan'];
    return {
      value: done.length,
      secondary: [
        { label: 'Pelajar terlibat', value: students },
        { label: 'Memenang anugerah / pingat', value: done.filter(function (r) { return !!r.pingat; }).length },
        { label: 'Peringkat Universiti ke atas', value: done.filter(function (r) { return r.peringkat !== 'Fakulti'; }).length },
        { label: 'Calon peningkatan / sedang disokong', value: done.filter(function (r) { return r.status_peningkatan === 'Calon peningkatan' || r.status_peningkatan === 'Sedang disokong'; }).length },
        { label: 'Telah dibawa ke peringkat lebih tinggi', value: done.filter(function (r) { return r.status_peningkatan === 'Telah dibawa ke peringkat lebih tinggi'; }).length },
        { label: 'Akan menyertai (dirancang)', value: rows.filter(function (r) { return r.status_penyertaan === 'Akan menyertai' && yearOf_(r.tarikh) === year; }).length }
      ],
      breakdown: [
        { title: 'Mengikut peringkat pertandingan', items: countBy_(done, function (r) { return r.peringkat; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(done, function (r) { return r.fakulti; })) },
        { title: 'Mengikut jenis inovasi', items: sortDesc_(countBy_(done, function (r) { return r.jenis_inovasi; })) },
        { title: 'Status peningkatan', items: countBy_(done, function (r) { return r.status_peningkatan || 'Belum dinilai'; }).sort(function (a, b) { return pipeOrder.indexOf(a.label) - pipeOrder.indexOf(b.label); }) }
      ]
    };
  },

  // CKAI 10: jumlah perbelanjaan operasi tabung amanah. Bagi setiap tabung, rekod bulan terkini dalam tahun itu (angka terkumpul sejak awal tahun).
  // Paparan awam: jumlah keseluruhan dan butiran mengikut nama tabung (% dan RM perbelanjaan). Chargeline dan peruntukan/baki setiap tabung hanya dalam senarai Admin.
  tabung: function (kpi, rows, year) {
    // Label tabung pada paparan awam = 5 aksara terakhir no. chargeline (contoh A.J060000.6600.07078 -> 07078)
    function kod(r) { var c = String(r.no_chargeline || '').replace(/[.\s]/g, ''); return c ? c.slice(-5) : String(r.tabung === 'Lain-lain' ? (r.tabung_lain || 'Lain-lain') : r.tabung); }
    var inYear = rows.filter(function (r) { return yearOf_(r.tempoh) === year; });
    var latest = {};
    inYear.forEach(function (r) {
      var k = String(r.kunci).split('|')[1] || String(r.tabung);
      if (!latest[k] || String(r.tempoh) > String(latest[k].tempoh)) latest[k] = r;
    });
    var a = 0, b = 0, c = 0, d = 0, n = 0, bj = 0, cBj = 0;
    Object.keys(latest).forEach(function (k) {
      var r = latest[k]; a += num_(r.peruntukan_awal); b += num_(r.komitmen); c += num_(r.perbelanjaan); d += num_(r.baki); n++;
      if (num_(r.bajet_sasaran) > 0) { bj += num_(r.bajet_sasaran); cBj += num_(r.perbelanjaan); }
    });
    var sec = [
      { label: 'Jumlah perbelanjaan terkumpul', value: rm_(c) },
      { label: 'Jumlah peruntukan / baki awal', value: rm_(a) },
      { label: 'Komitmen', value: rm_(b) },
      { label: 'Baki tabung', value: rm_(d) }
    ];
    if (bj > 0) {
      sec.push({ label: 'Bajet disasarkan', value: rm_(bj) });
      sec.push({ label: bj >= cBj ? 'Penjimatan berbanding bajet' : 'Lebihan berbanding bajet', value: rm_(Math.abs(bj - cBj)) });
      sec.push({ label: 'Perbelanjaan daripada bajet disasarkan', value: round1_(cBj * 100 / bj) + '%' });
    }
    sec.push({ label: 'Bilangan tabung dilaporkan', value: n });
    return {
      value: a ? round1_(c * 100 / a) : 0,
      secondary: sec,
      breakdown: [
        { title: '% Penggunaan Tabung', items: sortDesc_(Object.keys(latest).map(function (k) { var r = latest[k]; return { label: kod(r), value: num_(r.peruntukan_awal) ? round1_(num_(r.perbelanjaan) * 100 / num_(r.peruntukan_awal)) : 0 }; })) },
        { title: 'Perbelanjaan (RM) mengikut tabung', items: sortDesc_(Object.keys(latest).map(function (k) { var r = latest[k]; return { label: kod(r), value: round2_(num_(r.perbelanjaan)) }; })) }
      ]
    };
  },

  // CKAI 9: anugerah dan pengiktirafan inovasi / keusahawanan yang diterima pada tahun itu.
  award: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh) === year; });
    var order = ['Fakulti', 'Universiti', 'Kebangsaan', 'Antarabangsa'];
    var byLevel = countBy_(inYear, function (r) { return r.peringkat; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); });
    var students = 0;
    inYear.forEach(function (r) { var p = parseJson_(r.pelajar, []); if (Array.isArray(p)) students += p.length; });
    return {
      value: inYear.length,
      secondary: [
        { label: 'Peringkat kebangsaan / antarabangsa', value: inYear.filter(function (r) { return r.peringkat === 'Kebangsaan' || r.peringkat === 'Antarabangsa'; }).length },
        { label: 'Pingat emas / johan', value: inYear.filter(function (r) { return r.pingat === 'Emas' || r.pingat === 'Johan'; }).length },
        { label: 'Pelajar penerima', value: students }
      ],
      breakdown: [
        { title: 'Mengikut peringkat', items: byLevel },
        { title: 'Mengikut kategori', items: countBy_(inYear, function (r) { return r.kategori; }) },
        { title: 'Mengikut program', items: sortDesc_(countBy_(inYear, function (r) { return r.program; })) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // KAI 3: ruang ditawarkan kepada pelajar untuk disewa (kumulatif); penggunaan = disewa / ditawarkan.
  kai3: function (kpi, rows, year) {
    var offered = rows.filter(function (r) {
      return (r.status === 'Ditawarkan' || r.status === 'Disewa') && yearOf_(r.tarikh_ditawarkan) && yearOf_(r.tarikh_ditawarkan) <= year;
    });
    var rented = offered.filter(function (r) { return r.status === 'Disewa'; });
    var rate = offered.length ? round1_(rented.length / offered.length * 100) : 0;
    var order = ['Dikenal pasti', 'Spesifikasi disediakan', 'Dalam perolehan', 'Siap', 'Ditawarkan', 'Disewa', 'Tidak aktif'];
    var pipe = countBy_(rows, function (r) { return r.status; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); });
    return {
      value: offered.length,
      secondary: [{ label: 'Disewa pelajar', value: rented.length }, { label: 'Kadar penggunaan', value: rate + '%' }],
      breakdown: [
        { title: 'Ruang ditawarkan mengikut jenis', items: countBy_(offered, function (r) { return r.jenis_ruang; }) },
        { title: 'Ruang ditawarkan mengikut lokasi', items: sortDesc_(countBy_(offered, function (r) { return r.lokasi; })) },
        { title: 'Saluran paip semua ruang (mengikut status)', items: pipe }
      ]
    };
  },

  // KAI 4: pelajar mendaftar dalam GiGAUTM Ascend pada tahun itu.
  kai4: function (kpi, rows, year, ctx) {
    var counted = countedInYear_(rows, ['Mendaftar', 'Tamat'], 'tarikh_daftar', year);
    return {
      value: counted.length,
      secondary: [
        { label: 'Bootcamp tamat', value: counted.filter(function (r) { return r.bootcamp_status === 'Tamat'; }).length },
        { label: 'Gig diperoleh', value: counted.filter(function (r) { return r.gig_diperoleh === 'Ya'; }).length }
      ],
      breakdown: [
        { title: 'Pelajar mendaftar mengikut fakulti (cadangan minimum 2 setiap fakulti)', items: perFacultyItems_(kpi, counted, ctx.faculties) },
        { title: 'Semua permohonan mengikut status (keseluruhan)', items: countBy_(rows, function (r) { return r.status; }) }
      ]
    };
  },

  // KAI 5: pelajar mendaftar dalam F-SIP pada tahun itu.
  kai5: function (kpi, rows, year) {
    var counted = countedInYear_(rows, ['Mendaftar', 'Tamat'], 'tarikh_daftar', year);
    return {
      value: counted.length,
      secondary: [{ label: 'Kertas konsep diluluskan', value: rows.filter(function (r) { return r.kertas_konsep_status === 'Diluluskan'; }).length }],
      breakdown: [
        { title: 'Pelajar mendaftar mengikut fakulti', items: sortDesc_(countBy_(counted, function (r) { return r.fakulti; })) },
        { title: 'Semua pelajar mengikut status (keseluruhan)', items: countBy_(rows, function (r) { return r.status; }) }
      ]
    };
  },

  // KAI 6: pelajar dilatih membentuk startup AI pada tahun itu; minimum 5 setiap fakulti (FAI, FC, FKE, MJIIT).
  kai6: function (kpi, rows, year, ctx) {
    var counted = countedInYear_(rows, ['Dalam latihan', 'Tamat latihan'], 'tarikh_mula_latihan', year);
    var startups = {};
    counted.forEach(function (r) { if (r.nama_startup) startups[String(r.nama_startup).toLowerCase()] = 1; });
    return {
      value: counted.length,
      secondary: [
        { label: 'Startup AI (unik)', value: Object.keys(startups).length },
        { label: 'Top 5 Global Outreach', value: counted.filter(function (r) { return r.top5 === 'Ya'; }).length },
        { label: 'Startup ditubuhkan', value: counted.filter(function (r) { return r.startup_ditubuhkan === 'Ya'; }).length }
      ],
      breakdown: [
        { title: 'Mengikut fakulti (minimum 5 setiap fakulti)', items: perFacultyItems_(kpi, counted, ctx.faculties) },
        { title: 'Semua pelajar mengikut status (keseluruhan)', items: countBy_(rows, function (r) { return r.status; }) }
      ]
    };
  }
};

function readTargets_() {
  var out = {};
  readTable_(SHEETS.TARGETS, { tahun: 'number', sasaran: 'number', q1: 'number', q2: 'number', q3: 'number', q4: 'number' }).rows.forEach(function (r) {
    if (!r.kpi || r.tahun === '') return;
    out[r.kpi] = out[r.kpi] || {};
    out[r.kpi][r.tahun] = { sasaran: r.sasaran, q: [r.q1, r.q2, r.q3, r.q4], jenis: r.jenis, bajet: r.bajet_rm, catatan: r.catatan };
  });
  return out;
}

function statusFor_(kpi, value, target) {
  if (target === '' || target === undefined || target === null) return 'Tiada sasaran';
  if (kpi.jenis === 'penggunaan') {   // peratus peruntukan digunakan: makin hampir 100% makin cekap; lebih 100% = melebihi peruntukan
    if (value > 100) return 'Melebihi peruntukan';
    return value >= target ? 'Capai sasaran' : 'Di bawah sasaran';
  }
  if (kpi.jenis === 'kemajuan') {
    if (value >= 100) return 'Selesai';
    return value >= target ? 'Capai sasaran' : 'Di bawah sasaran';
  }
  if (value > target) return 'Melebihi sasaran';
  return value === target ? 'Capai sasaran' : 'Di bawah sasaran';
}

function currentQuarter_() {
  return Math.ceil(parseInt(Utilities.formatDate(new Date(), APP.TZ, 'M'), 10) / 3);
}

function buildKpiCard_(kpi, rows, year, targets, ctx) {
  var m = MEASURES[kpi.measure](kpi, rows, year, ctx);
  var t = (targets[kpi.id] || {})[year] || null;
  var target = t && t.sasaran !== '' ? t.sasaran : '';
  var card = {
    id: kpi.id, title: kpi.title, short: kpi.short, group: kpi.group, level: kpi.level, teras: kpi.teras || null, fungsi: kpi.fungsi || null, unit: kpi.unit, jenis: kpi.jenis, format: kpi.valueFormat || '',
    value: m.value, target: target,
    pct: target !== '' && target > 0 ? round1_(m.value / target * 100) : null,
    status: statusFor_(kpi, m.value, target),
    secondary: m.secondary || [], breakdown: m.breakdown || [], warnings: m.warnings || [],
    note: t ? t.catatan : ''
  };
  var nowYear = yearOf_(todayIso_());
  if (t && target !== '' && year === nowYear) {
    var q = currentQuarter_();
    var qt = t.q[q - 1];
    card.quarter = q;
    card.quarterTarget = qt === '' || qt === undefined ? '' : qt;
    card.quarterStatus = card.quarterTarget === '' ? 'Tiada sasaran suku tahun' : statusFor_(kpi, m.value, card.quarterTarget);
  }
  if (kpi.id === 'KAI6') card.secondaryTargets = 'Sasaran sekunder startup AI 2026: Q1 0, Q2 1, Q3 2, Q4 3';
  return card;
}

/**
 * Ukuran Pekerjaan Premium Tier 1: peratus usahawan pelajar yang PURATA pendapatan sebulan (jumlah pendapatan dibahagi
 * bilangan bulan dilaporkan dalam tahun itu) melebihi ambang RM4,000, daripada semua usahawan yang melaporkan pendapatan (CKAI 7).
 * Seorang usahawan dikenal pasti melalui no. KP; jika tiada, no. matrik; jika tiada, nama perniagaan dan fakulti.
 */
function premiumShare_(rows, year) {
  var people = {};
  rows.forEach(function (r) {
    if (yearOf_(r.tempoh) !== year) return;
    var key = String(r.no_kp || '').replace(/^'/, '').trim().toLowerCase() || String(r.no_matrik || '').replace(/^'/, '').trim().toLowerCase() || (String(r.nama_perniagaan || '').trim().toLowerCase() + '|' + String(r.fakulti || ''));
    if (key === '|') return;
    var p = people[key] || (people[key] = { sum: 0, months: {} });
    p.sum += num_(r.pendapatan_rm); p.months[r.tempoh] = 1;
  });
  var total = 0, premium = 0;
  Object.keys(people).forEach(function (k) {
    var n = Object.keys(people[k].months).length;
    if (!n) return;
    total++;
    if (people[k].sum / n > APP.PREMIUM_INCOME_RM) premium++;
  });
  var pct = total ? round1_(premium * 100 / total) : 0;
  return {
    label: 'Pekerjaan Premium Tier 1', premium: premium, total: total, pct: pct,
    thresholdRm: APP.PREMIUM_INCOME_RM, targetPct: APP.PREMIUM_TARGET_PCT, targetYear: APP.PREMIUM_TARGET_YEAR,
    pctOfTarget: Math.round(pct * 100 / APP.PREMIUM_TARGET_PCT)
  };
}

function computeDashboard_(year) {
  var targets = readTargets_();
  var cache = {};
  function tableRows(id) {
    var k = getKpi_(id);
    if (!k.sheet) return [];
    return cache[id] || (cache[id] = readTable_(k.sheet, typesFor_(k)).rows);
  }
  var ctx = { faculties: listFaculties_(), rows: tableRows };
  var cards = KPIS.map(function (kpi) {
    return buildKpiCard_(kpi, tableRows(kpi.id), year, targets, ctx);
  });
  var withTarget = cards.filter(function (c) { return c.target !== ''; }).length;
  var meet = cards.filter(function (c) { return c.status === 'Capai sasaran' || c.status === 'Melebihi sasaran' || c.status === 'Selesai'; }).length;
  return {
    year: year, years: APP.YEARS, levels: LEVELS, teras: TERAS, functions: FUNCTIONS, generatedAt: nowIso_(),
    ds: { label: 'DS 04 · Pekerjaan Premium Tier 1', goal: '40% Pekerjaan Premium Tier 1 (2030)' },
    summary: { total: withTarget, meet: meet },
    premium: premiumShare_(tableRows('CKAI7'), year),
    kpis: cards
  };
}

/** Dashboard awam dengan cache pendek. Tidak memerlukan log masuk. */
function getDashboard_(yearIn) {
  var year = parseInt(yearIn, 10);
  if (APP.YEARS.indexOf(year) < 0) year = Math.min(Math.max(yearOf_(todayIso_()), APP.YEARS[0]), APP.YEARS[APP.YEARS.length - 1]);
  var cache = CacheService.getScriptCache();
  var hit = cache.get('dash:' + year);
  if (hit) return JSON.parse(hit);
  var d = computeDashboard_(year);
  try { cache.put('dash:' + year, JSON.stringify(d), APP.DASH_CACHE_TTL); } catch (e) { /* terlalu besar: abaikan cache */ }
  return d;
}

/** Trend 2026-2030 untuk Infografik (awam, agregat sahaja): nilai setiap KPI, ukuran premium dan bilangan KPI mencapai sasaran bagi setiap tahun. */
function getTrend_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('trend');
  if (hit) return JSON.parse(hit);
  var out = APP.YEARS.map(function (y) {
    var d = getDashboard_(y);
    var vals = {};
    d.kpis.forEach(function (c) { vals[c.id] = { v: c.value, t: c.target, p: c.pct }; });
    return { year: y, premiumPct: d.premium ? d.premium.pct : 0, premiumTotal: d.premium ? d.premium.total : 0, meet: d.summary.meet, total: d.summary.total, kpis: vals };
  });
  try { cache.put('trend', JSON.stringify(out), APP.DASH_CACHE_TTL); } catch (e) { /* abaikan */ }
  return out;
}
// ===== Admin.gs =====
/** Fungsi Admin: pengurusan pengguna (PIC), sasaran dan paparan log audit. */

function listUsers_(token) {
  requireAdmin_(token);
  return readTable_(SHEETS.USERS).rows.map(function (r) {
    return { emel: r.emel, nama: r.nama, peranan: r.peranan, fakulti: r.fakulti, kpi_akses: r.kpi_akses, aktif: r.aktif };
  });
}

function saveUser_(token, input) {
  var admin = requireAdmin_(token);
  if (!input || typeof input !== 'object') throw userError_('Data tidak sah.');
  var email = normEmail_(input.emel);
  if (!isEmail_(email)) throw userError_('Alamat e-mel tidak sah.', { fields: { emel: 'E-mel tidak sah.' } });
  if (!emailDomainAllowed_(email)) throw userError_('Domain e-mel tidak dibenarkan.', { fields: { emel: 'Domain tidak dibenarkan.' } });
  var role = String(input.peranan || '');
  if ([ROLES.ADMIN, ROLES.PIC].indexOf(role) < 0) throw userError_('Peranan tidak sah.', { fields: { peranan: 'Pilih Admin atau PIC.' } });
  var fakulti = String(input.fakulti || '');
  var faculties = listFaculties_().map(function (f) { return f.kod; });
  if (faculties.indexOf(fakulti) < 0) throw userError_('Fakulti tidak sah.', { fields: { fakulti: 'Fakulti tidak sah.' } });
  var facultyKpis = KPIS.filter(function (k) { return k.entry === 'faculty'; }).map(function (k) { return k.id; });
  var akses = String(input.kpi_akses || '').split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(String);
  for (var i = 0; i < akses.length; i++) {
    if (facultyKpis.indexOf(akses[i]) < 0) throw userError_('KPI akses tidak sah: ' + akses[i] + '. PIC hanya boleh diberi ' + facultyKpis.join(', ') + '.', { fields: { kpi_akses: 'KPI tidak sah.' } });
  }
  var aktif = String(input.aktif || 'Ya');
  if (YES_NO.indexOf(aktif) < 0) throw userError_('Status aktif tidak sah.');
  var nama = sanitizeText_(String(input.nama || '').slice(0, 120));

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = readTable_(SHEETS.USERS);
    var existing = null;
    table.rows.forEach(function (r) { if (normEmail_(r.emel) === email) existing = r; });
    if (existing && parseUser_(existing).peranan === ROLES.ADMIN && (role !== ROLES.ADMIN || aktif !== 'Ya')) {
      var otherAdmins = table.rows.map(parseUser_).filter(function (u) { return u.peranan === ROLES.ADMIN && u.aktif && u.emel !== email; });
      if (!otherAdmins.length) throw userError_('Mesti ada sekurang-kurangnya seorang Admin aktif.');
    }
    var obj = { emel: email, nama: nama, peranan: role, fakulti: fakulti, kpi_akses: akses.join(','), aktif: aktif };
    if (!existing) obj.dicipta_pada = nowIso_();
    writeRow_(getSheet_(SHEETS.USERS), existing ? existing._row : null, obj);
    audit_(admin, existing ? 'PENGGUNA_KEMAS_KINI' : 'PENGGUNA_TAMBAH', '', email, role + ' / ' + fakulti + ' / ' + akses.join(',') + ' / aktif=' + aktif);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function deleteUser_(token, emailIn) {
  var admin = requireAdmin_(token);
  var email = normEmail_(emailIn);
  if (email === admin.emel) throw userError_('Anda tidak boleh memadam akaun sendiri.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = readTable_(SHEETS.USERS);
    var existing = null;
    table.rows.forEach(function (r) { if (normEmail_(r.emel) === email) existing = r; });
    if (!existing) throw userError_('Pengguna tidak dijumpai.');
    getSheet_(SHEETS.USERS).deleteRow(existing._row);
    audit_(admin, 'PENGGUNA_PADAM', '', email, '');
    return true;
  } finally {
    lock.releaseLock();
  }
}

function listTargetsAdmin_(token) {
  requireAdmin_(token);
  return readTable_(SHEETS.TARGETS, { tahun: 'number', sasaran: 'number', q1: 'number', q2: 'number', q3: 'number', q4: 'number', bajet_rm: 'number' }).rows
    .map(stripRow_);
}

function saveTarget_(token, input) {
  var admin = requireAdmin_(token);
  var kpi = getKpi_(String(input && input.kpi));
  var year = parseInt(input.tahun, 10);
  if (APP.YEARS.indexOf(year) < 0) throw userError_('Tahun tidak sah.');
  function numOrBlank(v, name) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    if (!isFinite(n) || n < 0) throw userError_('Nilai ' + name + ' tidak sah.');
    return n;
  }
  var sasaran = numOrBlank(input.sasaran, 'sasaran');
  if (sasaran === '') throw userError_('Sasaran tahunan wajib diisi.');
  if ((kpi.jenis === 'kemajuan' || kpi.jenis === 'penggunaan') && sasaran > 100) throw userError_('Sasaran peratus tidak boleh melebihi 100%.');
  var q = [numOrBlank(input.q1, 'Q1'), numOrBlank(input.q2, 'Q2'), numOrBlank(input.q3, 'Q3'), numOrBlank(input.q4, 'Q4')];
  var obj = { kpi: kpi.id, tahun: year, sasaran: sasaran, q1: q[0], q2: q[1], q3: q[2], q4: q[3], jenis: kpi.jenis, bajet_rm: numOrBlank(input.bajet_rm, 'bajet'), catatan: sanitizeText_(String(input.catatan || '').slice(0, 500)) };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = readTable_(SHEETS.TARGETS, { tahun: 'number' });
    var existing = null;
    table.rows.forEach(function (r) { if (r.kpi === kpi.id && r.tahun === year) existing = r; });
    writeRow_(getSheet_(SHEETS.TARGETS), existing ? existing._row : null, obj);
    audit_(admin, 'SASARAN_KEMAS_KINI', kpi.id, String(year), 'sasaran=' + sasaran);
    clearDashCache_();
    return true;
  } finally {
    lock.releaseLock();
  }
}

function listAudit_(token, limit) {
  requireAdmin_(token);
  var rows = readTable_(SHEETS.AUDIT).rows.map(stripRow_);
  rows.reverse();
  return rows.slice(0, Math.min(parseInt(limit, 10) || 200, 500));
}

// ---------------------------------------------------------------------------
// Tab Persediaan (Admin): pautan, ID dan semakan kesihatan sistem
// ---------------------------------------------------------------------------
function safe_(fn, fallback) { try { var v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; } }

function getSetupInfo_(token) {
  requireAdmin_(token);
  var ss = safe_(function () { return getSS_(); }, null);
  var info = {
    appName: APP.NAME, timeZone: APP.TZ,
    owner: safe_(function () { return normEmail_(Session.getEffectiveUser().getEmail()); }, ''),
    scriptId: safe_(function () { return ScriptApp.getScriptId(); }, ''),
    webAppUrl: safe_(function () { return ScriptApp.getService().getUrl(); }, ''),
    sheet: ss ? { id: ss.getId(), url: ss.getUrl(), name: safe_(function () { return ss.getName ? ss.getName() : ''; }, '') } : null,
    folder: null, mailQuota: safe_(function () { return MailApp.getRemainingDailyQuota(); }, null),
    checks: [], counts: {}
  };
  info.isDevUrl = /\/dev$/.test(info.webAppUrl || '');
  var folderId = getProp_('FOLDER_ID');
  if (folderId) {
    var f = safe_(function () { return DriveApp.getFolderById(folderId); }, null);
    info.folder = f ? { id: folderId, url: safe_(function () { return f.getUrl(); }, ''), ok: true } : { id: folderId, url: '', ok: false };
  }

  function check(label, ok, detail) { info.checks.push({ label: label, ok: ok, detail: detail || '' }); }
  check('Google Sheet laporan dijumpai', !!ss, ss ? '' : 'Jalankan setup() daripada editor Apps Script atau tekan "Jalankan persediaan".');
  if (ss) {
    var missingTabs = [], missingCols = [];
    var specs = [[SHEETS.USERS, USER_COLS], [SHEETS.FACULTIES, FACULTY_COLS], [SHEETS.TARGETS, TARGET_COLS], [SHEETS.RISKS, RISK_COLS], [SHEETS.AUDIT, AUDIT_COLS]]
      .concat(KPIS.filter(function (k) { return k.sheet; }).map(function (k) { return [k.sheet, kpiColumns_(k)]; }));
    specs.forEach(function (sp) {
      var sh = ss.getSheetByName(sp[0]);
      if (!sh) { missingTabs.push(sp[0]); return; }
      var lc = sh.getLastColumn();
      var hdr = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
      var miss = sp[1].filter(function (c) { return hdr.indexOf(c) < 0; });
      if (miss.length) missingCols.push(sp[0] + ' (' + miss.join(', ') + ')');
    });
    check('Semua tab wujud (' + specs.length + ' tab)', !missingTabs.length, missingTabs.length ? 'Tab tiada: ' + missingTabs.join(', ') : '');
    check('Semua lajur wajib wujud', !missingCols.length, missingCols.length ? 'Lajur tiada: ' + missingCols.join('; ') : '');
    var users = safe_(function () { return readTable_(SHEETS.USERS).rows.map(parseUser_); }, []);
    var admins = users.filter(function (u) { return u.peranan === ROLES.ADMIN && u.aktif; });
    info.counts = { admin: admins.length, pic: users.filter(function (u) { return u.peranan === ROLES.PIC && u.aktif; }).length, fakulti: safe_(function () { return listFaculties_().length; }, 0),
      sasaran: safe_(function () { return readTable_(SHEETS.TARGETS).rows.length; }, 0) };
    check('Sekurang-kurangnya seorang Admin aktif', admins.length > 0, admins.length + ' Admin aktif');
    check('Senarai fakulti ada isi', info.counts.fakulti > 0, info.counts.fakulti + ' fakulti dalam tab Fakulti');
    check('Baris sasaran wujud', info.counts.sasaran > 0, info.counts.sasaran + ' baris dalam tab Sasaran');
  }
  check('Kunci OTP (salt) wujud', !!getProp_('OTP_SALT'), '');
  check('Folder lampiran Drive', folderId ? !!(info.folder && info.folder.ok) : null, folderId ? (info.folder && info.folder.ok ? '' : 'Folder tidak dapat dicapai. Ia akan dicipta semula pada muat naik seterusnya.') : 'Belum dicipta (dicipta secara automatik semasa muat naik PDF pertama).');
  check('Pautan web app dikesan', !!info.webAppUrl, info.webAppUrl ? '' : 'Belum deploy sebagai Web app. Gunakan Deploy > New deployment > Web app.');
  if (info.webAppUrl) check('Pautan web app ialah pautan /exec (bukan /dev)', !info.isDevUrl, info.isDevUrl ? 'Anda berada dalam mod ujian (/dev). Kongsi pautan /exec daripada Deploy > Manage deployments.' : '');
  check('Kuota e-mel harian mencukupi', info.mailQuota === null ? null : info.mailQuota >= 20, info.mailQuota === null ? '' : info.mailQuota + ' e-mel berbaki hari ini');
  return info;
}

function runSetupFromApp_(token) {
  var admin = requireAdmin_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var r = setup();
    audit_(admin, 'SETUP', '', '', 'Persediaan dijalankan semula daripada tab Persediaan');
    clearDashCache_();
    return { ok: true, url: r && r.url };
  } finally {
    lock.releaseLock();
  }
}

function sendTestMail_(token) {
  var admin = requireAdmin_(token);
  var cache = CacheService.getScriptCache();
  var key = 'testmail:' + sha256Hex_(admin.emel);
  var n = parseInt(cache.get(key) || '0', 10);
  if (n >= 3) throw userError_('Had 3 e-mel ujian sejam dicapai. Cuba lagi kemudian.');
  cache.put(key, String(n + 1), 3600);
  MailApp.sendEmail({ to: admin.emel, name: APP.NAME, subject: '[' + APP.NAME + '] Ujian e-mel', body: 'Ini e-mel ujian daripada tab Persediaan. Jika anda menerimanya, penghantaran OTP berfungsi.\n\n' + APP.NAME });
  audit_(admin, 'UJIAN_EMEL', '', '', '');
  return { to: admin.emel, remaining: safe_(function () { return MailApp.getRemainingDailyQuota(); }, null) };
}
// ===== Code.gs =====
/** Titik masuk web app dan fungsi API yang dipanggil klien (google.script.run). */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.NAME;
  return t.evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Bungkus panggilan: tangkap ralat, pulangkan mesej mesra pengguna, jangan dedahkan butiran dalaman. */
function wrap_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e && e.user) return { ok: false, error: e.message, fields: e.fields || null, auth: !!e.auth };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: 'Ralat dalaman. Sila cuba lagi atau hubungi pentadbir.' };
  }
}

function str_(v, max) { return String(v === null || v === undefined ? '' : v).slice(0, max || 300); }

// --- Awam ---------------------------------------------------------------
function api_trend() { return wrap_(function () { return getTrend_(); }); }
function api_dashboard(year) { return wrap_(function () { return getDashboard_(year); }); }
function api_requestOtp(email) { return wrap_(function () { return requestOtp_(str_(email, 254)); }); }
function api_verifyOtp(email, code) { return wrap_(function () { return verifyOtp_(str_(email, 254), str_(code, 20)); }); }

// --- Perlu log masuk ----------------------------------------------------
function api_logout(token) { return wrap_(function () { return logout_(str_(token, 200)); }); }
function api_session(token) { return wrap_(function () { return sessionInfo_(str_(token, 200)); }); }
function api_list(token, kpiId, filters) { return wrap_(function () { return listRecords_(str_(token, 200), str_(kpiId, 20), filters); }); }
function api_save(token, kpiId, rec) { return wrap_(function () { return saveRecord_(str_(token, 200), str_(kpiId, 20), rec); }); }
function api_bulkSave(token, kpiId, rows) { return wrap_(function () { return bulkSave_(str_(token, 200), str_(kpiId, 20), rows); }); }
function api_uploadFile(token, kpiId, fieldKey, payload) { return wrap_(function () { return uploadFile_(str_(token, 200), str_(kpiId, 20), str_(fieldKey, 60), payload); }); }
function api_downloadFile(token, kpiId, recordId, fieldKey) { return wrap_(function () { return downloadFile_(str_(token, 200), str_(kpiId, 20), str_(recordId, 40), str_(fieldKey, 60)); }); }
function api_delete(token, kpiId, id) { return wrap_(function () { return deleteRecord_(str_(token, 200), str_(kpiId, 20), str_(id, 40)); }); }

// --- Admin --------------------------------------------------------------
function api_listUsers(token) { return wrap_(function () { return listUsers_(str_(token, 200)); }); }
function api_saveUser(token, input) { return wrap_(function () { return saveUser_(str_(token, 200), input); }); }
function api_deleteUser(token, email) { return wrap_(function () { return deleteUser_(str_(token, 200), str_(email, 254)); }); }
function api_listTargets(token) { return wrap_(function () { return listTargetsAdmin_(str_(token, 200)); }); }
function api_saveTarget(token, input) { return wrap_(function () { return saveTarget_(str_(token, 200), input); }); }
function api_setupInfo(token) { return wrap_(function () { return getSetupInfo_(str_(token, 200)); }); }
function api_runSetup(token) { return wrap_(function () { return runSetupFromApp_(str_(token, 200)); }); }
function api_testMail(token) { return wrap_(function () { return sendTestMail_(str_(token, 200)); }); }
function api_listAudit(token, limit) { return wrap_(function () { return listAudit_(str_(token, 200), limit); }); }
