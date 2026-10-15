// ============================================================
// Config
// ============================================================
/**
 * Student Mall & SUB Financial Monthly Report
 * Konfigurasi umum, nama sheet dan susunan lajur.
 *
 * PENTING: kod memadankan lajur mengikut TAJUK lajur (baris 1). Lajur boleh disisip atau disusun semula, tetapi jangan ubah ejaan tajuk lajur sistem.
 */

var APP = {
  NAME: 'Laporan Pendapatan dan Perbelanjaan Usahawan Pelajar',
  SENDER: 'UTMXCITE',
  CONTACT_EMAIL: 'utmxcite@utm.my',
  CONTACT_PHONE: '013-7630079',
  ADMIN_EDIT_BUSINESS: true,         // true: admin juga boleh mengemas kini maklumat peniaga (sheet Peniaga). false: penyewa sahaja.
  DEFAULT_ADMIN: 'utmxcite@utm.my',   // admin lalai yang didaftarkan oleh setupSystem()
  TZ: 'Asia/Kuala_Lumpur',
  DUE_DAY: 7,              // tarikh akhir hantar: hari ke-7 bulan berikutnya
  REMINDER_DAY: 5,         // peringatan automatik pada 5hb setiap bulan
  REMINDER_DEADLINE_DAYS: 7, // tarikh akhir dalam e-mel peringatan = tarikh e-mel dihantar + 7 hari
  REMINDER_HOUR: 9,        // trigger harian dijalankan sekitar jam 9 pagi
  OTP_TTL: 300,            // OTP sah 5 minit
  OTP_MAX_TRIES: 5,
  OTP_RESEND_WAIT: 60,     // minta OTP baharu paling cepat 1 minit
  SESSION_TTL: 7200,       // sesi 2 jam (dilanjutkan setiap tindakan)
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  // Folder Drive untuk menyimpan semua PDF. Kosongkan ('') untuk mencipta folder baharu secara automatik.
  // Pemilik skrip mesti mempunyai akses Editor pada folder ini. Disyorkan kongsi "Restricted" (bukan sesiapa dengan pautan).
  ROOT_FOLDER_ID: '1n7GPr2AIOQ4qBWJCZxWBID4RvbfKHONE',
  ROOT_FOLDER_NAME: 'Laporan Kewangan Penyewa',
  // Pautan Google Sheet (pangkalan data). Tab "Pangkalan Data" dalam sistem admin membuka pautan ini terus dalam tab baharu.
  DATABASE_URL: 'https://docs.google.com/spreadsheets/d/1X8LexdkStIb4-93sZz4ZmAD5ZbzD1BS3RWz4JZBgJ50/edit'
};

var SHEETS = {
  USERS: 'Pengguna',
  LOTS: 'Lot',
  TENANCIES: 'Penyewaan',
  BIZ: 'Peniaga',
  REPORTS: 'Laporan',
  LOG: 'Log',
  REMINDERS: 'Peringatan'
};

var ROLE = { ADMIN: 'Admin', TENANT: 'Penyewa' };
var STATUS = { DRAFT: 'Draf', SENT: 'Dihantar', FIX: 'Perlu dibetulkan', OK: 'Disahkan' };

var MONTHS_MS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** [kunci, tajuk lajur, jenis]  jenis: t = teks, n = nombor, d = tarikh, dt = tarikh dan masa */
var COLS = {};
COLS[SHEETS.USERS] = [
  ['email', 'E-mel', 't'], ['nama', 'Nama', 't'], ['peranan', 'Peranan', 't'], ['idSewa', 'ID penyewaan', 't'], ['status', 'Status', 't']
];
COLS[SHEETS.LOTS] = [
  ['kodLot', 'Kod lot', 't'], ['lokasi', 'Lokasi', 't'], ['noLot', 'No lot', 'n'], ['status', 'Status', 't']
];
/** Satu baris bagi setiap tempoh sewa. Penukaran penyewa dibuat pada awal bulan: mula = hari pertama, akhir = hari terakhir bulan. */
COLS[SHEETS.TENANCIES] = [
  ['id', 'ID penyewaan', 't'], ['kodLot', 'Kod lot', 't'], ['mula', 'Tarikh mula sewa', 'd'], ['akhir', 'Tarikh akhir sewa', 'd'], ['sewa', 'Sewa bulanan (RM)', 'n']
];
COLS[SHEETS.BIZ] = [
  ['idSewa', 'ID penyewaan', 't'], ['nama', 'Nama perniagaan', 't'], ['jenis', 'Jenis perniagaan', 't'], ['ssm', 'No SSM', 't'],
  ['pelajar', 'Nama pelajar', 't'], ['kp', 'No KP', 't'], ['matrik', 'No matrik', 't'], ['fakulti', 'Fakulti', 't'],
  ['telefon', 'No telefon', 't'], ['deposit', 'Deposit', 'n'], ['dikemaskini', 'Dikemas kini', 'dt'], ['dikemaskiniOleh', 'Dikemas kini oleh', 't']
];
COLS[SHEETS.REPORTS] = [
  ['id', 'ID', 't'], ['kodLot', 'Kod lot', 't'], ['tahun', 'Tahun', 'n'], ['bulan', 'Bulan', 'n'],
  ['pendapatan', 'Pendapatan (RM)', 'n'], ['perbelanjaan', 'Perbelanjaan (RM)', 'n'], ['sewa', 'Bayaran sewa (RM)', 'n'],
  ['sewaPeralatan', 'Sewa peralatan', 't'], ['fLaporan', 'Fail laporan', 't'], ['fSewa', 'Fail resit sewa', 't'],
  ['fIncubator', 'Fail resit incubator', 't'], ['status', 'Status', 't'], ['lewat', 'Lewat', 't'], ['catatan', 'Catatan', 't'], ['komen', 'Komen admin', 't'],
  ['disemakOleh', 'Disemak oleh', 't'], ['tarikhSemak', 'Tarikh disemak', 'dt'], ['tarikhHantar', 'Tarikh hantar', 'dt'],
  ['akuan', 'Akuan', 't'], ['dikemaskini', 'Dikemas kini', 'dt'], ['idSewa', 'ID penyewaan', 't']
];
COLS[SHEETS.LOG] = [
  ['masa', 'Masa', 'dt'], ['email', 'E-mel', 't'], ['tindakan', 'Tindakan', 't'], ['butiran', 'Butiran', 't']
];
COLS[SHEETS.REMINDERS] = [
  ['kunci', 'Kunci', 't'], ['masa', 'Masa', 'dt'], ['akhir', 'Tarikh akhir', 'd']
];

/** Tajuk lajur yang dinamakan semula (label baharu -> label lama), supaya data lama dikenali. */
var ALIASES = {};
ALIASES[SHEETS.USERS] = { 'ID penyewaan': 'Kod lot' };
ALIASES[SHEETS.BIZ] = { 'ID penyewaan': 'Kod lot' };

/** Lajur baharu disisip selepas lajur ini (selain itu ditambah di hujung sheet). */
var INSERT_AFTER = {};
INSERT_AFTER[SHEETS.REPORTS] = { catatan: 'lewat' };
INSERT_AFTER[SHEETS.BIZ] = { deposit: 'telefon' };

/** Jenis fail lampiran: kunci -> sambungan nama fail dan lajur dalam sheet Laporan */
var FILE_KINDS = {
  laporan:   { col: 'fLaporan',   suffix: 'FinancialReport', label: 'Laporan kewangan' },
  sewa:      { col: 'fSewa',      suffix: 'RentReceipt',     label: 'Resit bayaran sewa' },
  incubator: { col: 'fIncubator', suffix: 'IncubatorReceipt', label: 'Resit incubator' }
};

// ============================================================
// Util
// ============================================================
/** Fungsi bantuan umum. Nama berakhir dengan _ ialah peribadi (tidak boleh dipanggil dari pelayar). */

function fail_(msg, code) {
  var e = new Error(msg);
  e.user = true;
  e.code = code || 'ERR';
  throw e;
}

function nowStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function normEmail_(s) { return String(s || '').trim().toLowerCase(); }
function isEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

/** Tukar input ke nombor. Kosong -> null. Tidak sah -> NaN. */
function toNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : NaN;
}

function round2_(n) { return Math.round(n * 100) / 100; }

function toHex_(bytes) {
  return bytes.map(function (b) { var v = b < 0 ? b + 256 : b; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}

function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sel tarikh daripada sheet (Date) -> 'yyyy-MM-dd' (jenis d) atau 'yyyy-MM-dd HH:mm:ss' (jenis dt). Nilai lain dikembalikan sebagai ada. */
function cell_(v, type) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, APP.TZ, type === 'dt' ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  return v;
}

/** Teks 'yyyy-MM-dd' atau 'yyyy-MM-dd HH:mm:ss' -> objek Date (zon masa APP.TZ). Selain itu dikembalikan sebagaimana ada. */
function toDate_(v) {
  if (typeof v !== 'string') return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Utilities.parseDate(v, APP.TZ, 'yyyy-MM-dd');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return Utilities.parseDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss');
  return v;
}

function isDateStr_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function monthIndex_(y, m) { return y * 12 + (m - 1); }
function ymFromStr_(s) { return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) }; }

/** Tarikh akhir hantar bagi laporan bulan y/m: hari ke-DUE_DAY bulan berikutnya. */
function dueDate_(y, m) {
  var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return ny + '-' + pad2_(nm) + '-' + pad2_(APP.DUE_DAY);
}

function dueLabel_(y, m) {
  var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return APP.DUE_DAY + ' ' + MONTHS_MS[nm - 1] + ' ' + ny;
}

/** 'yyyy-MM-dd' + n hari -> 'yyyy-MM-dd'. */
function addDays_(dateStr, n) {
  var p = dateStr.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** 'yyyy-MM-dd' -> '21 Oktober 2026'. */
function dateLabelMs_(s) {
  var p = s.split('-');
  return Number(p[2]) + ' ' + MONTHS_MS[Number(p[1]) - 1] + ' ' + p[0];
}

/**
 * Tarikh akhir sebenar bagi laporan satu lot untuk satu bulan: hari ke-7 bulan berikutnya,
 * atau tarikh akhir dalam e-mel peringatan terkini (tarikh e-mel + 7 hari) jika lebih lewat.
 * Data peringatan dibaca sekali bagi setiap permintaan.
 */
var REMINDER_DEADLINES_ = null;
function reminderDeadlines_() {
  if (REMINDER_DEADLINES_) return REMINDER_DEADLINES_;
  var map = {};
  readTable_(SHEETS.REMINDERS).forEach(function (r) {
    if (!isDateStr_(r.akhir)) return;
    var k = String(r.kunci).split('|').slice(0, 2).join('|');   // kodLot|yyyy-MM
    if (!map[k] || r.akhir > map[k]) map[k] = r.akhir;
  });
  REMINDER_DEADLINES_ = map;
  return map;
}
function effectiveDue_(kodLot, y, m) {
  var base = dueDate_(y, m), ext = reminderDeadlines_()[kodLot + '|' + y + '-' + pad2_(m)];
  return ext && ext > base ? ext : base;
}

function lotCode_(lokasi, noLot) {
  return String(lokasi).replace(/[^A-Za-z0-9]/g, '') + '-Lot' + noLot;
}

function reportId_(kodLot, y, m) { return kodLot + '_' + y + '-' + pad2_(m); }

function maskKp_(kp) {
  var s = String(kp || '');
  return s.length >= 4 ? s.slice(0, -4) + '****' : s;
}

/** 12 digit, dengan atau tanpa sengkang -> 010203-01-1234. Tidak sah -> null. */
function normKp_(s) {
  var d = String(s || '').replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(d)) return null;
  return d.slice(0, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8);
}

function safeName_(s) { return String(s || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim(); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function appUrl_() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

// ============================================================
// Db
// ============================================================
/** Akses sheet: setiap jadual dibaca sebagai senarai objek mengikut COLS. */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) fail_('Sheet "' + name + '" tidak dijumpai. Jalankan setupSystem() dahulu.');
  return sh;
}

