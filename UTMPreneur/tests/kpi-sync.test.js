'use strict';
/** Penyegerakan UTMPreneur -> Sheet sistem KPI (satu kali entry). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ready, call, login, setCfg } = require('./helpers');
const { addPer } = require('./kew-helpers');

const ADMIN = 'utmxcite@utm.my';
const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));

/** Sheet KPI tiruan dengan sebahagian tab sedia ada (lajur id/sistem seperti sistem KPI). */
function kpiSheet(env, tabs) {
  const id = env.run(`(function(){ var ss = SpreadsheetApp.create('KPI UJI'); var t = ${JSON.stringify(tabs || {})};
    Object.keys(t).forEach(function (n) { var s = ss.insertSheet(n); s.getRange(1, 1, 1, t[n].length).setValues([t[n]]); });
    return ss.getId(); })()`);
  setCfg(env, 'KPI_SHEET_ID', id);
  return id;
}
const kpiRows = (env, id, tab) => env.plain(env.run(`(function(){ var s = SpreadsheetApp.openById(${JSON.stringify(id)}).getSheetByName(${JSON.stringify(tab)});
  var lr = s.getLastRow(); if (lr < 1) return []; var v = s.getRange(1, 1, lr, s.getLastColumn()).getValues(); var h = v[0];
  return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; }); })()`));
const sync = (env, tok) => call(env, 'kpi.segerak', tok, {});

function seedData(env) {
  addPer(env, { id: 'PRN-0001', matrik: 'A23UJ0001' });
  env.run(`(function(){
    Db.update('Perniagaan', Db.find('Perniagaan', function(){return true;})[0]._row, { Berasaskan_Inovasi: 'Ya', TRL: 'TRL5', Bil_Pekerja: 8, Jenis_Perniagaan_KPI: 'K05' });
    Db.append('Permohonan_SSU', { ID_Permohonan: 'SSU-2026-0001', ID_Perniagaan: 'PRN-0001', No_Matrik_Pemilik: 'A23UJ0001', Status: 'Diluluskan', Status_SSM: 'YA', No_SSM: '202603001234',
      Tarikh_SSM: Util.toDate('2026-03-01'), Sumber_Pembiayaan: 'IBUBAPA,SENDIRI', Modal_RM: 1500, Pendapatan_Bulanan_RM: 2000.5, Bil_Ahli: 2, Tarikh_Keputusan: Util.toDate('2026-09-10'), Tarikh_Mula_Perniagaan: Util.toDate('2026-09-01'), Laman_Media_Sosial: 'ig/senikek' });
    Db.append('Laporan_Bulanan', { ID_Laporan: 'LAP-1', ID_Perniagaan: 'PRN-0001', Bulan: 9, Tahun: 2026, Pendapatan_RM: 3200, Bil_Pekerja: 12, Status: 'Diterima' });
    Db.append('Laporan_Bulanan', { ID_Laporan: 'LAP-2', ID_Perniagaan: 'PRN-0001', Bulan: 10, Tahun: 2026, Pendapatan_RM: 100, Status: 'Dihantar' });
    Db.append('Profil', { ID_Profil: 'P1', No_Matrik: 'A23UJ0001', Sesi: '2026/27', Tarikh_Kemas_Kini: Util.toDate('2026-09-02'), No_Telefon: '0123456789', Pernah_Berniaga: 'Ya', Tahap_Minat: 'TINGGI', Minat_Bidang: 'DIGITAL', Tahap_Kesediaan: 'PROTOTAIP' });
    Db.update('Lot', Db.find('Lot', function(x){return x.Kod_Lot==='SUB-01';})[0]._row, { Status_Buka: 'Dibuka', Status_Lot: 'Disewa', Tarikh_Daftar: Util.toDate('2026-01-05') });
    Db.append('Sewaan', { ID_Sewaan: 'SWA-1', Kod_Lot: 'SUB-01', ID_Perniagaan: 'PRN-0001', Kadar_RM: 300, Tarikh_Mula: Util.toDate('2026-09-01'), Tarikh_Tamat: Util.toDate('2027-08-31'), Status: 'Aktif' });
    Db.append('Bayaran_Sewa', { ID_Bil: 'BIL-1', ID_Sewaan: 'SWA-1', Kod_Lot: 'SUB-01', ID_Perniagaan: 'PRN-0001', Bulan: 9, Tahun: 2026, Jumlah_RM: 350, Sewa_RM: 300, Tarikh_Akhir: Util.toDate('2026-09-07'), Status: 'Dibayar', Tarikh_Bayar: Util.toDate('2026-09-05'), No_Rujukan: 'R1' });
    Db.append('Bayaran_Sewa', { ID_Bil: 'BIL-2', ID_Sewaan: 'SWA-1', Kod_Lot: 'SUB-01', ID_Perniagaan: 'PRN-0001', Bulan: 10, Tahun: 2026, Jumlah_RM: 300, Sewa_RM: 300, Tarikh_Akhir: Util.toDate('2026-10-07'), Status: 'Belum Bayar' });
    Db.append('Tempahan', { ID_Tempahan: 'MK-1', Jenis: 'Laser Cut', Jenis_Pengguna: 'Pelajar', Emel_Pemohon: 'aina.contoh@graduate.utm.my', Nama_Pemohon: 'Aina', Tarikh_Mula: Util.toDate('2026-10-01'), Masa_Mula: '09:00', Masa_Tamat: '11:00', Tujuan: 'Prototaip', No_Matrik: 'A23UJ0001', Telefon: '0123456789', Status: 'Selesai', Anggaran_RM: 10 });
    Db.append('Bayaran_Makerspace', { ID_Bayaran: 'BYR-1', ID_Tempahan: 'MK-1', Anggaran_RM: 10, Kos_Sebenar_RM: 12, Status: 'Dibayar' });
    Db.append('Tempahan', { ID_Tempahan: 'MK-2', Jenis: 'Ruang', Jenis_Pengguna: 'Luar', Emel_Pemohon: 'luar1@gmail.com', Status: 'Selesai', Anggaran_RM: 50 });
  })()`);
}

