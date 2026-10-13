'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./gas-mock');

const HDR = 'No_Matrik,Nama_Penuh,Emel,No_KP_Pasport,Jantina,Etnik,Kewarganegaraan,Fakulti,Program,Tahun_Pengajian,No_Telefon,Status_Pelajar';
const row = (m, n, e, kp, j, f, t) => `${m},${n},${e},${kp},${j},Melayu,Warganegara,${f || 'Fakulti Komputeran'},BSc X,${t || 2},0123456789,Aktif`;

function ready() {
  const env = createEnv();
  env.setup('PRODUKSI'); // PELAJAR kosong
  return env;
}
const imp = (env, csv, opts) => env.plain(env.run(`PelajarImport.run({email:'utmxcite@utm.my', role:'Admin Penuh'}, ${JSON.stringify(Object.assign({ csv }, opts || {}))})`));

test('dryRun: tiada apa-apa ditulis', () => {
  const env = ready();
  const csv = [HDR, row('A1000001', 'Aina', 'a1@graduate.utm.my', '010101-01-0001', 'P'), row('A1000002', 'Budi', 'b1@graduate.utm.my', '010101-01-0002', 'L')].join('\n');
  const r = imp(env, csv, { dryRun: true });
  assert.equal(r.jumlahRalat, 0);
  assert.equal(r.ditambah, 2);
  assert.equal(r.ditulis, false);
  assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 0);
});

test('import sebenar: data dinormalkan (huruf besar, emel kecil, jantina, tahun)', () => {
  const env = ready();
  const csv = [HDR, row('a1000001', 'aina binti ali', 'A1@Graduate.UTM.my', '010101 01 0001', 'p')].join('\n');
  const r = imp(env, csv, { dryRun: false });
  assert.equal(r.ditulis, true);
  const rows = env.plain(env.run("Db.rows('PELAJAR')"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].No_Matrik, 'A1000001');
  assert.equal(rows[0].Nama_Penuh, 'AINA BINTI ALI');
  assert.equal(rows[0].Emel, 'a1@graduate.utm.my');
  assert.equal(rows[0].No_KP_Pasport, '010101010001');
  assert.equal(rows[0].Jantina, 'Perempuan');
  assert.equal(rows[0].Tahun_Pengajian, 2);
  assert.equal(rows[0].Status_Pelajar, 'Aktif');
});

test('ralat: matrik pendua, emel tidak sah, jantina tidak sah, tahun tidak sah; tiada apa-apa ditulis', () => {
  const env = ready();
  const csv = [HDR,
    row('A1000001', 'Aina', 'a1@graduate.utm.my', '1', 'P'),
    row('A1000001', 'Aina2', 'a2@graduate.utm.my', '2', 'P'),
    row('A1000003', 'Cik', 'bukan-emel', '3', 'P'),
    row('A1000004', 'Dani', 'd@graduate.utm.my', '4', 'X'),
    row('A1000005', 'Eka', 'e@graduate.utm.my', '5', 'L', 'Fakulti Komputeran', 9)
  ].join('\n');
  const r = imp(env, csv, { dryRun: false });
  assert.equal(r.ditulis, false);
  assert.equal(r.jumlahRalat, 4);
  const txt = JSON.stringify(r.ralat);
  assert.ok(txt.includes('pendua'));
  assert.ok(txt.includes('Emel tidak sah'));
  assert.ok(txt.includes('Jantina tidak sah'));
  assert.ok(txt.includes('Tahun_Pengajian'));
  assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 0);
});

test('emel yang sama bagi dua No. Matrik berbeza ditolak', () => {
  const env = ready();
  const csv = [HDR, row('A1000001', 'A', 'sama@graduate.utm.my', '1', 'P'), row('A1000002', 'B', 'sama@graduate.utm.my', '2', 'L')].join('\n');
  const r = imp(env, csv, { dryRun: true });
  assert.equal(r.jumlahRalat, 1);
  assert.ok(r.ralat[0].mesej.includes('Emel digunakan'));
});

test('lajur wajib hilang: ralat tajuk dengan senarai lajur', () => {
  const env = ready();
  assert.throws(() => env.run(`PelajarImport.run({email:'x',role:'Admin Penuh'}, {csv: 'No_Matrik,Nama_Penuh\\nA1,B'})`), (e) => e.code === 'CSV_TAJUK' && /Emel/.test(e.bm));
  assert.throws(() => env.run(`PelajarImport.run({email:'x',role:'Admin Penuh'}, {csv: ''})`), (e) => e.code === 'CSV_KOSONG');
});

test('tajuk tidak peka huruf dan ruang; lajur tidak dikenali dilaporkan', () => {
  const env = ready();
  const csv = 'no matrik,NAMA_PENUH,emel,no_kp_pasport,jantina,etnik,kewarganegaraan,fakulti,program,tahun_pengajian,LAJUR_ASING\nA1000009,Z,z@graduate.utm.my,9,L,Melayu,Warganegara,Fakulti Komputeran,P,1,x';
  const r = imp(env, csv, { dryRun: true });
  assert.equal(r.jumlahRalat, 0, JSON.stringify(r.ralat));
  assert.deepEqual(r.lajurTidakDikenali, ['LAJUR_ASING']);
});

