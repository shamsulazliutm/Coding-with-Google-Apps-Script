/** Operasi rekod KPI: senarai, simpan (tambah/kemas kini), padam. Semua semakan akses dibuat di sini (pelayan). */

function kpiSchema_(kpi) {
  return {
    id: kpi.id, title: kpi.title, short: kpi.short, group: kpi.group, level: kpi.level, stage: kpi.stage || null, unit: kpi.unit, entry: kpi.entry,
    listColumns: kpi.listColumns, statusField: kpi.statusField, filter2: kpi.filter2 || null, facultyWhitelist: kpi.facultyWhitelist || null,
    fields: kpi.fields
  };
}

function sessionInfo_(token) {
  var user = requireUser_(token);
  return {
    user: publicUser_(user),
    faculties: listFaculties_(),
    levels: LEVELS,
    stages: CKAI_STAGES,
    kpis: accessibleKpis_(user).map(kpiSchema_)
  };
}

function stripRow_(r) {
  var o = {};
  for (var k in r) { if (r.hasOwnProperty(k) && k !== '_row') o[k] = r[k]; }
  return o;
}

function listRecords_(token, kpiId, filters) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  filters = filters || {};
  var rows = readTable_(kpi.sheet, typesFor_(kpi)).rows;

  if (user.peranan !== ROLES.ADMIN && kpi.entry === 'faculty') {
    rows = rows.filter(function (r) { return r.fakulti === user.fakulti; });
  }
  if (filters.fakulti && kpi.entry === 'faculty') rows = rows.filter(function (r) { return r.fakulti === String(filters.fakulti); });
  if (filters.status && kpi.statusField) rows = rows.filter(function (r) { return r[kpi.statusField] === String(filters.status); });
  if (filters.status2 && kpi.filter2) rows = rows.filter(function (r) { return r[kpi.filter2] === String(filters.status2); });
  if (filters.q) {
    var q = String(filters.q).toLowerCase();
    rows = rows.filter(function (r) {
      for (var k in r) { if (k !== '_row' && String(r[k]).toLowerCase().indexOf(q) >= 0) return true; }
      return false;
    });
  }
  rows.sort(function (a, b) { return String(b.dikemas_kini_pada).localeCompare(String(a.dikemas_kini_pada)); });
  return { rows: rows.map(stripRow_), canEdit: true, canDelete: user.peranan === ROLES.ADMIN };
}

