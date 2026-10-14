'use strict';
/** Ujian pelayan modul Kewangan (laporan kewangan bulanan). Tarikh kerja harian dikawal melalui parameter hari. */
const test = require('node:test');
const { ready, call, login, student, profiled, setCfg, SSU, PDF, b64, assert } = require('./helpers');
const K = require('./kew-helpers');
const { AINA, AMIRUL, WEIJIE, ADMIN, addPer, addAhli, addSewaan, jobAt, lap, rows, setLap, XLSX, XLS, pegawai, peranan, rel } = K;

const P = (id, o) => Object.assign({ id, tiadaAktiviti: false, pendapatan: '1500.50', perbelanjaan: '800', perakuan: true }, o || {});
const kewMail = (env, emel, re) => env.sentTo(emel).filter((m) => re.test(m.subject));

/** Adegan: perniagaan PRN-0001 milik Aina (ahli: Amirul), laporan Sep 2026 dijana, pelajar sudah log masuk. */
function scene() {
  const env = ready();
  addPer(env, {});
  addAhli(env, 'SSU-2026-0001', 'PRN-0001', 'A23UJ0001', ['A23UJ0002']);
  jobAt(env, '2026-10-05');
  const aina = student(env, AINA), amirul = student(env, AMIRUL), weijie = student(env, WEIJIE);
  const admin = login(env, ADMIN).token;
  return { env, aina, amirul, weijie, admin, id: lap(env)[0].id };
}

test('Kewangan: laluan didaftar dalam rpcTable dan kunci Tetapan baharu wujud', () => {
  const env = ready();
  const t = env.plain(env.run('Object.keys(rpcTable_()).filter(function (k) { return k.indexOf("kew.") === 0; })'));
  ['kew.saya', 'kew.dapat', 'kew.hantar', 'kew.fail', 'kew.templat', 'kew.admin.senarai', 'kew.admin.butiran', 'kew.admin.putus', 'kew.admin.csv', 'kew.admin.jana', 'kew.admin.hantar']
    .forEach((k) => assert.ok(t.includes(k), 'tiada laluan ' + k));
  assert.equal(rows(env, 'Tetapan').filter((r) => r.Kunci === 'KEW_PERINGATAN_HARI_SEBELUM').length, 1);
  assert.equal(call(env, 'kew.saya', null).error.code, 'SESI_TAMAT');
});

test('Jana: bermula dari bulan terkemudian (pendaftaran/dicipta), tertunggak, idempotent, hari jana dan status SSU', () => {
  const env = ready();
  addPer(env, { id: 'PRN-0001', daftar: '2026-07-15', dicipta: '2026-07-15' });
  addPer(env, { id: 'PRN-0002', nama: 'LAIN', matrik: 'A23UJ0002', daftar: '2026-05-10', dicipta: '2026-08-20', status: 'Tamat Tempoh' });
  addPer(env, { id: 'PRN-0003', nama: 'TUTUP', matrik: 'A22UJ0003', status: 'Ditutup' });
  let h = jobAt(env, '2026-09-30'); // laporan September belum dijana (1hb Oktober)
  assert.equal(h.dijana, 3);
  let l = lap(env);
  assert.deepEqual(l.filter((x) => x.per === 'PRN-0001').map((x) => x.bulan).sort(), [7, 8]);
  assert.deepEqual(l.filter((x) => x.per === 'PRN-0002').map((x) => x.bulan), [8], 'bermula dari bulan terkemudian: Ogos, bukan Mei');
  assert.equal(l.filter((x) => x.per === 'PRN-0003').length, 0, 'perniagaan bukan Aktif/Tamat Tempoh tidak melapor');
  h = jobAt(env, '2026-10-01');
  assert.equal(h.dijana, 2, 'September dijana pada 1hb');
  l = lap(env);
  assert.equal(l.length, 5);
  const by = (per, b) => l.find((x) => x.per === per && x.bulan === b);
  assert.equal(by('PRN-0001', 7).status, 'Lewat');
  assert.equal(by('PRN-0001', 7).akhir, '2026-08-07');
  assert.equal(by('PRN-0001', 8).akhir, '2026-09-07');
  assert.equal(by('PRN-0001', 9).status, 'Belum Dihantar');
  assert.equal(by('PRN-0001', 9).akhir, '2026-10-07');
  l.forEach((x) => assert.match(x.id, /^LKB-2026-\d{4}$/));
  assert.equal(new Set(l.map((x) => x.id)).size, 5, 'ID unik');
  // idempotent
  const h2 = jobAt(env, '2026-10-01');
  assert.equal(h2.dijana, 0);
  assert.equal(h2.lewat, 0);
  assert.equal(lap(env).length, 5);
  // tahun baharu: ID ikut tahun laporan, tarikh akhir merentas tahun
  addPer(env, { id: 'PRN-0004', nama: 'DISEMBER', matrik: 'A24UJ0004', daftar: '2026-12-05', dicipta: '2026-12-05' });
  jobAt(env, '2027-01-02');
  const dis = lap(env).find((x) => x.per === 'PRN-0004');
  assert.equal(dis.bulan, 12);
  assert.equal(dis.akhir, '2027-01-07');
  assert.match(dis.id, /^LKB-2026-\d{4}$/);
});

test('Jana: hormati JANA_LAPORAN_HARI dan TARIKH_AKHIR_LAPORAN_HARI daripada Tetapan', () => {
  const env = ready();
  setCfg(env, 'JANA_LAPORAN_HARI', '5');
  setCfg(env, 'TARIKH_AKHIR_LAPORAN_HARI', '10');
  addPer(env, { daftar: '2026-08-10', dicipta: '2026-08-10' });
  jobAt(env, '2026-10-03');
  assert.deepEqual(lap(env).map((x) => x.bulan), [8], 'September belum dijana sebelum 5hb');
  assert.equal(lap(env)[0].akhir, '2026-09-10');
  jobAt(env, '2026-10-05');
  assert.deepEqual(lap(env).map((x) => x.bulan), [8, 9]);
  assert.equal(lap(env)[1].akhir, '2026-10-10');
});

