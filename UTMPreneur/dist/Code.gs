/** UTMPreneur: fail gabungan (dijana oleh scripts/bundle.js daripada src/). Jangan sunting di sini; sunting src/ dan jana semula. */

// ===== Admin.gs =====
/**
 * SHAMS: tindakan pentadbir peringkat 1 (status sistem, urus admin, import PELAJAR).
 */

var AdminApi = {
  status: function (ctx) {
    var s = {
      versi: APP.VERSI,
      mode: Mode.current(),
      bilPelajar: Db.rows('PELAJAR').length,
      bilPengguna: Db.rows('Pengguna').length,
      bilAdmin: Admins.list().filter(function (a) { return a.aktif; }).length,
      otpHariIni: parseInt(Db.props().getProperty('OTP_DAY_' + Util.fmtDate(new Date(), 'yyyyMMdd')) || '0', 10),
      otpHad: Cfg.num('OTP_MAKS_HARIAN', 1000),
      webappUrl: Cfg.get('WEBAPP_URL', '')
    };
    s.struktur = Setup.validate();
    return s;
  },

  listAdmins: function (ctx) {
    return Admins.list().map(function (a) {
      return { emel: a.emel, nama: a.nama, peranan: a.peranan, modul: a.modul, aktif: a.aktif, dikunci: a.emel === ADMIN_UTAMA };
    });
  },

  addAdmin: function (ctx, p) {
    p = p || {};
    var emel = Util.normEmail(p.emel);
    var nama = Util.str(p.nama).substr(0, 120);
    var peranan = Util.str(p.peranan);
    var modul = Util.str(p.modul).substr(0, 120);
    if (!Util.isEmail(emel)) throw appError_('EMEL_TIDAK_SAH');
    if (!nama) throw appError_('MAKLUMAT_TIDAK_LENGKAP');
    if (ADMIN_ROLES.indexOf(peranan) < 0) throw appError_('ADMIN_PERANAN');
    if (emel === ADMIN_UTAMA) throw appError_('ADMIN_DIKUNCI');
    if (!Util.isStaffEmail(emel, Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), Cfg.get('DOMAIN_STAF', '@utm.my'))) {
      throw new AppError('ADMIN_DOMAIN', 'Admin mesti menggunakan emel staf (' + Cfg.get('DOMAIN_STAF', '@utm.my') + ').', 'Admins must use a staff email (' + Cfg.get('DOMAIN_STAF', '@utm.my') + ').');
    }
    return Db.withLock(function () {
      var cur = Db.find('Admin', function (r) { return Util.normEmail(r.Emel) === emel; });
      var rec = { Emel: emel, Nama: nama, Peranan: peranan, Modul: modul, Aktif: 'Ya', Ditambah_Oleh: ctx.email, Tarikh: new Date() };
      if (cur.length) Db.update('Admin', cur[0]._row, rec); else Db.append('Admin', rec);
      Admins.invalidate();
      Audit.log(ctx, cur.length ? 'KEMAS_KINI_ADMIN' : 'TAMBAH_ADMIN', 'Admin', emel, cur.length ? cur[0].Peranan : '', peranan, modul);
      return AdminApi.listAdmins(ctx);
    });
  },

  setAdminActive: function (ctx, p) {
    p = p || {};
    var emel = Util.normEmail(p.emel);
    if (emel === ADMIN_UTAMA) throw appError_('ADMIN_DIKUNCI');
    return Db.withLock(function () {
      var cur = Db.find('Admin', function (r) { return Util.normEmail(r.Emel) === emel; });
      if (!cur.length) throw appError_('EMEL_TIDAK_SAH');
      var aktif = p.aktif === true || p.aktif === 'Ya';
      Db.update('Admin', cur[0]._row, { Aktif: aktif ? 'Ya' : 'Tidak' });
      Admins.invalidate();
      Audit.log(ctx, aktif ? 'AKTIFKAN_ADMIN' : 'NYAHAKTIF_ADMIN', 'Admin', emel, '', '', '');
      return AdminApi.listAdmins(ctx);
    });
  },

  importPelajar: function (ctx, p) {
    return PelajarImport.run(ctx, p);
  }
};


// ===== Auth.gs =====
/**
 * SHAMS: log masuk emel + OTP, sesi dan peranan.
 * OTP disimpan sebagai hash dalam CacheService (tidak pernah teks biasa).
 * Sesi disimpan dalam CacheService (maksimum 6 jam, had CacheService).
 */

var Auth = (function () {
  var COOLDOWN = 'otpcd:', HOURLY = 'otph:', OTP = 'otp:', SESS = 'sess:';

  function cache_() { return Db.cache(); }

  function pepper_() {
    var p = Db.props();
    var v = p.getProperty(PROPS.PEPPER);
    if (!v) {
      v = Util.randomToken();
      p.setProperty(PROPS.PEPPER, v);
    }
    return v;
  }

  function emailKey_(email) { return Util.sha256(pepper_() + '|' + email).substr(0, 32); }
  function otpHash_(email, code) { return Util.sha256(pepper_() + '|' + email + '|' + code); }

  /** Peranan semasa untuk emel: admin (jika aktif dalam tab Admin), selainnya ikut domain. */
  function roleFor_(email) {
    if (email === ADMIN_UTAMA) return ROLE.ADMIN_PENUH; // admin utama sentiasa Admin Penuh
    var a = Admins.find(email);
    if (a && a.aktif && ADMIN_ROLES.indexOf(a.peranan) >= 0) return a.peranan;
    return Util.roleByDomain(email, Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), Cfg.get('DOMAIN_STAF', '@utm.my'));
  }

  function pgKey_(email) { return 'pg:' + Util.sha256(email).substr(0, 32); }

  /**
   * Baris Pengguna bagi emel. Dicache 60 saat (15 saat jika tiada) supaya setiap panggilan RPC tidak
   * membaca keseluruhan tab. fresh=true memintas cache (digunakan semasa menulis).
   * Menyekat pengguna melalui tab Pengguna berkuat kuasa dalam masa sehingga 60 saat.
   */
  function penggunaOf_(email, fresh) {
    var c = cache_(), k = pgKey_(email);
    if (!fresh) {
      var raw = c.get(k);
      if (raw) { var o = JSON.parse(raw); return o.n ? null : o.r; }
    }
    var l = Db.find('Pengguna', function (r) { return Util.normEmail(r.Emel) === email; });
    var row = l.length ? l[0] : null;
    c.put(k, JSON.stringify(row ? { r: row } : { n: 1 }), row ? 60 : 15);
    return row;
  }

  function pgInvalidate_(email) { cache_().remove(pgKey_(email)); }

  /** Kiraan OTP harian global (Script Properties, dalam kunci). Pulang bilangan selepas ditambah. */
  function bumpDaily_() {
    return Db.withLock(function () {
      var p = Db.props();
      var key = 'OTP_DAY_' + Util.fmtDate(new Date(), 'yyyyMMdd');
      var n = parseInt(p.getProperty(key) || '0', 10) + 1;
      p.setProperty(key, String(n));
      return n;
    }, 5000);
  }

  function requestOtp(emailRaw) {
    var email = Util.normEmail(emailRaw);
    if (!Util.isEmail(email)) throw appError_('EMEL_TIDAK_SAH');

    if (Mode.isUji() && !Mail.allowed(email)) throw appError_('UJI_TIADA_SENARAI');

    var key = emailKey_(email);
    var c = cache_();
    if (c.get(COOLDOWN + key)) throw appError_('RATE_JEDA');
    var hourly = parseInt(c.get(HOURLY + key) || '0', 10);
    if (hourly >= Cfg.num('OTP_MAKS_SEJAM', 3)) throw appError_('RATE_SEJAM');
    if (bumpDaily_() > Cfg.num('OTP_MAKS_HARIAN', 1000)) throw appError_('RATE_HARIAN');

    var pg = penggunaOf_(email);
    if (pg && Util.str(pg.Status) === 'Disekat') throw appError_('AKAUN_DISEKAT');

    var minit = Cfg.num('OTP_TAMAT_MINIT', 5);
    var code = Util.randomOtp();
    var rec = { h: otpHash_(email, code), t: 0, exp: new Date().getTime() + minit * 60000 };
    c.put(OTP + key, JSON.stringify(rec), minit * 60);
    c.put(COOLDOWN + key, '1', Cfg.num('OTP_JEDA_SAAT', 60));
    c.put(HOURLY + key, String(hourly + 1), 3600);

    var sent;
    try {
      sent = Mail.sendOtp(email, code, minit);
    } catch (e) {
      console.error('Emel OTP gagal: ' + e);
      throw appError_('HANTAR_GAGAL');
    }
    if (!sent) throw appError_('UJI_TIADA_SENARAI');
    return { jedaSaat: Cfg.num('OTP_JEDA_SAAT', 60), tamatMinit: minit };
  }

  function verifyOtp(emailRaw, codeRaw) {
    var email = Util.normEmail(emailRaw);
    var code = String(codeRaw == null ? '' : codeRaw).replace(/\s+/g, '');
    if (!Util.isEmail(email)) throw appError_('EMEL_TIDAK_SAH');
    var key = emailKey_(email);
    var c = cache_();
    var raw = c.get(OTP + key);
    if (!raw) throw appError_('OTP_TAMAT');
    var rec = JSON.parse(raw);
    var maxTries = Cfg.num('OTP_MAKS_PERCUBAAN', 5);
    if (rec.t >= maxTries) {
      c.remove(OTP + key);
      throw appError_('OTP_TERLALU_BANYAK');
    }
    if (!/^\d{6}$/.test(code) || !Util.safeEqual(rec.h, otpHash_(email, code))) {
      rec.t++;
      var remain = Math.max(1, Math.floor((rec.exp - new Date().getTime()) / 1000));
      if (rec.t >= maxTries) {
        c.remove(OTP + key);
        Audit.log({ email: email, role: '-' }, 'OTP_TERLALU_BANYAK', 'Auth', '', '', '', '');
        throw appError_('OTP_TERLALU_BANYAK');
      }
      c.put(OTP + key, JSON.stringify(rec), remain);
      throw appError_('OTP_SALAH');
    }
    c.remove(OTP + key);

    var pg = penggunaOf_(email, true);
    if (pg && Util.str(pg.Status) === 'Disekat') throw appError_('AKAUN_DISEKAT');

    var role = roleFor_(email);
    var token = Util.randomToken();
    var ttl = Math.min(21600, Math.max(600, Cfg.num('SESI_JAM', 6) * 3600));
    c.put(SESS + Util.sha256(token), JSON.stringify({ email: email, role: role, at: new Date().getTime() }), ttl);

    if (pg) Db.update('Pengguna', pg._row, { Log_Masuk_Terakhir: new Date() });
    pgInvalidate_(email);
    Audit.log({ email: email, role: role }, 'LOG_MASUK', 'Auth', '', '', '', '');
    return { token: token, session: describe_(email, role) };
  }

  /** Sahkan token dan pulang konteks {email, role}. Peranan disemak semula setiap panggilan. */
  function requireSession(token) {
    if (!token || typeof token !== 'string' || token.length < 32) throw appError_('SESI_TAMAT');
    var raw = cache_().get(SESS + Util.sha256(token));
    if (!raw) throw appError_('SESI_TAMAT');
    var s = JSON.parse(raw);
    var pg = penggunaOf_(s.email);
    if (pg && Util.str(pg.Status) === 'Disekat') throw appError_('AKAUN_DISEKAT');
    var role = roleFor_(s.email);
    var ctx = { email: s.email, role: role, noMatrik: '', nama: '' };
    if (pg) { ctx.nama = Util.str(pg.Nama); if (role === ROLE.PELAJAR) ctx.noMatrik = Util.normMatric(pg.No_Matrik); }
    return ctx;
  }

  function logout(token) {
    if (token && typeof token === 'string') cache_().remove(SESS + Util.sha256(token));
  }

  /** Keadaan akaun: adakah perlu melengkapkan pendaftaran? */
  function describe_(email, role) {
    var pg = penggunaOf_(email);
    var out = { email: email, role: role, nama: '', perlu: '', mode: Mode.current() };
    if (ADMIN_ROLES.indexOf(role) >= 0) {
      var a = Admins.find(email);
      out.nama = a ? a.nama : email;
      return out;
    }
    if (role === ROLE.PELAJAR) {
      if (!pg || !Util.str(pg.No_Matrik)) { out.perlu = 'MATRIK'; return out; }
      out.nama = Util.str(pg.Nama);
      out.noMatrik = Util.str(pg.No_Matrik);
      return out;
    }
    if (!pg) { out.perlu = 'PROFIL'; return out; }
    out.nama = Util.str(pg.Nama);
    return out;
  }

  /** Pelajar menuntut No. Matrik pada log masuk pertama. */
  function claimMatric(ctx, matricRaw) {
    if (ctx.role !== ROLE.PELAJAR) throw appError_('PERANAN_TIDAK_SESUAI');
    var m = Util.normMatric(matricRaw);
    if (!Util.isMatric(m)) throw appError_('MATRIK_TIDAK_SAH');

    return Db.withLock(function () {
      var pel = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; });
      if (!pel.length) {
        Audit.log(ctx, 'MATRIK_TIDAK_DITEMUI', 'Auth', m, '', '', '');
        throw appError_('MATRIK_TIDAK_DITEMUI');
      }
      var p = pel[0];
      var st = Util.str(p.Status_Pelajar);
      if (st && st.toLowerCase() !== 'aktif') throw appError_('STATUS_TIDAK_AKTIF');
      var pe = Util.normEmail(p.Emel);
      if (pe && pe !== ctx.email) {
        Audit.log(ctx, 'MATRIK_EMEL_TIDAK_SEPADAN', 'Auth', m, '', '', 'Percubaan menuntut No. Matrik dengan emel tidak sepadan');
        throw appError_('EMEL_TIDAK_SEPADAN');
      }
      var taken = Db.find('Pengguna', function (r) {
        return Util.normMatric(r.No_Matrik) === m && Util.normEmail(r.Emel) !== ctx.email;
      });
      if (taken.length) {
        Audit.log(ctx, 'MATRIK_DITUNTUT', 'Auth', m, taken[0].Emel, ctx.email, 'Percubaan menuntut No. Matrik milik emel lain');
        throw appError_('MATRIK_DITUNTUT');
      }
      var data = {
        Emel: ctx.email, Peranan: ROLE.PELAJAR, No_Matrik: m, Nama: Util.str(p.Nama_Penuh),
        Telefon: Util.str(p.No_Telefon), Status: 'Aktif', Log_Masuk_Terakhir: new Date()
      };
      var ex = penggunaOf_(ctx.email, true);
      if (ex) {
        Db.update('Pengguna', ex._row, data);
      } else {
        data.Tarikh_Daftar = new Date();
        Db.append('Pengguna', data);
      }
      pgInvalidate_(ctx.email);
      Audit.log(ctx, 'DAFTAR_PELAJAR', 'Auth', m, '', ctx.email, '');
      return describe_(ctx.email, ctx.role);
    });
  }

  function validPhone_(s) { return /^[0-9+\-\s]{8,16}$/.test(s); }

  /** Staf dan orang luar melengkapkan profil pada log masuk pertama. */
  function registerProfile(ctx, d) {
    d = d || {};
    if (ctx.role !== ROLE.STAF && ctx.role !== ROLE.LUAR) throw appError_('PERANAN_TIDAK_SESUAI');
    var nama = Util.str(d.nama).substr(0, 120);
    var tel = Util.str(d.telefon);
    var jabatan = Util.str(d.jabatan).substr(0, 160);
    if (!nama || !tel) throw appError_('MAKLUMAT_TIDAK_LENGKAP');
    if (!validPhone_(tel)) throw appError_('TELEFON_TIDAK_SAH');
    var rec = { Emel: ctx.email, Peranan: ctx.role, Nama: nama, Telefon: tel, Jabatan_Organisasi: jabatan, Status: 'Aktif', Log_Masuk_Terakhir: new Date() };
    if (ctx.role === ROLE.STAF) {
      var noStaf = Util.str(d.noStaf).substr(0, 30);
      if (!noStaf || !jabatan) throw appError_('MAKLUMAT_TIDAK_LENGKAP');
      rec.No_Staf = noStaf;
    } else {
      var kp = Util.str(d.noKp).replace(/\s+/g, '').substr(0, 30);
      if (!kp) throw appError_('MAKLUMAT_TIDAK_LENGKAP');
      rec.No_KP_Pasport = kp;
    }
    return Db.withLock(function () {
      var ex = penggunaOf_(ctx.email, true);
      if (ex) {
        Db.update('Pengguna', ex._row, rec);
      } else {
        rec.Tarikh_Daftar = new Date();
        Db.append('Pengguna', rec);
      }
      pgInvalidate_(ctx.email);
      Audit.log(ctx, ctx.role === ROLE.STAF ? 'DAFTAR_STAF' : 'DAFTAR_LUAR', 'Auth', ctx.email, '', nama, '');
      return describe_(ctx.email, ctx.role);
    });
  }

  function me(ctx) { return describe_(ctx.email, ctx.role); }

  return {
    roleFor: roleFor_,
    requestOtp: requestOtp,
    verifyOtp: verifyOtp,
    requireSession: requireSession,
    logout: logout,
    claimMatric: claimMatric,
    registerProfile: registerProfile,
    invalidatePengguna: pgInvalidate_,
    pepper: pepper_,
    bumpDaily: bumpDaily_,
    me: me
  };
})();


// ===== Bantu.gs =====
/**
 * SHAMS: admin bertindak bagi pihak pelajar ("Bantu pelajar").
 * Admin Penuh, atau Pegawai Modul yang modulnya kosong / Semua / mengandungi SSU atau Profiling, boleh
 * mengisi profiling dan memohon SSU untuk mana-mana pelajar dalam PELAJAR (pelajar tidak perlu sudah log masuk).
 * Semua tindakan menggunakan peraturan pengesahan yang sama seperti pelajar dan direkod dalam Audit dengan
 * emel admin serta tanda [bagi pihak]. Modul lain (Ruang Niaga, Kewangan, Makerspace) akan menggunakan Bantu.ctx yang sama.
 */

var Bantu = (function () {
  /** modulKey: huruf kecil, contoh 'ssu', 'profil', 'ruang niaga', 'kewangan', 'makerspace'. Lalai: SSU atau Profiling. */
  function allowed_(ctx, modulKey) {
    if (ctx.role === ROLE.ADMIN_PENUH) return true;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      if (!mod || mod.indexOf('semua') >= 0) return true;
      var keys = modulKey ? [String(modulKey).toLowerCase()] : ['ssu', 'profil'];
      return keys.some(function (k) { return mod.indexOf(k) >= 0; });
    }
    return false;
  }

  /** Konteks pelajar untuk fungsi modul. Identiti audit kekal emel admin. */
  function ctx_(ctx, noMatrik, modulKey) {
    if (!allowed_(ctx, modulKey)) throw appError_('TIADA_KEBENARIAN');
    var m = Util.normMatric(noMatrik);
    var pel = Util.isMatric(m) ? Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; }) : [];
    if (!pel.length) throw appError_('MATRIK_TIDAK_DITEMUI');
    return { email: ctx.email, role: ctx.role, noMatrik: m, nama: Util.str(pel[0].Nama_Penuh), bagiPihak: true };
  }

  function pelajar_(ctx, p) {
    var c = ctx_(ctx, p.noMatrik);
    var pel = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === c.noMatrik; })[0];
    var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === c.noMatrik; });
    return {
      pelajar: {
        noMatrik: c.noMatrik, nama: c.nama, emel: Util.str(pel.Emel), fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program),
        statusPelajar: Util.str(pel.Status_Pelajar), sudahLogMasuk: pg.length > 0
      },
      profil: Profiling.status(c.noMatrik),
      ssu: Ssu.saya(c)
    };
  }

  return { ctx: ctx_, pelajar: pelajar_, allowed: allowed_ };
})();


// ===== Code.gs =====
/**
 * SHAMS: titik masuk web app dan penghantar RPC.
 * Semua panggilan antara muka melalui rpc(kaedah, token, muatan). Peranan disemak di sini (server),
 * bukan di antara muka.
 */

function doGet(e) {
  var t;
  try {
    if (!PropertiesService.getScriptProperties().getProperty(PROPS.INDUK_ID)) {
      return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">SHAMS belum disediakan. Tetapkan INDUK_ID dan jalankan setup().<br><i>SHAMS is not set up yet.</i></p>')
        .setTitle('SHAMS');
    }
    t = HtmlService.createTemplateFromFile('Index');
    t.versi = APP.VERSI;
    return t.evaluate()
      .setTitle('SHAMS · UTMXCITE')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    console.error('doGet gagal: ' + err);
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">Ralat. Sila cuba lagi.<br><i>Error. Please try again.</i></p>');
  }
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Jadual kaedah RPC. auth=false bermaksud tidak memerlukan sesi. roles=null bermaksud mana-mana peranan.
 * Dibina semasa dipanggil (bukan semasa muat fail) kerana Apps Script memuat fail mengikut urutan
 * dan ROLE/ADMIN_ROLES ditakrifkan dalam Config.gs.
 */
function rpcTable_() {
  var t = {
    'ping':          { auth: false, fn: function () { return { versi: APP.VERSI, masa: new Date().toISOString() }; } },
    'otp.minta':     { auth: false, fn: function (c, p) { return Auth.requestOtp(p.emel); } },
    'otp.sahkan':    { auth: false, fn: function (c, p) { return Auth.verifyOtp(p.emel, p.kod); } },
    'sesi.saya':     { auth: true,  fn: function (c) { return Auth.me(c); } },
    'daftar.matrik': { auth: true,  roles: [ROLE.PELAJAR], fn: function (c, p) { return Auth.claimMatric(c, p.noMatrik); } },
    'daftar.profil': { auth: true,  roles: [ROLE.STAF, ROLE.LUAR], fn: function (c, p) { return Auth.registerProfile(c, p); } },
    'admin.status':  { auth: true,  roles: ADMIN_ROLES, fn: function (c) { return AdminApi.status(c); } },
    'admin.senarai': { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c) { return AdminApi.listAdmins(c); } },
    'admin.tambah':  { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.addAdmin(c, p); } },
    'admin.aktif':   { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.setAdminActive(c, p); } },
    'admin.import':  { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.importPelajar(c, p); } },

    'rujukan.senarai': { auth: true, fn: function () { return Ref.all(); } },

    'profil.dapat':  { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c) { return Profiling.view(c); } },
    'profil.simpan': { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return Profiling.save(c, p); } },

    'ssu.saya':      { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c) { return Ssu.saya(c); } },
    'ssu.dapat':     { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return Ssu.dapat(c, p); } },
    'ssu.hantar':    { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return Ssu.hantar(c, p); } },
    'ssu.fail':      { auth: true, roles: [ROLE.PELAJAR, ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI], fn: function (c, p) { return Ssu.fail(c, p); } },
    'ssu.admin.senarai':  { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminSenarai(c, p); } },
    'ssu.admin.butiran':  { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminButiran(c, p); } },
    'ssu.admin.putus':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminKeputusan(c, p); } },
    'ssu.admin.sijil':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminJanaSijil(c, p); } },
    'bantu.pelajar':      { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Bantu.pelajar(c, p); } },
    'profil.admin.dapat': { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Profiling.view(Bantu.ctx(c, p.noMatrik)); } },
    'profil.admin.simpan':{ auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Profiling.save(Bantu.ctx(c, p.noMatrik), p); } },
    'ssu.admin.pelajar':  { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Ssu.saya(Bantu.ctx(c, p.noMatrik)); } },
    'ssu.admin.dapat':    { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Ssu.dapat(Bantu.ctx(c, p.noMatrik), p); } },
    'ssu.admin.hantar':   { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Ssu.hantarBagiPihak(c, p); } },
    'ssu.admin.sedia':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminDaftarSedia(c, p); } }
  };
  // Laluan modul lain: setiap modul menyediakan routes() yang memulangkan {nama: {auth, roles, matrik, fn}}
  [typeof RuangNiaga !== 'undefined' ? RuangNiaga : null, typeof Kewangan !== 'undefined' ? Kewangan : null,
   typeof Makerspace !== 'undefined' ? Makerspace : null].forEach(function (m) {
    if (m && typeof m.routes === 'function') {
      var r = m.routes();
      Object.keys(r).forEach(function (k) { t[k] = r[k]; });
    }
  });
  return t;
}

/** Dipanggil oleh antara muka melalui google.script.run. Sentiasa pulang objek {ok, data|error}. */
function rpc(method, token, payload) {
  try {
    if (method === 'sesi.keluar') { Auth.logout(token); return { ok: true, data: null }; }
    var table = rpcTable_();
    var h = Object.prototype.hasOwnProperty.call(table, method) ? table[method] : null;
    if (!h) throw appError_('KAEDAH_TIDAK_SAH');
    var ctx = null;
    if (h.auth) {
      ctx = Auth.requireSession(token);
      if (h.roles && h.roles.indexOf(ctx.role) < 0) {
        Audit.log(ctx, 'TIADA_KEBENARIAN', 'RPC', method, '', '', '');
        throw appError_('TIADA_KEBENARIAN');
      }
      if (h.matrik && !ctx.noMatrik) throw appError_('MATRIK_TIDAK_DITEMUI');
    }
    var out = h.fn(ctx, payload && typeof payload === 'object' ? payload : {});
    return { ok: true, data: out === undefined ? null : out };
  } catch (err) {
    if (err instanceof AppError || (err && err.name === 'AppError')) {
      return { ok: false, error: { code: err.code, bm: err.bm, en: err.en, extra: err.extra || null } };
    }
    console.error('RPC ' + method + ' gagal: ' + (err && err.stack ? err.stack : err));
    var m = MSG.RALAT_DALAMAN;
    return { ok: false, error: { code: 'RALAT_DALAMAN', bm: m[0], en: m[1], extra: null } };
  }
}


// ===== Config.gs =====
/**
 * SHAMS: konfigurasi tetap dan skema spreadsheet.
 * Skema ini ialah satu-satunya sumber nama tab dan tajuk lajur. Skrip persediaan
 * (Setup.gs) dan pengesah struktur menggunakannya.
 */

var APP = { NAMA: 'SHAMS', VERSI: '0.1.0', TZ: 'Asia/Kuala_Lumpur' };

/** Kunci Script Properties */
var PROPS = { INDUK_ID: 'INDUK_ID', MODE: 'MODE', PEPPER: 'OTP_PEPPER' };

var MODE = { UJI: 'UJI', PRODUKSI: 'PRODUKSI' };

var ROLE = {
  ADMIN_PENUH: 'Admin Penuh',
  PEGAWAI_MODUL: 'Pegawai Modul',
  PEMERHATI: 'Pemerhati',
  PENILAI: 'Penilai',
  PELAJAR: 'Pelajar',
  STAF: 'Staf',
  LUAR: 'Luar'
};
var ADMIN_ROLES = [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI, ROLE.PENILAI];
var ADMIN_UTAMA = 'utmxcite@utm.my';

/** Nama spreadsheet dan tab. Kunci SS_* ialah Kod dalam Link_Dokumen. */
var SCHEMA = {
  SS_INDUK: {
    nama: 'SHAMS - Induk',
    modul: 'Induk',
    tabs: {
      PELAJAR: ['No_Matrik', 'Nama_Penuh', 'Emel', 'No_KP_Pasport', 'Jantina', 'Etnik', 'Kewarganegaraan', 'Fakulti', 'Program', 'Bidang_Pengajian', 'Tahun_Pengajian', 'No_Telefon', 'Alamat_Kolej', 'Alamat_Rumah', 'Status_Pelajar', 'Sesi_Kemasukan'],
      Pengguna: ['Emel', 'Peranan', 'No_Matrik', 'No_Staf', 'Nama', 'No_KP_Pasport', 'Telefon', 'Jabatan_Organisasi', 'Status', 'Tarikh_Daftar', 'Log_Masuk_Terakhir'],
      Perniagaan: ['ID_Perniagaan', 'Nama_Perniagaan', 'ID_Permohonan_SSU', 'No_Matrik_Pemilik', 'Jenis_SSU', 'Kluster', 'Jenis_Perniagaan', 'No_SSM', 'Alamat', 'No_Pendaftaran', 'Bil_Sijil', 'Tarikh_Pendaftaran', 'Tarikh_Tamat', 'Status_SSU', 'Dicipta_Pada'],
      Link_Dokumen: ['Kod', 'Jenis', 'Modul', 'Nama', 'URL', 'ID', 'Status', 'Catatan'],
      Tetapan: ['Kunci', 'Nilai', 'Penerangan'],
      Admin: ['Emel', 'Nama', 'Peranan', 'Modul', 'Aktif', 'Ditambah_Oleh', 'Tarikh'],
      Cuti: ['Tarikh', 'Nama', 'Jenis'],
      Rujukan: ['Kumpulan', 'Kod', 'BM', 'EN', 'Susunan', 'Aktif'],
      Audit: ['Masa', 'Emel', 'Peranan', 'Tindakan', 'Modul', 'Rujukan', 'Nilai_Lama', 'Nilai_Baharu', 'Catatan'],
      Peringatan: ['Masa', 'Emel', 'Jenis', 'Rujukan', 'Status', 'Catatan'],
      Ringkasan_KPI: ['Petunjuk', 'Nilai', 'Kemas_Kini']
    }
  },
  SS_PROFILING: {
    nama: 'SHAMS - Profiling',
    modul: 'Profiling',
    tabs: {
      Profil: ['ID_Profil', 'No_Matrik', 'Sesi', 'Tarikh_Kemas_Kini', 'No_Telefon', 'Kampung_Halaman', 'Keluarga_Berniaga', 'Pernah_Berniaga', 'Jenis_Perniagaan_Dijalankan', 'Tempoh_Perniagaan', 'Motivasi', 'Berminat_Berniaga', 'Kluster_Diminati', 'Kluster_Lain', 'Mahu_Kampus', 'Aliran_Pilihan'],
      Perniagaan_Keluarga: ['ID_Profil', 'Hubungan', 'Jenis_Perniagaan', 'Tempoh']
    }
  },
  SS_SSU: {
    nama: 'SHAMS - SSU',
    modul: 'SSU',
    tabs: {
      Permohonan_SSU: ['ID_Permohonan', 'Jenis_SSU', 'Jenis_Permohonan', 'ID_Perniagaan', 'No_Matrik_Pemilik', 'Nama_Perniagaan', 'Produk', 'Syarat_Subjek', 'Pensyarah', 'Seksyen', 'Kumpulan', 'Status_SSM', 'No_SSM', 'Fail_SSM', 'Fail_Maklumat_SSM', 'Jenis_Perniagaan', 'Kluster', 'Sumber_Pembiayaan', 'Modal_RM', 'Pendapatan_Bulanan_RM', 'Alamat_Perniagaan', 'Tarikh_Mula_Perniagaan', 'Laman_Media_Sosial', 'Bil_Ahli', 'Status', 'Tarikh_Hantar', 'Tarikh_Keputusan', 'Diluluskan_Oleh', 'Catatan_Admin', 'No_Pendaftaran', 'Bil_Sijil', 'Pautan_Sijil', 'Tarikh_Pendaftaran', 'Tarikh_Tamat'],
      Ahli_Pasukan: ['ID_Permohonan', 'No_Matrik', 'Nama', 'Fakulti', 'Jantina', 'Etnik', 'Tahun', 'Peranan_Ahli']
    }
  },
  SS_RUANG_NIAGA: {
    nama: 'SHAMS - Ruang Niaga',
    modul: 'Ruang Niaga',
    tabs: {
      Lot: ['Kod_Lot', 'Nama_Paparan', 'Lokasi', 'Blok', 'Saiz_m2', 'Jenis', 'Kadar_Sewa_RM', 'Status_Buka', 'Status_Lot', 'Catatan', 'Didaftar_Oleh', 'Tarikh_Daftar', 'Alamat_Surat'],
      Permohonan_Lot: ['ID_Permohonan', 'ID_Perniagaan', 'No_Matrik', 'Kod_Lot', 'Tempoh_Mula', 'Tempoh_Tamat', 'Vaksin_Kepialu', 'Fail_Vaksin', 'Kursus_Makanan', 'Fail_Kursus', 'Sumber_Pembiayaan', 'Pemberi_Dana', 'Jumlah_Dana_RM', 'Jangkaan_Jualan_RM', 'Bil_Pekerja', 'Fail_Cadangan', 'Sebab_Berniaga', 'Lokasi_Dirancang', 'Status', 'Tarikh_Hantar', 'Keputusan', 'Tarikh_Keputusan', 'Catatan_Admin', 'Jenis_Permohonan', 'Ulasan_Pemohon', 'Diputuskan_Oleh', 'ID_Sewaan'],
      Sewaan: ['ID_Sewaan', 'Kod_Lot', 'ID_Perniagaan', 'ID_Permohonan', 'Kadar_RM', 'Tarikh_Mula', 'Tarikh_Tamat', 'Status', 'Didaftar_Oleh', 'Tarikh_Tamat_Sebenar', 'Sebab_Tamat', 'Jenis_Daftar', 'Bil_Pembaharuan', 'Tarikh_Daftar'],
      Bayaran_Sewa: ['ID_Bil', 'ID_Sewaan', 'Kod_Lot', 'ID_Perniagaan', 'Bulan', 'Tahun', 'Jumlah_RM', 'Tarikh_Akhir', 'Status', 'Tarikh_Bayar', 'Kaedah', 'No_Rujukan', 'Fail_Resit', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Catatan', 'Sewa_RM', 'Caj_Utiliti_RM', 'Catatan_Utiliti', 'Tarikh_Jana', 'Bulan_Sewa_Ke'],
      Rubrik: ['Jenis', 'Versi', 'Kod_Kriteria', 'Kriteria_BM', 'Kriteria_EN', 'Sub_Perkara', 'Markah_Maks', 'Tertib', 'Tahap5', 'Tahap3', 'Tahap1', 'Aktif'],
      Sesi_Penilaian: ['ID_Sesi', 'Tarikh', 'Masa', 'Tempat', 'Status', 'Versi_Rubrik', 'Penilai', 'Senarai_Permohonan', 'Dicipta_Oleh', 'Jemputan_Dihantar'],
      Skor_Penilaian: ['ID_Sesi', 'ID_Permohonan', 'Emel_Penilai', 'Kod_Kriteria', 'Tahap', 'Markah', 'Ulasan', 'Masa_Hantar', 'Dikunci', 'Masa_Simpan'],
      Dokumen_Sewaan: ['ID_Dokumen', 'ID_Permohonan', 'ID_Sewaan', 'Jenis', 'Versi', 'Tajuk', 'Fail', 'Nama_Fail', 'Tarikh', 'Dijana_Oleh', 'Status', 'Kelihatan', 'Catatan'],
      Tawaran_Sewa: ['ID_Permohonan', 'No_Rujukan', 'Tarikh_Surat', 'Jenis_Perniagaan', 'Tarikh_Mula', 'Tarikh_Tamat', 'Bil_Bulan', 'Sewa_Bulanan_RM', 'Utiliti', 'Cagaran_Sewaan_RM', 'Cagaran_Utiliti_RM', 'Waktu_Operasi', 'Penandatangan_Nama', 'Penandatangan_Jawatan', 'Versi_Semasa', 'Status', 'Tarikh_Hantar', 'Tarikh_Luput', 'Respons', 'Tarikh_Respons', 'Emel_Respons', 'Salinan_Fizikal_Tarikh', 'Salinan_Fizikal_Penerima', 'Catatan'],
      Cagaran: ['ID_Cagaran', 'ID_Permohonan', 'ID_Sewaan', 'ID_Perniagaan', 'Jenis', 'Jumlah_RM', 'Tarikh_Akhir_Bayar', 'No_Resit_Rasmi', 'Tarikh_Resit', 'Fail_Resit', 'Tarikh_Muat_Naik', 'Status', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Tarikh_Akhir_Pulang', 'Jumlah_Pulang_RM', 'Tarikh_Pulang', 'Sebab_Potongan', 'Catatan'],
      Jadual_Sewa: ['ID_Permohonan', 'ID_Sewaan', 'Dari_Bulan', 'Hingga_Bulan', 'Kadar_RM'],
      Pekerja_Penyewa: ['ID_Pekerja', 'ID_Permohonan', 'ID_Sewaan', 'ID_Perniagaan', 'Nama', 'Umur', 'Fakulti', 'Tugas', 'Pelajar_UTM', 'No_Matrik', 'Status', 'Ditambah_Oleh', 'Tarikh', 'Catatan_Admin'],
      Peralatan_Lot: ['ID_Peralatan', 'Kod_Lot', 'Nama_Alat', 'Bilangan', 'Catatan', 'Aktif']
    }
  },
  SS_KEWANGAN: {
    nama: 'SHAMS - Kewangan',
    modul: 'Kewangan',
    tabs: {
      Laporan_Bulanan: ['ID_Laporan', 'ID_Perniagaan', 'ID_Sewaan', 'Bulan', 'Tahun', 'Tiada_Aktiviti', 'Pendapatan_RM', 'Perbelanjaan_RM', 'Untung_RM', 'Fail_Laporan', 'Perakuan', 'Status', 'Tarikh_Hantar', 'Tarikh_Akhir', 'Disemak_Oleh', 'Tarikh_Semakan', 'Catatan_Semakan']
    }
  },
  SS_TEMPAHAN_RUANG: {
    nama: 'SHAMS - Makerspace',
    modul: 'Makerspace',
    tabs: {
      Tempahan: ['ID_Tempahan', 'Jenis', 'Kod_Sumber', 'Jenis_Pengguna', 'Emel_Pemohon', 'Nama_Pemohon', 'Tarikh_Mula', 'Masa_Mula', 'Tarikh_Tamat', 'Masa_Tamat', 'Tujuan', 'Emel_Penyelia', 'Status_Perakuan', 'Tarikh_Perakuan', 'Status', 'Diluluskan_Oleh', 'Tarikh_Keputusan', 'Catatan', 'No_Matrik', 'Telefon', 'Jabatan', 'Anggaran_RM', 'Dicipta_Pada', 'Didaftar_Oleh', 'Token_Hash', 'Token_Tamat', 'Catatan_Penyelia', 'Bil_Pembaharuan'],
      Butiran_Ruang: ['ID_Tempahan', 'Nama_Program', 'Bil_Hari', 'Bil_Peserta', 'Kaedah_Bayaran', 'No_VOT', 'Nama_Staf_Kewangan', 'Tel_Staf_Kewangan', 'Fail_Kertas_Kerja', 'Fail_Surat', 'Kaedah_Lain', 'Hari_Sebenar'],
      Item_Peralatan_Ruang: ['ID_Tempahan', 'Kod_Alat', 'Kuantiti'],
      Butiran_LaserCut: ['ID_Tempahan', 'Nama_Projek', 'Jenis_Bahan', 'Masa_Dijangka_Min', 'Masa_Sebenar_Min'],
      Butiran_3DP: ['ID_Tempahan', 'Nama_Projek', 'Fail_Gambar', 'Berat_g', 'Warna', 'No_Mesin', 'Masa_Dijangka_Min', 'Masa_Sebenar_Min', 'Berat_Sebenar_g'],
      Item_Pinjaman: ['ID_Tempahan', 'Kod_Alat', 'Kuantiti', 'Tarikh_Dijangka_Pulang', 'Tarikh_Pulang', 'Status'],
      ALAT: ['Kod_Alat', 'Nama_Alat', 'Kategori', 'Kuantiti_Jumlah', 'Kuantiti_Rosak_Hilang', 'Boleh_Dipinjam', 'Aktif', 'Catatan'],
      PERALATAN: ['Kod_Mesin', 'Jenis', 'No_Mesin', 'Nama_Model', 'Kapasiti', 'Kod_Kadar', 'Status', 'Catatan'],
      KADAR: ['Kod_Sumber', 'Nama_Sumber', 'Jenis_Pengguna', 'Unit', 'Kadar_RM', 'Berkuat_Kuasa', 'Aktif'],
      Bayaran_Makerspace: ['ID_Bayaran', 'ID_Tempahan', 'Emel_Pemohon', 'Anggaran_RM', 'Penggunaan_Sebenar', 'Kos_Sebenar_RM', 'Status', 'Tarikh_Akhir', 'Tarikh_Bayar', 'Kaedah', 'No_Rujukan', 'Fail_Resit', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Tarikh_Jana', 'Catatan'],
      Laporan_Aktiviti: ['ID_Tempahan', 'Fail_Laporan', 'Tarikh_Hantar', 'Status']
    }
  }
};

/** Lajur yang mesti disimpan sebagai teks (kekalkan sifar di hadapan, elak penukaran tarikh). */
var TEXT_COLS = {
  PELAJAR: ['No_Matrik', 'No_KP_Pasport', 'No_Telefon'],
  Pengguna: ['No_Matrik', 'No_Staf', 'No_KP_Pasport', 'Telefon'],
  Perniagaan: ['No_Matrik_Pemilik', 'No_SSM', 'No_Pendaftaran'],
  Profil: ['No_Matrik', 'No_Telefon'],
  Ahli_Pasukan: ['No_Matrik'],
  Permohonan_SSU: ['No_Matrik_Pemilik', 'No_Pendaftaran'],
  Permohonan_Lot: ['No_Matrik'],
  Tempahan: ['No_Matrik', 'Telefon', 'Masa_Mula', 'Masa_Tamat', 'Token_Hash'],
  PERALATAN: ['Kod_Mesin', 'No_Mesin'],
  Butiran_3DP: ['No_Mesin'],
  Tawaran_Sewa: ['No_Rujukan'],
  Cagaran: ['No_Resit_Rasmi'],
  Bayaran_Sewa: ['No_Rujukan'],
  Pekerja_Penyewa: ['No_Matrik'],
  Butiran_Ruang: ['No_VOT', 'Tel_Staf_Kewangan']
};

/** Folder lampiran dan dokumen yang didaftar dalam Link_Dokumen. */
var FOLDERS = [
  { kod: 'FLD_LAMPIRAN_SSU', nama: 'Lampiran SSU', modul: 'SSU' },
  { kod: 'FLD_SIJIL_SSU', nama: 'Sijil SSU (dijana)', modul: 'SSU' },
  { kod: 'FLD_TEMPLAT_SIJIL', nama: 'Templat sijil SSU', modul: 'SSU' },
  { kod: 'FLD_LAMPIRAN_LOT', nama: 'Lampiran permohonan lot', modul: 'Ruang Niaga' },
  { kod: 'FLD_RESIT_SEWA', nama: 'Resit sewa lot', modul: 'Ruang Niaga' },
  { kod: 'FLD_LAPORAN_KEWANGAN', nama: 'Laporan kewangan', modul: 'Kewangan' },
  { kod: 'FLD_LAMPIRAN_MAKERSPACE', nama: 'Lampiran Makerspace', modul: 'Makerspace' },
  { kod: 'FLD_RESIT_MAKERSPACE', nama: 'Resit Makerspace', modul: 'Makerspace' },
  { kod: 'FLD_SANDARAN', nama: 'Sandaran', modul: 'Sistem' }
];

var DOKUMEN = [
  { kod: 'TEMPLAT_SIJIL_SSU', jenis: 'Templat', modul: 'SSU', nama: 'Templat sijil SSU (Google Slides)', catatan: 'Letak fail Google Slides dalam folder FLD_TEMPLAT_SIJIL dan tampal URL di sini' },
  { kod: 'TEMPLAT_LAPORAN_KEWANGAN', jenis: 'Templat', modul: 'Kewangan', nama: 'Templat laporan kewangan', catatan: 'Tampal URL templat laporan kewangan' },
  { kod: 'TEMPLAT_SURAT_TAWARAN', jenis: 'Templat', modul: 'Ruang Niaga', nama: 'Templat surat tawaran / setuju terima (Google Docs, pilihan)', catatan: 'Pilihan: tampal URL Google Docs. Jika kosong, sistem guna surat lalai. Penanda: lihat docs/MODUL_RUANG_NIAGA.md' },
  { kod: 'TEMPLAT_PERJANJIAN_SEWA_FNB', jenis: 'Templat', modul: 'Ruang Niaga', nama: 'Templat perjanjian sewa F&B (Google Docs)', catatan: 'Wajib sebelum perjanjian F&B boleh dijana. Penanda: lihat docs/MODUL_RUANG_NIAGA.md' },
  { kod: 'TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', jenis: 'Templat', modul: 'Ruang Niaga', nama: 'Templat perjanjian sewa bukan F&B (Google Docs)', catatan: 'Wajib sebelum perjanjian bukan F&B boleh dijana. Penanda: lihat docs/MODUL_RUANG_NIAGA.md' },
  { kod: 'LOGO_UTMXCITE', jenis: 'Dokumen', modul: 'Sistem', nama: 'Logo UTM + UTMXCITE (PNG)', catatan: 'Pilihan: tampal URL fail PNG Drive untuk menggantikan logo lalai' }
];

/** Peta tab -> kod spreadsheet. */
var TAB_SS = (function () {
  var m = {};
  Object.keys(SCHEMA).forEach(function (kod) {
    Object.keys(SCHEMA[kod].tabs).forEach(function (t) { m[t] = kod; });
  });
  return m;
})();

/** Nilai lalai Tetapan (Kunci, Nilai, Penerangan). */
var TETAPAN_LALAI = [
  ['DOMAIN_PELAJAR', '@graduate.utm.my', 'Domain emel pelajar'],
  ['DOMAIN_STAF', '@utm.my', 'Domain emel staf (juga domain penyelia)'],
  ['NAMA_PENGHANTAR', 'SHAMS · UTMXCITE', 'Nama penghantar emel'],
  ['WEBAPP_URL', '', 'URL web app (digunakan dalam emel)'],
  ['PENGUJI_EMEL', '', 'MOD UJI sahaja: emel penguji dibenarkan menerima emel, dipisah koma'],
  ['OTP_TAMAT_MINIT', '5', 'Tempoh sah OTP (minit)'],
  ['OTP_MAKS_PERCUBAAN', '5', 'Percubaan maksimum bagi satu OTP'],
  ['OTP_MAKS_SEJAM', '3', 'Bilangan OTP maksimum bagi setiap emel sejam'],
  ['OTP_JEDA_SAAT', '60', 'Jeda minimum antara dua permintaan OTP (saat)'],
  ['OTP_MAKS_HARIAN', '1000', 'Bilangan OTP maksimum sehari (kuota emel Workspace sekitar 1500)'],
  ['SESI_JAM', '6', 'Tempoh sesi log masuk (jam, maksimum 6)'],
  ['MAKS_SAIZ_FAIL_MB', '10', 'Saiz fail muat naik maksimum (MB)'],
  ['JENIS_FAIL', 'pdf,jpg,jpeg,png,xlsx,xls', 'Jenis fail dibenarkan'],
  ['MAKS_AHLI_SSU', '12', 'Bilangan ahli maksimum bagi SSU termasuk pemilik'],
  ['MIKRO_KREDIT_MIN', '500', 'Mikro kredit minimum (RM), fasa 2'],
  ['MIKRO_KREDIT_MAKS', '3000', 'Mikro kredit maksimum (RM), fasa 2'],
  ['PROGRAM_PERUNTUKAN_MAKS', '3000', 'Peruntukan program maksimum (RM), fasa 2'],
  ['HARI_OPERASI', '1,2,3,4,5', 'Hari operasi Makerspace (1=Isnin ... 7=Ahad)'],
  ['JAM_MULA', '08:00', 'Waktu mula operasi Makerspace'],
  ['JAM_TAMAT', '17:00', 'Waktu tamat operasi Makerspace'],
  ['SLOT_MINIT', '30', 'Panjang satu slot mesin (minit)'],
  ['SLOT_MAKS_JAM', '4', 'Tempoh maksimum satu tempahan mesin (jam)'],
  ['NOTIS_HARI_BEKERJA_RUANG', '3', 'Notis minimum tempahan ruang (hari bekerja)'],
  ['JANA_BIL_SEWA_HARI', '5', 'Hari dalam bulan bil sewa dijana'],
  ['TARIKH_AKHIR_SEWA_HARI', '7', 'Hari dalam bulan tarikh akhir bayaran sewa'],
  ['JANA_LAPORAN_HARI', '1', 'Hari dalam bulan laporan kewangan dijana'],
  ['TARIKH_AKHIR_LAPORAN_HARI', '7', 'Hari dalam bulan tarikh akhir laporan kewangan'],
  ['PERINGATAN_SUSULAN_HARI', '3', 'Selang peringatan susulan (hari)'],
  ['TARIKH_AKHIR_BAYARAN_MAKERSPACE_HARI', '7', 'Hari selepas sesi untuk bayaran Makerspace'],
  ['TEMPOH_PERMOHONAN_LOT_BUKA', '', 'Tarikh buka permohonan lot (YYYY-MM-DD)'],
  ['TEMPOH_PERMOHONAN_LOT_TUTUP', '', 'Tarikh tutup permohonan lot (YYYY-MM-DD)'],
  ['SESI_SEMASA', '', 'Sesi akademik semasa, contoh 2026/2027-1'],
  ['TARIKH_MULA_SEMESTER', '', 'Tarikh mula semester semasa (YYYY-MM-DD)'],
  ['AWALAN_SIJIL', 'XCITE', 'Awalan nombor pendaftaran sijil'],
  ['SIJIL_SAH_BULAN', '12', 'Tempoh sah sijil SSU (bulan)'],
  ['SSU_PERINGATAN_HARI', '60,30,7', 'Hari sebelum tamat sijil SSU untuk emel peringatan pembaharuan'],
  ['SSU_PEMBAHARUAN_AWAL_HARI', '60', 'Pembaharuan SSU dibenarkan bermula sekian hari sebelum tamat']
];

/**
 * Gandingan No. KP dengan No. Matrik (keputusan pengguna: semua data yang memuatkan No. Matrik mesti memuatkan No. KP).
 * - Tab yang ada lajur No_Matrik* mendapat lajur `No_KP` tepat selepasnya.
 * - Tab yang hanya ada ID_Perniagaan (Sewaan, Bayaran_Sewa, Cagaran, Laporan_Bulanan) mendapat `No_Matrik_Pemilik` dan `No_KP`
 *   selepas ID_Perniagaan (diisi daripada pemilik perniagaan).
 * Nilai diisi secara automatik oleh Db (sumber: PELAJAR) pada setiap tulis; setup() melengkapkan rekod lama (isiNoKp).
 * PELAJAR dan Pengguna sudah ada No_KP_Pasport; Pengguna pelajar diisi daripada PELAJAR.
 */
(function () {
  Object.keys(SCHEMA).forEach(function (ssKod) {
    Object.keys(SCHEMA[ssKod].tabs).forEach(function (tab) {
      if (tab === 'PELAJAR' || tab === 'Pengguna') return;
      var cols = SCHEMA[ssKod].tabs[tab];
      if (cols.indexOf('No_KP') >= 0) return;
      var mi = -1;
      cols.forEach(function (c, i) { if (mi < 0 && /^No_Matrik/.test(c)) mi = i; });
      if (mi >= 0) {
        cols.splice(mi + 1, 0, 'No_KP');
      } else {
        var pi = cols.indexOf('ID_Perniagaan');
        if (pi < 0) return;
        cols.splice(pi + 1, 0, 'No_Matrik_Pemilik', 'No_KP');
        mi = pi + 1;
      }
      TEXT_COLS[tab] = (TEXT_COLS[tab] || []).concat(['No_KP']);
      if (cols[mi] === 'No_Matrik_Pemilik' && TEXT_COLS[tab].indexOf('No_Matrik_Pemilik') < 0) TEXT_COLS[tab].push('No_Matrik_Pemilik');
    });
  });
})();


// ===== Db.gs =====
/**
 * SHAMS: lapisan data. Semua capaian spreadsheet melalui sini.
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


// ===== Files.gs =====
/**
 * SHAMS: muat naik dan muat turun fail melalui pelayan.
 * Semakan jenis dan saiz dibuat di pelayan: sambungan, jenis MIME dan tandatangan fail (magic bytes).
 * Fail disimpan dalam folder Drive berdaftar (Link_Dokumen); pengguna tidak pernah menerima pautan Drive.
 */

var Files = (function () {
  var MIME = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel'
  };

  /** Jenis sebenar berdasarkan beberapa bait pertama. Pulang pdf, png, jpg, zip (xlsx), ole (xls) atau ''. */
  function sniff_(b) {
    var u = function (i) { return (b[i] + 256) % 256; };
    if (b.length >= 5 && u(0) === 0x25 && u(1) === 0x50 && u(2) === 0x44 && u(3) === 0x46) return 'pdf';
    if (b.length >= 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47) return 'png';
    if (b.length >= 3 && u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF) return 'jpg';
    if (b.length >= 4 && u(0) === 0x50 && u(1) === 0x4B && u(2) === 0x03 && u(3) === 0x04) return 'zip';
    if (b.length >= 4 && u(0) === 0xD0 && u(1) === 0xCF && u(2) === 0x11 && u(3) === 0xE0) return 'ole';
    return '';
  }

  function extOf_(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1] : '';
  }

  var SNIFF_OK = { pdf: ['pdf'], png: ['png'], jpg: ['jpg'], jpeg: ['jpg'], xlsx: ['zip'], xls: ['ole'] };

  /**
   * Semak fail {nama, data(base64)}. allow = senarai sambungan dibenarkan (tertakluk kepada JENIS_FAIL dalam Tetapan).
   * Pulang {bytes, ext, nama, mime}. Lempar FAIL_TIDAK_SAH jika tidak sah.
   */
  function validate_(f, allow) {
    if (!f || typeof f !== 'object' || !f.data || !f.nama) throw appError_('FAIL_TIDAK_SAH');
    var ext = extOf_(f.nama);
    var global = Cfg.list('JENIS_FAIL').map(function (x) { return x.toLowerCase(); });
    if (!ext || allow.indexOf(ext) < 0 || global.indexOf(ext) < 0) throw appError_('FAIL_TIDAK_SAH');
    var maxMb = Cfg.num('MAKS_SAIZ_FAIL_MB', 10);
    var b64 = String(f.data).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (b64.length > Math.ceil(maxMb * 1024 * 1024 * 4 / 3) + 8) throw appError_('FAIL_TIDAK_SAH');
    var bytes;
    try { bytes = Utilities.base64Decode(b64); } catch (e) { throw appError_('FAIL_TIDAK_SAH'); }
    if (!bytes || !bytes.length || bytes.length > maxMb * 1024 * 1024) throw appError_('FAIL_TIDAK_SAH');
    if ((SNIFF_OK[ext] || []).indexOf(sniff_(bytes)) < 0) throw appError_('FAIL_TIDAK_SAH');
    return { bytes: bytes, ext: ext, nama: String(f.nama).substr(-80), mime: MIME[ext] };
  }

  function folderOf_(kod) {
    var l = Db.links()[kod];
    if (!l || !l.id) throw appError_('SETUP_TIADA_LINK', { kod: kod });
    return DriveApp.getFolderById(l.id);
  }

  /** Simpan fail yang telah disemak ke folder berdaftar. Pulang URL fail. */
  function save_(folderKod, baseName, v) {
    var folder = folderOf_(folderKod);
    var blob = Utilities.newBlob(v.bytes, v.mime, baseName + '.' + v.ext);
    var file = folder.createFile(blob);
    file.setName(baseName + '.' + v.ext);
    return file.getUrl();
  }

  /** Baca fail Drive (daripada URL dalam sheet) dan pulang {nama, mime, data(base64)}. */
  function read_(url) {
    var id = Util.idFromUrl(url);
    if (!id) throw appError_('FAIL_TIDAK_DITEMUI');
    var file;
    try { file = DriveApp.getFileById(id); } catch (e) { throw appError_('FAIL_TIDAK_DITEMUI'); }
    var blob = file.getBlob();
    return { nama: file.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  }

  return { validate: validate_, save: save_, read: read_, sniff: sniff_, extOf: extOf_ };
})();


// ===== Import.gs =====
/**
 * SHAMS: import data rasmi pelajar ke tab PELAJAR (CSV, oleh Admin Penuh).
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


// ===== Jobs.gs =====
/**
 * SHAMS: kerja berjadual. Jalankan pasangPencetus() sekali dari editor Apps Script untuk
 * memasang pencetus masa harian (pukul 7 pagi). Selamat dijalankan semula (pencetus lama diganti).
 */

var Jobs = {
  harian: function () {
    var out = {};
    try { out.ssu = Ssu.jobHarian(); } catch (e) { console.error('Kerja SSU gagal: ' + e); out.ssu = { ralat: String(e) }; }
    [['rn', typeof RuangNiaga !== 'undefined' ? RuangNiaga : null], ['kew', typeof Kewangan !== 'undefined' ? Kewangan : null],
     ['mk', typeof Makerspace !== 'undefined' ? Makerspace : null]].forEach(function (x) {
      if (!x[1] || typeof x[1].jobHarian !== 'function') return;
      try { out[x[0]] = x[1].jobHarian(); } catch (e) { console.error('Kerja ' + x[0] + ' gagal: ' + e); out[x[0]] = { ralat: String(e) }; }
    });
    return out;
  }
};

function jobHarian() { return Jobs.harian(); }

function pasangPencetus() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'jobHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('jobHarian').timeBased().everyDays(1).atHour(7).inTimezone(APP.TZ).create();
  Logger.log('Pencetus harian dipasang (jobHarian, 7 pagi).');
}


// ===== Kewangan.gs =====
/**
 * SHAMS: modul Kewangan (laporan kewangan bulanan).
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
      borang: { tiadaAktiviti: o.tiadaAktiviti, pendapatan: o.pendapatan === null ? '' : String(o.pendapatan), perbelanjaan: o.perbelanjaan === null ? '' : String(o.perbelanjaan) },
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
      if (url) { bm = bm.concat(['Buka SHAMS: ' + url]); en = en.concat(['Open SHAMS: ' + url]); }
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
        Tiada_Aktiviti: v.tiada ? 'Ya' : 'Tidak', Pendapatan_RM: v.pendapatan, Perbelanjaan_RM: v.perbelanjaan, Untung_RM: v.untung,
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
        ['Laporan kewangan ' + info.lbl + ' bagi ' + nama + ' perlu dibetulkan. Catatan admin: ' + cat + ' Sila hantar semula dalam SHAMS.'],
        ['The ' + info.lbl + ' financial report for ' + nama + ' needs correction. Admin note: ' + cat + ' Please resubmit in SHAMS.']);
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
        bm = ['Laporan kewangan ' + lbl + ' bagi ' + nama + ' telah lewat (tarikh akhir ' + akhirTxt + '). Sila hantar secepat mungkin dalam SHAMS.'];
        en = ['The ' + lbl + ' financial report for ' + nama + ' is overdue (due ' + akhirTxt + '). Please submit it as soon as possible in SHAMS.'];
      } else {
        bm = ['Sila hantar laporan kewangan ' + lbl + ' bagi ' + nama + ' sebelum atau pada ' + akhirTxt + ' dalam SHAMS.'];
        en = ['Please submit the ' + lbl + ' financial report for ' + nama + ' on or before ' + akhirTxt + ' in SHAMS.'];
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


// ===== Mail.gs =====
/**
 * SHAMS: penghantaran emel dwibahasa (BM utama, English italik kecil).
 * MOD UJI: emel hanya dihantar kepada senarai penguji (Tetapan PENGUJI_EMEL) dan ditanda [UJI].
 */

var Mail = {
  esc: function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** Bina HTML dwibahasa. bm dan en ialah tatasusunan perenggan teks biasa. */
  bodyHtml: function (bm, en) {
    var p = function (arr, style) {
      return arr.map(function (t) { return '<p style="' + style + '">' + Mail.esc(t) + '</p>'; }).join('');
    };
    return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2B2023;max-width:560px">' +
      '<div style="border-top:4px solid #8A2D3B;border-bottom:3px solid #D9A02E;padding:10px 0;margin-bottom:14px">' +
      '<b style="color:#8A2D3B;font-size:17px">SHAMS</b> <span style="color:#74676B;font-size:12px">· UTMXCITE</span></div>' +
      p(bm, 'margin:0 0 10px') +
      '<div style="border-top:1px solid #E7DFE0;margin-top:14px;padding-top:10px">' +
      p(en, 'margin:0 0 8px;font-style:italic;font-size:12px;color:#74676B') + '</div>' +
      '<div style="font-size:11px;color:#74676B;margin-top:14px">Pusat Inovasi Mahasiswa dan Keusahawanan Teknologi (UTMXCITE) · utmxcite@utm.my · 018-967 0791</div>' +
      '</div>';
  },

  /** Adakah emel ini dibenarkan menerima emel dalam mod semasa? */
  allowed: function (to) {
    if (!Mode.isUji()) return true;
    return Cfg.list('PENGUJI_EMEL').map(Util.normEmail).indexOf(Util.normEmail(to)) >= 0;
  },

  /**
   * Hantar emel. Pulang true jika dihantar. Dalam mod UJI, pulang false jika penerima tiada dalam senarai putih.
   * opts: { subjectBm, subjectEn, bm: [..], en: [..] }
   */
  send: function (to, opts) {
    if (!Mail.allowed(to)) return false;
    var subject = (Mode.isUji() ? '[UJI] ' : '') + opts.subjectBm + ' / ' + opts.subjectEn;
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: Mail.bodyHtml(opts.bm, opts.en),
      name: Cfg.get('NAMA_PENGHANTAR', 'SHAMS · UTMXCITE')
    });
    return true;
  },

  sendOtp: function (to, code, minit) {
    return Mail.send(to, {
      subjectBm: 'Kod pengesahan log masuk',
      subjectEn: 'Sign-in verification code',
      bm: [
        'Kod pengesahan anda ialah: ' + code,
        'Kod ini sah selama ' + minit + ' minit. Jangan kongsikannya dengan sesiapa. Jika anda tidak meminta kod ini, abaikan emel ini.'
      ],
      en: [
        'Your verification code is: ' + code,
        'This code is valid for ' + minit + ' minutes. Do not share it with anyone. If you did not request it, ignore this email.'
      ]
    });
  }
};


// ===== Makerspace.gs =====
/**
 * SHAMS: modul Makerspace (tempahan ruang, Laser Cut, 3D Printer dan pinjaman peralatan).
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
      if (url && !tanpaPautan) { bm = bm.concat(['Buka SHAMS: ' + url]); en = en.concat(['Open SHAMS: ' + url]); }
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


// ===== MakerspaceAdmin.gs =====
/**
 * SHAMS: Makerspace, tindakan admin: senarai/butiran tempahan, kelulusan, penggunaan sebenar, pemulangan pinjaman,
 * pengesahan bayaran, urus ALAT / PERALATAN / KADAR dan carian pemohon (tempah bagi pihak).
 * Kebenaran: Admin Penuh dan Pegawai Modul (modul kosong/Semua/Makerspace) memutuskan; Pemerhati baca sahaja; Penilai tiada akses.
 */

var MkAdmin = (function () {
  var JENIS_MESIN = ['3D Printer', 'Laser Cut', 'Ruang'];
  var STATUS_MESIN = ['Aktif', 'Penyelenggaraan', 'Tidak aktif'];
  // jenis pengguna (nilai ROLE; tidak merujuk ROLE semasa muat fail)
  var USER_TYPES = ['Pelajar', 'Staf', 'Luar'];
  var STATUS_TEMPAHAN = ['Menunggu Perakuan', 'Menunggu Kelulusan', 'Diluluskan', 'Selesai', 'Ditolak', 'Dibatalkan'];
  var KOD_RE = /^[A-Z0-9][A-Z0-9_\-]{1,29}$/;

  function yaTidak_(v, def) {
    if (v === undefined || v === null || v === '') return def;
    return v === true || Util.truthy(v);
  }
  function jsonErr_(e) { return appError_('MK_ADMIN_TIDAK_SAH', { medan: e }); }

  // ---------- Ringkasan ----------
  function ringkasan_(ctx) {
    Mk.adminLihat(ctx);
    var tmp = Db.rows('Tempahan');
    var k = { menungguPerakuan: 0, menungguKelulusan: 0, diluluskan: 0 };
    tmp.forEach(function (r) {
      var st = Util.str(r.Status);
      if (st === 'Menunggu Perakuan' && Mk.menduduki(r)) k.menungguPerakuan++;
      else if (st === 'Menunggu Kelulusan') k.menungguKelulusan++;
      else if (st === 'Diluluskan') k.diluluskan++;
    });
    var today = Mk.todayKey();
    var bil = Db.rows('Bayaran_Makerspace');
    k.bayaranMenunggu = bil.filter(function (b) { return Util.str(b.Status) === 'Menunggu Pengesahan'; }).length;
    k.bayaranLewat = bil.filter(function (b) { return Util.str(b.Status) === 'Lewat' || (Util.str(b.Status) === 'Belum Bayar' && Util.dateKey(b.Tarikh_Akhir) < today); }).length;
    var items = Db.rows('Item_Pinjaman');
    var lewatId = {};
    items.forEach(function (it) { if (Util.str(it.Status) !== 'Dipulangkan' && Util.dateKey(it.Tarikh_Dijangka_Pulang) < today) lewatId[Util.str(it.ID_Tempahan)] = true; });
    k.pinjamanLewat = tmp.filter(function (r) { return Util.str(r.Status) === 'Diluluskan' && lewatId[Util.str(r.ID_Tempahan)]; }).length;
    var belum = {}, bilBelum = 0;
    Db.rows('KADAR').forEach(function (r) {
      if (Util.truthy(r.Aktif) && Mk.rmOf(r.Kadar_RM) === null && Util.str(r.Kod_Sumber) !== 'PERALATAN_TANGAN') { bilBelum++; belum[Util.str(r.Kod_Sumber)] = Util.str(r.Nama_Sumber); }
    });
    k.kadarBelum = bilBelum;
    k.kadarBelumKod = Object.keys(belum).map(function (kod) { return { kod: kod, nama: belum[kod] }; });
    k.peralatanKosong = Db.rows('PERALATAN').length === 0;
    k.bolehPutus = Mk.bolehPutus(ctx);
    return k;
  }

  // ---------- Senarai ----------
  function senarai_(ctx, p) {
    Mk.adminLihat(ctx);
    p = p || {};
    var jenis = Util.str(p.jenis), status = Util.str(p.status), kod = Util.str(p.kodSumber);
    var dari = Mk.validKey(Util.str(p.dari)) ? Util.str(p.dari) : '', hingga = Mk.validKey(Util.str(p.hingga)) ? Util.str(p.hingga) : '';
    var q = Util.str(p.q).toLowerCase();
    var all = Db.rows('Tempahan');
    var kiraan = {};
    STATUS_TEMPAHAN.forEach(function (s) { kiraan[s] = 0; });
    all.forEach(function (r) { var s = Util.str(r.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var rows = all.filter(function (r) {
      if (jenis && jenis !== 'SEMUA' && Util.str(r.Jenis) !== jenis) return false;
      var st = Util.str(r.Status);
      if (status === 'AKTIF') { if (Mk.AKTIF.indexOf(st) < 0) return false; }
      else if (status && status !== 'SEMUA' && st !== status) return false;
      if (kod && Util.str(r.Kod_Sumber) !== kod) return false;
      if (dari && Util.dateKey(r.Tarikh_Tamat) < dari) return false;
      if (hingga && Util.dateKey(r.Tarikh_Mula) > hingga) return false;
      if (q) {
        var h = (Util.str(r.ID_Tempahan) + ' ' + Util.str(r.Nama_Pemohon) + ' ' + Util.str(r.Emel_Pemohon) + ' ' + Util.str(r.No_Matrik) + ' ' + Util.str(r.Tujuan)).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (Util.str(p.susun) === 'tarikh') {
      rows.sort(function (a, b) {
        var x = Util.dateKey(a.Tarikh_Mula) + ' ' + Util.str(a.Masa_Mula), y = Util.dateKey(b.Tarikh_Mula) + ' ' + Util.str(b.Masa_Mula);
        return x < y ? -1 : (x > y ? 1 : 0);
      });
    } else rows.sort(function (a, b) { return (Util.toDate(b.Dicipta_Pada) || 0) - (Util.toDate(a.Dicipta_Pada) || 0); });
    var bilMap = {};
    Db.rows('Bayaran_Makerspace').forEach(function (b) { bilMap[Util.str(b.ID_Tempahan)] = Util.str(b.Status); });
    var senarai = rows.slice(0, 400).map(function (r) {
      var o = MkTempahan.paparan(r, { admin: true });
      return {
        id: o.id, jenis: o.jenis, sumberNama: o.sumberNama, kodSumber: o.kodSumber, namaPemohon: o.namaPemohon, jenisPengguna: o.jenisPengguna, emel: o.pemohon.emel,
        noMatrik: o.pemohon.noMatrik, tarikhMula: o.tarikhMula, tarikhTamat: o.tarikhTamat, masaMula: o.masaMula, masaTamat: o.masaTamat, tujuan: o.tujuan,
        status: o.status, bayaran: bilMap[o.id] || '', lewat: !!o.lewat, bagiPihak: o.bagiPihak
      };
    });
    return { kiraan: kiraan, jumlah: rows.length, senarai: senarai, bolehPutus: Mk.bolehPutus(ctx) };
  }

  // ---------- Butiran ----------
  function butiran_(ctx, p) {
    Mk.adminLihat(ctx);
    var id = Util.str((p || {}).id);
    var r = Mk.tempahan(id);
    if (!r) throw appError_('MK_TIDAK_DITEMUI');
    var o = MkTempahan.paparan(r, { admin: true });
    var amaran = [];
    var ops = Mk.ops();
    var kd = Mk.kadarFn();
    var kira = MkBil.kiraTempahan(r, false, kd);
    var kiraSebenar = MkBil.kiraTempahan(r, true, kd);
    o.kira = { anggaran: kira, sebenar: kiraSebenar };
    if (kira.belum.length && o.jenis !== 'Pinjaman') amaran.push('Kadar belum ditetapkan oleh urusetia: ' + kira.belum.join(', ') + '. Bil tidak boleh dijana sehingga ditetapkan.');
    var st = o.status;
    if (Mk.AKTIF.indexOf(st) >= 0 && o.jenis !== 'Pinjaman') {
      var days = Mk.opDaysIn(o.tarikhMula, o.tarikhTamat, ops);
      var kf = Mk.konflik(o.kodSumber, days, Mk.toMin(o.masaMula), Mk.toMin(o.masaTamat), id, ops);
      if (kf.length) amaran.push('Bertindih dengan tempahan ' + kf.map(function (x) { return Util.str(x.ID_Tempahan); }).join(', ') + '.');
    }
    if (st === 'Menunggu Perakuan') amaran.push('Menunggu perakuan penyelia (' + o.penyelia + '). Pautan sah sehingga ' + o.pautanTamat + '.');
    if (o.jenis === 'Pinjaman' && Mk.AKTIF.indexOf(st) >= 0) {
      o.item.forEach(function (it) {
        var a = Mk.alat(it.kod);
        if (a && it.status !== 'Dipulangkan' && st !== 'Diluluskan') {
          var b = Mk.baki(a, id);
          if (it.kuantiti > b.baki) amaran.push('Stok ' + it.nama + ' tidak mencukupi (baki ' + b.baki + ').');
        }
      });
    }
    var sk = MkTempahan.sekatan(Util.normEmail(r.Emel_Pemohon), Util.normMatric(r.No_Matrik));
    if (sk.bil.length) amaran.push('Pemohon mempunyai bil Makerspace lewat (' + sk.bil.join(', ') + ').');
    if (sk.laporan.length) amaran.push('Pemohon mempunyai laporan aktiviti lewat (' + sk.laporan.join(', ') + ').');
    if (sk.pinjaman.length) amaran.push('Pemohon mempunyai pinjaman lewat dipulangkan (' + sk.pinjaman.join(', ') + ').');
    o.amaran = amaran;
    var putus = Mk.bolehPutus(ctx);
    var today = Mk.todayKey();
    var belumPulang = o.item ? o.item.some(function (x) { return x.status !== 'Dipulangkan'; }) : false;
    o.boleh = {
      putus: putus,
      lulus: putus && st === 'Menunggu Kelulusan',
      tolak: putus && (st === 'Menunggu Perakuan' || st === 'Menunggu Kelulusan'),
      batal: putus && Mk.AKTIF.indexOf(st) >= 0,
      penggunaan: putus && o.jenis !== 'Pinjaman' && ['Diluluskan', 'Selesai'].indexOf(st) >= 0 && o.tarikhMula <= today,
      pulang: putus && o.jenis === 'Pinjaman' && st === 'Diluluskan' && belumPulang,
      perbaharui: putus && o.jenis === 'Pinjaman' && st === 'Diluluskan' && o.bilPembaharuan < Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1) && belumPulang
    };
    o.sejarah = Db.find('Audit', function (a) { return Util.str(a.Rujukan) === id && Util.str(a.Modul) === 'Makerspace'; }).slice(-25).map(function (a) {
      return { masa: Util.str(a.Masa), emel: Util.str(a.Emel), tindakan: Util.str(a.Tindakan), lama: Util.str(a.Nilai_Lama), baharu: Util.str(a.Nilai_Baharu), catatan: Util.str(a.Catatan) };
    });
    return o;
  }

  // ---------- Keputusan ----------
  function putus_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var id = Util.str(p.id), t = Util.str(p.tindakan), cat = Util.str(p.catatan).substr(0, 500);
    if (['lulus', 'tolak', 'batal'].indexOf(t) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
    if ((t === 'tolak' || t === 'batal') && !cat) throw appError_('MK_CATATAN_WAJIB');
    var info = Db.withLock(function () {
      var r = Mk.tempahan(id);
      if (!r) throw appError_('MK_TIDAK_DITEMUI');
      var lama = Util.str(r.Status), jenis = Util.str(r.Jenis), now = new Date();
      if (t === 'lulus') {
        if (lama === 'Menunggu Perakuan') throw appError_('MK_BELUM_DIPERAKUI');
        if (lama !== 'Menunggu Kelulusan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
        var ops = Mk.ops();
        if (jenis === 'Pinjaman') {
          Mk.listById('Item_Pinjaman', id).forEach(function (it) {
            var a = Mk.alat(Util.str(it.Kod_Alat));
            if (!a || Number(it.Kuantiti) > Mk.baki(a, id).baki) throw appError_('MK_STOK');
          });
        } else if (Mk.konflik(Util.str(r.Kod_Sumber), Mk.opDaysIn(Util.dateKey(r.Tarikh_Mula), Util.dateKey(r.Tarikh_Tamat), ops), Mk.toMin(r.Masa_Mula), Mk.toMin(r.Masa_Tamat), id, ops).length) {
          throw appError_('MK_KONFLIK');
        }
        var patch = { Status: 'Diluluskan', Diluluskan_Oleh: ctx.email, Tarikh_Keputusan: now, Catatan: cat || Util.str(r.Catatan) };
        if (Util.str(r.Status_Perakuan) === 'Tidak Perlu') { patch.Status_Perakuan = 'Diperakui (Admin)'; patch.Tarikh_Perakuan = now; }
        Db.update('Tempahan', r._row, patch);
        if (jenis === 'Pinjaman') Mk.listById('Item_Pinjaman', id).forEach(function (it) { Db.update('Item_Pinjaman', it._row, { Status: 'Dipinjam' }); });
        Audit.log(ctx, 'MK_LULUS', 'Makerspace', id, lama, 'Diluluskan', cat);
      } else if (t === 'tolak') {
        if (['Menunggu Perakuan', 'Menunggu Kelulusan'].indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        Db.update('Tempahan', r._row, { Status: 'Ditolak', Diluluskan_Oleh: ctx.email, Tarikh_Keputusan: now, Catatan: cat, Token_Hash: '' });
        Audit.log(ctx, 'MK_TOLAK', 'Makerspace', id, lama, 'Ditolak', cat);
      } else {
        if (Mk.AKTIF.indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        Db.update('Tempahan', r._row, { Status: 'Dibatalkan', Diluluskan_Oleh: ctx.email, Tarikh_Keputusan: now, Catatan: cat, Token_Hash: '' });
        Audit.log(ctx, 'MK_BATAL_ADMIN', 'Makerspace', id, lama, 'Dibatalkan', cat);
      }
      return { emel: Util.normEmail(r.Emel_Pemohon), jenis: jenis };
    });
    var teks = { lulus: ['diluluskan', 'approved'], tolak: ['ditolak', 'rejected'], batal: ['dibatalkan oleh UTMXCITE', 'cancelled by UTMXCITE'] }[t];
    Mk.mel(info.emel, 'Tempahan Makerspace ' + teks[0], 'Makerspace booking ' + teks[1],
      ['Tempahan ' + id + ' telah ' + teks[0] + '.' + (cat ? ' Catatan: ' + cat : '')],
      ['Booking ' + id + ' has been ' + teks[1] + '.' + (cat ? ' Note: ' + cat : '')]);
    return butiran_(ctx, { id: id });
  }

  // ---------- Penggunaan sebenar ----------
  function penggunaan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var id = Util.str(p.id);
    var amaran = [];
    Db.withLock(function () {
      var r = Mk.tempahan(id);
      if (!r) throw appError_('MK_TIDAK_DITEMUI');
      var jenis = Util.str(r.Jenis), st = Util.str(r.Status);
      if (jenis === 'Pinjaman' || ['Diluluskan', 'Selesai'].indexOf(st) < 0 || Util.dateKey(r.Tarikh_Mula) > Mk.todayKey()) throw appError_('MK_PENGGUNAAN_TIDAK_SAH');
      var e = {};
      var minit = Mk.int(p.minitSebenar), hari = Mk.int(p.hariSebenar), g = Util.parseRm(p.beratSebenarG);
      if (jenis === 'Ruang') {
        var b = Mk.byId('Butiran_Ruang', id) || {};
        if (hari === null || hari < 1 || hari > (Number(b.Bil_Hari) || 1)) e.hariSebenar = 'Hari sebenar 1 hingga ' + (Number(b.Bil_Hari) || 1) + ' / Actual days';
      } else {
        if (minit === null || minit < 1 || minit > 2880) e.minitSebenar = 'Masukkan minit sebenar (1 hingga 2880) / Enter actual minutes';
        if (jenis === '3D Printer' && (g === null || g <= 0 || g > 5000)) e.beratSebenarG = 'Masukkan berat sebenar dalam gram / Enter the actual weight in grams';
      }
      if (Object.keys(e).length) throw appError_('MK_PENGGUNAAN_TIDAK_SAH', { medan: e });
      if (jenis === 'Ruang') Db.update('Butiran_Ruang', Mk.byId('Butiran_Ruang', id)._row, { Hari_Sebenar: hari });
      else if (jenis === 'Laser Cut') Db.update('Butiran_LaserCut', Mk.byId('Butiran_LaserCut', id)._row, { Masa_Sebenar_Min: minit });
      else Db.update('Butiran_3DP', Mk.byId('Butiran_3DP', id)._row, { Masa_Sebenar_Min: minit, Berat_Sebenar_g: g });
      var kd = Mk.kadarFn();
      var sebenar = MkBil.kiraTempahan(r, true, kd);
      var bil = MkTempahan.bilOf(id);
      if (sebenar.belum.length) {
        amaran.push('Kadar belum ditetapkan (' + sebenar.belum.join(', ') + '): kos sebenar dan bil belum dikira. Tetapkan kadar kemudian rekod semula penggunaan.');
      } else if (bil) {
        var lamaKos = bil.Kos_Sebenar_RM === '' ? bil.Anggaran_RM : bil.Kos_Sebenar_RM;
        var patch = { Kos_Sebenar_RM: sebenar.jumlah, Penggunaan_Sebenar: MkBil.penggunaanTeks(Mk.tempahan(id)) };
        if (['Dibayar', 'Dikecualikan'].indexOf(Util.str(bil.Status)) >= 0 && Mk.rm2(lamaKos) !== sebenar.jumlah) {
          patch.Catatan = (Util.str(bil.Catatan) ? Util.str(bil.Catatan) + ' | ' : '') + 'Kos sebenar dikemas kini selepas bayaran: RM' + Mk.rm2(lamaKos).toFixed(2) + ' ke RM' + sebenar.jumlah.toFixed(2);
          amaran.push('Bil sudah ' + Util.str(bil.Status) + ': kos sebenar berubah daripada RM' + Mk.rm2(lamaKos).toFixed(2) + ' kepada RM' + sebenar.jumlah.toFixed(2) + '. Urus beza secara manual.');
        }
        Db.update('Bayaran_Makerspace', bil._row, patch);
      } else {
        var res = MkBil.janaLocked(Mk.tempahan(id), { sebenar: true, oleh: ctx.email });
        if (res.dijana) MkBil.emelBil(r, res.bil);
        else if (res.sebab === 'PERCUMA') amaran.push('Kos sebenar RM0: tiada bil dijana.');
      }
      Db.update('Tempahan', r._row, { Status: 'Selesai' });
      Audit.log(ctx, 'MK_PENGGUNAAN', 'Makerspace', id, st, 'Selesai', MkBil.penggunaanTeks(Mk.tempahan(id)));
    });
    var out = butiran_(ctx, { id: id });
    out.amaranPenggunaan = amaran;
    return out;
  }

  // ---------- Pemulangan pinjaman ----------
  function pulang_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var id = Util.str(p.id), kod = Util.str(p.kod);
    var email = '';
    Db.withLock(function () {
      var r = Mk.tempahan(id);
      if (!r) throw appError_('MK_TIDAK_DITEMUI');
      if (Util.str(r.Jenis) !== 'Pinjaman' || Util.str(r.Status) !== 'Diluluskan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
      email = Util.normEmail(r.Emel_Pemohon);
      var items = Mk.listById('Item_Pinjaman', id).filter(function (it) { return Util.str(it.Status) !== 'Dipulangkan' && (!kod || Util.str(it.Kod_Alat) === kod); });
      if (!items.length) throw appError_('MK_PERALIHAN_TIDAK_SAH');
      items.forEach(function (it) { Db.update('Item_Pinjaman', it._row, { Status: 'Dipulangkan', Tarikh_Pulang: new Date() }); });
      Audit.log(ctx, 'MK_PULANG', 'Makerspace', id, '', items.map(function (it) { return Util.str(it.Kod_Alat); }).join(','), Util.str(p.catatan).substr(0, 300));
      var tinggal = Mk.listById('Item_Pinjaman', id).some(function (it) { return Util.str(it.Status) !== 'Dipulangkan'; });
      if (!tinggal) {
        Db.update('Tempahan', r._row, { Status: 'Selesai' });
        var res = MkBil.janaLocked(Mk.tempahan(id), { sebenar: false, oleh: ctx.email });
        if (res.dijana) MkBil.emelBil(r, res.bil);
      }
    });
    Mk.mel(email, 'Pemulangan peralatan direkod', 'Equipment return recorded',
      ['Pemulangan peralatan bagi tempahan ' + id + ' telah direkod. Terima kasih.'], ['The return of equipment for booking ' + id + ' has been recorded. Thank you.']);
    return butiran_(ctx, { id: id });
  }

  // ---------- Bayaran ----------
  function bayaranSenarai_(ctx, p) {
    Mk.adminLihat(ctx);
    p = p || {};
    var status = Util.str(p.status), q = Util.str(p.q).toLowerCase();
    var all = Db.rows('Bayaran_Makerspace');
    var today = Mk.todayKey();
    var kiraan = { 'Belum Bayar': 0, 'Menunggu Pengesahan': 0, Dibayar: 0, Dikecualikan: 0, Lewat: 0 };
    all.forEach(function (b) { var s = Util.str(b.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var rows = all.filter(function (b) {
      if (status && status !== 'SEMUA' && Util.str(b.Status) !== status) return false;
      if (q) {
        var r = Mk.tempahan(Util.str(b.ID_Tempahan));
        var h = (Util.str(b.ID_Bayaran) + ' ' + Util.str(b.ID_Tempahan) + ' ' + Util.str(b.Emel_Pemohon) + ' ' + (r ? Util.str(r.Nama_Pemohon) : '')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) { return Util.dateKey(b.Tarikh_Jana) < Util.dateKey(a.Tarikh_Jana) ? -1 : 1; });
    return {
      kiraan: kiraan, bolehPutus: Mk.bolehPutus(ctx),
      senarai: rows.slice(0, 300).map(function (b) {
        var v = MkTempahan.bilView(b);
        var r = Mk.tempahan(v.idTempahan);
        v.namaPemohon = r ? Util.str(r.Nama_Pemohon) : '';
        v.jenis = r ? Util.str(r.Jenis) : '';
        v.emel = Util.normEmail(b.Emel_Pemohon);
        v.lewatHari = v.tarikhAkhir && v.tarikhAkhir < today && ['Belum Bayar', 'Lewat'].indexOf(v.status) >= 0 ? Util.daysBetween(v.tarikhAkhir, today) : 0;
        return v;
      })
    };
  }

  function bayaranPutus_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var idb = Util.str(p.id || p.idBayaran), t = Util.str(p.tindakan), cat = Util.str(p.catatan).substr(0, 300);
    if (['sahkan', 'tolak', 'kecuali'].indexOf(t) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
    if ((t === 'tolak' || t === 'kecuali') && !cat) throw appError_('MK_CATATAN_WAJIB');
    var emel = '', idt = '';
    Db.withLock(function () {
      var b = Db.find('Bayaran_Makerspace', function (x) { return Util.str(x.ID_Bayaran) === idb; })[0];
      if (!b) throw appError_('MK_BAYARAN_TIDAK_DITEMUI');
      var lama = Util.str(b.Status), now = new Date();
      emel = Util.normEmail(b.Emel_Pemohon); idt = Util.str(b.ID_Tempahan);
      if (t === 'sahkan') {
        if (['Menunggu Pengesahan', 'Belum Bayar', 'Lewat'].indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        var patch = { Status: 'Dibayar', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: now, Catatan: cat || Util.str(b.Catatan) };
        if (lama !== 'Menunggu Pengesahan') {
          var kaedah = Util.str(p.kaedah);
          if (MkBil.KAEDAH_BAYARAN.indexOf(kaedah) < 0) throw appError_('MK_BAYARAN_TIDAK_SAH', { medan: { kaedah: 'Pilih kaedah bayaran / Choose a payment method' } });
          patch.Kaedah = kaedah; patch.No_Rujukan = Util.str(p.noRujukan).substr(0, 60); patch.Tarikh_Bayar = now;
        }
        Db.update('Bayaran_Makerspace', b._row, patch);
        Audit.log(ctx, 'MK_SAHKAN_BAYARAN', 'Makerspace', idb, lama, 'Dibayar', cat);
      } else if (t === 'tolak') {
        if (lama !== 'Menunggu Pengesahan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
        var baru = Util.dateKey(b.Tarikh_Akhir) < Mk.todayKey() ? 'Lewat' : 'Belum Bayar';
        Db.update('Bayaran_Makerspace', b._row, { Status: baru, Kaedah: '', No_Rujukan: '', Fail_Resit: '', Tarikh_Bayar: '', Catatan: 'Bayaran ditolak: ' + cat });
        Audit.log(ctx, 'MK_TOLAK_BAYARAN', 'Makerspace', idb, lama, baru, cat);
      } else {
        if (['Menunggu Pengesahan', 'Belum Bayar', 'Lewat'].indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        Db.update('Bayaran_Makerspace', b._row, { Status: 'Dikecualikan', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: now, Catatan: cat });
        Audit.log(ctx, 'MK_KECUALI_BAYARAN', 'Makerspace', idb, lama, 'Dikecualikan', cat);
      }
    });
    var tk = { sahkan: ['disahkan', 'confirmed'], tolak: ['ditolak (' + cat + ')', 'rejected (' + cat + ')'], kecuali: ['dikecualikan', 'waived'] }[t];
    Mk.mel(emel, 'Bayaran Makerspace ' + tk[0], 'Makerspace payment ' + tk[1],
      ['Bayaran bagi bil ' + idb + ' (tempahan ' + idt + ') telah ' + tk[0] + '.'], ['Payment for bill ' + idb + ' (booking ' + idt + ') has been ' + tk[1] + '.']);
    return bayaranSenarai_(ctx, { status: Util.str(p.penapis) || 'SEMUA' });
  }

  // ---------- ALAT ----------
  function alatSenarai_(ctx) {
    Mk.adminLihat(ctx);
    return {
      bolehPutus: Mk.bolehPutus(ctx),
      senarai: Db.rows('ALAT').map(function (a) {
        var b = Mk.baki(a);
        return {
          kod: Util.str(a.Kod_Alat), nama: Util.str(a.Nama_Alat), kategori: Util.str(a.Kategori), jumlah: b.jumlah, rosak: b.rosak, dipinjam: b.dipinjam, baki: b.baki,
          bolehDipinjam: Util.truthy(a.Boleh_Dipinjam), aktif: Util.truthy(a.Aktif), catatan: Util.str(a.Catatan)
        };
      })
    };
  }

  function alatSimpan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var e = {};
    var kod = Util.str(p.kod).toUpperCase();
    if (!KOD_RE.test(kod)) e.kod = 'Kod 2 hingga 30 aksara (A-Z, 0-9, _ atau -) / Code of 2 to 30 characters';
    var nama = Util.str(p.nama).substr(0, 120);
    if (nama.length < 2) e.nama = 'Nama alat wajib / Name is required';
    var jumlah = Mk.int(p.jumlah), rosak = Mk.int(p.rosak === '' || p.rosak === undefined ? 0 : p.rosak);
    if (jumlah === null || jumlah > 100000) e.jumlah = 'Kuantiti jumlah tidak sah / Invalid total quantity';
    if (rosak === null || (jumlah !== null && rosak > jumlah)) e.rosak = 'Rosak/hilang tidak sah (tidak melebihi jumlah) / Invalid damaged/lost quantity';
    if (Object.keys(e).length) throw jsonErr_(e);
    return Db.withLock(function () {
      var cur = Mk.alat(kod);
      var rec = {
        Kod_Alat: kod, Nama_Alat: nama, Kategori: Util.str(p.kategori).substr(0, 60), Kuantiti_Jumlah: jumlah, Kuantiti_Rosak_Hilang: rosak,
        Boleh_Dipinjam: yaTidak_(p.bolehDipinjam, true) ? 'Ya' : 'Tidak', Aktif: yaTidak_(p.aktif, true) ? 'Ya' : 'Tidak', Catatan: Util.str(p.catatan).substr(0, 300)
      };
      if (cur) Db.update('ALAT', cur._row, rec); else Db.append('ALAT', rec);
      Audit.log(ctx, cur ? 'MK_KEMAS_KINI_ALAT' : 'MK_TAMBAH_ALAT', 'Makerspace', kod, cur ? cur.Kuantiti_Jumlah + '/' + cur.Kuantiti_Rosak_Hilang : '', jumlah + '/' + rosak, nama);
      return alatSenarai_(ctx);
    });
  }

  // ---------- PERALATAN ----------
  function peralatanSenarai_(ctx) {
    Mk.adminLihat(ctx);
    return {
      bolehPutus: Mk.bolehPutus(ctx),
      senarai: Db.rows('PERALATAN').map(function (s) {
        return {
          kod: Util.str(s.Kod_Mesin), jenis: Util.str(s.Jenis), noMesin: Util.str(s.No_Mesin), nama: Util.str(s.Nama_Model), kapasiti: Number(s.Kapasiti) || 0,
          kodKadar: Util.str(s.Kod_Kadar), status: Util.str(s.Status) || 'Aktif', catatan: Util.str(s.Catatan)
        };
      })
    };
  }

  function peralatanSimpan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var e = {};
    var kod = Util.str(p.kod).toUpperCase();
    if (!KOD_RE.test(kod)) e.kod = 'Kod 2 hingga 30 aksara (A-Z, 0-9, _ atau -) / Code of 2 to 30 characters';
    var jenis = Util.str(p.jenis);
    if (JENIS_MESIN.indexOf(jenis) < 0) e.jenis = 'Pilih jenis / Choose a type';
    var nama = Util.str(p.nama).substr(0, 120);
    if (nama.length < 2) e.nama = 'Nama atau model wajib / Name or model is required';
    var kap = '';
    if (Util.str(p.kapasiti) !== '') { kap = Mk.int(p.kapasiti); if (kap === null || kap < 1 || kap > 5000) e.kapasiti = 'Kapasiti tidak sah / Invalid capacity'; }
    else if (jenis === 'Ruang') e.kapasiti = 'Kapasiti ruang wajib / Space capacity is required';
    var kodKadar = Util.str(p.kodKadar).substr(0, 60);
    if (kodKadar && !/^[A-Za-z0-9_\-]+$/.test(kodKadar)) e.kodKadar = 'Kod kadar tidak sah / Invalid rate code';
    var status = Util.str(p.status) || 'Aktif';
    if (STATUS_MESIN.indexOf(status) < 0) e.status = 'Status tidak sah / Invalid status';
    if (Object.keys(e).length) throw jsonErr_(e);
    return Db.withLock(function () {
      var cur = Mk.sumber(kod);
      var rec = {
        Kod_Mesin: kod, Jenis: jenis, No_Mesin: Util.str(p.noMesin).substr(0, 30), Nama_Model: nama, Kapasiti: kap,
        Kod_Kadar: kodKadar, Status: status, Catatan: Util.str(p.catatan).substr(0, 300)
      };
      if (cur) Db.update('PERALATAN', cur._row, rec); else Db.append('PERALATAN', rec);
      Audit.log(ctx, cur ? 'MK_KEMAS_KINI_PERALATAN' : 'MK_TAMBAH_PERALATAN', 'Makerspace', kod, cur ? Util.str(cur.Status) : '', status, jenis + ' ' + nama);
      return peralatanSenarai_(ctx);
    });
  }

  /** Tambah ruang lalai (Maker Lab 200, Bilik Mesyuarat 20) jika belum ada. */
  function peralatanLalai_(ctx) {
    Mk.adminPutus(ctx);
    return Db.withLock(function () {
      [['MAKER_LAB', 'Maker Lab', 200, 'RUANG_MAKER_LAB'], ['BILIK_MESYUARAT', 'Bilik Mesyuarat', 20, 'RUANG_BILIK_MESYUARAT']].forEach(function (x) {
        if (Mk.sumber(x[0])) return;
        Db.append('PERALATAN', { Kod_Mesin: x[0], Jenis: 'Ruang', No_Mesin: '', Nama_Model: x[1], Kapasiti: x[2], Kod_Kadar: x[3], Status: 'Aktif', Catatan: '' });
        Audit.log(ctx, 'MK_TAMBAH_PERALATAN', 'Makerspace', x[0], '', 'Aktif', 'Ruang lalai');
      });
      return peralatanSenarai_(ctx);
    });
  }

  // ---------- KADAR ----------
  function kadarSenarai_(ctx) {
    Mk.adminLihat(ctx);
    var senarai = Db.rows('KADAR').map(function (r) {
      var rm = Mk.rmOf(r.Kadar_RM);
      return {
        kod: Util.str(r.Kod_Sumber), nama: Util.str(r.Nama_Sumber), jenisPengguna: Util.str(r.Jenis_Pengguna), unit: Util.str(r.Unit),
        kadar: rm, berkuatKuasa: Util.dateKey(r.Berkuat_Kuasa), aktif: Util.truthy(r.Aktif), belumDitetapkan: rm === null
      };
    });
    senarai.sort(function (a, b) {
      if (a.kod !== b.kod) return a.kod < b.kod ? -1 : 1;
      return USER_TYPES.indexOf(a.jenisPengguna) - USER_TYPES.indexOf(b.jenisPengguna) || (a.berkuatKuasa < b.berkuatKuasa ? -1 : 1);
    });
    return { bolehPutus: Mk.bolehPutus(ctx), jenisPengguna: USER_TYPES, senarai: senarai };
  }

  function kadarSimpan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var e = {};
    var kod = Util.str(p.kod).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_\-]{1,59}$/.test(kod)) e.kod = 'Kod sumber tidak sah / Invalid source code';
    var jp = Util.str(p.jenisPengguna);
    if (USER_TYPES.indexOf(jp) < 0) e.jenisPengguna = 'Pilih jenis pengguna / Choose a user type';
    var bk = Util.str(p.berkuatKuasa) || Mk.todayKey();
    if (!Mk.validKey(bk)) e.berkuatKuasa = 'Tarikh tidak sah / Invalid date';
    var kadar = '';
    if (Util.str(p.kadar) !== '') {
      kadar = Util.parseRm(p.kadar);
      if (kadar === null) e.kadar = 'Masukkan RM yang sah atau kosongkan (belum ditetapkan) / Enter a valid RM value or leave blank (not set)';
    }
    if (Object.keys(e).length) throw jsonErr_(e);
    return Db.withLock(function () {
      var cur = Db.find('KADAR', function (r) {
        return Util.str(r.Kod_Sumber) === kod && Util.str(r.Jenis_Pengguna) === jp && Util.dateKey(r.Berkuat_Kuasa) === bk;
      })[0];
      if (!cur && !Util.str(p.berkuatKuasa) && kadar !== '') {
        // menetapkan kadar yang masih kosong (belum ditetapkan): isi baris sedia ada supaya sesi lampau turut dapat dikira
        var kosong = Db.find('KADAR', function (r) {
          return Util.str(r.Kod_Sumber) === kod && Util.str(r.Jenis_Pengguna) === jp && Mk.rmOf(r.Kadar_RM) === null && Util.truthy(r.Aktif);
        });
        if (kosong.length) cur = kosong[kosong.length - 1];
      }
      var nama = Util.str(p.nama).substr(0, 120) || (cur ? Util.str(cur.Nama_Sumber) : '');
      var unit = Util.str(p.unit).substr(0, 40) || (cur ? Util.str(cur.Unit) : '');
      if (!cur) {
        var lain = Db.find('KADAR', function (r) { return Util.str(r.Kod_Sumber) === kod; })[0];
        if (!nama && lain) nama = Util.str(lain.Nama_Sumber);
        if (!unit && lain) unit = Util.str(lain.Unit);
      }
      var e2 = {};
      if (!nama) e2.nama = 'Nama sumber wajib / Source name is required';
      if (!unit) e2.unit = 'Unit wajib / Unit is required';
      if (Object.keys(e2).length) throw jsonErr_(e2);
      var rec = { Kod_Sumber: kod, Nama_Sumber: nama, Jenis_Pengguna: jp, Unit: unit, Kadar_RM: kadar, Berkuat_Kuasa: cur ? cur.Berkuat_Kuasa : Util.toDate(bk), Aktif: yaTidak_(p.aktif, true) ? 'Ya' : 'Tidak' };
      if (cur) Db.update('KADAR', cur._row, rec); else Db.append('KADAR', rec);
      Audit.log(ctx, cur ? 'MK_KEMAS_KINI_KADAR' : 'MK_TAMBAH_KADAR', 'Makerspace', kod + '/' + jp, cur ? Util.str(cur.Kadar_RM) : '', String(kadar), 'berkuat kuasa ' + bk);
      return kadarSenarai_(ctx);
    });
  }

  // ---------- Pemohon (tempah bagi pihak) ----------
  function pemohon_(ctx, p) {
    Mk.adminLihat(ctx);
    p = p || {};
    var out;
    if (Util.str(p.noMatrik)) {
      var pem = Mk.pemohonBagi(ctx, { noMatrik: p.noMatrik });
      var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === pem.noMatrik; });
      out = { jenis: pem.jenis, nama: pem.nama, emel: pem.emel, noMatrik: pem.noMatrik, telefon: pem.telefon, jabatan: pem.jabatan, adaProfil: true, sudahLogMasuk: pg.length > 0 };
    } else {
      if (!Bantu.allowed(ctx, 'makerspace')) throw appError_('TIADA_KEBENARIAN');
      var e = Util.normEmail(p.emel);
      if (!Util.isEmail(e)) throw appError_('MK_EMEL_PEMOHON');
      var jenis = Util.roleByDomain(e, Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), Cfg.get('DOMAIN_STAF', '@utm.my'));
      if (jenis === ROLE.PELAJAR) throw appError_('MK_EMEL_PEMOHON', { medan: { emel: 'Pelajar: gunakan No. Matrik / Students: use the matric number' } });
      var g = Mk.penggunaOf(e);
      out = { jenis: jenis, nama: g ? Util.str(g.Nama) : '', emel: e, noMatrik: '', telefon: g ? Util.str(g.Telefon) : '', jabatan: g ? Util.str(g.Jabatan_Organisasi) : '', adaProfil: !!g };
    }
    var s = MkTempahan.sekatan(out.emel, out.noMatrik);
    out.sekatan = { bil: s.bil.length > 0, laporan: s.laporan.length > 0, pinjaman: s.pinjaman.length > 0 };
    return out;
  }

  return {
    ringkasan: ringkasan_, senarai: senarai_, butiran: butiran_, putus: putus_, penggunaan: penggunaan_, pulang: pulang_,
    bayaranSenarai: bayaranSenarai_, bayaranPutus: bayaranPutus_, alatSenarai: alatSenarai_, alatSimpan: alatSimpan_,
    peralatanSenarai: peralatanSenarai_, peralatanSimpan: peralatanSimpan_, peralatanLalai: peralatanLalai_,
    kadarSenarai: kadarSenarai_, kadarSimpan: kadarSimpan_, pemohon: pemohon_
  };
})();


// ===== MakerspaceBil.gs =====
/**
 * SHAMS: Makerspace, kiraan kos, bil (Bayaran_Makerspace), bayaran oleh pemohon dan kerja harian.
 * Kadar kosong atau tiada = "belum ditetapkan": bil tidak dijana sehingga ditetapkan dan admin diberi amaran.
 * Bil dijana selepas sesi (kerja harian) atau apabila admin merekod penggunaan sebenar.
 */

var MkBil = (function () {
  var PAYMENT_METHODS = ['Tunai', 'Pindahan Bank', 'Invois Dalaman', 'Lain-lain'];

  // ---------- Kiraan ----------
  /**
   * Kira kos. bu: {bilHari, peralatan:[{kod,kuantiti}]} (Ruang), {minit} (Laser Cut), {minit, beratG} (3D Printer).
   * Pulang {jumlah, baris:[{kod,nama,unit,kuantiti,kadar,jumlah}], belum:[kod]}.
   */
  function kira_(jenis, kodSumber, jenisPengguna, tarikhKey, bu, kd) {
    var baris = [], belum = [], jumlah = 0;
    var add = function (kod, kuantiti, unitLabel, fallbackNama) {
      var k = kd(kod, jenisPengguna, tarikhKey);
      if (!k.ada) { belum.push(kod); baris.push({ kod: kod, nama: k.nama || fallbackNama || kod, unit: unitLabel || k.unit, kuantiti: kuantiti, kadar: null, jumlah: null }); return; }
      var j = Mk.rm2(k.rm * kuantiti);
      jumlah += j;
      baris.push({ kod: kod, nama: k.nama || fallbackNama || kod, unit: unitLabel || k.unit, kuantiti: kuantiti, kadar: k.rm, jumlah: j });
    };
    var s = jenis === 'Pinjaman' ? null : Mk.sumber(kodSumber);
    var kk = s ? Util.str(s.Kod_Kadar) : '';
    if (jenis === 'Ruang') {
      var hari = Number(bu.bilHari) || 0;
      if (kk) add(kk, hari, 'per hari'); else { belum.push('Kod_Kadar:' + kodSumber); baris.push({ kod: kodSumber, nama: 'Sewa ruang', unit: 'per hari', kuantiti: hari, kadar: null, jumlah: null }); }
      add('RUANG_CAJ_PERKHIDMATAN', 1, 'per tempahan');
      (bu.peralatan || []).forEach(function (x) { add(x.kod, (Number(x.kuantiti) || 0) * hari, 'unit-hari'); });
    } else if (jenis === 'Laser Cut') {
      var kod = kk || 'LASER_CUT';
      var k = kd(kod, jenisPengguna, tarikhKey);
      var blok = parseInt((/(\d+)\s*minit/i.exec(k.unit || '') || [0, 5])[1], 10) || 5;
      add(kod, Math.ceil((Number(bu.minit) || 0) / blok), 'per ' + blok + ' minit');
    } else if (jenis === '3D Printer') {
      var base = kk || '3D_PRINTER';
      add(base + '_GRAM', Number(bu.beratG) || 0, 'per gram');
      add(base + '_JAM', Mk.rm2((Number(bu.minit) || 0) / 60), 'per jam');
    } else if (jenis === 'Pinjaman') {
      var pk = kd('PERALATAN_TANGAN', jenisPengguna, tarikhKey);
      if (pk.ada && pk.rm > 0) add('PERALATAN_TANGAN', 1, 'per pinjaman');
    }
    return { jumlah: Mk.rm2(jumlah), baris: baris, belum: belum };
  }

  /** Kira kos sebenar bagi satu tempahan daripada data butiran (penggunaan sebenar jika ada). */
  function kiraTempahan_(r, sebenar, kd) {
    var id = Util.str(r.ID_Tempahan), jenis = Util.str(r.Jenis), jp = Util.str(r.Jenis_Pengguna), tarikh = Util.dateKey(r.Tarikh_Mula);
    var kod = Util.str(r.Kod_Sumber);
    if (jenis === 'Ruang') {
      var b = Mk.byId('Butiran_Ruang', id) || {};
      var hari = sebenar && b.Hari_Sebenar !== '' && b.Hari_Sebenar !== undefined ? Number(b.Hari_Sebenar) : Number(b.Bil_Hari) || 1;
      var per = Mk.listById('Item_Peralatan_Ruang', id).map(function (x) { return { kod: Util.str(x.Kod_Alat), kuantiti: Number(x.Kuantiti) || 0 }; });
      return kira_(jenis, kod, jp, tarikh, { bilHari: hari, peralatan: per }, kd);
    }
    if (jenis === 'Laser Cut') {
      var l = Mk.byId('Butiran_LaserCut', id) || {};
      var m = sebenar && l.Masa_Sebenar_Min !== '' && l.Masa_Sebenar_Min !== undefined ? Number(l.Masa_Sebenar_Min) : Number(l.Masa_Dijangka_Min) || 0;
      return kira_(jenis, kod, jp, tarikh, { minit: m }, kd);
    }
    if (jenis === '3D Printer') {
      var t = Mk.byId('Butiran_3DP', id) || {};
      var mn = sebenar && t.Masa_Sebenar_Min !== '' && t.Masa_Sebenar_Min !== undefined ? Number(t.Masa_Sebenar_Min) : Number(t.Masa_Dijangka_Min) || 0;
      var g = sebenar && t.Berat_Sebenar_g !== '' && t.Berat_Sebenar_g !== undefined ? Number(t.Berat_Sebenar_g) : Number(t.Berat_g) || 0;
      return kira_(jenis, kod, jp, tarikh, { minit: mn, beratG: g }, kd);
    }
    return kira_(jenis, kod, jp, tarikh, {}, kd);
  }

  function penggunaanTeks_(r) {
    var id = Util.str(r.ID_Tempahan), jenis = Util.str(r.Jenis);
    if (jenis === 'Ruang') { var b = Mk.byId('Butiran_Ruang', id) || {}; return (b.Hari_Sebenar !== '' && b.Hari_Sebenar !== undefined ? b.Hari_Sebenar : b.Bil_Hari) + ' hari'; }
    if (jenis === 'Laser Cut') { var l = Mk.byId('Butiran_LaserCut', id) || {}; return (l.Masa_Sebenar_Min !== '' && l.Masa_Sebenar_Min !== undefined ? l.Masa_Sebenar_Min : l.Masa_Dijangka_Min) + ' minit'; }
    if (jenis === '3D Printer') {
      var t = Mk.byId('Butiran_3DP', id) || {};
      return (t.Berat_Sebenar_g !== '' && t.Berat_Sebenar_g !== undefined ? t.Berat_Sebenar_g : t.Berat_g) + ' g, ' + (t.Masa_Sebenar_Min !== '' && t.Masa_Sebenar_Min !== undefined ? t.Masa_Sebenar_Min : t.Masa_Dijangka_Min) + ' minit';
    }
    return 'Pinjaman';
  }

  function bilOf_(id) { return MkTempahan.bilOf(id); }

  /**
   * Jana bil bagi tempahan jika belum ada dan semua kadar telah ditetapkan. MESTI dipanggil dalam Db.withLock.
   * opts.sebenar: guna penggunaan sebenar. Pulang {dijana, bil, sebab, belum}.
   */
  function janaLocked_(r, opts) {
    opts = opts || {};
    var id = Util.str(r.ID_Tempahan);
    var ada = bilOf_(id);
    if (ada) return { dijana: false, bil: ada, sebab: 'ADA' };
    var kd = Mk.kadarFn();
    var anggaran = kiraTempahan_(r, false, kd);
    var sebenar = opts.sebenar ? kiraTempahan_(r, true, kd) : null;
    var belum = (sebenar || anggaran).belum;
    if (belum.length) return { dijana: false, sebab: 'KADAR', belum: belum };
    var ang = r.Anggaran_RM !== '' && r.Anggaran_RM !== null && r.Anggaran_RM !== undefined ? Number(r.Anggaran_RM) : anggaran.jumlah;
    var jumlah = sebenar ? sebenar.jumlah : ang;
    if (!(jumlah > 0)) return { dijana: false, sebab: 'PERCUMA' };
    var hari = Cfg.num('TARIKH_AKHIR_BAYARAN_MAKERSPACE_HARI', 7);
    var today = Mk.todayKey();
    var tahun = parseInt(Util.fmtDate(new Date(), 'yyyy'), 10);
    var idb = Util.formatId('BMK', tahun, Db.nextSeqLocked('BMK_' + tahun), 4);
    var rec = {
      ID_Bayaran: idb, ID_Tempahan: id, Emel_Pemohon: Util.normEmail(r.Emel_Pemohon), Anggaran_RM: ang,
      Penggunaan_Sebenar: opts.sebenar ? penggunaanTeks_(r) : '', Kos_Sebenar_RM: sebenar ? sebenar.jumlah : '',
      Status: 'Belum Bayar', Tarikh_Akhir: Util.toDate(Mk.addDays(today, hari)), Tarikh_Jana: Util.toDate(today)
    };
    Db.append('Bayaran_Makerspace', rec);
    Audit.log({ email: opts.oleh || 'sistem', role: opts.oleh ? ROLE.ADMIN_PENUH : '-' }, 'MK_JANA_BIL', 'Makerspace', idb, id, String(jumlah), Util.str(r.Jenis));
    return { dijana: true, bil: bilOf_(id), sebab: '' };
  }

  function emelBil_(r, b) {
    var j = Mk.rm2(b.Kos_Sebenar_RM !== '' && b.Kos_Sebenar_RM !== undefined ? b.Kos_Sebenar_RM : b.Anggaran_RM);
    Mk.mel(Util.normEmail(r.Emel_Pemohon), 'Bil Makerspace dijana', 'Makerspace bill issued',
      ['Bil ' + Util.str(b.ID_Bayaran) + ' bagi tempahan ' + Util.str(r.ID_Tempahan) + ': RM' + j.toFixed(2) + '. Tarikh akhir bayaran: ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '. Sila rekod bayaran dalam SHAMS (Makerspace).'],
      ['Bill ' + Util.str(b.ID_Bayaran) + ' for booking ' + Util.str(r.ID_Tempahan) + ': RM' + j.toFixed(2) + '. Payment due date: ' + Util.dateKey(b.Tarikh_Akhir) + '. Please record the payment in SHAMS (Makerspace).']);
  }

  // ---------- Bayaran oleh pemohon ----------
  function rekodBayaran_(ctx, p) {
    var pem = Mk.pemohonSendiri(ctx);
    var idb = Util.str(p.idBayaran || p.id);
    var b = Db.find('Bayaran_Makerspace', function (x) { return Util.str(x.ID_Bayaran) === idb; })[0];
    var r = b ? Mk.tempahan(Util.str(b.ID_Tempahan)) : null;
    if (!b || !r || !MkTempahan.milik(r, pem.emel, pem.noMatrik)) throw appError_('MK_BAYARAN_TIDAK_DITEMUI');
    if (['Belum Bayar', 'Lewat'].indexOf(Util.str(b.Status)) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
    var e = {};
    var kaedah = Util.str(p.kaedah);
    if (PAYMENT_METHODS.indexOf(kaedah) < 0) e.kaedah = 'Pilih kaedah bayaran / Choose a payment method';
    else if (kaedah === 'Invois Dalaman' && pem.jenis === ROLE.LUAR) e.kaedah = 'Invois Dalaman untuk warga UTM sahaja / Internal invoice is for UTM members only';
    var noRujukan = Util.str(p.noRujukan).substr(0, 60);
    if (noRujukan.length < 2) e.noRujukan = 'Masukkan no. rujukan / Enter the reference number';
    var fail = null;
    if (kaedah !== 'Invois Dalaman') {
      if (p.resit && p.resit.data) {
        try { fail = Files.validate(p.resit, ['pdf', 'jpg', 'jpeg', 'png']); } catch (er) { e.resit = 'Resit PDF/JPG/PNG sahaja (saiz dihadkan) / PDF, JPG or PNG receipt only'; }
      } else e.resit = 'Muat naik resit (PDF/JPG/PNG) / Upload the receipt';
    }
    if (Object.keys(e).length) throw appError_('MK_BAYARAN_TIDAK_SAH', { medan: e });
    var url = fail ? Files.save('FLD_RESIT_MAKERSPACE', 'RESIT_' + idb + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), fail) : '';
    Db.withLock(function () {
      var cur = Db.find('Bayaran_Makerspace', function (x) { return Util.str(x.ID_Bayaran) === idb; })[0];
      if (['Belum Bayar', 'Lewat'].indexOf(Util.str(cur.Status)) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
      Db.update('Bayaran_Makerspace', cur._row, { Status: 'Menunggu Pengesahan', Kaedah: kaedah, No_Rujukan: noRujukan, Fail_Resit: url, Tarikh_Bayar: new Date() });
      Audit.log(ctx, 'MK_REKOD_BAYARAN', 'Makerspace', idb, Util.str(cur.Status), 'Menunggu Pengesahan', kaedah);
    });
    return MkTempahan.butiran(ctx, { id: Util.str(b.ID_Tempahan) });
  }

  // ---------- Kerja harian ----------
  function jobHarian_() {
    var hasil = { selesai: 0, tamatPerakuan: 0, bilDijana: 0, bilLewat: 0, peringatan: 0, amaranKadar: 0, laporan: 0 };
    var today = Mk.todayKey();
    var logs = {};
    Db.rows('Peringatan').forEach(function (l) { logs[Util.str(l.Jenis)] = true; });
    var sistem = { email: 'sistem', role: '-' };

    // log + hantar sekali sahaja bagi setiap kunci
    var sekali = function (kunci, to, ref, subjBm, subjEn, bm, en, catatan) {
      if (logs[kunci]) return false;
      var sent = Mk.mel(to, subjBm, subjEn, bm, en);
      Db.append('Peringatan', { Masa: new Date(), Emel: to, Jenis: kunci, Rujukan: ref, Status: sent ? 'Dihantar' : 'Dilangkau', Catatan: catatan || '' });
      logs[kunci] = true;
      hasil.peringatan++;
      return true;
    };

    var tempahan = Db.rows('Tempahan');
    // 1. Pautan perakuan tamat tempoh -> Dibatalkan; sesi tamat -> Selesai
    tempahan.forEach(function (r) {
      var st = Util.str(r.Status), id = Util.str(r.ID_Tempahan);
      if (st === 'Menunggu Perakuan' && Mk.tokenTamat(r)) {
        Db.update('Tempahan', r._row, { Status: 'Dibatalkan', Token_Hash: '', Tarikh_Keputusan: new Date(), Catatan: 'Pautan perakuan penyelia tamat tempoh tanpa tindakan' });
        Audit.log(sistem, 'MK_PERAKUAN_TAMAT', 'Makerspace', id, st, 'Dibatalkan', '');
        r.Status = 'Dibatalkan';
        hasil.tamatPerakuan++;
        Mk.mel(Util.normEmail(r.Emel_Pemohon), 'Tempahan Makerspace dibatalkan', 'Makerspace booking cancelled',
          ['Tempahan ' + id + ' dibatalkan kerana penyelia tidak memperakuinya dalam tempoh yang ditetapkan. Sila buat tempahan baharu.'],
          ['Booking ' + id + ' was cancelled because the supervisor did not endorse it in time. Please make a new booking.']);
      } else if (st === 'Diluluskan' && Util.str(r.Jenis) !== 'Pinjaman' && Util.dateKey(r.Tarikh_Tamat) < today) {
        Db.update('Tempahan', r._row, { Status: 'Selesai' });
        Audit.log(sistem, 'MK_SELESAI', 'Makerspace', id, st, 'Selesai', '');
        r.Status = 'Selesai';
        hasil.selesai++;
      }
    });

    // 2. Jana bil selepas sesi (bukan Pinjaman)
    var warnKadar = [];
    tempahan.forEach(function (r) {
      var st = Util.str(r.Status), id = Util.str(r.ID_Tempahan);
      if (Util.str(r.Jenis) === 'Pinjaman' || ['Diluluskan', 'Selesai'].indexOf(st) < 0 || Util.dateKey(r.Tarikh_Tamat) >= today) return;
      var res = Db.withLock(function () { return janaLocked_(Mk.tempahan(id), { sebenar: false }); });
      if (res.dijana) { hasil.bilDijana++; emelBil_(r, res.bil); }
      else if (res.sebab === 'KADAR') warnKadar.push({ id: id, belum: res.belum });
    });
    warnKadar.forEach(function (w) {
      if (sekali('MK_KADAR_TIADA:' + w.id, ADMIN_UTAMA, w.id, 'Amaran: kadar Makerspace belum ditetapkan', 'Warning: Makerspace rate not set',
        ['Bil bagi tempahan ' + w.id + ' tidak dapat dijana kerana kadar belum ditetapkan: ' + w.belum.join(', ') + '. Sila tetapkan kadar dalam SHAMS (Makerspace admin, Kadar).'],
        ['The bill for booking ' + w.id + ' cannot be generated because rates are not set: ' + w.belum.join(', ') + '. Please set the rates in SHAMS (Makerspace admin, Rates).'], w.belum.join(','))) hasil.amaranKadar++;
    });

    // 3. Bil: peringatan, Lewat dan susulan
    var susulan = Math.max(1, Cfg.num('PERINGATAN_SUSULAN_HARI', 3));
    var hariPeringatan = Cfg.num('BAYARAN_PERINGATAN_HARI', 4);
    Db.rows('Bayaran_Makerspace').forEach(function (b) {
      var st = Util.str(b.Status), idb = Util.str(b.ID_Bayaran);
      var to = Util.normEmail(b.Emel_Pemohon);
      var akhir = Util.dateKey(b.Tarikh_Akhir), jana = Util.dateKey(b.Tarikh_Jana) || akhir;
      var jumlah = Mk.rm2(b.Kos_Sebenar_RM !== '' && b.Kos_Sebenar_RM !== undefined ? b.Kos_Sebenar_RM : b.Anggaran_RM).toFixed(2);
      if (st === 'Belum Bayar' && akhir && today > akhir) {
        Db.update('Bayaran_Makerspace', b._row, { Status: 'Lewat' });
        Audit.log(sistem, 'MK_BIL_LEWAT', 'Makerspace', idb, st, 'Lewat', '');
        st = 'Lewat';
        hasil.bilLewat++;
        sekali('MK_LEWAT:' + idb, to, idb, 'Bil Makerspace lewat dibayar', 'Makerspace bill overdue',
          ['Bil ' + idb + ' (RM' + jumlah + ') telah lewat. Tempahan Makerspace baharu disekat sehingga bil dijelaskan.'],
          ['Bill ' + idb + ' (RM' + jumlah + ') is overdue. New Makerspace bookings are blocked until it is settled.']);
      }
      if (st === 'Belum Bayar' && akhir && today <= akhir && Util.daysBetween(jana, today) >= hariPeringatan) {
        sekali('MK_PERINGATAN:' + idb, to, idb, 'Peringatan bayaran Makerspace', 'Makerspace payment reminder',
          ['Peringatan: bil ' + idb + ' (RM' + jumlah + ') perlu dibayar sebelum ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '.'],
          ['Reminder: bill ' + idb + ' (RM' + jumlah + ') is due by ' + akhir + '.']);
      }
      if (st === 'Lewat' && akhir) {
        var n = Math.floor(Util.daysBetween(akhir, today) / susulan);
        if (n >= 1) {
          sekali('MK_SUSULAN:' + idb + ':' + n, to, idb, 'Susulan: bil Makerspace belum dijelaskan', 'Follow-up: Makerspace bill unpaid',
            ['Bil ' + idb + ' (RM' + jumlah + ') masih belum dijelaskan sejak ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '. Sila jelaskan segera.'],
            ['Bill ' + idb + ' (RM' + jumlah + ') is still unpaid since ' + akhir + '. Please settle it promptly.']);
        }
      }
    });

    // 4. Pinjaman: peringatan pulang dan lewat
    var itemRows = Db.rows('Item_Pinjaman');
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Jenis) !== 'Pinjaman' || Util.str(r.Status) !== 'Diluluskan') return;
      var id = Util.str(r.ID_Tempahan), to = Util.normEmail(r.Emel_Pemohon);
      var belum = itemRows.filter(function (it) { return Util.str(it.ID_Tempahan) === id && Util.str(it.Status) !== 'Dipulangkan'; });
      if (!belum.length) return;
      var due = Util.dateKey(r.Tarikh_Tamat);
      var senarai = belum.map(function (it) { var a = Mk.alat(Util.str(it.Kod_Alat)); return (a ? Util.str(a.Nama_Alat) : Util.str(it.Kod_Alat)) + ' x' + it.Kuantiti; }).join(', ');
      var d = Util.daysBetween(today, due);
      if (d === 1) {
        sekali('MK_PULANG_H1:' + id + ':' + due, to, id, 'Peringatan: pulangkan peralatan esok', 'Reminder: return equipment tomorrow',
          ['Peralatan pinjaman (' + senarai + ') perlu dipulangkan esok (' + Util.fmtTarikhBM(due) + ') bagi tempahan ' + id + '.'],
          ['Borrowed equipment (' + senarai + ') is due tomorrow (' + due + ') for booking ' + id + '.']);
      } else if (d < 0) {
        var over = -d;
        var n = Math.floor((over - 1) / susulan) + 1;
        sekali('MK_PULANG_LEWAT:' + id + ':' + due + ':' + n, to, id, 'Pinjaman peralatan lewat dipulangkan', 'Borrowed equipment overdue',
          ['Peralatan pinjaman (' + senarai + ') bagi tempahan ' + id + ' lewat ' + over + ' hari. Sila pulangkan segera; pinjaman baharu disekat.'],
          ['Borrowed equipment (' + senarai + ') for booking ' + id + ' is ' + over + ' day(s) overdue. Please return it promptly; new loans are blocked.']);
      }
    });

    // 5. Peringatan tempahan akan datang (1 hari lagi)
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Status) !== 'Diluluskan') return;
      var id = Util.str(r.ID_Tempahan), mula = Util.dateKey(r.Tarikh_Mula);
      if (Util.daysBetween(today, mula) !== 1) return;
      sekali('MK_AKAN:' + id, Util.normEmail(r.Emel_Pemohon), id, 'Peringatan tempahan Makerspace esok', 'Reminder: Makerspace booking tomorrow',
        ['Tempahan ' + id + ' (' + Util.str(r.Jenis) + ') anda bermula esok, ' + Util.fmtTarikhBM(mula) + (Util.str(r.Masa_Mula) ? ' pukul ' + Util.str(r.Masa_Mula) : '') + '.'],
        ['Your booking ' + id + ' (' + Util.str(r.Jenis) + ') starts tomorrow, ' + mula + (Util.str(r.Masa_Mula) ? ' at ' + Util.str(r.Masa_Mula) : '') + '.']);
    });

    // 6. Laporan aktiviti bagi tempahan ruang
    var hariLap = Cfg.num('LAPORAN_AKTIVITI_HARI', 3);
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Jenis) !== 'Ruang' || ['Diluluskan', 'Selesai'].indexOf(Util.str(r.Status)) < 0) return;
      var id = Util.str(r.ID_Tempahan), tamat = Util.dateKey(r.Tarikh_Tamat);
      if (tamat >= today) return;
      var lap = Mk.byId('Laporan_Aktiviti', id);
      if (!lap) { Db.append('Laporan_Aktiviti', { ID_Tempahan: id, Fail_Laporan: '', Tarikh_Hantar: '', Status: 'Belum Dihantar' }); lap = Mk.byId('Laporan_Aktiviti', id); hasil.laporan++; }
      if (Util.str(lap.Status) === 'Dihantar') return;
      var had = Mk.addDays(tamat, hariLap), to = Util.normEmail(r.Emel_Pemohon);
      if (today > had) {
        if (Util.str(lap.Status) !== 'Lewat') {
          Db.update('Laporan_Aktiviti', lap._row, { Status: 'Lewat' });
          Audit.log(sistem, 'MK_LAPORAN_LEWAT', 'Makerspace', id, Util.str(lap.Status), 'Lewat', '');
        }
        sekali('MK_LAPORAN_LEWAT:' + id, to, id, 'Laporan aktiviti Makerspace lewat', 'Makerspace activity report overdue',
          ['Laporan aktiviti bagi tempahan ' + id + ' lewat dihantar (tarikh akhir ' + Util.fmtTarikhBM(had) + '). Tempahan ruang baharu disekat sehingga laporan dihantar.'],
          ['The activity report for booking ' + id + ' is overdue (due ' + had + '). New space bookings are blocked until it is submitted.']);
      } else {
        sekali('MK_LAPORAN:' + id, to, id, 'Peringatan: hantar laporan aktiviti', 'Reminder: submit the activity report',
          ['Sila hantar laporan aktiviti bagi tempahan ' + id + ' sebelum ' + Util.fmtTarikhBM(had) + ' melalui SHAMS (Makerspace).'],
          ['Please submit the activity report for booking ' + id + ' by ' + had + ' via SHAMS (Makerspace).']);
      }
    });
    return hasil;
  }

  return { kira: kira_, kiraTempahan: kiraTempahan_, janaLocked: janaLocked_, rekodBayaran: rekodBayaran_, jobHarian: jobHarian_, emelBil: emelBil_, penggunaanTeks: penggunaanTeks_, KAEDAH_BAYARAN: PAYMENT_METHODS };
})();


// ===== MakerspacePerakuan.gs =====
/**
 * SHAMS: Makerspace, perakuan penyelia melalui pautan emel (tanpa log masuk).
 * Token rawak sekali guna (hanya hash disimpan dalam sheet), tamat tempoh, pengesahan OTP ke emel penyelia
 * (Otp.issue/verify dengan tujuan unik bagi setiap tempahan), had kadar dan mesej generik. Direkod dalam Audit.
 * Halaman hanya memaparkan ringkasan tempahan, bukan data peribadi tambahan.
 */

var MkPerakuan = (function () {
  function hash_(tok) { return Util.sha256('mk-perakuan|' + String(tok).toLowerCase()); }
  function bentuk_(tok) { return typeof tok === 'string' && /^[a-f0-9]{64}$/i.test(tok); }
  function tujuan_(id) { return 'MK_PERAKUAN:' + id; }

  /** Had kadar: setiap pautan, dan kiraan global bagi token tidak sah. */
  function jaga_(tok) {
    var ok = bentuk_(tok);
    var key = ok ? 'mkpk:' + hash_(tok).substr(0, 24) : 'mkpk:bad';
    if (!Mk.had(key, ok ? Cfg.num('PERAKUAN_HAD_10MIN', 30) : 60, 600)) throw appError_('MK_PERAKUAN_HAD');
    return ok;
  }

  /** Cari tempahan bagi token yang masih sah; null jika tidak. Pelbagai sebab dilaporkan sama (generik). */
  function cari_(tok) {
    if (!bentuk_(tok)) { Mk.had('mkpk:nf', 200, 600); return null; }
    var h = hash_(tok);
    var l = Db.find('Tempahan', function (r) { return Util.str(r.Token_Hash) === h; });
    var r = l.length ? l[0] : null;
    if (!r || Util.str(r.Status) !== 'Menunggu Perakuan' || Mk.tokenTamat(r)) {
      if (!Mk.had('mkpk:nf', 200, 600)) throw appError_('MK_PERAKUAN_HAD');
      return null;
    }
    return r;
  }

  function pautan_(tok) {
    var url = Cfg.get('WEBAPP_URL', '');
    if (!url) return '';
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'perakuan=' + tok;
  }

  /** Hantar emel pautan perakuan kepada penyelia. Pulang true jika emel dihantar. */
  function hantarPautan_(r, tok) {
    var id = Util.str(r.ID_Tempahan);
    var url = pautan_(tok);
    var bm = [
      'Pelajar ' + Util.str(r.Nama_Pemohon) + ' memohon tempahan Makerspace UTM (' + Util.str(r.Jenis) + ', ' + id + ') dan menamakan anda sebagai penyelia / pensyarah yang memperakui.',
      url ? 'Sila semak dan perakui melalui pautan ini (sah sehingga ' + Util.fmtTarikhBM(r.Token_Tamat) + '): ' + url : 'Pautan perakuan tidak dapat dijana kerana URL aplikasi belum ditetapkan. Sila hubungi UTMXCITE.',
      'Anda akan diminta memasukkan kod OTP yang dihantar ke emel ini. Jangan kongsikan pautan ini. Jika anda tidak mengenali pemohon, abaikan emel ini.'
    ];
    var en = [
      'Student ' + Util.str(r.Nama_Pemohon) + ' requested a UTM Makerspace booking (' + Util.str(r.Jenis) + ', ' + id + ') and named you as the endorsing supervisor.',
      url ? 'Please review and endorse it using this link (valid until ' + Util.dateKey(r.Token_Tamat) + '): ' + url : 'The endorsement link could not be created because the application URL is not set. Please contact UTMXCITE.',
      'You will be asked to enter an OTP sent to this email. Do not share this link. If you do not know the applicant, ignore this email.'
    ];
    var sent = Mk.mel(Util.normEmail(r.Emel_Penyelia), 'Permohonan perakuan tempahan Makerspace', 'Makerspace booking endorsement request', bm, en, true);
    return !!sent && !!url;
  }

  // ---------- Awam (tanpa sesi) ----------
  function maklumat_(p) {
    p = p || {};
    jaga_(p.token);
    var r = cari_(p.token);
    if (!r) throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var o = MkTempahan.paparan(r, {});
    var ring = {
      id: o.id, jenis: o.jenis, sumberNama: o.sumberNama, namaPemohon: o.namaPemohon, tujuan: o.tujuan,
      tarikhMula: o.tarikhMula, tarikhTamat: o.tarikhTamat, masaMula: o.masaMula, masaTamat: o.masaTamat,
      emelPenyelia: MkTempahan.maskEmel(Util.str(r.Emel_Penyelia)), pautanTamat: Util.dateKey(r.Token_Tamat)
    };
    if (o.butiran) {
      ring.projek = o.butiran.namaProjek || o.butiran.namaProgram || '';
      if (o.jenis === 'Ruang') ring.bilPeserta = o.butiran.bilPeserta;
    }
    if (o.item) ring.item = o.item.map(function (x) { return { nama: x.nama, kuantiti: x.kuantiti }; });
    return ring;
  }

  function otp_(p) {
    p = p || {};
    jaga_(p.token);
    var r = cari_(p.token);
    if (!r) throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var id = Util.str(r.ID_Tempahan);
    var emel = Util.normEmail(r.Emel_Penyelia);
    var res = Otp.issue(tujuan_(id), emel, {
      subjectBm: 'Kod pengesahan perakuan tempahan Makerspace', subjectEn: 'Makerspace booking endorsement code',
      bm: ['Kod pengesahan untuk memperakui tempahan ' + id + ' (pemohon: ' + Util.str(r.Nama_Pemohon) + ') ialah: {kod}', 'Kod ini sah beberapa minit sahaja. Jangan kongsikannya.'],
      en: ['Your code to endorse booking ' + id + ' (applicant: ' + Util.str(r.Nama_Pemohon) + ') is: {kod}', 'This code is valid for a few minutes only. Do not share it.']
    });
    return { jedaSaat: res.jedaSaat, tamatMinit: res.tamatMinit, emelPenyelia: MkTempahan.maskEmel(emel) };
  }

  function sahkan_(p) {
    p = p || {};
    jaga_(p.token);
    var r = cari_(p.token);
    if (!r) throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var tindakan = Util.str(p.tindakan);
    if (tindakan !== 'perakui' && tindakan !== 'tolak') throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var catatan = Util.str(p.catatan).substr(0, 300);
    if (tindakan === 'tolak' && !catatan) throw appError_('MK_CATATAN_WAJIB');
    var id = Util.str(r.ID_Tempahan);
    var emel = Util.normEmail(r.Emel_Penyelia);
    Otp.verify(tujuan_(id), emel, p.kod); // lempar OTP_SALAH / OTP_TAMAT / OTP_TERLALU_BANYAK
    var h = hash_(p.token);
    var pemohon = Db.withLock(function () {
      var cur = Db.find('Tempahan', function (x) { return Util.str(x.Token_Hash) === h; })[0];
      if (!cur || Util.str(cur.Status) !== 'Menunggu Perakuan' || Mk.tokenTamat(cur)) throw appError_('MK_PERAKUAN_TIDAK_SAH');
      var now = new Date();
      if (tindakan === 'perakui') {
        Db.update('Tempahan', cur._row, { Status: 'Menunggu Kelulusan', Status_Perakuan: 'Diperakui', Tarikh_Perakuan: now, Token_Hash: '', Catatan_Penyelia: catatan });
      } else {
        Db.update('Tempahan', cur._row, {
          Status: 'Ditolak', Status_Perakuan: 'Ditolak', Tarikh_Perakuan: now, Tarikh_Keputusan: now, Token_Hash: '', Catatan_Penyelia: catatan,
          Catatan: 'Ditolak oleh penyelia: ' + catatan
        });
      }
      Audit.log({ email: emel, role: 'Penyelia' }, tindakan === 'perakui' ? 'MK_PERAKUAN' : 'MK_PERAKUAN_TOLAK', 'Makerspace', id, 'Menunggu Perakuan',
        tindakan === 'perakui' ? 'Menunggu Kelulusan' : 'Ditolak', catatan);
      return Util.normEmail(cur.Emel_Pemohon);
    });
    if (tindakan === 'perakui') {
      Mk.mel(pemohon, 'Tempahan Makerspace diperakui', 'Makerspace booking endorsed',
        ['Penyelia anda telah memperakui tempahan ' + id + '. Tempahan kini menunggu kelulusan UTMXCITE.'],
        ['Your supervisor has endorsed booking ' + id + '. It is now awaiting UTMXCITE approval.']);
    } else {
      Mk.mel(pemohon, 'Tempahan Makerspace tidak diperakui', 'Makerspace booking not endorsed',
        ['Penyelia anda tidak memperakui tempahan ' + id + '. Catatan: ' + catatan],
        ['Your supervisor did not endorse booking ' + id + '. Note: ' + catatan]);
    }
    return { diproses: true, tindakan: tindakan };
  }

  // ---------- Pemohon: hantar semula pautan ----------
  function hantarSemula_(ctx, p) {
    var pem = Mk.pemohonSendiri(ctx);
    var id = Util.str(p.id);
    var r = Mk.tempahan(id);
    if (!r || !MkTempahan.milik(r, pem.emel, pem.noMatrik)) throw appError_('MK_TIDAK_DITEMUI');
    if (Util.str(r.Status) !== 'Menunggu Perakuan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
    var penyelia = Util.normEmail(p.emelPenyelia) || Util.normEmail(r.Emel_Penyelia);
    var dp = Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), ds = Cfg.get('DOMAIN_STAF', '@utm.my');
    var e = {};
    if (!Util.isEmail(penyelia)) e.emelPenyelia = 'Masukkan emel penyelia yang sah / Enter a valid supervisor email';
    else if (!Util.isStaffEmail(penyelia, dp, ds)) e.emelPenyelia = 'Emel penyelia mesti emel staf ' + ds + ' / Must be a staff email ' + ds;
    else if (penyelia === pem.emel) e.emelPenyelia = 'Emel penyelia tidak boleh sama dengan emel pemohon / Cannot be the applicant\'s own email';
    if (Object.keys(e).length) throw appError_('MK_TIDAK_SAH', { medan: e });
    if (!Mk.had('mkpk:re:' + id, 3, 3600)) throw appError_('RATE_JEDA');
    var tok = Util.randomToken();
    var tamat = new Date(new Date().getTime() + Cfg.num('PERAKUAN_TAMAT_HARI', 5) * 86400000);
    Db.withLock(function () {
      var cur = Mk.tempahan(id);
      if (Util.str(cur.Status) !== 'Menunggu Perakuan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
      Db.update('Tempahan', cur._row, { Emel_Penyelia: penyelia, Token_Hash: hash_(tok), Token_Tamat: tamat });
      Audit.log(ctx, 'MK_HANTAR_SEMULA_PERAKUAN', 'Makerspace', id, Util.str(cur.Emel_Penyelia), penyelia, '');
    });
    var dihantar = hantarPautan_(Mk.tempahan(id), tok);
    return { emelDihantar: dihantar, penyelia: MkTempahan.maskEmel(penyelia) };
  }

  return { hash: hash_, hantarPautan: hantarPautan_, maklumat: maklumat_, otp: otp_, sahkan: sahkan_, hantarSemula: hantarSemula_ };
})();


// ===== MakerspaceTempahan.gs =====
/**
 * SHAMS: Makerspace, tempahan oleh pengguna (pelajar, staf, orang luar) dan bagi pihak oleh admin.
 * Empat jenis: Ruang, Laser Cut, 3D Printer, Pinjaman. Semua pengesahan di pelayan.
 */

var MkTempahan = (function () {
  var MESIN_KADAR = { 'Laser Cut': 'LASER_CUT', '3D Printer': '3D_PRINTER' };
  var KAEDAH = ['Tunai', 'Invois Dalaman', 'Lain-lain'];
  var DIBENARKAN_BATAL = ['Menunggu Perakuan', 'Menunggu Kelulusan'];

  function isMesin_(jenis) { return jenis === 'Laser Cut' || jenis === '3D Printer'; }

  // ---------- Sekatan ----------
  function milik_(r, emel, noMatrik) {
    return Util.normEmail(r.Emel_Pemohon) === emel || (noMatrik && Util.normMatric(r.No_Matrik) === noMatrik);
  }

  /** Sekatan tempahan baharu bagi pemohon: bil Lewat, laporan aktiviti lewat, pinjaman lewat pulang. */
  function sekatan_(emel, noMatrik) {
    var today = Mk.todayKey();
    var tmp = Db.rows('Tempahan').filter(function (r) { return milik_(r, emel, noMatrik); });
    var ids = {}; tmp.forEach(function (r) { ids[Util.str(r.ID_Tempahan)] = r; });
    var bil = Db.rows('Bayaran_Makerspace').filter(function (b) {
      if (!ids[Util.str(b.ID_Tempahan)]) return false;
      var st = Util.str(b.Status);
      if (st === 'Lewat') return true;
      var ta = Util.dateKey(b.Tarikh_Akhir);
      return st === 'Belum Bayar' && ta && ta < today;
    }).map(function (b) { return Util.str(b.ID_Bayaran); });
    var hari = Cfg.num('LAPORAN_AKTIVITI_HARI', 3);
    var lap = {};
    Db.rows('Laporan_Aktiviti').forEach(function (l) { lap[Util.str(l.ID_Tempahan)] = Util.str(l.Status); });
    var laporan = tmp.filter(function (r) {
      if (Util.str(r.Jenis) !== 'Ruang' || ['Diluluskan', 'Selesai'].indexOf(Util.str(r.Status)) < 0) return false;
      var tamat = Util.dateKey(r.Tarikh_Tamat);
      return Mk.addDays(tamat, hari) < today && lap[Util.str(r.ID_Tempahan)] !== 'Dihantar';
    }).map(function (r) { return Util.str(r.ID_Tempahan); });
    var itemRows = Db.rows('Item_Pinjaman');
    var pinjaman = tmp.filter(function (r) {
      return Util.str(r.Jenis) === 'Pinjaman' && Util.str(r.Status) === 'Diluluskan';
    }).filter(function (r) {
      var id = Util.str(r.ID_Tempahan);
      return itemRows.some(function (it) {
        return Util.str(it.ID_Tempahan) === id && Util.str(it.Status) !== 'Dipulangkan' && Util.dateKey(it.Tarikh_Dijangka_Pulang) < today;
      });
    }).map(function (r) { return Util.str(r.ID_Tempahan); });
    return { bil: bil, laporan: laporan, pinjaman: pinjaman };
  }

  function semakSekatan_(pem, jenis) {
    var s = sekatan_(pem.emel, pem.noMatrik);
    if (s.bil.length) throw appError_('MK_BIL_LEWAT');
    if (jenis === 'Ruang' && s.laporan.length) throw appError_('MK_LAPORAN_LEWAT');
    if (jenis === 'Pinjaman' && s.pinjaman.length) throw appError_('MK_PINJAMAN_LEWAT');
  }

  // ---------- Maklumat untuk borang ----------
  function maklumat_(ctx, p) {
    p = p || {};
    var admin = ADMIN_ROLES.indexOf(ctx.role) >= 0;
    var jenisPengguna, pemohon = null;
    if (admin) {
      Mk.adminLihat(ctx);
      jenisPengguna = [ROLE.PELAJAR, ROLE.STAF, ROLE.LUAR].indexOf(Util.str(p.jenisPengguna)) >= 0 ? Util.str(p.jenisPengguna) : ROLE.PELAJAR;
    } else {
      var pem = Mk.pemohonSendiri(ctx);
      jenisPengguna = pem.jenis;
      pemohon = { nama: pem.nama, jenisPengguna: pem.jenis, emel: pem.emel, noMatrik: pem.noMatrik };
    }
    var ops = Mk.ops();
    var today = Mk.todayKey();
    var kd = Mk.kadarFn();
    var rate = function (kod) { var r = kd(kod, jenisPengguna, today); return { ada: r.ada, rm: r.rm, unit: r.unit }; };
    var sumber = Db.rows('PERALATAN').filter(Mk.sumberAktif);
    var mk = function (jenis) {
      return sumber.filter(function (s) { return Util.str(s.Jenis) === jenis; }).map(function (s) {
        var kod = Util.str(s.Kod_Mesin), kk = Util.str(s.Kod_Kadar);
        var o = { kod: kod, nama: nama_(s), noMesin: Util.str(s.No_Mesin), kapasiti: Number(s.Kapasiti) || 0 };
        if (jenis === 'Ruang') o.kadar = kk ? rate(kk) : { ada: false, rm: null, unit: '' };
        else if (jenis === 'Laser Cut') o.kadar = rate(kk || 'LASER_CUT');
        else { var b = kk || '3D_PRINTER'; o.kadarGram = rate(b + '_GRAM'); o.kadarJam = rate(b + '_JAM'); }
        return o;
      });
    };
    var alat = Db.rows('ALAT').filter(function (a) { return Util.truthy(a.Aktif) && Util.truthy(a.Boleh_Dipinjam); }).map(function (a) {
      var b = Mk.baki(a);
      return { kod: Util.str(a.Kod_Alat), nama: Util.str(a.Nama_Alat), kategori: Util.str(a.Kategori), baki: b.baki };
    });
    var peralatanRuang = peralatanRuang_(jenisPengguna, kd, today);
    var cuti = Object.keys(ops.cuti).filter(function (k) { return k >= today; }).sort().map(function (k) { return { tarikh: k, nama: ops.cuti[k] }; });
    var out = {
      admin: admin, pemohon: pemohon, jenisPengguna: jenisPengguna,
      operasi: { hari: ops.hari, buka: Mk.fmtMin(ops.buka), tutup: Mk.fmtMin(ops.tutup), slot: ops.slot, maksMinit: ops.maksMin, notisHari: ops.notis },
      cuti: cuti.slice(0, 60),
      ruang: mk('Ruang'), laser: mk('Laser Cut'), tdp: mk('3D Printer'), alat: alat, peralatanRuang: peralatanRuang,
      kadar: { caj: rate('RUANG_CAJ_PERKHIDMATAN'), pinjaman: rate('PERALATAN_TANGAN') },
      kaedahBayaran: KAEDAH.filter(function (k) { return !(k === 'Invois Dalaman' && jenisPengguna === ROLE.LUAR); }),
      had: {
        maksHariRuang: Cfg.num('RUANG_MAKS_HARI', 14), maksHariDepan: Cfg.num('TEMPAHAN_MAKS_HARI_DEPAN', 180),
        pinjamanBulan: Cfg.num('PINJAMAN_MAKS_BULAN', 1), pinjamanPembaharuan: Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1)
      },
      hariIni: today
    };
    if (!admin) {
      var s = sekatan_(pemohon.emel, pemohon.noMatrik);
      out.sekatan = { bil: s.bil.length > 0, laporan: s.laporan.length > 0, pinjaman: s.pinjaman.length > 0 };
    }
    return out;
  }

  function nama_(s) {
    var n = Util.str(s.Nama_Model) || Util.str(s.Kod_Mesin);
    var no = Util.str(s.No_Mesin);
    return no && n.indexOf(no) < 0 ? n + ' (' + no + ')' : n;
  }

  /** Peralatan tambahan bagi ruang: baris KADAR berkod ALAT_ yang aktif. */
  function peralatanRuang_(jenisPengguna, kd, onKey) {
    var seen = {}, out = [];
    Db.rows('KADAR').forEach(function (r) {
      var kod = Util.str(r.Kod_Sumber);
      if (kod.indexOf('ALAT_') !== 0 || seen[kod] || !Util.truthy(r.Aktif)) return;
      seen[kod] = true;
      var k = kd(kod, jenisPengguna, onKey);
      out.push({ kod: kod, nama: Util.str(r.Nama_Sumber) || kod, unit: k.unit || Util.str(r.Unit), kadar: { ada: k.ada, rm: k.rm } });
    });
    return out;
  }

  // ---------- Ketersediaan ----------
  function ketersediaan_(ctx, p) {
    p = p || {};
    var kod = Util.str(p.kodSumber), tarikh = Util.str(p.tarikh);
    var ops = Mk.ops();
    var s = Mk.sumber(kod);
    if (!s || !Mk.sumberAktif(s)) throw new AppError('MK_TIDAK_DITEMUI', 'Sumber tidak ditemui.', 'Resource not found.');
    var out = { kodSumber: kod, tarikh: tarikh, buka: Mk.fmtMin(ops.buka), tutup: Mk.fmtMin(ops.tutup), slot: ops.slot, operasi: false, sebab: '', sibuk: [] };
    if (!Mk.validKey(tarikh)) { out.sebab = 'Tarikh tidak sah / Invalid date'; return out; }
    if (ops.cuti[tarikh]) { out.sebab = 'Cuti: ' + ops.cuti[tarikh]; return out; }
    if (!Mk.isOp(tarikh, ops)) { out.sebab = 'Bukan hari operasi / Not an operating day'; return out; }
    out.operasi = true;
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Kod_Sumber) !== kod || !Mk.menduduki(r)) return;
      if (Mk.opDaysIn(Util.dateKey(r.Tarikh_Mula), Util.dateKey(r.Tarikh_Tamat), ops).indexOf(tarikh) < 0) return;
      var a = Mk.toMin(r.Masa_Mula), b = Mk.toMin(r.Masa_Tamat);
      if (a === null || b === null) return;
      out.sibuk.push({ mula: Mk.fmtMin(a), tamat: Mk.fmtMin(b), menunggu: Util.str(r.Status) !== 'Diluluskan' });
    });
    out.sibuk.sort(function (x, y) { return x.mula < y.mula ? -1 : 1; });
    return out;
  }

  // ---------- Pengesahan ----------
  function fieldErr_(e, k, bm, en) { e[k] = bm + ' / ' + en; }

  /** Parse senarai item [{kod, kuantiti}]. Pulang {senarai, ralat}. */
  function parseItems_(arr, max) {
    var out = [], seen = {}, err = '';
    if (!Array.isArray(arr)) return { senarai: [], ralat: '' };
    arr.forEach(function (x) {
      if (!x || typeof x !== 'object') return;
      var kod = Util.str(x.kod);
      var q = Mk.int(x.kuantiti);
      if (!kod && (x.kuantiti === '' || x.kuantiti === undefined || x.kuantiti === null)) return; // baris kosong
      if (!kod || q === null || q < 1 || q > 1000) { err = 'Pilih alat dan kuantiti 1 hingga 1000 / Choose an item and a quantity of 1 to 1000'; return; }
      if (seen[kod]) { err = 'Alat pendua: ' + kod + ' / Duplicate item'; return; }
      seen[kod] = true;
      out.push({ kod: kod, kuantiti: q });
    });
    if (out.length > max) err = 'Terlalu banyak item (maksimum ' + max + ') / Too many items';
    return { senarai: out, ralat: err };
  }

  /**
   * Semak medan tempahan. Pulang {v, ralat, fail}. opts.langkasFail: jangan semak fail (anggaran).
   * v mengandungi nilai yang telah dinormalkan.
   */
  function semak_(pem, d, opts) {
    opts = opts || {};
    d = d || {};
    var e = {}, v = {};
    var ops = Mk.ops(), today = Mk.todayKey();
    var bad = function (k, bm, en) { fieldErr_(e, k, bm || 'Wajib diisi', en || 'Required'); };
    v.jenis = Util.str(d.jenis);
    if (Mk.JENIS.indexOf(v.jenis) < 0) { bad('jenis', 'Pilih jenis tempahan', 'Choose a booking type'); return { v: v, ralat: e, fail: {} }; }
    var pelajar = pem.jenis === ROLE.PELAJAR;

    // tarikh
    v.tarikh = Util.str(d.tarikh);
    var tarikhOk = false;
    if (!Mk.validKey(v.tarikh)) bad('tarikh', 'Pilih tarikh', 'Choose a date');
    else if (v.tarikh < today) bad('tarikh', 'Tarikh telah berlalu', 'The date has passed');
    else if (Util.daysBetween(today, v.tarikh) > Cfg.num('TEMPAHAN_MAKS_HARI_DEPAN', 180)) bad('tarikh', 'Terlalu jauh ke hadapan', 'Too far ahead');
    else if (ops.cuti[v.tarikh]) bad('tarikh', 'Cuti: ' + ops.cuti[v.tarikh], 'Public/university holiday');
    else if (!Mk.isOp(v.tarikh, ops)) bad('tarikh', 'Bukan hari operasi (Isnin hingga Jumaat)', 'Not an operating day');
    else tarikhOk = true;

    // tujuan
    v.tujuan = Util.str(d.tujuan).replace(/\s+/g, ' ').substr(0, 300);
    if (v.jenis !== 'Ruang' && v.tujuan.length < 3) bad('tujuan', 'Nyatakan tujuan (sekurang-kurangnya 3 aksara)', 'State the purpose (at least 3 characters)');

    if (v.jenis === 'Ruang') semakRuang_(pem, d, v, e, ops, tarikhOk, bad, opts);
    else if (isMesin_(v.jenis)) semakMesin_(pem, d, v, e, ops, tarikhOk, bad, opts);
    else semakPinjaman_(pem, d, v, e, ops, tarikhOk, bad, today);

    // penyelia (pelajar sahaja)
    v.penyelia = '';
    if (pelajar) {
      v.penyelia = Util.normEmail(d.emelPenyelia);
      var dp = Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), ds = Cfg.get('DOMAIN_STAF', '@utm.my');
      if (!Util.isEmail(v.penyelia)) bad('emelPenyelia', 'Masukkan emel penyelia yang sah', 'Enter a valid supervisor email');
      else if (!Util.isStaffEmail(v.penyelia, dp, ds)) bad('emelPenyelia', 'Emel penyelia mesti emel staf ' + ds, 'The supervisor email must be a staff email ' + ds);
      else if (v.penyelia === pem.emel) bad('emelPenyelia', 'Emel penyelia tidak boleh sama dengan emel pemohon', 'The supervisor email cannot be the applicant\'s own');
    }
    if (d.perakuan !== true) bad('perakuan', 'Perakuan wajib', 'The declaration is required');
    v.fail = v.fail || {};
    return { v: v, ralat: e, fail: v.fail };
  }

  function semakMasaMesin_(d, v, e, ops, tarikhOk, bad) {
    var mm = Mk.toMin(d.masaMula);
    v.mula = mm;
    var minit = Mk.int(d.masaDijangkaMin);
    v.minit = minit;
    if (minit === null || minit < 1 || minit > ops.maksMin) bad('masaDijangkaMin', 'Masa dijangka 1 hingga ' + ops.maksMin + ' minit', 'Expected time 1 to ' + ops.maksMin + ' minutes');
    if (mm === null) bad('masaMula', 'Pilih masa mula', 'Choose a start time');
    else if (mm < ops.buka || (mm - ops.buka) % ops.slot !== 0) bad('masaMula', 'Pilih masa mengikut slot ' + ops.slot + ' minit bermula ' + Mk.fmtMin(ops.buka), 'Choose a time on the ' + ops.slot + '-minute slots from ' + Mk.fmtMin(ops.buka));
    if (mm !== null && minit !== null && minit >= 1 && minit <= ops.maksMin && !e.masaMula) {
      v.tamat = mm + Math.ceil(minit / ops.slot) * ops.slot;
      if (v.tamat > ops.tutup) bad('masaMula', 'Sesi melebihi waktu operasi (tamat ' + Mk.fmtMin(ops.tutup) + ')', 'The session exceeds operating hours (ends ' + Mk.fmtMin(ops.tutup) + ')');
      else if (tarikhOk && v.tarikh === Mk.todayKey() && mm <= Mk.nowMin()) bad('masaMula', 'Masa telah berlalu', 'The time has passed');
    }
  }

  function semakMesin_(pem, d, v, e, ops, tarikhOk, bad, opts) {
    v.kod = Util.str(d.kodSumber);
    var s = Mk.sumber(v.kod);
    if (!s || Util.str(s.Jenis) !== v.jenis || !Mk.sumberAktif(s)) bad('kodSumber', 'Pilih mesin yang tersedia', 'Choose an available machine');
    else v.sumber = s;
    v.namaProjek = Util.str(d.namaProjek).substr(0, 120);
    if (v.namaProjek.length < 3) bad('namaProjek', 'Nama projek sekurang-kurangnya 3 aksara', 'Project name of at least 3 characters');
    v.tarikhTamat = v.tarikh;
    semakMasaMesin_(d, v, e, ops, tarikhOk, bad);
    if (v.jenis === 'Laser Cut') {
      v.jenisBahan = Util.str(d.jenisBahan).substr(0, 80);
      if (v.jenisBahan.length < 2) bad('jenisBahan', 'Nyatakan jenis bahan', 'State the material');
    } else {
      v.warna = Util.str(d.warna).substr(0, 40);
      if (v.warna.length < 2) bad('warna', 'Nyatakan warna', 'State the colour');
      var g = Util.parseRm(d.beratG);
      if (g === null || g <= 0 || g > 5000) bad('beratG', 'Berat dalam gram (lebih daripada 0 hingga 5000)', 'Weight in grams (above 0 up to 5000)');
      else v.beratG = g;
      v.fail = {};
      if (!opts.langkasFail) {
        if (d.gambar && d.gambar.data) {
          try { v.fail.gambar = Files.validate(d.gambar, ['jpg', 'jpeg', 'png']); } catch (er) { bad('gambar', 'Gambar JPG atau PNG sahaja (saiz dihadkan)', 'JPG or PNG image only (limited size)'); }
        } else bad('gambar', 'Muat naik gambar projek (JPG/PNG)', 'Upload a project picture (JPG/PNG)');
      }
    }
    if (tarikhOk && v.sumber && v.mula !== null && v.tamat && !e.masaMula && !e.masaDijangkaMin) {
      var k = Mk.konflik(v.kod, [v.tarikh], v.mula, v.tamat, '', ops);
      if (k.length) bad('masaMula', 'Slot bertindih dengan tempahan lain (' + Mk.fmtMin(Mk.toMin(k[0].Masa_Mula)) + ' - ' + Mk.fmtMin(Mk.toMin(k[0].Masa_Tamat)) + ')', 'The slot overlaps another booking');
    }
  }

  function semakRuang_(pem, d, v, e, ops, tarikhOk, bad, opts) {
    v.kod = Util.str(d.kodSumber);
    var s = Mk.sumber(v.kod);
    if (!s || Util.str(s.Jenis) !== 'Ruang' || !Mk.sumberAktif(s)) bad('kodSumber', 'Pilih ruang yang tersedia', 'Choose an available space');
    else v.sumber = s;
    v.namaProgram = Util.str(d.namaProgram).replace(/\s+/g, ' ').substr(0, 200);
    if (v.namaProgram.length < 3) bad('namaProgram', 'Nyatakan tujuan / program (sekurang-kurangnya 3 aksara)', 'State the purpose / programme (at least 3 characters)');
    v.tujuan = v.namaProgram;
    v.bilHari = Mk.int(d.bilHari);
    var maksHari = Cfg.num('RUANG_MAKS_HARI', 14);
    if (v.bilHari === null || v.bilHari < 1 || v.bilHari > maksHari) bad('bilHari', 'Bilangan hari 1 hingga ' + maksHari, 'Number of days 1 to ' + maksHari);
    var a = Mk.toMin(d.masaMula), b = Mk.toMin(d.masaTamat);
    if (a === null) bad('masaMula', 'Pilih masa mula', 'Choose a start time');
    if (b === null) bad('masaTamat', 'Pilih masa tamat', 'Choose an end time');
    if (a !== null && b !== null) {
      if (a < ops.buka || b > ops.tutup) bad('masaMula', 'Masa mesti dalam waktu operasi ' + Mk.fmtMin(ops.buka) + ' - ' + Mk.fmtMin(ops.tutup), 'Time must be within operating hours');
      else if (a >= b) bad('masaTamat', 'Masa tamat mesti selepas masa mula', 'The end time must be after the start time');
    }
    v.mula = a; v.tamat = b;
    // notis hari bekerja
    if (tarikhOk && Mk.workingDays(Mk.todayKey(), v.tarikh, ops) < ops.notis) {
      bad('tarikh', 'Tempahan ruang mesti dibuat sekurang-kurangnya ' + ops.notis + ' hari bekerja lebih awal', 'Space bookings need at least ' + ops.notis + ' working days\' notice');
      tarikhOk = false;
    }
    v.hari = [];
    if (tarikhOk && v.bilHari !== null && !e.bilHari) {
      v.hari = Mk.opDaysFrom(v.tarikh, v.bilHari, ops);
      v.tarikhTamat = v.hari[v.hari.length - 1];
    } else v.tarikhTamat = v.tarikh;
    v.bilPeserta = Mk.int(d.bilPeserta);
    var kap = s ? Number(s.Kapasiti) || 0 : 0;
    if (v.bilPeserta === null || v.bilPeserta < 1) bad('bilPeserta', 'Masukkan jumlah peserta', 'Enter the number of participants');
    else if (kap > 0 && v.bilPeserta > kap) bad('bilPeserta', 'Melebihi kapasiti ruang (' + kap + ')', 'Exceeds the capacity (' + kap + ')');
    // bayaran
    v.kaedah = Util.str(d.kaedahBayaran);
    if (KAEDAH.indexOf(v.kaedah) < 0) bad('kaedahBayaran', 'Pilih kaedah bayaran', 'Choose a payment method');
    else if (v.kaedah === 'Invois Dalaman' && pem.jenis === ROLE.LUAR) bad('kaedahBayaran', 'Invois Dalaman untuk warga UTM sahaja', 'Internal invoice is for UTM members only');
    v.kaedahLain = Util.str(d.kaedahLain).substr(0, 120);
    if (v.kaedah === 'Lain-lain' && v.kaedahLain.length < 2) bad('kaedahLain', 'Nyatakan kaedah bayaran', 'Specify the payment method');
    v.noVot = Util.str(d.noVot).substr(0, 40);
    v.namaStafKewangan = Util.str(d.namaStafKewangan).substr(0, 120);
    v.telStafKewangan = Util.str(d.telStafKewangan).substr(0, 20);
    if (v.kaedah === 'Invois Dalaman') {
      if (!/^[A-Za-z0-9\-\/. ]{3,40}$/.test(v.noVot)) bad('noVot', 'Masukkan No. VOT / cajline', 'Enter the VOT / cajline number');
      if (v.namaStafKewangan.length < 2) bad('namaStafKewangan', 'Nama staf kewangan wajib', 'Finance officer name is required');
      if (!/^[0-9+\-\s]{8,16}$/.test(v.telStafKewangan)) bad('telStafKewangan', 'No. telefon tidak sah', 'Invalid phone number');
    }
    // peralatan tambahan
    var it = parseItems_(d.peralatan, 30);
    v.peralatan = it.senarai;
    if (it.ralat) bad('peralatan', it.ralat.split(' / ')[0], it.ralat.split(' / ')[1]);
    else {
      var valid = {};
      Db.rows('KADAR').forEach(function (r) { if (Util.truthy(r.Aktif) && Util.str(r.Kod_Sumber).indexOf('ALAT_') === 0) valid[Util.str(r.Kod_Sumber)] = true; });
      v.peralatan.forEach(function (x) { if (!valid[x.kod]) bad('peralatan', 'Peralatan tidak sah: ' + x.kod, 'Invalid equipment: ' + x.kod); });
    }
    // fail
    v.fail = {};
    if (!opts.langkasFail) {
      var chk = function (key, f, wajib, bm, en) {
        if (f && f.data) {
          try { v.fail[key] = Files.validate(f, ['pdf']); } catch (er) { bad(key === 'kertas' ? 'failKertasKerja' : 'failSurat', 'Fail PDF sahaja (saiz dihadkan)', 'PDF only (limited size)'); }
        } else if (wajib) bad(key === 'kertas' ? 'failKertasKerja' : 'failSurat', bm, en);
      };
      chk('kertas', d.failKertasKerja, true, 'Muat naik kertas kerja program (PDF)', 'Upload the programme paper (PDF)');
      chk('surat', d.failSurat, pem.jenis !== ROLE.PELAJAR, 'Muat naik surat permohonan (PDF)', 'Upload the application letter (PDF)');
    }
    // konflik
    if (s && v.hari.length && a !== null && b !== null && !e.masaMula && !e.masaTamat && !e.tarikh) {
      var k = Mk.konflik(v.kod, v.hari, a, b, '', ops);
      if (k.length) bad('tarikh', 'Ruang telah ditempah atau sedang menunggu kelulusan pada tarikh/masa ini', 'The space is already booked or awaiting approval at this date/time');
    }
  }

  function semakPinjaman_(pem, d, v, e, ops, tarikhOk, bad, today) {
    v.kod = 'PINJAMAN';
    v.tarikhTamat = '';
    var it = parseItems_(d.item, 10);
    v.item = it.senarai;
    if (it.ralat) bad('item', it.ralat.split(' / ')[0], it.ralat.split(' / ')[1]);
    else if (!v.item.length) bad('item', 'Pilih sekurang-kurangnya satu alat', 'Choose at least one item');
    else {
      v.item.forEach(function (x) {
        var a = Mk.alat(x.kod);
        if (!a || !Util.truthy(a.Aktif) || !Util.truthy(a.Boleh_Dipinjam)) { bad('item', 'Alat tidak boleh dipinjam: ' + x.kod, 'Item cannot be borrowed: ' + x.kod); return; }
        var b = Mk.baki(a);
        if (x.kuantiti > b.baki && !e.item) bad('item', 'Baki stok ' + Util.str(a.Nama_Alat) + ' tidak mencukupi (baki ' + b.baki + ')', 'Not enough stock of ' + Util.str(a.Nama_Alat) + ' (available ' + b.baki + ')');
      });
    }
    v.tarikhPulang = Util.str(d.tarikhPulang);
    if (!Mk.validKey(v.tarikhPulang)) bad('tarikhPulang', 'Pilih tarikh dijangka pulang', 'Choose the expected return date');
    else if (tarikhOk) {
      var maks = Util.dateKey(Util.addMonths(v.tarikh, Cfg.num('PINJAMAN_MAKS_BULAN', 1)));
      if (v.tarikhPulang < v.tarikh) bad('tarikhPulang', 'Tarikh pulang mesti selepas tarikh pinjam', 'The return date must not be before the loan date');
      else if (v.tarikhPulang > maks) bad('tarikhPulang', 'Tempoh pinjaman maksimum ' + Cfg.num('PINJAMAN_MAKS_BULAN', 1) + ' bulan (sehingga ' + maks + ')', 'Maximum loan period of ' + Cfg.num('PINJAMAN_MAKS_BULAN', 1) + ' month(s) (up to ' + maks + ')');
      else if (!Mk.isOp(v.tarikhPulang, ops)) bad('tarikhPulang', 'Tarikh pulang mesti hari operasi dan bukan cuti', 'The return date must be an operating day, not a holiday');
      else v.tarikhTamat = v.tarikhPulang;
    }
    v.mula = null; v.tamat = null;
  }

  // ---------- Anggaran ----------
  function anggar_(ctx, p, admin) {
    var pem = admin ? Mk.pemohonBagi(ctx, p) : Mk.pemohonSendiri(ctx);
    var r = semak_(pem, p, { langkasFail: true });
    var out = { ralat: r.ralat, jumlah: null, baris: [], belum: [] };
    var kira = kiraDari_(r.v, pem);
    if (kira) { out.jumlah = kira.jumlah; out.baris = kira.baris; out.belum = kira.belum; }
    return out;
  }

  function kiraDari_(v, pem) {
    if (!v.jenis || !v.tarikh) return null;
    var bu = {};
    if (v.jenis === 'Ruang') { if (!v.sumber || !v.bilHari || v.bilHari < 1) return null; bu = { bilHari: v.bilHari, peralatan: v.peralatan || [] }; }
    else if (v.jenis === 'Laser Cut') { if (!v.sumber || !v.minit) return null; bu = { minit: v.minit }; }
    else if (v.jenis === '3D Printer') { if (!v.sumber || !v.minit || !v.beratG) return null; bu = { minit: v.minit, beratG: v.beratG }; }
    else bu = {};
    return MkBil.kira(v.jenis, v.kod, pem.jenis, Mk.validKey(v.tarikh) ? v.tarikh : Mk.todayKey(), bu, Mk.kadarFn());
  }

  // ---------- Hantar ----------
  function hantar_(ctx, d, pem) {
    d = d || {};
    var jenis = Util.str(d.jenis);
    if (Mk.JENIS.indexOf(jenis) < 0) throw appError_('MK_TIDAK_SAH', { medan: { jenis: 'Pilih jenis tempahan / Choose a booking type' } });
    semakSekatan_(pem, jenis);
    var r = semak_(pem, d, {});
    if (Object.keys(r.ralat).length) throw appError_('MK_TIDAK_SAH', { medan: r.ralat });
    var v = r.v;
    var pelajar = pem.jenis === ROLE.PELAJAR;
    var kira = kiraDari_(v, pem);
    var anggaran = kira && !kira.belum.length ? kira.jumlah : '';

    // fail disimpan dahulu (di luar kunci)
    var stamp = Util.fmtDate(new Date(), 'yyyyMMddHHmm') + '_' + Util.randomToken().substr(0, 6);
    var url = { kertas: '', surat: '', gambar: '' };
    if (v.fail.kertas) url.kertas = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'KERTAS_KERJA_' + stamp, v.fail.kertas);
    if (v.fail.surat) url.surat = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'SURAT_' + stamp, v.fail.surat);
    if (v.fail.gambar) url.gambar = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'GAMBAR_3DP_' + stamp, v.fail.gambar);

    var token = pelajar ? Util.randomToken() : '';
    var now = new Date();
    var hasil = Db.withLock(function () {
      // semak semula dalam kunci: konflik dan stok
      var ops = Mk.ops();
      if (v.jenis === 'Pinjaman') {
        v.item.forEach(function (x) {
          if (x.kuantiti > Mk.baki(Mk.alat(x.kod)).baki) throw appError_('MK_STOK');
        });
      } else {
        var days = v.jenis === 'Ruang' ? v.hari : [v.tarikh];
        if (Mk.konflik(v.kod, days, v.mula, v.tamat, '', ops).length) throw appError_('MK_KONFLIK');
      }
      var id = Mk.idBaharu(Mk.PREFIX_ID);
      var tamatToken = pelajar ? new Date(now.getTime() + Cfg.num('PERAKUAN_TAMAT_HARI', 5) * 86400000) : '';
      Db.append('Tempahan', {
        ID_Tempahan: id, Jenis: v.jenis, Kod_Sumber: v.kod, Jenis_Pengguna: pem.jenis, Emel_Pemohon: pem.emel, Nama_Pemohon: pem.nama,
        Tarikh_Mula: Util.toDate(v.tarikh), Masa_Mula: v.mula === null ? '' : Mk.fmtMin(v.mula),
        Tarikh_Tamat: v.tarikhTamat ? Util.toDate(v.tarikhTamat) : '', Masa_Tamat: v.tamat === null ? '' : Mk.fmtMin(v.tamat),
        Tujuan: v.tujuan, Emel_Penyelia: v.penyelia, Status_Perakuan: pelajar ? 'Menunggu' : 'Tidak Perlu', Tarikh_Perakuan: '',
        Status: pelajar ? 'Menunggu Perakuan' : 'Menunggu Kelulusan', Diluluskan_Oleh: '', Tarikh_Keputusan: '', Catatan: '',
        No_Matrik: pem.noMatrik, Telefon: pem.telefon, Jabatan: pem.jabatan, Anggaran_RM: anggaran, Dicipta_Pada: now,
        Didaftar_Oleh: pem.bagiPihak ? ctx.email : '', Token_Hash: token ? MkPerakuan.hash(token) : '', Token_Tamat: tamatToken,
        Catatan_Penyelia: '', Bil_Pembaharuan: 0
      });
      if (v.jenis === 'Ruang') {
        Db.append('Butiran_Ruang', {
          ID_Tempahan: id, Nama_Program: v.namaProgram, Bil_Hari: v.bilHari, Bil_Peserta: v.bilPeserta, Kaedah_Bayaran: v.kaedah,
          No_VOT: v.kaedah === 'Invois Dalaman' ? v.noVot : '', Nama_Staf_Kewangan: v.kaedah === 'Invois Dalaman' ? v.namaStafKewangan : '',
          Tel_Staf_Kewangan: v.kaedah === 'Invois Dalaman' ? v.telStafKewangan : '', Fail_Kertas_Kerja: url.kertas, Fail_Surat: url.surat,
          Kaedah_Lain: v.kaedah === 'Lain-lain' ? v.kaedahLain : ''
        });
        v.peralatan.forEach(function (x) { Db.append('Item_Peralatan_Ruang', { ID_Tempahan: id, Kod_Alat: x.kod, Kuantiti: x.kuantiti }); });
      } else if (v.jenis === 'Laser Cut') {
        Db.append('Butiran_LaserCut', { ID_Tempahan: id, Nama_Projek: v.namaProjek, Jenis_Bahan: v.jenisBahan, Masa_Dijangka_Min: v.minit });
      } else if (v.jenis === '3D Printer') {
        Db.append('Butiran_3DP', {
          ID_Tempahan: id, Nama_Projek: v.namaProjek, Fail_Gambar: url.gambar, Berat_g: v.beratG, Warna: v.warna,
          No_Mesin: Util.str(v.sumber.No_Mesin), Masa_Dijangka_Min: v.minit
        });
      } else {
        v.item.forEach(function (x) {
          Db.append('Item_Pinjaman', { ID_Tempahan: id, Kod_Alat: x.kod, Kuantiti: x.kuantiti, Tarikh_Dijangka_Pulang: Util.toDate(v.tarikhTamat), Status: 'Dimohon' });
        });
      }
      Audit.log(auditCtx_(ctx, pem), 'MK_TEMPAH', 'Makerspace', id, '', pelajar ? 'Menunggu Perakuan' : 'Menunggu Kelulusan', v.jenis + ' ' + v.kod);
      return id;
    });

    var out = { id: hasil, status: pelajar ? 'Menunggu Perakuan' : 'Menunggu Kelulusan', anggaran: anggaran === '' ? null : anggaran, belumDitetapkan: kira ? kira.belum : [] };
    if (pelajar) out.emelPerakuanDihantar = MkPerakuan.hantarPautan(Mk.tempahan(hasil), token);
    Mk.mel(pem.emel, 'Tempahan Makerspace diterima', 'Makerspace booking received',
      ['Tempahan ' + hasil + ' (' + v.jenis + ') pada ' + Util.fmtTarikhBM(v.tarikh) + ' telah diterima.' +
        (pelajar ? ' Pautan perakuan telah dihantar kepada penyelia anda (' + v.penyelia + '). Tempahan akan disemak oleh UTMXCITE selepas diperakui.' : ' Tempahan akan disemak oleh UTMXCITE.')],
      ['Booking ' + hasil + ' (' + v.jenis + ') on ' + v.tarikh + ' has been received.' +
        (pelajar ? ' An endorsement link has been sent to your supervisor (' + v.penyelia + '). UTMXCITE will review it once endorsed.' : ' UTMXCITE will review it.')]);
    return out;
  }

  function auditCtx_(ctx, pem) {
    return { email: ctx.email, role: ctx.role, noMatrik: pem.noMatrik || pem.emel, bagiPihak: pem.bagiPihak };
  }

  // ---------- Paparan ----------
  function maskEmel_(e) {
    var m = /^(.)(.*)(@.+)$/.exec(e || '');
    return m ? m[1] + '***' + m[3] : '';
  }
  function bilOf_(id) {
    var l = Db.find('Bayaran_Makerspace', function (b) { return Util.str(b.ID_Tempahan) === id; });
    return l.length ? l[0] : null;
  }
  function bilView_(b) {
    if (!b) return null;
    var kos = b.Kos_Sebenar_RM === '' || b.Kos_Sebenar_RM === null || b.Kos_Sebenar_RM === undefined ? null : Number(b.Kos_Sebenar_RM);
    var ang = b.Anggaran_RM === '' || b.Anggaran_RM === null || b.Anggaran_RM === undefined ? null : Number(b.Anggaran_RM);
    return {
      id: Util.str(b.ID_Bayaran), idTempahan: Util.str(b.ID_Tempahan), status: Util.str(b.Status), anggaran: ang, kosSebenar: kos,
      jumlah: kos !== null ? kos : ang, penggunaan: Util.str(b.Penggunaan_Sebenar), tarikhJana: Util.dateKey(b.Tarikh_Jana), tarikhAkhir: Util.dateKey(b.Tarikh_Akhir),
      tarikhBayar: Util.dateKey(b.Tarikh_Bayar), kaedah: Util.str(b.Kaedah), noRujukan: Util.str(b.No_Rujukan), adaResit: !!Util.str(b.Fail_Resit),
      disahkanOleh: Util.str(b.Disahkan_Oleh), tarikhPengesahan: Util.dateKey(b.Tarikh_Pengesahan), catatan: Util.str(b.Catatan)
    };
  }

  /** Paparan penuh satu tempahan. opts.admin: sertakan emel penuh dan maklumat hubungan. */
  function paparan_(r, opts) {
    opts = opts || {};
    var id = Util.str(r.ID_Tempahan), jenis = Util.str(r.Jenis);
    var s = jenis === 'Pinjaman' ? null : Mk.sumber(Util.str(r.Kod_Sumber));
    var o = {
      id: id, jenis: jenis, kodSumber: Util.str(r.Kod_Sumber), sumberNama: s ? nama_(s) : (jenis === 'Pinjaman' ? 'Pinjaman peralatan' : Util.str(r.Kod_Sumber)),
      jenisPengguna: Util.str(r.Jenis_Pengguna), namaPemohon: Util.str(r.Nama_Pemohon),
      tarikhMula: Util.dateKey(r.Tarikh_Mula), tarikhTamat: Util.dateKey(r.Tarikh_Tamat), masaMula: Util.str(r.Masa_Mula), masaTamat: Util.str(r.Masa_Tamat),
      tujuan: Util.str(r.Tujuan), status: Util.str(r.Status), statusPerakuan: Util.str(r.Status_Perakuan),
      tarikhPerakuan: Util.dateKey(r.Tarikh_Perakuan), catatan: Util.str(r.Catatan), catatanPenyelia: Util.str(r.Catatan_Penyelia),
      anggaran: r.Anggaran_RM === '' || r.Anggaran_RM === null ? null : Number(r.Anggaran_RM),
      dicipta: Util.dateKey(r.Dicipta_Pada), bagiPihak: !!Util.str(r.Didaftar_Oleh), diluluskanOleh: Util.str(r.Diluluskan_Oleh),
      tarikhKeputusan: Util.dateKey(r.Tarikh_Keputusan), bilPembaharuan: Number(r.Bil_Pembaharuan) || 0,
      penyelia: opts.admin ? Util.str(r.Emel_Penyelia) : maskEmel_(Util.str(r.Emel_Penyelia)),
      pautanTamat: Util.str(r.Status) === 'Menunggu Perakuan' ? Util.dateKey(r.Token_Tamat) : ''
    };
    if (opts.admin) {
      o.pemohon = { emel: Util.str(r.Emel_Pemohon), noMatrik: Util.str(r.No_Matrik), telefon: Util.str(r.Telefon), jabatan: Util.str(r.Jabatan), didaftarOleh: Util.str(r.Didaftar_Oleh) };
    } else {
      o.pemohon = { jabatan: Util.str(r.Jabatan) };
    }
    if (jenis === 'Ruang') {
      var b = Mk.byId('Butiran_Ruang', id) || {};
      o.butiran = {
        namaProgram: Util.str(b.Nama_Program), bilHari: Number(b.Bil_Hari) || 0, bilPeserta: Number(b.Bil_Peserta) || 0,
        kaedahBayaran: Util.str(b.Kaedah_Bayaran), kaedahLain: Util.str(b.Kaedah_Lain), noVot: Util.str(b.No_VOT),
        namaStafKewangan: Util.str(b.Nama_Staf_Kewangan), telStafKewangan: Util.str(b.Tel_Staf_Kewangan),
        hariSebenar: b.Hari_Sebenar === '' || b.Hari_Sebenar === undefined ? null : Number(b.Hari_Sebenar),
        kapasiti: s ? Number(s.Kapasiti) || 0 : 0
      };
      o.fail = { kertas: !!Util.str(b.Fail_Kertas_Kerja), surat: !!Util.str(b.Fail_Surat) };
      var kd = Mk.kadarFn();
      o.peralatan = Mk.listById('Item_Peralatan_Ruang', id).map(function (x) {
        var kk = kd(Util.str(x.Kod_Alat), Util.str(r.Jenis_Pengguna), o.tarikhMula);
        return { kod: Util.str(x.Kod_Alat), nama: kk.nama, kuantiti: Number(x.Kuantiti) || 0 };
      });
      var lap = Mk.byId('Laporan_Aktiviti', id);
      var had = Cfg.num('LAPORAN_AKTIVITI_HARI', 3);
      o.laporan = { status: lap ? Util.str(lap.Status) : '', tarikhHantar: lap ? Util.dateKey(lap.Tarikh_Hantar) : '', tarikhHad: o.tarikhTamat ? Mk.addDays(o.tarikhTamat, had) : '', ada: !!(lap && Util.str(lap.Fail_Laporan)) };
    } else if (jenis === 'Laser Cut') {
      var l = Mk.byId('Butiran_LaserCut', id) || {};
      o.butiran = { namaProjek: Util.str(l.Nama_Projek), jenisBahan: Util.str(l.Jenis_Bahan), minitDijangka: Number(l.Masa_Dijangka_Min) || 0, minitSebenar: l.Masa_Sebenar_Min === '' || l.Masa_Sebenar_Min === undefined ? null : Number(l.Masa_Sebenar_Min) };
    } else if (jenis === '3D Printer') {
      var t = Mk.byId('Butiran_3DP', id) || {};
      o.butiran = {
        namaProjek: Util.str(t.Nama_Projek), beratG: Number(t.Berat_g) || 0, warna: Util.str(t.Warna), noMesin: Util.str(t.No_Mesin), minitDijangka: Number(t.Masa_Dijangka_Min) || 0,
        minitSebenar: t.Masa_Sebenar_Min === '' || t.Masa_Sebenar_Min === undefined ? null : Number(t.Masa_Sebenar_Min),
        beratSebenarG: t.Berat_Sebenar_g === '' || t.Berat_Sebenar_g === undefined ? null : Number(t.Berat_Sebenar_g)
      };
      o.fail = { gambar: !!Util.str(t.Fail_Gambar) };
    } else {
      var today = Mk.todayKey();
      o.item = Mk.listById('Item_Pinjaman', id).map(function (it) {
        var a = Mk.alat(Util.str(it.Kod_Alat));
        var due = Util.dateKey(it.Tarikh_Dijangka_Pulang);
        var st = Util.str(it.Status);
        return {
          kod: Util.str(it.Kod_Alat), nama: a ? Util.str(a.Nama_Alat) : Util.str(it.Kod_Alat), kuantiti: Number(it.Kuantiti) || 0, tarikhPulangDijangka: due,
          tarikhPulang: Util.dateKey(it.Tarikh_Pulang), status: st, lewat: st !== 'Dipulangkan' && o.status === 'Diluluskan' && due !== '' && due < today
        };
      });
      o.lewat = o.item.some(function (x) { return x.lewat; });
    }
    o.bayaran = bilView_(bilOf_(id));
    return o;
  }

  function saya_(ctx) {
    var pem = Mk.pemohonSendiri(ctx);
    var rows = Db.rows('Tempahan').filter(function (r) { return milik_(r, pem.emel, pem.noMatrik); });
    rows.sort(function (a, b) { return (Util.toDate(b.Dicipta_Pada) || 0) - (Util.toDate(a.Dicipta_Pada) || 0); });
    var s = sekatan_(pem.emel, pem.noMatrik);
    return {
      senarai: rows.slice(0, 200).map(function (r) { var o = paparan_(r, {}); return ringkas_(o); }),
      sekatan: { bil: s.bil, laporan: s.laporan, pinjaman: s.pinjaman }
    };
  }

  function ringkas_(o) {
    return {
      id: o.id, jenis: o.jenis, sumberNama: o.sumberNama, tarikhMula: o.tarikhMula, tarikhTamat: o.tarikhTamat, masaMula: o.masaMula, masaTamat: o.masaTamat,
      tujuan: o.tujuan, status: o.status, statusPerakuan: o.statusPerakuan, bayaran: o.bayaran ? { id: o.bayaran.id, status: o.bayaran.status, jumlah: o.bayaran.jumlah, tarikhAkhir: o.bayaran.tarikhAkhir } : null,
      laporan: o.laporan ? o.laporan.status : '', lewat: !!o.lewat
    };
  }

  function milikOrThrow_(ctx, id) {
    var pem = Mk.pemohonSendiri(ctx);
    var r = Mk.tempahan(Util.str(id));
    if (!r || !milik_(r, pem.emel, pem.noMatrik)) throw appError_('MK_TIDAK_DITEMUI');
    return { r: r, pem: pem };
  }

  /** Tindakan yang dibenarkan kepada pemohon. */
  function bolehPemohon_(o) {
    var today = Mk.todayKey();
    var aktifSelesai = o.status === 'Diluluskan' || o.status === 'Selesai';
    var bayarStatus = o.bayaran ? o.bayaran.status : '';
    return {
      batal: DIBENARKAN_BATAL.indexOf(o.status) >= 0 || (o.status === 'Diluluskan' && o.tarikhMula > today),
      hantarSemulaPerakuan: o.status === 'Menunggu Perakuan',
      perbaharui: o.jenis === 'Pinjaman' && o.status === 'Diluluskan' && o.bilPembaharuan < Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1) && !o.lewat,
      bayar: ['Belum Bayar', 'Lewat'].indexOf(bayarStatus) >= 0,
      laporan: o.jenis === 'Ruang' && aktifSelesai && o.tarikhTamat <= today
    };
  }

  function butiran_(ctx, p) {
    var m = milikOrThrow_(ctx, p.id);
    var o = paparan_(m.r, {});
    o.boleh = bolehPemohon_(o);
    return o;
  }

  function batal_(ctx, p) {
    var m = milikOrThrow_(ctx, p.id);
    var id = Util.str(m.r.ID_Tempahan);
    var catatan = Util.str(p.catatan).substr(0, 300);
    Db.withLock(function () {
      var r = Mk.tempahan(id);
      var o = paparan_(r, {});
      if (!bolehPemohon_(o).batal) throw appError_('MK_BATAL_TIDAK_BOLEH');
      Db.update('Tempahan', r._row, { Status: 'Dibatalkan', Token_Hash: '', Tarikh_Keputusan: new Date(), Catatan: 'Dibatalkan oleh pemohon' + (catatan ? ': ' + catatan : '') });
      Audit.log(ctx, 'MK_BATAL', 'Makerspace', id, Util.str(r.Status), 'Dibatalkan', catatan);
    });
    return butiran_(ctx, { id: id });
  }

  function perbaharui_(ctx, p, admin) {
    var id = Util.str(p.id);
    var r, pem = null;
    if (admin) { Mk.adminPutus(ctx); r = Mk.tempahan(id); if (!r) throw appError_('MK_TIDAK_DITEMUI'); }
    else { var m = milikOrThrow_(ctx, id); r = m.r; pem = m.pem; }
    var due;
    Db.withLock(function () {
      r = Mk.tempahan(id);
      var ops = Mk.ops();
      if (Util.str(r.Jenis) !== 'Pinjaman' || Util.str(r.Status) !== 'Diluluskan') throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      if ((Number(r.Bil_Pembaharuan) || 0) >= Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1)) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      var items = Mk.listById('Item_Pinjaman', id).filter(function (it) { return Util.str(it.Status) !== 'Dipulangkan'; });
      if (!items.length) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      var lama = Util.dateKey(r.Tarikh_Tamat);
      if (!admin && lama < Mk.todayKey()) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      due = Util.dateKey(Util.addMonths(lama, Cfg.num('PINJAMAN_MAKS_BULAN', 1)));
      var n = 0;
      while (!Mk.isOp(due, ops) && n++ < 10) due = Mk.addDays(due, -1);
      if (due <= lama) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      items.forEach(function (it) { Db.update('Item_Pinjaman', it._row, { Tarikh_Dijangka_Pulang: Util.toDate(due) }); });
      Db.update('Tempahan', r._row, { Tarikh_Tamat: Util.toDate(due), Bil_Pembaharuan: (Number(r.Bil_Pembaharuan) || 0) + 1 });
      Audit.log(ctx, 'MK_PERBAHARUI_PINJAMAN', 'Makerspace', id, lama, due, admin ? 'oleh admin' : 'oleh pemohon');
    });
    Mk.mel(Util.normEmail(r.Emel_Pemohon), 'Pinjaman diperbaharui', 'Loan renewed',
      ['Pinjaman ' + id + ' diperbaharui. Tarikh dijangka pulang baharu: ' + Util.fmtTarikhBM(due) + '.'],
      ['Loan ' + id + ' has been renewed. New expected return date: ' + due + '.']);
    return admin ? MkAdmin.butiran(ctx, { id: id }) : butiran_(ctx, { id: id });
  }

  function hantarLaporan_(ctx, p) {
    var m = milikOrThrow_(ctx, p.id);
    var id = Util.str(m.r.ID_Tempahan);
    var o = paparan_(m.r, {});
    if (!bolehPemohon_(o).laporan) throw appError_('MK_LAPORAN_TIDAK_SAH');
    var v;
    try { v = Files.validate(p.fail, ['pdf']); } catch (e) { throw appError_('MK_TIDAK_SAH', { medan: { fail: 'Fail PDF sahaja (saiz dihadkan) / PDF only (limited size)' } }); }
    var url = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'LAPORAN_' + id + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), v);
    Db.withLock(function () {
      var lap = Mk.byId('Laporan_Aktiviti', id);
      var rec = { ID_Tempahan: id, Fail_Laporan: url, Tarikh_Hantar: new Date(), Status: 'Dihantar' };
      if (lap) Db.update('Laporan_Aktiviti', lap._row, rec); else Db.append('Laporan_Aktiviti', rec);
      Audit.log(ctx, 'MK_LAPORAN_HANTAR', 'Makerspace', id, lap ? Util.str(lap.Status) : '', 'Dihantar', '');
    });
    return butiran_(ctx, { id: id });
  }

  function fail_(ctx, p) {
    var id = Util.str(p.id), jenis = Util.str(p.jenis);
    var r = Mk.tempahan(id);
    if (!r) throw appError_('MK_TIDAK_DITEMUI');
    var admin = ADMIN_ROLES.indexOf(ctx.role) >= 0;
    if (admin) Mk.adminLihat(ctx);
    else {
      var pem = Mk.pemohonSendiri(ctx);
      if (!milik_(r, pem.emel, pem.noMatrik)) throw appError_('MK_TIDAK_DITEMUI');
    }
    var url = '';
    if (jenis === 'kertas' || jenis === 'surat') {
      var b = Mk.byId('Butiran_Ruang', id);
      url = b ? Util.str(jenis === 'kertas' ? b.Fail_Kertas_Kerja : b.Fail_Surat) : '';
    } else if (jenis === 'gambar') {
      var t = Mk.byId('Butiran_3DP', id);
      url = t ? Util.str(t.Fail_Gambar) : '';
    } else if (jenis === 'laporan') {
      var l = Mk.byId('Laporan_Aktiviti', id);
      url = l ? Util.str(l.Fail_Laporan) : '';
    } else if (jenis === 'resit') {
      var bil = bilOf_(id);
      url = bil ? Util.str(bil.Fail_Resit) : '';
    }
    if (!url) throw appError_('MK_FAIL_TIADA');
    if (admin) Audit.log(ctx, 'MK_PAPAR_FAIL', 'Makerspace', id, '', jenis, '');
    return Files.read(url);
  }

  return {
    maklumat: maklumat_, ketersediaan: ketersediaan_, anggar: anggar_, hantar: hantar_, saya: saya_, butiran: butiran_, batal: batal_,
    perbaharui: perbaharui_, hantarLaporan: hantarLaporan_, fail: fail_, paparan: paparan_, bilOf: bilOf_, bilView: bilView_, sekatan: sekatan_,
    semak: semak_, kiraDari: kiraDari_, auditCtx: auditCtx_, maskEmel: maskEmel_, milik: milik_, nama: nama_, bolehPemohon: bolehPemohon_
  };
})();


// ===== Otp.gs =====
/**
 * SHAMS: OTP berasaskan tujuan (bukan log masuk). Contoh: pemohon mengesahkan penerimaan tawaran,
 * penyelia memperakui tempahan. OTP dihantar ke emel yang ditentukan, disimpan sebagai hash dalam CacheService,
 * had percubaan, jeda dan had sejam; dikira dalam kuota OTP harian yang sama dengan log masuk.
 *   Otp.issue('TERIMA_TAWARAN:PLT-2026-0001', emel, {subjectBm, subjectEn, bm:[...], en:[...]})
 *   Otp.verify('TERIMA_TAWARAN:PLT-2026-0001', emel, kod)   // lempar AppError jika tidak sah, pulang true
 * opts.bm / opts.en ialah tatasusunan perenggan; "{kod}" dalam perenggan diganti kod OTP.
 */

var Otp = (function () {
  var P = 'otpx:', CD = 'otpxcd:', HR = 'otpxh:';

  function key_(purpose, email) { return Util.sha256(Auth.pepper() + '|x|' + purpose + '|' + email).substr(0, 40); }
  function hash_(purpose, email, code) { return Util.sha256(Auth.pepper() + '|xc|' + purpose + '|' + email + '|' + code); }

  function issue_(purpose, emailRaw, opts) {
    opts = opts || {};
    var email = Util.normEmail(emailRaw);
    if (!Util.isEmail(email)) throw appError_('EMEL_TIDAK_SAH');
    if (Mode.isUji() && !Mail.allowed(email)) throw appError_('UJI_TIADA_SENARAI');
    var c = Db.cache(), k = key_(purpose, email);
    if (c.get(CD + k)) throw appError_('RATE_JEDA');
    var hourly = parseInt(c.get(HR + k) || '0', 10);
    if (hourly >= Cfg.num('OTP_MAKS_SEJAM', 3) + 2) throw appError_('RATE_SEJAM');
    if (Auth.bumpDaily() > Cfg.num('OTP_MAKS_HARIAN', 1000)) throw appError_('RATE_HARIAN');
    var minit = Cfg.num('OTP_TAMAT_MINIT', 5);
    var code = Util.randomOtp();
    c.put(P + k, JSON.stringify({ h: hash_(purpose, email, code), t: 0, exp: new Date().getTime() + minit * 60000 }), minit * 60);
    c.put(CD + k, '1', Cfg.num('OTP_JEDA_SAAT', 60));
    c.put(HR + k, String(hourly + 1), 3600);
    var sub = function (arr) { return (arr || []).map(function (t) { return String(t).replace(/\{kod\}/g, code); }); };
    var sent;
    try {
      sent = Mail.send(email, {
        subjectBm: opts.subjectBm || 'Kod pengesahan', subjectEn: opts.subjectEn || 'Verification code',
        bm: sub(opts.bm && opts.bm.length ? opts.bm : ['Kod pengesahan anda ialah: {kod}', 'Kod ini sah selama ' + minit + ' minit. Jangan kongsikannya.']),
        en: sub(opts.en && opts.en.length ? opts.en : ['Your verification code is: {kod}', 'This code is valid for ' + minit + ' minutes. Do not share it.'])
      });
    } catch (e) {
      console.error('Emel OTP tujuan gagal: ' + e);
      throw appError_('HANTAR_GAGAL');
    }
    if (!sent) throw appError_('UJI_TIADA_SENARAI');
    return { jedaSaat: Cfg.num('OTP_JEDA_SAAT', 60), tamatMinit: minit };
  }

  function verify_(purpose, emailRaw, codeRaw) {
    var email = Util.normEmail(emailRaw);
    var code = String(codeRaw == null ? '' : codeRaw).replace(/\s+/g, '');
    var c = Db.cache(), k = key_(purpose, email);
    var raw = c.get(P + k);
    if (!raw) throw appError_('OTP_TAMAT');
    var rec = JSON.parse(raw);
    var maxTries = Cfg.num('OTP_MAKS_PERCUBAAN', 5);
    if (rec.t >= maxTries) { c.remove(P + k); throw appError_('OTP_TERLALU_BANYAK'); }
    if (!/^\d{6}$/.test(code) || !Util.safeEqual(rec.h, hash_(purpose, email, code))) {
      rec.t++;
      if (rec.t >= maxTries) { c.remove(P + k); throw appError_('OTP_TERLALU_BANYAK'); }
      c.put(P + k, JSON.stringify(rec), Math.max(1, Math.floor((rec.exp - new Date().getTime()) / 1000)));
      throw appError_('OTP_SALAH');
    }
    c.remove(P + k);
    return true;
  }

  return { issue: issue_, verify: verify_ };
})();


// ===== Pdf.gs =====
/**
 * SHAMS: penjanaan PDF daripada HTML (tanpa templat Google Docs) dan enjin templat Google Docs.
 *   Pdf.wrap(bodyHtml, tajuk)               -> HTML A4 dengan gaya seragam (UTMXCITE)
 *   Pdf.dariHtml(html, namaFail, folderKod) -> {url}   (simpan dalam folder berdaftar)
 *   DocTpl.jana(kodTemplat, data, folderKod, namaFail) -> {url, amaran[]}  (templat Google Docs dalam Link_Dokumen)
 * Penanda dalam templat Docs: [nama] atau {{NAMA}}; data ialah {nama: 'nilai'} (kunci tanpa kurungan, huruf kecil;
 * penanda besar {{NAMA}} diterima juga). Penanda tidak dikenali dibiarkan dan dilaporkan dalam amaran.
 */

var Pdf = {
  esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  wrap: function (bodyHtml, tajuk) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + Pdf.esc(tajuk || 'SHAMS') + '</title><style>' +
      '@page{size:A4;margin:22mm 20mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#000}' +
      'h1{font-size:14pt;text-align:center;margin:6pt 0}h2{font-size:12pt;margin:12pt 0 4pt}p{margin:0 0 7pt;text-align:justify}' +
      'table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:4pt 6pt;vertical-align:top;font-size:10.5pt}' +
      '.nb td{border:0;padding:2pt 4pt}.c{text-align:center}.r{text-align:right}.sm{font-size:9.5pt}.sig{margin-top:36pt}' +
      '</style></head><body>' + bodyHtml + '</body></html>';
  },

  /** Jana PDF daripada HTML penuh dan simpan dalam folder berdaftar (Link_Dokumen). */
  dariHtml: function (html, namaFail, folderKod) {
    var fl = Db.links()[folderKod];
    if (!fl || !fl.id) throw appError_('SETUP_TIADA_LINK', { kod: folderKod });
    var blob = Utilities.newBlob(html, 'text/html', namaFail + '.html').getAs('application/pdf');
    blob.setName(namaFail + '.pdf');
    var file = DriveApp.getFolderById(fl.id).createFile(blob);
    file.setName(namaFail + '.pdf');
    return { url: file.getUrl() };
  }
};

var DocTpl = (function () {
  function reEsc_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function repEsc_(s) { return String(s).replace(/\$/g, '\\$'); }
  var LEFT = /\[[a-z0-9_]{3,}\]|\{\{[A-Z0-9_]{3,}\}\}/g;

  function jana_(kodTemplat, data, folderKod, namaFail) {
    var t = Db.links()[kodTemplat];
    if (!t || !t.id) throw appError_('TEMPLAT_TIADA', { kod: kodTemplat });
    var fl = Db.links()[folderKod];
    if (!fl || !fl.id) throw appError_('SETUP_TIADA_LINK', { kod: folderKod });
    var folder = DriveApp.getFolderById(fl.id);
    var copy;
    try { copy = DriveApp.getFileById(t.id).makeCopy('~sementara ' + namaFail, folder); } catch (e) {
      console.error('Templat tidak boleh dibuka (' + kodTemplat + '): ' + e);
      throw appError_('TEMPLAT_TIADA', { kod: kodTemplat });
    }
    var amaran = [], url;
    try {
      var doc = DocumentApp.openById(copy.getId());
      var parts = [doc.getBody()];
      try { if (doc.getHeader()) parts.push(doc.getHeader()); } catch (e) { /* tiada pengepala */ }
      try { if (doc.getFooter()) parts.push(doc.getFooter()); } catch (e) { /* tiada pengaki */ }
      Object.keys(data).forEach(function (k) {
        var low = String(k).toLowerCase(), up = String(k).toUpperCase();
        var val = repEsc_(data[k] == null ? '' : data[k]);
        parts.forEach(function (p) {
          p.replaceText(reEsc_('[' + low + ']'), val);
          p.replaceText(reEsc_('{{' + up + '}}'), val);
        });
      });
      doc.saveAndClose();
      var left = {};
      var txt = DocumentApp.openById(copy.getId()).getBody().getText();
      (txt.match(LEFT) || []).forEach(function (m) { left[m] = true; });
      if (Object.keys(left).length) amaran.push('Penanda tidak dikenali dalam templat (dibiarkan): ' + Object.keys(left).join(', '));
      var blob = copy.getAs('application/pdf');
      blob.setName(namaFail + '.pdf');
      var file = folder.createFile(blob);
      file.setName(namaFail + '.pdf');
      url = file.getUrl();
    } finally {
      try { copy.setTrashed(true); } catch (e) { console.error('Salinan sementara tidak dapat dipadam: ' + e); }
    }
    return { url: url, amaran: amaran };
  }

  return { jana: jana_ };
})();


// ===== Profiling.gs =====
/**
 * SHAMS: Profiling pelajar (peringkat 2).
 * - Data rasmi daripada PELAJAR dipaparkan (auto-isi); hanya medan semester dan hubungan boleh dikemas kini pelajar.
 * - Satu baris Profil bagi setiap pelajar bagi setiap sesi (sejarah disimpan).
 * - "Lengkap" = ada sekurang-kurangnya satu Profil yang sah. Sesi baharu hanya mencetuskan peringatan, bukan sekatan.
 */

var Profiling = (function () {
  var YA_TIDAK = ['Ya', 'Tidak'];
  var YA_TIDAK_MUNGKIN = ['Ya', 'Tidak', 'Mungkin'];

  function sesi_() { return Cfg.get('SESI_SEMASA', '') || 'UMUM'; }

  function pelajarRow_(noMatrik) {
    var l = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === noMatrik; });
    return l.length ? l[0] : null;
  }

  function maskKp_(kp) {
    var s = Util.str(kp);
    return s.length <= 4 ? s : s.substr(0, 2) + '****' + s.substr(-3);
  }

  /** Profil terkini (sesi paling baharu mengikut Tarikh_Kemas_Kini) bagi pelajar. */
  function latest_(noMatrik) {
    var l = Db.find('Profil', function (r) { return Util.normMatric(r.No_Matrik) === noMatrik; });
    if (!l.length) return null;
    l.sort(function (a, b) {
      var da = Util.toDate(a.Tarikh_Kemas_Kini), db = Util.toDate(b.Tarikh_Kemas_Kini);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    return l[0];
  }

  /** Keadaan profiling: {lengkap, sesi, perluKemasKini}. */
  function status_(noMatrik) {
    var p = latest_(noMatrik);
    if (!p) return { lengkap: false, sesi: sesi_(), perluKemasKini: false };
    return { lengkap: true, sesi: sesi_(), perluKemasKini: Util.str(p.Sesi) !== sesi_() };
  }

  function csv_(arr) { return (arr || []).join(','); }
  function split_(s) { return Util.str(s) ? Util.str(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }

  function view_(ctx) {
    var m = ctx.noMatrik;
    var pel = pelajarRow_(m);
    if (!pel) throw appError_('MATRIK_TIDAK_DITEMUI');
    var p = latest_(m);
    var fam = [];
    if (p) {
      fam = Db.find('Perniagaan_Keluarga', function (r) { return Util.str(r.ID_Profil) === Util.str(p.ID_Profil); })
        .map(function (r) { return { hubungan: Util.str(r.Hubungan), jenis: Util.str(r.Jenis_Perniagaan), tempoh: Util.str(r.Tempoh) }; });
    }
    return {
      pelajar: {
        noMatrik: m, nama: Util.str(pel.Nama_Penuh), emel: Util.str(pel.Emel), noKp: maskKp_(pel.No_KP_Pasport),
        jantina: Util.str(pel.Jantina), etnik: Util.str(pel.Etnik), kewarganegaraan: Util.str(pel.Kewarganegaraan),
        fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program), bidang: Util.str(pel.Bidang_Pengajian),
        tahun: Util.str(pel.Tahun_Pengajian), telefon: Util.str(pel.No_Telefon),
        alamatKolej: Util.str(pel.Alamat_Kolej), alamatRumah: Util.str(pel.Alamat_Rumah)
      },
      profil: p ? {
        sesi: Util.str(p.Sesi), kampung: Util.str(p.Kampung_Halaman),
        keluargaBerniaga: Util.str(p.Keluarga_Berniaga), keluarga: fam,
        pernahBerniaga: Util.str(p.Pernah_Berniaga), jenisDijalankan: Util.str(p.Jenis_Perniagaan_Dijalankan),
        tempohNiaga: Util.str(p.Tempoh_Perniagaan), motivasi: split_(p.Motivasi),
        berminat: Util.str(p.Berminat_Berniaga), klusterDiminati: split_(p.Kluster_Diminati), klusterLain: Util.str(p.Kluster_Lain),
        mahuKampus: Util.str(p.Mahu_Kampus), aliran: Util.str(p.Aliran_Pilihan)
      } : null,
      status: status_(m)
    };
  }

  /** Semak medan. Pulang {nilai, ralat:{medan:mesej}}. */
  function check_(d) {
    var e = {}, v = {};
    var req = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var oneOf = function (k, val, list) { if (list.indexOf(val) < 0) req(k, 'Pilihan tidak sah / Invalid choice'); };
    var codes = function (k, arr, group, min) {
      arr = Array.isArray(arr) ? arr.map(function (x) { return String(x); }) : [];
      var uniq = arr.filter(function (x, i) { return arr.indexOf(x) === i; });
      if (uniq.length < (min || 0)) req(k);
      uniq.forEach(function (x) { if (!Ref.has(group, x)) req(k, 'Pilihan tidak sah / Invalid choice'); });
      return uniq;
    };

    v.telefon = Util.str(d.telefon);
    if (!/^[0-9+\-\s]{8,16}$/.test(v.telefon)) req('telefon', 'No. telefon tidak sah / Invalid phone number');
    v.alamatKolej = Util.str(d.alamatKolej).substr(0, 250);
    v.alamatRumah = Util.str(d.alamatRumah).substr(0, 250);
    if (!v.alamatRumah) req('alamatRumah');

    v.fakulti = Ref.kodOf('FAKULTI', d.fakulti);
    if (!v.fakulti) req('fakulti', 'Pilihan tidak sah / Invalid choice');
    v.bidang = Ref.kodOf('BIDANG', d.bidang);
    if (!v.bidang) req('bidang', 'Pilihan tidak sah / Invalid choice');
    v.program = Util.str(d.program).substr(0, 120);
    if (!v.program) req('program');
    v.tahun = parseInt(d.tahun, 10);
    if (isNaN(v.tahun) || v.tahun < 1 || v.tahun > 7) req('tahun', 'Tahun mesti 1 hingga 7 / Year must be 1 to 7');

    v.kampung = Util.str(d.kampung);
    if (!Ref.has('NEGERI', v.kampung)) req('kampung', 'Pilihan tidak sah / Invalid choice');

    v.keluargaBerniaga = Util.str(d.keluargaBerniaga);
    oneOf('keluargaBerniaga', v.keluargaBerniaga, YA_TIDAK);
    v.keluarga = [];
    if (v.keluargaBerniaga === 'Ya') {
      var fam = Array.isArray(d.keluarga) ? d.keluarga.slice(0, 10) : [];
      fam.forEach(function (f) {
        var h = Util.str(f && f.hubungan), j = Util.str(f && f.jenis).substr(0, 120), t = Util.str(f && f.tempoh).substr(0, 60);
        if (h || j || t) v.keluarga.push({ hubungan: h, jenis: j, tempoh: t });
      });
      if (!v.keluarga.length) req('keluarga', 'Isi sekurang-kurangnya satu ahli keluarga / Add at least one family member');
      v.keluarga.forEach(function (f) {
        if (!Ref.has('HUBUNGAN', f.hubungan) || !f.jenis) req('keluarga', 'Hubungan dan jenis perniagaan wajib / Relationship and business type are required');
      });
    }

    v.pernahBerniaga = Util.str(d.pernahBerniaga);
    oneOf('pernahBerniaga', v.pernahBerniaga, YA_TIDAK);
    v.jenisDijalankan = ''; v.tempohNiaga = ''; v.motivasi = [];
    if (v.pernahBerniaga === 'Ya') {
      v.jenisDijalankan = Util.str(d.jenisDijalankan);
      if (!Ref.has('KLUSTER', v.jenisDijalankan)) req('jenisDijalankan', 'Pilihan tidak sah / Invalid choice');
      v.tempohNiaga = Util.str(d.tempohNiaga);
      if (!Ref.has('TEMPOH_NIAGA', v.tempohNiaga)) req('tempohNiaga', 'Pilihan tidak sah / Invalid choice');
      v.motivasi = codes('motivasi', d.motivasi, 'MOTIVASI', 0);
    }

    v.berminat = Util.str(d.berminat);
    oneOf('berminat', v.berminat, YA_TIDAK);
    v.klusterDiminati = []; v.klusterLain = ''; v.mahuKampus = ''; v.aliran = '';
    if (v.berminat === 'Ya') {
      v.klusterDiminati = codes('klusterDiminati', d.klusterDiminati, 'KLUSTER', 1);
      if (v.klusterDiminati.indexOf('LAIN') >= 0) {
        v.klusterLain = Util.str(d.klusterLain).substr(0, 120);
        if (!v.klusterLain) req('klusterLain');
      }
      v.mahuKampus = Util.str(d.mahuKampus);
      oneOf('mahuKampus', v.mahuKampus, YA_TIDAK_MUNGKIN);
      v.aliran = Util.str(d.aliran);
      if (!Ref.has('ALIRAN', v.aliran)) req('aliran', 'Pilihan tidak sah / Invalid choice');
    }
    return { nilai: v, ralat: e };
  }

  function save_(ctx, d) {
    d = d || {};
    var chk = check_(d);
    if (Object.keys(chk.ralat).length) throw appError_('PROFIL_TIDAK_SAH', { medan: chk.ralat });
    var v = chk.nilai;
    var m = ctx.noMatrik;
    return Db.withLock(function () {
      var pel = pelajarRow_(m);
      if (!pel) throw appError_('MATRIK_TIDAK_DITEMUI');
      // 1. Kemas kini medan semester dan hubungan dalam PELAJAR (identiti dikunci)
      Db.update('PELAJAR', pel._row, {
        Fakulti: Ref.bm('FAKULTI', v.fakulti), Bidang_Pengajian: Ref.bm('BIDANG', v.bidang), Program: v.program,
        Tahun_Pengajian: v.tahun, No_Telefon: v.telefon, Alamat_Kolej: v.alamatKolej, Alamat_Rumah: v.alamatRumah
      });
      // 2. Profil bagi sesi semasa: kemas kini jika sudah ada
      var sesi = sesi_();
      var cur = Db.find('Profil', function (r) { return Util.normMatric(r.No_Matrik) === m && Util.str(r.Sesi) === sesi; });
      var id = cur.length ? Util.str(cur[0].ID_Profil) : Util.formatId('PRF', null, Db.nextSeqLocked('PRF'), 5);
      var rec = {
        ID_Profil: id, No_Matrik: m, Sesi: sesi, Tarikh_Kemas_Kini: new Date(), No_Telefon: v.telefon,
        Kampung_Halaman: v.kampung, Keluarga_Berniaga: v.keluargaBerniaga, Pernah_Berniaga: v.pernahBerniaga,
        Jenis_Perniagaan_Dijalankan: v.jenisDijalankan, Tempoh_Perniagaan: v.tempohNiaga, Motivasi: csv_(v.motivasi),
        Berminat_Berniaga: v.berminat, Kluster_Diminati: csv_(v.klusterDiminati), Kluster_Lain: v.klusterLain,
        Mahu_Kampus: v.mahuKampus, Aliran_Pilihan: v.aliran
      };
      if (cur.length) Db.update('Profil', cur[0]._row, rec); else Db.append('Profil', rec);
      // 3. Perniagaan keluarga: ganti baris bagi profil ini
      var all = Db.rows('Perniagaan_Keluarga');
      var keep = all.filter(function (r) { return Util.str(r.ID_Profil) !== id; });
      v.keluarga.forEach(function (f) { keep.push({ ID_Profil: id, Hubungan: f.hubungan, Jenis_Perniagaan: f.jenis, Tempoh: f.tempoh }); });
      Db.replaceAll('Perniagaan_Keluarga', keep);
      // 4. Sinkron telefon ke Pengguna
      var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === m && Util.str(r.Peranan) === ROLE.PELAJAR; });
      if (pg.length) { Db.update('Pengguna', pg[0]._row, { Telefon: v.telefon }); Auth.invalidatePengguna(Util.normEmail(pg[0].Emel)); }
      Audit.log(ctx, cur.length ? 'KEMAS_KINI_PROFIL' : 'SIMPAN_PROFIL', 'Profiling', id, '', sesi, '');
      return view_(ctx);
    });
  }

  return { view: view_, save: save_, status: status_, latest: latest_, check: check_ };
})();


// ===== Ref.gs =====
/**
 * SHAMS: capaian tab Rujukan (senarai pilihan), dicache 2 minit.
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


// ===== RuangNiaga.gs =====
/**
 * SHAMS: modul Ruang Niaga (titik masuk). Objek global tunggal RuangNiaga mendedahkan:
 *   routes()      laluan RPC rn.* (digabungkan oleh rpcTable_ dalam Code.gs)
 *   jobHarian()   kerja harian (dipanggil oleh Jobs.harian)
 *   seed()        data awal modul (tiada keperluan buat masa ini)
 * Fail modul: RuangNiagaPermohonan (lot, permohonan), RuangNiagaNilai (penilaian), RuangNiagaTawaran, RuangNiagaDokumen,
 * RuangNiagaCagaran, RuangNiagaPerjanjian, RuangNiagaSewa (sewaan, bil), RuangNiagaLanjut (butiran, laluan tambahan). Pembantu: RnU.
 * Laluan tindakan pelajar juga disediakan sebagai rn.bp.* (admin bagi pihak pelajar, melalui Bantu.ctx).
 */

var RuangNiaga = (function () {
  function viewer_() { return ADMIN_ROLES.filter(function (r) { return r !== ROLE.PENILAI; }); }
  function decider_() { return [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL]; }

  /** Tindakan pelajar: nama -> fn(ctx, payload). Setiap satu didedahkan sebagai rn.<nama> dan rn.bp.<nama>. */
  function pelajar_() {
    var t = {
      'saya': function (c) { return RnPer.saya(c); },
      'mohon.hantar': function (c, p) { return RnPer.hantar(c, p); },
      'mohon.batal': function (c, p) { return RnPer.batal(c, p); },
      'fail': function (c, p) { return RnPer.fail(c, p); }
    };
    if (typeof RnLanjut !== 'undefined') RnLanjut.laluanPelajar(t);
    return t;
  }

  /** Tindakan admin: nama -> [fungsi peranan, fn]. */
  function admin_() {
    var t = {
      'admin.lot.senarai': [viewer_, function (c) { return RnPer.lotSenarai(c); }],
      'admin.lot.simpan': [decider_, function (c, p) { return RnPer.lotSimpan(c, p); }],
      'admin.tempoh.simpan': [decider_, function (c, p) { return RnPer.tempohSimpan(c, p); }],
      'admin.perm.senarai': [viewer_, function (c, p) { return RnPer.adminSenarai(c, p); }],
      'admin.perm.butiran': [viewer_, function (c, p) { return RnPer.adminButiran(c, p); }],
      'admin.perm.tindakan': [decider_, function (c, p) { return RnPer.adminTindakan(c, p); }],
      'admin.perm.fail': [viewer_, function (c, p) { return RnPer.adminFail(c, p); }]
    };
    if (typeof RnLanjut !== 'undefined') RnLanjut.laluanAdmin(t, viewer_, decider_);
    return t;
  }

  function routes_() {
    var out = {};
    var stu = pelajar_();
    Object.keys(stu).forEach(function (k) {
      out['rn.' + k] = { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: stu[k] };
      out['rn.bp.' + k] = { auth: true, roles: decider_(), fn: function (c, p) { return stu[k](Bantu.ctx(c, p.noMatrik, 'ruang niaga'), p); } };
    });
    out['rn.bp.cari'] = {
      auth: true, roles: decider_(), fn: function (c, p) {
        var bc = Bantu.ctx(c, p.noMatrik, 'ruang niaga');
        var pel = RnU.pelajar(bc.noMatrik);
        return {
          pelajar: { noMatrik: bc.noMatrik, nama: bc.nama, emel: Util.str(pel.Emel), fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program) },
          rn: RnPer.saya(bc)
        };
      }
    };
    var adm = admin_();
    Object.keys(adm).forEach(function (k) {
      out['rn.' + k] = { auth: true, roles: adm[k][0](), fn: adm[k][1] };
    });
    if (typeof RnLanjut !== 'undefined') RnLanjut.laluanLain(out);
    return out;
  }

  function jobHarian_() {
    return typeof RnLanjut !== 'undefined' ? RnLanjut.jobHarian() : {};
  }

  return { routes: routes_, jobHarian: jobHarian_, seed: function () {} };
})();


// ===== RuangNiagaCagaran.gs =====
/**
 * SHAMS: Ruang Niaga fasa 4. Cagaran (sewaan dan utiliti): pemilik memuat naik resit rasmi, admin mengesahkan,
 * pemulangan dalam CAGARAN_PULANG_HARI (90) selepas tamat kontrak (peringatan admin hari ke-60 dan ke-80, tanda Lewat Pulang)
 * dan rampasan. Status: Belum Bayar, Menunggu Pengesahan, Diterima, Dipulangkan, Dirampas (Dibatalkan jika tawaran gugur).
 */

var RnCagaran = (function () {
  function S(v) { return Util.str(v); }

  function byId_(id) {
    var l = Db.find('Cagaran', function (r) { return S(r.ID_Cagaran) === id; });
    return l.length ? l[0] : null;
  }
  function semua_(idPer) { return Db.find('Cagaran', function (r) { return S(r.ID_Permohonan) === idPer; }); }

  function view_(c) {
    var st = S(c.Status);
    var akhirBayar = Util.toDate(c.Tarikh_Akhir_Bayar), akhirPulang = Util.toDate(c.Tarikh_Akhir_Pulang);
    return {
      id: S(c.ID_Cagaran), idPermohonan: S(c.ID_Permohonan), jenis: S(c.Jenis), jumlah: Number(c.Jumlah_RM) || 0, tarikhAkhirBayar: akhirBayar ? RnU.dk(akhirBayar) : '',
      noResit: S(c.No_Resit_Rasmi), tarikhResit: RnU.dk(c.Tarikh_Resit), adaResit: !!S(c.Fail_Resit), status: st, tarikhMuatNaik: RnU.dk(c.Tarikh_Muat_Naik),
      disahkanOleh: S(c.Disahkan_Oleh), tarikhPengesahan: RnU.dk(c.Tarikh_Pengesahan), tarikhAkhirPulang: akhirPulang ? RnU.dk(akhirPulang) : '',
      jumlahPulang: S(c.Jumlah_Pulang_RM), tarikhPulang: RnU.dk(c.Tarikh_Pulang), sebabPotongan: S(c.Sebab_Potongan), catatan: S(c.Catatan),
      lewatBayar: st === 'Belum Bayar' && !!akhirBayar && Util.daysBetween(new Date(), akhirBayar) < 0,
      lewatPulang: st === 'Diterima' && !!akhirPulang && Util.daysBetween(new Date(), akhirPulang) < 0
    };
  }

  function senarai_(idPer) { return semua_(idPer).map(view_); }

  function munasabah_(r) { return ['Ditawarkan', 'Diterima', 'Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) >= 0; }

  function muatNaik_(ctx, p) {
    var c = byId_(S(p.id));
    if (!c) throw appError_('RN_TIDAK_DITEMUI');
    var r = RnU.perById(S(c.ID_Permohonan));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    if (!munasabah_(r) || ['Belum Bayar', 'Menunggu Pengesahan'].indexOf(S(c.Status)) < 0) throw appError_('RN_CAGARAN_STATUS');
    var e = {};
    var noResit = S(p.noResit).replace(/\s+/g, ' ');
    if (!/^[A-Za-z0-9\-\/. ()]{3,60}$/.test(noResit)) e.noResit = 'No. resit rasmi 3 hingga 60 aksara / Official receipt no. 3 to 60 characters';
    var tarikh = S(p.tarikhResit);
    if (!RnU.isDate(tarikh) || Util.daysBetween(new Date(), Util.toDate(tarikh)) > 0) e.tarikhResit = 'Tarikh tidak sah atau akan datang / Invalid or future date';
    var v = null;
    try { v = Files.validate(p.fail, ['pdf', 'jpg', 'jpeg', 'png']); } catch (err) { e.fail = 'Muat naik resit (PDF/JPG/PNG) / Upload the receipt'; }
    if (Object.keys(e).length) throw appError_('RN_CAGARAN_TIDAK_SAH', { medan: e });
    var url = Files.save('FLD_RESIT_SEWA', 'RESIT_CAGARAN_' + S(c.ID_Cagaran) + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), v);
    Db.withLock(function () {
      var cur = byId_(S(c.ID_Cagaran));
      if (['Belum Bayar', 'Menunggu Pengesahan'].indexOf(S(cur.Status)) < 0) throw appError_('RN_CAGARAN_STATUS');
      Db.update('Cagaran', cur._row, {
        No_Resit_Rasmi: noResit, Tarikh_Resit: Util.toDate(tarikh), Fail_Resit: url, Tarikh_Muat_Naik: new Date(), Status: 'Menunggu Pengesahan', Catatan: ''
      });
      Audit.log(ctx, 'MUAT_NAIK_RESIT_CAGARAN', 'Ruang Niaga', S(c.ID_Cagaran), S(cur.Status), 'Menunggu Pengesahan', noResit);
    });
    RnU.melAdmin('Resit cagaran menunggu pengesahan', 'Deposit receipt awaiting verification',
      ['Pemohon ' + S(r.ID_Permohonan) + ' memuat naik resit cagaran ' + S(c.Jenis) + ' (RM ' + S(c.Jumlah_RM) + ', resit ' + noResit + '). Sila sahkan dalam SHAMS.'],
      ['Applicant ' + S(r.ID_Permohonan) + ' uploaded a deposit receipt. Please verify it in SHAMS.']);
    return { id: S(r.ID_Permohonan), cagaran: senarai_(S(r.ID_Permohonan)) };
  }

  /** Muat turun resit: pemilik/ahli (pelajar) atau admin (diaudit). */
  function failResit_(ctx, p) {
    var c = byId_(S(p.id));
    if (!c || !S(c.Fail_Resit)) throw appError_('RN_DOK_TIDAK_DITEMUI');
    var r = RnU.perById(S(c.ID_Permohonan));
    if (!r || !RnU.akses(ctx, r)) throw appError_('RN_DOK_TIDAK_DITEMUI');
    return Files.read(S(c.Fail_Resit));
  }
  function adminFailResit_(ctx, p) {
    RnU.requireViewer(ctx);
    var c = byId_(S(p.id));
    if (!c || !S(c.Fail_Resit)) throw appError_('RN_DOK_TIDAK_DITEMUI');
    Audit.log(ctx, 'PAPAR_RESIT_CAGARAN', 'Ruang Niaga', S(c.ID_Cagaran), '', S(c.No_Resit_Rasmi), '');
    return Files.read(S(c.Fail_Resit));
  }

  function sahkan_(ctx, p) {
    RnU.requireDecider(ctx);
    var idPer = '';
    Db.withLock(function () {
      var c = byId_(S(p.id));
      if (!c) throw appError_('RN_TIDAK_DITEMUI');
      if (S(c.Status) !== 'Menunggu Pengesahan') throw appError_('RN_CAGARAN_STATUS');
      idPer = S(c.ID_Permohonan);
      Db.update('Cagaran', c._row, { Status: 'Diterima', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: new Date() });
      Audit.log(ctx, 'SAHKAN_CAGARAN', 'Ruang Niaga', S(c.ID_Cagaran), 'Menunggu Pengesahan', 'Diterima', S(c.Jenis) + ' RM ' + S(c.Jumlah_RM) + ' | resit ' + S(c.No_Resit_Rasmi));
    });
    var r = RnU.perById(idPer);
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Cagaran disahkan', 'Deposit verified',
      ['Cagaran anda bagi ' + idPer + ' telah disahkan oleh UTMXCITE.'], ['Your deposit for ' + idPer + ' has been verified by UTMXCITE.']);
    var akt = RnPerjanjian.cubaAktif(ctx, idPer);
    var out = RnPer.adminButiran(ctx, { id: idPer });
    out.aktivasi = akt;
    return out;
  }

  function kembalikan_(ctx, p) {
    RnU.requireDecider(ctx);
    var cat = S(p.catatan).substr(0, 300);
    if (!cat) throw appError_('RN_CATATAN_WAJIB');
    var idPer = '';
    Db.withLock(function () {
      var c = byId_(S(p.id));
      if (!c) throw appError_('RN_TIDAK_DITEMUI');
      if (S(c.Status) !== 'Menunggu Pengesahan') throw appError_('RN_CAGARAN_STATUS');
      idPer = S(c.ID_Permohonan);
      Db.update('Cagaran', c._row, { Status: 'Belum Bayar', Catatan: cat });
      Audit.log(ctx, 'KEMBALIKAN_CAGARAN', 'Ruang Niaga', S(c.ID_Cagaran), 'Menunggu Pengesahan', 'Belum Bayar', cat);
    });
    var r = RnU.perById(idPer);
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Resit cagaran dikembalikan', 'Deposit receipt returned',
      ['Resit cagaran anda bagi ' + idPer + ' dikembalikan. Catatan: ' + cat + '. Sila muat naik resit yang betul.'], ['Your deposit receipt for ' + idPer + ' was returned. Note: ' + cat]);
    return RnPer.adminButiran(ctx, { id: idPer });
  }

  /** Tarikh tamat kontrak berkesan bagi permohonan (sewaan atau tawaran). */
  function tamatKontrak_(idPer) {
    var r = RnU.perById(idPer);
    var sew = r && S(r.ID_Sewaan) ? RnU.sewaanById(S(r.ID_Sewaan)) : null;
    if (sew) return Util.toDate(sew.Tarikh_Tamat_Sebenar) || Util.toDate(sew.Tarikh_Tamat);
    var t = RnU.tawaranById(idPer);
    return t ? Util.toDate(t.Tarikh_Tamat) : null;
  }

  function pulang_(ctx, p) {
    RnU.requireDecider(ctx);
    var idPer = '';
    var e = {};
    Db.withLock(function () {
      var c = byId_(S(p.id));
      if (!c) throw appError_('RN_TIDAK_DITEMUI');
      if (S(c.Status) !== 'Diterima') throw appError_('RN_CAGARAN_STATUS');
      idPer = S(c.ID_Permohonan);
      var r = RnU.perById(idPer);
      var sew = S(r.ID_Sewaan) ? RnU.sewaanById(S(r.ID_Sewaan)) : null;
      var tamat = tamatKontrak_(idPer);
      var gugur = ['Dibatalkan', 'Tawaran Luput', 'Ditolak Pemohon', 'Tamat'].indexOf(S(r.Status)) >= 0;
      if (!(gugur || (sew && S(sew.Status) === 'Tamat') || (tamat && Util.daysBetween(new Date(), tamat) <= 0))) throw appError_('RN_CAGARAN_BELUM_TAMAT');
      var jumlah = S(p.jumlah) === '' ? Number(c.Jumlah_RM) : Util.parseRm(p.jumlah);
      if (jumlah === null || jumlah > Number(c.Jumlah_RM)) e.jumlah = 'Jumlah tidak sah (tidak melebihi RM ' + S(c.Jumlah_RM) + ') / Invalid amount';
      var tarikh = S(p.tarikh) || RnU.dk(new Date());
      if (!RnU.isDate(tarikh) || Util.daysBetween(new Date(), Util.toDate(tarikh)) > 0) e.tarikh = 'Tarikh tidak sah atau akan datang / Invalid or future date';
      var sebab = S(p.sebab).substr(0, 300);
      if (!e.jumlah && jumlah < Number(c.Jumlah_RM) && !sebab) e.sebab = 'Sebab potongan wajib / Reason for deduction required';
      if (Object.keys(e).length) throw appError_('RN_CAGARAN_TIDAK_SAH', { medan: e });
      Db.update('Cagaran', c._row, { Status: 'Dipulangkan', Jumlah_Pulang_RM: jumlah, Tarikh_Pulang: Util.toDate(tarikh), Sebab_Potongan: sebab });
      Audit.log(ctx, 'PULANG_CAGARAN', 'Ruang Niaga', S(c.ID_Cagaran), 'Diterima', 'Dipulangkan', 'RM ' + jumlah + (sebab ? ' | ' + sebab : ''));
    });
    var r2 = RnU.perById(idPer);
    RnU.mel(RnU.emelOf(Util.normMatric(r2.No_Matrik)), 'Cagaran dipulangkan', 'Deposit returned',
      ['Cagaran anda bagi ' + idPer + ' telah direkodkan sebagai dipulangkan.'], ['Your deposit for ' + idPer + ' has been recorded as returned.']);
    return RnPer.adminButiran(ctx, { id: idPer });
  }

  function rampas_(ctx, p) {
    RnU.requireDecider(ctx);
    var sebab = S(p.sebab).substr(0, 300);
    if (!sebab) throw appError_('RN_CATATAN_WAJIB');
    var idPer = '';
    Db.withLock(function () {
      var c = byId_(S(p.id));
      if (!c) throw appError_('RN_TIDAK_DITEMUI');
      if (S(c.Status) !== 'Diterima') throw appError_('RN_CAGARAN_STATUS');
      idPer = S(c.ID_Permohonan);
      Db.update('Cagaran', c._row, { Status: 'Dirampas', Jumlah_Pulang_RM: 0, Tarikh_Pulang: RnU.today(), Sebab_Potongan: sebab });
      Audit.log(ctx, 'RAMPAS_CAGARAN', 'Ruang Niaga', S(c.ID_Cagaran), 'Diterima', 'Dirampas', sebab);
    });
    return RnPer.adminButiran(ctx, { id: idPer });
  }

  /** Tetapkan tarikh akhir pulang (tamat kontrak + CAGARAN_PULANG_HARI) bagi cagaran yang diterima. Dipanggil dalam kunci. */
  function tetapAkhirPulang_(idPer, tamat) {
    var akhir = RnU.tambahHari(tamat, Cfg.num('CAGARAN_PULANG_HARI', 90));
    semua_(idPer).forEach(function (c) {
      if (['Diterima', 'Menunggu Pengesahan', 'Belum Bayar'].indexOf(S(c.Status)) >= 0) Db.update('Cagaran', c._row, { Tarikh_Akhir_Pulang: akhir });
    });
  }

  function jobHarian_() {
    var hasil = { peringatanBayar: 0, lewatBayar: 0, peringatanPulang: 0, lewatPulang: 0 };
    var log = RnU.peringatan();
    var sebelum = Cfg.num('CAGARAN_PERINGATAN_SEBELUM_HARI', 3);
    var ambangPulang = RnTawaran.ambang('CAGARAN_PERINGATAN_HARI');
    Db.rows('Cagaran').forEach(function (c) {
      var idC = S(c.ID_Cagaran), idPer = S(c.ID_Permohonan);
      var r = RnU.perById(idPer);
      if (!r) return;
      var st = S(c.Status);
      if (st === 'Belum Bayar' && munasabah_(r) && c.Tarikh_Akhir_Bayar) {
        var baki = Util.daysBetween(new Date(), c.Tarikh_Akhir_Bayar);
        if (baki >= 0 && baki <= sebelum && !log.ada('RN_CAGARAN_SEBELUM_' + idC)) {
          log.tambah('RN_CAGARAN_SEBELUM_' + idC, RnU.emelOf(Util.normMatric(r.No_Matrik)), idPer, baki + ' hari');
          RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Peringatan: bayar cagaran', 'Reminder: pay your deposit',
            ['Cagaran ' + S(c.Jenis) + ' (RM ' + S(c.Jumlah_RM) + ') bagi ' + idPer + ' perlu dibayar selewat-lewatnya ' + Util.fmtTarikhBM(c.Tarikh_Akhir_Bayar) + '. Muat naik resit rasmi dalam SHAMS.'],
            ['Your deposit (RM ' + S(c.Jumlah_RM) + ') for ' + idPer + ' is due by ' + RnU.dk(c.Tarikh_Akhir_Bayar) + '. Upload the official receipt in SHAMS.']);
          hasil.peringatanBayar++;
        } else if (baki < 0 && !log.ada('RN_CAGARAN_LEWAT_' + idC)) {
          log.tambah('RN_CAGARAN_LEWAT_' + idC, '-', idPer, 'lewat');
          RnU.melAdmin('Cagaran lewat dibayar', 'Deposit overdue',
            ['Cagaran ' + S(c.Jenis) + ' bagi ' + idPer + ' belum dibayar selepas ' + Util.fmtTarikhBM(c.Tarikh_Akhir_Bayar) + '. Sila putuskan tindakan (tiada pembatalan automatik).'],
            ['The deposit for ' + idPer + ' is overdue. Please decide on action (no automatic cancellation).']);
          hasil.lewatBayar++;
        }
      }
      if (st === 'Diterima' && c.Tarikh_Akhir_Pulang) {
        var tamat = tamatKontrak_(idPer);
        if (!tamat) return;
        var hari = Util.daysBetween(tamat, new Date());
        var maksPulang = Cfg.num('CAGARAN_PULANG_HARI', 90);
        if (hari >= 0 && hari <= maksPulang) {
          hasil.peringatanPulang += RnTawaran.peringatanBertingkat(log, 'RN_CAGARAN_PULANG_H', idC, hari, ambangPulang, function (a) {
            RnU.melAdmin('Peringatan: pulangkan cagaran', 'Reminder: return the deposit',
              ['Cagaran ' + S(c.Jenis) + ' bagi ' + idPer + ' (RM ' + S(c.Jumlah_RM) + ') perlu dipulangkan sebelum ' + Util.fmtTarikhBM(c.Tarikh_Akhir_Pulang) + ' (hari ke-' + a + ' selepas tamat kontrak).'],
              ['The deposit for ' + idPer + ' must be returned before ' + RnU.dk(c.Tarikh_Akhir_Pulang) + '.']);
          });
        } else if (hari > maksPulang && !log.ada('RN_CAGARAN_LEWATPULANG_' + idC)) {
          log.tambah('RN_CAGARAN_LEWATPULANG_' + idC, '-', idPer, 'lewat pulang');
          RnU.melAdmin('Cagaran lewat dipulangkan', 'Deposit return overdue',
            ['Cagaran ' + S(c.Jenis) + ' bagi ' + idPer + ' melepasi tarikh akhir pulang (' + Util.fmtTarikhBM(c.Tarikh_Akhir_Pulang) + ').'], ['The deposit for ' + idPer + ' is past its return deadline.']);
          hasil.lewatPulang++;
        }
      }
    });
    return hasil;
  }

  return {
    byId: byId_, semua: semua_, view: view_, senarai: senarai_, muatNaik: muatNaik_, failResit: failResit_, adminFailResit: adminFailResit_, sahkan: sahkan_,
    kembalikan: kembalikan_, pulang: pulang_, rampas: rampas_, tetapAkhirPulang: tetapAkhirPulang_, tamatKontrak: tamatKontrak_, jobHarian: jobHarian_
  };
})();


// ===== RuangNiagaDokumen.gs =====
/**
 * SHAMS: Ruang Niaga. Dokumen sewaan (tab Dokumen_Sewaan): surat tawaran (versi), rekod penerimaan, perjanjian,
 * salinan bertandatangan, notis dan dokumen lain. Pemilik dan semua ahli pasukan SSU boleh melihat dan memuat turun
 * bila-bila masa melalui pelayan (akses disemak pada setiap panggilan; tiada pautan Drive didedahkan).
 */

var RnDok = (function () {
  function S(v) { return Util.str(v); }

  function byId_(id) {
    var l = Db.find('Dokumen_Sewaan', function (r) { return S(r.ID_Dokumen) === id; });
    return l.length ? l[0] : null;
  }
  function semua_(idPer) {
    return Db.find('Dokumen_Sewaan', function (r) { return S(r.ID_Permohonan) === idPer; });
  }
  /** Versi seterusnya bagi jenis dokumen. */
  function versiSeterusnya_(idPer, jenis) {
    var v = 0;
    semua_(idPer).forEach(function (r) { if (S(r.Jenis) === jenis) v = Math.max(v, Number(r.Versi) || 0); });
    return v + 1;
  }
  /** Tambah baris dokumen. MESTI dalam kunci. Pulang ID. */
  function tambahLocked_(rec) {
    var id = Util.formatId('DOK', null, Db.nextSeqLocked('DOK'), 4);
    rec.ID_Dokumen = id;
    rec.Tarikh = rec.Tarikh || new Date();
    Db.append('Dokumen_Sewaan', rec);
    return id;
  }
  function kemas_(id, patch) {
    var d = byId_(id);
    if (d) Db.update('Dokumen_Sewaan', d._row, patch);
  }

  function view_(d) {
    var st = S(d.Status);
    return {
      id: S(d.ID_Dokumen), idPermohonan: S(d.ID_Permohonan), jenis: S(d.Jenis), versi: Number(d.Versi) || 1, tajuk: S(d.Tajuk),
      tarikh: RnU.dk(d.Tarikh), masa: d.Tarikh ? Util.fmtDate(Util.toDate(d.Tarikh), 'dd/MM/yyyy HH:mm') : '', status: st, kelihatan: Util.truthy(d.Kelihatan),
      catatan: S(d.Catatan), versiLama: st === 'Digantikan', dijanaOleh: S(d.Dijana_Oleh)
    };
  }

  /** Lampiran 1 (sijil SSM daripada lampiran SSU), dilampirkan secara automatik sebaik perjanjian dijana (status Perjanjian ke atas). */
  function lampiran1_(r) {
    if (['Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) < 0) return null;
    var ssu = RnU.ssuLulus(S(r.ID_Perniagaan));
    if (!ssu || !S(ssu.Fail_SSM)) return null;
    return {
      id: 'LAMP1:' + S(r.ID_Permohonan), idPermohonan: S(r.ID_Permohonan), jenis: 'Lampiran', versi: 1, tajuk: 'Lampiran 1: Perakuan Pendaftaran SSM',
      tarikh: '', masa: '', status: 'Lampiran', kelihatan: true, catatan: '', versiLama: false, dijanaOleh: ''
    };
  }

  /** Senarai dokumen bagi permohonan. admin=true termasuk pratonton. */
  function senarai_(r, admin) {
    var l = semua_(S(r.ID_Permohonan)).filter(function (d) { return admin || Util.truthy(d.Kelihatan); }).map(view_);
    l.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var l1 = lampiran1_(r);
    if (l1) l.push(l1);
    return l;
  }

  function bacaDoc_(d) {
    var f = Files.read(S(d.Fail));
    f.nama = S(d.Nama_Fail) || f.nama;
    return f;
  }

  /** Muat turun bagi pelajar (pemilik/ahli): akses disemak pada setiap panggilan. */
  function fail_(ctx, p) {
    var id = S(p.id);
    if (id.indexOf('LAMP1:') === 0) {
      var r1 = RnU.perById(id.substr(6));
      if (!r1 || !RnU.akses(ctx, r1) || !lampiran1_(r1)) throw appError_('RN_DOK_TIDAK_DITEMUI');
      var f = Files.read(S(RnU.ssuLulus(S(r1.ID_Perniagaan)).Fail_SSM));
      f.nama = 'Lampiran 1 - Perakuan Pendaftaran SSM ' + S(r1.ID_Permohonan) + '.' + (S(f.nama).split('.').pop() || 'pdf');
      return f;
    }
    var d = byId_(id);
    if (!d) throw appError_('RN_DOK_TIDAK_DITEMUI');
    var r = RnU.perById(S(d.ID_Permohonan));
    if (!r || !RnU.akses(ctx, r) || !Util.truthy(d.Kelihatan)) throw appError_('RN_DOK_TIDAK_DITEMUI');
    return bacaDoc_(d);
  }

  function adminFail_(ctx, p) {
    RnU.requireViewer(ctx);
    var id = S(p.id);
    if (id.indexOf('LAMP1:') === 0) {
      var r1 = RnU.perById(id.substr(6));
      var ssu = r1 ? RnU.ssuLulus(S(r1.ID_Perniagaan)) : null;
      if (!ssu || !S(ssu.Fail_SSM)) throw appError_('RN_DOK_TIDAK_DITEMUI');
      Audit.log(ctx, 'PAPAR_DOKUMEN_SEWAAN', 'Ruang Niaga', S(r1.ID_Permohonan), '', 'Lampiran 1', '');
      return Files.read(S(ssu.Fail_SSM));
    }
    var d = byId_(id);
    if (!d) throw appError_('RN_DOK_TIDAK_DITEMUI');
    Audit.log(ctx, 'PAPAR_DOKUMEN_SEWAAN', 'Ruang Niaga', S(d.ID_Permohonan), '', S(d.Jenis) + ' v' + S(d.Versi), S(d.ID_Dokumen));
    return bacaDoc_(d);
  }

  /** Admin memuat naik dokumen lain (PDF/JPG/PNG) yang kelihatan kepada pemilik dan ahli. */
  function muatNaikAdmin_(ctx, p) {
    RnU.requireDecider(ctx);
    var r = RnU.perById(S(p.idPermohonan));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var tajuk = S(p.tajuk).replace(/\s+/g, ' ').substr(0, 120);
    var e = {};
    if (!tajuk) e.tajuk = 'Wajib diisi / Required';
    var v = null;
    try { v = Files.validate(p.fail, ['pdf', 'jpg', 'jpeg', 'png']); } catch (err) { e.fail = 'Fail tidak sah (PDF/JPG/PNG) / Invalid file'; }
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    var stamp = Util.fmtDate(new Date(), 'yyyyMMddHHmm');
    var url = Files.save('FLD_LAMPIRAN_LOT', 'DOK_' + S(r.ID_Permohonan) + '_' + stamp, v);
    var id = Db.withLock(function () {
      var nid = tambahLocked_({
        ID_Permohonan: S(r.ID_Permohonan), ID_Sewaan: S(r.ID_Sewaan), Jenis: 'Lain', Versi: versiSeterusnya_(S(r.ID_Permohonan), 'Lain'), Tajuk: tajuk, Fail: url,
        Nama_Fail: tajuk + '.' + v.ext, Dijana_Oleh: ctx.email, Status: 'Aktif', Kelihatan: 'Ya'
      });
      Audit.log(ctx, 'MUAT_NAIK_DOKUMEN_SEWAAN', 'Ruang Niaga', S(r.ID_Permohonan), '', tajuk, nid);
      return nid;
    });
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Dokumen baharu dalam Ruang Niaga', 'New document in Business Premises',
      ['UTMXCITE telah menambah dokumen "' + tajuk + '" bagi permohonan ' + S(r.ID_Permohonan) + '. Sila lihat dalam SHAMS.'],
      ['UTMXCITE added the document "' + tajuk + '" for application ' + S(r.ID_Permohonan) + '. Please view it in SHAMS.']);
    return { id: id };
  }

  return {
    byId: byId_, semua: semua_, versiSeterusnya: versiSeterusnya_, tambahLocked: tambahLocked_, kemas: kemas_, view: view_, senarai: senarai_,
    fail: fail_, adminFail: adminFail_, muatNaikAdmin: muatNaikAdmin_
  };
})();


// ===== RuangNiagaLanjut.gs =====
/**
 * SHAMS: Ruang Niaga. Penghubung antara sub-modul: pendaftaran laluan RPC fasa 2 ke atas, butiran admin
 * yang menggabungkan data sub-modul, dan kerja harian. Rujukan sub-modul dibuat di dalam fungsi sahaja.
 */

var RnLanjut = (function () {
  function S(v) { return Util.str(v); }

  /** Laluan tindakan pelajar (juga tersedia sebagai rn.bp.* bagi admin). */
  function laluanPelajar(t) {
    t['butiran'] = function (c, p) { return butiranPelajar_(c, p); };
    t['dok.fail'] = function (c, p) { return RnDok.fail(c, p); };
    t['tawaran.otp'] = function (c, p) { return RnTawaran.otpMinta(c, p); };
    t['tawaran.jawab'] = function (c, p) { return RnTawaran.jawab(c, p); };
    t['cagaran.muatnaik'] = function (c, p) { return RnCagaran.muatNaik(c, p); };
    t['cagaran.fail'] = function (c, p) { return RnCagaran.failResit(c, p); };
    t['perjanjian.muatnaik'] = function (c, p) { return RnPerjanjian.muatNaik(c, p); };
    t['pekerja.simpan'] = function (c, p) { return RnPerjanjian.pekerjaSimpan(c, p); };
    t['pekerja.buang'] = function (c, p) { return RnPerjanjian.pekerjaBuang(c, p); };
    t['bil.bayar'] = function (c, p) { return RnSewa.bilBayar(c, p); };
    t['bil.fail'] = function (c, p) { return RnSewa.bilFail(c, p); };
  }

  /** Butiran permohonan bagi pemilik/ahli (ahli: baca sahaja). */
  function butiranPelajar_(ctx, p) {
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var akses = RnU.akses(ctx, r);
    if (!akses) throw appError_('RN_TIDAK_DITEMUI');
    if (typeof RnTawaran !== 'undefined') RnTawaran.semakLuput(S(r.ID_Permohonan));
    r = RnU.perById(S(r.ID_Permohonan));
    var lot = RnU.lotById(S(r.Kod_Lot));
    var out = {
      id: S(r.ID_Permohonan), akses: akses, bolehTindak: akses === 'pemilik', status: S(r.Status), ringkas: RnPer.ringkas(r),
      lot: lot ? RnPer.lotView(lot) : null, borang: RnPer.borangOf(r),
      tawaran: RnTawaran.untukPemohon(ctx, r), dokumen: RnDok.senarai(r, false),
      cagaran: RnCagaran.senarai(S(r.ID_Permohonan)), perjanjian: RnPerjanjian.ringkas(S(r.ID_Permohonan)), pekerja: RnPerjanjian.senaraiPekerja(S(r.ID_Permohonan)),
      bolehPekerja: ['Diterima', 'Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) >= 0, sewaan: RnSewa.untukPemohon(ctx, r)
    };
    return out;
  }

  /** Laluan admin: t[nama] = [fungsi peranan, fn]. */
  function laluanAdmin(t, viewer, decider) {
    t['admin.sesi.senarai'] = [viewer, function (c) { return RnNilai.sesiSenarai(c); }];
    t['admin.sesi.butiran'] = [viewer, function (c, p) { return RnNilai.sesiButiran(c, p); }];
    t['admin.sesi.simpan'] = [decider, function (c, p) { return RnNilai.sesiSimpan(c, p); }];
    t['admin.sesi.mula'] = [decider, function (c, p) { return RnNilai.sesiMula(c, p); }];
    t['admin.sesi.tutup'] = [decider, function (c, p) { return RnNilai.sesiTutup(c, p); }];
    t['admin.sesi.bukaSemula'] = [decider, function (c, p) { return RnNilai.sesiBukaSemula(c, p); }];
    t['admin.sesi.jemput'] = [decider, function (c, p) { return RnNilai.sesiJemput(c, p); }];
    t['admin.sesi.skor'] = [viewer, function (c, p) { return RnNilai.skorButiran(c, p); }];
    t['admin.sesi.skorBuka'] = [decider, function (c, p) { return RnNilai.skorBuka(c, p); }];
    t['admin.tawaran.dapat'] = [viewer, function (c, p) { return RnTawaran.dapat(c, p); }];
    t['admin.tawaran.simpan'] = [decider, function (c, p) { return RnTawaran.simpan(c, p); }];
    t['admin.tawaran.jana'] = [decider, function (c, p) { return RnTawaran.jana(c, p); }];
    t['admin.tawaran.hantar'] = [decider, function (c, p) { return RnTawaran.hantar(c, p); }];
    t['admin.tawaran.rekod'] = [decider, function (c, p) { return RnTawaran.rekodSemula(c, p); }];
    t['admin.salinan'] = [decider, function (c, p) { return RnTawaran.salinanFizikal(c, p); }];
    t['admin.dok.fail'] = [viewer, function (c, p) { return RnDok.adminFail(c, p); }];
    t['admin.dok.muatnaik'] = [decider, function (c, p) { return RnDok.muatNaikAdmin(c, p); }];
    t['admin.cagaran.sahkan'] = [decider, function (c, p) { return RnCagaran.sahkan(c, p); }];
    t['admin.cagaran.kembali'] = [decider, function (c, p) { return RnCagaran.kembalikan(c, p); }];
    t['admin.cagaran.pulang'] = [decider, function (c, p) { return RnCagaran.pulang(c, p); }];
    t['admin.cagaran.rampas'] = [decider, function (c, p) { return RnCagaran.rampas(c, p); }];
    t['admin.cagaran.fail'] = [viewer, function (c, p) { return RnCagaran.adminFailResit(c, p); }];
    t['admin.perjanjian.jana'] = [decider, function (c, p) { return RnPerjanjian.jana(c, p); }];
    t['admin.perjanjian.sahkan'] = [decider, function (c, p) { return RnPerjanjian.sahkan(c, p); }];
    t['admin.perjanjian.kembali'] = [decider, function (c, p) { return RnPerjanjian.kembalikan(c, p); }];
    t['admin.perjanjian.tarikh'] = [decider, function (c, p) { return RnPerjanjian.tetapTarikh(c, p); }];
    t['admin.pekerja.putus'] = [decider, function (c, p) { return RnPerjanjian.pekerjaPutus(c, p); }];
    t['admin.peralatan.senarai'] = [viewer, function (c, p) { return RnPerjanjian.peralatanSenarai(c, p); }];
    t['admin.peralatan.simpan'] = [decider, function (c, p) { return RnPerjanjian.peralatanSimpan(c, p); }];
    t['admin.peralatan.buang'] = [decider, function (c, p) { return RnPerjanjian.peralatanBuang(c, p); }];
    t['admin.sewaan.senarai'] = [viewer, function (c, p) { return RnSewa.adminSenarai(c, p); }];
    t['admin.sewaan.butiran'] = [viewer, function (c, p) { return RnSewa.adminButiran(c, p); }];
    t['admin.sewaan.tamat'] = [decider, function (c, p) { return RnSewa.tamat(c, p); }];
    t['admin.sewaan.perbaharui'] = [decider, function (c, p) { return RnSewa.perbaharui(c, p); }];
    t['admin.sewaan.sedia'] = [decider, function (c, p) { return RnSewa.daftarSedia(c, p); }];
    t['admin.bil.senarai'] = [viewer, function (c, p) { return RnSewa.bilSenarai(c, p); }];
    t['admin.bil.sahkan'] = [decider, function (c, p) { return RnSewa.bilSahkan(c, p); }];
    t['admin.bil.kembali'] = [decider, function (c, p) { return RnSewa.bilKembalikan(c, p); }];
    t['admin.bil.kecuali'] = [decider, function (c, p) { return RnSewa.bilKecuali(c, p); }];
    t['admin.bil.utiliti'] = [decider, function (c, p) { return RnSewa.bilUtiliti(c, p); }];
    t['admin.bil.fail'] = [viewer, function (c, p) { return RnSewa.adminBilFail(c, p); }];
    t['admin.notis.jana'] = [decider, function (c, p) { return RnSewa.notisJana(c, p); }];
    t['admin.dashboard'] = [viewer, function (c) { return RnSewa.dashboard(c); }];
  }

  /** Laluan lain: out[nama] = {auth, roles, matrik, fn}. Penilai: semakan keahlian sesi dibuat di pelayan. */
  function laluanLain(out) {
    out['rn.nilai.sesi'] = { auth: true, roles: ADMIN_ROLES, fn: function (c) { return RnNilai.nilaiSesi(c); } };
    out['rn.nilai.buka'] = { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return RnNilai.nilaiBuka(c, p); } };
    out['rn.nilai.simpan'] = { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return RnNilai.nilaiSimpan(c, p); } };
    out['rn.nilai.fail'] = { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return RnNilai.nilaiFail(c, p); } };
  }

  /** Tambah bahagian sub-modul pada butiran permohonan (admin). */
  function tambahButiran(ctx, r, out) {
    var id = S(r.ID_Permohonan);
    out.penilaian = RnNilai.ringkasPermohonan(id);
    var t = RnU.tawaranById(id);
    out.tawaran = t ? RnTawaran.view(t, RnTawaran.jadualOf(id)) : null;
    out.dokumen = RnDok.senarai(r, true);
    out.cagaran = RnCagaran.senarai(id);
    out.perjanjian = RnPerjanjian.ringkas(id);
    out.pekerja = RnPerjanjian.senaraiPekerja(id);
    out.peralatan = RnPerjanjian.peralatanLot(S(r.Kod_Lot));
  }

  function jobHarian() {
    var out = {};
    [['tawaran', function () { return RnTawaran.jobHarian(); }], ['cagaran', function () { return RnCagaran.jobHarian(); }],
      ['sewa', function () { return RnSewa.jobHarian(); }]].forEach(function (x) {
      try { out[x[0]] = x[1](); } catch (e) { console.error('Kerja RN ' + x[0] + ' gagal: ' + e); out[x[0]] = { ralat: String(e) }; }
    });
    return out;
  }

  return { laluanPelajar: laluanPelajar, laluanAdmin: laluanAdmin, laluanLain: laluanLain, tambahButiran: tambahButiran, jobHarian: jobHarian };
})();


// ===== RuangNiagaMsg.gs =====
/**
 * SHAMS: mesej pengguna dwibahasa modul Ruang Niaga. Kunci = kod ralat (dikenali oleh appError_ dalam Util.gs).
 */
var MSG_RN = {
  RN_BORANG_TIDAK_SAH: ['Maklumat tidak sah. Semak medan yang bertanda.', 'The details are invalid. Check the highlighted fields.'],
  RN_TIDAK_DITEMUI: ['Rekod tidak ditemui.', 'Record not found.'],
  RN_PERALIHAN_TIDAK_SAH: ['Tindakan ini tidak sah pada status semasa.', 'This action is not valid in the current status.'],
  RN_CATATAN_WAJIB: ['Catatan wajib diisi untuk tindakan ini.', 'A note is required for this action.'],
  RN_TEMPOH_TUTUP: ['Permohonan lot belum dibuka atau telah ditutup. Semak tempoh permohonan.', 'Lot applications are not open (or have closed). Check the application period.'],
  RN_PERLU_SSU: ['Anda perlu mempunyai SSU yang diluluskan untuk memohon lot.', 'You need an approved SSU to apply for a lot.'],
  RN_HANYA_PEMILIK: ['Hanya pemilik perniagaan boleh memohon atau bertindak. Ahli pasukan hanya boleh melihat dan memuat turun.', 'Only the business owner can apply or act. Team members can only view and download.'],
  RN_SSU_TAMAT: ['SSU anda telah tamat tempoh. Sila perbaharui SSU sebelum memohon lot baharu.', 'Your SSU has expired. Please renew it before applying for a new lot.'],
  RN_SUDAH_ADA_LOT: ['Anda atau ahli pasukan perniagaan anda sudah mempunyai permohonan atau sewaan lot yang aktif. Satu lot bagi satu pelajar.', 'You or a member of your business already has an active lot application or tenancy. One lot per student.'],
  RN_LOT_TIDAK_TERSEDIA: ['Lot ini tidak lagi dibuka atau tidak kosong.', 'This lot is no longer open or is not vacant.'],
  RN_LOT_TIDAK_KOSONG: ['Lot ini tidak kosong (sedang ditawarkan, disewa atau dalam penyelenggaraan).', 'This lot is not vacant (offered, rented or under maintenance).'],
  RN_LOT_STATUS_SISTEM: ['Status lot Dipohon dan Disewa diurus oleh sistem dan tidak boleh diubah secara manual.', 'The Reserved and Rented lot statuses are managed by the system.'],
  RN_SESI_TIDAK_DITEMUI: ['Sesi penilaian tidak ditemui.', 'Evaluation session not found.'],
  RN_SESI_TIDAK_BERJALAN: ['Sesi penilaian tidak sedang berjalan.', 'The evaluation session is not in progress.'],
  RN_SESI_DITUTUP: ['Sesi penilaian telah ditutup.', 'The evaluation session is closed.'],
  RN_SESI_BELUM_LENGKAP: ['Sesi belum lengkap: ada penilai yang belum menghantar skor. Sahkan untuk menutup juga.', 'The session is incomplete: some evaluators have not submitted. Confirm to close anyway.'],
  RN_BUKAN_PENILAI: ['Anda bukan penilai bagi sesi ini.', 'You are not an evaluator for this session.'],
  RN_SKOR_TIDAK_SAH: ['Skor tidak sah. Semak tahap dan markah.', 'Invalid score. Check the levels and marks.'],
  RN_SKOR_DIKUNCI: ['Skor anda telah dihantar dan dikunci. Minta admin membukanya semula jika perlu.', 'Your scores are submitted and locked. Ask an admin to reopen them if needed.'],
  RN_TAWARAN_TIDAK_SAH: ['Maklumat tawaran tidak sah. Semak medan yang bertanda.', 'The offer details are invalid. Check the highlighted fields.'],
  RN_TAWARAN_BELUM_JANA: ['Jana pratonton surat tawaran terkini dahulu sebelum menghantar.', 'Generate the latest offer letter preview before sending.'],
  RN_TAWARAN_TIDAK_BOLEH: ['Tawaran tidak boleh diubah atau dijawab pada status semasa.', 'The offer cannot be changed or answered in its current status.'],
  RN_TAWARAN_LUPUT: ['Tawaran ini telah luput.', 'This offer has expired.'],
  RN_DOK_TIDAK_DITEMUI: ['Dokumen tidak ditemui.', 'Document not found.'],
  RN_CAGARAN_TIDAK_SAH: ['Maklumat cagaran tidak sah. Semak medan yang bertanda.', 'The deposit details are invalid. Check the highlighted fields.'],
  RN_CAGARAN_STATUS: ['Tindakan ini tidak sah pada status cagaran semasa.', 'This action is not valid for the current deposit status.'],
  RN_CAGARAN_BELUM_TAMAT: ['Cagaran hanya boleh dipulangkan selepas sewaan ditamatkan atau kontrak tamat.', 'The deposit can only be returned after the tenancy has ended.'],
  RN_PERJANJIAN_STATUS: ['Tindakan ini tidak sah pada status perjanjian semasa.', 'This action is not valid for the current agreement status.'],
  RN_PERJANJIAN_SUDAH_SAH: ['Perjanjian telah disahkan dan tidak boleh dijana semula.', 'The agreement is already confirmed and cannot be regenerated.'],
  RN_SEWAAN_TIDAK_DITEMUI: ['Sewaan tidak ditemui.', 'Tenancy not found.'],
  RN_SEWAAN_STATUS: ['Tindakan ini tidak sah pada status sewaan semasa.', 'This action is not valid for the current tenancy status.'],
  RN_BIL_TIDAK_DITEMUI: ['Bil sewa tidak ditemui.', 'Rent bill not found.'],
  RN_BIL_STATUS: ['Tindakan ini tidak sah pada status bil semasa.', 'This action is not valid for the current bill status.'],
  RN_PEKERJA_TIDAK_SAH: ['Maklumat pekerja tidak sah. Semak medan yang bertanda.', 'The staff details are invalid. Check the highlighted fields.'],
  RN_SEDIA_TIDAK_SAH: ['Maklumat sewaan sedia ada tidak sah. Semak medan yang bertanda.', 'The existing tenancy details are invalid. Check the highlighted fields.'],
  RN_OTP_PERLU: ['Masukkan kod OTP yang dihantar ke emel pemohon.', 'Enter the OTP sent to the applicant\'s email.']
};


// ===== RuangNiagaNilai.gs =====
/**
 * SHAMS: Ruang Niaga fasa 2. Penilaian jawatankuasa.
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
        ['Sesi penilaian ' + id + ' (' + Util.fmtTarikhBM(s2.Tarikh) + ', ' + S(s2.Masa) + ', ' + S(s2.Tempat) + ') telah bermula. Sila log masuk SHAMS untuk menilai.'],
        ['Evaluation session ' + id + ' has started. Please sign in to SHAMS to evaluate.']);
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
      if (tahap === '' && markahRaw === '') { if (ulasan) baru[kod] = { tahap: '', markah: '', ulasan: ulasan }; return; }
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


// ===== RuangNiagaPerjanjian.gs =====
/**
 * SHAMS: Ruang Niaga fasa 4. Perjanjian penyewaan (templat Google Docs F&B / bukan F&B), salinan bertandatangan,
 * senarai pekerja penyewa (Lampiran 2), peralatan universiti per lot (Lampiran 3) dan pengaktifan sewaan.
 * Perjanjian dicetak, ditandatangani, salinan bertandatangan dimuat naik pemilik dan disahkan admin.
 * Sewaan aktif hanya selepas perjanjian disahkan DAN cagaran sewaan disahkan (atau tiada cagaran sewaan).
 */

var RnPerjanjian = (function () {
  function S(v) { return Util.str(v); }

  // ---------- Dokumen perjanjian ----------
  /** Dokumen perjanjian semasa (bukan Digantikan) atau null. */
  function semasa_(idPer) {
    var l = RnDok.semua(idPer).filter(function (d) { return S(d.Jenis) === 'Perjanjian' && S(d.Status) !== 'Digantikan'; });
    return l.length ? l[l.length - 1] : null;
  }
  function salinanTerkini_(idPer) {
    var l = RnDok.semua(idPer).filter(function (d) { return S(d.Jenis) === 'Perjanjian Bertandatangan' && S(d.Status) !== 'Digantikan'; });
    return l.length ? l[l.length - 1] : null;
  }

  function teksPekerja_(idPer) {
    var l = pekerjaDiluluskan_(idPer);
    return l.length ? l.map(function (x, i) { return (i + 1) + '. ' + x.nama + ', umur ' + x.umur + ', ' + (x.fakulti || '-') + ', ' + x.tugas; }).join('\n') : '(tiada pekerja didaftarkan)';
  }
  function teksPeralatan_(kodLot) {
    var l = peralatanLot_(kodLot);
    return l.length ? l.map(function (x, i) { return (i + 1) + '. ' + x.nama + ' - ' + x.bilangan; }).join('\n') : '(tiada peralatan Universiti)';
  }

  function dataPerjanjian_(r, t, tarikhPerjanjian, jadualOpt) {
    var k = RnTawaran.konteks(r);
    var id = S(r.ID_Permohonan);
    var jadual = jadualOpt || RnTawaran.jadualOf(id);
    var d = {
      no_rujukan: S(t.No_Rujukan), tarikh_perjanjian: Util.fmtTarikhBM(tarikhPerjanjian), tarikh_surat_setuju_terima: Util.fmtTarikhBM(t.Tarikh_Surat),
      id_permohonan: id, nama_syarikat: S(k.per.Nama_Perniagaan), no_ssm: S(k.ssu.No_SSM),
      no_pendaftaran_syarikat: S(k.ssu.No_SSM) || ('Dalam proses (' + S(k.per.No_Pendaftaran) + ')'),
      alamat_syarikat: RnTawaran.alamatPenyewa(k), nama_wakil: S(k.pel.Nama_Penuh), jawatan_wakil: 'Pemilik', no_matrik: k.m,
      no_telefon_syarikat: S(k.pel.No_Telefon), emel_syarikat: RnU.emelOf(k.m),
      kod_lot: S(k.lot.Kod_Lot), nama_lot: RnU.namaLot(k.lot), alamat_lot: RnU.alamatLot(k.lot), jenis_perniagaan: S(t.Jenis_Perniagaan),
      tarikh_mula: Util.fmtTarikhBM(t.Tarikh_Mula), tarikh_tamat: Util.fmtTarikhBM(t.Tarikh_Tamat), bil_bulan: String(Number(t.Bil_Bulan) || ''),
      tempoh_kontrak: Util.fmtTarikhBM(t.Tarikh_Mula) + ' hingga ' + Util.fmtTarikhBM(t.Tarikh_Tamat) + ' (' + (Number(t.Bil_Bulan) || '') + ' bulan)',
      jadual_sewa: RnTawaran.teksJadual(jadual), sewa_bulanan: RnU.rm(Number(t.Sewa_Bulanan_RM) || 0), hari_akhir_bayar: String(Cfg.num('TARIKH_AKHIR_SEWA_HARI', 7)),
      utiliti: S(t.Utiliti), cagaran_sewaan: Number(t.Cagaran_Sewaan_RM) > 0 ? RnU.rm(Number(t.Cagaran_Sewaan_RM)) : 'Tiada',
      cagaran_utiliti: Number(t.Cagaran_Utiliti_RM) > 0 ? RnU.rm(Number(t.Cagaran_Utiliti_RM)) : 'Tiada', waktu_operasi: S(t.Waktu_Operasi),
      akaun_bank: Cfg.get('AKAUN_BANK_UTM', ''), alamat_utmxcite: Cfg.get('ALAMAT_UTMXCITE', ''),
      penandatangan_utm_nama: Cfg.get('PERJANJIAN_PENANDATANGAN_NAMA', ''), penandatangan_utm_jawatan: Cfg.get('PERJANJIAN_PENANDATANGAN_JAWATAN', ''),
      saksi_utm_nama: Cfg.get('PERJANJIAN_SAKSI_UTM_NAMA', ''), saksi_utm_jawatan: Cfg.get('PERJANJIAN_SAKSI_UTM_JAWATAN', ''),
      wakil_syarikat_nama: S(k.pel.Nama_Penuh), wakil_syarikat_jawatan: 'Pemilik ' + S(k.per.Nama_Perniagaan),
      saksi_syarikat_nama: Cfg.get('PERJANJIAN_SAKSI_SYARIKAT_NAMA', ''), saksi_syarikat_jawatan: Cfg.get('PERJANJIAN_SAKSI_SYARIKAT_JAWATAN', ''),
      senarai_pekerja: teksPekerja_(id), senarai_peralatan: teksPeralatan_(S(r.Kod_Lot)),
      bil_pekerja: String(pekerjaDiluluskan_(id).length), bil_peralatan: String(peralatanLot_(S(r.Kod_Lot)).length)
    };
    return d;
  }

  function jana_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id);
    var r = RnU.perById(id);
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var t = RnU.tawaranById(id);
    if (['Diterima', 'Perjanjian'].indexOf(S(r.Status)) < 0 || !t || S(t.Status) !== 'Diterima') throw appError_('RN_PERJANJIAN_STATUS');
    var cur = semasa_(id);
    if (cur && S(cur.Status) === 'Disahkan') throw appError_('RN_PERJANJIAN_SUDAH_SAH');
    var lot = RnU.lotById(S(r.Kod_Lot));
    var kodTpl = RnU.isFnb(lot) ? 'TEMPLAT_PERJANJIAN_SEWA_FNB' : 'TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB';
    var tarikhP = S(p.tarikhPerjanjian) || RnU.dk(t.Tarikh_Surat);
    if (!RnU.isDate(tarikhP)) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { tarikhPerjanjian: 'Tarikh tidak sah / Invalid date' } });
    var data = dataPerjanjian_(r, t, Util.toDate(tarikhP));
    var versi = RnDok.versiSeterusnya(id, 'Perjanjian');
    var nama = 'Perjanjian Sewa ' + id + ' v' + versi;
    var res = DocTpl.jana(kodTpl, data, 'FLD_LAMPIRAN_LOT', nama); // lempar TEMPLAT_TIADA jika templat tiada
    var amaran = (res.amaran || []).slice();
    var ssu = RnU.ssuLulus(S(r.ID_Perniagaan));
    if (ssu && S(ssu.Status_SSM) !== 'YA') amaran.push('Pendaftaran SSM: ' + Ref.bm('STATUS_SSM', S(ssu.Status_SSM)) + '. Pastikan SSM disempurnakan (perjanjian memerlukan pendaftaran syarikat).');
    Db.withLock(function () {
      var cur2 = semasa_(id);
      if (cur2 && S(cur2.Status) === 'Disahkan') throw appError_('RN_PERJANJIAN_SUDAH_SAH');
      RnDok.semua(id).forEach(function (d) {
        if (['Perjanjian', 'Perjanjian Bertandatangan'].indexOf(S(d.Jenis)) >= 0 && S(d.Status) !== 'Digantikan') Db.update('Dokumen_Sewaan', d._row, { Status: 'Digantikan' });
      });
      RnDok.tambahLocked({
        ID_Permohonan: id, Jenis: 'Perjanjian', Versi: versi, Tajuk: 'Perjanjian Sewa', Fail: res.url, Nama_Fail: nama + '.pdf', Dijana_Oleh: ctx.email,
        Status: 'Menunggu salinan bertandatangan', Kelihatan: 'Ya', Catatan: amaran.join('; ')
      });
      Db.update('Permohonan_Lot', RnU.perById(id)._row, { Status: 'Perjanjian' });
      Audit.log(ctx, 'JANA_PERJANJIAN_SEWA', 'Ruang Niaga', id, S(r.Status), 'Perjanjian', 'v' + versi + ' | ' + kodTpl + (amaran.length ? ' | ' + amaran.join('; ') : ''));
    });
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Perjanjian sewa sedia untuk ditandatangani', 'Tenancy agreement ready for signing',
      ['Perjanjian sewa bagi ' + id + ' telah disediakan. Sila muat turun, cetak, tandatangani dan muat naik salinan bertandatangan dalam SHAMS.'],
      ['The tenancy agreement for ' + id + ' is ready. Please download, print, sign and upload the signed copy in SHAMS.']);
    var out = RnPer.adminButiran(ctx, { id: id });
    out.amaranPerjanjian = amaran;
    return out;
  }

  function muatNaik_(ctx, p) {
    var id = S(p.id);
    var r = RnU.perById(id);
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    var cur = semasa_(id);
    if (S(r.Status) !== 'Perjanjian' || !cur || ['Menunggu salinan bertandatangan', 'Dikembalikan'].indexOf(S(cur.Status)) < 0) throw appError_('RN_PERJANJIAN_STATUS');
    var v;
    try { v = Files.validate(p.fail, ['pdf', 'jpg', 'jpeg', 'png']); } catch (err) { throw appError_('RN_BORANG_TIDAK_SAH', { medan: { fail: 'Fail tidak sah (PDF/JPG/PNG) / Invalid file' } }); }
    var url = Files.save('FLD_LAMPIRAN_LOT', 'PERJANJIAN_TT_' + id + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), v);
    Db.withLock(function () {
      var c2 = semasa_(id);
      if (!c2 || ['Menunggu salinan bertandatangan', 'Dikembalikan'].indexOf(S(c2.Status)) < 0) throw appError_('RN_PERJANJIAN_STATUS');
      var versi = RnDok.versiSeterusnya(id, 'Perjanjian Bertandatangan');
      RnDok.tambahLocked({
        ID_Permohonan: id, Jenis: 'Perjanjian Bertandatangan', Versi: versi, Tajuk: 'Perjanjian Sewa (bertandatangan)', Fail: url,
        Nama_Fail: 'Perjanjian Sewa bertandatangan ' + id + ' v' + versi + '.' + v.ext, Dijana_Oleh: ctx.email, Status: 'Dimuat naik', Kelihatan: 'Ya'
      });
      Db.update('Dokumen_Sewaan', c2._row, { Status: 'Dimuat naik', Catatan: '' });
      Audit.log(ctx, 'MUAT_NAIK_PERJANJIAN_BERTANDATANGAN', 'Ruang Niaga', id, S(c2.Status), 'Dimuat naik', 'v' + versi);
    });
    RnU.melAdmin('Salinan perjanjian bertandatangan dimuat naik', 'Signed agreement uploaded',
      ['Pemohon ' + id + ' memuat naik salinan perjanjian bertandatangan. Sila sahkan dalam SHAMS.'], ['Applicant ' + id + ' uploaded the signed agreement. Please verify it in SHAMS.']);
    return { id: id };
  }

  function sahkan_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id);
    var e = {};
    var tm = S(p.tarikhMula), tt = S(p.tarikhTamat);
    if (tm && !RnU.isDate(tm)) e.tarikhMula = 'Tarikh tidak sah / Invalid date';
    if (tt && !RnU.isDate(tt)) e.tarikhTamat = 'Tarikh tidak sah / Invalid date';
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    Db.withLock(function () {
      var r = RnU.perById(id);
      if (!r) throw appError_('RN_TIDAK_DITEMUI');
      var cur = semasa_(id), sal = salinanTerkini_(id);
      if (S(r.Status) !== 'Perjanjian' || !cur || S(cur.Status) !== 'Dimuat naik' || !sal || S(sal.Status) !== 'Dimuat naik') throw appError_('RN_PERJANJIAN_STATUS');
      var t = RnU.tawaranById(id);
      var mula = tm || RnU.dk(t.Tarikh_Mula), tamat = tt || RnU.dk(t.Tarikh_Tamat);
      if (Util.daysBetween(Util.toDate(mula), Util.toDate(tamat)) <= 0) throw appError_('RN_BORANG_TIDAK_SAH', { medan: { tarikhTamat: 'Tarikh tamat mesti selepas tarikh mula / End date must be after start date' } });
      if (tm || tt) Db.update('Tawaran_Sewa', t._row, { Tarikh_Mula: Util.toDate(mula), Tarikh_Tamat: Util.toDate(tamat), Bil_Bulan: RnTawaran.bilBulan(mula, tamat) });
      Db.update('Dokumen_Sewaan', cur._row, { Status: 'Disahkan' });
      Db.update('Dokumen_Sewaan', sal._row, { Status: 'Disahkan' });
      Audit.log(ctx, 'SAHKAN_PERJANJIAN_SEWA', 'Ruang Niaga', id, 'Dimuat naik', 'Disahkan', mula + ' hingga ' + tamat);
    });
    var akt = cubaAktif_(ctx, id);
    var out = RnPer.adminButiran(ctx, { id: id });
    out.aktivasi = akt;
    return out;
  }

  function kembalikan_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id), cat = S(p.catatan).substr(0, 300);
    if (!cat) throw appError_('RN_CATATAN_WAJIB');
    Db.withLock(function () {
      var cur = semasa_(id), sal = salinanTerkini_(id);
      if (!cur || S(cur.Status) !== 'Dimuat naik' || !sal) throw appError_('RN_PERJANJIAN_STATUS');
      Db.update('Dokumen_Sewaan', cur._row, { Status: 'Dikembalikan', Catatan: cat });
      Db.update('Dokumen_Sewaan', sal._row, { Status: 'Dikembalikan', Catatan: cat });
      Audit.log(ctx, 'KEMBALIKAN_PERJANJIAN_SEWA', 'Ruang Niaga', id, 'Dimuat naik', 'Dikembalikan', cat);
    });
    var r = RnU.perById(id);
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Salinan perjanjian dikembalikan', 'Signed agreement returned',
      ['Salinan perjanjian bertandatangan bagi ' + id + ' dikembalikan. Catatan: ' + cat + '. Sila muat naik semula.'], ['The signed agreement for ' + id + ' was returned. Note: ' + cat]);
    return RnPer.adminButiran(ctx, { id: id });
  }

  /** Aktifkan sewaan jika kedua-dua syarat dipenuhi. Pulang {aktif, idSewaan, menunggu[]}. */
  function cubaAktif_(ctx, id) {
    var r = RnU.perById(id);
    var menunggu = [];
    if (!r) return { aktif: false, menunggu: ['Permohonan tidak ditemui'] };
    if (S(r.Status) === 'Sewaan Aktif') return { aktif: true, idSewaan: S(r.ID_Sewaan), menunggu: [] };
    var cur = semasa_(id);
    if (!cur || S(cur.Status) !== 'Disahkan') menunggu.push('Perjanjian bertandatangan belum disahkan');
    RnCagaran.semua(id).forEach(function (c) {
      if (S(c.Jenis) === 'Sewaan' && S(c.Status) !== 'Diterima') menunggu.push('Cagaran sewaan belum disahkan');
    });
    if (!menunggu.length && S(r.Status) !== 'Perjanjian') menunggu.push('Status permohonan bukan Perjanjian');
    if (menunggu.length) return { aktif: false, menunggu: menunggu };
    var idSewaan = RnSewa.aktifkan(ctx, id);
    return { aktif: true, idSewaan: idSewaan, menunggu: [] };
  }

  /** Admin menetapkan tarikh mula/tamat sebelum sewaan aktif. */
  function tetapTarikh_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id), mula = S(p.tarikhMula), tamat = S(p.tarikhTamat), e = {};
    if (!RnU.isDate(mula)) e.tarikhMula = 'Tarikh tidak sah / Invalid date';
    if (!RnU.isDate(tamat)) e.tarikhTamat = 'Tarikh tidak sah / Invalid date';
    else if (!e.tarikhMula && Util.daysBetween(Util.toDate(mula), Util.toDate(tamat)) <= 0) e.tarikhTamat = 'Tarikh tamat mesti selepas tarikh mula / End date must be after start date';
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    Db.withLock(function () {
      var r = RnU.perById(id), t = RnU.tawaranById(id);
      if (!r || !t) throw appError_('RN_TIDAK_DITEMUI');
      if (['Diterima', 'Perjanjian'].indexOf(S(r.Status)) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
      Db.update('Tawaran_Sewa', t._row, { Tarikh_Mula: Util.toDate(mula), Tarikh_Tamat: Util.toDate(tamat), Bil_Bulan: RnTawaran.bilBulan(mula, tamat) });
      Audit.log(ctx, 'TETAP_TARIKH_SEWAAN', 'Ruang Niaga', id, RnU.dk(t.Tarikh_Mula) + ' - ' + RnU.dk(t.Tarikh_Tamat), mula + ' - ' + tamat, '');
    });
    var out = RnPer.adminButiran(ctx, { id: id });
    return out;
  }

  // ---------- Pekerja penyewa (Lampiran 2) ----------
  function pekerjaView_(x) {
    return { id: S(x.ID_Pekerja), nama: S(x.Nama), umur: Number(x.Umur) || 0, fakulti: S(x.Fakulti), tugas: S(x.Tugas), pelajarUtm: Util.truthy(x.Pelajar_UTM), noMatrik: S(x.No_Matrik),
      status: S(x.Status), catatan: S(x.Catatan_Admin) };
  }
  function pekerjaSemua_(idPer) {
    return Db.find('Pekerja_Penyewa', function (x) { return S(x.ID_Permohonan) === idPer && S(x.Status) !== 'Dibuang'; });
  }
  function pekerjaDiluluskan_(idPer) { return pekerjaSemua_(idPer).filter(function (x) { return S(x.Status) === 'Diluluskan'; }).map(pekerjaView_); }
  function senaraiPekerja_(idPer) { return pekerjaSemua_(idPer).map(pekerjaView_); }

  function pekerjaSimpan_(ctx, p) {
    var id = S(p.idPermohonan);
    var r = RnU.perById(id);
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    if (['Diterima', 'Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
    var e = {}, bad = function (k, m) { e[k] = m || 'Wajib diisi / Required'; };
    var utm = S(p.pelajarUtm) === 'Ya';
    var m = Util.normMatric(p.noMatrik);
    var pel = null;
    if (utm) {
      pel = Util.isMatric(m) ? RnU.pelajar(m) : null;
      if (!pel) bad('noMatrik', 'No. Matrik pelajar UTM tidak ditemui / UTM student not found');
      else if (S(pel.Status_Pelajar) && S(pel.Status_Pelajar).toLowerCase() !== 'aktif') bad('noMatrik', 'Pelajar tidak aktif / Student is not active');
    }
    var nama = S(p.nama).replace(/\s+/g, ' ').toUpperCase().substr(0, 120);
    if (!nama && pel) nama = S(pel.Nama_Penuh).toUpperCase();
    if (nama.length < 3) bad('nama');
    var umur = S(p.umur);
    if (!/^\d{1,2}$/.test(umur) || parseInt(umur, 10) < 18 || parseInt(umur, 10) > 80) bad('umur', 'Umur 18 hingga 80 (pekerja bawah 18 tahun tidak dibenarkan) / Age 18 to 80');
    var tugas = S(p.tugas).substr(0, 120); if (!tugas) bad('tugas');
    var fakulti = S(p.fakulti).substr(0, 120) || (pel ? S(pel.Fakulti) : '');
    if (pekerjaSemua_(id).length >= 30) bad('nama', 'Maksimum 30 pekerja / Maximum 30 staff');
    if (Object.keys(e).length) throw appError_('RN_PEKERJA_TIDAK_SAH', { medan: e });
    var pid = Db.withLock(function () {
      var nid = Util.formatId('PKJ', null, Db.nextSeqLocked('PKJ'), 4);
      Db.append('Pekerja_Penyewa', {
        ID_Pekerja: nid, ID_Permohonan: id, ID_Sewaan: S(r.ID_Sewaan), ID_Perniagaan: S(r.ID_Perniagaan), Nama: nama, Umur: parseInt(umur, 10), Fakulti: fakulti, Tugas: tugas,
        Pelajar_UTM: utm ? 'Ya' : 'Tidak', No_Matrik: utm ? m : '', Status: utm ? 'Diluluskan' : 'Menunggu Kelulusan', Ditambah_Oleh: ctx.email, Tarikh: new Date()
      });
      Audit.log(ctx, 'TAMBAH_PEKERJA_PENYEWA', 'Ruang Niaga', nid, '', nama, id + (utm ? ' | pelajar UTM' : ' | pekerja luar UTM'));
      return nid;
    });
    if (!utm) {
      RnU.melAdmin('Pekerja luar UTM menunggu kelulusan', 'Non-UTM staff awaiting approval',
        ['Pemohon ' + id + ' mendaftar pekerja luar UTM (' + nama + '). Kelulusan admin diperlukan.'], ['Applicant ' + id + ' registered a non-UTM worker (' + nama + '). Admin approval required.']);
    }
    return { id: pid, pekerja: senaraiPekerja_(id) };
  }

  function pekerjaBuang_(ctx, p) {
    var x = Db.find('Pekerja_Penyewa', function (y) { return S(y.ID_Pekerja) === S(p.id); })[0];
    if (!x) throw appError_('RN_TIDAK_DITEMUI');
    var r = RnU.perById(S(x.ID_Permohonan));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    Db.withLock(function () {
      var cur = Db.find('Pekerja_Penyewa', function (y) { return S(y.ID_Pekerja) === S(p.id); })[0];
      Db.update('Pekerja_Penyewa', cur._row, { Status: 'Dibuang' });
      Audit.log(ctx, 'BUANG_PEKERJA_PENYEWA', 'Ruang Niaga', S(p.id), S(cur.Status), 'Dibuang', S(cur.Nama));
    });
    return { pekerja: senaraiPekerja_(S(x.ID_Permohonan)) };
  }

  function pekerjaPutus_(ctx, p) {
    RnU.requireDecider(ctx);
    var t = S(p.tindakan), cat = S(p.catatan).substr(0, 300);
    if (['lulus', 'tolak'].indexOf(t) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
    if (t === 'tolak' && !cat) throw appError_('RN_CATATAN_WAJIB');
    var idPer = '';
    Db.withLock(function () {
      var x = Db.find('Pekerja_Penyewa', function (y) { return S(y.ID_Pekerja) === S(p.id); })[0];
      if (!x) throw appError_('RN_TIDAK_DITEMUI');
      if (S(x.Status) !== 'Menunggu Kelulusan') throw appError_('RN_PERALIHAN_TIDAK_SAH');
      idPer = S(x.ID_Permohonan);
      Db.update('Pekerja_Penyewa', x._row, { Status: t === 'lulus' ? 'Diluluskan' : 'Ditolak', Catatan_Admin: cat });
      Audit.log(ctx, t === 'lulus' ? 'LULUS_PEKERJA_LUAR' : 'TOLAK_PEKERJA_LUAR', 'Ruang Niaga', S(x.ID_Pekerja), 'Menunggu Kelulusan', t === 'lulus' ? 'Diluluskan' : 'Ditolak', cat);
    });
    return RnPer.adminButiran(ctx, { id: idPer });
  }

  // ---------- Peralatan universiti per lot (Lampiran 3) ----------
  function peralatanLot_(kod) {
    return Db.find('Peralatan_Lot', function (x) { return S(x.Kod_Lot) === kod && Util.truthy(x.Aktif); })
      .map(function (x) { return { id: S(x.ID_Peralatan), kodLot: S(x.Kod_Lot), nama: S(x.Nama_Alat), bilangan: Number(x.Bilangan) || 0, catatan: S(x.Catatan) }; });
  }

  function peralatanSenarai_(ctx, p) {
    RnU.requireViewer(ctx);
    return { peralatan: peralatanLot_(S(p.kodLot)), bolehUbah: RnU.isDecider(ctx) };
  }

  function peralatanSimpan_(ctx, p) {
    RnU.requireDecider(ctx);
    var e = {};
    var kod = S(p.kodLot);
    if (!RnU.lotById(kod)) e.kodLot = 'Lot tidak ditemui / Lot not found';
    var nama = S(p.nama).replace(/\s+/g, ' ').substr(0, 120); if (!nama) e.nama = 'Wajib diisi / Required';
    var bil = S(p.bilangan);
    if (!/^\d{1,4}$/.test(bil) || parseInt(bil, 10) < 1) e.bilangan = 'Nombor bulat 1 atau lebih / Whole number 1 or more';
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    Db.withLock(function () {
      var cur = S(p.id) ? Db.find('Peralatan_Lot', function (x) { return S(x.ID_Peralatan) === S(p.id); })[0] : null;
      if (S(p.id) && !cur) throw appError_('RN_TIDAK_DITEMUI');
      var rec = { Kod_Lot: kod, Nama_Alat: nama, Bilangan: parseInt(bil, 10), Catatan: S(p.catatan).substr(0, 200), Aktif: 'Ya' };
      if (cur) Db.update('Peralatan_Lot', cur._row, rec);
      else { rec.ID_Peralatan = Util.formatId('PRL', null, Db.nextSeqLocked('PRL'), 4); Db.append('Peralatan_Lot', rec); }
      Audit.log(ctx, cur ? 'KEMAS_KINI_PERALATAN_LOT' : 'TAMBAH_PERALATAN_LOT', 'Ruang Niaga', kod, '', nama + ' x' + bil, '');
    });
    return { peralatan: peralatanLot_(kod) };
  }

  function peralatanBuang_(ctx, p) {
    RnU.requireDecider(ctx);
    var kod = '';
    Db.withLock(function () {
      var cur = Db.find('Peralatan_Lot', function (x) { return S(x.ID_Peralatan) === S(p.id); })[0];
      if (!cur) throw appError_('RN_TIDAK_DITEMUI');
      kod = S(cur.Kod_Lot);
      Db.update('Peralatan_Lot', cur._row, { Aktif: 'Tidak' });
      Audit.log(ctx, 'BUANG_PERALATAN_LOT', 'Ruang Niaga', kod, S(cur.Nama_Alat), '', '');
    });
    return { peralatan: peralatanLot_(kod) };
  }

  /** Dokumen perjanjian pembaharuan (templat Docs) apabila admin menyambung sewaan satu tahun. Dokumen jenis Lain, tanpa aliran tandatangan dalam sistem. */
  function janaPembaharuan_(ctx, idPer, lamaTamat, baruTamat) {
    var r = RnU.perById(idPer);
    var sew = r && S(r.ID_Sewaan) ? RnU.sewaanById(S(r.ID_Sewaan)) : null;
    if (!r || !sew) throw appError_('RN_SEWAAN_TIDAK_DITEMUI');
    var t = RnU.tawaranById(idPer);
    var cag = RnCagaran.semua(idPer);
    var jml = function (jenis) { var x = cag.filter(function (c) { return S(c.Jenis) === jenis && ['Diterima', 'Dipulangkan'].indexOf(S(c.Status)) >= 0; })[0]; return x ? Number(x.Jumlah_RM) : 0; };
    var asas = t ? Object.assign({}, t) : {
      No_Rujukan: S(sew.ID_Sewaan), Tarikh_Surat: sew.Tarikh_Mula, Jenis_Perniagaan: '', Sewa_Bulanan_RM: sew.Kadar_RM, Utiliti: '', Cagaran_Sewaan_RM: jml('Sewaan'),
      Cagaran_Utiliti_RM: jml('Utiliti'), Waktu_Operasi: ''
    };
    asas.Tarikh_Mula = RnU.tambahHari(lamaTamat, 1);
    asas.Tarikh_Tamat = baruTamat;
    asas.Bil_Bulan = 12;
    var lot = RnU.lotById(S(r.Kod_Lot));
    var kodTpl = RnU.isFnb(lot) ? 'TEMPLAT_PERJANJIAN_SEWA_FNB' : 'TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB';
    var data = dataPerjanjian_(r, asas, RnU.today(), RnTawaran.jadualOf(idPer, S(sew.ID_Sewaan)));
    var versi = RnDok.versiSeterusnya(idPer, 'Lain');
    var nama = 'Perjanjian Sewa (pembaharuan) ' + idPer + ' v' + versi;
    var res = DocTpl.jana(kodTpl, data, 'FLD_LAMPIRAN_LOT', nama);
    Db.withLock(function () {
      RnDok.tambahLocked({
        ID_Permohonan: idPer, ID_Sewaan: S(sew.ID_Sewaan), Jenis: 'Lain', Versi: versi, Tajuk: 'Perjanjian Sewa (pembaharuan)', Fail: res.url, Nama_Fail: nama + '.pdf',
        Dijana_Oleh: ctx.email, Status: 'Aktif', Kelihatan: 'Ya', Catatan: (res.amaran || []).join('; ')
      });
      Audit.log(ctx, 'JANA_PERJANJIAN_PEMBAHARUAN', 'Ruang Niaga', S(sew.ID_Sewaan), '', 'v' + versi, kodTpl);
    });
    return res;
  }

  /** Ringkasan perjanjian untuk paparan. */
  function ringkas_(idPer) {
    var cur = semasa_(idPer), sal = salinanTerkini_(idPer);
    return {
      ada: !!cur, status: cur ? S(cur.Status) : '', versi: cur ? Number(cur.Versi) : 0, idDokumen: cur ? S(cur.ID_Dokumen) : '', catatan: cur ? S(cur.Catatan) : '',
      salinan: sal ? { id: S(sal.ID_Dokumen), status: S(sal.Status), catatan: S(sal.Catatan) } : null
    };
  }

  return {
    semasa: semasa_, jana: jana_, muatNaik: muatNaik_, sahkan: sahkan_, kembalikan: kembalikan_, cubaAktif: cubaAktif_, tetapTarikh: tetapTarikh_,
    pekerjaSimpan: pekerjaSimpan_, pekerjaBuang: pekerjaBuang_, pekerjaPutus: pekerjaPutus_, senaraiPekerja: senaraiPekerja_,
    peralatanSenarai: peralatanSenarai_, peralatanSimpan: peralatanSimpan_, peralatanBuang: peralatanBuang_, peralatanLot: peralatanLot_, ringkas: ringkas_, dataPerjanjian: dataPerjanjian_, janaPembaharuan: janaPembaharuan_
  };
})();


// ===== RuangNiagaPermohonan.gs =====
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


// ===== RuangNiagaSewa.gs =====
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


// ===== RuangNiagaTawaran.gs =====
/**
 * SHAMS: Ruang Niaga fasa 3. Surat tawaran (Surat Setuju Terima), pratonton PDF, hantar, penerimaan dengan OTP,
 * rekod penerimaan, tawaran luput, peringatan dan salinan fizikal.
 *
 * Aliran: Diluluskan -> admin isi Tawaran_Sewa (+ Jadual_Sewa) -> jana pratonton (versi) -> hantar (Ditawarkan, lot Dipohon,
 * Cagaran dicipta) -> pemilik "Saya terima"/"Saya tolak" disahkan OTP (Diterima / Ditolak Pemohon) -> rekod penerimaan PDF.
 * Tiada jawapan dalam TAWARAN_TEMPOH_HARI (7) -> Tawaran Luput, lot kembali Kosong.
 */

var RnTawaran = (function () {
  function S(v) { return Util.str(v); }
  function wd_(d) { return RnU.dk(d); }

  function jadualOf_(id, idSewaan) {
    return Db.find('Jadual_Sewa', function (r) { return S(r.ID_Permohonan) === id && S(r.ID_Sewaan) === (idSewaan || ''); })
      .map(function (r) { return { dari: Number(r.Dari_Bulan) || 1, hingga: S(r.Hingga_Bulan) === '' ? '' : Number(r.Hingga_Bulan), kadar: Number(r.Kadar_RM) || 0 }; })
      .sort(function (a, b) { return a.dari - b.dari; });
  }

  /** Bil. bulan kontrak: bilangan bulan penuh terkecil yang meliputi mula hingga tamat. */
  function bilBulan_(mula, tamat) {
    var m = 0;
    while (m < 120 && Util.daysBetween(Util.addMonths(mula, m), tamat) >= 0) m++;
    return m;
  }

  function teksJadual_(jadual) {
    if (!jadual.length) return '';
    if (jadual.length === 1) return RnU.rm(jadual[0].kadar) + ' sebulan';
    return jadual.map(function (j) {
      var julat = j.hingga === '' ? ('Bulan ke-' + j.dari + ' dan ke atas') : (j.dari === j.hingga ? 'Bulan ke-' + j.dari : 'Bulan ke-' + j.dari + ' hingga ke-' + j.hingga);
      return julat + ': ' + RnU.rm(j.kadar);
    }).join('; ');
  }

  function konteks_(r) {
    var per = RnU.perniagaan(S(r.ID_Perniagaan)) || {};
    var ssu = RnU.ssuLulus(S(per.ID_Perniagaan)) || {};
    var lot = RnU.lotById(S(r.Kod_Lot)) || {};
    var m = Util.normMatric(r.No_Matrik);
    var pel = RnU.pelajar(m) || {};
    return { r: r, per: per, ssu: ssu, lot: lot, pel: pel, m: m };
  }

  function alamatPenyewa_(k) {
    return S(k.ssu.Alamat_Perniagaan) || S(k.per.Alamat) || S(k.pel.Alamat_Rumah);
  }

  /** Nilai lalai tawaran daripada permohonan, lot dan Tetapan. */
  function lalai_(k) {
    var lot = k.lot;
    var produk = RnU.split(k.ssu.Produk).map(function (c) { return Ref.bm('PRODUK', c); }).join(', ');
    var mula = RnU.dk(k.r.Tempoh_Mula), tamat = RnU.dk(k.r.Tempoh_Tamat);
    var kadar = S(lot.Kadar_Sewa_RM) === '' ? 0 : Number(lot.Kadar_Sewa_RM);
    return {
      noRujukan: '', tarikhSurat: wd_(new Date()), jenisPerniagaan: produk, tarikhMula: mula, tarikhTamat: tamat,
      utiliti: 'Tanggungjawab syarikat (Air & Elektrik)', cagaranSewaan: kadar, cagaranUtiliti: 0, waktuOperasi: '',
      penandatanganNama: Cfg.get('SURAT_PENANDATANGAN_NAMA', ''), penandatanganJawatan: Cfg.get('SURAT_PENANDATANGAN_JAWATAN', ''),
      jadual: [{ dari: 1, hingga: '', kadar: kadar }]
    };
  }

  function view_(t, jadual) {
    var luput = Util.toDate(t.Tarikh_Luput);
    var tarikhAkhirSalinan = '';
    if (t.Tarikh_Hantar) tarikhAkhirSalinan = RnU.dk(RnU.tambahHari(t.Tarikh_Hantar, Cfg.num('SALINAN_FIZIKAL_HARI', 14)));
    return {
      noRujukan: S(t.No_Rujukan), tarikhSurat: wd_(t.Tarikh_Surat), jenisPerniagaan: S(t.Jenis_Perniagaan), tarikhMula: wd_(t.Tarikh_Mula), tarikhTamat: wd_(t.Tarikh_Tamat),
      bilBulan: Number(t.Bil_Bulan) || 0, sewaBulanan: Number(t.Sewa_Bulanan_RM) || 0, utiliti: S(t.Utiliti), cagaranSewaan: Number(t.Cagaran_Sewaan_RM) || 0,
      cagaranUtiliti: Number(t.Cagaran_Utiliti_RM) || 0, waktuOperasi: S(t.Waktu_Operasi), penandatanganNama: S(t.Penandatangan_Nama),
      penandatanganJawatan: S(t.Penandatangan_Jawatan), versiSemasa: Number(t.Versi_Semasa) || 0, status: S(t.Status), tarikhHantar: wd_(t.Tarikh_Hantar),
      tarikhLuput: luput ? wd_(luput) : '', respons: S(t.Respons), tarikhResponsMasa: t.Tarikh_Respons ? Util.fmtDate(Util.toDate(t.Tarikh_Respons), 'dd/MM/yyyy HH:mm') : '',
      emelRespons: S(t.Emel_Respons), jadual: jadual,
      salinan: {
        tarikh: wd_(t.Salinan_Fizikal_Tarikh), penerima: S(t.Salinan_Fizikal_Penerima), tarikhAkhir: tarikhAkhirSalinan,
        lewat: !!(t.Tarikh_Hantar && !S(t.Salinan_Fizikal_Tarikh) && ['Diterima'].indexOf(S(t.Status)) >= 0 && tarikhAkhirSalinan && Util.daysBetween(new Date(), tarikhAkhirSalinan) < 0)
      }
    };
  }

  // ---------- Admin: isi tawaran ----------
  function dapat_(ctx, p) {
    RnU.requireViewer(ctx);
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var k = konteks_(r);
    var t = RnU.tawaranById(id);
    var out = {
      id: id, statusPermohonan: S(r.Status), ada: !!t,
      tawaran: t ? view_(t, jadualOf_(id)) : Object.assign({ status: '', versiSemasa: 0, bilBulan: 0 }, lalai_(k)),
      dokumen: RnDok.senarai(r, true).filter(function (d) { return d.jenis === 'Surat Tawaran'; }),
      boleh: {
        ubah: S(r.Status) === 'Diluluskan' && (!t || S(t.Status) === 'Draf') && RnU.isDecider(ctx),
        jana: S(r.Status) === 'Diluluskan' && !!t && S(t.Status) === 'Draf' && RnU.isDecider(ctx),
        hantar: S(r.Status) === 'Diluluskan' && !!t && S(t.Status) === 'Draf' && !!Number(t.Versi_Semasa) && RnU.isDecider(ctx)
      },
      alamatPenyewa: alamatPenyewa_(k), lot: { kod: S(k.lot.Kod_Lot), nama: RnU.namaLot(k.lot), alamat: RnU.alamatLot(k.lot), status: S(k.lot.Status_Lot) }
    };
    if (!out.tawaran.bilBulan && out.tawaran.tarikhMula && out.tawaran.tarikhTamat) out.tawaran.bilBulan = bilBulan_(out.tawaran.tarikhMula, out.tawaran.tarikhTamat);
    return out;
  }

  function semakJadual_(arr, e) {
    var out = [];
    arr = Array.isArray(arr) ? arr : [];
    if (!arr.length) { e.jadual = 'Sekurang-kurangnya satu peringkat sewa / At least one rent tier'; return out; }
    var prevHingga = 0;
    arr.forEach(function (x, i) {
      var dari = parseInt(x.dari, 10), hingga = S(x.hingga) === '' ? '' : parseInt(x.hingga, 10), kadar = Util.parseRm(x.kadar);
      if (isNaN(dari) || dari < 1 || kadar === null || (hingga !== '' && (isNaN(hingga) || hingga < dari))) { e.jadual = 'Jadual sewa tidak sah (bulan dan kadar RM) / Invalid rent schedule'; return; }
      if (dari !== prevHingga + 1) { e.jadual = 'Peringkat mesti bersambung tanpa jurang: bermula bulan 1 / Tiers must be contiguous starting at month 1'; return; }
      if (hingga === '' && i < arr.length - 1) { e.jadual = 'Hanya peringkat terakhir boleh terbuka (tiada "hingga") / Only the last tier may be open-ended'; return; }
      prevHingga = hingga === '' ? dari : hingga;
      out.push({ dari: dari, hingga: hingga, kadar: kadar });
    });
    return out;
  }

  function simpan_(ctx, p) {
    RnU.requireDecider(ctx);
    p = p || {};
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var cur = RnU.tawaranById(id);
    if (S(r.Status) !== 'Diluluskan' || (cur && S(cur.Status) !== 'Draf')) throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    var e = {}, bad = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var noRujukan = S(p.noRujukan).replace(/\s+/g, ' ').substr(0, 100);
    if (!noRujukan) bad('noRujukan');
    var tarikhSurat = S(p.tarikhSurat); if (!RnU.isDate(tarikhSurat)) bad('tarikhSurat', 'Tarikh tidak sah / Invalid date');
    var jenis = S(p.jenisPerniagaan).substr(0, 200); if (!jenis) bad('jenisPerniagaan');
    var mula = S(p.tarikhMula), tamat = S(p.tarikhTamat);
    if (!RnU.isDate(mula)) bad('tarikhMula', 'Tarikh tidak sah / Invalid date');
    if (!RnU.isDate(tamat)) bad('tarikhTamat', 'Tarikh tidak sah / Invalid date');
    else if (!e.tarikhMula && Util.daysBetween(Util.toDate(mula), Util.toDate(tamat)) <= 0) bad('tarikhTamat', 'Tarikh tamat mesti selepas tarikh mula / End date must be after start date');
    var utiliti = S(p.utiliti).substr(0, 200); if (!utiliti) bad('utiliti');
    var cs = S(p.cagaranSewaan) === '' ? 0 : Util.parseRm(p.cagaranSewaan);
    var cu = S(p.cagaranUtiliti) === '' ? 0 : Util.parseRm(p.cagaranUtiliti);
    if (cs === null) bad('cagaranSewaan', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    if (cu === null) bad('cagaranUtiliti', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    var waktu = S(p.waktuOperasi).substr(0, 100); if (!waktu) bad('waktuOperasi');
    var jadual = semakJadual_(p.jadual, e);
    var nama = S(p.penandatanganNama) || Cfg.get('SURAT_PENANDATANGAN_NAMA', '');
    var jawatan = S(p.penandatanganJawatan) || Cfg.get('SURAT_PENANDATANGAN_JAWATAN', '');
    if (!nama || !jawatan) bad('penandatanganNama', 'Isi nama dan jawatan penandatangan (atau tetapkan dalam Tetapan) / Signatory required');
    if (Object.keys(e).length) throw appError_('RN_TAWARAN_TIDAK_SAH', { medan: e });
    var rec = {
      ID_Permohonan: id, No_Rujukan: noRujukan, Tarikh_Surat: Util.toDate(tarikhSurat), Jenis_Perniagaan: jenis, Tarikh_Mula: Util.toDate(mula), Tarikh_Tamat: Util.toDate(tamat),
      Bil_Bulan: bilBulan_(mula, tamat), Sewa_Bulanan_RM: jadual[0].kadar, Utiliti: utiliti, Cagaran_Sewaan_RM: cs, Cagaran_Utiliti_RM: cu, Waktu_Operasi: waktu,
      Penandatangan_Nama: nama, Penandatangan_Jawatan: jawatan, Versi_Semasa: '', Status: 'Draf'
    };
    Db.withLock(function () {
      var c2 = RnU.tawaranById(id);
      if (c2) Db.update('Tawaran_Sewa', c2._row, rec); else Db.append('Tawaran_Sewa', rec);
      RnU.gantiBaris('Jadual_Sewa', function (x) { return S(x.ID_Permohonan) === id && S(x.ID_Sewaan) === ''; }, jadual.map(function (j) {
        return { ID_Permohonan: id, ID_Sewaan: '', Dari_Bulan: j.dari, Hingga_Bulan: j.hingga, Kadar_RM: j.kadar };
      }));
      Audit.log(ctx, 'SIMPAN_TAWARAN_SEWA', 'Ruang Niaga', id, c2 ? S(c2.No_Rujukan) : '', noRujukan, 'Pratonton perlu dijana semula');
    });
    return dapat_(ctx, { id: id });
  }

  // ---------- Kandungan surat ----------
  function dataSurat_(k, t, jadual) {
    var tempohHari = Cfg.num('TAWARAN_TEMPOH_HARI', 7);
    var hantar = t.Tarikh_Hantar ? RnU.tambahHari(t.Tarikh_Hantar, 0) : RnU.today();
    var luput = t.Tarikh_Luput ? Util.toDate(t.Tarikh_Luput) : RnU.tambahHari(hantar, tempohHari);
    var cs = Number(t.Cagaran_Sewaan_RM) || 0, cu = Number(t.Cagaran_Utiliti_RM) || 0;
    var bayarHari = Cfg.num('CAGARAN_BAYAR_HARI', 14);
    var salinanHari = Cfg.num('SALINAN_FIZIKAL_HARI', 14);
    var mula = RnU.dk(t.Tarikh_Mula), tamat = RnU.dk(t.Tarikh_Tamat);
    return {
      no_rujukan: S(t.No_Rujukan), tarikh_surat: Util.fmtTarikhBM(t.Tarikh_Surat), id_permohonan: S(k.r.ID_Permohonan),
      nama_perniagaan: S(k.per.Nama_Perniagaan), nama_wakil: S(k.pel.Nama_Penuh), no_matrik: k.m, no_telefon: S(k.pel.No_Telefon), alamat_penyewa: alamatPenyewa_(k),
      no_ssm: S(k.ssu.No_SSM), nama_lot: RnU.namaLot(k.lot), kod_lot: S(k.lot.Kod_Lot), alamat_lot: RnU.alamatLot(k.lot), jenis_perniagaan: S(t.Jenis_Perniagaan),
      tarikh_mula: Util.fmtTarikhBM(mula), tarikh_tamat: Util.fmtTarikhBM(tamat), bil_bulan: String(Number(t.Bil_Bulan) || ''),
      tempoh_kontrak: Util.fmtTarikhBM(mula) + ' hingga ' + Util.fmtTarikhBM(tamat) + ' (' + (Number(t.Bil_Bulan) || '') + ' bulan)',
      sewa_bulanan: RnU.rm(Number(t.Sewa_Bulanan_RM) || 0), jadual_sewa: teksJadual_(jadual), utiliti: S(t.Utiliti),
      cagaran_sewaan: cs > 0 ? RnU.rm(cs) : 'Tiada', cagaran_utiliti: cu > 0 ? RnU.rm(cu) : 'Tiada', waktu_operasi: S(t.Waktu_Operasi),
      tarikh_luput: Util.fmtTarikhBM(luput), tempoh_terima_hari: String(tempohHari), hari_bayar_cagaran: String(bayarHari),
      tarikh_akhir_cagaran: Util.fmtTarikhBM(RnU.tambahHari(hantar, bayarHari)), hari_salinan_fizikal: String(salinanHari),
      akaun_bank: Cfg.get('AKAUN_BANK_UTM', ''), penandatangan_nama: S(t.Penandatangan_Nama), penandatangan_jawatan: S(t.Penandatangan_Jawatan),
      alamat_utmxcite: Cfg.get('ALAMAT_UTMXCITE', ''), hari_tahun: ''
    };
  }

  /** Surat tawaran lalai (HTML, BM) berdasarkan Surat Setuju Terima UTMXCITE. */
  function htmlSurat_(d, tajuk) {
    var e = Pdf.esc;
    var p = function (t) { return '<p>' + t + '</p>'; };
    var row = function (a, b, c) { return '<tr><td style="width:6%">' + a + '</td><td style="width:28%">' + e(b) + '</td><td>' + e(c) + '</td></tr>'; };
    var cagUtil = d.cagaran_utiliti;
    var h = '';
    h += '<table class="nb"><tr><td>Ruj. Kami : ' + e(d.no_rujukan) + '</td><td class="r">Tarikh : ' + e(d.tarikh_surat) + '</td></tr></table>';
    h += '<h1>SURAT SETUJU TERIMA</h1>';
    h += '<p><b>' + e(d.nama_perniagaan) + '</b><br>' + e(d.alamat_penyewa) + '<br>(u.p: ' + e(d.nama_wakil) + (d.no_telefon ? ', Tel: ' + e(d.no_telefon) : '') + ')</p>';
    h += p('Saudara,');
    h += '<p><b>PENYEWAAN ' + e(d.alamat_lot).toUpperCase() + '</b></p>';
    h += p('Dengan hormatnya dimaklumkan bahawa pihak pengurusan Student Mall (UTMXCITE) bersetuju melantik pihak Saudara bagi tujuan Penyewaan ' + e(d.alamat_lot) + '.');
    h += p('2. Dengan penerimaan tawaran ini, pihak Saudara adalah dinasihatkan bahawa suatu ikatan kontrak terwujud antara pihak UTM dengan pihak Saudara. Surat Setuju Terima ini dan satu Dokumen Perjanjian yang akan ditandatangani selepas ini akan menjadi dokumen yang akan mengikat di antara pihak Saudara dan UTM dengan sah. Sebarang urusan ataupun tuntutan perlu berpandukan dokumen ini.');
    h += p('3. Butiran dan syarat yang ditawarkan adalah seperti berikut:');
    h += '<table class="nb">' +
      row('a.', 'Lokasi', ': ' + d.alamat_lot) + row('b.', 'Jenis Perniagaan', ': ' + d.jenis_perniagaan) + row('c.', 'Tempoh Kontrak', ': ' + d.tempoh_kontrak) +
      row('d.', 'Sewaan Bulanan', ': ' + d.jadual_sewa) + row('e.', 'Utiliti', ': ' + d.utiliti) + row('f.', 'Cagaran Sewaan', ': ' + d.cagaran_sewaan) +
      row('g.', 'Cagaran Utiliti', ': ' + cagUtil) + row('h.', 'Waktu Operasi', ': ' + d.waktu_operasi) + '</table>';
    h += p('4. Wang cagaran sewaan' + (cagUtil !== 'Tiada' ? ' dan cagaran utiliti' : '') + ' boleh dibayar secara deposit tunai atau kredit ke bank (&ldquo;interbank transfer&rdquo;) ke akaun bank rasmi Universiti iaitu ' + e(d.akaun_bank) + ' atau PayHub. Salinan ASAL resit akan dikeluarkan oleh Jabatan Bendahari UTM dan hendaklah dikemukakan sebagai bukti dan untuk simpanan pejabat ini. Kegagalan pihak Saudara untuk menjelaskan kesemua bayaran tersebut dalam masa ' + e(d.hari_bayar_cagaran) + ' hari dari tarikh surat ini dihantar (selewat-lewatnya ' + e(d.tarikh_akhir_cagaran) + ') akan menyebabkan pelantikan pihak Saudara dibatalkan.');
    h += p('5. UTM berhak merampas kesemua atau sebahagian wang cagaran sebagai ganti rugi kepada UTM oleh sebab kemungkiran atau pelanggaran mana-mana syarat dan peraturan yang ditetapkan UTM oleh pihak Saudara. Wang cagaran akan dikembalikan kepada pihak Saudara dalam masa sembilan puluh (90) hari selepas tamat tempoh kontrak tertakluk kepada penyempurnaan syarat dan peraturan kontrak oleh pihak Saudara.');
    h += p('6. Bagi tujuan pembayaran sewa bulanan, pihak Saudara dikehendaki membuat pembayaran melalui deposit tunai atau kredit ke bank (&ldquo;interbank transfer&rdquo;) ke akaun bank rasmi Universiti iaitu ' + e(d.akaun_bank) + '; atau PayHub UTM.');
    h += p('7. Kesemua transaksi pembayaran adalah dianggap sempurna dan selesai setelah Resit Rasmi dikeluarkan oleh Jabatan Bendahari UTM. Salinan resit hendaklah dimajukan kepada UTMXCITE, Jabatan Timbalan Naib Canselor (Hal Ehwal Pelajar dan Alumni) bagi tujuan bukti dan perekodan.');
    h += p('8. Tiada apa-apa urusniaga boleh dimulakan kecuali dan sehingga Saudara telah mengemukakan wang cagaran sewaan.');
    h += p('9. Pihak UTM juga berhak menamatkan penyewaan Saudara pada bila-bila masa sekiranya prestasi tidak memuaskan atau melanggar mana-mana syarat yang ditetapkan oleh Universiti dan juga pihak berkuasa.');
    h += p('10. Lain-lain syarat adalah sebagaimana yang akan dipersetujui seperti di dalam Syarat / Prosedur UTMXCITE dan akan dimuktamadkan melalui Dokumen Perjanjian yang akan disempurnakan.');
    h += p('11. Tawaran ini hendaklah diterima atau ditolak dalam sistem SHAMS (disahkan dengan kod OTP) selewat-lewatnya pada ' + e(d.tarikh_luput) + ' (' + e(d.tempoh_terima_hari) + ' hari dari tarikh surat ini dihantar). Kegagalan berbuat demikian akan menyebabkan tawaran ini terbatal secara automatik. Di samping itu, sila kembalikan dua (2) salinan surat ini, termasuk satu yang ASAL, yang telah ditandatangani oleh Saudara dan disaksikan dengan sempurnanya ke pejabat ini dalam masa ' + e(d.hari_salinan_fizikal) + ' hari dari tarikh surat ini dihantar, dan satu (1) salinan untuk simpanan Saudara.');
    h += p('Kerjasama yang diberikan amatlah kami hargai.');
    h += p('Sekian, terima kasih.');
    h += p('&ldquo;Malaysia Madani&rdquo;<br>&quot;Berkhidmat untuk Negara kerana Allah&quot;');
    h += '<p class="sig">Saya yang menjalankan amanah,</p><p><b>(' + e(d.penandatangan_nama) + ')</b><br>' + e(d.penandatangan_jawatan) + '<br>Universiti Teknologi Malaysia<br>b.p. Naib Canselor</p>';
    h += '<hr><p class="sm">Dengan ini yang bertandatangan di bawah ini mengaku penerimaan surat di atas dan salinannya telah disimpan serta memahami dan bersetuju untuk mematuhi syarat-syarat penyewaan sebagaimana dalam Surat Setuju Terima di atas.</p>';
    h += '<table class="nb sig"><tr><td>.......................................<br>Tandatangan Penyewa<br>Nama Penuh: ' + e(d.nama_wakil.toUpperCase()) + '<br>Tarikh:</td><td>.......................................<br>Tandatangan Saksi<br>Nama Penuh:<br>Tarikh:</td><td>.......................................<br>Cop Rasmi Syarikat</td></tr></table>';
    return Pdf.wrap(h, tajuk);
  }

  /** Jana PDF surat (templat Google Docs jika didaftar dan boleh dibuka; jika tidak, surat lalai). Pulang {url, amaran[]}. */
  function janaPdf_(data, nama) {
    var amaran = [];
    var tpl = Db.links().TEMPLAT_SURAT_TAWARAN;
    if (tpl && tpl.id) {
      try {
        var g = DocTpl.jana('TEMPLAT_SURAT_TAWARAN', data, 'FLD_LAMPIRAN_LOT', nama);
        return { url: g.url, amaran: g.amaran || [] };
      } catch (err) {
        amaran.push('Templat surat tawaran (Google Docs) tidak boleh dibuka; surat lalai digunakan.');
        console.error('Templat surat tawaran gagal: ' + err);
      }
    }
    var res = Pdf.dariHtml(htmlSurat_(data, nama), nama, 'FLD_LAMPIRAN_LOT');
    return { url: res.url, amaran: amaran };
  }

  function jana_(ctx, p) {
    RnU.requireDecider(ctx);
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var t = RnU.tawaranById(id);
    if (S(r.Status) !== 'Diluluskan' || !t || S(t.Status) !== 'Draf') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    var k = konteks_(r);
    var data = dataSurat_(k, t, jadualOf_(id));
    var versi = RnDok.versiSeterusnya(id, 'Surat Tawaran');
    var nama = 'Surat Tawaran ' + id + ' v' + versi;
    var res = janaPdf_(data, nama);
    Db.withLock(function () {
      var cur = RnU.tawaranById(id);
      if (!cur || S(cur.Status) !== 'Draf') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      RnDok.semua(id).forEach(function (d) {
        if (S(d.Jenis) === 'Surat Tawaran' && S(d.Status) === 'Pratonton') Db.update('Dokumen_Sewaan', d._row, { Status: 'Digantikan' });
      });
      RnDok.tambahLocked({
        ID_Permohonan: id, Jenis: 'Surat Tawaran', Versi: versi, Tajuk: 'Surat Tawaran', Fail: res.url, Nama_Fail: nama + '.pdf', Dijana_Oleh: ctx.email,
        Status: 'Pratonton', Kelihatan: 'Tidak', Catatan: res.amaran.join('; ')
      });
      Db.update('Tawaran_Sewa', cur._row, { Versi_Semasa: versi });
      Audit.log(ctx, 'JANA_PRATONTON_TAWARAN', 'Ruang Niaga', id, '', 'v' + versi, res.amaran.join('; '));
    });
    var out = dapat_(ctx, { id: id });
    out.amaran = res.amaran;
    return out;
  }

  function hantar_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id);
    var lot = null;
    var info = Db.withLock(function () {
      var r = RnU.perById(id);
      if (!r) throw appError_('RN_TIDAK_DITEMUI');
      var t = RnU.tawaranById(id);
      if (S(r.Status) !== 'Diluluskan' || !t || S(t.Status) !== 'Draf') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      if (!Number(t.Versi_Semasa)) throw appError_('RN_TAWARAN_BELUM_JANA');
      lot = RnU.lotById(S(r.Kod_Lot));
      if (!lot || S(lot.Status_Lot) !== 'Kosong') throw appError_('RN_LOT_TIDAK_KOSONG');
      var now = new Date();
      var hariTerima = Cfg.num('TAWARAN_TEMPOH_HARI', 7);
      var luput = RnU.tambahHari(now, hariTerima);
      var akhirBayar = RnU.tambahHari(now, Cfg.num('CAGARAN_BAYAR_HARI', 14));
      Db.update('Tawaran_Sewa', t._row, { Status: 'Dihantar', Tarikh_Hantar: now, Tarikh_Luput: luput });
      RnDok.semua(id).forEach(function (d) {
        if (S(d.Jenis) === 'Surat Tawaran' && Number(d.Versi) === Number(t.Versi_Semasa)) Db.update('Dokumen_Sewaan', d._row, { Status: 'Dihantar', Kelihatan: 'Ya', Tarikh: now });
      });
      Db.update('Permohonan_Lot', r._row, { Status: 'Ditawarkan' });
      RnU.setLot(S(r.Kod_Lot), 'Dipohon');
      [['Sewaan', Number(t.Cagaran_Sewaan_RM) || 0], ['Utiliti', Number(t.Cagaran_Utiliti_RM) || 0]].forEach(function (c) {
        if (c[1] <= 0) return;
        Db.append('Cagaran', {
          ID_Cagaran: Util.formatId('CGR', null, Db.nextSeqLocked('CGR'), 4), ID_Permohonan: id, ID_Perniagaan: S(r.ID_Perniagaan), Jenis: c[0], Jumlah_RM: c[1],
          Tarikh_Akhir_Bayar: akhirBayar, Status: 'Belum Bayar'
        });
      });
      Audit.log(ctx, 'HANTAR_TAWARAN_SEWA', 'Ruang Niaga', id, 'Diluluskan', 'Ditawarkan', S(t.No_Rujukan) + ' | luput ' + RnU.dk(luput));
      return { m: Util.normMatric(r.No_Matrik), luput: luput, akhirBayar: akhirBayar, nama: RnU.namaLot(lot) };
    });
    RnU.mel(RnU.emelOf(info.m), 'Surat tawaran sewa lot', 'Lot tenancy offer letter',
      ['Surat tawaran sewa ' + info.nama + ' (' + id + ') telah dihantar. Sila lihat dan muat turun surat dalam SHAMS, kemudian terima atau tolak tawaran dengan kod OTP selewat-lewatnya ' + Util.fmtTarikhBM(info.luput) + '. Bayaran cagaran hendaklah dijelaskan sebelum ' + Util.fmtTarikhBM(info.akhirBayar) + '.'],
      ['The tenancy offer letter for ' + info.nama + ' (' + id + ') has been sent. View and download it in SHAMS, then accept or decline with an OTP by ' + RnU.dk(info.luput) + '. The deposit must be paid by ' + RnU.dk(info.akhirBayar) + '.']);
    return dapat_(ctx, { id: id });
  }

  // ---------- Pemohon: lihat tawaran, OTP, jawab ----------
  function untukPemohon_(ctx, r) {
    var t = RnU.tawaranById(S(r.ID_Permohonan));
    if (!t || ['Dihantar', 'Diterima', 'Ditolak', 'Luput', 'Dibatalkan'].indexOf(S(t.Status)) < 0 || !t.Tarikh_Hantar) return null;
    var v = view_(t, jadualOf_(S(r.ID_Permohonan)));
    var luput = Util.toDate(t.Tarikh_Luput);
    var baki = luput ? Util.daysBetween(new Date(), luput) : null;
    var pemilik = RnU.akses(ctx, r) === 'pemilik';
    delete v.salinan.penerima;
    v.alamatLot = RnU.alamatLot(RnU.lotById(S(r.Kod_Lot)) || {});
    v.hariBaki = baki;
    v.bolehJawab = pemilik && S(t.Status) === 'Dihantar' && S(r.Status) === 'Ditawarkan' && baki !== null && baki >= 0;
    return v;
  }

  function emelPemohon_(r) { return RnU.emelOf(Util.normMatric(r.No_Matrik)); }

  function otpMinta_(ctx, p) {
    var id = S(p.id);
    var r = RnU.perById(id);
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    semakLuput_(id);
    var v = untukPemohon_(ctx, RnU.perById(id));
    if (!v || !v.bolehJawab) throw appError_(v && v.status === 'Luput' ? 'RN_TAWARAN_LUPUT' : 'RN_TAWARAN_TIDAK_BOLEH');
    var emel = emelPemohon_(r);
    if (!emel) throw appError_('EMEL_TIDAK_SAH');
    var res = Otp.issue('TERIMA_TAWARAN:' + id, emel, {
      subjectBm: 'Kod pengesahan jawapan tawaran sewa lot', subjectEn: 'Verification code for your lot offer response',
      bm: ['Kod pengesahan anda untuk menerima atau menolak tawaran sewa lot (' + id + ') ialah: {kod}', 'Kod ini sah selama ' + Cfg.num('OTP_TAMAT_MINIT', 5) + ' minit. Jangan kongsikannya dengan sesiapa.'],
      en: ['Your verification code to accept or decline the lot offer (' + id + ') is: {kod}', 'This code is valid for ' + Cfg.num('OTP_TAMAT_MINIT', 5) + ' minutes. Do not share it.']
    });
    res.emelTopeng = emel.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    return res;
  }

  function jawab_(ctx, p) {
    var id = S(p.id), jawapan = S(p.jawapan);
    if (['terima', 'tolak'].indexOf(jawapan) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
    var r0 = RnU.perById(id);
    if (!r0) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r0);
    semakLuput_(id);
    var v0 = untukPemohon_(ctx, RnU.perById(id));
    if (!v0 || !v0.bolehJawab) throw appError_(v0 && v0.status === 'Luput' ? 'RN_TAWARAN_LUPUT' : 'RN_TAWARAN_TIDAK_BOLEH');
    var emel = emelPemohon_(r0);
    if (!S(p.kod)) throw appError_('RN_OTP_PERLU');
    Otp.verify('TERIMA_TAWARAN:' + id, emel, p.kod);
    var now = new Date();
    var info = Db.withLock(function () {
      var r = RnU.perById(id), t = RnU.tawaranById(id);
      if (!r || !t || S(r.Status) !== 'Ditawarkan' || S(t.Status) !== 'Dihantar') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      var terima = jawapan === 'terima';
      Db.update('Tawaran_Sewa', t._row, { Status: terima ? 'Diterima' : 'Ditolak', Respons: terima ? 'Terima' : 'Tolak', Tarikh_Respons: now, Emel_Respons: emel });
      if (terima) Db.update('Permohonan_Lot', r._row, { Status: 'Diterima' });
      else {
        Db.update('Permohonan_Lot', r._row, { Status: 'Ditolak Pemohon', Tarikh_Keputusan: now });
        RnU.setLot(S(r.Kod_Lot), 'Kosong');
        Db.find('Cagaran', function (c) { return S(c.ID_Permohonan) === id && ['Belum Bayar', 'Menunggu Pengesahan'].indexOf(S(c.Status)) >= 0; })
          .forEach(function (c) { Db.update('Cagaran', c._row, { Status: 'Dibatalkan' }); });
      }
      Audit.log(ctx, terima ? 'TERIMA_TAWARAN_SEWA' : 'TOLAK_TAWARAN_SEWA', 'Ruang Niaga', id, 'Ditawarkan', terima ? 'Diterima' : 'Ditolak Pemohon',
        'Disahkan OTP ke ' + emel + (ctx.bagiPihak ? ' (admin bagi pihak pemohon)' : ''));
      return { nama: RnU.namaLot(RnU.lotById(S(r.Kod_Lot))), no: S(t.No_Rujukan) };
    });
    var amaran = [];
    try { janaRekod_(id, jawapan, now, emel, ctx); } catch (err) {
      console.error('Rekod penerimaan gagal: ' + err);
      amaran.push('Rekod penerimaan (PDF) gagal dijana; admin akan menjana semula.');
      Audit.log(ctx, 'REKOD_PENERIMAAN_GAGAL', 'Ruang Niaga', id, '', '', String(err && err.message ? err.message : err).substr(0, 300));
    }
    RnU.mel(emel, jawapan === 'terima' ? 'Tawaran sewa lot diterima' : 'Tawaran sewa lot ditolak', jawapan === 'terima' ? 'Lot offer accepted' : 'Lot offer declined',
      [jawapan === 'terima'
        ? 'Anda telah menerima tawaran sewa ' + info.nama + ' (' + id + ') pada ' + Util.fmtDate(now, 'dd/MM/yyyy HH:mm') + '. Sila bayar cagaran dan tunggu perjanjian sewa daripada UTMXCITE.'
        : 'Anda telah menolak tawaran sewa ' + info.nama + ' (' + id + ') pada ' + Util.fmtDate(now, 'dd/MM/yyyy HH:mm') + '.'],
      [jawapan === 'terima' ? 'You accepted the tenancy offer for ' + info.nama + ' (' + id + ').' : 'You declined the tenancy offer for ' + info.nama + ' (' + id + ').']);
    RnU.melAdmin(jawapan === 'terima' ? 'Tawaran sewa lot diterima' : 'Tawaran sewa lot ditolak pemohon', 'Lot offer ' + (jawapan === 'terima' ? 'accepted' : 'declined'),
      ['Pemohon ' + id + ' telah ' + (jawapan === 'terima' ? 'menerima' : 'menolak') + ' tawaran sewa ' + info.nama + '.'], ['Applicant ' + id + ' has ' + (jawapan === 'terima' ? 'accepted' : 'declined') + ' the offer.']);
    return { id: id, status: jawapan === 'terima' ? 'Diterima' : 'Ditolak Pemohon', amaran: amaran };
  }

  /** Jana Rekod Penerimaan (PDF) dan simpan dalam Dokumen_Sewaan. */
  function janaRekod_(id, jawapan, masa, emel, ctx) {
    var r = RnU.perById(id), t = RnU.tawaranById(id);
    var k = konteks_(r);
    var terima = jawapan === 'terima';
    var e = Pdf.esc;
    var tajuk = terima ? 'Rekod Penerimaan Tawaran' : 'Rekod Penolakan Tawaran';
    var versi = RnDok.versiSeterusnya(id, 'Penerimaan');
    var nama = tajuk + ' ' + id + (versi > 1 ? ' v' + versi : '');
    var tm = Util.fmtDate(masa, 'dd/MM/yyyy HH:mm');
    var h = '<h1>' + e(tajuk.toUpperCase()) + '</h1>' +
      '<p>Dokumen ini merekodkan bahawa tawaran sewa lot berikut telah <b>' + (terima ? 'DITERIMA' : 'DITOLAK') + '</b> oleh pemohon secara elektronik melalui sistem SHAMS.</p>' +
      '<table><tr><td>ID permohonan</td><td>' + e(id) + '</td></tr><tr><td>No. rujukan surat tawaran</td><td>' + e(S(t.No_Rujukan)) + '</td></tr>' +
      '<tr><td>Perniagaan</td><td>' + e(S(k.per.Nama_Perniagaan)) + '</td></tr><tr><td>Pemohon</td><td>' + e(S(k.pel.Nama_Penuh)) + ' (' + e(k.m) + ')</td></tr>' +
      '<tr><td>Lot</td><td>' + e(RnU.alamatLot(k.lot)) + '</td></tr><tr><td>Tempoh kontrak</td><td>' + e(Util.fmtTarikhBM(t.Tarikh_Mula) + ' hingga ' + Util.fmtTarikhBM(t.Tarikh_Tamat)) + '</td></tr>' +
      '<tr><td>Tarikh dan masa ' + (terima ? 'penerimaan' : 'penolakan') + '</td><td>' + e(tm) + '</td></tr><tr><td>Emel pengesahan</td><td>' + e(emel) + '</td></tr>' +
      '<tr><td>Kaedah pengesahan</td><td>Kod OTP dihantar ke emel pemohon' + (ctx && ctx.bagiPihak ? ' (dikendalikan oleh admin bagi pihak pemohon)' : '') + '</td></tr></table>' +
      '<p class="sm">Rekod ini dijana secara automatik oleh sistem dan sah tanpa tandatangan. Penerimaan tidak boleh ditarik balik oleh pemohon.</p>';
    var res = Pdf.dariHtml(Pdf.wrap(h, nama), nama, 'FLD_LAMPIRAN_LOT');
    Db.withLock(function () {
      RnDok.tambahLocked({
        ID_Permohonan: id, Jenis: 'Penerimaan', Versi: versi, Tajuk: tajuk, Fail: res.url, Nama_Fail: nama + '.pdf', Tarikh: masa, Dijana_Oleh: 'sistem',
        Status: 'Rekod', Kelihatan: 'Ya', Catatan: tm
      });
    });
  }

  /** Admin menjana semula rekod penerimaan jika gagal dijana. */
  function rekodSemula_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id);
    var t = RnU.tawaranById(id);
    if (!t || ['Diterima', 'Ditolak'].indexOf(S(t.Status)) < 0) throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    if (RnDok.semua(id).some(function (d) { return S(d.Jenis) === 'Penerimaan'; })) throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    janaRekod_(id, S(t.Respons) === 'Terima' ? 'terima' : 'tolak', Util.toDate(t.Tarikh_Respons), S(t.Emel_Respons), ctx);
    Audit.log(ctx, 'JANA_SEMULA_REKOD_PENERIMAAN', 'Ruang Niaga', id, '', '', '');
    return dapat_(ctx, { id: id });
  }

  // ---------- Luput, peringatan, salinan fizikal ----------
  /** Tandakan Tawaran Luput jika tarikh luput telah lalu dan pemohon belum menjawab. Pulang true jika diluputkan. */
  function semakLuput_(id) {
    var r = RnU.perById(id), t = RnU.tawaranById(id);
    if (!r || !t || S(t.Status) !== 'Dihantar' || S(r.Status) !== 'Ditawarkan' || !t.Tarikh_Luput) return false;
    if (Util.daysBetween(new Date(), t.Tarikh_Luput) >= 0) return false;
    var nama = '';
    Db.withLock(function () {
      var r2 = RnU.perById(id);
      if (!r2 || S(r2.Status) !== 'Ditawarkan') return;
      nama = RnU.namaLot(RnU.lotById(S(r2.Kod_Lot)));
      RnPer.lepas(r2, 'Tawaran Luput', 'Tawaran luput tanpa jawapan', RnU.sys());
      Audit.log(RnU.sys(), 'TAWARAN_LUPUT', 'Ruang Niaga', id, 'Ditawarkan', 'Tawaran Luput', RnU.dk(t.Tarikh_Luput));
    });
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Tawaran sewa lot telah luput', 'Your lot offer has expired',
      ['Tawaran sewa ' + nama + ' (' + id + ') telah luput kerana tiada jawapan dalam tempoh yang ditetapkan.'], ['The tenancy offer for ' + nama + ' (' + id + ') has expired because no response was received in time.']);
    RnU.melAdmin('Tawaran sewa lot luput', 'Lot offer expired',
      ['Tawaran ' + id + ' (' + nama + ') telah luput tanpa jawapan. Lot kembali Kosong; anda boleh menawarkan kepada pemohon seterusnya mengikut kedudukan.'],
      ['Offer ' + id + ' expired without a response. The lot is vacant again.']);
    return true;
  }

  function peringatanBertingkat_(log, awalan, id, hari, ambang, hantar) {
    var due = ambang.filter(function (a) { return hari >= a; });
    if (!due.length) return 0;
    var tertinggi = due[due.length - 1], n = 0;
    due.forEach(function (a) {
      var key = awalan + id + '_' + a;
      if (log.ada(key)) return;
      if (a === tertinggi) { hantar(a); n++; }
      log.tambah(key, '-', id, 'hari ' + hari);
    });
    return n;
  }
  function ambang_(key) {
    return Cfg.list(key).map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
  }

  function jobHarian_() {
    var hasil = { luput: 0, peringatanTawaran: 0, peringatanSalinan: 0, salinanLewat: 0 };
    var log = RnU.peringatan();
    Db.rows('Tawaran_Sewa').forEach(function (t) {
      var id = S(t.ID_Permohonan);
      var r = RnU.perById(id);
      if (!r || !t.Tarikh_Hantar) return;
      var hari = Util.daysBetween(t.Tarikh_Hantar, new Date());
      var emel = RnU.emelOf(Util.normMatric(r.No_Matrik));
      var nama = RnU.namaLot(RnU.lotById(S(r.Kod_Lot)));
      if (S(t.Status) === 'Dihantar' && S(r.Status) === 'Ditawarkan') {
        if (semakLuput_(id)) { hasil.luput++; return; }
        hasil.peringatanTawaran += peringatanBertingkat_(log, 'RN_TAWARAN_H', id, hari, ambang_('TAWARAN_PERINGATAN_HARI'), function (a) {
          RnU.mel(emel, 'Peringatan: tawaran sewa lot belum dijawab', 'Reminder: lot offer not yet answered',
            ['Tawaran sewa ' + nama + ' (' + id + ') akan luput pada ' + Util.fmtTarikhBM(t.Tarikh_Luput) + '. Sila terima atau tolak tawaran dalam SHAMS.'],
            ['Your tenancy offer for ' + nama + ' (' + id + ') expires on ' + RnU.dk(t.Tarikh_Luput) + '. Please accept or decline in SHAMS.']);
        });
      }
      // salinan fizikal Surat Setuju Terima
      if (S(t.Status) === 'Diterima' && !S(t.Salinan_Fizikal_Tarikh) && ['Diterima', 'Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) >= 0) {
        var maks = Cfg.num('SALINAN_FIZIKAL_HARI', 14);
        if (hari <= maks) {
          hasil.peringatanSalinan += peringatanBertingkat_(log, 'RN_SALINAN_H', id, hari, ambang_('SALINAN_FIZIKAL_PERINGATAN_HARI'), function () {
            RnU.mel(emel, 'Peringatan: pulangkan salinan fizikal Surat Setuju Terima', 'Reminder: return the signed Letter of Acceptance',
              ['Sila pulangkan dua (2) salinan Surat Setuju Terima (' + id + ') yang telah ditandatangani dan disaksikan ke pejabat UTMXCITE selewat-lewatnya ' + Util.fmtTarikhBM(RnU.tambahHari(t.Tarikh_Hantar, maks)) + '.'],
              ['Please return two (2) signed and witnessed copies of the Letter of Acceptance (' + id + ') to the UTMXCITE office.']);
          });
        } else if (!log.ada('RN_SALINAN_LEWAT_' + id)) {
          log.tambah('RN_SALINAN_LEWAT_' + id, '-', id, 'hari ' + hari);
          RnU.melAdmin('Salinan fizikal Surat Setuju Terima belum diterima', 'Signed letter copy not yet received',
            ['Pemohon ' + id + ' (' + nama + ') belum memulangkan salinan fizikal Surat Setuju Terima dalam ' + maks + ' hari. Sila putuskan tindakan (tiada pembatalan automatik).'],
            ['Applicant ' + id + ' has not returned the signed letter within ' + maks + ' days. Please decide (no automatic cancellation).']);
          hasil.salinanLewat++;
        }
      }
    });
    return hasil;
  }

  /** Admin menanda salinan fizikal diterima. */
  function salinanFizikal_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id), penerima = S(p.penerima).substr(0, 120);
    var tarikh = S(p.tarikh) || RnU.dk(new Date());
    var e = {};
    if (!penerima) e.penerima = 'Wajib diisi / Required';
    if (!RnU.isDate(tarikh) || Util.daysBetween(new Date(), Util.toDate(tarikh)) > 0) e.tarikh = 'Tarikh tidak sah atau akan datang / Invalid or future date';
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    Db.withLock(function () {
      var t = RnU.tawaranById(id);
      if (!t || S(t.Status) !== 'Diterima') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      if (S(t.Salinan_Fizikal_Tarikh)) throw appError_('RN_PERALIHAN_TIDAK_SAH');
      Db.update('Tawaran_Sewa', t._row, { Salinan_Fizikal_Tarikh: Util.toDate(tarikh), Salinan_Fizikal_Penerima: penerima });
      Audit.log(ctx, 'SALINAN_FIZIKAL_DITERIMA', 'Ruang Niaga', id, '', tarikh, 'Penerima: ' + penerima);
    });
    return dapat_(ctx, { id: id });
  }

  return {
    jadualOf: jadualOf_, semakJadual: semakJadual_, bilBulan: bilBulan_, teksJadual: teksJadual_, konteks: konteks_, alamatPenyewa: alamatPenyewa_, view: view_, dapat: dapat_, simpan: simpan_,
    jana: jana_, hantar: hantar_, untukPemohon: untukPemohon_, otpMinta: otpMinta_, jawab: jawab_, rekodSemula: rekodSemula_, semakLuput: semakLuput_,
    jobHarian: jobHarian_, salinanFizikal: salinanFizikal_, peringatanBertingkat: peringatanBertingkat_, ambang: ambang_
  };
})();


// ===== RuangNiagaTetapan.gs =====
/**
 * SHAMS: Tetapan khusus modul Ruang Niaga (digabungkan ke Seed.tetapan()).
 * Setiap baris: [Kunci, Nilai lalai, Penerangan]. Nilai boleh diubah urusetia dalam tab Tetapan.
 * Nama dan jawatan penandatangan ialah DATA (bukan kod); nilai lalai di bawah diambil daripada contoh surat/perjanjian
 * dan mesti disemak sebelum pelancaran.
 */
var TETAPAN_RN = [
  ['TAWARAN_TEMPOH_HARI', '7', 'Tempoh menerima tawaran sewa lot (hari dari tarikh surat tawaran dihantar)'],
  ['TAWARAN_PERINGATAN_HARI', '4,6', 'Hari selepas tawaran dihantar untuk emel peringatan kepada pemohon (belum menjawab)'],
  ['CAGARAN_BAYAR_HARI', '14', 'Tempoh membayar cagaran (hari dari tarikh surat tawaran dihantar)'],
  ['CAGARAN_PERINGATAN_SEBELUM_HARI', '3', 'Emel peringatan bayar cagaran sekian hari sebelum tarikh akhir'],
  ['CAGARAN_PULANG_HARI', '90', 'Tempoh pemulangan cagaran selepas tamat kontrak (hari)'],
  ['CAGARAN_PERINGATAN_HARI', '60,80', 'Hari selepas tamat kontrak untuk peringatan emel kepada admin (pulangkan cagaran)'],
  ['SALINAN_FIZIKAL_HARI', '14', 'Tempoh pemulangan salinan fizikal Surat Setuju Terima (hari dari tarikh surat dihantar)'],
  ['SALINAN_FIZIKAL_PERINGATAN_HARI', '7,12', 'Hari selepas surat dihantar untuk peringatan salinan fizikal kepada pemohon'],
  ['SURAT_PENANDATANGAN_NAMA', 'PROFESOR TS DR. ALI BIN SELAMAT', 'Nama penandatangan surat tawaran (semak dan kemas kini)'],
  ['SURAT_PENANDATANGAN_JAWATAN', 'Timbalan Naib Canselor (Hal Ehwal Pelajar dan Alumni)', 'Jawatan penandatangan surat tawaran'],
  ['PERJANJIAN_PENANDATANGAN_NAMA', 'Ybrs. Prof. Ts. Dr. Ali bin Selamat', 'Nama penandatangan perjanjian bagi pihak Universiti'],
  ['PERJANJIAN_PENANDATANGAN_JAWATAN', 'Timbalan Naib Canselor (Hal Ehwal Pelajar & Alumni)', 'Jawatan penandatangan perjanjian bagi pihak Universiti'],
  ['PERJANJIAN_SAKSI_UTM_NAMA', 'Prof. Madya Dr. Syed Norris Hikmi bin Syed Abdullah', 'Nama saksi Universiti pada perjanjian'],
  ['PERJANJIAN_SAKSI_UTM_JAWATAN', 'Pengarah UTMXCITE', 'Jawatan saksi Universiti pada perjanjian'],
  ['PERJANJIAN_SAKSI_SYARIKAT_NAMA', 'Pn. Siti Noraziah binti Satapah', 'Nama saksi bagi pihak Syarikat (pegawai UTMXCITE) pada perjanjian'],
  ['PERJANJIAN_SAKSI_SYARIKAT_JAWATAN', 'Pegawai Tadbir UTMXCITE', 'Jawatan saksi bagi pihak Syarikat pada perjanjian'],
  ['ALAMAT_UTMXCITE', 'UTMXCITE, Jabatan Timbalan Naib Canselor (Hal Ehwal Pelajar dan Alumni), Universiti Teknologi Malaysia, 81310 Johor Bahru, Johor', 'Alamat notis Universiti (perjanjian dan surat)'],
  ['AKAUN_BANK_UTM', 'CIMB: 8006053536', 'Akaun bank rasmi Universiti untuk bayaran sewa dan cagaran'],
  ['PENILAIAN_BEZA_JAUH', '20', 'Beza jumlah skor (daripada 100) antara dua penilai yang ditanda sebagai berbeza jauh'],
  ['SEWA_PERINGATAN_SEBELUM_HARI', '2', 'Emel peringatan bil sewa sekian hari sebelum tarikh akhir'],
  ['TUNGGAKAN_HARI', '30', 'Bil sewa lewat lebih sekian hari ditanda sebagai tunggakan lebih satu bulan'],
  ['NOTIS_PENAMATAN_HARI', '7', 'Tempoh mengosongkan premis dalam Notis Penamatan (hari)']
];


// ===== RuangNiagaUtil.gs =====
/**
 * SHAMS: pembantu dikongsi modul Ruang Niaga (RnU). Tiada kebergantungan semasa muat fail.
 * Capaian data, kebenaran, emel, log peringatan.
 */

var RnU = (function () {
  /** Status permohonan lot yang masih "aktif" (menghalang permohonan lain bagi pelajar/perniagaan yang sama). */
  var AKTIF = ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai', 'Diluluskan', 'Ditawarkan', 'Diterima', 'Perjanjian', 'Sewaan Aktif'];
  var STATUS_PER = ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai', 'Diluluskan', 'Ditolak', 'Ditawarkan', 'Diterima', 'Perjanjian', 'Sewaan Aktif',
    'Tawaran Luput', 'Ditolak Pemohon', 'Dibatalkan', 'Tamat'];

  function str_(v) { return Util.str(v); }
  function today_() { return Util.toDate(Util.dateKey(new Date())); }
  function dk_(v) { return Util.dateKey(v); }
  /** Tarikh (tengah malam MYT) = tarikh v + n hari. v: Date atau yyyy-MM-dd. */
  function tambahHari_(v, n) { var b = Util.toDate(Util.dateKey(v)); return new Date(b.getTime() + n * 86400000); }
  function csv_(a) { return (a || []).join(','); }
  function split_(s) { return str_(s) ? str_(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }
  function num_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function rm_(n) { var x = num_(n); return 'RM ' + (Math.round(x * 100) % 100 === 0 ? String(Math.round(x)) : x.toFixed(2)); }
  function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Util.toDate(s).getTime()); }

  function find1_(tab, pred) { var l = Db.find(tab, pred); return l.length ? l[0] : null; }
  function perById_(id) { return find1_('Permohonan_Lot', function (r) { return str_(r.ID_Permohonan) === id; }); }
  function lotById_(kod) { return find1_('Lot', function (r) { return str_(r.Kod_Lot) === kod; }); }
  function pelajar_(m) { return find1_('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; }); }
  function perniagaan_(id) { return find1_('Perniagaan', function (r) { return str_(r.ID_Perniagaan) === id; }); }
  function perniagaanOwner_(m) {
    var l = Db.find('Perniagaan', function (r) { return Util.normMatric(r.No_Matrik_Pemilik) === m; });
    return l.length ? l[l.length - 1] : null;
  }
  function tawaranById_(id) { return find1_('Tawaran_Sewa', function (r) { return str_(r.ID_Permohonan) === id; }); }
  function sewaanById_(id) { return find1_('Sewaan', function (r) { return str_(r.ID_Sewaan) === id; }); }

  /** Status SSU semasa (dikira daripada tarikh tamat). */
  function statusPer_(per) {
    var t = Util.toDate(per.Tarikh_Tamat);
    if (t && Util.daysBetween(new Date(), t) < 0) return 'Tamat Tempoh';
    return str_(per.Status_SSU) || 'Aktif';
  }

  /** Permohonan SSU diluluskan terkini bagi perniagaan. */
  function ssuLulus_(idPer) {
    var l = Db.find('Permohonan_SSU', function (r) { return str_(r.ID_Perniagaan) === idPer && str_(r.Status) === 'Diluluskan'; });
    return l.length ? l[l.length - 1] : null;
  }

  /**
   * Peta orang bagi setiap perniagaan: {ahli: {ID_Perniagaan: [No_Matrik...]}} (pemilik dahulu). Dibina dengan membaca
   * Perniagaan, Permohonan_SSU dan Ahli_Pasukan sekali sahaja.
   */
  function peta_() {
    var ahli = {};
    var latest = {}, ssuToPer = {};
    Db.rows('Permohonan_SSU').forEach(function (r) {
      if (str_(r.Status) === 'Diluluskan' && str_(r.ID_Perniagaan)) latest[str_(r.ID_Perniagaan)] = str_(r.ID_Permohonan);
    });
    Object.keys(latest).forEach(function (pid) { ssuToPer[latest[pid]] = pid; });
    Db.rows('Perniagaan').forEach(function (p) { ahli[str_(p.ID_Perniagaan)] = [Util.normMatric(p.No_Matrik_Pemilik)]; });
    Db.rows('Ahli_Pasukan').forEach(function (a) {
      var pid = ssuToPer[str_(a.ID_Permohonan)];
      if (!pid || !ahli[pid]) return;
      var m = Util.normMatric(a.No_Matrik);
      if (ahli[pid].indexOf(m) < 0) ahli[pid].push(m);
    });
    return { ahli: ahli };
  }
  function ahliMatrik_(idPer) { return peta_().ahli[idPer] || []; }

  /** ID perniagaan di mana pelajar ialah ahli (bukan pemilik). */
  function perniagaanAhli_(m) {
    var p = peta_(), out = [];
    Object.keys(p.ahli).forEach(function (id) { if (p.ahli[id].indexOf(m) > 0) out.push(id); });
    return out;
  }

  /** Permohonan lot aktif yang bercanggah bagi perniagaan ini (pemilik atau ahli yang sama). Pulang baris atau null. */
  function bercanggah_(idPer, kecualiId) {
    var p = peta_();
    var orang = p.ahli[idPer] || [];
    var hit = null;
    Db.rows('Permohonan_Lot').forEach(function (r) {
      if (hit || AKTIF.indexOf(str_(r.Status)) < 0 || str_(r.ID_Permohonan) === (kecualiId || '')) return;
      var lain = p.ahli[str_(r.ID_Perniagaan)] || [Util.normMatric(r.No_Matrik)];
      if (str_(r.ID_Perniagaan) === idPer || lain.some(function (m) { return orang.indexOf(m) >= 0; })) hit = r;
    });
    return hit;
  }

  function emelOf_(m) {
    var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    if (pg.length && str_(pg[0].Emel)) return Util.normEmail(pg[0].Emel);
    var p = pelajar_(m);
    return p ? Util.normEmail(p.Emel) : '';
  }

  // ---------- Kebenaran ----------
  function isDecider_(ctx) {
    if (ctx.role === ROLE.ADMIN_PENUH) return true;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      return !mod || mod.indexOf('semua') >= 0 || mod.indexOf('ruang niaga') >= 0;
    }
    return false;
  }
  function requireDecider_(ctx) { if (!isDecider_(ctx)) throw appError_('TIADA_KEBENARIAN'); }
  function requireViewer_(ctx) {
    if (ADMIN_ROLES.indexOf(ctx.role) < 0 || ctx.role === ROLE.PENILAI) throw appError_('TIADA_KEBENARIAN');
  }

  /** Akses pelajar kepada permohonan: 'pemilik', 'ahli' atau ''. Konteks pelajar (termasuk bagi pihak) sahaja. */
  function akses_(ctx, r) {
    var m = ctx.noMatrik;
    if (!m) return '';
    if (Util.normMatric(r.No_Matrik) === m) return 'pemilik';
    return ahliMatrik_(str_(r.ID_Perniagaan)).indexOf(m) >= 0 ? 'ahli' : '';
  }
  function requireOwner_(ctx, r) {
    var a = akses_(ctx, r);
    if (!a) throw appError_('RN_TIDAK_DITEMUI');
    if (a !== 'pemilik') throw appError_('RN_HANYA_PEMILIK');
  }

  // ---------- Emel dan log peringatan ----------
  function mel_(to, sBm, sEn, bm, en) {
    if (!to) return false;
    try {
      var url = Cfg.get('WEBAPP_URL', '');
      if (url) { bm = bm.concat(['Buka SHAMS: ' + url]); en = en.concat(['Open SHAMS: ' + url]); }
      return Mail.send(to, { subjectBm: sBm, subjectEn: sEn, bm: bm, en: en });
    } catch (err) { console.error('Emel gagal: ' + err); return false; }
  }
  /** Emel admin yang boleh memutuskan Ruang Niaga (aktif). */
  function emelAdmin_() {
    var out = [];
    Admins.list().forEach(function (a) {
      if (!a.aktif || [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL].indexOf(a.peranan) < 0) return;
      var mod = a.modul.toLowerCase();
      if (a.peranan === ROLE.PEGAWAI_MODUL && mod && mod.indexOf('semua') < 0 && mod.indexOf('ruang niaga') < 0) return;
      if (out.indexOf(a.emel) < 0) out.push(a.emel);
    });
    return out;
  }
  function melAdmin_(sBm, sEn, bm, en) {
    emelAdmin_().forEach(function (e) { mel_(e, sBm, sEn, bm, en); });
  }
  /** Log peringatan dimuat sekali: {ada(kunci), tambah(kunci, emel, rujukan, catatan)}. */
  function peringatan_() {
    var ada = {};
    Db.rows('Peringatan').forEach(function (l) { ada[str_(l.Jenis)] = true; });
    return {
      ada: function (k) { return !!ada[k]; },
      tambah: function (k, emel, ruj, cat) {
        ada[k] = true;
        Db.append('Peringatan', { Masa: new Date(), Emel: emel || '-', Jenis: k, Rujukan: ruj || '', Status: 'Dihantar', Catatan: cat || '' });
      }
    };
  }

  function sys_() { return { email: 'sistem', role: '-' }; }

  /** Nama paparan lot. */
  function namaLot_(lot) { return lot ? (str_(lot.Nama_Paparan) || str_(lot.Kod_Lot)) : ''; }
  function alamatLot_(lot) {
    return str_(lot.Alamat_Surat) || (namaLot_(lot) + ', Universiti Teknologi Malaysia');
  }
  function isFnb_(lot) { return !!lot && str_(lot.Jenis) === 'FNB'; }

  /** Kemas kini baris Lot (kunci dipegang oleh pemanggil). */
  function setLot_(kod, status) {
    var l = lotById_(kod);
    if (l) Db.update('Lot', l._row, { Status_Lot: status });
  }
  /** Tulis semula baris tab yang sepadan dengan pred menggunakan baris baharu (kunci dipegang oleh pemanggil). */
  function gantiBaris_(tab, pred, baru) {
    var keep = Db.rows(tab).filter(function (r) { return !pred(r); });
    Db.replaceAll(tab, keep.concat(baru));
  }

  return {
    AKTIF: AKTIF, STATUS_PER: STATUS_PER, str: str_, today: today_, tambahHari: tambahHari_, dk: dk_, csv: csv_, split: split_, num: num_, rm: rm_, isDate: isDate_,
    perById: perById_, lotById: lotById_, pelajar: pelajar_, perniagaan: perniagaan_, perniagaanOwner: perniagaanOwner_,
    tawaranById: tawaranById_, sewaanById: sewaanById_, statusPer: statusPer_, ssuLulus: ssuLulus_, peta: peta_,
    ahliMatrik: ahliMatrik_, perniagaanAhli: perniagaanAhli_, bercanggah: bercanggah_, emelOf: emelOf_,
    isDecider: isDecider_, requireDecider: requireDecider_, requireViewer: requireViewer_, akses: akses_, requireOwner: requireOwner_,
    mel: mel_, melAdmin: melAdmin_, emelAdmin: emelAdmin_, peringatan: peringatan_, sys: sys_,
    namaLot: namaLot_, alamatLot: alamatLot_, isFnb: isFnb_, setLot: setLot_, gantiBaris: gantiBaris_
  };
})();


// ===== Seed.gs =====
/**
 * SHAMS: data awal yang diisi oleh skrip persediaan (hanya jika tab kosong,
 * kecuali Tetapan dan Admin yang melengkapkan kunci/baris yang tiada).
 * Nama BM sesetengah rujukan ialah draf untuk disemak urusetia.
 */

var Seed = (function () {
  function ruj(kumpulan, items) {
    return items.map(function (it, i) {
      return { Kumpulan: kumpulan, Kod: it[0], BM: it[1], EN: it[2], Susunan: i + 1, Aktif: 'Ya' };
    });
  }

  function rujukan_() {
    var out = [];
    out = out.concat(ruj('FAKULTI', [
      ['FKA', 'Fakulti Kejuruteraan Awam', 'Faculty of Civil Engineering'],
      ['FKE', 'Fakulti Kejuruteraan Elektrik', 'Faculty of Electrical Engineering'],
      ['FKM', 'Fakulti Kejuruteraan Mekanikal', 'Faculty of Mechanical Engineering'],
      ['FKT', 'Fakulti Kejuruteraan Kimia dan Tenaga', 'Faculty of Chemical and Energy Engineering'],
      ['FC', 'Fakulti Komputeran', 'Faculty of Computing'],
      ['FS', 'Fakulti Sains', 'Faculty of Science'],
      ['FABU', 'Fakulti Alam Bina dan Ukur', 'Faculty of Built Environment and Survey'],
      ['FM', 'Fakulti Pengurusan', 'Faculty of Management'],
      ['AHIBS', 'Sekolah Perniagaan Antarabangsa Azman Hashim', 'Azman Hashim International Business School'],
      ['FSSK-PEND', 'Sekolah Pendidikan / Fakulti Sains Sosial dan Kemanusiaan', 'School of Education / Faculty of Social Science and Humanities'],
      ['FSSK-PSI', 'Sekolah Pembangunan Sumber Manusia dan Psikologi / Fakulti Sains Sosial dan Kemanusiaan', 'School of Human Resource Development and Psychology / Faculty of Social Science and Humanities'],
      ['FSSK-BHS', 'Akademi Bahasa / Fakulti Sains Sosial dan Kemanusiaan', 'Academy Language / Faculty of Social Science and Humanities'],
      ['FEST', 'Fakulti Teknologi dan Informatik Razak', 'Razak Faculty of Technology and Informatics'],
      ['MJIIT', 'Institut Teknologi Antarabangsa Malaysia-Jepun (MJIIT)', 'Malaysia-Japan International Institute of Technology (MJIIT)'],
      ['FAI', 'Fakulti Kecerdasan Buatan', 'Faculty of Artificial Intelligence'],
      ['SPACE', 'SPACE', 'SPACE']
    ]));
    out = out.concat(ruj('BIDANG', [
      ['SSH', 'Sains Sosial dan Kemanusiaan', 'Social Science & Humanities'],
      ['ICT', 'Teknologi Maklumat dan Komunikasi', 'Information, Technology and Communication'],
      ['MATH', 'Sains Matematik', 'Mathematical Science'],
      ['EDU', 'Pendidikan', 'Education'],
      ['ADM', 'Pentadbiran', 'Administration'],
      ['ECO', 'Ekonomi', 'Economy'],
      ['BMA', 'Pengurusan Perniagaan dan Perakaunan', 'Business Management and Accounting'],
      ['CIV', 'Kejuruteraan Awam', 'Civil Engineering'],
      ['ELE', 'Kejuruteraan Elektrik', 'Electrical Engineering'],
      ['MEK', 'Kejuruteraan Mekanikal', 'Mechanical Engineering'],
      ['CHE', 'Kejuruteraan Kimia dan Tenaga', 'Chemical Engineering And Energy Engineering'],
      ['APS', 'Senibina, Perancangan dan Ukur', 'Architecture, Planning and Survey'],
      ['PHC', 'Fizik dan Kimia', 'Physics and Chemistry'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('KLUSTER', [
      ['BEAUTY', 'Produk Kecantikan', 'Beauty Product'],
      ['ICT', 'IT / Digital / ICT', 'IT / Digital / ICT'],
      ['COMPUTING', 'Pengkomputeran', 'Computing'],
      ['REPAIR', 'Pembaikan (Gajet dan lain-lain)', 'Repairing (Gadget etc.)'],
      ['MANUF', 'Pembuatan', 'Manufacturing'],
      ['AGRI', 'Pertanian', 'Agriculture'],
      ['RETAIL', 'Peruncitan', 'Retailing'],
      ['AIRCOND', 'Pemasangan / Pembaikan Penyaman Udara', 'Install / Repair Air Conditioning'],
      ['ELEC', 'Kerja Elektrik', 'Electrical Work'],
      ['SPA', 'Spa dan Urutan', 'Spa & Massage'],
      ['PRODMANUF', 'Pembuatan Produk', 'Product manufacturing'],
      ['TUITION', 'Tuisyen', 'Tuition'],
      ['PRINT', 'Percetakan', 'Printing'],
      ['COURIER', 'Pos / Kurier', 'Post / Courier'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('PRODUK', [
      ['RETAIL', 'Peruncitan', 'Retail'],
      ['FNB', 'Makanan dan Minuman', 'Food & Beverage'],
      ['FASHION', 'Fesyen, Pakaian dan Aksesori', 'Fashion, Clothes & Accessories'],
      ['MOBILE', 'Telefon Mudah Alih dan Gajet', 'Mobiles & Gadgets'],
      ['COMPUTER', 'Komputer dan Aksesori', 'Computer & Accessories'],
      ['HEALTH', 'Kesihatan dan Kecantikan', 'Health & Beauty'],
      ['GAMES', 'Permainan, Buku dan Hobi', 'Games, Books and Hobbies'],
      ['PROOF', 'Penyuntingan, Terjemahan dan Semakan Bahasa', 'Proofreading, Translation and Editing Services'],
      ['DESIGN', 'Reka Bentuk Grafik, Laman Web dan Perkhidmatan Digital', 'Graphic Design, Website and Digital Services'],
      ['TRANSPORT', 'Pengangkutan', 'Transportation'],
      ['AGRI', 'Pertanian', 'Agriculture'],
      ['CONSTRUCT', 'Pembinaan', 'Construction'],
      ['SPORTS', 'Sukan dan Luar Bangunan', 'Sports & Outdoor'],
      ['PRINT3D', 'Percetakan 3D dan Robotik', '3D Printing and Robotics'],
      ['LAIN', 'Lain-lain', 'Others']
    ]));
    out = out.concat(ruj('JENIS_PERNIAGAAN', [
      ['SOLE', 'Milikan Tunggal', 'Sole Proprietorship'],
      ['PARTNER', 'Perkongsian', 'Partnership'],
      ['SDNBHD', 'Sdn. Bhd.', 'Sdn. Bhd.'],
      ['PLL', 'Perkongsian Liabiliti Terhad (PLL)', 'Partnership Limited Liability (PLL)'],
      ['FREELANCE', 'Pekerja Bebas (Freelance)', 'Free Lance'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('SUMBER_PEMBIAYAAN', [
      ['SENDIRI', 'Wang sendiri / simpanan', 'Own money / savings'],
      ['IBUBAPA', 'Sumbangan ibu bapa', 'Contribution from parents'],
      ['GERAN', 'Geran', 'Grant'],
      ['PINJAMAN', 'Pinjaman', 'Loan'],
      ['IPT', 'Bantuan kewangan IPT', 'Financial assistance from IPT'],
      ['HADIAH', 'Hadiah pertandingan', 'Competition prizes'],
      ['AGENSI', 'Dana agensi lain', 'Funding from other agencies'],
      ['NGO', 'NGO', 'NGO'],
      ['CROWD', 'Pembiayaan ramai (crowdfunding)', 'Crowdfunding'],
      ['TIADA', 'Tiada', 'None'],
      ['LAIN', 'Lain-lain', 'Others']
    ]));
    out = out.concat(ruj('PEMBERI_DANA', [
      ['KERAJAAN', 'Agensi kerajaan', 'Government agency'],
      ['SWASTA', 'Agensi swasta / industri', 'Private agency / industry'],
      ['BANK', 'Bank', 'Bank'],
      ['NGO', 'NGO', 'NGO'],
      ['IPT', 'IPT', 'IPT'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('SYARAT_SUBJEK', [
      ['UBSS1032', 'UBSS1032', 'UBSS1032'],
      ['ULRS3032', 'ULRS3032', 'ULRS3032'],
      ['MFMS1143', 'MFMS1143', 'MFMS1143'],
      ['SBSF1023', 'SBSF1023', 'SBSF1023'],
      ['TIADA', 'Tidak didaftarkan di bawah mana-mana subjek', 'Not registered under any subject requirement'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('STATUS_SSM', [
      ['YA', 'Ya', 'Yes'], ['TIDAK', 'Tidak', 'No'], ['PROSES', 'Dalam proses', 'In progress']
    ]));
    out = out.concat(ruj('ETNIK', [
      ['MELAYU', 'Melayu', 'Malay'], ['CINA', 'Cina', 'Chinese'], ['INDIA', 'India', 'Indian'],
      ['BSABAH', 'Bumiputera Sabah', 'Bumiputera Sabah'], ['BSARAWAK', 'Bumiputera Sarawak', 'Bumiputera Sarawak'],
      ['BUKANWN', 'Bukan Warganegara', 'Non-Malaysian']
    ]));
    out = out.concat(ruj('NEGERI', [
      ['JOHOR', 'Johor', 'Johor'], ['KEDAH', 'Kedah', 'Kedah'], ['KELANTAN', 'Kelantan', 'Kelantan'],
      ['MELAKA', 'Melaka', 'Melaka'], ['NSEMBILAN', 'Negeri Sembilan', 'Negeri Sembilan'], ['PAHANG', 'Pahang', 'Pahang'],
      ['PERAK', 'Perak', 'Perak'], ['PERLIS', 'Perlis', 'Perlis'], ['PPINANG', 'Pulau Pinang', 'Penang'],
      ['SABAH', 'Sabah', 'Sabah'], ['SARAWAK', 'Sarawak', 'Sarawak'], ['SELANGOR', 'Selangor', 'Selangor'],
      ['TERENGGANU', 'Terengganu', 'Terengganu'], ['KL', 'Wilayah Persekutuan Kuala Lumpur', 'Federal Territory of Kuala Lumpur'],
      ['LABUAN', 'Wilayah Persekutuan Labuan', 'Federal Territory of Labuan'], ['PUTRAJAYA', 'Wilayah Persekutuan Putrajaya', 'Federal Territory of Putrajaya'],
      ['LUAR', 'Luar negara', 'Overseas']
    ]));
    out = out.concat(ruj('HUBUNGAN', [
      ['IBU', 'Ibu', 'Mother'], ['BAPA', 'Bapa', 'Father'], ['ADIK_BERADIK', 'Adik-beradik', 'Sibling'],
      ['DATUK_NENEK', 'Datuk / nenek', 'Grandparent'], ['SAUDARA', 'Saudara-mara', 'Relative'], ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('TEMPOH_NIAGA', [
      ['KURANG1', 'Kurang 1 tahun', 'Less than 1 year'], ['1HINGGA3', '1 hingga 3 tahun', '1 to 3 years'], ['LEBIH3', 'Lebih 3 tahun', 'More than 3 years']
    ]));
    out = out.concat(ruj('MOTIVASI', [
      ['PENDAPATAN', 'Pendapatan tambahan', 'Extra income'], ['MINAT', 'Minat dan kegemaran', 'Interest and passion'],
      ['PENGALAMAN', 'Mencari pengalaman', 'Gaining experience'], ['BEBAS', 'Ingin bebas dan menjadi majikan sendiri', 'Independence and being my own boss'],
      ['KELUARGA', 'Menyambung perniagaan keluarga', 'Continuing the family business'], ['MASALAH', 'Menyelesaikan masalah masyarakat', 'Solving a community problem'],
      ['LAIN', 'Lain-lain', 'Other']
    ]));
    out = out.concat(ruj('ALIRAN', [
      ['SOLE', 'Sole proprietor / enterprise', 'Sole proprietor / enterprise'], ['SOSIAL', 'Keusahawanan sosial', 'Social entrepreneurship'],
      ['TEKNO', 'Technology startup', 'Technology startup'], ['GIG', 'High Value GiG', 'High Value GiG']
    ]));
    out = out.concat(ruj('JENIS_LOT', [
      ['FNB', 'Makanan dan Minuman', 'F&B'], ['RETAIL', 'Peruncitan', 'Retail'], ['LAIN', 'Lain-lain', 'Other']
    ]));
    return out;
  }

  function lot_() {
    var out = [], i, now = new Date();
    for (i = 1; i <= 10; i++) {
      out.push({ Kod_Lot: 'SM-' + Util.pad(i, 2), Nama_Paparan: 'Student Mall - Lot ' + i, Lokasi: 'Student Mall', Blok: '', Saiz_m2: '', Jenis: '', Kadar_Sewa_RM: '', Status_Buka: 'Ditutup', Status_Lot: 'Kosong', Catatan: '', Didaftar_Oleh: 'Persediaan', Tarikh_Daftar: now });
    }
    for (i = 1; i <= 5; i++) {
      out.push({ Kod_Lot: 'SUB-' + Util.pad(i, 2), Nama_Paparan: 'SUB - Lot ' + i, Lokasi: 'SUB (Student Union Building)', Blok: '', Saiz_m2: '', Jenis: '', Kadar_Sewa_RM: '', Status_Buka: 'Ditutup', Status_Lot: 'Kosong', Catatan: '', Didaftar_Oleh: 'Persediaan', Tarikh_Daftar: now });
    }
    return out;
  }

  /** Rubrik penilaian permohonan lot (draf, boleh disunting urusetia). Jumlah 100. */
  function rubrik_() {
    var c = function (n, kod, bm, en, sub, maks, t5, t3, t1) {
      return { Jenis: 'LOT', Versi: 1, Kod_Kriteria: kod, Kriteria_BM: bm, Kriteria_EN: en, Sub_Perkara: sub, Markah_Maks: maks, Tertib: n, Tahap5: t5, Tahap3: t3, Tahap1: t1, Aktif: 'Ya' };
    };
    return [
      c(1, 'ORG', 'Organisasi keseluruhan', 'Overall organization', 'Tersusun; perintah logik yang jelas; agihan tugas yang jelas', 10,
        'Sangat tersusun, aliran logik jelas, tugas ahli jelas', 'Kebanyakannya tersusun, ada bahagian kurang jelas', 'Tidak tersusun, tugas tidak dinyatakan'),
      c(2, 'KANDUNGAN', 'Kandungan pelan perniagaan', 'Business proposal content', 'Penerangan perniagaan; misi dan visi; objektif; analisis persaingan dan tinjauan pasaran; pelan operasi; pelan pemasaran; perancangan kewangan', 20,
        'Ketujuh-tujuh elemen lengkap dan berkualiti', '4 hingga 5 elemen lengkap', '2 elemen atau kurang'),
      c(3, 'PENERANGAN', 'Penerangan perniagaan', 'Description of business', 'Cadangan perniagaan; objektif yang jelas; strategi keseluruhan', 20,
        'Cadangan jelas, objektif spesifik dan boleh diukur, strategi menyeluruh', 'Jelas tetapi umum', 'Kabur, tiada objektif'),
      c(4, 'PASARAN', 'Kebolehpasaran produk / perkhidmatan', 'Marketability of product / services', 'Strategi pemasaran; tahap permintaan produk/perkhidmatan', 20,
        'Pasaran sasaran jelas, strategi sesuai, ada bukti permintaan', 'Ada strategi tanpa bukti', 'Tiada strategi atau permintaan tidak dinyatakan'),
      c(5, 'INOVASI', 'Inovasi', 'Innovativeness', 'Sesuatu yang baharu; keunikan yang memberi kelebihan daya saing', 20,
        'Baharu dan kelebihan daya saing jelas', 'Penambahbaikan kecil daripada yang sedia ada', 'Meniru yang sedia ada'),
      c(6, 'KEWANGAN', 'Pengurusan kewangan', 'Financial management', 'Pengurusan modal dan sumber; tempoh pulangan modal; perancangan jualan; pengurusan penggajian pekerja (HR plan)', 10,
        'Modal, kos, jualan, tempoh pulangan dan pelan penggajian realistik', 'Sebahagian dirancang', 'Tiada perancangan')
    ];
  }

  /** Kadar daripada borang Makerspace. Kadar kosong = belum ditetapkan oleh urusetia. */
  function kadar_() {
    var base = [
      ['RUANG_CAJ_PERKHIDMATAN', 'Caj perkhidmatan tempahan ruang', 'per tempahan', 150],
      ['RUANG_MAKER_LAB', 'Maker Lab (kapasiti 200)', 'per hari', ''],
      ['RUANG_BILIK_MESYUARAT', 'Bilik Mesyuarat (kapasiti 20)', 'per hari', ''],
      ['LASER_CUT', 'Mesin Laser Cut', 'per 5 minit', 1],
      ['3D_PRINTER_GRAM', '3D Printer (bahan)', 'per gram', ''],
      ['3D_PRINTER_JAM', '3D Printer (masa mesin)', 'per jam', ''],
      ['PERALATAN_TANGAN', 'Peralatan tangan (pinjaman)', 'per pinjaman', ''],
      ['ALAT_FLIP_CHART', 'Flip chart', 'per hari', 10],
      ['ALAT_WHITE_BOARD', 'White board', 'per hari', 20],
      ['ALAT_SPEAKER_MIC', 'Portable speaker dan mic', 'per hari', 50],
      ['ALAT_BEANIE_BAG', 'Beanie bag', 'per hari', 5],
      ['ALAT_MEJA_PANJANG', 'Meja panjang', 'per hari', 5],
      ['ALAT_KERUSI_PLASTIK', 'Kerusi plastik / bankuet', 'per hari', 5],
      ['ALAT_LCD_PROJECTOR', 'Projektor LCD (disediakan)', 'per hari', 0],
      ['ALAT_WHITE_SCREEN', 'Skrin putih (disediakan)', 'per hari', 0],
      ['ALAT_PA_SYSTEM', 'Sistem PA (disediakan)', 'per hari', 0],
      ['ALAT_MEJA_BIASA', 'Meja biasa (disediakan)', 'per hari', 0],
      ['ALAT_KERUSI', 'Kerusi (disediakan)', 'per hari', 0],
      ['ALAT_EXTENSION_WIRE', 'Extension wire', 'per hari', '']
    ];
    var today = new Date();
    var out = [];
    base.forEach(function (b) {
      [ROLE.PELAJAR, ROLE.STAF, ROLE.LUAR].forEach(function (u) {
        out.push({ Kod_Sumber: b[0], Nama_Sumber: b[1], Jenis_Pengguna: u, Unit: b[2], Kadar_RM: b[3], Berkuat_Kuasa: today, Aktif: 'Ya' });
      });
    });
    return out;
  }

  /** Pelajar contoh rekaan (MOD UJI sahaja). Bukan data sebenar. */
  function pelajarContoh_() {
    var d = function (m, nama, emel, kp, j, etnik, kw, fak, prog, bid, thn, tel) {
      return { No_Matrik: m, Nama_Penuh: nama, Emel: emel, No_KP_Pasport: kp, Jantina: j, Etnik: etnik, Kewarganegaraan: kw, Fakulti: fak, Program: prog, Bidang_Pengajian: bid, Tahun_Pengajian: thn, No_Telefon: tel, Alamat_Kolej: 'Kolej Contoh, UTM Johor Bahru', Alamat_Rumah: 'No. 1, Jalan Contoh, 81310 Skudai', Status_Pelajar: 'Aktif', Sesi_Kemasukan: '2023/2024' };
    };
    return [
      d('A23UJ0001', 'NURUL AINA BINTI HASSAN', 'aina.contoh@graduate.utm.my', '010101-01-0001', 'Perempuan', 'Melayu', 'Warganegara', 'Fakulti Komputeran', 'BSc Sains Komputer', 'Teknologi Maklumat dan Komunikasi', 3, '0111111101'),
      d('A23UJ0002', 'AMIRUL HAKIM BIN ROSLI', 'amirul.contoh@graduate.utm.my', '010101-01-0002', 'Lelaki', 'Melayu', 'Warganegara', 'Fakulti Komputeran', 'BSc Sains Komputer', 'Teknologi Maklumat dan Komunikasi', 3, '0111111102'),
      d('A22UJ0003', 'LIM WEI JIE', 'weijie.contoh@graduate.utm.my', '010101-01-0003', 'Lelaki', 'Cina', 'Warganegara', 'Fakulti Pengurusan', 'BSc Pengurusan', 'Pengurusan Perniagaan dan Perakaunan', 4, '0111111103'),
      d('A24UJ0004', 'KAVITHA A/P RAJAN', 'kavitha.contoh@graduate.utm.my', '010101-01-0004', 'Perempuan', 'India', 'Warganegara', 'Fakulti Kejuruteraan Elektrik', 'BEng Kejuruteraan Elektrik', 'Kejuruteraan Elektrik', 2, '0111111104'),
      d('A23UJ0005', 'SYAFIQ BIN DAUD', 'syafiq.contoh@graduate.utm.my', '010101-01-0005', 'Lelaki', 'Melayu', 'Warganegara', 'Fakulti Kejuruteraan Mekanikal', 'BEng Kejuruteraan Mekanikal', 'Kejuruteraan Mekanikal', 3, '0111111105'),
      d('A24UJ0006', 'AISYAH BINTI MOHD', 'aisyah.contoh@graduate.utm.my', '010101-01-0006', 'Perempuan', 'Melayu', 'Warganegara', 'Fakulti Alam Bina dan Ukur', 'BSc Senibina', 'Senibina, Perancangan dan Ukur', 2, '0111111106'),
      d('A21UJ0007', 'JOHN DOE', 'john.contoh@graduate.utm.my', 'P1234567', 'Lelaki', 'Bukan Warganegara', 'Bukan Warganegara', 'Fakulti Sains', 'BSc Fizik', 'Fizik dan Kimia', 4, '0111111107'),
      d('A25UJ0008', 'SITI NABILAH BINTI ZAKARIA', 'nabilah.contoh@graduate.utm.my', '010101-01-0008', 'Perempuan', 'Bumiputera Sabah', 'Warganegara', 'Fakulti Sains', 'BSc Kimia', 'Fizik dan Kimia', 1, '0111111108')
    ];
  }

  function tetapan_() {
    var all = TETAPAN_LALAI.concat(typeof TETAPAN_RN !== 'undefined' ? TETAPAN_RN : [], typeof TETAPAN_KEW !== 'undefined' ? TETAPAN_KEW : [],
      typeof TETAPAN_MK !== 'undefined' ? TETAPAN_MK : []);
    return all.map(function (t) { return { Kunci: t[0], Nilai: t[1], Penerangan: t[2] }; });
  }

  function admin_() {
    return [{ Emel: ADMIN_UTAMA, Nama: 'UTMXCITE', Peranan: ROLE.ADMIN_PENUH, Modul: 'Semua', Aktif: 'Ya', Ditambah_Oleh: 'Persediaan', Tarikh: new Date() }];
  }

  return {
    rujukan: rujukan_, lot: lot_, rubrik: rubrik_, kadar: kadar_,
    pelajarContoh: pelajarContoh_, tetapan: tetapan_, admin: admin_
  };
})();


// ===== Setup.gs =====
/**
 * SHAMS: skrip persediaan.
 *
 * Cara mudah: jalankan setup() terus. Jika Script Property INDUK_ID tiada, folder "SHAMS" dan
 * spreadsheet Induk dicipta automatik dalam Drive akaun pelaksana. Cara manual: cipta SS_INDUK sendiri
 * dan tetapkan INDUK_ID (URL atau ID). MODE (UJI atau PRODUKSI) lalai UJI jika tidak ditetapkan.
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
    if (!raw) {
      // Tiada INDUK_ID: cipta folder dan spreadsheet Induk secara automatik dalam Drive akaun pelaksana.
      var folder = DriveApp.getRootFolder().createFolder(nama_('SHAMS'));
      var created = SpreadsheetApp.create(nama_('SHAMS - Induk'));
      DriveApp.getFileById(created.getId()).moveTo(folder);
      Db.props().setProperty(PROPS.INDUK_ID, created.getId());
      Db.reset();
      return created;
    }
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

  var NAMA_LAMA = 'UTMPreneur';

  /** Gantikan awalan jenama lama (UTMPreneur) dengan nama semasa pada spreadsheet dan folder berdaftar. */
  function namakanSemula_(ind, parent, log) {
    var baru = APP.NAMA, n = 0;
    var tukar = function (nama) { return String(nama).indexOf(NAMA_LAMA) === 0 ? baru + String(nama).substr(NAMA_LAMA.length) : null; };
    Object.keys(SCHEMA).forEach(function (kod) {
      try {
        var ss = kod === 'SS_INDUK' ? ind : Db.openByKod(kod);
        var nn = tukar(ss.getName());
        if (nn) { ss.rename(nn); n++; }
      } catch (e) { console.error('Nama semula spreadsheet gagal (' + kod + '): ' + e); }
    });
    var folders = [parent];
    FOLDERS.forEach(function (f) {
      var l = Db.links()[f.kod];
      if (l && l.id) { try { folders.push(DriveApp.getFolderById(l.id)); } catch (e) { /* abaikan */ } }
    });
    folders.forEach(function (fl) {
      try { var nn = tukar(fl.getName()); if (nn) { fl.setName(nn); n++; } } catch (e) { console.error('Nama semula folder gagal: ' + e); }
    });
    if (n) log.push('Dinamakan semula kepada ' + baru + ': ' + n + ' spreadsheet/folder');
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
    // Nama penghantar emel lalai lama diganti dengan nama sistem semasa (nilai yang disunting pengguna dibiarkan)
    var np = Db.find('Tetapan', function (r) { return Util.str(r.Kunci) === 'NAMA_PENGHANTAR' && Util.str(r.Nilai) === NAMA_LAMA + ' · UTMXCITE'; });
    if (np.length) { Db.update('Tetapan', np[0]._row, { Nilai: APP.NAMA + ' · UTMXCITE' }); log.push('NAMA_PENGHANTAR dikemas kini kepada ' + APP.NAMA); }
    // Admin utama
    var hasAdmin = Db.rows('Admin').some(function (r) { return Util.normEmail(r.Emel) === ADMIN_UTAMA; });
    if (!hasAdmin) { appendMany_('Admin', Seed.admin()); log.push('Admin utama didaftar: ' + ADMIN_UTAMA); }
    // Rujukan: tambah kumpulan yang belum wujud (selamat bagi pemasangan sedia ada; kumpulan sedia ada tidak diubah)
    var haveGrp = {};
    Db.rows('Rujukan').forEach(function (r) { haveGrp[Util.str(r.Kumpulan)] = true; });
    var addR = Seed.rujukan().filter(function (r) { return !haveGrp[r.Kumpulan]; });
    if (addR.length) { appendMany_('Rujukan', addR); log.push('Rujukan: ' + addR.length + ' baris ditambah (kumpulan baharu)'); }
    var plan = [
      ['Lot', Seed.lot], ['Rubrik', Seed.rubrik], ['KADAR', Seed.kadar]
    ];
    plan.forEach(function (p) {
      if (isEmpty_(p[0])) { var rows = p[1](); appendMany_(p[0], rows); log.push(p[0] + ': ' + rows.length + ' baris awal'); }
    });
    if (Mode.isUji() && isEmpty_('PELAJAR')) {
      var pc = Seed.pelajarContoh();
      appendMany_('PELAJAR', pc);
      log.push('MOD UJI: ' + pc.length + ' pelajar contoh rekaan ditambah');
    }
    // Data awal modul (pilihan): setiap modul boleh menyediakan seed(appendMany, isEmpty, log)
    [typeof RuangNiaga !== 'undefined' ? RuangNiaga : null, typeof Kewangan !== 'undefined' ? Kewangan : null,
     typeof Makerspace !== 'undefined' ? Makerspace : null].forEach(function (m) {
      if (m && typeof m.seed === 'function') m.seed(appendMany_, isEmpty_, log);
    });
    Cfg.invalidate();
    Admins.invalidate();
    Ref.invalidate();
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

  /**
   * Lengkapkan No. KP (dan matrik pemilik) pada rekod sedia ada. semula=true menyegerak semula semua rekod
   * (contoh selepas No. KP dalam PELAJAR dikemas kini). Pulang bilangan baris dikemas kini.
   */
  function isiNoKp_(semula) {
    var n = 0;
    Db.reset();
    Object.keys(TAB_SS).forEach(function (tab) {
      var cfg = Db.kpCfg(tab);
      if (!cfg) return;
      try { Db.sheet(tab); } catch (e) { return; }
      Db.rows(tab).forEach(function (r) {
        if (!semula && Util.str(r[cfg.kp])) return;
        var m = Util.normMatric(r[cfg.mc]);
        if (!m && !(cfg.byPer && Util.str(r.ID_Perniagaan))) return;
        var o = {};
        Object.keys(r).forEach(function (k) { o[k] = r[k]; });
        if (semula) o[cfg.kp] = '';
        var before = Util.str(r[cfg.kp]) + '|' + Util.str(r[cfg.mc]);
        if (Db.fillKp(tab, o) && (Util.str(o[cfg.kp]) + '|' + Util.str(o[cfg.mc])) !== before) {
          var patch = {}; patch[cfg.kp] = o[cfg.kp]; patch[cfg.mc] = o[cfg.mc];
          Db.update(tab, r._row, patch);
          n++;
        }
      });
    });
    return n;
  }

  function run_() {
    var t0 = new Date().getTime();
    var log = [];
    var timeUp = function () { return new Date().getTime() - t0 > LIMIT_MS; };
    var result = function (selesai) { return { selesai: selesai, mod: Mode.current(), langkah: log, masalah: [] }; };

    log.push('Mod: ' + Mode.current() + (Db.props().getProperty(PROPS.MODE) ? '' : ' (MODE belum ditetapkan, anggap UJI)'));
    var ind = indukSs_();
    log.push('Induk: ' + ind.getName() + ' (' + ind.getUrl() + ')');

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

    Db.reset();
    namakanSemula_(ind, parent, log);

    // 5. Data awal
    if (timeUp()) { log.push('Masa hampir habis. Jalankan setup() sekali lagi.'); return result(false); }
    seed_(log);

    // 5b. No. KP gandingan bagi rekod sedia ada
    var nKp = isiNoKp_(false);
    if (nKp) log.push('No. KP dilengkapkan pada ' + nKp + ' baris');

    // 6. Pengesah
    var v = validate_();
    var r = result(true);
    r.masalah = v.masalah;
    log.push('Pengesahan struktur: ' + (v.ok ? 'OK' : 'ADA MASALAH') + ' (' + v.spreadsheet + ' spreadsheet, ' + v.tab + ' tab)');
    if (Mode.isUji() && !Cfg.get('PENGUJI_EMEL', '')) log.push('INGAT: isi Tetapan PENGUJI_EMEL (emel penguji) supaya OTP boleh dihantar dalam MOD UJI.');
    if (!Cfg.get('WEBAPP_URL', '')) log.push('INGAT: isi Tetapan WEBAPP_URL selepas deploy.');
    return r;
  }

  return { run: run_, validate: validate_, ensureTabs: ensureTabs_, isiNoKp: isiNoKp_ };
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

/**
 * Tukar ke PRODUKSI dengan Induk baharu yang bersih. Jalankan dari editor, kemudian jalankan setup().
 * Induk UJI lama kekal dalam Drive (tidak dipadam). Selamat dijalankan semula.
 */
function tetapPengeluaran() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty(PROPS.MODE, MODE.PRODUKSI);
  p.deleteProperty(PROPS.INDUK_ID);
  CacheService.getScriptCache().removeAll(['links', 'cfg', 'admins', 'ruj']);
  Logger.log('MODE = PRODUKSI. INDUK_ID dipadam (Induk lama kekal dalam Drive). Sekarang jalankan setup().');
}

/** Segerak semula No. KP semua rekod daripada PELAJAR (jalankan dari editor selepas mengimport No. KP baharu). */
function isiNoKp() {
  var n = Setup.isiNoKp(true);
  Logger.log('No. KP disegerakkan pada ' + n + ' baris');
  return n;
}


// ===== Sijil.gs =====
/**
 * SHAMS: penjanaan sijil SSU (PDF) daripada templat Google Slides.
 * Templat dibaca dari Drive pada masa penjanaan (Link_Dokumen: TEMPLAT_SIJIL_SSU). Penanda boleh ditulis
 * [nama_syarikat] (templat semasa) atau {{NAMA_PERNIAGAAN}}. Penanda tidak dikenali dibiarkan dan dilaporkan.
 */

var Sijil = (function () {
  /** [penanda kecil, penanda besar, kunci data] */
  var PENANDA = [
    ['nama_syarikat', 'NAMA_PERNIAGAAN', 'namaSyarikat'],
    ['no_sijil', 'NO_PENDAFTARAN', 'noPendaftaran'],
    ['tarikh_daftar', 'TARIKH_PENDAFTARAN', 'tarikhDaftar'],
    ['alamat_berdaftar', 'ALAMAT_PERNIAGAAN', 'alamat'],
    ['kod_kursus', 'KOD_SUBJEK', 'kodKursus'],
    ['nama_ahli', 'SENARAI_AHLI', 'namaAhli'],
    ['bil_ahli', 'JUMLAH_AHLI', 'bilAhli'],
    ['tarikh_tamat', 'TEMPOH_SAH_LAKU', 'tarikhTamat']
  ];
  var LEFTOVER = /\[[a-z_]{3,}\]|\{\{[A-Z_]{3,}\}\}/g;

  function templatId_() {
    var l = Db.links().TEMPLAT_SIJIL_SSU;
    return l && l.id ? l.id : '';
  }

  /** Teks yang akan menggantikan penanda. d: {namaSyarikat, noPendaftaran, tarikhDaftar, tarikhTamat, alamat, kodKursus, ahli[]} */
  function nilai_(d) {
    return {
      namaSyarikat: d.namaSyarikat,
      noPendaftaran: d.noPendaftaran,
      tarikhDaftar: Util.fmtTarikhBM(d.tarikhDaftar),
      alamat: d.alamat,
      kodKursus: d.kodKursus || '-',
      namaAhli: d.ahli.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n'),
      bilAhli: String(d.ahli.length),
      tarikhTamat: Util.fmtTarikhBM(d.tarikhTamat)
    };
  }

  function leftover_(pres) {
    var found = {};
    try {
      pres.getSlides().forEach(function (sl) {
        sl.getPageElements().forEach(function (pe) {
          var txt = '';
          try { txt = pe.asShape().getText().asString(); } catch (e) { return; }
          (txt.match(LEFTOVER) || []).forEach(function (m) { found[m] = true; });
        });
      });
    } catch (e) { /* abaikan; amaran sahaja */ }
    return Object.keys(found);
  }

  /**
   * Jana PDF sijil. Pulang {url, amaran:[..]}. Lempar SIJIL_TEMPLAT_TIADA jika templat tidak boleh dibuka.
   */
  function jana_(d) {
    var tid = templatId_();
    if (!tid) throw appError_('SIJIL_TEMPLAT_TIADA');
    var fl = Db.links().FLD_SIJIL_SSU;
    if (!fl || !fl.id) throw appError_('SETUP_TIADA_LINK', { kod: 'FLD_SIJIL_SSU' });
    var folder = DriveApp.getFolderById(fl.id);
    var copy;
    try { copy = DriveApp.getFileById(tid).makeCopy('~sementara ' + d.noPendaftaran, folder); } catch (e) {
      console.error('Templat sijil tidak boleh dibuka: ' + e);
      throw appError_('SIJIL_TEMPLAT_TIADA');
    }
    var amaran = [], pdfUrl;
    try {
      var pres = SlidesApp.openById(copy.getId());
      var v = nilai_(d);
      PENANDA.forEach(function (p) {
        var text = String(v[p[2]]);
        pres.replaceAllText('[' + p[0] + ']', text, true);
        pres.replaceAllText('{{' + p[1] + '}}', text, true);
      });
      pres.saveAndClose();
      var left = leftover_(SlidesApp.openById(copy.getId()));
      if (left.length) amaran.push('Penanda tidak dikenali dalam templat (dibiarkan): ' + left.join(', '));
      var blob = copy.getAs('application/pdf');
      var name = 'Sijil SSU ' + d.noPendaftaran + '.pdf';
      blob.setName(name);
      var file = folder.createFile(blob);
      file.setName(name);
      pdfUrl = file.getUrl();
    } finally {
      try { copy.setTrashed(true); } catch (e) { console.error('Salinan sementara tidak dapat dipadam: ' + e); }
    }
    return { url: pdfUrl, amaran: amaran };
  }

  return { jana: jana_, nilai: nilai_ };
})();


// ===== Ssu.gs =====
/**
 * SHAMS: pendaftaran Syarikat Pemula Pelajar (SSU), peringkat 2.
 * Pelajar memohon (perlu profiling lengkap), admin menyemak dan memutuskan, kelulusan mencipta Perniagaan dan sijil PDF.
 * Pembaharuan: permohonan baharu berjenis "Pembaharuan" bagi Perniagaan sedia ada (nombor asal, akhiran kali sijil).
 * Admin boleh mendaftar SSU sedia ada (terus diluluskan).
 */

var Ssu = (function () {
  var AKTIF = ['Baharu', 'Disemak', 'Perlu Pembetulan'];
  var JENIS_SSU = ['Perniagaan', 'Startup'];
  var SUBJEK_WAJIB = ['UBSS1032', 'ULRS3032', 'MFMS1143', 'SBSF1023'];

  // ---------- Capaian data ----------
  function appRow_(id) {
    var l = Db.find('Permohonan_SSU', function (r) { return Util.str(r.ID_Permohonan) === id; });
    return l.length ? l[0] : null;
  }
  function ahliOf_(id) {
    return Db.find('Ahli_Pasukan', function (r) { return Util.str(r.ID_Permohonan) === id; });
  }
  function pelajarRow_(m) {
    var l = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    return l.length ? l[0] : null;
  }
  function perniagaanById_(id) {
    var l = Db.find('Perniagaan', function (r) { return Util.str(r.ID_Perniagaan) === id; });
    return l.length ? l[0] : null;
  }
  /** Perniagaan milik pemilik (Aktif atau Tamat Tempoh). */
  function perniagaanOwner_(m) {
    var l = Db.find('Perniagaan', function (r) { return Util.normMatric(r.No_Matrik_Pemilik) === m; });
    return l.length ? l[l.length - 1] : null;
  }
  function activeApp_(m) {
    var l = Db.find('Permohonan_SSU', function (r) {
      return Util.normMatric(r.No_Matrik_Pemilik) === m && AKTIF.indexOf(Util.str(r.Status)) >= 0;
    });
    return l.length ? l[0] : null;
  }
  function emelOf_(m) {
    var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    if (pg.length && Util.str(pg[0].Emel)) return Util.normEmail(pg[0].Emel);
    var p = pelajarRow_(m);
    return p ? Util.normEmail(p.Emel) : '';
  }
  function csv_(a) { return (a || []).join(','); }
  function split_(s) { return Util.str(s) ? Util.str(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }
  function today_() { return Util.toDate(Util.dateKey(new Date())); }
  function normName_(s) { return Util.str(s).toUpperCase().replace(/\s+/g, ' '); }

  function hariBaki_(per) {
    var t = Util.toDate(per.Tarikh_Tamat);
    return t ? Util.daysBetween(new Date(), t) : null;
  }

  /** Status SSU semasa bagi Perniagaan (dikira daripada tarikh, bukan semata-mata lajur). */
  function statusPer_(per) {
    var h = hariBaki_(per);
    if (h !== null && h < 0) return 'Tamat Tempoh';
    return Util.str(per.Status_SSU) || 'Aktif';
  }

  // ---------- Pengesahan ----------
  /**
   * Semak medan permohonan. opts: {admin, pemilik(matric), kecualiPerniagaan(id), kecualiPermohonan(id)}.
   * Pulang {nilai, ralat}. Fail disemak berasingan.
   */
  function check_(d, opts) {
    opts = opts || {};
    var e = {}, v = {};
    var bad = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var one = function (k, val, group) { if (!Ref.has(group, val)) bad(k, 'Pilihan tidak sah / Invalid choice'); };
    var many = function (k, arr, group, min) {
      arr = Array.isArray(arr) ? arr.map(String) : [];
      var u = arr.filter(function (x, i) { return arr.indexOf(x) === i; });
      if (u.length < min) bad(k);
      u.forEach(function (x) { if (!Ref.has(group, x)) bad(k, 'Pilihan tidak sah / Invalid choice'); });
      return u;
    };
    var admin = !!opts.admin;

    v.jenisSsu = Util.str(d.jenisSsu) || 'Perniagaan';
    if (JENIS_SSU.indexOf(v.jenisSsu) < 0) bad('jenisSsu', 'Pilihan tidak sah / Invalid choice');

    v.nama = normName_(d.nama);
    if (!/^[A-Z0-9 &.,\-'()\/]{3,120}$/.test(v.nama)) bad('nama', 'Nama 3 hingga 120 aksara (huruf, nombor dan tanda baca biasa) / 3 to 120 characters');
    else if (/\bUTM\b|UNIVERSITI TEKNOLOGI MALAYSIA/.test(v.nama)) bad('nama', 'Nama tidak boleh mengandungi UTM / The name cannot contain UTM');
    else {
      var dup = Db.find('Perniagaan', function (r) {
        return normName_(r.Nama_Perniagaan) === v.nama && Util.str(r.ID_Perniagaan) !== (opts.kecualiPerniagaan || '');
      });
      var dup2 = Db.find('Permohonan_SSU', function (r) {
        return normName_(r.Nama_Perniagaan) === v.nama && AKTIF.indexOf(Util.str(r.Status)) >= 0 &&
          Util.str(r.ID_Permohonan) !== (opts.kecualiPermohonan || '');
      });
      if (dup.length || dup2.length) bad('nama', 'Nama ini sudah digunakan / This name is already in use');
    }

    v.produk = many('produk', d.produk, 'PRODUK', admin ? 0 : 1);
    if (v.produk.length > 5) bad('produk', 'Maksimum 5 pilihan / Maximum 5 choices');

    v.syarat = Util.str(d.syaratSubjek) || (admin ? 'TIADA' : '');
    one('syaratSubjek', v.syarat, 'SYARAT_SUBJEK');
    v.pensyarah = Util.str(d.pensyarah).substr(0, 120);
    v.seksyen = Util.str(d.seksyen).substr(0, 20);
    v.kumpulan = Util.str(d.kumpulan).substr(0, 40);
    if (!admin && SUBJEK_WAJIB.indexOf(v.syarat) >= 0) {
      if (!v.pensyarah) bad('pensyarah');
      if (!v.seksyen) bad('seksyen');
      if (!v.kumpulan) bad('kumpulan');
    }

    v.statusSsm = Util.str(d.statusSsm) || (admin ? 'PROSES' : '');
    one('statusSsm', v.statusSsm, 'STATUS_SSM');
    v.noSsm = Util.str(d.noSsm).substr(0, 30);
    if (v.statusSsm === 'YA' && !admin && !/^[A-Za-z0-9\-\/() ]{5,30}$/.test(v.noSsm)) bad('noSsm', 'No. SSM tidak sah / Invalid SSM number');

    v.jenisPerniagaan = Util.str(d.jenisPerniagaan);
    one('jenisPerniagaan', v.jenisPerniagaan, 'JENIS_PERNIAGAAN');
    v.kluster = Util.str(d.kluster);
    one('kluster', v.kluster, 'KLUSTER');
    v.sumber = many('sumber', d.sumber, 'SUMBER_PEMBIAYAAN', admin ? 0 : 1);

    v.modal = Util.parseRm(d.modal);
    v.pendapatan = Util.parseRm(d.pendapatan);
    if (v.modal === null && !(admin && Util.str(d.modal) === '')) bad('modal', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    if (v.pendapatan === null && !(admin && Util.str(d.pendapatan) === '')) bad('pendapatan', 'Masukkan nilai RM yang tepat / Enter an exact RM value');

    v.alamat = Util.str(d.alamat).replace(/\s+/g, ' ');
    if (v.alamat.length < 10 || v.alamat.length > 300) bad('alamat', 'Alamat 10 hingga 300 aksara / Address of 10 to 300 characters');
    else {
      var pel = pelajarRow_(opts.pemilik || '');
      var kolej = pel ? Util.str(pel.Alamat_Kolej).toLowerCase().replace(/\s+/g, ' ') : '';
      if (/\bUTM\b|UNIVERSITI TEKNOLOGI MALAYSIA/i.test(v.alamat) || /\b(kolej|college|fakulti|faculty|kediaman pelajar|residential college)\b/i.test(v.alamat) ||
          (kolej && v.alamat.toLowerCase() === kolej)) {
        bad('alamat', 'Alamat mesti alamat perniagaan sebenar, bukan kolej, fakulti atau UTM / Use the actual business address, not a college, faculty or UTM');
      }
    }

    v.tarikhMula = Util.str(d.tarikhMula);
    if (v.tarikhMula) {
      var tm = /^\d{4}-\d{2}-\d{2}$/.test(v.tarikhMula) ? Util.toDate(v.tarikhMula) : null;
      if (!tm || tm.getUTCFullYear() < 1990 || Util.daysBetween(new Date(), tm) > 365) bad('tarikhMula', 'Tarikh tidak sah / Invalid date');
    } else if (!admin) bad('tarikhMula');

    v.laman = Util.str(d.laman).substr(0, 300);

    // Ahli (selain pemilik)
    var maks = Cfg.num('MAKS_AHLI_SSU', 12);
    var raw = Array.isArray(d.ahli) ? d.ahli.map(Util.normMatric).filter(Boolean) : [];
    v.ahli = [];
    var seen = {};
    raw.forEach(function (m) {
      if (seen[m]) { bad('ahli', 'No. Matrik pendua: ' + m + ' / Duplicate matric number'); return; }
      seen[m] = true;
      if (m === opts.pemilik) { bad('ahli', 'Pemilik tidak perlu dimasukkan sebagai rakan kongsi / The owner must not be added as a partner'); return; }
      var p = pelajarRow_(m);
      if (!p) { bad('ahli', 'No. Matrik tidak ditemui: ' + m + ' / Matric number not found'); return; }
      var st = Util.str(p.Status_Pelajar);
      if (st && st.toLowerCase() !== 'aktif') { bad('ahli', 'Pelajar tidak aktif: ' + m + ' / Student is not active'); return; }
      v.ahli.push(m);
    });
    if (v.ahli.length + 1 > maks) bad('ahli', 'Maksimum ' + maks + ' ahli termasuk pemilik / Maximum ' + maks + ' members including the owner');

    if (!admin && d.perakuan !== true) bad('perakuan', 'Perakuan wajib / The declaration is required');
    return { nilai: v, ralat: e };
  }

  function validateFiles_(d, v, existing, admin) {
    var out = { ssm: null, maklumat: null }, e = {};
    var allow = ['pdf', 'jpg', 'jpeg', 'png'];
    var chk = function (key, f) {
      try { out[key] = Files.validate(f, allow); } catch (err) { e[key === 'ssm' ? 'failSsm' : 'failMaklumat'] = 'Fail tidak sah (PDF/JPG/PNG, saiz dihadkan) / Invalid file'; }
    };
    if (d.failSsm && d.failSsm.data) chk('ssm', d.failSsm);
    if (d.failMaklumat && d.failMaklumat.data) chk('maklumat', d.failMaklumat);
    if (v.statusSsm === 'YA' && !admin && !out.ssm && !existing.ssm && !e.failSsm) e.failSsm = 'Muat naik sijil SSM / Upload the SSM certificate';
    return { fail: out, ralat: e };
  }

  // ---------- Pemetaan baris -> paparan ----------
  function formOf_(r, ahli) {
    var pemilik = Util.normMatric(r.No_Matrik_Pemilik);
    return {
      id: Util.str(r.ID_Permohonan), jenisSsu: Util.str(r.Jenis_SSU), jenisPermohonan: Util.str(r.Jenis_Permohonan),
      perniagaanId: Util.str(r.ID_Perniagaan), noMatrikPemilik: pemilik,
      nama: Util.str(r.Nama_Perniagaan), produk: split_(r.Produk), syaratSubjek: Util.str(r.Syarat_Subjek),
      pensyarah: Util.str(r.Pensyarah), seksyen: Util.str(r.Seksyen), kumpulan: Util.str(r.Kumpulan),
      statusSsm: Util.str(r.Status_SSM), noSsm: Util.str(r.No_SSM),
      jenisPerniagaan: Util.str(r.Jenis_Perniagaan), kluster: Util.str(r.Kluster), sumber: split_(r.Sumber_Pembiayaan),
      modal: Util.str(r.Modal_RM), pendapatan: Util.str(r.Pendapatan_Bulanan_RM), alamat: Util.str(r.Alamat_Perniagaan),
      tarikhMula: Util.dateKey(r.Tarikh_Mula_Perniagaan), laman: Util.str(r.Laman_Media_Sosial),
      ahli: ahli.filter(function (a) { return Util.normMatric(a.No_Matrik) !== pemilik; }).map(function (a) { return Util.normMatric(a.No_Matrik); }),
      failSsmAda: !!Util.str(r.Fail_SSM), failMaklumatAda: !!Util.str(r.Fail_Maklumat_SSM)
    };
  }

  function ringkas_(r) {
    var st = Util.str(r.Status);
    return {
      id: Util.str(r.ID_Permohonan), jenisSsu: Util.str(r.Jenis_SSU), jenisPermohonan: Util.str(r.Jenis_Permohonan),
      nama: Util.str(r.Nama_Perniagaan), status: st, tarikhHantar: Util.dateKey(r.Tarikh_Hantar),
      tarikhKeputusan: Util.dateKey(r.Tarikh_Keputusan),
      catatan: (st === 'Perlu Pembetulan' || st === 'Ditolak') ? Util.str(r.Catatan_Admin) : '',
      noPendaftaran: Util.str(r.No_Pendaftaran), adaSijil: !!Util.str(r.Pautan_Sijil), bilAhli: Number(r.Bil_Ahli) || 0,
      bolehUbah: st === 'Perlu Pembetulan'
    };
  }

  function perniagaanView_(per) {
    var h = hariBaki_(per);
    var st = statusPer_(per);
    var awal = Cfg.num('SSU_PEMBAHARUAN_AWAL_HARI', 60);
    return {
      id: Util.str(per.ID_Perniagaan), nama: Util.str(per.Nama_Perniagaan), noPendaftaran: Util.str(per.No_Pendaftaran),
      tarikhDaftar: Util.dateKey(per.Tarikh_Pendaftaran), tarikhTamat: Util.dateKey(per.Tarikh_Tamat), hariBaki: h,
      status: st, bilSijil: Number(per.Bil_Sijil) || 1,
      bolehPerbaharui: h !== null && h <= awal
    };
  }

  // ---------- Pelajar ----------
  function requireStudent_(ctx) {
    if (!ctx.noMatrik) throw appError_('MATRIK_TIDAK_DITEMUI');
  }

  function saya_(ctx) {
    requireStudent_(ctx);
    var m = ctx.noMatrik;
    var ps = Profiling.status(m);
    var milik = Db.find('Permohonan_SSU', function (r) { return Util.normMatric(r.No_Matrik_Pemilik) === m; });
    milik.sort(function (a, b) { return (Util.toDate(b.Tarikh_Hantar) || 0) - (Util.toDate(a.Tarikh_Hantar) || 0); });
    var ids = {};
    Db.find('Ahli_Pasukan', function (r) { return Util.normMatric(r.No_Matrik) === m; }).forEach(function (a) { ids[Util.str(a.ID_Permohonan)] = true; });
    var sertaan = Db.find('Permohonan_SSU', function (r) {
      return ids[Util.str(r.ID_Permohonan)] && Util.normMatric(r.No_Matrik_Pemilik) !== m;
    }).map(function (r) {
      var o = ringkas_(r);
      var pel = pelajarRow_(Util.normMatric(r.No_Matrik_Pemilik));
      o.pemilik = pel ? Util.str(pel.Nama_Penuh) : '';
      o.bolehUbah = false; o.catatan = '';
      return o;
    });
    var per = perniagaanOwner_(m);
    var aktif = activeApp_(m);
    return {
      profil: ps,
      permohonan: milik.map(ringkas_),
      sertaan: sertaan,
      perniagaan: per ? perniagaanView_(per) : null,
      boleh: {
        mohonBaharu: ps.lengkap && !aktif && !per,
        perbaharui: !!per && !aktif && perniagaanView_(per).bolehPerbaharui
      },
      had: { maksAhli: Cfg.num('MAKS_AHLI_SSU', 12) }
    };
  }

  /** Data untuk mengisi borang: ubah (id) atau pembaharuan (perniagaanId). */
  function dapat_(ctx, p) {
    requireStudent_(ctx);
    var m = ctx.noMatrik;
    var pel = pelajarRow_(m);
    var out = { pemilik: pel ? { noMatrik: m, nama: Util.str(pel.Nama_Penuh), fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program) } : null };
    if (p.id) {
      var r = appRow_(Util.str(p.id));
      if (!r || Util.normMatric(r.No_Matrik_Pemilik) !== m) throw appError_('SSU_TIDAK_DITEMUI');
      out.borang = formOf_(r, ahliOf_(Util.str(r.ID_Permohonan)));
      out.status = Util.str(r.Status);
      out.catatan = Util.str(r.Catatan_Admin);
    } else if (p.perniagaanId) {
      var per = perniagaanById_(Util.str(p.perniagaanId));
      if (!per || Util.normMatric(per.No_Matrik_Pemilik) !== m) throw appError_('SSU_TIDAK_DITEMUI');
      var last = Db.find('Permohonan_SSU', function (x) {
        return Util.str(x.ID_Perniagaan) === Util.str(per.ID_Perniagaan) && Util.str(x.Status) === 'Diluluskan';
      });
      if (!last.length) throw appError_('SSU_TIDAK_DITEMUI');
      var lr = last[last.length - 1];
      out.borang = formOf_(lr, ahliOf_(Util.str(lr.ID_Permohonan)));
      out.borang.id = ''; out.borang.jenisPermohonan = 'Pembaharuan'; out.borang.perniagaanId = Util.str(per.ID_Perniagaan);
    }
    return out;
  }

  function sendMail_(to, subjectBm, subjectEn, bm, en) {
    if (!to) return;
    try {
      var url = Cfg.get('WEBAPP_URL', '');
      if (url) { bm = bm.concat(['Buka SHAMS: ' + url]); en = en.concat(['Open SHAMS: ' + url]); }
      Mail.send(to, { subjectBm: subjectBm, subjectEn: subjectEn, bm: bm, en: en });
    } catch (err) { console.error('Emel gagal: ' + err); }
  }

  function hantar_(ctx, d) {
    requireStudent_(ctx);
    d = d || {};
    var m = ctx.noMatrik;
    if (!Profiling.status(m).lengkap) throw appError_('PROFIL_LENGKAP_DULU');

    var mode = 'baharu', cur = null, per = null;
    if (d.id) {
      mode = 'ubah';
      cur = appRow_(Util.str(d.id));
      if (!cur || Util.normMatric(cur.No_Matrik_Pemilik) !== m) throw appError_('SSU_TIDAK_DITEMUI');
      if (Util.str(cur.Status) !== 'Perlu Pembetulan') throw appError_('SSU_TIDAK_BOLEH_UBAH');
      if (Util.str(cur.ID_Perniagaan)) per = perniagaanById_(Util.str(cur.ID_Perniagaan));
    } else if (d.perniagaanId) {
      mode = 'baharuan';
      per = perniagaanById_(Util.str(d.perniagaanId));
      if (!per || Util.normMatric(per.No_Matrik_Pemilik) !== m) throw appError_('SSU_TIDAK_DITEMUI');
      if (!perniagaanView_(per).bolehPerbaharui) throw appError_('SSU_TIDAK_BOLEH_PERBAHARUI');
      if (activeApp_(m)) throw appError_('SSU_SUDAH_ADA');
    } else {
      if (activeApp_(m) || perniagaanOwner_(m)) throw appError_('SSU_SUDAH_ADA');
    }

    var chk = check_(d, {
      pemilik: m,
      kecualiPerniagaan: per ? Util.str(per.ID_Perniagaan) : '',
      kecualiPermohonan: cur ? Util.str(cur.ID_Permohonan) : ''
    });
    var v = chk.nilai;
    var existing = { ssm: cur ? Util.str(cur.Fail_SSM) : '', maklumat: cur ? Util.str(cur.Fail_Maklumat_SSM) : '' };
    if (mode === 'baharuan') {
      var prev = Db.find('Permohonan_SSU', function (x) { return Util.str(x.ID_Perniagaan) === Util.str(per.ID_Perniagaan) && Util.str(x.Status) === 'Diluluskan'; });
      if (prev.length) { existing.ssm = Util.str(prev[prev.length - 1].Fail_SSM); existing.maklumat = Util.str(prev[prev.length - 1].Fail_Maklumat_SSM); }
    }
    var fv = validateFiles_(d, v, existing, false);
    var ralat = chk.ralat;
    Object.keys(fv.ralat).forEach(function (k) { ralat[k] = fv.ralat[k]; });
    if (Object.keys(ralat).length) throw appError_('SSU_TIDAK_SAH', { medan: ralat });

    var now = new Date();
    var tahun = parseInt(Util.fmtDate(now, 'yyyy'), 10);
    var stamp = Util.fmtDate(now, 'yyyyMMddHHmm');
    var idTmp = cur ? Util.str(cur.ID_Permohonan) : 'baharu';
    var urlSsm = existing.ssm, urlMak = existing.maklumat;
    if (fv.fail.ssm) urlSsm = Files.save('FLD_LAMPIRAN_SSU', 'SSM_' + m + '_' + idTmp + '_' + stamp, fv.fail.ssm);
    if (fv.fail.maklumat) urlMak = Files.save('FLD_LAMPIRAN_SSU', 'MAKLUMAT_' + m + '_' + idTmp + '_' + stamp, fv.fail.maklumat);

    return Db.withLock(function () {
      // semak semula dalam kunci (elak permohonan berganda)
      if (mode !== 'ubah' && activeApp_(m)) throw appError_('SSU_SUDAH_ADA');
      if (mode === 'baharu' && perniagaanOwner_(m)) throw appError_('SSU_SUDAH_ADA');
      var id = cur ? Util.str(cur.ID_Permohonan) : Util.formatId('SSU', tahun, Db.nextSeqLocked('SSU_' + tahun), 4);
      var rec = {
        ID_Permohonan: id, Jenis_SSU: v.jenisSsu,
        Jenis_Permohonan: mode === 'baharuan' ? 'Pembaharuan' : (cur ? Util.str(cur.Jenis_Permohonan) : 'Baharu'),
        ID_Perniagaan: per ? Util.str(per.ID_Perniagaan) : '', No_Matrik_Pemilik: m, Nama_Perniagaan: v.nama,
        Produk: csv_(v.produk), Syarat_Subjek: v.syarat, Pensyarah: v.pensyarah, Seksyen: v.seksyen, Kumpulan: v.kumpulan,
        Status_SSM: v.statusSsm, No_SSM: v.noSsm, Fail_SSM: urlSsm, Fail_Maklumat_SSM: urlMak,
        Jenis_Perniagaan: v.jenisPerniagaan, Kluster: v.kluster, Sumber_Pembiayaan: csv_(v.sumber),
        Modal_RM: v.modal, Pendapatan_Bulanan_RM: v.pendapatan, Alamat_Perniagaan: v.alamat,
        Tarikh_Mula_Perniagaan: v.tarikhMula ? Util.toDate(v.tarikhMula) : '', Laman_Media_Sosial: v.laman,
        Bil_Ahli: v.ahli.length + 1, Status: 'Baharu', Tarikh_Hantar: now, Tarikh_Keputusan: ''
      };
      if (cur) Db.update('Permohonan_SSU', cur._row, rec); else Db.append('Permohonan_SSU', rec);
      writeAhli_(id, m, v.ahli);
      Audit.log(ctx, cur ? 'HANTAR_SEMULA_SSU' : (mode === 'baharuan' ? 'MOHON_PEMBAHARUAN_SSU' : 'MOHON_SSU'), 'SSU', id, cur ? Util.str(cur.Status) : '', 'Baharu', ctx.bagiPihak ? 'Perakuan diakui admin bagi pihak pemohon' : 'Perakuan pemohon diterima');
      sendMail_(emelOf_(m), 'Permohonan SSU diterima', 'SSU application received',
        ['Permohonan SSU anda (' + id + ', ' + v.nama + ') telah diterima dan akan disemak oleh UTMXCITE.'],
        ['Your SSU application (' + id + ', ' + v.nama + ') has been received and will be reviewed by UTMXCITE.']);
      return { id: id, ringkasan: saya_(ctx) };
    });
  }

  /** Tulis semula baris Ahli_Pasukan bagi satu permohonan (pemilik dahulu). */
  function writeAhli_(id, pemilik, ahli) {
    var keep = Db.rows('Ahli_Pasukan').filter(function (r) { return Util.str(r.ID_Permohonan) !== id; });
    [pemilik].concat(ahli).forEach(function (m, i) {
      var p = pelajarRow_(m) || {};
      keep.push({
        ID_Permohonan: id, No_Matrik: m, Nama: Util.str(p.Nama_Penuh), Fakulti: Util.str(p.Fakulti), Jantina: Util.str(p.Jantina),
        Etnik: Util.str(p.Etnik), Tahun: Util.str(p.Tahun_Pengajian), Peranan_Ahli: i === 0 ? 'Pemilik' : 'Ahli'
      });
    });
    Db.replaceAll('Ahli_Pasukan', keep);
  }

  // ---------- Muat turun fail ----------
  function fail_(ctx, p) {
    var r = appRow_(Util.str(p.id));
    if (!r) throw appError_('SSU_TIDAK_DITEMUI');
    var jenis = Util.str(p.jenis);
    var admin = ADMIN_ROLES.indexOf(ctx.role) >= 0 && ctx.role !== ROLE.PENILAI;
    var owner = ctx.noMatrik && Util.normMatric(r.No_Matrik_Pemilik) === ctx.noMatrik;
    var member = false;
    if (ctx.noMatrik && !owner) {
      member = ahliOf_(Util.str(r.ID_Permohonan)).some(function (a) { return Util.normMatric(a.No_Matrik) === ctx.noMatrik; });
    }
    var url;
    if (jenis === 'sijil') {
      if (!(admin || owner || member)) throw appError_('TIADA_KEBENARIAN');
      url = Util.str(r.Pautan_Sijil);
      if (!url) throw appError_('SIJIL_TIADA');
    } else if (jenis === 'ssm' || jenis === 'maklumat') {
      if (!(admin || owner)) throw appError_('TIADA_KEBENARIAN');
      url = Util.str(jenis === 'ssm' ? r.Fail_SSM : r.Fail_Maklumat_SSM);
      if (!url) throw appError_('FAIL_TIDAK_DITEMUI');
    } else throw appError_('FAIL_TIDAK_DITEMUI');
    if (admin) Audit.log(ctx, 'PAPAR_FAIL_SSU', 'SSU', Util.str(r.ID_Permohonan), '', jenis, '');
    return Files.read(url);
  }

  // ---------- Admin ----------
  function requireViewer_(ctx) {
    if (ctx.role === ROLE.PENILAI) throw appError_('TIADA_KEBENARIAN');
  }
  function requireDecider_(ctx) {
    if (ctx.role === ROLE.ADMIN_PENUH) return;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      if (!mod || mod.indexOf('semua') >= 0 || mod.indexOf('ssu') >= 0) return;
    }
    throw appError_('TIADA_KEBENARIAN');
  }

  function adminSenarai_(ctx, p) {
    requireViewer_(ctx);
    p = p || {};
    var status = Util.str(p.status);
    var q = Util.str(p.q).toLowerCase();
    var all = Db.rows('Permohonan_SSU');
    var kiraan = { Baharu: 0, Disemak: 0, 'Perlu Pembetulan': 0, Diluluskan: 0, Ditolak: 0 };
    all.forEach(function (r) { var s = Util.str(r.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var rows = all.filter(function (r) {
      if (status && status !== 'SEMUA' && Util.str(r.Status) !== status) return false;
      if (q) {
        var h = (Util.str(r.ID_Permohonan) + ' ' + Util.str(r.Nama_Perniagaan) + ' ' + Util.str(r.No_Matrik_Pemilik) + ' ' + Util.str(r.No_Pendaftaran)).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) { return (Util.toDate(b.Tarikh_Hantar) || 0) - (Util.toDate(a.Tarikh_Hantar) || 0); });
    var senarai = rows.slice(0, 300).map(function (r) {
      var o = ringkas_(r);
      var pel = pelajarRow_(Util.normMatric(r.No_Matrik_Pemilik));
      o.pemilik = pel ? Util.str(pel.Nama_Penuh) : '';
      o.noMatrik = Util.normMatric(r.No_Matrik_Pemilik);
      return o;
    });
    var awal = Cfg.num('SSU_PEMBAHARUAN_AWAL_HARI', 60);
    var perniagaan = Db.rows('Perniagaan').map(perniagaanView_).filter(function (x) {
      return x.status === 'Tamat Tempoh' || (x.hariBaki !== null && x.hariBaki <= awal);
    }).sort(function (a, b) { return (a.hariBaki || 0) - (b.hariBaki || 0); });
    return { kiraan: kiraan, jumlah: rows.length, senarai: senarai, hampirTamat: perniagaan, bolehPutus: canDecide_(ctx) };
  }

  function canDecide_(ctx) {
    try { requireDecider_(ctx); return true; } catch (e) { return false; }
  }

  function adminButiran_(ctx, p) {
    requireViewer_(ctx);
    var r = appRow_(Util.str(p.id));
    if (!r) throw appError_('SSU_TIDAK_DITEMUI');
    var id = Util.str(r.ID_Permohonan);
    var ahli = ahliOf_(id);
    var f = formOf_(r, ahli);
    var m = f.noMatrikPemilik;
    var pel = pelajarRow_(m) || {};
    var pil = {
      noMatrik: m, nama: Util.str(pel.Nama_Penuh), emel: Util.str(pel.Emel), fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program),
      tahun: Util.str(pel.Tahun_Pengajian), telefon: Util.str(pel.No_Telefon), jantina: Util.str(pel.Jantina), etnik: Util.str(pel.Etnik),
      statusPelajar: Util.str(pel.Status_Pelajar)
    };
    if (ctx.role === ROLE.ADMIN_PENUH) pil.noKp = Util.str(pel.No_KP_Pasport);
    var amaran = [];
    if (f.statusSsm !== 'YA') amaran.push('Pendaftaran SSM: ' + Ref.bm('STATUS_SSM', f.statusSsm) + ' (bukan "Ya").');
    if (!Profiling.status(m).lengkap) amaran.push('Pemilik belum melengkapkan profiling.');
    if (pil.statusPelajar && pil.statusPelajar.toLowerCase() !== 'aktif') amaran.push('Status pemilik: ' + pil.statusPelajar + '.');
    ahli.forEach(function (a) {
      var am = Util.normMatric(a.No_Matrik);
      var lain = Db.find('Ahli_Pasukan', function (x) { return Util.normMatric(x.No_Matrik) === am && Util.str(x.ID_Permohonan) !== id; }).filter(function (x) {
        var o = appRow_(Util.str(x.ID_Permohonan));
        return o && (AKTIF.indexOf(Util.str(o.Status)) >= 0 || Util.str(o.Status) === 'Diluluskan');
      });
      if (lain.length) amaran.push(Util.str(a.Nama) + ' (' + am + ') juga ahli dalam SSU lain: ' + lain.map(function (x) { return Util.str(x.ID_Permohonan); }).join(', ') + '.');
    });
    var out = {
      borang: f,
      label: {
        produk: f.produk.map(function (k) { return Ref.bm('PRODUK', k); }),
        kluster: Ref.bm('KLUSTER', f.kluster), jenisPerniagaan: Ref.bm('JENIS_PERNIAGAAN', f.jenisPerniagaan),
        sumber: f.sumber.map(function (k) { return Ref.bm('SUMBER_PEMBIAYAAN', k); }),
        statusSsm: Ref.bm('STATUS_SSM', f.statusSsm), syarat: Ref.bm('SYARAT_SUBJEK', f.syaratSubjek)
      },
      pemilik: pil,
      ahli: ahli.map(function (a) {
        return { noMatrik: Util.normMatric(a.No_Matrik), nama: Util.str(a.Nama), fakulti: Util.str(a.Fakulti), jantina: Util.str(a.Jantina), etnik: Util.str(a.Etnik), tahun: Util.str(a.Tahun), peranan: Util.str(a.Peranan_Ahli) };
      }),
      status: Util.str(r.Status), ringkas: ringkas_(r), catatanAdmin: Util.str(r.Catatan_Admin),
      diluluskanOleh: Util.str(r.Diluluskan_Oleh), tarikhTamat: Util.dateKey(r.Tarikh_Tamat),
      fail: { ssm: !!Util.str(r.Fail_SSM), maklumat: !!Util.str(r.Fail_Maklumat_SSM), sijil: !!Util.str(r.Pautan_Sijil) },
      amaran: amaran, bolehPutus: canDecide_(ctx)
    };
    return out;
  }

  var PERALIHAN = {
    semak: { dari: ['Baharu'], ke: 'Disemak' },
    pembetulan: { dari: ['Baharu', 'Disemak'], ke: 'Perlu Pembetulan', catatan: true },
    tolak: { dari: ['Baharu', 'Disemak', 'Perlu Pembetulan'], ke: 'Ditolak', catatan: true }
  };

  function adminKeputusan_(ctx, p) {
    requireDecider_(ctx);
    var id = Util.str(p.id), t = Util.str(p.tindakan), cat = Util.str(p.catatan).substr(0, 500);
    if (t === 'lulus') return lulus_(ctx, id, cat, null);
    var rule = PERALIHAN[t];
    if (!rule) throw appError_('SSU_PERALIHAN_TIDAK_SAH');
    if (rule.catatan && !cat) throw appError_('SSU_CATATAN_WAJIB');
    var info = Db.withLock(function () {
      var r = appRow_(id);
      if (!r) throw appError_('SSU_TIDAK_DITEMUI');
      var lama = Util.str(r.Status);
      if (rule.dari.indexOf(lama) < 0) throw appError_('SSU_PERALIHAN_TIDAK_SAH');
      Db.update('Permohonan_SSU', r._row, {
        Status: rule.ke, Tarikh_Keputusan: t === 'semak' ? '' : new Date(), Catatan_Admin: cat || Util.str(r.Catatan_Admin)
      });
      Audit.log(ctx, 'SSU_' + t.toUpperCase(), 'SSU', id, lama, rule.ke, cat);
      return { m: Util.normMatric(r.No_Matrik_Pemilik), nama: Util.str(r.Nama_Perniagaan) };
    });
    if (t === 'pembetulan') {
      sendMail_(emelOf_(info.m), 'Permohonan SSU perlu dibetulkan', 'Your SSU application needs correction',
        ['Permohonan SSU anda (' + id + ', ' + info.nama + ') perlu dibetulkan. Catatan admin: ' + cat],
        ['Your SSU application (' + id + ', ' + info.nama + ') needs correction. Admin note: ' + cat]);
    } else if (t === 'tolak') {
      sendMail_(emelOf_(info.m), 'Permohonan SSU tidak diluluskan', 'Your SSU application was not approved',
        ['Permohonan SSU anda (' + id + ', ' + info.nama + ') tidak diluluskan. Catatan admin: ' + cat],
        ['Your SSU application (' + id + ', ' + info.nama + ') was not approved. Admin note: ' + cat]);
    }
    return adminButiran_(ctx, { id: id });
  }

  /** Lulus: cipta/kemas kini Perniagaan dan jana sijil. opts: {tarikhDaftar (Date)} bagi pendaftaran sedia ada. */
  function lulus_(ctx, id, catatan, opts) {
    opts = opts || {};
    var hasil = Db.withLock(function () {
      var r = appRow_(id);
      if (!r) throw appError_('SSU_TIDAK_DITEMUI');
      var lama = Util.str(r.Status);
      if (['Baharu', 'Disemak'].indexOf(lama) < 0) throw appError_('SSU_PERALIHAN_TIDAK_SAH');
      var now = new Date();
      var daftar = opts.tarikhDaftar || today_();
      var tahun = parseInt(Util.fmtDate(daftar, 'yyyy'), 10);
      var sahBulan = Cfg.num('SIJIL_SAH_BULAN', 12);
      var awalan = Cfg.get('AWALAN_SIJIL', 'XCITE');
      var m = Util.normMatric(r.No_Matrik_Pemilik);
      var perId = Util.str(r.ID_Perniagaan), noDaftar, kali, tamat;
      var per = perId ? perniagaanById_(perId) : null;
      if (perId && !per) throw appError_('SSU_TIDAK_DITEMUI');
      if (per) {
        kali = (Number(per.Bil_Sijil) || 1) + 1;
        var asas = Util.str(per.No_Pendaftaran).replace(/-\d{2}$/, '');
        noDaftar = asas + '-' + Util.pad(kali, 2);
        var lamaTamat = Util.toDate(per.Tarikh_Tamat);
        var mula = lamaTamat && Util.daysBetween(daftar, lamaTamat) > 0 ? lamaTamat : daftar;
        tamat = Util.addMonths(mula, sahBulan);
      } else {
        kali = 1;
        noDaftar = Util.noSijil(awalan, tahun, Db.nextSeqLocked('SIJIL_' + tahun), 1);
        tamat = opts.tarikhTamat || Util.addMonths(daftar, sahBulan);
        perId = Util.formatId('PRN', null, Db.nextSeqLocked('PRN'), 4);
      }
      var statusPer = Util.daysBetween(new Date(), tamat) < 0 ? 'Tamat Tempoh' : 'Aktif';
      var perRec = {
        ID_Perniagaan: perId, Nama_Perniagaan: Util.str(r.Nama_Perniagaan), ID_Permohonan_SSU: id, No_Matrik_Pemilik: m,
        Jenis_SSU: Util.str(r.Jenis_SSU), Kluster: Util.str(r.Kluster), Jenis_Perniagaan: Util.str(r.Jenis_Perniagaan),
        No_SSM: Util.str(r.No_SSM), Alamat: Util.str(r.Alamat_Perniagaan), No_Pendaftaran: noDaftar, Bil_Sijil: kali,
        Tarikh_Pendaftaran: daftar, Tarikh_Tamat: tamat, Status_SSU: statusPer
      };
      if (per) Db.update('Perniagaan', per._row, perRec);
      else { perRec.Dicipta_Pada = now; Db.append('Perniagaan', perRec); }
      Db.update('Permohonan_SSU', r._row, {
        Status: 'Diluluskan', ID_Perniagaan: perId, No_Pendaftaran: noDaftar, Bil_Sijil: kali, Tarikh_Pendaftaran: daftar,
        Tarikh_Tamat: tamat, Tarikh_Keputusan: now, Diluluskan_Oleh: opts.dilulus || ctx.email, Catatan_Admin: catatan || Util.str(r.Catatan_Admin)
      });
      Audit.log(ctx, 'SSU_LULUS', 'SSU', id, lama, 'Diluluskan', noDaftar + (catatan ? ' | ' + catatan : ''));
      return { m: m, nama: Util.str(r.Nama_Perniagaan), noDaftar: noDaftar };
    });

    var amaran = [];
    try {
      janaSijil_(ctx, id);
    } catch (err) {
      amaran.push(err instanceof AppError || (err && err.name === 'AppError') ? err.bm : 'Sijil gagal dijana.');
      console.error('Sijil gagal dijana untuk ' + id + ': ' + err);
      Audit.log(ctx, 'SIJIL_GAGAL', 'SSU', id, '', '', String(err && err.message ? err.message : err).substr(0, 300));
    }
    if (!opts.senyap) {
      sendMail_(emelOf_(hasil.m), 'Permohonan SSU diluluskan', 'Your SSU application is approved',
        ['Tahniah. SSU anda (' + hasil.nama + ') telah diluluskan. No. pendaftaran: ' + hasil.noDaftar + '. Sijil boleh dimuat turun dalam SHAMS.'],
        ['Congratulations. Your SSU (' + hasil.nama + ') has been approved. Registration no.: ' + hasil.noDaftar + '. The certificate can be downloaded in SHAMS.']);
      ahliOf_(id).forEach(function (a) {
        var am = Util.normMatric(a.No_Matrik);
        if (am !== hasil.m) sendMail_(emelOf_(am), 'SSU anda telah diluluskan', 'Your SSU is approved',
          ['SSU ' + hasil.nama + ', yang anda sertai sebagai ahli, telah diluluskan (' + hasil.noDaftar + ').'],
          ['The SSU ' + hasil.nama + ', in which you are a member, has been approved (' + hasil.noDaftar + ').']);
      });
    }
    var out = adminButiran_(ctx, { id: id });
    out.amaranSijil = amaran;
    return out;
  }

  /** Jana (atau jana semula) sijil PDF bagi permohonan Diluluskan. Pulang amaran penanda. */
  function janaSijil_(ctx, id) {
    var r = appRow_(id);
    if (!r) throw appError_('SSU_TIDAK_DITEMUI');
    if (Util.str(r.Status) !== 'Diluluskan') throw appError_('SSU_PERALIHAN_TIDAK_SAH');
    var kod = Util.str(r.Syarat_Subjek);
    var ahli = ahliOf_(id).slice().sort(function (a, b) {
      return (Util.str(a.Peranan_Ahli) === 'Pemilik' ? 0 : 1) - (Util.str(b.Peranan_Ahli) === 'Pemilik' ? 0 : 1);
    }).map(function (a) { return Util.str(a.Nama).toUpperCase(); });
    var res = Sijil.jana({
      namaSyarikat: Util.str(r.Nama_Perniagaan), noPendaftaran: Util.str(r.No_Pendaftaran), tarikhDaftar: r.Tarikh_Pendaftaran,
      tarikhTamat: r.Tarikh_Tamat, alamat: Util.str(r.Alamat_Perniagaan),
      kodKursus: SUBJEK_WAJIB.indexOf(kod) >= 0 ? kod : '-', ahli: ahli
    });
    var lama = Util.str(r.Pautan_Sijil);
    Db.withLock(function () {
      var fresh = appRow_(id);
      Db.update('Permohonan_SSU', fresh._row, { Pautan_Sijil: res.url });
    });
    if (lama && lama !== res.url) {
      try { DriveApp.getFileById(Util.idFromUrl(lama)).setTrashed(true); } catch (e) { console.error('Sijil lama tidak dapat dialihkan ke tong sampah: ' + e); }
    }
    Audit.log(ctx, 'SIJIL_DIJANA', 'SSU', id, '', Util.str(r.No_Pendaftaran), res.amaran.join('; '));
    return res.amaran;
  }

  function adminJanaSijil_(ctx, p) {
    requireDecider_(ctx);
    var id = Util.str(p.id);
    var amaran = janaSijil_(ctx, id);
    var out = adminButiran_(ctx, { id: id });
    out.amaranSijil = amaran;
    return out;
  }

  /** Admin mendaftar SSU sedia ada: terus Diluluskan. */
  function adminDaftarSedia_(ctx, p) {
    requireDecider_(ctx);
    p = p || {};
    var m = Util.normMatric(p.noMatrik);
    if (!Util.isMatric(m) || !pelajarRow_(m)) throw appError_('SSU_TIDAK_SAH', { medan: { noMatrik: 'No. Matrik tidak ditemui / Matric number not found' } });
    if (activeApp_(m) || perniagaanOwner_(m)) throw appError_('SSU_SUDAH_ADA');
    var chk = check_(p, { admin: true, pemilik: m });
    var ralat = chk.ralat;
    var tarikh = null;
    if (Util.str(p.tarikhDaftar)) {
      tarikh = /^\d{4}-\d{2}-\d{2}$/.test(Util.str(p.tarikhDaftar)) ? Util.toDate(Util.str(p.tarikhDaftar)) : null;
      if (!tarikh || Util.daysBetween(new Date(), tarikh) > 0) ralat.tarikhDaftar = 'Tarikh tidak sah atau akan datang / Invalid or future date';
    }
    if (Object.keys(ralat).length) throw appError_('SSU_TIDAK_SAH', { medan: ralat });
    var v = chk.nilai;
    var id = Db.withLock(function () {
      var tahun = parseInt(Util.fmtDate(new Date(), 'yyyy'), 10);
      var nid = Util.formatId('SSU', tahun, Db.nextSeqLocked('SSU_' + tahun), 4);
      Db.append('Permohonan_SSU', {
        ID_Permohonan: nid, Jenis_SSU: v.jenisSsu, Jenis_Permohonan: 'Sedia ada', ID_Perniagaan: '', No_Matrik_Pemilik: m,
        Nama_Perniagaan: v.nama, Produk: csv_(v.produk), Syarat_Subjek: v.syarat, Pensyarah: v.pensyarah, Seksyen: v.seksyen, Kumpulan: v.kumpulan,
        Status_SSM: v.statusSsm, No_SSM: v.noSsm, Jenis_Perniagaan: v.jenisPerniagaan, Kluster: v.kluster, Sumber_Pembiayaan: csv_(v.sumber),
        Modal_RM: v.modal === null ? '' : v.modal, Pendapatan_Bulanan_RM: v.pendapatan === null ? '' : v.pendapatan,
        Alamat_Perniagaan: v.alamat, Tarikh_Mula_Perniagaan: v.tarikhMula ? Util.toDate(v.tarikhMula) : '', Laman_Media_Sosial: v.laman,
        Bil_Ahli: v.ahli.length + 1, Status: 'Baharu', Tarikh_Hantar: new Date()
      });
      writeAhli_(nid, m, v.ahli);
      Audit.log(ctx, 'DAFTAR_SSU_SEDIA_ADA', 'SSU', nid, '', v.nama, m);
      return nid;
    });
    return lulus_(ctx, id, Util.str(p.catatan).substr(0, 500) || 'Didaftar admin (sedia ada)', {
      tarikhDaftar: tarikh || today_(), dilulus: ctx.email + ' (sedia ada)', senyap: !Util.truthy(p.emel)
    });
  }

  /** Admin menghantar permohonan bagi pihak pelajar. p.terusLulus meluluskan serta-merta. */
  function hantarBagiPihak_(ctx, p) {
    var c = Bantu.ctx(ctx, p.noMatrik);
    var terus = p.terusLulus === true;
    if (terus) requireDecider_(ctx);
    var r = hantar_(c, p);
    if (!terus) return r;
    var out = lulus_(c, r.id, 'Didaftar bagi pihak pelajar', {});
    out.id = r.id;
    return out;
  }

  // ---------- Kerja harian: tamat tempoh dan peringatan pembaharuan ----------
  function jobHarian_() {
    var hasil = { tamat: 0, peringatan: 0 };
    var thr = Cfg.list('SSU_PERINGATAN_HARI').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
    var logs = Db.rows('Peringatan');
    Db.rows('Perniagaan').forEach(function (per) {
      var h = hariBaki_(per);
      if (h === null) return;
      var id = Util.str(per.ID_Perniagaan);
      var m = Util.normMatric(per.No_Matrik_Pemilik);
      if (h < 0) {
        if (Util.str(per.Status_SSU) !== 'Tamat Tempoh') {
          Db.update('Perniagaan', per._row, { Status_SSU: 'Tamat Tempoh' });
          Audit.log({ email: 'sistem', role: '-' }, 'SSU_TAMAT_TEMPOH', 'SSU', id, 'Aktif', 'Tamat Tempoh', Util.str(per.No_Pendaftaran));
          hasil.tamat++;
          sendMail_(emelOf_(m), 'SSU anda telah tamat tempoh', 'Your SSU has expired',
            ['Sijil SSU ' + Util.str(per.Nama_Perniagaan) + ' telah tamat tempoh pada ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + '. Sila buat pembaharuan dalam SHAMS.'],
            ['The SSU certificate for ' + Util.str(per.Nama_Perniagaan) + ' expired on ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + '. Please renew in SHAMS.']);
        }
        return;
      }
      var tier = null;
      for (var i = 0; i < thr.length; i++) if (h <= thr[i]) { tier = thr[i]; break; }
      if (tier === null) return;
      var kunci = 'SSU_TAMAT_' + Util.str(per.No_Pendaftaran) + '_' + tier;
      if (logs.some(function (l) { return Util.str(l.Jenis) === kunci; })) return;
      var to = emelOf_(m);
      sendMail_(to, 'Peringatan pembaharuan SSU', 'SSU renewal reminder',
        ['Sijil SSU ' + Util.str(per.Nama_Perniagaan) + ' akan tamat pada ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + ' (' + h + ' hari lagi). Sila perbaharui dalam SHAMS.'],
        ['The SSU certificate for ' + Util.str(per.Nama_Perniagaan) + ' expires on ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + ' (' + h + ' days left). Please renew in SHAMS.']);
      Db.append('Peringatan', { Masa: new Date(), Emel: to, Jenis: kunci, Rujukan: id, Status: 'Dihantar', Catatan: h + ' hari baki' });
      hasil.peringatan++;
    });
    return hasil;
  }

  return {
    saya: saya_, dapat: dapat_, hantar: hantar_, fail: fail_,
    adminSenarai: adminSenarai_, adminButiran: adminButiran_, adminKeputusan: adminKeputusan_,
    hantarBagiPihak: hantarBagiPihak_, adminJanaSijil: adminJanaSijil_, adminDaftarSedia: adminDaftarSedia_, lulus: lulus_, butiran: adminButiran_,
    jobHarian: jobHarian_, check: check_
  };
})();


// ===== Util.gs =====
/**
 * SHAMS: fungsi pembantu. Kebanyakannya fungsi tulen supaya boleh diuji dengan Node.
 */

/** Ralat aplikasi dengan mesej dwibahasa yang selamat dipaparkan kepada pengguna. */
function AppError(code, bm, en, extra) {
  this.name = 'AppError';
  this.code = code;
  this.bm = bm;
  this.en = en;
  this.extra = extra || null;
  this.message = code + ': ' + bm;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

var Util = {
  normEmail: function (s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  },

  isEmail: function (s) {
    return typeof s === 'string' && s.length <= 254 &&
      /^[a-z0-9._%+\-']+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$/.test(s);
  },

  normMatric: function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
  },

  isMatric: function (s) {
    return /^[A-Z0-9]{5,15}$/.test(s);
  },

  /** Tentukan peranan asas daripada domain emel. */
  roleByDomain: function (email, domainPelajar, domainStaf) {
    var e = Util.normEmail(email);
    var dp = Util.normEmail(domainPelajar);
    var ds = Util.normEmail(domainStaf);
    if (dp && e.slice(-dp.length) === dp) return ROLE.PELAJAR;
    if (ds && e.slice(-ds.length) === ds) return ROLE.STAF;
    return ROLE.LUAR;
  },

  /** Emel penyelia mesti domain staf sahaja (bukan domain pelajar). */
  isStaffEmail: function (email, domainPelajar, domainStaf) {
    return Util.roleByDomain(email, domainPelajar, domainStaf) === ROLE.STAF;
  },

  pad: function (n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  },

  /** Contoh: formatId('SSU', 2026, 14, 4) -> SSU-2026-0014 ; formatId('PRN', null, 7, 4) -> PRN-0007 */
  formatId: function (prefix, year, n, width) {
    return prefix + (year ? '-' + year : '') + '-' + Util.pad(n, width || 4);
  },

  toHex: function (bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = (bytes[i] + 256) % 256;
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  },

  sha256: function (str) {
    return Util.toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8));
  },

  /** Kod OTP 6 digit daripada rentetan heks rawak. */
  otpFromHex: function (hex) {
    var n = parseInt(String(hex).replace(/[^0-9a-f]/gi, '').substr(0, 8), 16);
    return Util.pad(n % 1000000, 6);
  },

  randomToken: function () {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  },

  randomOtp: function () {
    return Util.otpFromHex(Utilities.getUuid().replace(/-/g, ''));
  },

  safeEqual: function (a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  },

  /** Nilai sel "Ya" / TRUE / 1 dianggap benar. */
  truthy: function (v) {
    if (v === true) return true;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return ['ya', 'yes', 'true', '1', 'y', 'aktif'].indexOf(s) >= 0;
  },

  /** Ambil ID Drive daripada URL atau ID. */
  idFromUrl: function (url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return '';
    var m = s.match(/[-\w]{25,}/);
    return m ? m[0] : '';
  },

  /** Tukar nilai sel kepada rentetan ringkas. */
  str: function (v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return isNaN(v.getTime()) ? '' : v.toISOString();
    }
    return String(v).trim();
  },

  /** Penghurai CSV. Mengesan pemisah (koma, titik koma, tab) daripada baris pertama. */
  parseCsv: function (text) {
    var t = String(text == null ? '' : text).replace(/^﻿/, '');
    var firstLine = t.split(/\r?\n/)[0] || '';
    var delim = ',';
    var best = (firstLine.match(/,/g) || []).length;
    [';', '\t'].forEach(function (d) {
      var c = firstLine.split(d).length - 1;
      if (c > best) { best = c; delim = d; }
    });
    var rows = [], row = [], cell = '', inQ = false, i = 0;
    while (i < t.length) {
      var ch = t.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (t.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  },

  /** Hari dalam seminggu ISO: 1=Isnin ... 7=Ahad. */
  isoWeekday: function (date) {
    var d = date.getDay();
    return d === 0 ? 7 : d;
  },

  fmtDate: function (date, fmt) {
    return Utilities.formatDate(date, APP.TZ, fmt || 'yyyy-MM-dd');
  },

  /** Hari bekerja antara dua tarikh (tidak termasuk tarikh mula, termasuk tarikh akhir), tolak hujung minggu dan cuti. */
  workingDaysBetween: function (from, to, holidays, opDays) {
    var hol = {};
    (holidays || []).forEach(function (h) { hol[h] = true; });
    var days = opDays && opDays.length ? opDays : [1, 2, 3, 4, 5];
    var count = 0;
    var d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (d < end) {
      d.setDate(d.getDate() + 1);
      var iso = d.getFullYear() + '-' + Util.pad(d.getMonth() + 1, 2) + '-' + Util.pad(d.getDate(), 2);
      if (days.indexOf(Util.isoWeekday(d)) >= 0 && !hol[iso]) count++;
    }
    return count;
  },

  /** Terima Date atau rentetan tarikh (yyyy-MM-dd atau ISO). Pulang Date atau null. */
  toDate: function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], -8, 0, 0)); // tengah malam Asia/Kuala_Lumpur
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  },

  /** Kunci tarikh yyyy-MM-dd (zon waktu Malaysia). */
  dateKey: function (v) {
    var d = Util.toDate(v);
    return d ? Util.fmtDate(d, 'yyyy-MM-dd') : '';
  },

  BULAN_BM: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],

  /** 13 Oktober 2026 */
  fmtTarikhBM: function (v) {
    var k = Util.dateKey(v);
    if (!k) return '';
    var p = k.split('-');
    return parseInt(p[2], 10) + ' ' + Util.BULAN_BM[parseInt(p[1], 10) - 1] + ' ' + p[0];
  },

  /** Tambah n bulan pada tarikh (hari dihadkan pada hari terakhir bulan sasaran). Pulang Date. */
  addMonths: function (v, n) {
    var k = Util.dateKey(v).split('-').map(function (x) { return parseInt(x, 10); });
    var y = k[0], m = k[1] - 1 + n, d = k[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Util.toDate(y + '-' + Util.pad(m + 1, 2) + '-' + Util.pad(Math.min(d, last), 2));
  },

  /** Bilangan hari kalendar dari a ke b (b - a), mengikut tarikh Malaysia. */
  daysBetween: function (a, b) {
    var ka = Util.dateKey(a).split('-'), kb = Util.dateKey(b).split('-');
    var da = Date.UTC(+ka[0], +ka[1] - 1, +ka[2]), db = Date.UTC(+kb[0], +kb[1] - 1, +kb[2]);
    return Math.round((db - da) / 86400000);
  },

  /** Nombor sijil: XCITE-2026S00001-01 */
  noSijil: function (awalan, tahun, seq, kali) {
    return awalan + '-' + tahun + 'S' + Util.pad(seq, 5) + '-' + Util.pad(kali, 2);
  },

  /** Nombor RM tepat (maksimum 2 perpuluhan, tidak negatif). Pulang nombor atau null jika tidak sah. */
  parseRm: function (v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim().replace(/^rm\s*/i, '').replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var n = parseFloat(s);
    return n > 100000000 ? null : n;
  },

  /** Normalkan jantina kepada Lelaki / Perempuan; pulangkan '' jika tidak dikenali. */
  normJantina: function (v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (['l', 'lelaki', 'male', 'm'].indexOf(s) >= 0) return 'Lelaki';
    if (['p', 'perempuan', 'female', 'f'].indexOf(s) >= 0) return 'Perempuan';
    return '';
  }
};

/** Mesej pengguna dwibahasa. Kunci = kod ralat. */
var MSG = {
  EMEL_TIDAK_SAH: ['Emel tidak sah.', 'Invalid email.'],
  RATE_JEDA: ['Sila tunggu sebentar sebelum meminta kod baharu.', 'Please wait a moment before requesting a new code.'],
  RATE_SEJAM: ['Terlalu banyak permintaan kod. Cuba lagi dalam satu jam.', 'Too many code requests. Try again in an hour.'],
  RATE_HARIAN: ['Perkhidmatan sibuk. Cuba lagi kemudian.', 'Service is busy. Please try again later.'],
  UJI_TIADA_SENARAI: ['MOD UJIAN: emel ini tiada dalam senarai penguji.', 'TEST MODE: this email is not on the tester list.'],
  HANTAR_GAGAL: ['Kod tidak dapat dihantar. Cuba lagi.', 'The code could not be sent. Please try again.'],
  OTP_TAMAT: ['Kod telah tamat tempoh. Minta kod baharu.', 'The code has expired. Request a new one.'],
  OTP_SALAH: ['Kod tidak betul.', 'Incorrect code.'],
  OTP_TERLALU_BANYAK: ['Terlalu banyak percubaan. Minta kod baharu.', 'Too many attempts. Request a new code.'],
  AKAUN_DISEKAT: ['Akaun ini telah disekat. Sila hubungi UTMXCITE.', 'This account has been blocked. Please contact UTMXCITE.'],
  SESI_TAMAT: ['Sesi tamat. Sila log masuk semula.', 'Session expired. Please sign in again.'],
  TIADA_KEBENARIAN: ['Anda tiada kebenaran untuk tindakan ini.', 'You do not have permission for this action.'],
  KAEDAH_TIDAK_SAH: ['Permintaan tidak sah.', 'Invalid request.'],
  MATRIK_TIDAK_SAH: ['Format No. Matrik tidak sah.', 'Invalid matric number format.'],
  MATRIK_TIDAK_DITEMUI: ['No. Matrik tidak ditemui dalam rekod pelajar. Sila hubungi UTMXCITE.', 'Matric number not found in student records. Please contact UTMXCITE.'],
  EMEL_TIDAK_SEPADAN: ['Emel anda tidak sepadan dengan No. Matrik ini.', 'Your email does not match this matric number.'],
  MATRIK_DITUNTUT: ['No. Matrik ini telah didaftarkan dengan emel lain. Sila hubungi UTMXCITE.', 'This matric number is already registered with another email. Please contact UTMXCITE.'],
  STATUS_TIDAK_AKTIF: ['Status pelajar tidak aktif. Sila hubungi UTMXCITE.', 'Student status is not active. Please contact UTMXCITE.'],
  PERANAN_TIDAK_SESUAI: ['Tindakan ini tidak sesuai dengan peranan anda.', 'This action does not match your role.'],
  MAKLUMAT_TIDAK_LENGKAP: ['Sila lengkapkan semua maklumat wajib.', 'Please complete all required fields.'],
  TELEFON_TIDAK_SAH: ['No. telefon tidak sah.', 'Invalid phone number.'],
  SETUP_INDUK: ['Sistem belum disediakan. Jalankan fungsi setup() dalam editor Apps Script.', 'System is not set up. Run the setup() function in the Apps Script editor.'],
  SETUP_TIADA_LINK: ['Spreadsheet belum didaftar dalam Link_Dokumen.', 'Spreadsheet is not registered in Link_Dokumen.'],
  CSV_KOSONG: ['Data CSV kosong.', 'CSV data is empty.'],
  CSV_TAJUK: ['Tajuk lajur CSV tidak lengkap.', 'CSV headers are incomplete.'],
  ADMIN_DIKUNCI: ['Admin utama tidak boleh diubah atau dinyahaktifkan.', 'The primary admin cannot be changed or deactivated.'],
  ADMIN_PERANAN: ['Peranan admin tidak sah.', 'Invalid admin role.'],
  PROFIL_LENGKAP_DULU: ['Sila lengkapkan profiling anda dahulu.', 'Please complete your profiling first.'],
  PROFIL_TIDAK_SAH: ['Maklumat profiling tidak sah. Semak medan yang bertanda.', 'Profiling details are invalid. Check the highlighted fields.'],
  SSU_TIDAK_SAH: ['Maklumat permohonan SSU tidak sah. Semak medan yang bertanda.', 'The SSU application is invalid. Check the highlighted fields.'],
  SSU_SUDAH_ADA: ['Anda sudah mempunyai permohonan atau SSU yang aktif.', 'You already have an active application or SSU.'],
  SSU_TIDAK_DITEMUI: ['Permohonan SSU tidak ditemui.', 'SSU application not found.'],
  SSU_TIDAK_BOLEH_UBAH: ['Permohonan ini tidak boleh diubah pada status semasa.', 'This application cannot be changed in its current status.'],
  SSU_TIDAK_BOLEH_PERBAHARUI: ['Pembaharuan belum dibenarkan atau tidak sesuai.', 'Renewal is not yet allowed or not applicable.'],
  SSU_CATATAN_WAJIB: ['Catatan wajib diisi untuk tindakan ini.', 'A note is required for this action.'],
  SSU_PERALIHAN_TIDAK_SAH: ['Tindakan ini tidak sah pada status semasa.', 'This action is not valid in the current status.'],
  SIJIL_TEMPLAT_TIADA: ['Templat sijil belum didaftar atau tidak boleh dibuka. Semak Link_Dokumen (TEMPLAT_SIJIL_SSU) dan kebenaran akaun pelaksana.', 'The certificate template is not registered or cannot be opened. Check Link_Dokumen (TEMPLAT_SIJIL_SSU) and the executing account\'s access.'],
  SIJIL_TIADA: ['Sijil belum dijana.', 'The certificate has not been generated.'],
  FAIL_TIDAK_SAH: ['Fail tidak sah. Gunakan jenis fail yang dibenarkan dan saiz yang dibenarkan.', 'Invalid file. Use an allowed file type and size.'],
  TEMPLAT_TIADA: ['Templat dokumen belum didaftar atau tidak boleh dibuka. Semak Link_Dokumen dan kebenaran akaun pelaksana.', 'The document template is not registered or cannot be opened. Check Link_Dokumen and the executing account\'s access.'],
  FAIL_TIDAK_DITEMUI: ['Fail tidak ditemui.', 'File not found.'],
  RALAT_DALAMAN: ['Ralat dalaman. Sila cuba lagi atau hubungi UTMXCITE.', 'Internal error. Please try again or contact UTMXCITE.']
};

function appError_(code, extra) {
  // Mesej modul (MSG_RN, MSG_KEW, MSG_MK) ditakrif dalam fail modul masing-masing
  var m = MSG[code] ||
    (typeof MSG_RN !== 'undefined' && MSG_RN[code]) ||
    (typeof MSG_KEW !== 'undefined' && MSG_KEW[code]) ||
    (typeof MSG_MK !== 'undefined' && MSG_MK[code]) ||
    MSG.RALAT_DALAMAN;
  return new AppError(code, m[0], m[1], extra);
}
