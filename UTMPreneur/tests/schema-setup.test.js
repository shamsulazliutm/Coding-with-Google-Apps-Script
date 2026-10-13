'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./gas-mock');

test('fail dimuat dalam sebarang urutan (tiada kebergantungan semasa muat)', () => {
  assert.doesNotThrow(() => createEnv());
  assert.doesNotThrow(() => createEnv({ reverse: true }));
});

test('nama tab unik merentas semua spreadsheet', () => {
  const env = createEnv();
  const dup = env.plain(env.run(`(function(){
    var seen = {}, d = [];
    Object.keys(SCHEMA).forEach(function(k){ Object.keys(SCHEMA[k].tabs).forEach(function(t){ if (seen[t]) d.push(t); seen[t]=1; }); });
    return d; })()`));
  assert.deepEqual(dup, []);
});

test('tajuk lajur tiada pendua dalam satu tab', () => {
  const env = createEnv();
  const bad = env.plain(env.run(`(function(){
    var bad = [];
    Object.keys(SCHEMA).forEach(function(k){ Object.keys(SCHEMA[k].tabs).forEach(function(t){
      var h = SCHEMA[k].tabs[t]; var s = {};
      h.forEach(function(x){ if (s[x]) bad.push(t+':'+x); s[x]=1; }); }); });
    return bad; })()`));
  assert.deepEqual(bad, []);
});

test('lajur TEXT_COLS wujud dalam skema', () => {
  const env = createEnv();
  const bad = env.plain(env.run(`(function(){
    var bad=[];
    Object.keys(TEXT_COLS).forEach(function(t){
      var kod = TAB_SS[t]; if(!kod){ bad.push('tab tiada: '+t); return; }
      TEXT_COLS[t].forEach(function(h){ if (SCHEMA[kod].tabs[t].indexOf(h)<0) bad.push(t+':'+h); }); });
    return bad; })()`));
  assert.deepEqual(bad, []);
});

test('data awal hanya menggunakan lajur yang wujud dalam skema', () => {
  const env = createEnv();
  const bad = env.plain(env.run(`(function(){
    var map = { Rujukan: Seed.rujukan(), Lot: Seed.lot(), Rubrik: Seed.rubrik(), KADAR: Seed.kadar(), PELAJAR: Seed.pelajarContoh(), Tetapan: Seed.tetapan(), Admin: Seed.admin() };
    var bad = [];
    Object.keys(map).forEach(function(t){
      var hdr = SCHEMA[TAB_SS[t]].tabs[t];
      map[t].forEach(function(row, i){ Object.keys(row).forEach(function(k){ if (hdr.indexOf(k)<0) bad.push(t+'['+i+']:'+k); }); });
    });
    return bad; })()`));
  assert.deepEqual(bad, []);
});

test('rubrik lot berjumlah 100 markah dan 6 kriteria', () => {
  const env = createEnv();
  const r = env.plain(env.run(`(function(){ var s=0; var r = Seed.rubrik(); r.forEach(function(x){ s+=x.Markah_Maks; }); return {n:r.length, total:s}; })()`));
  assert.equal(r.n, 6);
  assert.equal(r.total, 100);
});

test('15 lot awal: SM-01..SM-10 dan SUB-01..SUB-05, semuanya Ditutup dan Kosong', () => {
  const env = createEnv();
  const lots = env.plain(env.run('Seed.lot()'));
  assert.equal(lots.length, 15);
  assert.equal(lots[0].Kod_Lot, 'SM-01');
  assert.equal(lots[9].Kod_Lot, 'SM-10');
  assert.equal(lots[10].Kod_Lot, 'SUB-01');
  assert.equal(lots[14].Kod_Lot, 'SUB-05');
  assert.ok(lots.every((l) => l.Status_Buka === 'Ditutup' && l.Status_Lot === 'Kosong'));
  assert.equal(new Set(lots.map((l) => l.Kod_Lot)).size, 15);
});

test('KADAR: tiga jenis pengguna bagi setiap sumber; nilai dalam borang diisi, selebihnya kosong', () => {
  const env = createEnv();
  const k = env.plain(env.run('Seed.kadar()'));
  const by = {};
  k.forEach((r) => { (by[r.Kod_Sumber] = by[r.Kod_Sumber] || []).push(r); });
  Object.values(by).forEach((rows) => assert.equal(rows.length, 3));
  assert.equal(by.LASER_CUT[0].Kadar_RM, 1);
  assert.equal(by.RUANG_CAJ_PERKHIDMATAN[0].Kadar_RM, 150);
  assert.equal(by.RUANG_MAKER_LAB[0].Kadar_RM, '');
  assert.equal(by['3D_PRINTER_GRAM'][0].Kadar_RM, '');
  assert.equal(by['3D_PRINTER_JAM'][0].Kadar_RM, '');
});

test('MIKRO_KREDIT_MIN dan MAKS dalam Tetapan: 500 dan 3000', () => {
  const env = createEnv();
  const t = env.plain(env.run('Seed.tetapan()'));
  const g = (k) => t.find((x) => x.Kunci === k).Nilai;
  assert.equal(g('MIKRO_KREDIT_MIN'), '500');
  assert.equal(g('MIKRO_KREDIT_MAKS'), '3000');
  assert.equal(g('MAKS_AHLI_SSU'), '12');
  assert.equal(g('JANA_BIL_SEWA_HARI'), '5');
  assert.equal(g('TARIKH_AKHIR_SEWA_HARI'), '10');
  assert.equal(g('TARIKH_AKHIR_LAPORAN_HARI'), '7');
  assert.equal(new Set(t.map((x) => x.Kunci)).size, t.length);
});

