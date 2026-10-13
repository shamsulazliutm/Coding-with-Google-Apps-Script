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
function hari(env, offset) { return new Date(Date.now() + (offset || 0) * 86400000 + 8 * 3600000).toISOString().slice(0, 10); }

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
function ssuLulus(env, admin, email, nama, ahli, patch) {
  const t = profiled(env, email);
  const p = Object.assign(SSU(), patch || {});
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

/** Kod OTP terakhir yang dihantar kepada emel. */
function otpCode(env, emel) {
  const m = env.sentTo(emel).filter((x) => /\d{6}/.test(x.htmlBody));
  const t = m[m.length - 1].htmlBody.match(/: (\d{6})/);
  return t[1];
}

/** Tetapkan permohonan terus ke status (melangkau penilaian) bagi ujian peringkat lanjut. */
function tetapStatus(env, id, status) { setRow(env, 'Permohonan_Lot', 'ID_Permohonan', id, { Status: status }); }

/** Muatan tawaran yang sah. */
function TAWARAN(env, patch) {
  return Object.assign({
    noRujukan: 'UTM.J.06.11/13.16/11 (12)', tarikhSurat: hari(env, 0), jenisPerniagaan: 'Kek dan pastri', tarikhMula: hari(env, 10), tarikhTamat: hari(env, 10 + 364),
    utiliti: 'Tanggungjawab syarikat (Air & Elektrik)', cagaranSewaan: '150', cagaranUtiliti: '0', waktuOperasi: '12.00 tengahari - 9.00 malam',
    jadual: [{ dari: 1, hingga: 6, kadar: '150' }, { dari: 7, hingga: '', kadar: '250' }]
  }, patch || {});
}

const TPL_PERJANJIAN = [
  'PERJANJIAN PENYEWAAN NO. RUJUKAN [no_rujukan] dibuat pada [tarikh_perjanjian]', 'Surat Setuju Terima bertarikh [tarikh_surat_setuju_terima]',
  '[nama_syarikat] ([no_pendaftaran_syarikat]) beralamat di [alamat_syarikat]', 'Lot: [nama_lot] ([kod_lot]) [alamat_lot]', 'Tempoh: [tempoh_kontrak]',
  'Sewa: [jadual_sewa]. Bayar pada atau sebelum hari ke-[hari_akhir_bayar]', 'Cagaran sewaan [cagaran_sewaan], utiliti [cagaran_utiliti]', 'Waktu operasi [waktu_operasi]',
  'UTM: [penandatangan_utm_nama], [penandatangan_utm_jawatan] di hadapan [saksi_utm_nama], [saksi_utm_jawatan]',
  'Syarikat: [wakil_syarikat_nama] di hadapan [saksi_syarikat_nama], [saksi_syarikat_jawatan]', 'Pekerja ([bil_pekerja]): [senarai_pekerja]', 'Peralatan ([bil_peralatan]): [senarai_peralatan]'
].join('\n');

module.exports = {
  TPL_PERJANJIAN, otpCode, tetapStatus, TAWARAN, AINA, AMIRUL, WEIJIE, KAVITHA, ADMIN, rows, setRow, hari, rnReady, ssuLulus, bukaLot, RN_APP, mohon, pdfFile, b64 };

// ---------- Aliran lanjut (dikongsi ujian fasa 3 ke atas) ----------
/** Aina (ahli: Amirul) dengan permohonan SM-01 Diluluskan. */
function sediaDiluluskan(opts) {
  opts = opts || {};
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01', opts.lot || {});
  const aina = ssuLulus(env, admin, AINA, 'seni kek aina', ['A23UJ0002'], opts.ssu);
  const amirul = profiled(env, AMIRUL);
  const id = mohon(env, aina, opts.lot && opts.lot.jenis === 'FNB' ? { vaksin: 'Ya', kursus: 'Ya' } : {});
  tetapStatus(env, id, 'Diluluskan');
  return { env, admin, aina, amirul, id };
}
function tawaranSiap(c, patch) {
  const r = call(c.env, 'rn.admin.tawaran.simpan', c.admin, Object.assign({ id: c.id }, TAWARAN(c.env, patch)));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}
function hantarTawaran(c, patch) {
  tawaranSiap(c, patch);
  assert.equal(call(c.env, 'rn.admin.tawaran.jana', c.admin, { id: c.id }).ok, true);
  const h = call(c.env, 'rn.admin.tawaran.hantar', c.admin, { id: c.id });
  assert.equal(h.ok, true, JSON.stringify(h));
  return h.data;
}
function jawabTawaran(c, jawapan) {
  c.env.advance(61);
  const o = call(c.env, 'rn.tawaran.otp', c.aina, { id: c.id });
  assert.equal(o.ok, true, JSON.stringify(o));
  const r = call(c.env, 'rn.tawaran.jawab', c.aina, { id: c.id, jawapan, kod: otpCode(c.env, AINA) });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}
/** Sampai status Diterima. */
function diterima(opts) {
  const c = sediaDiluluskan(opts);
  hantarTawaran(c, opts && opts.tawaran);
  jawabTawaran(c, 'terima');
  return c;
}
Object.assign(module.exports, { sediaDiluluskan, tawaranSiap, hantarTawaran, jawabTawaran, diterima });

const cagaran = (env, jenis) => rows(env, 'Cagaran').find((c) => c.Jenis === (jenis || 'Sewaan'));
/** Pemilik memuat naik resit cagaran sewaan. */
function resitCagaran(c, patch) {
  if (!cagaran(c.env)) return { ok: false };
  return call(c.env, 'rn.cagaran.muatnaik', c.aina, Object.assign({ id: cagaran(c.env).ID_Cagaran, noResit: 'RR-2026-001234', tarikhResit: hari(c.env, 0), fail: pdfFile('resit.pdf') }, patch || {}));
}
/** Sewaan aktif dengan tarikh mula/tamat yang ditetapkan. */
function sewaanAktif(mula, tamat, opts) {
  const c = diterima(opts);
  const { env, admin, aina, id } = c;
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_FNB', TPL_PERJANJIAN);
  const rc = resitCagaran(c);
  if (rc.ok) call(env, 'rn.admin.cagaran.sahkan', admin, { id: cagaran(env).ID_Cagaran });
  call(env, 'rn.admin.perjanjian.jana', admin, { id });
  call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') });
  const sh = call(env, 'rn.admin.perjanjian.sahkan', admin, { id, tarikhMula: mula, tarikhTamat: tamat });
  assert.equal(sh.data.aktivasi.aktif, true, JSON.stringify(sh));
  return c;
}
Object.assign(module.exports, { cagaran, resitCagaran, sewaanAktif });