function setup() {
  const env = ready();
  const admin = login(env, ADMIN).token;
  seedData(env);
  return { env, admin };
}

test('Tanpa KPI_SHEET_ID: ralat jelas, kerja harian dilangkau; hanya Admin Penuh boleh segerak', () => {
  const { env, admin } = setup();
  let r = sync(env, admin);
  assert.equal(r.error.code, 'KPI_TIADA_ID');
  assert.deepEqual(env.plain(env.run('KpiSync.jobHarian()')), { langkau: true });
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(sync(env, peg).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'kpi.status', peg, {}).error.code, 'TIADA_KEBENARIAN');
  setCfg(env, 'KPI_SHEET_ID', 'tiada-sheet');
  assert.equal(sync(env, admin).error.code, 'KPI_TIDAK_BOLEH_BUKA');
  const st = call(env, 'kpi.status', admin, {});
  assert.equal(st.data.ditetapkan, true);
});

test('Pemetaan: CKAI1, CKAI4, CKAI5, CKAI6, CKAI7, KAI3 dan PELAJAR ditulis dengan nilai KPI yang sah', () => {
  const { env, admin } = setup();
  const id = kpiSheet(env);
  const r = sync(env, admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.ralat, []);
  const pel = kpiRows(env, id, 'PELAJAR');
  const aina = pel.find((x) => x.no_matrik === 'A23UJ0001');
  assert.equal(aina.sumber, 'UTMPreneur');
  assert.ok(aina.nama_pelajar && aina.no_kp !== undefined);

  const c1 = kpiRows(env, id, 'CKAI1_Profiling_Pelajar');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].id, 'PF-001');
  assert.equal(c1[0].tahap_minat, 'Tinggi'); assert.equal(c1[0].minat_bidang, 'Digital / AI');
  assert.equal(c1[0].tahap_kesediaan, 'Ada prototaip / MVP'); assert.equal(c1[0].pengalaman_perniagaan, 'Pernah berniaga');
  assert.equal(c1[0].tarikh_profiling, '2026-09-02');

  const c4 = kpiRows(env, id, 'CKAI4_SSU');
  assert.equal(c4.length, 1);
  assert.equal(c4[0].id, 'SS-001'); assert.equal(c4[0].nama_syarikat, 'KEK AINA');
  assert.equal(c4[0].punca_modal, 'MODAL KELUARGA'); assert.equal(c4[0].modal_awal, '1,000-1,999');
  assert.equal(c4[0].bilangan_pekerja, '6-10 ORANG'); assert.equal(c4[0].status_ssm, 'Berdaftar');
  assert.equal(c4[0].no_daftar_ssm, '202603001234'); assert.equal(c4[0].tarikh_ssm, '2026-03-01');
  assert.equal(c4[0].berasaskan_inovasi, 'Ya'); assert.equal(c4[0].trl_syarikat, 'TRL 5');
  assert.equal(c4[0].bil_rakan_kongsi, 2); assert.equal(c4[0].status, 'Aktif');
  assert.equal(c4[0].no_ssu, 'XCITE-2026S00001-01'); assert.equal(c4[0].jenis_perniagaan.length > 5, true);

  const c5 = kpiRows(env, id, 'CKAI5_Makerspace');
  assert.equal(c5.length, 1); // tempahan pengguna luar dilangkau
  assert.equal(c5[0].peralatan, 'Laser Cutter Machine'); assert.equal(c5[0].status_bayaran, 'Bayar'); assert.equal(c5[0].bayaran_rm, 12);
  assert.equal(c5[0].sumber_kunci, 'UP:MK:MK-1'); assert.equal(r.data.tab.CKAI5_Makerspace.langkau, 1);

  const c6 = kpiRows(env, id, 'CKAI6_Sewaan_Inkubator').sort((a, b) => a.tempoh.localeCompare(b.tempoh));
  assert.equal(c6.length, 2);
  assert.deepEqual(c6.map((x) => x.status_bayaran), ['Dibayar', 'Tertunggak']);
  assert.equal(c6[0].jumlah_rm, 300); assert.equal(c6[0].inkubator, 'SUB - Lot 1'); assert.equal(c6[0].tarikh_bayar, '2026-09-05');
  assert.equal(c6[0].tempoh, '2026-09');

  const c7 = kpiRows(env, id, 'CKAI7_Pendapatan_Pelajar');
  assert.equal(c7.length, 1); // hanya laporan Diterima (LAP-1)
  assert.equal(c7[0].Tahun, 2026); assert.equal(c7[0].Bulan, 'September'); assert.equal(c7[0].pendapatan_bulanan, 3200);
  assert.equal(c7[0].bilangan_pekerja, '11-15 ORANG'); assert.equal(c7[0].punca_modal, 'MODAL KELUARGA'); assert.equal(c7[0].jumlah_modal, '1,000-1,999');

  const k3all = kpiRows(env, id, 'KAI3_Ruang_Perniagaan');
  assert.equal(k3all.length, 15);
  const k3 = k3all.filter((x) => x.kod_lot === 'SUB-01');
  assert.equal(k3[0].status, 'Disewa'); assert.equal(k3[0].jenis_ruang, 'Student Union Building (SUB)');
  assert.equal(k3[0].penyewa_matrik, 'A23UJ0001'); assert.equal(k3[0].kadar_sewa, 300); assert.equal(k3[0].tarikh_mula_sewa, '2026-09-01');
});

