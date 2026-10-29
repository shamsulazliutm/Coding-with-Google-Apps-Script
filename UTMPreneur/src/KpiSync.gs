/**
 * UTMPreneur: penyegerakan ke Google Sheet sistem KPI sedia ada (satu kali entry).
 * Menulis tab PELAJAR, CKAI1, CKAI4, CKAI5, CKAI6, CKAI7 dan KAI3 sistem KPI daripada data UTMPreneur.
 * Baris yang disegerakkan ditanda sumber = 'UTMPreneur' dan kunci_sumber; baris tanpa tanda itu (entri manual) tidak disentuh,
 * kecuali tab PELAJAR (induk tunggal, dipadankan mengikut no_matrik). Lajur sedia ada tidak diubah susunan atau dibuang.
 */

var TETAPAN_KPI = [
  ['KPI_SHEET_ID', '', 'ID Google Sheet sistem KPI (bahagian antara /d/ dan /edit dalam URL). Kosong = penyegerakan dimatikan'],
  ['KPI_URL', '', 'URL aplikasi web sistem KPI (untuk paparan dalam menu KPI)'],
  ['KPI_AUTO', 'YA', 'Segerak ke sistem KPI setiap hari (YA / TIDAK)'],
  ['KPI_TERAKHIR', '', 'Ringkasan penyegerakan terakhir (diurus oleh sistem)']
];

var MSG_KPI = {
  KPI_TIADA_ID: ['ID Sheet sistem KPI belum ditetapkan. Isi KPI_SHEET_ID dalam tab Tetapan.', 'The KPI sheet ID is not set. Fill KPI_SHEET_ID in the Settings tab.'],
  KPI_TIDAK_BOLEH_BUKA: ['Sheet sistem KPI tidak dapat dibuka. Semak ID dan kebenaran akaun pengeluar.', 'The KPI sheet could not be opened. Check the ID and the deploying account’s access.']
};

