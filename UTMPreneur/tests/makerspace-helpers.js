'use strict';
/**
 * Pembantu ujian modul Makerspace (tidak mengubah tests/gas-mock.js).
 * Menyediakan persekitaran dengan mesin, ruang, alat dan kadar; fungsi tarikh (hari operasi); pembekuan jam;
 * pembacaan pautan/OTP perakuan daripada emel.
 */
const { ready, call, login, student, setCfg, b64, assert } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const AMIRUL = 'amirul.contoh@graduate.utm.my';
const STAF = 'staf1@utm.my';
const LUAR = 'luar1@gmail.com';
const PENYELIA = 'pegawai@utm.my'; // dalam senarai penguji; domain staf
const PDF = (n) => ({ nama: n || 'dok.pdf', data: b64('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n') });
const PNG = (n) => ({ nama: n || 'gambar.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64') });
const JPG = (n) => ({ nama: n || 'resit.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64') });

/** Kunci tarikh Malaysia bagi masa sebenar. */
const todayKey = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (key, n) => { const p = key.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); };
const dow = (key) => { const p = key.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); return d === 0 ? 7 : d; };
/** Hari operasi ke-n selepas `dari` (Isnin-Jumaat, tolak cuti yang diberi). */
function opDay(n, dari, cuti) {
  let k = dari || todayKey(), c = 0;
  while (c < n) { k = addDays(k, 1); if (dow(k) <= 5 && !(cuti || []).includes(k)) c++; }
  return k;
}
/** Tarikh yang bukan hari operasi (Sabtu) pada masa hadapan. */
function sabtu() { let k = addDays(todayKey(), 7); while (dow(k) !== 6) k = addDays(k, 1); return k; }

/** Bekukan jam dalam persekitaran tiruan kepada tarikh dan masa Malaysia tertentu. */
function bekukan(env, key, hhmm) {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = (hhmm || '09:00').split(':').map(Number);
  const ms = Date.UTC(y, m - 1, d, h - 8, mi, 0);
  const Real = Date;
  class Fake extends Real {
    constructor(...a) { if (a.length === 0) super(Fake.__now); else super(...a); }
    static now() { return Fake.__now; }
  }
  Fake.__now = ms;
  env.ctx.Date = Fake;
}

const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));
const rowsBy = (env, tab, k, v) => rows(env, tab).filter((r) => String(r[k]) === String(v));

/** Persekitaran dengan ruang, mesin, alat dan kadar siap (admin utama log masuk). */
function mkEnv() {
  const env = ready();
  setCfg(env, 'WEBAPP_URL', 'https://example.test/exec');
  const admin = login(env, 'utmxcite@utm.my').token;
  const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  // Kadar disemai dengan tarikh berkuat kuasa hari ini; ujian membekukan jam pada tarikh tetap (Oktober 2026), jadi tetapkan tarikh awal yang tetap.
  env.run(`Db.rows('KADAR').forEach(function (r) { Db.update('KADAR', r._row, { Berkuat_Kuasa: Util.toDate('2026-01-01') }); })`);
  ok(call(env, 'mk.admin.peralatan.lalai', admin));
  ok(call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'LASER1', jenis: 'Laser Cut', noMesin: '1', nama: 'Laser Cutter A', kodKadar: 'LASER_CUT', status: 'Aktif' }));
  ok(call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'TDP1', jenis: '3D Printer', noMesin: '3', nama: 'Prusa MK4', kodKadar: '3D_PRINTER', status: 'Aktif' }));
  const rate = (kod, jp, kadar) => ok(call(env, 'mk.admin.kadar.simpan', admin, { kod, jenisPengguna: jp, kadar: String(kadar) }));
  [['Pelajar', 100], ['Staf', 200], ['Luar', 300]].forEach(([jp, x]) => rate('RUANG_MAKER_LAB', jp, x));
  [['Pelajar', 50], ['Staf', 80], ['Luar', 120]].forEach(([jp, x]) => rate('RUANG_BILIK_MESYUARAT', jp, x));
  [['Pelajar', 0.5], ['Staf', 1], ['Luar', 2]].forEach(([jp, x]) => rate('3D_PRINTER_GRAM', jp, x));
  [['Pelajar', 4], ['Staf', 6], ['Luar', 8]].forEach(([jp, x]) => rate('3D_PRINTER_JAM', jp, x));
  ok(call(env, 'mk.admin.alat.simpan', admin, { kod: 'SOLDER', nama: 'Soldering iron', kategori: 'Elektronik', jumlah: 5, rosak: 1, bolehDipinjam: true }));
  ok(call(env, 'mk.admin.alat.simpan', admin, { kod: 'MULTIMETER', nama: 'Multimeter', kategori: 'Elektronik', jumlah: 2, rosak: 0, bolehDipinjam: true }));
  env.advance(61);
  return { env, admin };
}

