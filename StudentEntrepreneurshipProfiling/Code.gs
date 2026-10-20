/**
 * STUDENT ENTREPRENEURSHIP PROFILING (PROFIL KEUSAHAWANAN PELAJAR)
 * UTMXCITE - Google Apps Script web app
 *
 *   /exec            -> open student form (Index.html)
 *   /exec?page=admin -> admin dashboard (Dashboard.html), email + OTP login
 *
 * Run setup() once from the editor, then deploy as a web app
 * (Execute as: Me, Who has access: Anyone).
 */

var CONFIG = {
  TITLE: 'Student Entrepreneurship Profiling',
  TZ: 'Asia/Kuala_Lumpur',
  // Logo UTM + UTMXCITE: paste a public image URL (e.g. Drive file shared as "Anyone with the link",
  // use https://drive.google.com/thumbnail?id=FILE_ID&sz=w600). Empty = no logo shown.
  LOGO_URL: '',
  STUDENT_EMAIL_DOMAINS: ['graduate.utm.my', 'utm.my'],
  OTP_TTL: 300,            // seconds a code stays valid
  OTP_MAX_ATTEMPTS: 5,     // wrong codes before lockout
  OTP_RESEND_SECONDS: 60,  // minimum gap between code requests
  LOCKOUT_SECONDS: 900,
  SESSION_TTL: 21600,      // 6 hours (CacheService maximum)
  SHEETS: { RESPONSES: 'Responses', ADMINS: 'Admins', FACULTIES: 'Faculties' }
};

