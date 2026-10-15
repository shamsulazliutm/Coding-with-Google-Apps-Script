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
