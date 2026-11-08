'use strict';
/** Ciri yang diserap daripada proses SSU lama: tujuan permohonan, senarai pensyarah, pengesahan ahli, dashboard dan CSV. */
const test = require('node:test');
const { ready, call, login, student, profiled, SSU, assert } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const AMIRUL = 'amirul.contoh@graduate.utm.my';
const ADMIN = 'utmxcite@utm.my';
const PEGAWAI = 'pegawai@utm.my';
const PEMERHATI = 'pemerhati@utm.my';

const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));

function addAdmin(env, tok, emel, peranan, modul) {
  const r = call(env, 'admin.tambah', tok, { emel, nama: 'Pegawai Contoh', peranan, modul: modul || '' });
  assert.equal(r.ok, true, JSON.stringify(r));
}

function base() {
  const env = ready();
  const admin = login(env, ADMIN).token;
  addAdmin(env, admin, PEGAWAI, 'Pegawai Modul', 'SSU');
  addAdmin(env, admin, PEMERHATI, 'Pemerhati');
  const aina = profiled(env, AINA);
  return { env, admin, aina };
}

const senarai = (env, tok, extra) => call(env, 'ssu.admin.senarai', tok, extra || {});

test('Tujuan: wajib bagi pelajar; subjek hanya wajib bila tujuan = keperluan subjek', () => {
  const { env, aina } = base();
  let r = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { tujuan: '' }));
  assert.equal(r.error.code, 'SSU_TIDAK_SAH');
  assert.ok(r.error.extra.medan.tujuan);

  // tujuan SUBJEK: pensyarah, no. pekerja, emel, seksyen, kumpulan wajib; subjek TIADA tidak sah
  const kosong = Object.assign(SSU(), { pensyarah: '', pensyarahNo: '', pensyarahEmel: '', seksyen: '', kumpulan: '', syaratSubjek: 'TIADA' });
  r = call(env, 'ssu.hantar', aina, kosong);
  const m = r.error.extra.medan;
  ['pensyarah', 'pensyarahNo', 'pensyarahEmel', 'seksyen', 'kumpulan', 'syaratSubjek', 'pensyarahPilih'].forEach((k) => assert.ok(m[k], 'sepatutnya ralat ' + k));

  // tujuan ACARA: medan subjek diabaikan dan dikosongkan
  r = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { tujuan: 'ACARA', syaratSubjek: 'UBSS1032', pensyarah: 'Dr. X', seksyen: '9', kumpulan: 'Z' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = rows(env, 'Permohonan_SSU')[0];
  assert.equal(p.Tujuan, 'ACARA');
  assert.equal(p.Syarat_Subjek, 'TIADA');
  assert.equal(p.Pensyarah, '');
  assert.equal(p.Seksyen, '');
});

test('Admin: tujuan dipaparkan dan boleh ditapis dalam senarai', () => {
  const { env, admin, aina } = base();
  const id = call(env, 'ssu.hantar', aina, SSU()).data.id;
  const d = call(env, 'ssu.admin.butiran', admin, { id }).data;
  assert.equal(d.borang.tujuan, 'SUBJEK');
  assert.match(d.label.tujuan, /subjek/i);
  assert.equal(senarai(env, admin, { tujuan: 'SUBJEK' }).data.senarai.length, 1);
  assert.equal(senarai(env, admin, { tujuan: 'ACARA' }).data.senarai.length, 0);
});