test('Jana: tertunggak dihadkan kepada 36 bulan; perniagaan tanpa tarikh dilangkau', () => {
  const env = ready();
  addPer(env, { id: 'PRN-0001', daftar: '2015-01-10', dicipta: '2015-01-10' });
  env.run(`Db.append('Perniagaan', { ID_Perniagaan: 'PRN-0009', Nama_Perniagaan: 'TIADA TARIKH', No_Matrik_Pemilik: 'A23UJ0002', Status_SSU: 'Aktif' })`);
  jobAt(env, '2026-10-05');
  assert.equal(lap(env).length, 36);
  assert.equal(lap(env).filter((x) => x.per === 'PRN-0009').length, 0);
});

test('Lewat: Belum Dihantar menjadi Lewat selepas tarikh akhir sahaja (7hb masih sempat), direkod dalam audit', () => {
  const env = ready();
  addPer(env, {});
  jobAt(env, '2026-10-07');
  assert.equal(lap(env)[0].status, 'Belum Dihantar');
  const h = jobAt(env, '2026-10-08');
  assert.equal(h.lewat, 1);
  assert.equal(lap(env)[0].status, 'Lewat');
  assert.equal(rows(env, 'Audit').filter((a) => a.Tindakan === 'KEW_LEWAT').length, 1);
  assert.equal(jobAt(env, '2026-10-09').lewat, 0);
});

test('Peringatan: hari jana, dua hari sebelum, susulan setiap 3 hari; sekali sahaja; menampung hari terlepas', () => {
  const env = ready();
  addPer(env, {});
  const n = (re) => kewMail(env, AINA, re).length;
  jobAt(env, '2026-10-01');
  assert.equal(n(/Sila hantar laporan kewangan/), 1);
  jobAt(env, '2026-10-01');
  assert.equal(n(/Sila hantar laporan kewangan/), 1, 'tidak berulang pada hari yang sama');
  jobAt(env, '2026-10-03');
  assert.equal(env.sentTo(AINA).length, 1, 'tiada peringatan baharu pada 3hb');
  jobAt(env, '2026-10-05');
  assert.equal(n(/tarikh akhir laporan kewangan hampir tiba/), 1);
  jobAt(env, '2026-10-05');
  assert.equal(n(/hampir tiba/), 1);
  jobAt(env, '2026-10-08'); // lewat 1 hari
  assert.equal(n(/telah lewat/), 1);
  jobAt(env, '2026-10-10'); // hari ke-3 lewat: masih kumpulan pertama
  assert.equal(n(/telah lewat/), 1);
  jobAt(env, '2026-10-11'); // hari ke-4: susulan
  assert.equal(n(/telah lewat/), 2);
  jobAt(env, '2026-10-11');
  assert.equal(n(/telah lewat/), 2);
  assert.equal(env.sentTo(AINA).length, 4);
  const m = env.sentTo(AINA)[0];
  assert.match(m.htmlBody, /Please submit/);
  assert.match(m.htmlBody, /font-style:italic/, 'English italik');
  const log = rows(env, 'Peringatan').filter((r) => /^KEW_/.test(r.Jenis));
  assert.equal(log.length, 4);
  assert.equal(new Set(log.map((r) => r.Jenis)).size, 4);
  // susulan mengikut Tetapan
  setCfg(env, 'PERINGATAN_SUSULAN_HARI', '1');
  jobAt(env, '2026-10-12');
  assert.equal(n(/telah lewat/), 3);

  // hari terlepas: kerja pertama dijalankan 6hb (1 hari sebelum tarikh akhir) -> satu peringatan sahaja
  const env2 = ready();
  addPer(env2, {});
  jobAt(env2, '2026-10-06');
  assert.equal(env2.sentTo(AINA).length, 1);
  assert.match(env2.sentTo(AINA)[0].subject, /hampir tiba/);
  // laporan yang sudah dihantar tidak diingatkan lagi
  const t = student(env2, AINA);
  assert.equal(call(env2, 'kew.hantar', t, P(lap(env2)[0].id)).ok, true);
  const sebelum = env2.sentTo(AINA).length;
  jobAt(env2, '2026-10-09');
  jobAt(env2, '2026-10-20');
  assert.equal(env2.sentTo(AINA).length, sebelum);
});

test('Peringatan: MOD UJI melangkau penerima di luar senarai penguji tetapi mencatat sekali; tanpa emel dicatat', () => {
  const env = ready();
  addPer(env, { id: 'PRN-0005', nama: 'BUKAN PENGUJI', matrik: 'A23UJ0005' });
  jobAt(env, '2026-10-01');
  jobAt(env, '2026-10-01');
  assert.equal(env.state.sent.filter((m) => m.to === 'syafiq.contoh@graduate.utm.my').length, 0);
  const log = rows(env, 'Peringatan').filter((r) => /^KEW_/.test(r.Jenis));
  assert.equal(log.length, 1);
  assert.match(log[0].Status, /Dilangkau/);
  // tiada emel: pemilik tiada dalam PELAJAR
  const env2 = ready();
  addPer(env2, { matrik: 'Z99ZZ9999' });
  jobAt(env2, '2026-10-01');
  assert.equal(env2.state.sent.length > 0 ? env2.state.sent.filter((m) => /kewangan/i.test(m.subject)).length : 0, 0);
  assert.equal(rows(env2, 'Peringatan').filter((r) => /^KEW_/.test(r.Jenis))[0].Status, 'Tiada emel');
});

