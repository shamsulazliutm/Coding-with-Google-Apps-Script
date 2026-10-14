const assert = require('assert');
const { createBackend } = require('./gas-harness');
const b = createBackend();
let T3, TS2;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('FAIL  ' + n + '\n      ' + e.message); process.exitCode = 1; } };
const call = (m, tok, p) => b.rpc(m, tok, p);
const ok = (m, tok, p) => { const r = call(m, tok, p); assert.ok(r.ok, m + ': ' + r.error); return r.data; };
const bad = (m, tok, p, re) => { const r = call(m, tok, p); assert.ok(!r.ok, m + ' sepatutnya gagal'); if (re) assert.match(r.error, re); return r; };
const lastMail = () => b.outbox[b.outbox.length - 1];
const otpFrom = m => m.htmlBody.match(/letter-spacing:6px[^>]*>(\d{6})</)[1];
function login(email) {
  b.cache['otpwait:' + email] && delete b.cache['otpwait:' + email];
  ok('requestOtp', null, { email }); const code = otpFrom(lastMail());
  return ok('verifyOtp', null, { email, code });
}
const pdf = Buffer.from('%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

console.log('Setup');
t('setupSystem mencipta sheet, 15 lot dan admin pertama', () => {
  b.setupSystem();
  assert.strictEqual(b.readTable_('Lot').length, 15);
  const users = b.readTable_('Pengguna'); assert.strictEqual(users.length, 1);
  assert.strictEqual(users[0].email, 'utmxcite@utm.my'); assert.strictEqual(users[0].peranan, 'Admin');
  ['Pengguna', 'Lot', 'Peniaga', 'Laporan', 'Log', 'Peringatan'].forEach(n => assert.ok(b.sheets[n], n));
});
t('setupSystem boleh dijalankan semula tanpa menduplikasi', () => { b.setupSystem(); assert.strictEqual(b.readTable_('Lot').length, 15); assert.strictEqual(b.readTable_('Pengguna').length, 1); });

console.log('Log masuk OTP');
let adm;
t('e-mel tidak berdaftar: mesej sama, tiada e-mel dihantar', () => {
  const n = b.outbox.length; const r = ok('requestOtp', null, { email: 'orang@luar.com' });
  assert.match(r.message, /Jika e-mel anda berdaftar/); assert.strictEqual(b.outbox.length, n);
});
t('e-mel sah menghantar OTP 6 digit', () => { const n = b.outbox.length; ok('requestOtp', null, { email: 'utmxcite@utm.my' }); assert.strictEqual(b.outbox.length, n + 1); assert.match(otpFrom(lastMail()), /^\d{6}$/); });
t('minta OTP semula serta-merta ditolak (had kadar)', () => bad('requestOtp', null, { email: 'utmxcite@utm.my' }, /seminit/));
t('OTP salah ditolak dan baki percubaan berkurang', () => bad('verifyOtp', null, { email: 'utmxcite@utm.my', code: '000000' }, /Baki percubaan: 4/));
t('terlalu banyak percubaan mengunci OTP', () => {
  const code = otpFrom(lastMail());
  for (let i = 0; i < 4; i++) bad('verifyOtp', null, { email: 'utmxcite@utm.my', code: '111111' });
  bad('verifyOtp', null, { email: 'utmxcite@utm.my', code: '222222' }, /Terlalu banyak/);
  bad('verifyOtp', null, { email: 'utmxcite@utm.my', code }, /tamat tempoh|tidak sah/);
});
t('admin log masuk dengan OTP betul; OTP hanya sekali guna', () => {
  adm = login('utmxcite@utm.my'); assert.strictEqual(adm.user.peranan, 'Admin'); assert.ok(adm.token.length >= 60);
  bad('verifyOtp', null, { email: 'utmxcite@utm.my', code: otpFrom(lastMail()) });
});
t('token palsu / tiada ditolak (SESSION)', () => { assert.strictEqual(bad('me', 'palsu').code, 'SESSION'); assert.strictEqual(bad('me', null).code, 'SESSION'); });
t('kaedah tidak wujud ditolak (termasuk nama prototaip)', () => { bad('nope', adm.token); bad('constructor', adm.token); bad('__proto__', adm.token); });

console.log('Admin: lot dan pengguna');
t('tambah penyewaan: Lot 3 (Jan-Dis 2026) dan SUB 2 (mula Ogos, tanpa tarikh akhir)', () => {
  const r1 = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot3', mula: '2026-01-01', akhir: '2026-12-31', sewa: '600' } });
  const r2 = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot2', mula: '2026-08-01', akhir: '', sewa: '450' } });
  T3 = r1.tenancies.find(x => x.kodLot === 'StudentMall-Lot3').id; TS2 = r2.tenancies.find(x => x.kodLot === 'SUB-Lot2').id;
  assert.strictEqual(T3, 'PS-0001'); assert.strictEqual(TS2, 'PS-0002');
  const row = b.readTable_('Penyewaan').find(x => x.id === T3); assert.strictEqual(row.mula, '2026-01-01'); assert.strictEqual(row.sewa, 600);
});
t('lot baharu: kod dijana dan duplikasi ditolak', () => {
  ok('adminSaveLot', adm.token, { isNew: true, lot: { lokasi: 'Student Mall', noLot: 11, status: 'Aktif' } });
  assert.ok(b.readTable_('Lot').find(x => x.kodLot === 'StudentMall-Lot11'));
  bad('adminSaveLot', adm.token, { isNew: true, lot: { lokasi: 'Student Mall', noLot: 11, status: 'Aktif' } }, /sudah wujud/);
});
t('peraturan penukaran awal bulan: mula mesti hari pertama, akhir mesti hari terakhir bulan', () => {
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot3', mula: '2026-07-15' } }, /hari pertama bulan/);
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot3', mula: '2026-07-01', akhir: '2026-12-15' } }, /hari terakhir bulan/);
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot3', mula: '2026-07-01', akhir: '2026-05-31' } }, /selepas tarikh mula/);
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot3', mula: '' } }, /wajib/);
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'TIADA', mula: '2026-07-01' } }, /lot yang sah/);
  ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot3', mula: '2026-02-01', akhir: '2026-02-28' } });   // Feb bukan lompat: 28 hari sah
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot3', mula: '2026-03-01', akhir: '2026-04-31' } }, /tidak sah|hari terakhir/);
});
t('tambah penyewa (lot sah) dan admin kedua', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'Aina@Graduan.example', nama: 'Aina Sofea', peranan: 'Penyewa', idSewa: T3, status: 'Aktif' } });
  ok('adminSaveUser', adm.token, { user: { email: 'din@graduan.example', nama: 'Din Ismail', peranan: 'Penyewa', idSewa: TS2, status: 'Aktif' } });
  ok('adminSaveUser', adm.token, { user: { email: 'rashid@utm.my', nama: 'En. Rashid', peranan: 'Admin', status: 'Aktif' } });
  assert.strictEqual(b.readTable_('Pengguna').length, 4);
});
t('penyewa tanpa lot sah ditolak; admin tak boleh nyahaktif diri sendiri', () => {
  bad('adminSaveUser', adm.token, { user: { email: 'x@y.com', nama: 'X', peranan: 'Penyewa', idSewa: 'TIADA' } }, /penyewaan yang sah/);
  bad('adminSaveUser', adm.token, { user: { email: 'utmxcite@utm.my', nama: 'A', peranan: 'Admin', status: 'Tidak aktif' } }, /sendiri/);
});

