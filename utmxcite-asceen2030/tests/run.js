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
  assert.strictEqual(a.kpis.length, 16);
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
test('dashboard awam tanpa log masuk: 7 KPI + 9 CKAI', () => {
  const d = dash(2026);
  assert.strictEqual(d.kpis.length, 16);
  deepEq(d.kpis.map(k => k.group), ['Growth', 'Growth', 'Growth', 'Transform', 'Transform', 'Transform', 'Department', 'Center', 'Center', 'Center', 'Center', 'Center', 'Center', 'Center', 'Center', 'Center']);
  deepEq(d.kpis.map(k => k.level), ['KAI', 'KAI', 'KAI', 'KAI', 'KAI', 'KAI', 'DKAI', 'CKAI', 'CKAI', 'CKAI', 'CKAI', 'CKAI', 'CKAI', 'CKAI', 'CKAI', 'CKAI']);
  deepEq(d.levels.map(l => l.label), ['KAI · Peringkat Universiti', 'DKAI · Peringkat Jabatan (JTNC HEPA)', 'CKAI · Peringkat Pusat (UTMXCITE)']);
  assert.ok(!JSON.stringify(d).includes('Internal'));
  // Enam fungsi UTMXCITE = aliran proses kerja; setiap indikator ditanda dengan satu fungsi
  deepEq(d.functions.map(x => x.label), ['Identify Student Entrepreneurship Interest', 'Conduct Entrepreneurship Training', 'Support Student Business Ideation', 'Facilitate Student Startup Development', 'Monitor Student Enterprise Performance', 'Showcase Student Innovation Venture', 'Cross-cutting']);
  deepEq(d.functions.map(x => x.no), [1, 2, 3, 4, 5, 6, null]);
  deepEq(d.kpis.map(k => k.id + ':' + k.fungsi), [
    'KAI1:startup', 'KAI2:startup', 'KAI3:startup', 'KAI4:latihan', 'KAI5:startup', 'KAI6:startup', 'DKAI1:rentas',
    'CKAI1:minat', 'CKAI2:latihan', 'CKAI3:ideasi', 'CKAI4:startup', 'CKAI5:startup', 'CKAI6:startup', 'CKAI7:prestasi', 'CKAI8:pameran', 'CKAI9:pameran']);
  const titles = Object.fromEntries(d.kpis.map(k => [k.id, k.title]));
  assert.match(titles.CKAI1, /profiling pelajar yang didaftarkan/); assert.match(titles.CKAI4, /pendaftaran SSU/); assert.match(titles.CKAI5, /Makerspace/); assert.match(titles.CKAI9, /Anugerah/);
  deepEq(ok(g.api_session(adminToken)).functions.map(x => x.id), ['minat', 'latihan', 'ideasi', 'startup', 'prestasi', 'pameran', 'rentas']);
  // setiap fungsi 1-6 ada sekurang-kurangnya satu CKAI
  ['minat', 'latihan', 'ideasi', 'startup', 'prestasi', 'pameran'].forEach(f => assert.ok(d.kpis.some(k => k.level === 'CKAI' && k.fungsi === f), 'fungsi tiada CKAI: ' + f));
  // tab Sheet mengikut nombor baharu
  const names = env.spreadsheets[env.props.SHEET_ID].sheets.map(x => x.name);
  ['CKAI1_Profiling_Pelajar', 'CKAI2_Program_Keusahawanan', 'CKAI3_Program_Inovasi', 'CKAI4_SSU', 'CKAI5_Makerspace', 'CKAI6_Sewaan_Inkubator', 'CKAI7_Pendapatan_Pelajar', 'CKAI8_Inovasi_Pelajar', 'CKAI9_Anugerah']
    .forEach(n => assert.ok(names.includes(n), 'tab tiada: ' + n));
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
  const mk = (n, st, d) => ok(g.api_save(adminToken, 'KAI4', { fakulti: 'FAI', nama_pelajar: n, no_kp: '990101-01-1234', no_matrik: n, status: st, tarikh_daftar: d }));
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

console.log('CKAI (Center Key Amal Indicator)');
let ckaiPic, ckaiPicFc;
test('Admin memberi PIC akses CKAI 2, 2 dan 4 (bukan CKAI 4, 5, 6)', () => {
  ok(g.api_saveUser(adminToken, { emel: 'pic.ckai.fke@utm.my', nama: 'PIC FKE', peranan: 'PIC', fakulti: 'FKE', kpi_akses: 'CKAI2,CKAI3,CKAI7', aktif: 'Ya' }));
  ok(g.api_saveUser(adminToken, { emel: 'pic.ckai.fc@utm.my', nama: 'PIC FC', peranan: 'PIC', fakulti: 'FC', kpi_akses: 'CKAI2,CKAI7', aktif: 'Ya' }));
  fail(g.api_saveUser(adminToken, { emel: 'pic.salah@utm.my', nama: 'X', peranan: 'PIC', fakulti: 'FC', kpi_akses: 'CKAI4', aktif: 'Ya' }), /tidak sah/);
  fail(g.api_saveUser(adminToken, { emel: 'pic.salah@utm.my', nama: 'X', peranan: 'PIC', fakulti: 'FC', kpi_akses: 'CKAI5', aktif: 'Ya' }), /tidak sah/);
  ckaiPic = login('pic.ckai.fke@utm.my');
  ckaiPicFc = login('pic.ckai.fc@utm.my');
  deepEq(ok(g.api_session(ckaiPic)).kpis.map(k => k.id), ['CKAI2', 'CKAI3', 'CKAI7']);
  fail(g.api_list(ckaiPic, 'CKAI4', {}), /Akses ditolak/);
  fail(g.api_save(ckaiPic, 'CKAI5', { tempoh: '2026-01', bil_penggunaan: 5 }), /Akses ditolak/);
  fail(g.api_save(ckaiPic, 'CKAI6', { tempoh: '2026-01' }), /Akses ditolak/);
});
test('CKAI 2: fakulti merekod program sendiri; hanya program Selesai dikira pada tahun tamat', () => {
  const base = { nama_program: 'Bengkel Pitching', kategori: 'Bengkel', tarikh_mula: '2026-03-01', lokasi: 'Dewan Besar', bil_peserta: 40, bajet_rm: 1200, pendapatan_rm: 300 };
  fail(g.api_save(ckaiPic, 'CKAI2', Object.assign({ fakulti: 'FKE', status: 'Selesai' }, base)), /betulkan/); // tarikh tamat wajib
  const a = ok(g.api_save(ckaiPic, 'CKAI2', Object.assign({ fakulti: 'FC', status: 'Selesai', tarikh_tamat: '2026-03-02' }, base)));
  assert.strictEqual(a.fakulti, 'FKE'); // dipaksa kepada fakulti PIC
  ok(g.api_save(ckaiPic, 'CKAI2', Object.assign({}, base, { fakulti: 'FKE', status: 'Dirancang', nama_program: 'Akan datang' })));
  ok(g.api_save(adminToken, 'CKAI2', Object.assign({}, base, { fakulti: 'UTMXCITE', status: 'Selesai', tarikh_tamat: '2027-01-10', nama_program: 'Program 2027' })));
  const c = card(dash(2026), 'CKAI2');
  assert.strictEqual(c.value, 1); assert.strictEqual(c.status, 'Tiada sasaran');
  assert.strictEqual(c.secondary[0].value, 40);
  assert.strictEqual(card(dash(2027), 'CKAI2').value, 1);
  assert.strictEqual(ok(g.api_list(ckaiPicFc, 'CKAI2', {})).rows.length, 0); // PIC FC tidak nampak rekod FKE
  assert.strictEqual(ok(g.api_list(ckaiPic, 'CKAI2', {})).rows.length, 2);
});
test('CKAI 3: program inovasi dikira berasingan daripada CKAI 2', () => {
  ok(g.api_save(ckaiPic, 'CKAI3', { fakulti: 'FKE', nama_program: 'Hackathon', kategori: 'Hackathon / Pertandingan', status: 'Selesai', tarikh_mula: '2026-04-10', tarikh_tamat: '2026-04-12', lokasi: 'Makerspace', bil_peserta: 100, bajet_rm: 5000, pendapatan_rm: 0 }));
  fail(g.api_save(ckaiPic, 'CKAI3', { fakulti: 'FKE', nama_program: 'X', kategori: 'Bengkel Pitching', status: 'Dirancang' }), /betulkan/); // kategori tidak sah
  assert.strictEqual(card(dash(2026), 'CKAI3').value, 1);
  assert.strictEqual(card(dash(2026), 'CKAI2').value, 1);
});
test('Program: tarikh, tempat, penyertaan, kos dan pendapatan wajib bagi program Selesai (0 dibenarkan); peraturan silang', () => {
  const done = { fakulti: 'FKE', nama_program: 'Program Penuh', kategori: 'Bengkel', status: 'Selesai' };
  const r = g.api_save(ckaiPic, 'CKAI3', done);
  fail(r, /betulkan/);
  ['tarikh_mula', 'tarikh_tamat', 'lokasi', 'bil_peserta', 'bajet_rm', 'pendapatan_rm'].forEach(k => assert.ok(r.fields[k], 'wajib bagi Selesai: ' + k));
  // program belum selesai tidak dipaksa isi semua medan
  ok(g.api_save(ckaiPic, 'CKAI3', Object.assign({}, done, { status: 'Dirancang', nama_program: 'Masih dirancang' })));
  const full = Object.assign({}, done, { tarikh_mula: '2026-05-10', tarikh_tamat: '2026-05-11', lokasi: 'Dewan A', bil_peserta: 50, bajet_rm: 0, pendapatan_rm: 0 });
  ok(g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { nama_program: 'Kos dan pendapatan sifar' }))); // 0 sah
  const r1 = g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { tarikh_tamat: '2026-05-09' })); fail(r1, /betulkan/); assert.match(r1.fields.tarikh_tamat, /sebelum tarikh mula/);
  const r2 = g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { bil_pelajar: 30, bil_staf: 15, bil_luar: 10 })); fail(r2, /betulkan/); assert.match(r2.fields.bil_peserta, /kurang daripada/);
  const r3 = g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { bil_peserta: '', bil_pelajar: 5 })); fail(r3, /betulkan/); assert.ok(r3.fields.bil_peserta);
  fail(g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { skor_kepuasan: 6 })), /betulkan/);
  fail(g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { bajet_rm: -1 })), /betulkan/);
  fail(g.api_save(ckaiPic, 'CKAI3', Object.assign({}, full, { sumber_pendapatan: 'Rompak' })), /betulkan/);
});
test('Program: kos penganjuran, pendapatan dan penyertaan dijumlah pada dashboard (program Selesai dalam tahun sahaja)', () => {
  const mk = (n, over) => ok(g.api_save(adminToken, 'CKAI3', Object.assign({ fakulti: 'FC', nama_program: n, kategori: 'Bengkel', status: 'Selesai', tarikh_mula: '2028-02-01', tarikh_tamat: '2028-02-02', lokasi: 'Dewan', bil_peserta: 60, bil_pelajar: 40, bil_staf: 10, bil_luar: 10, bajet_rm: 2500.25, pendapatan_rm: 800 }, over)));
  mk('P1'); mk('P2', { bajet_rm: 1000, pendapatan_rm: 200.5, bil_peserta: 40, bil_pelajar: 40, bil_staf: 0, bil_luar: 0 });
  mk('P3 dibatalkan', { status: 'Dibatalkan', tarikh_tamat: '' });
  mk('P4 tahun lain', { tarikh_mula: '2029-01-01', tarikh_tamat: '2029-01-02', bajet_rm: 9999 });
  const c = card(dash(2028), 'CKAI3');
  const sec = Object.fromEntries(c.secondary.map(x => [x.label, x.value]));
  assert.strictEqual(c.value, 2);
  assert.strictEqual(sec['Jumlah peserta'], 100); assert.strictEqual(sec['Daripada itu pelajar'], 80);
  assert.strictEqual(sec['Kos penganjuran'], 'RM 3,500.25'); assert.strictEqual(sec['Pendapatan'], 'RM 1,000.50');
  assert.strictEqual(c.breakdown[2].items[0].value, 100);
  assert.ok(!JSON.stringify(dash(2028)).includes('P1')); // nama program tidak dipaparkan kepada awam
});
test('Program: laporan PDF pilihan; boleh dimuat naik dan dimuat turun oleh PIC fakulti sendiri sahaja', () => {
  const pdf = Buffer.from('%PDF-1.4\n%laporan program\n%%EOF').toString('base64');
  const up = ok(g.api_uploadFile(ckaiPic, 'CKAI3', 'laporan', { name: 'laporan-hackathon.pdf', data: pdf }));
  const rec = ok(g.api_save(ckaiPic, 'CKAI3', { fakulti: 'FKE', nama_program: 'Dengan laporan', kategori: 'Bengkel', status: 'Dirancang', laporan: { id: up.id, name: up.name } }));
  assert.strictEqual(JSON.parse(rec.laporan).name, 'laporan-hackathon.pdf');
  assert.strictEqual(ok(g.api_downloadFile(ckaiPic, 'CKAI3', rec.id, 'laporan')).base64, pdf);
  fail(g.api_downloadFile(ckaiPicFc, 'CKAI3', rec.id, 'laporan'), /Akses ditolak/); // PIC FC tiada akses CKAI 3
  ok(g.api_saveUser(adminToken, { emel: 'pic.fc.inovasi@utm.my', nama: 'PIC FC Inovasi', peranan: 'PIC', fakulti: 'FC', kpi_akses: 'CKAI3', aktif: 'Ya' }));
  const fcInov = login('pic.fc.inovasi@utm.my');
  fail(g.api_downloadFile(fcInov, 'CKAI3', rec.id, 'laporan'), /fakulti lain/); // ada akses CKAI 3 tetapi fakulti berbeza
  assert.strictEqual(ok(g.api_list(fcInov, 'CKAI3', { q: 'Dengan laporan' })).rows.length, 0);
  fail(g.api_uploadFile(ckaiPic, 'CKAI3', 'bajet_rm', { name: 'x.pdf', data: pdf }), /tidak sah/);
  fail(g.api_uploadFile(ckaiPic, 'CKAI4', 'lampiran', { name: 'x.pdf', data: pdf }), /Akses ditolak/);
});
test('CKAI 4 (SSU): Admin sahaja; dikira mengikut tarikh pendaftaran', () => {
  const r = { fakulti: 'FC', nama_pelajar: 'Pelajar SSU', no_kp: '990101-01-1234', no_matrik: 'S1', jenis_perniagaan: 'Runcit', bil_rakan_kongsi: 3, status_ssm: 'Berdaftar', tarikh_ssm: '2026-01-15', nama_syarikat: 'Syarikat A', no_ssu: 'SSU-001', tarikh_daftar: '2026-02-01', status: 'Aktif' };
  ok(g.api_save(adminToken, 'CKAI4', r));
  ok(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { nama_syarikat: 'Syarikat B', no_ssu: 'SSU-002', status: 'Tidak Aktif' })));
  ok(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { nama_syarikat: 'Syarikat C', no_ssu: 'SSU-003', tarikh_daftar: '2027-01-01' })));
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: '' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', jenis_perniagaan: 'Retail' })), /betulkan/); // bukan pilihan
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', jenis_perniagaan: 'Lain-lain' })), /betulkan/); // mesti dinamakan
  ok(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-011', jenis_perniagaan: 'Lain-lain', jenis_perniagaan_lain: 'Akuaponik', tarikh_daftar: '2025-07-01' })));
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', bil_rakan_kongsi: 0 })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', bil_rakan_kongsi: '' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', status_ssm: '' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', status_ssm: 'Mungkin' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', tarikh_ssm: '' })), /betulkan/); // Berdaftar: tarikh SSM wajib
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', tarikh_ssm: '2026-02-30' })), /betulkan/);
  ok(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-010', status_ssm: 'Tidak Berdaftar', tarikh_ssm: '', tarikh_daftar: '2025-06-01' })));
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', no_kp: '' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, r, { no_ssu: 'SSU-009', no_kp: '12' })), /betulkan/);
  assert.strictEqual(ok(g.api_list(adminToken, 'CKAI4', {})).rows[0].no_kp.replace(/^'/, ''), '990101011234'); // sengkang dibuang
  const c = card(dash(2026), 'CKAI4');
  assert.strictEqual(c.value, 2); assert.strictEqual(c.secondary[0].value, 1);
  assert.strictEqual(card(dash(2027), 'CKAI4').value, 1);
  assert.match(c.title, /Sistem Syarikat Universiti/);
});
test('CKAI 7: pendapatan RM dijumlahkan mengikut bulan dalam tahun; format bulan disahkan', () => {
  const r = { nama_perniagaan: 'Kedai A', jenis_pendapatan: 'Jualan produk' };
  ok(g.api_save(ckaiPic, 'CKAI7', Object.assign({ fakulti: 'FKE', tempoh: '2026-03', pendapatan_rm: 1500.5 }, r)));
  ok(g.api_save(ckaiPic, 'CKAI7', Object.assign({ fakulti: 'FKE', tempoh: '2026-04', pendapatan_rm: 2000 }, r)));
  ok(g.api_save(ckaiPicFc, 'CKAI7', Object.assign({ fakulti: 'FC', tempoh: '2026-04', pendapatan_rm: 499.5, nama_perniagaan: 'Gig B', jenis_pendapatan: 'Perkhidmatan / Gig' })));
  ok(g.api_save(adminToken, 'CKAI7', Object.assign({ fakulti: 'FC', tempoh: '2027-01', pendapatan_rm: 100 }, r)));
  ['2026-13', '2026-00', '26-03', '2026-3', 'bukan-bulan'].forEach(b => fail(g.api_save(ckaiPic, 'CKAI7', Object.assign({ fakulti: 'FKE', tempoh: b, pendapatan_rm: 1 }, r)), /betulkan/));
  fail(g.api_save(ckaiPic, 'CKAI7', Object.assign({ fakulti: 'FKE', tempoh: '2026-05', pendapatan_rm: -5 }, r)), /betulkan/);
  const c = card(dash(2026), 'CKAI7');
  assert.strictEqual(c.value, 4000); assert.strictEqual(c.format, 'rm');
  assert.strictEqual(c.secondary[0].value, 2); // dua perniagaan unik
  assert.strictEqual(card(dash(2027), 'CKAI7').value, 100);
  assert.strictEqual(ok(g.api_list(ckaiPicFc, 'CKAI7', {})).rows.length, 2); // PIC FC hanya nampak rekod FC (2026-04 dan 2027-01), bukan FKE
  assert.ok(ok(g.api_list(ckaiPicFc, 'CKAI7', {})).rows.every(r => r.fakulti === 'FC'));
  const byFak = c.breakdown[0].items; assert.strictEqual(byFak[0].label, 'FKE'); assert.strictEqual(byFak[0].value, 3500.5);
});
test('CKAI 5 (Makerspace): satu permohonan = satu penggunaan, Admin sahaja', () => {
  const mk = (extra) => Object.assign({ emel: 'Ali@utm.my', nama: 'Ali Bin Abu', no_kp: '990101-01-1234', no_matrik: 'A23EC0001', fakulti: 'FC', kelas: 'Tahun 2', telefon: '012-3456789',
    peralatan: '3D Printer', tujuan: 'Prototaip projek', bil_peserta: 3, tarikh_mula: '2026-01-10', tarikh_tamat: '2026-01-10', masa_mula: '09:00', masa_tamat: '12:00', status_bayaran: 'Bayar', bayaran_rm: 5 }, extra);
  const r1 = ok(g.api_save(adminToken, 'CKAI5', mk({})));
  ok(g.api_save(adminToken, 'CKAI5', mk({ nama: 'Siti', no_matrik: 'A23EC0002', peralatan: 'Laser Cutter Machine', bil_peserta: 2, tarikh_mula: '2026-02-03', tarikh_tamat: '2026-02-04' })));
  ok(g.api_save(adminToken, 'CKAI5', mk({ tarikh_mula: '2026-02-20', tarikh_tamat: '2026-02-20' })));
  ok(g.api_save(adminToken, 'CKAI5', mk({ tarikh_mula: '2027-01-05', tarikh_tamat: '2027-01-05' })));
  const row = ok(g.api_list(adminToken, 'CKAI5', {})).rows.find(r => r.id === r1.id);
  assert.strictEqual(row.no_kp, '990101011234'); // sengkang dibuang
  const c = card(dash(2026), 'CKAI5');
  assert.strictEqual(c.value, 3); assert.strictEqual(c.secondary[0].value, 2); assert.strictEqual(c.secondary[1].value, 8);
  deepEq(c.breakdown[0].items.map(i => i.label + ':' + i.value), ['2026-01:1', '2026-02:2']);
  assert.strictEqual(c.breakdown[1].items[0].label, 'FC');
  assert.strictEqual(c.breakdown[2].items[0].label, '3D Printer');
  assert.strictEqual(c.secondary[2].value, 'RM 15.00'); assert.strictEqual(c.secondary[3].value, 'RM 0.00');
  const free = ok(g.api_save(adminToken, 'CKAI5', mk({ status_bayaran: 'Tiada Caj', bayaran_rm: 5, tarikh_mula: '2026-03-03', tarikh_tamat: '2026-03-03' })));
  assert.strictEqual(ok(g.api_list(adminToken, 'CKAI5', {})).rows.find(r => r.id === free.id).bayaran_rm, 0); // Tiada Caj = RM0
  ok(g.api_save(adminToken, 'CKAI5', mk({ status_bayaran: 'Belum Dibayar', tarikh_mula: '2026-03-04', tarikh_tamat: '2026-03-04' })));
  assert.strictEqual(card(dash(2026), 'CKAI5').secondary[3].value, 'RM 5.00');
  fail(g.api_save(adminToken, 'CKAI5', mk({ status_bayaran: 'Bayar', bayaran_rm: '' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ status_bayaran: 'Percuma' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ fakulti: 'XYZ' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ peralatan: 'Mesin Rekaan' })), /betulkan/); // bukan pilihan
  fail(g.api_save(adminToken, 'CKAI5', mk({ peralatan: 'Lain-lain (Other)' })), /betulkan/); // mesti dinamakan
  ok(g.api_save(adminToken, 'CKAI5', mk({ peralatan: 'Lain-lain (Other)', peralatan_lain: 'Vacuum Former', tarikh_mula: '2025-03-01', tarikh_tamat: '2025-03-01' })));
  fail(g.api_save(adminToken, 'CKAI5', mk({ tarikh_tamat: '2026-01-09' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ masa_tamat: '08:00' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ masa_mula: '25:61' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ telefon: 'abc' })), /betulkan/);
  fail(g.api_save(adminToken, 'CKAI5', mk({ bil_peserta: 0 })), /betulkan/);
});
test('CKAI 6 (sewaan inkubator): hanya yang DIBAYAR dikira; tertunggak dipaparkan berasingan', () => {
  const r = { tempoh: '2026-03', inkubator: 'Launchpad FC', penyewa: 'Syarikat A', jumlah_rm: 500 };
  fail(g.api_save(adminToken, 'CKAI6', Object.assign({ status_bayaran: 'Dibayar' }, r)), /betulkan/); // tarikh bayar wajib
  ok(g.api_save(adminToken, 'CKAI6', Object.assign({ status_bayaran: 'Dibayar', tarikh_bayar: '2026-03-05' }, r)));
  ok(g.api_save(adminToken, 'CKAI6', Object.assign({}, r, { tempoh: '2026-04', jumlah_rm: 700, status_bayaran: 'Tertunggak' })));
  const c = card(dash(2026), 'CKAI6');
  assert.strictEqual(c.value, 500); assert.strictEqual(c.secondary[0].value, 'RM 700.00'); assert.strictEqual(c.secondary[1].value, 1);
});
const PDF = (extra = '') => Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n' + extra + '\n%%EOF').toString('base64');
let awardPic, awardPicFc, awardRec;
const award = (over = {}) => Object.assign({
  fakulti: 'FM', nama_anugerah: 'Anugerah Inovasi Fakulti', tarikh: '2026-04-20', agensi: 'Kementerian Pendidikan Tinggi', peringkat: 'Fakulti', kategori: 'Inovasi',
  program: 'GiGAUTM Ascend (GiGA)', mentor: 'Dr. Mentor', pingat: 'Emas',
  pelajar: [{ nama: 'Ali Anugerah', matrik: 'A24FM0001', nokp: '900101-14-5678' }, { nama: 'Siti Anugerah', matrik: 'A24FM0002', nokp: '010203-10-1234' }]
}, over);
test('CKAI 9: akses PIC fakulti dan muat naik sijil PDF (hanya PDF sebenar, maksimum 5 MB)', () => {
  ok(g.api_saveUser(adminToken, { emel: 'pic.anugerah@utm.my', nama: 'PIC FM', peranan: 'PIC', fakulti: 'FM', kpi_akses: 'CKAI9', aktif: 'Ya' }));
  ok(g.api_saveUser(adminToken, { emel: 'pic.anugerah2@utm.my', nama: 'PIC FS', peranan: 'PIC', fakulti: 'FS', kpi_akses: 'CKAI9', aktif: 'Ya' }));
  awardPic = login('pic.anugerah@utm.my'); awardPicFc = login('pic.anugerah2@utm.my');
  deepEq(ok(g.api_session(awardPic)).kpis.map(k => k.id), ['CKAI9']);
  fail(g.api_uploadFile(ckaiPic, 'CKAI9', 'sijil', { name: 'a.pdf', data: PDF() }), /Akses ditolak/); // PIC tanpa akses CKAI 9
  fail(g.api_uploadFile(awardPic, 'CKAI9', 'nama_anugerah', { name: 'a.pdf', data: PDF() }), /tidak sah/); // bukan medan fail
  fail(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'sijil.pdf', data: Buffer.from('ini bukan pdf').toString('base64') }), /format PDF/);
  fail(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'sijil.pdf', data: Buffer.from('<html><script>x</script>').toString('base64') }), /format PDF/);
  fail(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'besar.pdf', data: PDF('x'.repeat(5 * 1024 * 1024 + 10)) }), /terlalu besar/);
  fail(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'kosong.pdf', data: '' }), /Tiada fail/);
  const up = ok(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: '../../etc/sijil <b>.pdf', data: PDF() }));
  assert.ok(up.id && !/[\/<>]/.test(up.name), 'nama fail dibersihkan: ' + up.name);
  assert.ok(up.name.endsWith('.pdf'));
});
test('CKAI 9: pengesahan medan (pelajar berbilang, no. KP, sijil wajib, program Lain-lain)', () => {
  const up = () => { const r = ok(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'sijil.pdf', data: PDF('a' + Math.random()) })); return { id: r.id, name: r.name }; };
  const good = award({ sijil: up() });
  fail(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { sijil: undefined })), /betulkan/);
  const r1 = g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { pelajar: [] })); fail(r1, /betulkan/); assert.match(r1.fields.pelajar, /wajib/);
  const r1b = g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { pelajar: 'bukan-senarai' })); fail(r1b, /betulkan/); assert.match(r1b.fields.pelajar, /sekurang-kurangnya seorang/);
  const r2 = g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { pelajar: [{ nama: 'A', matrik: 'M1', nokp: '900101-14-5678' }, { nama: '', matrik: '', nokp: '123' }] }));
  fail(r2, /betulkan/); assert.match(r2.fields.pelajar, /Pelajar 2: nama, no. matrik, no. KP \/ pasport tidak sah/);
  fail(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { mentor: '' })), /betulkan/);
  fail(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { agensi: '' })), /betulkan/);
  fail(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { program: 'Lain-lain' })), /betulkan/); // program_lain wajib
  ok(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { program: 'Lain-lain', program_lain: 'Hackathon Kampus' })));
  fail(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { peringkat: 'Daerah' })), /betulkan/);
  fail(g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { tarikh: '2026-02-30' })), /betulkan/);
  const r31 = g.api_save(awardPic, 'CKAI9', Object.assign({}, good, { pelajar: Array.from({ length: 31 }, (_, i) => ({ nama: 'P' + i, matrik: 'M' + i, nokp: '900101145678' })) }));
  fail(r31, /betulkan/); assert.match(r31.fields.pelajar, /Maksimum 30/);
});
test('CKAI 9: sijil mesti hasil muat naik sendiri; fail Drive sembarangan dan milik pengguna lain ditolak', () => {
  const mine = ok(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'saya.pdf', data: PDF('mine') }));
  const theirs = ok(g.api_uploadFile(awardPicFc, 'CKAI9', 'sijil', { name: 'mereka.pdf', data: PDF('theirs') }));
  const secret = g.DriveApp._outside.createFile(g.Utilities.newBlob([37, 80, 68, 70, 45, 65], 'application/pdf', 'rahsia.pdf')); // fail lain milik pemilik skrip
  const reasons = [
    { id: secret.getId(), name: 'rahsia.pdf' },           // fail di luar folder lampiran
    { id: theirs.id, name: 'mereka.pdf' },                // dimuat naik oleh PIC lain
    { id: 'tidak-wujud-1234567', name: 'x.pdf' },         // ID rekaan
    { id: '../../x', name: 'x.pdf' }                      // format ID tidak sah
  ];
  reasons.forEach(sj => { const r = g.api_save(awardPic, 'CKAI9', award({ sijil: sj })); fail(r, /betulkan/); assert.ok(r.fields.sijil, 'sijil patut ditolak: ' + sj.id); });
  awardRec = ok(g.api_save(awardPic, 'CKAI9', award({ sijil: { id: mine.id, name: 'tipu-nama.pdf' } })));
  assert.strictEqual(awardRec.fakulti, 'FM');
  assert.strictEqual(JSON.parse(awardRec.sijil).name, 'saya.pdf'); // nama diambil daripada muat naik sebenar, bukan daripada klien
  assert.strictEqual(JSON.parse(awardRec.pelajar)[0].nokp, '900101145678'); // sengkang dibuang
});
test('CKAI 9: muat turun hanya oleh PIC fakulti yang sama atau Admin; kandungan sama dan fail luar folder tidak boleh dimuat turun', () => {
  const d = ok(g.api_downloadFile(awardPic, 'CKAI9', awardRec.id, 'sijil'));
  assert.strictEqual(d.base64, PDF('mine')); assert.strictEqual(d.mime, 'application/pdf'); assert.strictEqual(d.name, 'saya.pdf');
  fail(g.api_downloadFile(awardPicFc, 'CKAI9', awardRec.id, 'sijil'), /fakulti lain/);
  fail(g.api_downloadFile(ckaiPic, 'CKAI9', awardRec.id, 'sijil'), /Akses ditolak/);
  fail(g.api_downloadFile('', 'CKAI9', awardRec.id, 'sijil'), /Sesi tamat/);
  ok(g.api_downloadFile(adminToken, 'CKAI9', awardRec.id, 'sijil'));
  fail(g.api_downloadFile(awardPic, 'CKAI9', awardRec.id, 'nama_anugerah'), /tidak sah/);
  fail(g.api_downloadFile(awardPic, 'CKAI9', 'AN-999', 'sijil'), /tidak dijumpai/);
  // rekod dirosakkan terus dalam Sheet supaya merujuk fail di luar folder: mesti tetap ditolak
  const secret = g.DriveApp._outside.createFile(g.Utilities.newBlob([37, 80, 68, 70, 45, 66], 'application/pdf', 'rahsia2.pdf'));
  const sh = env.spreadsheets[env.props.SHEET_ID].getSheetByName('CKAI9_Anugerah');
  const col = sh.data[0].indexOf('sijil'), idCol = sh.data[0].indexOf('id');
  const rowIdx = sh.data.findIndex(r => r[idCol] === awardRec.id);
  assert.ok(rowIdx > 0);
  sh.data[rowIdx][col] = JSON.stringify({ id: secret.getId(), name: 'rahsia2.pdf' });
  fail(g.api_downloadFile(awardPic, 'CKAI9', awardRec.id, 'sijil'), /Fail tidak sah/);
  sh.data[rowIdx][col] = awardRec.sijil; // pulihkan
});
test('CKAI 9: senarai ikut fakulti; kemas kini menggantikan sijil (lama dibuang); padam membuang fail; audit tanpa data peribadi', () => {
  assert.strictEqual(ok(g.api_list(awardPic, 'CKAI9', {})).rows.length, 2); // FM sahaja (rekod 'Lain-lain' + rekod ini)
  assert.strictEqual(ok(g.api_list(awardPicFc, 'CKAI9', {})).rows.length, 0);
  const oldId = JSON.parse(awardRec.sijil).id;
  const nu = ok(g.api_uploadFile(awardPic, 'CKAI9', 'sijil', { name: 'baru.pdf', data: PDF('baru') }));
  const upd = ok(g.api_save(awardPic, 'CKAI9', Object.assign(award(), { id: awardRec.id, nama_anugerah: 'Dikemas kini', sijil: { id: nu.id, name: 'baru.pdf' } })));
  assert.strictEqual(g.DriveApp._files[oldId].trashed, true);
  assert.strictEqual(g.DriveApp._files[nu.id].trashed, false);
  // sijil tidak diubah: rujukan sama diterima tanpa muat naik semula
  ok(g.api_save(awardPic, 'CKAI9', Object.assign(award(), { id: awardRec.id, sijil: JSON.parse(upd.sijil) })));
  fail(g.api_delete(awardPic, 'CKAI9', awardRec.id), /Admin sahaja/);
  ok(g.api_delete(adminToken, 'CKAI9', awardRec.id));
  assert.strictEqual(g.DriveApp._files[nu.id].trashed, true);
  const log = JSON.stringify(ok(g.api_listAudit(adminToken, 200)));
  ['900101145678', '010203101234', 'Ali Anugerah', 'A24FM0001'].forEach(x => assert.ok(!log.includes(x), 'audit mengandungi data peribadi: ' + x));
  assert.ok(log.includes('MUAT_NAIK') && log.includes('MUAT_TURUN'));
});
test('CKAI 9: dashboard mengira anugerah mengikut tarikh; paparan awam tiada nama, matrik, no. KP atau fail', () => {
  const up = (n) => { const r = ok(g.api_uploadFile(adminToken, 'CKAI9', 'sijil', { name: n + '.pdf', data: PDF(n) })); return { id: r.id, name: r.name }; };
  ok(g.api_save(adminToken, 'CKAI9', award({ fakulti: 'FC', peringkat: 'Antarabangsa', kategori: 'Keusahawanan', pingat: 'Perak', nama_anugerah: 'Pertandingan Global', sijil: up('a'), pelajar: [{ nama: 'Rahsia Pelajar', matrik: 'RHS001', nokp: '880808-08-8888' }] })));
  ok(g.api_save(adminToken, 'CKAI9', award({ fakulti: 'FC', tarikh: '2027-02-01', sijil: up('b') })));
  const c = card(dash(2026), 'CKAI9');
  assert.ok(c.value >= 2);
  assert.ok(c.secondary.some(x => x.label === 'Pelajar penerima' && x.value >= 3));
  assert.ok(c.breakdown.some(b => b.title === 'Mengikut program'));
  const sj = JSON.stringify(dash(2026));
  ['Rahsia Pelajar', 'RHS001', '880808088888', 'Ali Anugerah', 'A24FM0001', 'Kementerian', '"id":"FILE'].forEach(x => assert.ok(!sj.includes(x), 'bocor: ' + x));
  assert.strictEqual(card(dash(2027), 'CKAI9').value, 1);
});
test('susunan lajur Sheet tidak penting: tab Pengguna dan KPI ditulis mengikut nama tajuk', () => {
  const ss = env.spreadsheets[env.props.SHEET_ID];
  // tukar ganti lajur 1 dan 2 dalam tab Pengguna (emel <-> nama) sepenuhnya
  const us = ss.getSheetByName('Pengguna');
  us.data = us.data.map(r => { const c = r.slice(); const t = c[0]; c[0] = c[1]; c[1] = t; return c; });
  const t = login('pic.fai@utm.my');
  assert.strictEqual(ok(g.api_session(t)).user.emel, 'pic.fai@utm.my');
  ok(g.api_saveUser(adminToken, { emel: 'tukar.lajur@utm.my', nama: 'Tukar Lajur', peranan: 'PIC', fakulti: 'FAI', kpi_akses: 'KAI1', aktif: 'Ya' }));
  const hdr = us.data[0], row = us.data.find(r => r[hdr.indexOf('emel')] === 'tukar.lajur@utm.my');
  assert.ok(row, 'baris pengguna baharu mesti mengikut tajuk'); assert.strictEqual(row[hdr.indexOf('nama')], 'Tukar Lajur'); assert.strictEqual(row[hdr.indexOf('peranan')], 'PIC');
  ok(g.api_saveUser(adminToken, { emel: 'tukar.lajur@utm.my', nama: 'Nama Baru', peranan: 'PIC', fakulti: 'FAI', kpi_akses: 'KAI1,KAI4', aktif: 'Ya' }));
  assert.strictEqual(us.data.find(r => r[hdr.indexOf('emel')] === 'tukar.lajur@utm.my')[hdr.indexOf('kpi_akses')], 'KAI1,KAI4');
  // tab KPI: susun semula lajur (terbalikkan) dan simpan rekod
  const k = ss.getSheetByName('KAI5_FSIP');
  k.data = k.data.map(r => r.slice().reverse());
  const r = ok(g.api_save(adminToken, 'KAI5', { fakulti: 'FAI', nama_pelajar: 'Lajur Terbalik', no_matrik: 'LT1', status: 'Dicalonkan' }));
  assert.strictEqual(ok(g.api_list(adminToken, 'KAI5', { q: 'Lajur Terbalik' })).rows[0].no_matrik, 'LT1');
  ok(g.api_save(adminToken, 'KAI5', { id: r.id, fakulti: 'FAI', nama_pelajar: 'Lajur Terbalik 2', no_matrik: 'LT1', status: 'Dicalonkan' }));
  assert.strictEqual(ok(g.api_list(adminToken, 'KAI5', { q: 'Lajur Terbalik 2' })).rows.length, 1);
  // pulihkan susunan asal supaya ujian lain tidak terjejas
  us.data = us.data.map(r => { const c = r.slice(); const t = c[0]; c[0] = c[1]; c[1] = t; return c; });
  k.data = k.data.map(r => r.slice().reverse());
});
let innoPic, innoPicFc;
const inno = (over = {}) => Object.assign({
  fakulti: 'FM', tajuk_inovasi: 'Sistem Pintar Kitar Semula', jenis_inovasi: 'Aplikasi / perisian', mentor: 'Dr. Penyelia',
  pelajar: [{ nama: 'Ali Inovator', matrik: 'A24IN0001' }, { nama: 'Siti Inovator', matrik: 'A24IN0002' }],
  status_penyertaan: 'Telah menyertai', nama_pertandingan: 'Pertandingan Inovasi Fakulti', peringkat: 'Fakulti', tarikh: '2026-04-15'
}, over);
test('CKAI 8: akses PIC fakulti; OD = projek yang telah menyertai pertandingan sekurang-kurangnya peringkat Fakulti', () => {
  ok(g.api_saveUser(adminToken, { emel: 'pic.inovasi@utm.my', nama: 'PIC FM', peranan: 'PIC', fakulti: 'FM', kpi_akses: 'CKAI8', aktif: 'Ya' }));
  ok(g.api_saveUser(adminToken, { emel: 'pic.inovasi2@utm.my', nama: 'PIC FS', peranan: 'PIC', fakulti: 'FS', kpi_akses: 'CKAI8', aktif: 'Ya' }));
  innoPic = login('pic.inovasi@utm.my'); innoPicFc = login('pic.inovasi2@utm.my');
  deepEq(ok(g.api_session(innoPic)).kpis.map(k => k.id), ['CKAI8']);
  const a = ok(g.api_save(innoPic, 'CKAI8', inno({ fakulti: 'FKE' })));
  assert.strictEqual(a.fakulti, 'FM'); // dipaksa kepada fakulti PIC
  assert.strictEqual(JSON.parse(a.pelajar)[0].nokp, ''); // no. KP tidak diperlukan bagi CKAI 8
  fail(g.api_save(innoPic, 'CKAI8', inno({ peringkat: 'Dalam kelas' })), /betulkan/); // peringkat paling rendah ialah Fakulti
  fail(g.api_save(innoPic, 'CKAI8', inno({ nama_pertandingan: '' })), /betulkan/);
  fail(g.api_save(innoPic, 'CKAI8', inno({ tarikh: '' })), /betulkan/);
  fail(g.api_save(innoPic, 'CKAI8', inno({ mentor: '' })), /betulkan/);
  fail(g.api_save(innoPic, 'CKAI8', inno({ pelajar: [] })), /betulkan/);
  const r = g.api_save(innoPic, 'CKAI8', inno({ pelajar: [{ nama: '', matrik: 'X' }] })); fail(r, /betulkan/); assert.match(r.fields.pelajar, /Pelajar 1: nama/);
  assert.ok(!/KP/.test(r.fields.pelajar), 'no. KP tidak boleh diminta');
  assert.strictEqual(ok(g.api_list(innoPicFc, 'CKAI8', {})).rows.length, 0);
});
test('CKAI 8: anugerah pilihan; peringkat sasaran wajib apabila calon peningkatan', () => {
  ok(g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Tanpa anugerah' }))); // tiada pingat/anugerah: sah
  const r = g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Calon naik', status_peningkatan: 'Calon peningkatan' }));
  fail(r, /betulkan/); assert.ok(r.fields.peringkat_sasaran);
  ok(g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Calon naik', status_peningkatan: 'Calon peningkatan', peringkat_sasaran: 'Kebangsaan', pertandingan_seterusnya: 'MTE 2026', sokongan_diperlukan: 'Pembiayaan prototaip RM5,000' })));
  ok(g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Menang', pingat: 'Emas', nama_anugerah: 'Anugerah Inovasi Fakulti', peringkat: 'Universiti', nilai_hadiah_rm: 500 })));
  ok(g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Sudah naik', peringkat: 'Kebangsaan', status_peningkatan: 'Telah dibawa ke peringkat lebih tinggi', peringkat_sasaran: 'Antarabangsa' })));
  fail(g.api_save(innoPic, 'CKAI8', inno({ pingat: 'Platinum' })), /betulkan/);
});
test('CKAI 8: hanya inovasi yang TELAH menyertai pertandingan dalam tahun itu dikira; penapis peringkat dan status peningkatan', () => {
  ok(g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Akan menyertai', status_penyertaan: 'Akan menyertai', tarikh: '2026-09-01' })));
  ok(g.api_save(adminToken, 'CKAI8', inno({ fakulti: 'FC', tajuk_inovasi: 'Tahun lain', tarikh: '2027-03-01' })));
  const c = card(dash(2026), 'CKAI8');
  const sec = Object.fromEntries(c.secondary.map(x => [x.label, x.value]));
  assert.strictEqual(c.value, 5); // Tanpa anugerah, Calon naik, Menang, Sudah naik + rekod pertama (FM)
  assert.strictEqual(sec['Memenang anugerah / pingat'], 1);
  assert.strictEqual(sec['Peringkat Universiti ke atas'], 2);
  assert.strictEqual(sec['Calon peningkatan / sedang disokong'], 1);
  assert.strictEqual(sec['Telah dibawa ke peringkat lebih tinggi'], 1);
  assert.strictEqual(sec['Akan menyertai (dirancang)'], 1);
  assert.strictEqual(sec['Pelajar terlibat'], 10);
  deepEq(c.breakdown[0].items.map(i => i.label), ['Fakulti', 'Universiti', 'Kebangsaan']);
  assert.strictEqual(card(dash(2027), 'CKAI8').value, 1);
  assert.strictEqual(c.status, 'Tiada sasaran');
  // penapis: status peningkatan (pipeline XCITE) dan peringkat
  assert.strictEqual(ok(g.api_list(innoPic, 'CKAI8', { status2: 'Calon peningkatan' })).rows.length, 1);
  assert.strictEqual(ok(g.api_list(innoPic, 'CKAI8', { status: 'Kebangsaan' })).rows.length, 1);
  assert.strictEqual(ok(g.api_list(innoPic, 'CKAI8', { status: 'Kebangsaan', status2: 'Calon peningkatan' })).rows.length, 0);
  assert.strictEqual(ok(g.api_list(innoPicFc, 'CKAI8', { status2: 'Calon peningkatan' })).rows.length, 0); // fakulti lain tidak nampak
});
test('CKAI 8: sijil anugerah PDF pilihan; paparan awam tiada tajuk, pelajar atau mentor', () => {
  const pdf = Buffer.from('%PDF-1.4\n%sijil inovasi\n%%EOF').toString('base64');
  const up = ok(g.api_uploadFile(innoPic, 'CKAI8', 'sijil', { name: 'sijil-inovasi.pdf', data: pdf }));
  const rec = ok(g.api_save(innoPic, 'CKAI8', inno({ tajuk_inovasi: 'Dengan sijil', pingat: 'Perak', sijil: { id: up.id, name: up.name } })));
  assert.strictEqual(ok(g.api_downloadFile(innoPic, 'CKAI8', rec.id, 'sijil')).base64, pdf);
  fail(g.api_downloadFile(innoPicFc, 'CKAI8', rec.id, 'sijil'), /fakulti lain/);
  const sj = JSON.stringify(dash(2026));
  ['Sistem Pintar', 'Ali Inovator', 'A24IN0001', 'Dr. Penyelia', 'Pembiayaan prototaip', 'Calon naik', 'sijil-inovasi'].forEach(x => assert.ok(!sj.includes(x), 'bocor: ' + x));
});
let profPic, profPicFc;
const prof = (over = {}) => Object.assign({
  fakulti: 'FM', nama_pelajar: 'Profil Satu', no_matrik: 'A24PF0001', tarikh_profiling: '2026-04-01', sumber_profiling: 'Tinjauan / soal selidik',
  tahap_minat: 'Tinggi', tahap_kesediaan: 'Ada idea', pengalaman_perniagaan: 'Tiada', emel: 'profil1@graduate.utm.my', persetujuan: 'Ya'
}, over);
test('CKAI 1 (fungsi 1 Identify Interest): PIC fakulti mendaftar profiling; persetujuan PDPA wajib', () => {
  ok(g.api_saveUser(adminToken, { emel: 'pic.profil@utm.my', nama: 'PIC FM', peranan: 'PIC', fakulti: 'FM', kpi_akses: 'CKAI1', aktif: 'Ya' }));
  ok(g.api_saveUser(adminToken, { emel: 'pic.profil2@utm.my', nama: 'PIC FS', peranan: 'PIC', fakulti: 'FS', kpi_akses: 'CKAI1', aktif: 'Ya' }));
  profPic = login('pic.profil@utm.my'); profPicFc = login('pic.profil2@utm.my');
  deepEq(ok(g.api_session(profPic)).kpis.map(k => k.id), ['CKAI1']);
  const a = ok(g.api_save(profPic, 'CKAI1', prof({ fakulti: 'FKE' })));
  assert.strictEqual(a.fakulti, 'FM'); assert.strictEqual(a.id.slice(0, 3), 'PF-');
  const r = g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'A24PF0002', persetujuan: 'Tidak' })); fail(r, /betulkan/); assert.match(r.fields.persetujuan, /persetujuan pelajar/);
  const r2 = g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'A24PF0002', persetujuan: '' })); fail(r2, /betulkan/); assert.ok(r2.fields.persetujuan);
  ['tahap_minat', 'sumber_profiling', 'tarikh_profiling', 'no_matrik', 'nama_pelajar'].forEach(k => fail(g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'A24PF0003', [k]: '' })), /betulkan/));
  fail(g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'A24PF0004', tahap_minat: 'Sangat tinggi' })), /betulkan/);
  fail(g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'A24PF0004', emel: 'bukan-emel' })), /betulkan/);
  assert.strictEqual(ok(g.api_list(profPicFc, 'CKAI1', {})).rows.length, 0);
});
test('CKAI 1: satu profil bagi setiap no. matrik (tidak peka huruf besar/kecil); ID rekod fakulti lain tidak didedahkan', () => {
  const dup = g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'a24pf0001' })); fail(dup, /betulkan/); assert.match(dup.fields.no_matrik, /Sudah didaftarkan \(PF-001\)/);
  const other = g.api_save(profPicFc, 'CKAI1', prof({ fakulti: 'FS', no_matrik: 'A24PF0001', nama_pelajar: 'Cuba duplikasi' })); fail(other, /betulkan/);
  assert.match(other.fields.no_matrik, /^Sudah didaftarkan\.$/); // tiada ID kerana rekod milik fakulti lain
  const first = ok(g.api_list(profPic, 'CKAI1', {})).rows[0];
  ok(g.api_save(profPic, 'CKAI1', Object.assign({}, prof(), { id: first.id, tahap_minat: 'Sederhana' }))); // mengemas kini rekod sendiri tidak dianggap duplikasi
  ok(g.api_save(profPic, 'CKAI1', prof({ no_matrik: 'A24PF0005', nama_pelajar: 'Profil Dua', tahap_kesediaan: 'Ada prototaip / MVP', tahap_minat: 'Rendah', sumber_profiling: 'Saringan fakulti' })));
  ok(g.api_save(adminToken, 'CKAI1', prof({ fakulti: 'FC', no_matrik: 'A24PF0006', nama_pelajar: 'Profil Tiga', pengalaman_perniagaan: 'Sedang berniaga', tarikh_profiling: '2027-02-01' })));
  assert.strictEqual(ok(g.api_list(adminToken, 'CKAI1', { status: 'Tinggi' })).rows.length, 1); // penapis tahap minat
  assert.strictEqual(ok(g.api_list(adminToken, 'CKAI1', { status2: 'Ada prototaip / MVP' })).rows.length, 1); // penapis tahap kesediaan
});
test('CKAI 1: dashboard mengira profiling mengikut tahun; paparan awam tiada nama, matrik atau e-mel', () => {
  const c = card(dash(2026), 'CKAI1');
  const sec = Object.fromEntries(c.secondary.map(x => [x.label, x.value]));
  assert.strictEqual(c.value, 2); assert.strictEqual(c.status, 'Tiada sasaran'); assert.strictEqual(c.fungsi, 'minat');
  assert.strictEqual(sec['Berminat (sederhana / tinggi)'], 1); assert.strictEqual(sec['Sudah ada idea / prototaip / berniaga'], 2);
  deepEq(c.breakdown[1].items.map(i => i.label), ['Rendah', 'Sederhana']); // tertib tahap minat
  assert.strictEqual(card(dash(2027), 'CKAI1').value, 1);
  const sj = JSON.stringify(dash(2026));
  ['Profil Satu', 'Profil Dua', 'A24PF0001', 'A24PF0005', 'profil1@graduate.utm.my'].forEach(x => assert.ok(!sj.includes(x), 'bocor: ' + x));
  ok(g.api_saveTarget(adminToken, { kpi: 'CKAI1', tahun: 2026, sasaran: 1 }));
  assert.strictEqual(card(dash(2026), 'CKAI1').status, 'Melebihi sasaran');
});
test('sasaran CKAI diisi Admin: status dan peratus dikira (boleh melebihi 100%)', () => {
  assert.ok(ok(g.api_listTargets(adminToken)).filter(t => /^CKAI/.test(t.kpi)).length >= 45);
  ok(g.api_saveTarget(adminToken, { kpi: 'CKAI7', tahun: 2026, sasaran: 3000 }));
  const c = card(dash(2026), 'CKAI7');
  assert.strictEqual(c.status, 'Melebihi sasaran'); assert.ok(Math.abs(c.pct - 133.3) < 0.1);
  ok(g.api_saveTarget(adminToken, { kpi: 'CKAI2', tahun: 2026, sasaran: 5 }));
  assert.strictEqual(card(dash(2026), 'CKAI2').status, 'Di bawah sasaran');
  assert.strictEqual(card(dash(2026), 'CKAI2').quarterStatus, 'Tiada sasaran suku tahun');
});
test('dashboard awam CKAI tidak mendedahkan nama pelajar, perniagaan atau penyewa', () => {
  const sj = JSON.stringify(dash(2026));
  ['Kedai A', 'Gig B', 'Syarikat A', 'Syarikat B', 'Pelajar SSU', 'SSU-001', 'Launchpad FC', 'pic.ckai'].forEach(x => assert.ok(!sj.includes(x), 'bocor: ' + x));
});
test('setup() dijalankan semula pada pemasangan lama menambah baris sasaran CKAI tanpa menduplikasi', () => {
  const ss = env.spreadsheets[env.props.SHEET_ID];
  const sh = ss.getSheetByName('Sasaran');
  // simulasi pemasangan lama: buang semua baris CKAI
  sh.data = sh.data.filter((row, i) => i === 0 || !/^CKAI/.test(String(row[0])));
  g.setup();
  const rows = ok(g.api_listTargets(adminToken)).filter(t => /^CKAI/.test(t.kpi));
  assert.strictEqual(rows.length, 45);
  g.setup();
  assert.strictEqual(ok(g.api_listTargets(adminToken)).filter(t => /^CKAI/.test(t.kpi)).length, 45);
});

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
  assert.strictEqual(ok(g.api_session(t)).kpis.length, 16);
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

