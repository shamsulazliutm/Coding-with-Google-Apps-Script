/**
 * UTMXCITE 4 ASCEEN 2030 Report
 * Konfigurasi: pemalar aplikasi, definisi 7 KPI (medan borang), sasaran awal dan data awal.
 * Sumber rujukan: Dokumen Pelan Tindakan UTMXCITE (DS 04 - Premium Employment).
 */
var APP = {
  NAME: 'UTMXCITE 4 ASCEEN 2030 Report',
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
  AUDIT: 'Log_Audit'
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
  ['FAI', 'Fakulti Kecerdasan Buatan'],
  ['FC', 'Fakulti Komputeran'],
  ['FKE', 'Fakulti Kejuruteraan Elektrik'],
  ['MJIIT', 'Malaysia-Japan International Institute of Technology'],
  ['FKA', 'Fakulti Kejuruteraan Awam'],
  ['FKM', 'Fakulti Kejuruteraan Mekanikal'],
  ['FKT', 'Fakulti Kejuruteraan Kimia dan Tenaga'],
  ['FS', 'Fakulti Sains'],
  ['FAB', 'Fakulti Alam Bina dan Ukur'],
  ['FM', 'Fakulti Pengurusan'],
  ['FSSH', 'Fakulti Sains Sosial dan Kemanusiaan'],
  ['FP', 'Fakulti Pendidikan'],
  ['FBME', 'Fakulti Kejuruteraan Biosains dan Perubatan'],
  ['UTMXCITE', 'UTMXCITE (Pusat)']
];

var YES_NO = ['Ya', 'Tidak'];

function F_(key, label, type, o) {
  var f = { key: key, label: label, type: type || 'text' };
  o = o || {};
  for (var k in o) { if (o.hasOwnProperty(k)) f[k] = o[k]; }
  return f;
}

// ---------------------------------------------------------------------------
// Definisi KPI. entry: 'faculty' = PIC fakulti + Admin; 'admin' = Admin sahaja.
// ---------------------------------------------------------------------------
var KPIS = [
  {
    id: 'KAI1', prefix: 'L1', sheet: 'KAI1_Launchpad', group: 'Growth', entry: 'faculty',
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
    id: 'KAI2', prefix: 'M2', sheet: 'KAI2_Makerspace', group: 'Growth', entry: 'admin',
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
    id: 'KAI3', prefix: 'R3', sheet: 'KAI3_Ruang_Perniagaan', group: 'Growth', entry: 'admin',
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
      F_('jenis_ruang', 'Jenis ruang', 'select', { required: true, options: ['Student Mall', 'Kiosk / Lot Mudah Alih', 'Bilik / Ruang Perniagaan', 'Lain-lain'] }),
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
    id: 'KAI4', prefix: 'G4', sheet: 'KAI4_GiGA', group: 'Transform', entry: 'faculty',
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
    id: 'KAI5', prefix: 'F5', sheet: 'KAI5_FSIP', group: 'Transform', entry: 'admin',
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
    id: 'KAI6', prefix: 'A6', sheet: 'KAI6_AI_Startup', group: 'Transform', entry: 'faculty',
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
    id: 'DKAI1', prefix: 'D1', sheet: 'DKAI1_Pelan', group: 'Internal', entry: 'admin',
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
  }
];

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