var KpiSync = (function () {
  var SUMBER = 'UTMPreneur';
  var SYS = ['dicipta_pada', 'dicipta_oleh', 'dikemas_kini_pada', 'dikemas_kini_oleh'];
  var NUMK = ['Tahun', 'tahun_pengajian', 'bil_rakan_kongsi', 'jumlah_jualan', 'bil_peserta', 'bayaran_rm', 'jumlah_rm', 'pendapatan_bulanan', 'keluasan', 'kadar_sewa'];

  var BULAN_MS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  var BANGSA = { MELAYU: 'MELAYU', CINA: 'CINA', INDIA: 'INDIA', BSABAH: 'PRIBUMI SABAH', BSARAWAK: 'PRIBUMI SARAWAK', BUKANWN: 'LAIN-LAIN' };
  var PUNCA = { SENDIRI: 'MODAL SENDIRI', IBUBAPA: 'MODAL KELUARGA', GERAN: 'GERAN', PINJAMAN: 'PINJAMAN', IPT: 'BANTUAN IPT', HADIAH: 'HADIAH PERTANDINGAN', AGENSI: 'AGENSI', NGO: 'NGO', CROWD: 'LAIN-LAIN', LAIN: 'LAIN-LAIN' };
  var PERALATAN = { 'Ruang': 'Sewaan Ruang (Space Rental)', 'Laser Cut': 'Laser Cutter Machine', '3D Printer': '3D Printer', 'Pinjaman': 'Peralatan Tangan (Tools)' };

  function S(v) { return Util.str(v); }

  // ---------- Pemetaan nilai ----------
  function bangsa_(etnik) { return BANGSA[S(etnik)] || (S(etnik) ? 'LAIN-LAIN' : ''); }
  function puncaModal_(csv) {
    var first = S(csv).split(',')[0].trim();
    return PUNCA[first] || '';
  }
  function julatModal_(rm) {
    if (rm === '' || rm === null || rm === undefined) return '';
    var n = Util.parseRm(rm);
    if (n === null || isNaN(n)) return '';
    if (n < 500) return 'KURANG DARI 499';
    if (n < 700) return '500-699';
    if (n < 900) return '700-899';
    if (n < 1000) return '900-999';
    if (n < 2000) return '1,000-1,999';
    if (n < 3000) return '2,000-2,999';
    if (n < 4000) return '3,000-3,999';
    if (n < 5000) return '4,000-4,999';
    return '5,000 DAN KE ATAS';
  }
  function julatPekerja_(v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    if (isNaN(n) || n < 0) return '';
    if (n <= 5) return 'KURANG DARI 5';
    if (n >= 101) return '101 DAN KE ATAS';
    if (n <= 10) return '6-10 ORANG';
    if (n <= 15) return '11-15 ORANG';
    if (n <= 30) return '16-30 ORANG';
    var lo = Math.floor((n - 1) / 10) * 10 + 1;
    return lo + '-' + (lo + 9) + ' ORANG';
  }
  function ya_(v) { return /^(ya|yes)$/i.test(S(v)) ? 'Ya' : (S(v) ? 'Tidak' : ''); }

  // ---------- Data sumber ----------
  function mapBy_(tab, col) {
    var m = {};
    Db.rows(tab).forEach(function (r) { m[S(r[col])] = r; });
    return m;
  }

  function latestApproved_(perId, perm) {
    var best = null;
    perm.forEach(function (p) {
      if (S(p.ID_Perniagaan) !== perId || S(p.Status) !== 'Diluluskan') return;
      var d = Util.dateKey(p.Tarikh_Keputusan) || Util.dateKey(p.Tarikh_Hantar);
      if (!best || d >= best.d) best = { d: d, p: p };
    });
    return best ? best.p : null;
  }

  function ctxData_() {
    var d = { pel: mapBy_('PELAJAR', 'No_Matrik'), per: Db.rows('Perniagaan'), perm: Db.rows('Permohonan_SSU') };
    d.perById = {};
    d.per.forEach(function (p) { d.perById[S(p.ID_Perniagaan)] = p; });
    return d;
  }

  // ---------- Pembina baris bagi setiap tab (pulang { items:[{key,obj}], langkau:n }) ----------
  function pelajar_() {
    var items = [];
    Db.rows('PELAJAR').forEach(function (r) {
      var m = S(r.No_Matrik);
      if (!m) return;
      items.push({ key: m, obj: {
        no_matrik: m, no_kp: S(r.No_KP_Pasport), nama_pelajar: S(r.Nama_Penuh), emel: S(r.Emel), telefon: S(r.No_Telefon),
        fakulti: S(r.Fakulti), jantina: S(r.Jantina), bangsa: bangsa_(r.Etnik), bidang_pengajian: S(r.Bidang_Pengajian)
      } });
    });
    return { items: items, langkau: 0 };
  }

  function ckai1_(d) {
    var items = [], latest = {};
    Db.rows('Profil').forEach(function (p) {
      var m = S(p.No_Matrik), t = Util.dateKey(p.Tarikh_Kemas_Kini);
      if (m && (!latest[m] || t >= latest[m].t)) latest[m] = { t: t, p: p };
    });
    Object.keys(latest).forEach(function (m) {
      var p = latest[m].p, pel = d.pel[m] || {};
      var minat = S(p.Tahap_Minat) || (ya_(p.Berminat_Berniaga) === 'Ya' ? 'SEDERHANA' : 'TIADA');
      items.push({ key: 'UP:PROFIL:' + m, obj: {
        fakulti: S(pel.Fakulti), nama_pelajar: S(pel.Nama_Penuh), no_kp: S(pel.No_KP_Pasport) || S(p.No_KP), no_matrik: m,
        emel: S(pel.Emel), telefon: S(p.No_Telefon) || S(pel.No_Telefon), program: S(pel.Program), tahun_pengajian: S(pel.Tahun_Pengajian),
        tarikh_profiling: latest[m].t, sumber_profiling: 'Pendaftaran minat',
        tahap_minat: Ref.bm('TAHAP_MINAT', minat), minat_bidang: S(p.Minat_Bidang) ? Ref.bm('MINAT_BIDANG', S(p.Minat_Bidang)) : '',
        pengalaman_perniagaan: ya_(p.Pernah_Berniaga) === 'Ya' ? 'Pernah berniaga' : 'Tiada',
        tahap_kesediaan: S(p.Tahap_Kesediaan) ? Ref.bm('TAHAP_KESEDIAAN', S(p.Tahap_Kesediaan)) : ''
      } });
    });
    return { items: items, langkau: 0 };
  }

  function ckai4_(d) {
    var items = [], langkau = 0;
    d.per.forEach(function (per) {
      var id = S(per.ID_Perniagaan), pel = d.pel[S(per.No_Matrik_Pemilik)];
      if (!id) return;
      if (!pel) { langkau++; return; }
      var p = latestApproved_(id, d.perm) || {};
      var ahli = Number(p.Bil_Ahli) || 1;
      var ssm = S(p.Status_SSM) === 'YA' ? 'Berdaftar' : 'Tidak Berdaftar';
      var inov = ya_(per.Berasaskan_Inovasi);
      var kpiCode = S(per.Jenis_Perniagaan_KPI) || S(p.Jenis_Perniagaan_KPI);
      items.push({ key: 'UP:SSU:' + id, obj: {
        fakulti: S(pel.Fakulti), nama_pelajar: S(pel.Nama_Penuh), no_kp: S(pel.No_KP_Pasport), no_matrik: S(pel.No_Matrik), emel: S(pel.Emel),
        telefon: S(pel.No_Telefon), jantina: S(pel.Jantina), bangsa: bangsa_(pel.Etnik), bidang_pengajian: S(pel.Bidang_Pengajian),
        nama_syarikat: S(per.Nama_Perniagaan), jenis_perniagaan: kpiCode ? Ref.bm('JENIS_PERNIAGAAN_KPI', kpiCode) : '',
        bil_rakan_kongsi: Math.min(13, Math.max(1, ahli)), bilangan_pekerja: julatPekerja_(per.Bil_Pekerja),
        no_ssu: S(per.No_Pendaftaran), tarikh_daftar: Util.dateKey(per.Tarikh_Pendaftaran), status_ssm: ssm,
        tarikh_ssm: ssm === 'Berdaftar' ? Util.dateKey(p.Tarikh_SSM) : '', no_daftar_ssm: ssm === 'Berdaftar' ? S(p.No_SSM) : '',
        link_website_perniagaaan: S(p.Laman_Media_Sosial), punca_modal: puncaModal_(p.Sumber_Pembiayaan), modal_awal: julatModal_(p.Modal_RM),
        jumlah_jualan: p.Pendapatan_Bulanan_RM === '' || p.Pendapatan_Bulanan_RM === undefined ? '' : Util.parseRm(p.Pendapatan_Bulanan_RM),
        tarikh_mula_perniagaan: Util.dateKey(p.Tarikh_Mula_Perniagaan),
        status: S(per.Status_SSU) === 'Aktif' || S(per.Status_SSU) === '' ? 'Aktif' : 'Tidak Aktif',
        berasaskan_inovasi: inov, trl_syarikat: inov === 'Ya' && S(per.TRL) ? Ref.bm('TRL', S(per.TRL)) : ''
      } });
    });
    return { items: items, langkau: langkau };
  }

  function ckai5_(d) {
    var items = [], langkau = 0;
    var byb = {}, bay = {}, ruang = {};
    Db.rows('Bayaran_Makerspace').forEach(function (b) { bay[S(b.ID_Tempahan)] = b; });
    Db.rows('Butiran_Ruang').forEach(function (b) { ruang[S(b.ID_Tempahan)] = b; });
    Db.rows('Tempahan').forEach(function (t) {
      if (['Diluluskan', 'Selesai'].indexOf(S(t.Status)) < 0) return;
      var m = S(t.No_Matrik), pel = d.pel[m];
      if (!m || !pel) { langkau++; return; }
      var id = S(t.ID_Tempahan), b = bay[id], r = ruang[id];
      var rm = b ? (b.Kos_Sebenar_RM !== '' && b.Kos_Sebenar_RM !== undefined ? b.Kos_Sebenar_RM : b.Anggaran_RM) : t.Anggaran_RM;
      rm = Number(rm) || 0;
      var st = rm === 0 || (b && S(b.Status) === 'Dikecualikan') ? 'Tiada Caj' : (b && S(b.Status) === 'Dibayar' ? 'Bayar' : 'Belum Dibayar');
      items.push({ key: 'UP:MK:' + id, obj: {
        emel: S(t.Emel_Pemohon), nama: S(t.Nama_Pemohon) || S(pel.Nama_Penuh), no_kp: S(pel.No_KP_Pasport), no_matrik: m, fakulti: S(pel.Fakulti),
        kelas: S(t.Jabatan), telefon: S(t.Telefon) || S(pel.No_Telefon), peralatan: PERALATAN[S(t.Jenis)] || 'Lain-lain (Other)',
        peralatan_lain: PERALATAN[S(t.Jenis)] ? '' : S(t.Jenis), tujuan: S(t.Tujuan), bil_peserta: r ? (Number(r.Bil_Peserta) || 1) : 1,
        tarikh_mula: Util.dateKey(t.Tarikh_Mula), tarikh_tamat: Util.dateKey(t.Tarikh_Tamat) || Util.dateKey(t.Tarikh_Mula),
        masa_mula: S(t.Masa_Mula), masa_tamat: S(t.Masa_Tamat), status_bayaran: st, bayaran_rm: st === 'Tiada Caj' ? 0 : rm, sumber_kunci: 'UP:MK:' + id
      } });
    });
    return { items: items, langkau: langkau };
  }

  function ckai6_(d) {
    var items = [], langkau = 0, lot = mapBy_('Lot', 'Kod_Lot'), today = Util.dateKey(new Date());
    var lokasi = ['SUB - Lot 1', 'SUB - Lot 2', 'SUB - Lot 3', 'SUB - Lot 4', 'SUB - Lot 5'];
    for (var i = 1; i <= 10; i++) lokasi.push('Student Mall - Lot ' + i);
    Db.rows('Bayaran_Sewa').forEach(function (b) {
      var st = S(b.Status), per = d.perById[S(b.ID_Perniagaan)];
      if (st === 'Dikecualikan') return;
      var pel = per ? d.pel[S(per.No_Matrik_Pemilik)] : null;
      if (!per || !pel || !b.Bulan || !b.Tahun) { langkau++; return; }
      var nama = S((lot[S(b.Kod_Lot)] || {}).Nama_Paparan) || S(b.Kod_Lot);
      var known = lokasi.indexOf(nama) >= 0;
      var status = st === 'Dibayar' ? 'Dibayar' : (Util.dateKey(b.Tarikh_Akhir) && Util.dateKey(b.Tarikh_Akhir) < today ? 'Tertunggak' : 'Belum dibayar');
      var sewa = b.Sewa_RM !== '' && b.Sewa_RM !== undefined ? b.Sewa_RM : b.Jumlah_RM;
      items.push({ key: 'UP:SEWA:' + S(b.ID_Bil), obj: {
        tempoh: Number(b.Tahun) + '-' + Util.pad(Number(b.Bulan), 2), no_matrik: S(pel.No_Matrik), nama_pelajar: S(pel.Nama_Penuh), no_kp: S(pel.No_KP_Pasport),
        inkubator: known ? nama : 'Lain-lain', inkubator_lain: known ? '' : nama, penyewa: S(per.Nama_Perniagaan), jumlah_rm: Util.parseRm(sewa) || 0,
        status_bayaran: status, tarikh_bayar: status === 'Dibayar' ? Util.dateKey(b.Tarikh_Bayar) : '', no_resit: S(b.No_Rujukan), lampiran: S(b.Fail_Resit)
      } });
    });
    return { items: items, langkau: langkau };
  }

  function ckai7_(d) {
    var items = [], langkau = 0;
    Db.rows('Laporan_Bulanan').forEach(function (r) {
      if (S(r.Status) !== 'Diterima') return;
      var per = d.perById[S(r.ID_Perniagaan)], pel = per ? d.pel[S(per.No_Matrik_Pemilik)] : null;
      var bln = Number(r.Bulan), thn = Number(r.Tahun);
      if (!per || !pel || !(bln >= 1 && bln <= 12) || !thn) { langkau++; return; }
      var p = latestApproved_(S(per.ID_Perniagaan), d.perm) || {};
      var kpiCode = S(per.Jenis_Perniagaan_KPI) || S(p.Jenis_Perniagaan_KPI);
      items.push({ key: 'UP:LAP:' + S(r.ID_Laporan), obj: {
        fakulti: S(pel.Fakulti), Tahun: thn, Bulan: BULAN_MS[bln - 1], nama_pelajar: S(pel.Nama_Penuh), no_kp: S(pel.No_KP_Pasport), no_matrik: S(pel.No_Matrik),
        jantina: S(pel.Jantina), bangsa: bangsa_(pel.Etnik), bidang_pengajian: S(pel.Bidang_Pengajian), nama_perniagaan: S(per.Nama_Perniagaan),
        no_ssu: S(per.No_Pendaftaran), no_ssm: S(p.Status_SSM) === 'YA' ? S(p.No_SSM) : '',
        jenis_perniagaan: kpiCode ? Ref.bm('JENIS_PERNIAGAAN_KPI', kpiCode) : '', punca_modal: puncaModal_(p.Sumber_Pembiayaan), jumlah_modal: julatModal_(p.Modal_RM),
        pendapatan_bulanan: Util.parseRm(r.Pendapatan_RM) || 0, bilangan_pekerja: julatPekerja_(r.Bil_Pekerja),
        tarikh_mula_perniagaan: Util.dateKey(p.Tarikh_Mula_Perniagaan)
      } });
    });
    return { items: items, langkau: langkau };
  }

  function kai3_(d) {
    var items = [], sewaan = {};
    Db.rows('Sewaan').forEach(function (s) { if (S(s.Status) === 'Aktif') sewaan[S(s.Kod_Lot)] = s; });
    Db.rows('Lot').forEach(function (l) {
      var kod = S(l.Kod_Lot);
      if (!kod) return;
      var sw = sewaan[kod], per = sw ? d.perById[S(sw.ID_Perniagaan)] : null, pel = per ? d.pel[S(per.No_Matrik_Pemilik)] : null;
      var sl = S(l.Status_Lot), buka = S(l.Status_Buka) === 'Dibuka';
      var status = sw || sl === 'Disewa' ? 'Disewa' : (sl === 'Penyelenggaraan' ? 'Tidak aktif' : (buka || sl === 'Dipohon' ? 'Ditawarkan' : 'Siap'));
      var lok = S(l.Lokasi);
      var jenis = /mall/i.test(lok) ? 'Student Mall' : (/SUB|union/i.test(lok) ? 'Student Union Building (SUB)' : 'Lain-lain');
      items.push({ key: 'UP:LOT:' + kod, obj: {
        kod_lot: kod, jenis_ruang: jenis, lokasi: lok, bangunan: S(l.Blok), keluasan: l.Saiz_m2 === '' || l.Saiz_m2 === undefined ? '' : Number(l.Saiz_m2),
        status: status, tarikh_ditawarkan: status === 'Ditawarkan' || status === 'Disewa' ? (Util.dateKey(l.Tarikh_Daftar) || Util.dateKey(new Date())) : '',
        penyewa_matrik: pel ? S(pel.No_Matrik) : '', penyewa_nama: pel ? S(pel.Nama_Penuh) : '', penyewa_kp: pel ? S(pel.No_KP_Pasport) : '',
        nama_perniagaan: per ? S(per.Nama_Perniagaan) : '', tarikh_mula_sewa: sw ? Util.dateKey(sw.Tarikh_Mula) : '', tarikh_tamat_sewa: sw ? Util.dateKey(sw.Tarikh_Tamat) : '',
        kadar_sewa: sw ? (Number(sw.Kadar_RM) || 0) : (l.Kadar_Sewa_RM === '' || l.Kadar_Sewa_RM === undefined ? '' : Number(l.Kadar_Sewa_RM))
      } });
    });
    return { items: items, langkau: 0 };
  }

  // ---------- Definisi tab KPI (lajur mengikut sistem KPI; tab hanya dicipta jika tiada) ----------
  var TABS = [
    { tab: 'PELAJAR', master: true, cols: ['no_matrik', 'no_kp', 'nama_pelajar', 'emel', 'telefon', 'fakulti', 'jantina', 'bangsa', 'bidang_pengajian', 'dikemas_kini_pada', 'dikemas_kini_oleh'], build: pelajar_ },
    { tab: 'CKAI1_Profiling_Pelajar', prefix: 'PF', cols: ['fakulti', 'nama_pelajar', 'no_kp', 'no_matrik', 'emel', 'telefon', 'program', 'tahun_pengajian', 'tarikh_profiling', 'sumber_profiling', 'tahap_minat', 'minat_bidang', 'pengalaman_perniagaan', 'tahap_kesediaan', 'kemahiran', 'catatan'], uniq: 'no_matrik', build: ckai1_ },
    { tab: 'CKAI4_SSU', prefix: 'SS', cols: ['fakulti', 'nama_pelajar', 'no_kp', 'no_matrik', 'emel', 'telefon', 'jantina', 'bangsa', 'bidang_pengajian', 'nama_syarikat', 'jenis_perniagaan', 'jenis_perniagaan_lain', 'jenis_milikan', 'bil_rakan_kongsi', 'bilangan_pekerja', 'no_ssu', 'tarikh_daftar', 'status_ssm', 'tarikh_ssm', 'no_daftar_ssm', 'link_website_perniagaaan', 'punca_modal', 'modal_awal', 'jumlah_jualan', 'penyata_bank', 'penyata_bank_pautan', 'tarikh_mula_perniagaan', 'catatan', 'status', 'berasaskan_inovasi', 'trl_syarikat'], build: ckai4_ },
    { tab: 'CKAI5_Makerspace', prefix: 'MS', cols: ['emel', 'nama', 'no_kp', 'no_matrik', 'fakulti', 'kelas', 'telefon', 'peralatan', 'peralatan_lain', 'tujuan', 'bil_peserta', 'tarikh_mula', 'tarikh_tamat', 'masa_mula', 'masa_tamat', 'status_bayaran', 'bayaran_rm', 'borang', 'borang_pautan', 'sumber_kunci'], build: ckai5_ },
    { tab: 'CKAI6_Sewaan_Inkubator', prefix: 'SI', cols: ['tempoh', 'no_matrik', 'nama_pelajar', 'no_kp', 'inkubator', 'inkubator_lain', 'penyewa', 'jumlah_rm', 'status_bayaran', 'tarikh_bayar', 'no_resit', 'lampiran', 'catatan'], build: ckai6_ },
    { tab: 'CKAI7_Pendapatan_Pelajar', prefix: 'PP', cols: ['fakulti', 'Tahun', 'Bulan', 'nama_pelajar', 'no_kp', 'no_matrik', 'jantina', 'bangsa', 'bidang_pengajian', 'nama_perniagaan', 'no_ssu', 'no_ssm', 'jenis_milikan', 'jenis_perniagaan', 'punca_modal', 'jumlah_modal', 'pendapatan_bulanan', 'bilangan_pekerja', 'link_website', 'Penyata_bank', 'Penyata_bank_pautan', 'tarikh_mula_perniagaan', 'lokasi_perniagaan_lain', 'catatan'], build: ckai7_ },
    { tab: 'KAI3_Ruang_Perniagaan', prefix: 'R3', cols: ['kod_lot', 'jenis_ruang', 'lokasi', 'bangunan', 'keluasan', 'status', 'tarikh_ditawarkan', 'penyewa_matrik', 'penyewa_nama', 'penyewa_kp', 'nama_perniagaan', 'tarikh_mula_sewa', 'tarikh_tamat_sewa', 'kadar_sewa', 'lampiran', 'catatan'], build: kai3_ }
  ];

  // ---------- Enjin penulisan ----------
  function same_(a, b) { return String(a === null || a === undefined ? '' : a) === String(b === null || b === undefined ? '' : b); }
  function cell_(v) { return typeof v === 'string' ? Db.safeCell(v) : (v === null || v === undefined ? '' : v); }

  function syncTab_(ss, def, built, now) {
    var res = { tambah: 0, kemaskini: 0, buang: 0, langkau: built.langkau || 0 };
    var sh = ss.getSheetByName(def.tab), baru = false;
    if (!sh) {
      sh = ss.insertSheet(def.tab); baru = true;
      var cols0 = (def.prefix ? ['id'] : []).concat(def.cols).concat(def.prefix ? SYS : []);
      sh.getRange(1, 1, 1, cols0.length).setValues([cols0]);
    }
    var hdr = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var extra = ['sumber', 'kunci_sumber'].filter(function (h) { return hdr.indexOf(h) < 0; });
    if (extra.length) { sh.getRange(1, hdr.length + 1, 1, extra.length).setValues([extra]); hdr = hdr.concat(extra); }
    if (baru) hdr.forEach(function (h, i) { if (NUMK.indexOf(h) < 0) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); });
    else extra.forEach(function (h) { sh.getRange(2, hdr.indexOf(h) + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); });
    var ix = {};
    hdr.forEach(function (h, i) { ix[h] = i; });
    var lr = sh.getLastRow();
    var data = lr >= 2 ? sh.getRange(2, 1, lr - 1, hdr.length).getValues() : [];
    data = data.filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
    var origLen = lr >= 2 ? lr - 1 : 0;
    var changed = false;

    var byKey = {}, idMax = 0, re = def.prefix ? new RegExp('^' + def.prefix + '-(\\d+)$') : null;
    var uniqUsed = {};
    data.forEach(function (r, i) {
      if (re && ix.id !== undefined) { var mm = re.exec(String(r[ix.id])); if (mm) idMax = Math.max(idMax, Number(mm[1])); }
      if (def.master) { byKey[S(r[ix.no_matrik])] = i; return; }
      if (String(r[ix.sumber]) === SUMBER && String(r[ix.kunci_sumber])) byKey[String(r[ix.kunci_sumber])] = i;
      else if (def.uniq) uniqUsed[S(r[ix[def.uniq]])] = true;
    });

    var seen = {};
    built.items.forEach(function (it) {
      if (seen[it.key]) { res.langkau++; return; }
      seen[it.key] = true;
      var i = byKey[it.key], row;
      if (i === undefined) {
        if (def.uniq && uniqUsed[S(it.obj[def.uniq])]) { res.langkau++; return; }
        row = hdr.map(function () { return ''; });
        Object.keys(it.obj).forEach(function (k) { if (ix[k] !== undefined) row[ix[k]] = cell_(it.obj[k]); });
        if (ix.id !== undefined && def.prefix) row[ix.id] = def.prefix + '-' + Util.pad(++idMax, 3);
        row[ix.sumber] = SUMBER;
        if (!def.master) row[ix.kunci_sumber] = it.key;
        else row[ix.kunci_sumber] = 'UP:PELAJAR:' + it.key;
        if (ix.dicipta_pada !== undefined) row[ix.dicipta_pada] = now;
        if (ix.dicipta_oleh !== undefined) row[ix.dicipta_oleh] = SUMBER;
        if (ix.dikemas_kini_pada !== undefined) row[ix.dikemas_kini_pada] = now;
        if (ix.dikemas_kini_oleh !== undefined) row[ix.dikemas_kini_oleh] = SUMBER;
        data.push(row); res.tambah++; changed = true;
        return;
      }
      row = data[i];
      var diff = false;
      Object.keys(it.obj).forEach(function (k) {
        if (ix[k] === undefined) return;
        if (!same_(row[ix[k]], it.obj[k])) { row[ix[k]] = cell_(it.obj[k]); diff = true; }
      });
      if (def.master && String(row[ix.sumber]) !== SUMBER) { row[ix.sumber] = SUMBER; row[ix.kunci_sumber] = 'UP:PELAJAR:' + it.key; diff = true; }
      if (diff) {
        if (ix.dikemas_kini_pada !== undefined) row[ix.dikemas_kini_pada] = now;
        if (ix.dikemas_kini_oleh !== undefined) row[ix.dikemas_kini_oleh] = SUMBER;
        res.kemaskini++; changed = true;
      }
    });

    if (!def.master) {
      var keep = data.filter(function (r) {
        if (String(r[ix.sumber]) !== SUMBER) return true;
        if (seen[String(r[ix.kunci_sumber])]) return true;
        res.buang++; return false;
      });
      if (res.buang) { data = keep; changed = true; }
    }

    if (changed) {
      if (data.length) sh.getRange(2, 1, data.length, hdr.length).setValues(data);
      if (data.length < origLen) sh.getRange(2 + data.length, 1, origLen - data.length, hdr.length).clearContent();
    }
    return res;
  }

  // ---------- Awam ----------
  function ssKpi_() {
    var id = S(Cfg.get('KPI_SHEET_ID', ''));
    if (!id) throw appError_('KPI_TIADA_ID');
    try { return SpreadsheetApp.openById(id); }
    catch (e) { console.error('KPI buka gagal: ' + e); throw appError_('KPI_TIDAK_BOLEH_BUKA'); }
  }

  function simpanTerakhir_(rep) {
    var json = JSON.stringify(rep);
    var r = Db.find('Tetapan', function (x) { return x.Kunci === 'KPI_TERAKHIR'; })[0];
    if (r) Db.update('Tetapan', r._row, { Nilai: json });
    else Db.append('Tetapan', { Kunci: 'KPI_TERAKHIR', Nilai: json, Penerangan: 'Ringkasan penyegerakan terakhir (diurus oleh sistem)' });
    Cfg.invalidate();
  }

  function jalankan_(ctx) {
    var ss = ssKpi_();
    var now = new Date().toISOString();
    var rep = { masa: now, oleh: ctx && ctx.email ? ctx.email : 'kerja harian', tab: {}, ralat: [] };
    var d = ctxData_();
    TABS.forEach(function (def) {
      try { rep.tab[def.tab] = syncTab_(ss, def, def.build(d), now); }
      catch (e) { console.error('KPI ' + def.tab + ': ' + e); rep.ralat.push(def.tab + ': ' + String(e && e.message ? e.message : e)); }
    });
    simpanTerakhir_(rep);
    return rep;
  }

  function status_() {
    var t = S(Cfg.get('KPI_TERAKHIR', ''));
    var last = null;
    try { last = t ? JSON.parse(t) : null; } catch (e) { last = null; }
    return { ditetapkan: !!S(Cfg.get('KPI_SHEET_ID', '')), auto: S(Cfg.get('KPI_AUTO', 'YA')) !== 'TIDAK', url: S(Cfg.get('KPI_URL', '')), terakhir: last, tab: TABS.map(function (x) { return x.tab; }) };
  }

  function jobHarian_() {
    if (!S(Cfg.get('KPI_SHEET_ID', '')) || S(Cfg.get('KPI_AUTO', 'YA')).toUpperCase() === 'TIDAK') return { langkau: true };
    return jalankan_(null);
  }

  function routes_() {
    var ADM = [ROLE.ADMIN_PENUH];
    return {
      'kpi.status':  { auth: true, roles: ADM, fn: function () { return status_(); } },
      'kpi.segerak': { auth: true, roles: ADM, fn: function (c) {
        var rep = jalankan_(c);
        var j = 0;
        Object.keys(rep.tab).forEach(function (k) { var t = rep.tab[k]; j += t.tambah + t.kemaskini + t.buang; });
        Audit.log(c, 'KPI_SEGERAK', 'KPI', '', '', j + ' perubahan', rep.ralat.length ? rep.ralat.join('; ') : '');
        return rep;
      } }
    };
  }

  return { routes: routes_, jobHarian: jobHarian_, jalankan: jalankan_, status: status_, map: { julatModal: julatModal_, julatPekerja: julatPekerja_, puncaModal: puncaModal_, bangsa: bangsa_ } };
})();