test('Pemetaan julat: modal, pekerja, punca modal, bangsa', () => {
  const env = ready();
  const m = (e) => env.plain(env.run(e));
  assert.deepEqual([0, 499, 500, 899, 999, 1000, 4999, 5000, 90000].map((n) => m(`KpiSync.map.julatModal(${n})`)),
    ['KURANG DARI 499', 'KURANG DARI 499', '500-699', '700-899', '900-999', '1,000-1,999', '4,000-4,999', '5,000 DAN KE ATAS', '5,000 DAN KE ATAS']);
  assert.deepEqual([0, 5, 6, 10, 11, 16, 30, 31, 40, 41, 100, 101].map((n) => m(`KpiSync.map.julatPekerja(${n})`)),
    ['KURANG DARI 5', 'KURANG DARI 5', '6-10 ORANG', '6-10 ORANG', '11-15 ORANG', '16-30 ORANG', '16-30 ORANG', '31-40 ORANG', '31-40 ORANG', '41-50 ORANG', '91-100 ORANG', '101 DAN KE ATAS']);
  assert.equal(m("KpiSync.map.puncaModal('GERAN,SENDIRI')"), 'GERAN');
  assert.equal(m("KpiSync.map.bangsa('BSABAH')"), 'PRIBUMI SABAH');
  assert.equal(m("KpiSync.map.bangsa('BUKANWN')"), 'LAIN-LAIN');
});