console.log('Penyewa');
let ten;
t('penyewa log masuk (e-mel dinormalisasi huruf kecil)', () => { ten = login('aina@graduan.example'); assert.strictEqual(ten.user.idSewa, T3); });
t('penyewa tidak boleh akses API admin', () => { assert.strictEqual(bad('adminReports', ten.token, {}).code, 'FORBIDDEN'); bad('adminUsers', ten.token, {}); bad('adminReview', ten.token, {}); });
t('maklumat peniaga: No. KP tidak sah ditolak, sah disimpan', () => {
  const biz = { nama: 'Kopi Kampus Enterprise', jenis: 'Makanan dan minuman', ssm: '003412345-K', pelajar: 'aina sofea binti ali', kp: '0102030', matrik: 'a22ea0123', fakulti: 'fka', telefon: '012-345 6789' };
  bad('saveBusiness', ten.token, { biz }, /12 digit/);
  const d = ok('saveBusiness', ten.token, { biz: { ...biz, kp: '010203011234' } });
  assert.strictEqual(d.biz.kp, '010203-01-1234'); assert.strictEqual(d.biz.pelajar, 'AINA SOFEA BINTI ALI'); assert.strictEqual(d.lengkap, true);
  assert.strictEqual(d.lot.mula, '2026-01-01');
  bad('saveBusiness', ten.token, { biz: { ...biz, nama: '', kp: '010203011234' } }, /Nama perniagaan wajib/);
});
t('senarai laporan: Jan-Okt 2026 (10 bulan), semua Belum dihantar', () => {
  const d = ok('myReports', ten.token, {}); assert.strictEqual(d.tahun, 2026); assert.strictEqual(d.rows.length, 10);
  assert.strictEqual(d.rows[0].bulan, 10); assert.strictEqual(d.counts.none, 10); assert.strictEqual(d.perniagaan, 'Kopi Kampus Enterprise');
  assert.strictEqual(d.rows[0].tarikhAkhirLabel, '7 November 2026'); assert.strictEqual(d.rows[1].kesempatanLewat, true);
});
t('bulan di luar tempoh sewa ditolak (Nov 2026 belum tiba, Dis 2025 sebelum mula)', () => {
  bad('saveReport', ten.token, { tahun: 2026, bulan: 11, data: {} }, /tempoh sewa/); bad('getMyReport', ten.token, { tahun: 2025, bulan: 12 }, /tempoh sewa/);
});
t('simpan draf: nilai negatif / bukan nombor ditolak', () => { bad('saveReport', ten.token, { tahun: 2026, bulan: 9, data: { pendapatan: '-5' } }, /tidak sah/); bad('saveReport', ten.token, { tahun: 2026, bulan: 9, data: { pendapatan: 'abc' } }, /tidak sah/); });
t('simpan draf Sep 2026 berjaya, kekal Belum dihantar (draf)', () => {
  const r = ok('saveReport', ten.token, { tahun: 2026, bulan: 9, data: { pendapatan: '8,650.50', perbelanjaan: 9560, sewa: 600, sewaPeralatan: true, akuan: false } });
  assert.strictEqual(r.status, 'none'); assert.strictEqual(r.draf, true); assert.strictEqual(r.pendapatan, 8650.5);
});
t('muat naik: bukan PDF, rosak dan terlalu besar ditolak', () => {
  bad('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: 'laporan', base64: Buffer.from('hello world not pdf').toString('base64') }, /Hanya fail PDF/);
  bad('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: 'laporan', base64: '***' }, /rosak/);
  bad('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: 'laporan', base64: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 + 10)]).toString('base64') }, /10 MB/);
  bad('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: 'x', base64: pdf }, /Jenis fail/);
});
t('hantar sebelum lengkap ditolak dengan senarai kekurangan', () => bad('submitReport', ten.token, { tahun: 2026, bulan: 9 }, /PDF laporan kewangan.*PDF resit bayaran sewa.*PDF resit incubator.*Akuan/));
t('muat naik 3 PDF; fail dinamakan mengikut format dan disimpan dalam folder tahun/bulan/lot', () => {
  ['laporan', 'sewa', 'incubator'].forEach(k => ok('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: k, base64: pdf }));
  const names = Object.values(b.driveFiles).map(f => f.name).sort();
  assert.deepStrictEqual(names, ['StudentMall_Lot3_September_IncubatorReceipt.pdf', 'StudentMall_Lot3_September_Kopi Kampus Enterprise_FinancialReport.pdf', 'StudentMall_Lot3_September_RentReceipt.pdf']);
});
t('fail disimpan dalam folder Drive yang ditetapkan (ID konfigurasi), disusun tahun / bulan / kod lot; tiada folder baharu dicipta di luar', () => {
  const root = b.folders['1n7GPr2AIOQ4qBWJCZxWBID4RvbfKHONE'];
  const lotFolder = root.kids['2026'].kids['09 September'].kids['StudentMall-Lot3'];
  assert.ok(lotFolder, 'folder lot'); assert.strictEqual(Object.keys(root.kids).join(','), '2026');
  assert.strictEqual(Object.values(b.folders).filter(f => f.name === 'Laporan Kewangan Penyewa').length, 0, 'tiada folder automatik');
  assert.ok(!b.props.ROOT_FOLDER_ID, 'tidak menyimpan ID folder automatik');
});
t('ganti fail: fail lama dipadam (trash)', () => {
  const before = Object.values(b.driveFiles).filter(f => f.name.endsWith('RentReceipt.pdf')).length;
  ok('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: 'sewa', base64: pdf });
  const rents = Object.values(b.driveFiles).filter(f => f.name.endsWith('RentReceipt.pdf'));
  assert.strictEqual(rents.length, before + 1); assert.strictEqual(rents.filter(f => !f.trashed).length, 1);
});
t('hantar tanpa akuan ditolak; dengan akuan: Dihantar dan ditanda Lewat (selepas 7 Okt)', () => {
  bad('submitReport', ten.token, { tahun: 2026, bulan: 9 }, /Akuan/);
  ok('saveReport', ten.token, { tahun: 2026, bulan: 9, data: { pendapatan: 8650, perbelanjaan: 9560, sewa: 600, sewaPeralatan: true, akuan: true } });
  const r = ok('submitReport', ten.token, { tahun: 2026, bulan: 9 }); assert.strictEqual(r.status, 'sent'); assert.strictEqual(r.lewat, true);
});
t('jika tiada sewa peralatan, resit incubator tidak diperlukan', () => {
  ok('saveReport', ten.token, { tahun: 2026, bulan: 8, data: { pendapatan: 8100, perbelanjaan: 5240, sewa: 600, sewaPeralatan: false, akuan: true } });
  ['laporan', 'sewa'].forEach(k => ok('uploadFile', ten.token, { tahun: 2026, bulan: 8, kind: k, base64: pdf }));
  const r = ok('submitReport', ten.token, { tahun: 2026, bulan: 8 }); assert.strictEqual(r.status, 'sent'); assert.strictEqual(r.lewat, true);
});
t('Okt 2026 dihantar tepat masa (tarikh akhir 7 Nov)', () => {
  ok('saveReport', ten.token, { tahun: 2026, bulan: 10, data: { pendapatan: 100, perbelanjaan: 50, sewa: 600, sewaPeralatan: false, akuan: true } });
  ['laporan', 'sewa'].forEach(k => ok('uploadFile', ten.token, { tahun: 2026, bulan: 10, kind: k, base64: pdf }));
  assert.strictEqual(ok('submitReport', ten.token, { tahun: 2026, bulan: 10 }).lewat, false);
});

console.log('Admin: semakan');
t('ringkasan admin Sep 2026: 1 lot dihantar, lot lain belum; lot tanpa tarikh mula dikecualikan', () => {
  const d = ok('adminReports', adm.token, { tahun: 2026, bulan: 9 });
  assert.strictEqual(d.lotAktif, 16); assert.strictEqual(d.jumlahLot, 2);   // Lot3 (Jan) dan SUB2 (Ogos)
  assert.strictEqual(d.counts.sent, 1); assert.strictEqual(d.counts.none, 1);
  const row = d.rows.find(r => r.kodLot === 'StudentMall-Lot3'); assert.strictEqual(row.untungRugi, -910); assert.strictEqual(row.perniagaan, 'Kopi Kampus Enterprise');
});
t('admin: bulan = 0 (Semua) menyenaraikan semua bulan dalam tempoh sewa setiap lot', () => {
  const d = ok('adminReports', adm.token, { tahun: 2026, bulan: 0 });
  assert.strictEqual(d.bulan, 0); assert.strictEqual(d.rows.length, 14, 'Lot3 Jan-Okt (10) + SUB2 Ogos-Okt (3) + SUB3 Feb (1)');
  assert.strictEqual(d.jumlahLot, 14); assert.strictEqual(d.tanpaTarikh, 13);
  assert.strictEqual(JSON.stringify(d.rows.map(r => r.bulan).slice(0, 3)), '[10,10,9]', 'bulan terkini dahulu');
  d.rows.forEach(r => { assert.ok(r.untungRugi === null || typeof r.untungRugi === 'number', 'untungRugi mesti null atau nombor'); });
  assert.ok(d.rows.filter(r => r.status === 'none').every(r => r.untungRugi === null));
  assert.strictEqual(ok('adminReports', adm.token, { tahun: 2026 }).bulan, 0, 'tanpa bulan = semua');
  bad('adminReports', adm.token, { tahun: 2026, bulan: 13 }, /Bulan tidak sah/);
  assert.strictEqual(ok('adminReports', adm.token, { tahun: 2025, bulan: 0 }).rows.length, 0);
});
t('butiran laporan admin: No. KP bertopeng', () => { const r = ok('adminReport', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9 }); assert.strictEqual(r.biz.kp, '010203-01-****'); });
t('admin muat turun fail penyewa (PDF sah)', () => {
  const f = ok('getFile', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9, kind: 'laporan' });
  assert.strictEqual(Buffer.from(f.base64, 'base64').slice(0, 4).toString(), '%PDF'); assert.match(f.name, /FinancialReport\.pdf$/);
});
t('minta pembetulan tanpa komen ditolak; dengan komen menghantar e-mel kepada penyewa', () => {
  bad('adminReview', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9, decision: 'fix', komen: '' }, /komen/);
  const n = b.outbox.length;
  const r = ok('adminReview', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9, decision: 'fix', komen: 'Semak sewa dikira dua kali.' });
  assert.strictEqual(r.status, 'fix'); assert.strictEqual(b.outbox.length, n + 1); assert.strictEqual(lastMail().to, 'aina@graduan.example'); assert.match(lastMail().htmlBody, /dua kali/);
});
t('penyewa nampak komen, boleh edit dan hantar semula (lewat kekal)', () => {
  const v = ok('getMyReport', ten.token, { tahun: 2026, bulan: 9 }); assert.strictEqual(v.status, 'fix'); assert.match(v.komen, /dua kali/);
  ok('saveReport', ten.token, { tahun: 2026, bulan: 9, data: { pendapatan: 8650, perbelanjaan: 4560, sewa: 600, sewaPeralatan: true, akuan: true } });
  const r = ok('submitReport', ten.token, { tahun: 2026, bulan: 9 }); assert.strictEqual(r.status, 'sent'); assert.strictEqual(r.lewat, true);
});
t('admin sahkan; penyewa tidak boleh edit, muat naik atau padam laporan disahkan', () => {
  assert.strictEqual(ok('adminReview', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9, decision: 'ok' }).status, 'ok');
  bad('saveReport', ten.token, { tahun: 2026, bulan: 9, data: { pendapatan: 1 } }, /disahkan/);
  bad('uploadFile', ten.token, { tahun: 2026, bulan: 9, kind: 'laporan', base64: pdf }, /disahkan/);
  bad('deleteReport', ten.token, { tahun: 2026, bulan: 9 }, /disahkan/);
  bad('adminReview', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9, decision: 'fix', komen: 'x' }, /sudah disahkan/);
});
t('semakan laporan yang belum dihantar ditolak', () => bad('adminReview', adm.token, { kodLot: 'SUB-Lot2', tahun: 2026, bulan: 9, decision: 'ok' }, /belum dihantar/));
t('penyewa boleh padam draf/hantar (fail ke tong sampah)', () => {
  ok('deleteReport', ten.token, { tahun: 2026, bulan: 10 });
  assert.strictEqual(ok('getMyReport', ten.token, { tahun: 2026, bulan: 10 }).status, 'none');
  assert.ok(Object.values(b.driveFiles).some(f => f.name.includes('October') && f.trashed));
});
t('penyewa tidak boleh muat turun fail lot lain (kodLot dari klien diabaikan)', () => {
  const f = ok('getFile', ten.token, { kodLot: 'SUB-Lot2', tahun: 2026, bulan: 9, kind: 'laporan' });
  assert.match(f.name, /^StudentMall_Lot3_/, 'mesti fail lot sendiri');
  bad('getFile', ten.token, { kodLot: 'SUB-Lot2', tahun: 2026, bulan: 7, kind: 'laporan' }, /tidak dijumpai/);
});
t('peringatan manual untuk lot belum hantar; ditolak jika sudah hantar', () => {
  const r = ok('adminRemind', adm.token, { kodLot: 'SUB-Lot2', tahun: 2026, bulan: 9 }); assert.strictEqual(r.dihantar, 1); assert.strictEqual(lastMail().to, 'din@graduan.example');
  bad('adminRemind', adm.token, { kodLot: 'StudentMall-Lot3', tahun: 2026, bulan: 9 }, /sudah dihantar/);
});
t('eksport CSV: tiada No. KP, dengan BOM, sel formula dilindungi', () => {
  ok('saveBusiness', ten.token, { biz: { nama: '=HYPERLINK("x")', jenis: 'a', ssm: '', pelajar: 'Aina', kp: '010203011234', matrik: 'A1', fakulti: 'FKA', telefon: '0123456789' } });
  const d = ok('adminExport', adm.token, { tahun: 2026, bulan: 9 });
  assert.ok(d.csv.startsWith('﻿')); assert.ok(!/010203/.test(d.csv)); assert.match(d.csv, /"'=HYPERLINK/); assert.strictEqual(d.name, 'Laporan_2026-09.csv');
});


console.log('Lot bertukar penyewa (Syarikat A Jan-Jun, Syarikat B Jul-Dis)');
let tA, tB, uA, uB;
const submitFull = (tok, y, m, extra = {}) => {
  ok('saveReport', tok, { tahun: y, bulan: m, data: { pendapatan: 5000, perbelanjaan: 3000, sewa: 600, sewaPeralatan: false, akuan: true, ...extra } });
  ['laporan', 'sewa'].forEach(k => ok('uploadFile', tok, { tahun: y, bulan: m, kind: k, base64: pdf }));
  return ok('submitReport', tok, { tahun: y, bulan: m });
};
const bizOf = n => ({ nama: n, jenis: 'Perkhidmatan', ssm: '', pelajar: 'Pelajar ' + n, kp: '010203011234', matrik: 'A1', fakulti: 'FKA', telefon: '0123456789' });
t('admin cipta dua penyewaan pada Lot 6: A (Jan-Jun) dan B (Jul-Dis), tiada pertindihan', () => {
  const r = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot6', mula: '2026-01-01', akhir: '2026-06-30', sewa: 500 } });
  tA = r.tenancies.find(x => x.kodLot === 'StudentMall-Lot6').id;
  const r2 = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot6', mula: '2026-07-01', akhir: '2026-12-31', sewa: 700 } });
  tB = r2.tenancies.find(x => x.kodLot === 'StudentMall-Lot6' && x.id !== tA).id;
  assert.notStrictEqual(tA, tB);
});
t('tempoh bertindih pada lot yang sama ditolak', () => {
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot6', mula: '2026-06-01', akhir: '2026-08-31' } }, /bertindih/);
});
t('tarikh mula 2027 selepas B tamat Dis 2026 dibenarkan; tanpa tarikh akhir yang bertindih ditolak', () => {
  ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot6', mula: '2027-01-01', akhir: '2027-03-31' } });
  bad('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot6', mula: '2026-12-01' } }, /bertindih/);
  // buang penyewaan 2027 supaya tidak mengganggu ujian lain
  const id = b.readTable_('Penyewaan').find(x => x.kodLot === 'StudentMall-Lot6' && x.mula === '2027-01-01').id;
  ok('adminDeleteTenancy', adm.token, { id });
});
t('daftar pengguna A (ikut penyewaan A) dan B (ikut penyewaan B)', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'a@syarikat.example', nama: 'Pemilik A', peranan: 'Penyewa', idSewa: tA, status: 'Aktif' } });
  ok('adminSaveUser', adm.token, { user: { email: 'b@syarikat.example', nama: 'Pemilik B', peranan: 'Penyewa', idSewa: tB, status: 'Aktif' } });
  uA = login('a@syarikat.example'); uB = login('b@syarikat.example');
  ok('saveBusiness', uA.token, { biz: bizOf('Syarikat A') }); ok('saveBusiness', uB.token, { biz: bizOf('Syarikat B') });
});
t('A hanya nampak Jan-Jun; B hanya nampak Jul-Okt; masing-masing dengan syarikat dan sewa sendiri', () => {
  const a = ok('myReports', uA.token, {}), bb = ok('myReports', uB.token, {});
  assert.strictEqual(a.rows.length, 6); assert.strictEqual(JSON.stringify(a.rows.map(r => r.bulan)), '[6,5,4,3,2,1]'); assert.strictEqual(a.perniagaan, 'Syarikat A'); assert.strictEqual(a.lot.sewa, 500);
  assert.strictEqual(bb.rows.length, 4); assert.strictEqual(JSON.stringify(bb.rows.map(r => r.bulan)), '[10,9,8,7]'); assert.strictEqual(bb.perniagaan, 'Syarikat B'); assert.strictEqual(bb.lot.sewa, 700);
  assert.strictEqual(bb.counts.none, 4, 'B tidak dikenakan Jan-Jun');
});
t('A tidak boleh menyimpan/melihat bulan Julai; B tidak boleh menyentuh bulan Jun', () => {
  bad('saveReport', uA.token, { tahun: 2026, bulan: 7, data: {} }, /tempoh sewa/); bad('getMyReport', uB.token, { tahun: 2026, bulan: 6 }, /tempoh sewa/);
  bad('uploadFile', uB.token, { tahun: 2026, bulan: 6, kind: 'laporan', base64: pdf }, /tempoh sewa/);
});
t('laporan A (Jun) dan B (Jul) disimpan dengan ID penyewaan masing-masing', () => {
  submitFull(uA.token, 2026, 6); submitFull(uB.token, 2026, 7);
  const rows = b.readTable_('Laporan');
  assert.strictEqual(rows.find(r => r.id === 'StudentMall-Lot6_2026-06').idSewa, tA);
  assert.strictEqual(rows.find(r => r.id === 'StudentMall-Lot6_2026-07').idSewa, tB);
});
t('dashboard admin: baris lot yang sama menunjukkan syarikat berbeza mengikut bulan', () => {
  const d = ok('adminReports', adm.token, { tahun: 2026, bulan: 0 });
  const rows = d.rows.filter(r => r.kodLot === 'StudentMall-Lot6');
  assert.strictEqual(rows.length, 10, 'Jan-Jun (A) + Jul-Okt (B)');
  rows.forEach(r => assert.strictEqual(r.perniagaan, r.bulan <= 6 ? 'Syarikat A' : 'Syarikat B', 'bulan ' + r.bulan));
  rows.forEach(r => assert.strictEqual(r.idSewa, r.bulan <= 6 ? tA : tB));
  assert.strictEqual(ok('adminReports', adm.token, { tahun: 2026, bulan: 6 }).rows.find(r => r.kodLot === 'StudentMall-Lot6').perniagaan, 'Syarikat A');
  assert.strictEqual(ok('adminReports', adm.token, { tahun: 2026, bulan: 7 }).rows.find(r => r.kodLot === 'StudentMall-Lot6').perniagaan, 'Syarikat B');
});
t('butiran semakan admin ikut penyewa pada bulan itu; e-mel keputusan hanya kepada penyewa yang betul', () => {
  assert.strictEqual(ok('adminReport', adm.token, { kodLot: 'StudentMall-Lot6', tahun: 2026, bulan: 6 }).biz.nama, 'Syarikat A');
  assert.strictEqual(ok('adminReport', adm.token, { kodLot: 'StudentMall-Lot6', tahun: 2026, bulan: 7 }).biz.nama, 'Syarikat B');
  ok('adminReview', adm.token, { kodLot: 'StudentMall-Lot6', tahun: 2026, bulan: 6, decision: 'fix', komen: 'Semak semula' });
  assert.strictEqual(lastMail().to, 'a@syarikat.example');
  ok('adminReview', adm.token, { kodLot: 'StudentMall-Lot6', tahun: 2026, bulan: 7, decision: 'ok' });
  assert.strictEqual(lastMail().to, 'b@syarikat.example');
});
t('peringatan untuk Sep (lot 6) hanya kepada B', () => {
  const n = b.outbox.length; const r = ok('adminRemind', adm.token, { kodLot: 'StudentMall-Lot6', tahun: 2026, bulan: 9 });
  assert.strictEqual(r.dihantar, 1); assert.strictEqual(b.outbox.length, n + 1); assert.strictEqual(lastMail().to, 'b@syarikat.example');
});
t('B tidak boleh memuat turun fail A (bulan Jun) walaupun lot sama', () => {
  bad('getFile', uB.token, { tahun: 2026, bulan: 6, kind: 'laporan' }, /tidak dijumpai/);
  assert.match(ok('getFile', uA.token, { tahun: 2026, bulan: 6, kind: 'laporan' }).name, /_June_Syarikat A_FinancialReport\.pdf$/);
  assert.match(ok('getFile', uB.token, { tahun: 2026, bulan: 7, kind: 'laporan' }).name, /_July_Syarikat B_FinancialReport\.pdf$/);
});
t('mengubah tempoh sehingga mengecualikan laporan sedia ada ditolak; padam penyewaan yang ada laporan/pengguna ditolak', () => {
  bad('adminSaveTenancy', adm.token, { tenancy: { id: tA, kodLot: 'StudentMall-Lot6', mula: '2026-01-01', akhir: '2026-05-31' } }, /mengecualikan laporan/);
  bad('adminDeleteTenancy', adm.token, { id: tA }, /sudah ada laporan/);
  const empty = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot5', mula: '2027-01-01' } }).tenancies.find(x => x.kodLot === 'SUB-Lot5').id;
  ok('adminSaveUser', adm.token, { user: { email: 'tmp@x.example', nama: 'Tmp', peranan: 'Penyewa', idSewa: empty, status: 'Aktif' } });
  bad('adminDeleteTenancy', adm.token, { id: empty }, /pengguna dipautkan/);
  ok('adminSaveUser', adm.token, { user: { email: 'tmp@x.example', nama: 'Tmp', peranan: 'Penyewa', idSewa: tB, status: 'Tidak aktif' } });
  ok('adminDeleteTenancy', adm.token, { id: empty });
});
t('A boleh dinyahaktifkan tanpa menjejaskan B atau laporan lama', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'a@syarikat.example', nama: 'Pemilik A', peranan: 'Penyewa', idSewa: tA, status: 'Tidak aktif' } });
  assert.strictEqual(bad('myReports', uA.token, {}).code, 'SESSION');
  assert.strictEqual(ok('myReports', uB.token, {}).perniagaan, 'Syarikat B');
  assert.ok(b.readTable_('Laporan').find(r => r.id === 'StudentMall-Lot6_2026-06'));
});

