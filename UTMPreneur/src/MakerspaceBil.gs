/**
 * UTMPreneur: Makerspace, kiraan kos, bil (Bayaran_Makerspace), bayaran oleh pemohon dan kerja harian.
 * Kadar kosong atau tiada = "belum ditetapkan": bil tidak dijana sehingga ditetapkan dan admin diberi amaran.
 * Bil dijana selepas sesi (kerja harian) atau apabila admin merekod penggunaan sebenar.
 */

var MkBil = (function () {
  var PAYMENT_METHODS = ['Tunai', 'Pindahan Bank', 'Invois Dalaman', 'Lain-lain'];

  // ---------- Kiraan ----------
  /**
   * Kira kos. bu: {bilHari, peralatan:[{kod,kuantiti}]} (Ruang), {minit} (Laser Cut), {minit, beratG} (3D Printer).
   * Pulang {jumlah, baris:[{kod,nama,unit,kuantiti,kadar,jumlah}], belum:[kod]}.
   */
  function kira_(jenis, kodSumber, jenisPengguna, tarikhKey, bu, kd) {
    var baris = [], belum = [], jumlah = 0;
    var add = function (kod, kuantiti, unitLabel, fallbackNama) {
      var k = kd(kod, jenisPengguna, tarikhKey);
      if (!k.ada) { belum.push(kod); baris.push({ kod: kod, nama: k.nama || fallbackNama || kod, unit: unitLabel || k.unit, kuantiti: kuantiti, kadar: null, jumlah: null }); return; }
      var j = Mk.rm2(k.rm * kuantiti);
      jumlah += j;
      baris.push({ kod: kod, nama: k.nama || fallbackNama || kod, unit: unitLabel || k.unit, kuantiti: kuantiti, kadar: k.rm, jumlah: j });
    };
    var s = jenis === 'Pinjaman' ? null : Mk.sumber(kodSumber);
    var kk = s ? Util.str(s.Kod_Kadar) : '';
    if (jenis === 'Ruang') {
      var hari = Number(bu.bilHari) || 0;
      if (kk) add(kk, hari, 'per hari'); else { belum.push('Kod_Kadar:' + kodSumber); baris.push({ kod: kodSumber, nama: 'Sewa ruang', unit: 'per hari', kuantiti: hari, kadar: null, jumlah: null }); }
      add('RUANG_CAJ_PERKHIDMATAN', 1, 'per tempahan');
      (bu.peralatan || []).forEach(function (x) { add(x.kod, (Number(x.kuantiti) || 0) * hari, 'unit-hari'); });
    } else if (jenis === 'Laser Cut') {
      var kod = kk || 'LASER_CUT';
      var k = kd(kod, jenisPengguna, tarikhKey);
      var blok = parseInt((/(\d+)\s*minit/i.exec(k.unit || '') || [0, 5])[1], 10) || 5;
      add(kod, Math.ceil((Number(bu.minit) || 0) / blok), 'per ' + blok + ' minit');
    } else if (jenis === '3D Printer') {
      var base = kk || '3D_PRINTER';
      add(base + '_GRAM', Number(bu.beratG) || 0, 'per gram');
      add(base + '_JAM', Mk.rm2((Number(bu.minit) || 0) / 60), 'per jam');
    } else if (jenis === 'Pinjaman') {
      var pk = kd('PERALATAN_TANGAN', jenisPengguna, tarikhKey);
      if (pk.ada && pk.rm > 0) add('PERALATAN_TANGAN', 1, 'per pinjaman');
    }
    return { jumlah: Mk.rm2(jumlah), baris: baris, belum: belum };
  }

  /** Kira kos sebenar bagi satu tempahan daripada data butiran (penggunaan sebenar jika ada). */
  function kiraTempahan_(r, sebenar, kd) {
    var id = Util.str(r.ID_Tempahan), jenis = Util.str(r.Jenis), jp = Util.str(r.Jenis_Pengguna), tarikh = Util.dateKey(r.Tarikh_Mula);
    var kod = Util.str(r.Kod_Sumber);
    if (jenis === 'Ruang') {
      var b = Mk.byId('Butiran_Ruang', id) || {};
      var hari = sebenar && b.Hari_Sebenar !== '' && b.Hari_Sebenar !== undefined ? Number(b.Hari_Sebenar) : Number(b.Bil_Hari) || 1;
      var per = Mk.listById('Item_Peralatan_Ruang', id).map(function (x) { return { kod: Util.str(x.Kod_Alat), kuantiti: Number(x.Kuantiti) || 0 }; });
      return kira_(jenis, kod, jp, tarikh, { bilHari: hari, peralatan: per }, kd);
    }
    if (jenis === 'Laser Cut') {
      var l = Mk.byId('Butiran_LaserCut', id) || {};
      var m = sebenar && l.Masa_Sebenar_Min !== '' && l.Masa_Sebenar_Min !== undefined ? Number(l.Masa_Sebenar_Min) : Number(l.Masa_Dijangka_Min) || 0;
      return kira_(jenis, kod, jp, tarikh, { minit: m }, kd);
    }
    if (jenis === '3D Printer') {
      var t = Mk.byId('Butiran_3DP', id) || {};
      var mn = sebenar && t.Masa_Sebenar_Min !== '' && t.Masa_Sebenar_Min !== undefined ? Number(t.Masa_Sebenar_Min) : Number(t.Masa_Dijangka_Min) || 0;
      var g = sebenar && t.Berat_Sebenar_g !== '' && t.Berat_Sebenar_g !== undefined ? Number(t.Berat_Sebenar_g) : Number(t.Berat_g) || 0;
      return kira_(jenis, kod, jp, tarikh, { minit: mn, beratG: g }, kd);
    }
    return kira_(jenis, kod, jp, tarikh, {}, kd);
  }

  function penggunaanTeks_(r) {
    var id = Util.str(r.ID_Tempahan), jenis = Util.str(r.Jenis);
    if (jenis === 'Ruang') { var b = Mk.byId('Butiran_Ruang', id) || {}; return (b.Hari_Sebenar !== '' && b.Hari_Sebenar !== undefined ? b.Hari_Sebenar : b.Bil_Hari) + ' hari'; }
    if (jenis === 'Laser Cut') { var l = Mk.byId('Butiran_LaserCut', id) || {}; return (l.Masa_Sebenar_Min !== '' && l.Masa_Sebenar_Min !== undefined ? l.Masa_Sebenar_Min : l.Masa_Dijangka_Min) + ' minit'; }
    if (jenis === '3D Printer') {
      var t = Mk.byId('Butiran_3DP', id) || {};
      return (t.Berat_Sebenar_g !== '' && t.Berat_Sebenar_g !== undefined ? t.Berat_Sebenar_g : t.Berat_g) + ' g, ' + (t.Masa_Sebenar_Min !== '' && t.Masa_Sebenar_Min !== undefined ? t.Masa_Sebenar_Min : t.Masa_Dijangka_Min) + ' minit';
    }
    return 'Pinjaman';
  }

  function bilOf_(id) { return MkTempahan.bilOf(id); }

  /**
   * Jana bil bagi tempahan jika belum ada dan semua kadar telah ditetapkan. MESTI dipanggil dalam Db.withLock.
   * opts.sebenar: guna penggunaan sebenar. Pulang {dijana, bil, sebab, belum}.
   */
  function janaLocked_(r, opts) {
    opts = opts || {};
    var id = Util.str(r.ID_Tempahan);
    var ada = bilOf_(id);
    if (ada) return { dijana: false, bil: ada, sebab: 'ADA' };
    var kd = Mk.kadarFn();
    var anggaran = kiraTempahan_(r, false, kd);
    var sebenar = opts.sebenar ? kiraTempahan_(r, true, kd) : null;
    var belum = (sebenar || anggaran).belum;
    if (belum.length) return { dijana: false, sebab: 'KADAR', belum: belum };
    var ang = r.Anggaran_RM !== '' && r.Anggaran_RM !== null && r.Anggaran_RM !== undefined ? Number(r.Anggaran_RM) : anggaran.jumlah;
    var jumlah = sebenar ? sebenar.jumlah : ang;
    if (!(jumlah > 0)) return { dijana: false, sebab: 'PERCUMA' };
    var hari = Cfg.num('TARIKH_AKHIR_BAYARAN_MAKERSPACE_HARI', 7);
    var today = Mk.todayKey();
    var tahun = parseInt(Util.fmtDate(new Date(), 'yyyy'), 10);
    var idb = Util.formatId('BMK', tahun, Db.nextSeqLocked('BMK_' + tahun), 4);
    var rec = {
      ID_Bayaran: idb, ID_Tempahan: id, Emel_Pemohon: Util.normEmail(r.Emel_Pemohon), Anggaran_RM: ang,
      Penggunaan_Sebenar: opts.sebenar ? penggunaanTeks_(r) : '', Kos_Sebenar_RM: sebenar ? sebenar.jumlah : '',
      Status: 'Belum Bayar', Tarikh_Akhir: Util.toDate(Mk.addDays(today, hari)), Tarikh_Jana: Util.toDate(today)
    };
    Db.append('Bayaran_Makerspace', rec);
    Audit.log({ email: opts.oleh || 'sistem', role: opts.oleh ? ROLE.ADMIN_PENUH : '-' }, 'MK_JANA_BIL', 'Makerspace', idb, id, String(jumlah), Util.str(r.Jenis));
    return { dijana: true, bil: bilOf_(id), sebab: '' };
  }

  function emelBil_(r, b) {
    var j = Mk.rm2(b.Kos_Sebenar_RM !== '' && b.Kos_Sebenar_RM !== undefined ? b.Kos_Sebenar_RM : b.Anggaran_RM);
    Mk.mel(Util.normEmail(r.Emel_Pemohon), 'Bil Makerspace dijana', 'Makerspace bill issued',
      ['Bil ' + Util.str(b.ID_Bayaran) + ' bagi tempahan ' + Util.str(r.ID_Tempahan) + ': RM' + j.toFixed(2) + '. Tarikh akhir bayaran: ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '. Sila rekod bayaran dalam UTMPreneur (Makerspace).'],
      ['Bill ' + Util.str(b.ID_Bayaran) + ' for booking ' + Util.str(r.ID_Tempahan) + ': RM' + j.toFixed(2) + '. Payment due date: ' + Util.dateKey(b.Tarikh_Akhir) + '. Please record the payment in UTMPreneur (Makerspace).']);
  }

  // ---------- Bayaran oleh pemohon ----------
  function rekodBayaran_(ctx, p) {
    var pem = Mk.pemohonSendiri(ctx);
    var idb = Util.str(p.idBayaran || p.id);
    var b = Db.find('Bayaran_Makerspace', function (x) { return Util.str(x.ID_Bayaran) === idb; })[0];
    var r = b ? Mk.tempahan(Util.str(b.ID_Tempahan)) : null;
    if (!b || !r || !MkTempahan.milik(r, pem.emel, pem.noMatrik)) throw appError_('MK_BAYARAN_TIDAK_DITEMUI');
    if (['Belum Bayar', 'Lewat'].indexOf(Util.str(b.Status)) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
    var e = {};
    var kaedah = Util.str(p.kaedah);
    if (PAYMENT_METHODS.indexOf(kaedah) < 0) e.kaedah = 'Pilih kaedah bayaran / Choose a payment method';
    else if (kaedah === 'Invois Dalaman' && pem.jenis === ROLE.LUAR) e.kaedah = 'Invois Dalaman untuk warga UTM sahaja / Internal invoice is for UTM members only';
    var noRujukan = Util.str(p.noRujukan).substr(0, 60);
    if (noRujukan.length < 2) e.noRujukan = 'Masukkan no. rujukan / Enter the reference number';
    var fail = null;
    if (kaedah !== 'Invois Dalaman') {
      if (p.resit && p.resit.data) {
        try { fail = Files.validate(p.resit, ['pdf', 'jpg', 'jpeg', 'png']); } catch (er) { e.resit = 'Resit PDF/JPG/PNG sahaja (saiz dihadkan) / PDF, JPG or PNG receipt only'; }
      } else e.resit = 'Muat naik resit (PDF/JPG/PNG) / Upload the receipt';
    }
    if (Object.keys(e).length) throw appError_('MK_BAYARAN_TIDAK_SAH', { medan: e });
    var url = fail ? Files.save('FLD_RESIT_MAKERSPACE', 'RESIT_' + idb + '_' + Util.fmtDate(new Date(), 'yyyyMMddHHmm'), fail) : '';
    Db.withLock(function () {
      var cur = Db.find('Bayaran_Makerspace', function (x) { return Util.str(x.ID_Bayaran) === idb; })[0];
      if (['Belum Bayar', 'Lewat'].indexOf(Util.str(cur.Status)) < 0) throw appError_('MK_PERALIHAN_TIDAK_SAH');
      Db.update('Bayaran_Makerspace', cur._row, { Status: 'Menunggu Pengesahan', Kaedah: kaedah, No_Rujukan: noRujukan, Fail_Resit: url, Tarikh_Bayar: new Date() });
      Audit.log(ctx, 'MK_REKOD_BAYARAN', 'Makerspace', idb, Util.str(cur.Status), 'Menunggu Pengesahan', kaedah);
    });
    return MkTempahan.butiran(ctx, { id: Util.str(b.ID_Tempahan) });
  }

  // ---------- Kerja harian ----------
  function jobHarian_() {
    var hasil = { selesai: 0, tamatPerakuan: 0, bilDijana: 0, bilLewat: 0, peringatan: 0, amaranKadar: 0, laporan: 0 };
    var today = Mk.todayKey();
    var logs = {};
    Db.rows('Peringatan').forEach(function (l) { logs[Util.str(l.Jenis)] = true; });
    var sistem = { email: 'sistem', role: '-' };

    // log + hantar sekali sahaja bagi setiap kunci
    var sekali = function (kunci, to, ref, subjBm, subjEn, bm, en, catatan) {
      if (logs[kunci]) return false;
      var sent = Mk.mel(to, subjBm, subjEn, bm, en);
      Db.append('Peringatan', { Masa: new Date(), Emel: to, Jenis: kunci, Rujukan: ref, Status: sent ? 'Dihantar' : 'Dilangkau', Catatan: catatan || '' });
      logs[kunci] = true;
      hasil.peringatan++;
      return true;
    };

    var tempahan = Db.rows('Tempahan');
    // 1. Pautan perakuan tamat tempoh -> Dibatalkan; sesi tamat -> Selesai
    tempahan.forEach(function (r) {
      var st = Util.str(r.Status), id = Util.str(r.ID_Tempahan);
      if (st === 'Menunggu Perakuan' && Mk.tokenTamat(r)) {
        Db.update('Tempahan', r._row, { Status: 'Dibatalkan', Token_Hash: '', Tarikh_Keputusan: new Date(), Catatan: 'Pautan perakuan penyelia tamat tempoh tanpa tindakan' });
        Audit.log(sistem, 'MK_PERAKUAN_TAMAT', 'Makerspace', id, st, 'Dibatalkan', '');
        r.Status = 'Dibatalkan';
        hasil.tamatPerakuan++;
        Mk.mel(Util.normEmail(r.Emel_Pemohon), 'Tempahan Makerspace dibatalkan', 'Makerspace booking cancelled',
          ['Tempahan ' + id + ' dibatalkan kerana penyelia tidak memperakuinya dalam tempoh yang ditetapkan. Sila buat tempahan baharu.'],
          ['Booking ' + id + ' was cancelled because the supervisor did not endorse it in time. Please make a new booking.']);
      } else if (st === 'Diluluskan' && Util.str(r.Jenis) !== 'Pinjaman' && Util.dateKey(r.Tarikh_Tamat) < today) {
        Db.update('Tempahan', r._row, { Status: 'Selesai' });
        Audit.log(sistem, 'MK_SELESAI', 'Makerspace', id, st, 'Selesai', '');
        r.Status = 'Selesai';
        hasil.selesai++;
      }
    });

    // 2. Jana bil selepas sesi (bukan Pinjaman)
    var warnKadar = [];
    tempahan.forEach(function (r) {
      var st = Util.str(r.Status), id = Util.str(r.ID_Tempahan);
      if (Util.str(r.Jenis) === 'Pinjaman' || ['Diluluskan', 'Selesai'].indexOf(st) < 0 || Util.dateKey(r.Tarikh_Tamat) >= today) return;
      var res = Db.withLock(function () { return janaLocked_(Mk.tempahan(id), { sebenar: false }); });
      if (res.dijana) { hasil.bilDijana++; emelBil_(r, res.bil); }
      else if (res.sebab === 'KADAR') warnKadar.push({ id: id, belum: res.belum });
    });
    warnKadar.forEach(function (w) {
      if (sekali('MK_KADAR_TIADA:' + w.id, ADMIN_UTAMA, w.id, 'Amaran: kadar Makerspace belum ditetapkan', 'Warning: Makerspace rate not set',
        ['Bil bagi tempahan ' + w.id + ' tidak dapat dijana kerana kadar belum ditetapkan: ' + w.belum.join(', ') + '. Sila tetapkan kadar dalam UTMPreneur (Makerspace admin, Kadar).'],
        ['The bill for booking ' + w.id + ' cannot be generated because rates are not set: ' + w.belum.join(', ') + '. Please set the rates in UTMPreneur (Makerspace admin, Rates).'], w.belum.join(','))) hasil.amaranKadar++;
    });

    // 3. Bil: peringatan, Lewat dan susulan
    var susulan = Math.max(1, Cfg.num('PERINGATAN_SUSULAN_HARI', 3));
    var hariPeringatan = Cfg.num('BAYARAN_PERINGATAN_HARI', 4);
    Db.rows('Bayaran_Makerspace').forEach(function (b) {
      var st = Util.str(b.Status), idb = Util.str(b.ID_Bayaran);
      var r = Mk.tempahan(Util.str(b.ID_Tempahan));
      var to = Util.normEmail(b.Emel_Pemohon);
      var akhir = Util.dateKey(b.Tarikh_Akhir), jana = Util.dateKey(b.Tarikh_Jana) || akhir;
      var jumlah = Mk.rm2(b.Kos_Sebenar_RM !== '' && b.Kos_Sebenar_RM !== undefined ? b.Kos_Sebenar_RM : b.Anggaran_RM).toFixed(2);
      if (st === 'Belum Bayar' && akhir && today > akhir) {
        Db.update('Bayaran_Makerspace', b._row, { Status: 'Lewat' });
        Audit.log(sistem, 'MK_BIL_LEWAT', 'Makerspace', idb, st, 'Lewat', '');
        st = 'Lewat';
        hasil.bilLewat++;
        sekali('MK_LEWAT:' + idb, to, idb, 'Bil Makerspace lewat dibayar', 'Makerspace bill overdue',
          ['Bil ' + idb + ' (RM' + jumlah + ') telah lewat. Tempahan Makerspace baharu disekat sehingga bil dijelaskan.'],
          ['Bill ' + idb + ' (RM' + jumlah + ') is overdue. New Makerspace bookings are blocked until it is settled.']);
      }
      if (st === 'Belum Bayar' && akhir && today <= akhir && Util.daysBetween(jana, today) >= hariPeringatan) {
        sekali('MK_PERINGATAN:' + idb, to, idb, 'Peringatan bayaran Makerspace', 'Makerspace payment reminder',
          ['Peringatan: bil ' + idb + ' (RM' + jumlah + ') perlu dibayar sebelum ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '.'],
          ['Reminder: bill ' + idb + ' (RM' + jumlah + ') is due by ' + akhir + '.']);
      }
      if (st === 'Lewat' && akhir) {
        var n = Math.floor(Util.daysBetween(akhir, today) / susulan);
        if (n >= 1) {
          sekali('MK_SUSULAN:' + idb + ':' + n, to, idb, 'Susulan: bil Makerspace belum dijelaskan', 'Follow-up: Makerspace bill unpaid',
            ['Bil ' + idb + ' (RM' + jumlah + ') masih belum dijelaskan sejak ' + Util.fmtTarikhBM(b.Tarikh_Akhir) + '. Sila jelaskan segera.'],
            ['Bill ' + idb + ' (RM' + jumlah + ') is still unpaid since ' + akhir + '. Please settle it promptly.']);
        }
      }
      if (!r) return;
    });

    // 4. Pinjaman: peringatan pulang dan lewat
    var itemRows = Db.rows('Item_Pinjaman');
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Jenis) !== 'Pinjaman' || Util.str(r.Status) !== 'Diluluskan') return;
      var id = Util.str(r.ID_Tempahan), to = Util.normEmail(r.Emel_Pemohon);
      var belum = itemRows.filter(function (it) { return Util.str(it.ID_Tempahan) === id && Util.str(it.Status) !== 'Dipulangkan'; });
      if (!belum.length) return;
      var due = Util.dateKey(r.Tarikh_Tamat);
      var senarai = belum.map(function (it) { var a = Mk.alat(Util.str(it.Kod_Alat)); return (a ? Util.str(a.Nama_Alat) : Util.str(it.Kod_Alat)) + ' x' + it.Kuantiti; }).join(', ');
      var d = Util.daysBetween(today, due);
      if (d === 1) {
        sekali('MK_PULANG_H1:' + id + ':' + due, to, id, 'Peringatan: pulangkan peralatan esok', 'Reminder: return equipment tomorrow',
          ['Peralatan pinjaman (' + senarai + ') perlu dipulangkan esok (' + Util.fmtTarikhBM(due) + ') bagi tempahan ' + id + '.'],
          ['Borrowed equipment (' + senarai + ') is due tomorrow (' + due + ') for booking ' + id + '.']);
      } else if (d < 0) {
        var over = -d;
        var n = Math.floor((over - 1) / susulan) + 1;
        sekali('MK_PULANG_LEWAT:' + id + ':' + due + ':' + n, to, id, 'Pinjaman peralatan lewat dipulangkan', 'Borrowed equipment overdue',
          ['Peralatan pinjaman (' + senarai + ') bagi tempahan ' + id + ' lewat ' + over + ' hari. Sila pulangkan segera; pinjaman baharu disekat.'],
          ['Borrowed equipment (' + senarai + ') for booking ' + id + ' is ' + over + ' day(s) overdue. Please return it promptly; new loans are blocked.']);
      }
    });

    // 5. Peringatan tempahan akan datang (1 hari lagi)
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Status) !== 'Diluluskan') return;
      var id = Util.str(r.ID_Tempahan), mula = Util.dateKey(r.Tarikh_Mula);
      if (Util.daysBetween(today, mula) !== 1) return;
      sekali('MK_AKAN:' + id, Util.normEmail(r.Emel_Pemohon), id, 'Peringatan tempahan Makerspace esok', 'Reminder: Makerspace booking tomorrow',
        ['Tempahan ' + id + ' (' + Util.str(r.Jenis) + ') anda bermula esok, ' + Util.fmtTarikhBM(mula) + (Util.str(r.Masa_Mula) ? ' pukul ' + Util.str(r.Masa_Mula) : '') + '.'],
        ['Your booking ' + id + ' (' + Util.str(r.Jenis) + ') starts tomorrow, ' + mula + (Util.str(r.Masa_Mula) ? ' at ' + Util.str(r.Masa_Mula) : '') + '.']);
    });

    // 6. Laporan aktiviti bagi tempahan ruang
    var hariLap = Cfg.num('LAPORAN_AKTIVITI_HARI', 3);
    Db.rows('Tempahan').forEach(function (r) {
      if (Util.str(r.Jenis) !== 'Ruang' || ['Diluluskan', 'Selesai'].indexOf(Util.str(r.Status)) < 0) return;
      var id = Util.str(r.ID_Tempahan), tamat = Util.dateKey(r.Tarikh_Tamat);
      if (tamat >= today) return;
      var lap = Mk.byId('Laporan_Aktiviti', id);
      if (!lap) { Db.append('Laporan_Aktiviti', { ID_Tempahan: id, Fail_Laporan: '', Tarikh_Hantar: '', Status: 'Belum Dihantar' }); lap = Mk.byId('Laporan_Aktiviti', id); hasil.laporan++; }
      if (Util.str(lap.Status) === 'Dihantar') return;
      var had = Mk.addDays(tamat, hariLap), to = Util.normEmail(r.Emel_Pemohon);
      if (today > had) {
        if (Util.str(lap.Status) !== 'Lewat') {
          Db.update('Laporan_Aktiviti', lap._row, { Status: 'Lewat' });
          Audit.log(sistem, 'MK_LAPORAN_LEWAT', 'Makerspace', id, Util.str(lap.Status), 'Lewat', '');
        }
        sekali('MK_LAPORAN_LEWAT:' + id, to, id, 'Laporan aktiviti Makerspace lewat', 'Makerspace activity report overdue',
          ['Laporan aktiviti bagi tempahan ' + id + ' lewat dihantar (tarikh akhir ' + Util.fmtTarikhBM(had) + '). Tempahan ruang baharu disekat sehingga laporan dihantar.'],
          ['The activity report for booking ' + id + ' is overdue (due ' + had + '). New space bookings are blocked until it is submitted.']);
      } else {
        sekali('MK_LAPORAN:' + id, to, id, 'Peringatan: hantar laporan aktiviti', 'Reminder: submit the activity report',
          ['Sila hantar laporan aktiviti bagi tempahan ' + id + ' sebelum ' + Util.fmtTarikhBM(had) + ' melalui UTMPreneur (Makerspace).'],
          ['Please submit the activity report for booking ' + id + ' by ' + had + ' via UTMPreneur (Makerspace).']);
      }
    });
    return hasil;
  }

  return { kira: kira_, kiraTempahan: kiraTempahan_, janaLocked: janaLocked_, rekodBayaran: rekodBayaran_, jobHarian: jobHarian_, emelBil: emelBil_, penggunaanTeks: penggunaanTeks_, KAEDAH_BAYARAN: PAYMENT_METHODS };
})();
