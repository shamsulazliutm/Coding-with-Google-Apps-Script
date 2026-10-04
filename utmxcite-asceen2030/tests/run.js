const assert = require('assert');
const deepEq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const { loadGas } = require('./mock');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
}
const ok = (r) => { assert.ok(r.ok, 'Dijangka ok, dapat: ' + JSON.stringify(r)); return r.data; };
const fail = (r, re) => { assert.strictEqual(r.ok, false, 'Dijangka gagal'); if (re) assert.match(r.error, re); return r; };

// Tetapkan "hari ini" kepada 15 Mei 2026 (Q2 2026).
const env = loadGas({ now: Date.UTC(2026, 4, 15, 4, 0, 0) });
const g = env.g;
const lastCode = () => /OTP anda ialah: (\d{6})/.exec(env.sent[env.sent.length - 1].body)[1];

function login(email) {
  ok(g.api_requestOtp(email));
  const d = ok(g.api_verifyOtp(email, lastCode()));
  return d.token;
}

console.log('Persediaan');
test('setup() mencipta semua tab dan data awal', () => {
  const r = g.setup();
  const ss = env.spreadsheets[r.id];
  const names = ss.sheets.map(s => s.name);
  ['Pengguna', 'Sasaran', 'Fakulti', 'Risiko', 'Log_Audit', 'KAI1_Launchpad', 'KAI2_Makerspace', 'KAI3_Ruang_Perniagaan', 'KAI4_GiGA', 'KAI5_FSIP', 'KAI6_AI_Startup', 'DKAI1_Pelan']
    .forEach(n => assert.ok(names.includes(n), 'tab tiada: ' + n));
  assert.ok(!names.includes('Sheet1'));
  assert.strictEqual(ss.getSheetByName('Pengguna').getRange(2, 1).getValue(), 'admin@utm.my');
  assert.strictEqual(ss.getSheetByName('KAI2_Makerspace').getLastRow(), 5); // 4 milestone
  assert.strictEqual(ss.getSheetByName('DKAI1_Pelan').getLastRow(), 3);
  assert.ok(ss.getSheetByName('Sasaran').getLastRow() > 20);
});
test('setup() boleh dijalankan semula tanpa menduplikasi data', () => {
  const before = env.spreadsheets[env.props.SHEET_ID].getSheetByName('Sasaran').getLastRow();
  g.setup();
  const ss = env.spreadsheets[env.props.SHEET_ID];
  assert.strictEqual(ss.getSheetByName('Sasaran').getLastRow(), before);
  assert.strictEqual(ss.getSheetByName('Pengguna').getLastRow(), 2);
  assert.strictEqual(ss.getSheetByName('KAI2_Makerspace').getLastRow(), 5);
});

console.log('Log masuk OTP');
let adminToken;
test('e-mel tidak berdaftar: mesej sama dan tiada e-mel dihantar', () => {
  const n = env.sent.length;
  const r = ok(g.api_requestOtp('orang.luar@gmail.com'));
  assert.match(r.message, /Jika e-mel itu berdaftar/);
  assert.strictEqual(env.sent.length, n);
});
test('e-mel tidak sah ditolak', () => { fail(g.api_requestOtp('bukan-emel'), /tidak sah/); });
test('OTP salah ditolak dan dihadkan percubaan', () => {
  ok(g.api_requestOtp('admin@utm.my'));
  const real = lastCode();
  const wrong = real === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) fail(g.api_verifyOtp('admin@utm.my', wrong), /tidak sah|Terlalu banyak/);
  fail(g.api_verifyOtp('admin@utm.my', real), /tidak sah|tamat/); // sudah dikunci selepas 5 percubaan
});
test('OTP betul memberi token dan hanya sekali guna', () => {
  ok(g.api_requestOtp('admin@utm.my'));
  const code = lastCode();
  const d = ok(g.api_verifyOtp('admin@utm.my', code));
  adminToken = d.token;
  assert.strictEqual(d.user.peranan, 'Admin');
  assert.ok(d.token.length >= 48);
  fail(g.api_verifyOtp('admin@utm.my', code), /tidak sah|tamat/);
});
test('had permintaan OTP setiap jam', () => {
  const e2 = loadGas();
  e2.g.setup();
  let last;
  for (let i = 0; i < 6; i++) last = e2.g.api_requestOtp('admin@utm.my');
  assert.strictEqual(last.ok, false);
  assert.match(last.error, /Terlalu banyak/);
});
test('token palsu / tiada ditolak sebagai ralat pengesahan', () => {
  const r = g.api_session('palsu');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.auth, true);
  assert.strictEqual(g.api_list('', 'KAI1', {}).auth, true);
});
test('log keluar membatalkan token', () => {
  const t = login('admin@utm.my');
  ok(g.api_session(t));
  ok(g.api_logout(t));
  assert.strictEqual(g.api_session(t).auth, true);
});