console.log('Naik taraf daripada struktur lama (tarikh sewa pada sheet Lot)');
t('setupSystem menukar data lama kepada penyewaan: lot, peniaga, pengguna dan laporan dipautkan', () => {
  const o = createBackend(); o.setupSystem();
  // simulasi sheet versi lama: tarikh sewa dalam lajur 5-7 pada sheet Lot, peniaga/pengguna ikut kod lot
  const lotRow = o.sheets['Lot'].data.find(r => r[0] === 'StudentMall-Lot3');
  lotRow[4] = '2026-01-01'; lotRow[5] = '2026-12-31'; lotRow[6] = 600;
  const lot2 = o.sheets['Lot'].data.find(r => r[0] === 'SUB-Lot1'); lot2[4] = '2026-03-01'; lot2[5] = ''; lot2[6] = '';
  o.sheets['Peniaga'].data.push(['StudentMall-Lot3', 'Kopi Lama', 'F&B', '', 'AINA', '010203-01-1234', 'A1', 'FKA', '0123456789', '']);
  o.sheets['Pengguna'].data.push(['aina@graduan.example', 'Aina', 'Penyewa', 'StudentMall-Lot3', 'Aktif']);
  const rep = new Array(19).fill(''); rep[0] = 'StudentMall-Lot3_2026-02'; rep[1] = 'StudentMall-Lot3'; rep[2] = 2026; rep[3] = 2; rep[11] = 'Disahkan';
  o.sheets['Laporan'].data.push(rep);
  assert.strictEqual(o.readTable_('Penyewaan').length, 0);
  o.setupSystem();
  const tns = o.readTable_('Penyewaan'); assert.strictEqual(tns.length, 2);
  const t3 = tns.find(x => x.kodLot === 'StudentMall-Lot3'); assert.strictEqual(t3.mula, '2026-01-01'); assert.strictEqual(t3.akhir, '2026-12-31'); assert.strictEqual(t3.sewa, 600);
  assert.strictEqual(tns.find(x => x.kodLot === 'SUB-Lot1').akhir, '');
  assert.strictEqual(o.readTable_('Peniaga')[0].idSewa, t3.id); assert.strictEqual(o.readTable_('Pengguna').find(u => u.email === 'aina@graduan.example').idSewa, t3.id);
  assert.strictEqual(o.readTable_('Laporan')[0].idSewa, t3.id);
  assert.strictEqual(o.sheets['Lot'].data.find(r => r[0] === 'StudentMall-Lot3')[4], undefined, 'lajur lama dikosongkan');
  o.setupSystem(); assert.strictEqual(o.readTable_('Penyewaan').length, 2, 'selamat dijalankan semula');
  // pengguna lama boleh log masuk dan melihat bulan sendiri
  o.cache['otpwait:aina@graduan.example'] && delete o.cache['otpwait:aina@graduan.example'];
  o.rpc('requestOtp', null, { email: 'aina@graduan.example' }); const code = o.outbox[o.outbox.length - 1].htmlBody.match(/letter-spacing:6px[^>]*>(\d{6})</)[1];
  const tok = o.rpc('verifyOtp', null, { email: 'aina@graduan.example', code }).data.token;
  const mr = o.rpc('myReports', tok, {}).data; assert.strictEqual(mr.rows.length, 10); assert.strictEqual(mr.perniagaan, 'Kopi Lama');
  assert.strictEqual(mr.rows.find(r => r.bulan === 2).status, 'ok');
});

