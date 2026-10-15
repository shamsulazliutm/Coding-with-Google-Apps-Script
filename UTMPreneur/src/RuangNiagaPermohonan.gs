/**
 * SHAMS: Ruang Niaga fasa 1. Pengurusan lot (admin), tempoh permohonan, permohonan lot oleh pemilik SSU,
 * senarai dan butiran permohonan untuk admin, dan peralihan status awal (semak, tolak, batal, putus).
 * Peraturan: pemilik perniagaan SSU Diluluskan + Aktif sahaja boleh memohon; ahli pasukan hanya melihat;
 * satu lot bagi satu pelajar/perniagaan; permohonan dibuat dalam tempoh global sahaja.
 */

var RnPer = (function () {
  var JENIS_LOT = ['FNB', 'RETAIL', 'LAIN'];
  var AWAL_BATAL = ['Baharu', 'Disemak', 'Disenarai Pendek'];
  var PILIHAN_STATUS_LOT = ['Kosong', 'Penyelenggaraan'];

  function S(v) { return Util.str(v); }

  // ---------- Tempoh permohonan ----------
  function tempohLot_() {
    var b = Cfg.get('TEMPOH_PERMOHONAN_LOT_BUKA', ''), t = Cfg.get('TEMPOH_PERMOHONAN_LOT_TUTUP', '');
    var bd = RnU.isDate(b) ? Util.toDate(b) : null, td = RnU.isDate(t) ? Util.toDate(t) : null;
    var now = RnU.today();
    var dibuka = !!(bd && td && Util.daysBetween(bd, now) >= 0 && Util.daysBetween(now, td) >= 0);
    return { buka: bd ? b : '', tutup: td ? t : '', dibuka: dibuka };
  }

  function tempohSimpan_(ctx, p) {
    RnU.requireDecider(ctx);
    p = p || {};
    var b = S(p.buka), t = S(p.tutup), e = {};
    if (b || t) {
      if (!RnU.isDate(b)) e.buka = 'Tarikh tidak sah / Invalid date';
      if (!RnU.isDate(t)) e.tutup = 'Tarikh tidak sah / Invalid date';
      if (!e.buka && !e.tutup && Util.daysBetween(Util.toDate(b), Util.toDate(t)) < 0) e.tutup = 'Tarikh tutup mesti selepas tarikh buka / Close date must be after open date';
    }
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    Db.withLock(function () {
      [['TEMPOH_PERMOHONAN_LOT_BUKA', b, 'Tarikh buka permohonan lot (YYYY-MM-DD)'], ['TEMPOH_PERMOHONAN_LOT_TUTUP', t, 'Tarikh tutup permohonan lot (YYYY-MM-DD)']].forEach(function (x) {
        var row = Db.find('Tetapan', function (r) { return S(r.Kunci) === x[0]; })[0];
        if (row) Db.update('Tetapan', row._row, { Nilai: x[1] });
        else Db.append('Tetapan', { Kunci: x[0], Nilai: x[1], Penerangan: x[2] });
      });
      Cfg.invalidate();
      Audit.log(ctx, 'TETAP_TEMPOH_PERMOHONAN_LOT', 'Ruang Niaga', '', '', b + ' hingga ' + t, '');
    });
    return tempohLot_();
  }

  // ---------- Lot ----------
  function lotView_(l) {
    var jenis = S(l.Jenis);
    return {
      kod: S(l.Kod_Lot), nama: S(l.Nama_Paparan) || S(l.Kod_Lot), lokasi: S(l.Lokasi), blok: S(l.Blok), saiz: S(l.Saiz_m2), jenis: jenis,
      jenisBm: jenis ? Ref.bm('JENIS_LOT', jenis) : '', kadar: S(l.Kadar_Sewa_RM), statusBuka: S(l.Status_Buka), statusLot: S(l.Status_Lot),
      catatan: S(l.Catatan), alamatSurat: S(l.Alamat_Surat), fnb: jenis === 'FNB'
    };
  }

  function lotTerbuka_() {
    return Db.find('Lot', function (l) { return S(l.Status_Buka) === 'Dibuka' && S(l.Status_Lot) === 'Kosong'; }).map(function (l) {
      var v = lotView_(l);
      return { kod: v.kod, nama: v.nama, lokasi: v.lokasi, saiz: v.saiz, jenis: v.jenis, jenisBm: v.jenisBm, kadar: v.kadar, fnb: v.fnb };
    });
  }

  function lotSenarai_(ctx) {
    RnU.requireViewer(ctx);
    var per = Db.rows('Permohonan_Lot');
    var lots = Db.rows('Lot').map(function (l) {
      var v = lotView_(l);
      var pemohon = per.filter(function (r) { return S(r.Kod_Lot) === v.kod && RnU.AKTIF.indexOf(S(r.Status)) >= 0; });
      v.bilPermohonan = pemohon.length;
      var aktif = pemohon.filter(function (r) { return ['Ditawarkan', 'Diterima', 'Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) >= 0; })[0];
      v.penyewa = aktif ? S((RnU.perniagaan(S(aktif.ID_Perniagaan)) || {}).Nama_Perniagaan) : '';
      return v;
    });
    return { lot: lots, tempoh: tempohLot_(), bolehUbah: RnU.isDecider(ctx) };
  }

  function lotSimpan_(ctx, p) {
    RnU.requireDecider(ctx);
    p = p || {};
    var e = {};
    var kod = S(p.kod).toUpperCase().replace(/\s+/g, '');
    var baru = p.baru === true;
    if (!/^[A-Z0-9][A-Z0-9\-]{1,19}$/.test(kod)) e.kod = 'Kod 2 hingga 20 aksara (huruf besar, nombor, sengkang) / 2 to 20 characters';
    var cur = RnU.lotById(kod);
    if (baru && cur) e.kod = 'Kod lot sudah wujud / Lot code already exists';
    if (!baru && !cur && !e.kod) throw appError_('RN_TIDAK_DITEMUI');
    var jenis = S(p.jenis);
    if (jenis && JENIS_LOT.indexOf(jenis) < 0) e.jenis = 'Pilihan tidak sah / Invalid choice';
    var kadar = S(p.kadar) === '' ? '' : Util.parseRm(p.kadar);
    if (kadar === null) e.kadar = 'Masukkan nilai RM yang tepat / Enter an exact RM value';
    var saiz = S(p.saiz) === '' ? '' : parseFloat(p.saiz);
    if (saiz !== '' && (isNaN(saiz) || saiz <= 0 || saiz > 100000)) e.saiz = 'Nombor tidak sah / Invalid number';
    var statusBuka = S(p.statusBuka) || (cur ? S(cur.Status_Buka) : 'Ditutup');
    if (['Dibuka', 'Ditutup'].indexOf(statusBuka) < 0) e.statusBuka = 'Pilihan tidak sah / Invalid choice';
    var nama = S(p.nama).substr(0, 120);
    if (!nama) e.nama = 'Wajib diisi / Required';
    var statusLot = S(p.statusLot) || (cur ? S(cur.Status_Lot) : 'Kosong');
    if (cur && statusLot !== S(cur.Status_Lot)) {
      if (['Dipohon', 'Disewa'].indexOf(S(cur.Status_Lot)) >= 0 || PILIHAN_STATUS_LOT.indexOf(statusLot) < 0) throw appError_('RN_LOT_STATUS_SISTEM');
    } else if (!cur && PILIHAN_STATUS_LOT.indexOf(statusLot) < 0) throw appError_('RN_LOT_STATUS_SISTEM');
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    var rec = {
      Kod_Lot: kod, Nama_Paparan: nama, Lokasi: S(p.lokasi).substr(0, 120), Blok: S(p.blok).substr(0, 60), Saiz_m2: saiz, Jenis: jenis,
      Kadar_Sewa_RM: kadar, Status_Buka: statusBuka, Status_Lot: statusLot, Catatan: S(p.catatan).substr(0, 300),
      Alamat_Surat: S(p.alamatSurat).substr(0, 250)
    };
    Db.withLock(function () {
      var now = RnU.lotById(kod);
      if (baru) {
        if (now) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { kod: 'Kod lot sudah wujud / Lot code already exists' } });
        rec.Didaftar_Oleh = ctx.email; rec.Tarikh_Daftar = new Date();
        Db.append('Lot', rec);
      } else {
        Db.update('Lot', now._row, rec);
      }
      Audit.log(ctx, baru ? 'TAMBAH_LOT' : 'KEMAS_KINI_LOT', 'Ruang Niaga', kod, cur ? S(cur.Kadar_Sewa_RM) + '|' + S(cur.Status_Buka) + '|' + S(cur.Status_Lot) : '',
        kadar + '|' + statusBuka + '|' + statusLot, '');
    });
    return lotSenarai_(ctx);
  }

  // ---------- Kelayakan dan senarai pelajar ----------
  function kelayakan_(m) {
    var per = RnU.perniagaanOwner(m);
    if (!per) {
      var sbg = RnU.perniagaanAhli(m);
      return { boleh: false, sebab: sbg.length ? 'HANYA_PEMILIK' : 'PERLU_SSU', perniagaan: null, pemilik: false };
    }
    var st = RnU.statusPer(per);
    return {
      boleh: st === 'Aktif', sebab: st === 'Aktif' ? '' : 'SSU_TAMAT', pemilik: true,
      perniagaan: { id: S(per.ID_Perniagaan), nama: S(per.Nama_Perniagaan), noPendaftaran: S(per.No_Pendaftaran), status: st }
    };
  }

  function ringkas_(r) {
    var lot = RnU.lotById(S(r.Kod_Lot));
    var per = RnU.perniagaan(S(r.ID_Perniagaan));
    var st = S(r.Status);
    return {
      id: S(r.ID_Permohonan), kodLot: S(r.Kod_Lot), namaLot: RnU.namaLot(lot), perniagaan: per ? S(per.Nama_Perniagaan) : '',
      status: st, tarikhHantar: RnU.dk(r.Tarikh_Hantar), tempohMula: RnU.dk(r.Tempoh_Mula), tempohTamat: RnU.dk(r.Tempoh_Tamat),
      jenisPermohonan: S(r.Jenis_Permohonan) || 'Baharu', ulasan: S(r.Ulasan_Pemohon), bolehBatal: AWAL_BATAL.indexOf(st) >= 0
    };
  }

  function saya_(ctx) {
    var m = ctx.noMatrik;
    if (!m) throw appError_('MATRIK_TIDAK_DITEMUI');
    var k = kelayakan_(m);
    var byDate = function (a, b) { return (Util.toDate(b.Tarikh_Hantar) || 0) - (Util.toDate(a.Tarikh_Hantar) || 0); };
    var milik = Db.find('Permohonan_Lot', function (r) { return Util.normMatric(r.No_Matrik) === m; }).sort(byDate);
    var ids = RnU.perniagaanAhli(m);
    var sertaan = Db.find('Permohonan_Lot', function (r) { return ids.indexOf(S(r.ID_Perniagaan)) >= 0 && Util.normMatric(r.No_Matrik) !== m; }).sort(byDate).map(function (r) {
      var o = ringkas_(r); o.bolehBatal = false;
      var pel = RnU.pelajar(Util.normMatric(r.No_Matrik));
      o.pemilik = pel ? S(pel.Nama_Penuh) : '';
      return o;
    });
    var tempoh = tempohLot_();
    var sebab = k.sebab;
    if (!sebab && !tempoh.dibuka) sebab = 'TEMPOH_TUTUP';
    if (!sebab && k.perniagaan && RnU.bercanggah(k.perniagaan.id)) sebab = 'SUDAH_ADA_LOT';
    return {
      kelayakan: k, tempoh: tempoh, permohonan: milik.map(ringkas_), sertaan: sertaan, lot: lotTerbuka_(),
      boleh: { mohon: !sebab }, sebab: sebab,
      senarai: { kaedah: ['Interbank transfer', 'Deposit tunai', 'PayHub UTM'] }
    };
  }

  // ---------- Permohonan ----------
  function check_(d, lot) {
    var e = {}, v = {};
    var bad = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var fnb = RnU.isFnb(lot);
    v.mula = S(d.tempohMula); v.tamat = S(d.tempohTamat);
    if (!RnU.isDate(v.mula)) bad('tempohMula', 'Tarikh tidak sah / Invalid date');
    else if (Util.daysBetween(new Date(), Util.toDate(v.mula)) < 0) bad('tempohMula', 'Tarikh mula tidak boleh lampau / Start date cannot be in the past');
    if (!RnU.isDate(v.tamat)) bad('tempohTamat', 'Tarikh tidak sah / Invalid date');
    else if (!e.tempohMula && Util.daysBetween(Util.toDate(v.mula), Util.toDate(v.tamat)) <= 0) bad('tempohTamat', 'Tarikh tamat mesti selepas tarikh mula / End date must be after start date');
    else if (!e.tempohMula && Util.daysBetween(Util.addMonths(v.mula, 36), Util.toDate(v.tamat)) > 0) bad('tempohTamat', 'Tempoh maksimum 36 bulan / Maximum 36 months');
    if (fnb) {
      v.vaksin = S(d.vaksin); v.kursus = S(d.kursus);
      if (['Ya', 'Tidak'].indexOf(v.vaksin) < 0) bad('vaksin');
      if (['Ya', 'Tidak'].indexOf(v.kursus) < 0) bad('kursus');
    } else { v.vaksin = ''; v.kursus = ''; }
    var many = function (k, arr, group, min) {
      arr = Array.isArray(arr) ? arr.map(String) : [];
      var u = arr.filter(function (x, i) { return arr.indexOf(x) === i; });
      if (u.length < min) bad(k);
      u.forEach(function (x) { if (!Ref.has(group, x)) bad(k, 'Pilihan tidak sah / Invalid choice'); });
      return u;
    };
    v.sumber = many('sumber', d.sumber, 'SUMBER_PEMBIAYAAN', 1);
    v.pemberi = many('pemberi', d.pemberi, 'PEMBERI_DANA', 0);
    v.dana = Util.parseRm(d.jumlahDana);
    if (v.dana === null) bad('jumlahDana', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    v.jualan = Util.parseRm(d.jualan);
    if (v.jualan === null) bad('jualan', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    var bp = S(d.bilPekerja);
    if (!/^\d{1,3}$/.test(bp)) bad('bilPekerja', 'Nombor bulat 0 hingga 999 / Whole number 0 to 999'); else v.bilPekerja = parseInt(bp, 10);
    v.sebab = S(d.sebab).replace(/\s+/g, ' ');
    if (v.sebab.length < 10 || v.sebab.length > 1000) bad('sebab', '10 hingga 1000 aksara / 10 to 1000 characters');
    v.lokasi = S(d.lokasi).substr(0, 300);
    if (d.perakuan !== true) bad('perakuan', 'Perakuan wajib / The declaration is required');
    return { nilai: v, ralat: e };
  }

  function validateFiles_(d, fnb) {
    var out = {}, e = {};
    var chk = function (key, errKey, f, allow, required) {
      if (f && f.data) {
        try { out[key] = Files.validate(f, allow); } catch (err) { e[errKey] = 'Fail tidak sah / Invalid file'; }
      } else if (required) e[errKey] = 'Muat naik fail / Upload a file';
    };
    chk('cadangan', 'failCadangan', d.failCadangan, ['pdf'], true);
    if (fnb) {
      chk('vaksin', 'failVaksin', d.failVaksin, ['pdf', 'jpg', 'jpeg', 'png'], false);
      chk('kursus', 'failKursus', d.failKursus, ['pdf', 'jpg', 'jpeg', 'png'], false);
    }
    return { fail: out, ralat: e };
  }

  function hantar_(ctx, d) {
    var m = ctx.noMatrik;
    if (!m) throw appError_('MATRIK_TIDAK_DITEMUI');
    d = d || {};
    var k = kelayakan_(m);
    if (!k.pemilik) throw appError_(k.sebab === 'HANYA_PEMILIK' ? 'RN_HANYA_PEMILIK' : 'RN_PERLU_SSU');
    if (!k.boleh) throw appError_('RN_SSU_TAMAT');
    if (!tempohLot_().dibuka) throw appError_('RN_TEMPOH_TUTUP');
    var perId = k.perniagaan.id;
    if (RnU.bercanggah(perId)) throw appError_('RN_SUDAH_ADA_LOT');
    var kodLot = S(d.kodLot);
    var lot = RnU.lotById(kodLot);
    if (!lot || S(lot.Status_Buka) !== 'Dibuka' || S(lot.Status_Lot) !== 'Kosong') {
      throw appError_('RN_LOT_TIDAK_TERSEDIA');
    }
    var chk = check_(d, lot);
    var fv = validateFiles_(d, RnU.isFnb(lot));
    var ralat = chk.ralat;
    Object.keys(fv.ralat).forEach(function (x) { ralat[x] = fv.ralat[x]; });
    if (Object.keys(ralat).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: ralat });
    var v = chk.nilai;
    var now = new Date();
    var tahun = parseInt(Util.fmtDate(now, 'yyyy'), 10);
    var stamp = Util.fmtDate(now, 'yyyyMMddHHmm');
    var url = function (key, pre) { return fv.fail[key] ? Files.save('FLD_LAMPIRAN_LOT', pre + '_' + m + '_' + stamp, fv.fail[key]) : ''; };
    var fCad = url('cadangan', 'CADANGAN'), fVak = url('vaksin', 'VAKSIN'), fKur = url('kursus', 'KURSUS');
    return Db.withLock(function () {
      var lot2 = RnU.lotById(kodLot);
      if (!lot2 || S(lot2.Status_Buka) !== 'Dibuka' || S(lot2.Status_Lot) !== 'Kosong') throw appError_('RN_LOT_TIDAK_TERSEDIA');
      if (RnU.bercanggah(perId)) throw appError_('RN_SUDAH_ADA_LOT');
      var id = Util.formatId('PLT', tahun, Db.nextSeqLocked('PLT_' + tahun), 4);
      Db.append('Permohonan_Lot', {
        ID_Permohonan: id, ID_Perniagaan: perId, No_Matrik: m, Kod_Lot: kodLot, Tempoh_Mula: Util.toDate(v.mula), Tempoh_Tamat: Util.toDate(v.tamat),
        Vaksin_Kepialu: v.vaksin, Fail_Vaksin: fVak, Kursus_Makanan: v.kursus, Fail_Kursus: fKur, Sumber_Pembiayaan: RnU.csv(v.sumber),
        Pemberi_Dana: RnU.csv(v.pemberi), Jumlah_Dana_RM: v.dana, Jangkaan_Jualan_RM: v.jualan, Bil_Pekerja: v.bilPekerja, Fail_Cadangan: fCad,
        Sebab_Berniaga: v.sebab, Lokasi_Dirancang: v.lokasi, Status: 'Baharu', Tarikh_Hantar: now, Jenis_Permohonan: 'Baharu'
      });
      Audit.log(ctx, 'MOHON_LOT', 'Ruang Niaga', id, '', 'Baharu', kodLot + (ctx.bagiPihak ? ' | perakuan diakui admin bagi pihak pemohon' : ' | perakuan pemohon diterima'));
      RnU.mel(RnU.emelOf(m), 'Permohonan lot diterima', 'Lot application received',
        ['Permohonan lot anda (' + id + ', ' + RnU.namaLot(lot2) + ') telah diterima dan akan disemak oleh UTMXCITE.'],
        ['Your lot application (' + id + ', ' + RnU.namaLot(lot2) + ') has been received and will be reviewed by UTMXCITE.']);
      return { id: id, ringkasan: saya_(ctx) };
    });
  }

  function batal_(ctx, p) {
    var id = S(p.id);
    var r = RnU.perById(id);
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    return Db.withLock(function () {
      var cur = RnU.perById(id);
      if (AWAL_BATAL.indexOf(S(cur.Status)) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
      Db.update('Permohonan_Lot', cur._row, { Status: 'Dibatalkan', Tarikh_Keputusan: new Date(), Catatan_Admin: 'Dibatalkan oleh pemohon' });
      Audit.log(ctx, 'BATAL_PERMOHONAN_LOT', 'Ruang Niaga', id, S(cur.Status), 'Dibatalkan', '');
      return { id: id, ringkasan: saya_(ctx) };
    });
  }

  function fail_(ctx, p) {
    var r = RnU.perById(S(p.id));
    if (!r || !RnU.akses(ctx, r)) throw appError_('RN_TIDAK_DITEMUI');
    if (S(p.jenis) !== 'cadangan') throw appError_('FAIL_TIDAK_DITEMUI');
    var url = S(r.Fail_Cadangan);
    if (!url) throw appError_('FAIL_TIDAK_DITEMUI');
    return Files.read(url);
  }

  // ---------- Admin: senarai dan butiran ----------
  function adminSenarai_(ctx, p) {
    RnU.requireViewer(ctx);
    p = p || {};
    var status = S(p.status), q = S(p.q).toLowerCase();
    var all = Db.rows('Permohonan_Lot');
    var kiraan = {};
    RnU.STATUS_PER.forEach(function (s) { kiraan[s] = 0; });
    all.forEach(function (r) { var s = S(r.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var pelCache = {}, perCache = {};
    var rows = all.filter(function (r) {
      if (status && status !== 'SEMUA' && S(r.Status) !== status) return false;
      if (q) {
        var per = perCache[S(r.ID_Perniagaan)] || (perCache[S(r.ID_Perniagaan)] = RnU.perniagaan(S(r.ID_Perniagaan)) || {});
        var h = (S(r.ID_Permohonan) + ' ' + S(per.Nama_Perniagaan) + ' ' + S(r.No_Matrik) + ' ' + S(r.Kod_Lot)).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) { return (Util.toDate(b.Tarikh_Hantar) || 0) - (Util.toDate(a.Tarikh_Hantar) || 0); });
    var senarai = rows.slice(0, 300).map(function (r) {
      var o = ringkas_(r);
      var m = Util.normMatric(r.No_Matrik);
      var pel = pelCache[m] || (pelCache[m] = RnU.pelajar(m) || {});
      o.pemilik = S(pel.Nama_Penuh); o.noMatrik = m;
      return o;
    });
    return { kiraan: kiraan, jumlah: rows.length, senarai: senarai, bolehPutus: RnU.isDecider(ctx), tempoh: tempohLot_() };
  }

  function borangOf_(r) {
    return {
      kodLot: S(r.Kod_Lot), tempohMula: RnU.dk(r.Tempoh_Mula), tempohTamat: RnU.dk(r.Tempoh_Tamat), vaksin: S(r.Vaksin_Kepialu), kursus: S(r.Kursus_Makanan),
      sumber: RnU.split(r.Sumber_Pembiayaan), pemberi: RnU.split(r.Pemberi_Dana), jumlahDana: S(r.Jumlah_Dana_RM), jualan: S(r.Jangkaan_Jualan_RM),
      bilPekerja: S(r.Bil_Pekerja), sebab: S(r.Sebab_Berniaga), lokasi: S(r.Lokasi_Dirancang)
    };
  }

  function adminButiran_(ctx, p) {
    RnU.requireViewer(ctx);
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var m = Util.normMatric(r.No_Matrik);
    var pel = RnU.pelajar(m) || {};
    var per = RnU.perniagaan(S(r.ID_Perniagaan));
    var ssu = per ? RnU.ssuLulus(S(per.ID_Perniagaan)) : null;
    var lot = RnU.lotById(S(r.Kod_Lot));
    var pemohon = {
      noMatrik: m, nama: S(pel.Nama_Penuh), emel: S(pel.Emel), fakulti: S(pel.Fakulti), program: S(pel.Program), tahun: S(pel.Tahun_Pengajian),
      telefon: S(pel.No_Telefon), statusPelajar: S(pel.Status_Pelajar)
    };
    if (ctx.role === ROLE.ADMIN_PENUH) pemohon.noKp = S(pel.No_KP_Pasport);
    var ahli = per ? RnU.ahliMatrik(S(per.ID_Perniagaan)).map(function (am) {
      var a = RnU.pelajar(am) || {};
      return { noMatrik: am, nama: S(a.Nama_Penuh), fakulti: S(a.Fakulti), peranan: am === m ? 'Pemilik' : 'Ahli' };
    }) : [];
    var amaran = [];
    if (ssu && S(ssu.Status_SSM) !== 'YA') amaran.push('Pendaftaran SSM: ' + Ref.bm('STATUS_SSM', S(ssu.Status_SSM)) + ' (bukan "Ya"). Perjanjian memerlukan pendaftaran syarikat.');
    if (per && RnU.statusPer(per) !== 'Aktif') amaran.push('SSU perniagaan berstatus ' + RnU.statusPer(per) + '.');
    var bersaing = Db.find('Permohonan_Lot', function (x) { return S(x.Kod_Lot) === S(r.Kod_Lot) && S(x.ID_Permohonan) !== id && RnU.AKTIF.indexOf(S(x.Status)) >= 0; });
    if (bersaing.length) amaran.push('Lot ini juga dipohon oleh ' + bersaing.length + ' permohonan aktif lain: ' + bersaing.map(function (x) { return S(x.ID_Permohonan); }).join(', ') + '.');
    if (lot && ['Dipohon', 'Disewa', 'Penyelenggaraan'].indexOf(S(lot.Status_Lot)) >= 0 && ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai', 'Diluluskan'].indexOf(S(r.Status)) >= 0) {
      amaran.push('Status lot semasa: ' + S(lot.Status_Lot) + ' (tawaran tidak boleh dihantar sehingga lot Kosong).');
    }
    var out = {
      id: id, status: S(r.Status), jenisPermohonan: S(r.Jenis_Permohonan) || 'Baharu', ringkas: ringkas_(r), borang: borangOf_(r),
      label: {
        sumber: RnU.split(r.Sumber_Pembiayaan).map(function (k) { return Ref.bm('SUMBER_PEMBIAYAAN', k); }),
        pemberi: RnU.split(r.Pemberi_Dana).map(function (k) { return Ref.bm('PEMBERI_DANA', k); })
      },
      pemohon: pemohon, ahli: ahli,
      perniagaan: per ? {
        id: S(per.ID_Perniagaan), nama: S(per.Nama_Perniagaan), noPendaftaran: S(per.No_Pendaftaran), statusSsu: RnU.statusPer(per), alamat: S(per.Alamat),
        noSsm: ssu ? S(ssu.No_SSM) : '', statusSsm: ssu ? Ref.bm('STATUS_SSM', S(ssu.Status_SSM)) : '',
        jenisPerniagaan: ssu ? Ref.bm('JENIS_PERNIAGAAN', S(ssu.Jenis_Perniagaan)) : '', produk: ssu ? RnU.split(ssu.Produk).map(function (k) { return Ref.bm('PRODUK', k); }) : [],
        idSsu: ssu ? S(ssu.ID_Permohonan) : ''
      } : null,
      lot: lot ? lotView_(lot) : null,
      fail: { cadangan: !!S(r.Fail_Cadangan), vaksin: !!S(r.Fail_Vaksin), kursus: !!S(r.Fail_Kursus) },
      keputusan: { keputusan: S(r.Keputusan), tarikh: RnU.dk(r.Tarikh_Keputusan), oleh: S(r.Diputuskan_Oleh), catatan: S(r.Catatan_Admin), ulasan: S(r.Ulasan_Pemohon) },
      amaran: amaran, bolehPutus: RnU.isDecider(ctx), idSewaan: S(r.ID_Sewaan)
    };
    if (typeof RnLanjut !== 'undefined') RnLanjut.tambahButiran(ctx, r, out);
    return out;
  }

  function adminFail_(ctx, p) {
    RnU.requireViewer(ctx);
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var jenis = S(p.jenis);
    var col = { cadangan: 'Fail_Cadangan', vaksin: 'Fail_Vaksin', kursus: 'Fail_Kursus' }[jenis];
    if (!col || !S(r[col])) throw appError_('FAIL_TIDAK_DITEMUI');
    Audit.log(ctx, 'PAPAR_FAIL_LOT', 'Ruang Niaga', S(r.ID_Permohonan), '', jenis, '');
    return Files.read(S(r[col]));
  }

  /** Lepaskan lot dan batalkan sisa tawaran apabila permohonan ditarik/ditolak/luput/dibatalkan. Dalam kunci. */
  function lepas_(r, statusBaharu, catatan, ctx) {
    var id = S(r.ID_Permohonan), lama = S(r.Status), amaran = [];
    var lot = RnU.lotById(S(r.Kod_Lot));
    if (lot && S(lot.Status_Lot) === 'Dipohon' && ['Ditawarkan', 'Diterima', 'Perjanjian'].indexOf(lama) >= 0) RnU.setLot(S(r.Kod_Lot), 'Kosong');
    var taw = RnU.tawaranById(id);
    if (taw && ['Dihantar', 'Diterima', 'Draf'].indexOf(S(taw.Status)) >= 0) {
      var tst = { 'Tawaran Luput': 'Luput', 'Ditolak Pemohon': 'Ditolak', Dibatalkan: 'Dibatalkan' }[statusBaharu] || 'Dibatalkan';
      Db.update('Tawaran_Sewa', taw._row, { Status: tst });
    }
    Db.find('Cagaran', function (c) { return S(c.ID_Permohonan) === id; }).forEach(function (c) {
      if (['Belum Bayar', 'Menunggu Pengesahan'].indexOf(S(c.Status)) >= 0) Db.update('Cagaran', c._row, { Status: 'Dibatalkan' });
      else if (S(c.Status) === 'Diterima') amaran.push('Cagaran ' + S(c.Jenis) + ' (RM ' + S(c.Jumlah_RM) + ') telah diterima: pulangkan atau rampas secara manual.');
    });
    Db.update('Permohonan_Lot', r._row, { Status: statusBaharu, Tarikh_Keputusan: new Date(), Catatan_Admin: catatan || S(r.Catatan_Admin) });
    return amaran;
  }

  var TINDAKAN = {
    semak: { dari: ['Baharu'], ke: 'Disemak' },
    tolak: { dari: ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai'], ke: 'Ditolak', catatan: true },
    lulus: { dari: ['Dinilai'], ke: 'Diluluskan' },
    batal: { dari: ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai', 'Diluluskan', 'Ditawarkan', 'Diterima', 'Perjanjian'], ke: 'Dibatalkan', catatan: true }
  };

  function adminTindakan_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id), t = S(p.tindakan), cat = S(p.catatan).substr(0, 500), ulasan = S(p.ulasan).substr(0, 500);
    var rule = TINDAKAN[t];
    if (!rule) throw appError_('RN_PERALIHAN_TIDAK_SAH');
    if (rule.catatan && !cat) throw appError_('RN_CATATAN_WAJIB');
    var info = Db.withLock(function () {
      var r = RnU.perById(id);
      if (!r) throw appError_('RN_TIDAK_DITEMUI');
      var lama = S(r.Status);
      if (rule.dari.indexOf(lama) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
      var amaran = [];
      if (t === 'tolak' || t === 'batal') {
        amaran = lepas_(r, rule.ke, cat, ctx);
        Db.update('Permohonan_Lot', r._row, { Keputusan: t === 'tolak' ? 'Ditolak' : S(r.Keputusan), Diputuskan_Oleh: ctx.email, Ulasan_Pemohon: ulasan || (t === 'tolak' ? '' : S(r.Ulasan_Pemohon)) });
      } else {
        var patch = { Status: rule.ke };
        if (t === 'lulus') { patch.Keputusan = 'Diluluskan'; patch.Tarikh_Keputusan = new Date(); patch.Diputuskan_Oleh = ctx.email; patch.Ulasan_Pemohon = ulasan; if (cat) patch.Catatan_Admin = cat; }
        Db.update('Permohonan_Lot', r._row, patch);
      }
      Audit.log(ctx, 'LOT_' + t.toUpperCase(), 'Ruang Niaga', id, lama, rule.ke, cat);
      return { m: Util.normMatric(r.No_Matrik), amaran: amaran, nama: RnU.namaLot(RnU.lotById(S(r.Kod_Lot))) };
    });
    var emel = RnU.emelOf(info.m);
    if (t === 'lulus') {
      RnU.mel(emel, 'Permohonan lot diluluskan', 'Lot application approved',
        ['Tahniah. Permohonan lot anda (' + id + ', ' + info.nama + ') telah diluluskan oleh jawatankuasa. Surat tawaran akan dihantar tidak lama lagi.' + (ulasan ? ' Catatan: ' + ulasan : '')],
        ['Congratulations. Your lot application (' + id + ', ' + info.nama + ') has been approved. The offer letter will be sent shortly.']);
    } else if (t === 'tolak') {
      RnU.mel(emel, 'Permohonan lot tidak berjaya', 'Lot application unsuccessful',
        ['Permohonan lot anda (' + id + ', ' + info.nama + ') tidak berjaya.' + (ulasan ? ' Catatan: ' + ulasan : '')],
        ['Your lot application (' + id + ', ' + info.nama + ') was unsuccessful.']);
    } else if (t === 'batal') {
      RnU.mel(emel, 'Permohonan lot dibatalkan', 'Lot application cancelled',
        ['Permohonan lot anda (' + id + ') telah dibatalkan oleh UTMXCITE. Catatan: ' + cat], ['Your lot application (' + id + ') has been cancelled by UTMXCITE. Note: ' + cat]);
    }
    var out = adminButiran_(ctx, { id: id });
    out.amaranTindakan = info.amaran;
    return out;
  }

  return {
    tempohLot: tempohLot_, tempohSimpan: tempohSimpan_, lotSenarai: lotSenarai_, lotSimpan: lotSimpan_, lotTerbuka: lotTerbuka_, lotView: lotView_,
    kelayakan: kelayakan_, saya: saya_, hantar: hantar_, batal: batal_, fail: fail_, ringkas: ringkas_,
    adminSenarai: adminSenarai_, adminButiran: adminButiran_, adminFail: adminFail_, adminTindakan: adminTindakan_, lepas: lepas_, borangOf: borangOf_
  };
})();
