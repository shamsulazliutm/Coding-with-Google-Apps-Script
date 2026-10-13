'use strict';
/** Pembantu ujian khusus modul Kewangan (tidak mengubah tests/helpers.js atau gas-mock.js). */
const { call, login, student } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const AMIRUL = 'amirul.contoh@graduate.utm.my';
const WEIJIE = 'weijie.contoh@graduate.utm.my';
const KAVITHA = 'kavitha.contoh@graduate.utm.my';
const ADMIN = 'utmxcite@utm.my';

/** Tambah baris Perniagaan terus (tanpa laluan SSU penuh). Pulang ID perniagaan. */
function addPer(env, o) {
  const rec = Object.assign({
    id: 'PRN-0001', nama: 'KEK AINA', matrik: 'A23UJ0001', permohonan: 'SSU-2026-0001',
    daftar: '2026-09-10', dicipta: '2026-09-10', status: 'Aktif'
  }, o || {});
  env.run(`(function(){ var r = ${JSON.stringify(rec)};
    Db.append('Perniagaan', { ID_Perniagaan: r.id, Nama_Perniagaan: r.nama, ID_Permohonan_SSU: r.permohonan, No_Matrik_Pemilik: r.matrik,
      Jenis_SSU: 'Perniagaan', No_Pendaftaran: 'XCITE-2026S00001-01', Bil_Sijil: 1, Tarikh_Pendaftaran: Util.toDate(r.daftar),
      Tarikh_Tamat: Util.toDate('2027-09-10'), Status_SSU: r.status, Dicipta_Pada: Util.toDate(r.dicipta) }); })()`);
  return rec.id;
}

/** Daftar ahli pasukan (selain pemilik) bagi permohonan Diluluskan sesuatu perniagaan. */
function addAhli(env, permohonan, perId, pemilik, matriks) {
  env.run(`(function(){
    Db.append('Permohonan_SSU', { ID_Permohonan: ${JSON.stringify(permohonan)}, ID_Perniagaan: ${JSON.stringify(perId)}, No_Matrik_Pemilik: ${JSON.stringify(pemilik)}, Status: 'Diluluskan' });
    ${JSON.stringify(matriks)}.forEach(function (m) { Db.append('Ahli_Pasukan', { ID_Permohonan: ${JSON.stringify(permohonan)}, No_Matrik: m, Nama: 'Ahli ' + m, Peranan_Ahli: 'Ahli' }); });
  })()`);
}

function addSewaan(env, perId, status) {
  env.run(`Db.append('Sewaan', { ID_Sewaan: 'SWA-0001', Kod_Lot: 'SM-01', ID_Perniagaan: ${JSON.stringify(perId)}, Status: ${JSON.stringify(status || 'Aktif')} })`);
}

const jobAt = (env, hari, opts) => env.plain(env.run(`Kewangan.jobHarian(${JSON.stringify(Object.assign({ hari }, opts || {}))})`));

const lap = (env) => env.plain(env.run(`Db.rows('Laporan_Bulanan').map(function (r) { return {
  row: r._row, id: r.ID_Laporan, per: r.ID_Perniagaan, sewaan: r.ID_Sewaan, bulan: r.Bulan, tahun: r.Tahun, status: r.Status, akhir: Util.dateKey(r.Tarikh_Akhir),
  hantar: Util.dateKey(r.Tarikh_Hantar), tiada: r.Tiada_Aktiviti, pend: r.Pendapatan_RM, belanja: r.Perbelanjaan_RM, untung: r.Untung_RM,
  fail: r.Fail_Laporan, perakuan: r.Perakuan, oleh: r.Disemak_Oleh, catatan: r.Catatan_Semakan }; })`));

const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));

const setLap = (env, id, patch) => env.run(`(function(){ var p = ${JSON.stringify(patch)};
  ['Tarikh_Akhir', 'Tarikh_Hantar'].forEach(function (k) { if (typeof p[k] === 'string' && p[k]) p[k] = Util.toDate(p[k]); });
  var r = Db.find('Laporan_Bulanan', function (x) { return x.ID_Laporan === ${JSON.stringify(id)}; })[0]; Db.update('Laporan_Bulanan', r._row, p); })()`);

const bytes = (arr) => Buffer.from(arr).toString('base64');
const XLSX = (nama) => ({ nama: nama || 'laporan.xlsx', data: bytes([0x50, 0x4B, 0x03, 0x04, 1, 2, 3, 4]) });
const XLS = (nama) => ({ nama: nama || 'laporan.xls', data: bytes([0xD0, 0xCF, 0x11, 0xE0, 1, 2, 3, 4]) });

/** Pegawai Modul dengan modul tertentu (emel pegawai@utm.my). Pulang token pegawai. */
function pegawai(env, modul, emel, adminTok) {
  const a = adminTok || login(env, ADMIN).token;
  const e = emel || 'pegawai@utm.my';
  const r = call(env, 'admin.tambah', a, { emel: e, nama: 'Pegawai', peranan: 'Pegawai Modul', modul });
  if (!r.ok) throw new Error(JSON.stringify(r));
  env.advance(61);
  return login(env, e).token;
}
function peranan(env, emel, jenis, adminTok) {
  const a = adminTok || login(env, ADMIN).token;
  const r = call(env, 'admin.tambah', a, { emel, nama: jenis, peranan: jenis, modul: '' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  env.advance(61);
  return login(env, emel).token;
}

/** Tarikh yyyy-mm-dd relatif kepada hari ini (hari). */
function rel(hari) {
  const d = new Date(Date.now() + hari * 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}

module.exports = { AINA, AMIRUL, WEIJIE, KAVITHA, ADMIN, addPer, addAhli, addSewaan, jobAt, lap, rows, setLap, XLSX, XLS, pegawai, peranan, rel, student };
