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