var FACULTIES = [
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

// Column keys in Responses sheet order.
var HEADERS = [
  'timestamp', 'refId', 'name', 'email', 'phone', 'facultyCode', 'facultyName',
  'program', 'ic', 'hometown', 'familyBiz', 'familyList', 'familyDuration',
  'ownBiz', 'bizType', 'bizDuration', 'motivation', 'motivationOther',
  'interest', 'interestType', 'campus', 'stream'
];

var ADMIN_HEADERS = ['Email', 'Name', 'Role', 'FacultyCode', 'Active'];

var YES_NO = ['Yes', 'No'];
var BIZ_DURATION = ['0 - 1 year', '1 - 3 years', 'More than 3 years'];
var MOTIVATION = ['Extra pocket money', 'Passionate to learn doing business', 'Encouragement from others'];
var CAMPUS = ['Yes', 'No', 'Maybe'];
var STREAMS = ['Sole proprietor', 'Social entrepreneurship', 'Technology startup', 'High Value GiG'];

/* ------------------------------------------------------------------ */
/* Web app entry                                                       */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var page = e && e.parameter && e.parameter.page === 'admin' ? 'Dashboard' : 'Index';
  var tpl = HtmlService.createTemplateFromFile(page);
  tpl.faculties = FACULTIES.map(function (f) { return { code: f[0], name: f[1] }; });
  tpl.emailDomains = CONFIG.STUDENT_EMAIL_DOMAINS;
  tpl.logoUrl = CONFIG.LOGO_URL;
  return tpl.evaluate()
    .setTitle(CONFIG.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ------------------------------------------------------------------ */
/* One-time setup                                                      */
/* ------------------------------------------------------------------ */

/** Creates the spreadsheet, sheets, faculty list and a first super admin. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var id = props.getProperty('SHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create(CONFIG.TITLE);
    props.setProperty('SHEET_ID', ss.getId());
  }
  if (!props.getProperty('OTP_SALT')) props.setProperty('OTP_SALT', Utilities.getUuid());

  var resp = getOrCreateSheet_(ss, CONFIG.SHEETS.RESPONSES);
  if (resp.getLastRow() === 0) resp.appendRow(HEADERS);
  // Plain text keeps leading zeros (IC, phone) and stops "=" / "+" being read as formulas.
  resp.getRange(1, 1, resp.getMaxRows(), HEADERS.length).setNumberFormat('@');
  resp.setFrozenRows(1);

  var fac = getOrCreateSheet_(ss, CONFIG.SHEETS.FACULTIES);
  fac.clear();
  fac.getRange(1, 1, FACULTIES.length + 1, 2).setValues([['Code', 'Name']].concat(FACULTIES));
  fac.setFrozenRows(1);

  var adm = getOrCreateSheet_(ss, CONFIG.SHEETS.ADMINS);
  if (adm.getLastRow() === 0) {
    adm.appendRow(ADMIN_HEADERS);
    var me = Session.getEffectiveUser().getEmail();
    if (me) adm.appendRow([me, 'Super Admin', 'SUPER', '', 'Yes']);
    adm.appendRow(['pic.fc@utm.my', 'Contoh PIC FC (padam/ubah)', 'PIC', 'FC', 'No']);
  }
  adm.setFrozenRows(1);

  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  Logger.log('Spreadsheet: ' + ss.getUrl());
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id);
}

/* ------------------------------------------------------------------ */
/* Student form                                                        */
/* ------------------------------------------------------------------ */

function submitForm(p) {
  p = p || {};
  if (p.website) return { ok: true, refId: 'SEP-OK' }; // honeypot: bots fill this

  var a = {};
  var str = function (k, max) { return String(p[k] == null ? '' : p[k]).replace(/\s+/g, ' ').trim().substring(0, max || 200); };
  var long = function (k) { return String(p[k] == null ? '' : p[k]).replace(/[ \t]+/g, ' ').trim().substring(0, 2000); };
  var oneOf = function (k, list, required) {
    var v = str(k);
    if (!v && !required) return '';
    if (list.indexOf(v) === -1) throw new Error('Invalid ' + k);
    return v;
  };

  a.name = str('name').toUpperCase();
  a.email = str('email', 120).toLowerCase();
  a.phone = str('phone', 20);
  a.facultyCode = str('facultyCode', 20);
  a.program = str('program');
  a.ic = str('ic', 20);
  a.hometown = str('hometown');

  if (!a.name) throw new Error('Full name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new Error('Invalid email.');
  var domain = a.email.split('@')[1];
  if (CONFIG.STUDENT_EMAIL_DOMAINS.indexOf(domain) === -1) {
    throw new Error('Email must be @graduate.utm.my or @utm.my.');
  }
  if (!/^[0-9+\-\s]{7,20}$/.test(a.phone)) throw new Error('Invalid phone number.');
  var fac = FACULTIES.filter(function (f) { return f[0] === a.facultyCode; })[0];
  if (!fac) throw new Error('Invalid faculty.');
  a.facultyName = fac[1];
  if (!a.program) throw new Error('Program is required.');
  if (!/^[A-Za-z0-9\-\s]{5,20}$/.test(a.ic)) throw new Error('Invalid IC / passport number.');

  // Skip logic mirrors the original form: Q8 No -> Q11, Q11 No -> Q15, Q15 No -> end.
  a.familyBiz = oneOf('familyBiz', YES_NO, true);
  a.familyList = a.familyDuration = '';
  if (a.familyBiz === 'Yes') {
    a.familyList = long('familyList');
    a.familyDuration = long('familyDuration');
  }

  a.ownBiz = oneOf('ownBiz', YES_NO, true);
  a.bizType = a.bizDuration = a.motivation = a.motivationOther = '';
  if (a.ownBiz === 'Yes') {
    a.bizType = str('bizType');
    a.bizDuration = oneOf('bizDuration', BIZ_DURATION, false);
    var m = Array.isArray(p.motivation) ? p.motivation : [];
    a.motivation = m.filter(function (x) { return MOTIVATION.indexOf(x) !== -1; })
      .filter(function (x, i, arr) { return arr.indexOf(x) === i; }).join('; ');
    a.motivationOther = str('motivationOther');
  }

  a.interest = oneOf('interest', YES_NO, true);
  a.interestType = a.campus = a.stream = '';
  if (a.interest === 'Yes') {
    a.interestType = str('interestType');
    if (!a.interestType) throw new Error('Type of business of interest is required.');
    a.campus = oneOf('campus', CAMPUS, true);
    a.stream = oneOf('stream', STREAMS, true);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = new Date();
    a.timestamp = Utilities.formatDate(now, CONFIG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
    a.refId = 'SEP-' + Utilities.formatDate(now, CONFIG.TZ, 'yyyyMMdd') + '-' +
      Utilities.getUuid().substring(0, 5).toUpperCase();
    var sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEETS.RESPONSES);
    var row = HEADERS.map(function (k) { return a[k] == null ? '' : a[k]; });
    var r = sheet.getLastRow() + 1;
    sheet.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, refId: a.refId };
}

/* ------------------------------------------------------------------ */
/* Admin login (email + OTP)                                           */
/* ------------------------------------------------------------------ */

var GENERIC_SENT_ = {
  ok: true,
  message: 'Jika emel berdaftar, kod OTP telah dihantar. / If the email is registered, an OTP has been sent.'
};

function requestOtp(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'Emel tidak sah. / Invalid email.' };
  }
  var cache = CacheService.getScriptCache();
  if (cache.get('otplock_' + email)) {
    return { ok: false, message: 'Terlalu banyak percubaan. Cuba lagi kemudian. / Too many attempts. Try again later.' };
  }
  if (cache.get('otpcool_' + email)) {
    return { ok: false, message: 'Sila tunggu seminit sebelum meminta kod baharu. / Please wait a minute before requesting a new code.' };
  }
  cache.put('otpcool_' + email, '1', CONFIG.OTP_RESEND_SECONDS);

  var admin = findAdmin_(email);
  if (!admin) return GENERIC_SENT_; // do not reveal who is an admin

  var code = randomCode_();
  cache.put('otp_' + email, hash_(code, email), CONFIG.OTP_TTL);
  cache.remove('otpatt_' + email);

  MailApp.sendEmail({
    to: email,
    subject: 'Kod OTP / OTP Code - ' + CONFIG.TITLE,
    body: 'Kod OTP anda / Your OTP code: ' + code + '\n\n' +
      'Sah selama ' + (CONFIG.OTP_TTL / 60) + ' minit. Jangan kongsi kod ini.\n' +
      'Valid for ' + (CONFIG.OTP_TTL / 60) + ' minutes. Do not share this code.\n\n' +
      'UTMXCITE'
  });
  return GENERIC_SENT_;
}

function verifyOtp(email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').trim();
  var fail = { ok: false, message: 'Kod tidak sah atau tamat tempoh. / Invalid or expired code.' };
  if (!/^\d{6}$/.test(code)) return fail;

  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (cache.get('otplock_' + email)) {
      return { ok: false, message: 'Akaun dikunci sementara. / Temporarily locked.' };
    }
    var stored = cache.get('otp_' + email);
    var admin = findAdmin_(email);
    if (!stored || !admin) return fail;

    if (stored !== hash_(code, email)) {
      var n = Number(cache.get('otpatt_' + email) || 0) + 1;
      cache.put('otpatt_' + email, String(n), CONFIG.OTP_TTL);
      if (n >= CONFIG.OTP_MAX_ATTEMPTS) {
        cache.put('otplock_' + email, '1', CONFIG.LOCKOUT_SECONDS);
        cache.remove('otp_' + email);
      }
      return fail;
    }
    cache.remove('otp_' + email);
    cache.remove('otpatt_' + email);

    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    cache.put('sess_' + token, JSON.stringify(admin), CONFIG.SESSION_TTL);
    return { ok: true, token: token };
  } finally {
    lock.releaseLock();
  }
}

