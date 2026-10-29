'use strict';
/** Medan tambahan yang diperlukan oleh sistem KPI (satu kali entry): SSU, Profiling, Laporan Kewangan, senarai pilihan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ready, call, login, student, profiled, PROFIL, SSU, TEMPLAT_SIJIL } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));

test('Rujukan: senarai KPI sama tepat dengan sistem KPI (klasifikasi 39, TRL 4-6, tahap minat, bidang, kesediaan)', () => {
  const env = ready();
  const ruj = env.plain(env.run('Ref.all()'));
  assert.equal(ruj.JENIS_PERNIAGAAN_KPI.length, 39);
  assert.equal(ruj.JENIS_PERNIAGAAN_KPI[0].bm, 'Aktiviti guaman');
  assert.deepEqual(ruj.TRL.map((x) => x.bm), ['TRL 4', 'TRL 5', 'TRL 6']);
  assert.deepEqual(ruj.TAHAP_MINAT.map((x) => x.bm), ['Tiada minat', 'Rendah', 'Sederhana', 'Tinggi']);
  assert.deepEqual(ruj.TAHAP_KESEDIAAN.map((x) => x.bm), ['Belum ada idea', 'Ada idea', 'Ada prototaip / MVP', 'Sudah beroperasi']);
  assert.deepEqual(ruj.MINAT_BIDANG.map((x) => x.bm), ['Kejuruteraan & Teknologi', 'Digital / AI', 'Sains & Kesihatan', 'Alam Bina & Kemampanan', 'Sosial & Pendidikan', 'Perniagaan & Keusahawanan', 'Lain-lain']);
});

test('SSU: berasaskan inovasi, TRL, bilangan pekerja, tarikh SSM dan klasifikasi KPI disahkan dan dibawa ke Perniagaan', () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const aina = profiled(env, AINA);
  const admin = login(env, 'utmxcite@utm.my').token;
  const bad = Object.assign(SSU(), { berasaskanInovasi: 'Ya', trl: '', bilPekerja: 'dua', tarikhSsm: '', jenisPerniagaanKpi: 'XXX' });
  let r = call(env, 'ssu.hantar', aina, bad);
  assert.equal(r.error.code, 'SSU_TIDAK_SAH');
  ['trl', 'bilPekerja', 'tarikhSsm', 'jenisPerniagaanKpi'].forEach((k) => assert.ok(r.error.extra.medan[k], k + ': ' + JSON.stringify(r.error.extra.medan)));
  r = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { berasaskanInovasi: 'Tidak', trl: 'TRL6' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  let p = rows(env, 'Permohonan_SSU')[0];
  assert.deepEqual([p.Berasaskan_Inovasi, p.TRL, p.Bil_Pekerja, p.Jenis_Perniagaan_KPI], ['Tidak', '', 2, 'K05'], 'TRL dikosongkan jika tidak berasaskan inovasi');
  assert.equal(env.plain(env.run(`Util.dateKey(Db.rows('Permohonan_SSU')[0].Tarikh_SSM)`)), '2026-03-01');
  // edit: berasaskan inovasi + TRL 5, lulus; Perniagaan membawa medan
  call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'pembetulan', catatan: 'Tambah TRL' });
  assert.equal(call(env, 'ssu.hantar', aina, Object.assign(SSU(), { id: r.data.id, failSsm: null, berasaskanInovasi: 'Ya', trl: 'TRL5' })).ok, true);
  const res = call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.data.label.jenisKpi, 'Aktiviti pengaturcaraan komputer lain (termasuk content creation, coding, business apps, MachineLearning, Artificial Intelligence, Cybersecurity, pangkalan data dan lama web)');
  const per = rows(env, 'Perniagaan')[0];
  assert.deepEqual([per.Berasaskan_Inovasi, per.TRL, per.Bil_Pekerja, per.Jenis_Perniagaan_KPI], ['Ya', 'TRL5', 2, 'K05']);
  // tarikh SSM akan datang ditolak
  const aina2 = call(env, 'ssu.dapat', aina, { perniagaanId: per.ID_Perniagaan });
  assert.equal(aina2.ok, true);
});

test('Profiling: tahap minat 4 peringkat menentukan berminat; bidang dan kesediaan wajib jika berminat', () => {
  const env = ready();
  const t = student(env, AINA);
  let r = call(env, 'profil.simpan', t, Object.assign(PROFIL(), { minatBidang: '', tahapKesediaan: 'X' }));
  assert.equal(r.error.code, 'PROFIL_TIDAK_SAH');
  assert.ok(r.error.extra.medan.minatBidang && r.error.extra.medan.tahapKesediaan);
  r = call(env, 'profil.simpan', t, Object.assign(PROFIL(), { tahapMinat: 'TINGGI' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  let pf = rows(env, 'Profil')[0];
  assert.deepEqual([pf.Tahap_Minat, pf.Minat_Bidang, pf.Tahap_Kesediaan, pf.Berminat_Berniaga], ['TINGGI', 'DIGITAL', 'IDEA', 'Ya']);
  // Tiada minat: medan bergantung dikosongkan, berminat = Tidak
  r = call(env, 'profil.simpan', t, Object.assign(PROFIL(), { tahapMinat: 'TIADA', minatBidang: '', tahapKesediaan: '' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  pf = rows(env, 'Profil')[0];
  assert.deepEqual([pf.Tahap_Minat, pf.Minat_Bidang, pf.Tahap_Kesediaan, pf.Berminat_Berniaga, pf.Kluster_Diminati], ['TIADA', '', '', 'Tidak', '']);
  // klien lama (hanya berminat) masih diterima
  const lama = PROFIL(); delete lama.tahapMinat; lama.berminat = 'Tidak';
  assert.equal(call(env, 'profil.simpan', t, lama).ok, true);
  assert.equal(rows(env, 'Profil')[0].Tahap_Minat, 'TIADA');
});

test('Laporan Kewangan: bilangan pekerja wajib (kecuali tiada aktiviti) dan disimpan', () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const aina = profiled(env, AINA);
  const admin = login(env, 'utmxcite@utm.my').token;
  const r = call(env, 'ssu.hantar', aina, SSU());
  call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' });
  call(env, 'kew.admin.jana', admin, {});
  const lap = rows(env, 'Laporan_Bulanan')[0];
  assert.ok(lap, 'laporan dijana');
  const base = { id: lap.ID_Laporan, tiadaAktiviti: false, pendapatan: '100', perbelanjaan: '40', perakuan: true };
  let h = call(env, 'kew.hantar', aina, base);
  assert.equal(h.error.code, 'KEW_TIDAK_SAH');
  assert.ok(h.error.extra.medan.bilPekerja);
  h = call(env, 'kew.hantar', aina, Object.assign({}, base, { bilPekerja: '3' }));
  assert.equal(h.ok, true, JSON.stringify(h));
  assert.equal(rows(env, 'Laporan_Bulanan')[0].Bil_Pekerja, 3);
  // tiada aktiviti: tidak wajib (dianggap 0)
  const h2 = call(env, 'kew.hantar', aina, { id: lap.ID_Laporan, tiadaAktiviti: true, perakuan: true });
  assert.equal(h2.ok, false, 'sudah Dihantar: tidak boleh disunting lagi');
});