console.log('Pengurusan pengguna');
let picToken, pic2Token;
test('hanya Admin boleh mengurus pengguna', () => {
  ok(g.api_saveUser(adminToken, { emel: 'pic.fai@utm.my', nama: 'PIC FAI', peranan: 'PIC', fakulti: 'FAI', kpi_akses: 'KAI1,KAI4,KAI6', aktif: 'Ya' }));
  ok(g.api_saveUser(adminToken, { emel: 'pic.fc@utm.my', nama: 'PIC FC', peranan: 'PIC', fakulti: 'FC', kpi_akses: 'KAI1, KAI4', aktif: 'Ya' }));
  ok(g.api_saveUser(adminToken, { emel: 'pic.fka@utm.my', nama: 'PIC FKA', peranan: 'PIC', fakulti: 'FKA', kpi_akses: 'KAI1,KAI6', aktif: 'Ya' }));
  picToken = login('pic.fai@utm.my');
  pic2Token = login('pic.fc@utm.my');
  fail(g.api_listUsers(picToken), /Admin sahaja/);
  fail(g.api_saveUser(picToken, { emel: 'x@utm.my', peranan: 'Admin', fakulti: 'FAI' }), /Admin sahaja/);
  assert.strictEqual(ok(g.api_listUsers(adminToken)).length, 4);
});
test('PIC tidak boleh diberi akses KPI khusus Admin', () => {
  const r = g.api_saveUser(adminToken, { emel: 'pic.x@utm.my', peranan: 'PIC', fakulti: 'FAI', kpi_akses: 'KAI2', aktif: 'Ya' });
  fail(r, /tidak sah/);
});
test('tidak boleh nyahaktif Admin terakhir atau padam diri sendiri', () => {
  fail(g.api_saveUser(adminToken, { emel: 'admin@utm.my', peranan: 'PIC', fakulti: 'FAI', kpi_akses: '', aktif: 'Ya' }), /sekurang-kurangnya seorang Admin/);
  fail(g.api_deleteUser(adminToken, 'admin@utm.my'), /sendiri/);
});
test('pengguna dinyahaktifkan: sesi sedia ada terbatal serta-merta dan OTP baharu tidak dihantar', () => {
  ok(g.api_saveUser(adminToken, { emel: 'pic.tmp@utm.my', nama: 'Sementara', peranan: 'PIC', fakulti: 'FKA', kpi_akses: 'KAI1', aktif: 'Ya' }));
  const t = login('pic.tmp@utm.my');
  ok(g.api_session(t));
  ok(g.api_saveUser(adminToken, { emel: 'pic.tmp@utm.my', nama: 'Sementara', peranan: 'PIC', fakulti: 'FKA', kpi_akses: 'KAI1', aktif: 'Tidak' }));
  assert.strictEqual(g.api_session(t).auth, true);
  const n = env.sent.length; g.api_requestOtp('pic.tmp@utm.my'); assert.strictEqual(env.sent.length, n);
  ok(g.api_deleteUser(adminToken, 'pic.tmp@utm.my'));
});

