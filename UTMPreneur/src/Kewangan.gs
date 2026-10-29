/**
 * UTMPreneur: modul Kewangan (laporan kewangan bulanan).
 * Setiap perniagaan SSU (Aktif atau Tamat Tempoh) melapor bulanan, sebelum atau pada hari ke-N bulan berikutnya
 * (Tetapan TARIKH_AKHIR_LAPORAN_HARI, lalai 7). Pemilik menghantar; ahli pasukan melihat sahaja; admin menyemak
 * (Terima / Perlu Pembetulan). Laporan Diterima dikunci dan hanya ia dikira dalam KPI rasmi.
 * Kerja harian menjana baris, menanda Lewat, menghantar peringatan dan mengemas kini Ringkasan_KPI.
 *
 * Fail ini tidak bergantung pada fail lain semasa dimuat: semua rujukan kepada fail lain berlaku di dalam fungsi.
 */

var MSG_KEW = {
  KEW_TIDAK_DITEMUI: ['Laporan kewangan tidak ditemui.', 'Financial report not found.'],
  KEW_HANYA_PEMILIK: ['Hanya pemilik perniagaan boleh menghantar atau menyunting laporan. Ahli pasukan boleh melihat sahaja.', 'Only the business owner can submit or edit the report. Team members have view-only access.'],
  KEW_TIDAK_BOLEH_UBAH: ['Laporan ini tidak boleh diubah pada status semasa.', 'This report cannot be changed in its current status.'],
  KEW_TIDAK_SAH: ['Maklumat laporan tidak sah. Semak medan yang bertanda.', 'The report details are invalid. Check the highlighted fields.'],
  KEW_CATATAN_WAJIB: ['Catatan wajib diisi apabila laporan dikembalikan untuk pembetulan.', 'A note is required when a report is returned for correction.'],
  KEW_PERALIHAN_TIDAK_SAH: ['Tindakan ini tidak sah pada status semasa (hanya laporan Dihantar boleh disemak).', 'This action is not valid in the current status (only Submitted reports can be reviewed).'],
  KEW_TEMPLAT_TIADA: ['Templat laporan belum didaftar atau tidak boleh dibuka. Hubungi UTMXCITE. (Admin: daftar fail Drive pada Link_Dokumen, kod TEMPLAT_LAPORAN_KEWANGAN.)', 'The report template is not registered or cannot be opened. Please contact UTMXCITE.'],
  KEW_FAIL_TIADA: ['Laporan ini tiada fail.', 'This report has no file.']
};

var TETAPAN_KEW = [
  ['KEW_PERINGATAN_HARI_SEBELUM', '2', 'Hari sebelum tarikh akhir untuk peringatan laporan kewangan']
];

