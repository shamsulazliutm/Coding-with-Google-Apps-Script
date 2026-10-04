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
    if (existing && existing.peranan === ROLES.ADMIN && (role !== ROLES.ADMIN || aktif !== 'Ya')) {
      var otherAdmins = table.rows.filter(function (r) { return r.peranan === ROLES.ADMIN && String(r.aktif) === 'Ya' && normEmail_(r.emel) !== email; });
      if (!otherAdmins.length) throw userError_('Mesti ada sekurang-kurangnya seorang Admin aktif.');
    }
    var row = [email, nama, role, fakulti, akses.join(','), aktif, existing ? existing.dicipta_pada : nowIso_()];
    var sh = getSheet_(SHEETS.USERS);
    if (existing) sh.getRange(existing._row, 1, 1, USER_COLS.length).setValues([row]); else sh.appendRow(row);
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
  if (kpi.jenis === 'kemajuan' && sasaran > 100) throw userError_('Sasaran kemajuan tidak boleh melebihi 100%.');
  var q = [numOrBlank(input.q1, 'Q1'), numOrBlank(input.q2, 'Q2'), numOrBlank(input.q3, 'Q3'), numOrBlank(input.q4, 'Q4')];
  var row = [kpi.id, year, sasaran, q[0], q[1], q[2], q[3], kpi.jenis, numOrBlank(input.bajet_rm, 'bajet'), sanitizeText_(String(input.catatan || '').slice(0, 500))];

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = readTable_(SHEETS.TARGETS, { tahun: 'number' });
    var existing = null;
    table.rows.forEach(function (r) { if (r.kpi === kpi.id && r.tahun === year) existing = r; });
    var sh = getSheet_(SHEETS.TARGETS);
    if (existing) sh.getRange(existing._row, 1, 1, TARGET_COLS.length).setValues([row]); else sh.appendRow(row);
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
