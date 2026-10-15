/**
 * SHAMS: pendaftaran Syarikat Pemula Pelajar (SSU), peringkat 2.
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
      if (url) { bm = bm.concat(['Buka SHAMS: ' + url]); en = en.concat(['Open SHAMS: ' + url]); }
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
      Audit.log(ctx, cur ? 'HANTAR_SEMULA_SSU' : (mode === 'baharuan' ? 'MOHON_PEMBAHARUAN_SSU' : 'MOHON_SSU'), 'SSU', id, cur ? Util.str(cur.Status) : '', 'Baharu', ctx.bagiPihak ? 'Perakuan diakui admin bagi pihak pemohon' : 'Perakuan pemohon diterima');
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
        ['Tahniah. SSU anda (' + hasil.nama + ') telah diluluskan. No. pendaftaran: ' + hasil.noDaftar + '. Sijil boleh dimuat turun dalam SHAMS.'],
        ['Congratulations. Your SSU (' + hasil.nama + ') has been approved. Registration no.: ' + hasil.noDaftar + '. The certificate can be downloaded in SHAMS.']);
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

  /** Admin menghantar permohonan bagi pihak pelajar. p.terusLulus meluluskan serta-merta. */
  function hantarBagiPihak_(ctx, p) {
    var c = Bantu.ctx(ctx, p.noMatrik);
    var terus = p.terusLulus === true;
    if (terus) requireDecider_(ctx);
    var r = hantar_(c, p);
    if (!terus) return r;
    var out = lulus_(c, r.id, 'Didaftar bagi pihak pelajar', {});
    out.id = r.id;
    return out;
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
            ['Sijil SSU ' + Util.str(per.Nama_Perniagaan) + ' telah tamat tempoh pada ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + '. Sila buat pembaharuan dalam SHAMS.'],
            ['The SSU certificate for ' + Util.str(per.Nama_Perniagaan) + ' expired on ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + '. Please renew in SHAMS.']);
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
        ['Sijil SSU ' + Util.str(per.Nama_Perniagaan) + ' akan tamat pada ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + ' (' + h + ' hari lagi). Sila perbaharui dalam SHAMS.'],
        ['The SSU certificate for ' + Util.str(per.Nama_Perniagaan) + ' expires on ' + Util.fmtTarikhBM(per.Tarikh_Tamat) + ' (' + h + ' days left). Please renew in SHAMS.']);
      Db.append('Peringatan', { Masa: new Date(), Emel: to, Jenis: kunci, Rujukan: id, Status: 'Dihantar', Catatan: h + ' hari baki' });
      hasil.peringatan++;
    });
    return hasil;
  }

  return {
    saya: saya_, dapat: dapat_, hantar: hantar_, fail: fail_,
    adminSenarai: adminSenarai_, adminButiran: adminButiran_, adminKeputusan: adminKeputusan_,
    hantarBagiPihak: hantarBagiPihak_, adminJanaSijil: adminJanaSijil_, adminDaftarSedia: adminDaftarSedia_, lulus: lulus_, butiran: adminButiran_,
    jobHarian: jobHarian_, check: check_
  };
})();