test('Pensyarah: import oleh Admin Penuh sahaja, pilihan pelajar disahkan, taipan manual ditanda belum disahkan dan boleh ditambah admin', () => {
  const { env, admin, aina } = base();
  const pegawai = login(env, PEGAWAI).token;
  const teks = 'No_Pekerja;Nama;Fakulti;Jawatan;Emel;Telefon\n12345\tDr. Contoh\tFC\tPensyarah\tdr.contoh@utm.my\t0123\nA1;Prof Dua;FKE;Prof;dua@utm.my;\nrosak';
  assert.equal(call(env, 'ssu.admin.pensyarahImport', pegawai, { teks }).error.code, 'TIADA_KEBENARIAN');
  const imp = call(env, 'ssu.admin.pensyarahImport', admin, { teks });
  assert.deepEqual(imp.data, { tambah: 2, langkau: 0, ralat: [4] });
  assert.equal(call(env, 'ssu.admin.pensyarahImport', admin, { teks }).data.langkau, 2, 'import semula melangkau yang sudah ada');
  assert.equal(rows(env, 'Pensyarah').length, 2);

  const lst = call(env, 'ssu.pensyarah', aina).data.senarai;
  assert.equal(lst.length, 2);
  assert.equal(lst[0].emel, undefined, 'emel pensyarah tidak didedahkan kepada pelajar');

  // pilih daripada senarai
  let r = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { pensyarahPilih: 'A1', pensyarah: '', pensyarahNo: '', pensyarahEmel: '' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  let p = rows(env, 'Permohonan_SSU')[0];
  assert.equal(p.Pensyarah, 'PROF DUA');
  assert.equal(p.Pensyarah_Disahkan, 'Ya');
  assert.equal(p.Pensyarah_Emel, 'dua@utm.my');
  // pilihan tidak wujud
  assert.ok(call(env, 'ssu.hantar', aina, Object.assign(SSU(), { id: r.data.id, pensyarahPilih: 'TIADA99' })).error);
});

test('Pensyarah manual: admin menambah ke senarai, bertindih ditolak, dan semuanya diaudit', () => {
  const { env, admin, aina } = base();
  const id = call(env, 'ssu.hantar', aina, SSU()).data.id;
  const d0 = call(env, 'ssu.admin.butiran', admin, { id }).data;
  assert.equal(d0.pensyarah.disahkan, false);
  assert.ok(d0.amaran.some((a) => /Pensyarah .* belum disahkan/.test(a)));
  const r = call(env, 'ssu.admin.pensyarahTambah', admin, { id, fakulti: 'FC', jawatan: 'Pensyarah Kanan', telefon: '0123456789' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.pensyarah.disahkan, true);
  const reg = rows(env, 'Pensyarah');
  assert.equal(reg.length, 1);
  assert.equal(reg[0].No_Pekerja, '12345');
  assert.equal(reg[0].Nama, 'DR. CONTOH');
  assert.equal(call(env, 'ssu.admin.pensyarahTambah', admin, { id }).error.code, 'SSU_PENSYARAH_SUDAH_DISAHKAN');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'SSU_PENSYARAH_TAMBAH'));
  // pemerhati tidak boleh memutuskan
  const pemerhati = login(env, PEMERHATI).token;
  assert.equal(call(env, 'ssu.admin.pensyarahTambah', pemerhati, { id }).error.code, 'TIADA_KEBENARIAN');
});

test('Pensyarah manual bertindih dengan senarai (emel sama) ditolak', () => {
  const { env, admin, aina } = base();
  call(env, 'ssu.admin.pensyarahImport', admin, { teks: '999;Dr Lain;FC;Pensyarah;dr.contoh@utm.my;' });
  const id = call(env, 'ssu.hantar', aina, SSU()).data.id;
  assert.equal(call(env, 'ssu.admin.pensyarahTambah', admin, { id }).error.code, 'SSU_PENSYARAH_ADA');
});

