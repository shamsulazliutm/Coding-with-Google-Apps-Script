// ============================================================
// Config
// ============================================================
/**
 * Student Mall & SUB Financial Monthly Report
 * Konfigurasi umum, nama sheet dan susunan lajur.
 *
 * PENTING: jangan ubah susunan lajur dalam sheet. Kod membaca lajur mengikut kedudukan.
 */

var APP = {
  NAME: 'Laporan Kewangan Bulanan Penyewa',
  SENDER: 'UTMXCITE',
  CONTACT_EMAIL: 'utmxcite@utm.my',
  TZ: 'Asia/Kuala_Lumpur',
  DUE_DAY: 7,              // tarikh akhir hantar: hari ke-7 bulan berikutnya
  REMINDER_DAY: 5,         // peringatan automatik pada 5hb setiap bulan
  REMINDER_HOUR: 9,        // trigger harian dijalankan sekitar jam 9 pagi
  OTP_TTL: 300,            // OTP sah 5 minit
  OTP_MAX_TRIES: 5,
  OTP_RESEND_WAIT: 60,     // minta OTP baharu paling cepat 1 minit
  SESSION_TTL: 7200,       // sesi 2 jam (dilanjutkan setiap tindakan)
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  ROOT_FOLDER_NAME: 'Laporan Kewangan Penyewa'
};

var SHEETS = {
  USERS: 'Pengguna',
  LOTS: 'Lot',
  BIZ: 'Peniaga',
  REPORTS: 'Laporan',
  LOG: 'Log',
  REMINDERS: 'Peringatan'
};

var ROLE = { ADMIN: 'Admin', TENANT: 'Penyewa' };
var STATUS = { DRAFT: 'Draf', SENT: 'Dihantar', FIX: 'Perlu dibetulkan', OK: 'Disahkan' };

var MONTHS_MS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** [kunci, tajuk lajur, jenis]  jenis: t = teks (tidak ditukar ke tarikh), n = nombor */
var COLS = {};
COLS[SHEETS.USERS] = [
  ['email', 'E-mel', 't'], ['nama', 'Nama', 't'], ['peranan', 'Peranan', 't'], ['kodLot', 'Kod lot', 't'], ['status', 'Status', 't']
];
COLS[SHEETS.LOTS] = [
  ['kodLot', 'Kod lot', 't'], ['lokasi', 'Lokasi', 't'], ['noLot', 'No lot', 'n'], ['status', 'Status', 't'],
  ['mula', 'Tarikh mula sewa', 't'], ['akhir', 'Tarikh akhir sewa', 't'], ['sewa', 'Sewa bulanan (RM)', 'n']
];
COLS[SHEETS.BIZ] = [
  ['kodLot', 'Kod lot', 't'], ['nama', 'Nama perniagaan', 't'], ['jenis', 'Jenis perniagaan', 't'], ['ssm', 'No SSM', 't'],
  ['pelajar', 'Nama pelajar', 't'], ['kp', 'No KP', 't'], ['matrik', 'No matrik', 't'], ['fakulti', 'Fakulti', 't'],
  ['telefon', 'No telefon', 't'], ['dikemaskini', 'Dikemas kini', 't']
];
COLS[SHEETS.REPORTS] = [
  ['id', 'ID', 't'], ['kodLot', 'Kod lot', 't'], ['tahun', 'Tahun', 'n'], ['bulan', 'Bulan', 'n'],
  ['pendapatan', 'Pendapatan (RM)', 'n'], ['perbelanjaan', 'Perbelanjaan (RM)', 'n'], ['sewa', 'Bayaran sewa (RM)', 'n'],
  ['sewaPeralatan', 'Sewa peralatan', 't'], ['fLaporan', 'Fail laporan', 't'], ['fSewa', 'Fail resit sewa', 't'],
  ['fIncubator', 'Fail resit incubator', 't'], ['status', 'Status', 't'], ['lewat', 'Lewat', 't'], ['komen', 'Komen admin', 't'],
  ['disemakOleh', 'Disemak oleh', 't'], ['tarikhSemak', 'Tarikh disemak', 't'], ['tarikhHantar', 'Tarikh hantar', 't'],
  ['akuan', 'Akuan', 't'], ['dikemaskini', 'Dikemas kini', 't']
];
COLS[SHEETS.LOG] = [
  ['masa', 'Masa', 't'], ['email', 'E-mel', 't'], ['tindakan', 'Tindakan', 't'], ['butiran', 'Butiran', 't']
];
COLS[SHEETS.REMINDERS] = [
  ['kunci', 'Kunci', 't'], ['masa', 'Masa', 't']
];

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

