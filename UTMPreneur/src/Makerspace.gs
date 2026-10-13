/**
 * UTMPreneur: modul Makerspace (tempahan ruang, Laser Cut, 3D Printer dan pinjaman peralatan).
 * Dipecahkan kepada beberapa fail Makerspace*.gs. Objek global tunggal `Makerspace` mendedahkan routes(), jobHarian() dan seed().
 * Fail ini mengandungi mesej, Tetapan, fungsi pembantu kongsi (objek Mk) dan jadual laluan RPC.
 * PERHATIAN: tiada kebergantungan semasa muat antara fail; fungsi fail lain dipanggil di dalam fungsi sahaja.
 */

var MSG_MK = {
  MK_TIDAK_SAH: ['Maklumat tempahan tidak sah. Semak medan yang bertanda.', 'The booking is invalid. Check the highlighted fields.'],
  MK_ADMIN_TIDAK_SAH: ['Maklumat tidak sah. Semak medan yang bertanda.', 'The details are invalid. Check the highlighted fields.'],
  MK_KONFLIK: ['Slot masa ini sudah ditempah atau sedang menunggu kelulusan.', 'This time slot is already booked or awaiting approval.'],
  MK_STOK: ['Baki stok alat tidak mencukupi.', 'Not enough stock available.'],
  MK_BIL_LEWAT: ['Anda mempunyai bil Makerspace yang lewat. Sila jelaskan bayaran dahulu sebelum menempah.', 'You have an overdue Makerspace bill. Please settle it before booking.'],
  MK_LAPORAN_LEWAT: ['Laporan aktiviti bagi tempahan ruang terdahulu belum dihantar. Sila hantar laporan dahulu sebelum menempah ruang.', 'The activity report for a previous space booking is overdue. Please submit it before booking a space.'],
  MK_PINJAMAN_LEWAT: ['Anda mempunyai pinjaman peralatan yang lewat dipulangkan. Sila pulangkan dahulu sebelum meminjam semula.', 'You have overdue borrowed equipment. Please return it before borrowing again.'],
  MK_PROFIL_DULU: ['Sila lengkapkan profil akaun anda dahulu.', 'Please complete your account profile first.'],
  MK_EMEL_PEMOHON: ['Emel pemohon tidak sah atau tiada dalam rekod.', 'The applicant email is invalid or not on record.'],
  MK_TIDAK_DITEMUI: ['Tempahan tidak ditemui.', 'Booking not found.'],
  MK_PERALIHAN_TIDAK_SAH: ['Tindakan ini tidak sah pada status semasa.', 'This action is not valid in the current status.'],
  MK_CATATAN_WAJIB: ['Catatan wajib diisi untuk tindakan ini.', 'A note is required for this action.'],
  MK_BELUM_DIPERAKUI: ['Tempahan pelajar ini belum diperakui oleh penyelia.', 'This student booking has not been endorsed by the supervisor yet.'],
  MK_PERAKUAN_TIDAK_SAH: ['Pautan tidak sah atau telah tamat tempoh.', 'The link is invalid or has expired.'],
  MK_PERAKUAN_HAD: ['Terlalu banyak percubaan. Cuba lagi sebentar lagi.', 'Too many attempts. Please try again shortly.'],
  MK_KADAR_TIADA: ['Kadar belum ditetapkan oleh urusetia, bil belum boleh dijana.', 'The rate has not been set by the secretariat, so the bill cannot be generated yet.'],
  MK_BAYARAN_TIDAK_SAH: ['Maklumat bayaran tidak sah. Semak medan yang bertanda.', 'The payment details are invalid. Check the highlighted fields.'],
  MK_BAYARAN_TIDAK_DITEMUI: ['Bil tidak ditemui.', 'Bill not found.'],
  MK_BATAL_TIDAK_BOLEH: ['Tempahan ini tidak boleh dibatalkan pada masa ini. Sila hubungi UTMXCITE.', 'This booking cannot be cancelled now. Please contact UTMXCITE.'],
  MK_PEMBAHARUAN_TIDAK_SAH: ['Pinjaman ini tidak boleh diperbaharui (pembaharuan hanya sekali, sebelum lewat, dan maksimum sebulan).', 'This loan cannot be renewed (once only, before it is overdue, up to one month).'],
  MK_PENGGUNAAN_TIDAK_SAH: ['Maklumat penggunaan sebenar tidak sah.', 'The actual usage details are invalid.'],
  MK_FAIL_TIADA: ['Fail tidak tersedia.', 'The file is not available.'],
  MK_LAPORAN_TIDAK_SAH: ['Laporan aktiviti tidak boleh dihantar bagi tempahan ini.', 'An activity report cannot be submitted for this booking.']
};

