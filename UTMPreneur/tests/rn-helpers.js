'use strict';
/** Pembantu ujian khusus modul Ruang Niaga. */
const { ready, call, login, student, profiled, setCfg, SSU, PDF, TEMPLAT_SIJIL, assert } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const AMIRUL = 'amirul.contoh@graduate.utm.my';
const WEIJIE = 'weijie.contoh@graduate.utm.my';
const KAVITHA = 'kavitha.contoh@graduate.utm.my';
const ADMIN = 'utmxcite@utm.my';

const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));
const setRow = (env, tab, keyCol, key, patch) => env.run(`(function(){ var r = Db.find(${JSON.stringify(tab)}, function(x){ return String(x[${JSON.stringify(keyCol)}])===${JSON.stringify(key)}; })[0]; Db.update(${JSON.stringify(tab)}, r._row, ${JSON.stringify(patch)}); })()`);

/** Tarikh yyyy-MM-dd relatif kepada hari ini (zon Malaysia). */
function hari(env, offset) { return env.run(`Util.dateKey(new Date(new Date().getTime() + ${offset || 0} * 86400000))`); }

/** Persekitaran siap: admin tambahan (Penilai, Pegawai Modul, Pemerhati), tempoh permohonan dibuka. */
function rnReady(opts) {
  opts = opts || {};
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const admin = login(env, ADMIN).token;
  [['penilai@utm.my', 'Penilai Satu', 'Penilai', ''], ['pegawai@utm.my', 'Pegawai RN', 'Pegawai Modul', 'Ruang Niaga'],
    ['pemerhati@utm.my', 'Pemerhati', 'Pemerhati', ''], ['pegawai.lain@utm.my', 'Pegawai SSU', 'Pegawai Modul', 'SSU']].forEach((a) => {
    const r = call(env, 'admin.tambah', admin, { emel: a[0], nama: a[1], peranan: a[2], modul: a[3] });
    assert.equal(r.ok, true, JSON.stringify(r));
  });
  setCfg(env, 'PENGUJI_EMEL', ['aina.contoh@graduate.utm.my', 'amirul.contoh@graduate.utm.my', 'weijie.contoh@graduate.utm.my', 'kavitha.contoh@graduate.utm.my', 'staf1@utm.my', 'luar1@gmail.com',
    'utmxcite@utm.my', 'pegawai@utm.my', 'penilai@utm.my', 'penilai2@utm.my', 'pemerhati@utm.my', 'pegawai.lain@utm.my'].join(','));
  if (opts.tempoh !== false) {
    setCfg(env, 'TEMPOH_PERMOHONAN_LOT_BUKA', hari(env, -2));
    setCfg(env, 'TEMPOH_PERMOHONAN_LOT_TUTUP', hari(env, 20));
  }
  env.advance(120);
  return { env, admin };
}

/** Pelajar siap profiling dan SSU diluluskan (nama perniagaan unik). Pulang token pelajar. */
function ssuLulus(env, admin, email, nama, ahli) {
  const t = profiled(env, email);
  const p = SSU();
  p.nama = nama || 'seni kek aina';
  p.ahli = ahli || [];
  const r = call(env, 'ssu.hantar', t, p);
  assert.equal(r.ok, true, JSON.stringify(r));
  const l = call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' });
  assert.equal(l.ok, true, JSON.stringify(l));
  env.advance(61);
  return t;
}

/** Admin membuka lot (kadar, jenis, dibuka). */
function bukaLot(env, admin, kod, patch) {
  const lot = rows(env, 'Lot').find((l) => l.Kod_Lot === kod);
  const r = call(env, 'rn.admin.lot.simpan', admin, Object.assign({
    kod, nama: lot.Nama_Paparan, lokasi: lot.Lokasi, jenis: 'RETAIL', kadar: '150', saiz: '12', statusBuka: 'Dibuka', alamatSurat: 'Lot 3, Aras 1, Bangunan Persatuan Pelajar, UTM'
  }, patch || {}));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}

const b64 = (txt) => Buffer.from(txt, 'utf8').toString('base64');
const pdfFile = (nama) => ({ nama: nama || 'fail.pdf', data: b64('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n' + (nama || '')) });

/** Muatan permohonan lot yang sah. */
function RN_APP(env, patch) {
  return Object.assign({
    kodLot: 'SM-01', tempohMula: hari(env, 30), tempohTamat: hari(env, 30 + 365), sumber: ['SENDIRI'], pemberi: [], jumlahDana: '5000', jualan: '8000',
    bilPekerja: '3', failCadangan: pdfFile('cadangan.pdf'), sebab: 'Mahu memperluas perniagaan kek ke kampus.', lokasi: 'Bahagian hadapan', perakuan: true
  }, patch || {});
}

/** Aina memohon lot SM-01 (F&B tidak; RETAIL). Pulang {id}. */
function mohon(env, tok, patch) {
  const r = call(env, 'rn.mohon.hantar', tok, RN_APP(env, patch));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data.id;
}

module.exports = { AINA, AMIRUL, WEIJIE, KAVITHA, ADMIN, rows, setRow, hari, rnReady, ssuLulus, bukaLot, RN_APP, mohon, pdfFile, b64 };