/** Baca semua baris. Setiap objek ada _row (nombor baris dalam sheet). */
/**
 * Lajur dipadankan mengikut TAJUK lajur (baris 1), bukan kedudukan. Anda boleh menyisip lajur sendiri atau menyusun semula
 * lajur tanpa merosakkan data. Jangan ubah ejaan tajuk lajur sistem. Lajur sendiri tidak diubah oleh sistem.
 */
var LAYOUT_ = {};   // dikosongkan pada setiap permintaan (lihat rpc) dan selepas setup

function findCol_(head, label) {
  var j = head.indexOf(label);
  if (j >= 0) return j;
  var want = String(label).toLowerCase();
  for (var i = 0; i < head.length; i++) if (String(head[i]).toLowerCase() === want) return i;
  return -1;
}

function headerOf_(sh) {
  var width = sh.getLastColumn();
  if (!width) return [];
  return sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
}

function layout_(name) {
  if (LAYOUT_[name]) return LAYOUT_[name];
  var sh = sheet_(name);
  var head = headerOf_(sh);
  var idx = {};
  COLS[name].forEach(function (c) {
    var j = findCol_(head, c[1]);
    if (j < 0) fail_('Lajur "' + c[1] + '" tidak dijumpai dalam sheet "' + name + '". Jalankan setupSystem() untuk menambahnya semula.', 'SCHEMA');
    idx[c[0]] = j;
  });
  LAYOUT_[name] = { sh: sh, width: Math.max(head.length, 1), idx: idx };
  return LAYOUT_[name];
}

function readTable_(name) {
  var cols = COLS[name], L = layout_(name);
  var last = L.sh.getLastRow();
  if (last < 2) return [];
  var vals = L.sh.getRange(2, 1, last - 1, L.width).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var empty = true;
    var o = { _row: i + 2, _raw: vals[i] };
    for (var j = 0; j < cols.length; j++) {
      var v = cell_(vals[i][L.idx[cols[j][0]]], cols[j][2]);
      if (v !== '' && v !== null && v !== undefined) empty = false;
      o[cols[j][0]] = v === undefined ? '' : v;
    }
    if (!empty) out.push(o);
  }
  return out;
}

/** Baris sheet daripada objek. `base` ialah baris asal supaya lajur sendiri pengguna dikekalkan. */
function rowFrom_(name, obj, base) {
  var L = layout_(name);
  var row = base ? base.slice() : [];
  while (row.length < L.width) row.push('');
  COLS[name].forEach(function (c) {
    var v = obj[c[0]];
    row[L.idx[c[0]]] = v === undefined || v === null ? '' : (c[2] === 'd' || c[2] === 'dt' ? toDate_(v) : v);   // tarikh disimpan sebagai tarikh sebenar
  });
  return row;
}

function appendObj_(name, obj) {
  layout_(name).sh.appendRow(rowFrom_(name, obj, null));
}

function updateObj_(name, obj) {
  if (!obj._row) throw new Error('updateObj_ memerlukan _row');
  var L = layout_(name);
  L.sh.getRange(obj._row, 1, 1, L.width).setValues([rowFrom_(name, obj, obj._raw)]);
}

function deleteObj_(name, obj) {
  sheet_(name).deleteRow(obj._row);
}

function logAction_(email, action, detail) {
  try { appendObj_(SHEETS.LOG, { masa: nowStr_(), email: email || '', tindakan: action, butiran: detail || '' }); } catch (e) { /* log tidak boleh gagalkan tindakan */ }
}

function findBy_(rows, key, value) {
  for (var i = 0; i < rows.length; i++) if (String(rows[i][key]) === String(value)) return rows[i];
  return null;
}

// ============================================================
// Auth
// ============================================================
/**
 * Log masuk dengan e-mel berdaftar dan OTP 6 digit.
 * OTP disimpan sebagai hash dalam CacheService (5 minit, sekali guna).
 * Sesi = token rawak dalam CacheService; peranan dan lot sentiasa dibaca semula daripada sheet Pengguna.
 */

function salt_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('SALT');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SALT', s); }
  return s;
}

function hashOtp_(email, code) {
  return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + '|' + email + '|' + code));
}

function genOtp_() {
  var hex = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var n = parseInt(hex, 16) % 1000000;
  return ('000000' + n).slice(-6);
}

function findUser_(email) {
  return findBy_(readTable_(SHEETS.USERS), 'email', email);
}

function userView_(u) {
  var v = { email: u.email, nama: u.nama, peranan: u.peranan, idSewa: u.idSewa || '' };
  if (u.peranan === ROLE.ADMIN && APP.ADMIN_EDIT_BUSINESS) v.adminEditBiz = true;
  if (u.peranan === ROLE.ADMIN && APP.DATABASE_URL) v.dbUrl = APP.DATABASE_URL;   // tab Pangkalan Data = pautan terus ke Google Sheet
  return v;
}

/** Mesej sama sama ada e-mel berdaftar atau tidak, supaya senarai e-mel tidak terdedah. */
function requestOtp_(user, p) {
  var email = normEmail_(p.email);
  if (!isEmail_(email)) fail_('Masukkan alamat e-mel yang sah.');
  var cache = CacheService.getScriptCache();
  if (cache.get('otpwait:' + email)) fail_('Sila tunggu seminit sebelum meminta OTP baharu.', 'WAIT');
  cache.put('otpwait:' + email, '1', APP.OTP_RESEND_WAIT);

  var u = findUser_(email);
  if (u && u.status === 'Aktif' && (u.peranan === ROLE.ADMIN || u.peranan === ROLE.TENANT)) {
    var code = genOtp_();
    cache.put('otp:' + email, JSON.stringify({ h: hashOtp_(email, code), t: 0 }), APP.OTP_TTL);
    try {
      sendOtpMail_(email, u.nama, code);
    } catch (e) {
      cache.remove('otp:' + email);
      cache.remove('otpwait:' + email);
      logAction_(email, 'Ralat e-mel OTP', String(e && e.message ? e.message : e));
      fail_('Kod OTP tidak dapat dihantar sekarang. Cuba lagi sebentar atau hubungi ' + APP.CONTACT_EMAIL + '.', 'MAIL');
    }
    logAction_(email, 'OTP dihantar', '');
  }
  return { message: 'Jika e-mel anda berdaftar, kod OTP telah dihantar. Kod sah selama 5 minit.' };
}

function verifyOtp_(user, p) {
  var email = normEmail_(p.email);
  var code = String(p.code || '').replace(/\s/g, '');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otp:' + email);
  if (!raw) fail_('Kod OTP tamat tempoh atau tidak sah. Minta kod baharu.');
  var rec = JSON.parse(raw);
  rec.t += 1;
  if (rec.t > APP.OTP_MAX_TRIES) {
    cache.remove('otp:' + email);
    logAction_(email, 'OTP dikunci', 'Terlalu banyak percubaan');
    fail_('Terlalu banyak percubaan salah. Minta kod OTP baharu.');
  }
  if (rec.h !== hashOtp_(email, code)) {
    cache.put('otp:' + email, JSON.stringify(rec), APP.OTP_TTL);
    fail_('Kod OTP tidak betul. Baki percubaan: ' + (APP.OTP_MAX_TRIES - rec.t) + '.');
  }
  cache.remove('otp:' + email);
  var u = findUser_(email);
  if (!u || u.status !== 'Aktif') fail_('Akaun tidak aktif. Hubungi ' + APP.CONTACT_EMAIL + '.');

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess:' + token, email, APP.SESSION_TTL);
  logAction_(email, 'Log masuk', u.peranan);
  return { token: token, user: userView_(u) };
}

function logout_(user, p, token) {
  CacheService.getScriptCache().remove('sess:' + token);
  logAction_(user.email, 'Log keluar', '');
  return {};
}

/** Sahkan token sesi dan kembalikan pengguna semasa. */
function auth_(token) {
  if (!token || typeof token !== 'string') fail_('Sesi tamat. Sila log masuk semula.', 'SESSION');
  var cache = CacheService.getScriptCache();
  var email = cache.get('sess:' + token);
  if (!email) fail_('Sesi tamat. Sila log masuk semula.', 'SESSION');
  var u = findUser_(email);
  if (!u || u.status !== 'Aktif') {
    cache.remove('sess:' + token);
    fail_('Akaun tidak aktif. Hubungi ' + APP.CONTACT_EMAIL + '.', 'SESSION');
  }
  cache.put('sess:' + token, email, APP.SESSION_TTL);
  return u;
}

// ============================================================
// Mail
// ============================================================
/** E-mel sistem: OTP, peringatan, keputusan semakan. */

/**
 * Format e-mel seragam: TAJUK, salam, isi, terima kasih dan tandatangan UTMXCITE.
 * Semua e-mel sistem dibina melalui fungsi ini.
 */
function mailBody_(tajuk, isi) {
  return '<h2 style="font-size:16px;letter-spacing:.5px;margin:0 0 16px;color:#5b1a33">' + escHtml_(String(tajuk).toUpperCase()) + '</h2>' +
    '<p>Assalamualaikum dan salam sejahtera.</p>' + isi +
    '<p>Terima kasih atas perhatian dan kerjasama yang diberikan.</p>' +
    '<p style="margin-top:20px"><b>UTMXCITE</b><br>' +
    APP.CONTACT_EMAIL + '<br>' +
    APP.CONTACT_PHONE + '</p>';
}

function mailButton_(url) {
  return url ? '<p style="margin:20px 0"><a href="' + url + '" style="background:#5b1a33;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:bold">\uD83D\uDD17 Buka Sistem</a></p>' : '';
}

function sendMail_(to, subject, bodyHtml) {
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:520px">' + bodyHtml + '</div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: APP.SENDER });
}

function sendOtpMail_(email, nama, code) {
  sendMail_(email, 'Kod OTP anda: ' + code, mailBody_('Kod OTP log masuk',
    '<p>Kod OTP untuk log masuk ke sistem laporan kewangan' + (nama ? ' (' + escHtml_(nama) + ')' : '') + ':</p>' +
    '<p style="font-size:28px;letter-spacing:6px;font-weight:bold;margin:12px 0">' + code + '</p>' +
    '<p>Kod ini sah selama ' + Math.round(APP.OTP_TTL / 60) + ' minit dan hanya boleh digunakan sekali. Jangan kongsi kod ini dengan sesiapa.</p>'));
}

/** E-mel penyewa yang memegang lot pada bulan itu. */
function tenantEmailsForLot_(kodLot, y, m) {
  var tn = tenancyFor_(kodLot, y, m);
  if (!tn) return [];
  return readTable_(SHEETS.USERS)
    .filter(function (u) { return u.idSewa === tn.id && u.peranan === ROLE.TENANT && u.status === 'Aktif'; })
    .map(function (u) { return u.email; });
}

/**
 * Hantar peringatan. Tarikh akhir dalam e-mel = tarikh e-mel dihantar + REMINDER_DEADLINE_DAYS hari.
 * Setiap penghantaran direkod dalam sheet Peringatan (bersama tarikh akhir itu).
 */
function sendReminderMail_(kodLot, y, m) {
  var to = tenantEmailsForLot_(kodLot, y, m);
  if (!to.length) return 0;
  var today = todayStr_();
  var deadline = addDays_(today, APP.REMINDER_DEADLINE_DAYS);
  var url = appUrl_();
  var subject = 'Peringatan Penghantaran Laporan Kewangan: ' + MONTHS_MS[m - 1] + ' ' + y;
  var body = mailBody_('Peringatan penghantaran laporan kewangan',
    '<p>Dimaklumkan bahawa laporan kewangan bagi bulan <b>' + MONTHS_MS[m - 1] + ' ' + y + '</b> untuk <b>' + escHtml_(kodLot) + '</b> masih belum diterima.</p>' +
    '<p>Sehubungan itu, mohon kerjasama pihak tuan/puan untuk mengemukakan laporan tersebut selewat-lewatnya pada <b>' + dateLabelMs_(deadline) + '</b>.</p>' +
    '<p>Laporan yang diterima selepas tarikh berkenaan akan direkodkan sebagai penghantaran lewat.</p>' + mailButton_(url));
  to.forEach(function (email) { sendMail_(email, subject, body); });
  appendObj_(SHEETS.REMINDERS, { kunci: kodLot + '|' + y + '-' + pad2_(m) + '|' + today + '|' + nowStr_().slice(11), masa: nowStr_(), akhir: deadline });
  REMINDER_DEADLINES_ = null;   // tarikh akhir baharu berkuat kuasa serta-merta
  return to.length;
}

