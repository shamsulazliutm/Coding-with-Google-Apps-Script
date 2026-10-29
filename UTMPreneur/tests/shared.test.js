'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ready, call, login } = require('./helpers');

test('Otp: terbit, sahkan, salah, tamat dan had percubaan (tujuan berasingan daripada log masuk)', () => {
  const env = ready();
  const emel = 'aina.contoh@graduate.utm.my';
  const code = () => env.state.sent[env.state.sent.length - 1].htmlBody.match(/: (\d{6})/)[1];
  env.run(`Otp.issue('TERIMA:X1', ${JSON.stringify(emel)}, { subjectBm: 'Sahkan penerimaan', subjectEn: 'Confirm acceptance', bm: ['Kod penerimaan: {kod}'], en: ['Acceptance code: {kod}'] })`);
  const m = env.state.sent[env.state.sent.length - 1];
  assert.match(m.subject, /^\[UJI\] Sahkan penerimaan/);
  assert.ok(!JSON.stringify(env.state.cache).includes(code()), 'kod tidak disimpan sebagai teks biasa');
  assert.throws(() => env.run(`Otp.verify('TERIMA:X1', ${JSON.stringify(emel)}, '000000')`), /OTP_SALAH|Kod tidak betul/);
  assert.throws(() => env.run(`Otp.verify('TERIMA:LAIN', ${JSON.stringify(emel)}, ${JSON.stringify(code())})`), /tamat|OTP_TAMAT/i, 'tujuan lain tidak sah');
  assert.equal(env.run(`Otp.verify('TERIMA:X1', ${JSON.stringify(emel)}, ${JSON.stringify(code())})`), true);
  assert.throws(() => env.run(`Otp.verify('TERIMA:X1', ${JSON.stringify(emel)}, ${JSON.stringify(code())})`), /tamat|OTP_TAMAT/i, 'sekali guna');
  // jeda 60 saat
  assert.throws(() => env.run(`Otp.issue('TERIMA:X1', ${JSON.stringify(emel)}, {})`), /RATE_JEDA|tunggu/i);
  env.advance(61);
  env.run(`Otp.issue('TERIMA:X1', ${JSON.stringify(emel)}, {})`);
  for (let i = 0; i < 5; i++) assert.throws(() => env.run(`Otp.verify('TERIMA:X1', ${JSON.stringify(emel)}, '111111')`));
  assert.throws(() => env.run(`Otp.verify('TERIMA:X1', ${JSON.stringify(emel)}, ${JSON.stringify(code())})`), /OTP_TAMAT|tamat|TERLALU/i, 'terkunci selepas percubaan maksimum');
  // MOD UJI: emel luar senarai ditolak
  assert.throws(() => env.run(`Otp.issue('X', 'orang@gmail.com', {})`), /penguji|UJI_TIADA/i);
});

test('Pdf.dariHtml dan DocTpl.jana: PDF disimpan dalam folder berdaftar, penanda diganti dan dilaporkan', () => {
  const env = ready();
  const r = env.plain(env.run(`Pdf.dariHtml(Pdf.wrap('<h1>Surat Tawaran</h1><p>' + Pdf.esc('A & B <x>') + '</p>', 'Uji'), 'Surat Uji', 'FLD_LAMPIRAN_LOT')`));
  assert.match(r.url, /drive\.google\.com\/file\/d\//);
  const dl = env.plain(env.run(`Files.read(${JSON.stringify(r.url)})`));
  const txt = Buffer.from(dl.data, 'base64').toString('utf8');
  assert.match(txt, /^%PDF/);
  assert.match(txt, /A &amp; B &lt;x&gt;/);

  env.addDocTemplate('TEMPLAT_UJI_DOC', 'Perjanjian [no_rujukan] antara {{PENYEWA}} dan UTM. Harga: [harga]. Lain: [tiada_data] {{TIADA_LAGI}}');
  const g = env.plain(env.run(`DocTpl.jana('TEMPLAT_UJI_DOC', { no_rujukan: 'PLT-1', penyewa: 'ABC $1 Sdn Bhd', harga: 'RM 150.00' }, 'FLD_LAMPIRAN_LOT', 'Perjanjian PLT-1')`));
  const pdf = Buffer.from(env.plain(env.run(`Files.read(${JSON.stringify(g.url)})`)).data, 'base64').toString('utf8');
  assert.match(pdf, /Perjanjian PLT-1 antara ABC \$1 Sdn Bhd dan UTM\. Harga: RM 150\.00\./);
  assert.match(g.amaran[0], /\[tiada_data\]/);
  assert.match(g.amaran[0], /\{\{TIADA_LAGI\}\}/);
  // templat tiada
  assert.throws(() => env.run(`DocTpl.jana('TIADA_TEMPLAT', {}, 'FLD_LAMPIRAN_LOT', 'x')`), /Templat dokumen/);
});

test('Laluan modul lain digabungkan, mesej modul dikenali, Bantu.ctx menyokong kunci modul', () => {
  const env = ready();
  env.run(`var RuangNiaga = { routes: function () { return { 'rn.ping': { auth: false, fn: function () { return 'pong'; } } }; } }; var MSG_RN = { RN_UJI: ['Mesej RN', 'RN message'] };`);
  assert.equal(call(env, 'rn.ping', null).data, 'pong');
  assert.equal(env.plain(env.run(`appError_('RN_UJI').bm`)), 'Mesej RN');
  const admin = login(env, 'utmxcite@utm.my').token;
  call(env, 'admin.tambah', admin, { emel: 'pegawai@utm.my', nama: 'P', peranan: 'Pegawai Modul', modul: 'Makerspace' });
  env.advance(61);
  assert.equal(env.run(`Bantu.allowed({ role: 'Pegawai Modul', email: 'pegawai@utm.my' }, 'makerspace')`), true);
  assert.equal(env.run(`Bantu.allowed({ role: 'Pegawai Modul', email: 'pegawai@utm.my' }, 'ruang niaga')`), false);
  assert.equal(env.run(`Bantu.allowed({ role: 'Pegawai Modul', email: 'pegawai@utm.my' })`), false);
});

test('Titik sambungan KPI: KpiSync digabungkan dalam laluan, kerja harian, Tetapan dan mesej', () => {
  const env = ready();
  env.run(`var KpiSync = { routes: function () { return { 'kpi.ping': { auth: false, fn: function () { return 'ok'; } } }; }, jobHarian: function () { return { x: 1 }; } };
    var TETAPAN_KPI = [['KPI_UJI', 'a', 'ujian']]; var MSG_KPI = { KPI_UJI: ['Mesej KPI', 'KPI message'] };`);
  assert.equal(call(env, 'kpi.ping', null).data, 'ok');
  assert.deepEqual(env.plain(env.run('Jobs.harian()')).kpi, { x: 1 });
  assert.equal(env.plain(env.run(`Seed.tetapan().some(function (t) { return t.Kunci === 'KPI_UJI'; })`)), true);
  assert.equal(env.plain(env.run(`appError_('KPI_UJI').bm`)), 'Mesej KPI');
});
