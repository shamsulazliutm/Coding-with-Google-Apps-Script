'use strict';
const test = require('node:test');
const { ready, call, login, student, setCfg, PROFIL, SSU, TEMPLAT_SIJIL, assert } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));

function adminDan(env, emel, peranan, modul) {
  const a = login(env, 'utmxcite@utm.my').token;
  assert.equal(call(env, 'admin.tambah', a, { emel, nama: 'Pegawai', peranan, modul }).ok, true);
  env.advance(61);
  return a;
}

test('Bantu: admin mengisi profiling bagi pihak pelajar yang belum pernah log masuk', () => {
  const env = ready();
  const admin = login(env, 'utmxcite@utm.my').token;
  const s = call(env, 'bantu.pelajar', admin, { noMatrik: 'a23uj0001' });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(s.data.pelajar.nama, 'NURUL AINA BINTI HASSAN');
  assert.equal(s.data.pelajar.sudahLogMasuk, false);
  assert.equal(s.data.profil.lengkap, false);
  const v = call(env, 'profil.admin.dapat', admin, { noMatrik: 'A23UJ0001' });
  assert.equal(v.data.pelajar.noKp, '01****001', 'No. KP kekal bertopeng');
  const r = call(env, 'profil.admin.simpan', admin, Object.assign(PROFIL(), { noMatrik: 'A23UJ0001' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(rows(env, 'Profil')[0].No_Matrik, 'A23UJ0001');
  // audit: emel admin dan tanda bagi pihak
  const au = rows(env, 'Audit').filter((x) => x.Tindakan === 'SIMPAN_PROFIL')[0];
  assert.equal(au.Emel, 'utmxcite@utm.my');
  assert.match(au.Catatan, /\[bagi pihak A23UJ0001\]/);
  // pengesahan yang sama dikenakan
  const bad = call(env, 'profil.admin.simpan', admin, Object.assign(PROFIL(), { noMatrik: 'A23UJ0001', telefon: 'x' }));
  assert.equal(bad.error.code, 'PROFIL_TIDAK_SAH');
  // pelajar log masuk kemudian: profiling sudah lengkap
  const t = student(env, AINA);
  assert.equal(call(env, 'profil.dapat', t).data.status.lengkap, true);
});

test('Bantu: admin memohon SSU bagi pihak pelajar; pelajar melihatnya selepas log masuk', () => {
  const env = ready();
  const admin = login(env, 'utmxcite@utm.my').token;
  // tanpa profiling: disekat seperti pelajar
  assert.equal(call(env, 'ssu.admin.hantar', admin, Object.assign(SSU(), { noMatrik: 'A23UJ0001' })).error.code, 'PROFIL_LENGKAP_DULU');
  call(env, 'profil.admin.simpan', admin, Object.assign(PROFIL(), { noMatrik: 'A23UJ0001' }));
  const r = call(env, 'ssu.admin.hantar', admin, Object.assign(SSU(), { noMatrik: 'A23UJ0001' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = rows(env, 'Permohonan_SSU')[0];
  assert.equal(p.No_Matrik_Pemilik, 'A23UJ0001');
  assert.equal(p.Status, 'Baharu');
  assert.match(rows(env, 'Audit').filter((x) => x.Tindakan === 'MOHON_SSU')[0].Catatan, /bagi pihak pemohon \[bagi pihak A23UJ0001\]/);
  assert.equal(env.sentTo(AINA).filter((m) => /Permohonan SSU diterima/.test(m.subject)).length, 1, 'pelajar dimaklumkan');
  // pelajar menuntut matrik dan melihat permohonan; satu permohonan aktif sahaja
  const t = student(env, AINA);
  assert.equal(call(env, 'ssu.saya', t).data.permohonan[0].nama, 'SENI KEK AINA');
  assert.equal(call(env, 'ssu.admin.hantar', admin, Object.assign(SSU(), { noMatrik: 'A23UJ0001' })).error.code, 'SSU_SUDAH_ADA');
  // admin boleh melihat keadaan pelajar dan membetulkan (selepas Perlu Pembetulan)
  call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'pembetulan', catatan: 'Sila semak alamat.' });
  const sa = call(env, 'ssu.admin.pelajar', admin, { noMatrik: 'A23UJ0001' }).data;
  assert.equal(sa.permohonan[0].bolehUbah, true);
  const d = call(env, 'ssu.admin.dapat', admin, { noMatrik: 'A23UJ0001', id: r.data.id });
  assert.equal(d.data.borang.nama, 'SENI KEK AINA');
  const ubah = Object.assign(SSU(), { noMatrik: 'A23UJ0001', id: r.data.id, failSsm: null, alamat: 'No 7, Jalan Kenanga, Taman Universiti, 81300 Skudai, Johor' });
  assert.equal(call(env, 'ssu.admin.hantar', admin, ubah).ok, true);
  assert.equal(rows(env, 'Permohonan_SSU')[0].Alamat_Perniagaan, 'No 7, Jalan Kenanga, Taman Universiti, 81300 Skudai, Johor');
});

test('Bantu: terusLulus menghantar dan meluluskan serta menjana sijil', () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const admin = login(env, 'utmxcite@utm.my').token;
  call(env, 'profil.admin.simpan', admin, Object.assign(PROFIL(), { noMatrik: 'A23UJ0001' }));
  const r = call(env, 'ssu.admin.hantar', admin, Object.assign(SSU(), { noMatrik: 'A23UJ0001', terusLulus: true }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Diluluskan');
  assert.equal(r.data.fail.sijil, true);
  assert.match(rows(env, 'Perniagaan')[0].No_Pendaftaran, /^XCITE-\d{4}S00001-01$/);
  assert.equal(rows(env, 'Perniagaan')[0].No_Matrik_Pemilik, 'A23UJ0001');
});

test('Bantu: kebenaran (pelajar, Penilai, Pegawai Modul mengikut modul) dan No. Matrik tidak sah', () => {
  const env = ready();
  const t = student(env, AINA);
  assert.equal(call(env, 'bantu.pelajar', t, { noMatrik: 'A23UJ0002' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'profil.admin.simpan', t, Object.assign(PROFIL(), { noMatrik: 'A23UJ0002' })).error.code, 'TIADA_KEBENARIAN');
  const admin = adminDan(env, 'pegawai@utm.my', 'Pegawai Modul', 'Makerspace');
  call(env, 'admin.tambah', admin, { emel: 'penilai@utm.my', nama: 'Penilai', peranan: 'Penilai', modul: '' });
  env.advance(61);
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'bantu.pelajar', peg, { noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN', 'modul Makerspace tidak termasuk');
  const pen = login(env, 'penilai@utm.my').token;
  assert.equal(call(env, 'bantu.pelajar', pen, { noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'bantu.pelajar', admin, { noMatrik: 'ZZ99999' }).error.code, 'MATRIK_TIDAK_DITEMUI');
  assert.equal(call(env, 'bantu.pelajar', admin, { noMatrik: '' }).error.code, 'MATRIK_TIDAK_DITEMUI');
  // Pegawai Modul dengan modul SSU dibenarkan, tetapi terusLulus hanya jika boleh memutuskan (modul SSU: ya)
  call(env, 'admin.tambah', admin, { emel: 'pegawai@utm.my', nama: 'Pegawai', peranan: 'Pegawai Modul', modul: 'SSU' });
  env.advance(61);
  assert.equal(call(env, 'bantu.pelajar', peg, { noMatrik: 'A23UJ0001' }).ok, true);
});
