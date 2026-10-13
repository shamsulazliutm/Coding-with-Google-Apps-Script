'use strict';
/** Ruang Niaga fasa 1: lot, tempoh permohonan, permohonan lot, peraturan, kebenaran, bagi pihak. */
const test = require('node:test');
const { call, login, student, profiled, setCfg, SSU, assert } = require('./helpers');
const { AINA, AMIRUL, WEIJIE, ADMIN, rows, setRow, hari, rnReady, ssuLulus, bukaLot, RN_APP, mohon, pdfFile, b64 } = require('./rn-helpers');

test('Lot admin: senarai, kemas kini, tambah, kod pendua, status sistem dan kebenaran', () => {
  const { env, admin } = rnReady();
  let r = call(env, 'rn.admin.lot.senarai', admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.lot.length, 15);
  assert.equal(r.data.lot[0].statusBuka, 'Ditutup');
  r = bukaLot(env, admin, 'SM-01', { jenis: 'FNB', kadar: '150.50' });
  const l = r.lot.find((x) => x.kod === 'SM-01');
  assert.equal(l.statusBuka, 'Dibuka');
  assert.equal(l.jenisBm, 'Makanan dan Minuman');
  assert.equal(rows(env, 'Lot').find((x) => x.Kod_Lot === 'SM-01').Kadar_Sewa_RM, 150.5);
  // tambah lot baharu
  r = call(env, 'rn.admin.lot.simpan', admin, { baru: true, kod: 'sm-11', nama: 'Student Mall - Lot 11', jenis: 'LAIN', kadar: '200', statusBuka: 'Ditutup' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(rows(env, 'Lot').length, 16);
  assert.equal(call(env, 'rn.admin.lot.simpan', admin, { baru: true, kod: 'SM-11', nama: 'x' }).error.extra.medan.kod.length > 0, true);
  // ralat medan
  const bad = call(env, 'rn.admin.lot.simpan', admin, { kod: 'SM-02', nama: '', kadar: 'abc', saiz: '-1', jenis: 'XX', statusBuka: 'Mungkin' });
  ['nama', 'kadar', 'saiz', 'jenis', 'statusBuka'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  // penyelenggaraan boleh; Disewa/Dipohon ialah status sistem
  assert.equal(call(env, 'rn.admin.lot.simpan', admin, { kod: 'SM-02', nama: 'Lot 2', statusLot: 'Penyelenggaraan' }).ok, true);
  assert.equal(call(env, 'rn.admin.lot.simpan', admin, { kod: 'SM-03', nama: 'Lot 3', statusLot: 'Disewa' }).error.code, 'RN_LOT_STATUS_SISTEM');
  setRow(env, 'Lot', 'Kod_Lot', 'SM-04', { Status_Lot: 'Disewa' });
  assert.equal(call(env, 'rn.admin.lot.simpan', admin, { kod: 'SM-04', nama: 'Lot 4', statusLot: 'Kosong' }).error.code, 'RN_LOT_STATUS_SISTEM');
  // audit dan kebenaran
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'KEMAS_KINI_LOT' && a.Rujukan === 'SM-01'));
  const pemerhati = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.lot.senarai', pemerhati).ok, true);
  assert.equal(call(env, 'rn.admin.lot.simpan', pemerhati, { kod: 'SM-01', nama: 'x' }).error.code, 'TIADA_KEBENARIAN');
  const penilai = login(env, 'penilai@utm.my').token;
  assert.equal(call(env, 'rn.admin.lot.senarai', penilai).error.code, 'TIADA_KEBENARIAN');
  const lain = login(env, 'pegawai.lain@utm.my').token;
  assert.equal(call(env, 'rn.admin.lot.simpan', lain, { kod: 'SM-01', nama: 'x' }).ok, false, 'Pegawai Modul SSU tidak boleh mengurus lot');
  const pegawai = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'rn.admin.lot.simpan', pegawai, { kod: 'SM-01', nama: 'Student Mall - Lot 1', jenis: 'RETAIL', kadar: '160' }).ok, true);
});