/** Sel tarikh daripada sheet (Date) -> yyyy-MM-dd. Nilai lain dikembalikan sebagai teks. */
function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
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
function readTable_(name) {
  var cols = COLS[name];
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var empty = true;
    var o = { _row: i + 2 };
    for (var j = 0; j < cols.length; j++) {
      var v = cell_(vals[i][j]);
      if (v !== '' && v !== null) empty = false;
      o[cols[j][0]] = v;
    }
    if (!empty) out.push(o);
  }
  return out;
}

function toRow_(name, obj) {
  return COLS[name].map(function (c) { var v = obj[c[0]]; return v === undefined || v === null ? '' : v; });
}

function appendObj_(name, obj) {
  sheet_(name).appendRow(toRow_(name, obj));
}

function updateObj_(name, obj) {
  if (!obj._row) throw new Error('updateObj_ memerlukan _row');
  sheet_(name).getRange(obj._row, 1, 1, COLS[name].length).setValues([toRow_(name, obj)]);
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
  return { email: u.email, nama: u.nama, peranan: u.peranan, kodLot: u.kodLot || '' };
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
    sendOtpMail_(email, u.nama, code);
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

function sendMail_(to, subject, bodyHtml) {
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:520px">' + bodyHtml +
    '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">' +
    '<p style="font-size:12px;color:#777">UTMXCITE, Jabatan Hal Ehwal Pelajar dan Alumni, UTM. ' + APP.CONTACT_EMAIL + '</p></div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: APP.SENDER });
}

function sendOtpMail_(email, nama, code) {
  sendMail_(email, 'Kod OTP anda: ' + code,
    '<p>Salam ' + escHtml_(nama) + ',</p>' +
    '<p>Kod OTP untuk log masuk ke sistem laporan kewangan:</p>' +
    '<p style="font-size:28px;letter-spacing:6px;font-weight:bold;margin:12px 0">' + code + '</p>' +
    '<p>Kod ini sah selama ' + Math.round(APP.OTP_TTL / 60) + ' minit dan hanya boleh digunakan sekali. Jangan kongsi kod ini dengan sesiapa.</p>');
}

function tenantEmailsForLot_(kodLot) {
  return readTable_(SHEETS.USERS)
    .filter(function (u) { return u.kodLot === kodLot && u.peranan === ROLE.TENANT && u.status === 'Aktif'; })
    .map(function (u) { return u.email; });
}

function sendReminderMail_(kodLot, y, m) {
  var to = tenantEmailsForLot_(kodLot);
  if (!to.length) return 0;
  var url = appUrl_();
  to.forEach(function (email) {
    sendMail_(email, 'Peringatan: Laporan kewangan ' + MONTHS_MS[m - 1] + ' ' + y,
      '<p>Salam,</p>' +
      '<p>Laporan kewangan bulan <b>' + MONTHS_MS[m - 1] + ' ' + y + '</b> untuk <b>' + escHtml_(kodLot) + '</b> belum dihantar.</p>' +
      '<p>Sila hantar sebelum atau pada <b>' + dueLabel_(y, m) + '</b>. Laporan selepas tarikh ini ditanda lewat.</p>' +
      (url ? '<p><a href="' + url + '">Buka sistem</a></p>' : ''));
  });
  return to.length;
}

function sendReviewMail_(kodLot, y, m, decision, komen, by) {
  var to = tenantEmailsForLot_(kodLot);
  var ok = decision === 'ok';
  to.forEach(function (email) {
    sendMail_(email, (ok ? 'Laporan disahkan: ' : 'Pembetulan diminta: ') + MONTHS_MS[m - 1] + ' ' + y,
      '<p>Salam,</p>' +
      '<p>Laporan kewangan <b>' + MONTHS_MS[m - 1] + ' ' + y + '</b> (' + escHtml_(kodLot) + ') ' + (ok ? 'telah <b>disahkan</b>.' : '<b>perlu dibetulkan</b>.') + '</p>' +
      (komen ? '<p style="background:#f6f6f6;padding:10px;border-radius:6px"><b>Komen admin:</b><br>' + escHtml_(komen).replace(/\n/g, '<br>') + '</p>' : '') +
      (ok ? '' : '<p>Sila kemas kini laporan dan hantar semula melalui sistem.</p>') +
      '<p style="font-size:12px;color:#777">Disemak oleh ' + escHtml_(by) + '</p>');
  });
}

// ============================================================
// Business
// ============================================================
/** Maklumat peniaga (tab 1 untuk penyewa). */

function lotOfUser_(user) {
  if (user.peranan !== ROLE.TENANT) fail_('Akses tidak dibenarkan.');
  var lot = findBy_(readTable_(SHEETS.LOTS), 'kodLot', user.kodLot);
  if (!lot) fail_('Lot anda belum didaftarkan. Hubungi ' + APP.CONTACT_EMAIL + '.');
  return lot;
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
    kp: mask ? maskKp_(b.kp) : (b.kp || ''), matrik: b.matrik || '', fakulti: b.fakulti || '', telefon: b.telefon || ''
  };
}