test('gabung: kemas kini No. Matrik sedia ada, tambah yang baharu, kekalkan yang tidak disebut', () => {
  const env = ready();
  imp(env, [HDR, row('A1000001', 'Aina', 'a1@graduate.utm.my', '1', 'P'), row('A1000002', 'Budi', 'b1@graduate.utm.my', '2', 'L')].join('\n'), { dryRun: false });
  const r = imp(env, [HDR, row('A1000002', 'Budi Baharu', 'b1@graduate.utm.my', '2', 'L', 'Fakulti Sains', 3), row('A1000003', 'Cik', 'c1@graduate.utm.my', '3', 'P')].join('\n'), { dryRun: false, mod: 'gabung' });
  assert.equal(r.ditambah, 1);
  assert.equal(r.dikemaskini, 1);
  const rows = env.plain(env.run("Db.rows('PELAJAR')"));
  assert.equal(rows.length, 3);
  const b = rows.find((x) => x.No_Matrik === 'A1000002');
  assert.equal(b.Nama_Penuh, 'BUDI BAHARU');
  assert.equal(b.Fakulti, 'Fakulti Sains');
  assert.ok(rows.find((x) => x.No_Matrik === 'A1000001'));
});

test('gabung: emel baharu yang sudah dimiliki No. Matrik lain dalam jadual ditolak', () => {
  const env = ready();
  imp(env, [HDR, row('A1000001', 'Aina', 'a1@graduate.utm.my', '1', 'P')].join('\n'), { dryRun: false });
  const r = imp(env, [HDR, row('A1000002', 'Budi', 'a1@graduate.utm.my', '2', 'L')].join('\n'), { dryRun: false });
  assert.equal(r.ditulis, false);
  assert.equal(r.jumlahRalat, 1);
  assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 1);
});

test('ganti: semua data lama digantikan', () => {
  const env = ready();
  imp(env, [HDR, row('A1000001', 'Aina', 'a1@graduate.utm.my', '1', 'P'), row('A1000002', 'Budi', 'b1@graduate.utm.my', '2', 'L')].join('\n'), { dryRun: false });
  const r = imp(env, [HDR, row('A1000009', 'Zaki', 'z1@graduate.utm.my', '9', 'L')].join('\n'), { dryRun: false, mod: 'ganti' });
  assert.equal(r.ditulis, true);
  const rows = env.plain(env.run("Db.rows('PELAJAR')"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].No_Matrik, 'A1000009');
});

test('amaran: fakulti tiada dalam Rujukan dan emel bukan domain pelajar tidak menghalang import', () => {
  const env = ready();
  const csv = [HDR, row('A1000001', 'Aina', 'a1@gmail.com', '1', 'P', 'Fakulti Rekaan')].join('\n');
  const r = imp(env, csv, { dryRun: false });
  assert.equal(r.jumlahRalat, 0);
  assert.equal(r.jumlahAmaran, 2);
  assert.equal(r.ditulis, true);
});

test('fakulti dalam Rujukan (BM, EN atau Kod) tidak menimbulkan amaran', () => {
  const env = ready();
  const csv = [HDR,
    row('A1000001', 'A', 'a1@graduate.utm.my', '1', 'P', 'Fakulti Komputeran'),
    row('A1000002', 'B', 'b1@graduate.utm.my', '2', 'P', 'Faculty of Computing'),
    row('A1000003', 'C', 'c1@graduate.utm.my', '3', 'P', 'FC')].join('\n');
  const r = imp(env, csv, { dryRun: true });
  assert.equal(r.jumlahAmaran, 0, JSON.stringify(r.amaran));
});

test('import pelajar besar (2000 baris) dan CSV titik koma serta medan berpetik', () => {
  const env = ready();
  const lines = [HDR.replace(/,/g, ';')];
  for (let i = 1; i <= 2000; i++) {
    const m = 'B' + String(i).padStart(7, '0');
    lines.push([m, '"NAMA, BERKOMA ' + i + '"', 'u' + i + '@graduate.utm.my', '0101010100' + (i % 10), 'L', 'Melayu', 'Warganegara', 'Fakulti Komputeran', 'BSc', 1, '0123', 'Aktif'].join(';'));
  }
  const r = imp(env, lines.join('\n'), { dryRun: false });
  assert.equal(r.jumlahRalat, 0, JSON.stringify(r.ralat.slice(0, 3)));
  assert.equal(r.ditulis, true);
  const rows = env.plain(env.run("Db.rows('PELAJAR')"));
  assert.equal(rows.length, 2000);
  assert.equal(rows[0].Nama_Penuh, 'NAMA, BERKOMA 1');
});

test('import direkod dalam Audit', () => {
  const env = ready();
  imp(env, [HDR, row('A1000001', 'Aina', 'a1@graduate.utm.my', '1', 'P')].join('\n'), { dryRun: false });
  const acts = env.plain(env.run("Db.rows('Audit').map(function(r){return r.Tindakan;})"));
  assert.ok(acts.includes('IMPORT_PELAJAR'));
});

test('pelajar yang diimport boleh log masuk dan menuntut No. Matrik (hujung ke hujung)', () => {
  const env = ready();
  env.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci==='PENGUJI_EMEL'; })[0]; Db.update('Tetapan', r._row, {Nilai:'x'}); Cfg.invalidate(); })()`);
  // MOD PRODUKSI: tiada senarai putih
  imp(env, [HDR, row('A1000001', 'Aina', 'a1@graduate.utm.my', '010101010001', 'P')].join('\n'), { dryRun: false });
  const call = (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`));
  assert.equal(call('otp.minta', null, { emel: 'a1@graduate.utm.my' }).ok, true);
  const v = call('otp.sahkan', null, { emel: 'a1@graduate.utm.my', kod: env.lastCode('a1@graduate.utm.my') });
  assert.equal(v.ok, true);
  assert.equal(v.data.session.perlu, 'MATRIK');
  const c = call('daftar.matrik', v.data.token, { noMatrik: 'A1000001' });
  assert.equal(c.ok, true);
  assert.equal(c.data.nama, 'AINA');
});
