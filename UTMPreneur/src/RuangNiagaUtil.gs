/**
 * UTMPreneur: pembantu dikongsi modul Ruang Niaga (RnU). Tiada kebergantungan semasa muat fail.
 * Capaian data, kebenaran, emel, log peringatan.
 */

var RnU = (function () {
  /** Status permohonan lot yang masih "aktif" (menghalang permohonan lain bagi pelajar/perniagaan yang sama). */
  var AKTIF = ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai', 'Diluluskan', 'Ditawarkan', 'Diterima', 'Perjanjian', 'Sewaan Aktif'];
  var STATUS_PER = ['Baharu', 'Disemak', 'Disenarai Pendek', 'Dinilai', 'Diluluskan', 'Ditolak', 'Ditawarkan', 'Diterima', 'Perjanjian', 'Sewaan Aktif',
    'Tawaran Luput', 'Ditolak Pemohon', 'Dibatalkan', 'Tamat'];

  function str_(v) { return Util.str(v); }
  function today_() { return Util.toDate(Util.dateKey(new Date())); }
  function dk_(v) { return Util.dateKey(v); }
  function csv_(a) { return (a || []).join(','); }
  function split_(s) { return str_(s) ? str_(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }
  function num_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function rm_(n) { var x = num_(n); return 'RM ' + (Math.round(x * 100) % 100 === 0 ? String(Math.round(x)) : x.toFixed(2)); }
  function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Util.toDate(s).getTime()); }

  function find1_(tab, pred) { var l = Db.find(tab, pred); return l.length ? l[0] : null; }
  function perById_(id) { return find1_('Permohonan_Lot', function (r) { return str_(r.ID_Permohonan) === id; }); }
  function lotById_(kod) { return find1_('Lot', function (r) { return str_(r.Kod_Lot) === kod; }); }
  function pelajar_(m) { return find1_('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; }); }
  function perniagaan_(id) { return find1_('Perniagaan', function (r) { return str_(r.ID_Perniagaan) === id; }); }
  function perniagaanOwner_(m) {
    var l = Db.find('Perniagaan', function (r) { return Util.normMatric(r.No_Matrik_Pemilik) === m; });
    return l.length ? l[l.length - 1] : null;
  }
  function tawaranById_(id) { return find1_('Tawaran_Sewa', function (r) { return str_(r.ID_Permohonan) === id; }); }
  function sewaanById_(id) { return find1_('Sewaan', function (r) { return str_(r.ID_Sewaan) === id; }); }

  /** Status SSU semasa (dikira daripada tarikh tamat). */
  function statusPer_(per) {
    var t = Util.toDate(per.Tarikh_Tamat);
    if (t && Util.daysBetween(new Date(), t) < 0) return 'Tamat Tempoh';
    return str_(per.Status_SSU) || 'Aktif';
  }

  /** Permohonan SSU diluluskan terkini bagi perniagaan. */
  function ssuLulus_(idPer) {
    var l = Db.find('Permohonan_SSU', function (r) { return str_(r.ID_Perniagaan) === idPer && str_(r.Status) === 'Diluluskan'; });
    return l.length ? l[l.length - 1] : null;
  }

  /**
   * Peta orang bagi setiap perniagaan: {ahli: {ID_Perniagaan: [No_Matrik...]}} (pemilik dahulu). Dibina dengan membaca
   * Perniagaan, Permohonan_SSU dan Ahli_Pasukan sekali sahaja.
   */
  function peta_() {
    var ahli = {};
    var latest = {}, ssuToPer = {};
    Db.rows('Permohonan_SSU').forEach(function (r) {
      if (str_(r.Status) === 'Diluluskan' && str_(r.ID_Perniagaan)) latest[str_(r.ID_Perniagaan)] = str_(r.ID_Permohonan);
    });
    Object.keys(latest).forEach(function (pid) { ssuToPer[latest[pid]] = pid; });
    Db.rows('Perniagaan').forEach(function (p) { ahli[str_(p.ID_Perniagaan)] = [Util.normMatric(p.No_Matrik_Pemilik)]; });
    Db.rows('Ahli_Pasukan').forEach(function (a) {
      var pid = ssuToPer[str_(a.ID_Permohonan)];
      if (!pid || !ahli[pid]) return;
      var m = Util.normMatric(a.No_Matrik);
      if (ahli[pid].indexOf(m) < 0) ahli[pid].push(m);
    });
    return { ahli: ahli };
  }
  function ahliMatrik_(idPer) { return peta_().ahli[idPer] || []; }

  /** ID perniagaan di mana pelajar ialah ahli (bukan pemilik). */
  function perniagaanAhli_(m) {
    var p = peta_(), out = [];
    Object.keys(p.ahli).forEach(function (id) { if (p.ahli[id].indexOf(m) > 0) out.push(id); });
    return out;
  }

  /** Permohonan lot aktif yang bercanggah bagi perniagaan ini (pemilik atau ahli yang sama). Pulang baris atau null. */
  function bercanggah_(idPer, kecualiId) {
    var p = peta_();
    var orang = p.ahli[idPer] || [];
    var hit = null;
    Db.rows('Permohonan_Lot').forEach(function (r) {
      if (hit || AKTIF.indexOf(str_(r.Status)) < 0 || str_(r.ID_Permohonan) === (kecualiId || '')) return;
      var lain = p.ahli[str_(r.ID_Perniagaan)] || [Util.normMatric(r.No_Matrik)];
      if (str_(r.ID_Perniagaan) === idPer || lain.some(function (m) { return orang.indexOf(m) >= 0; })) hit = r;
    });
    return hit;
  }

  function emelOf_(m) {
    var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === m; });
    if (pg.length && str_(pg[0].Emel)) return Util.normEmail(pg[0].Emel);
    var p = pelajar_(m);
    return p ? Util.normEmail(p.Emel) : '';
  }

  // ---------- Kebenaran ----------
  function isDecider_(ctx) {
    if (ctx.role === ROLE.ADMIN_PENUH) return true;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      return !mod || mod.indexOf('semua') >= 0 || mod.indexOf('ruang niaga') >= 0;
    }
    return false;
  }
  function requireDecider_(ctx) { if (!isDecider_(ctx)) throw appError_('TIADA_KEBENARIAN'); }
  function requireViewer_(ctx) {
    if (ADMIN_ROLES.indexOf(ctx.role) < 0 || ctx.role === ROLE.PENILAI) throw appError_('TIADA_KEBENARIAN');
  }

  /** Akses pelajar kepada permohonan: 'pemilik', 'ahli' atau ''. Konteks pelajar (termasuk bagi pihak) sahaja. */
  function akses_(ctx, r) {
    var m = ctx.noMatrik;
    if (!m) return '';
    if (Util.normMatric(r.No_Matrik) === m) return 'pemilik';
    return ahliMatrik_(str_(r.ID_Perniagaan)).indexOf(m) >= 0 ? 'ahli' : '';
  }
  function requireOwner_(ctx, r) {
    var a = akses_(ctx, r);
    if (!a) throw appError_('RN_TIDAK_DITEMUI');
    if (a !== 'pemilik') throw appError_('RN_HANYA_PEMILIK');
  }

  // ---------- Emel dan log peringatan ----------
  function mel_(to, sBm, sEn, bm, en) {
    if (!to) return false;
    try {
      var url = Cfg.get('WEBAPP_URL', '');
      if (url) { bm = bm.concat(['Buka UTMPreneur: ' + url]); en = en.concat(['Open UTMPreneur: ' + url]); }
      return Mail.send(to, { subjectBm: sBm, subjectEn: sEn, bm: bm, en: en });
    } catch (err) { console.error('Emel gagal: ' + err); return false; }
  }
  /** Emel admin yang boleh memutuskan Ruang Niaga (aktif). */
  function emelAdmin_() {
    var out = [];
    Admins.list().forEach(function (a) {
      if (!a.aktif || [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL].indexOf(a.peranan) < 0) return;
      var mod = a.modul.toLowerCase();
      if (a.peranan === ROLE.PEGAWAI_MODUL && mod && mod.indexOf('semua') < 0 && mod.indexOf('ruang niaga') < 0) return;
      if (out.indexOf(a.emel) < 0) out.push(a.emel);
    });
    return out;
  }
  function melAdmin_(sBm, sEn, bm, en) {
    emelAdmin_().forEach(function (e) { mel_(e, sBm, sEn, bm, en); });
  }
  /** Log peringatan dimuat sekali: {ada(kunci), tambah(kunci, emel, rujukan, catatan)}. */
  function peringatan_() {
    var ada = {};
    Db.rows('Peringatan').forEach(function (l) { ada[str_(l.Jenis)] = true; });
    return {
      ada: function (k) { return !!ada[k]; },
      tambah: function (k, emel, ruj, cat) {
        ada[k] = true;
        Db.append('Peringatan', { Masa: new Date(), Emel: emel || '-', Jenis: k, Rujukan: ruj || '', Status: 'Dihantar', Catatan: cat || '' });
      }
    };
  }

  function sys_() { return { email: 'sistem', role: '-' }; }

  /** Nama paparan lot. */
  function namaLot_(lot) { return lot ? (str_(lot.Nama_Paparan) || str_(lot.Kod_Lot)) : ''; }
  function alamatLot_(lot) {
    return str_(lot.Alamat_Surat) || (namaLot_(lot) + ', Universiti Teknologi Malaysia');
  }
  function isFnb_(lot) { return !!lot && str_(lot.Jenis) === 'FNB'; }

  /** Kemas kini baris Lot (kunci dipegang oleh pemanggil). */
  function setLot_(kod, status) {
    var l = lotById_(kod);
    if (l) Db.update('Lot', l._row, { Status_Lot: status });
  }
  /** Tulis semula baris tab yang sepadan dengan pred menggunakan baris baharu (kunci dipegang oleh pemanggil). */
  function gantiBaris_(tab, pred, baru) {
    var keep = Db.rows(tab).filter(function (r) { return !pred(r); });
    Db.replaceAll(tab, keep.concat(baru));
  }

  return {
    AKTIF: AKTIF, STATUS_PER: STATUS_PER, str: str_, today: today_, dk: dk_, csv: csv_, split: split_, num: num_, rm: rm_, isDate: isDate_,
    perById: perById_, lotById: lotById_, pelajar: pelajar_, perniagaan: perniagaan_, perniagaanOwner: perniagaanOwner_,
    tawaranById: tawaranById_, sewaanById: sewaanById_, statusPer: statusPer_, ssuLulus: ssuLulus_, peta: peta_,
    ahliMatrik: ahliMatrik_, perniagaanAhli: perniagaanAhli_, bercanggah: bercanggah_, emelOf: emelOf_,
    isDecider: isDecider_, requireDecider: requireDecider_, requireViewer: requireViewer_, akses: akses_, requireOwner: requireOwner_,
    mel: mel_, melAdmin: melAdmin_, emelAdmin: emelAdmin_, peringatan: peringatan_, sys: sys_,
    namaLot: namaLot_, alamatLot: alamatLot_, isFnb: isFnb_, setLot: setLot_, gantiBaris: gantiBaris_
  };
})();
