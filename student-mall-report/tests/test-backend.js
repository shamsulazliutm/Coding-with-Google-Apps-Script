const assert = require('assert');
const { createBackend } = require('./gas-harness');
const b = createBackend();
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
t('tetapkan lot Student Mall 3 dan SUB 2', () => {
  ok('adminSaveLot', adm.token, { lot: { lokasi: 'Student Mall', noLot: 3, mula: '2026-01-01', akhir: '2026-12-31', sewa: '600', status: 'Aktif' } });
  ok('adminSaveLot', adm.token, { lot: { lokasi: 'SUB', noLot: 2, mula: '2026-08-01', akhir: '', sewa: '450', status: 'Aktif' } });
  const l = b.readTable_('Lot').find(x => x.kodLot === 'StudentMall-Lot3'); assert.strictEqual(l.mula, '2026-01-01'); assert.strictEqual(l.sewa, 600);
});
t('lot baharu: kod dijana dan duplikasi ditolak', () => {
  ok('adminSaveLot', adm.token, { isNew: true, lot: { lokasi: 'Student Mall', noLot: 11, status: 'Aktif' } });
  assert.ok(b.readTable_('Lot').find(x => x.kodLot === 'StudentMall-Lot11'));
  bad('adminSaveLot', adm.token, { isNew: true, lot: { lokasi: 'Student Mall', noLot: 11, status: 'Aktif' } }, /sudah wujud/);
});
t('tarikh akhir sebelum tarikh mula ditolak', () => bad('adminSaveLot', adm.token, { lot: { lokasi: 'SUB', noLot: 2, mula: '2026-08-01', akhir: '2026-01-01' } }, /selepas tarikh mula/));
t('tambah penyewa (lot sah) dan admin kedua', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'Aina@Graduan.example', nama: 'Aina Sofea', peranan: 'Penyewa', kodLot: 'StudentMall-Lot3', status: 'Aktif' } });
  ok('adminSaveUser', adm.token, { user: { email: 'din@graduan.example', nama: 'Din Ismail', peranan: 'Penyewa', kodLot: 'SUB-Lot2', status: 'Aktif' } });
  ok('adminSaveUser', adm.token, { user: { email: 'rashid@utm.my', nama: 'En. Rashid', peranan: 'Admin', status: 'Aktif' } });
  assert.strictEqual(b.readTable_('Pengguna').length, 4);
});
t('penyewa tanpa lot sah ditolak; admin tak boleh nyahaktif diri sendiri', () => {
  bad('adminSaveUser', adm.token, { user: { email: 'x@y.com', nama: 'X', peranan: 'Penyewa', kodLot: 'TIADA' } }, /lot yang sah/);
  bad('adminSaveUser', adm.token, { user: { email: 'utmxcite@utm.my', nama: 'A', peranan: 'Admin', status: 'Tidak aktif' } }, /sendiri/);
});

console.log('Penyewa');
let ten;
t('penyewa log masuk (e-mel dinormalisasi huruf kecil)', () => { ten = login('aina@graduan.example'); assert.strictEqual(ten.user.kodLot, 'StudentMall-Lot3'); });
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

console.log('Format tarikh');
t('lajur tarikh disimpan sebagai tarikh sebenar (bukan teks) dan dibaca semula sebagai teks piawai', () => {
  const lotRow = b.sheets['Lot'].data.find(r => r[0] === 'StudentMall-Lot3');
  assert.ok(lotRow[4] instanceof Date, 'mula mesti Date'); assert.ok(lotRow[5] instanceof Date, 'akhir mesti Date');
  assert.strictEqual(b.readTable_('Lot').find(l => l.kodLot === 'StudentMall-Lot3').mula, '2026-01-01');
  const rep = b.sheets['Laporan'].data.find(r => String(r[0]).startsWith('StudentMall-Lot3_2026-09'));
  assert.ok(rep[16] instanceof Date, 'tarikh hantar mesti Date');
  assert.match(b.readTable_('Laporan').find(r => r.id === 'StudentMall-Lot3_2026-09').tarikhHantar, /^2026-10-14 09:30:00$/);
});
t('migrasi: teks lama dalam lajur tarikh ditukar kepada tarikh sebenar semasa setup', () => {
  const row = b.sheets['Lot'].data.find(r => r[0] === 'SUB-Lot5'); row[4] = '2026-03-01'; row[5] = '2026-12-31';
  b.setupSystem();
  assert.ok(row[4] instanceof Date && row[5] instanceof Date);
  assert.strictEqual(b.readTable_('Lot').find(l => l.kodLot === 'SUB-Lot5').mula, '2026-03-01');
});
t('tarikh yang ditaip admin sebagai Date dalam sheet dibaca betul', () => {
  const row = b.sheets['Lot'].data.find(r => r[0] === 'SUB-Lot4'); row[4] = new Date(Date.UTC(2026, 5, 14, 16));   // 15 Jun 2026 00:00 MYT
  assert.strictEqual(b.readTable_('Lot').find(l => l.kodLot === 'SUB-Lot4').mula, '2026-06-15');
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
t('dailyReminderJob hanya bertindak pada 5hb', () => { assert.match(b.dailyReminderJob(), /Bukan hari peringatan/); });
t('5hb: lot belum hantar diingatkan sekali sahaja (tiada duplikasi)', () => {
  b.setNow(Date.parse('2026-11-05T01:00:00Z'));   // 5 Nov: bulan laporan = Oktober
  const n = b.outbox.length; const r1 = b.dailyReminderJob(); const n1 = b.outbox.length; const r2 = b.dailyReminderJob();
  assert.ok(n1 > n, r1); assert.strictEqual(b.outbox.length, n1, 'tidak boleh hantar dua kali: ' + r2);
  assert.ok(b.readTable_('Peringatan').length >= 1);
  b.setNow(Date.parse('2026-10-14T01:30:00Z'));
});
t('pengguna dinyahaktifkan: sesi sedia ada ditolak serta-merta', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'aina@graduan.example', nama: 'Aina Sofea', peranan: 'Penyewa', kodLot: 'StudentMall-Lot3', status: 'Tidak aktif' } });
  assert.strictEqual(bad('myReports', ten.token, {}).code, 'SESSION');
  delete b.cache['otpwait:aina@graduan.example']; const n = b.outbox.length; ok('requestOtp', null, { email: 'aina@graduan.example' }); assert.strictEqual(b.outbox.length, n, 'tiada OTP untuk akaun tidak aktif');
});
t('admin terakhir tidak boleh diturunkan', () => {
  ok('adminSaveUser', adm.token, { user: { email: 'rashid@utm.my', nama: 'En. Rashid', peranan: 'Penyewa', kodLot: 'SUB-Lot2', status: 'Aktif' } });
  bad('adminSaveUser', adm.token, { user: { email: 'utmxcite@utm.my', nama: 'A', peranan: 'Penyewa', kodLot: 'SUB-Lot2', status: 'Aktif' } }, /sendiri/);
});
t('logout membatalkan sesi', () => { ok('logout', adm.token, {}); assert.strictEqual(bad('me', adm.token).code, 'SESSION'); });
t('log audit direkod', () => { const log = b.readTable_('Log'); assert.ok(log.length > 20); assert.ok(log.some(l => l.tindakan === 'Sahkan laporan')); });
console.log('\n' + pass + ' ujian lulus' + (process.exitCode ? ', ADA YANG GAGAL' : ''));