test('Tempoh permohonan: simpan, pengesahan dan kesan pada kelayakan memohon', () => {
  const { env, admin } = rnReady({ tempoh: false });
  bukaLot(env, admin, 'SM-01');
  const aina = ssuLulus(env, admin, AINA);
  let s = call(env, 'rn.saya', aina).data;
  assert.equal(s.tempoh.dibuka, false);
  assert.equal(s.sebab, 'TEMPOH_TUTUP');
  assert.equal(call(env, 'rn.mohon.hantar', aina, RN_APP(env)).error.code, 'RN_TEMPOH_TUTUP');
  const bad = call(env, 'rn.admin.tempoh.simpan', admin, { buka: '2026-10-10', tutup: '2026-10-01' });
  assert.ok(bad.error.extra.medan.tutup);
  assert.ok(call(env, 'rn.admin.tempoh.simpan', admin, { buka: 'x', tutup: '' }).error.extra.medan.buka);
  const ok = call(env, 'rn.admin.tempoh.simpan', admin, { buka: hari(env, -1), tutup: hari(env, 5) });
  assert.equal(ok.data.dibuka, true);
  s = call(env, 'rn.saya', aina).data;
  assert.equal(s.tempoh.dibuka, true);
  assert.equal(s.boleh.mohon, true);
  // tarikh tutup lampau menutup semula
  call(env, 'rn.admin.tempoh.simpan', admin, { buka: hari(env, -10), tutup: hari(env, -1) });
  assert.equal(call(env, 'rn.saya', aina).data.boleh.mohon, false);
  // kosongkan = tutup
  call(env, 'rn.admin.tempoh.simpan', admin, { buka: '', tutup: '' });
  assert.equal(call(env, 'rn.saya', aina).data.tempoh.dibuka, false);
});

test('Kelayakan: perlu SSU, ahli hanya lihat, SSU tamat tempoh disekat; hanya lot Dibuka + Kosong kelihatan', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01');
  setRow(env, 'Lot', 'Kod_Lot', 'SM-02', { Status_Buka: 'Dibuka', Status_Lot: 'Dipohon' });
  setRow(env, 'Lot', 'Kod_Lot', 'SM-03', { Status_Buka: 'Dibuka', Status_Lot: 'Penyelenggaraan' });
  setRow(env, 'Lot', 'Kod_Lot', 'SM-04', { Status_Buka: 'Ditutup', Status_Lot: 'Kosong' });
  const weijie = student(env, WEIJIE);
  let s = call(env, 'rn.saya', weijie).data;
  assert.equal(s.kelayakan.boleh, false);
  assert.equal(s.sebab, 'PERLU_SSU');
  assert.equal(call(env, 'rn.mohon.hantar', weijie, RN_APP(env)).error.code, 'RN_PERLU_SSU');
  const aina = ssuLulus(env, admin, AINA, 'seni kek aina', ['A23UJ0002']);
  s = call(env, 'rn.saya', aina).data;
  assert.deepEqual(s.lot.map((x) => x.kod), ['SM-01'], 'hanya lot Dibuka + Kosong');
  assert.equal(s.lot[0].kadar, '150');
  assert.equal(s.kelayakan.perniagaan.status, 'Aktif');
  // ahli: lihat sahaja
  const amirul = profiled(env, AMIRUL);
  s = call(env, 'rn.saya', amirul).data;
  assert.equal(s.sebab, 'HANYA_PEMILIK');
  assert.equal(call(env, 'rn.mohon.hantar', amirul, RN_APP(env)).error.code, 'RN_HANYA_PEMILIK');
  // SSU tamat tempoh
  setRow(env, 'Perniagaan', 'No_Matrik_Pemilik', 'A23UJ0001', { Tarikh_Tamat: new Date(Date.now() - 5 * 86400000) });
  s = call(env, 'rn.saya', aina).data;
  assert.equal(s.sebab, 'SSU_TAMAT');
  assert.equal(call(env, 'rn.mohon.hantar', aina, RN_APP(env)).error.code, 'RN_SSU_TAMAT');
});