var Kewangan = (function () {
  var TAB = 'Laporan_Bulanan';
  var EDITABLE = ['Belum Dihantar', 'Lewat', 'Perlu Pembetulan'];
  var STATUS_SSU_LAPOR = ['Aktif', 'Tamat Tempoh', ''];
  var MAKS_TERTUNGGAK = 36; // bulan; jangan jana ke belakang melebihi ini
  var EN_STATUS = { 'Belum Dihantar': 'Not submitted', Dihantar: 'Submitted', Lewat: 'Late', 'Perlu Pembetulan': 'Needs correction', Diterima: 'Accepted' };

  // ---------- Pembantu ----------
  function str_(v) { return Util.str(v); }
  function r2_(n) { return Math.round(n * 100) / 100; }
  function idx_(y, m) { return y * 12 + (m - 1); }
  function fromIdx_(i) { return { tahun: Math.floor(i / 12), bulan: (i % 12) + 1 }; }
  function dateOf_(y, m, d) { return Util.toDate(y + '-' + Util.pad(m, 2) + '-' + Util.pad(d, 2)); }
  function dayCfg_(key, def) {
    var n = Math.floor(Cfg.num(key, def));
    return n < 1 ? 1 : (n > 28 ? 28 : n);
  }
  function todayOf_(h) {
    if (h === undefined || h === null || h === '') return new Date();
    return Util.toDate(h) || new Date();
  }
  /** Tarikh akhir hantar bagi tempoh (tahun, bulan): hari ke-N bulan berikutnya. */
  function akhirOf_(y, m) {
    var n = fromIdx_(idx_(y, m) + 1);
    return dateOf_(n.tahun, n.bulan, dayCfg_('TARIKH_AKHIR_LAPORAN_HARI', 7));
  }
  function janaOf_(y, m) {
    var n = fromIdx_(idx_(y, m) + 1);
    return dateOf_(n.tahun, n.bulan, dayCfg_('JANA_LAPORAN_HARI', 1));
  }
  function numOrNull_(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function rm_(n) { return 'RM ' + (Math.round(n * 100) / 100).toFixed(2); }

  // ---------- Capaian data ----------
  function laporanRow_(id) {
    if (!id) return null;
    var l = Db.find(TAB, function (r) { return str_(r.ID_Laporan) === id; });
    return l.length ? l[0] : null;
  }
  function perById_(id) {
    var l = Db.find('Perniagaan', function (r) { return str_(r.ID_Perniagaan) === id; });
    return l.length ? l[0] : null;
  }
  function pelajarRow_(m) {
    var l = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    return l.length ? l[0] : null;
  }
  function emelOf_(m) {
    var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    if (pg.length && str_(pg[0].Emel)) return Util.normEmail(pg[0].Emel);
    var p = pelajarRow_(m);
    return p ? Util.normEmail(p.Emel) : '';
  }
  function ownerOf_(per) { return Util.normMatric(per.No_Matrik_Pemilik); }
  function aktifPer_(per) { return STATUS_SSU_LAPOR.indexOf(str_(per.Status_SSU)) >= 0; }

  /** Baris Sewaan Aktif bagi perniagaan (tab milik modul Ruang Niaga; mungkin kosong atau belum ada). */
  function sewaanAktif_(perId, cache) {
    var rows = cache;
    if (!rows) {
      try { rows = Db.rows('Sewaan'); } catch (e) { rows = []; }
    }
    for (var i = 0; i < rows.length; i++) {
      if (str_(rows[i].ID_Perniagaan) === perId && str_(rows[i].Status).toLowerCase() === 'aktif') return rows[i];
    }
    return null;
  }
  function sewaanRows_() {
    try { return Db.rows('Sewaan'); } catch (e) { return []; }
  }

  /** Set No. Matrik ahli pasukan SSU bagi perniagaan (semua permohonan Diluluskan perniagaan itu). */
  function ahliSet_(per) {
    var perId = str_(per.ID_Perniagaan);
    var ids = {};
    if (str_(per.ID_Permohonan_SSU)) ids[str_(per.ID_Permohonan_SSU)] = true;
    Db.find('Permohonan_SSU', function (r) { return str_(r.ID_Perniagaan) === perId && str_(r.Status) === 'Diluluskan'; })
      .forEach(function (r) { ids[str_(r.ID_Permohonan)] = true; });
    var out = {};
    Db.find('Ahli_Pasukan', function (r) { return ids[str_(r.ID_Permohonan)]; })
      .forEach(function (r) { out[Util.normMatric(r.No_Matrik)] = true; });
    return out;
  }

  /** Perniagaan yang dimiliki atau disertai pelajar: [{per, peranan}] (pemilik dahulu). */
  function perniagaanSaya_(m) {
    var all = Db.rows('Perniagaan');
    var own = all.filter(function (p) { return ownerOf_(p) === m; }).map(function (p) { return { per: p, peranan: 'pemilik' }; });
    var ids = {};
    Db.find('Ahli_Pasukan', function (r) { return Util.normMatric(r.No_Matrik) === m; }).forEach(function (r) { ids[str_(r.ID_Permohonan)] = true; });
    if (!Object.keys(ids).length) return own;
    var perIds = {};
    Db.find('Permohonan_SSU', function (r) { return ids[str_(r.ID_Permohonan)] && str_(r.Status) === 'Diluluskan' && str_(r.ID_Perniagaan); })
      .forEach(function (r) { perIds[str_(r.ID_Perniagaan)] = true; });
    var mem = all.filter(function (p) {
      return ownerOf_(p) !== m && (perIds[str_(p.ID_Perniagaan)] || ids[str_(p.ID_Permohonan_SSU)]);
    }).map(function (p) { return { per: p, peranan: 'ahli' }; });
    return own.concat(mem);
  }

  /** Akses pelajar kepada satu laporan. Pulang {per, peranan} atau lempar KEW_TIDAK_DITEMUI. */
  function akses_(ctx, row) {
    var per = perById_(str_(row.ID_Perniagaan));
    if (!per || !ctx.noMatrik) throw appError_('KEW_TIDAK_DITEMUI');
    if (ownerOf_(per) === ctx.noMatrik) return { per: per, peranan: 'pemilik' };
    if (ahliSet_(per)[ctx.noMatrik]) return { per: per, peranan: 'ahli' };
    throw appError_('KEW_TIDAK_DITEMUI');
  }

  // ---------- Kebenaran admin ----------
  function requireViewer_(ctx) {
    if ([ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI].indexOf(ctx.role) < 0) throw appError_('TIADA_KEBENARIAN');
  }
  function canDecide_(ctx) {
    if (ctx.role === ROLE.ADMIN_PENUH) return true;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      return !mod || mod.indexOf('semua') >= 0 || mod.indexOf('kewangan') >= 0;
    }
    return false;
  }
  function requireDecider_(ctx) { if (!canDecide_(ctx)) throw appError_('TIADA_KEBENARIAN'); }

  // ---------- Pemetaan baris -> paparan ----------
  function hantarLewat_(r) {
    var h = Util.toDate(r.Tarikh_Hantar), a = Util.toDate(r.Tarikh_Akhir);
    return !!(h && a && Util.daysBetween(a, h) > 0);
  }

  function ringkas_(r) {
    var st = str_(r.Status);
    return {
      id: str_(r.ID_Laporan), perniagaanId: str_(r.ID_Perniagaan), bulan: Number(r.Bulan) || 0, tahun: Number(r.Tahun) || 0,
      status: st, statusEn: EN_STATUS[st] || '',
      tiadaAktiviti: Util.truthy(r.Tiada_Aktiviti),
      pendapatan: numOrNull_(r.Pendapatan_RM), perbelanjaan: numOrNull_(r.Perbelanjaan_RM), untung: numOrNull_(r.Untung_RM),
      adaFail: !!str_(r.Fail_Laporan),
      tarikhAkhir: Util.dateKey(r.Tarikh_Akhir), tarikhHantar: Util.dateKey(r.Tarikh_Hantar), hantarLewat: hantarLewat_(r),
      disemakOleh: str_(r.Disemak_Oleh), tarikhSemakan: Util.dateKey(r.Tarikh_Semakan),
      catatan: (st === 'Perlu Pembetulan' || st === 'Diterima') ? str_(r.Catatan_Semakan) : '',
      boleh: EDITABLE.indexOf(st) >= 0
    };
  }

  /** Paparan satu laporan (butiran borang). */
  function paparan_(r, per, peranan) {
    var o = ringkas_(r);
    var wajib = !!sewaanAktif_(str_(r.ID_Perniagaan));
    o.bolehUbah = peranan === 'pemilik' && o.boleh;
    return {
      laporan: o,
      borang: { tiadaAktiviti: o.tiadaAktiviti, pendapatan: o.pendapatan === null ? '' : String(o.pendapatan), perbelanjaan: o.perbelanjaan === null ? '' : String(o.perbelanjaan), bilPekerja: str_(r.Bil_Pekerja) },
      perniagaan: { id: str_(per.ID_Perniagaan), nama: str_(per.Nama_Perniagaan), noPendaftaran: str_(per.No_Pendaftaran), statusSsu: str_(per.Status_SSU) },
      peranan: peranan, wajibFail: wajib, tarikhAkhirHari: dayCfg_('TARIKH_AKHIR_LAPORAN_HARI', 7)
    };
  }

  // ---------- Pelajar ----------
  function requireStudent_(ctx) {
    if (!ctx.noMatrik) throw appError_('MATRIK_TIDAK_DITEMUI');
  }

  function templatAda_() {
    var l = Db.links().TEMPLAT_LAPORAN_KEWANGAN;
    return !!(l && l.url);
  }

  function saya_(ctx) {
    requireStudent_(ctx);
    var list = perniagaanSaya_(ctx.noMatrik);
    var sewaan = sewaanRows_();
    var belum = 0;
    var out = list.map(function (x) {
      var perId = str_(x.per.ID_Perniagaan);
      var rows = Db.find(TAB, function (r) { return str_(r.ID_Perniagaan) === perId; });
      rows.sort(function (a, b) { return (Number(b.Tahun) * 12 + Number(b.Bulan)) - (Number(a.Tahun) * 12 + Number(a.Bulan)); });
      var lap = rows.map(function (r) {
        var o = ringkas_(r);
        o.bolehUbah = x.peranan === 'pemilik' && o.boleh;
        if (o.boleh) belum++;
        return o;
      });
      return {
        id: perId, nama: str_(x.per.Nama_Perniagaan), noPendaftaran: str_(x.per.No_Pendaftaran), statusSsu: str_(x.per.Status_SSU),
        peranan: x.peranan, penyewaLot: !!sewaanAktif_(perId, sewaan), laporan: lap
      };
    });
    return { perniagaan: out, belum: belum, templatAda: templatAda_(), tarikhAkhirHari: dayCfg_('TARIKH_AKHIR_LAPORAN_HARI', 7) };
  }

  function dapat_(ctx, p) {
    requireStudent_(ctx);
    var r = laporanRow_(str_(p.id));
    if (!r) throw appError_('KEW_TIDAK_DITEMUI');
    var a = akses_(ctx, r);
    return paparan_(r, a.per, a.peranan);
  }

  /** Semak medan hantar. Pulang {nilai, fail, ralat}. */
  function semak_(d, opts) {
    var e = {}, v = {};
    v.tiada = d.tiadaAktiviti === true || d.tiadaAktiviti === 'true';
    var bp = str_(d.bilPekerja);
    if (v.tiada && bp === '') v.bilPekerja = 0;
    else if (!/^\d{1,3}$/.test(bp)) { v.bilPekerja = null; e.bilPekerja = 'Nombor bulat 0 hingga 999 / Whole number 0 to 999'; }
    else v.bilPekerja = parseInt(bp, 10);
    if (v.tiada) {
      v.pendapatan = 0; v.perbelanjaan = 0;
    } else {
      v.pendapatan = Util.parseRm(d.pendapatan);
      v.perbelanjaan = Util.parseRm(d.perbelanjaan);
      if (v.pendapatan === null) e.pendapatan = 'Masukkan nilai RM yang tepat, tidak negatif (contoh 1500.00) / Enter an exact RM value, not negative';
      if (v.perbelanjaan === null) e.perbelanjaan = 'Masukkan nilai RM yang tepat, tidak negatif (contoh 800.00) / Enter an exact RM value, not negative';
    }
    v.untung = (v.pendapatan === null || v.perbelanjaan === null) ? null : r2_(v.pendapatan - v.perbelanjaan);
    var fail = null;
    if (d.fail && d.fail.data) {
      try { fail = Files.validate(d.fail, ['pdf', 'xlsx', 'xls']); }
      catch (err) { e.fail = 'Fail tidak sah (PDF atau Excel, saiz dihadkan) / Invalid file (PDF or Excel, size limited)'; }
    }
    if (!fail && !e.fail && opts.wajibFail && !v.tiada && !opts.adaFail) {
      e.fail = 'Fail laporan wajib bagi penyewa lot (PDF atau Excel) / The report file is required for lot tenants';
    }
    if (d.perakuan !== true) e.perakuan = 'Perakuan wajib / The declaration is required';
    return { nilai: v, fail: fail, ralat: e };
  }

  function sendMail_(to, subjectBm, subjectEn, bm, en) {
    if (!to) return 'Tiada emel';
    try {
      var url = Cfg.get('WEBAPP_URL', '');
      if (url) { bm = bm.concat(['Buka UTMPreneur: ' + url]); en = en.concat(['Open UTMPreneur: ' + url]); }
      return Mail.send(to, { subjectBm: subjectBm, subjectEn: subjectEn, bm: bm, en: en }) ? 'Dihantar' : 'Dilangkau (MOD UJI)';
    } catch (err) {
      console.error('Emel gagal: ' + err);
      return 'Gagal';
    }
  }

  function labelBulan_(r) { return Util.BULAN_BM[(Number(r.Bulan) || 1) - 1] + ' ' + r.Tahun; }

  /** Hantar (atau hantar semula) laporan. ctx pelajar pemilik, atau konteks Bantu.ctx bagi pihak pemilik. */
  function hantar_(ctx, d) {
    requireStudent_(ctx);
    d = d || {};
    var id = str_(d.id);
    var row = laporanRow_(id);
    if (!row) throw appError_('KEW_TIDAK_DITEMUI');
    var a = akses_(ctx, row);
    if (a.peranan !== 'pemilik') throw appError_('KEW_HANYA_PEMILIK');
    if (EDITABLE.indexOf(str_(row.Status)) < 0) throw appError_('KEW_TIDAK_BOLEH_UBAH');

    var perId = str_(row.ID_Perniagaan);
    var sewaan = sewaanAktif_(perId);
    var chk = semak_(d, { wajibFail: !!sewaan, adaFail: !!str_(row.Fail_Laporan) });
    if (Object.keys(chk.ralat).length) throw appError_('KEW_TIDAK_SAH', { medan: chk.ralat });
    var v = chk.nilai;

    var urlFail = str_(row.Fail_Laporan);
    if (chk.fail) {
      var stamp = Util.fmtDate(new Date(), 'yyyyMMddHHmm');
      urlFail = Files.save('FLD_LAPORAN_KEWANGAN', 'LAPORAN_' + perId + '_' + row.Tahun + '-' + Util.pad(row.Bulan, 2) + '_' + stamp, chk.fail);
    }

    var info = Db.withLock(function () {
      var cur = laporanRow_(id);
      if (!cur || EDITABLE.indexOf(str_(cur.Status)) < 0) throw appError_('KEW_TIDAK_BOLEH_UBAH');
      var lama = str_(cur.Status);
      Db.update(TAB, cur._row, {
        ID_Sewaan: sewaan ? str_(sewaan.ID_Sewaan) : str_(cur.ID_Sewaan),
        Tiada_Aktiviti: v.tiada ? 'Ya' : 'Tidak', Pendapatan_RM: v.pendapatan, Perbelanjaan_RM: v.perbelanjaan, Untung_RM: v.untung, Bil_Pekerja: v.bilPekerja,
        Fail_Laporan: urlFail, Perakuan: 'Ya', Status: 'Dihantar', Tarikh_Hantar: new Date()
      });
      Audit.log(ctx, ctx.bagiPihak ? 'KEW_HANTAR_BAGI_PIHAK' : 'KEW_HANTAR', 'Kewangan', id, lama, 'Dihantar',
        (v.tiada ? 'Tiada aktiviti' : rm_(v.pendapatan) + ' / ' + rm_(v.perbelanjaan) + ' / untung ' + rm_(v.untung)) +
        (ctx.bagiPihak ? ' | perakuan diakui admin bagi pihak pemilik' : ' | perakuan pemilik diterima'));
      return { lama: lama };
    });
    var lbl = labelBulan_(row);
    sendMail_(emelOf_(ownerOf_(a.per)), 'Laporan kewangan diterima', 'Financial report received',
      ['Laporan kewangan ' + lbl + ' bagi ' + str_(a.per.Nama_Perniagaan) + ' telah dihantar dan akan disemak oleh UTMXCITE.'],
      ['The ' + lbl + ' financial report for ' + str_(a.per.Nama_Perniagaan) + ' has been submitted and will be reviewed by UTMXCITE.']);
    kpiKemaskini_([{ tahun: Number(row.Tahun), bulan: Number(row.Bulan) }]);
    return { id: id, lama: info.lama };
  }

  function hantarPelajar_(ctx, d) {
    var r = hantar_(ctx, d);
    return { id: r.id, ringkasan: saya_(ctx) };
  }

  // ---------- Fail dan templat ----------
  function fail_(ctx, p) {
    var r = laporanRow_(str_(p.id));
    if (!r) throw appError_('KEW_TIDAK_DITEMUI');
    var admin = [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI].indexOf(ctx.role) >= 0;
    if (!admin) akses_(ctx, r);
    var url = str_(r.Fail_Laporan);
    if (!url) throw appError_('KEW_FAIL_TIADA');
    if (admin) Audit.log(ctx, 'KEW_PAPAR_FAIL', 'Kewangan', str_(r.ID_Laporan), '', '', '');
    return Files.read(url);
  }

  function templat_() {
    var l = Db.links().TEMPLAT_LAPORAN_KEWANGAN;
    if (!l || !l.url) throw appError_('KEW_TEMPLAT_TIADA');
    try { return Files.read(l.url); }
    catch (e) { throw appError_('KEW_TEMPLAT_TIADA'); }
  }

  // ---------- Ringkasan dan KPI ----------
  /** Ringkasan satu set baris laporan (satu tempoh). Hanya Diterima dijumlahkan. */
  function ringkasanRows_(rows) {
    var s = { bilPerniagaan: rows.length, diterima: 0, dihantar: 0, lewat: 0, belum: 0, pembetulan: 0, hantarLewat: 0, pendapatan: 0, perbelanjaan: 0, untung: 0 };
    rows.forEach(function (r) {
      var st = str_(r.Status);
      if (st === 'Diterima') {
        s.diterima++;
        s.pendapatan += Number(r.Pendapatan_RM) || 0; s.perbelanjaan += Number(r.Perbelanjaan_RM) || 0; s.untung += Number(r.Untung_RM) || 0;
      } else if (st === 'Dihantar') s.dihantar++;
      else if (st === 'Lewat') s.lewat++;
      else if (st === 'Belum Dihantar') s.belum++;
      else if (st === 'Perlu Pembetulan') s.pembetulan++;
      if ((st === 'Diterima' || st === 'Dihantar') && hantarLewat_(r)) s.hantarLewat++;
    });
    s.pendapatan = r2_(s.pendapatan); s.perbelanjaan = r2_(s.perbelanjaan); s.untung = r2_(s.untung);
    s.pematuhanPct = rows.length ? Math.round((s.diterima + s.dihantar) / rows.length * 1000) / 10 : 0;
    return s;
  }

  /** Tulis ringkasan tempoh ke Ringkasan_KPI (kemas kini baris sedia ada, tambah yang baharu). Mesti dipanggil di luar kunci. */
  function kpiKemaskini_(periods) {
    var seen = {}, want = {};
    var all = Db.rows(TAB);
    periods.forEach(function (p) {
      var key = p.tahun + '_' + Util.pad(p.bulan, 2);
      if (seen[key]) return;
      seen[key] = true;
      var s = ringkasanRows_(all.filter(function (r) { return Number(r.Tahun) === p.tahun && Number(r.Bulan) === p.bulan; }));
      want['KEW_BIL_PERNIAGAAN_' + key] = s.bilPerniagaan;
      want['KEW_BIL_DITERIMA_' + key] = s.diterima;
      want['KEW_BIL_DIHANTAR_' + key] = s.dihantar;
      want['KEW_BIL_LEWAT_' + key] = s.lewat;
      want['KEW_BIL_BELUM_' + key] = s.belum;
      want['KEW_BIL_PEMBETULAN_' + key] = s.pembetulan;
      want['KEW_PEMATUHAN_PCT_' + key] = s.pematuhanPct;
      want['KEW_PENDAPATAN_DITERIMA_' + key] = s.pendapatan;
      want['KEW_PERBELANJAAN_DITERIMA_' + key] = s.perbelanjaan;
      want['KEW_UNTUNG_DITERIMA_' + key] = s.untung;
    });
    if (!Object.keys(want).length) return 0;
    return Db.withLock(function () {
      var cur = {};
      Db.rows('Ringkasan_KPI').forEach(function (r) { cur[str_(r.Petunjuk)] = r; });
      var n = 0, now = new Date();
      Object.keys(want).forEach(function (k) {
        var r = cur[k];
        if (r) {
          if (String(r.Nilai) === String(want[k])) return;
          Db.update('Ringkasan_KPI', r._row, { Nilai: want[k], Kemas_Kini: now });
        } else {
          Db.append('Ringkasan_KPI', { Petunjuk: k, Nilai: want[k], Kemas_Kini: now });
        }
        n++;
      });
      return n;
    });
  }

  // ---------- Admin ----------
  function pemilikMap_() {
    var m = {};
    Db.rows('PELAJAR').forEach(function (r) { m[Util.normMatric(r.No_Matrik)] = r; });
    return m;
  }
  function perMap_() {
    var m = {};
    Db.rows('Perniagaan').forEach(function (r) { m[str_(r.ID_Perniagaan)] = r; });
    return m;
  }

  /** Tapis mengikut tempoh/status/carian. Pulang {rows, tempoh, senaraiTempoh, semuaRows}. */
  function tapis_(p) {
    p = p || {};
    var all = Db.rows(TAB);
    var periods = {};
    all.forEach(function (r) { periods[Number(r.Tahun) * 100 + Number(r.Bulan)] = { tahun: Number(r.Tahun), bulan: Number(r.Bulan) }; });
    var list = Object.keys(periods).map(function (k) { return periods[k]; }).sort(function (a, b) { return (b.tahun * 12 + b.bulan) - (a.tahun * 12 + a.bulan); });

    var tahun = parseInt(p.tahun, 10), bulan;
    var bsemua = p.bulan === 0 || p.bulan === '0' || p.bulan === 'SEMUA';
    if (isNaN(tahun)) {
      // tiada tempoh dinyatakan: tempoh terkini yang ada baris
      if (list.length) { tahun = list[0].tahun; bulan = bsemua ? 0 : list[0].bulan; }
      else { tahun = parseInt(Util.fmtDate(new Date(), 'yyyy'), 10); bulan = 0; }
    } else {
      bulan = bsemua || p.bulan === undefined || p.bulan === '' || p.bulan === null ? 0 : (parseInt(p.bulan, 10) || 0);
    }
    var scope = all.filter(function (r) { return Number(r.Tahun) === tahun && (!bulan || Number(r.Bulan) === bulan); });

    var status = str_(p.status), q = str_(p.q).toLowerCase();
    var pm = perMap_(), pl = pemilikMap_();
    var rows = scope.filter(function (r) {
      if (status && status !== 'SEMUA' && str_(r.Status) !== status) return false;
      if (q) {
        var per = pm[str_(r.ID_Perniagaan)] || {};
        var m = Util.normMatric(per.No_Matrik_Pemilik);
        var h = (str_(r.ID_Laporan) + ' ' + str_(r.ID_Perniagaan) + ' ' + str_(per.Nama_Perniagaan) + ' ' + m + ' ' + str_((pl[m] || {}).Nama_Penuh)).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) {
      var na = str_((pm[str_(a.ID_Perniagaan)] || {}).Nama_Perniagaan), nb = str_((pm[str_(b.ID_Perniagaan)] || {}).Nama_Perniagaan);
      return na < nb ? -1 : (na > nb ? 1 : (Number(a.Bulan) - Number(b.Bulan)));
    });
    return { rows: rows, scope: scope, all: all, tempoh: { tahun: tahun, bulan: bulan }, senaraiTempoh: list, pm: pm, pl: pl };
  }

  function barisAdmin_(r, pm, pl, sewaan) {
    var o = ringkas_(r);
    var per = pm[o.perniagaanId] || {};
    var m = Util.normMatric(per.No_Matrik_Pemilik);
    o.perniagaan = str_(per.Nama_Perniagaan);
    o.noMatrik = m;
    o.pemilik = str_((pl[m] || {}).Nama_Penuh);
    o.penyewaLot = !!sewaanAktif_(o.perniagaanId, sewaan);
    return o;
  }

  function adminSenarai_(ctx, p) {
    requireViewer_(ctx);
    if (p && p.kiraanSahaja) { // untuk pil menu utama: tidak perlu senarai penuh
      return { menunggu: Db.find(TAB, function (r) { return str_(r.Status) === 'Dihantar'; }).length };
    }
    var t = tapis_(p);
    var sewaan = sewaanRows_();
    var kiraan = { 'Belum Dihantar': 0, Dihantar: 0, Lewat: 0, 'Perlu Pembetulan': 0, Diterima: 0 };
    t.scope.forEach(function (r) { var s = str_(r.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var menunggu = t.all.filter(function (r) { return str_(r.Status) === 'Dihantar'; }).length;
    return {
      tempoh: t.tempoh, senaraiTempoh: t.senaraiTempoh, kiraan: kiraan, menunggu: menunggu,
      ringkasan: ringkasanRows_(t.scope), jumlah: t.rows.length,
      senarai: t.rows.slice(0, 500).map(function (r) { return barisAdmin_(r, t.pm, t.pl, sewaan); }),
      bolehPutus: canDecide_(ctx), bolehBantu: Bantu.allowed(ctx, 'kewangan'), tarikhAkhirHari: dayCfg_('TARIKH_AKHIR_LAPORAN_HARI', 7)
    };
  }

  function adminButiran_(ctx, p) {
    requireViewer_(ctx);
    var r = laporanRow_(str_(p.id));
    if (!r) throw appError_('KEW_TIDAK_DITEMUI');
    var per = perById_(str_(r.ID_Perniagaan)) || {};
    var out = paparan_(r, per, 'admin');
    var m = ownerOf_(per);
    var pel = pelajarRow_(m) || {};
    out.pemilik = { noMatrik: m, nama: str_(pel.Nama_Penuh), emel: str_(pel.Emel), telefon: str_(pel.No_Telefon), fakulti: str_(pel.Fakulti) };
    out.bolehPutus = canDecide_(ctx) && str_(r.Status) === 'Dihantar';
    out.bolehBantu = Bantu.allowed(ctx, 'kewangan') && EDITABLE.indexOf(str_(r.Status)) >= 0;
    out.laporan.bolehUbah = false;
    return out;
  }

  function adminPutus_(ctx, p) {
    requireDecider_(ctx);
    var id = str_(p.id), t = str_(p.tindakan), cat = str_(p.catatan).substr(0, 500);
    if (t !== 'terima' && t !== 'pembetulan') throw appError_('KEW_PERALIHAN_TIDAK_SAH');
    if (t === 'pembetulan' && !cat) throw appError_('KEW_CATATAN_WAJIB');
    var ke = t === 'terima' ? 'Diterima' : 'Perlu Pembetulan';
    var info = Db.withLock(function () {
      var r = laporanRow_(id);
      if (!r) throw appError_('KEW_TIDAK_DITEMUI');
      var lama = str_(r.Status);
      if (lama !== 'Dihantar') throw appError_('KEW_PERALIHAN_TIDAK_SAH');
      Db.update(TAB, r._row, { Status: ke, Disemak_Oleh: ctx.email, Tarikh_Semakan: new Date(), Catatan_Semakan: cat });
      Audit.log(ctx, 'KEW_' + t.toUpperCase(), 'Kewangan', id, lama, ke, cat);
      return { perId: str_(r.ID_Perniagaan), lbl: labelBulan_(r), tahun: Number(r.Tahun), bulan: Number(r.Bulan) };
    });
    var per = perById_(info.perId) || {};
    var to = emelOf_(ownerOf_(per));
    var nama = str_(per.Nama_Perniagaan);
    if (t === 'terima') {
      sendMail_(to, 'Laporan kewangan diterima', 'Financial report accepted',
        ['Laporan kewangan ' + info.lbl + ' bagi ' + nama + ' telah disemak dan DITERIMA. Terima kasih.'],
        ['The ' + info.lbl + ' financial report for ' + nama + ' has been reviewed and ACCEPTED. Thank you.']);
    } else {
      sendMail_(to, 'Laporan kewangan perlu dibetulkan', 'Financial report needs correction',
        ['Laporan kewangan ' + info.lbl + ' bagi ' + nama + ' perlu dibetulkan. Catatan admin: ' + cat + ' Sila hantar semula dalam UTMPreneur.'],
        ['The ' + info.lbl + ' financial report for ' + nama + ' needs correction. Admin note: ' + cat + ' Please resubmit in UTMPreneur.']);
    }
    kpiKemaskini_([{ tahun: info.tahun, bulan: info.bulan }]);
    return adminButiran_(ctx, { id: id });
  }

  /** Admin menghantar laporan bagi pihak pemilik perniagaan (perakuan diakui admin). */
  function adminHantar_(ctx, p) {
    var r = laporanRow_(str_(p.id));
    if (!r) throw appError_('KEW_TIDAK_DITEMUI');
    var per = perById_(str_(r.ID_Perniagaan));
    var m = Util.str(p.noMatrik) ? p.noMatrik : (per ? ownerOf_(per) : '');
    var c = Bantu.ctx(ctx, m, 'kewangan');
    hantar_(c, p);
    return adminButiran_(ctx, { id: str_(p.id) });
  }

  function csvCell_(v, teks) {
    var s = v === null || v === undefined ? '' : String(v);
    if (teks && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // elak suntikan formula apabila dibuka dalam Excel
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function adminCsv_(ctx, p) {
    requireViewer_(ctx);
    var t = tapis_(p);
    var sewaan = sewaanRows_();
    var tajuk = ['ID_Laporan', 'ID_Perniagaan', 'Nama_Perniagaan', 'No_Matrik_Pemilik', 'No_KP', 'Nama_Pemilik', 'Bulan', 'Tahun', 'Status', 'Tiada_Aktiviti',
      'Pendapatan_RM', 'Perbelanjaan_RM', 'Untung_RM', 'Penyewa_Lot', 'Tarikh_Akhir', 'Tarikh_Hantar', 'Hantar_Lewat', 'Disemak_Oleh', 'Tarikh_Semakan', 'Catatan_Semakan'];
    var lines = [tajuk.join(',')];
    t.rows.forEach(function (r) {
      var o = barisAdmin_(r, t.pm, t.pl, sewaan);
      var rec = [
        [o.id, 1], [o.perniagaanId, 1], [o.perniagaan, 1], [o.noMatrik, 1], [ctx.role === ROLE.ADMIN_PENUH ? str_(r.No_KP) : '', 1], [o.pemilik, 1], [o.bulan, 0], [o.tahun, 0], [o.status, 1],
        [o.tiadaAktiviti ? 'Ya' : 'Tidak', 1], [o.pendapatan, 0], [o.perbelanjaan, 0], [o.untung, 0], [o.penyewaLot ? 'Ya' : 'Tidak', 1],
        [o.tarikhAkhir, 0], [o.tarikhHantar, 0], [o.hantarLewat ? 'Ya' : 'Tidak', 1], [o.disemakOleh, 1], [o.tarikhSemakan, 0], [str_(r.Catatan_Semakan), 1]
      ];
      lines.push(rec.map(function (c) { return csvCell_(c[0], c[1]); }).join(','));
    });
    var nama = 'laporan-kewangan_' + t.tempoh.tahun + (t.tempoh.bulan ? '-' + Util.pad(t.tempoh.bulan, 2) : '') + '.csv';
    Audit.log(ctx, 'KEW_EKSPORT_CSV', 'Kewangan', nama, '', String(t.rows.length), '');
    return { nama: nama, mime: 'text/csv', teks: '﻿' + lines.join('\r\n') + '\r\n', bil: t.rows.length };
  }

  function adminJana_(ctx) {
    requireDecider_(ctx);
    var h = jobHarian_({ paksa: true, tanpaEmel: true });
    Audit.log(ctx, 'KEW_JANA_MANUAL', 'Kewangan', '', '', String(h.dijana), 'Ditanda Lewat: ' + h.lewat);
    return h;
  }

  // ---------- Kerja harian ----------
  /** Indeks bulan laporan pertama bagi perniagaan: bulan tarikh terkemudian antara Tarikh_Pendaftaran dan Dicipta_Pada. */
  function mulaIdx_(per) {
    var a = Util.toDate(per.Tarikh_Pendaftaran), b = Util.toDate(per.Dicipta_Pada);
    var d = a && b ? (a.getTime() >= b.getTime() ? a : b) : (a || b);
    if (!d) return null;
    var k = Util.dateKey(d).split('-');
    return idx_(parseInt(k[0], 10), parseInt(k[1], 10));
  }

  /**
   * Kerja harian. Boleh dijalankan semula tanpa kesan berganda. opts (untuk ujian dan admin):
   * {hari: Date|'yyyy-mm-dd', paksa: jana hingga bulan semasa tanpa menunggu hari penjanaan, tanpaEmel: jangan hantar peringatan}.
   */
  function jobHarian_(opts) {
    opts = opts || {};
    var today = todayOf_(opts.hari);
    var tk = Util.dateKey(today);
    var tp = tk.split('-').map(function (x) { return parseInt(x, 10); });
    var mi = idx_(tp[0], tp[1]);
    var genDay = dayCfg_('JANA_LAPORAN_HARI', 1);
    var last = opts.paksa ? mi : (tp[2] >= genDay ? mi - 1 : mi - 2);
    var hasil = { dijana: 0, lewat: 0, peringatan: 0, kpi: 0 };

    // (a) jana baris yang belum ada, (b) tukar Belum Dihantar kepada Lewat: dalam satu kunci supaya tidak bertindih dengan penghantaran pelajar
    Db.withLock(function () {
      var rows = Db.rows(TAB);
      var have = {};
      rows.forEach(function (r) { have[str_(r.ID_Perniagaan) + '|' + Number(r.Tahun) + '|' + Number(r.Bulan)] = true; });
      var sewaan = sewaanRows_();
      Db.rows('Perniagaan').forEach(function (per) {
        if (!aktifPer_(per)) return;
        var perId = str_(per.ID_Perniagaan);
        var start = mulaIdx_(per);
        if (!perId || start === null) return;
        if (start < last - MAKS_TERTUNGGAK + 1) start = last - MAKS_TERTUNGGAK + 1;
        for (var i = start; i <= last; i++) {
          var pr = fromIdx_(i);
          var key = perId + '|' + pr.tahun + '|' + pr.bulan;
          if (have[key]) continue;
          var sw = sewaanAktif_(perId, sewaan);
          var id = Util.formatId('LKB', pr.tahun, Db.nextSeqLocked('LKB_' + pr.tahun), 4);
          Db.append(TAB, {
            ID_Laporan: id, ID_Perniagaan: perId, ID_Sewaan: sw ? str_(sw.ID_Sewaan) : '', Bulan: pr.bulan, Tahun: pr.tahun,
            Status: 'Belum Dihantar', Tarikh_Akhir: akhirOf_(pr.tahun, pr.bulan)
          });
          have[key] = true;
          hasil.dijana++;
        }
      });
      Db.rows(TAB).forEach(function (r) {
        if (str_(r.Status) !== 'Belum Dihantar') return;
        var a = Util.toDate(r.Tarikh_Akhir);
        if (a && Util.daysBetween(a, today) > 0) {
          Db.update(TAB, r._row, { Status: 'Lewat' });
          hasil.lewat++;
        }
      });
    });
    if (hasil.dijana) Audit.log({ email: 'sistem', role: '-' }, 'KEW_JANA', 'Kewangan', tk, '', String(hasil.dijana), 'Baris Laporan_Bulanan dijana');
    if (hasil.lewat) Audit.log({ email: 'sistem', role: '-' }, 'KEW_LEWAT', 'Kewangan', tk, '', String(hasil.lewat), 'Belum Dihantar menjadi Lewat');

    // (c) peringatan
    if (!opts.tanpaEmel) hasil.peringatan = peringatan_(today);

    // ringkasan KPI bagi semua tempoh yang ada
    var seen = {}, periods = [];
    Db.rows(TAB).forEach(function (r) {
      var k = Number(r.Tahun) + '-' + Number(r.Bulan);
      if (!seen[k]) { seen[k] = true; periods.push({ tahun: Number(r.Tahun), bulan: Number(r.Bulan) }); }
    });
    hasil.kpi = kpiKemaskini_(periods);
    return hasil;
  }

  function peringatan_(today) {
    var n = 0;
    var tk = Util.dateKey(today);
    var sebelum = Math.max(0, Math.floor(Cfg.num('KEW_PERINGATAN_HARI_SEBELUM', 2)));
    var susulan = Math.max(1, Math.floor(Cfg.num('PERINGATAN_SUSULAN_HARI', 3)));
    var logs = {};
    Db.rows('Peringatan').forEach(function (l) { logs[str_(l.Jenis)] = true; });
    var pm = perMap_();
    var emel = {};
    Db.rows('Pengguna').forEach(function (r) { var m = Util.normMatric(r.No_Matrik); if (m && str_(r.Emel)) emel[m] = Util.normEmail(r.Emel); });
    Db.rows('PELAJAR').forEach(function (r) { var m = Util.normMatric(r.No_Matrik); if (m && !emel[m] && str_(r.Emel)) emel[m] = Util.normEmail(r.Emel); });

    Db.rows(TAB).forEach(function (r) {
      var st = str_(r.Status);
      if (st !== 'Belum Dihantar' && st !== 'Lewat') return;
      var per = pm[str_(r.ID_Perniagaan)];
      var akhir = Util.toDate(r.Tarikh_Akhir);
      if (!per || !akhir) return;
      var id = str_(r.ID_Laporan);
      var daysTo = Util.daysBetween(today, akhir);
      var kunci = '', jenisBm = '', jenisEn = '';
      if (st === 'Belum Dihantar' && daysTo >= 0) {
        if (daysTo <= sebelum) { kunci = 'KEW_H2_' + id; jenisBm = 'Peringatan: tarikh akhir laporan kewangan hampir tiba'; jenisEn = 'Reminder: financial report due soon'; }
        else if (tk >= Util.dateKey(janaOf_(Number(r.Tahun), Number(r.Bulan)))) { kunci = 'KEW_JANA_' + id; jenisBm = 'Sila hantar laporan kewangan bulanan'; jenisEn = 'Please submit your monthly financial report'; }
      } else if (st === 'Lewat' && daysTo < 0) {
        var b = Math.floor((-daysTo - 1) / susulan);
        kunci = 'KEW_LEWAT_' + id + '_' + b;
        jenisBm = 'Laporan kewangan anda telah lewat'; jenisEn = 'Your financial report is overdue';
      }
      if (!kunci || logs[kunci]) return;
      var m = ownerOf_(per);
      var to = emel[m] || '';
      var lbl = labelBulan_(r);
      var nama = str_(per.Nama_Perniagaan);
      var akhirTxt = Util.fmtTarikhBM(akhir);
      var bm, en;
      if (st === 'Lewat') {
        bm = ['Laporan kewangan ' + lbl + ' bagi ' + nama + ' telah lewat (tarikh akhir ' + akhirTxt + '). Sila hantar secepat mungkin dalam UTMPreneur.'];
        en = ['The ' + lbl + ' financial report for ' + nama + ' is overdue (due ' + akhirTxt + '). Please submit it as soon as possible in UTMPreneur.'];
      } else {
        bm = ['Sila hantar laporan kewangan ' + lbl + ' bagi ' + nama + ' sebelum atau pada ' + akhirTxt + ' dalam UTMPreneur.'];
        en = ['Please submit the ' + lbl + ' financial report for ' + nama + ' on or before ' + akhirTxt + ' in UTMPreneur.'];
      }
      var status = to ? sendMail_(to, jenisBm, jenisEn, bm, en) : 'Tiada emel';
      if (status === 'Gagal') return; // cuba lagi pada kerja berikutnya
      Db.append('Peringatan', { Masa: new Date(), Emel: to, Jenis: kunci, Rujukan: id, Status: status, Catatan: lbl + ' | ' + nama });
      logs[kunci] = true;
      if (status === 'Dihantar') n++;
    });
    return n;
  }

  // ---------- Laluan RPC ----------
  function routes_() {
    var VIEW = [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI];
    var BANTU = [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL];
    var FAIL = [ROLE.PELAJAR].concat(VIEW);
    return {
      'kew.saya':          { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c) { return saya_(c); } },
      'kew.dapat':         { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return dapat_(c, p); } },
      'kew.hantar':        { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return hantarPelajar_(c, p); } },
      'kew.fail':          { auth: true, roles: FAIL, fn: function (c, p) { return fail_(c, p); } },
      'kew.templat':       { auth: true, roles: FAIL, fn: function () { return templat_(); } },
      'kew.admin.senarai': { auth: true, roles: VIEW, fn: function (c, p) { return adminSenarai_(c, p); } },
      'kew.admin.butiran': { auth: true, roles: VIEW, fn: function (c, p) { return adminButiran_(c, p); } },
      'kew.admin.putus':   { auth: true, roles: BANTU, fn: function (c, p) { return adminPutus_(c, p); } },
      'kew.admin.csv':     { auth: true, roles: VIEW, fn: function (c, p) { return adminCsv_(c, p); } },
      'kew.admin.jana':    { auth: true, roles: BANTU, fn: function (c) { return adminJana_(c); } },
      'kew.admin.hantar':  { auth: true, roles: BANTU, fn: function (c, p) { return adminHantar_(c, p); } }
    };
  }

  return {
    routes: routes_, jobHarian: jobHarian_,
    // didedahkan untuk ujian dan modul lain
    ringkasan: ringkasanRows_, kpiKemaskini: kpiKemaskini_, akhirOf: akhirOf_
  };
})();