function sendReviewMail_(kodLot, y, m, decision, komen, by) {
  var to = tenantEmailsForLot_(kodLot, y, m);
  var ok = decision === 'ok';
  to.forEach(function (email) {
    sendMail_(email, (ok ? 'Laporan disahkan: ' : 'Pembetulan diminta: ') + MONTHS_MS[m - 1] + ' ' + y,
      mailBody_(ok ? 'Laporan kewangan disahkan' : 'Pembetulan laporan kewangan diminta',
        '<p>Laporan kewangan bagi bulan <b>' + MONTHS_MS[m - 1] + ' ' + y + '</b> untuk <b>' + escHtml_(kodLot) + '</b> ' + (ok ? 'telah <b>disahkan</b>.' : 'memerlukan <b>pembetulan</b>.') + '</p>' +
        (komen ? '<p style="background:#f6f6f6;padding:10px;border-radius:6px"><b>Komen UTMXCITE:</b><br>' + escHtml_(komen).replace(/\n/g, '<br>') + '</p>' : '') +
        (ok ? '' : '<p>Sila kemas kini laporan dan hantar semula melalui sistem.</p>' + mailButton_(appUrl_()))));
  });
}

// ============================================================
// Business
// ============================================================
/** Maklumat peniaga (tab 1 untuk penyewa). */

/* ---------- Penyewaan (tempoh sewa) ---------- */

function tenancyById_(id) { return findBy_(readTable_(SHEETS.TENANCIES), 'id', id); }

/** Gabungkan lot dan penyewaan menjadi satu objek konteks (kodLot, lokasi, noLot, mula, akhir, sewa, idSewa). */
function mergeTn_(lot, tn) {
  var o = {};
  Object.keys(lot).forEach(function (k) { o[k] = lot[k]; });
  o.mula = tn ? tn.mula : ''; o.akhir = tn ? tn.akhir : ''; o.sewa = tn ? tn.sewa : ''; o.idSewa = tn ? tn.id : '';
  return o;
}

function lotCtx_(tn) {
  var lot = findBy_(readTable_(SHEETS.LOTS), 'kodLot', tn.kodLot);
  if (!lot) fail_('Lot untuk penyewaan ini tidak dijumpai. Hubungi ' + APP.CONTACT_EMAIL + '.');
  return mergeTn_(lot, tn);
}

/** Adakah penyewaan meliputi bulan y/m? (bulan penuh dari bulan mula hingga bulan akhir) */
function tnCovers_(tn, y, m) {
  if (!isDateStr_(tn.mula)) return false;
  var idx = monthIndex_(y, m), s0 = ymFromStr_(tn.mula);
  if (idx < monthIndex_(s0.y, s0.m)) return false;
  if (isDateStr_(tn.akhir)) { var e = ymFromStr_(tn.akhir); if (idx > monthIndex_(e.y, e.m)) return false; }
  return true;
}

function tenancyFor_(kodLot, y, m) {
  var all = readTable_(SHEETS.TENANCIES);
  for (var i = 0; i < all.length; i++) if (all[i].kodLot === kodLot && tnCovers_(all[i], y, m)) return all[i];
  return null;
}

function ctxFor_(kodLot, y, m) {
  var tn = tenancyFor_(kodLot, y, m);
  return tn ? lotCtx_(tn) : null;
}

function nextTenancyId_() {
  var max = 0;
  readTable_(SHEETS.TENANCIES).forEach(function (t) { var n = Number(String(t.id).replace(/\D/g, '')); if (n > max) max = n; });
  return 'PS-' + ('0000' + (max + 1)).slice(-4);
}

function daysInMonth_(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

function lotOfUser_(user) {
  if (user.peranan !== ROLE.TENANT) fail_('Akses tidak dibenarkan.');
  var tn = tenancyById_(user.idSewa);
  if (!tn) fail_('Penyewaan anda belum didaftarkan. Hubungi ' + APP.CONTACT_EMAIL + '.');
  return lotCtx_(tn);
}

function lotView_(lot) {
  return {
    kodLot: lot.kodLot, lokasi: lot.lokasi, noLot: lot.noLot,
    nama: lot.lokasi + ' · Lot ' + lot.noLot,
    status: lot.status, mula: lot.mula || '', akhir: lot.akhir || '', sewa: lot.sewa === '' ? null : Number(lot.sewa)
  };
}

function bizView_(b, mask) {
  b = b || {};
  return {
    nama: b.nama || '', jenis: b.jenis || '', ssm: b.ssm || '', pelajar: b.pelajar || '',
    kp: mask ? maskKp_(b.kp) : (b.kp || ''), matrik: b.matrik || '', fakulti: b.fakulti || '', telefon: b.telefon || '',
    deposit: b.deposit === '' || b.deposit === undefined || b.deposit === null ? null : Number(b.deposit)
  };
}

function getBusiness_(user) {
  var lot = lotOfUser_(user);
  var biz = findBy_(readTable_(SHEETS.BIZ), 'idSewa', lot.idSewa);
  var kemaskini = null;
  if (biz && biz.dikemaskini) {
    var by = biz.dikemaskiniOleh ? findUser_(normEmail_(biz.dikemaskiniOleh)) : null;
    kemaskini = { masa: biz.dikemaskini, oleh: by && by.peranan === ROLE.ADMIN ? 'admin' : 'anda' };
  }
  return { lot: lotView_(lot), email: user.email, peranan: user.peranan, biz: bizView_(biz, false), lengkap: !!(biz && biz.nama), kemaskini: kemaskini };
}

var BIZ_FIELDS = [['nama', 'Nama perniagaan'], ['jenis', 'Jenis perniagaan'], ['ssm', 'No. SSM'], ['pelajar', 'Nama pelajar'], ['kp', 'No. KP'],
                  ['matrik', 'No. matrik'], ['fakulti', 'Fakulti'], ['telefon', 'No. telefon'], ['deposit', 'Deposit']];

/**
 * Semak dan kemaskan input maklumat peniaga. No. KP yang dikosongkan mengekalkan nilai sedia ada
 * (admin tidak perlu melihat No. KP penuh untuk mengemas kini medan lain).
 */
function cleanBiz_(f, existing) {
  var req = [['nama', 'Nama perniagaan'], ['jenis', 'Jenis perniagaan'], ['pelajar', 'Nama pelajar'],
             ['matrik', 'No. matrik'], ['fakulti', 'Fakulti'], ['telefon', 'No. telefon']];
  for (var i = 0; i < req.length; i++) {
    if (!String(f[req[i][0]] || '').trim()) fail_(req[i][1] + ' wajib diisi.');
  }
  var kpIn = String(f.kp || '').trim(), kp;
  if (kpIn) { kp = normKp_(kpIn); if (!kp) fail_('No. KP mesti 12 digit, contoh 010203-01-1234.'); }
  else if (existing && existing.kp) kp = existing.kp;
  else fail_('No. KP wajib diisi.');
  var tel = String(f.telefon).replace(/[^\d+\- ]/g, '').trim();
  if (tel.replace(/\D/g, '').length < 9) fail_('No. telefon tidak sah.');
  return {
    nama: String(f.nama).trim().slice(0, 120), jenis: String(f.jenis).trim().slice(0, 80), ssm: String(f.ssm || '').trim().slice(0, 40),
    pelajar: String(f.pelajar).trim().toUpperCase().slice(0, 120), kp: kp, matrik: String(f.matrik).trim().toUpperCase().slice(0, 20),
    fakulti: String(f.fakulti).trim().toUpperCase().slice(0, 40), telefon: tel
  };
}

/** Simpan rekod peniaga bagi satu penyewaan. Mengembalikan senarai label medan yang berubah (tanpa nilai). */
function writeBiz_(idSewa, clean, byEmail) {
  var cur = findBy_(readTable_(SHEETS.BIZ), 'idSewa', idSewa);
  var changed = [];
  BIZ_FIELDS.forEach(function (fd) { if (!cur || String(cur[fd[0]] || '') !== String(clean[fd[0]] || '')) changed.push(fd[1]); });
  var rec = cur || { idSewa: idSewa };
  Object.keys(clean).forEach(function (k) { rec[k] = clean[k]; });
  rec.dikemaskini = nowStr_(); rec.dikemaskiniOleh = byEmail;
  if (rec._row) updateObj_(SHEETS.BIZ, rec); else appendObj_(SHEETS.BIZ, rec);
  return changed;
}

function saveBusiness_(user, p) {
  var lot = lotOfUser_(user);
  var f = p.biz || {};
  return withLock_(function () {
    var clean = cleanBiz_(f, findBy_(readTable_(SHEETS.BIZ), 'idSewa', lot.idSewa));
    writeBiz_(lot.idSewa, clean, user.email);
    logAction_(user.email, 'Kemas kini maklumat peniaga', lot.kodLot);
    return getBusiness_(user);
  });
}

/* ---------- Admin mengemas kini maklumat peniaga (jika dibenarkan oleh APP.ADMIN_EDIT_BUSINESS) ---------- */

function requireAdminEdit_() {
  if (!APP.ADMIN_EDIT_BUSINESS) fail_('Pentadbir tidak dibenarkan mengemas kini maklumat peniaga. Penyewa mengemas kini sendiri.', 'FORBIDDEN');
}

function adminGetBusiness_(user, p) {
  requireAdminEdit_();
  var tn = tenancyById_(String(p.idSewa || ''));
  if (!tn) fail_('Penyewaan tidak dijumpai.');
  var ctx = lotCtx_(tn);
  var biz = findBy_(readTable_(SHEETS.BIZ), 'idSewa', tn.id);
  return { idSewa: tn.id, lot: lotView_(ctx), tempoh: tnRangeLabel_(tn), biz: bizView_(biz, true), ada: !!biz };
}

function adminSaveBusiness_(user, p) {
  requireAdminEdit_();
  var tn = tenancyById_(String(p.idSewa || ''));
  if (!tn) fail_('Penyewaan tidak dijumpai.');
  var changed = withLock_(function () {
    var clean = cleanBiz_(p.biz || {}, findBy_(readTable_(SHEETS.BIZ), 'idSewa', tn.id));
    clean.deposit = readMoney_((p.biz || {}).deposit, 'Deposit');   // deposit hanya boleh dikemas kini oleh admin
    var ch = writeBiz_(tn.id, clean, user.email);
    logAction_(user.email, 'Admin kemas kini maklumat peniaga', tn.id + ' / ' + tn.kodLot + ' / ' + (ch.length ? ch.join(', ') : 'tiada perubahan'));
    return ch;
  });
  if (changed.length) {
    try {
      var to = readTable_(SHEETS.USERS).filter(function (u) { return u.idSewa === tn.id && u.peranan === ROLE.TENANT && u.status === 'Aktif'; }).map(function (u) { return u.email; });
      to.forEach(function (email) {
        sendMail_(email, 'Maklumat peniaga anda telah dikemas kini', mailBody_('Maklumat peniaga dikemas kini',
          '<p>Maklumat peniaga untuk <b>' + escHtml_(tn.kodLot) + '</b> telah dikemas kini oleh pentadbir UTMXCITE.</p>' +
          '<p>Medan yang diubah: ' + escHtml_(changed.join(', ')) + '.</p><p>Sila semak di tab <b>Maklumat Peniaga</b> dan hubungi kami jika terdapat kesilapan.</p>' + mailButton_(appUrl_())));
      });
    } catch (e) { logAction_(user.email, 'Ralat e-mel', String(e)); }
  }
  return { diubah: changed, tenancies: tenancyList_() };
}

// ============================================================
// Reports
// ============================================================
/** Laporan bulanan: logik penyewa dan fungsi kongsi dengan admin. */

function statusKey_(rep) {
  if (!rep) return 'none';
  if (rep.status === STATUS.SENT) return 'sent';
  if (rep.status === STATUS.FIX) return 'fix';
  if (rep.status === STATUS.OK) return 'ok';
  return 'none';
}

/** Senarai bulan {y, m} yang perlu dilaporkan bagi lot: dari bulan mula sewa hingga bulan semasa (atau tarikh akhir sewa). */
function requiredMonths_(lot, today) {
  if (!isDateStr_(lot.mula)) return [];
  var s = ymFromStr_(lot.mula), t = ymFromStr_(today);
  var end = monthIndex_(t.y, t.m);
  if (isDateStr_(lot.akhir)) {
    var a = ymFromStr_(lot.akhir);
    end = Math.min(end, monthIndex_(a.y, a.m));
  }
  var out = [];
  for (var i = monthIndex_(s.y, s.m); i <= end; i++) out.push({ y: Math.floor(i / 12), m: (i % 12) + 1 });
  return out;
}

function monthAllowed_(lot, y, m, today) {
  return requiredMonths_(lot, today).some(function (x) { return x.y === y && x.m === m; });
}

function parseRef_(ref) {
  if (!ref) return null;
  var p = String(ref).split('|');
  return { id: p[0], name: p[1] || '', size: Number(p[2]) || 0 };
}

function makeRef_(file) { return file.getId() + '|' + file.getName() + '|' + file.getSize(); }

function filesView_(rep) {
  var out = {};
  Object.keys(FILE_KINDS).forEach(function (k) {
    var r = parseRef_(rep && rep[FILE_KINDS[k].col]);
    out[k] = r ? { name: r.name, size: r.size } : null;
  });
  return out;
}

function reportView_(rep, lot, y, m) {
  var key = statusKey_(rep);
  var today = todayStr_();
  var due = effectiveDue_(lot.kodLot, y, m);
  var num = function (v) { return v === '' || v === undefined || v === null ? null : Number(v); };
  return {
    id: reportId_(lot.kodLot, y, m), kodLot: lot.kodLot, tahun: y, bulan: m, bulanNama: MONTHS_MS[m - 1],
    status: key, draf: !!(rep && rep.status === STATUS.DRAFT),
    pendapatan: rep ? num(rep.pendapatan) : null,
    perbelanjaan: rep ? num(rep.perbelanjaan) : null,
    sewa: rep ? num(rep.sewa) : null,
    sewaPeralatan: rep && rep.sewaPeralatan ? rep.sewaPeralatan === 'Ya' : null,
    akuan: !!(rep && rep.akuan === 'Ya'),
    files: filesView_(rep),
    lewat: !!(rep && rep.lewat === 'Ya'),
    kesempatanLewat: key === 'none' && today > due,
    catatan: rep ? rep.catatan || '' : '',
    komen: rep ? rep.komen || '' : '',
    disemakOleh: rep ? rep.disemakOleh || '' : '',
    tarikhSemak: rep ? rep.tarikhSemak || '' : '',
    tarikhHantar: rep ? rep.tarikhHantar || '' : '',
    tarikhAkhir: due, tarikhAkhirLabel: dateLabelMs_(due),
    sewaBulanan: lot.sewa === '' ? null : Number(lot.sewa),
    boleh: key !== 'ok'
  };
}

function reportMap_() {
  var map = {};
  readTable_(SHEETS.REPORTS).forEach(function (r) { map[r.id] = r; });
  return map;
}

function myReports_(user, p) {
  var lot = lotOfUser_(user);
  var today = todayStr_();
  var months = requiredMonths_(lot, today);
  var map = reportMap_();
  var years = {};
  months.forEach(function (x) { years[x.y] = true; });
  var yearList = Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
  var year = Number(p && p.tahun) || (yearList.length ? yearList[0] : Number(today.slice(0, 4)));

  var rows = [], counts = { ok: 0, sent: 0, fix: 0, none: 0 };
  months.forEach(function (x, idx) {
    var v = reportView_(map[reportId_(lot.kodLot, x.y, x.m)], lot, x.y, x.m);
    v.no = idx + 1;
    if (x.y === year) {
      counts[v.status]++;
      rows.push(v);
    }
  });
  rows.sort(function (a, b) { return b.bulan - a.bulan; });
  var biz = findBy_(readTable_(SHEETS.BIZ), 'idSewa', lot.idSewa);
  return { lot: lotView_(lot), perniagaan: biz ? biz.nama : '', tahun: year, tahunList: yearList, rows: rows, counts: counts, jumlahBulan: rows.length, bulanDibenarkan: !!months.length };
}

function getMyReport_(user, p) {
  var lot = lotOfUser_(user);
  var y = Number(p.tahun), m = Number(p.bulan);
  if (!monthAllowed_(lot, y, m, todayStr_())) fail_('Bulan ini tidak dalam tempoh sewa anda.');
  return reportView_(reportMap_()[reportId_(lot.kodLot, y, m)], lot, y, m);
}

/** Dapatkan atau cipta baris laporan (draf) untuk lot dan bulan. Mesti dipanggil dalam withLock_. */
function ensureReport_(lot, y, m) {
  var id = reportId_(lot.kodLot, y, m);
  var rep = findBy_(readTable_(SHEETS.REPORTS), 'id', id);
  if (rep) return rep;
  rep = { id: id, kodLot: lot.kodLot, tahun: y, bulan: m, status: STATUS.DRAFT, dikemaskini: nowStr_(), idSewa: lot.idSewa };
  appendObj_(SHEETS.REPORTS, rep);
  return findBy_(readTable_(SHEETS.REPORTS), 'id', id);
}

function checkEditable_(lot, y, m, rep) {
  if (!monthAllowed_(lot, y, m, todayStr_())) fail_('Bulan ini tidak dalam tempoh sewa anda.');
  if (rep && rep.status === STATUS.OK) fail_('Laporan yang telah disahkan tidak boleh diubah.');
}

/** Catatan penyewa: teks bebas, maksimum 500 aksara, tanpa aksara kawalan. */
function cleanNote_(v) {
  return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 500);
}