console.log('Persediaan (Admin) dan tab Persediaan dalam Sheet');
test('Persediaan: Admin sahaja', () => {
  fail(g.api_setupInfo(picToken), /Admin sahaja/);
  fail(g.api_runSetup(picToken), /Admin sahaja/);
  fail(g.api_testMail(picToken), /Admin sahaja/);
});
test('Persediaan: maklumat pautan/ID dan semakan lulus', () => {
  const i = ok(g.api_setupInfo(adminToken));
  assert.strictEqual(i.sheet.id, env.props.SHEET_ID);
  assert.ok(/\/exec$/.test(i.webAppUrl) || i.webAppUrl === '' || i.isDevUrl !== undefined);
  assert.ok(i.checks.length >= 8);
  assert.strictEqual(i.checks.filter(c => c.ok === false).length, 0, JSON.stringify(i.checks.filter(c => c.ok === false)));
});
test('tab Persediaan dalam Google Sheet mengandungi ID dan pautan Sheet', () => {
  const sh = env.spreadsheets[env.props.SHEET_ID].getSheetByName('Persediaan');
  assert.ok(sh);
  const txt = JSON.stringify(sh.data);
  assert.ok(txt.includes(env.props.SHEET_ID) && txt.includes('404'));
});
test('Persediaan: tab dan lajur hilang dikesan, dibaiki oleh Jalankan persediaan', () => {
  const ss = env.spreadsheets[env.props.SHEET_ID];
  ss.deleteSheet(ss.getSheetByName('Risiko'));
  let i = ok(g.api_setupInfo(adminToken));
  assert.ok(i.checks.some(c => c.ok === false && /Risiko/.test(c.detail)));
  ok(g.api_runSetup(adminToken));
  i = ok(g.api_setupInfo(adminToken));
  assert.strictEqual(i.checks.filter(c => c.ok === false).length, 0);
});
test('e-mel ujian dihantar ke Admin dan dihadkan 3 sejam', () => {
  const n = env.sent.length;
  ok(g.api_testMail(adminToken)); ok(g.api_testMail(adminToken)); ok(g.api_testMail(adminToken));
  assert.strictEqual(env.sent.length, n + 3);
  fail(g.api_testMail(adminToken), /Had 3/);
});