test('Permohonan lot: hantar sah, ID, emel, audit dan lampiran', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01');
  const aina = ssuLulus(env, admin, AINA);
  const id = mohon(env, aina);
  assert.match(id, /^PLT-\d{4}-0001$/);
  const p = rows(env, 'Permohonan_Lot')[0];
  assert.equal(p.Status, 'Baharu');
  assert.equal(p.No_Matrik, 'A23UJ0001');
  assert.equal(p.Kod_Lot, 'SM-01');
  assert.match(p.ID_Perniagaan, /^PRN-0001$/);
  assert.equal(p.Jumlah_Dana_RM, 5000);
  assert.equal(p.Bil_Pekerja, 3);
  assert.equal(p.Sumber_Pembiayaan, 'SENDIRI');
  assert.match(p.Fail_Cadangan, /drive\.google\.com\/file\/d\//);
  assert.equal(p.Vaksin_Kepialu, '', 'bukan F&B: medan makanan tidak direkod');
  assert.equal(env.sentTo(AINA).filter((m) => /Permohonan lot diterima/.test(m.subject)).length, 1);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'MOHON_LOT' && a.Rujukan === id));
  const s = call(env, 'rn.saya', aina).data;
  assert.equal(s.permohonan[0].status, 'Baharu');
  assert.equal(s.permohonan[0].bolehBatal, true);
  assert.equal(s.permohonan[0].namaLot, 'Student Mall - Lot 1');
  assert.equal(s.sebab, 'SUDAH_ADA_LOT');
  // cadangan dimuat turun melalui pelayan
  const f = call(env, 'rn.fail', aina, { id, jenis: 'cadangan' });
  assert.equal(f.ok, true);
  assert.match(Buffer.from(f.data.data, 'base64').toString('utf8'), /^%PDF/);
  // pelajar lain tidak boleh
  const weijie = student(env, WEIJIE);
  assert.equal(call(env, 'rn.fail', weijie, { id, jenis: 'cadangan' }).error.code, 'RN_TIDAK_DITEMUI');
});

test('Permohonan lot F&B: vaksin dan kursus hanya direkod (bukan syarat), lampiran pilihan', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01', { jenis: 'FNB' });
  const aina = ssuLulus(env, admin, AINA);
  const bad = call(env, 'rn.mohon.hantar', aina, RN_APP(env));
  assert.ok(bad.error.extra.medan.vaksin && bad.error.extra.medan.kursus, 'perlu dijawab bagi F&B');
  const id = mohon(env, aina, { vaksin: 'Tidak', kursus: 'Ya', failKursus: pdfFile('kursus.pdf') });
  const p = rows(env, 'Permohonan_Lot').find((x) => x.ID_Permohonan === id);
  assert.equal(p.Vaksin_Kepialu, 'Tidak');
  assert.equal(p.Kursus_Makanan, 'Ya');
  assert.equal(p.Fail_Vaksin, '');
  assert.match(p.Fail_Kursus, /drive\.google/);
  const ad = call(env, 'rn.admin.perm.butiran', admin, { id }).data;
  assert.deepEqual(ad.fail, { cadangan: true, vaksin: false, kursus: true });
});

test('Permohonan lot: pengesahan medan di pelayan', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01');
  const aina = ssuLulus(env, admin, AINA);
  const bad = call(env, 'rn.mohon.hantar', aina, {
    kodLot: 'SM-01', tempohMula: hari(env, -5), tempohTamat: hari(env, -10), sumber: [], pemberi: ['XX'], jumlahDana: 'abc', jualan: '-1', bilPekerja: 'x',
    sebab: 'pendek', perakuan: false
  });
  assert.equal(bad.error.code, 'RN_BORANG_TIDAK_SAH');
  ['tempohMula', 'sumber', 'pemberi', 'jumlahDana', 'jualan', 'bilPekerja', 'sebab', 'perakuan', 'failCadangan'].forEach((k) => assert.ok(bad.error.extra.medan[k], k + ': ' + JSON.stringify(bad.error.extra.medan)));
  assert.ok(call(env, 'rn.mohon.hantar', aina, RN_APP(env, { tempohTamat: hari(env, 10) })).error.extra.medan.tempohTamat, 'tamat sebelum mula');
  // cadangan mesti PDF sebenar
  let r = call(env, 'rn.mohon.hantar', aina, RN_APP(env, { failCadangan: { nama: 'cadangan.pdf', data: b64('bukan pdf') } }));
  assert.ok(r.error.extra.medan.failCadangan);
  r = call(env, 'rn.mohon.hantar', aina, RN_APP(env, { failCadangan: { nama: 'cadangan.png', data: b64('%PDF-1.4 x') } }));
  assert.ok(r.error.extra.medan.failCadangan, 'cadangan PDF sahaja');
  r = call(env, 'rn.mohon.hantar', aina, RN_APP(env, { tempohTamat: hari(env, 30 + 365 * 4) }));
  assert.ok(r.error.extra.medan.tempohTamat, 'maksimum 36 bulan');
  // lot tidak tersedia
  assert.equal(call(env, 'rn.mohon.hantar', aina, RN_APP(env, { kodLot: 'SM-05' })).error.code, 'RN_LOT_TIDAK_TERSEDIA');
  assert.equal(call(env, 'rn.mohon.hantar', aina, RN_APP(env, { kodLot: 'TIADA' })).error.code, 'RN_LOT_TIDAK_TERSEDIA');
  assert.equal(rows(env, 'Permohonan_Lot').length, 0);
});