var TETAPAN_MK = [
  ['PERAKUAN_TAMAT_HARI', '5', 'Makerspace: tempoh sah pautan perakuan penyelia (hari kalendar)'],
  ['PERAKUAN_HAD_10MIN', '30', 'Makerspace: had permintaan pada halaman perakuan bagi setiap pautan dalam 10 minit'],
  ['LAPORAN_AKTIVITI_HARI', '3', 'Makerspace: hari selepas aktiviti ruang untuk menghantar laporan aktiviti'],
  ['RUANG_MAKS_HARI', '14', 'Makerspace: bilangan hari operasi maksimum bagi satu tempahan ruang'],
  ['TEMPAHAN_MAKS_HARI_DEPAN', '180', 'Makerspace: tempahan paling awal boleh dibuat (hari dari hari ini)'],
  ['PINJAMAN_MAKS_BULAN', '1', 'Makerspace: tempoh pinjaman peralatan maksimum (bulan)'],
  ['PINJAMAN_MAKS_PEMBAHARUAN', '1', 'Makerspace: bilangan pembaharuan pinjaman maksimum'],
  ['BAYARAN_PERINGATAN_HARI', '4', 'Makerspace: hari ke- selepas bil dijana untuk emel peringatan bayaran']
];

var Mk = (function () {
  var AKTIF = ['Menunggu Perakuan', 'Menunggu Kelulusan', 'Diluluskan'];
  var JENIS = ['Ruang', 'Laser Cut', '3D Printer', 'Pinjaman'];
  var PREFIX_ID = 'TMP';

  // ---------- Tarikh dan masa (kunci tarikh yyyy-MM-dd, masa HH:mm) ----------
  function todayKey_() { return Util.dateKey(new Date()); }
  function nowMin_() {
    return parseInt(Util.fmtDate(new Date(), 'HH'), 10) * 60 + parseInt(Util.fmtDate(new Date(), 'mm'), 10);
  }
  function validKey_(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function addDays_(key, n) {
    var p = key.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().substr(0, 10);
  }
  function dow_(key) {
    var p = key.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    return d === 0 ? 7 : d;
  }
  /** Date setempat (getter tempatan memberi tarikh yang sama) untuk Util.workingDaysBetween. */
  function local_(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function toMin_(s) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s == null ? '' : s).trim());
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function fmtMin_(n) { return Util.pad(Math.floor(n / 60), 2) + ':' + Util.pad(n % 60, 2); }
  function rm2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function intOf_(v) { return /^\d{1,6}$/.test(String(v == null ? '' : v).trim()) ? parseInt(String(v).trim(), 10) : null; }

  function cutiMap_() {
    var m = {};
    Db.rows('Cuti').forEach(function (r) { var k = Util.dateKey(r.Tarikh); if (k) m[k] = Util.str(r.Nama) || 'Cuti'; });
    return m;
  }

  /** Tetapan waktu operasi dan cuti. */
  function ops_() {
    var hari = Cfg.list('HARI_OPERASI').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 1 && x <= 7; });
    if (!hari.length) hari = [1, 2, 3, 4, 5];
    var buka = toMin_(Cfg.get('JAM_MULA', '08:00')); if (buka === null) buka = 480;
    var tutup = toMin_(Cfg.get('JAM_TAMAT', '17:00')); if (tutup === null || tutup <= buka) tutup = 1020;
    var slot = Math.max(5, Cfg.num('SLOT_MINIT', 30));
    return {
      hari: hari, buka: buka, tutup: tutup, slot: slot,
      maksMin: Math.max(slot, Cfg.num('SLOT_MAKS_JAM', 4) * 60),
      notis: Cfg.num('NOTIS_HARI_BEKERJA_RUANG', 3),
      cuti: cutiMap_()
    };
  }
  function isOp_(key, ops) { return ops.hari.indexOf(dow_(key)) >= 0 && !ops.cuti[key]; }
  /** Hari operasi dalam julat [mula, tamat] (dihadkan 400 hari). */
  function opDaysIn_(mula, tamat, ops) {
    var out = [], k = mula, n = 0;
    while (k <= tamat && n < 400) { if (isOp_(k, ops)) out.push(k); k = addDays_(k, 1); n++; }
    return out;
  }
  /** Sebanyak `count` hari operasi bermula pada `mula` (mula mesti hari operasi). */
  function opDaysFrom_(mula, count, ops) {
    var out = [], k = mula, n = 0;
    while (out.length < count && n < 800) { if (isOp_(k, ops)) out.push(k); k = addDays_(k, 1); n++; }
    return out;
  }
  function workingDays_(fromKey, toKey, ops) {
    return Util.workingDaysBetween(local_(fromKey), local_(toKey), Object.keys(ops.cuti), ops.hari);
  }

  // ---------- Data ----------
  function pelajarRow_(m) {
    var l = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    return l.length ? l[0] : null;
  }
  function penggunaOf_(email) {
    var l = Db.find('Pengguna', function (r) { return Util.normEmail(r.Emel) === email; });
    return l.length ? l[0] : null;
  }
  function tempahan_(id) {
    var l = Db.find('Tempahan', function (r) { return Util.str(r.ID_Tempahan) === id; });
    return l.length ? l[0] : null;
  }
  function byId_(tab, id) {
    return Db.find(tab, function (r) { return Util.str(r.ID_Tempahan) === id; })[0] || null;
  }
  function listById_(tab, id) {
    return Db.find(tab, function (r) { return Util.str(r.ID_Tempahan) === id; });
  }
  function sumber_(kod) {
    var l = Db.find('PERALATAN', function (r) { return Util.str(r.Kod_Mesin) === kod; });
    return l.length ? l[0] : null;
  }
  function alat_(kod) {
    var l = Db.find('ALAT', function (r) { return Util.str(r.Kod_Alat) === kod; });
    return l.length ? l[0] : null;
  }
  function sumberAktif_(r) { return Util.str(r.Status || 'Aktif') === 'Aktif'; }

  // ---------- Kadar ----------
  function rmOf_(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v === 'number') return isNaN(v) || v < 0 ? null : v;
    return Util.parseRm(v);
  }
  /**
   * Fungsi pencari kadar: fn(kod, jenisPengguna, tarikhKunci) -> {ada, rm, unit, nama}.
   * Kadar kosong atau tiada baris ialah "belum ditetapkan" (ada = false).
   */
  function kadarFn_() {
    var rows = Db.rows('KADAR');
    return function (kod, jenisPengguna, onKey) {
      var best = null, bestKey = '';
      rows.forEach(function (r) {
        if (Util.str(r.Kod_Sumber) !== kod || Util.str(r.Jenis_Pengguna) !== jenisPengguna || !Util.truthy(r.Aktif)) return;
        var bk = Util.dateKey(r.Berkuat_Kuasa) || '0000-00-00';
        if (onKey && bk > onKey) return;
        if (!best || bk >= bestKey) { best = r; bestKey = bk; }
      });
      if (!best) return { ada: false, rm: null, unit: '', nama: kod };
      var rm = rmOf_(best.Kadar_RM);
      return { ada: rm !== null, rm: rm, unit: Util.str(best.Unit), nama: Util.str(best.Nama_Sumber) || kod };
    };
  }

  // ---------- Emel dan pautan ----------
  function mel_(to, subjectBm, subjectEn, bm, en, tanpaPautan) {
    if (!to) return false;
    try {
      var url = Cfg.get('WEBAPP_URL', '');
      if (url && !tanpaPautan) { bm = bm.concat(['Buka UTMPreneur: ' + url]); en = en.concat(['Open UTMPreneur: ' + url]); }
      return Mail.send(to, { subjectBm: subjectBm, subjectEn: subjectEn, bm: bm, en: en });
    } catch (err) { console.error('Emel Makerspace gagal: ' + err); return false; }
  }

  function status_(r) { return Util.str(r.Status); }
  function tokenTamat_(r) {
    var t = Util.toDate(r.Token_Tamat);
    return !t || t.getTime() < new Date().getTime();
  }
  /** Adakah tempahan menduduki slot (mengira Menunggu Perakuan yang pautannya masih sah)? */
  function menduduki_(r) {
    var st = status_(r);
    if (AKTIF.indexOf(st) < 0) return false;
    if (st === 'Menunggu Perakuan' && tokenTamat_(r)) return false;
    return true;
  }

  /**
   * Konflik masa bagi satu sumber. days = hari operasi diminta; mulaMin/tamatMin = tetingkap harian.
   * Pulang senarai baris Tempahan yang bertindih.
   */
  function konflik_(kod, days, mulaMin, tamatMin, excludeId, ops) {
    var set = {}; days.forEach(function (d) { set[d] = true; });
    return Db.find('Tempahan', function (r) {
      if (Util.str(r.Kod_Sumber) !== kod || Util.str(r.ID_Tempahan) === excludeId || !menduduki_(r)) return false;
      var a = toMin_(r.Masa_Mula), b = toMin_(r.Masa_Tamat);
      if (a === null || b === null) return false;
      if (!(mulaMin < b && a < tamatMin)) return false;
      return opDaysIn_(Util.dateKey(r.Tarikh_Mula), Util.dateKey(r.Tarikh_Tamat), ops).some(function (d) { return set[d]; });
    });
  }

  // ---------- Stok pinjaman ----------
  /** Kuantiti sedang dipinjam atau ditempah (menunggu/diluluskan, belum dipulangkan) bagi satu kod alat. */
  function dipinjam_(kod, excludeId) {
    var aktif = {};
    Db.rows('Tempahan').forEach(function (r) { if (Util.str(r.Jenis) === 'Pinjaman' && menduduki_(r)) aktif[Util.str(r.ID_Tempahan)] = true; });
    var n = 0;
    Db.rows('Item_Pinjaman').forEach(function (it) {
      var id = Util.str(it.ID_Tempahan);
      if (id === excludeId || Util.str(it.Kod_Alat) !== kod || Util.str(it.Status) === 'Dipulangkan' || !aktif[id]) return;
      n += Number(it.Kuantiti) || 0;
    });
    return n;
  }
  function baki_(alat, excludeId) {
    var jumlah = Number(alat.Kuantiti_Jumlah) || 0, rosak = Number(alat.Kuantiti_Rosak_Hilang) || 0;
    var dip = dipinjam_(Util.str(alat.Kod_Alat), excludeId || '');
    return { jumlah: jumlah, rosak: rosak, dipinjam: dip, baki: Math.max(0, jumlah - rosak - dip) };
  }

  // ---------- Pemohon ----------
  /** Pemohon bagi pengguna yang log masuk sendiri. */
  function pemohonSendiri_(ctx) {
    if (ctx.role === ROLE.PELAJAR) {
      if (!ctx.noMatrik) throw appError_('MATRIK_TIDAK_DITEMUI');
      var pel = pelajarRow_(ctx.noMatrik);
      var pg = penggunaOf_(ctx.email);
      return {
        emel: ctx.email, nama: ctx.nama || Util.str(pel && pel.Nama_Penuh), jenis: ROLE.PELAJAR, noMatrik: ctx.noMatrik,
        telefon: Util.str(pg && pg.Telefon) || Util.str(pel && pel.No_Telefon), jabatan: Util.str(pel && pel.Fakulti), bagiPihak: false
      };
    }
    if (ctx.role === ROLE.STAF || ctx.role === ROLE.LUAR) {
      var p = penggunaOf_(ctx.email);
      if (!p) throw appError_('MK_PROFIL_DULU');
      return {
        emel: ctx.email, nama: Util.str(p.Nama), jenis: ctx.role, noMatrik: '', telefon: Util.str(p.Telefon),
        jabatan: Util.str(p.Jabatan_Organisasi), bagiPihak: false
      };
    }
    throw appError_('TIADA_KEBENARIAN');
  }

  /** Pemohon bagi admin yang menempah bagi pihak (noMatrik pelajar, atau emel staf/luar). */
  function pemohonBagi_(ctx, p) {
    if (Util.str(p.noMatrik)) {
      var c = Bantu.ctx(ctx, p.noMatrik, 'makerspace'); // semak kebenaran dan rekod PELAJAR
      var pel = pelajarRow_(c.noMatrik);
      var pgs = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === c.noMatrik; });
      var emel = Util.normEmail(pgs.length ? pgs[0].Emel : pel.Emel);
      if (!Util.isEmail(emel)) throw appError_('MK_EMEL_PEMOHON');
      return {
        emel: emel, nama: c.nama, jenis: ROLE.PELAJAR, noMatrik: c.noMatrik,
        telefon: Util.str(pgs.length ? pgs[0].Telefon : '') || Util.str(pel.No_Telefon), jabatan: Util.str(pel.Fakulti), bagiPihak: true
      };
    }
    if (!Bantu.allowed(ctx, 'makerspace')) throw appError_('TIADA_KEBENARIAN');
    var e = Util.normEmail(p.emelPemohon);
    if (!Util.isEmail(e)) throw appError_('MK_EMEL_PEMOHON');
    var jenis = Util.roleByDomain(e, Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), Cfg.get('DOMAIN_STAF', '@utm.my'));
    if (jenis === ROLE.PELAJAR) throw appError_('MK_EMEL_PEMOHON', { medan: { emelPemohon: 'Pelajar: gunakan No. Matrik / Students: use the matric number' } });
    if (Admins.find(e)) throw appError_('MK_EMEL_PEMOHON', { medan: { emelPemohon: 'Emel pentadbir tidak boleh menjadi pemohon / An admin email cannot be an applicant' } });
    var pg = penggunaOf_(e);
    var nama = Util.str(pg && pg.Nama) || Util.str(p.namaPemohon).substr(0, 120);
    var tel = Util.str(pg && pg.Telefon) || Util.str(p.telefonPemohon).substr(0, 20);
    var ralat = {};
    if (!nama) ralat.namaPemohon = 'Wajib diisi / Required';
    if (!/^[0-9+\-\s]{8,16}$/.test(tel)) ralat.telefonPemohon = 'No. telefon tidak sah / Invalid phone number';
    if (Object.keys(ralat).length) throw appError_('MK_TIDAK_SAH', { medan: ralat });
    return {
      emel: e, nama: nama, jenis: jenis, noMatrik: '', telefon: tel,
      jabatan: Util.str(pg && pg.Jabatan_Organisasi) || Util.str(p.jabatanPemohon).substr(0, 160), bagiPihak: true
    };
  }

  // ---------- Kebenaran admin ----------
  function adminLihat_(ctx) {
    if (ADMIN_ROLES.indexOf(ctx.role) < 0 || ctx.role === ROLE.PENILAI) throw appError_('TIADA_KEBENARIAN');
  }
  function bolehPutus_(ctx) {
    if (ctx.role === ROLE.ADMIN_PENUH) return true;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      return !mod || mod.indexOf('semua') >= 0 || mod.indexOf('makerspace') >= 0;
    }
    return false;
  }
  function adminPutus_(ctx) {
    adminLihat_(ctx);
    if (!bolehPutus_(ctx)) throw appError_('TIADA_KEBENARIAN');
  }

  // ---------- Had kadar ringkas (CacheService) ----------
  /** Pulang true jika masih dalam had; menambah kiraan. */
  function had_(key, maks, saat) {
    var c = Db.cache();
    var n = parseInt(c.get(key) || '0', 10);
    if (n >= maks) return false;
    c.put(key, String(n + 1), saat);
    return true;
  }

  function idBaharu_(prefix, tab, lajur) {
    var tahun = parseInt(Util.fmtDate(new Date(), 'yyyy'), 10);
    return Util.formatId(prefix, tahun, Db.nextSeqLocked(prefix + '_' + tahun), 4);
  }

  function tarikhSel_(v) { return v ? Util.toDate(v) : ''; }

  return {
    AKTIF: AKTIF, JENIS: JENIS, PREFIX_ID: PREFIX_ID,
    todayKey: todayKey_, nowMin: nowMin_, validKey: validKey_, addDays: addDays_, dow: dow_, toMin: toMin_, fmtMin: fmtMin_,
    rm2: rm2_, int: intOf_, ops: ops_, isOp: isOp_, opDaysIn: opDaysIn_, opDaysFrom: opDaysFrom_, workingDays: workingDays_,
    pelajarRow: pelajarRow_, penggunaOf: penggunaOf_, tempahan: tempahan_, byId: byId_, listById: listById_, sumber: sumber_, alat: alat_,
    sumberAktif: sumberAktif_, kadarFn: kadarFn_, rmOf: rmOf_, mel: mel_, menduduki: menduduki_, tokenTamat: tokenTamat_, konflik: konflik_,
    dipinjam: dipinjam_, baki: baki_, pemohonSendiri: pemohonSendiri_, pemohonBagi: pemohonBagi_,
    adminLihat: adminLihat_, bolehPutus: bolehPutus_, adminPutus: adminPutus_, had: had_, idBaharu: idBaharu_, tarikhSel: tarikhSel_
  };
})();

