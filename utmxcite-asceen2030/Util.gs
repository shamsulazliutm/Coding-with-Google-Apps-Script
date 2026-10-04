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
  return ['id'].concat(kpi.fields.map(function (f) { return f.key; })).concat(SYS_COLS);
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
  var f = DriveApp.createFolder('UTMXCITE ASCEEN2030 - Lampiran');
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
}
