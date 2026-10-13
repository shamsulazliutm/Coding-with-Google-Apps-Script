/** UTMPreneur: fail gabungan (dijana oleh scripts/bundle.js daripada src/). Jangan sunting di sini; sunting src/ dan jana semula. */

// ===== Admin.gs =====
/**
 * UTMPreneur: tindakan pentadbir peringkat 1 (status sistem, urus admin, import PELAJAR).
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
 * UTMPreneur: log masuk emel + OTP, sesi dan peranan.
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
    me: me
  };
})();


// ===== Code.gs =====
/**
 * UTMPreneur: titik masuk web app dan penghantar RPC.
 * Semua panggilan antara muka melalui rpc(kaedah, token, muatan). Peranan disemak di sini (server),
 * bukan di antara muka.
 */

function doGet(e) {
  var t;
  try {
    if (!PropertiesService.getScriptProperties().getProperty(PROPS.INDUK_ID)) {
      return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">UTMPreneur belum disediakan. Tetapkan INDUK_ID dan jalankan setup().<br><i>UTMPreneur is not set up yet.</i></p>')
        .setTitle('UTMPreneur');
    }
    t = HtmlService.createTemplateFromFile('Index');
    t.versi = APP.VERSI;
    return t.evaluate()
      .setTitle('UTMPreneur · UTMXCITE')
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
  return {
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
    'ssu.admin.sedia':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminDaftarSedia(c, p); } }
  };
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
 * UTMPreneur: konfigurasi tetap dan skema spreadsheet.
 * Skema ini ialah satu-satunya sumber nama tab dan tajuk lajur. Skrip persediaan
 * (Setup.gs) dan pengesah struktur menggunakannya.
 */

