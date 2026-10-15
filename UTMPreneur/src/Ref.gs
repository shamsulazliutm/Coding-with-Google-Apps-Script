/**
 * UTMPreneur: capaian tab Rujukan (senarai pilihan), dicache 2 minit.
 */

var Ref = {
  all: function () {
    var c = Db.cache().get('ruj');
    if (c) return JSON.parse(c);
    var g = {};
    Db.rows('Rujukan').forEach(function (r) {
      if (!Util.truthy(r.Aktif)) return;
      var k = Util.str(r.Kumpulan), kod = Util.str(r.Kod);
      if (!k || !kod) return;
      (g[k] = g[k] || []).push({ kod: kod, bm: Util.str(r.BM), en: Util.str(r.EN), n: Number(r.Susunan) || 0 });
    });
    Object.keys(g).forEach(function (k) {
      g[k].sort(function (a, b) { return a.n - b.n; });
      g[k] = g[k].map(function (x) { return { kod: x.kod, bm: x.bm, en: x.en }; });
    });
    Db.cache().put('ruj', JSON.stringify(g), 120);
    return g;
  },
  list: function (group) { return Ref.all()[group] || []; },
  has: function (group, kod) {
    return Ref.list(group).some(function (x) { return x.kod === kod; });
  },
  /** Nama BM bagi kod; jika tiada pulang kod itu sendiri. */
  bm: function (group, kod) {
    var l = Ref.list(group);
    for (var i = 0; i < l.length; i++) if (l[i].kod === kod) return l[i].bm;
    return kod;
  },
  /** Kod bagi nilai teks (kod atau nama BM, tidak sensitif huruf). '' jika tiada. */
  kodOf: function (group, val) {
    var v = String(val == null ? '' : val).trim().toLowerCase();
    if (!v) return '';
    var l = Ref.list(group);
    for (var i = 0; i < l.length; i++) {
      if (l[i].kod.toLowerCase() === v || l[i].bm.toLowerCase() === v) return l[i].kod;
    }
    return '';
  },
  invalidate: function () { Db.cache().remove('ruj'); }
};
