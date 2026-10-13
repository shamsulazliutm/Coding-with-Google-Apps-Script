/**
 * UTMPreneur: Ruang Niaga fasa 2. Penilaian jawatankuasa.
 * Sesi penilaian (tarikh, masa, tempat, penilai, senarai disenarai pendek dengan slot pembentangan), skrin penilai
 * (rubrik 6 kriteria, skala 5 tahap yang mengisi markah automatik dan boleh dilaras dalam julat tahap, simpan draf,
 * hantar mengunci), kerahsiaan skor antara penilai sehingga sesi ditutup, purata dan kedudukan.
 * Admin memutuskan selepas melihat kedudukan: tiada skor minimum dan tiada kelulusan automatik.
 */

var RnNilai = (function () {
  var SKALA = [
    { tahap: 5, pct: 100, bm: 'Cemerlang', en: 'Excellent' },
    { tahap: 4, pct: 80, bm: 'Baik', en: 'Good' },
    { tahap: 3, pct: 60, bm: 'Memuaskan', en: 'Satisfactory' },
    { tahap: 2, pct: 40, bm: 'Kurang', en: 'Fair' },
    { tahap: 1, pct: 20, bm: 'Lemah', en: 'Poor' }
  ];
  function S(v) { return Util.str(v); }

  /** Julat markah bagi satu tahap: [bawah, atas]. Tahap 5: 80%-100%, ..., tahap 1: 0%-20% daripada maksimum. */
  function julat_(maks, tahap) {
    var pct = SKALA.filter(function (x) { return x.tahap === tahap; })[0].pct;
    return [tahap === 1 ? 0 : maks * (pct - 20) / 100, maks * pct / 100];
  }
  function auto_(maks, tahap) { return julat_(maks, tahap)[1]; }
  function r2_(n) { return Math.round(n * 100) / 100; }

  function sesiRow_(id) {
    var l = Db.find('Sesi_Penilaian', function (r) { return S(r.ID_Sesi) === id; });
    return l.length ? l[0] : null;
  }
  function penilaiOf_(s) { return RnU.split(s.Penilai).map(Util.normEmail); }
  function senaraiOf_(s) {
    try { var a = JSON.parse(S(s.Senarai_Permohonan) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function namaAdmin_(emel) { var a = Admins.find(emel); return a ? a.nama : emel; }

  /** Kriteria rubrik bagi versi. */
  function rubrik_(versi) {
    return Db.find('Rubrik', function (r) { return S(r.Jenis) === 'LOT' && Number(r.Versi) === Number(versi) && Util.truthy(r.Aktif); })
      .sort(function (a, b) { return (Number(a.Tertib) || 0) - (Number(b.Tertib) || 0); })
      .map(function (r) {
        return { kod: S(r.Kod_Kriteria), bm: S(r.Kriteria_BM), en: S(r.Kriteria_EN), sub: S(r.Sub_Perkara), maks: Number(r.Markah_Maks) || 0,
          tahap5: S(r.Tahap5), tahap3: S(r.Tahap3), tahap1: S(r.Tahap1) };
      });
  }
  function versiTerkini_() {
    var v = 0;
    Db.rows('Rubrik').forEach(function (r) { if (S(r.Jenis) === 'LOT' && Util.truthy(r.Aktif)) v = Math.max(v, Number(r.Versi) || 0); });
    return v || 1;
  }

  function skorRows_(idSesi, idPer, emel) {
    return Db.find('Skor_Penilaian', function (r) {
      return S(r.ID_Sesi) === idSesi && (!idPer || S(r.ID_Permohonan) === idPer) && (!emel || Util.normEmail(r.Emel_Penilai) === emel);
    });
  }

  /** Keadaan seorang penilai bagi satu permohonan: {status: belum|draf|dihantar, jumlah, skor{kod:{tahap,markah,ulasan}}}. */
  function keadaan_(rows, kriteria) {
    var skor = {}, jumlah = 0, kunci = 0, ada = 0;
    rows.forEach(function (r) {
      var kod = S(r.Kod_Kriteria);
      skor[kod] = { tahap: S(r.Tahap) === '' ? '' : Number(r.Tahap), markah: S(r.Markah) === '' ? '' : Number(r.Markah), ulasan: S(r.Ulasan) };
      if (S(r.Markah) !== '') jumlah += Number(r.Markah) || 0;
      if (Util.truthy(r.Dikunci)) kunci++;
      ada++;
    });
    var lengkap = kriteria.length > 0 && kriteria.every(function (k) { return skor[k.kod] && skor[k.kod].tahap !== '' && skor[k.kod].markah !== ''; });
    var status = !ada ? 'belum' : (kunci >= kriteria.length && lengkap ? 'dihantar' : 'draf');
    return { status: status, jumlah: r2_(jumlah), skor: skor, lengkap: lengkap };
  }

  /** Ringkasan sesi: bagi setiap permohonan: penilai, purata dan kedudukan. */
  function ringkasan_(s) {
    var id = S(s.ID_Sesi);
    var kriteria = rubrik_(s.Versi_Rubrik);
    var penilai = penilaiOf_(s);
    var all = Db.find('Skor_Penilaian', function (r) { return S(r.ID_Sesi) === id; });
    var beza = Cfg.num('PENILAIAN_BEZA_JAUH', 20);
    var list = senaraiOf_(s).map(function (it) {
      var r = RnU.perById(S(it.id)) || {};
      var per = RnU.perniagaan(S(r.ID_Perniagaan)) || {};
      var pel = RnU.pelajar(Util.normMatric(r.No_Matrik)) || {};
      var pn = penilai.map(function (e) {
        var rows = all.filter(function (x) { return S(x.ID_Permohonan) === S(it.id) && Util.normEmail(x.Emel_Penilai) === e; });
        var k = keadaan_(rows, kriteria);
        return { emel: e, nama: namaAdmin_(e), status: k.status, jumlah: k.jumlah };
      });
      var hantar = pn.filter(function (x) { return x.status === 'dihantar'; });
      var purata = hantar.length ? r2_(hantar.reduce(function (a, x) { return a + x.jumlah; }, 0) / hantar.length) : null;
      var tot = hantar.map(function (x) { return x.jumlah; });
      var selisih = tot.length >= 2 ? r2_(Math.max.apply(null, tot) - Math.min.apply(null, tot)) : 0;
      return {
        id: S(it.id), masa: S(it.masa), status: S(r.Status), perniagaan: S(per.Nama_Perniagaan), pemohon: S(pel.Nama_Penuh), kodLot: S(r.Kod_Lot),
        penilai: pn, bilDihantar: hantar.length, purata: purata, kedudukan: null, selisih: selisih, bezaJauh: selisih >= beza
      };
    });
    var ranked = list.filter(function (x) { return x.purata !== null; }).sort(function (a, b) { return b.purata - a.purata; });
    ranked.forEach(function (x, i) {
      x.kedudukan = (i > 0 && ranked[i - 1].purata === x.purata) ? ranked[i - 1].kedudukan : i + 1;
    });
    return { kriteria: kriteria, senarai: list };
  }

  function sesiView_(s) {
    return {
      id: S(s.ID_Sesi), tarikh: RnU.dk(s.Tarikh), masa: S(s.Masa), tempat: S(s.Tempat), status: S(s.Status), versiRubrik: Number(s.Versi_Rubrik) || 0,
      penilai: penilaiOf_(s).map(function (e) { return { emel: e, nama: namaAdmin_(e) }; }), bilCalon: senaraiOf_(s).length,
      jemputan: RnU.dk(s.Jemputan_Dihantar)
    };
  }

  // ---------- Admin ----------
  function sesiSenarai_(ctx) {
    RnU.requireViewer(ctx);
    var l = Db.rows('Sesi_Penilaian').map(sesiView_).sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
    return { sesi: l, bolehUbah: RnU.isDecider(ctx), penilaiTersedia: penilaiTersedia_() };
  }
  function penilaiTersedia_() {
    return Admins.list().filter(function (a) { return a.aktif; }).map(function (a) { return { emel: a.emel, nama: a.nama, peranan: a.peranan }; });
  }

  function sesiButiran_(ctx, p) {
    RnU.requireViewer(ctx);
    var s = sesiRow_(S(p.id));
    if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
    var rg = ringkasan_(s);
    var dalam = {};
    rg.senarai.forEach(function (x) { dalam[x.id] = true; });
    var lain = {};
    Db.rows('Sesi_Penilaian').forEach(function (x) {
      if (S(x.ID_Sesi) !== S(s.ID_Sesi) && S(x.Status) !== 'Ditutup') senaraiOf_(x).forEach(function (it) { lain[S(it.id)] = true; });
    });
    var tersedia = Db.find('Permohonan_Lot', function (r) { return S(r.Status) === 'Disemak' && !dalam[S(r.ID_Permohonan)] && !lain[S(r.ID_Permohonan)]; }).map(function (r) {
      var per = RnU.perniagaan(S(r.ID_Perniagaan)) || {};
      return { id: S(r.ID_Permohonan), perniagaan: S(per.Nama_Perniagaan), kodLot: S(r.Kod_Lot) };
    });
    var v = sesiView_(s);
    v.senarai = rg.senarai;
    v.kriteria = rg.kriteria;
    v.tersedia = tersedia;
    v.penilaiTersedia = penilaiTersedia_();
    v.bolehUbah = RnU.isDecider(ctx);
    return v;
  }

  function sesiSimpan_(ctx, p) {
    RnU.requireDecider(ctx);
    p = p || {};
    var e = {};
    var cur = null;
    if (S(p.id)) { cur = sesiRow_(S(p.id)); if (!cur) throw appError_('RN_SESI_TIDAK_DITEMUI'); if (S(cur.Status) === 'Ditutup') throw appError_('RN_SESI_DITUTUP'); }
    var tarikh = S(p.tarikh), masa = S(p.masa), tempat = S(p.tempat).substr(0, 200);
    if (!RnU.isDate(tarikh)) e.tarikh = 'Tarikh tidak sah / Invalid date';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(masa)) e.masa = 'Masa HH:MM / Time HH:MM';
    if (!tempat) e.tempat = 'Wajib diisi / Required';
    var penilai = (Array.isArray(p.penilai) ? p.penilai : []).map(Util.normEmail).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    penilai.forEach(function (em) {
      var a = Admins.find(em);
      if (!a || !a.aktif) e.penilai = 'Penilai mesti akaun admin aktif: ' + em + ' / Evaluators must be active admin accounts';
    });
    var senarai = (Array.isArray(p.senarai) ? p.senarai : []).filter(function (x) { return x && S(x.id); });
    var ids = {};
    var sedia = cur ? senaraiOf_(cur) : [];
    var lain = {};
    Db.rows('Sesi_Penilaian').forEach(function (x) {
      if ((!cur || S(x.ID_Sesi) !== S(cur.ID_Sesi)) && S(x.Status) !== 'Ditutup') senaraiOf_(x).forEach(function (it) { lain[S(it.id)] = true; });
    });
    var baru = senarai.map(function (x) {
      var id = S(x.id), sl = S(x.masa);
      var r = RnU.perById(id);
      if (!r) { e.senarai = 'Permohonan tidak ditemui: ' + id + ' / Application not found'; return null; }
      if (ids[id]) { e.senarai = 'Permohonan pendua: ' + id + ' / Duplicate'; return null; }
      ids[id] = true;
      var dalamSesiIni = sedia.some(function (y) { return S(y.id) === id; });
      if (!dalamSesiIni && S(r.Status) !== 'Disemak') e.senarai = id + ' mesti berstatus Disemak / must be Disemak';
      if (lain[id]) e.senarai = id + ' sudah dalam sesi lain / already in another session';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sl)) e.senarai = 'Slot masa HH:MM diperlukan untuk ' + id + ' / Time slot required';
      return { id: id, masa: sl };
    }).filter(Boolean);
    // pembuangan: tidak boleh jika sudah ada skor
    sedia.forEach(function (y) {
      if (ids[S(y.id)]) return;
      if (cur && skorRows_(S(cur.ID_Sesi), S(y.id)).length) e.senarai = S(y.id) + ' sudah ada skor dan tidak boleh dibuang / already has scores and cannot be removed';
    });
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    var id = Db.withLock(function () {
      var sid = cur ? S(cur.ID_Sesi) : Util.formatId('SES', parseInt(Util.fmtDate(new Date(), 'yyyy'), 10), Db.nextSeqLocked('SES_' + Util.fmtDate(new Date(), 'yyyy')), 4);
      var rec = {
        ID_Sesi: sid, Tarikh: Util.toDate(tarikh), Masa: masa, Tempat: tempat, Penilai: penilai.join(','), Senarai_Permohonan: JSON.stringify(baru)
      };
      if (cur) Db.update('Sesi_Penilaian', cur._row, rec);
      else { rec.Status = 'Dirancang'; rec.Versi_Rubrik = versiTerkini_(); rec.Dicipta_Oleh = ctx.email; Db.append('Sesi_Penilaian', rec); }
      // status permohonan: ditambah -> Disenarai Pendek; dibuang -> Disemak
      baru.forEach(function (it) {
        var r = RnU.perById(it.id);
        if (S(r.Status) === 'Disemak') Db.update('Permohonan_Lot', r._row, { Status: 'Disenarai Pendek' });
      });
      sedia.forEach(function (y) {
        if (ids[S(y.id)]) return;
        var r = RnU.perById(S(y.id));
        if (r && S(r.Status) === 'Disenarai Pendek') Db.update('Permohonan_Lot', r._row, { Status: 'Disemak' });
      });
      Audit.log(ctx, cur ? 'KEMAS_KINI_SESI_PENILAIAN' : 'CIPTA_SESI_PENILAIAN', 'Ruang Niaga', sid, '', baru.length + ' calon, ' + penilai.length + ' penilai', tarikh + ' ' + masa);
      return sid;
    });
    return sesiButiran_(ctx, { id: id });
  }

  function sesiMula_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = Db.withLock(function () {
      var s = sesiRow_(S(p.id));
      if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
      if (S(s.Status) !== 'Dirancang') throw appError_('RN_PERALIHAN_TIDAK_SAH');
      if (!penilaiOf_(s).length || !senaraiOf_(s).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { penilai: 'Perlu sekurang-kurangnya seorang penilai dan seorang calon / At least one evaluator and one candidate' } });
      Db.update('Sesi_Penilaian', s._row, { Status: 'Berjalan' });
      Audit.log(ctx, 'MULA_SESI_PENILAIAN', 'Ruang Niaga', S(s.ID_Sesi), 'Dirancang', 'Berjalan', '');
      return S(s.ID_Sesi);
    });
    var s2 = sesiRow_(id);
    penilaiOf_(s2).forEach(function (e) {
      RnU.mel(e, 'Sesi penilaian permohonan lot bermula', 'Lot evaluation session started',
        ['Sesi penilaian ' + id + ' (' + Util.fmtTarikhBM(s2.Tarikh) + ', ' + S(s2.Masa) + ', ' + S(s2.Tempat) + ') telah bermula. Sila log masuk UTMPreneur untuk menilai.'],
        ['Evaluation session ' + id + ' has started. Please sign in to UTMPreneur to evaluate.']);
    });
    return sesiButiran_(ctx, { id: id });
  }

  function belumHantar_(s) {
    var rg = ringkasan_(s), out = [];
    rg.senarai.forEach(function (x) {
      x.penilai.forEach(function (pn) { if (pn.status !== 'dihantar') out.push({ id: x.id, perniagaan: x.perniagaan, penilai: pn.nama, status: pn.status }); });
    });
    return out;
  }

  function sesiTutup_(ctx, p) {
    RnU.requireDecider(ctx);
    var s0 = sesiRow_(S(p.id));
    if (!s0) throw appError_('RN_SESI_TIDAK_DITEMUI');
    if (S(s0.Status) !== 'Berjalan') throw appError_('RN_SESI_TIDAK_BERJALAN');
    var belum = belumHantar_(s0);
    if (belum.length && p.paksa !== true) throw appError_('RN_SESI_BELUM_LENGKAP', { belum: belum });
    Db.withLock(function () {
      var s = sesiRow_(S(p.id));
      if (S(s.Status) !== 'Berjalan') throw appError_('RN_SESI_TIDAK_BERJALAN');
      var rg = ringkasan_(s);
      Db.update('Sesi_Penilaian', s._row, { Status: 'Ditutup' });
      rg.senarai.forEach(function (x) {
        var r = RnU.perById(x.id);
        if (r && S(r.Status) === 'Disenarai Pendek' && x.bilDihantar > 0) Db.update('Permohonan_Lot', r._row, { Status: 'Dinilai' });
      });
      Audit.log(ctx, 'TUTUP_SESI_PENILAIAN', 'Ruang Niaga', S(s.ID_Sesi), 'Berjalan', 'Ditutup', belum.length ? 'Ditutup dengan ' + belum.length + ' penilaian belum hantar' : '');
    });
    return sesiButiran_(ctx, { id: S(p.id) });
  }

  function sesiBukaSemula_(ctx, p) {
    RnU.requireDecider(ctx);
    Db.withLock(function () {
      var s = sesiRow_(S(p.id));
      if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
      if (S(s.Status) !== 'Ditutup') throw appError_('RN_PERALIHAN_TIDAK_SAH');
      var senarai = senaraiOf_(s);
      var lewat = senarai.some(function (it) { var r = RnU.perById(S(it.id)); return r && ['Dinilai', 'Disenarai Pendek', 'Ditolak', 'Dibatalkan'].indexOf(S(r.Status)) < 0; });
      if (lewat) throw appError_('RN_PERALIHAN_TIDAK_SAH');
      senarai.forEach(function (it) {
        var r = RnU.perById(S(it.id));
        if (r && S(r.Status) === 'Dinilai') Db.update('Permohonan_Lot', r._row, { Status: 'Disenarai Pendek' });
      });
      Db.update('Sesi_Penilaian', s._row, { Status: 'Berjalan' });
      Audit.log(ctx, 'BUKA_SEMULA_SESI_PENILAIAN', 'Ruang Niaga', S(s.ID_Sesi), 'Ditutup', 'Berjalan', S(p.catatan).substr(0, 300));
    });
    return sesiButiran_(ctx, { id: S(p.id) });
  }

  function sesiJemput_(ctx, p) {
    RnU.requireDecider(ctx);
    var s = sesiRow_(S(p.id));
    if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
    if (S(s.Status) === 'Ditutup') throw appError_('RN_SESI_DITUTUP');
    var n = 0;
    senaraiOf_(s).forEach(function (it) {
      var r = RnU.perById(S(it.id));
      if (!r || ['Disenarai Pendek', 'Dinilai'].indexOf(S(r.Status)) < 0) return;
      var ok = RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Jemputan pembentangan permohonan lot', 'Invitation to present your lot application',
        ['Permohonan lot anda (' + S(r.ID_Permohonan) + ') telah disenarai pendek. Anda dijemput hadir membentang pada ' + Util.fmtTarikhBM(s.Tarikh) + ', pukul ' + S(it.masa) + ', di ' + S(s.Tempat) + '.'],
        ['Your lot application (' + S(r.ID_Permohonan) + ') has been shortlisted. You are invited to present on ' + RnU.dk(s.Tarikh) + ' at ' + S(it.masa) + ', ' + S(s.Tempat) + '.']);
      if (ok) n++;
    });
    Db.withLock(function () {
      var s2 = sesiRow_(S(p.id));
      Db.update('Sesi_Penilaian', s2._row, { Jemputan_Dihantar: new Date() });
      Audit.log(ctx, 'HANTAR_JEMPUTAN_PENILAIAN', 'Ruang Niaga', S(s.ID_Sesi), '', String(n), '');
    });
    var out = sesiButiran_(ctx, { id: S(p.id) });
    out.jemputanDihantar = n;
    return out;
  }

  /** Admin buka semula kunci seorang penilai bagi satu permohonan (sesi mesti Berjalan). */
  function skorBuka_(ctx, p) {
    RnU.requireDecider(ctx);
    var emel = Util.normEmail(p.emel);
    Db.withLock(function () {
      var s = sesiRow_(S(p.sesi));
      if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
      if (S(s.Status) !== 'Berjalan') throw appError_('RN_SESI_TIDAK_BERJALAN');
      var rows = skorRows_(S(s.ID_Sesi), S(p.permohonan), emel);
      if (!rows.length) throw appError_('RN_TIDAK_DITEMUI');
      rows.forEach(function (r) { Db.update('Skor_Penilaian', r._row, { Dikunci: '', Masa_Hantar: '' }); });
      Audit.log(ctx, 'BUKA_SEMULA_SKOR', 'Ruang Niaga', S(p.permohonan), 'Dikunci', 'Dibuka', S(s.ID_Sesi) + ' | ' + emel);
    });
    RnU.mel(emel, 'Skor anda dibuka semula', 'Your scores were reopened',
      ['Skor penilaian anda bagi ' + S(p.permohonan) + ' telah dibuka semula oleh admin. Sila semak dan hantar semula.'],
      ['Your evaluation of ' + S(p.permohonan) + ' was reopened by an admin. Please review and submit again.']);
    return sesiButiran_(ctx, { id: S(p.sesi) });
  }

  /** Skor terperinci semua penilai bagi satu permohonan (admin sahaja). */
  function skorButiran_(ctx, p) {
    RnU.requireViewer(ctx);
    var s = sesiRow_(S(p.sesi));
    if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
    var kriteria = rubrik_(s.Versi_Rubrik);
    var penilai = penilaiOf_(s).map(function (e) {
      var k = keadaan_(skorRows_(S(s.ID_Sesi), S(p.permohonan), e), kriteria);
      return { emel: e, nama: namaAdmin_(e), status: k.status, jumlah: k.jumlah, skor: k.skor };
    });
    return { sesi: S(s.ID_Sesi), permohonan: S(p.permohonan), kriteria: kriteria, penilai: penilai };
  }

  // ---------- Penilai ----------
  function pastikanPenilai_(ctx, s) {
    if (penilaiOf_(s).indexOf(Util.normEmail(ctx.email)) < 0) throw appError_('RN_BUKAN_PENILAI');
  }
  function sesiPenilai_(ctx, id) {
    var s = sesiRow_(id);
    if (!s) throw appError_('RN_SESI_TIDAK_DITEMUI');
    pastikanPenilai_(ctx, s);
    if (['Berjalan', 'Ditutup'].indexOf(S(s.Status)) < 0) throw appError_('RN_SESI_TIDAK_BERJALAN');
    return s;
  }
  function dalamSenarai_(s, idPer) {
    var it = senaraiOf_(s).filter(function (x) { return S(x.id) === idPer; })[0];
    if (!it) throw appError_('RN_TIDAK_DITEMUI');
    return it;
  }

  function maskKp_(kp) { var x = S(kp); return x.length <= 4 ? x : x.substr(0, 2) + '****' + x.substr(-3); }

  function calon_(ctx, r) {
    var m = Util.normMatric(r.No_Matrik);
    var pel = RnU.pelajar(m) || {};
    var per = RnU.perniagaan(S(r.ID_Perniagaan)) || {};
    var ssu = RnU.ssuLulus(S(per.ID_Perniagaan)) || {};
    var lot = RnU.lotById(S(r.Kod_Lot));
    return {
      id: S(r.ID_Permohonan), namaPelajar: S(pel.Nama_Penuh), noMatrik: m, noKp: ctx.role === ROLE.ADMIN_PENUH ? S(pel.No_KP_Pasport) : maskKp_(pel.No_KP_Pasport),
      tahun: S(pel.Tahun_Pengajian), fakulti: S(pel.Fakulti), kursus: S(pel.Program), namaSyarikat: S(per.Nama_Perniagaan), noSsm: S(ssu.No_SSM),
      jenisPerniagaan: S(ssu.Jenis_Perniagaan) ? Ref.bm('JENIS_PERNIAGAAN', S(ssu.Jenis_Perniagaan)) : '',
      produk: RnU.split(ssu.Produk).map(function (k) { return Ref.bm('PRODUK', k); }),
      lot: RnU.namaLot(lot), tempohMula: RnU.dk(r.Tempoh_Mula), tempohTamat: RnU.dk(r.Tempoh_Tamat), jumlahDana: S(r.Jumlah_Dana_RM), jualan: S(r.Jangkaan_Jualan_RM),
      bilPekerja: S(r.Bil_Pekerja), sebab: S(r.Sebab_Berniaga), lokasi: S(r.Lokasi_Dirancang), adaCadangan: !!S(r.Fail_Cadangan)
    };
  }

  /** Paparan sesi untuk penilai: tanpa senarai penilai lain. */
  function sesiViewPenilai_(s) {
    var v = sesiView_(s);
    v.bilPenilai = v.penilai.length;
    delete v.penilai;
    return v;
  }

  function nilaiSesi_(ctx) {
    var email = Util.normEmail(ctx.email);
    var out = [];
    Db.rows('Sesi_Penilaian').forEach(function (s) {
      if (penilaiOf_(s).indexOf(email) < 0 || ['Berjalan', 'Ditutup'].indexOf(S(s.Status)) < 0) return;
      var kriteria = rubrik_(s.Versi_Rubrik);
      var tutup = S(s.Status) === 'Ditutup';
      var rg = tutup ? ringkasan_(s) : null;
      var calon = senaraiOf_(s).map(function (it) {
        var r = RnU.perById(S(it.id)) || {};
        var per = RnU.perniagaan(S(r.ID_Perniagaan)) || {};
        var k = keadaan_(skorRows_(S(s.ID_Sesi), S(it.id), email), kriteria);
        var o = { id: S(it.id), masa: S(it.masa), perniagaan: S(per.Nama_Perniagaan), status: k.status, jumlah: k.jumlah };
        if (tutup) {
          var x = rg.senarai.filter(function (y) { return y.id === S(it.id); })[0];
          if (x) { o.purata = x.purata; o.kedudukan = x.kedudukan; }
        }
        return o;
      });
      var v = sesiViewPenilai_(s);
      v.calon = calon;
      out.push(v);
    });
    return { sesi: out };
  }

  function nilaiBuka_(ctx, p) {
    var s = sesiPenilai_(ctx, S(p.sesi));
    var it = dalamSenarai_(s, S(p.permohonan));
    var r = RnU.perById(S(it.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var kriteria = rubrik_(s.Versi_Rubrik);
    var k = keadaan_(skorRows_(S(s.ID_Sesi), S(it.id), Util.normEmail(ctx.email)), kriteria);
    var out = {
      sesi: sesiViewPenilai_(s), masa: S(it.masa), calon: calon_(ctx, r), kriteria: kriteria, skala: SKALA, skor: k.skor, jumlah: k.jumlah, status: k.status,
      dikunci: k.status === 'dihantar', boleh: S(s.Status) === 'Berjalan' && k.status !== 'dihantar'
    };
    if (S(s.Status) === 'Ditutup') {
      var x = ringkasan_(s).senarai.filter(function (y) { return y.id === S(it.id); })[0];
      if (x) out.ranking = { purata: x.purata, kedudukan: x.kedudukan, bilDihantar: x.bilDihantar };
    }
    return out;
  }

  function nilaiSimpan_(ctx, p) {
    var s = sesiPenilai_(ctx, S(p.sesi));
    if (S(s.Status) !== 'Berjalan') throw appError_('RN_SESI_DITUTUP');
    var it = dalamSenarai_(s, S(p.permohonan));
    var email = Util.normEmail(ctx.email);
    var kriteria = rubrik_(s.Versi_Rubrik);
    var byKod = {};
    kriteria.forEach(function (k) { byKod[k.kod] = k; });
    var e = {}, baru = {};
    (Array.isArray(p.skor) ? p.skor : []).forEach(function (x) {
      var kod = S(x && x.kod), k = byKod[kod];
      if (!k) { e._ = 'Kriteria tidak dikenali / Unknown criterion'; return; }
      var tahap = S(x.tahap) === '' ? '' : parseInt(x.tahap, 10);
      var markahRaw = S(x.markah);
      var ulasan = S(x.ulasan).replace(/\s+/g, ' ').substr(0, 500);
      if (tahap === '' && markahRaw === '' && !ulasan) return;
      if (tahap === '' || isNaN(tahap) || tahap < 1 || tahap > 5) { e[kod] = 'Pilih tahap / Choose a level'; return; }
      var markah;
      if (markahRaw === '') markah = auto_(k.maks, tahap);
      else if (!/^\d+(\.\d{1,2})?$/.test(markahRaw)) { e[kod] = 'Markah tidak sah / Invalid mark'; return; }
      else markah = parseFloat(markahRaw);
      var j = julat_(k.maks, tahap);
      if (markah < j[0] - 1e-9 || markah > j[1] + 1e-9 || markah > k.maks) { e[kod] = 'Markah mesti antara ' + j[0] + ' dan ' + j[1] + ' bagi tahap ini / Mark must be between ' + j[0] + ' and ' + j[1]; return; }
      baru[kod] = { tahap: tahap, markah: r2_(markah), ulasan: ulasan };
    });
    var hantar = p.hantar === true;
    return Db.withLock(function () {
      var rows = skorRows_(S(s.ID_Sesi), S(it.id), email);
      var k0 = keadaan_(rows, kriteria);
      if (k0.status === 'dihantar') throw appError_('RN_SKOR_DIKUNCI');
      if (S(sesiRow_(S(s.ID_Sesi)).Status) !== 'Berjalan') throw appError_('RN_SESI_DITUTUP');
      // gabung dengan draf sedia ada untuk semakan kelengkapan
      var gab = {};
      Object.keys(k0.skor).forEach(function (kod) { gab[kod] = k0.skor[kod]; });
      Object.keys(baru).forEach(function (kod) { gab[kod] = baru[kod]; });
      if (hantar) {
        kriteria.forEach(function (k) { if (!gab[k.kod] || gab[k.kod].tahap === '' || gab[k.kod].markah === '') e[k.kod] = e[k.kod] || 'Lengkapkan kriteria ini / Complete this criterion'; });
      }
      if (Object.keys(e).length) throw appError_('RN_SKOR_TIDAK_SAH', { medan: e });
      var now = new Date();
      Object.keys(baru).forEach(function (kod) {
        var ex = rows.filter(function (r) { return S(r.Kod_Kriteria) === kod; })[0];
        var rec = { Tahap: baru[kod].tahap, Markah: baru[kod].markah, Ulasan: baru[kod].ulasan, Masa_Simpan: now };
        if (ex) Db.update('Skor_Penilaian', ex._row, rec);
        else {
          rec.ID_Sesi = S(s.ID_Sesi); rec.ID_Permohonan = S(it.id); rec.Emel_Penilai = email; rec.Kod_Kriteria = kod; rec.Dikunci = '';
          Db.append('Skor_Penilaian', rec);
        }
      });
      if (hantar) {
        skorRows_(S(s.ID_Sesi), S(it.id), email).forEach(function (r) { Db.update('Skor_Penilaian', r._row, { Dikunci: 'Ya', Masa_Hantar: now }); });
        var tot = 0;
        kriteria.forEach(function (k) { tot += gab[k.kod].markah; });
        Audit.log(ctx, 'HANTAR_SKOR_PENILAIAN', 'Ruang Niaga', S(it.id), '', String(r2_(tot)), S(s.ID_Sesi));
      }
      return nilaiBuka_(ctx, { sesi: S(s.ID_Sesi), permohonan: S(it.id) });
    });
  }

  function nilaiFail_(ctx, p) {
    var s = sesiPenilai_(ctx, S(p.sesi));
    var it = dalamSenarai_(s, S(p.permohonan));
    var r = RnU.perById(S(it.id));
    if (!r || !S(r.Fail_Cadangan)) throw appError_('FAIL_TIDAK_DITEMUI');
    Audit.log(ctx, 'PAPAR_CADANGAN_PENILAI', 'Ruang Niaga', S(it.id), '', S(s.ID_Sesi), '');
    return Files.read(S(r.Fail_Cadangan));
  }

  /** Ringkasan penilaian bagi satu permohonan (untuk butiran admin). */
  function ringkasPermohonan_(idPer) {
    var out = null;
    Db.rows('Sesi_Penilaian').forEach(function (s) {
      if (!senaraiOf_(s).some(function (it) { return S(it.id) === idPer; })) return;
      var x = ringkasan_(s).senarai.filter(function (y) { return y.id === idPer; })[0];
      out = { sesi: S(s.ID_Sesi), statusSesi: S(s.Status), tarikh: RnU.dk(s.Tarikh), masa: x.masa, purata: x.purata, kedudukan: x.kedudukan, bilDihantar: x.bilDihantar,
        bilPenilai: x.penilai.length, selisih: x.selisih, bezaJauh: x.bezaJauh };
    });
    return out;
  }

  return {
    SKALA: SKALA, julat: julat_, sesiSenarai: sesiSenarai_, sesiButiran: sesiButiran_, sesiSimpan: sesiSimpan_, sesiMula: sesiMula_, sesiTutup: sesiTutup_,
    sesiBukaSemula: sesiBukaSemula_, sesiJemput: sesiJemput_, skorBuka: skorBuka_, skorButiran: skorButiran_, nilaiSesi: nilaiSesi_, nilaiBuka: nilaiBuka_,
    nilaiSimpan: nilaiSimpan_, nilaiFail: nilaiFail_, ringkasPermohonan: ringkasPermohonan_
  };
})();