function validateRecord_(kpi, rec, faculties, user, existing) {
  var errors = {}, clean = {};
  var facCodes = faculties.map(function (f) { return f.kod; });

  kpi.fields.forEach(function (f) {
    var raw = rec[f.key];
    var v = raw === null || raw === undefined ? '' : (typeof raw === 'string' ? raw.trim() : raw);
    if (Array.isArray(v) && !v.length) v = '';
    if (v && typeof v === 'object' && !Array.isArray(v) && f.type === 'file' && !v.id) v = '';
    if (v === '') {
      if (f.required) errors[f.key] = 'Medan ini wajib diisi.';
      clean[f.key] = '';
      return;
    }
    switch (f.type) {
      case 'number':
        var n = Number(v);
        if (!isFinite(n)) { errors[f.key] = 'Mesti nombor.'; break; }
        if (f.min !== undefined && n < f.min) { errors[f.key] = 'Nilai minimum ialah ' + f.min + '.'; break; }
        if (f.max !== undefined && n > f.max) { errors[f.key] = 'Nilai maksimum ialah ' + f.max + '.'; break; }
        clean[f.key] = n;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T00:00:00Z').getTime()) ||
            new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) { errors[f.key] = 'Tarikh tidak sah (YYYY-MM-DD).'; break; }
        clean[f.key] = v;
        break;
      case 'month':
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v))) { errors[f.key] = 'Bulan tidak sah (YYYY-MM).'; break; }
        clean[f.key] = String(v);
        break;
      case 'people':
        var list = Array.isArray(v) ? v : parseJson_(String(v), null);
        if (!Array.isArray(list) || !list.length) { errors[f.key] = 'Tambah sekurang-kurangnya seorang pelajar.'; break; }
        if (list.length > 30) { errors[f.key] = 'Maksimum 30 pelajar bagi satu rekod.'; break; }
        var people = [], bad = [];
        list.forEach(function (p, i) {
          var nama = String(p && p.nama || '').trim(), matrik = String(p && p.matrik || '').trim(), kp = String(p && p.nokp || '').replace(/\s+/g, '').toUpperCase();
          if (/^\d{6}-?\d{2}-?\d{4}$/.test(kp)) kp = kp.replace(/-/g, ''); // No. KP 12 digit disimpan tanpa sengkang
          var miss = [];
          if (!nama || nama.length > 120) miss.push('nama');
          if (!matrik || matrik.length > 30) miss.push('no. matrik');
          if (f.kp === false) kp = ''; // medan no. KP tidak digunakan bagi KPI ini
          else if (!/^[A-Z0-9-]{6,20}$/.test(kp)) miss.push('no. KP / pasport');
          if (miss.length) bad.push('Pelajar ' + (i + 1) + ': ' + miss.join(', ') + ' tidak sah'); else people.push({ nama: nama, matrik: matrik, nokp: kp });
        });
        if (bad.length) { errors[f.key] = bad.join('; ') + '.'; break; }
        clean[f.key] = JSON.stringify(people);
        break;
      case 'file':
        var fv = typeof v === 'string' ? parseJson_(v, null) : v;
        if (!fv || typeof fv.id !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(fv.id)) { errors[f.key] = 'Muat naik fail PDF.'; break; }
        var keep = existing ? parseJson_(existing[f.key], {}) : {};
        if (keep && keep.id === fv.id) { clean[f.key] = JSON.stringify({ id: keep.id, name: String(keep.name || 'sijil.pdf').slice(0, 100) }); break; }
        // Fail baharu mesti baru dimuat naik oleh pengguna ini melalui aplikasi (elak merujuk fail Drive sembarangan).
        var up = parseJson_(CacheService.getScriptCache().get('up:' + fv.id), null);
        if (!up || up.e !== user.emel || up.k !== kpi.id) { errors[f.key] = 'Fail tidak sah atau tamat tempoh. Sila muat naik semula.'; break; }
        clean[f.key] = JSON.stringify({ id: fv.id, name: String(up.n || 'sijil.pdf').slice(0, 100) });
        break;
      case 'select':
        if (f.options.indexOf(String(v)) < 0) { errors[f.key] = 'Pilihan tidak sah.'; break; }
        clean[f.key] = String(v);
        break;
      case 'yesno':
        if (YES_NO.indexOf(String(v)) < 0) { errors[f.key] = 'Pilih Ya atau Tidak.'; break; }
        clean[f.key] = String(v);
        break;
      case 'faculty':
        if (facCodes.indexOf(String(v)) < 0) { errors[f.key] = 'Fakulti tidak sah.'; break; }
        if (f.key === 'fakulti' && !facultyAllowedForKpi_(kpi, String(v))) { errors[f.key] = 'Fakulti ini tidak termasuk dalam KPI ini.'; break; }
        clean[f.key] = String(v);
        break;
      case 'email':
        v = String(v).toLowerCase();
        if (!isEmail_(v)) { errors[f.key] = 'E-mel tidak sah.'; break; }
        clean[f.key] = v;
        break;
      case 'url':
        if (!/^https?:\/\/[^\s]+$/i.test(String(v)) || String(v).length > 500) { errors[f.key] = 'Pautan mesti bermula dengan http:// atau https://.'; break; }
        clean[f.key] = String(v);
        break;
      case 'textarea':
        if (String(v).length > 2000) { errors[f.key] = 'Maksimum 2000 aksara.'; break; }
        clean[f.key] = sanitizeText_(v);
        break;
      default:
        if (String(v).length > 300) { errors[f.key] = 'Maksimum 300 aksara.'; break; }
        clean[f.key] = sanitizeText_(v);
    }
  });

  (kpi.rules || []).forEach(function (rule) {
    if (rule.when.in.indexOf(String(clean[rule.when.field])) >= 0) {
      rule.require.forEach(function (key) {
        if ((clean[key] === '' || clean[key] === undefined) && !errors[key]) {
          errors[key] = 'Wajib diisi apabila ' + labelOf_(kpi, rule.when.field) + ' = ' + clean[rule.when.field] + '.';
        }
      });
    }
  });
  if (kpi.validate) kpi.validate(clean, errors);
  return { clean: clean, errors: errors };
}

function labelOf_(kpi, key) {
  for (var i = 0; i < kpi.fields.length; i++) { if (kpi.fields[i].key === key) return kpi.fields[i].label; }
  return key;
}