test('Pengesahan ahli: emel dihantar, hanya ahli berkenaan boleh mengesahkan, amaran admin hilang selepas disahkan', () => {
  const { env, admin, aina } = base();
  const amirul = student(env, AMIRUL);
  const id = call(env, 'ssu.hantar', aina, SSU()).data.id;
  const mel = env.sentTo(AMIRUL).filter((x) => /Sahkan penyertaan/.test(x.subject));
  assert.equal(mel.length, 1, 'ahli menerima emel pengesahan');
  assert.equal(env.sentTo(AINA).filter((x) => /Sahkan penyertaan/.test(x.subject)).length, 0, 'pemilik tidak perlu mengesahkan');

  let a = rows(env, 'Ahli_Pasukan');
  assert.ok(a[1].Token_Pengesahan && !a[1].Tarikh_Sah);
  const sa = call(env, 'ssu.saya', amirul).data;
  assert.equal(sa.sertaan[0].perluSah, true);
  assert.ok(call(env, 'ssu.admin.butiran', admin, { id }).data.amaran.some((x) => /belum mengesahkan penyertaan/.test(x)));

  // pemilik tidak boleh mengesahkan bagi pihak ahli; ahli lain tidak boleh
  assert.equal(call(env, 'ssu.sahkanAhli', aina, { id }).error.code, 'SSU_AHLI_TIDAK_DITEMUI');
  assert.equal(call(env, 'ssu.sahkanAhli', amirul, { id: 'SSU-2026-9999' }).error.code, 'SSU_AHLI_TIDAK_DITEMUI');

  const ok = call(env, 'ssu.sahkanAhli', amirul, { id });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.data.sertaan[0].perluSah, false);
  a = rows(env, 'Ahli_Pasukan');
  assert.ok(a[1].Tarikh_Sah);
  assert.equal(a[1].Disahkan_Oleh, 'Ahli');
  assert.equal(a[1].Token_Pengesahan, '');
  const d = call(env, 'ssu.admin.butiran', admin, { id }).data;
  assert.equal(d.ahli[1].perluSah, false);
  assert.ok(d.ahli[1].disahkan);
  assert.ok(!d.amaran.some((x) => /belum mengesahkan penyertaan/.test(x)));
  // ulang adalah idempotent
  assert.equal(call(env, 'ssu.sahkanAhli', amirul, { id }).ok, true);
});

test('Pengesahan ahli: admin sahkan bagi pihak, hantar semula token baharu, dan hantar semula permohonan mengekalkan status ahli', () => {
  const { env, admin, aina } = base();
  const id = call(env, 'ssu.hantar', aina, SSU()).data.id;
  const lama = rows(env, 'Ahli_Pasukan')[1].Token_Pengesahan;
  const pemerhati = login(env, PEMERHATI).token;
  assert.equal(call(env, 'ssu.admin.ahliHantar', pemerhati, { id, noMatrik: 'A23UJ0002' }).error.code, 'TIADA_KEBENARIAN');

  const re = call(env, 'ssu.admin.ahliHantar', admin, { id, noMatrik: 'A23UJ0002' });
  assert.equal(re.ok, true, JSON.stringify(re));
  const baru = rows(env, 'Ahli_Pasukan')[1].Token_Pengesahan;
  assert.ok(baru && baru !== lama);
  assert.equal(env.sentTo(AMIRUL).filter((x) => /Sahkan penyertaan/.test(x.subject)).length, 2);

  const sah = call(env, 'ssu.admin.ahliSah', admin, { id, noMatrik: 'A23UJ0002' });
  assert.equal(sah.ok, true, JSON.stringify(sah));
  assert.match(rows(env, 'Ahli_Pasukan')[1].Disahkan_Oleh, /^Admin: /);
  assert.equal(call(env, 'ssu.admin.ahliSah', admin, { id, noMatrik: 'A23UJ0002' }).error.code, 'SSU_AHLI_TIDAK_DITEMUI');
  assert.equal(call(env, 'ssu.admin.ahliHantar', admin, { id, noMatrik: 'A23UJ0002' }).error.code, 'SSU_AHLI_TIDAK_DITEMUI');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'SSU_AHLI_SAH_ADMIN'));

  // pembetulan lalu hantar semula: ahli yang sudah sah kekal sah dan tidak dihantar emel lagi
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'Betulkan alamat' }).ok, true);
  const r = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { id, alamat: 'No 99, Jalan Mawar, Taman Universiti, 81300 Skudai, Johor' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(rows(env, 'Ahli_Pasukan')[1].Tarikh_Sah, 'status pengesahan dikekalkan');
  assert.equal(env.sentTo(AMIRUL).filter((x) => /Sahkan penyertaan/.test(x.subject)).length, 2);
});