console.log('Format tarikh');
t('lajur tarikh disimpan sebagai tarikh sebenar (bukan teks) dan dibaca semula sebagai teks piawai', () => {
  const tnRow = b.sheets['Penyewaan'].data.find(r => r[0] === T3);
  assert.ok(tnRow[2] instanceof Date, 'mula mesti Date'); assert.ok(tnRow[3] instanceof Date, 'akhir mesti Date');
  assert.strictEqual(b.readTable_('Penyewaan').find(x => x.id === T3).mula, '2026-01-01');
  const rep = b.sheets['Laporan'].data.find(r => String(r[0]).startsWith('StudentMall-Lot3_2026-09'));
  assert.ok(rep[16] instanceof Date, 'tarikh hantar mesti Date');
  assert.match(b.readTable_('Laporan').find(r => r.id === 'StudentMall-Lot3_2026-09').tarikhHantar, /^2026-10-14 09:30:00$/);
});
t('tarikh yang ditaip admin sebagai Date dalam sheet dibaca betul', () => {
  const r = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'SUB-Lot4', mula: '2026-03-01' } });
  const id = r.tenancies.find(x => x.kodLot === 'SUB-Lot4').id;
  const row = b.sheets['Penyewaan'].data.find(x => x[0] === id); row[2] = new b.ctx.Date(Date.UTC(2026, 5, 14, 16));   // 15 Jun 2026 00:00 MYT
  assert.strictEqual(b.readTable_('Penyewaan').find(x => x.id === id).mula, '2026-06-15');
  row[2] = new b.ctx.Date(Date.UTC(2026, 2, 1) - 8 * 3600e3);
});

