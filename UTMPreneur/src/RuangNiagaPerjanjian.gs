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
