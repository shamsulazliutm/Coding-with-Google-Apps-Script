/**
 * UTMPreneur: Makerspace, tindakan admin: senarai/butiran tempahan, kelulusan, penggunaan sebenar, pemulangan pinjaman,
 * pengesahan bayaran, urus ALAT / PERALATAN / KADAR dan carian pemohon (tempah bagi pihak).
 * Kebenaran: Admin Penuh dan Pegawai Modul (modul kosong/Semua/Makerspace) memutuskan; Pemerhati baca sahaja; Penilai tiada akses.
 */

var MkAdmin = (function () {
  var JENIS_MESIN = ['3D Printer', 'Laser Cut', 'Ruang'];
  var STATUS_MESIN = ['Aktif', 'Penyelenggaraan', 'Tidak aktif'];
  // jenis pengguna (nilai ROLE; tidak merujuk ROLE semasa muat fail)
  var USER_TYPES = ['Pelajar', 'Staf', 'Luar'];
  var STATUS_TEMPAHAN = ['Menunggu Perakuan', 'Menunggu Kelulusan', 'Diluluskan', 'Selesai', 'Ditolak', 'Dibatalkan'];
  var KOD_RE = /^[A-Z0-9][A-Z0-9_\-]{1,29}$/;

  function yaTidak_(v, def) {
    if (v === undefined || v === null || v === '') return def;
    return v === true || Util.truthy(v);
  }
  function jsonErr_(e) { return appError_('MK_ADMIN_TIDAK_SAH', { medan: e }); }

  // ---------- Ringkasan ----------
  function ringkasan_(ctx) {
    Mk.adminLihat(ctx);
    var tmp = Db.rows('Tempahan');
    var k = { menungguPerakuan: 0, menungguKelulusan: 0, diluluskan: 0 };
    tmp.forEach(function (r) {
      var st = Util.str(r.Status);
      if (st === 'Menunggu Perakuan' && Mk.menduduki(r)) k.menungguPerakuan++;
      else if (st === 'Menunggu Kelulusan') k.menungguKelulusan++;
      else if (st === 'Diluluskan') k.diluluskan++;
    });
    var today = Mk.todayKey();
    var bil = Db.rows('Bayaran_Makerspace');
    k.bayaranMenunggu = bil.filter(function (b) { return Util.str(b.Status) === 'Menunggu Pengesahan'; }).length;
    k.bayaranLewat = bil.filter(function (b) { return Util.str(b.Status) === 'Lewat' || (Util.str(b.Status) === 'Belum Bayar' && Util.dateKey(b.Tarikh_Akhir) < today); }).length;
    var items = Db.rows('Item_Pinjaman');
    var lewatId = {};
    items.forEach(function (it) { if (Util.str(it.Status) !== 'Dipulangkan' && Util.dateKey(it.Tarikh_Dijangka_Pulang) < today) lewatId[Util.str(it.ID_Tempahan)] = true; });
    k.pinjamanLewat = tmp.filter(function (r) { return Util.str(r.Status) === 'Diluluskan' && lewatId[Util.str(r.ID_Tempahan)]; }).length;
    var belum = {}, bilBelum = 0;
    Db.rows('KADAR').forEach(function (r) {
      if (Util.truthy(r.Aktif) && Mk.rmOf(r.Kadar_RM) === null && Util.str(r.Kod_Sumber) !== 'PERALATAN_TANGAN') { bilBelum++; belum[Util.str(r.Kod_Sumber)] = Util.str(r.Nama_Sumber); }
    });
    k.kadarBelum = bilBelum;
    k.kadarBelumKod = Object.keys(belum).map(function (kod) { return { kod: kod, nama: belum[kod] }; });
    k.peralatanKosong = Db.rows('PERALATAN').length === 0;
    k.bolehPutus = Mk.bolehPutus(ctx);
    return k;
  }

  // ---------- Senarai ----------
  function senarai_(ctx, p) {
    Mk.adminLihat(ctx);
    p = p || {};
    var jenis = Util.str(p.jenis), status = Util.str(p.status), kod = Util.str(p.kodSumber);
    var dari = Mk.validKey(Util.str(p.dari)) ? Util.str(p.dari) : '', hingga = Mk.validKey(Util.str(p.hingga)) ? Util.str(p.hingga) : '';
    var q = Util.str(p.q).toLowerCase();
    var all = Db.rows('Tempahan');
    var kiraan = {};
    STATUS_TEMPAHAN.forEach(function (s) { kiraan[s] = 0; });
    all.forEach(function (r) { var s = Util.str(r.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var rows = all.filter(function (r) {
      if (jenis && jenis !== 'SEMUA' && Util.str(r.Jenis) !== jenis) return false;
      var st = Util.str(r.Status);
      if (status === 'AKTIF') { if (Mk.AKTIF.indexOf(st) < 0) return false; }
      else if (status && status !== 'SEMUA' && st !== status) return false;
      if (kod && Util.str(r.Kod_Sumber) !== kod) return false;
      if (dari && Util.dateKey(r.Tarikh_Tamat) < dari) return false;
      if (hingga && Util.dateKey(r.Tarikh_Mula) > hingga) return false;
      if (q) {
        var h = (Util.str(r.ID_Tempahan) + ' ' + Util.str(r.Nama_Pemohon) + ' ' + Util.str(r.Emel_Pemohon) + ' ' + Util.str(r.No_Matrik) + ' ' + Util.str(r.Tujuan)).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (Util.str(p.susun) === 'tarikh') {
      rows.sort(function (a, b) {
        var x = Util.dateKey(a.Tarikh_Mula) + ' ' + Util.str(a.Masa_Mula), y = Util.dateKey(b.Tarikh_Mula) + ' ' + Util.str(b.Masa_Mula);
        return x < y ? -1 : (x > y ? 1 : 0);
      });
    } else rows.sort(function (a, b) { return (Util.toDate(b.Dicipta_Pada) || 0) - (Util.toDate(a.Dicipta_Pada) || 0); });
    var bilMap = {};
    Db.rows('Bayaran_Makerspace').forEach(function (b) { bilMap[Util.str(b.ID_Tempahan)] = Util.str(b.Status); });
    var senarai = rows.slice(0, 400).map(function (r) {
      var o = MkTempahan.paparan(r, { admin: true });
      return {
        id: o.id, jenis: o.jenis, sumberNama: o.sumberNama, kodSumber: o.kodSumber, namaPemohon: o.namaPemohon, jenisPengguna: o.jenisPengguna, emel: o.pemohon.emel,
        noMatrik: o.pemohon.noMatrik, tarikhMula: o.tarikhMula, tarikhTamat: o.tarikhTamat, masaMula: o.masaMula, masaTamat: o.masaTamat, tujuan: o.tujuan,
        status: o.status, bayaran: bilMap[o.id] || '', lewat: !!o.lewat, bagiPihak: o.bagiPihak
      };
    });
    return { kiraan: kiraan, jumlah: rows.length, senarai: senarai, bolehPutus: Mk.bolehPutus(ctx) };
  }

  // ---------- Butiran ----------
  function butiran_(ctx, p) {
    Mk.adminLihat(ctx);
    var id = Util.str((p || {}).id);
    var r = Mk.tempahan(id);
    if (!r) throw appError_('MK_TIDAK_DITEMUI');
    var o = MkTempahan.paparan(r, { admin: true });
    var amaran = [];
    var ops = Mk.ops();
    var kd = Mk.kadarFn();
    var kira = MkBil.kiraTempahan(r, false, kd);
    var kiraSebenar = MkBil.kiraTempahan(r, true, kd);
    o.kira = { anggaran: kira, sebenar: kiraSebenar };
    if (kira.belum.length && o.jenis !== 'Pinjaman') amaran.push('Kadar belum ditetapkan oleh urusetia: ' + kira.belum.join(', ') + '. Bil tidak boleh dijana sehingga ditetapkan.');
    var st = o.status;
    if (Mk.AKTIF.indexOf(st) >= 0 && o.jenis !== 'Pinjaman') {
      var days = Mk.opDaysIn(o.tarikhMula, o.tarikhTamat, ops);
      var kf = Mk.konflik(o.kodSumber, days, Mk.toMin(o.masaMula), Mk.toMin(o.masaTamat), id, ops);
      if (kf.length) amaran.push('Bertindih dengan tempahan ' + kf.map(function (x) { return Util.str(x.ID_Tempahan); }).join(', ') + '.');
    }
    if (st === 'Menunggu Perakuan') amaran.push('Menunggu perakuan penyelia (' + o.penyelia + '). Pautan sah sehingga ' + o.pautanTamat + '.');
    if (o.jenis === 'Pinjaman' && Mk.AKTIF.indexOf(st) >= 0) {
      o.item.forEach(function (it) {
        var a = Mk.alat(it.kod);
        if (a && it.status !== 'Dipulangkan' && st !== 'Diluluskan') {
          var b = Mk.baki(a, id);
          if (it.kuantiti > b.baki) amaran.push('Stok ' + it.nama + ' tidak mencukupi (baki ' + b.baki + ').');
        }
      });
    }
    var sk = MkTempahan.sekatan(Util.normEmail(r.Emel_Pemohon), Util.normMatric(r.No_Matrik));
    if (sk.bil.length) amaran.push('Pemohon mempunyai bil Makerspace lewat (' + sk.bil.join(', ') + ').');
    if (sk.laporan.length) amaran.push('Pemohon mempunyai laporan aktiviti lewat (' + sk.laporan.join(', ') + ').');
    if (sk.pinjaman.length) amaran.push('Pemohon mempunyai pinjaman lewat dipulangkan (' + sk.pinjaman.join(', ') + ').');
    o.amaran = amaran;
    var putus = Mk.bolehPutus(ctx);
    var today = Mk.todayKey();
    var belumPulang = o.item ? o.item.some(function (x) { return x.status !== 'Dipulangkan'; }) : false;
    o.boleh = {
      putus: putus,
      lulus: putus && st === 'Menunggu Kelulusan',
      tolak: putus && (st === 'Menunggu Perakuan' || st === 'Menunggu Kelulusan'),
      batal: putus && Mk.AKTIF.indexOf(st) >= 0,
      penggunaan: putus && o.jenis !== 'Pinjaman' && ['Diluluskan', 'Selesai'].indexOf(st) >= 0 && o.tarikhMula <= today,
      pulang: putus && o.jenis === 'Pinjaman' && st === 'Diluluskan' && belumPulang,
      perbaharui: putus && o.jenis === 'Pinjaman' && st === 'Diluluskan' && o.bilPembaharuan < Cfg.num('PINJAMAN_MAKS_PEMBAHARUAN', 1) && belumPulang
    };
    o.sejarah = Db.find('Audit', function (a) { return Util.str(a.Rujukan) === id && Util.str(a.Modul) === 'Makerspace'; }).slice(-25).map(function (a) {
      return { masa: Util.str(a.Masa), emel: Util.str(a.Emel), tindakan: Util.str(a.Tindakan), lama: Util.str(a.Nilai_Lama), baharu: Util.str(a.Nilai_Baharu), catatan: Util.str(a.Catatan) };
    });
    return o;
  }

  // ---------- Keputusan ----------
  function putus_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var id = Util.str(p.id), t = Util.str(p.tindakan), cat = Util.str(p.catatan).substr(0, 500);
    if (['lulus', 'tolak', 'batal'].indexOf(t) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
    if ((t === 'tolak' || t === 'batal') && !cat) throw appError_('MK_CATATAN_WAJIB');
    var info = Db.withLock(function () {
      var r = Mk.tempahan(id);
      if (!r) throw appError_('MK_TIDAK_DITEMUI');
      var lama = Util.str(r.Status), jenis = Util.str(r.Jenis), now = new Date();
      if (t === 'lulus') {
        if (lama === 'Menunggu Perakuan') throw appError_('MK_BELUM_DIPERAKUI');
        if (lama !== 'Menunggu Kelulusan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
        var ops = Mk.ops();
        if (jenis === 'Pinjaman') {
          Mk.listById('Item_Pinjaman', id).forEach(function (it) {
            var a = Mk.alat(Util.str(it.Kod_Alat));
            if (!a || Number(it.Kuantiti) > Mk.baki(a, id).baki) throw appError_('MK_STOK');
          });
        } else if (Mk.konflik(Util.str(r.Kod_Sumber), Mk.opDaysIn(Util.dateKey(r.Tarikh_Mula), Util.dateKey(r.Tarikh_Tamat), ops), Mk.toMin(r.Masa_Mula), Mk.toMin(r.Masa_Tamat), id, ops).length) {
          throw appError_('MK_KONFLIK');
        }
        var patch = { Status: 'Diluluskan', Diluluskan_Oleh: ctx.email, Tarikh_Keputusan: now, Catatan: cat || Util.str(r.Catatan) };
        if (Util.str(r.Status_Perakuan) === 'Tidak Perlu') { patch.Status_Perakuan = 'Diperakui (Admin)'; patch.Tarikh_Perakuan = now; }
        Db.update('Tempahan', r._row, patch);
        if (jenis === 'Pinjaman') Mk.listById('Item_Pinjaman', id).forEach(function (it) { Db.update('Item_Pinjaman', it._row, { Status: 'Dipinjam' }); });
        Audit.log(ctx, 'MK_LULUS', 'Makerspace', id, lama, 'Diluluskan', cat);
      } else if (t === 'tolak') {
        if (['Menunggu Perakuan', 'Menunggu Kelulusan'].indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        Db.update('Tempahan', r._row, { Status: 'Ditolak', Diluluskan_Oleh: ctx.email, Tarikh_Keputusan: now, Catatan: cat, Token_Hash: '' });
        Audit.log(ctx, 'MK_TOLAK', 'Makerspace', id, lama, 'Ditolak', cat);
      } else {
        if (Mk.AKTIF.indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        Db.update('Tempahan', r._row, { Status: 'Dibatalkan', Diluluskan_Oleh: ctx.email, Tarikh_Keputusan: now, Catatan: cat, Token_Hash: '' });
        Audit.log(ctx, 'MK_BATAL_ADMIN', 'Makerspace', id, lama, 'Dibatalkan', cat);
      }
      return { emel: Util.normEmail(r.Emel_Pemohon), jenis: jenis };
    });
    var teks = { lulus: ['diluluskan', 'approved'], tolak: ['ditolak', 'rejected'], batal: ['dibatalkan oleh UTMXCITE', 'cancelled by UTMXCITE'] }[t];
    Mk.mel(info.emel, 'Tempahan Makerspace ' + teks[0], 'Makerspace booking ' + teks[1],
      ['Tempahan ' + id + ' telah ' + teks[0] + '.' + (cat ? ' Catatan: ' + cat : '')],
      ['Booking ' + id + ' has been ' + teks[1] + '.' + (cat ? ' Note: ' + cat : '')]);
    return butiran_(ctx, { id: id });
  }

  // ---------- Penggunaan sebenar ----------
  function penggunaan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var id = Util.str(p.id);
    var amaran = [];
    Db.withLock(function () {
      var r = Mk.tempahan(id);
      if (!r) throw appError_('MK_TIDAK_DITEMUI');
      var jenis = Util.str(r.Jenis), st = Util.str(r.Status);
      if (jenis === 'Pinjaman' || ['Diluluskan', 'Selesai'].indexOf(st) < 0 || Util.dateKey(r.Tarikh_Mula) > Mk.todayKey()) throw appError_('MK_PENGGUNAAN_TIDAK_SAH');
      var e = {};
      var minit = Mk.int(p.minitSebenar), hari = Mk.int(p.hariSebenar), g = Util.parseRm(p.beratSebenarG);
      if (jenis === 'Ruang') {
        var b = Mk.byId('Butiran_Ruang', id) || {};
        if (hari === null || hari < 1 || hari > (Number(b.Bil_Hari) || 1)) e.hariSebenar = 'Hari sebenar 1 hingga ' + (Number(b.Bil_Hari) || 1) + ' / Actual days';
      } else {
        if (minit === null || minit < 1 || minit > 2880) e.minitSebenar = 'Masukkan minit sebenar (1 hingga 2880) / Enter actual minutes';
        if (jenis === '3D Printer' && (g === null || g <= 0 || g > 5000)) e.beratSebenarG = 'Masukkan berat sebenar dalam gram / Enter the actual weight in grams';
      }
      if (Object.keys(e).length) throw appError_('MK_PENGGUNAAN_TIDAK_SAH', { medan: e });
      if (jenis === 'Ruang') Db.update('Butiran_Ruang', Mk.byId('Butiran_Ruang', id)._row, { Hari_Sebenar: hari });
      else if (jenis === 'Laser Cut') Db.update('Butiran_LaserCut', Mk.byId('Butiran_LaserCut', id)._row, { Masa_Sebenar_Min: minit });
      else Db.update('Butiran_3DP', Mk.byId('Butiran_3DP', id)._row, { Masa_Sebenar_Min: minit, Berat_Sebenar_g: g });
      var kd = Mk.kadarFn();
      var sebenar = MkBil.kiraTempahan(r, true, kd);
      var bil = MkTempahan.bilOf(id);
      if (sebenar.belum.length) {
        amaran.push('Kadar belum ditetapkan (' + sebenar.belum.join(', ') + '): kos sebenar dan bil belum dikira. Tetapkan kadar kemudian rekod semula penggunaan.');
      } else if (bil) {
        var lamaKos = bil.Kos_Sebenar_RM === '' ? bil.Anggaran_RM : bil.Kos_Sebenar_RM;
        var patch = { Kos_Sebenar_RM: sebenar.jumlah, Penggunaan_Sebenar: MkBil.penggunaanTeks(Mk.tempahan(id)) };
        if (['Dibayar', 'Dikecualikan'].indexOf(Util.str(bil.Status)) >= 0 && Mk.rm2(lamaKos) !== sebenar.jumlah) {
          patch.Catatan = (Util.str(bil.Catatan) ? Util.str(bil.Catatan) + ' | ' : '') + 'Kos sebenar dikemas kini selepas bayaran: RM' + Mk.rm2(lamaKos).toFixed(2) + ' ke RM' + sebenar.jumlah.toFixed(2);
          amaran.push('Bil sudah ' + Util.str(bil.Status) + ': kos sebenar berubah daripada RM' + Mk.rm2(lamaKos).toFixed(2) + ' kepada RM' + sebenar.jumlah.toFixed(2) + '. Urus beza secara manual.');
        }
        Db.update('Bayaran_Makerspace', bil._row, patch);
      } else {
        var res = MkBil.janaLocked(Mk.tempahan(id), { sebenar: true, oleh: ctx.email });
        if (res.dijana) MkBil.emelBil(r, res.bil);
        else if (res.sebab === 'PERCUMA') amaran.push('Kos sebenar RM0: tiada bil dijana.');
      }
      Db.update('Tempahan', r._row, { Status: 'Selesai' });
      Audit.log(ctx, 'MK_PENGGUNAAN', 'Makerspace', id, st, 'Selesai', MkBil.penggunaanTeks(Mk.tempahan(id)));
    });
    var out = butiran_(ctx, { id: id });
    out.amaranPenggunaan = amaran;
    return out;
  }

  // ---------- Pemulangan pinjaman ----------
  function pulang_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var id = Util.str(p.id), kod = Util.str(p.kod);
    var email = '';
    Db.withLock(function () {
      var r = Mk.tempahan(id);
      if (!r) throw appError_('MK_TIDAK_DITEMUI');
      if (Util.str(r.Jenis) !== 'Pinjaman' || Util.str(r.Status) !== 'Diluluskan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
      email = Util.normEmail(r.Emel_Pemohon);
      var items = Mk.listById('Item_Pinjaman', id).filter(function (it) { return Util.str(it.Status) !== 'Dipulangkan' && (!kod || Util.str(it.Kod_Alat) === kod); });
      if (!items.length) throw appError_('MK_PERALIHAN_TIDAK_SAH');
      items.forEach(function (it) { Db.update('Item_Pinjaman', it._row, { Status: 'Dipulangkan', Tarikh_Pulang: new Date() }); });
      Audit.log(ctx, 'MK_PULANG', 'Makerspace', id, '', items.map(function (it) { return Util.str(it.Kod_Alat); }).join(','), Util.str(p.catatan).substr(0, 300));
      var tinggal = Mk.listById('Item_Pinjaman', id).some(function (it) { return Util.str(it.Status) !== 'Dipulangkan'; });
      if (!tinggal) {
        Db.update('Tempahan', r._row, { Status: 'Selesai' });
        var res = MkBil.janaLocked(Mk.tempahan(id), { sebenar: false, oleh: ctx.email });
        if (res.dijana) MkBil.emelBil(r, res.bil);
      }
    });
    Mk.mel(email, 'Pemulangan peralatan direkod', 'Equipment return recorded',
      ['Pemulangan peralatan bagi tempahan ' + id + ' telah direkod. Terima kasih.'], ['The return of equipment for booking ' + id + ' has been recorded. Thank you.']);
    return butiran_(ctx, { id: id });
  }

  // ---------- Bayaran ----------
  function bayaranSenarai_(ctx, p) {
    Mk.adminLihat(ctx);
    p = p || {};
    var status = Util.str(p.status), q = Util.str(p.q).toLowerCase();
    var all = Db.rows('Bayaran_Makerspace');
    var today = Mk.todayKey();
    var kiraan = { 'Belum Bayar': 0, 'Menunggu Pengesahan': 0, Dibayar: 0, Dikecualikan: 0, Lewat: 0 };
    all.forEach(function (b) { var s = Util.str(b.Status); if (kiraan[s] !== undefined) kiraan[s]++; });
    var rows = all.filter(function (b) {
      if (status && status !== 'SEMUA' && Util.str(b.Status) !== status) return false;
      if (q) {
        var r = Mk.tempahan(Util.str(b.ID_Tempahan));
        var h = (Util.str(b.ID_Bayaran) + ' ' + Util.str(b.ID_Tempahan) + ' ' + Util.str(b.Emel_Pemohon) + ' ' + (r ? Util.str(r.Nama_Pemohon) : '')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) { return Util.dateKey(b.Tarikh_Jana) < Util.dateKey(a.Tarikh_Jana) ? -1 : 1; });
    return {
      kiraan: kiraan, bolehPutus: Mk.bolehPutus(ctx),
      senarai: rows.slice(0, 300).map(function (b) {
        var v = MkTempahan.bilView(b);
        var r = Mk.tempahan(v.idTempahan);
        v.namaPemohon = r ? Util.str(r.Nama_Pemohon) : '';
        v.jenis = r ? Util.str(r.Jenis) : '';
        v.emel = Util.normEmail(b.Emel_Pemohon);
        v.lewatHari = v.tarikhAkhir && v.tarikhAkhir < today && ['Belum Bayar', 'Lewat'].indexOf(v.status) >= 0 ? Util.daysBetween(v.tarikhAkhir, today) : 0;
        return v;
      })
    };
  }

  function bayaranPutus_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var idb = Util.str(p.id || p.idBayaran), t = Util.str(p.tindakan), cat = Util.str(p.catatan).substr(0, 300);
    if (['sahkan', 'tolak', 'kecuali'].indexOf(t) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
    if ((t === 'tolak' || t === 'kecuali') && !cat) throw appError_('MK_CATATAN_WAJIB');
    var emel = '', idt = '';
    Db.withLock(function () {
      var b = Db.find('Bayaran_Makerspace', function (x) { return Util.str(x.ID_Bayaran) === idb; })[0];
      if (!b) throw appError_('MK_BAYARAN_TIDAK_DITEMUI');
      var lama = Util.str(b.Status), now = new Date();
      emel = Util.normEmail(b.Emel_Pemohon); idt = Util.str(b.ID_Tempahan);
      if (t === 'sahkan') {
        if (['Menunggu Pengesahan', 'Belum Bayar', 'Lewat'].indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        var patch = { Status: 'Dibayar', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: now, Catatan: cat || Util.str(b.Catatan) };
        if (lama !== 'Menunggu Pengesahan') {
          var kaedah = Util.str(p.kaedah);
          if (MkBil.KAEDAH_BAYARAN.indexOf(kaedah) < 0) throw appError_('MK_BAYARAN_TIDAK_SAH', { medan: { kaedah: 'Pilih kaedah bayaran / Choose a payment method' } });
          patch.Kaedah = kaedah; patch.No_Rujukan = Util.str(p.noRujukan).substr(0, 60); patch.Tarikh_Bayar = now;
        }
        Db.update('Bayaran_Makerspace', b._row, patch);
        Audit.log(ctx, 'MK_SAHKAN_BAYARAN', 'Makerspace', idb, lama, 'Dibayar', cat);
      } else if (t === 'tolak') {
        if (lama !== 'Menunggu Pengesahan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
        var baru = Util.dateKey(b.Tarikh_Akhir) < Mk.todayKey() ? 'Lewat' : 'Belum Bayar';
        Db.update('Bayaran_Makerspace', b._row, { Status: baru, Kaedah: '', No_Rujukan: '', Fail_Resit: '', Tarikh_Bayar: '', Catatan: 'Bayaran ditolak: ' + cat });
        Audit.log(ctx, 'MK_TOLAK_BAYARAN', 'Makerspace', idb, lama, baru, cat);
      } else {
        if (['Menunggu Pengesahan', 'Belum Bayar', 'Lewat'].indexOf(lama) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
        Db.update('Bayaran_Makerspace', b._row, { Status: 'Dikecualikan', Disahkan_Oleh: ctx.email, Tarikh_Pengesahan: now, Catatan: cat });
        Audit.log(ctx, 'MK_KECUALI_BAYARAN', 'Makerspace', idb, lama, 'Dikecualikan', cat);
      }
    });
    var tk = { sahkan: ['disahkan', 'confirmed'], tolak: ['ditolak (' + cat + ')', 'rejected (' + cat + ')'], kecuali: ['dikecualikan', 'waived'] }[t];
    Mk.mel(emel, 'Bayaran Makerspace ' + tk[0], 'Makerspace payment ' + tk[1],
      ['Bayaran bagi bil ' + idb + ' (tempahan ' + idt + ') telah ' + tk[0] + '.'], ['Payment for bill ' + idb + ' (booking ' + idt + ') has been ' + tk[1] + '.']);
    return bayaranSenarai_(ctx, { status: Util.str(p.penapis) || 'SEMUA' });
  }

  // ---------- ALAT ----------
  function alatSenarai_(ctx) {
    Mk.adminLihat(ctx);
    return {
      bolehPutus: Mk.bolehPutus(ctx),
      senarai: Db.rows('ALAT').map(function (a) {
        var b = Mk.baki(a);
        return {
          kod: Util.str(a.Kod_Alat), nama: Util.str(a.Nama_Alat), kategori: Util.str(a.Kategori), jumlah: b.jumlah, rosak: b.rosak, dipinjam: b.dipinjam, baki: b.baki,
          bolehDipinjam: Util.truthy(a.Boleh_Dipinjam), aktif: Util.truthy(a.Aktif), catatan: Util.str(a.Catatan)
        };
      })
    };
  }

  function alatSimpan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var e = {};
    var kod = Util.str(p.kod).toUpperCase();
    if (!KOD_RE.test(kod)) e.kod = 'Kod 2 hingga 30 aksara (A-Z, 0-9, _ atau -) / Code of 2 to 30 characters';
    var nama = Util.str(p.nama).substr(0, 120);
    if (nama.length < 2) e.nama = 'Nama alat wajib / Name is required';
    var jumlah = Mk.int(p.jumlah), rosak = Mk.int(p.rosak === '' || p.rosak === undefined ? 0 : p.rosak);
    if (jumlah === null || jumlah > 100000) e.jumlah = 'Kuantiti jumlah tidak sah / Invalid total quantity';
    if (rosak === null || (jumlah !== null && rosak > jumlah)) e.rosak = 'Rosak/hilang tidak sah (tidak melebihi jumlah) / Invalid damaged/lost quantity';
    if (Object.keys(e).length) throw jsonErr_(e);
    return Db.withLock(function () {
      var cur = Mk.alat(kod);
      var rec = {
        Kod_Alat: kod, Nama_Alat: nama, Kategori: Util.str(p.kategori).substr(0, 60), Kuantiti_Jumlah: jumlah, Kuantiti_Rosak_Hilang: rosak,
        Boleh_Dipinjam: yaTidak_(p.bolehDipinjam, true) ? 'Ya' : 'Tidak', Aktif: yaTidak_(p.aktif, true) ? 'Ya' : 'Tidak', Catatan: Util.str(p.catatan).substr(0, 300)
      };
      if (cur) Db.update('ALAT', cur._row, rec); else Db.append('ALAT', rec);
      Audit.log(ctx, cur ? 'MK_KEMAS_KINI_ALAT' : 'MK_TAMBAH_ALAT', 'Makerspace', kod, cur ? cur.Kuantiti_Jumlah + '/' + cur.Kuantiti_Rosak_Hilang : '', jumlah + '/' + rosak, nama);
      return alatSenarai_(ctx);
    });
  }

  // ---------- PERALATAN ----------
  function peralatanSenarai_(ctx) {
    Mk.adminLihat(ctx);
    return {
      bolehPutus: Mk.bolehPutus(ctx),
      senarai: Db.rows('PERALATAN').map(function (s) {
        return {
          kod: Util.str(s.Kod_Mesin), jenis: Util.str(s.Jenis), noMesin: Util.str(s.No_Mesin), nama: Util.str(s.Nama_Model), kapasiti: Number(s.Kapasiti) || 0,
          kodKadar: Util.str(s.Kod_Kadar), status: Util.str(s.Status) || 'Aktif', catatan: Util.str(s.Catatan)
        };
      })
    };
  }

  function peralatanSimpan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var e = {};
    var kod = Util.str(p.kod).toUpperCase();
    if (!KOD_RE.test(kod)) e.kod = 'Kod 2 hingga 30 aksara (A-Z, 0-9, _ atau -) / Code of 2 to 30 characters';
    var jenis = Util.str(p.jenis);
    if (JENIS_MESIN.indexOf(jenis) < 0) e.jenis = 'Pilih jenis / Choose a type';
    var nama = Util.str(p.nama).substr(0, 120);
    if (nama.length < 2) e.nama = 'Nama atau model wajib / Name or model is required';
    var kap = '';
    if (Util.str(p.kapasiti) !== '') { kap = Mk.int(p.kapasiti); if (kap === null || kap < 1 || kap > 5000) e.kapasiti = 'Kapasiti tidak sah / Invalid capacity'; }
    else if (jenis === 'Ruang') e.kapasiti = 'Kapasiti ruang wajib / Space capacity is required';
    var kodKadar = Util.str(p.kodKadar).substr(0, 60);
    if (kodKadar && !/^[A-Za-z0-9_\-]+$/.test(kodKadar)) e.kodKadar = 'Kod kadar tidak sah / Invalid rate code';
    var status = Util.str(p.status) || 'Aktif';
    if (STATUS_MESIN.indexOf(status) < 0) e.status = 'Status tidak sah / Invalid status';
    if (Object.keys(e).length) throw jsonErr_(e);
    return Db.withLock(function () {
      var cur = Mk.sumber(kod);
      var rec = {
        Kod_Mesin: kod, Jenis: jenis, No_Mesin: Util.str(p.noMesin).substr(0, 30), Nama_Model: nama, Kapasiti: kap,
        Kod_Kadar: kodKadar, Status: status, Catatan: Util.str(p.catatan).substr(0, 300)
      };
      if (cur) Db.update('PERALATAN', cur._row, rec); else Db.append('PERALATAN', rec);
      Audit.log(ctx, cur ? 'MK_KEMAS_KINI_PERALATAN' : 'MK_TAMBAH_PERALATAN', 'Makerspace', kod, cur ? Util.str(cur.Status) : '', status, jenis + ' ' + nama);
      return peralatanSenarai_(ctx);
    });
  }

  /** Tambah ruang lalai (Maker Lab 200, Bilik Mesyuarat 20) jika belum ada. */
  function peralatanLalai_(ctx) {
    Mk.adminPutus(ctx);
    return Db.withLock(function () {
      [['MAKER_LAB', 'Maker Lab', 200, 'RUANG_MAKER_LAB'], ['BILIK_MESYUARAT', 'Bilik Mesyuarat', 20, 'RUANG_BILIK_MESYUARAT']].forEach(function (x) {
        if (Mk.sumber(x[0])) return;
        Db.append('PERALATAN', { Kod_Mesin: x[0], Jenis: 'Ruang', No_Mesin: '', Nama_Model: x[1], Kapasiti: x[2], Kod_Kadar: x[3], Status: 'Aktif', Catatan: '' });
        Audit.log(ctx, 'MK_TAMBAH_PERALATAN', 'Makerspace', x[0], '', 'Aktif', 'Ruang lalai');
      });
      return peralatanSenarai_(ctx);
    });
  }

  // ---------- KADAR ----------
  function kadarSenarai_(ctx) {
    Mk.adminLihat(ctx);
    var senarai = Db.rows('KADAR').map(function (r) {
      var rm = Mk.rmOf(r.Kadar_RM);
      return {
        kod: Util.str(r.Kod_Sumber), nama: Util.str(r.Nama_Sumber), jenisPengguna: Util.str(r.Jenis_Pengguna), unit: Util.str(r.Unit),
        kadar: rm, berkuatKuasa: Util.dateKey(r.Berkuat_Kuasa), aktif: Util.truthy(r.Aktif), belumDitetapkan: rm === null
      };
    });
    senarai.sort(function (a, b) {
      if (a.kod !== b.kod) return a.kod < b.kod ? -1 : 1;
      return USER_TYPES.indexOf(a.jenisPengguna) - USER_TYPES.indexOf(b.jenisPengguna) || (a.berkuatKuasa < b.berkuatKuasa ? -1 : 1);
    });
    return { bolehPutus: Mk.bolehPutus(ctx), jenisPengguna: USER_TYPES, senarai: senarai };
  }

  function kadarSimpan_(ctx, p) {
    Mk.adminPutus(ctx);
    p = p || {};
    var e = {};
    var kod = Util.str(p.kod).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_\-]{1,59}$/.test(kod)) e.kod = 'Kod sumber tidak sah / Invalid source code';
    var jp = Util.str(p.jenisPengguna);
    if (USER_TYPES.indexOf(jp) < 0) e.jenisPengguna = 'Pilih jenis pengguna / Choose a user type';
    var bk = Util.str(p.berkuatKuasa) || Mk.todayKey();
    if (!Mk.validKey(bk)) e.berkuatKuasa = 'Tarikh tidak sah / Invalid date';
    var kadar = '';
    if (Util.str(p.kadar) !== '') {
      kadar = Util.parseRm(p.kadar);
      if (kadar === null) e.kadar = 'Masukkan RM yang sah atau kosongkan (belum ditetapkan) / Enter a valid RM value or leave blank (not set)';
    }
    if (Object.keys(e).length) throw jsonErr_(e);
    return Db.withLock(function () {
      var cur = Db.find('KADAR', function (r) {
        return Util.str(r.Kod_Sumber) === kod && Util.str(r.Jenis_Pengguna) === jp && Util.dateKey(r.Berkuat_Kuasa) === bk;
      })[0];
      if (!cur && !Util.str(p.berkuatKuasa) && kadar !== '') {
        // menetapkan kadar yang masih kosong (belum ditetapkan): isi baris sedia ada supaya sesi lampau turut dapat dikira
        var kosong = Db.find('KADAR', function (r) {
          return Util.str(r.Kod_Sumber) === kod && Util.str(r.Jenis_Pengguna) === jp && Mk.rmOf(r.Kadar_RM) === null && Util.truthy(r.Aktif);
        });
        if (kosong.length) cur = kosong[kosong.length - 1];
      }
      var nama = Util.str(p.nama).substr(0, 120) || (cur ? Util.str(cur.Nama_Sumber) : '');
      var unit = Util.str(p.unit).substr(0, 40) || (cur ? Util.str(cur.Unit) : '');
      if (!cur) {
        var lain = Db.find('KADAR', function (r) { return Util.str(r.Kod_Sumber) === kod; })[0];
        if (!nama && lain) nama = Util.str(lain.Nama_Sumber);
        if (!unit && lain) unit = Util.str(lain.Unit);
      }
      var e2 = {};
      if (!nama) e2.nama = 'Nama sumber wajib / Source name is required';
      if (!unit) e2.unit = 'Unit wajib / Unit is required';
      if (Object.keys(e2).length) throw jsonErr_(e2);
      var rec = { Kod_Sumber: kod, Nama_Sumber: nama, Jenis_Pengguna: jp, Unit: unit, Kadar_RM: kadar, Berkuat_Kuasa: cur ? cur.Berkuat_Kuasa : Util.toDate(bk), Aktif: yaTidak_(p.aktif, true) ? 'Ya' : 'Tidak' };
      if (cur) Db.update('KADAR', cur._row, rec); else Db.append('KADAR', rec);
      Audit.log(ctx, cur ? 'MK_KEMAS_KINI_KADAR' : 'MK_TAMBAH_KADAR', 'Makerspace', kod + '/' + jp, cur ? Util.str(cur.Kadar_RM) : '', String(kadar), 'berkuat kuasa ' + bk);
      return kadarSenarai_(ctx);
    });
  }

  // ---------- Pemohon (tempah bagi pihak) ----------
  function pemohon_(ctx, p) {
    Mk.adminLihat(ctx);
    p = p || {};
    var out;
    if (Util.str(p.noMatrik)) {
      var pem = Mk.pemohonBagi(ctx, { noMatrik: p.noMatrik });
      var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === pem.noMatrik; });
      out = { jenis: pem.jenis, nama: pem.nama, emel: pem.emel, noMatrik: pem.noMatrik, telefon: pem.telefon, jabatan: pem.jabatan, adaProfil: true, sudahLogMasuk: pg.length > 0 };
    } else {
      if (!Bantu.allowed(ctx, 'makerspace')) throw appError_('TIADA_KEBENARIAN');
      var e = Util.normEmail(p.emel);
      if (!Util.isEmail(e)) throw appError_('MK_EMEL_PEMOHON');
      var jenis = Util.roleByDomain(e, Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), Cfg.get('DOMAIN_STAF', '@utm.my'));
      if (jenis === ROLE.PELAJAR) throw appError_('MK_EMEL_PEMOHON', { medan: { emel: 'Pelajar: gunakan No. Matrik / Students: use the matric number' } });
      var g = Mk.penggunaOf(e);
      out = { jenis: jenis, nama: g ? Util.str(g.Nama) : '', emel: e, noMatrik: '', telefon: g ? Util.str(g.Telefon) : '', jabatan: g ? Util.str(g.Jabatan_Organisasi) : '', adaProfil: !!g };
    }
    var s = MkTempahan.sekatan(out.emel, out.noMatrik);
    out.sekatan = { bil: s.bil.length > 0, laporan: s.laporan.length > 0, pinjaman: s.pinjaman.length > 0 };
    return out;
  }

  return {
    ringkasan: ringkasan_, senarai: senarai_, butiran: butiran_, putus: putus_, penggunaan: penggunaan_, pulang: pulang_,
    bayaranSenarai: bayaranSenarai_, bayaranPutus: bayaranPutus_, alatSenarai: alatSenarai_, alatSimpan: alatSimpan_,
    peralatanSenarai: peralatanSenarai_, peralatanSimpan: peralatanSimpan_, peralatanLalai: peralatanLalai_,
    kadarSenarai: kadarSenarai_, kadarSimpan: kadarSimpan_, pemohon: pemohon_
  };
})();