t('folder simpanan tidak boleh diakses: mesej jelas, tiada folder lain dicipta secara diam-diam, ralat direkod', () => {
  const o = createBackend({ configuredFolder: false });
  assert.throws(() => o.setupSystem(), /Folder simpanan Drive tidak dapat diakses/);
  assert.strictEqual(Object.values(o.folders).length, 0, 'tiada folder dicipta');
  assert.ok(o.readTable_('Log').some(l => l.tindakan === 'Ralat folder simpanan'));
});
console.log('Ralat dan diagnostik');
t('jika e-mel OTP gagal dihantar: mesej jelas, OTP dibatalkan, ralat direkod dalam Log', () => {
  b.ctxFlags.failMail = true; delete b.cache['otpwait:rashid@utm.my'];
  bad('requestOtp', null, { email: 'rashid@utm.my' }, /tidak dapat dihantar/);
  assert.ok(!b.cache['otp:rashid@utm.my']);
  assert.ok(b.readTable_('Log').some(l => l.tindakan === 'Ralat e-mel OTP' && /MailApp/.test(l.butiran)));
  b.ctxFlags.failMail = false;
});
t('ralat tidak dijangka: mesej ada kod rujukan dan butiran dalam Log', () => {
  const orig = b.sheets['Pengguna'].getLastRow; b.sheets['Pengguna'].getLastRow = () => { throw new Error('Simulasi ralat Sheets'); };
  const r = bad('requestOtp', null, { email: 'x@y.com' }, /rujukan [A-F0-9]{6}/); b.sheets['Pengguna'].getLastRow = orig;
  assert.ok(b.readTable_('Log').some(l => /^Ralat sistem [A-F0-9]{6}$/.test(l.tindakan) && /Simulasi ralat Sheets/.test(l.butiran)));
});
t('checkSystem melaporkan semua langkah OK', () => { const m = b.checkSystem(); assert.ok(!/GAGAL/.test(m), m); assert.match(m, /Kebenaran e-mel/); });

