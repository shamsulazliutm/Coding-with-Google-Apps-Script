/**
 * UTMPreneur: Makerspace, tempahan oleh pengguna (pelajar, staf, orang luar) dan bagi pihak oleh admin.
 * Empat jenis: Ruang, Laser Cut, 3D Printer, Pinjaman. Semua pengesahan di pelayan.
 */

var MkTempahan = (function () {
  var MESIN_KADAR = { 'Laser Cut': 'LASER_CUT', '3D Printer': '3D_PRINTER' };
  var KAEDAH = ['Tunai', 'Invois Dalaman', 'Lain-lain'];
  var DIBENARKAN_BATAL = ['Menunggu Perakuan', 'Menunggu Kelulusan'];

  function isMesin_(jenis) { return jenis === 'Laser Cut' || jenis === '3D Printer'; }

  // ---------- Sekatan ----------
  function milik_(r, emel, noMatrik) {
    return Util.normEmail(r.Emel_Pemohon) === emel || (noMatrik && Util.normMatric(r.No_Matrik) === noMatrik);
  }

  /** Sekatan tempahan baharu bagi pemohon: bil Lewat, laporan aktiviti lewat, pinjaman lewat pulang. */
  function sekatan_(emel, noMatrik) {
    var today = Mk.todayKey();
    var tmp = Db.rows('Tempahan').filter(function (r) { return milik_(r, emel, noMatrik); });
    var ids = {}; tmp.forEach(function (r) { ids[Util.str(r.ID_Tempahan)] = r; });
    var bil = Db.rows('Bayaran_Makerspace').filter(function (b) {
      if (!ids[Util.str(b.ID_Tempahan)]) return false;
      var st = Util.str(b.Status);
      if (st === 'Lewat') return true;
      var ta = Util.dateKey(b.Tarikh_Akhir);
      return st === 'Belum Bayar' && ta && ta < today;
    }).map(function (b) { return Util.str(b.ID_Bayaran); });
    var hari = Cfg.num('LAPORAN_AKTIVITI_HARI', 3);
    var lap = {};
    Db.rows('Laporan_Aktiviti').forEach(function (l) { lap[Util.str(l.ID_Tempahan)] = Util.str(l.Status); });
    var laporan = tmp.filter(function (r) {
      if (Util.str(r.Jenis) !== 'Ruang' || ['Diluluskan', 'Selesai'].indexOf(Util.str(r.Status)) < 0) return false;
      var tamat = Util.dateKey(r.Tarikh_Tamat);
      return Mk.addDays(tamat, hari) < today && lap[Util.str(r.ID_Tempahan)] !== 'Dihantar';
    }).map(function (r) { return Util.str(r.ID_Tempahan); });
    var itemRows = Db.rows('Item_Pinjaman');
    var pinjaman = tmp.filter(function (r) {
      return Util.str(r.Jenis) === 'Pinjaman' && Util.str(r.Status) === 'Diluluskan';
    }).filter(function (r) {
      var id = Util.str(r.ID_Tempahan);
      return itemRows.some(function (it) {
        return Util.str(it.ID_Tempahan) === id && Util.str(it.Status) !== 'Dipulangkan' && Util.dateKey(it.Tarikh_Dijangka_Pulang) < today;
      });
    }).map(function (r) { return Util.str(r.ID_Tempahan); });
    return { bil: bil, laporan: laporan, pinjaman: pinjaman };
  }

  function semakSekatan_(pem, jenis) {
    var s = sekatan_(pem.emel, pem.noMatrik);
    if (s.bil.length) throw appError_('MK_BIL_LEWAT');
    if (jenis === 'Ruang' && s.laporan.length) throw appError_('MK_LAPORAN_LEWAT');
    if (jenis === 'Pinjaman' && s.pinjaman.length) throw appError_('MK_PINJAMAN_LEWAT');
  }

  // ---------- Maklumat untuk borang ----------
  function maklumat_(ctx, p) {
    p = p || {};
    var admin = ADMIN_ROLES.indexOf(ctx.role) >= 0;
    var jenisPengguna, pemohon = null;
    if (admin) {
      Mk.adminLihat(ctx);
      jenisPengguna = [ROLE.PELAJAR, ROLE.STAF, ROLE.LUAR].indexOf(Util.str(p.jenisPengguna)) >= 0 ? Util.str(p.jenisPengguna) : ROLE.PELAJAR;
    } else {
      var pem = Mk.pemohonSendiri(ctx);
      jenisPengguna = pem.jenis;
      pemohon = { nama: pem.nama, jenisPengguna: pem.jenis, emel: pem.emel, noMatrik: pem.noMatrik };
    }
    var ops = Mk.ops();
    var today = Mk.todayKey();
    var kd = Mk.kadarFn();
    var rate = function (kod) { var r = kd(kod, jenisPengguna, today); return { ada: r.ada, rm: r.rm, unit: r.unit }; };
    var sumber = Db.rows('PERALATAN').filter(Mk.sumberAktif);
    var mk = function (jenis) {
      return sumber.filter(function (s) { return Util.str(s.Jenis) === jenis; }).map(function (s) {
        var kod = Util.str(s.Kod_Mesin), kk = Util.str(s.Kod_Kadar);
        var o = { kod: kod, nama: nama_(s), noMesin: Util.str(s.No_Mesin), kapasiti: Number(s.Kapasiti) || 0 };
        if (jenis === 'Ruang') o.kadar = kk ? rate(kk) : { ada: false, rm: null, unit: '' };
        else if (jenis === 'Laser Cut') o.kadar = rate(kk || 'LASER_CUT');
        else { var b = kk || '3D_PRINTER'; o.kadarGram = rate(b + '_GRAM'); o.kadarJam = rate(b + '_JAM'); }
        return o;
      });
    };
    var alat = Db.rows('ALAT').filter(function (a) { return Util.truthy(a.Aktif) && Util.truthy(a.Boleh_Dipinjam); }).map(function (a) {
      var b = Mk.baki(a);
      return { kod: Util.str(a.Kod_Alat), nama: Util.str(a.Nama_Alat), kategori: Util.str(a.Kategori), baki: b.baki };
    });
    var peralatanRuang = peralatanRuang_(jenisPengguna, kd, today);
    var cuti = Object.keys(ops.cuti).filter(function (k) { return k >= today; }).sort().map(function (k) { return { tarikh: k, nama: ops.cuti[k] }; });
    var out = {
      admin: admin, pemohon: pemohon, jenisPengguna: jenisPengguna,
      operasi: { hari: ops.hari, buka: Mk.fmtMin(ops.buka), tutup: Mk.fmtMin(ops.tutup), slot: ops.slot, maksMinit: ops.maksMin, notisHari: ops.notis },
      cuti: cuti.slice(0, 60),
      ruang: mk('Ruang'), laser: mk('Laser Cut'), tdp: mk('3D Printer'), alat: alat, peralatanRuang: peralatanRuang,
      kadar: { caj: rate('RUANG_CAJ_PERKHIDMATAN'), pinjaman: rate('PERALATAN_TANGAN') },
      kaedahBayaran: KAEDAH.filter(function (k) { return !(k === 'Invois Dalaman' && jenisPengguna === ROLE.LUAR); }),
      had: {
        maksHariRuang: Cfg.num('RUANG_MAKS_HARI', 14), maksHariDepan: Cfg.num('TEMPAHAN_MAKS_HARI_DEPAN', 180),
        pinjamanBulan: Cfg.num('PINJAMAN_MAKS_BULAN', 1), pinjamanPembaharuan: Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1)
      },
      hariIni: today
    };
    if (!admin) {
      var s = sekatan_(pemohon.emel, pemohon.noMatrik);
      out.sekatan = { bil: s.bil.length > 0, laporan: s.laporan.length > 0, pinjaman: s.pinjaman.length > 0 };
    }
    return out;
  }

  function nama_(s) {
    var n = Util.str(s.Nama_Model) || Util.str(s.Kod_Mesin);
    var no = Util.str(s.No_Mesin);
    return no && n.indexOf(no) < 0 ? n + ' (' + no + ')' : n;
  }

  /** Peralatan tambahan bagi ruang: baris KADAR berkod ALAT_ yang aktif. */
  function peralatanRuang_(jenisPengguna, kd, onKey) {
    var seen = {}, out = [];
    Db.rows('KADAR').forEach(function (r) {
      var kod = Util.str(r.Kod_Sumber);
      if (kod.indexOf('ALAT_') !== 0 || seen[kod] || !Util.truthy(r.Aktif)) return;
      seen[kod] = true;
      var k = kd(kod, jenisPengguna, onKey);
      out.push({ kod: kod, nama: Util.str(r.Nama_Sumber) || kod, unit: k.unit || Util.str(r.Unit), kadar: { ada: k.ada, rm: k.rm } });
    });
    return out;
  }

  // ---------- Ketersediaan ----------
  function ketersediaan_(ctx, p) {
    p = p || {};
    var kod = Util.str(p.kodSumber), tarikh = Util.str(p.tarikh);
    var ops = Mk.ops();
    var s = Mk.sumber(kod);
    if (!s || !Mk.sumberAktif(s)) throw new AppError('MK_TIDAK_DITEMUI', 'Sumber tidak ditemui.', 'Resource not found.');
    var out = { kodSumber: kod, tarikh: tarikh, buka: Mk.fmtMin(ops.buka), tutup: Mk.fmtMin(ops.tutup), slot: ops.slot, operasi: false, sebab: '', sibuk: [] };
    if (!Mk.validKey(tarikh)) { out.sebab = 'Tarikh tidak sah / Invalid date'; return out; }
    if (ops.cuti[tarikh]) { out.sebab = 'Cuti: ' + ops.cuti[tarikh]; return out; }
    if (!Mk.isOp(tarikh, ops)) { out.sebab = 'Bukan hari operasi / Not an operating day'; return out; }
    out.operasi = true;
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Kod_Sumber) !== kod || !Mk.menduduki(r)) return;
      if (Mk.opDaysIn(Util.dateKey(r.Tarikh_Mula), Util.dateKey(r.Tarikh_Tamat), ops).indexOf(tarikh) < 0) return;
      var a = Mk.toMin(r.Masa_Mula), b = Mk.toMin(r.Masa_Tamat);
      if (a === null || b === null) return;
      out.sibuk.push({ mula: Mk.fmtMin(a), tamat: Mk.fmtMin(b), menunggu: Util.str(r.Status) !== 'Diluluskan' });
    });
    out.sibuk.sort(function (x, y) { return x.mula < y.mula ? -1 : 1; });
    return out;
  }

  // ---------- Pengesahan ----------
  function fieldErr_(e, k, bm, en) { e[k] = bm + ' / ' + en; }

  /** Parse senarai item [{kod, kuantiti}]. Pulang {senarai, ralat}. */
  function parseItems_(arr, max) {
    var out = [], seen = {}, err = '';
    if (!Array.isArray(arr)) return { senarai: [], ralat: '' };
    arr.forEach(function (x) {
      if (!x || typeof x !== 'object') return;
      var kod = Util.str(x.kod);
      var q = Mk.int(x.kuantiti);
      if (!kod && (x.kuantiti === '' || x.kuantiti === undefined || x.kuantiti === null)) return; // baris kosong
      if (!kod || q === null || q < 1 || q > 1000) { err = 'Pilih alat dan kuantiti 1 hingga 1000 / Choose an item and a quantity of 1 to 1000'; return; }
      if (seen[kod]) { err = 'Alat pendua: ' + kod + ' / Duplicate item'; return; }
      seen[kod] = true;
      out.push({ kod: kod, kuantiti: q });
    });
    if (out.length > max) err = 'Terlalu banyak item (maksimum ' + max + ') / Too many items';
    return { senarai: out, ralat: err };
  }

  /**
   * Semak medan tempahan. Pulang {v, ralat, fail}. opts.langkasFail: jangan semak fail (anggaran).
   * v mengandungi nilai yang telah dinormalkan.
   */
  function semak_(pem, d, opts) {
    opts = opts || {};
    d = d || {};
    var e = {}, v = {};
    var ops = Mk.ops(), today = Mk.todayKey();
    var bad = function (k, bm, en) { fieldErr_(e, k, bm || 'Wajib diisi', en || 'Required'); };
    v.jenis = Util.str(d.jenis);
    if (Mk.JENIS.indexOf(v.jenis) < 0) { bad('jenis', 'Pilih jenis tempahan', 'Choose a booking type'); return { v: v, ralat: e, fail: {} }; }
    var pelajar = pem.jenis === ROLE.PELAJAR;

    // tarikh
    v.tarikh = Util.str(d.tarikh);
    var tarikhOk = false;
    if (!Mk.validKey(v.tarikh)) bad('tarikh', 'Pilih tarikh', 'Choose a date');
    else if (v.tarikh < today) bad('tarikh', 'Tarikh telah berlalu', 'The date has passed');
    else if (Util.daysBetween(today, v.tarikh) > Cfg.num('TEMPAHAN_MAKS_HARI_DEPAN', 180)) bad('tarikh', 'Terlalu jauh ke hadapan', 'Too far ahead');
    else if (ops.cuti[v.tarikh]) bad('tarikh', 'Cuti: ' + ops.cuti[v.tarikh], 'Public/university holiday');
    else if (!Mk.isOp(v.tarikh, ops)) bad('tarikh', 'Bukan hari operasi (Isnin hingga Jumaat)', 'Not an operating day');
    else tarikhOk = true;

    // tujuan
    v.tujuan = Util.str(d.tujuan).replace(/\s+/g, ' ').substr(0, 300);
    if (v.jenis !== 'Ruang' && v.tujuan.length < 3) bad('tujuan', 'Nyatakan tujuan (sekurang-kurangnya 3 aksara)', 'State the purpose (at least 3 characters)');

    if (v.jenis === 'Ruang') semakRuang_(pem, d, v, e, ops, tarikhOk, bad, opts);
    else if (isMesin_(v.jenis)) semakMesin_(pem, d, v, e, ops, tarikhOk, bad, opts);
    else semakPinjaman_(pem, d, v, e, ops, tarikhOk, bad, today);

    // penyelia (pelajar sahaja)
    v.penyelia = '';
    if (pelajar) {
      v.penyelia = Util.normEmail(d.emelPenyelia);
      var dp = Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), ds = Cfg.get('DOMAIN_STAF', '@utm.my');
      if (!Util.isEmail(v.penyelia)) bad('emelPenyelia', 'Masukkan emel penyelia yang sah', 'Enter a valid supervisor email');
      else if (!Util.isStaffEmail(v.penyelia, dp, ds)) bad('emelPenyelia', 'Emel penyelia mesti emel staf ' + ds, 'The supervisor email must be a staff email ' + ds);
      else if (v.penyelia === pem.emel) bad('emelPenyelia', 'Emel penyelia tidak boleh sama dengan emel pemohon', 'The supervisor email cannot be the applicant\'s own');
    }
    if (d.perakuan !== true) bad('perakuan', 'Perakuan wajib', 'The declaration is required');
    v.fail = v.fail || {};
    return { v: v, ralat: e, fail: v.fail };
  }

  function semakMasaMesin_(d, v, e, ops, tarikhOk, bad) {
    var mm = Mk.toMin(d.masaMula);
    v.mula = mm;
    var minit = Mk.int(d.masaDijangkaMin);
    v.minit = minit;
    if (minit === null || minit < 1 || minit > ops.maksMin) bad('masaDijangkaMin', 'Masa dijangka 1 hingga ' + ops.maksMin + ' minit', 'Expected time 1 to ' + ops.maksMin + ' minutes');
    if (mm === null) bad('masaMula', 'Pilih masa mula', 'Choose a start time');
    else if (mm < ops.buka || (mm - ops.buka) % ops.slot !== 0) bad('masaMula', 'Pilih masa mengikut slot ' + ops.slot + ' minit bermula ' + Mk.fmtMin(ops.buka), 'Choose a time on the ' + ops.slot + '-minute slots from ' + Mk.fmtMin(ops.buka));
    if (mm !== null && minit !== null && minit >= 1 && minit <= ops.maksMin && !e.masaMula) {
      v.tamat = mm + Math.ceil(minit / ops.slot) * ops.slot;
      if (v.tamat > ops.tutup) bad('masaMula', 'Sesi melebihi waktu operasi (tamat ' + Mk.fmtMin(ops.tutup) + ')', 'The session exceeds operating hours (ends ' + Mk.fmtMin(ops.tutup) + ')');
      else if (tarikhOk && v.tarikh === Mk.todayKey() && mm <= Mk.nowMin()) bad('masaMula', 'Masa telah berlalu', 'The time has passed');
    }
  }

  function semakMesin_(pem, d, v, e, ops, tarikhOk, bad, opts) {
    v.kod = Util.str(d.kodSumber);
    var s = Mk.sumber(v.kod);
    if (!s || Util.str(s.Jenis) !== v.jenis || !Mk.sumberAktif(s)) bad('kodSumber', 'Pilih mesin yang tersedia', 'Choose an available machine');
    else v.sumber = s;
    v.namaProjek = Util.str(d.namaProjek).substr(0, 120);
    if (v.namaProjek.length < 3) bad('namaProjek', 'Nama projek sekurang-kurangnya 3 aksara', 'Project name of at least 3 characters');
    v.tarikhTamat = v.tarikh;
    semakMasaMesin_(d, v, e, ops, tarikhOk, bad);
    if (v.jenis === 'Laser Cut') {
      v.jenisBahan = Util.str(d.jenisBahan).substr(0, 80);
      if (v.jenisBahan.length < 2) bad('jenisBahan', 'Nyatakan jenis bahan', 'State the material');
    } else {
      v.warna = Util.str(d.warna).substr(0, 40);
      if (v.warna.length < 2) bad('warna', 'Nyatakan warna', 'State the colour');
      var g = Util.parseRm(d.beratG);
      if (g === null || g <= 0 || g > 5000) bad('beratG', 'Berat dalam gram (lebih daripada 0 hingga 5000)', 'Weight in grams (above 0 up to 5000)');
      else v.beratG = g;
      v.fail = {};
      if (!opts.langkasFail) {
        if (d.gambar && d.gambar.data) {
          try { v.fail.gambar = Files.validate(d.gambar, ['jpg', 'jpeg', 'png']); } catch (er) { bad('gambar', 'Gambar JPG atau PNG sahaja (saiz dihadkan)', 'JPG or PNG image only (limited size)'); }
        } else bad('gambar', 'Muat naik gambar projek (JPG/PNG)', 'Upload a project picture (JPG/PNG)');
      }
    }
    if (tarikhOk && v.sumber && v.mula !== null && v.tamat && !e.masaMula && !e.masaDijangkaMin) {
      var k = Mk.konflik(v.kod, [v.tarikh], v.mula, v.tamat, '', ops);
      if (k.length) bad('masaMula', 'Slot bertindih dengan tempahan lain (' + Mk.fmtMin(Mk.toMin(k[0].Masa_Mula)) + ' - ' + Mk.fmtMin(Mk.toMin(k[0].Masa_Tamat)) + ')', 'The slot overlaps another booking');
    }
  }

  function semakRuang_(pem, d, v, e, ops, tarikhOk, bad, opts) {
    v.kod = Util.str(d.kodSumber);
    var s = Mk.sumber(v.kod);
    if (!s || Util.str(s.Jenis) !== 'Ruang' || !Mk.sumberAktif(s)) bad('kodSumber', 'Pilih ruang yang tersedia', 'Choose an available space');
    else v.sumber = s;
    v.namaProgram = Util.str(d.namaProgram).replace(/\s+/g, ' ').substr(0, 200);
    if (v.namaProgram.length < 3) bad('namaProgram', 'Nyatakan tujuan / program (sekurang-kurangnya 3 aksara)', 'State the purpose / programme (at least 3 characters)');
    v.tujuan = v.namaProgram;
    v.bilHari = Mk.int(d.bilHari);
    var maksHari = Cfg.num('RUANG_MAKS_HARI', 14);
    if (v.bilHari === null || v.bilHari < 1 || v.bilHari > maksHari) bad('bilHari', 'Bilangan hari 1 hingga ' + maksHari, 'Number of days 1 to ' + maksHari);
    var a = Mk.toMin(d.masaMula), b = Mk.toMin(d.masaTamat);
    if (a === null) bad('masaMula', 'Pilih masa mula', 'Choose a start time');
    if (b === null) bad('masaTamat', 'Pilih masa tamat', 'Choose an end time');
    if (a !== null && b !== null) {
      if (a < ops.buka || b > ops.tutup) bad('masaMula', 'Masa mesti dalam waktu operasi ' + Mk.fmtMin(ops.buka) + ' - ' + Mk.fmtMin(ops.tutup), 'Time must be within operating hours');
      else if (a >= b) bad('masaTamat', 'Masa tamat mesti selepas masa mula', 'The end time must be after the start time');
    }
    v.mula = a; v.tamat = b;
    // notis hari bekerja
    if (tarikhOk && Mk.workingDays(Mk.todayKey(), v.tarikh, ops) < ops.notis) {
      bad('tarikh', 'Tempahan ruang mesti dibuat sekurang-kurangnya ' + ops.notis + ' hari bekerja lebih awal', 'Space bookings need at least ' + ops.notis + ' working days\' notice');
      tarikhOk = false;
    }
    v.hari = [];
    if (tarikhOk && v.bilHari !== null && !e.bilHari) {
      v.hari = Mk.opDaysFrom(v.tarikh, v.bilHari, ops);
      v.tarikhTamat = v.hari[v.hari.length - 1];
    } else v.tarikhTamat = v.tarikh;
    v.bilPeserta = Mk.int(d.bilPeserta);
    var kap = s ? Number(s.Kapasiti) || 0 : 0;
    if (v.bilPeserta === null || v.bilPeserta < 1) bad('bilPeserta', 'Masukkan jumlah peserta', 'Enter the number of participants');
    else if (kap > 0 && v.bilPeserta > kap) bad('bilPeserta', 'Melebihi kapasiti ruang (' + kap + ')', 'Exceeds the capacity (' + kap + ')');
    // bayaran
    v.kaedah = Util.str(d.kaedahBayaran);
    if (KAEDAH.indexOf(v.kaedah) < 0) bad('kaedahBayaran', 'Pilih kaedah bayaran', 'Choose a payment method');
    else if (v.kaedah === 'Invois Dalaman' && pem.jenis === ROLE.LUAR) bad('kaedahBayaran', 'Invois Dalaman untuk warga UTM sahaja', 'Internal invoice is for UTM members only');
    v.kaedahLain = Util.str(d.kaedahLain).substr(0, 120);
    if (v.kaedah === 'Lain-lain' && v.kaedahLain.length < 2) bad('kaedahLain', 'Nyatakan kaedah bayaran', 'Specify the payment method');
    v.noVot = Util.str(d.noVot).substr(0, 40);
    v.namaStafKewangan = Util.str(d.namaStafKewangan).substr(0, 120);
    v.telStafKewangan = Util.str(d.telStafKewangan).substr(0, 20);
    if (v.kaedah === 'Invois Dalaman') {
      if (!/^[A-Za-z0-9\-\/. ]{3,40}$/.test(v.noVot)) bad('noVot', 'Masukkan No. VOT / cajline', 'Enter the VOT / cajline number');
      if (v.namaStafKewangan.length < 2) bad('namaStafKewangan', 'Nama staf kewangan wajib', 'Finance officer name is required');
      if (!/^[0-9+\-\s]{8,16}$/.test(v.telStafKewangan)) bad('telStafKewangan', 'No. telefon tidak sah', 'Invalid phone number');
    }
    // peralatan tambahan
    var it = parseItems_(d.peralatan, 30);
    v.peralatan = it.senarai;
    if (it.ralat) bad('peralatan', it.ralat.split(' / ')[0], it.ralat.split(' / ')[1]);
    else {
      var valid = {};
      Db.rows('KADAR').forEach(function (r) { if (Util.truthy(r.Aktif) && Util.str(r.Kod_Sumber).indexOf('ALAT_') === 0) valid[Util.str(r.Kod_Sumber)] = true; });
      v.peralatan.forEach(function (x) { if (!valid[x.kod]) bad('peralatan', 'Peralatan tidak sah: ' + x.kod, 'Invalid equipment: ' + x.kod); });
    }
    // fail
    v.fail = {};
    if (!opts.langkasFail) {
      var chk = function (key, f, wajib, bm, en) {
        if (f && f.data) {
          try { v.fail[key] = Files.validate(f, ['pdf']); } catch (er) { bad(key === 'kertas' ? 'failKertasKerja' : 'failSurat', 'Fail PDF sahaja (saiz dihadkan)', 'PDF only (limited size)'); }
        } else if (wajib) bad(key === 'kertas' ? 'failKertasKerja' : 'failSurat', bm, en);
      };
      chk('kertas', d.failKertasKerja, true, 'Muat naik kertas kerja program (PDF)', 'Upload the programme paper (PDF)');
      chk('surat', d.failSurat, pem.jenis !== ROLE.PELAJAR, 'Muat naik surat permohonan (PDF)', 'Upload the application letter (PDF)');
    }
    // konflik
    if (s && v.hari.length && a !== null && b !== null && !e.masaMula && !e.masaTamat && !e.tarikh) {
      var k = Mk.konflik(v.kod, v.hari, a, b, '', ops);
      if (k.length) bad('tarikh', 'Ruang telah ditempah atau sedang menunggu kelulusan pada tarikh/masa ini', 'The space is already booked or awaiting approval at this date/time');
    }
  }

  function semakPinjaman_(pem, d, v, e, ops, tarikhOk, bad, today) {
    v.kod = 'PINJAMAN';
    v.tarikhTamat = '';
    var it = parseItems_(d.item, 10);
    v.item = it.senarai;
    if (it.ralat) bad('item', it.ralat.split(' / ')[0], it.ralat.split(' / ')[1]);
    else if (!v.item.length) bad('item', 'Pilih sekurang-kurangnya satu alat', 'Choose at least one item');
    else {
      v.item.forEach(function (x) {
        var a = Mk.alat(x.kod);
        if (!a || !Util.truthy(a.Aktif) || !Util.truthy(a.Boleh_Dipinjam)) { bad('item', 'Alat tidak boleh dipinjam: ' + x.kod, 'Item cannot be borrowed: ' + x.kod); return; }
        var b = Mk.baki(a);
        if (x.kuantiti > b.baki && !e.item) bad('item', 'Baki stok ' + Util.str(a.Nama_Alat) + ' tidak mencukupi (baki ' + b.baki + ')', 'Not enough stock of ' + Util.str(a.Nama_Alat) + ' (available ' + b.baki + ')');
      });
    }
    v.tarikhPulang = Util.str(d.tarikhPulang);
    if (!Mk.validKey(v.tarikhPulang)) bad('tarikhPulang', 'Pilih tarikh dijangka pulang', 'Choose the expected return date');
    else if (tarikhOk) {
      var maks = Util.dateKey(Util.addMonths(v.tarikh, Cfg.num('PINJAMAN_MAKS_BULAN', 1)));
      if (v.tarikhPulang < v.tarikh) bad('tarikhPulang', 'Tarikh pulang mesti selepas tarikh pinjam', 'The return date must not be before the loan date');
      else if (v.tarikhPulang > maks) bad('tarikhPulang', 'Tempoh pinjaman maksimum ' + Cfg.num('PINJAMAN_MAKS_BULAN', 1) + ' bulan (sehingga ' + maks + ')', 'Maximum loan period of ' + Cfg.num('PINJAMAN_MAKS_BULAN', 1) + ' month(s) (up to ' + maks + ')');
      else if (!Mk.isOp(v.tarikhPulang, ops)) bad('tarikhPulang', 'Tarikh pulang mesti hari operasi dan bukan cuti', 'The return date must be an operating day, not a holiday');
      else v.tarikhTamat = v.tarikhPulang;
    }
    v.mula = null; v.tamat = null;
  }

  // ---------- Anggaran ----------
  function anggar_(ctx, p, admin) {
    var pem = admin ? Mk.pemohonBagi(ctx, p) : Mk.pemohonSendiri(ctx);
    var r = semak_(pem, p, { langkasFail: true });
    var out = { ralat: r.ralat, jumlah: null, baris: [], belum: [] };
    var kira = kiraDari_(r.v, pem);
    if (kira) { out.jumlah = kira.jumlah; out.baris = kira.baris; out.belum = kira.belum; }
    return out;
  }

  function kiraDari_(v, pem) {
    if (!v.jenis || !v.tarikh) return null;
    var bu = {};
    if (v.jenis === 'Ruang') { if (!v.sumber || !v.bilHari || v.bilHari < 1) return null; bu = { bilHari: v.bilHari, peralatan: v.peralatan || [] }; }
    else if (v.jenis === 'Laser Cut') { if (!v.sumber || !v.minit) return null; bu = { minit: v.minit }; }
    else if (v.jenis === '3D Printer') { if (!v.sumber || !v.minit || !v.beratG) return null; bu = { minit: v.minit, beratG: v.beratG }; }
    else bu = {};
    return MkBil.kira(v.jenis, v.kod, pem.jenis, Mk.validKey(v.tarikh) ? v.tarikh : Mk.todayKey(), bu, Mk.kadarFn());
  }

  // ---------- Hantar ----------
  function hantar_(ctx, d, pem) {
    d = d || {};
    var jenis = Util.str(d.jenis);
    if (Mk.JENIS.indexOf(jenis) < 0) throw appError_('MK_TIDAK_SAH', { medan: { jenis: 'Pilih jenis tempahan / Choose a booking type' } });
    semakSekatan_(pem, jenis);
    var r = semak_(pem, d, {});
    if (Object.keys(r.ralat).length) throw appError_('MK_TIDAK_SAH', { medan: r.ralat });
    var v = r.v;
    var pelajar = pem.jenis === ROLE.PELAJAR;
    var kira = kiraDari_(v, pem);
    var anggaran = kira && !kira.belum.length ? kira.jumlah : '';

    // fail disimpan dahulu (di luar kunci)
    var stamp = Util.fmtDate(new Date(), 'yyyyMMddHHmm') + '_' + Util.randomToken().substr(0, 6);
    var url = { kertas: '', surat: '', gambar: '' };
    if (v.fail.kertas) url.kertas = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'KERTAS_KERJA_' + stamp, v.fail.kertas);
    if (v.fail.surat) url.surat = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'SURAT_' + stamp, v.fail.surat);
    if (v.fail.gambar) url.gambar = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'GAMBAR_3DP_' + stamp, v.fail.gambar);

    var token = pelajar ? Util.randomToken() : '';
    var now = new Date();
    var hasil = Db.withLock(function () {
      // semak semula dalam kunci: konflik dan stok
      var ops = Mk.ops();
      if (v.jenis === 'Pinjaman') {
        v.item.forEach(function (x) {
          if (x.kuantiti > Mk.baki(Mk.alat(x.kod)).baki) throw appError_('MK_STOK');
        });
      } else {
        var days = v.jenis === 'Ruang' ? v.hari : [v.tarikh];
        if (Mk.konflik(v.kod, days, v.mula, v.tamat, '', ops).length) throw appError_('MK_KONFLIK');
      }
      var id = Mk.idBaharu(Mk.PREFIX_ID);
      var tamatToken = pelajar ? new Date(now.getTime() + Cfg.num('PERAKUAN_TAMAT_HARI', 5) * 86400000) : '';
      Db.append('Tempahan', {
        ID_Tempahan: id, Jenis: v.jenis, Kod_Sumber: v.kod, Jenis_Pengguna: pem.jenis, Emel_Pemohon: pem.emel, Nama_Pemohon: pem.nama,
        Tarikh_Mula: Util.toDate(v.tarikh), Masa_Mula: v.mula === null ? '' : Mk.fmtMin(v.mula),
        Tarikh_Tamat: v.tarikhTamat ? Util.toDate(v.tarikhTamat) : '', Masa_Tamat: v.tamat === null ? '' : Mk.fmtMin(v.tamat),
        Tujuan: v.tujuan, Emel_Penyelia: v.penyelia, Status_Perakuan: pelajar ? 'Menunggu' : 'Tidak Perlu', Tarikh_Perakuan: '',
        Status: pelajar ? 'Menunggu Perakuan' : 'Menunggu Kelulusan', Diluluskan_Oleh: '', Tarikh_Keputusan: '', Catatan: '',
        No_Matrik: pem.noMatrik, Telefon: pem.telefon, Jabatan: pem.jabatan, Anggaran_RM: anggaran, Dicipta_Pada: now,
        Didaftar_Oleh: pem.bagiPihak ? ctx.email : '', Token_Hash: token ? MkPerakuan.hash(token) : '', Token_Tamat: tamatToken,
        Catatan_Penyelia: '', Bil_Pembaharuan: 0
      });
      if (v.jenis === 'Ruang') {
        Db.append('Butiran_Ruang', {
          ID_Tempahan: id, Nama_Program: v.namaProgram, Bil_Hari: v.bilHari, Bil_Peserta: v.bilPeserta, Kaedah_Bayaran: v.kaedah,
          No_VOT: v.kaedah === 'Invois Dalaman' ? v.noVot : '', Nama_Staf_Kewangan: v.kaedah === 'Invois Dalaman' ? v.namaStafKewangan : '',
          Tel_Staf_Kewangan: v.kaedah === 'Invois Dalaman' ? v.telStafKewangan : '', Fail_Kertas_Kerja: url.kertas, Fail_Surat: url.surat,
          Kaedah_Lain: v.kaedah === 'Lain-lain' ? v.kaedahLain : ''
        });
        v.peralatan.forEach(function (x) { Db.append('Item_Peralatan_Ruang', { ID_Tempahan: id, Kod_Alat: x.kod, Kuantiti: x.kuantiti }); });
      } else if (v.jenis === 'Laser Cut') {
        Db.append('Butiran_LaserCut', { ID_Tempahan: id, Nama_Projek: v.namaProjek, Jenis_Bahan: v.jenisBahan, Masa_Dijangka_Min: v.minit });
      } else if (v.jenis === '3D Printer') {
        Db.append('Butiran_3DP', {
          ID_Tempahan: id, Nama_Projek: v.namaProjek, Fail_Gambar: url.gambar, Berat_g: v.beratG, Warna: v.warna,
          No_Mesin: Util.str(v.sumber.No_Mesin), Masa_Dijangka_Min: v.minit
        });
      } else {
        v.item.forEach(function (x) {
          Db.append('Item_Pinjaman', { ID_Tempahan: id, Kod_Alat: x.kod, Kuantiti: x.kuantiti, Tarikh_Dijangka_Pulang: Util.toDate(v.tarikhTamat), Status: 'Dimohon' });
        });
      }
      Audit.log(auditCtx_(ctx, pem), 'MK_TEMPAH', 'Makerspace', id, '', pelajar ? 'Menunggu Perakuan' : 'Menunggu Kelulusan', v.jenis + ' ' + v.kod);
      return id;
    });

    var out = { id: hasil, status: pelajar ? 'Menunggu Perakuan' : 'Menunggu Kelulusan', anggaran: anggaran === '' ? null : anggaran, belumDitetapkan: kira ? kira.belum : [] };
    if (pelajar) out.emelPerakuanDihantar = MkPerakuan.hantarPautan(Mk.tempahan(hasil), token);
    Mk.mel(pem.emel, 'Tempahan Makerspace diterima', 'Makerspace booking received',
      ['Tempahan ' + hasil + ' (' + v.jenis + ') pada ' + Util.fmtTarikhBM(v.tarikh) + ' telah diterima.' +
        (pelajar ? ' Pautan perakuan telah dihantar kepada penyelia anda (' + v.penyelia + '). Tempahan akan disemak oleh UTMXCITE selepas diperakui.' : ' Tempahan akan disemak oleh UTMXCITE.')],
      ['Booking ' + hasil + ' (' + v.jenis + ') on ' + v.tarikh + ' has been received.' +
        (pelajar ? ' An endorsement link has been sent to your supervisor (' + v.penyelia + '). UTMXCITE will review it once endorsed.' : ' UTMXCITE will review it.')]);
    return out;
  }

  function auditCtx_(ctx, pem) {
    return { email: ctx.email, role: ctx.role, noMatrik: pem.noMatrik || pem.emel, bagiPihak: pem.bagiPihak };
  }

  // ---------- Paparan ----------
  function maskEmel_(e) {
    var m = /^(.)(.*)(@.+)$/.exec(e || '');
    return m ? m[1] + '***' + m[3] : '';
  }
  function bilOf_(id) {
    var l = Db.find('Bayaran_Makerspace', function (b) { return Util.str(b.ID_Tempahan) === id; });
    return l.length ? l[0] : null;
  }
  function bilView_(b) {
    if (!b) return null;
    var kos = b.Kos_Sebenar_RM === '' || b.Kos_Sebenar_RM === null || b.Kos_Sebenar_RM === undefined ? null : Number(b.Kos_Sebenar_RM);
    var ang = b.Anggaran_RM === '' || b.Anggaran_RM === null || b.Anggaran_RM === undefined ? null : Number(b.Anggaran_RM);
    return {
      id: Util.str(b.ID_Bayaran), idTempahan: Util.str(b.ID_Tempahan), status: Util.str(b.Status), anggaran: ang, kosSebenar: kos,
      jumlah: kos !== null ? kos : ang, penggunaan: Util.str(b.Penggunaan_Sebenar), tarikhJana: Util.dateKey(b.Tarikh_Jana), tarikhAkhir: Util.dateKey(b.Tarikh_Akhir),
      tarikhBayar: Util.dateKey(b.Tarikh_Bayar), kaedah: Util.str(b.Kaedah), noRujukan: Util.str(b.No_Rujukan), adaResit: !!Util.str(b.Fail_Resit),
      disahkanOleh: Util.str(b.Disahkan_Oleh), tarikhPengesahan: Util.dateKey(b.Tarikh_Pengesahan), catatan: Util.str(b.Catatan)
    };
  }

  /** Paparan penuh satu tempahan. opts.admin: sertakan emel penuh dan maklumat hubungan. */
  function paparan_(r, opts) {
    opts = opts || {};
    var id = Util.str(r.ID_Tempahan), jenis = Util.str(r.Jenis);
    var s = jenis === 'Pinjaman' ? null : Mk.sumber(Util.str(r.Kod_Sumber));
    var o = {
      id: id, jenis: jenis, kodSumber: Util.str(r.Kod_Sumber), sumberNama: s ? nama_(s) : (jenis === 'Pinjaman' ? 'Pinjaman peralatan' : Util.str(r.Kod_Sumber)),
      jenisPengguna: Util.str(r.Jenis_Pengguna), namaPemohon: Util.str(r.Nama_Pemohon),
      tarikhMula: Util.dateKey(r.Tarikh_Mula), tarikhTamat: Util.dateKey(r.Tarikh_Tamat), masaMula: Util.str(r.Masa_Mula), masaTamat: Util.str(r.Masa_Tamat),
      tujuan: Util.str(r.Tujuan), status: Util.str(r.Status), statusPerakuan: Util.str(r.Status_Perakuan),
      tarikhPerakuan: Util.dateKey(r.Tarikh_Perakuan), catatan: Util.str(r.Catatan), catatanPenyelia: Util.str(r.Catatan_Penyelia),
      anggaran: r.Anggaran_RM === '' || r.Anggaran_RM === null ? null : Number(r.Anggaran_RM),
      dicipta: Util.dateKey(r.Dicipta_Pada), bagiPihak: !!Util.str(r.Didaftar_Oleh), diluluskanOleh: Util.str(r.Diluluskan_Oleh),
      tarikhKeputusan: Util.dateKey(r.Tarikh_Keputusan), bilPembaharuan: Number(r.Bil_Pembaharuan) || 0,
      penyelia: opts.admin ? Util.str(r.Emel_Penyelia) : maskEmel_(Util.str(r.Emel_Penyelia)),
      pautanTamat: Util.str(r.Status) === 'Menunggu Perakuan' ? Util.dateKey(r.Token_Tamat) : ''
    };
    if (opts.admin) {
      o.pemohon = { emel: Util.str(r.Emel_Pemohon), noMatrik: Util.str(r.No_Matrik), telefon: Util.str(r.Telefon), jabatan: Util.str(r.Jabatan), didaftarOleh: Util.str(r.Didaftar_Oleh) };
    } else {
      o.pemohon = { jabatan: Util.str(r.Jabatan) };
    }
    if (jenis === 'Ruang') {
      var b = Mk.byId('Butiran_Ruang', id) || {};
      o.butiran = {
        namaProgram: Util.str(b.Nama_Program), bilHari: Number(b.Bil_Hari) || 0, bilPeserta: Number(b.Bil_Peserta) || 0,
        kaedahBayaran: Util.str(b.Kaedah_Bayaran), kaedahLain: Util.str(b.Kaedah_Lain), noVot: Util.str(b.No_VOT),
        namaStafKewangan: Util.str(b.Nama_Staf_Kewangan), telStafKewangan: Util.str(b.Tel_Staf_Kewangan),
        hariSebenar: b.Hari_Sebenar === '' || b.Hari_Sebenar === undefined ? null : Number(b.Hari_Sebenar),
        kapasiti: s ? Number(s.Kapasiti) || 0 : 0
      };
      o.fail = { kertas: !!Util.str(b.Fail_Kertas_Kerja), surat: !!Util.str(b.Fail_Surat) };
      var kd = Mk.kadarFn();
      o.peralatan = Mk.listById('Item_Peralatan_Ruang', id).map(function (x) {
        var kk = kd(Util.str(x.Kod_Alat), Util.str(r.Jenis_Pengguna), o.tarikhMula);
        return { kod: Util.str(x.Kod_Alat), nama: kk.nama, kuantiti: Number(x.Kuantiti) || 0 };
      });
      var lap = Mk.byId('Laporan_Aktiviti', id);
      var had = Cfg.num('LAPORAN_AKTIVITI_HARI', 3);
      o.laporan = { status: lap ? Util.str(lap.Status) : '', tarikhHantar: lap ? Util.dateKey(lap.Tarikh_Hantar) : '', tarikhHad: o.tarikhTamat ? Mk.addDays(o.tarikhTamat, had) : '', ada: !!(lap && Util.str(lap.Fail_Laporan)) };
    } else if (jenis === 'Laser Cut') {
      var l = Mk.byId('Butiran_LaserCut', id) || {};
      o.butiran = { namaProjek: Util.str(l.Nama_Projek), jenisBahan: Util.str(l.Jenis_Bahan), minitDijangka: Number(l.Masa_Dijangka_Min) || 0, minitSebenar: l.Masa_Sebenar_Min === '' || l.Masa_Sebenar_Min === undefined ? null : Number(l.Masa_Sebenar_Min) };
    } else if (jenis === '3D Printer') {
      var t = Mk.byId('Butiran_3DP', id) || {};
      o.butiran = {
        namaProjek: Util.str(t.Nama_Projek), beratG: Number(t.Berat_g) || 0, warna: Util.str(t.Warna), noMesin: Util.str(t.No_Mesin), minitDijangka: Number(t.Masa_Dijangka_Min) || 0,
        minitSebenar: t.Masa_Sebenar_Min === '' || t.Masa_Sebenar_Min === undefined ? null : Number(t.Masa_Sebenar_Min),
        beratSebenarG: t.Berat_Sebenar_g === '' || t.Berat_Sebenar_g === undefined ? null : Number(t.Berat_Sebenar_g)
      };
      o.fail = { gambar: !!Util.str(t.Fail_Gambar) };
    } else {
      var today = Mk.todayKey();
      o.item = Mk.listById('Item_Pinjaman', id).map(function (it) {
        var a = Mk.alat(Util.str(it.Kod_Alat));
        var due = Util.dateKey(it.Tarikh_Dijangka_Pulang);
        var st = Util.str(it.Status);
        return {
          kod: Util.str(it.Kod_Alat), nama: a ? Util.str(a.Nama_Alat) : Util.str(it.Kod_Alat), kuantiti: Number(it.Kuantiti) || 0, tarikhPulangDijangka: due,
          tarikhPulang: Util.dateKey(it.Tarikh_Pulang), status: st, lewat: st !== 'Dipulangkan' && o.status === 'Diluluskan' && due !== '' && due < today
        };
      });
      o.lewat = o.item.some(function (x) { return x.lewat; });
    }
    o.bayaran = bilView_(bilOf_(id));
    return o;
  }

  function saya_(ctx) {
    var pem = Mk.pemohonSendiri(ctx);
    var rows = Db.rows('Tempahan').filter(function (r) { return milik_(r, pem.emel, pem.noMatrik); });
    rows.sort(function (a, b) { return (Util.toDate(b.Dicipta_Pada) || 0) - (Util.toDate(a.Dicipta_Pada) || 0); });
    var s = sekatan_(pem.emel, pem.noMatrik);
    return {
      senarai: rows.slice(0, 200).map(function (r) { var o = paparan_(r, {}); return ringkas_(o); }),
      sekatan: { bil: s.bil, laporan: s.laporan, pinjaman: s.pinjaman }
    };
  }

  function ringkas_(o) {
    return {
      id: o.id, jenis: o.jenis, sumberNama: o.sumberNama, tarikhMula: o.tarikhMula, tarikhTamat: o.tarikhTamat, masaMula: o.masaMula, masaTamat: o.masaTamat,
      tujuan: o.tujuan, status: o.status, statusPerakuan: o.statusPerakuan, bayaran: o.bayaran ? { id: o.bayaran.id, status: o.bayaran.status, jumlah: o.bayaran.jumlah, tarikhAkhir: o.bayaran.tarikhAkhir } : null,
      laporan: o.laporan ? o.laporan.status : '', lewat: !!o.lewat
    };
  }

  function milikOrThrow_(ctx, id) {
    var pem = Mk.pemohonSendiri(ctx);
    var r = Mk.tempahan(Util.str(id));
    if (!r || !milik_(r, pem.emel, pem.noMatrik)) throw appError_('MK_TIDAK_DITEMUI');
    return { r: r, pem: pem };
  }

  /** Tindakan yang dibenarkan kepada pemohon. */
  function bolehPemohon_(o) {
    var today = Mk.todayKey();
    var aktifSelesai = o.status === 'Diluluskan' || o.status === 'Selesai';
    var bayarStatus = o.bayaran ? o.bayaran.status : '';
    return {
      batal: DIBENARKAN_BATAL.indexOf(o.status) >= 0 || (o.status === 'Diluluskan' && o.tarikhMula > today),
      hantarSemulaPerakuan: o.status === 'Menunggu Perakuan',
      perbaharui: o.jenis === 'Pinjaman' && o.status === 'Diluluskan' && o.bilPembaharuan < Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1) && !o.lewat,
      bayar: ['Belum Bayar', 'Lewat'].indexOf(bayarStatus) >= 0,
      laporan: o.jenis === 'Ruang' && aktifSelesai && o.tarikhTamat <= today
    };
  }

  function butiran_(ctx, p) {
    var m = milikOrThrow_(ctx, p.id);
    var o = paparan_(m.r, {});
    o.boleh = bolehPemohon_(o);
    return o;
  }

  function batal_(ctx, p) {
    var m = milikOrThrow_(ctx, p.id);
    var id = Util.str(m.r.ID_Tempahan);
    var catatan = Util.str(p.catatan).substr(0, 300);
    Db.withLock(function () {
      var r = Mk.tempahan(id);
      var o = paparan_(r, {});
      if (!bolehPemohon_(o).batal) throw appError_('MK_BATAL_TIDAK_BOLEH');
      Db.update('Tempahan', r._row, { Status: 'Dibatalkan', Token_Hash: '', Tarikh_Keputusan: new Date(), Catatan: 'Dibatalkan oleh pemohon' + (catatan ? ': ' + catatan : '') });
      Audit.log(ctx, 'MK_BATAL', 'Makerspace', id, Util.str(r.Status), 'Dibatalkan', catatan);
    });
    return butiran_(ctx, { id: id });
  }

  function perbaharui_(ctx, p, admin) {
    var id = Util.str(p.id);
    var r, pem = null;
    if (admin) { Mk.adminPutus(ctx); r = Mk.tempahan(id); if (!r) throw appError_('MK_TIDAK_DITEMUI'); }
    else { var m = milikOrThrow_(ctx, id); r = m.r; pem = m.pem; }
    var due;
    Db.withLock(function () {
      r = Mk.tempahan(id);
      var ops = Mk.ops();
      if (Util.str(r.Jenis) !== 'Pinjaman' || Util.str(r.Status) !== 'Diluluskan') throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      if ((Number(r.Bil_Pembaharuan) || 0) >= Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1)) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      var items = Mk.listById('Item_Pinjaman', id).filter(function (it) { return Util.str(it.Status) !== 'Dipulangkan'; });
      if (!items.length) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      var lama = Util.dateKey(r.Tarikh_Tamat);
      if (!admin && lama < Mk.todayKey()) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      due = Util.dateKey(Util.addMonths(lama, Cfg.num('PINJAMAN_MAKS_BULAN', 1)));
      var n = 0;
      while (!Mk.isOp(due, ops) && n++ < 10) due = Mk.addDays(due, -1);
      if (due <= lama) throw appError_('MK_PEMBAHARUAN_TIDAK_SAH');
      items.forEach(function (it) { Db.update('Item_Pinjaman', it._row, { Tarikh_Dijangka_Pulang: Util.toDate(due) }); });
      Db.update('Tempahan', r._row, { Tarikh_Tamat: Util.toDate(due), Bil_Pembaharuan: (Number(r.Bil_Pembaharuan) || 0) + 1 });
      Audit.log(ctx, 'MK_PERBAHARUI_PINJAMAN', 'Makerspace', id, lama, due, admin ? 'oleh admin' : 'oleh pemohon');
    });
    Mk.mel(Util.normEmail(r.Emel_Pemohon), 'Pinjaman diperbaharui', 'Loan renewed',
      ['Pinjaman ' + id + ' diperbaharui. Tarikh dijangka pulang baharu: ' + Util.fmtTarikhBM(due) + '.'],
      ['Loan ' + id + ' has been renewed. New expected return date: ' + due + '.']);
    return admin ? MkAdmin.butiran(ctx, { id: id }) : butiran_(ctx, { id: id });
  }

  function hantarLaporan_(ctx, p) {
    var m = milikOrThrow_(ctx, p.id);
    var id = Util.str(m.r.ID_Tempahan);
    var o = paparan_(m.r, {});
    if (!bolehPemohon_(o).laporan) throw appError_('MK_LAPORAN_TIDAK_SAH');
    var v;
    try { v = Files.validate(p.fail, ['pdf']); } catch (e) { throw appError_('MK_TIDAK_SAH', { medan: { fail: 'Fail PDF sahaja (saiz dihadkan) / PDF only (limited size)' } }); }
    var url = Files.save('FLD_LAMPIRAN_MAKERSPACE', 'LAPORAN_' + id + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), v);
    Db.withLock(function () {
      var lap = Mk.byId('Laporan_Aktiviti', id);
      var rec = { ID_Tempahan: id, Fail_Laporan: url, Tarikh_Hantar: new Date(), Status: 'Dihantar' };
      if (lap) Db.update('Laporan_Aktiviti', lap._row, rec); else Db.append('Laporan_Aktiviti', rec);
      Audit.log(ctx, 'MK_LAPORAN_HANTAR', 'Makerspace', id, lap ? Util.str(lap.Status) : '', 'Dihantar', '');
    });
    return butiran_(ctx, { id: id });
  }

  function fail_(ctx, p) {
    var id = Util.str(p.id), jenis = Util.str(p.jenis);
    var r = Mk.tempahan(id);
    if (!r) throw appError_('MK_TIDAK_DITEMUI');
    var admin = ADMIN_ROLES.indexOf(ctx.role) >= 0;
    if (admin) Mk.adminLihat(ctx);
    else {
      var pem = Mk.pemohonSendiri(ctx);
      if (!milik_(r, pem.emel, pem.noMatrik)) throw appError_('MK_TIDAK_DITEMUI');
    }
    var url = '';
    if (jenis === 'kertas' || jenis === 'surat') {
      var b = Mk.byId('Butiran_Ruang', id);
      url = b ? Util.str(jenis === 'kertas' ? b.Fail_Kertas_Kerja : b.Fail_Surat) : '';
    } else if (jenis === 'gambar') {
      var t = Mk.byId('Butiran_3DP', id);
      url = t ? Util.str(t.Fail_Gambar) : '';
    } else if (jenis === 'laporan') {
      var l = Mk.byId('Laporan_Aktiviti', id);
      url = l ? Util.str(l.Fail_Laporan) : '';
    } else if (jenis === 'resit') {
      var bil = bilOf_(id);
      url = bil ? Util.str(bil.Fail_Resit) : '';
    }
    if (!url) throw appError_('MK_FAIL_TIADA');
    if (admin) Audit.log(ctx, 'MK_PAPAR_FAIL', 'Makerspace', id, '', jenis, '');
    return Files.read(url);
  }

  return {
    maklumat: maklumat_, ketersediaan: ketersediaan_, anggar: anggar_, hantar: hantar_, saya: saya_, butiran: butiran_, batal: batal_,
    perbaharui: perbaharui_, hantarLaporan: hantarLaporan_, fail: fail_, paparan: paparan_, bilOf: bilOf_, bilView: bilView_, sekatan: sekatan_,
    semak: semak_, kiraDari: kiraDari_, auditCtx: auditCtx_, maskEmel: maskEmel_, milik: milik_, nama: nama_, bolehPemohon: bolehPemohon_
  };
})();
