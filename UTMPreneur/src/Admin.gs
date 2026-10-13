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
