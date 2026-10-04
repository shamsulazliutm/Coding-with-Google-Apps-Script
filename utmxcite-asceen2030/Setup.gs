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
    if (!ss) ss = SpreadsheetApp.create('Laporan ASCEEN 2030 - UTMXCITE');
    setProp_('SHEET_ID', ss.getId());
  }
  getSalt_();

  ensureSheet_(ss, SHEETS.USERS, USER_COLS, []);
  ensureSheet_(ss, SHEETS.FACULTIES, FACULTY_COLS, []);
  ensureSheet_(ss, SHEETS.TARGETS, TARGET_COLS, []);
  ensureSheet_(ss, SHEETS.RISKS, RISK_COLS, []);
  ensureSheet_(ss, SHEETS.AUDIT, AUDIT_COLS, []);
  KPIS.forEach(function (kpi) {
    ensureSheet_(ss, kpi.sheet, kpiColumns_(kpi), kpi.fields.concat([{ key: 'id', type: 'text' }].concat(SYS_COLS.map(function (k) { return { key: k, type: 'text' }; }))));
  });

  listValidation_(ss.getSheetByName(SHEETS.USERS), 'peranan', [ROLES.ADMIN, ROLES.PIC]);
  listValidation_(ss.getSheetByName(SHEETS.USERS), 'aktif', YES_NO);

  seedIfEmpty_(ss, SHEETS.FACULTIES, FACULTY_SEED);
  seedIfEmpty_(ss, SHEETS.TARGETS, buildTargetSeed_());
  addMissingTargetRows_(ss);
  seedIfEmpty_(ss, SHEETS.RISKS, RISK_SEED.map(function (r) { return [r[0], r[1], r[2], r[3], 'Terbuka', nowIso_()]; }));
  seedAdmin_(ss);
  seedMilestones_(ss);

  var first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) { try { ss.deleteSheet(first); } catch (e) { /* abaikan */ } }

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
  var textTypes = { text: 1, textarea: 1, email: 1, url: 1, select: 1, faculty: 1, yesno: 1, date: 1, month: 1 };
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

function seedIfEmpty_(ss, name, rows) {
  var sh = ss.getSheetByName(name);
  if (sh.getLastRow() > 1 || !rows.length) return;
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * Pemasangan sedia ada: tambah baris sasaran bagi KPI yang BELUM langsung ada dalam tab Sasaran (contoh CKAI yang baru ditambah).
 * KPI yang sudah ada tidak disentuh, jadi baris yang anda padam atau ubah tidak dihidupkan semula.
 */
function addMissingTargetRows_(ss) {
  var sh = ss.getSheetByName(SHEETS.TARGETS);
  if (sh.getLastRow() < 2) return;
  var present = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { present[String(r[0])] = true; });
  var add = buildTargetSeed_().filter(function (r) { return !present[r[0]]; });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
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
  sh.appendRow([email, 'Pentadbir UTMXCITE', ROLES.ADMIN, 'UTMXCITE', '', 'Ya', nowIso_()]);
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
      sh.appendRow(rowArray_(cols, o));
    });
  });
}
