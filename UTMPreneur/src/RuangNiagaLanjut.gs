/**
 * UTMPreneur: Ruang Niaga. Penghubung antara sub-modul: pendaftaran laluan RPC fasa 2 ke atas, butiran admin
 * yang menggabungkan data sub-modul, dan kerja harian. Rujukan sub-modul dibuat di dalam fungsi sahaja.
 */

var RnLanjut = (function () {
  function S(v) { return Util.str(v); }

  /** Laluan tindakan pelajar (juga tersedia sebagai rn.bp.* bagi admin). */
  function laluanPelajar(t) {
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
    out.penilaian = RnNilai.ringkasPermohonan(S(r.ID_Permohonan));
  }

  function jobHarian() {
    return {};
  }

  return { laluanPelajar: laluanPelajar, laluanAdmin: laluanAdmin, laluanLain: laluanLain, tambahButiran: tambahButiran, jobHarian: jobHarian };
})();
