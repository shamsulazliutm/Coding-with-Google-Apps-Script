/**
 * UTMPreneur: Ruang Niaga. Dokumen sewaan (tab Dokumen_Sewaan): surat tawaran (versi), rekod penerimaan, perjanjian,
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
      ['UTMXCITE telah menambah dokumen "' + tajuk + '" bagi permohonan ' + S(r.ID_Permohonan) + '. Sila lihat dalam UTMPreneur.'],
      ['UTMXCITE added the document "' + tajuk + '" for application ' + S(r.ID_Permohonan) + '. Please view it in UTMPreneur.']);
    return { id: id };
  }

  return {
    byId: byId_, semua: semua_, versiSeterusnya: versiSeterusnya_, tambahLocked: tambahLocked_, kemas: kemas_, view: view_, senarai: senarai_,
    fail: fail_, adminFail: adminFail_, muatNaikAdmin: muatNaikAdmin_
  };
})();