console.log('Akses & rekod');
test('menu PIC hanya KPI yang dibenarkan; Admin nampak semua 7', () => {
  const p = ok(g.api_session(picToken));
  deepEq(p.kpis.map(k => k.id), ['KAI1', 'KAI4', 'KAI6']);
  const a = ok(g.api_session(adminToken));
  assert.strictEqual(a.kpis.length, 7);
});
test('PIC ditolak mengakses KPI Admin sahaja (baca & tulis)', () => {
  fail(g.api_list(picToken, 'KAI2', {}), /Akses ditolak/);
  fail(g.api_save(picToken, 'KAI5', { nama_pelajar: 'x' }), /Akses ditolak/);
  fail(g.api_delete(picToken, 'KAI1', 'L1-001'), /Admin sahaja/);
});
let kai1Id;
test('PIC menambah rekod KAI1: fakulti dipaksa kepada fakulti PIC', () => {
  const r = ok(g.api_save(picToken, 'KAI1', {
    aliran: 'Technology Startup', jenis: 'Inkubator Fakulti', fakulti: 'FC', nama_inkubator: 'Launchpad FAI',
    didaftarkan: 'Ya', tarikh_pendaftaran: '2026-02-10', status: 'Dalam pembangunan'
  }));
  assert.strictEqual(r.fakulti, 'FAI');
  assert.strictEqual(r.id, 'L1-001');
  assert.strictEqual(r.dicipta_oleh, 'pic.fai@utm.my');
  kai1Id = r.id;
});
test('pengesahan medan: wajib, pilihan, tarikh, nombor, url, peraturan bersyarat', () => {
  const r = g.api_save(picToken, 'KAI1', { aliran: 'Salah', jenis: 'Inkubator Fakulti', nama_inkubator: '', didaftarkan: 'Ya', status: 'Tidak aktif', kapasiti: -1, lampiran: 'ftp://x', tarikh_beroperasi: '2026-02-30' });
  fail(r, /betulkan/);
  ['aliran', 'nama_inkubator', 'tarikh_pendaftaran', 'tarikh_tidak_aktif', 'kapasiti', 'lampiran', 'tarikh_beroperasi'].forEach(k => assert.ok(r.fields[k], 'ralat medan tiada: ' + k));
});
test('PIC lain tidak nampak dan tidak boleh ubah rekod fakulti lain', () => {
  assert.strictEqual(ok(g.api_list(pic2Token, 'KAI1', {})).rows.length, 0);
  fail(g.api_save(pic2Token, 'KAI1', { id: kai1Id, aliran: 'Technology Startup', jenis: 'Inkubator Fakulti', nama_inkubator: 'Cuba ubah', didaftarkan: 'Ya', tarikh_pendaftaran: '2026-02-10', status: 'Dalam pembangunan' }), /fakulti lain/);
  assert.strictEqual(ok(g.api_list(picToken, 'KAI1', {})).rows.length, 1);
});
test('PIC mengemas kini rekod sendiri; id dan penciptaan kekal', () => {
  const r = ok(g.api_save(picToken, 'KAI1', { id: kai1Id, aliran: 'Technology Startup', jenis: 'Inkubator Fakulti', nama_inkubator: 'Launchpad FAI v2', didaftarkan: 'Ya', tarikh_pendaftaran: '2026-02-10', status: 'Dalam pembangunan' }));
  assert.strictEqual(r.id, kai1Id); assert.strictEqual(r.nama_inkubator, 'Launchpad FAI v2');
  assert.strictEqual(ok(g.api_list(picToken, 'KAI1', {})).rows.length, 1);
});
test('Admin merekod bagi fakulti lain dan melihat semua', () => {
  ok(g.api_save(adminToken, 'KAI1', { aliran: 'High-Income Gig', jenis: 'Inkubator Fakulti', fakulti: 'FC', nama_inkubator: 'Launchpad FC', didaftarkan: 'Ya', tarikh_pendaftaran: '2026-03-01', status: 'Beroperasi', tarikh_beroperasi: '2026-04-01' }));
  ok(g.api_save(adminToken, 'KAI1', { aliran: 'Social Enterprise', jenis: 'Co-working / Ruang Individu', fakulti: 'UTMXCITE', nama_inkubator: 'Co-work 1', didaftarkan: 'Tidak', status: 'Dicadangkan' }));
  assert.strictEqual(ok(g.api_list(adminToken, 'KAI1', {})).rows.length, 3);
  assert.strictEqual(ok(g.api_list(adminToken, 'KAI1', { fakulti: 'FC' })).rows.length, 1);
  assert.strictEqual(ok(g.api_list(adminToken, 'KAI1', { q: 'co-work' })).rows.length, 1);
});
test('KAI6 terhad kepada FAI, FC, FKE, MJIIT', () => {
  const base = { nama_pelajar: 'Ali', no_matrik: 'A1', status: 'Dipilih' };
  fail(g.api_save(adminToken, 'KAI6', Object.assign({ fakulti: 'FKA' }, base)), /betulkan/);
  ok(g.api_save(adminToken, 'KAI6', Object.assign({ fakulti: 'FKE' }, base)));
  // PIC FC tidak diberi KAI6 dan PIC FKA bukan fakulti KAI6
  fail(g.api_list(pic2Token, 'KAI6', {}), /Akses ditolak/);
});
test('teks berbahaya (formula) disimpan sebagai teks', () => {
  const r = ok(g.api_save(adminToken, 'KAI5', { fakulti: 'FAI', nama_pelajar: '=HYPERLINK("http://x")', no_matrik: '+1234', status: 'Dicalonkan' }));
  assert.ok(r.nama_pelajar.startsWith("'"));
  assert.ok(r.no_matrik.startsWith("'"));
});
test('padam: Admin sahaja, direkod dalam audit', () => {
  const r = ok(g.api_save(adminToken, 'KAI5', { fakulti: 'FAI', nama_pelajar: 'Padam Saya', no_matrik: 'P1', status: 'Dicalonkan' }));
  fail(g.api_delete(picToken, 'KAI1', r.id), /Admin sahaja/);
  ok(g.api_delete(adminToken, 'KAI5', r.id));
  const log = ok(g.api_listAudit(adminToken, 50));
  assert.ok(log.some(a => a.tindakan === 'PADAM' && a.rekod_id === r.id));
  assert.ok(log.some(a => a.tindakan === 'TAMBAH' && a.kpi === 'KAI1'));
  assert.ok(log.some(a => a.tindakan === 'LOG_MASUK'));
});
test('ID berjujukan tidak berulang selepas padam', () => {
  const a = ok(g.api_save(adminToken, 'KAI5', { fakulti: 'FAI', nama_pelajar: 'A', no_matrik: 'A', status: 'Dicalonkan' }));
  const b = ok(g.api_save(adminToken, 'KAI5', { fakulti: 'FAI', nama_pelajar: 'B', no_matrik: 'B', status: 'Dicalonkan' }));
  assert.notStrictEqual(a.id, b.id);
});