// ---------- Setup ----------

test('setup() mencipta semua spreadsheet, tab, folder dan Link_Dokumen dalam folder Induk', () => {
  const env = createEnv();
  const r = env.plain(env.setup('UJI'));
  assert.equal(r.selesai, true);
  assert.deepEqual(r.masalah, []);

  // 5 spreadsheet baharu dicipta (selain Induk), semuanya dalam folder Induk
  const created = env.state.created;
  assert.equal(created.length, 5);
  assert.ok(created.every((n) => n.endsWith('(UJI)')));
  const folderId = env.folder.id;
  Object.keys(env.state.files).forEach((id) => {
    assert.equal(env.state.files[id].parents[0].id, folderId, 'fail mesti dalam folder Induk');
  });

  // Semua tab wujud, tanpa lembaran lalai
  const names = (ss) => ss.getSheets().map((s) => s.getName());
  const ind = env.induk;
  assert.ok(names(ind).includes('PELAJAR') && names(ind).includes('Link_Dokumen') && names(ind).includes('Admin'));

  // Folder dicipta dalam folder Induk
  assert.equal(env.folder.children.length, 9);

  // Link_Dokumen mengandungi 6 spreadsheet + 9 folder + 3 dokumen
  const links = env.plain(env.run('Db.links()'));
  assert.equal(Object.keys(links).length, 18);
  ['SS_INDUK', 'SS_PROFILING', 'SS_SSU', 'SS_RUANG_NIAGA', 'SS_KEWANGAN', 'SS_TEMPAHAN_RUANG', 'FLD_SIJIL_SSU', 'FLD_TEMPLAT_SIJIL'].forEach((k) => assert.ok(links[k], k));
  assert.ok(links.SS_SSU.id.length >= 25);

  // Data awal
  assert.equal(env.plain(env.run("Db.rows('Lot').length")), 15);
  assert.equal(env.plain(env.run("Db.rows('Rubrik').length")), 6);
  assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 8); // pelajar contoh MOD UJI
  assert.equal(env.plain(env.run("Db.rows('Admin')[0].Emel")), 'utmxcite@utm.my');
  assert.ok(env.plain(env.run("Db.rows('Tetapan').length")) >= 30);
  assert.ok(r.langkah.some((l) => l.includes('PENGUJI_EMEL')), 'peringatan PENGUJI_EMEL');
});

test('setup() selamat dijalankan semula (tiada pendua)', () => {
  const env = createEnv();
  env.setup('UJI');
  const before = {
    created: env.state.created.length,
    lot: env.plain(env.run("Db.rows('Lot').length")),
    tetapan: env.plain(env.run("Db.rows('Tetapan').length")),
    links: Object.keys(env.plain(env.run('Db.links()'))).length,
    folders: env.folder.children.length
  };
  const r = env.plain(env.run('Setup.run()'));
  assert.equal(r.selesai, true);
  assert.equal(env.state.created.length, before.created, 'tiada spreadsheet baharu');
  assert.equal(env.plain(env.run("Db.rows('Lot').length")), before.lot);
  assert.equal(env.plain(env.run("Db.rows('Tetapan').length")), before.tetapan);
  assert.equal(Object.keys(env.plain(env.run('Db.links()'))).length, before.links);
  assert.equal(env.folder.children.length, before.folders);
  assert.equal(env.plain(env.run("Db.rows('Admin').length")), 1);
});

test('MOD PRODUKSI: tiada pelajar contoh dan nama tanpa (UJI)', () => {
  const env = createEnv();
  env.setup('PRODUKSI');
  assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 0);
  assert.ok(env.state.created.every((n) => !n.includes('(UJI)')));
});

test('pengesah struktur mengesan tab dan lajur yang hilang', () => {
  const env = createEnv();
  env.setup('UJI');
  assert.equal(env.plain(env.run('Setup.validate().ok')), true);
  // buang satu tab
  const ssu = env.state.spreadsheets[env.plain(env.run("Db.links().SS_SSU.id"))];
  ssu.deleteSheet(ssu.getSheetByName('Ahli_Pasukan'));
  env.run('Db.reset()');
  const v = env.plain(env.run('Setup.validate()'));
  assert.equal(v.ok, false);
  assert.ok(v.masalah.some((m) => m.includes('Ahli_Pasukan')));
});

test('setup menambah lajur skema yang tiada tanpa memadam data sedia ada', () => {
  const env = createEnv();
  env.setup('UJI');
  const sh = env.induk.getSheetByName('Pengguna');
  // simulasi skema lama: padam lajur terakhir dari tajuk dan isi data
  const hdr = sh.data[0].slice();
  const last = hdr.pop();
  sh.data[0] = hdr;
  sh.data[1] = ['x@utm.my', 'Staf'];
  const r = env.plain(env.run('Setup.run()'));
  assert.ok(r.langkah.some((l) => l.includes('Lajur ditambah pada Pengguna') && l.includes(last)));
  assert.equal(sh.data[1][0], 'x@utm.my', 'data tidak dipadam');
  assert.equal(env.plain(env.run('Setup.validate().ok')), true);
});

test('lajur teks ditetapkan (No_Matrik, No_KP_Pasport, telefon)', () => {
  const env = createEnv();
  env.setup('UJI');
  const sh = env.induk.getSheetByName('PELAJAR');
  const hdr = sh.data[0];
  [ 'No_Matrik', 'No_KP_Pasport', 'No_Telefon' ].forEach((h) => assert.equal(sh.formats[hdr.indexOf(h) + 1], '@', h));
});
