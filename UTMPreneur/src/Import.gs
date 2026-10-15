/**
 * UTMPreneur: import data rasmi pelajar ke tab PELAJAR (CSV, oleh Admin Penuh).
 * Semakan dibuat dahulu (dryRun). Jika ada ralat, tiada apa-apa ditulis.
 */

var PelajarImport = (function () {
  var REQUIRED = ['No_Matrik', 'Nama_Penuh', 'Emel', 'No_KP_Pasport', 'Jantina', 'Etnik', 'Kewarganegaraan', 'Fakulti', 'Program', 'Tahun_Pengajian'];
  var MAX_ROWS = 20000;

  function normHeader_(h) {
    return String(h == null ? '' : h).trim().replace(/\s+/g, '_').toLowerCase();
  }

  /** Padankan tajuk CSV dengan tajuk skema PELAJAR (tidak peka huruf). */
  function mapHeaders_(rawHeaders) {
    var schema = SCHEMA.SS_INDUK.tabs.PELAJAR;
    var lookup = {};
    schema.forEach(function (h) { lookup[normHeader_(h)] = h; });
    var map = [], unknown = [];
    rawHeaders.forEach(function (h) {
      var k = lookup[normHeader_(h)];
      map.push(k || null);
      if (!k && String(h).trim() !== '') unknown.push(String(h).trim());
    });
    return { map: map, unknown: unknown };
  }

  /** Semak rekod mentah dan pulang rekod ternormal, ralat dan amaran. opts: {fakulti:[..], domainPelajar} */
  function validate(records, opts) {
    opts = opts || {};
    var errors = [], warnings = [], rows = [];
    var seenMatric = {}, seenEmail = {};
    var fak = {};
    (opts.fakulti || []).forEach(function (f) { fak[String(f).trim().toLowerCase()] = true; });
    var dom = Util.normEmail(opts.domainPelajar || '');
    var warnedFak = {};

    records.forEach(function (rec, i) {
      var baris = i + 2;
      var err = function (m) { errors.push({ baris: baris, mesej: m }); };
      var o = {};
      Object.keys(rec).forEach(function (k) { o[k] = Util.str(rec[k]); });

      var matric = Util.normMatric(o.No_Matrik);
      if (!Util.isMatric(matric)) err('No_Matrik tidak sah: "' + o.No_Matrik + '"');
      else if (seenMatric[matric]) err('No_Matrik pendua dalam fail: ' + matric + ' (baris ' + seenMatric[matric] + ')');
      else seenMatric[matric] = baris;
      o.No_Matrik = matric;

      if (!o.Nama_Penuh) err('Nama_Penuh kosong');
      o.Nama_Penuh = o.Nama_Penuh.toUpperCase();

      var email = Util.normEmail(o.Emel);
      if (!Util.isEmail(email)) err('Emel tidak sah: "' + o.Emel + '"');
      else {
        if (seenEmail[email] && seenEmail[email].matric !== matric) err('Emel digunakan oleh No. Matrik lain: ' + email + ' (baris ' + seenEmail[email].baris + ')');
        else seenEmail[email] = { matric: matric, baris: baris };
        if (dom && email.slice(-dom.length) !== dom) warnings.push({ baris: baris, mesej: 'Emel bukan domain pelajar: ' + email });
      }
      o.Emel = email;

      o.No_KP_Pasport = o.No_KP_Pasport.replace(/\s+/g, '');
      if (!o.No_KP_Pasport) err('No_KP_Pasport kosong');

      var j = Util.normJantina(o.Jantina);
      if (!j) err('Jantina tidak sah: "' + o.Jantina + '" (guna Lelaki/Perempuan)');
      o.Jantina = j;

      ['Etnik', 'Kewarganegaraan', 'Fakulti', 'Program'].forEach(function (k) { if (!o[k]) err(k + ' kosong'); });

      if (o.Fakulti && Object.keys(fak).length && !fak[o.Fakulti.toLowerCase()] && !warnedFak[o.Fakulti]) {
        warnedFak[o.Fakulti] = true;
        warnings.push({ baris: baris, mesej: 'Fakulti tiada dalam Rujukan: "' + o.Fakulti + '"' });
      }

      var th = parseInt(o.Tahun_Pengajian, 10);
      if (isNaN(th) || th < 1 || th > 7) err('Tahun_Pengajian mesti 1 hingga 7: "' + o.Tahun_Pengajian + '"');
      else o.Tahun_Pengajian = th;

      if (!o.Status_Pelajar) o.Status_Pelajar = 'Aktif';
      rows.push(o);
    });
    return { rows: rows, errors: errors, warnings: warnings };
  }

  /** Penghuraian CSV -> rekod. Pulang {records} atau lontar ralat. */
  function parse(csvText) {
    var table = Util.parseCsv(csvText);
    if (table.length < 2) throw appError_('CSV_KOSONG');
    if (table.length - 1 > MAX_ROWS) throw new AppError('CSV_TERLALU_BESAR', 'Terlalu banyak baris (maksimum ' + MAX_ROWS + ').', 'Too many rows (maximum ' + MAX_ROWS + ').');
    var hm = mapHeaders_(table[0]);
    var present = {};
    hm.map.forEach(function (h) { if (h) present[h] = true; });
    var missing = REQUIRED.filter(function (h) { return !present[h]; });
    if (missing.length) throw new AppError('CSV_TAJUK', 'Tajuk lajur tiada: ' + missing.join(', '), 'Missing columns: ' + missing.join(', '), { missing: missing });
    var records = [];
    for (var r = 1; r < table.length; r++) {
      var rec = {};
      hm.map.forEach(function (h, c) { if (h) rec[h] = table[r][c] === undefined ? '' : table[r][c]; });
      records.push(rec);
    }
    return { records: records, unknown: hm.unknown };
  }

  function rujukanFakulti_() {
    var out = [];
    Db.rows('Rujukan').forEach(function (r) {
      if (Util.str(r.Kumpulan) === 'FAKULTI') {
        [r.Kod, r.BM, r.EN].forEach(function (v) { if (Util.str(v)) out.push(Util.str(v)); });
      }
    });
    return out;
  }

  /**
   * p: { csv, dryRun (lalai true), mod: 'gabung' | 'ganti' }
   * Pulang ringkasan. Menulis hanya jika dryRun === false dan tiada ralat.
   */
  function run(ctx, p) {
    p = p || {};
    var dry = p.dryRun !== false;
    var mod = p.mod === 'ganti' ? 'ganti' : 'gabung';
    var parsed = parse(p.csv);
    var v = validate(parsed.records, { fakulti: rujukanFakulti_(), domainPelajar: Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my') });
    var res = {
      dryRun: dry, mod: mod, jumlah: parsed.records.length,
      ralat: v.errors.slice(0, 50), jumlahRalat: v.errors.length,
      amaran: v.warnings.slice(0, 50), jumlahAmaran: v.warnings.length,
      lajurTidakDikenali: parsed.unknown, ditambah: 0, dikemaskini: 0, ditulis: false
    };
    if (v.errors.length) return res;

    var existing = Db.rows('PELAJAR');
    var byMatric = {};
    existing.forEach(function (r) { byMatric[Util.normMatric(r.No_Matrik)] = r; });
    var newCount = 0, updCount = 0;
    v.rows.forEach(function (r) { if (byMatric[r.No_Matrik]) updCount++; else newCount++; });
    res.ditambah = newCount;
    res.dikemaskini = mod === 'ganti' ? 0 : updCount;
    if (mod === 'ganti') res.diganti = existing.length;

    if (dry) return res;

    return Db.withLock(function () {
      var cur = Db.rows('PELAJAR');
      var out;
      if (mod === 'ganti') {
        out = v.rows;
      } else {
        var idx = {};
        out = cur.map(function (r, i) { idx[Util.normMatric(r.No_Matrik)] = i; return r; });
        var emailTaken = {};
        cur.forEach(function (r) { emailTaken[Util.normEmail(r.Emel)] = Util.normMatric(r.No_Matrik); });
        var conflicts = [];
        v.rows.forEach(function (r, n) {
          var owner = emailTaken[r.Emel];
          if (owner && owner !== r.No_Matrik) conflicts.push({ baris: n + 2, mesej: 'Emel ' + r.Emel + ' sudah digunakan oleh No. Matrik ' + owner });
        });
        if (conflicts.length) {
          res.ralat = conflicts.slice(0, 50);
          res.jumlahRalat = conflicts.length;
          return res;
        }
        v.rows.forEach(function (r) {
          if (idx[r.No_Matrik] !== undefined) out[idx[r.No_Matrik]] = r;
          else out.push(r);
        });
      }
      Db.replaceAll('PELAJAR', out);
      res.ditulis = true;
      Audit.log(ctx, 'IMPORT_PELAJAR', 'Induk', mod, '', res.ditambah + ' baharu, ' + res.dikemaskini + ' kemas kini', '');
      return res;
    }, 30000);
  }

  return { REQUIRED: REQUIRED, parse: parse, validate: validate, run: run };
})();