test('Idempoten: larian kedua tiada perubahan; ubah sumber mengemas kini baris sedia ada tanpa baris baharu', () => {
  const { env, admin } = setup();
  const id = kpiSheet(env);
  sync(env, admin);
  const r2 = sync(env, admin).data;
  Object.keys(r2.tab).forEach((k) => assert.deepEqual([r2.tab[k].tambah, r2.tab[k].kemaskini, r2.tab[k].buang], [0, 0, 0], k));
  const before = kpiRows(env, id, 'CKAI6_Sewaan_Inkubator').map((x) => x.id).sort();
  env.run(`(function(){ var b = Db.find('Bayaran_Sewa', function(x){return x.ID_Bil==='BIL-2';})[0]; Db.update('Bayaran_Sewa', b._row, { Status: 'Dibayar', Tarikh_Bayar: Util.toDate('2026-10-05') }); })()`);
  const r3 = sync(env, admin).data;
  assert.equal(r3.tab.CKAI6_Sewaan_Inkubator.kemaskini, 1);
  assert.equal(r3.tab.CKAI6_Sewaan_Inkubator.tambah, 0);
  const after = kpiRows(env, id, 'CKAI6_Sewaan_Inkubator');
  assert.deepEqual(after.map((x) => x.id).sort(), before);
  assert.equal(after.find((x) => x.tempoh === '2026-10').status_bayaran, 'Dibayar');
});

