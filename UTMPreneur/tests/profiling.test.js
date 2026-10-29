'use strict';
const test = require('node:test');
const { ready, call, login, student, setCfg, PROFIL, assert } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';

test('Profiling: paparan auto-isi daripada PELAJAR, No. KP bertopeng, belum lengkap', () => {
  const env = ready();
  const t = student(env, AINA);
  const r = call(env, 'profil.dapat', t);
  assert.equal(r.ok, true);
  assert.equal(r.data.pelajar.nama, 'NURUL AINA BINTI HASSAN');
  assert.equal(r.data.pelajar.noKp, '01****001');
  assert.ok(!JSON.stringify(r.data).includes('010101-01-0001'), 'No. KP penuh tidak boleh didedahkan');
  assert.equal(r.data.profil, null);
  assert.equal(r.data.status.lengkap, false);
});

test('Profiling: simpan sah mengemas kini PELAJAR, mencipta Profil dan perniagaan keluarga', () => {
  const env = ready();
  const t = student(env, AINA);
  const p = PROFIL(); p.tahun = 4; p.program = 'BSc Sains Komputer (Kepintaran Buatan)';
  const r = call(env, 'profil.simpan', t, p);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status.lengkap, true);
  const pel = env.plain(env.run(`Db.find('PELAJAR', function(x){return x.No_Matrik==='A23UJ0001'})[0]`));
  assert.equal(pel.Tahun_Pengajian, 4);
  assert.equal(pel.Fakulti, 'Fakulti Komputeran');
  assert.equal(pel.Bidang_Pengajian, 'Teknologi Maklumat dan Komunikasi');
  assert.equal(pel.Nama_Penuh, 'NURUL AINA BINTI HASSAN', 'identiti tidak berubah');
  const pf = env.plain(env.run(`Db.rows('Profil')`));
  assert.equal(pf.length, 1);
  assert.match(pf[0].ID_Profil, /^PRF-\d{5}$/);
  assert.equal(pf[0].Sesi, 'UMUM');
  assert.equal(pf[0].Motivasi, 'MINAT,PENDAPATAN');
  assert.equal(pf[0].Kluster_Diminati, 'ICT,LAIN');
  const fam = env.plain(env.run(`Db.rows('Perniagaan_Keluarga')`));
  assert.equal(fam.length, 1);
  assert.equal(fam[0].Hubungan, 'IBU');
  // paparan semula memuatkan data tersimpan
  const v = call(env, 'profil.dapat', t).data;
  assert.equal(v.profil.aliran, 'TEKNO');
  assert.deepEqual(v.profil.motivasi, ['MINAT', 'PENDAPATAN']);
  assert.equal(v.profil.keluarga[0].jenis, 'Kedai runcit');
});

test('Profiling: simpan semula pada sesi sama mengemas kini (tiada baris berganda)', () => {
  const env = ready();
  const t = student(env, AINA);
  call(env, 'profil.simpan', t, PROFIL());
  const p = PROFIL(); p.keluargaBerniaga = 'Tidak'; p.keluarga = [];
  assert.equal(call(env, 'profil.simpan', t, p).ok, true);
  assert.equal(env.plain(env.run(`Db.rows('Profil')`)).length, 1);
  assert.equal(env.plain(env.run(`Db.rows('Perniagaan_Keluarga')`)).length, 0);
});

test('Profiling: sesi baharu menyimpan sejarah dan menandakan perlu kemas kini (tanpa sekatan)', () => {
  const env = ready();
  setCfg(env, 'SESI_SEMASA', '2026/2027-1');
  const t = student(env, AINA);
  call(env, 'profil.simpan', t, PROFIL());
  setCfg(env, 'SESI_SEMASA', '2026/2027-2');
  let s = call(env, 'profil.dapat', t).data.status;
  assert.equal(s.lengkap, true);
  assert.equal(s.perluKemasKini, true);
  call(env, 'profil.simpan', t, PROFIL());
  assert.equal(env.plain(env.run(`Db.rows('Profil')`)).length, 2);
  s = call(env, 'profil.dapat', t).data.status;
  assert.equal(s.perluKemasKini, false);
});

test('Profiling: pengesahan medan dan cabang bersyarat', () => {
  const env = ready();
  const t = student(env, AINA);
  const bad = Object.assign(PROFIL(), { telefon: 'abc', kampung: 'MARS', fakulti: 'XXX', tahun: 9, keluarga: [], klusterDiminati: [], aliran: 'X' });
  let r = call(env, 'profil.simpan', t, bad);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PROFIL_TIDAK_SAH');
  const m = r.error.extra.medan;
  ['telefon', 'kampung', 'fakulti', 'tahun', 'keluarga', 'klusterDiminati', 'aliran'].forEach((k) => assert.ok(m[k], 'ralat dijangka pada ' + k));
  assert.equal(env.plain(env.run(`Db.rows('Profil')`)).length, 0, 'tiada apa-apa ditulis jika tidak sah');
  // LAIN tanpa teks
  r = call(env, 'profil.simpan', t, Object.assign(PROFIL(), { klusterLain: '' }));
  assert.ok(r.error.extra.medan.klusterLain);
  // cabang: tidak pernah berniaga dan tidak berminat -> medan bergantung dikosongkan
  const p = Object.assign(PROFIL(), { pernahBerniaga: 'Tidak', jenisDijalankan: 'RETAIL', berminat: 'Tidak', tahapMinat: 'TIADA', klusterDiminati: ['ICT'], aliran: 'GIG' });
  r = call(env, 'profil.simpan', t, p);
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = env.plain(env.run(`Db.rows('Profil')[0]`));
  assert.equal(row.Jenis_Perniagaan_Dijalankan, '');
  assert.equal(row.Motivasi, '');
  assert.equal(row.Kluster_Diminati, '');
  assert.equal(row.Aliran_Pilihan, '');
});

test('Profiling: hanya pelajar yang telah menuntut No. Matrik', () => {
  const env = ready();
  const staf = login(env, 'staf1@utm.my').token;
  assert.equal(call(env, 'profil.dapat', staf).error.code, 'TIADA_KEBENARIAN');
  const belum = login(env, AINA).token; // belum tuntut matrik
  assert.equal(call(env, 'profil.dapat', belum).error.code, 'MATRIK_TIDAK_DITEMUI');
  assert.equal(call(env, 'profil.simpan', belum, PROFIL()).error.code, 'MATRIK_TIDAK_DITEMUI');
});

test('Profiling: suntikan formula dalam teks bebas disimpan sebagai teks', () => {
  const env = ready();
  const t = student(env, AINA);
  const p = Object.assign(PROFIL(), { alamatRumah: '=HYPERLINK("http://x","klik")', klusterLain: '+cmd|calc' });
  assert.equal(call(env, 'profil.simpan', t, p).ok, true);
  const sh = env.run(`Db.sheet('Profil')`);
  assert.equal(sh.liveFormulas.length, 0);
  const pel = env.plain(env.run(`Db.find('PELAJAR', function(x){return x.No_Matrik==='A23UJ0001'})[0]`));
  assert.equal(pel.Alamat_Rumah, '=HYPERLINK("http://x","klik")');
});