var APP = { NAMA: 'UTMPreneur', VERSI: '0.1.0', TZ: 'Asia/Kuala_Lumpur' };

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
    nama: 'UTMPreneur - Induk',
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
    nama: 'UTMPreneur - Profiling',
    modul: 'Profiling',
    tabs: {
      Profil: ['ID_Profil', 'No_Matrik', 'Sesi', 'Tarikh_Kemas_Kini', 'No_Telefon', 'Kampung_Halaman', 'Keluarga_Berniaga', 'Pernah_Berniaga', 'Jenis_Perniagaan_Dijalankan', 'Tempoh_Perniagaan', 'Motivasi', 'Berminat_Berniaga', 'Kluster_Diminati', 'Kluster_Lain', 'Mahu_Kampus', 'Aliran_Pilihan'],
      Perniagaan_Keluarga: ['ID_Profil', 'Hubungan', 'Jenis_Perniagaan', 'Tempoh']
    }
  },
  SS_SSU: {
    nama: 'UTMPreneur - SSU',
    modul: 'SSU',
    tabs: {
      Permohonan_SSU: ['ID_Permohonan', 'Jenis_SSU', 'Jenis_Permohonan', 'ID_Perniagaan', 'No_Matrik_Pemilik', 'Nama_Perniagaan', 'Produk', 'Syarat_Subjek', 'Pensyarah', 'Seksyen', 'Kumpulan', 'Status_SSM', 'No_SSM', 'Fail_SSM', 'Fail_Maklumat_SSM', 'Jenis_Perniagaan', 'Kluster', 'Sumber_Pembiayaan', 'Modal_RM', 'Pendapatan_Bulanan_RM', 'Alamat_Perniagaan', 'Tarikh_Mula_Perniagaan', 'Laman_Media_Sosial', 'Bil_Ahli', 'Status', 'Tarikh_Hantar', 'Tarikh_Keputusan', 'Diluluskan_Oleh', 'Catatan_Admin', 'No_Pendaftaran', 'Bil_Sijil', 'Pautan_Sijil', 'Tarikh_Pendaftaran', 'Tarikh_Tamat'],
      Ahli_Pasukan: ['ID_Permohonan', 'No_Matrik', 'Nama', 'Fakulti', 'Jantina', 'Etnik', 'Tahun', 'Peranan_Ahli']
    }
  },
  SS_RUANG_NIAGA: {
    nama: 'UTMPreneur - Ruang Niaga',
    modul: 'Ruang Niaga',
    tabs: {
      Lot: ['Kod_Lot', 'Nama_Paparan', 'Lokasi', 'Blok', 'Saiz_m2', 'Jenis', 'Kadar_Sewa_RM', 'Status_Buka', 'Status_Lot', 'Catatan', 'Didaftar_Oleh', 'Tarikh_Daftar'],
      Permohonan_Lot: ['ID_Permohonan', 'ID_Perniagaan', 'No_Matrik', 'Kod_Lot', 'Tempoh_Mula', 'Tempoh_Tamat', 'Vaksin_Kepialu', 'Fail_Vaksin', 'Kursus_Makanan', 'Fail_Kursus', 'Sumber_Pembiayaan', 'Pemberi_Dana', 'Jumlah_Dana_RM', 'Jangkaan_Jualan_RM', 'Bil_Pekerja', 'Fail_Cadangan', 'Sebab_Berniaga', 'Lokasi_Dirancang', 'Status', 'Tarikh_Hantar', 'Keputusan', 'Tarikh_Keputusan', 'Catatan_Admin'],
      Sewaan: ['ID_Sewaan', 'Kod_Lot', 'ID_Perniagaan', 'ID_Permohonan', 'Kadar_RM', 'Tarikh_Mula', 'Tarikh_Tamat', 'Status', 'Didaftar_Oleh'],
      Bayaran_Sewa: ['ID_Bil', 'ID_Sewaan', 'Kod_Lot', 'ID_Perniagaan', 'Bulan', 'Tahun', 'Jumlah_RM', 'Tarikh_Akhir', 'Status', 'Tarikh_Bayar', 'Kaedah', 'No_Rujukan', 'Fail_Resit', 'Disahkan_Oleh', 'Tarikh_Pengesahan', 'Catatan'],
      Rubrik: ['Jenis', 'Versi', 'Kod_Kriteria', 'Kriteria_BM', 'Kriteria_EN', 'Sub_Perkara', 'Markah_Maks', 'Tertib', 'Tahap5', 'Tahap3', 'Tahap1', 'Aktif'],
      Sesi_Penilaian: ['ID_Sesi', 'Tarikh', 'Masa', 'Tempat', 'Status', 'Versi_Rubrik', 'Penilai', 'Senarai_Permohonan', 'Dicipta_Oleh'],
      Skor_Penilaian: ['ID_Sesi', 'ID_Permohonan', 'Emel_Penilai', 'Kod_Kriteria', 'Tahap', 'Markah', 'Ulasan', 'Masa_Hantar', 'Dikunci']
    }
  },
  SS_KEWANGAN: {
    nama: 'UTMPreneur - Kewangan',
    modul: 'Kewangan',
    tabs: {
      Laporan_Bulanan: ['ID_Laporan', 'ID_Perniagaan', 'ID_Sewaan', 'Bulan', 'Tahun', 'Tiada_Aktiviti', 'Pendapatan_RM', 'Perbelanjaan_RM', 'Untung_RM', 'Fail_Laporan', 'Perakuan', 'Status', 'Tarikh_Hantar', 'Tarikh_Akhir', 'Disemak_Oleh', 'Tarikh_Semakan', 'Catatan_Semakan']
    }
  },
  SS_TEMPAHAN_RUANG: {
    nama: 'UTMPreneur - Makerspace',
    modul: 'Makerspace',
    tabs: {
      Tempahan: ['ID_Tempahan', 'Jenis', 'Kod_Sumber', 'Jenis_Pengguna', 'Emel_Pemohon', 'Nama_Pemohon', 'Tarikh_Mula', 'Masa_Mula', 'Tarikh_Tamat', 'Masa_Tamat', 'Tujuan', 'Emel_Penyelia', 'Status_Perakuan', 'Tarikh_Perakuan', 'Status', 'Diluluskan_Oleh', 'Tarikh_Keputusan', 'Catatan'],
      Butiran_Ruang: ['ID_Tempahan', 'Nama_Program', 'Bil_Hari', 'Bil_Peserta', 'Kaedah_Bayaran', 'No_VOT', 'Nama_Staf_Kewangan', 'Tel_Staf_Kewangan', 'Fail_Kertas_Kerja', 'Fail_Surat'],
      Item_Peralatan_Ruang: ['ID_Tempahan', 'Kod_Alat', 'Kuantiti'],
      Butiran_LaserCut: ['ID_Tempahan', 'Nama_Projek', 'Jenis_Bahan', 'Masa_Dijangka_Min', 'Masa_Sebenar_Min'],
      Butiran_3DP: ['ID_Tempahan', 'Nama_Projek', 'Fail_Gambar', 'Berat_g', 'Warna', 'No_Mesin', 'Masa_Dijangka_Min', 'Masa_Sebenar_Min'],
      Item_Pinjaman: ['ID_Tempahan', 'Kod_Alat', 'Kuantiti', 'Tarikh_Dijangka_Pulang', 'Tarikh_Pulang', 'Status'],
      ALAT: ['Kod_Alat', 'Nama_Alat', 'Kategori', 'Kuantiti_Jumlah', 'Kuantiti_Rosak_Hilang', 'Boleh_Dipinjam', 'Aktif', 'Catatan'],
      PERALATAN: ['Kod_Mesin', 'Jenis', 'No_Mesin', 'Nama_Model', 'Kapasiti', 'Kod_Kadar', 'Status', 'Catatan'],
      KADAR: ['Kod_Sumber', 'Nama_Sumber', 'Jenis_Pengguna', 'Unit', 'Kadar_RM', 'Berkuat_Kuasa', 'Aktif'],
      Bayaran_Makerspace: ['ID_Bayaran', 'ID_Tempahan', 'Emel_Pemohon', 'Anggaran_RM', 'Penggunaan_Sebenar', 'Kos_Sebenar_RM', 'Status', 'Tarikh_Akhir', 'Tarikh_Bayar', 'Kaedah', 'No_Rujukan', 'Fail_Resit', 'Disahkan_Oleh', 'Tarikh_Pengesahan'],
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
  ['NAMA_PENGHANTAR', 'UTMPreneur · UTMXCITE', 'Nama penghantar emel'],
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
  ['TARIKH_AKHIR_SEWA_HARI', '10', 'Hari dalam bulan tarikh akhir bayaran sewa'],
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


// ===== Db.gs =====
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

  function toRow_(hdr, obj) {
    return hdr.map(function (h) { return safeCell_(obj[h] === undefined || obj[h] === null ? '' : obj[h]); });
  }

  function append_(tab, obj) {
    var sh = sheet_(tab);
    var hdr = headers_(tab);
    var r = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(r, 1, 1, hdr.length).setValues([toRow_(hdr, obj)]);
    return r;
  }

  function update_(tab, rowNum, patch) {
    var sh = sheet_(tab);
    var hdr = headers_(tab);
    var cur = sh.getRange(rowNum, 1, 1, hdr.length).getValues()[0];
    hdr.forEach(function (h, i) {
      if (Object.prototype.hasOwnProperty.call(patch, h)) cur[i] = patch[h] === null ? '' : patch[h];
    });
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
    var data = objs.map(function (o) { return toRow_(hdr, o); });
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
        Catatan: catatan || ''
      });
    } catch (e) {
      console.error('Audit gagal: ' + e);
    }
  }
};