console.log('Dashboard');
const dash = (y) => ok(g.api_dashboard(y));
const card = (d, id) => d.kpis.find(k => k.id === id);
test('dashboard awam tanpa log masuk: 7 KPI', () => {
  const d = dash(2026);
  assert.strictEqual(d.kpis.length, 7);
  deepEq(d.kpis.map(k => k.group), ['Growth', 'Growth', 'Growth', 'Transform', 'Transform', 'Transform', 'Internal']);
});
test('KAI1: aktif = didaftarkan + dalam pembangunan/beroperasi (2 daripada 3), sasaran 20', () => {
  const c = card(dash(2026), 'KAI1');
  assert.strictEqual(c.value, 2); assert.strictEqual(c.target, 20); assert.strictEqual(c.status, 'Di bawah sasaran');
  assert.strictEqual(c.secondary[0].value, 1);
  assert.strictEqual(c.quarter, 2); assert.strictEqual(c.quarterTarget, 10);
});
test('KAI1 melebihi sasaran boleh melebihi 100%', () => {
  for (let i = 0; i < 19; i++) ok(g.api_save(adminToken, 'KAI1', { aliran: 'Technology Startup', jenis: 'Inkubator Fakulti', fakulti: 'FKE', nama_inkubator: 'Bulk ' + i, didaftarkan: 'Ya', tarikh_pendaftaran: '2026-01-15', status: 'Dalam pembangunan' }));
  const c = card(dash(2026), 'KAI1');
  assert.strictEqual(c.value, 21); assert.strictEqual(c.status, 'Melebihi sasaran'); assert.strictEqual(c.pct, 105);
});
test('KAI1: kiraan mengikut tahun dan inkubator tidak aktif', () => {
  assert.strictEqual(card(dash(2025 + 1), 'KAI1').value, 21);
  ok(g.api_save(adminToken, 'KAI1', { aliran: 'Technology Startup', jenis: 'Inkubator Fakulti', fakulti: 'FM', nama_inkubator: 'Tutup 2027', didaftarkan: 'Ya', tarikh_pendaftaran: '2026-06-01', status: 'Tidak aktif', tarikh_tidak_aktif: '2027-03-01' }));
  assert.strictEqual(card(dash(2026), 'KAI1').value, 22); // aktif pada 2026
  assert.strictEqual(card(dash(2027), 'KAI1').value, 21); // tidak lagi aktif pada 2027
});
test('KAI2: kemajuan berpemberat, sasaran 60% (2026), 80% (2027), 100% (2028)', () => {
  const rows = ok(g.api_list(adminToken, 'KAI2', {})).rows;
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(card(dash(2026), 'KAI2').value, 0);
  const r1 = rows.find(r => r.fasa === 'Perancangan & Reka Bentuk');
  const upd = Object.assign({}, r1, { peratus_siap: 100, status: 'Siap', tarikh_siap: '2026-04-30' });
  ok(g.api_save(adminToken, 'KAI2', upd));
  const c = card(dash(2026), 'KAI2');
  assert.strictEqual(c.value, 25); assert.strictEqual(c.target, 60); assert.strictEqual(c.quarterTarget, 30);
  assert.strictEqual(c.quarterStatus, 'Di bawah sasaran');
  assert.strictEqual(card(dash(2027), 'KAI2').target, 80);
  assert.strictEqual(card(dash(2028), 'KAI2').target, 100);
  assert.strictEqual(card(dash(2029), 'KAI2').status, 'Tiada sasaran');
  deepEq(c.warnings, []);
});
test('KAI2: siap 100% = Selesai; amaran jika pemberat bukan 100%', () => {
  const rows = ok(g.api_list(adminToken, 'KAI2', {})).rows;
  rows.forEach(r => ok(g.api_save(adminToken, 'KAI2', Object.assign({}, r, { peratus_siap: 100, status: 'Siap', tarikh_siap: '2026-12-01' }))));
  assert.strictEqual(card(dash(2026), 'KAI2').status, 'Selesai');
  assert.strictEqual(card(dash(2026), 'KAI2').value, 100);
  const first = ok(g.api_list(adminToken, 'KAI2', {})).rows[0];
  ok(g.api_save(adminToken, 'KAI2', Object.assign({}, first, { pemberat: 40 })));
  assert.match(card(dash(2026), 'KAI2').warnings[0], /pemberat/);
});
test('KAI3: ruang ditawarkan (kumulatif) + penggunaan; sasaran +5 setahun', () => {
  const mk = (kod, st, extra) => ok(g.api_save(adminToken, 'KAI3', Object.assign({ kod_lot: kod, jenis_ruang: 'Kiosk / Lot Mudah Alih', kolej_fakulti: 'KTDI', status: st }, extra)));
  mk('L-1', 'Ditawarkan', { tarikh_ditawarkan: '2026-03-01' });
  mk('L-2', 'Disewa', { tarikh_ditawarkan: '2026-03-01', penyewa_nama: 'Ali', tarikh_mula_sewa: '2026-04-01' });
  mk('L-3', 'Siap', {});
  mk('L-4', 'Ditawarkan', { tarikh_ditawarkan: '2027-02-01' });
  fail(g.api_save(adminToken, 'KAI3', { kod_lot: 'L-5', jenis_ruang: 'Student Mall', kolej_fakulti: 'X', status: 'Disewa', tarikh_ditawarkan: '2026-01-01' }), /betulkan/);
  const c = card(dash(2026), 'KAI3');
  assert.strictEqual(c.value, 2); assert.strictEqual(c.target, 25);
  deepEq(c.secondary.map(s => s.value), [1, '50%']);
  assert.strictEqual(card(dash(2027), 'KAI3').value, 3);
  deepEq([2026, 2027, 2028, 2029, 2030].map(y => card(dash(y), 'KAI3').target), [25, 30, 35, 40, 45]);
});
test('KAI4/KAI5: pelajar mendaftar mengikut tahun; sasaran 20 dan 4', () => {
  const mk = (n, st, d) => ok(g.api_save(adminToken, 'KAI4', { fakulti: 'FAI', nama_pelajar: n, no_matrik: n, status: st, tarikh_daftar: d }));
  mk('a', 'Mendaftar', '2026-03-01'); mk('b', 'Tamat', '2026-03-02'); mk('c', 'Memohon', ''); mk('d', 'Mendaftar', '2027-01-05');
  const c = card(dash(2026), 'KAI4');
  assert.strictEqual(c.value, 2); assert.strictEqual(c.target, 20);
  assert.strictEqual(card(dash(2027), 'KAI4').value, 1);
  assert.strictEqual(card(dash(2026), 'KAI5').target, 4);
  assert.strictEqual(card(dash(2026), 'KAI5').quarterTarget, 2); // Q2 2026 = 2 (PDF: N/A, 2, N/A, 4)
  assert.strictEqual(card(dash(2026), 'KAI5').quarterStatus, 'Di bawah sasaran');
  env.clock.now = Date.UTC(2026, 6, 15, 4); // Julai = Q3: tiada sasaran suku tahun (N/A)
  g.api_save(adminToken, 'KAI5', { fakulti: 'FC', nama_pelajar: 'Q3', no_matrik: 'Q3', status: 'Dicalonkan' }); // buang cache
  assert.strictEqual(card(dash(2026), 'KAI5').quarterStatus, 'Tiada sasaran suku tahun');
  env.clock.now = Date.UTC(2026, 4, 15, 4);
  g.api_save(adminToken, 'KAI5', { fakulti: 'FC', nama_pelajar: 'Q3b', no_matrik: 'Q3b', status: 'Dicalonkan' });
  const fac = c.breakdown[0].items;
  assert.ok(fac.length >= 13 && fac.every(i => i.target === 2));
});
test('KAI6: sasaran 20, minimum 5 setiap fakulti (4 fakulti), startup unik', () => {
  const mk = (f, n, s) => ok(g.api_save(adminToken, 'KAI6', { fakulti: f, nama_pelajar: n, no_matrik: n, status: 'Dalam latihan', tarikh_mula_latihan: '2026-05-04', nama_startup: s, top5: 'Ya' }));
  mk('FAI', 'p1', 'StartupA'); mk('FAI', 'p2', 'startupa'); mk('FC', 'p3', 'StartupB');
  const c = card(dash(2026), 'KAI6');
  assert.strictEqual(c.value, 3); assert.strictEqual(c.target, 20);
  assert.strictEqual(c.secondary[0].value, 2);
  deepEq(c.breakdown[0].items.map(i => i.label), ['FAI', 'FC', 'FKE', 'MJIIT']);
  assert.ok(c.breakdown[0].items.every(i => i.target === 5));
});
test('DKAI1: siap 100% pada 2026 sahaja', () => {
  const c = card(dash(2026), 'DKAI1');
  assert.strictEqual(c.target, 100); assert.strictEqual(c.value, 0);
  assert.strictEqual(card(dash(2027), 'DKAI1').status, 'Tiada sasaran');
  const rows = ok(g.api_list(adminToken, 'DKAI1', {})).rows;
  const bengkel = rows.find(r => r.peringkat === 'Bengkel Pra-Pelan');
  ok(g.api_save(adminToken, 'DKAI1', Object.assign({}, bengkel, { peratus_siap: 100, status: 'Siap', tarikh_siap: '2026-05-01' })));
  assert.strictEqual(card(dash(2026), 'DKAI1').value, 50);
});
test('dashboard awam tidak mendedahkan data peribadi atau bajet', () => {
  const s = JSON.stringify(dash(2026));
  ['pic.fai@utm.my', 'admin@utm.my', '"Ali"', 'bajet', '130000', 'A1'].forEach(x => { const i = s.indexOf(x); assert.ok(i < 0, 'bocor: ' + x + ' => ' + s.slice(Math.max(0, i - 40), i + 40)); });
});
test('cache dashboard dibatalkan selepas tulis', () => {
  const before = card(dash(2026), 'KAI5').value;
  ok(g.api_save(adminToken, 'KAI5', { fakulti: 'FC', nama_pelajar: 'Z', no_matrik: 'Z', status: 'Mendaftar', tarikh_daftar: '2026-05-01' }));
  assert.strictEqual(card(dash(2026), 'KAI5').value, before + 1);
});
test('tahun tidak sah jatuh balik kepada tahun semasa', () => { assert.strictEqual(dash('abc').year, 2026); assert.strictEqual(dash(1999).year, 2026); });