function getBusiness_(user) {
  var lot = lotOfUser_(user);
  var biz = findBy_(readTable_(SHEETS.BIZ), 'kodLot', lot.kodLot);
  return { lot: lotView_(lot), email: user.email, peranan: user.peranan, biz: bizView_(biz, false), lengkap: !!(biz && biz.nama) };
}

function saveBusiness_(user, p) {
  var lot = lotOfUser_(user);
  var f = p.biz || {};
  var req = [['nama', 'Nama perniagaan'], ['jenis', 'Jenis perniagaan'], ['pelajar', 'Nama pelajar'], ['kp', 'No. KP'],
             ['matrik', 'No. matrik'], ['fakulti', 'Fakulti'], ['telefon', 'No. telefon']];
  for (var i = 0; i < req.length; i++) {
    if (!String(f[req[i][0]] || '').trim()) fail_(req[i][1] + ' wajib diisi.');
  }
  var kp = normKp_(f.kp);
  if (!kp) fail_('No. KP mesti 12 digit, contoh 010203-01-1234.');
  var tel = String(f.telefon).replace(/[^\d+\- ]/g, '').trim();
  if (tel.replace(/\D/g, '').length < 9) fail_('No. telefon tidak sah.');

  return withLock_(function () {
    var cur = findBy_(readTable_(SHEETS.BIZ), 'kodLot', lot.kodLot) || { kodLot: lot.kodLot };
    cur.nama = String(f.nama).trim().slice(0, 120);
    cur.jenis = String(f.jenis).trim().slice(0, 80);
    cur.ssm = String(f.ssm || '').trim().slice(0, 40);
    cur.pelajar = String(f.pelajar).trim().toUpperCase().slice(0, 120);
    cur.kp = kp;
    cur.matrik = String(f.matrik).trim().toUpperCase().slice(0, 20);
    cur.fakulti = String(f.fakulti).trim().toUpperCase().slice(0, 40);
    cur.telefon = tel;
    cur.dikemaskini = nowStr_();
    if (cur._row) updateObj_(SHEETS.BIZ, cur); else appendObj_(SHEETS.BIZ, cur);
    logAction_(user.email, 'Kemas kini maklumat peniaga', lot.kodLot);
    return getBusiness_(user);
  });
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
  var due = dueDate_(y, m);
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
    komen: rep ? rep.komen || '' : '',
    disemakOleh: rep ? rep.disemakOleh || '' : '',
    tarikhSemak: rep ? rep.tarikhSemak || '' : '',
    tarikhHantar: rep ? rep.tarikhHantar || '' : '',
    tarikhAkhir: due, tarikhAkhirLabel: dueLabel_(y, m),
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
  var biz = findBy_(readTable_(SHEETS.BIZ), 'kodLot', lot.kodLot);
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
  rep = { id: id, kodLot: lot.kodLot, tahun: y, bulan: m, status: STATUS.DRAFT, dikemaskini: nowStr_() };
  appendObj_(SHEETS.REPORTS, rep);
  return findBy_(readTable_(SHEETS.REPORTS), 'id', id);
}

