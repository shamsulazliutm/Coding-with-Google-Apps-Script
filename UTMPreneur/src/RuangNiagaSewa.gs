/**
 * SHAMS: Ruang Niaga fasa 4-5. Sewaan aktif, jadual sewa berperingkat, bil sewa bulanan, bayaran, tunggakan dan notis,
 * tamat/pembaharuan sewaan, daftar sewaan sedia ada, dashboard admin dan kerja harian.
 * Bil dijana pada hari JANA_BIL_SEWA_HARI (5) bagi bulan itu, tarikh akhir hari TARIKH_AKHIR_SEWA_HARI (7).
 */

var RnSewa = (function () {
  var KAEDAH = ['Interbank transfer', 'Deposit tunai', 'PayHub UTM'];
  var NOTIS = ['Peringatan 1', 'Peringatan 2', 'Penamatan'];
  function S(v) { return Util.str(v); }
  function y_(d) { return parseInt(Util.fmtDate(d, 'yyyy'), 10); }
  function m_(d) { return parseInt(Util.fmtDate(d, 'MM'), 10); }
  function bil_(r) { return RnU.dk(r); }

  // ---------- Pembantu sewaan dan jadual ----------
  function tamatEfektif_(sew) { return Util.toDate(sew.Tarikh_Tamat_Sebenar) || Util.toDate(sew.Tarikh_Tamat); }
  function jadualSewaan_(sew) { return RnTawaran.jadualOf(S(sew.ID_Permohonan), S(sew.ID_Sewaan)); }
  /** Bulan sewa ke-n bagi (tahun, bulan); 1 = bulan tarikh mula. */
  function bulanKe_(sew, tahun, bulan) {
    var mula = Util.toDate(sew.Tarikh_Mula);
    return (tahun * 12 + bulan) - (y_(mula) * 12 + m_(mula)) + 1;
  }
  function kadarBulan_(jadual, n, lalai) {
    for (var i = 0; i < jadual.length; i++) {
      var j = jadual[i];
      if (n >= j.dari && (j.hingga === '' || n <= j.hingga)) return j.kadar;
    }
    return jadual.length ? jadual[jadual.length - 1].kadar : lalai;
  }
  function tarikhAkhirBil_(tahun, bulan) {
    var hari = Cfg.num('TARIKH_AKHIR_SEWA_HARI', 7);
    var last = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
    return Util.toDate(tahun + '-' + Util.pad(bulan, 2) + '-' + Util.pad(Math.min(hari, last), 2));
  }
  function bilByKey_(idSewaan, tahun, bulan) {
    var l = Db.find('Bayaran_Sewa', function (b) { return S(b.ID_Sewaan) === idSewaan && Number(b.Tahun) === tahun && Number(b.Bulan) === bulan; });
    return l.length ? l[0] : null;
  }

  /** Jana bil bagi satu bulan (MESTI dalam kunci). Pulang baris bil baharu atau null jika sudah ada / di luar tempoh. */
  function janaBil_(sew, tahun, bulan, opts) {
    opts = opts || {};
    var n = bulanKe_(sew, tahun, bulan);
    var tamat = tamatEfektif_(sew);
    if (n < 1 || (tahun * 12 + bulan) > (y_(tamat) * 12 + m_(tamat))) return null;
    if (bilByKey_(S(sew.ID_Sewaan), tahun, bulan)) return null;
    var kadar = kadarBulan_(jadualSewaan_(sew), n, Number(sew.Kadar_RM) || 0);
    var akhir = tarikhAkhirBil_(tahun, bulan);
    // bil bulan semasa dijana selepas tarikh akhir biasa (sewaan baharu/pendaftaran lewat): tempoh bayar dikira dari hari dijana
    var sekarang = new Date();
    if (tahun === y_(sekarang) && bulan === m_(sekarang) && Util.daysBetween(sekarang, akhir) < 0) akhir = RnU.tambahHari(new Date(), Cfg.num('TARIKH_AKHIR_SEWA_HARI', 7));
    var rec = {
      ID_Bil: Util.formatId('BSW', tahun, Db.nextSeqLocked('BSW_' + tahun), 4), ID_Sewaan: S(sew.ID_Sewaan), Kod_Lot: S(sew.Kod_Lot), ID_Perniagaan: S(sew.ID_Perniagaan),
      Bulan: bulan, Tahun: tahun, Jumlah_RM: kadar, Tarikh_Akhir: akhir, Status: 'Belum Bayar', Sewa_RM: kadar, Caj_Utiliti_RM: 0, Tarikh_Jana: new Date(), Bulan_Sewa_Ke: n
    };
    Db.append('Bayaran_Sewa', rec);
    return rec;
  }

  // ---------- Pengaktifan ----------
  function aktifkan_(ctx, idPer) {
    var hasil = Db.withLock(function () {
      var r = RnU.perById(idPer);
      if (!r) throw appError_('RN_TIDAK_DITEMUI');
      if (S(r.Status) !== 'Perjanjian') return { id: S(r.ID_Sewaan), baru: false };
      var t = RnU.tawaranById(idPer);
      var jadual = RnTawaran.jadualOf(idPer);
      var id = Util.formatId('SWA', null, Db.nextSeqLocked('SWA'), 4);
      var now = new Date();
      Db.append('Sewaan', {
        ID_Sewaan: id, Kod_Lot: S(r.Kod_Lot), ID_Perniagaan: S(r.ID_Perniagaan), ID_Permohonan: idPer, Kadar_RM: jadual.length ? jadual[0].kadar : Number(t.Sewa_Bulanan_RM) || 0,
        Tarikh_Mula: Util.toDate(t.Tarikh_Mula), Tarikh_Tamat: Util.toDate(t.Tarikh_Tamat), Status: 'Aktif', Didaftar_Oleh: ctx.email, Jenis_Daftar: 'Aliran tawaran',
        Bil_Pembaharuan: 0, Tarikh_Daftar: now
      });
      jadual.forEach(function (j) { Db.append('Jadual_Sewa', { ID_Permohonan: idPer, ID_Sewaan: id, Dari_Bulan: j.dari, Hingga_Bulan: j.hingga, Kadar_RM: j.kadar }); });
      Db.update('Permohonan_Lot', r._row, { Status: 'Sewaan Aktif', ID_Sewaan: id });
      RnU.setLot(S(r.Kod_Lot), 'Disewa');
      Db.find('Cagaran', function (c) { return S(c.ID_Permohonan) === idPer; }).forEach(function (c) { Db.update('Cagaran', c._row, { ID_Sewaan: id }); });
      Db.find('Pekerja_Penyewa', function (c) { return S(c.ID_Permohonan) === idPer; }).forEach(function (c) { Db.update('Pekerja_Penyewa', c._row, { ID_Sewaan: id }); });
      Db.find('Dokumen_Sewaan', function (c) { return S(c.ID_Permohonan) === idPer; }).forEach(function (c) { Db.update('Dokumen_Sewaan', c._row, { ID_Sewaan: id }); });
      RnCagaran.tetapAkhirPulang(idPer, Util.toDate(t.Tarikh_Tamat));
      var sew = RnU.sewaanById(id);
      // bil pertama: bulan semasa jika dalam tempoh sewaan
      var bilPertama = janaBil_(sew, y_(now), m_(now), { awal: true });
      Audit.log(ctx, 'AKTIFKAN_SEWAAN', 'Ruang Niaga', idPer, 'Perjanjian', 'Sewaan Aktif', id + ' | ' + RnU.dk(t.Tarikh_Mula) + ' hingga ' + RnU.dk(t.Tarikh_Tamat) + (bilPertama ? ' | bil ' + S(bilPertama.ID_Bil) : ''));
      return { id: id, baru: true, nama: RnU.namaLot(RnU.lotById(S(r.Kod_Lot))), m: Util.normMatric(r.No_Matrik), mula: RnU.dk(t.Tarikh_Mula), tamat: RnU.dk(t.Tarikh_Tamat) };
    });
    if (hasil.baru) {
      RnU.mel(RnU.emelOf(hasil.m), 'Sewaan lot anda kini aktif', 'Your tenancy is now active',
        ['Sewaan ' + hasil.nama + ' (' + hasil.id + ') kini aktif dari ' + Util.fmtTarikhBM(hasil.mula) + ' hingga ' + Util.fmtTarikhBM(hasil.tamat) + '. Bil sewa dijana pada hari ke-' + Cfg.num('JANA_BIL_SEWA_HARI', 5) + ' setiap bulan dan perlu dibayar sebelum hari ke-' + Cfg.num('TARIKH_AKHIR_SEWA_HARI', 7) + '.'],
        ['Your tenancy of ' + hasil.nama + ' (' + hasil.id + ') is now active from ' + hasil.mula + ' to ' + hasil.tamat + '.']);
    }
    return hasil.id;
  }

  // ---------- Paparan ----------
  function billView_(b) {
    var st = S(b.Status);
    var akhir = Util.toDate(b.Tarikh_Akhir);
    var hariLewat = akhir && ['Belum Bayar', 'Lewat'].indexOf(st) >= 0 ? Math.max(0, Util.daysBetween(akhir, new Date())) : 0;
    return {
      id: S(b.ID_Bil), idSewaan: S(b.ID_Sewaan), kodLot: S(b.Kod_Lot), bulan: Number(b.Bulan), tahun: Number(b.Tahun), bulanSewaKe: Number(b.Bulan_Sewa_Ke) || 0,
      jumlah: Number(b.Jumlah_RM) || 0, sewa: Number(b.Sewa_RM) || 0, utiliti: Number(b.Caj_Utiliti_RM) || 0, catatanUtiliti: S(b.Catatan_Utiliti),
      tarikhAkhir: akhir ? RnU.dk(akhir) : '', status: st, tarikhBayar: RnU.dk(b.Tarikh_Bayar), kaedah: S(b.Kaedah), noRujukan: S(b.No_Rujukan), adaResit: !!S(b.Fail_Resit),
      disahkanOleh: S(b.Disahkan_Oleh), tarikhPengesahan: RnU.dk(b.Tarikh_Pengesahan), catatan: S(b.Catatan), hariLewat: hariLewat
    };
  }
  function bilSewaan_(idSewaan) {
    return Db.find('Bayaran_Sewa', function (b) { return S(b.ID_Sewaan) === idSewaan; }).sort(function (a, b) {
      return (Number(b.Tahun) * 12 + Number(b.Bulan)) - (Number(a.Tahun) * 12 + Number(a.Bulan));
    });
  }

  /** Tunggakan: bil Lewat. Ditanda jika >= 2 bil Lewat atau bil terlama lewat melebihi TUNGGAKAN_HARI. */
  function tunggakan_(idSewaan) {
    var lewat = bilSewaan_(idSewaan).filter(function (b) { return S(b.Status) === 'Lewat'; });
    var terlama = 0, jumlah = 0;
    lewat.forEach(function (b) {
      jumlah += Number(b.Jumlah_RM) || 0;
      terlama = Math.max(terlama, Util.daysBetween(b.Tarikh_Akhir, new Date()));
    });
    return { bilLewat: lewat.length, jumlah: Math.round(jumlah * 100) / 100, hariTerlama: terlama, ditanda: lewat.length >= 2 || terlama > Cfg.num('TUNGGAKAN_HARI', 30) };
  }

  function notisSewaan_(idSewaan) {
    return Db.find('Dokumen_Sewaan', function (d) { return S(d.Jenis) === 'Notis' && S(d.ID_Sewaan) === idSewaan; });
  }
  function cadangNotis_(idSewaan) {
    if (!tunggakan_(idSewaan).ditanda) return '';
    var ada = notisSewaan_(idSewaan).map(function (d) { return S(d.Tajuk); });
    for (var i = 0; i < NOTIS.length; i++) if (ada.indexOf('Notis ' + NOTIS[i]) < 0) return NOTIS[i];
    return '';
  }

  function sewaanView_(s) {
    var mula = Util.toDate(s.Tarikh_Mula), tamat = Util.toDate(s.Tarikh_Tamat);
    var lot = RnU.lotById(S(s.Kod_Lot));
    var per = RnU.perniagaan(S(s.ID_Perniagaan)) || {};
    var tg = tunggakan_(S(s.ID_Sewaan));
    return {
      id: S(s.ID_Sewaan), idPermohonan: S(s.ID_Permohonan), kodLot: S(s.Kod_Lot), namaLot: RnU.namaLot(lot), perniagaan: S(per.Nama_Perniagaan), idPerniagaan: S(s.ID_Perniagaan),
      kadar: Number(s.Kadar_RM) || 0, tarikhMula: mula ? RnU.dk(mula) : '', tarikhTamat: tamat ? RnU.dk(tamat) : '', tarikhTamatSebenar: RnU.dk(s.Tarikh_Tamat_Sebenar),
      status: S(s.Status), sebabTamat: S(s.Sebab_Tamat), jenisDaftar: S(s.Jenis_Daftar), bilPembaharuan: Number(s.Bil_Pembaharuan) || 0, tunggakan: tg, cadanganNotis: cadangNotis_(S(s.ID_Sewaan))
    };
  }

  /** Bahagian sewaan bagi pemilik/ahli: sewaan, jadual dan bil. */
  function untukPemohon_(ctx, r) {
    if (!S(r.ID_Sewaan)) return null;
    var s = RnU.sewaanById(S(r.ID_Sewaan));
    if (!s) return null;
    var v = sewaanView_(s);
    delete v.cadanganNotis;
    v.jadual = jadualSewaan_(s);
    v.bil = bilSewaan_(S(s.ID_Sewaan)).map(billView_);
    v.kaedah = KAEDAH;
    v.notis = notisSewaan_(S(s.ID_Sewaan)).filter(function (d) { return Util.truthy(d.Kelihatan); }).map(RnDok.view);
    return v;
  }

  // ---------- Bil: pemilik ----------
  function bilByID_(id) {
    var l = Db.find('Bayaran_Sewa', function (b) { return S(b.ID_Bil) === id; });
    return l.length ? l[0] : null;
  }
  function perDariBil_(b) {
    var s = RnU.sewaanById(S(b.ID_Sewaan));
    return s ? RnU.perById(S(s.ID_Permohonan)) : null;
  }

  function bilBayar_(ctx, p) {
    var b = bilByID_(S(p.id));
    if (!b) throw appError_('RN_BIL_TIDAK_DITEMUI');
    var r = perDariBil_(b);
    if (!r) throw appError_('RN_BIL_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    if (['Belum Bayar', 'Lewat', 'Menunggu Pengesahan'].indexOf(S(b.Status)) < 0) throw appError_('RN_BIL_STATUS');
    var e = {};
    var kaedah = S(p.kaedah);
    if (KAEDAH.indexOf(kaedah) < 0) e.kaedah = 'Pilih kaedah / Choose a method';
    var no = S(p.noRujukan).replace(/\s+/g, ' ');
    if (!/^[A-Za-z0-9\-\/. ()]{3,60}$/.test(no)) e.noRujukan = 'No. rujukan 3 hingga 60 aksara / Reference 3 to 60 characters';
    var tarikh = S(p.tarikhBayar);
    if (!RnU.isDate(tarikh) || Util.daysBetween(new Date(), Util.toDate(tarikh)) > 0) e.tarikhBayar = 'Tarikh tidak sah atau akan datang / Invalid or future date';
    var v = null;
    try { v = Files.validate(p.fail, ['pdf', 'jpg', 'jpeg', 'png']); } catch (err) { e.fail = 'Muat naik resit (PDF/JPG/PNG) / Upload the receipt'; }
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    var url = Files.save('FLD_RESIT_SEWA', 'RESIT_' + S(b.ID_Bil) + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), v);
    Db.withLock(function () {
      var cur = bilByID_(S(b.ID_Bil));
      if (['Belum Bayar', 'Lewat', 'Menunggu Pengesahan'].indexOf(S(cur.Status)) < 0) throw appError_('RN_BIL_STATUS');
      Db.update('Bayaran_Sewa', cur._row, { Status: 'Menunggu Pengesahan', Tarikh_Bayar: Util.toDate(tarikh), Kaedah: kaedah, No_Rujukan: no, Fail_Resit: url, Catatan: '' });
      Audit.log(ctx, 'REKOD_BAYARAN_SEWA', 'Ruang Niaga', S(b.ID_Bil), S(cur.Status), 'Menunggu Pengesahan', kaedah + ' | ' + no);
    });
    RnU.melAdmin('Bayaran sewa menunggu pengesahan', 'Rent payment awaiting verification',
      ['Bayaran bil ' + S(b.ID_Bil) + ' (' + S(b.Kod_Lot) + ', ' + S(b.Bulan) + '/' + S(b.Tahun) + ') direkodkan oleh pemilik. Sila sahkan dalam SHAMS.'],
      ['A payment for bill ' + S(b.ID_Bil) + ' was recorded by the tenant. Please verify it in SHAMS.']);
    return { id: S(b.ID_Bil), sewaan: untukPemohon_(ctx, RnU.perById(S(r.ID_Permohonan))) };
  }

  function bilFail_(ctx, p) {
    var b = bilByID_(S(p.id));
    if (!b || !S(b.Fail_Resit)) throw appError_('RN_BIL_TIDAK_DITEMUI');
    var r = perDariBil_(b);
    if (!r || !RnU.akses(ctx, r)) throw appError_('RN_BIL_TIDAK_DITEMUI');
    return Files.read(S(b.Fail_Resit));
  }
  function adminBilFail_(ctx, p) {
    RnU.requireViewer(ctx);
    var b = bilByID_(S(p.id));
    if (!b || !S(b.Fail_Resit)) throw appError_('RN_BIL_TIDAK_DITEMUI');
    Audit.log(ctx, 'PAPAR_RESIT_SEWA', 'Ruang Niaga', S(b.ID_Bil), '', S(b.No_Rujukan), '');
    return Files.read(S(b.Fail_Resit));
  }

  // ---------- Bil: admin ----------
  function emelBil_(b) {
    var r = perDariBil_(b);
    return r ? RnU.emelOf(Util.normMatric(r.No_Matrik)) : '';
  }
  function statusKembali_(b) {
    return Util.daysBetween(b.Tarikh_Akhir, new Date()) > 0 ? 'Lewat' : 'Belum Bayar';
  }

  function bilSenarai_(ctx, p) {
    RnU.requireViewer(ctx);
    p = p || {};
    var status = S(p.status), q = S(p.q).toLowerCase();
    var all = Db.rows('Bayaran_Sewa');
    var kiraan = {};
    ['Belum Bayar', 'Menunggu Pengesahan', 'Dibayar', 'Lewat', 'Dikecualikan'].forEach(function (s) { kiraan[s] = 0; });
    all.forEach(function (b) { if (kiraan[S(b.Status)] !== undefined) kiraan[S(b.Status)]++; });
    var perCache = {};
    var rows = all.filter(function (b) {
      if (status && status !== 'SEMUA' && S(b.Status) !== status) return false;
      if (q) {
        var per = perCache[S(b.ID_Perniagaan)] || (perCache[S(b.ID_Perniagaan)] = RnU.perniagaan(S(b.ID_Perniagaan)) || {});
        if ((S(b.ID_Bil) + ' ' + S(b.Kod_Lot) + ' ' + S(per.Nama_Perniagaan)).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return (Number(b.Tahun) * 12 + Number(b.Bulan)) - (Number(a.Tahun) * 12 + Number(a.Bulan)); });
    return {
      kiraan: kiraan, jumlah: rows.length, bolehUbah: RnU.isDecider(ctx),
      senarai: rows.slice(0, 300).map(function (b) {
        var v = billView_(b);
        v.perniagaan = S((perCache[S(b.ID_Perniagaan)] || RnU.perniagaan(S(b.ID_Perniagaan)) || {}).Nama_Perniagaan);
        return v;
      })
    };
  }

  function bilTindakan_(ctx, id, fn) {
    RnU.requireDecider(ctx);
    var idSewaan = Db.withLock(function () {
      var b = bilByID_(id);
      if (!b) throw appError_('RN_BIL_TIDAK_DITEMUI');
      fn(b);
      return S(b.ID_Sewaan);
    });
    return adminButiran_(ctx, { id: idSewaan });
  }

  function bilSahkan_(ctx, p) {
    var emel = '';
    var out = bilTindakan_(ctx, S(p.id), function (b) {
      if (S(b.Status) !== 'Menunggu Pengesahan') throw appError_('RN_BIL_STATUS');
      Db.update('Bayaran_Sewa', b._row, { Status: 'Dibayar', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: new Date() });
      Audit.log(ctx, 'SAHKAN_BAYARAN_SEWA', 'Ruang Niaga', S(b.ID_Bil), 'Menunggu Pengesahan', 'Dibayar', S(b.No_Rujukan));
      emel = emelBil_(b);
    });
    RnU.mel(emel, 'Bayaran sewa disahkan', 'Rent payment verified', ['Bayaran sewa anda (bil ' + S(p.id) + ') telah disahkan. Terima kasih.'], ['Your rent payment (bill ' + S(p.id) + ') has been verified. Thank you.']);
    return out;
  }
  function bilKembalikan_(ctx, p) {
    var cat = S(p.catatan).substr(0, 300);
    if (!cat) throw appError_('RN_CATATAN_WAJIB');
    var emel = '';
    var out = bilTindakan_(ctx, S(p.id), function (b) {
      if (S(b.Status) !== 'Menunggu Pengesahan') throw appError_('RN_BIL_STATUS');
      Db.update('Bayaran_Sewa', b._row, { Status: statusKembali_(b), Tarikh_Bayar: '', Kaedah: '', No_Rujukan: '', Fail_Resit: '', Catatan: cat });
      Audit.log(ctx, 'KEMBALIKAN_BAYARAN_SEWA', 'Ruang Niaga', S(b.ID_Bil), 'Menunggu Pengesahan', statusKembali_(b), cat);
      emel = emelBil_(b);
    });
    RnU.mel(emel, 'Bayaran sewa dikembalikan', 'Rent payment returned', ['Rekod bayaran bil ' + S(p.id) + ' dikembalikan. Catatan: ' + cat + '. Sila rekod semula bayaran.'], ['The payment record for bill ' + S(p.id) + ' was returned. Note: ' + cat]);
    return out;
  }
  function bilKecuali_(ctx, p) {
    var cat = S(p.catatan).substr(0, 300);
    if (!cat) throw appError_('RN_CATATAN_WAJIB');
    return bilTindakan_(ctx, S(p.id), function (b) {
      if (['Belum Bayar', 'Lewat', 'Menunggu Pengesahan'].indexOf(S(b.Status)) < 0) throw appError_('RN_BIL_STATUS');
      Db.update('Bayaran_Sewa', b._row, { Status: 'Dikecualikan', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: new Date(), Catatan: cat });
      Audit.log(ctx, 'KECUALI_BIL_SEWA', 'Ruang Niaga', S(b.ID_Bil), S(b.Status), 'Dikecualikan', cat);
    });
  }
  function bilUtiliti_(ctx, p) {
    var jumlah = S(p.jumlah) === '' ? 0 : Util.parseRm(p.jumlah);
    if (jumlah === null) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { jumlah: 'Masukkan nilai RM yang tepat / Enter an exact RM value' } });
    var cat = S(p.catatan).substr(0, 200);
    var emel = '';
    var out = bilTindakan_(ctx, S(p.id), function (b) {
      if (['Belum Bayar', 'Lewat'].indexOf(S(b.Status)) < 0) throw appError_('RN_BIL_STATUS');
      var sewa = Number(b.Sewa_RM) || 0;
      Db.update('Bayaran_Sewa', b._row, { Caj_Utiliti_RM: jumlah, Catatan_Utiliti: cat, Jumlah_RM: Math.round((sewa + jumlah) * 100) / 100 });
      Audit.log(ctx, 'CAJ_UTILITI_BIL', 'Ruang Niaga', S(b.ID_Bil), S(b.Caj_Utiliti_RM), String(jumlah), cat);
      emel = emelBil_(b);
    });
    if (jumlah > 0) RnU.mel(emel, 'Caj utiliti ditambah pada bil sewa', 'Utility charge added to your rent bill',
      ['Caj utiliti RM ' + jumlah + ' telah ditambah pada bil ' + S(p.id) + (cat ? ' (' + cat + ')' : '') + '. Sila semak jumlah terkini dalam SHAMS.'], ['A utility charge of RM ' + jumlah + ' was added to bill ' + S(p.id) + '.']);
    return out;
  }

  // ---------- Notis tunggakan ----------
  function notisJana_(ctx, p) {
    RnU.requireDecider(ctx);
    var s = RnU.sewaanById(S(p.id));
    if (!s) throw appError_('RN_SEWAAN_TIDAK_DITEMUI');
    var jenis = S(p.jenis);
    if (NOTIS.indexOf(jenis) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
    var idPer = S(s.ID_Permohonan);
    var r = RnU.perById(idPer);
    var tg = tunggakan_(S(s.ID_Sewaan));
    if (!tg.bilLewat) throw appError_('RN_BIL_STATUS');
    var per = RnU.perniagaan(S(s.ID_Perniagaan)) || {};
    var lot = RnU.lotById(S(s.Kod_Lot));
    var e = Pdf.esc;
    var tajuk = 'Notis ' + jenis;
    var lewat = bilSewaan_(S(s.ID_Sewaan)).filter(function (b) { return S(b.Status) === 'Lewat'; }).reverse();
    var pel = RnU.pelajar(Util.normMatric(r.No_Matrik)) || {};
    var hari = Cfg.num('NOTIS_PENAMATAN_HARI', 7);
    var h = '<table class="nb"><tr><td>Ruj.: ' + e(S(s.ID_Sewaan) + '/' + jenis.replace(/\s+/g, '')) + '</td><td class="r">Tarikh: ' + e(Util.fmtTarikhBM(new Date())) + '</td></tr></table>' +
      '<h1>' + e(tajuk.toUpperCase()) + '</h1>' +
      '<p><b>' + e(S(per.Nama_Perniagaan)) + '</b><br>u.p: ' + e(S(pel.Nama_Penuh)) + '<br>' + e(S(per.Alamat)) + '</p>' +
      '<p><b>SEWAAN ' + e(RnU.alamatLot(lot).toUpperCase()) + ' (' + e(S(s.ID_Sewaan)) + ')</b></p>';
    if (jenis === 'Peringatan 1') h += '<p>Pihak Universiti merujuk kepada perjanjian penyewaan di atas. Rekod kami menunjukkan terdapat tunggakan sewa seperti berikut. Sila jelaskan segera dan kemukakan salinan resit rasmi kepada UTMXCITE.</p>';
    else if (jenis === 'Peringatan 2') h += '<p>Ini ialah peringatan kedua. Tunggakan sewa berikut masih belum dijelaskan walaupun peringatan terdahulu telah dikeluarkan. Kegagalan menjelaskan tunggakan boleh menyebabkan penyewaan ditamatkan.</p>';
    else h += '<p>Walaupun peringatan telah dikeluarkan, tunggakan sewa berikut masih belum dijelaskan. Dengan ini Universiti memberi notis penamatan penyewaan. Pihak tuan dikehendaki <b>mengosongkan premis dalam tempoh ' + hari + ' hari</b> dari tarikh notis ini dan menjelaskan semua tunggakan. Wang cagaran tertakluk kepada syarat perjanjian.</p>';
    h += '<table><tr><th>Bulan</th><th>Jumlah (RM)</th><th>Tarikh akhir</th><th>Hari lewat</th></tr>' + lewat.map(function (b) {
      return '<tr><td>' + e(Util.BULAN_BM[Number(b.Bulan) - 1] + ' ' + b.Tahun) + '</td><td class="r">' + e(Number(b.Jumlah_RM).toFixed(2)) + '</td><td>' + e(Util.fmtTarikhBM(b.Tarikh_Akhir)) +
        '</td><td class="r">' + e(String(Util.daysBetween(b.Tarikh_Akhir, new Date()))) + '</td></tr>';
    }).join('') + '<tr><td><b>Jumlah tertunggak</b></td><td class="r"><b>' + e(tg.jumlah.toFixed(2)) + '</b></td><td></td><td></td></tr></table>' +
      '<p class="sig">Pengarah<br>UTMXCITE, Universiti Teknologi Malaysia<br><span class="sm">Notis ini dijana oleh sistem SHAMS.</span></p>';
    var nama = tajuk + ' ' + S(s.ID_Sewaan);
    var res = Pdf.dariHtml(Pdf.wrap(h, nama), nama, 'FLD_LAMPIRAN_LOT');
    Db.withLock(function () {
      var versi = RnDok.versiSeterusnya(idPer, 'Notis');
      RnDok.tambahLocked({
        ID_Permohonan: idPer, ID_Sewaan: S(s.ID_Sewaan), Jenis: 'Notis', Versi: versi, Tajuk: tajuk, Fail: res.url, Nama_Fail: nama + '.pdf', Dijana_Oleh: ctx.email,
        Status: 'Dihantar', Kelihatan: 'Ya', Catatan: 'Tunggakan RM ' + tg.jumlah.toFixed(2)
      });
      Audit.log(ctx, 'JANA_NOTIS_SEWA', 'Ruang Niaga', S(s.ID_Sewaan), '', tajuk, 'Tunggakan RM ' + tg.jumlah.toFixed(2));
    });
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), tajuk + ' sewaan lot', tajuk + ' for your tenancy',
      ['UTMXCITE telah mengeluarkan ' + tajuk + ' bagi sewaan ' + S(s.ID_Sewaan) + ' (tunggakan RM ' + tg.jumlah.toFixed(2) + '). Sila lihat dokumen dalam SHAMS.'],
      ['UTMXCITE issued a ' + tajuk + ' for tenancy ' + S(s.ID_Sewaan) + ' (arrears RM ' + tg.jumlah.toFixed(2) + ').']);
    return adminButiran_(ctx, { id: S(s.ID_Sewaan) });
  }

  // ---------- Admin: sewaan ----------
  function adminSenarai_(ctx, p) {
    RnU.requireViewer(ctx);
    p = p || {};
    var status = S(p.status), q = S(p.q).toLowerCase();
    var all = Db.rows('Sewaan');
    var rows = all.filter(function (s) {
      if (status && status !== 'SEMUA' && S(s.Status) !== status) return false;
      if (q) {
        var per = RnU.perniagaan(S(s.ID_Perniagaan)) || {};
        if ((S(s.ID_Sewaan) + ' ' + S(s.Kod_Lot) + ' ' + S(per.Nama_Perniagaan)).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    return {
      jumlah: rows.length, senarai: rows.map(sewaanView_), bolehUbah: RnU.isDecider(ctx),
      kiraan: { Aktif: all.filter(function (s) { return S(s.Status) === 'Aktif'; }).length, Tamat: all.filter(function (s) { return S(s.Status) === 'Tamat'; }).length }
    };
  }

  function adminButiran_(ctx, p) {
    RnU.requireViewer(ctx);
    var s = RnU.sewaanById(S(p.id));
    if (!s) throw appError_('RN_SEWAAN_TIDAK_DITEMUI');
    var idPer = S(s.ID_Permohonan);
    var r = RnU.perById(idPer);
    var v = sewaanView_(s);
    v.jadual = jadualSewaan_(s);
    v.bil = bilSewaan_(S(s.ID_Sewaan)).map(billView_);
    v.cagaran = RnCagaran.senarai(idPer);
    v.pekerja = RnPerjanjian.senaraiPekerja(idPer);
    v.peralatan = RnPerjanjian.peralatanLot(S(s.Kod_Lot));
    v.notis = notisSewaan_(S(s.ID_Sewaan)).map(RnDok.view);
    v.dokumen = r ? RnDok.senarai(r, true) : [];
    v.kaedah = KAEDAH;
    v.bolehUbah = RnU.isDecider(ctx);
    return v;
  }

  function tamat_(ctx, p) {
    RnU.requireDecider(ctx);
    var sebab = S(p.sebab).substr(0, 300);
    if (!sebab) throw appError_('RN_CATATAN_WAJIB');
    var tarikh = S(p.tarikh) || RnU.dk(new Date());
    if (!RnU.isDate(tarikh) || Util.daysBetween(new Date(), Util.toDate(tarikh)) > 0) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { tarikh: 'Tarikh tidak sah atau akan datang / Invalid or future date' } });
    var info = Db.withLock(function () {
      var s = RnU.sewaanById(S(p.id));
      if (!s) throw appError_('RN_SEWAAN_TIDAK_DITEMUI');
      if (S(s.Status) !== 'Aktif') throw appError_('RN_SEWAAN_STATUS');
      if (Util.daysBetween(Util.toDate(s.Tarikh_Mula), Util.toDate(tarikh)) < 0) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { tarikh: 'Tarikh sebelum tarikh mula sewaan / Before the start date' } });
      Db.update('Sewaan', s._row, { Status: 'Tamat', Tarikh_Tamat_Sebenar: Util.toDate(tarikh), Sebab_Tamat: sebab });
      var r = RnU.perById(S(s.ID_Permohonan));
      if (r) Db.update('Permohonan_Lot', r._row, { Status: 'Tamat', Tarikh_Keputusan: new Date() });
      RnU.setLot(S(s.Kod_Lot), 'Kosong');
      RnCagaran.tetapAkhirPulang(S(s.ID_Permohonan), Util.toDate(tarikh));
      Audit.log(ctx, 'TAMAT_SEWAAN', 'Ruang Niaga', S(s.ID_Sewaan), 'Aktif', 'Tamat', tarikh + ' | ' + sebab);
      return { m: r ? Util.normMatric(r.No_Matrik) : '', id: S(s.ID_Sewaan) };
    });
    RnU.mel(RnU.emelOf(info.m), 'Sewaan lot ditamatkan', 'Your tenancy has ended',
      ['Sewaan ' + info.id + ' telah ditamatkan pada ' + Util.fmtTarikhBM(tarikh) + '. Sebab: ' + sebab + '. Cagaran akan diproses dalam ' + Cfg.num('CAGARAN_PULANG_HARI', 90) + ' hari.'],
      ['Tenancy ' + info.id + ' ended on ' + tarikh + '.']);
    return adminButiran_(ctx, { id: info.id });
  }

  function perbaharui_(ctx, p) {
    RnU.requireDecider(ctx);
    var kadarBaharu = S(p.kadarBaharu) === '' ? null : Util.parseRm(p.kadarBaharu);
    if (S(p.kadarBaharu) !== '' && kadarBaharu === null) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { kadarBaharu: 'Masukkan nilai RM yang tepat / Enter an exact RM value' } });
    var info = Db.withLock(function () {
      var s = RnU.sewaanById(S(p.id));
      if (!s) throw appError_('RN_SEWAAN_TIDAK_DITEMUI');
      if (S(s.Status) !== 'Aktif') throw appError_('RN_SEWAAN_STATUS');
      var lama = Util.toDate(s.Tarikh_Tamat);
      var baharu = Util.addMonths(lama, 12);
      var bulanTermLama = RnTawaran.bilBulan(RnU.dk(s.Tarikh_Mula), RnU.dk(lama));
      if (kadarBaharu !== null) {
        var jadual = jadualSewaan_(s);
        var akhir = jadual.length ? jadual[jadual.length - 1] : null;
        var rowsJ = Db.find('Jadual_Sewa', function (j) { return S(j.ID_Sewaan) === S(s.ID_Sewaan); });
        if (akhir && akhir.hingga === '') {
          var rj = rowsJ.filter(function (j) { return Number(j.Dari_Bulan) === akhir.dari; })[0];
          if (rj) Db.update('Jadual_Sewa', rj._row, { Hingga_Bulan: bulanTermLama });
          Db.append('Jadual_Sewa', { ID_Permohonan: S(s.ID_Permohonan), ID_Sewaan: S(s.ID_Sewaan), Dari_Bulan: bulanTermLama + 1, Hingga_Bulan: '', Kadar_RM: kadarBaharu });
        } else {
          Db.append('Jadual_Sewa', { ID_Permohonan: S(s.ID_Permohonan), ID_Sewaan: S(s.ID_Sewaan), Dari_Bulan: (akhir ? akhir.hingga : bulanTermLama) + 1, Hingga_Bulan: '', Kadar_RM: kadarBaharu });
        }
      }
      Db.update('Sewaan', s._row, { Tarikh_Tamat: baharu, Bil_Pembaharuan: (Number(s.Bil_Pembaharuan) || 0) + 1 });
      RnCagaran.tetapAkhirPulang(S(s.ID_Permohonan), baharu);
      Audit.log(ctx, 'PERBAHARUI_SEWAAN', 'Ruang Niaga', S(s.ID_Sewaan), RnU.dk(lama), RnU.dk(baharu), kadarBaharu !== null ? 'kadar baharu RM ' + kadarBaharu : '');
      return { id: S(s.ID_Sewaan), idPer: S(s.ID_Permohonan), lama: lama, baharu: baharu };
    });
    var amaran = [];
    try { RnPerjanjian.janaPembaharuan(ctx, info.idPer, info.lama, info.baharu); } catch (err) {
      amaran.push(err && err.name === 'AppError' ? err.bm : 'Dokumen pembaharuan gagal dijana.');
      Audit.log(ctx, 'DOKUMEN_PEMBAHARUAN_GAGAL', 'Ruang Niaga', info.id, '', '', String(err && err.message ? err.message : err).substr(0, 300));
    }
    var out = adminButiran_(ctx, { id: info.id });
    out.amaranPembaharuan = amaran;
    return out;
  }

  /** Daftar sewaan sedia ada: terus Sewaan Aktif tanpa aliran tawaran. */
  function daftarSedia_(ctx, p) {
    RnU.requireDecider(ctx);
    p = p || {};
    var e = {}, bad = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var kunci = S(p.idPerniagaan).toUpperCase();
    var per = RnU.perniagaan(kunci) || (kunci ? RnU.perniagaanOwner(Util.normMatric(kunci)) : null);
    if (!per) bad('idPerniagaan', 'Perniagaan tidak ditemui (masukkan ID Perniagaan atau No. Matrik pemilik; daftar SSU sedia ada dahulu) / Business not found');
    var lot = RnU.lotById(S(p.kodLot));
    if (!lot) bad('kodLot', 'Lot tidak ditemui / Lot not found');
    else if (S(lot.Status_Lot) !== 'Kosong') bad('kodLot', 'Lot mesti berstatus Kosong / The lot must be vacant');
    var mula = S(p.tarikhMula), tamat = S(p.tarikhTamat);
    if (!RnU.isDate(mula)) bad('tarikhMula', 'Tarikh tidak sah / Invalid date');
    if (!RnU.isDate(tamat)) bad('tarikhTamat', 'Tarikh tidak sah / Invalid date');
    else if (!e.tarikhMula && Util.daysBetween(Util.toDate(mula), Util.toDate(tamat)) <= 0) bad('tarikhTamat', 'Tarikh tamat mesti selepas tarikh mula / End date must be after start date');
    else if (!e.tarikhMula && Util.daysBetween(new Date(), Util.toDate(tamat)) < 0) bad('tarikhTamat', 'Tarikh tamat sudah lepas / End date has passed');
    var jadualIn = Array.isArray(p.jadual) && p.jadual.length ? p.jadual : (S(p.kadar) !== '' ? [{ dari: 1, hingga: '', kadar: p.kadar }] : []);
    var jadual = RnTawaran.semakJadual(jadualIn, e);
    var cs = S(p.cagaranSewaan) === '' ? 0 : Util.parseRm(p.cagaranSewaan), cu = S(p.cagaranUtiliti) === '' ? 0 : Util.parseRm(p.cagaranUtiliti);
    if (cs === null) bad('cagaranSewaan', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    if (cu === null) bad('cagaranUtiliti', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    if (per && !e.idPerniagaan && RnU.bercanggah(S(per.ID_Perniagaan))) bad('idPerniagaan', 'Perniagaan/pelajar ini sudah mempunyai permohonan atau sewaan lot yang aktif / Already has an active lot');
    if (Object.keys(e).length) throw appError_('RN_SEDIA_TIDAK_SAH', { medan: e });
    var cat = S(p.catatan).substr(0, 300) || 'Didaftar admin (sewaan sedia ada)';
    var id = Db.withLock(function () {
      var lot2 = RnU.lotById(S(p.kodLot));
      if (S(lot2.Status_Lot) !== 'Kosong') throw appError_('RN_LOT_TIDAK_KOSONG');
      var now = new Date();
      var tahun = y_(now);
      var idPer = Util.formatId('PLT', tahun, Db.nextSeqLocked('PLT_' + tahun), 4);
      var idS = Util.formatId('SWA', null, Db.nextSeqLocked('SWA'), 4);
      Db.append('Permohonan_Lot', {
        ID_Permohonan: idPer, ID_Perniagaan: S(per.ID_Perniagaan), No_Matrik: Util.normMatric(per.No_Matrik_Pemilik), Kod_Lot: S(p.kodLot), Tempoh_Mula: Util.toDate(mula), Tempoh_Tamat: Util.toDate(tamat),
        Status: 'Sewaan Aktif', Tarikh_Hantar: now, Keputusan: 'Diluluskan', Tarikh_Keputusan: now, Catatan_Admin: cat, Jenis_Permohonan: 'Sedia ada', Diputuskan_Oleh: ctx.email, ID_Sewaan: idS
      });
      Db.append('Sewaan', {
        ID_Sewaan: idS, Kod_Lot: S(p.kodLot), ID_Perniagaan: S(per.ID_Perniagaan), ID_Permohonan: idPer, Kadar_RM: jadual[0].kadar, Tarikh_Mula: Util.toDate(mula), Tarikh_Tamat: Util.toDate(tamat),
        Status: 'Aktif', Didaftar_Oleh: ctx.email, Jenis_Daftar: 'Sedia ada', Bil_Pembaharuan: 0, Tarikh_Daftar: now
      });
      jadual.forEach(function (j) { Db.append('Jadual_Sewa', { ID_Permohonan: idPer, ID_Sewaan: idS, Dari_Bulan: j.dari, Hingga_Bulan: j.hingga, Kadar_RM: j.kadar }); });
      RnU.setLot(S(p.kodLot), 'Disewa');
      [['Sewaan', cs], ['Utiliti', cu]].forEach(function (c) {
        if (!c[1]) return;
        Db.append('Cagaran', {
          ID_Cagaran: Util.formatId('CGR', null, Db.nextSeqLocked('CGR'), 4), ID_Permohonan: idPer, ID_Sewaan: idS, ID_Perniagaan: S(per.ID_Perniagaan), Jenis: c[0], Jumlah_RM: c[1],
          Status: 'Diterima', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: now, Catatan: 'Didaftar admin (sedia ada)'
        });
      });
      RnCagaran.tetapAkhirPulang(idPer, Util.toDate(tamat));
      Audit.log(ctx, 'DAFTAR_SEWAAN_SEDIA_ADA', 'Ruang Niaga', idS, '', S(p.kodLot) + ' | ' + S(per.Nama_Perniagaan), mula + ' hingga ' + tamat);
      return idS;
    });
    return adminButiran_(ctx, { id: id });
  }

  // ---------- Dashboard ----------
  function dashboard_(ctx) {
    RnU.requireViewer(ctx);
    var lots = Db.rows('Lot');
    var kiraLot = { Kosong: 0, Dipohon: 0, Disewa: 0, Penyelenggaraan: 0 };
    lots.forEach(function (l) { if (kiraLot[S(l.Status_Lot)] !== undefined) kiraLot[S(l.Status_Lot)]++; });
    var boleh = lots.length - kiraLot.Penyelenggaraan;
    var now = new Date(), tahun = y_(now), bulan = m_(now);
    var bil = Db.rows('Bayaran_Sewa');
    var bulanIni = bil.filter(function (b) { return Number(b.Tahun) === tahun && Number(b.Bulan) === bulan && S(b.Status) !== 'Dikecualikan'; });
    var kutipan = 0, dijangka = 0;
    bulanIni.forEach(function (b) { dijangka += Number(b.Jumlah_RM) || 0; if (S(b.Status) === 'Dibayar') kutipan += Number(b.Jumlah_RM) || 0; });
    var lewat = bil.filter(function (b) { return S(b.Status) === 'Lewat'; });
    var tertunggak = lewat.reduce(function (a, b) { return a + (Number(b.Jumlah_RM) || 0); }, 0);
    var per = Db.rows('Permohonan_Lot');
    var cnt = function (st) { return per.filter(function (r) { return S(r.Status) === st; }).length; };
    var cagaran = Db.rows('Cagaran').map(RnCagaran.view);
    var sewaanAktif = Db.rows('Sewaan').filter(function (s) { return S(s.Status) === 'Aktif'; });
    var tg = sewaanAktif.map(function (s) { var v = sewaanView_(s); return v; }).filter(function (v) { return v.tunggakan.ditanda; })
      .map(function (v) { return { idSewaan: v.id, perniagaan: v.perniagaan, kodLot: v.kodLot, bilLewat: v.tunggakan.bilLewat, jumlah: v.tunggakan.jumlah, cadanganNotis: v.cadanganNotis }; });
    var salinanLewat = Db.rows('Tawaran_Sewa').filter(function (t) { return RnTawaran.view(t, []).salinan.lewat; }).map(function (t) { return S(t.ID_Permohonan); });
    return {
      okupansi: { lot: lots.length, disewa: kiraLot.Disewa, dipohon: kiraLot.Dipohon, kosong: kiraLot.Kosong, penyelenggaraan: kiraLot.Penyelenggaraan, peratus: boleh > 0 ? Math.round(kiraLot.Disewa * 1000 / boleh) / 10 : 0 },
      kutipan: { bulan: bulan, tahun: tahun, dikutip: Math.round(kutipan * 100) / 100, dijangka: Math.round(dijangka * 100) / 100 },
      tertunggak: { bil: lewat.length, jumlah: Math.round(tertunggak * 100) / 100 },
      tunggakanDitanda: tg,
      tawaran: { menunggu: cnt('Ditawarkan'), luput: cnt('Tawaran Luput'), diterima: cnt('Diterima'), perjanjian: cnt('Perjanjian') },
      permohonan: { baharu: cnt('Baharu'), disemak: cnt('Disemak'), disenaraiPendek: cnt('Disenarai Pendek'), dinilai: cnt('Dinilai'), diluluskan: cnt('Diluluskan') },
      cagaran: {
        lewatBayar: cagaran.filter(function (c) { return c.lewatBayar; }).length, menungguPengesahan: cagaran.filter(function (c) { return c.status === 'Menunggu Pengesahan'; }).length,
        lewatPulang: cagaran.filter(function (c) { return c.lewatPulang; }).map(function (c) { return { id: c.id, idPermohonan: c.idPermohonan, jenis: c.jenis, jumlah: c.jumlah, tarikhAkhirPulang: c.tarikhAkhirPulang }; })
      },
      salinanFizikalLewat: salinanLewat,
      bilMenunggu: bil.filter(function (b) { return S(b.Status) === 'Menunggu Pengesahan'; }).length,
      tempoh: RnPer.tempohLot()
    };
  }

  // ---------- Kerja harian ----------
  function jobHarian_() {
    var hasil = { bilDijana: 0, lewat: 0, peringatan: 0, tunggakan: 0 };
    var now = new Date();
    var tahun = y_(now), bulan = m_(now), hari = parseInt(Util.fmtDate(now, 'dd'), 10);
    var janaHari = Cfg.num('JANA_BIL_SEWA_HARI', 5);
    var log = RnU.peringatan();
    // 1. jana bil bulan semasa
    if (hari >= janaHari) {
      Db.rows('Sewaan').forEach(function (s) {
        if (S(s.Status) !== 'Aktif') return;
        var baru = Db.withLock(function () { return janaBil_(RnU.sewaanById(S(s.ID_Sewaan)), tahun, bulan, {}); });
        if (baru) { hasil.bilDijana++; Audit.log(RnU.sys(), 'JANA_BIL_SEWA', 'Ruang Niaga', S(baru.ID_Bil), '', S(s.ID_Sewaan), bulan + '/' + tahun); }
      });
    }
    // 2. Belum Bayar -> Lewat dan peringatan
    var sebelum = Cfg.num('SEWA_PERINGATAN_SEBELUM_HARI', 2), selang = Math.max(1, Cfg.num('PERINGATAN_SUSULAN_HARI', 3));
    Db.rows('Bayaran_Sewa').forEach(function (b) {
      var st = S(b.Status);
      if (['Belum Bayar', 'Lewat'].indexOf(st) < 0) return;
      var id = S(b.ID_Bil);
      var baki = Util.daysBetween(now, b.Tarikh_Akhir);
      if (st === 'Belum Bayar' && baki < 0) {
        Db.withLock(function () { var cur = bilByID_(id); if (cur && S(cur.Status) === 'Belum Bayar') Db.update('Bayaran_Sewa', cur._row, { Status: 'Lewat' }); });
        st = 'Lewat'; hasil.lewat++;
      }
      var emel = emelBil_(b);
      var ringkas = 'Bil ' + id + ' (' + S(b.Kod_Lot) + ', ' + Util.BULAN_BM[Number(b.Bulan) - 1] + ' ' + b.Tahun + ') RM ' + (Number(b.Jumlah_RM) || 0).toFixed(2);
      if (!log.ada('RN_BIL_JANA_' + id)) {
        RnU.mel(emel, 'Bil sewa bulan ' + b.Bulan + '/' + b.Tahun, 'Rent bill for ' + b.Bulan + '/' + b.Tahun,
          [ringkas + ' telah dijana. Sila bayar sebelum ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + ' dan rekod bayaran dalam SHAMS.'], [ringkas + ' has been issued. Please pay by ' + RnU.dk(b.Tarikh_Akhir) + '.']);
        log.tambah('RN_BIL_JANA_' + id, emel, id, 'bil dijana');
        if (baki <= sebelum) log.tambah('RN_BIL_SEBELUM_' + id, emel, id, 'digabung dengan emel bil');
        hasil.peringatan++;
      } else if (st === 'Belum Bayar' && baki >= 0 && baki <= sebelum && !log.ada('RN_BIL_SEBELUM_' + id)) {
        RnU.mel(emel, 'Peringatan: bil sewa hampir tarikh akhir', 'Reminder: rent bill due soon',
          [ringkas + ' perlu dibayar sebelum ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '.'], [ringkas + ' is due by ' + RnU.dk(b.Tarikh_Akhir) + '.']);
        log.tambah('RN_BIL_SEBELUM_' + id, emel, id, baki + ' hari');
        hasil.peringatan++;
      }
      if (st === 'Lewat') {
        var lateDays = -baki;
        var k = Math.floor((lateDays - 1) / selang);
        var key = 'RN_BIL_SUSUL_' + id + '_' + k;
        if (lateDays >= 1 && !log.ada(key)) {
          RnU.mel(emel, 'Bil sewa lewat dibayar', 'Overdue rent bill',
            [ringkas + ' telah lewat ' + lateDays + ' hari (tarikh akhir ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '). Sila jelaskan segera.'], [ringkas + ' is ' + lateDays + ' days overdue.']);
          log.tambah(key, emel, id, lateDays + ' hari lewat');
          hasil.peringatan++;
        }
      }
    });
    // 3. tunggakan lebih satu bulan: tanda dan maklumkan admin (cadangan notis; tiada tindakan automatik)
    Db.rows('Sewaan').forEach(function (s) {
      if (S(s.Status) !== 'Aktif') return;
      var cadang = cadangNotis_(S(s.ID_Sewaan));
      if (!cadang) return;
      var key = 'RN_TUNGGAKAN_' + S(s.ID_Sewaan) + '_' + cadang;
      if (log.ada(key)) return;
      var tg = tunggakan_(S(s.ID_Sewaan));
      log.tambah(key, '-', S(s.ID_Sewaan), 'cadangan notis ' + cadang);
      RnU.melAdmin('Tunggakan sewa melebihi satu bulan', 'Rent arrears over one month',
        ['Sewaan ' + S(s.ID_Sewaan) + ' (' + S(s.Kod_Lot) + ') mempunyai tunggakan RM ' + tg.jumlah.toFixed(2) + ' (' + tg.bilLewat + ' bil). Dicadangkan menjana Notis ' + cadang + ' (tiada tindakan automatik).'],
        ['Tenancy ' + S(s.ID_Sewaan) + ' has arrears of RM ' + tg.jumlah.toFixed(2) + '. A ' + cadang + ' notice is suggested.']);
      hasil.tunggakan++;
    });
    return hasil;
  }

  return {
    KAEDAH: KAEDAH, aktifkan: aktifkan_, janaBil: janaBil_, billView: billView_, bilSewaan: bilSewaan_, tunggakan: tunggakan_, untukPemohon: untukPemohon_,
    bilBayar: bilBayar_, bilFail: bilFail_, adminBilFail: adminBilFail_, bilSenarai: bilSenarai_, bilSahkan: bilSahkan_, bilKembalikan: bilKembalikan_,
    bilKecuali: bilKecuali_, bilUtiliti: bilUtiliti_, notisJana: notisJana_, adminSenarai: adminSenarai_, adminButiran: adminButiran_, tamat: tamat_,
    perbaharui: perbaharui_, daftarSedia: daftarSedia_, dashboard: dashboard_, jobHarian: jobHarian_, kadarBulan: kadarBulan_, sewaanView: sewaanView_
  };
})();