console.log('Peringatan automatik & keselamatan');
t('ayat e-mel peringatan mengikut teks yang diluluskan (tajuk, salam, tarikh akhir, pautan, penutup, tandatangan)', () => {
  const m = b.outbox.filter(x => x.to === 'din@graduan.example' && /Peringatan/.test(x.subject)).pop(), h = m.htmlBody;
  assert.strictEqual(m.subject, 'Peringatan Penghantaran Laporan Kewangan: September 2026');
  ['PERINGATAN PENGHANTARAN LAPORAN KEWANGAN', 'Assalamualaikum dan salam sejahtera.',
   'Dimaklumkan bahawa laporan kewangan bagi bulan <b>September 2026</b> untuk <b>SUB-Lot2</b> masih belum diterima.',
   'Sehubungan itu, mohon kerjasama pihak tuan/puan untuk mengemukakan laporan tersebut selewat-lewatnya pada',
   'Laporan yang diterima selepas tarikh berkenaan akan direkodkan sebagai penghantaran lewat.',
   'Buka Sistem', 'Terima kasih atas perhatian dan kerjasama yang diberikan.', '<b>UTMXCITE</b>', 'utmxcite@utm.my', '013-7630079']
    .forEach(x => assert.ok(h.includes(x), 'tiada dalam e-mel: ' + x));
  assert.ok(h.includes('href="https://script.google.com/macros/s/TEST/exec"'), 'pautan sistem'); assert.ok(!/<hr/.test(h), 'tiada pengaki berganda');
});
t('tarikh akhir dalam e-mel peringatan = tarikh e-mel dihantar + 7 hari (bukan hari ke-7 bulan berikutnya)', () => {
  const rows = b.readTable_('Peringatan').filter(r => r.kunci.startsWith('SUB-Lot2|2026-09|'));
  assert.ok(rows.length >= 1); assert.strictEqual(rows[rows.length - 1].akhir, '2026-10-21', 'hantar 14 Okt -> akhir 21 Okt');
  const mail = b.outbox.filter(m => m.to === 'din@graduan.example' && /Peringatan/.test(m.subject)).pop();
  assert.match(mail.htmlBody, /selewat-lewatnya pada <b>21 Oktober 2026<\/b>/); assert.ok(!/7 Oktober 2026/.test(mail.htmlBody));
});
t('tarikh akhir peringatan berkuat kuasa: paparan penyewa dan penentuan lewat', () => {
  const din = login('din@graduan.example');
  const row = ok('myReports', din.token, {}).rows.find(r => r.bulan === 9);
  assert.strictEqual(row.tarikhAkhir, '2026-10-21'); assert.strictEqual(row.tarikhAkhirLabel, '21 Oktober 2026'); assert.strictEqual(row.kesempatanLewat, false, 'masih dalam tempoh peringatan');
  assert.strictEqual(ok('adminReports', adm.token, { tahun: 2026, bulan: 9 }).rows.find(r => r.kodLot === 'SUB-Lot2').tarikhAkhir, '2026-10-21');
  assert.strictEqual(submitFull(din.token, 2026, 9).lewat, false, 'dihantar 14 Okt sebelum 21 Okt: tidak lewat');
});
t('peringatan yang dihantar sebelum hari ke-7 tidak memendekkan tarikh akhir asal', () => {
  ok('adminRemind', adm.token, { kodLot: 'SUB-Lot2', tahun: 2026, bulan: 10 });   // 14 Okt + 7 = 21 Okt, tetapi asal 7 Nov
  const din = login('din@graduan.example');
  assert.strictEqual(ok('myReports', din.token, {}).rows.find(r => r.bulan === 10).tarikhAkhir, '2026-11-07');
});
t('tarikh akhir merentasi hujung bulan dan tahun dikira betul', () => {
  const f = b.ctx.addDays_;
  assert.strictEqual(f('2026-10-14', 7), '2026-10-21'); assert.strictEqual(f('2026-10-28', 7), '2026-11-04'); assert.strictEqual(f('2026-12-28', 7), '2027-01-04');
  assert.strictEqual(f('2028-02-25', 7), '2028-03-03', 'tahun lompat'); assert.strictEqual(f('2027-02-25', 7), '2027-03-04');
  assert.strictEqual(b.ctx.dateLabelMs_('2027-01-04'), '4 Januari 2027');
});
t('dailyReminderJob hanya bertindak pada 5hb', () => { assert.match(b.dailyReminderJob(), /Bukan hari peringatan/); });
t('5hb: lot belum hantar diingatkan sekali sahaja (tiada duplikasi)', () => {
  b.setNow(Date.parse('2026-11-05T01:00:00Z'));   // 5 Nov: bulan laporan = Oktober
  const n = b.outbox.length; const r1 = b.dailyReminderJob(); const n1 = b.outbox.length; const r2 = b.dailyReminderJob();
  assert.ok(n1 > n, r1); assert.strictEqual(b.outbox.length, n1, 'tidak boleh hantar dua kali: ' + r2);
  assert.ok(b.readTable_('Peringatan').length >= 1);
  const autoRows = b.readTable_('Peringatan').filter(r => r.kunci.includes('|2026-10|2026-11-05|'));
  assert.ok(autoRows.length >= 1); autoRows.forEach(r => assert.strictEqual(r.akhir, '2026-11-12', '5 Nov + 7 hari'));
  assert.match(b.outbox[b.outbox.length - 1].htmlBody, /12 November 2026/);
  b.setNow(Date.parse('2026-10-14T01:30:00Z'));
});
t('pengguna dinyahaktifkan: sesi sedia ada ditolak serta-merta', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'aina@graduan.example', nama: 'Aina Sofea', peranan: 'Penyewa', idSewa: T3, status: 'Tidak aktif' } });
  assert.strictEqual(bad('myReports', ten.token, {}).code, 'SESSION');
  delete b.cache['otpwait:aina@graduan.example']; const n = b.outbox.length; ok('requestOtp', null, { email: 'aina@graduan.example' }); assert.strictEqual(b.outbox.length, n, 'tiada OTP untuk akaun tidak aktif');
});
t('admin terakhir tidak boleh diturunkan', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'rashid@utm.my', nama: 'En. Rashid', peranan: 'Penyewa', idSewa: TS2, status: 'Aktif' } });
  bad('adminSaveUser', adm.token, { user: { email: 'utmxcite@utm.my', nama: 'A', peranan: 'Penyewa', idSewa: TS2, status: 'Aktif' } }, /sendiri/);
});
t('logout membatalkan sesi', () => { ok('logout', adm.token, {}); assert.strictEqual(bad('me', adm.token).code, 'SESSION'); });
t('log audit direkod', () => { const log = b.readTable_('Log'); assert.ok(log.length > 20); assert.ok(log.some(l => l.tindakan === 'Sahkan laporan')); });
console.log('\n' + pass + ' ujian lulus' + (process.exitCode ? ', ADA YANG GAGAL' : ''));
