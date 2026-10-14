'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ready, call, login, student, profiled, PROFIL, SSU, TEMPLAT_SIJIL } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const KP_AINA = '010101-01-0001';
const KP_AMIRUL = '010101-01-0002';
const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));
const cols = (env, tab) => env.plain(env.run(`Db.headers(${JSON.stringify(tab)})`));

test('No. KP: skema meletakkan No_KP tepat selepas No_Matrik (atau selepas ID_Perniagaan + No_Matrik_Pemilik)', () => {
  const env = ready();
  ['Profil', 'Ahli_Pasukan', 'Permohonan_SSU', 'Perniagaan', 'Permohonan_Lot', 'Tempahan', 'Pekerja_Penyewa'].forEach((tab) => {
    const c = cols(env, tab);
    const mi = c.findIndex((x) => /^No_Matrik/.test(x));
    assert.ok(mi >= 0, tab + ' ada lajur matrik');
    assert.equal(c[mi + 1], 'No_KP', tab + ': No_KP selepas ' + c[mi]);
  });
  ['Sewaan', 'Bayaran_Sewa', 'Cagaran', 'Laporan_Bulanan'].forEach((tab) => {
    const c = cols(env, tab);
    const pi = c.indexOf('ID_Perniagaan');
    assert.deepEqual(c.slice(pi + 1, pi + 3), ['No_Matrik_Pemilik', 'No_KP'], tab);
  });
  assert.equal(env.plain(env.run('Setup.validate()')).ok, true);
  // lajur No_KP disimpan sebagai teks
  const sh = env.run("Db.sheet('Profil')");
  const idx = cols(env, 'Profil').indexOf('No_KP') + 1;
  assert.equal(sh.formats[idx], '@');
});

test('No. KP: terisi automatik pada Pengguna, Profil, Permohonan_SSU, Ahli_Pasukan dan Perniagaan', () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const t = student(env, AINA);
  assert.equal(rows(env, 'Pengguna').find((r) => r.Emel === AINA).No_KP_Pasport, KP_AINA, 'Pengguna pelajar membawa No. KP');
  assert.equal(call(env, 'profil.simpan', t, PROFIL()).ok, true);
  const pf = rows(env, 'Profil')[0];
  assert.equal(pf.No_Matrik, 'A23UJ0001');
  assert.equal(pf.No_KP, KP_AINA);
  const r = call(env, 'ssu.hantar', t, SSU());
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = rows(env, 'Permohonan_SSU')[0];
  assert.equal(p.No_KP, KP_AINA);
  const ahli = rows(env, 'Ahli_Pasukan');
  assert.deepEqual(ahli.map((a) => [a.No_Matrik, a.No_KP]), [['A23UJ0001', KP_AINA], ['A23UJ0002', KP_AMIRUL]]);
  const admin = login(env, 'utmxcite@utm.my').token;
  assert.equal(call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' }).ok, true);
  const per = rows(env, 'Perniagaan')[0];
  assert.deepEqual([per.No_Matrik_Pemilik, per.No_KP], ['A23UJ0001', KP_AINA]);
  // kemas kini baris (tanpa menyentuh No_KP) mengekalkannya
  env.run(`Db.update('Perniagaan', ${per._row}, { Kluster: 'RETAIL' })`);
  assert.equal(rows(env, 'Perniagaan')[0].No_KP, KP_AINA);
  // PELAJAR tidak diubah
  assert.equal(env.plain(env.run(`Db.find('PELAJAR', function(x){return x.No_Matrik==='A23UJ0001'})[0].No_KP_Pasport`)), KP_AINA);
});

test('No. KP: tab yang hanya ada ID_Perniagaan (Laporan_Bulanan, Sewaan) mendapat matrik pemilik dan No. KP', () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const t = profiled(env, AINA);
  const r = call(env, 'ssu.hantar', t, SSU());
  const admin = login(env, 'utmxcite@utm.my').token;
  call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' });
  const idPer = rows(env, 'Perniagaan')[0].ID_Perniagaan;
  env.run(`Db.append('Sewaan', { ID_Sewaan: 'SWA-0001', Kod_Lot: 'SM-01', ID_Perniagaan: ${JSON.stringify(idPer)}, Status: 'Aktif' })`);
  env.run(`Db.append('Laporan_Bulanan', { ID_Laporan: 'LKB-X', ID_Perniagaan: ${JSON.stringify(idPer)}, Bulan: 9, Tahun: 2026, Status: 'Belum Dihantar' })`);
  for (const tab of ['Sewaan', 'Laporan_Bulanan']) {
    const x = rows(env, tab)[0];
    assert.deepEqual([x.No_Matrik_Pemilik, x.No_KP], ['A23UJ0001', KP_AINA], tab);
  }
  // kemas kini baris lama yang tiada matrik (rekod sedia ada) melengkapkannya
  env.run(`(function(){ var s = Db.sheet('Sewaan'); var h = Db.headers('Sewaan'); s.getRange(2, h.indexOf('No_KP') + 1).setValue(''); s.getRange(2, h.indexOf('No_Matrik_Pemilik') + 1).setValue(''); })()`);
  assert.equal(rows(env, 'Sewaan')[0].No_KP, '');
  env.run(`Db.update('Sewaan', 2, { Status: 'Aktif' })`);
  assert.deepEqual([rows(env, 'Sewaan')[0].No_Matrik_Pemilik, rows(env, 'Sewaan')[0].No_KP], ['A23UJ0001', KP_AINA]);
});

test('No. KP: Setup.run melengkapkan rekod lama; isiNoKp(semula) menyegerak selepas No. KP berubah', () => {
  const env = ready();
  const t = profiled(env, AINA);
  assert.equal(rows(env, 'Profil')[0].No_KP, KP_AINA);
  // rekod lama tanpa No_KP
  env.run(`(function(){ var s = Db.sheet('Profil'); var h = Db.headers('Profil'); s.getRange(2, h.indexOf('No_KP') + 1).setValue(''); })()`);
  assert.equal(rows(env, 'Profil')[0].No_KP, '');
  const r = env.plain(env.run('Setup.run()'));
  assert.ok(r.langkah.some((l) => /No\. KP dilengkapkan pada \d+ baris/.test(l)), JSON.stringify(r.langkah));
  assert.equal(rows(env, 'Profil')[0].No_KP, KP_AINA);
  // No. KP dalam PELAJAR dibetulkan: isiNoKp() menyegerak semua
  env.run(`(function(){ var r = Db.find('PELAJAR', function(x){return x.No_Matrik==='A23UJ0001'})[0]; Db.update('PELAJAR', r._row, { No_KP_Pasport: '020202-02-0002' }); Db.reset(); })()`);
  const n = env.run('Setup.isiNoKp(true)');
  assert.ok(n >= 1);
  assert.equal(rows(env, 'Profil')[0].No_KP, '020202-02-0002');
  assert.equal(rows(env, 'Pengguna').find((x) => x.Emel === AINA).No_KP_Pasport, '020202-02-0002', 'segerak semula turut mengemas kini Pengguna pelajar');
  // tanpa pencerobohan: tiada ralat jika matrik tiada dalam PELAJAR
  env.run(`Db.append('Profil', { ID_Profil: 'PRF-X', No_Matrik: 'ZZ99999', Sesi: 'UMUM' })`);
  assert.equal(rows(env, 'Profil').find((x) => x.ID_Profil === 'PRF-X').No_KP, '');
});