// ===== Files.gs =====
/**
 * UTMPreneur: muat naik dan muat turun fail melalui pelayan.
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


// ===== Jobs.gs =====
/**
 * UTMPreneur: kerja berjadual. Jalankan pasangPencetus() sekali dari editor Apps Script untuk
 * memasang pencetus masa harian (pukul 7 pagi). Selamat dijalankan semula (pencetus lama diganti).
 */

var Jobs = {
  harian: function () {
    var out = {};
    try { out.ssu = Ssu.jobHarian(); } catch (e) { console.error('Kerja SSU gagal: ' + e); out.ssu = { ralat: String(e) }; }
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


// ===== Mail.gs =====
/**
 * UTMPreneur: penghantaran emel dwibahasa (BM utama, English italik kecil).
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
      '<b style="color:#8A2D3B;font-size:17px">UTMPreneur</b> <span style="color:#74676B;font-size:12px">· UTMXCITE</span></div>' +
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
      name: Cfg.get('NAMA_PENGHANTAR', 'UTMPreneur · UTMXCITE')
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


// ===== Profiling.gs =====
/**
 * UTMPreneur: Profiling pelajar (peringkat 2).
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
      var pg = Db.find('Pengguna', function (r) { return Util.normEmail(r.Emel) === ctx.email; });
      if (pg.length) { Db.update('Pengguna', pg[0]._row, { Telefon: v.telefon }); Auth.invalidatePengguna(ctx.email); }
      Audit.log(ctx, cur.length ? 'KEMAS_KINI_PROFIL' : 'SIMPAN_PROFIL', 'Profiling', id, '', sesi, '');
      return view_(ctx);
    });
  }

  return { view: view_, save: save_, status: status_, latest: latest_, check: check_ };
})();


// ===== Ref.gs =====
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


// ===== Seed.gs =====
/**
 * UTMPreneur: data awal yang diisi oleh skrip persediaan (hanya jika tab kosong,
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
    return TETAPAN_LALAI.map(function (t) { return { Kunci: t[0], Nilai: t[1], Penerangan: t[2] }; });
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


// ===== Sijil.gs =====
/**
 * UTMPreneur: penjanaan sijil SSU (PDF) daripada templat Google Slides.
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
 * UTMPreneur: pendaftaran Syarikat Pemula Pelajar (SSU), peringkat 2.
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
      if (url) { bm = bm.concat(['Buka UTMPreneur: ' + url]); en = en.concat(['Open UTMPreneur: ' + url]); }
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
      Audit.log(ctx, cur ? 'HANTAR_SEMULA_SSU' : (mode === 'baharuan' ? 'MOHON_PEMBAHARUAN_SSU' : 'MOHON_SSU'), 'SSU', id, cur ? Util.str(cur.Status) : '', 'Baharu', 'Perakuan pemohon diterima');
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
        ['Tahniah. SSU anda (' + hasil.nama + ') telah diluluskan. No. pendaftaran: ' + hasil.noDaftar + '. Sijil boleh dimuat turun dalam UTMPreneur.'],
        ['Congratulations. Your SSU (' + hasil.nama + ') has been approved. Registration no.: ' + hasil.noDaftar + '. The certificate can be downloaded in UTMPreneur.']);
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
            ['Sijil SSU ' + Util.str(per.Nama_Perniagaan) + ' telah tamat tempoh pada ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + '. Sila buat pembaharuan dalam UTMPreneur.'],
            ['The SSU certificate for ' + Util.str(per.Nama_Perniagaan) + ' expired on ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + '. Please renew in UTMPreneur.']);
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
        ['Sijil SSU ' + Util.str(per.Nama_Perniagaan) + ' akan tamat pada ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + ' (' + h + ' hari lagi). Sila perbaharui dalam UTMPreneur.'],
        ['The SSU certificate for ' + Util.str(per.Nama_Perniagaan) + ' expires on ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + ' (' + h + ' days left). Please renew in UTMPreneur.']);
      Db.append('Peringatan', { Masa: new Date(), Emel: to, Jenis: kunci, Rujukan: id, Status: 'Dihantar', Catatan: h + ' hari baki' });
      hasil.peringatan++;
    });
    return hasil;
  }

  return {
    saya: saya_, dapat: dapat_, hantar: hantar_, fail: fail_,
    adminSenarai: adminSenarai_, adminButiran: adminButiran_, adminKeputusan: adminKeputusan_,
    adminJanaSijil: adminJanaSijil_, adminDaftarSedia: adminDaftarSedia_,
    jobHarian: jobHarian_, check: check_
  };
})();


// ===== Util.gs =====
/**
 * UTMPreneur: fungsi pembantu. Kebanyakannya fungsi tulen supaya boleh diuji dengan Node.
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
  SETUP_INDUK: ['Sistem belum disediakan (INDUK_ID tiada).', 'System is not set up (INDUK_ID missing).'],
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
  FAIL_TIDAK_DITEMUI: ['Fail tidak ditemui.', 'File not found.'],
  RALAT_DALAMAN: ['Ralat dalaman. Sila cuba lagi atau hubungi UTMXCITE.', 'Internal error. Please try again or contact UTMXCITE.']
};

function appError_(code, extra) {
  var m = MSG[code] || MSG.RALAT_DALAMAN;
  return new AppError(code, m[0], m[1], extra);
}