function checkEditable_(lot, y, m, rep) {
  if (!monthAllowed_(lot, y, m, todayStr_())) fail_('Bulan ini tidak dalam tempoh sewa anda.');
  if (rep && rep.status === STATUS.OK) fail_('Laporan yang telah disahkan tidak boleh diubah.');
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
  return withLock_(function () {
    var existing = findBy_(readTable_(SHEETS.REPORTS), 'id', reportId_(lot.kodLot, y, m));
    checkEditable_(lot, y, m, existing);
    var rep = existing || ensureReport_(lot, y, m);
    rep.pendapatan = pendapatan;
    rep.perbelanjaan = perbelanjaan;
    rep.sewa = sewa;
    rep.sewaPeralatan = d.sewaPeralatan === true ? 'Ya' : d.sewaPeralatan === false ? 'Tidak' : '';
    rep.akuan = d.akuan === true ? 'Ya' : '';
    rep.dikemaskini = nowStr_();
    updateObj_(SHEETS.REPORTS, rep);
    logAction_(user.email, 'Simpan laporan', rep.id);
    return reportView_(rep, lot, y, m);
  });
}

function rootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* cipta semula */ } }
  var f = DriveApp.createFolder(APP.ROOT_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('ROOT_FOLDER_ID', f.getId());
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
    var biz = findBy_(readTable_(SHEETS.BIZ), 'kodLot', lot.kodLot);

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
    if (!rep.tarikhHantar) rep.lewat = todayStr_() > dueDate_(y, m) ? 'Ya' : '';
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
  var kodLot = user.peranan === ROLE.ADMIN ? String(p.kodLot || '') : user.kodLot;
  var spec = FILE_KINDS[String(p.kind)];
  if (!spec) fail_('Jenis fail tidak sah.');
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

function adminReports_(user, p) {
  var today = todayStr_();
  var t = ymFromStr_(today);
  var y = Number(p.tahun) || t.y, m = Number(p.bulan) || t.m;
  var lots = readTable_(SHEETS.LOTS).filter(function (l) { return l.status === 'Aktif'; });
  var bizMap = {}; readTable_(SHEETS.BIZ).forEach(function (b) { bizMap[b.kodLot] = b; });
  var map = reportMap_();
  var counts = { ok: 0, sent: 0, fix: 0, none: 0 }, rows = [];

  lots.forEach(function (lot) {
    if (!monthAllowed_(lot, y, m, today)) return;
    var v = reportView_(map[reportId_(lot.kodLot, y, m)], lot, y, m);
    var b = bizMap[lot.kodLot] || {};
    v.lotNama = lot.lokasi + ' · Lot ' + lot.noLot;
    v.lokasi = lot.lokasi;
    v.perniagaan = b.nama || '';
    v.pelajar = b.pelajar || '';
    v.untungRugi = v.pendapatan === null || v.perbelanjaan === null ? null : round2_(v.pendapatan - v.perbelanjaan);
    counts[v.status]++;
    rows.push(v);
  });
  var lotAktif = lots.length;
  return { tahun: y, bulan: m, counts: counts, lotAktif: lotAktif, jumlahLot: rows.length, rows: rows, lokasiList: uniq_(lots.map(function (l) { return l.lokasi; })) };
}

function uniq_(arr) { var s = {}; return arr.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

function adminGetReport_(user, p) {
  var lot = findBy_(readTable_(SHEETS.LOTS), 'kodLot', String(p.kodLot));
  if (!lot) fail_('Lot tidak dijumpai.');
  var y = Number(p.tahun), m = Number(p.bulan);
  var v = reportView_(reportMap_()[reportId_(lot.kodLot, y, m)], lot, y, m);
  var b = findBy_(readTable_(SHEETS.BIZ), 'kodLot', lot.kodLot);
  v.lot = lotView_(lot);
  v.biz = bizView_(b, true);
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

/* ---------- Pengguna ---------- */

function adminUsers_() {
  return { users: readTable_(SHEETS.USERS).map(function (u) { return { email: u.email, nama: u.nama, peranan: u.peranan, kodLot: u.kodLot || '', status: u.status }; }) };
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
  var kodLot = peranan === ROLE.TENANT ? String(d.kodLot || '') : '';
  if (peranan === ROLE.TENANT) {
    if (!findBy_(readTable_(SHEETS.LOTS), 'kodLot', kodLot)) fail_('Pilih lot yang sah untuk penyewa.');
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
    rec.nama = nama; rec.peranan = peranan; rec.kodLot = kodLot; rec.status = status;
    if (cur) updateObj_(SHEETS.USERS, rec); else appendObj_(SHEETS.USERS, rec);
    logAction_(user.email, cur ? 'Kemas kini pengguna' : 'Tambah pengguna', email + ' / ' + peranan + ' / ' + status);
    return adminUsers_();
  });
}

/* ---------- Lot ---------- */

function adminLots_() {
  return { lots: readTable_(SHEETS.LOTS).map(function (l) { var v = lotView_(l); return v; }) };
}

function adminSaveLot_(user, p) {
  var d = p.lot || {};
  var lokasi = String(d.lokasi || '').trim();
  var noLot = Number(d.noLot);
  if (!lokasi) fail_('Lokasi wajib diisi.');
  if (!isFinite(noLot) || noLot < 1 || noLot !== Math.floor(noLot)) fail_('No. lot mesti nombor bulat 1 atau lebih.');
  var mula = String(d.mula || ''), akhir = String(d.akhir || '');
  if (mula && !isDateStr_(mula)) fail_('Tarikh mula sewa tidak sah.');
  if (akhir && !isDateStr_(akhir)) fail_('Tarikh akhir sewa tidak sah.');
  if (mula && akhir && akhir < mula) fail_('Tarikh akhir sewa mesti selepas tarikh mula.');
  var sewa = toNum_(d.sewa);
  if (sewa !== null && (isNaN(sewa) || sewa < 0)) fail_('Sewa bulanan tidak sah.');
  var status = d.status === 'Tidak aktif' ? 'Tidak aktif' : 'Aktif';
  var kod = lotCode_(lokasi, noLot);

  return withLock_(function () {
    var lots = readTable_(SHEETS.LOTS);
    var cur = findBy_(lots, 'kodLot', kod);
    if (!cur && p.isNew !== true) fail_('Lot tidak dijumpai.');
    if (cur && p.isNew === true) fail_('Lot ' + lokasi + ' ' + noLot + ' sudah wujud.');
    var rec = cur || { kodLot: kod };
    rec.lokasi = cur ? cur.lokasi : lokasi;
    rec.noLot = noLot; rec.status = status; rec.mula = mula; rec.akhir = akhir; rec.sewa = sewa === null ? '' : sewa;
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
              'Bayaran sewa (RM)', 'Sewa peralatan', 'Status', 'Lewat', 'Tarikh hantar', 'Disemak oleh'];
  var lines = [head.map(csvCell_).join(',')];
  data.rows.forEach(function (r) {
    lines.push([r.lotNama, r.lokasi, r.perniagaan, r.pelajar, r.tahun, MONTHS_MS[r.bulan - 1], r.pendapatan, r.perbelanjaan, r.untungRugi,
      r.sewa, r.sewaPeralatan === null ? '' : (r.sewaPeralatan ? 'Ya' : 'Tidak'),
      ({ ok: 'Disahkan', sent: 'Dihantar', fix: 'Perlu dibetulkan', none: 'Belum dihantar' })[r.status], r.lewat ? 'Ya' : '', r.tarikhHantar, r.disemakOleh].map(csvCell_).join(','));
  });
  logAction_(user.email, 'Eksport CSV', data.tahun + '-' + pad2_(data.bulan));
  return { name: 'Laporan_' + data.tahun + '-' + pad2_(data.bulan) + '.csv', csv: '﻿' + lines.join('\r\n') };
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
  var t = ymFromStr_(today);
  var y = t.m === 1 ? t.y - 1 : t.y, m = t.m === 1 ? 12 : t.m - 1;   // bulan laporan = bulan lepas
  var lots = readTable_(SHEETS.LOTS).filter(function (l) { return l.status === 'Aktif'; });
  var map = reportMap_();
  var done = {}; readTable_(SHEETS.REMINDERS).forEach(function (r) { done[r.kunci] = true; });
  var sent = 0;

  lots.forEach(function (lot) {
    if (!monthAllowed_(lot, y, m, today)) return;
    var key = statusKey_(map[reportId_(lot.kodLot, y, m)]);
    if (key === 'sent' || key === 'ok') return;
    var kunci = lot.kodLot + '|' + y + '-' + pad2_(m) + '|' + today;
    if (done[kunci]) return;
    try {
      if (sendReminderMail_(lot.kodLot, y, m) > 0) {
        appendObj_(SHEETS.REMINDERS, { kunci: kunci, masa: nowStr_() });
        sent++;
      }
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
  seedLotsIfEmpty_();
  seedFirstAdminIfEmpty_();
  rootFolder_();
  installTriggers();

  var admin = readTable_(SHEETS.USERS)[0];
  var msg = 'Siap. Admin pertama: ' + (admin ? admin.email : '(tiada)') +
    '. Seterusnya: isi Tarikh mula sewa dalam sheet Lot, tambah pengguna dalam sheet Pengguna, kemudian Deploy > New deployment > Web app.';
  Logger.log(msg);
  return msg;
}

function ensureSheet_(ss, name) {
  var cols = COLS[name];
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = cols.map(function (c) { return c[1]; });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f1e5e8');
  sh.setFrozenRows(1);
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  cols.forEach(function (c, i) {
    if (c[2] === 't') sh.getRange(2, i + 1, rows, 1).setNumberFormat('@');   // teks: elak tarikh ditukar automatik
  });
  return sh;
}

function seedLotsIfEmpty_() {
  if (readTable_(SHEETS.LOTS).length) return;
  var i;
  for (i = 1; i <= 10; i++) appendObj_(SHEETS.LOTS, { kodLot: lotCode_('Student Mall', i), lokasi: 'Student Mall', noLot: i, status: 'Aktif', mula: '', akhir: '', sewa: '' });
  for (i = 1; i <= 5; i++) appendObj_(SHEETS.LOTS, { kodLot: lotCode_('SUB', i), lokasi: 'SUB', noLot: i, status: 'Aktif', mula: '', akhir: '', sewa: '' });
}

function seedFirstAdminIfEmpty_() {
  if (readTable_(SHEETS.USERS).length) return;
  var email = normEmail_(Session.getEffectiveUser().getEmail());
  if (email) appendObj_(SHEETS.USERS, { email: email, nama: 'Admin UTMXCITE', peranan: ROLE.ADMIN, kodLot: '', status: 'Aktif' });
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

  adminReports:  { auth: true, role: ROLE.ADMIN, fn: adminReports_ },
  adminReport:   { auth: true, role: ROLE.ADMIN, fn: adminGetReport_ },
  adminReview:   { auth: true, role: ROLE.ADMIN, fn: adminReview_ },
  adminRemind:   { auth: true, role: ROLE.ADMIN, fn: adminRemind_ },
  adminUsers:    { auth: true, role: ROLE.ADMIN, fn: adminUsers_ },
  adminSaveUser: { auth: true, role: ROLE.ADMIN, fn: adminSaveUser_ },
  adminLots:     { auth: true, role: ROLE.ADMIN, fn: adminLots_ },
  adminSaveLot:  { auth: true, role: ROLE.ADMIN, fn: adminSaveLot_ },
  adminExport:   { auth: true, role: ROLE.ADMIN, fn: adminExport_ }
};

/** Dipanggil oleh pelayar melalui google.script.run.rpc(method, token, params). */
function rpc(method, token, params) {
  try {
    var r = Object.prototype.hasOwnProperty.call(ROUTES, method) ? ROUTES[method] : null;
    if (!r) fail_('Permintaan tidak dikenali.');
    var user = r.auth ? auth_(token) : null;
    if (r.role && user.peranan !== r.role) fail_('Akses tidak dibenarkan.', 'FORBIDDEN');
    return { ok: true, data: r.fn(user, params || {}, token) };
  } catch (e) {
    if (e && e.user) return { ok: false, error: e.message, code: e.code };
    console.error(method + ': ' + (e && e.stack ? e.stack : e));
    return { ok: false, error: 'Ralat sistem. Cuba lagi sebentar.', code: 'SERVER' };
  }
}