function readMoney_(v, label) {
  var n = toNum_(v);
  if (n !== null && (isNaN(n) || n < 0 || n > 100000000)) fail_(label + ' tidak sah. Masukkan nombor 0 atau lebih.');
  return n === null ? '' : round2_(n);
}

function saveMyReport_(user, p) {
  var lot = lotOfUser_(user);
  var y = Number(p.tahun), m = Number(p.bulan);
  var d = p.data || {};
  var pendapatan = readMoney_(d.pendapatan, 'Jumlah pendapatan');
  var perbelanjaan = readMoney_(d.perbelanjaan, 'Jumlah perbelanjaan');
  var sewa = readMoney_(d.sewa, 'Bayaran sewa');
  var catatan = cleanNote_(d.catatan);
  return withLock_(function () {
    var existing = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(lot.kodLot, y, m));
    checkEditable_(lot, y, m, existing);
    var rep = existing || ensureReport_(lot, y, m);
    rep.pendapatan = pendapatan;
    rep.perbelanjaan = perbelanjaan;
    rep.sewa = sewa;
    rep.sewaPeralatan = d.sewaPeralatan === true ? 'Ya' : d.sewaPeralatan === false ? 'Tidak' : '';
    if (d.catatan !== undefined) rep.catatan = catatan;   // catatan penyewa, terbuka kepada admin; tidak diubah jika tidak dihantar
    rep.akuan = d.akuan === true ? 'Ya' : '';
    rep.dikemaskini = nowStr_();
    updateObj_(SHEETS.REPORTS, rep);
    logAction_(user.email, 'Simpan laporan', rep.id);
    return reportView_(rep, lot, y, m);
  });
}

function rootFolder_() {
  var props = PropertiesService.getScriptProperties();
  if (APP.ROOT_FOLDER_ID) {
    try {
      return DriveApp.getFolderById(APP.ROOT_FOLDER_ID);
    } catch (e) {
      logAction_('sistem', 'Ralat folder simpanan', String(e && e.message ? e.message : e));
      fail_('Folder simpanan Drive tidak dapat diakses. Pastikan akaun pemilik skrip mempunyai akses Editor pada folder itu, atau hubungi ' + APP.CONTACT_EMAIL + '.', 'DRIVE');
    }
  }
  var id = props.getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* cipta semula */ } }
  var f = DriveApp.createFolder(APP.ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function isPdfBytes_(bytes) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function fileNameFor_(lot, biz, y, m, kind) {
  var prefix = String(lot.lokasi).replace(/[^A-Za-z0-9]/g, '') + '_Lot' + lot.noLot + '_' + MONTHS_EN[m - 1];
  if (kind === 'laporan') return prefix + '_' + (safeName_(biz && biz.nama) || 'Perniagaan') + '_' + FILE_KINDS[kind].suffix + '.pdf';
  return prefix + '_' + FILE_KINDS[kind].suffix + '.pdf';
}

function uploadMyFile_(user, p) {
  var lot = lotOfUser_(user);
  var y = Number(p.tahun), m = Number(p.bulan), kind = String(p.kind);
  var spec = FILE_KINDS[kind];
  if (!spec) fail_('Jenis fail tidak sah.');
  var b64 = String(p.base64 || '');
  if (!b64) fail_('Fail tidak diterima.');
  // 4/3 saiz sebenar; semak sebelum nyahkod supaya fail terlalu besar ditolak awal
  if (b64.length > Math.ceil(APP.MAX_FILE_BYTES * 4 / 3) + 8) fail_('Saiz fail melebihi 10 MB.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { fail_('Fail rosak. Pilih semula fail PDF.'); }
  if (bytes.length > APP.MAX_FILE_BYTES) fail_('Saiz fail melebihi 10 MB.');
  if (!isPdfBytes_(bytes)) fail_('Hanya fail PDF dibenarkan.');

  return withLock_(function () {
    var existing = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(lot.kodLot, y, m));
    checkEditable_(lot, y, m, existing);
    var rep = existing || ensureReport_(lot, y, m);
    var biz = findBy_(readTable_(SHEETS.BIZ), 'idSewa', lot.idSewa);

    var folder = subFolder_(subFolder_(subFolder_(rootFolder_(), String(y)), pad2_(m) + ' ' + MONTHS_EN[m - 1]), lot.kodLot);
    var name = fileNameFor_(lot, biz, y, m, kind);
    var old = parseRef_(rep[spec.col]);
    var file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    rep[spec.col] = makeRef_(file);
    rep.dikemaskini = nowStr_();
    updateObj_(SHEETS.REPORTS, rep);
    if (old && old.id) { try { DriveApp.getFileById(old.id).setTrashed(true); } catch (e) { /* fail lama mungkin sudah dipadam */ } }
    logAction_(user.email, 'Muat naik ' + spec.label, rep.id + ' / ' + name);
    return reportView_(rep, lot, y, m);
  });
}

/** Semak kelengkapan sebelum hantar. Mengembalikan senarai masalah. */
function missingFields_(rep) {
  var miss = [];
  if (rep.pendapatan === '' || rep.pendapatan === undefined) miss.push('Jumlah pendapatan');
  if (rep.perbelanjaan === '' || rep.perbelanjaan === undefined) miss.push('Jumlah perbelanjaan');
  if (rep.sewa === '' || rep.sewa === undefined) miss.push('Bayaran sewa');
  if (!rep.sewaPeralatan) miss.push('Pilihan sewa peralatan UTMXCITE');
  if (!rep.fLaporan) miss.push('PDF laporan kewangan');
  if (!rep.fSewa) miss.push('PDF resit bayaran sewa');
  if (rep.sewaPeralatan === 'Ya' && !rep.fIncubator) miss.push('PDF resit incubator');
  if (rep.akuan !== 'Ya') miss.push('Akuan pengesahan');
  return miss;
}

function submitMyReport_(user, p) {
  var lot = lotOfUser_(user);
  var y = Number(p.tahun), m = Number(p.bulan);
  return withLock_(function () {
    var rep = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(lot.kodLot, y, m));
    if (!rep) fail_('Tiada laporan untuk dihantar. Simpan laporan dahulu.');
    checkEditable_(lot, y, m, rep);
    var miss = missingFields_(rep);
    if (miss.length) fail_('Laporan belum lengkap: ' + miss.join(', ') + '.');
    var now = nowStr_();
    if (!rep.tarikhHantar) rep.lewat = todayStr_() > effectiveDue_(lot.kodLot, y, m) ? 'Ya' : '';
    rep.status = STATUS.SENT;
    rep.tarikhHantar = now;
    rep.dikemaskini = now;
    updateObj_(SHEETS.REPORTS, rep);
    logAction_(user.email, 'Hantar laporan', rep.id + (rep.lewat === 'Ya' ? ' (lewat)' : ''));
    return reportView_(rep, lot, y, m);
  });
}