function nextId_(kpi, rows) {
  var max = 0, re = new RegExp('^' + kpi.prefix + '-(\\d+)$');
  rows.forEach(function (r) { var m = re.exec(String(r.id)); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return kpi.prefix + '-' + ('000' + (max + 1)).slice(-3);
}

function saveRecord_(token, kpiId, rec) {
  var user = requireUser_(token);
  var kpi = getKpi_(String(kpiId));
  if (!canAccessKpi_(user, kpi)) throw userError_('Akses ditolak bagi KPI ini.');
  if (!rec || typeof rec !== 'object') throw userError_('Data tidak sah.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var isPic = user.peranan !== ROLES.ADMIN;
    var input = {};
    for (var k in rec) { if (rec.hasOwnProperty(k)) input[k] = rec[k]; }
    // PIC hanya boleh merekod bagi fakulti sendiri.
    if (isPic && kpi.entry === 'faculty') input.fakulti = user.fakulti;

    var table = readTable_(kpi.sheet, typesFor_(kpi));
    var missingCols = kpiColumns_(kpi).filter(function (c) { return table.headers.indexOf(c) < 0; });
    if (missingCols.length) throw userError_('Skema Sheet belum dikemas kini. Pentadbir perlu menjalankan setup() semula.');
    var sh = getSheet_(kpi.sheet);
    var now = nowIso_();
    var id = String(rec.id || '');
    var existing = null;
    if (id) {
      table.rows.forEach(function (r) { if (r.id === id) existing = r; });
      if (!existing) throw userError_('Rekod tidak dijumpai.');
      if (isPic && kpi.entry === 'faculty' && existing.fakulti !== user.fakulti) throw userError_('Akses ditolak: rekod ini milik fakulti lain.');
    }

    var v = validateRecord_(kpi, input, listFaculties_(), user, existing);
    if (Object.keys(v.errors).length) throw userError_('Sila betulkan medan yang bertanda.', { fields: v.errors });

    var obj, action, summary;
    if (existing) {
      var changed = [];
      kpi.fields.forEach(function (f) { if (String(existing[f.key]) !== String(v.clean[f.key])) changed.push(f.key); });
      obj = { id: id, dicipta_pada: existing.dicipta_pada, dicipta_oleh: existing.dicipta_oleh, dikemas_kini_pada: now, dikemas_kini_oleh: user.emel };
      for (var a in v.clean) { if (v.clean.hasOwnProperty(a)) obj[a] = v.clean[a]; }
      writeRow_(sh, existing._row, obj);
      // Fail lampiran yang diganti dibuang ke tong sampah Drive.
      kpi.fields.forEach(function (f) {
        if (f.type !== 'file') return;
        var oldId = (parseJson_(existing[f.key], {}) || {}).id, newId = (parseJson_(v.clean[f.key], {}) || {}).id;
        if (oldId && oldId !== newId) trashFile_(oldId);
      });
      action = 'KEMAS_KINI'; summary = 'Medan diubah: ' + (changed.join(', ') || '(tiada)');
    } else {
      id = nextId_(kpi, table.rows);
      obj = { id: id, dicipta_pada: now, dicipta_oleh: user.emel, dikemas_kini_pada: now, dikemas_kini_oleh: user.emel };
      for (var b in v.clean) { if (v.clean.hasOwnProperty(b)) obj[b] = v.clean[b]; }
      writeRow_(sh, null, obj);
      action = 'TAMBAH'; summary = 'Rekod baharu' + (kpi.entry === 'faculty' ? ' (' + obj.fakulti + ')' : '');
    }
    audit_(user, action, kpi.id, id, summary);
    clearDashCache_();
    return obj;
  } finally {
    lock.releaseLock();
  }
}

/** Ringkasan rekod untuk log audit: tiada nama pelajar, no. KP atau lampiran. */
function auditSummary_(kpi, row) {
  var parts = [];
  kpi.listColumns.forEach(function (c) {
    var f = kpi.fields.filter(function (x) { return x.key === c; })[0];
    if (c === 'id' || (f && (f.type === 'people' || f.type === 'file'))) return;
    if (row[c] !== '' && row[c] !== undefined) parts.push(c + '=' + row[c]);
  });
  return parts.join(', ').slice(0, 300);
}

function deleteRecord_(token, kpiId, id) {
  var user = requireAdmin_(token);
  var kpi = getKpi_(String(kpiId));
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = readTable_(kpi.sheet, typesFor_(kpi));
    var existing = null;
    table.rows.forEach(function (r) { if (r.id === String(id)) existing = r; });
    if (!existing) throw userError_('Rekod tidak dijumpai.');
    getSheet_(kpi.sheet).deleteRow(existing._row);
    kpi.fields.forEach(function (f) { if (f.type === 'file') trashFile_((parseJson_(existing[f.key], {}) || {}).id); });
    audit_(user, 'PADAM', kpi.id, existing.id, 'Rekod dipadam: ' + auditSummary_(kpi, existing));
    clearDashCache_();
    return true;
  } finally {
    lock.releaseLock();
  }
}