test('Pendaftaran sedia ada oleh admin: ahli terus dianggap disahkan tanpa emel', () => {
  const { env, admin } = base();
  const r = call(env, 'ssu.admin.sedia', admin, {
    noMatrik: 'A23UJ0001', nama: 'kedai lama', jenisPerniagaan: 'SOLE', kluster: 'MANUF', alamat: 'No 12, Jalan Mawar, Taman Universiti, 81300 Skudai, Johor', ahli: ['A23UJ0002']
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = rows(env, 'Ahli_Pasukan');
  assert.ok(a[1].Tarikh_Sah);
  assert.equal(a[1].Disahkan_Oleh, 'Admin (sedia ada)');
  assert.equal(env.sentTo(AMIRUL).filter((x) => /Sahkan penyertaan/.test(x.subject)).length, 0);
});

test('Dashboard SSU: kiraan dan kebenaran peranan', () => {
  const { env, admin, aina } = base();
  const id = call(env, 'ssu.hantar', aina, SSU()).data.id;
  const pemerhati = login(env, PEMERHATI).token;
  let d = call(env, 'ssu.admin.dashboard', pemerhati).data;
  assert.equal(d.jumlah, 1);
  assert.equal(d.diluluskan, 0);
  assert.equal(d.ahliBelumSah, 1);
  assert.equal(d.pensyarahBelumSah, 1);
  assert.equal(d.tujuan[0].kod, 'SUBJEK');
  assert.equal(d.bolehUrus, false);
  assert.deepEqual(d.status.map((x) => x.kod + ':' + x.bil), ['Baharu:1']);
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus', catatan: '' }).ok, true);
  d = call(env, 'ssu.admin.dashboard', admin).data;
  assert.equal(d.diluluskan, 1);
  assert.equal(d.kluster[0].label.length > 0, true);
  assert.equal(d.produk.length, 1);
  assert.equal(d.statusSsm[0].kod, 'YA');
  assert.equal(d.ahliBelumSah, 0, 'permohonan diluluskan tidak lagi menunggu pengesahan');
  assert.equal(d.bolehUrus, true);
  // pelajar tidak boleh
  assert.equal(call(env, 'ssu.admin.dashboard', aina).error.code, 'TIADA_KEBENARIAN');
});

test('CSV Daftar SSU: hanya yang diluluskan, No. KP untuk Admin Penuh sahaja, formula dinyahaktifkan, diaudit', () => {
  const { env, admin, aina } = base();
  const id = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { pensyarah: '=HYPERLINK("x")' })).data.id;
  const csv0 = call(env, 'ssu.admin.csv', admin).data;
  assert.equal(csv0.bil, 0, 'belum diluluskan tidak dieksport');
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus', catatan: '' }).ok, true);
  const pel = rows(env, 'PELAJAR').find((x) => x.No_Matrik === 'A23UJ0001');
  assert.ok(pel.No_KP_Pasport);

  const penuh = call(env, 'ssu.admin.csv', admin).data;
  assert.equal(penuh.bil, 1);
  assert.match(penuh.nama, /^daftar-ssu_\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = penuh.teks.replace(/^﻿/, '').trim().split('\r\n');
  const head = lines[0].split(',');
  const val = (ln, col) => ln.split(',')[head.indexOf(col)];
  assert.ok(val(lines[1], 'No_KP').includes(pel.No_KP_Pasport));
  assert.ok(lines[1].includes("\"'=HYPERLINK(\"\"x\"\")\""), 'formula dinyahaktifkan dengan awalan petik');
  assert.match(val(lines[1], 'No_Pendaftaran'), /^XCITE/);

  const pemerhati = login(env, PEMERHATI).token;
  const pm = call(env, 'ssu.admin.csv', pemerhati).data;
  const l2 = pm.teks.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(val(l2[1], 'No_KP'), '', 'No. KP tidak didedahkan kepada Pemerhati');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'SSU_EKSPORT_CSV'));
  assert.equal(call(env, 'ssu.admin.csv', aina).error.code, 'TIADA_KEBENARIAN');
});