test('Satu lot bagi satu pelajar/perniagaan: pemilik, ahli pasukan dan permohonan terdahulu', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01'); bukaLot(env, admin, 'SM-02');
  const aina = ssuLulus(env, admin, AINA, 'seni kek aina', ['A23UJ0002']);
  const weijie = ssuLulus(env, admin, WEIJIE, 'weijie trading', ['A23UJ0002']); // Amirul ahli dalam dua SSU
  const id = mohon(env, aina);
  // pemilik sama tidak boleh memohon lot kedua
  assert.equal(call(env, 'rn.mohon.hantar', aina, RN_APP(env, { kodLot: 'SM-02' })).error.code, 'RN_SUDAH_ADA_LOT');
  // Weijie berkongsi ahli (Amirul) dengan perniagaan Aina yang sudah memohon: disekat
  assert.equal(call(env, 'rn.mohon.hantar', weijie, RN_APP(env, { kodLot: 'SM-02' })).error.code, 'RN_SUDAH_ADA_LOT');
  // ahli melihat permohonan perniagaannya (baca sahaja)
  const amirul = profiled(env, AMIRUL);
  const s = call(env, 'rn.saya', amirul).data;
  assert.equal(s.sertaan.length, 1);
  assert.equal(s.sertaan[0].id, id);
  assert.equal(s.sertaan[0].bolehBatal, false);
  assert.equal(call(env, 'rn.mohon.batal', amirul, { id }).error.code, 'RN_HANYA_PEMILIK');
  // pemilik batal -> boleh memohon lagi; Weijie juga bebas
  assert.equal(call(env, 'rn.mohon.batal', aina, { id }).ok, true);
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Dibatalkan');
  assert.equal(call(env, 'rn.mohon.batal', aina, { id }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  const id2 = mohon(env, aina, { kodLot: 'SM-02' });
  assert.match(id2, /0002$/);
  // Ditolak: boleh memohon semula
  call(env, 'rn.admin.perm.tindakan', admin, { id: id2, tindakan: 'tolak', catatan: 'Tidak memenuhi syarat' });
  assert.equal(call(env, 'rn.saya', weijie).data.boleh.mohon, true);
  assert.ok(mohon(env, weijie, { kodLot: 'SM-02' }));
});

test('Admin permohonan: senarai, butiran (No. KP Admin Penuh sahaja), tindakan dan kebenaran', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01');
  const aina = ssuLulus(env, admin, AINA, 'seni kek aina', ['A23UJ0002']);
  const id = mohon(env, aina);
  let r = call(env, 'rn.admin.perm.senarai', admin, {});
  assert.equal(r.data.kiraan.Baharu, 1);
  assert.equal(r.data.senarai[0].pemilik, 'NURUL AINA BINTI HASSAN');
  assert.equal(call(env, 'rn.admin.perm.senarai', admin, { status: 'Ditolak' }).data.senarai.length, 0);
  assert.equal(call(env, 'rn.admin.perm.senarai', admin, { q: 'kek' }).data.senarai.length, 1);
  const d = call(env, 'rn.admin.perm.butiran', admin, { id }).data;
  assert.equal(d.pemohon.noKp, '010101-01-0001');
  assert.equal(d.perniagaan.nama, 'SENI KEK AINA');
  assert.equal(d.ahli.length, 2);
  assert.equal(d.lot.kadar, '150');
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'rn.admin.perm.butiran', peg, { id }).data.pemohon.noKp, undefined, 'No. KP Admin Penuh sahaja');
  // tindakan: tolak perlu catatan; lulus hanya selepas Dinilai
  assert.equal(call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'tolak', catatan: '' }).error.code, 'RN_CATATAN_WAJIB');
  assert.equal(call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'lulus' }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  assert.equal(call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'semak' }).data.status, 'Disemak');
  assert.equal(call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'semak' }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  // kebenaran
  const pemerhati = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.perm.butiran', pemerhati, { id }).ok, true);
  assert.equal(call(env, 'rn.admin.perm.tindakan', pemerhati, { id, tindakan: 'tolak', catatan: 'x' }).error.code, 'TIADA_KEBENARIAN');
  const penilai = login(env, 'penilai@utm.my').token;
  assert.equal(call(env, 'rn.admin.perm.senarai', penilai, {}).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.perm.tindakan', aina, { id, tindakan: 'tolak', catatan: 'x' }).error.code, 'TIADA_KEBENARIAN');
  const lain = login(env, 'pegawai.lain@utm.my').token;
  assert.equal(call(env, 'rn.admin.perm.tindakan', lain, { id, tindakan: 'tolak', catatan: 'x' }).error.code, 'TIADA_KEBENARIAN');
  // paparan fail oleh admin diaudit
  const f = call(env, 'rn.admin.perm.fail', admin, { id, jenis: 'cadangan' });
  assert.equal(f.ok, true);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'PAPAR_FAIL_LOT'));
  // batal oleh admin dengan catatan; pemohon dimaklumkan
  const b = call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'batal', catatan: 'Permintaan pemohon' });
  assert.equal(b.data.status, 'Dibatalkan');
  assert.equal(env.sentTo(AINA).filter((m) => /Permohonan lot dibatalkan/.test(m.subject)).length, 1);
});