const LASER = (o) => Object.assign({
  jenis: 'Laser Cut', kodSumber: 'LASER1', namaProjek: 'Papan nama', jenisBahan: 'Akrilik 3mm', masaDijangkaMin: 45, tarikh: opDay(2), masaMula: '09:00',
  tujuan: 'Projek kursus', emelPenyelia: PENYELIA, perakuan: true
}, o || {});
const TDP = (o) => Object.assign({
  jenis: '3D Printer', kodSumber: 'TDP1', namaProjek: 'Casing PCB', gambar: PNG(), beratG: 40, warna: 'Hitam', masaDijangkaMin: 120, tarikh: opDay(2), masaMula: '10:00',
  tujuan: 'Prototaip', emelPenyelia: PENYELIA, perakuan: true
}, o || {});
const RUANG = (o) => Object.assign({
  jenis: 'Ruang', kodSumber: 'MAKER_LAB', namaProgram: 'Bengkel Keusahawanan', tarikh: opDay(5), bilHari: 1, masaMula: '09:00', masaTamat: '16:00', bilPeserta: 50,
  kaedahBayaran: 'Tunai', peralatan: [{ kod: 'ALAT_FLIP_CHART', kuantiti: 2 }], failKertasKerja: PDF('kertas.pdf'), emelPenyelia: PENYELIA, perakuan: true
}, o || {});
const PINJAM = (o) => Object.assign({
  jenis: 'Pinjaman', item: [{ kod: 'SOLDER', kuantiti: 2 }], tarikh: opDay(1), tarikhPulang: opDay(8), tujuan: 'Projek PSM', emelPenyelia: PENYELIA, perakuan: true
}, o || {});

/** Ambil token perakuan terakhir yang dihantar kepada emel penyelia. */
function tokenPerakuan(env, emel) {
  const msgs = env.sentTo(emel || PENYELIA).filter((m) => /perakuan=/.test(m.htmlBody));
  assert.ok(msgs.length, 'emel perakuan dihantar');
  return msgs[msgs.length - 1].htmlBody.match(/perakuan=([a-f0-9]{64})/)[1];
}
/** Kod OTP terakhir yang dihantar kepada emel (tujuan perakuan). */
function kodOtp(env, emel) {
  const msgs = env.sentTo(emel || PENYELIA).filter((m) => /ialah: \d{6}/.test(m.htmlBody));
  assert.ok(msgs.length, 'OTP dihantar');
  return msgs[msgs.length - 1].htmlBody.match(/ialah: (\d{6})/)[1];
}

/** Penyelia memperakui melalui RPC tanpa sesi. */
function perakui(env, token, tindakan, catatan) {
  env.advance(61);
  let r = call(env, 'mk.perakuan.otp', null, { token });
  assert.equal(r.ok, true, JSON.stringify(r));
  r = call(env, 'mk.perakuan.sahkan', null, { token, kod: kodOtp(env), tindakan: tindakan || 'perakui', catatan: catatan || '' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
}

/** Hantar tempahan pelajar, penyelia memperakui, admin meluluskan. Pulang id. */
function lulusPenuh(env, admin, tokenPelajar, payload) {
  const r = call(env, 'mk.hantar', tokenPelajar, payload);
  assert.equal(r.ok, true, JSON.stringify(r));
  perakui(env, tokenPerakuan(env));
  const l = call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' });
  assert.equal(l.ok, true, JSON.stringify(l));
  return r.data.id;
}

module.exports = {
  ready, call, login, student, setCfg, assert, mkEnv, AINA, AMIRUL, STAF, LUAR, PENYELIA, PDF, PNG, JPG, todayKey, addDays, dow, opDay, sabtu,
  bekukan, rows, rowsBy, LASER, TDP, RUANG, PINJAM, tokenPerakuan, kodOtp, perakui, lulusPenuh
};