function deleteMyReport_(user, p) {
  var lot = lotOfUser_(user);
  var y = Number(p.tahun), m = Number(p.bulan);
  return withLock_(function () {
    var rep = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(lot.kodLot, y, m));
    if (!rep) fail_('Laporan tidak dijumpai.');
    checkEditable_(lot, y, m, rep);
    Object.keys(FILE_KINDS).forEach(function (k) {
      var r = parseRef_(rep[FILE_KINDS[k].col]);
      if (r && r.id) { try { DriveApp.getFileById(r.id).setTrashed(true); } catch (e) { /* abaikan */ } }
    });
    deleteObj_(SHEETS.REPORTS, rep);
    logAction_(user.email, 'Padam laporan', rep.id);
    return {};
  });
}

/** Muat turun fail: penyewa untuk lot sendiri sahaja, admin untuk mana-mana lot. Dikembalikan sebagai base64. */
function getFile_(user, p) {
  var spec = FILE_KINDS[String(p.kind)];
  if (!spec) fail_('Jenis fail tidak sah.');
  var kodLot;
  if (user.peranan === ROLE.ADMIN) kodLot = String(p.kodLot || '');
  else {
    var own = lotOfUser_(user);
    kodLot = own.kodLot;
    if (!monthAllowed_(own, Number(p.tahun), Number(p.bulan), todayStr_())) fail_('Fail tidak dijumpai.');   // bukan bulan penyewa ini
  }
  var rep = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(kodLot, Number(p.tahun), Number(p.bulan)));
  var ref = rep && parseRef_(rep[spec.col]);
  if (!ref) fail_('Fail tidak dijumpai.');
  var blob = DriveApp.getFileById(ref.id).getBlob();
  return { name: ref.name, mime: 'application/pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

// ============================================================
// Admin
// ============================================================
/** Fungsi admin: pantauan semua lot, semakan, pengguna, lot, eksport. */

/**
 * Senarai laporan semua lot. p.bulan = 0 bermaksud semua bulan dalam tahun itu.
 * Setiap baris ialah satu lot untuk satu bulan dalam tempoh sewa penyewanya (lot boleh bertukar penyewa).
 */
function adminReports_(user, p) {
  var today = todayStr_();
  var t = ymFromStr_(today);
  var y = Number(p.tahun) || t.y;
  var m = p.bulan === undefined || p.bulan === null || p.bulan === '' ? 0 : Number(p.bulan);
  if (!isFinite(m) || m < 0 || m > 12) fail_('Bulan tidak sah.');
  var lots = readTable_(SHEETS.LOTS).filter(function (l) { return l.status === 'Aktif'; });
  var tns = readTable_(SHEETS.TENANCIES);
  var bizMap = {}; readTable_(SHEETS.BIZ).forEach(function (b) { bizMap[b.idSewa] = b; });
  var map = reportMap_();
  var counts = { ok: 0, sent: 0, fix: 0, none: 0 }, rows = [], tanpaTarikh = 0;

  lots.forEach(function (lot) {
    var lotTns = tns.filter(function (x) { return x.kodLot === lot.kodLot && isDateStr_(x.mula); });
    if (!lotTns.length) tanpaTarikh++;
    lotTns.forEach(function (tn) {
      var ctx = mergeTn_(lot, tn);
      requiredMonths_(ctx, today).filter(function (x) { return x.y === y && (m === 0 || x.m === m); }).forEach(function (x) {
        var v = reportView_(map[reportId_(lot.kodLot, x.y, x.m)], ctx, x.y, x.m);
        var b = bizMap[tn.id] || {};
        v.idSewa = tn.id;
        v.lotNama = lot.lokasi + ' · Lot ' + lot.noLot;
        v.lokasi = lot.lokasi;
        v.perniagaan = b.nama || '';
        v.pelajar = b.pelajar || '';
        v.untungRugi = typeof v.pendapatan === 'number' && typeof v.perbelanjaan === 'number' ? round2_(v.pendapatan - v.perbelanjaan) : null;
        counts[v.status]++;
        rows.push(v);
      });
    });
  });
  rows.sort(function (a, b) { return b.bulan - a.bulan; });   // bulan terkini dahulu; susunan lot dikekalkan (sort stabil)
  return { tahun: y, bulan: m, counts: counts, lotAktif: lots.length, jumlahLot: rows.length, tanpaTarikh: tanpaTarikh,
           rows: rows, lokasiList: uniq_(lots.map(function (l) { return l.lokasi; })) };
}

function uniq_(arr) { var s = {}; return arr.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

function adminGetReport_(user, p) {
  var y = Number(p.tahun), m = Number(p.bulan);
  var ctx = ctxFor_(String(p.kodLot), y, m);
  if (!ctx) fail_('Tiada penyewaan untuk lot dan bulan ini.');
  var v = reportView_(reportMap_()[reportId_(ctx.kodLot, y, m)], ctx, y, m);
  var b = findBy_(readTable_(SHEETS.BIZ), 'idSewa', ctx.idSewa);
  v.lot = lotView_(ctx);
  v.biz = bizView_(b, true);
  v.idSewa = ctx.idSewa;
  return v;
}

function adminReview_(user, p) {
  var y = Number(p.tahun), m = Number(p.bulan), kodLot = String(p.kodLot);
  var decision = String(p.decision);
  var komen = String(p.komen || '').trim().slice(0, 1000);
  if (decision !== 'ok' && decision !== 'fix') fail_('Keputusan tidak sah.');
  if (decision === 'fix' && !komen) fail_('Tulis komen supaya penyewa tahu apa yang perlu dibetulkan.');
  var res = withLock_(function () {
    var rep = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(kodLot, y, m));
    if (!rep || rep.status === STATUS.DRAFT) fail_('Laporan ini belum dihantar oleh penyewa.');
    if (rep.status === STATUS.OK) fail_('Laporan ini sudah disahkan.');
    rep.status = decision === 'ok' ? STATUS.OK : STATUS.FIX;
    rep.komen = komen;
    rep.disemakOleh = user.nama || user.email;
    rep.tarikhSemak = nowStr_();
    rep.dikemaskini = rep.tarikhSemak;
    updateObj_(SHEETS.REPORTS, rep);
    logAction_(user.email, decision === 'ok' ? 'Sahkan laporan' : 'Minta pembetulan', rep.id + (komen ? ' / ' + komen : ''));
    return rep;
  });
  try { sendReviewMail_(kodLot, y, m, decision, komen, user.nama || user.email); } catch (e) { logAction_(user.email, 'Ralat e-mel', String(e)); }
  return adminGetReport_(user, p);
}

function adminRemind_(user, p) {
  var y = Number(p.tahun), m = Number(p.bulan), kodLot = String(p.kodLot);
  var rep = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(kodLot, y, m));
  var key = statusKey_(rep);
  if (key === 'sent' || key === 'ok') fail_('Laporan ini sudah dihantar.');
  var n = sendReminderMail_(kodLot, y, m);
  if (!n) fail_('Tiada pengguna aktif didaftarkan untuk lot ini.');
  logAction_(user.email, 'Hantar peringatan', kodLot + ' ' + y + '-' + pad2_(m));
  return { dihantar: n };
}

/* ---------- Penyewaan ---------- */

function tnRangeLabel_(tn) {
  var f = function (s) { var d = ymFromStr_(s); return MONTHS_MS[d.m - 1].slice(0, 3) + ' ' + d.y; };
  return (isDateStr_(tn.mula) ? f(tn.mula) : '?') + ' hingga ' + (isDateStr_(tn.akhir) ? f(tn.akhir) : 'kini');
}

function tenancyList_() {
  var lots = {}; readTable_(SHEETS.LOTS).forEach(function (l) { lots[l.kodLot] = l; });
  var biz = {}; readTable_(SHEETS.BIZ).forEach(function (b) { biz[b.idSewa] = b; });
  var users = readTable_(SHEETS.USERS);
  var today = todayStr_(), t = ymFromStr_(today);
  return readTable_(SHEETS.TENANCIES).map(function (tn) {
    var l = lots[tn.kodLot], b = biz[tn.id] || {};
    var lotNama = l ? l.lokasi + ' · Lot ' + l.noLot : tn.kodLot;
    return {
      id: tn.id, kodLot: tn.kodLot, lotNama: lotNama, mula: tn.mula || '', akhir: tn.akhir || '',
      sewa: tn.sewa === '' ? null : Number(tn.sewa), tempoh: tnRangeLabel_(tn),
      perniagaan: b.nama || '', pelajar: b.pelajar || '',
      pengguna: users.filter(function (u) { return u.idSewa === tn.id; }).map(function (u) { return u.email; }),
      semasa: tnCovers_(tn, t.y, t.m),
      label: lotNama + ' · ' + (b.nama || 'maklumat belum diisi') + ' (' + tnRangeLabel_(tn) + ')'
    };
  }).sort(function (a, b) { return a.lotNama < b.lotNama ? -1 : a.lotNama > b.lotNama ? 1 : (a.mula < b.mula ? -1 : 1); });
}

function adminTenancies_() {
  return { tenancies: tenancyList_(), lots: adminLots_().lots };
}

function monthRange_(tn) {
  var s0 = ymFromStr_(tn.mula);
  var lo = monthIndex_(s0.y, s0.m), hi = Infinity;
  if (isDateStr_(tn.akhir)) { var e = ymFromStr_(tn.akhir); hi = monthIndex_(e.y, e.m); }
  return [lo, hi];
}

function adminSaveTenancy_(user, p) {
  var d = p.tenancy || {};
  var kodLot = String(d.kodLot || '');
  if (!findBy_(readTable_(SHEETS.LOTS), 'kodLot', kodLot)) fail_('Pilih lot yang sah.');
  var mula = String(d.mula || ''), akhir = String(d.akhir || '');
  if (!isDateStr_(mula)) fail_('Tarikh mula sewa wajib diisi.');
  if (mula.slice(8, 10) !== '01') fail_('Tarikh mula mesti hari pertama bulan (contoh 2026-07-01). Penukaran penyewa dibuat pada awal bulan.');
  if (akhir) {
    if (!isDateStr_(akhir)) fail_('Tarikh akhir sewa tidak sah.');
    var a = ymFromStr_(akhir);
    if (Number(akhir.slice(8, 10)) !== daysInMonth_(a.y, a.m)) fail_('Tarikh akhir mesti hari terakhir bulan (contoh 2026-06-30).');
    if (akhir < mula) fail_('Tarikh akhir mesti selepas tarikh mula.');
  }
  var sewa = toNum_(d.sewa);
  if (sewa !== null && (isNaN(sewa) || sewa < 0)) fail_('Sewa bulanan tidak sah.');

  return withLock_(function () {
    var all = readTable_(SHEETS.TENANCIES);
    var cur = d.id ? findBy_(all, 'id', String(d.id)) : null;
    if (d.id && !cur) fail_('Penyewaan tidak dijumpai.');
    var mine = monthRange_({ mula: mula, akhir: akhir });
    all.forEach(function (o) {
      if (o.kodLot !== kodLot || (cur && o.id === cur.id) || !isDateStr_(o.mula)) return;
      var r = monthRange_(o);
      if (mine[0] <= r[1] && r[0] <= mine[1]) fail_('Tempoh bertindih dengan penyewaan ' + o.id + ' (' + tnRangeLabel_(o) + ') pada lot yang sama.');
    });
    if (cur) {
      readTable_(SHEETS.REPORTS).forEach(function (r) {
        if (r.idSewa !== cur.id) return;
        var idx = monthIndex_(Number(r.tahun), Number(r.bulan));
        if (idx < mine[0] || idx > mine[1]) fail_('Tempoh baharu mengecualikan laporan ' + MONTHS_MS[r.bulan - 1] + ' ' + r.tahun + ' yang sudah ada. Padam laporan itu dahulu atau laraskan tarikh.');
      });
    }
    var rec = cur || { id: nextTenancyId_() };
    rec.kodLot = kodLot; rec.mula = mula; rec.akhir = akhir; rec.sewa = sewa === null ? '' : sewa;
    if (cur) updateObj_(SHEETS.TENANCIES, rec); else appendObj_(SHEETS.TENANCIES, rec);
    logAction_(user.email, cur ? 'Kemas kini penyewaan' : 'Tambah penyewaan', rec.id + ' / ' + kodLot + ' / ' + mula + ' - ' + (akhir || 'kini'));
    return adminTenancies_();
  });
}