test('Entri manual dikekalkan; baris sumber UTMPreneur yang ditarik balik dibuang; baris manual sama no_matrik dilangkau', () => {
  const { env, admin } = setup();
  const hdr = ['id', 'fakulti', 'nama_pelajar', 'no_kp', 'no_matrik', 'tahap_minat', 'dicipta_pada', 'dicipta_oleh', 'dikemas_kini_pada', 'dikemas_kini_oleh'];
  const id = kpiSheet(env, { CKAI1_Profiling_Pelajar: hdr, CKAI6_Sewaan_Inkubator: ['id', 'tempoh', 'no_matrik', 'penyewa', 'jumlah_rm', 'status_bayaran'] });
  env.run(`(function(){ var s = SpreadsheetApp.openById(${JSON.stringify(id)});
    s.getSheetByName('CKAI1_Profiling_Pelajar').getRange(2, 1, 1, 5).setValues([['PF-007', 'FC', 'Manual', '900101015555', 'A23UJ0001']]);
    s.getSheetByName('CKAI6_Sewaan_Inkubator').getRange(2, 1, 1, 6).setValues([['SI-001', '2026-01', 'A99X', 'Manual Niaga', 50, 'Dibayar']]); })()`);
  let r = sync(env, admin).data;
  assert.equal(r.tab.CKAI1_Profiling_Pelajar.tambah, 0); assert.equal(r.tab.CKAI1_Profiling_Pelajar.langkau, 1);
  assert.equal(kpiRows(env, id, 'CKAI1_Profiling_Pelajar')[0].nama_pelajar, 'Manual');
  let c6 = kpiRows(env, id, 'CKAI6_Sewaan_Inkubator');
  assert.equal(c6.length, 3);
  assert.equal(c6.find((x) => x.penyewa === 'Manual Niaga').id, 'SI-001');
  assert.deepEqual(c6.filter((x) => x.sumber === 'UTMPreneur').map((x) => x.id).sort(), ['SI-002', 'SI-003']);
  // tarik balik satu bil
  env.run(`(function(){ var b = Db.find('Bayaran_Sewa', function(x){return x.ID_Bil==='BIL-2';})[0]; Db.update('Bayaran_Sewa', b._row, { Status: 'Dikecualikan' }); })()`);
  r = sync(env, admin).data;
  assert.equal(r.tab.CKAI6_Sewaan_Inkubator.buang, 1);
  c6 = kpiRows(env, id, 'CKAI6_Sewaan_Inkubator');
  assert.equal(c6.length, 2);
  assert.ok(c6.some((x) => x.penyewa === 'Manual Niaga'));
});

test('Kerja harian menyegerak bila ID ditetapkan dan KPI_AUTO bukan TIDAK; rekod terakhir disimpan', () => {
  const { env, admin } = setup();
  const id = kpiSheet(env);
  setCfg(env, 'KPI_AUTO', 'TIDAK');
  assert.deepEqual(env.plain(env.run('Jobs.harian()')).kpi, { langkau: true });
  setCfg(env, 'KPI_AUTO', 'YA');
  const j = env.plain(env.run('Jobs.harian()')).kpi;
  assert.equal(j.tab.CKAI4_SSU.tambah, 1);
  assert.equal(kpiRows(env, id, 'CKAI4_SSU').length, 1);
  const st = call(env, 'kpi.status', admin, {}).data;
  assert.equal(st.terakhir.tab.CKAI4_SSU.tambah, 1);
  const aud = rows(env, 'Audit');
  sync(env, admin);
  assert.ok(rows(env, 'Audit').length > aud.length);
});

test('PELAJAR: induk tunggal, baris sedia ada padanan no_matrik dikemas kini dan dituntut; baris lain tidak disentuh', () => {
  const { env, admin } = setup();
  const id = kpiSheet(env, { PELAJAR: ['no_matrik', 'no_kp', 'nama_pelajar', 'emel', 'telefon', 'fakulti', 'jantina', 'bangsa', 'bidang_pengajian', 'dikemas_kini_pada', 'dikemas_kini_oleh'] });
  env.run(`(function(){ var s = SpreadsheetApp.openById(${JSON.stringify(id)}).getSheetByName('PELAJAR');
    s.getRange(2, 1, 2, 3).setValues([['A23UJ0001', '', 'Nama Lama'], ['Z00ZZ0000', '', 'Pelajar Luar']]); })()`);
  sync(env, admin);
  const pel = kpiRows(env, id, 'PELAJAR');
  const a = pel.find((x) => x.no_matrik === 'A23UJ0001');
  assert.notEqual(a.nama_pelajar, 'Nama Lama'); assert.equal(a.sumber, 'UTMPreneur');
  assert.equal(pel.filter((x) => x.no_matrik === 'A23UJ0001').length, 1);
  const z = pel.find((x) => x.no_matrik === 'Z00ZZ0000');
  assert.equal(z.nama_pelajar, 'Pelajar Luar'); assert.equal(z.sumber, '');
});
