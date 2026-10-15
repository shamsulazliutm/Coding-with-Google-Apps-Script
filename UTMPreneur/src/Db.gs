/**
 * UTMPreneur: lapisan data. Semua capaian spreadsheet melalui sini.
 * Spreadsheet selain Induk dicari melalui tab Link_Dokumen (Kod -> URL).
 */

var Db = (function () {
  var memo = { induk: null, sheets: {}, hdr: {}, ss: {} };

  function scriptProps_() { return PropertiesService.getScriptProperties(); }
  function cache_() { return CacheService.getScriptCache(); }

  function indukId_() {
    var id = scriptProps_().getProperty(PROPS.INDUK_ID);
    if (!id) throw appError_('SETUP_INDUK');
    return Util.idFromUrl(id) || id;
  }

  function induk_() {
    if (!memo.induk) memo.induk = SpreadsheetApp.openById(indukId_());
    return memo.induk;
  }

  /** Peta Kod -> {kod, jenis, url, id, status} daripada Link_Dokumen (cache 5 minit). */
  function links_() {
    var cached = cache_().get('links');
    if (cached) return JSON.parse(cached);
    var map = {};
    var sh = induk_().getSheetByName('Link_Dokumen');
    if (sh && sh.getLastRow() >= 2) {
      var vals = sh.getRange(1, 1, sh.getLastRow(), 8).getValues();
      var h = vals[0];
      var ix = function (n) { return h.indexOf(n); };
      for (var i = 1; i < vals.length; i++) {
        var kod = Util.str(vals[i][ix('Kod')]);
        if (!kod) continue;
        var url = Util.str(vals[i][ix('URL')]);
        map[kod] = {
          kod: kod,
          jenis: Util.str(vals[i][ix('Jenis')]),
          url: url,
          id: Util.idFromUrl(url),
          status: Util.str(vals[i][ix('Status')]) || 'Aktif'
        };
      }
    }
    cache_().put('links', JSON.stringify(map), 300);
    return map;
  }

  function openByKod_(kod) {
    if (kod === 'SS_INDUK') return induk_();
    if (memo.ss[kod]) return memo.ss[kod];
    var l = links_()[kod];
    if (!l || !l.id || l.status === 'Tidak aktif') throw appError_('SETUP_TIADA_LINK', { kod: kod });
    memo.ss[kod] = SpreadsheetApp.openById(l.id);
    return memo.ss[kod];
  }

  function sheet_(tab) {
    if (memo.sheets[tab]) return memo.sheets[tab];
    var kod = TAB_SS[tab];
    if (!kod) throw new Error('Tab tidak dikenali: ' + tab);
    var sh = openByKod_(kod).getSheetByName(tab);
    if (!sh) throw new Error('Tab tiada dalam spreadsheet: ' + tab);
    memo.sheets[tab] = sh;
    return sh;
  }

  function headers_(tab) {
    if (memo.hdr[tab]) return memo.hdr[tab];
    var sh = sheet_(tab);
    var n = Math.max(sh.getLastColumn(), 1);
    var row = sh.getRange(1, 1, 1, n).getValues()[0];
    var h = [];
    for (var i = 0; i < row.length; i++) {
      if (String(row[i]).trim() === '') break;
      h.push(String(row[i]).trim());
    }
    memo.hdr[tab] = h;
    return h;
  }

  function rows_(tab) {
    var sh = sheet_(tab);
    var hdr = headers_(tab);
    var lr = sh.getLastRow();
    if (lr < 2) return [];
    var vals = sh.getRange(2, 1, lr - 1, hdr.length).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var o = { _row: i + 2 };
      var empty = true;
      for (var j = 0; j < hdr.length; j++) {
        o[hdr[j]] = vals[i][j];
        if (vals[i][j] !== '' && vals[i][j] !== null) empty = false;
      }
      if (!empty) out.push(o);
    }
    return out;
  }

  /**
   * Cegah suntikan formula: teks yang bermula dengan = + - @ atau apostrof diawali apostrof supaya
   * Sheets menyimpannya sebagai teks. Apostrof pelepas tidak menjadi sebahagian nilai apabila dibaca semula,
   * jadi nilai asal kekal sama (apostrof yang sedia ada juga digandakan supaya tidak hilang).
   */
  function safeCell_(v) {
    if (typeof v === 'string' && /^[=+\-@\t\r']/.test(v)) return "'" + v;
    return v;
  }

  // ---------- Gandingan No. KP dengan No. Matrik ----------
  var kpMemo = { pel: null, per: null };

  /** Tetapan gandingan bagi tab: {mc: lajur matrik, kp: lajur KP, byPer} atau null. */
  function kpCfg_(tab) {
    if (tab === 'Pengguna') return { mc: 'No_Matrik', kp: 'No_KP_Pasport', byPer: false, onlyBlank: true };
    var kod = TAB_SS[tab];
    var cols = kod && SCHEMA[kod] ? SCHEMA[kod].tabs[tab] : null;
    if (!cols || cols.indexOf('No_KP') < 0) return null;
    var mc = '';
    cols.forEach(function (c) { if (!mc && /^No_Matrik/.test(c)) mc = c; });
    return mc ? { mc: mc, kp: 'No_KP', byPer: cols.indexOf('ID_Perniagaan') >= 0 && mc === 'No_Matrik_Pemilik', onlyBlank: false } : null;
  }

  /** Nilai satu lajur pada baris yang padan dalam tab (baca lajur kunci sahaja, kemudian satu sel). */
  function lookupCell_(tab, keyCol, key, valCol, normFn) {
    var sh = sheet_(tab), h = headers_(tab);
    var ki = h.indexOf(keyCol), vi = h.indexOf(valCol);
    var lr = sh.getLastRow();
    if (ki < 0 || vi < 0 || lr < 2) return '';
    var keys = sh.getRange(2, ki + 1, lr - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if ((normFn ? normFn(keys[i][0]) : String(keys[i][0]).trim()) === key) {
        var v = sh.getRange(i + 2, vi + 1).getValue();
        return v === null || v === undefined ? '' : String(v).trim();
      }
    }
    return '';
  }

  function kpOf_(matric) {
    kpMemo.pel = kpMemo.pel || {};
    if (!Object.prototype.hasOwnProperty.call(kpMemo.pel, matric)) {
      kpMemo.pel[matric] = lookupCell_('PELAJAR', 'No_Matrik', matric, 'No_KP_Pasport', Util.normMatric);
    }
    return kpMemo.pel[matric];
  }

  function matricOfPer_(idPer) {
    kpMemo.per = kpMemo.per || {};
    if (!Object.prototype.hasOwnProperty.call(kpMemo.per, idPer) || !kpMemo.per[idPer]) {
      kpMemo.per[idPer] = Util.normMatric(lookupCell_('Perniagaan', 'ID_Perniagaan', idPer, 'No_Matrik_Pemilik'));
    }
    return kpMemo.per[idPer];
  }

  /** Isi No. KP (dan matrik pemilik bagi tab ID_Perniagaan) pada objek baris. Pulang true jika ada perubahan. */
  function fillKp_(tab, obj) {
    var cfg = kpCfg_(tab);
    if (!cfg) return false;
    var m = Util.normMatric(obj[cfg.mc]);
    if (!m && cfg.byPer && Util.str(obj.ID_Perniagaan)) {
      m = matricOfPer_(Util.str(obj.ID_Perniagaan));
      if (m) obj[cfg.mc] = m;
    }
    if (!m) return false;
    if (cfg.onlyBlank && Util.str(obj[cfg.kp])) return false;
    var kp = kpOf_(m);
    if (!kp || Util.str(obj[cfg.kp]) === kp) return false;
    obj[cfg.kp] = kp;
    return true;
  }

  function toRow_(hdr, obj, tab) {
    if (tab) fillKp_(tab, obj);
    return hdr.map(function (h) { return safeCell_(obj[h] === undefined || obj[h] === null ? '' : obj[h]); });
  }

  function append_(tab, obj) {
    var sh = sheet_(tab);
    var hdr = headers_(tab);
    var r = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(r, 1, 1, hdr.length).setValues([toRow_(hdr, obj, tab)]);
    return r;
  }

  function update_(tab, rowNum, patch) {
    var sh = sheet_(tab);
    var hdr = headers_(tab);
    var cur = sh.getRange(rowNum, 1, 1, hdr.length).getValues()[0];
    hdr.forEach(function (h, i) {
      if (Object.prototype.hasOwnProperty.call(patch, h)) cur[i] = patch[h] === null ? '' : patch[h];
    });
    // gandingan No. KP: bina objek baris, isi, kemudian tulis semula lajur berkaitan
    if (kpCfg_(tab)) {
      var o = {};
      hdr.forEach(function (h, i) { o[h] = cur[i]; });
      if (fillKp_(tab, o)) hdr.forEach(function (h, i) { cur[i] = o[h]; });
    }
    // nilai sedia ada yang dibaca semula sebagai teks juga mesti dilindungi
    sh.getRange(rowNum, 1, 1, hdr.length).setValues([cur.map(safeCell_)]);
  }

  /** Ganti semua baris data (kekalkan tajuk). */
  function replaceAll_(tab, objs) {
    var sh = sheet_(tab);
    var hdr = headers_(tab);
    var lr = sh.getLastRow();
    if (lr >= 2) sh.getRange(2, 1, lr - 1, hdr.length).clearContent();
    if (!objs.length) return;
    var need = objs.length + 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    var data = objs.map(function (o) { return toRow_(hdr, o, tab); });
    sh.getRange(2, 1, data.length, hdr.length).setValues(data);
  }

  function find_(tab, pred) {
    return rows_(tab).filter(pred);
  }

  function withLock_(fn, waitMs) {
    var lock = LockService.getScriptLock();
    lock.waitLock(waitMs || 15000);
    try { return fn(); } finally { lock.releaseLock(); }
  }

  /** Nombor jujukan seterusnya (selamat dalam kunci). */
  function nextSeq_(key) {
    return withLock_(function () {
      var p = scriptProps_();
      var k = 'SEQ_' + key;
      var n = parseInt(p.getProperty(k) || '0', 10) + 1;
      p.setProperty(k, String(n));
      return n;
    });
  }

  /** Seperti nextSeq tetapi MESTI dipanggil apabila kunci sudah dipegang (kunci skrip tidak boleh dipegang dua kali). */
  function nextSeqLocked_(key) {
    var p = scriptProps_();
    var k = 'SEQ_' + key;
    var n = parseInt(p.getProperty(k) || '0', 10) + 1;
    p.setProperty(k, String(n));
    return n;
  }

  function reset_() {
    memo = { induk: null, sheets: {}, hdr: {}, ss: {} };
    kpMemo = { pel: null, per: null };
    cache_().remove('links');
  }

  return {
    props: scriptProps_,
    cache: cache_,
    induk: induk_,
    links: links_,
    openByKod: openByKod_,
    sheet: sheet_,
    headers: headers_,
    rows: rows_,
    append: append_,
    update: update_,
    replaceAll: replaceAll_,
    safeCell: safeCell_,
    kpCfg: kpCfg_,
    fillKp: fillKp_,
    kpOf: kpOf_,
    find: find_,
    withLock: withLock_,
    nextSeq: nextSeq_,
    nextSeqLocked: nextSeqLocked_,
    reset: reset_
  };
})();

/** Tetapan (tab Tetapan), dicache 2 minit. */
var Cfg = {
  map: function () {
    var c = Db.cache().get('cfg');
    if (c) return JSON.parse(c);
    var m = {};
    Db.rows('Tetapan').forEach(function (r) {
      var k = Util.str(r.Kunci);
      if (k) m[k] = Util.str(r.Nilai);
    });
    Db.cache().put('cfg', JSON.stringify(m), 120);
    return m;
  },
  get: function (key, def) {
    var m = Cfg.map();
    return Object.prototype.hasOwnProperty.call(m, key) && m[key] !== '' ? m[key] : (def === undefined ? '' : def);
  },
  num: function (key, def) {
    var v = parseFloat(Cfg.get(key, ''));
    return isNaN(v) ? def : v;
  },
  list: function (key) {
    return Cfg.get(key, '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  },
  invalidate: function () { Db.cache().remove('cfg'); }
};

var Mode = {
  current: function () {
    var m = Db.props().getProperty(PROPS.MODE);
    return m === MODE.PRODUKSI ? MODE.PRODUKSI : MODE.UJI;
  },
  isUji: function () { return Mode.current() === MODE.UJI; }
};

/** Senarai admin (tab Admin), dicache 1 minit. */
var Admins = {
  list: function () {
    var c = Db.cache().get('admins');
    if (c) return JSON.parse(c);
    var out = Db.rows('Admin').map(function (r) {
      return {
        emel: Util.normEmail(r.Emel),
        nama: Util.str(r.Nama),
        peranan: Util.str(r.Peranan),
        modul: Util.str(r.Modul),
        aktif: Util.truthy(r.Aktif),
        row: r._row
      };
    }).filter(function (a) { return a.emel; });
    Db.cache().put('admins', JSON.stringify(out), 60);
    return out;
  },
  find: function (email) {
    var e = Util.normEmail(email);
    var l = Admins.list();
    for (var i = 0; i < l.length; i++) if (l[i].emel === e) return l[i];
    return null;
  },
  invalidate: function () { Db.cache().remove('admins'); }
};

/** Rekod audit (tab Audit). Kegagalan menulis audit tidak menghalang tindakan utama. */
var Audit = {
  log: function (ctx, tindakan, modul, rujukan, lama, baharu, catatan) {
    try {
      Db.append('Audit', {
        Masa: new Date(),
        Emel: ctx && ctx.email ? ctx.email : '-',
        Peranan: ctx && ctx.role ? ctx.role : '-',
        Tindakan: tindakan,
        Modul: modul || '',
        Rujukan: rujukan || '',
        Nilai_Lama: lama === undefined || lama === null ? '' : String(lama).substr(0, 500),
        Nilai_Baharu: baharu === undefined || baharu === null ? '' : String(baharu).substr(0, 500),
        Catatan: (catatan || '') + (ctx && ctx.bagiPihak ? ' [bagi pihak ' + ctx.noMatrik + ']' : '')
      });
    } catch (e) {
      console.error('Audit gagal: ' + e);
    }
  }
};