function adminDeleteTenancy_(user, p) {
  return withLock_(function () {
    var cur = findBy_(readTable_(SHEETS.TENANCIES), 'id', String(p.id || ''));
    if (!cur) fail_('Penyewaan tidak dijumpai.');
    if (readTable_(SHEETS.REPORTS).some(function (r) { return r.idSewa === cur.id; })) fail_('Penyewaan ini sudah ada laporan, jadi tidak boleh dipadam. Laraskan tarikh atau biarkan sahaja.');
    if (readTable_(SHEETS.USERS).some(function (u) { return u.idSewa === cur.id; })) fail_('Masih ada pengguna dipautkan kepada penyewaan ini. Tukar atau nyahaktifkan pengguna dahulu.');
    deleteObj_(SHEETS.TENANCIES, cur);
    logAction_(user.email, 'Padam penyewaan', cur.id + ' / ' + cur.kodLot);
    return adminTenancies_();
  });
}

/* ---------- Pengguna ---------- */

function adminUsers_() {
  var tl = tenancyList_(), byId = {};
  tl.forEach(function (t) { byId[t.id] = t; });
  return {
    users: readTable_(SHEETS.USERS).map(function (u) {
      return { email: u.email, nama: u.nama, peranan: u.peranan, idSewa: u.idSewa || '', penyewaan: u.idSewa && byId[u.idSewa] ? byId[u.idSewa].label : '', status: u.status };
    }),
    penyewaan: tl.map(function (t) { return { id: t.id, label: t.label }; })
  };
}

function adminSaveUser_(user, p) {
  var d = p.user || {};
  var email = normEmail_(d.email);
  if (!isEmail_(email)) fail_('E-mel tidak sah.');
  var nama = String(d.nama || '').trim().slice(0, 120);
  if (!nama) fail_('Nama wajib diisi.');
  var peranan = String(d.peranan);
  if (peranan !== ROLE.ADMIN && peranan !== ROLE.TENANT) fail_('Peranan tidak sah.');
  var status = d.status === 'Tidak aktif' ? 'Tidak aktif' : 'Aktif';
  var idSewa = peranan === ROLE.TENANT ? String(d.idSewa || '') : '';
  if (peranan === ROLE.TENANT) {
    if (!tenancyById_(idSewa)) fail_('Pilih penyewaan yang sah untuk penyewa. Tambah penyewaan di tab Penyewaan jika belum ada.');
  }
  if (email === user.email && (peranan !== ROLE.ADMIN || status !== 'Aktif')) fail_('Anda tidak boleh menurunkan atau menyahaktifkan akaun sendiri.');

  return withLock_(function () {
    var users = readTable_(SHEETS.USERS);
    var cur = findBy_(users, 'email', email);
    if (cur && cur.peranan === ROLE.ADMIN && (peranan !== ROLE.ADMIN || status !== 'Aktif')) {
      var otherAdmins = users.filter(function (u) { return u.peranan === ROLE.ADMIN && u.status === 'Aktif' && u.email !== email; });
      if (!otherAdmins.length) fail_('Mesti ada sekurang-kurangnya seorang admin aktif.');
    }
    var rec = cur || { email: email };
    rec.nama = nama; rec.peranan = peranan; rec.idSewa = idSewa; rec.status = status;
    if (cur) updateObj_(SHEETS.USERS, rec); else appendObj_(SHEETS.USERS, rec);
    logAction_(user.email, cur ? 'Kemas kini pengguna' : 'Tambah pengguna', email + ' / ' + peranan + ' / ' + status);
    return adminUsers_();
  });
}

/* ---------- Lot ---------- */

function adminLots_() {
  var today = todayStr_(), t = ymFromStr_(today);
  var biz = {}; readTable_(SHEETS.BIZ).forEach(function (b) { biz[b.idSewa] = b; });
  var tns = readTable_(SHEETS.TENANCIES);
  return {
    lots: readTable_(SHEETS.LOTS).map(function (l) {
      var mine = tns.filter(function (x) { return x.kodLot === l.kodLot; });
      var now = mine.filter(function (x) { return tnCovers_(x, t.y, t.m); })[0];
      return { kodLot: l.kodLot, lokasi: l.lokasi, noLot: l.noLot, nama: l.lokasi + ' · Lot ' + l.noLot, status: l.status,
               bilPenyewaan: mine.length, semasa: now ? ((biz[now.id] || {}).nama || 'maklumat belum diisi') : '' };
    })
  };
}

function adminSaveLot_(user, p) {
  var d = p.lot || {};
  var lokasi = String(d.lokasi || '').trim();
  var noLot = Number(d.noLot);
  if (!lokasi) fail_('Lokasi wajib diisi.');
  if (!isFinite(noLot) || noLot < 1 || noLot !== Math.floor(noLot)) fail_('No. lot mesti nombor bulat 1 atau lebih.');
  var status = d.status === 'Tidak aktif' ? 'Tidak aktif' : 'Aktif';
  var kod = lotCode_(lokasi, noLot);

  return withLock_(function () {
    var lots = readTable_(SHEETS.LOTS);
    var cur = findBy_(lots, 'kodLot', kod);
    if (!cur && p.isNew !== true) fail_('Lot tidak dijumpai.');
    if (cur && p.isNew === true) fail_('Lot ' + lokasi + ' ' + noLot + ' sudah wujud.');
    var rec = cur || { kodLot: kod };
    rec.lokasi = cur ? cur.lokasi : lokasi;
    rec.noLot = noLot; rec.status = status;
    if (cur) updateObj_(SHEETS.LOTS, rec); else appendObj_(SHEETS.LOTS, rec);
    logAction_(user.email, cur ? 'Kemas kini lot' : 'Tambah lot', kod);
    return adminLots_();
  });
}

/* ---------- Eksport ---------- */

function csvCell_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // elak formula dalam Excel
  return '"' + s.replace(/"/g, '""') + '"';
}

/** CSV tanpa No. KP. */
function adminExport_(user, p) {
  var data = adminReports_(user, p);
  var head = ['Lot', 'Lokasi', 'Perniagaan', 'Pelajar', 'Tahun', 'Bulan', 'Pendapatan (RM)', 'Perbelanjaan (RM)', 'Untung/Rugi (RM)',
              'Bayaran sewa (RM)', 'Sewa peralatan', 'Status', 'Lewat', 'Tarikh hantar', 'Disemak oleh', 'Catatan penyewa'];
  var lines = [head.map(csvCell_).join(',')];
  data.rows.forEach(function (r) {
    lines.push([r.lotNama, r.lokasi, r.perniagaan, r.pelajar, r.tahun, MONTHS_MS[r.bulan - 1], r.pendapatan, r.perbelanjaan, r.untungRugi,
      r.sewa, r.sewaPeralatan === null ? '' : (r.sewaPeralatan ? 'Ya' : 'Tidak'),
      ({ ok: 'Disahkan', sent: 'Dihantar', fix: 'Perlu dibetulkan', none: 'Belum dihantar' })[r.status], r.lewat ? 'Ya' : '', r.tarikhHantar, r.disemakOleh, r.catatan].map(csvCell_).join(','));
  });
  logAction_(user.email, 'Eksport CSV', data.tahun + '-' + (data.bulan ? pad2_(data.bulan) : 'semua'));
  return { name: 'Laporan_' + data.tahun + '-' + (data.bulan ? pad2_(data.bulan) : 'semua') + '.csv', csv: '﻿' + lines.join('\r\n') };
}

// ============================================================
// Dashboard
// ============================================================

/** Kutipan sewa bagi satu baris laporan: bayar = bayaran sewa laporan yang sudah dihantar; tunggak = kekurangan berbanding sewa bulanan (null jika sewa bulanan belum diisi). */
function rentOf_(r) {
  var bayar = (r.status === 'sent' || r.status === 'ok') && typeof r.sewa === 'number' ? r.sewa : 0;
  return { bayar: bayar, tunggak: typeof r.sewaBulanan === 'number' ? Math.max(0, r.sewaBulanan - bayar) : null };
}
function counted_(r) { return (r.status === 'sent' || r.status === 'ok') && typeof r.pendapatan === 'number' && typeof r.perbelanjaan === 'number'; }
function shortMonth_(m) { return MONTHS_MS[m - 1].slice(0, 3); }

/** Dashboard penyewa: ringkasan kewangan setahun, kepatuhan penghantaran dan tindakan yang perlu dibuat. */
function myDashboard_(user, p) {
  var d = myReports_(user, p);
  var byMonth = {};
  d.rows.forEach(function (r) { byMonth[r.bulan] = r; });
  var siri = [], jum = { pendapatan: 0, perbelanjaan: 0, sewa: 0, bulan: 0 };
  var best = null;
  for (var m = 1; m <= 12; m++) {
    var r = byMonth[m], item = { bulan: m, bulanNama: shortMonth_(m), ada: !!r, status: r ? r.status : null, pendapatan: null, perbelanjaan: null, untung: null };
    if (r && counted_(r)) {
      item.pendapatan = r.pendapatan; item.perbelanjaan = r.perbelanjaan; item.untung = round2_(r.pendapatan - r.perbelanjaan);
      jum.pendapatan += r.pendapatan; jum.perbelanjaan += r.perbelanjaan; jum.sewa += typeof r.sewa === 'number' ? r.sewa : 0; jum.bulan++;
      if (!best || item.untung > best.untung) best = { bulan: m, bulanNama: MONTHS_MS[m - 1], untung: item.untung };
    }
    siri.push(item);
  }
  var hantar = 0, tepat = 0, tertunggak = 0, perluBaiki = 0, tindakan = [], komen = null;
  d.rows.slice().sort(function (a, b) { return a.bulan - b.bulan; }).forEach(function (r) {
    if (r.status === 'sent' || r.status === 'ok') { hantar++; if (!r.lewat) tepat++; }
    if (r.status === 'none' || r.status === 'fix') {
      if (r.status === 'fix') perluBaiki++; else if (r.kesempatanLewat) tertunggak++;
      tindakan.push({ bulan: r.bulan, bulanNama: r.bulanNama, tahun: r.tahun, status: r.status, tarikhAkhirLabel: r.tarikhAkhirLabel, lewat: !!r.kesempatanLewat, komen: r.komen || '' });
    }
    if (r.status === 'fix' && r.komen) komen = { bulanNama: r.bulanNama, tahun: r.tahun, komen: r.komen, oleh: r.disemakOleh };
  });
  var fokus = tindakan.length ? tindakan[0] : (d.rows.length ? (function (r) { return { bulan: r.bulan, bulanNama: r.bulanNama, tahun: r.tahun, status: r.status, tarikhAkhirLabel: r.tarikhAkhirLabel, lewat: !!r.lewat, komen: r.komen || '' }; })(d.rows[0]) : null);
  return {
    lot: d.lot, perniagaan: d.perniagaan, tahun: d.tahun, tahunList: d.tahunList, bulanDibenarkan: d.bulanDibenarkan,
    counts: d.counts, jumlahBulan: d.jumlahBulan, siri: siri,
    jumlah: { pendapatan: round2_(jum.pendapatan), perbelanjaan: round2_(jum.perbelanjaan), untung: round2_(jum.pendapatan - jum.perbelanjaan), sewa: round2_(jum.sewa),
              purataPendapatan: jum.bulan ? round2_(jum.pendapatan / jum.bulan) : null, bulanDikira: jum.bulan, bulanTerbaik: best },
    kepatuhan: { hantar: hantar, tepatMasa: tepat, tertunggak: tertunggak, perluBaiki: perluBaiki, wajib: d.rows.length },
    tindakan: tindakan, fokus: fokus, komenTerkini: komen
  };
}

