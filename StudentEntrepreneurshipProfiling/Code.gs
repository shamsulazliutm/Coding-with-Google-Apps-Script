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
  // Spreadsheet that holds Responses, Students, Admins and Faculties. The account that deploys the
  // web app needs edit access to it. Leave empty to let setup() create a new spreadsheet instead.
  SPREADSHEET_ID: '1kxFT--8ES0YbPw33Onng5ykNnd777hqkXxe1_WKyRZo',
  TZ: 'Asia/Kuala_Lumpur',
  // Logo shown in the header. Empty = use the logo embedded in Logo.html (UTM + UTMXCITE).
  // To use another image, paste a public URL here (e.g. https://drive.google.com/thumbnail?id=FILE_ID&sz=w600).
  LOGO_URL: '',
  STUDENT_EMAIL_DOMAINS: ['graduate.utm.my', 'utm.my'],
  OTP_TTL: 300,            // seconds a code stays valid
  OTP_MAX_ATTEMPTS: 5,     // wrong codes before lockout
  OTP_RESEND_SECONDS: 60,  // minimum gap between code requests
  LOCKOUT_SECONDS: 900,
  IC_MAX_ATTEMPTS: 5,      // wrong IC last-4 guesses per matric before lockout (LOCKOUT_SECONDS)
  SESSION_TTL: 21600,      // 6 hours (CacheService maximum)
  SHEETS: { RESPONSES: 'Responses', ADMINS: 'Admins', FACULTIES: 'Faculties', STUDENTS: 'Students' },
  // Student master list (matric -> profile). Leave SPREADSHEET_ID empty to use the 'Students' sheet
  // in this project's spreadsheet, or paste the ID of another spreadsheet that holds the list.
  STUDENTS: { SPREADSHEET_ID: '', SHEET: 'Students' }
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
  'timestamp', 'refId', 'matric', 'name', 'email', 'phone', 'facultyCode', 'facultyName',
  'program', 'ic', 'hometown', 'profileSource', 'familyBiz', 'familyList', 'familyDuration',
  'ownBiz', 'bizType', 'bizDuration', 'motivation', 'motivationOther',
  'interest', 'interestType', 'campus', 'stream', 'consent'
];

var MSG_MISMATCH = 'No. matrik dan 4 digit akhir No. KP/Pasport tidak sepadan. / Matric number and last 4 digits of IC/passport do not match.';
var MSG_LOCKED = 'Terlalu banyak percubaan salah. Cuba lagi selepas 15 minit. / Too many wrong attempts. Try again in 15 minutes.';
var MSG_DUPLICATE = 'No. matrik ini telah menghantar borang. Hubungi UTMXCITE jika perlu kemas kini. / This matric number has already submitted the form. Contact UTMXCITE if you need to update it.';

var ADMIN_HEADERS = ['Email', 'Name', 'Role', 'FacultyCode', 'Active'];

// Profile fields read from the student master list (hometown is optional and asked on the form).
var PROFILE_FIELDS = ['name', 'email', 'phone', 'facultyCode', 'program', 'ic'];
var STUDENT_HEADERS = ['Matric', 'Name', 'Email', 'Phone', 'FacultyCode', 'Program', 'IC', 'Hometown'];
// Accepted header names in the master sheet (compared lower-case, letters and digits only).
var STUDENT_ALIASES = {
  matric: ['matric', 'matricno', 'matricnumber', 'nomatrik', 'nomatriks', 'matrik'],
  name: ['name', 'nama', 'fullname', 'namapenuh'],
  email: ['email', 'emel', 'emailaddress'],
  phone: ['phone', 'phoneno', 'phonenumber', 'telefon', 'notelefon', 'notel', 'hp'],
  facultyCode: ['facultycode', 'faculty', 'fakulti', 'kodfakulti', 'namafakulti'],
  program: ['program', 'programme', 'academicprogram', 'namaprogram'],
  ic: ['ic', 'icno', 'icpassport', 'nokp', 'nokadpengenalan', 'passport', 'nopasport'],
  hometown: ['hometown', 'kampunghalaman', 'kampung']
};