var Makerspace = {
  /** Laluan RPC modul Makerspace (digabungkan oleh rpcTable_ dalam Code.gs). */
  routes: function () {
    var PENGGUNA = [ROLE.PELAJAR, ROLE.STAF, ROLE.LUAR];
    var BAGI = [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL];
    return {
      // pengguna
      'mk.maklumat':         { auth: true, roles: PENGGUNA.concat(ADMIN_ROLES), fn: function (c, p) { return MkTempahan.maklumat(c, p); } },
      'mk.ketersediaan':     { auth: true, roles: PENGGUNA.concat(ADMIN_ROLES), fn: function (c, p) { return MkTempahan.ketersediaan(c, p); } },
      'mk.anggar':           { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkTempahan.anggar(c, p, false); } },
      'mk.hantar':           { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkTempahan.hantar(c, p, Mk.pemohonSendiri(c)); } },
      'mk.saya':             { auth: true, roles: PENGGUNA, fn: function (c) { return MkTempahan.saya(c); } },
      'mk.butiran':          { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkTempahan.butiran(c, p); } },
      'mk.batal':            { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkTempahan.batal(c, p); } },
      'mk.perakuan.hantarSemula': { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkPerakuan.hantarSemula(c, p); } },
      'mk.pinjaman.perbaharui': { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkTempahan.perbaharui(c, p, false); } },
      'mk.bayaran.rekod':    { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkBil.rekodBayaran(c, p); } },
      'mk.laporan.hantar':   { auth: true, roles: PENGGUNA, fn: function (c, p) { return MkTempahan.hantarLaporan(c, p); } },
      'mk.fail':             { auth: true, roles: PENGGUNA.concat(ADMIN_ROLES), fn: function (c, p) { return MkTempahan.fail(c, p); } },
      // perakuan penyelia: tanpa sesi
      'mk.perakuan.maklumat': { auth: false, fn: function (c, p) { return MkPerakuan.maklumat(p); } },
      'mk.perakuan.otp':      { auth: false, fn: function (c, p) { return MkPerakuan.otp(p); } },
      'mk.perakuan.sahkan':   { auth: false, fn: function (c, p) { return MkPerakuan.sahkan(p); } },
      // admin
      'mk.admin.ringkasan':  { auth: true, roles: ADMIN_ROLES, fn: function (c) { return MkAdmin.ringkasan(c); } },
      'mk.admin.senarai':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.senarai(c, p); } },
      'mk.admin.butiran':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.butiran(c, p); } },
      'mk.admin.putus':      { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.putus(c, p); } },
      'mk.admin.penggunaan': { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.penggunaan(c, p); } },
      'mk.admin.pulang':     { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.pulang(c, p); } },
      'mk.admin.perbaharui': { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkTempahan.perbaharui(c, p, true); } },
      'mk.admin.bayaran.senarai': { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.bayaranSenarai(c, p); } },
      'mk.admin.bayaran.putus':   { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.bayaranPutus(c, p); } },
      'mk.admin.alat.senarai':    { auth: true, roles: ADMIN_ROLES, fn: function (c) { return MkAdmin.alatSenarai(c); } },
      'mk.admin.alat.simpan':     { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.alatSimpan(c, p); } },
      'mk.admin.peralatan.senarai': { auth: true, roles: ADMIN_ROLES, fn: function (c) { return MkAdmin.peralatanSenarai(c); } },
      'mk.admin.peralatan.simpan':  { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.peralatanSimpan(c, p); } },
      'mk.admin.peralatan.lalai':   { auth: true, roles: ADMIN_ROLES, fn: function (c) { return MkAdmin.peralatanLalai(c); } },
      'mk.admin.kadar.senarai':   { auth: true, roles: ADMIN_ROLES, fn: function (c) { return MkAdmin.kadarSenarai(c); } },
      'mk.admin.kadar.simpan':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return MkAdmin.kadarSimpan(c, p); } },
      'mk.admin.pemohon':    { auth: true, roles: BAGI, fn: function (c, p) { return MkAdmin.pemohon(c, p); } },
      'mk.admin.anggar':     { auth: true, roles: BAGI, fn: function (c, p) { return MkTempahan.anggar(c, p, true); } },
      'mk.admin.hantar':     { auth: true, roles: BAGI, fn: function (c, p) { return MkTempahan.hantar(c, p, Mk.pemohonBagi(c, p)); } }
    };
  },

  /** Kerja harian (dipanggil oleh Jobs.harian). Idempotent. */
  jobHarian: function () { return MkBil.jobHarian(); }
};
