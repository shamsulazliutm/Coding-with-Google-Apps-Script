/**
 * UTMPreneur: Profiling pelajar (peringkat 2).
 * - Data rasmi daripada PELAJAR dipaparkan (auto-isi); hanya medan semester dan hubungan boleh dikemas kini pelajar.
 * - Satu baris Profil bagi setiap pelajar bagi setiap sesi (sejarah disimpan).
 * - "Lengkap" = ada sekurang-kurangnya satu Profil yang sah. Sesi baharu hanya mencetuskan peringatan, bukan sekatan.
 */

var Profiling = (function () {
  var YA_TIDAK = ['Ya', 'Tidak'];
  var YA_TIDAK_MUNGKIN = ['Ya', 'Tidak', 'Mungkin'];

  function sesi_() { return Cfg.get('SESI_SEMASA', '') || 'UMUM'; }

  function pelajarRow_(noMatrik) {
    var l = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === noMatrik; });
    return l.length ? l[0] : null;
  }

  function maskKp_(kp) {
    var s = Util.str(kp);
    return s.length <= 4 ? s : s.substr(0, 2) + '****' + s.substr(-3);
  }

  /** Profil terkini (sesi paling baharu mengikut Tarikh_Kemas_Kini) bagi pelajar. */
  function latest_(noMatrik) {
    var l = Db.find('Profil', function (r) { return Util.normMatric(r.No_Matrik) === noMatrik; });
    if (!l.length) return null;
    l.sort(function (a, b) {
      var da = Util.toDate(a.Tarikh_Kemas_Kini), db = Util.toDate(b.Tarikh_Kemas_Kini);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    return l[0];
  }

  /** Keadaan profiling: {lengkap, sesi, perluKemasKini}. */
  function status_(noMatrik) {
    var p = latest_(noMatrik);
    if (!p) return { lengkap: false, sesi: sesi_(), perluKemasKini: false };
    return { lengkap: true, sesi: sesi_(), perluKemasKini: Util.str(p.Sesi) !== sesi_() };
  }

  function csv_(arr) { return (arr || []).join(','); }
  function split_(s) { return Util.str(s) ? Util.str(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }

  function view_(ctx) {
    var m = ctx.noMatrik;
    var pel = pelajarRow_(m);
    if (!pel) throw appError_('MATRIK_TIDAK_DITEMUI');
    var p = latest_(m);
    var fam = [];
    if (p) {
      fam = Db.find('Perniagaan_Keluarga', function (r) { return Util.str(r.ID_Profil) === Util.str(p.ID_Profil); })
        .map(function (r) { return { hubungan: Util.str(r.Hubungan), jenis: Util.str(r.Jenis_Perniagaan), tempoh: Util.str(r.Tempoh) }; });
    }
    return {
      pelajar: {
        noMatrik: m, nama: Util.str(pel.Nama_Penuh), emel: Util.str(pel.Emel), noKp: maskKp_(pel.No_KP_Pasport),
        jantina: Util.str(pel.Jantina), etnik: Util.str(pel.Etnik), kewarganegaraan: Util.str(pel.Kewarganegaraan),
        fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program), bidang: Util.str(pel.Bidang_Pengajian),
        tahun: Util.str(pel.Tahun_Pengajian), telefon: Util.str(pel.No_Telefon),
        alamatKolej: Util.str(pel.Alamat_Kolej), alamatRumah: Util.str(pel.Alamat_Rumah)
      },
      profil: p ? {
        sesi: Util.str(p.Sesi), kampung: Util.str(p.Kampung_Halaman),
        keluargaBerniaga: Util.str(p.Keluarga_Berniaga), keluarga: fam,
        pernahBerniaga: Util.str(p.Pernah_Berniaga), jenisDijalankan: Util.str(p.Jenis_Perniagaan_Dijalankan),
        tempohNiaga: Util.str(p.Tempoh_Perniagaan), motivasi: split_(p.Motivasi),
        tahapMinat: Util.str(p.Tahap_Minat), minatBidang: Util.str(p.Minat_Bidang), tahapKesediaan: Util.str(p.Tahap_Kesediaan),
        berminat: Util.str(p.Berminat_Berniaga), klusterDiminati: split_(p.Kluster_Diminati), klusterLain: Util.str(p.Kluster_Lain),
        mahuKampus: Util.str(p.Mahu_Kampus), aliran: Util.str(p.Aliran_Pilihan)
      } : null,
      status: status_(m)
    };
  }

  /** Semak medan. Pulang {nilai, ralat:{medan:mesej}}. */
  function check_(d) {
    var e = {}, v = {};
    var req = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var oneOf = function (k, val, list) { if (list.indexOf(val) < 0) req(k, 'Pilihan tidak sah / Invalid choice'); };
    var codes = function (k, arr, group, min) {
      arr = Array.isArray(arr) ? arr.map(function (x) { return String(x); }) : [];
      var uniq = arr.filter(function (x, i) { return arr.indexOf(x) === i; });
      if (uniq.length < (min || 0)) req(k);
      uniq.forEach(function (x) { if (!Ref.has(group, x)) req(k, 'Pilihan tidak sah / Invalid choice'); });
      return uniq;
    };

    v.telefon = Util.str(d.telefon);
    if (!/^[0-9+\-\s]{8,16}$/.test(v.telefon)) req('telefon', 'No. telefon tidak sah / Invalid phone number');
    v.alamatKolej = Util.str(d.alamatKolej).substr(0, 250);
    v.alamatRumah = Util.str(d.alamatRumah).substr(0, 250);
    if (!v.alamatRumah) req('alamatRumah');

    v.fakulti = Ref.kodOf('FAKULTI', d.fakulti);
    if (!v.fakulti) req('fakulti', 'Pilihan tidak sah / Invalid choice');
    v.bidang = Ref.kodOf('BIDANG', d.bidang);
    if (!v.bidang) req('bidang', 'Pilihan tidak sah / Invalid choice');
    v.program = Util.str(d.program).substr(0, 120);
    if (!v.program) req('program');
    v.tahun = parseInt(d.tahun, 10);
    if (isNaN(v.tahun) || v.tahun < 1 || v.tahun > 7) req('tahun', 'Tahun mesti 1 hingga 7 / Year must be 1 to 7');

    v.kampung = Util.str(d.kampung);
    if (!Ref.has('NEGERI', v.kampung)) req('kampung', 'Pilihan tidak sah / Invalid choice');

    v.keluargaBerniaga = Util.str(d.keluargaBerniaga);
    oneOf('keluargaBerniaga', v.keluargaBerniaga, YA_TIDAK);
    v.keluarga = [];
    if (v.keluargaBerniaga === 'Ya') {
      var fam = Array.isArray(d.keluarga) ? d.keluarga.slice(0, 10) : [];
      fam.forEach(function (f) {
        var h = Util.str(f && f.hubungan), j = Util.str(f && f.jenis).substr(0, 120), t = Util.str(f && f.tempoh).substr(0, 60);
        if (h || j || t) v.keluarga.push({ hubungan: h, jenis: j, tempoh: t });
      });
      if (!v.keluarga.length) req('keluarga', 'Isi sekurang-kurangnya satu ahli keluarga / Add at least one family member');
      v.keluarga.forEach(function (f) {
        if (!Ref.has('HUBUNGAN', f.hubungan) || !f.jenis) req('keluarga', 'Hubungan dan jenis perniagaan wajib / Relationship and business type are required');
      });
    }

    v.pernahBerniaga = Util.str(d.pernahBerniaga);
    oneOf('pernahBerniaga', v.pernahBerniaga, YA_TIDAK);
    v.jenisDijalankan = ''; v.tempohNiaga = ''; v.motivasi = [];
    if (v.pernahBerniaga === 'Ya') {
      v.jenisDijalankan = Util.str(d.jenisDijalankan);
      if (!Ref.has('KLUSTER', v.jenisDijalankan)) req('jenisDijalankan', 'Pilihan tidak sah / Invalid choice');
      v.tempohNiaga = Util.str(d.tempohNiaga);
      if (!Ref.has('TEMPOH_NIAGA', v.tempohNiaga)) req('tempohNiaga', 'Pilihan tidak sah / Invalid choice');
      v.motivasi = codes('motivasi', d.motivasi, 'MOTIVASI', 0);
    }

    // Tahap minat (4 peringkat) menentukan "berminat": Tiada minat = Tidak, selainnya = Ya. Klien lama yang hanya menghantar
    // berminat diterima: Ya dianggap Sederhana, Tidak dianggap Tiada minat.
    v.tahapMinat = Util.str(d.tahapMinat);
    if (!v.tahapMinat) v.tahapMinat = Util.str(d.berminat) === 'Ya' ? 'SEDERHANA' : (Util.str(d.berminat) === 'Tidak' ? 'TIADA' : '');
    if (!Ref.has('TAHAP_MINAT', v.tahapMinat)) req('tahapMinat', 'Pilihan tidak sah / Invalid choice');
    v.berminat = v.tahapMinat === 'TIADA' ? 'Tidak' : 'Ya';
    v.minatBidang = ''; v.tahapKesediaan = '';
    v.klusterDiminati = []; v.klusterLain = ''; v.mahuKampus = ''; v.aliran = '';
    if (v.berminat === 'Ya') {
      v.klusterDiminati = codes('klusterDiminati', d.klusterDiminati, 'KLUSTER', 1);
      if (v.klusterDiminati.indexOf('LAIN') >= 0) {
        v.klusterLain = Util.str(d.klusterLain).substr(0, 120);
        if (!v.klusterLain) req('klusterLain');
      }
      v.mahuKampus = Util.str(d.mahuKampus);
      oneOf('mahuKampus', v.mahuKampus, YA_TIDAK_MUNGKIN);
      v.aliran = Util.str(d.aliran);
      if (!Ref.has('ALIRAN', v.aliran)) req('aliran', 'Pilihan tidak sah / Invalid choice');
      v.minatBidang = Util.str(d.minatBidang);
      if (!Ref.has('MINAT_BIDANG', v.minatBidang)) req('minatBidang', 'Pilihan tidak sah / Invalid choice');
      v.tahapKesediaan = Util.str(d.tahapKesediaan);
      if (!Ref.has('TAHAP_KESEDIAAN', v.tahapKesediaan)) req('tahapKesediaan', 'Pilihan tidak sah / Invalid choice');
    }
    return { nilai: v, ralat: e };
  }

  function save_(ctx, d) {
    d = d || {};
    var chk = check_(d);
    if (Object.keys(chk.ralat).length) throw appError_('PROFIL_TIDAK_SAH', { medan: chk.ralat });
    var v = chk.nilai;
    var m = ctx.noMatrik;
    return Db.withLock(function () {
      var pel = pelajarRow_(m);
      if (!pel) throw appError_('MATRIK_TIDAK_DITEMUI');
      // 1. Kemas kini medan semester dan hubungan dalam PELAJAR (identiti dikunci)
      Db.update('PELAJAR', pel._row, {
        Fakulti: Ref.bm('FAKULTI', v.fakulti), Bidang_Pengajian: Ref.bm('BIDANG', v.bidang), Program: v.program,
        Tahun_Pengajian: v.tahun, No_Telefon: v.telefon, Alamat_Kolej: v.alamatKolej, Alamat_Rumah: v.alamatRumah
      });
      // 2. Profil bagi sesi semasa: kemas kini jika sudah ada
      var sesi = sesi_();
      var cur = Db.find('Profil', function (r) { return Util.normMatric(r.No_Matrik) === m && Util.str(r.Sesi) === sesi; });
      var id = cur.length ? Util.str(cur[0].ID_Profil) : Util.formatId('PRF', null, Db.nextSeqLocked('PRF'), 5);
      var rec = {
        ID_Profil: id, No_Matrik: m, Sesi: sesi, Tarikh_Kemas_Kini: new Date(), No_Telefon: v.telefon,
        Kampung_Halaman: v.kampung, Keluarga_Berniaga: v.keluargaBerniaga, Pernah_Berniaga: v.pernahBerniaga,
        Jenis_Perniagaan_Dijalankan: v.jenisDijalankan, Tempoh_Perniagaan: v.tempohNiaga, Motivasi: csv_(v.motivasi),
        Berminat_Berniaga: v.berminat, Kluster_Diminati: csv_(v.klusterDiminati), Kluster_Lain: v.klusterLain,
        Mahu_Kampus: v.mahuKampus, Aliran_Pilihan: v.aliran,
        Tahap_Minat: v.tahapMinat, Minat_Bidang: v.minatBidang, Tahap_Kesediaan: v.tahapKesediaan
      };
      if (cur.length) Db.update('Profil', cur[0]._row, rec); else Db.append('Profil', rec);
      // 3. Perniagaan keluarga: ganti baris bagi profil ini
      var all = Db.rows('Perniagaan_Keluarga');
      var keep = all.filter(function (r) { return Util.str(r.ID_Profil) !== id; });
      v.keluarga.forEach(function (f) { keep.push({ ID_Profil: id, Hubungan: f.hubungan, Jenis_Perniagaan: f.jenis, Tempoh: f.tempoh }); });
      Db.replaceAll('Perniagaan_Keluarga', keep);
      // 4. Sinkron telefon ke Pengguna
      var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === m && Util.str(r.Peranan) === ROLE.PELAJAR; });
      if (pg.length) { Db.update('Pengguna', pg[0]._row, { Telefon: v.telefon }); Auth.invalidatePengguna(Util.normEmail(pg[0].Emel)); }
      Audit.log(ctx, cur.length ? 'KEMAS_KINI_PROFIL' : 'SIMPAN_PROFIL', 'Profiling', id, '', sesi, '');
      return view_(ctx);
    });
  }

  return { view: view_, save: save_, status: status_, latest: latest_, check: check_ };
})();