test('linkSistem membuka pautan web app; tiada onOpen automatik', () => {
  assert.strictEqual(typeof g.onOpen, 'undefined');
  g.linkSistem();
  assert.ok(env.opts.dialog.html.includes('window.open("https://script.google.com/'));
  assert.strictEqual(env.opts.dialog.title, 'Dashboard KPI UTMXCITE JTNCHEPA');
});

test('folder lampiran yang ditampal pada tab Persediaan digunakan oleh setup()', () => {
  const ss = env.spreadsheets[env.props.SHEET_ID];
  const mine = g.DriveApp.createFolder('Folder saya');
  const sh = ss.getSheetByName('Persediaan');
  const r = sh.data.findIndex(row => String(row[0]).indexOf('Folder lampiran Drive') === 0) + 1;
  sh.getRange(r, 2).setValue(mine.getId());
  g.setup();
  assert.strictEqual(env.props.FOLDER_ID, mine.getId());
  assert.ok(String(sh.data[r - 1][1]).includes(mine.getId()));
  sh.getRange(r, 2).setValue('ID-tidak-wujud-xyz-1234567890');
  g.setup();
  assert.strictEqual(env.props.FOLDER_ID, mine.getId());
});

test('medan fail: pautan Drive ditulis dalam lajur *_pautan (Sheet sahaja, tidak dihantar ke klien); setup() mengisi rekod lama', () => {
  const ss = env.spreadsheets[env.props.SHEET_ID];
  const sh = ss.getSheetByName('CKAI5_Makerspace');
  const hdr = sh.data[0];
  assert.ok(hdr.includes('borang') && hdr.includes('borang_pautan'));
  const mkRec = { emel: 'f@utm.my', nama: 'F', no_kp: '990101011234', no_matrik: 'A1', fakulti: 'FC', telefon: '0123456789', peralatan: '3D Printer', tujuan: 'x', bil_peserta: 1, tarikh_mula: '2026-05-01', tarikh_tamat: '2026-05-01', masa_mula: '09:00', masa_tamat: '10:00', status_bayaran: 'Bayar', bayaran_rm: 5 };
  const up = ok(g.api_uploadFile(adminToken, 'CKAI5', 'borang', { name: 'borang.pdf', data: PDF('pautan') }));
  const saved = ok(g.api_save(adminToken, 'CKAI5', Object.assign({ borang: { id: up.id, name: up.name } }, mkRec)));
  assert.ok(!('borang_pautan' in saved));
  assert.ok(ok(g.api_list(adminToken, 'CKAI5', {})).rows.every(r => !('borang_pautan' in r)));
  const col = hdr.indexOf('borang_pautan');
  const row = sh.data.find(r => r[0] === saved.id);
  assert.strictEqual(row[col], 'https://drive.google.com/file/d/' + up.id + '/view');
  row[col] = ''; // rekod lama tanpa pautan
  g.setup();
  assert.strictEqual(sh.data.find(r => r[0] === saved.id)[col], 'https://drive.google.com/file/d/' + up.id + '/view');
});

