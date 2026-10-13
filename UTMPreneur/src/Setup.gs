/**
 * UTMPreneur: skrip persediaan.
 *
 * Tuan hanya perlu mencipta SS_INDUK (spreadsheet kosong) dalam folder pilihan, dan
 * menetapkan Script Properties INDUK_ID (URL atau ID) dan MODE (UJI atau PRODUKSI).
 * Kemudian jalankan setup() dari editor Apps Script. Skrip ini:
 *   1. menyediakan semua tab dan tajuk lajur dalam SS_INDUK,
 *   2. mencipta spreadsheet lain dalam folder yang sama dengan SS_INDUK,
 *   3. mencipta folder lampiran/sijil/templat dalam folder yang sama,
 *   4. mendaftar semuanya dalam Link_Dokumen,
 *   5. mengisi data awal (Tetapan, Admin, Rujukan, Lot, Rubrik, KADAR; pelajar contoh dalam MOD UJI),
 *   6. menjalankan pengesah struktur.
 * Selamat dijalankan semula: perkara yang sudah wujud dilangkau. Jika masa hampir
 * habis, ia berhenti dan Tuan jalankan semula.
 */

var Setup = (function () {
  var LIMIT_MS = 270000; // 4.5 minit (had Apps Script 6 minit)

  function nama_(base) { return base + (Mode.isUji() ? ' (UJI)' : ''); }

  function indukSs_() {
    var raw = Db.props().getProperty(PROPS.INDUK_ID);
    if (!raw) throw appError_('SETUP_INDUK');
    return SpreadsheetApp.openById(Util.idFromUrl(raw) || raw);
  }

  function parentFolder_(ss) {
    var it = DriveApp.getFileById(ss.getId()).getParents();
    return it.hasNext() ? it.next() : DriveApp.getRootFolder();
  }

  function folderEnsure_(parent, name) {
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }

  /** Pastikan tab dan tajuk lajur wujud (tidak memadam atau menyusun semula yang sedia ada). */
  function ensureTabs_(ss, tabs, created, log) {
    Object.keys(tabs).forEach(function (name) {
      var hdr = tabs[name];
      var sh = ss.getSheetByName(name);
      if (!sh) { sh = ss.insertSheet(name); log.push('Tab dicipta: ' + name); }
      var cols = Math.max(sh.getLastColumn(), 1);
      var row1 = sh.getRange(1, 1, 1, cols).getValues()[0].map(function (v) { return String(v).trim(); });
      var have = {}, n = 0;
      row1.forEach(function (v, i) { if (v) { have[v] = true; n = i + 1; } });
      var add = hdr.filter(function (h) { return !have[h]; });
      if (add.length) {
        sh.getRange(1, n + 1, 1, add.length).setValues([add]);
        n += add.length;
        log.push('Lajur ditambah pada ' + name + ': ' + add.join(', '));
      }
      var total = Math.max(n, hdr.length);
      sh.getRange(1, 1, 1, total).setBackground('#8A2D3B').setFontColor('#FFFFFF').setFontWeight('bold');
      sh.setFrozenRows(1);
      var cur = sh.getRange(1, 1, 1, total).getValues()[0];
      (TEXT_COLS[name] || []).forEach(function (h) {
        var c = cur.indexOf(h);
        if (c >= 0) sh.getRange(1, c + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
    });
    if (created) {
      ss.getSheets().forEach(function (s) {
        if (!tabs[s.getName()] && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
      });
    }
  }

  /** Daftar atau lengkapkan satu baris Link_Dokumen. URL sedia ada tidak ditimpa. */
  function upsertLink_(ind, kod, jenis, modul, nama, url, catatan) {
    var sh = ind.getSheetByName('Link_Dokumen');
    var lr = sh.getLastRow();
    var kods = lr >= 2 ? sh.getRange(2, 1, lr - 1, 1).getValues() : [];
    var row = -1;
    for (var i = 0; i < kods.length; i++) if (String(kods[i][0]).trim() === kod) row = i + 2;
    if (row < 0) {
      row = Math.max(lr, 1) + 1;
      sh.getRange(row, 1, 1, 8).setValues([[kod, jenis, modul, nama, url || '', '', 'Aktif', catatan || '']]);
    } else if (url) {
      var cur = String(sh.getRange(row, 5).getValue()).trim();
      if (!cur) sh.getRange(row, 5).setValue(url);
    }
    sh.getRange(row, 6).setFormula('=IF(E' + row + '="","",REGEXEXTRACT(E' + row + ',"[-\\w]{25,}"))');
  }

  function linkUrl_(ind, kod) {
    var sh = ind.getSheetByName('Link_Dokumen');
    var lr = sh.getLastRow();
    if (lr < 2) return '';
    var v = sh.getRange(2, 1, lr - 1, 5).getValues();
    for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === kod) return String(v[i][4]).trim();
    return '';
  }

  function appendMany_(tab, objs) {
    if (!objs.length) return;
    var sh = Db.sheet(tab);
    var hdr = Db.headers(tab);
    var start = Math.max(sh.getLastRow(), 1) + 1;
    var data = objs.map(function (o) { return hdr.map(function (h) { return Db.safeCell(o[h] === undefined ? '' : o[h]); }); });
    var need = start + data.length - 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    sh.getRange(start, 1, data.length, hdr.length).setValues(data);
  }

  function isEmpty_(tab) { return Db.sheet(tab).getLastRow() < 2; }

  function seed_(log) {
    Db.reset();
    // Tetapan: tambah kunci yang tiada sahaja
    var have = {};
    Db.rows('Tetapan').forEach(function (r) { have[Util.str(r.Kunci)] = true; });
    var addT = Seed.tetapan().filter(function (t) { return !have[t.Kunci]; });
    if (addT.length) { appendMany_('Tetapan', addT); log.push('Tetapan: ' + addT.length + ' kunci ditambah'); }
    // Admin utama
    var hasAdmin = Db.rows('Admin').some(function (r) { return Util.normEmail(r.Emel) === ADMIN_UTAMA; });
    if (!hasAdmin) { appendMany_('Admin', Seed.admin()); log.push('Admin utama didaftar: ' + ADMIN_UTAMA); }
    var plan = [
      ['Rujukan', Seed.rujukan], ['Lot', Seed.lot], ['Rubrik', Seed.rubrik], ['KADAR', Seed.kadar]
    ];
    plan.forEach(function (p) {
      if (isEmpty_(p[0])) { var rows = p[1](); appendMany_(p[0], rows); log.push(p[0] + ': ' + rows.length + ' baris awal'); }
    });
    if (Mode.isUji() && isEmpty_('PELAJAR')) {
      var pc = Seed.pelajarContoh();
      appendMany_('PELAJAR', pc);
      log.push('MOD UJI: ' + pc.length + ' pelajar contoh rekaan ditambah');
    }
    Cfg.invalidate();
    Admins.invalidate();
  }

  /** Semak setiap spreadsheet dan tab mempunyai lajur yang diperlukan. */
  function validate_() {
    Db.reset();
    var out = { ok: true, spreadsheet: 0, tab: 0, masalah: [] };
    Object.keys(SCHEMA).forEach(function (kod) {
      var def = SCHEMA[kod], ss;
      try { ss = Db.openByKod(kod); } catch (e) {
        out.ok = false; out.masalah.push(kod + ': spreadsheet tidak ditemui atau tidak didaftar dalam Link_Dokumen'); return;
      }
      out.spreadsheet++;
      Object.keys(def.tabs).forEach(function (tab) {
        var sh = ss.getSheetByName(tab);
        if (!sh) { out.ok = false; out.masalah.push(kod + ' > ' + tab + ': tab tiada'); return; }
        out.tab++;
        var cols = Math.max(sh.getLastColumn(), 1);
        var row1 = sh.getRange(1, 1, 1, cols).getValues()[0].map(function (v) { return String(v).trim(); });
        var kurang = def.tabs[tab].filter(function (h) { return row1.indexOf(h) < 0; });
        if (kurang.length) { out.ok = false; out.masalah.push(kod + ' > ' + tab + ': lajur tiada: ' + kurang.join(', ')); }
      });
    });
    return out;
  }

  function run_() {
    var t0 = new Date().getTime();
    var log = [];
    var timeUp = function () { return new Date().getTime() - t0 > LIMIT_MS; };
    var result = function (selesai) { return { selesai: selesai, mod: Mode.current(), langkah: log, masalah: [] }; };

    log.push('Mod: ' + Mode.current() + (Db.props().getProperty(PROPS.MODE) ? '' : ' (MODE belum ditetapkan, anggap UJI)'));
    var ind = indukSs_();
    log.push('Induk: ' + ind.getName());

    // 1. Induk
    ensureTabs_(ind, SCHEMA.SS_INDUK.tabs, false, log);
    upsertLink_(ind, 'SS_INDUK', 'Spreadsheet', SCHEMA.SS_INDUK.modul, ind.getName(), ind.getUrl(), 'Spreadsheet induk');
    Db.reset();
    var parent = parentFolder_(ind);
    log.push('Folder induk: ' + parent.getName());

    // 2. Spreadsheet lain
    var kods = Object.keys(SCHEMA).filter(function (k) { return k !== 'SS_INDUK'; });
    for (var i = 0; i < kods.length; i++) {
      if (timeUp()) { log.push('Masa hampir habis. Jalankan setup() sekali lagi.'); return result(false); }
      var kod = kods[i], def = SCHEMA[kod];
      var url = linkUrl_(ind, kod), ss = null, created = false;
      var id = Util.idFromUrl(url);
      if (id) {
        try { ss = SpreadsheetApp.openById(id); } catch (e) { log.push('PERINGATAN: ' + kod + ' tidak boleh dibuka: ' + e); ss = null; }
      }
      if (!ss) {
        if (id) { log.push('Dilangkau (URL sedia ada tidak boleh dibuka, semak kebenaran): ' + kod); continue; }
        ss = SpreadsheetApp.create(nama_(def.nama));
        DriveApp.getFileById(ss.getId()).moveTo(parent);
        created = true;
        log.push('Spreadsheet dicipta: ' + ss.getName());
      }
      ensureTabs_(ss, def.tabs, created, log);
      upsertLink_(ind, kod, 'Spreadsheet', def.modul, ss.getName(), ss.getUrl(), '');
    }

    // 3. Folder
    FOLDERS.forEach(function (f) {
      var url = linkUrl_(ind, f.kod);
      if (Util.idFromUrl(url)) return;
      var fl = folderEnsure_(parent, nama_(f.nama));
      upsertLink_(ind, f.kod, 'Folder', f.modul, fl.getName(), fl.getUrl(), '');
      log.push('Folder didaftar: ' + fl.getName());
    });

    // 4. Dokumen (URL diisi oleh urusetia)
    DOKUMEN.forEach(function (d) {
      upsertLink_(ind, d.kod, d.jenis, d.modul, d.nama, '', d.catatan);
    });
    Db.reset();

    // 5. Data awal
    if (timeUp()) { log.push('Masa hampir habis. Jalankan setup() sekali lagi.'); return result(false); }
    seed_(log);

    // 6. Pengesah
    var v = validate_();
    var r = result(true);
    r.masalah = v.masalah;
    log.push('Pengesahan struktur: ' + (v.ok ? 'OK' : 'ADA MASALAH') + ' (' + v.spreadsheet + ' spreadsheet, ' + v.tab + ' tab)');
    if (Mode.isUji() && !Cfg.get('PENGUJI_EMEL', '')) log.push('INGAT: isi Tetapan PENGUJI_EMEL (emel penguji) supaya OTP boleh dihantar dalam MOD UJI.');
    if (!Cfg.get('WEBAPP_URL', '')) log.push('INGAT: isi Tetapan WEBAPP_URL selepas deploy.');
    return r;
  }

  return { run: run_, validate: validate_, ensureTabs: ensureTabs_ };
})();

/** Jalankan dari editor Apps Script. */
function setup() {
  var r = Setup.run();
  Logger.log(r.langkah.join('\n'));
  if (r.masalah.length) Logger.log('MASALAH:\n' + r.masalah.join('\n'));
  Logger.log(r.selesai ? 'SETUP SELESAI' : 'SETUP BELUM SELESAI: jalankan semula');
  return r;
}

/** Semak struktur tanpa mengubah apa-apa. */
function validateStructure() {
  var r = Setup.validate();
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
