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
      // Menu KPI: Penilai tidak melihatnya; URL hanya didedahkan kepada peranan yang dibenarkan
      if (role !== ROLE.PENILAI) { out.kpiUrl = Util.str(Cfg.get('KPI_URL', '')); out.kpiUbah = role === ROLE.ADMIN_PENUH; }
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