/** Dashboard admin: p.tahun (lalai: tahun semasa), p.bulan (0 = semua bulan dalam tahun itu; lalai: semua). */
function adminDashboard_(user, p) {
  var today = todayStr_(), t = ymFromStr_(today);
  var y = Number(p.tahun) || t.y;
  var m = p.bulan === undefined || p.bulan === null || p.bulan === '' ? 0 : Number(p.bulan);   // lalai: semua bulan
  if (!isFinite(m) || m < 0 || m > 12) fail_('Bulan tidak sah.');
  var all = adminReports_(user, { tahun: y, bulan: 0 });
  var sel = all.rows.filter(function (r) { return m === 0 || r.bulan === m; });

  var counts = { ok: 0, sent: 0, fix: 0, none: 0 }, jum = { pendapatan: 0, perbelanjaan: 0, sewa: 0, dikira: 0 }, lewat = 0;
  sel.forEach(function (r) {
    counts[r.status]++;
    if (r.lewat) lewat++;
    if (counted_(r)) { jum.pendapatan += r.pendapatan; jum.perbelanjaan += r.perbelanjaan; jum.sewa += typeof r.sewa === 'number' ? r.sewa : 0; jum.dikira++; }
  });
  var hantar = counts.ok + counts.sent;

  var siri = [];
  for (var k = 1; k <= 12; k++) {
    var rows = all.rows.filter(function (r) { return r.bulan === k; });
    var it = { bulan: k, bulanNama: shortMonth_(k), dijangka: rows.length, dihantar: 0, tepatMasa: 0, disahkan: 0, pendapatan: 0, perbelanjaan: 0, sewaDiterima: 0, sewaTertunggak: 0 };
    rows.forEach(function (r) {
      var rt = rentOf_(r); it.sewaDiterima += rt.bayar; it.sewaTertunggak += rt.tunggak || 0;
      if (r.status === 'sent' || r.status === 'ok') { it.dihantar++; if (!r.lewat) it.tepatMasa++; }
      if (r.status === 'ok') it.disahkan++;
      if (counted_(r)) { it.pendapatan += r.pendapatan; it.perbelanjaan += r.perbelanjaan; }
    });
    it.pendapatan = round2_(it.pendapatan); it.perbelanjaan = round2_(it.perbelanjaan); it.sewaDiterima = round2_(it.sewaDiterima); it.sewaTertunggak = round2_(it.sewaTertunggak);
    siri.push(it);
  }

  var lokMap = {}, lokasi = [];
  sel.forEach(function (r) {
    var o = lokMap[r.lokasi];
    if (!o) { o = lokMap[r.lokasi] = { lokasi: r.lokasi, dijangka: 0, dihantar: 0, pendapatan: 0, perbelanjaan: 0 }; lokasi.push(o); }
    o.dijangka++;
    if (r.status === 'sent' || r.status === 'ok') o.dihantar++;
    if (counted_(r)) { o.pendapatan += r.pendapatan; o.perbelanjaan += r.perbelanjaan; }
  });
  lokasi.forEach(function (o) { o.pendapatan = round2_(o.pendapatan); o.perbelanjaan = round2_(o.perbelanjaan); });

  // Rumusan mengikut peniaga (satu baris bagi setiap lot dan penyewaan dalam tempoh yang dipilih)
  var pnMap = {}, peniaga = [];
  sel.forEach(function (r) {
    var k = r.kodLot + '|' + r.idSewa, o = pnMap[k];
    if (!o) { o = pnMap[k] = { kodLot: r.kodLot, lotNama: r.lotNama, perniagaan: r.perniagaan, pelajar: r.pelajar, pendapatan: 0, perbelanjaan: 0, dikira: 0 }; peniaga.push(o); }
    if (counted_(r)) { o.pendapatan += r.pendapatan; o.perbelanjaan += r.perbelanjaan; o.dikira++; }
    // Kutipan sewa: diterima = bayaran sewa dalam laporan yang sudah dihantar; tertunggak = kekurangan berbanding sewa bulanan, bagi setiap bulan
    var rt = rentOf_(r);
    o.sewaDiterima = (o.sewaDiterima || 0) + rt.bayar;
    if (rt.tunggak !== null) { o.sewaAda = true; o.sewaTertunggak = (o.sewaTertunggak || 0) + rt.tunggak; }
  });
  var sewaJum = { diterima: 0, tertunggak: 0 };
  peniaga.forEach(function (o) {
    o.sewaDiterima = round2_(o.sewaDiterima || 0);
    o.sewaTertunggak = o.sewaAda ? round2_(o.sewaTertunggak || 0) : null;
    o.sewaJumlah = o.sewaTertunggak === null ? null : round2_(o.sewaDiterima + o.sewaTertunggak);
    sewaJum.diterima += o.sewaDiterima; sewaJum.tertunggak += o.sewaTertunggak || 0;
  });
  sewaJum.diterima = round2_(sewaJum.diterima); sewaJum.tertunggak = round2_(sewaJum.tertunggak);
  peniaga.forEach(function (o) {
    o.pendapatan = o.dikira ? round2_(o.pendapatan) : null; o.perbelanjaan = o.dikira ? round2_(o.perbelanjaan) : null;
    o.untungRugi = o.dikira ? round2_(o.pendapatan - o.perbelanjaan) : null;
  });

  var slim = function (r) { return { kodLot: r.kodLot, lotNama: r.lotNama, perniagaan: r.perniagaan, pelajar: r.pelajar, tahun: r.tahun, bulan: r.bulan, bulanNama: r.bulanNama,
    pendapatan: r.pendapatan, perbelanjaan: r.perbelanjaan, untungRugi: r.untungRugi, lewat: !!r.lewat, tarikhAkhirLabel: r.tarikhAkhirLabel }; };
  var cnt = counted_;
  var teratas = sel.filter(cnt).sort(function (a, b) { return b.pendapatan - a.pendapatan; }).slice(0, 5).map(slim);
  var rugi = sel.filter(function (r) { return cnt(r) && r.untungRugi < 0; }).sort(function (a, b) { return a.untungRugi - b.untungRugi; }).slice(0, 5).map(slim);

  var menunggu = all.rows.filter(function (r) { return r.status === 'sent'; });
  var tertunggak = all.rows.filter(function (r) { return r.status === 'none' && r.kesempatanLewat; });
  var perluBaiki = all.rows.filter(function (r) { return r.status === 'fix'; });
  var oldest = function (a, b) { return a.bulan - b.bulan; };
  return {
    tahun: y, bulan: m, lotAktif: all.lotAktif, tanpaTarikh: all.tanpaTarikh,
    counts: counts, jumlahBaris: sel.length, lewat: lewat,
    kadar: { hantar: hantar, dijangka: sel.length, peratus: sel.length ? Math.round(hantar * 100 / sel.length) : null },
    jumlah: { pendapatan: round2_(jum.pendapatan), perbelanjaan: round2_(jum.perbelanjaan), untung: round2_(jum.pendapatan - jum.perbelanjaan), sewa: round2_(jum.sewa), bilLaporan: jum.dikira },
    siri: siri, lokasi: lokasi, peniaga: peniaga, sewaJumlah: sewaJum, teratas: teratas, rugi: rugi,
    tindakan: {
      menunggu: { jumlah: menunggu.length, senarai: menunggu.sort(oldest).slice(0, 8).map(slim) },
      tertunggak: { jumlah: tertunggak.length, senarai: tertunggak.sort(oldest).slice(0, 8).map(slim) },
      perluBaiki: { jumlah: perluBaiki.length, senarai: perluBaiki.sort(oldest).slice(0, 8).map(slim) }
    }
  };
}

function spreadsheetIdFromUrl_(url) {
  var m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(url || ''));
  return m ? m[1] : '';
}

// ============================================================
// Reminders
// ============================================================
/**
 * Peringatan automatik pada 5hb setiap bulan.
 * Trigger harian memanggil dailyReminderJob(); fungsi hanya bertindak jika hari ini ialah REMINDER_DAY.
 * Setiap lot hanya diingatkan sekali bagi satu bulan laporan (rekod dalam sheet Peringatan).
 */

function dailyReminderJob() {
  var today = todayStr_();
  if (Number(today.slice(8, 10)) !== APP.REMINDER_DAY) return 'Bukan hari peringatan';
  return runReminders_(today);
}

/** Boleh dipanggil manual dari editor untuk ujian: runReminders_('2026-10-05'). */
function runReminders_(today) {
  REMINDER_DEADLINES_ = null; LAYOUT_ = {};
  var t = ymFromStr_(today);
  var y = t.m === 1 ? t.y - 1 : t.y, m = t.m === 1 ? 12 : t.m - 1;   // bulan laporan = bulan lepas
  var lots = readTable_(SHEETS.LOTS).filter(function (l) { return l.status === 'Aktif'; });
  var map = reportMap_();
  var done = {}; readTable_(SHEETS.REMINDERS).forEach(function (r) { done[String(r.kunci).split('|').slice(0, 3).join('|')] = true; });
  var sent = 0;

  lots.forEach(function (lot) {
    var ctx = ctxFor_(lot.kodLot, y, m);          // penyewa yang memegang lot pada bulan itu
    if (!ctx || !monthAllowed_(ctx, y, m, today)) return;
    var key = statusKey_(map[reportId_(lot.kodLot, y, m)]);
    if (key === 'sent' || key === 'ok') return;
    var kunci = lot.kodLot + '|' + y + '-' + pad2_(m) + '|' + today;
    if (done[kunci]) return;
    try {
      if (sendReminderMail_(lot.kodLot, y, m) > 0) sent++;
    } catch (e) { logAction_('sistem', 'Ralat peringatan', lot.kodLot + ': ' + e); }
  });
  logAction_('sistem', 'Peringatan automatik', 'Bulan ' + y + '-' + pad2_(m) + ', lot diingatkan: ' + sent);
  return 'Peringatan dihantar: ' + sent;
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyReminderJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminderJob').timeBased().everyDays(1).atHour(APP.REMINDER_HOUR).create();
}

// ============================================================
// Setup
// ============================================================
/**
 * Sediakan sistem. Jalankan setupSystem() SEKALI dari editor Apps Script (Run > setupSystem).
 * Selamat dijalankan semula: sheet sedia ada tidak dipadam.
 */

function setupSystem() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone(APP.TZ);
  PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());
  salt_();

  Object.keys(COLS).forEach(function (name) { ensureSheet_(ss, name); });
  migrateToTenancies_();
  seedLotsIfEmpty_();
  seedDefaultAdmin_();
  rootFolder_();
  installTriggers();
  MailApp.getRemainingDailyQuota();   // meminta kebenaran e-mel semasa setup

  var msg = 'Siap. Admin lalai: ' + APP.DEFAULT_ADMIN +
    '. Seterusnya: isi Tarikh mula sewa dalam sheet Lot, tambah pengguna dalam sheet Pengguna, kemudian Deploy > New deployment > Web app.';
  Logger.log(msg);
  return msg;
}

/**
 * Pastikan sheet dan semua lajur sistem wujud. Tidak menyusun semula atau menimpa lajur sedia ada:
 * lajur yang tiada disisip (Catatan selepas Lewat) atau ditambah di hujung, dan tajuk lama dinamakan semula.
 */