test('CKAI 4: lampiran Sijil SSM (PDF) disimpan dengan pautan Drive dalam Sheet', () => {
  const up = ok(g.api_uploadFile(adminToken, 'CKAI4', 'sijil_ssm', { name: 'sijil-ssm.pdf', data: PDF('ssm') }));
  const r = ok(g.api_save(adminToken, 'CKAI4', { fakulti: 'FC', nama_pelajar: 'Pelajar SSM', no_kp: '990101011234', no_matrik: 'S77', jenis_perniagaan: 'Pertanian', bil_rakan_kongsi: 2, status_ssm: 'Berdaftar', tarikh_ssm: '2026-01-15', sijil_ssm: { id: up.id, name: up.name }, nama_syarikat: 'Syarikat SSM', no_ssu: 'SSU-777', tarikh_daftar: '2026-04-01', status: 'Aktif' }));
  const sh = env.spreadsheets[env.props.SHEET_ID].getSheetByName('CKAI4_SSU');
  const row = sh.data.find(x => x[0] === r.id);
  assert.strictEqual(row[sh.data[0].indexOf('sijil_ssm_pautan')], 'https://drive.google.com/file/d/' + up.id + '/view');
  fail(g.api_uploadFile(adminToken, 'CKAI4', 'sijil_ssm', { name: 'x.pdf', data: Buffer.from('bukan pdf').toString('base64') }), /PDF/);
});

