'use strict';
const assert = require('node:assert/strict');
const { createEnv } = require('./gas-mock');

const TESTERS = [
  'aina.contoh@graduate.utm.my', 'amirul.contoh@graduate.utm.my', 'weijie.contoh@graduate.utm.my', 'kavitha.contoh@graduate.utm.my',
  'staf1@utm.my', 'luar1@gmail.com', 'utmxcite@utm.my', 'pegawai@utm.my', 'penilai@utm.my', 'pemerhati@utm.my'
];
const MATRIK = {
  'aina.contoh@graduate.utm.my': 'A23UJ0001', 'amirul.contoh@graduate.utm.my': 'A23UJ0002',
  'weijie.contoh@graduate.utm.my': 'A22UJ0003', 'kavitha.contoh@graduate.utm.my': 'A24UJ0004'
};

function ready(mode) {
  const env = createEnv();
  env.setup(mode || 'UJI');
  env.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci==='PENGUJI_EMEL'; })[0]; Db.update('Tetapan', r._row, {Nilai: ${JSON.stringify(TESTERS.join(','))}}); Cfg.invalidate(); })()`);
  return env;
}
const call = (env, method, token, payload) => env.plain(env.run(`rpc(${JSON.stringify(method)}, ${JSON.stringify(token)}, ${JSON.stringify(payload || {})})`));

function login(env, email) {
  env.advance(120); // lepasi jeda OTP
  let r = call(env, 'otp.minta', null, { emel: email });
  assert.equal(r.ok, true, JSON.stringify(r));
  r = call(env, 'otp.sahkan', null, { emel: email, kod: env.lastCode(email) });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}

/** Log masuk pelajar dan tuntut No. Matrik. Pulang token. */
function student(env, email) {
  const t = login(env, email).token;
  const r = call(env, 'daftar.matrik', t, { noMatrik: MATRIK[email] });
  assert.equal(r.ok, true, JSON.stringify(r));
  return t;
}

function setCfg(env, key, val) {
  env.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci===${JSON.stringify(key)}; })[0];
    if (r) Db.update('Tetapan', r._row, {Nilai: ${JSON.stringify(String(val))}}); else Db.append('Tetapan', {Kunci: ${JSON.stringify(key)}, Nilai: ${JSON.stringify(String(val))}, Penerangan: ''}); Cfg.invalidate(); })()`);
}

const PROFIL = () => ({
  telefon: '0123456789', alamatKolej: 'Kolej Tun Fatimah, UTM', alamatRumah: 'No 1, Jalan Mawar, 81300 Skudai', fakulti: 'FC', bidang: 'ICT',
  program: 'BSc Sains Komputer', tahun: 3, kampung: 'JOHOR',
  keluargaBerniaga: 'Ya', keluarga: [{ hubungan: 'IBU', jenis: 'Kedai runcit', tempoh: '10 tahun' }],
  pernahBerniaga: 'Ya', jenisDijalankan: 'RETAIL', tempohNiaga: 'KURANG1', motivasi: ['MINAT', 'PENDAPATAN'],
  berminat: 'Ya', klusterDiminati: ['ICT', 'LAIN'], klusterLain: 'Seni kraf', mahuKampus: 'Ya', aliran: 'TEKNO'
});

const b64 = (txt) => Buffer.from(txt, 'utf8').toString('base64');
const PDF = (name) => ({ nama: name || 'ssm.pdf', data: b64('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n') });

const SSU = () => ({
  jenisSsu: 'Perniagaan', nama: 'seni kek aina', produk: ['FNB'], syaratSubjek: 'UBSS1032', pensyarah: 'Dr. Contoh', seksyen: '01', kumpulan: 'A',
  statusSsm: 'YA', noSsm: '202603001234', failSsm: PDF(), jenisPerniagaan: 'SOLE', kluster: 'MANUF', sumber: ['SENDIRI'],
  modal: '1500', pendapatan: '2000.50', alamat: 'No 12, Jalan Mawar, Taman Universiti, 81300 Skudai, Johor', tarikhMula: '2026-09-01',
  laman: 'instagram.com/senikek', ahli: ['A23UJ0002'], perakuan: true
});

const TEMPLAT_SIJIL = [
  'PERAKUAN PENDAFTARAN SYARIKAT PEMULA PELAJAR', 'UNIVERSITI TEKNOLOGI MALAYSIA',
  'Dengan ini diperakui bahawa perniagaan yang dijalankan dengan nama', '[nama_syarikat]', 'NO. PENDAFTARAN : [no_sijil]',
  'telah didaftarkan pada [tarikh_daftar] di bawah Pusat Inovasi Mahasiswa dan Keusahawanan Teknologi (UTMXCITE), Universiti Teknologi Malaysia. Perniagaan ini beralamat di [alamat_berdaftar].',
  'Kod Pendaftaran Subjek : [kod_kursus]', 'Nama Ahli Kumpulan : [nama_ahli]', 'Jumlah Ahli : [bil_ahli] ORANG', 'Tempoh Sah Laku : [tarikh_tamat]'
].join('\n');

/** Pelajar siap profiling. */
function profiled(env, email) {
  const t = student(env, email);
  const r = call(env, 'profil.simpan', t, PROFIL());
  assert.equal(r.ok, true, JSON.stringify(r));
  return t;
}

module.exports = { ready, call, login, student, profiled, setCfg, PROFIL, SSU, PDF, b64, TEMPLAT_SIJIL, MATRIK, assert };