test('Pelajar: pemilik menyunting, ahli melihat sahaja, pelajar lain tiada akses', () => {
  const { env, aina, amirul, weijie, id } = scene();
  const a = call(env, 'kew.saya', aina).data;
  assert.equal(a.perniagaan.length, 1);
  assert.equal(a.perniagaan[0].peranan, 'pemilik');
  assert.equal(a.perniagaan[0].laporan[0].bolehUbah, true);
  assert.equal(a.perniagaan[0].laporan[0].tarikhAkhir, '2026-10-07');
  assert.equal(a.belum, 1);
  assert.equal(a.templatAda, false);
  const m = call(env, 'kew.saya', amirul).data;
  assert.equal(m.perniagaan[0].peranan, 'ahli');
  assert.equal(m.perniagaan[0].laporan[0].bolehUbah, false);
  assert.equal(call(env, 'kew.saya', weijie).data.perniagaan.length, 0);
  // dapat
  assert.equal(call(env, 'kew.dapat', aina, { id }).data.laporan.bolehUbah, true);
  assert.equal(call(env, 'kew.dapat', amirul, { id }).data.peranan, 'ahli');
  assert.equal(call(env, 'kew.dapat', weijie, { id }).error.code, 'KEW_TIDAK_DITEMUI');
  assert.equal(call(env, 'kew.dapat', aina, { id: 'LKB-9999-0001' }).error.code, 'KEW_TIDAK_DITEMUI');
  // hantar
  assert.equal(call(env, 'kew.hantar', amirul, P(id)).error.code, 'KEW_HANYA_PEMILIK');
  assert.equal(call(env, 'kew.hantar', weijie, P(id)).error.code, 'KEW_TIDAK_DITEMUI');
  assert.equal(lap(env)[0].status, 'Belum Dihantar');
  assert.equal(call(env, 'kew.hantar', aina, P(id)).ok, true);
  // laluan admin tidak boleh dipanggil pelajar
  assert.equal(call(env, 'kew.admin.senarai', aina, {}).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'kew.admin.putus', aina, { id, tindakan: 'terima' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'kew.admin.hantar', aina, P(id)).error.code, 'TIADA_KEBENARIAN');
  // pelajar tanpa No. Matrik dituntut ditolak
  const baru = login(env, 'kavitha.contoh@graduate.utm.my').token;
  assert.equal(call(env, 'kew.saya', baru).error.code, 'MATRIK_TIDAK_DITEMUI');
});

