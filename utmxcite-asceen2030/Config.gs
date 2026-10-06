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

/**
 * Enam fungsi UTMXCITE (mandat peringkat Universiti) = aliran proses kerja. Setiap indikator (KAI, DKAI, CKAI)
 * ditanda dengan satu `fungsi`. DKAI 1 ialah pelan merentas semua fungsi.
 */
var FUNCTIONS = [
  { id: 'minat', no: 1, short: 'Identify Interest', label: 'Identify Student Entrepreneurship Interest', ms: 'Kenal pasti minat keusahawanan pelajar' },
  { id: 'latihan', no: 2, short: 'Entrepreneurship Training', label: 'Conduct Entrepreneurship Training', ms: 'Jalankan latihan keusahawanan' },
  { id: 'ideasi', no: 3, short: 'Business Ideation', label: 'Support Student Business Ideation', ms: 'Sokong pengideaan perniagaan pelajar' },
  { id: 'startup', no: 4, short: 'Startup Development', label: 'Facilitate Student Startup Development', ms: 'Fasilitasi pembangunan startup pelajar' },
  { id: 'prestasi', no: 5, short: 'Enterprise Performance', label: 'Monitor Student Enterprise Performance', ms: 'Pantau prestasi perusahaan pelajar' },
  { id: 'pameran', no: 6, short: 'Showcase Innovation', label: 'Showcase Student Innovation Venture', ms: 'Pamerkan inovasi dan venture pelajar' },
  { id: 'rentas', no: null, label: 'Cross-cutting', ms: 'Pelan dan tadbir urus merentas fungsi' }
];