// Hometown is a state: stored as the Malay name. Aliases let the student list use other spellings.
var STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya', 'Luar Negara'];
var STATE_ALIASES = {
  'MALACCA': 'Melaka', 'PENANG': 'Pulau Pinang', 'P. PINANG': 'Pulau Pinang', 'KUALA LUMPUR': 'W.P. Kuala Lumpur',
  'WP KUALA LUMPUR': 'W.P. Kuala Lumpur', 'WILAYAH PERSEKUTUAN KUALA LUMPUR': 'W.P. Kuala Lumpur', 'KL': 'W.P. Kuala Lumpur',
  'LABUAN': 'W.P. Labuan', 'WP LABUAN': 'W.P. Labuan', 'WILAYAH PERSEKUTUAN LABUAN': 'W.P. Labuan',
  'PUTRAJAYA': 'W.P. Putrajaya', 'WP PUTRAJAYA': 'W.P. Putrajaya', 'WILAYAH PERSEKUTUAN PUTRAJAYA': 'W.P. Putrajaya',
  'N. SEMBILAN': 'Negeri Sembilan', 'OVERSEAS': 'Luar Negara', 'ABROAD': 'Luar Negara'
};

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
  tpl.logoUrl = CONFIG.LOGO_URL || embeddedLogo_();
  return tpl.evaluate()
    .setTitle(CONFIG.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Logo.html holds the logo as a data URI, so no Drive sharing or external host is needed. */
function embeddedLogo_() {
  try {
    return HtmlService.createHtmlOutputFromFile('Logo').getContent().trim();
  } catch (e) {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* One-time setup                                                      */
/* ------------------------------------------------------------------ */

/** Creates the spreadsheet, sheets, faculty list and a first super admin. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss, created = false;
  if (CONFIG.SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  } else if (props.getProperty('SHEET_ID')) {
    ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  } else {
    ss = SpreadsheetApp.create(CONFIG.TITLE);
    props.setProperty('SHEET_ID', ss.getId());
    created = true;
  }
  if (!props.getProperty('OTP_SALT')) props.setProperty('OTP_SALT', Utilities.getUuid());

  // Existing sheets and their data are never cleared or reformatted, except the generated Faculties list.
  var resp = ss.getSheetByName(CONFIG.SHEETS.RESPONSES);
  if (!resp) {
    resp = ss.insertSheet(CONFIG.SHEETS.RESPONSES);
    resp.appendRow(HEADERS);
    // Plain text keeps leading zeros (IC, phone) and stops "=" / "+" being read as formulas.
    resp.getRange(1, 1, resp.getMaxRows(), HEADERS.length).setNumberFormat('@');
    resp.setFrozenRows(1);
  } else if (resp.getLastRow() === 0) {
    resp.appendRow(HEADERS);
    resp.setFrozenRows(1);
  } else {
    var have = resp.getRange(1, 1, 1, Math.max(resp.getLastColumn(), 1)).getValues()[0];
    if (have.join('|') !== HEADERS.slice(0, have.length).join('|') || have.length < HEADERS.length) {
      Logger.log('WARNING: the header row of "' + CONFIG.SHEETS.RESPONSES + '" does not match the expected columns: ' +
        HEADERS.join(', ') + '. Rename or delete that sheet and run setup() again.');
    }
  }

  var fac = getOrCreateSheet_(ss, CONFIG.SHEETS.FACULTIES);
  fac.clear();
  fac.getRange(1, 1, FACULTIES.length + 1, 2).setValues([['Code', 'Name']].concat(FACULTIES));
  fac.setFrozenRows(1);

  var adm = ss.getSheetByName(CONFIG.SHEETS.ADMINS);
  if (!adm) {
    adm = ss.insertSheet(CONFIG.SHEETS.ADMINS);
    adm.appendRow(ADMIN_HEADERS);
    var me = Session.getEffectiveUser().getEmail();
    if (me) adm.appendRow([me, 'Super Admin', 'SUPER', '', 'Yes']);
    adm.setFrozenRows(1);
  }

  var stu = ss.getSheetByName(CONFIG.SHEETS.STUDENTS);
  if (!stu && !CONFIG.STUDENTS.SPREADSHEET_ID) {
    stu = ss.insertSheet(CONFIG.SHEETS.STUDENTS);
    stu.appendRow(STUDENT_HEADERS);
    stu.getRange(1, 1, stu.getMaxRows(), STUDENT_HEADERS.length).setNumberFormat('@');
    stu.setFrozenRows(1);
  }

  var def = ss.getSheetByName('Sheet1');
  if (created && def && ss.getSheets().length > 1) ss.deleteSheet(def);

  Logger.log('Spreadsheet: ' + ss.getUrl());
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getSpreadsheet_() {
  var id = CONFIG.SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SHEET_ID');
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

  // Profile comes from the student master list. The browser only supplies values the list lacks,
  // so it can never overwrite what the university already holds.
  if (p.consent !== 'Yes') throw new Error('Consent is required.');
  a.consent = 'Yes';
  a.matric = cleanMatric_(p.matric);
  if (!a.matric) throw new Error('Invalid matric number.');
  var last4 = normId_(p.icLast4);
  if (last4.length !== 4) throw new Error('Last 4 digits of IC/passport are required.');
  var master = findStudent_(a.matric);
  var denied = verifyIc_(a.matric, master, last4);
  if (denied) throw new Error(denied);
  var manual = p.manual && typeof p.manual === 'object' ? p.manual : {};
  var fromMaster = 0, fromManual = 0;
  PROFILE_FIELDS.forEach(function (k) {
    var v = master ? cleanProfile_(k, master[k]) : '';
    if (v) { a[k] = v; fromMaster++; return; }
    v = cleanProfile_(k, manual[k]);
    if (!v) throw new Error('Missing or invalid: ' + k);
    a[k] = v; fromManual++;
  });
  if (last4Of_(a.ic) !== last4) throw new Error('IC / passport does not end with the 4 digits entered.');
  a.hometown = cleanProfile_('hometown', p.hometown) || (master ? cleanProfile_('hometown', master.hometown) : '');
  a.profileSource = !fromManual ? 'Students sheet' : (fromMaster ? 'Students sheet + manual' : 'Manual');
  a.facultyName = FACULTIES.filter(function (f) { return f[0] === a.facultyCode; })[0][1];

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
    if (alreadySubmitted_(a.matric)) throw new Error(MSG_DUPLICATE);
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
/* Student master list                                                 */
/* ------------------------------------------------------------------ */

/**
 * Looks a matric number up in the master list. Only masked data goes back to the browser;
 * `missing` lists the profile fields the student must fill in manually.
 */
function lookupStudent(matric, icLast4) {
  var m = cleanMatric_(matric);
  if (!m) return { ok: false, message: 'No. matrik tidak sah. / Invalid matric number.' };
  var last4 = normId_(icLast4);
  if (last4.length !== 4) {
    return { ok: false, message: 'Sila masukkan 4 digit akhir No. KP/Pasport. / Please enter the last 4 digits of your IC/passport.' };
  }
  var s = findStudent_(m);
  var denied = verifyIc_(m, s, last4);
  if (denied) return { ok: false, message: denied };
  if (alreadySubmitted_(m)) return { ok: false, duplicate: true, message: MSG_DUPLICATE };

  // Details are shown only once the IC digits matched; a record without a usable IC cannot be verified.
  var verified = !!(s && cleanProfile_('ic', s.ic));
  var missing = [], preview = {};
  PROFILE_FIELDS.forEach(function (k) {
    var v = s ? cleanProfile_(k, s[k]) : '';
    if (!v) { missing.push(k); return; }
    if (!verified) return;
    if (k === 'name') preview.name = maskName_(v);
    else if (k === 'email') preview.email = maskEmail_(v);
    else if (k === 'phone') preview.phone = mask_(v, 3);
    else if (k === 'facultyCode') {
      preview.faculty = v + ' - ' + FACULTIES.filter(function (f) { return f[0] === v; })[0][1];
    } else if (k === 'program') preview.program = v;
  });
  return { ok: true, matric: m, found: !!s, missing: missing, preview: preview };
}

/** Empty string when the entered IC digits are acceptable, else the message to show. */
function verifyIc_(matric, master, last4) {
  var cache = CacheService.getScriptCache(), key = 'icfail_' + matric;
  if (Number(cache.get(key) || 0) >= CONFIG.IC_MAX_ATTEMPTS) return MSG_LOCKED;
  var masterIc = master ? cleanProfile_('ic', master.ic) : '';
  if (!masterIc) return '';                      // not in the list, or no IC on file: nothing to compare
  if (last4Of_(masterIc) === last4) { cache.remove(key); return ''; }
  cache.put(key, String(Number(cache.get(key) || 0) + 1), CONFIG.LOCKOUT_SECONDS);
  return MSG_MISMATCH;
}

function normId_(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
function last4Of_(v) { var s = normId_(v); return s.length >= 4 ? s.slice(-4) : ''; }

/** One submission per matric number. Delete the row in Responses to let a student submit again. */
function alreadySubmitted_(matric) {
  var sh = getSpreadsheet_().getSheetByName(CONFIG.SHEETS.RESPONSES);
  if (!sh || sh.getLastRow() < 2) return false;
  var vals = sh.getRange(2, HEADERS.indexOf('matric') + 1, sh.getLastRow() - 1, 1).getValues();
  return vals.some(function (r) { return String(r[0]).trim().toUpperCase() === matric; });
}

function findStudent_(matric) {
  var ss = CONFIG.STUDENTS.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.STUDENTS.SPREADSHEET_ID) : getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.STUDENTS.SHEET);
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return null;

  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); });
  var col = {};
  Object.keys(STUDENT_ALIASES).forEach(function (k) {
    for (var i = 0; i < STUDENT_ALIASES[k].length; i++) {
      var ix = head.indexOf(STUDENT_ALIASES[k][i]);
      if (ix !== -1) { col[k] = ix; return; }
    }
  });
  if (col.matric == null) return null;

  // Read the matric column first, then only the matching row (the list can be thousands of rows).
  var ids = sh.getRange(2, col.matric + 1, sh.getLastRow() - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (cleanMatric_(ids[r][0]) !== matric) continue;
    var row = sh.getRange(r + 2, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var o = {};
    Object.keys(col).forEach(function (k) { o[k] = row[col[k]]; });
    return o;
  }
  return null;
}