test('Hantar: untung dikira di pelayan (boleh negatif), perakuan, audit, emel pengesahan', () => {
  const { env, aina, amirul, id } = scene();
  let r = call(env, 'kew.hantar', aina, P(id, { pendapatan: '1,200.50', perbelanjaan: 'RM 1500.25' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const x = lap(env)[0];
  assert.equal(x.status, 'Dihantar');
  assert.equal(x.pend, 1200.5);
  assert.equal(x.belanja, 1500.25);
  assert.equal(x.untung, -299.75, 'untung negatif dibenarkan dan dikira server');
  assert.equal(x.perakuan, 'Ya');
  assert.equal(x.tiada, 'Tidak');
  assert.ok(x.hantar);
  const au = rows(env, 'Audit').find((a) => a.Tindakan === 'KEW_HANTAR');
  assert.equal(au.Emel, AINA);
  assert.equal(au.Nilai_Baharu, 'Dihantar');
  assert.equal(kewMail(env, AINA, /Laporan kewangan diterima/).length, 1);
  assert.equal(r.data.ringkasan.perniagaan[0].laporan[0].untung, -299.75);
  // nilai untung yang dihantar klien diabaikan
  const { env: e2, aina: a2, id: id2 } = scene();
  call(e2, 'kew.hantar', a2, P(id2, { untung: 99999, pendapatan: '100', perbelanjaan: '40' }));
  assert.equal(lap(e2)[0].untung, 60);
  // Dihantar tidak boleh disunting pelajar
  assert.equal(call(env, 'kew.hantar', aina, P(id)).error.code, 'KEW_TIDAK_BOLEH_UBAH');
  void amirul;
});

test('Hantar: pengesahan medan (RM tepat tidak negatif, perakuan) dan tiada aktiviti', () => {
  const { env, aina, id } = scene();
  const bad = (o) => call(env, 'kew.hantar', aina, P(id, o));
  let r = bad({ pendapatan: '-5', perbelanjaan: 'abc', perakuan: false });
  assert.equal(r.error.code, 'KEW_TIDAK_SAH');
  ['pendapatan', 'perbelanjaan', 'perakuan'].forEach((k) => assert.ok(r.error.extra.medan[k], k));
  assert.ok(!r.error.extra.medan.fail, 'bukan penyewa lot: fail pilihan');
  assert.equal(bad({ pendapatan: '' }).error.extra.medan.pendapatan.length > 0, true);
  assert.ok(bad({ pendapatan: '10.123' }).error.extra.medan.pendapatan);
  assert.ok(bad({ perbelanjaan: '-0.01' }).error.extra.medan.perbelanjaan);
  assert.ok(bad({ perbelanjaan: '1e3' }).error.extra.medan.perbelanjaan);
  assert.equal(lap(env)[0].status, 'Belum Dihantar', 'tiada apa-apa ditulis jika tidak sah');
  // tiada aktiviti: nilai diabaikan dan jadi 0; fail pilihan
  r = bad({ tiadaAktiviti: true, pendapatan: '999', perbelanjaan: 'abc' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const x = lap(env)[0];
  assert.equal(x.tiada, 'Ya');
  assert.equal(x.pend, 0);
  assert.equal(x.belanja, 0);
  assert.equal(x.untung, 0);
  assert.equal(x.fail, '');
  // perakuan tetap wajib
  const s2 = scene();
  assert.ok(call(s2.env, 'kew.hantar', s2.aina, P(s2.id, { tiadaAktiviti: true, perakuan: false })).error.extra.medan.perakuan);
});

test('Hantar: fail PDF/Excel disemak di pelayan; wajib bagi penyewa lot (kecuali tiada aktiviti)', () => {
  const { env, aina, id } = scene();
  // fail tidak sah
  const tolak = (f) => assert.ok(call(env, 'kew.hantar', aina, P(id, { fail: f })).error.extra.medan.fail, JSON.stringify(f).substr(0, 60));
  tolak({ nama: 'x.pdf', data: b64('bukan pdf') });
  tolak({ nama: 'x.png', data: b64('\x89PNG\r\n\x1a\n') });
  tolak({ nama: 'x.exe', data: b64('%PDF-1.4 x') });
  tolak({ nama: 'x.xlsx', data: b64('%PDF-1.4 x') });
  setCfg(env, 'MAKS_SAIZ_FAIL_MB', '0.0001');
  tolak({ nama: 'x.pdf', data: b64('%PDF-1.4' + 'x'.repeat(500)) });
  setCfg(env, 'MAKS_SAIZ_FAIL_MB', '10');
  assert.equal(lap(env)[0].status, 'Belum Dihantar');

  // penyewa lot: fail wajib
  addSewaan(env, 'PRN-0001', 'Aktif');
  assert.equal(call(env, 'kew.saya', aina).data.perniagaan[0].penyewaLot, true);
  assert.equal(call(env, 'kew.dapat', aina, { id }).data.wajibFail, true);
  let r = call(env, 'kew.hantar', aina, P(id));
  assert.equal(r.error.code, 'KEW_TIDAK_SAH');
  assert.ok(r.error.extra.medan.fail);
  // tiada aktiviti: fail pilihan
  const sTiada = scene();
  addSewaan(sTiada.env, 'PRN-0001', 'Aktif');
  assert.equal(call(sTiada.env, 'kew.hantar', sTiada.aina, P(sTiada.id, { tiadaAktiviti: true })).ok, true);
  // dengan fail PDF
  r = call(env, 'kew.hantar', aina, P(id, { fail: PDF('laporan.pdf') }));
  assert.equal(r.ok, true, JSON.stringify(r));
  let x = lap(env)[0];
  assert.match(x.fail, /drive\.google\.com\/file\/d\//);
  assert.equal(x.sewaan, 'SWA-0001', 'ID_Sewaan dipaut');
  const folderId = env.plain(env.run('Db.links().FLD_LAPORAN_KEWANGAN.id'));
  assert.equal(env.state.folders[folderId].children.length, 1, 'fail disimpan dalam folder laporan kewangan');
  assert.match(env.state.folders[folderId].children[0].name, /^LAPORAN_PRN-0001_2026-09_\d+\.pdf$/);

  // Perlu Pembetulan: fail sedia ada mencukupi; Excel diterima
  const admin = login(env, ADMIN).token;
  call(env, 'kew.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'Semak jumlah.' });
  r = call(env, 'kew.hantar', aina, P(id, { pendapatan: '2000' }));
  assert.equal(r.ok, true, 'fail sedia ada digunakan semula');
  assert.equal(lap(env)[0].fail, x.fail);
  call(env, 'kew.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'Guna Excel.' });
  assert.equal(call(env, 'kew.hantar', aina, P(id, { fail: XLSX() })).ok, true);
  x = lap(env)[0];
  assert.notEqual(x.fail, '');
  call(env, 'kew.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'Cuba xls.' });
  assert.equal(call(env, 'kew.hantar', aina, P(id, { fail: XLS() })).ok, true);

  // sewaan tamat: bukan penyewa lot lagi
  const s3 = scene();
  addSewaan(s3.env, 'PRN-0001', 'Tamat');
  assert.equal(call(s3.env, 'kew.hantar', s3.aina, P(s3.id)).ok, true);
});

test('Hantar lewat dibenarkan dan ditandakan; hantar semasa Lewat menjadi Dihantar', () => {
  const { env, aina, id } = scene();
  jobAt(env, '2026-10-09');
  assert.equal(lap(env)[0].status, 'Lewat');
  setLap(env, id, { Tarikh_Akhir: rel(-5) });
  let d = call(env, 'kew.dapat', aina, { id }).data.laporan;
  assert.equal(d.boleh, true);
  assert.equal(call(env, 'kew.hantar', aina, P(id)).ok, true);
  d = call(env, 'kew.dapat', aina, { id }).data.laporan;
  assert.equal(d.status, 'Dihantar');
  assert.equal(d.hantarLewat, true, 'Tarikh_Hantar > Tarikh_Akhir');
  // tepat masa
  const s = scene();
  setLap(s.env, s.id, { Tarikh_Akhir: rel(3) });
  call(s.env, 'kew.hantar', s.aina, P(s.id));
  assert.equal(call(s.env, 'kew.dapat', s.aina, { id: s.id }).data.laporan.hantarLewat, false);
});

test('Admin: Terima mengunci, Perlu Pembetulan memerlukan catatan dan membolehkan hantar semula', () => {
  const { env, aina, admin, id } = scene();
  assert.equal(call(env, 'kew.admin.putus', admin, { id, tindakan: 'terima' }).error.code, 'KEW_PERALIHAN_TIDAK_SAH', 'belum dihantar');
  call(env, 'kew.hantar', aina, P(id));
  assert.equal(call(env, 'kew.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: '  ' }).error.code, 'KEW_CATATAN_WAJIB');
  assert.equal(call(env, 'kew.admin.putus', admin, { id, tindakan: 'lain' }).error.code, 'KEW_PERALIHAN_TIDAK_SAH');
  let r = call(env, 'kew.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'Sila lampirkan penyata.' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.laporan.status, 'Perlu Pembetulan');
  let x = lap(env)[0];
  assert.equal(x.oleh, ADMIN);
  assert.equal(x.catatan, 'Sila lampirkan penyata.');
  assert.match(kewMail(env, AINA, /perlu dibetulkan/)[0].htmlBody, /Sila lampirkan penyata/);
  const sa = call(env, 'kew.saya', aina).data.perniagaan[0].laporan[0];
  assert.equal(sa.status, 'Perlu Pembetulan');
  assert.equal(sa.catatan, 'Sila lampirkan penyata.');
  assert.equal(sa.bolehUbah, true);
  // pelajar membetulkan dan menghantar semula
  assert.equal(call(env, 'kew.hantar', aina, P(id, { pendapatan: '3000', perbelanjaan: '1000' })).ok, true);
  assert.equal(lap(env)[0].untung, 2000);
  // admin terima
  r = call(env, 'kew.admin.putus', admin, { id, tindakan: 'terima', catatan: 'OK' });
  assert.equal(r.ok, true);
  assert.equal(r.data.laporan.status, 'Diterima');
  assert.equal(r.data.bolehPutus, false);
  assert.equal(kewMail(env, AINA, /Laporan kewangan diterima/).length, 3, 'dua pengesahan hantar dan satu penerimaan');
  // terkunci: pelajar dan admin tidak boleh mengubah
  assert.equal(call(env, 'kew.hantar', aina, P(id)).error.code, 'KEW_TIDAK_BOLEH_UBAH');
  assert.equal(call(env, 'kew.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'x' }).error.code, 'KEW_PERALIHAN_TIDAK_SAH');
  assert.equal(call(env, 'kew.admin.hantar', admin, P(id)).error.code, 'KEW_TIDAK_BOLEH_UBAH');
  assert.equal(call(env, 'kew.saya', aina).data.perniagaan[0].laporan[0].bolehUbah, false);
  x = lap(env)[0];
  assert.equal(x.status, 'Diterima');
  const tindakan = rows(env, 'Audit').map((a) => a.Tindakan).filter((t) => /^KEW_/.test(t));
  ['KEW_HANTAR', 'KEW_PEMBETULAN', 'KEW_TERIMA'].forEach((t) => assert.ok(tindakan.includes(t), t));
});

test('Admin: kebenaran mengikut peranan (Penilai tiada akses, Pemerhati baca sahaja, Pegawai Modul mengikut modul)', () => {
  const { env, aina, admin, id } = scene();
  call(env, 'kew.hantar', aina, P(id));
  const pen = peranan(env, 'penilai@utm.my', 'Penilai', admin);
  const pem = peranan(env, 'pemerhati@utm.my', 'Pemerhati', admin);
  const mk = pegawai(env, 'Makerspace', undefined, admin);
  const kw = pegawai(env, 'Kewangan', 'staf1@utm.my', admin);
  // Penilai
  ['kew.admin.senarai', 'kew.admin.butiran', 'kew.admin.csv', 'kew.admin.putus', 'kew.admin.jana', 'kew.fail']
    .forEach((m) => assert.equal(call(env, m, pen, { id, tindakan: 'terima' }).error.code, 'TIADA_KEBENARIAN', m));
  // Pemerhati: lihat sahaja
  assert.equal(call(env, 'kew.admin.senarai', pem, {}).ok, true);
  assert.equal(call(env, 'kew.admin.senarai', pem, {}).data.bolehPutus, false);
  assert.equal(call(env, 'kew.admin.butiran', pem, { id }).data.bolehPutus, false);
  assert.equal(call(env, 'kew.admin.csv', pem, {}).ok, true);
  assert.equal(call(env, 'kew.fail', pem, { id }).error.code, 'KEW_FAIL_TIADA');
  ['kew.admin.putus', 'kew.admin.jana', 'kew.admin.hantar'].forEach((m) =>
    assert.equal(call(env, m, pem, { id, tindakan: 'terima', noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN', m));
  // Pegawai modul lain: melihat, tidak memutuskan
  assert.equal(call(env, 'kew.admin.senarai', mk, {}).data.bolehPutus, false);
  assert.equal(call(env, 'kew.admin.putus', mk, { id, tindakan: 'terima' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'kew.admin.jana', mk, {}).error.code, 'TIADA_KEBENARIAN');
  assert.equal(lap(env)[0].status, 'Dihantar');
  // Pegawai Kewangan dan pegawai modul kosong: boleh
  assert.equal(call(env, 'kew.admin.senarai', kw, {}).data.bolehPutus, true);
  assert.equal(call(env, 'kew.admin.putus', kw, { id, tindakan: 'pembetulan', catatan: 'Semak.' }).ok, true);
  call(env, 'kew.hantar', aina, P(id));
  // modul dikosongkan = semua modul
  call(env, 'admin.tambah', admin, { emel: 'pegawai@utm.my', nama: 'Pegawai', peranan: 'Pegawai Modul', modul: '' });
  env.advance(61);
  assert.equal(call(env, 'kew.admin.putus', mk, { id, tindakan: 'terima' }).ok, true);
  assert.equal(call(env, 'kew.admin.putus', admin, { id: 'LKB-1-1', tindakan: 'terima' }).error.code, 'KEW_TIDAK_DITEMUI');
});

test('Bagi pihak pelajar: admin menghantar untuk pemilik dengan Bantu.ctx, direkod dalam audit', () => {
  const { env, aina, amirul, admin, id } = scene();
  const kw = pegawai(env, 'Kewangan', undefined, admin);
  const mk = pegawai(env, 'Makerspace', 'staf1@utm.my', admin);
  assert.equal(call(env, 'kew.admin.hantar', mk, P(id)).error.code, 'TIADA_KEBENARIAN');
  // pelajar bukan pemilik (ahli): ditolak
  assert.equal(call(env, 'kew.admin.hantar', admin, P(id, { noMatrik: 'A23UJ0002' })).error.code, 'KEW_HANYA_PEMILIK');
  assert.equal(call(env, 'kew.admin.hantar', admin, P(id, { noMatrik: 'ZZ99999' })).error.code, 'MATRIK_TIDAK_DITEMUI');
  // pengesahan yang sama
  assert.equal(call(env, 'kew.admin.hantar', admin, P(id, { noMatrik: 'A23UJ0001', pendapatan: '-1' })).error.code, 'KEW_TIDAK_SAH');
  const r = call(env, 'kew.admin.hantar', kw, P(id, { noMatrik: 'A23UJ0001' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.laporan.status, 'Dihantar');
  assert.equal(r.data.pemilik.noMatrik, 'A23UJ0001');
  const au = rows(env, 'Audit').find((a) => a.Tindakan === 'KEW_HANTAR_BAGI_PIHAK');
  assert.equal(au.Emel, 'pegawai@utm.my');
  assert.match(au.Catatan, /\[bagi pihak A23UJ0001\]/);
  assert.match(au.Catatan, /perakuan diakui admin/);
  assert.equal(kewMail(env, AINA, /Laporan kewangan diterima/).length, 1, 'pemilik dimaklumkan');
  // tanpa noMatrik: diambil daripada pemilik perniagaan
  const s = scene();
  assert.equal(call(s.env, 'kew.admin.hantar', s.admin, P(s.id)).ok, true);
  void aina; void amirul;
});

test('Admin: senarai dengan penapis, butiran, ringkasan kepatuhan dan Ringkasan_KPI (kemas kini, tidak berganda)', () => {
  const env = ready();
  addPer(env, { id: 'PRN-0001', nama: 'KEK AINA', matrik: 'A23UJ0001' });
  addPer(env, { id: 'PRN-0002', nama: 'KOPI AMIRUL', matrik: 'A23UJ0002', permohonan: 'SSU-2026-0002' });
  addPer(env, { id: 'PRN-0003', nama: 'ROTI WEIJIE', matrik: 'A22UJ0003', permohonan: 'SSU-2026-0003' });
  addPer(env, { id: 'PRN-0004', nama: 'TEH KAVITHA', matrik: 'A24UJ0004', permohonan: 'SSU-2026-0004', daftar: '2026-08-10', dicipta: '2026-08-10' });
  const h = jobAt(env, '2026-10-05');
  assert.equal(h.dijana, 5, '4 perniagaan September + 1 Ogos');
  const aina = student(env, AINA), amirul = student(env, AMIRUL), weijie = student(env, WEIJIE);
  const admin = login(env, ADMIN).token;
  const idOf = (per, b) => lap(env).find((x) => x.per === per && x.bulan === b).id;
  call(env, 'kew.hantar', aina, P(idOf('PRN-0001', 9), { pendapatan: '1000', perbelanjaan: '400' }));
  call(env, 'kew.hantar', amirul, P(idOf('PRN-0002', 9), { tiadaAktiviti: true }));
  call(env, 'kew.hantar', weijie, P(idOf('PRN-0003', 9), { pendapatan: '100', perbelanjaan: '350.50' }));
  call(env, 'kew.admin.putus', admin, { id: idOf('PRN-0001', 9), tindakan: 'terima' });
  call(env, 'kew.admin.putus', admin, { id: idOf('PRN-0003', 9), tindakan: 'pembetulan', catatan: 'Semak.' });

  let r = call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.tempoh, { tahun: 2026, bulan: 9 });
  assert.equal(r.data.jumlah, 4);
  assert.deepEqual(r.data.kiraan, { 'Belum Dihantar': 1, Dihantar: 1, Lewat: 0, 'Perlu Pembetulan': 1, Diterima: 1 });
  const s = r.data.ringkasan;
  assert.equal(s.bilPerniagaan, 4);
  assert.equal(s.diterima, 1);
  assert.equal(s.dihantar, 1);
  assert.equal(s.belum, 1);
  assert.equal(s.pembetulan, 1);
  assert.equal(s.pematuhanPct, 50, '(diterima + dihantar) / perniagaan');
  assert.equal(s.pendapatan, 1000, 'hanya Diterima dijumlahkan');
  assert.equal(s.perbelanjaan, 400);
  assert.equal(s.untung, 600);
  assert.equal(r.data.menunggu, 1);
  assert.deepEqual(r.data.senaraiTempoh.map((t) => t.tahun + '-' + t.bulan), ['2026-9', '2026-8']);
  assert.equal(r.data.senarai[0].perniagaan, 'KEK AINA');
  assert.equal(r.data.senarai[0].pemilik, 'NURUL AINA BINTI HASSAN');
  // tempoh lalai = terkini; penapis status dan carian
  assert.equal(call(env, 'kew.admin.senarai', admin, {}).data.tempoh.bulan, 9);
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9, status: 'Dihantar' }).data.senarai.map((x) => x.perniagaan).join(), 'KOPI AMIRUL');
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9, q: 'a22uj0003' }).data.senarai.length, 1, 'carian No. Matrik');
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9, q: 'teh' }).data.senarai[0].perniagaan, 'TEH KAVITHA');
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9, q: 'aina binti' }).data.senarai.length, 1, 'carian nama pemilik');
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9, q: 'LKB-2026' }).data.senarai.length, 4, 'carian ID laporan');
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 8 }).data.senarai.length, 1);
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 'SEMUA' }).data.senarai.length, 5);
  assert.equal(call(env, 'kew.admin.senarai', admin, { tahun: 2026, bulan: 9, status: 'Diterima' }).data.senarai.length, 1);

  // Ringkasan_KPI
  const kpi = () => Object.fromEntries(rows(env, 'Ringkasan_KPI').map((x) => [x.Petunjuk, x.Nilai]));
  let k = kpi();
  assert.equal(k.KEW_BIL_DITERIMA_2026_09, 1);
  assert.equal(k.KEW_BIL_DIHANTAR_2026_09, 1);
  assert.equal(k.KEW_BIL_BELUM_2026_09, 1);
  assert.equal(k.KEW_BIL_PEMBETULAN_2026_09, 1);
  assert.equal(k.KEW_BIL_PERNIAGAAN_2026_09, 4);
  assert.equal(k.KEW_PEMATUHAN_PCT_2026_09, 50);
  assert.equal(k.KEW_PENDAPATAN_DITERIMA_2026_09, 1000);
  assert.equal(k.KEW_PERBELANJAAN_DITERIMA_2026_09, 400);
  assert.equal(k.KEW_UNTUNG_DITERIMA_2026_09, 600);
  assert.equal(k.KEW_BIL_LEWAT_2026_08, 1, 'tempoh Ogos: Lewat');
  assert.ok(rows(env, 'Ringkasan_KPI').every((x) => x.Kemas_Kini));
  // Penerimaan seterusnya (untung negatif) mengemas kini baris yang sama
  call(env, 'kew.hantar', weijie, P(idOf('PRN-0003', 9), { pendapatan: '100', perbelanjaan: '350.50' }));
  call(env, 'kew.admin.putus', admin, { id: idOf('PRN-0003', 9), tindakan: 'terima' });
  k = kpi();
  assert.equal(k.KEW_BIL_DITERIMA_2026_09, 2);
  assert.equal(k.KEW_UNTUNG_DITERIMA_2026_09, 349.5);
  const n = rows(env, 'Ringkasan_KPI').length;
  jobAt(env, '2026-10-05');
  jobAt(env, '2026-10-06');
  const banyak = rows(env, 'Ringkasan_KPI');
  assert.equal(banyak.length, n, 'kerja harian tidak menambah baris berganda');
  assert.equal(new Set(banyak.map((x) => x.Petunjuk)).size, banyak.length);
  // butiran
  const b = call(env, 'kew.admin.butiran', admin, { id: idOf('PRN-0002', 9) }).data;
  assert.equal(b.perniagaan.nama, 'KOPI AMIRUL');
  assert.equal(b.pemilik.nama, 'AMIRUL HAKIM BIN ROSLI');
  assert.equal(b.laporan.tiadaAktiviti, true);
  assert.equal(b.bolehPutus, true);
  assert.equal(b.bolehBantu, false, 'sudah Dihantar');
  assert.equal(call(env, 'kew.admin.butiran', admin, { id: idOf('PRN-0004', 9) }).data.bolehBantu, true);
});

