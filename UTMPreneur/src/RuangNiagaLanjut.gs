/**
 * UTMPreneur: Ruang Niaga. Penghubung antara sub-modul: pendaftaran laluan RPC fasa 2 ke atas, butiran admin
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
      tawaran: RnTawaran.untukPemohon(ctx, r), dokumen: RnDok.senarai(r, false)
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
  }

  function jobHarian() {
    var out = {};
    [['tawaran', function () { return RnTawaran.jobHarian(); }]].forEach(function (x) {
      try { out[x[0]] = x[1](); } catch (e) { console.error('Kerja RN ' + x[0] + ' gagal: ' + e); out[x[0]] = { ralat: String(e) }; }
    });
    return out;
  }

  return { laluanPelajar: laluanPelajar, laluanAdmin: laluanAdmin, laluanLain: laluanLain, tambahButiran: tambahButiran, jobHarian: jobHarian };
})();