test('Bagi pihak pelajar: admin memohon lot, audit bertanda, kebenaran ikut modul', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01');
  ssuLulus(env, admin, AINA);
  const c = call(env, 'rn.bp.cari', admin, { noMatrik: 'a23uj0001' });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.data.pelajar.nama, 'NURUL AINA BINTI HASSAN');
  assert.equal(c.data.rn.boleh.mohon, true);
  const r = call(env, 'rn.bp.mohon.hantar', admin, Object.assign(RN_APP(env), { noMatrik: 'A23UJ0001' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = rows(env, 'Permohonan_Lot')[0];
  assert.equal(p.No_Matrik, 'A23UJ0001');
  const au = rows(env, 'Audit').find((a) => a.Tindakan === 'MOHON_LOT');
  assert.equal(au.Emel, ADMIN);
  assert.match(au.Catatan, /bagi pihak pemohon \[bagi pihak A23UJ0001\]/);
  // peraturan sama: satu lot sahaja
  assert.equal(call(env, 'rn.bp.mohon.hantar', admin, Object.assign(RN_APP(env, { kodLot: 'SM-01' }), { noMatrik: 'A23UJ0001' })).error.code, 'RN_SUDAH_ADA_LOT');
  assert.equal(call(env, 'rn.bp.saya', admin, { noMatrik: 'A23UJ0001' }).data.permohonan.length, 1);
  // kebenaran
  const aina = student(env, AINA);
  assert.equal(call(env, 'rn.bp.saya', aina, { noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN');
  const pemerhati = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.bp.saya', pemerhati, { noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN');
  const lain = login(env, 'pegawai.lain@utm.my').token;
  assert.equal(call(env, 'rn.bp.saya', lain, { noMatrik: 'A23UJ0001' }).error.code, 'TIADA_KEBENARIAN');
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'rn.bp.saya', peg, { noMatrik: 'A23UJ0001' }).ok, true);
  assert.equal(call(env, 'rn.bp.saya', admin, { noMatrik: 'ZZ99999' }).error.code, 'MATRIK_TIDAK_DITEMUI');
  // pelajar lain tidak boleh memanggil rn.* admin
  assert.equal(call(env, 'rn.admin.perm.senarai', aina, {}).error.code, 'TIADA_KEBENARIAN');
});