function cleanMatric_(v) {
  v = String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]{6,15}$/.test(v) ? v : '';
}

/** Returns the cleaned value, or '' when it is empty or invalid. */
function cleanProfile_(k, raw) {
  var v = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  switch (k) {
    case 'name': return v && v.length <= 200 ? v.toUpperCase() : '';
    case 'email':
      v = v.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && CONFIG.STUDENT_EMAIL_DOMAINS.indexOf(v.split('@')[1]) !== -1 ? v : '';
    case 'phone': return /^[0-9+\-\s]{7,20}$/.test(v) ? v : '';
    case 'facultyCode':
      var up = v.toUpperCase();
      var f = FACULTIES.filter(function (x) { return x[0] === up || x[1].toUpperCase() === up; })[0];
      return f ? f[0] : '';
    case 'program': return v.length >= 2 && v.length <= 200 ? v : '';
    case 'ic': return /^[A-Za-z0-9\-\s]{5,20}$/.test(v) ? v : '';
    case 'hometown':
      var key = v.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
      var hit = STATES.filter(function (s) { return s.toUpperCase().replace(/\./g, '') === key; })[0];
      return hit || STATE_ALIASES[v.toUpperCase().replace(/\s+/g, ' ')] || STATE_ALIASES[key] || '';
  }
  return '';
}

function maskName_(s) {
  return String(s).split(' ').map(function (w) {
    return w.length <= 2 ? w : w.substring(0, 2) + new Array(Math.min(w.length - 2, 5) + 1).join('*');
  }).join(' ');
}

function maskEmail_(s) {
  var i = s.indexOf('@');
  return s.substring(0, Math.min(2, i)) + '***' + s.substring(i);
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