console.log('Sasaran (Admin)');
test('Admin menyunting sasaran; PIC tidak boleh', () => {
  fail(g.api_saveTarget(picToken, { kpi: 'KAI1', tahun: 2026, sasaran: 30 }), /Admin sahaja/);
  ok(g.api_saveTarget(adminToken, { kpi: 'KAI1', tahun: 2026, sasaran: 25, q1: 5, q2: 10, q3: 20, q4: 25, bajet_rm: 130000, catatan: 'diubah' }));
  assert.strictEqual(card(dash(2026), 'KAI1').target, 25);
  fail(g.api_saveTarget(adminToken, { kpi: 'KAI2', tahun: 2026, sasaran: 120 }), /100%/);
  fail(g.api_saveTarget(adminToken, { kpi: 'KAI1', tahun: 2040, sasaran: 5 }), /Tahun/);
  assert.ok(ok(g.api_listTargets(adminToken)).length > 20);
});

console.log('Penyuntingan manual tab Pengguna');
test('drop-down peranan dan aktif disediakan dalam tab Pengguna', () => {
  const sh = env.spreadsheets[env.props.SHEET_ID].getSheetByName('Pengguna');
  assert.strictEqual(JSON.stringify(sh.validations[3].list), JSON.stringify(['Admin', 'PIC']));
  assert.strictEqual(JSON.stringify(sh.validations[6].list), JSON.stringify(['Ya', 'Tidak']));
});
test('peranan/aktif ditaip manual (huruf kecil, ada ruang) tetap berfungsi', () => {
  const sh = env.spreadsheets[env.props.SHEET_ID].getSheetByName('Pengguna');
  sh.appendRow(['  Manual.Admin@UTM.my ', 'Manual', ' admin ', 'UTMXCITE', '', ' ya ', '']);
  const t = login('manual.admin@utm.my');
  assert.strictEqual(ok(g.api_session(t)).user.peranan, 'Admin');
  assert.strictEqual(ok(g.api_session(t)).kpis.length, 7);
});
test('peranan kosong atau salah: tiada OTP dan tiada akses (bukan PIC secara lalai)', () => {
  const sh = env.spreadsheets[env.props.SHEET_ID].getSheetByName('Pengguna');
  sh.appendRow(['tanpa.peranan@utm.my', 'X', '', 'FAI', 'KAI1,KAI4', 'Ya', '']);
  sh.appendRow(['peranan.salah@utm.my', 'Y', 'Pengurus', 'FAI', 'KAI1', 'Ya', '']);
  const n = env.sent.length;
  ok(g.api_requestOtp('tanpa.peranan@utm.my')); ok(g.api_requestOtp('peranan.salah@utm.my'));
  assert.strictEqual(env.sent.length, n);
});
test('Admin yang didaftar manual boleh diturunkan kepada PIC kerana Admin lain masih aktif', () => {
  ok(g.api_saveUser(adminToken, { emel: 'manual.admin@utm.my', nama: 'Manual', peranan: 'PIC', fakulti: 'FAI', kpi_akses: 'KAI1', aktif: 'Ya' }));
});

console.log('\n' + passed + ' lulus, ' + failed + ' gagal');
process.exit(failed ? 1 : 0);
