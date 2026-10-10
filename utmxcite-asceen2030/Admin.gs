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
    var specs = [[SHEETS.USERS, USER_COLS], [SHEETS.FACULTIES, FACULTY_COLS], [SHEETS.TARGETS, TARGET_COLS], [SHEETS.RISKS, RISK_COLS], [SHEETS.AUDIT, AUDIT_COLS], [SHEETS.STUDENTS, STUDENT_COLS]]
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