/** Tiga peringkat penunjuk. Setiap KPI tergolong dalam satu peringkat mengikut awalan ID (KAI / DKAI / CKAI). */
var LEVELS = [
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

function makerspaceValidate_(c, errors) {
  var kp = String(c.no_kp || '').replace(/\s+/g, '').toUpperCase();
  if (kp && !errors.no_kp) {
    if (/^\d{6}-?\d{2}-?\d{4}$/.test(kp)) kp = kp.replace(/-/g, '');
    if (!/^[A-Z0-9-]{6,20}$/.test(kp)) errors.no_kp = 'No. KP / pasport tidak sah.'; else c.no_kp = kp;
  }
  if (c.telefon && !errors.telefon && !/^[0-9+\-\s()]{7,20}$/.test(String(c.telefon))) errors.telefon = 'Nombor telefon tidak sah.';
  if (c.tarikh_mula && c.tarikh_tamat && !errors.tarikh_tamat && c.tarikh_tamat < c.tarikh_mula) errors.tarikh_tamat = 'Tarikh tamat mesti pada atau selepas tarikh mula.';
  if (c.tarikh_mula && c.tarikh_mula === c.tarikh_tamat && c.masa_mula && c.masa_tamat && !errors.masa_tamat && c.masa_tamat <= c.masa_mula) errors.masa_tamat = 'Masa tamat mesti selepas masa mula.';
}

var PROGRAM_DONE_REQUIRE = ['tarikh_mula', 'tarikh_tamat', 'lokasi', 'bil_peserta', 'bajet_rm', 'pendapatan_rm'];

// ---------------------------------------------------------------------------
// Definisi KPI. entry: 'faculty' = PIC fakulti + Admin; 'admin' = Admin sahaja.
// ---------------------------------------------------------------------------
var KPIS = [
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
    listColumns: ['id', 'kod_lot', 'jenis_ruang', 'kolej_fakulti', 'status', 'diwartakan'],
    statusField: 'status',
    rules: [
      { when: { field: 'status', in: ['Ditawarkan', 'Disewa'] }, require: ['tarikh_ditawarkan'] },
      { when: { field: 'status', in: ['Disewa'] }, require: ['penyewa_nama', 'tarikh_mula_sewa'] },
      { when: { field: 'diwartakan', in: ['Ya'] }, require: ['tarikh_diwartakan'] }
    ],
    fields: [
      F_('kod_lot', 'Nama / kod lot', 'text', { required: true, sec: 'Identiti' }),
      F_('jenis_ruang', 'Jenis ruang', 'select', { required: true, options: ['Student Mall', 'Student Union Building (SUB)', 'Kiosk / Lot Mudah Alih', 'Bilik / Ruang Perniagaan', 'Lain-lain'] }),
      F_('kolej_fakulti', 'Kolej / Fakulti', 'text', { required: true }),
      F_('bangunan', 'Bangunan / zon', 'text'),
      F_('keluasan', 'Keluasan (m²)', 'number', { min: 0 }),
      F_('status', 'Status ruang', 'select', { required: true, sec: 'Kemajuan', options: ['Dikenal pasti', 'Spesifikasi disediakan', 'Dalam perolehan', 'Siap', 'Ditawarkan', 'Disewa', 'Tidak aktif'] }),
      F_('tarikh_dikenalpasti', 'Tarikh dikenal pasti', 'date'),
      F_('tarikh_sasaran_siap', 'Tarikh sasaran siap', 'date'),
      F_('tarikh_ditawarkan', 'Tarikh ditawarkan kepada pelajar', 'date'),
      F_('diwartakan', 'Diwartakan?', 'yesno'),
      F_('tarikh_diwartakan', 'Tarikh diwartakan', 'date'),
      F_('kaedah_perolehan', 'Kaedah perolehan', 'text', { sec: 'Perolehan' }),
      F_('no_rujukan', 'No. rujukan', 'text'),
      F_('anggaran_kos', 'Anggaran kos (RM)', 'number', { min: 0 }),
      F_('ptj', 'PTJ bertanggungjawab', 'select', { options: ['BPA', 'JTNCP', 'Kolej', 'Fakulti', 'UTMXCITE'] }),
      F_('pegawai', 'Pegawai bertanggungjawab', 'text'),
      F_('penyewa_nama', 'Nama pelajar / pasukan penyewa', 'text', { sec: 'Sewaan' }),
      F_('penyewa_matrik', 'No. matrik penyewa', 'text'),
      F_('penyewa_fakulti', 'Fakulti penyewa', 'faculty'),
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
    title: 'KAI 4 · Premium Gig Academy (GiGAUTM Ascend)', short: 'GiGAUTM Ascend',
    unit: 'pelajar mendaftar', measure: 'kai4', jenis: 'minimum', perFacultyTarget: 2,
    listColumns: ['id', 'nama_pelajar', 'no_matrik', 'fakulti', 'status', 'bootcamp_status'],
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
    rules: [],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pelajar' }),
      F_('nama_pelajar', 'Nama pelajar', 'text', { required: true }),
      F_('no_matrik', 'No. matrik', 'text', { required: true }),
      F_('emel', 'E-mel', 'email'),
      F_('telefon', 'No. telefon', 'text'),
      F_('nama_syarikat', 'Nama syarikat / perniagaan', 'text', { required: true, sec: 'Pendaftaran SSU' }),
      F_('jenis_perniagaan', 'Jenis perniagaan', 'text'),
      F_('no_ssu', 'No. pendaftaran SSU', 'text', { required: true }),
      F_('tarikh_daftar', 'Tarikh pendaftaran', 'date', { required: true }),
      F_('status', 'Status', 'select', { required: true, options: ['Berdaftar', 'Tidak aktif'] }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
      F_('catatan', 'Catatan', 'textarea', { full: true })
    ]
  },
  {
    id: 'CKAI5', prefix: 'MS', sheet: 'CKAI5_Makerspace', fungsi: 'startup', group: 'Center', entry: 'admin',
    title: 'CKAI 5 · Bilangan penggunaan Makerspace (pembangunan prototaip)', short: 'Penggunaan Makerspace',
    unit: 'permohonan penggunaan', measure: 'makerspace', jenis: 'minimum',
    listColumns: ['id', 'nama', 'no_matrik', 'peralatan', 'tarikh_mula', 'bil_peserta', 'borang'],
    statusField: null,
    rules: [{ when: { field: 'peralatan', in: ['Lain-lain (Other)'] }, require: ['peralatan_lain'] }],
    validate: makerspaceValidate_,
    fields: [
      F_('emel', 'E-mel (Email Address)', 'email', { required: true, sec: 'Pemohon' }),
      F_('nama', 'Nama penuh (Full Name)', 'text', { required: true }),
      F_('no_kp', 'No. kad pengenalan / no. pasport (Identity Card / Passport No.)', 'text', { required: true }),
      F_('no_matrik', 'No. matrik staf / pelajar (Staff / Student Matric No.)', 'text', { required: true }),
      F_('fakulti', 'Fakulti / jabatan / unit (Faculty / Department / Unit)', 'faculty', { required: true }),
      F_('kelas', 'Jabatan / unit / kelas (jika berkaitan)', 'text'),
      F_('telefon', 'Nombor telefon (Phone Number)', 'text', { required: true }),
      F_('peralatan', 'Jenis / peralatan yang dipohon (Type / Equipment Applied)', 'select', { required: true, sec: 'Permohonan', options: ['3D Printer', 'Laser Cutter Machine', 'Peralatan Tangan (Tools)', 'Sewaan Ruang (Space Rental)', 'Lain-lain (Other)'] }),
      F_('peralatan_lain', 'Nyatakan nama peralatan / jenis lain (Other, please specify)', 'text', { hint: 'Wajib jika memilih Lain-lain (Other).' }),
      F_('tujuan', 'Tujuan permohonan (Purpose of Application)', 'textarea', { required: true, full: true }),
      F_('bil_peserta', 'Bilangan peserta (Number of Participants)', 'number', { required: true, min: 1 }),
      F_('tarikh_mula', 'Tarikh mula (Start Date)', 'date', { required: true, sec: 'Tarikh dan masa' }),
      F_('tarikh_tamat', 'Tarikh tamat (End Date)', 'date', { required: true }),
      F_('masa_mula', 'Masa mula (Start Time)', 'time', { required: true }),
      F_('masa_tamat', 'Masa tamat (End Time)', 'time', { required: true }),
      F_('borang', 'Muat naik borang permohonan (PDF, maksimum 5 MB)', 'file', { full: true, sec: 'Dokumen' })
    ]
  },
  {
    id: 'CKAI6', prefix: 'SI', sheet: 'CKAI6_Sewaan_Inkubator', fungsi: 'startup', group: 'Center', entry: 'admin',
    title: 'CKAI 6 · Pendapatan sewaan inkubator', short: 'Sewaan Inkubator',
    unit: 'RM sewaan diterima', measure: 'rent', jenis: 'minimum', valueFormat: 'rm',
    listColumns: ['id', 'tempoh', 'inkubator', 'penyewa', 'jumlah_rm', 'status_bayaran'],
    statusField: 'status_bayaran',
    rules: [{ when: { field: 'status_bayaran', in: ['Dibayar'] }, require: ['tarikh_bayar'] }],
    fields: [
      F_('tempoh', 'Bulan', 'month', { required: true, sec: 'Sewaan bulanan' }),
      F_('inkubator', 'Inkubator / ruang', 'text', { required: true }),
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
    rules: [],
    fields: [
      F_('fakulti', 'Fakulti', 'faculty', { required: true, sec: 'Pendapatan bulanan' }),
      F_('tempoh', 'Bulan', 'month', { required: true }),
      F_('nama_perniagaan', 'Nama perniagaan / syarikat', 'text', { required: true }),
      F_('nama_pelajar', 'Nama pelajar', 'text'),
      F_('no_matrik', 'No. matrik', 'text'),
      F_('no_ssu', 'No. pendaftaran SSU (jika ada)', 'text'),
      F_('jenis_pendapatan', 'Jenis pendapatan', 'select', { required: true, options: ['Jualan produk', 'Perkhidmatan / Gig', 'Geran / Pembiayaan', 'Lain-lain'] }),
      F_('pendapatan_rm', 'Pendapatan (RM)', 'number', { required: true, min: 0 }),
      F_('lampiran', 'Pautan lampiran bukti', 'url', { sec: 'Pengurusan' }),
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
  // CKAI: sasaran belum ditetapkan. Isi melalui menu Admin > Sasaran.
  ['CKAI1', 'CKAI2', 'CKAI3', 'CKAI4', 'CKAI5', 'CKAI6', 'CKAI7', 'CKAI8', 'CKAI9'].forEach(function (k) {
    [2026, 2027, 2028, 2029, 2030].forEach(function (y) { add(k, y, '', [], 'minimum', '', ''); });
  });
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