test('Admin: eksport CSV dikembalikan sebagai teks, ikut penapis, melindungi formula', () => {
  const env = ready();
  addPer(env, { id: 'PRN-0001', nama: 'KEDAI "AIN", ENT', matrik: 'A23UJ0001' });
  addPer(env, { id: 'PRN-0002', nama: '-CMD|X', matrik: 'A23UJ0002', permohonan: 'SSU-2026-0002' });
  jobAt(env, '2026-10-05');
  const aina = student(env, AINA);
  const admin = login(env, ADMIN).token;
  call(env, 'kew.hantar', aina, P(lap(env).find((x) => x.per === 'PRN-0001').id, { pendapatan: '10', perbelanjaan: '25.5' }));
  const r = call(env, 'kew.admin.csv', admin, { tahun: 2026, bulan: 9 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.nama, 'laporan-kewangan_2026-09.csv');
  assert.equal(r.data.mime, 'text/csv');
  assert.equal(r.data.bil, 2);
  const t = r.data.teks;
  assert.equal(t.charCodeAt(0), 0xFEFF, 'BOM untuk Excel');
  const baris = t.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(baris.length, 3);
  assert.match(baris[0], /^ID_Laporan,ID_Perniagaan,Nama_Perniagaan,No_Matrik_Pemilik,No_KP,Nama_Pemilik,Bulan,Tahun,Status/);
  const bk = baris.find((b) => b.includes('KEDAI'));
  assert.match(bk, /,[A-Z0-9]+,\d{6}-\d{2}-\d{4},/, 'No. KP bergandingan dengan No. Matrik dalam eksport Admin Penuh');
  assert.ok(t.includes('"KEDAI ""AIN"", ENT"'), 'petikan dan koma dilepaskan');
  assert.ok(t.includes(",'-CMD|X,"), 'formula dilindungi');
  assert.ok(baris.find((b) => b.includes('KEDAI')).includes(',Dihantar,Tidak,10,25.5,-15.5,Tidak,2026-10-07,'), t);
  assert.equal(call(env, 'kew.admin.csv', admin, { tahun: 2026, bulan: 9, status: 'Dihantar' }).data.bil, 1);
  assert.equal(call(env, 'kew.admin.csv', admin, { tahun: 2026 }).data.nama, 'laporan-kewangan_2026.csv');
  assert.equal(rows(env, 'Audit').filter((a) => a.Tindakan === 'KEW_EKSPORT_CSV').length, 3);
});

test('Admin: jana laporan sekarang (hingga bulan semasa), idempotent dan hanya untuk yang boleh memutuskan', () => {
  const env = ready();
  addPer(env, { daftar: rel(0), dicipta: rel(0) });
  const admin = login(env, ADMIN).token;
  const mk = pegawai(env, 'Makerspace', undefined, admin);
  assert.equal(call(env, 'kew.admin.jana', mk, {}).error.code, 'TIADA_KEBENARIAN');
  assert.equal(lap(env).length, 0);
  let r = call(env, 'kew.admin.jana', admin, {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.dijana, 1);
  const now = rel(0).split('-');
  assert.equal(lap(env)[0].tahun, Number(now[0]));
  assert.equal(lap(env)[0].bulan, Number(now[1]));
  assert.equal(lap(env)[0].status, 'Belum Dihantar');
  assert.equal(env.state.sent.filter((m) => /kewangan/i.test(m.subject)).length, 0, 'jana manual tidak menghantar peringatan');
  r = call(env, 'kew.admin.jana', admin, {});
  assert.equal(r.data.dijana, 0);
  assert.equal(lap(env).length, 1);
  assert.equal(rows(env, 'Audit').filter((a) => a.Tindakan === 'KEW_JANA_MANUAL').length, 2);
});

test('Fail dan templat: muat turun melalui pelayan; pelajar lain disekat; templat belum didaftar memberi mesej jelas', () => {
  const { env, aina, amirul, weijie, admin, id } = scene();
  assert.equal(call(env, 'kew.fail', aina, { id }).error.code, 'KEW_FAIL_TIADA');
  call(env, 'kew.hantar', aina, P(id, { fail: PDF('laporan.pdf') }));
  for (const t of [aina, amirul, admin]) {
    const r = call(env, 'kew.fail', t, { id });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.mime, 'application/pdf');
    assert.match(Buffer.from(r.data.data, 'base64').toString('utf8'), /^%PDF/);
  }
  assert.equal(call(env, 'kew.fail', weijie, { id }).error.code, 'KEW_TIDAK_DITEMUI');
  assert.equal(rows(env, 'Audit').filter((a) => a.Tindakan === 'KEW_PAPAR_FAIL').length, 1, 'paparan admin direkod');
  assert.ok(!JSON.stringify(call(env, 'kew.dapat', aina, { id })).includes('drive.google.com'), 'pelajar tidak menerima pautan Drive');
  assert.ok(!JSON.stringify(call(env, 'kew.saya', aina)).includes('drive.google.com'));
  assert.ok(!JSON.stringify(call(env, 'kew.admin.butiran', admin, { id })).includes('drive.google.com'));

  // templat
  let r = call(env, 'kew.templat', aina, {});
  assert.equal(r.error.code, 'KEW_TEMPLAT_TIADA');
  assert.match(r.error.bm, /Templat laporan belum didaftar/);
  const set = (url) => env.run(`(function(){ var r = Db.find('Link_Dokumen', function(x){ return x.Kod==='TEMPLAT_LAPORAN_KEWANGAN'; })[0]; Db.update('Link_Dokumen', r._row, {URL: ${JSON.stringify(url)}}); Db.reset(); })()`);
  set('https://bit.ly/Template_Financial_Report');
  assert.equal(call(env, 'kew.templat', aina, {}).error.code, 'KEW_TEMPLAT_TIADA', 'bukan fail Drive');
  assert.equal(call(env, 'kew.saya', aina).data.templatAda, true);
  const url = env.run(`DriveApp.getRootFolder().createFile(Utilities.newBlob('PK-templat', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Templat.xlsx')).getUrl()`);
  set(url);
  r = call(env, 'kew.templat', aina, {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.nama, 'Templat.xlsx');
  assert.equal(call(env, 'kew.templat', admin, {}).ok, true);
});

test('Integrasi: SSU diluluskan melalui laluan sebenar menjana laporan; Jobs.harian memanggil Kewangan', () => {
  const env = ready();
  const aina = profiled(env, AINA);
  const admin = login(env, ADMIN).token;
  const s = call(env, 'ssu.hantar', aina, SSU());
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(call(env, 'ssu.admin.putus', admin, { id: s.data.id, tindakan: 'lulus' }).ok, true);
  const per = rows(env, 'Perniagaan')[0];
  assert.equal(per.No_Matrik_Pemilik, 'A23UJ0001');
  // Jobs.harian (tarikh sebenar): tiada ralat dan tiada laporan tertunggak ke belakang melebihi bulan pendaftaran
  const j = env.plain(env.run('Jobs.harian()'));
  assert.ok(j.kew && !j.kew.ralat, JSON.stringify(j.kew));
  assert.ok(lap(env).every((x) => x.per === per.ID_Perniagaan));
  // tarikh terkawal: bulan pendaftaran = bulan semasa; laporannya dijana pada bulan berikutnya
  const [y, m] = rel(0).split('-').map(Number);
  const hari = new Date(Date.UTC(y, m, 10)).toISOString().slice(0, 10); // 10hb bulan berikutnya
  jobAt(env, hari);
  const l = lap(env).filter((x) => x.tahun === y && x.bulan === m);
  assert.equal(l.length, 1);
  assert.equal(lap(env).filter((x) => x.tahun * 12 + x.bulan < y * 12 + m).length, 0);
  assert.equal(l[0].status, 'Lewat');
  assert.equal(call(env, 'kew.saya', aina).data.perniagaan[0].nama, 'SENI KEK AINA');
});