function logout(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}

function randomCode_() {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + ':' + Date.now() + ':' + Math.random());
  var n = 0;
  for (var i = 0; i < 4; i++) n = n * 256 + (b[i] & 0xff);
  return ('000000' + (n % 1000000)).slice(-6);
}

function hash_(code, email) {
  var salt = PropertiesService.getScriptProperties().getProperty('OTP_SALT') || '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + email + '|' + code);
  return Utilities.base64Encode(bytes);
}

function findAdmin_(email) {
  var sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEETS.ADMINS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]).trim().toLowerCase() !== email) continue;
    if (String(r[4]).trim().toLowerCase() !== 'yes') return null;
    var role = String(r[2]).trim().toUpperCase();
    var fac = String(r[3]).trim().toUpperCase();
    if (role === 'PIC' && !FACULTIES.some(function (f) { return f[0] === fac; })) return null;
    if (role !== 'PIC' && role !== 'SUPER') return null;
    return { email: email, name: String(r[1]).trim(), role: role, facultyCode: role === 'PIC' ? fac : '' };
  }
  return null;
}

function getSession_(token) {
  var raw = token ? CacheService.getScriptCache().get('sess_' + token) : null;
  if (!raw) throw new Error('AUTH');
  var s = JSON.parse(raw);
  // Re-check the Admins sheet so removed or deactivated admins lose access at once.
  var current = findAdmin_(s.email);
  if (!current) throw new Error('AUTH');
  return current;
}

/* ------------------------------------------------------------------ */
/* Dashboard data (scoped by role)                                     */
/* ------------------------------------------------------------------ */

function getDashboardData(token) {
  var user = getSession_(token);
  var sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEETS.RESPONSES);
  var values = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getDisplayValues()
    : [];

  var isSuper = user.role === 'SUPER';
  var rows = [];
  values.forEach(function (v) {
    var o = {};
    HEADERS.forEach(function (k, i) { o[k] = v[i]; });
    if (!isSuper && o.facultyCode !== user.facultyCode) return; // PIC: own faculty only
    if (!isSuper) {
      o.ic = mask_(o.ic, 4);
      o.phone = mask_(o.phone, 3);
    }
    rows.push(o);
  });

  rows.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });

  var fac = FACULTIES.filter(function (f) { return isSuper || f[0] === user.facultyCode; })
    .map(function (f) { return { code: f[0], name: f[1] }; });
  user.facultyName = isSuper ? 'Semua fakulti / All faculties' : fac[0].name;
  return { user: user, faculties: fac, rows: rows };
}

function mask_(s, keep) {
  s = String(s || '');
  if (s.length <= keep) return s;
  return new Array(s.length - keep + 1).join('*') + s.slice(-keep);
}