function ensureSheet_(ss, name) {
  LAYOUT_ = {};
  var cols = COLS[name];
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = headerOf_(sh);
  var labels = cols.map(function (c) { return c[1]; });

  if (!head.some(function (h) { return h !== ''; })) {
    sh.getRange(1, 1, 1, labels.length).setValues([labels]);
    head = labels.slice();
  } else {
    var al = ALIASES[name] || {};
    cols.forEach(function (c) {          // tajuk lama dinamakan semula
      var legacy = al[c[1]];
      if (findCol_(head, c[1]) < 0 && legacy && findCol_(head, legacy) >= 0) {
        var j = findCol_(head, legacy);
        sh.getRange(1, j + 1).setValue(c[1]);
        head[j] = c[1];
      }
    });
    cols.forEach(function (c) {          // lajur yang tiada
      if (findCol_(head, c[1]) >= 0) return;
      var after = (INSERT_AFTER[name] || {})[c[0]], anchor = -1;
      if (after) anchor = findCol_(head, cols.filter(function (x) { return x[0] === after; })[0][1]);
      if (anchor >= 0) {
        sh.insertColumnAfter(anchor + 1);
        sh.getRange(1, anchor + 2).setValue(c[1]);
        head.splice(anchor + 1, 0, c[1]);
      } else {
        sh.getRange(1, head.length + 1).setValue(c[1]);
        head.push(c[1]);
      }
    });
  }

  var rows = Math.max(sh.getMaxRows() - 1, 1);
  cols.forEach(function (c) {
    var j = findCol_(head, c[1]);
    sh.getRange(1, j + 1).setFontWeight('bold').setBackground('#f1e5e8');
    var col = sh.getRange(2, j + 1, rows, 1);
    if (c[2] === 't') {
      col.setNumberFormat('@');                                  // teks: elak ditukar kepada tarikh/nombor
    } else if (c[2] === 'd') {
      col.setNumberFormat('dd/mm/yyyy');                         // format tarikh
      col.setDataValidation(SpreadsheetApp.newDataValidation().requireDate()
        .setAllowInvalid(false).setHelpText('Pilih atau taip tarikh yang sah, contoh 01/01/2026').build());
    } else if (c[2] === 'dt') {
      col.setNumberFormat('dd/mm/yyyy hh:mm:ss');                // format tarikh dan masa
    }
  });
  sh.setFrozenRows(1);
  migrateDateColumns_(sh, cols, head);
  LAYOUT_ = {};
  return sh;
}

/** Tukar nilai teks lama 'yyyy-MM-dd' dalam lajur tarikh kepada tarikh sebenar. Selamat dijalankan berulang kali. */
function migrateDateColumns_(sh, cols, head) {
  var last = sh.getLastRow();
  if (last < 2) return;
  cols.forEach(function (c) {
    if (c[2] !== 'd' && c[2] !== 'dt') return;
    var j = findCol_(head, c[1]);
    var rng = sh.getRange(2, j + 1, last - 1, 1);
    var vals = rng.getValues(), changed = false;
    vals.forEach(function (r) {
      var d = toDate_(r[0]);
      if (d !== r[0]) { r[0] = d; changed = true; }
    });
    if (changed) rng.setValues(vals);
  });
}

function seedLotsIfEmpty_() {
  if (readTable_(SHEETS.LOTS).length) return;
  var i;
  for (i = 1; i <= 10; i++) appendObj_(SHEETS.LOTS, { kodLot: lotCode_('Student Mall', i), lokasi: 'Student Mall', noLot: i, status: 'Aktif' });
  for (i = 1; i <= 5; i++) appendObj_(SHEETS.LOTS, { kodLot: lotCode_('SUB', i), lokasi: 'SUB', noLot: i, status: 'Aktif' });
}

/**
 * Naik taraf daripada struktur lama (tarikh sewa pada sheet Lot, pengguna dan peniaga dipautkan kepada kod lot)
 * kepada struktur penyewaan. Selamat dijalankan berulang kali.
 */
function migrateToTenancies_() {
  var lotSh = sheet_(SHEETS.LOTS);
  var last = lotSh.getLastRow();
  var head = headerOf_(lotSh);
  var iM = findCol_(head, 'Tarikh mula sewa'), iA = findCol_(head, 'Tarikh akhir sewa'), iS = findCol_(head, 'Sewa bulanan (RM)');   // lajur lama pada sheet Lot
  var tnCount = readTable_(SHEETS.TENANCIES).length;

  if (iM >= 0 && last >= 2 && tnCount === 0) {
    var map = {};
    var legacy = lotSh.getRange(2, 1, last - 1, head.length).getValues();
    readTable_(SHEETS.LOTS).forEach(function (l) {
      var row = legacy[l._row - 2];
      var mula = cell_(row[iM], 'd'), akhir = iA >= 0 ? cell_(row[iA], 'd') : '', sewa = iS >= 0 ? row[iS] : '';
      if (!isDateStr_(mula)) return;
      var id = nextTenancyId_();
      appendObj_(SHEETS.TENANCIES, { id: id, kodLot: l.kodLot, mula: mula, akhir: isDateStr_(akhir) ? akhir : '', sewa: sewa === '' || sewa === undefined ? '' : Number(sewa) });
      map[l.kodLot] = id;
    });
    if (Object.keys(map).length) {
      readTable_(SHEETS.BIZ).forEach(function (b) { if (map[b.idSewa]) { b.idSewa = map[b.idSewa]; updateObj_(SHEETS.BIZ, b); } });
      readTable_(SHEETS.USERS).forEach(function (u) { if (map[u.idSewa]) { u.idSewa = map[u.idSewa]; updateObj_(SHEETS.USERS, u); } });
      logAction_('sistem', 'Migrasi penyewaan', Object.keys(map).length + ' penyewaan dicipta daripada tarikh sewa pada sheet Lot');
    }
  }
  if (readTable_(SHEETS.TENANCIES).length) {
    [iM, iA, iS].forEach(function (j) { if (j >= 0) lotSh.getRange(1, j + 1, Math.max(last, 1), 1).clearContent(); });   // buang lajur lama yang tidak digunakan lagi
  }
  // laporan lama: isi ID penyewaan mengikut bulan
  readTable_(SHEETS.REPORTS).forEach(function (r) {
    if (r.idSewa) return;
    var tn = tenancyFor_(r.kodLot, Number(r.tahun), Number(r.bulan));
    if (tn) { r.idSewa = tn.id; updateObj_(SHEETS.REPORTS, r); }
  });
}

/** Pastikan admin lalai (APP.DEFAULT_ADMIN) wujud dan aktif. Pengguna lain tidak diubah. */
function seedDefaultAdmin_() {
  var email = normEmail_(APP.DEFAULT_ADMIN);
  var cur = findBy_(readTable_(SHEETS.USERS), 'email', email);
  if (!cur) {
    appendObj_(SHEETS.USERS, { email: email, nama: 'Admin UTMXCITE', peranan: ROLE.ADMIN, idSewa: '', status: 'Aktif' });
  } else if (cur.peranan !== ROLE.ADMIN || cur.status !== 'Aktif') {
    cur.peranan = ROLE.ADMIN; cur.status = 'Aktif'; cur.idSewa = '';
    updateObj_(SHEETS.USERS, cur);
  }
}

// ============================================================
// Api
// ============================================================
/**
 * Titik masuk web app dan penghala API.
 * Pelayar hanya memanggil rpc(); semua kaedah disemak mengikut peranan.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

var ROUTES = {
  requestOtp:    { fn: requestOtp_ },
  verifyOtp:     { fn: verifyOtp_ },
  logout:        { auth: true, fn: logout_ },
  me:            { auth: true, fn: function (u) { return { user: userView_(u) }; } },

  getBusiness:   { auth: true, role: ROLE.TENANT, fn: getBusiness_ },
  saveBusiness:  { auth: true, role: ROLE.TENANT, write: true, fn: saveBusiness_ },
  myReports:     { auth: true, role: ROLE.TENANT, fn: myReports_ },
  getMyReport:   { auth: true, role: ROLE.TENANT, fn: getMyReport_ },
  saveReport:    { auth: true, role: ROLE.TENANT, fn: saveMyReport_ },
  uploadFile:    { auth: true, role: ROLE.TENANT, fn: uploadMyFile_ },
  submitReport:  { auth: true, role: ROLE.TENANT, fn: submitMyReport_ },
  deleteReport:  { auth: true, role: ROLE.TENANT, fn: deleteMyReport_ },
  getFile:       { auth: true, fn: getFile_ },
  myDashboard:   { auth: true, role: ROLE.TENANT, fn: myDashboard_ },
  adminDashboard: { auth: true, role: ROLE.ADMIN, fn: adminDashboard_ },

  adminReports:  { auth: true, role: ROLE.ADMIN, fn: adminReports_ },
  adminReport:   { auth: true, role: ROLE.ADMIN, fn: adminGetReport_ },
  adminReview:   { auth: true, role: ROLE.ADMIN, fn: adminReview_ },
  adminRemind:   { auth: true, role: ROLE.ADMIN, fn: adminRemind_ },
  adminUsers:    { auth: true, role: ROLE.ADMIN, fn: adminUsers_ },
  adminSaveUser: { auth: true, role: ROLE.ADMIN, fn: adminSaveUser_ },
  adminLots:     { auth: true, role: ROLE.ADMIN, fn: adminLots_ },
  adminTenancies:    { auth: true, role: ROLE.ADMIN, fn: adminTenancies_ },
  adminGetBusiness:  { auth: true, role: ROLE.ADMIN, fn: adminGetBusiness_ },
  adminSaveBusiness: { auth: true, role: ROLE.ADMIN, fn: adminSaveBusiness_ },
  adminSaveTenancy:  { auth: true, role: ROLE.ADMIN, fn: adminSaveTenancy_ },
  adminDeleteTenancy: { auth: true, role: ROLE.ADMIN, fn: adminDeleteTenancy_ },
  adminSaveLot:  { auth: true, role: ROLE.ADMIN, fn: adminSaveLot_ },
  adminExport:   { auth: true, role: ROLE.ADMIN, fn: adminExport_ }
};

/** Dipanggil oleh pelayar melalui google.script.run.rpc(method, token, params). */
function rpc(method, token, params) {
  REMINDER_DEADLINES_ = null; LAYOUT_ = {};
  try {
    var r = Object.prototype.hasOwnProperty.call(ROUTES, method) ? ROUTES[method] : null;
    if (!r) fail_('Permintaan tidak dikenali.');
    var user = r.auth ? auth_(token) : null;
    if (r.role && user.peranan !== r.role) fail_('Akses tidak dibenarkan.', 'FORBIDDEN');
    return { ok: true, data: r.fn(user, params || {}, token) };
  } catch (e) {
    if (e && e.user) return { ok: false, error: e.message, code: e.code };
    var ref = Utilities.getUuid().slice(0, 6).toUpperCase();
    var detail = (e && e.message ? e.message : String(e));
    console.error(method + ' [' + ref + ']: ' + (e && e.stack ? e.stack : e));
    try { appendObj_(SHEETS.LOG, { masa: nowStr_(), email: '', tindakan: 'Ralat sistem ' + ref, butiran: method + ': ' + detail }); } catch (x) { /* sheet mungkin belum disediakan */ }
    return { ok: false, error: 'Ralat sistem (rujukan ' + ref + '). Cuba lagi sebentar atau hubungi ' + APP.CONTACT_EMAIL + '.', code: 'SERVER' };
  }
}



/**
 * Semakan diagnostik. Jalankan checkSystem() dari editor, kemudian lihat View > Logs
 * (atau Execution log) untuk mengetahui apa yang belum betul.
 */
function checkSystem() {
  var out = [];
  var step = function (name, fn) {
    try { out.push('OK    ' + name + ': ' + fn()); } catch (e) { out.push('GAGAL ' + name + ': ' + (e && e.message ? e.message : e)); }
  };
  step('Spreadsheet', function () { return ss_().getName(); });
  Object.keys(COLS).forEach(function (n) { step('Sheet ' + n, function () { return readTable_(n).length + ' baris'; }); });
  step('Pengguna aktif (Admin)', function () { return readTable_(SHEETS.USERS).filter(function (u) { return u.peranan === ROLE.ADMIN && u.status === 'Aktif'; }).map(function (u) { return u.email; }).join(', ') || 'TIADA'; });
  step('Kebenaran e-mel (MailApp)', function () { return 'baki kuota harian ' + MailApp.getRemainingDailyQuota(); });
  step('Folder Drive', function () { return rootFolder_().getName(); });
  step('Pautan pangkalan data', function () {
    var want = spreadsheetIdFromUrl_(APP.DATABASE_URL), have = ss_().getId();
    return !want || want === have ? 'sepadan dengan sheet yang digunakan (' + ss_().getName() + ')' : 'TIDAK SEPADAN: sistem menggunakan ' + have + ' tetapi DATABASE_URL menunjuk ke ' + want;
  });
  step('Trigger peringatan', function () { return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'dailyReminderJob'; }).length + ' trigger'; });
  step('URL web app', function () { return appUrl_() || '(belum di-deploy)'; });
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