test('CKAI 4: rakan kongsi (nama, no. matrik, no. KP), maksimum 12, selaras dengan bilangan rakan kongsi', () => {
  const base = { fakulti: 'FC', nama_pelajar: 'Pemilik', no_kp: '990101011234', no_matrik: 'S90', jenis_perniagaan: 'Pembinaan', status_ssm: 'Berdaftar', tarikh_ssm: '2026-01-15', nama_syarikat: 'Syarikat RK', tarikh_daftar: '2026-04-02', status: 'Aktif' };
  const p = (n) => Array.from({ length: n }, (_, i) => ({ nama: 'Rakan ' + (i + 1), matrik: 'M' + (i + 1), nokp: '0001010' + (10000 + i) }));
  const r = ok(g.api_save(adminToken, 'CKAI4', Object.assign({}, base, { no_ssu: 'SSU-801', bil_rakan_kongsi: 13, rakan_kongsi: p(12) })));
  const row = ok(g.api_list(adminToken, 'CKAI4', {})).rows.find(x => x.id === r.id);
  assert.strictEqual(JSON.parse(row.rakan_kongsi).length, 12);
  assert.strictEqual(JSON.parse(row.rakan_kongsi)[0].nokp, '000101010000');
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, base, { no_ssu: 'SSU-802', bil_rakan_kongsi: 13, rakan_kongsi: p(13) })), /betulkan/); // lebih 12
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, base, { no_ssu: 'SSU-803', bil_rakan_kongsi: 14 })), /betulkan/); // lebih 13
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, base, { no_ssu: 'SSU-804', bil_rakan_kongsi: 3, rakan_kongsi: p(3) })), /betulkan/); // 3 > 3-1
  fail(g.api_save(adminToken, 'CKAI4', Object.assign({}, base, { no_ssu: 'SSU-805', bil_rakan_kongsi: 2, rakan_kongsi: [{ nama: 'A', matrik: '', nokp: '12' }] })), /betulkan/);
  ok(g.api_save(adminToken, 'CKAI4', Object.assign({}, base, { no_ssu: 'SSU-806', bil_rakan_kongsi: 1 }))); // pemilik tunggal, tanpa senarai
});

test('KAI 4 (GiGA): No. KP / pasport wajib, disahkan dan sengkang dibuang', () => {
  const b = { fakulti: 'FAI', nama_pelajar: 'Kp Uji', no_matrik: 'KP1', status: 'Memohon' };
  fail(g.api_save(adminToken, 'KAI4', b), /betulkan/);
  fail(g.api_save(adminToken, 'KAI4', Object.assign({}, b, { no_kp: '12' })), /betulkan/);
  const r = ok(g.api_save(adminToken, 'KAI4', Object.assign({}, b, { no_kp: '000101-10-1234' })));
  assert.strictEqual(String(ok(g.api_list(adminToken, 'KAI4', {})).rows.find(x => x.id === r.id).no_kp).replace(/^'/, ''), '000101101234');
  assert.ok(!JSON.stringify(dash(2026)).includes('000101101234')); // tidak didedahkan kepada awam
});

console.log('\n' + passed + ' lulus, ' + failed + ' gagal');
process.exit(failed ? 1 : 0);
