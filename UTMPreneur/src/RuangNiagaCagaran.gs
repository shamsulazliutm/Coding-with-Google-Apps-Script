/**
 * UTMPreneur: Ruang Niaga fasa 4. Cagaran (sewaan dan utiliti): pemilik memuat naik resit rasmi, admin mengesahkan,
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
      ['Pemohon ' + S(r.ID_Permohonan) + ' memuat naik resit cagaran ' + S(c.Jenis) + ' (RM ' + S(c.Jumlah_RM) + ', resit ' + noResit + '). Sila sahkan dalam UTMPreneur.'],
      ['Applicant ' + S(r.ID_Permohonan) + ' uploaded a deposit receipt. Please verify it in UTMPreneur.']);
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
            ['Cagaran ' + S(c.Jenis) + ' (RM ' + S(c.Jumlah_RM) + ') bagi ' + idPer + ' perlu dibayar selewat-lewatnya ' + Util.fmtTarikhBM(c.Tarikh_Akhir_Bayar) + '. Muat naik resit rasmi dalam UTMPreneur.'],
            ['Your deposit (RM ' + S(c.Jumlah_RM) + ') for ' + idPer + ' is due by ' + RnU.dk(c.Tarikh_Akhir_Bayar) + '. Upload the official receipt in UTMPreneur.']);
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
