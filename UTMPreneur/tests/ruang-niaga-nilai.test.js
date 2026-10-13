'use strict';
/** Ruang Niaga fasa 2: sesi penilaian, skor, kerahsiaan, kunci, kedudukan dan keputusan. */
const test = require('node:test');
const { call, login, student, profiled, setCfg, SSU, assert } = require('./helpers');
const { AINA, WEIJIE, KAVITHA, ADMIN, rows, setRow, hari, rnReady, ssuLulus, bukaLot, RN_APP, mohon } = require('./rn-helpers');

const KRI = ['ORG', 'KANDUNGAN', 'PENERANGAN', 'PASARAN', 'INOVASI', 'KEWANGAN'];
const skor = (tahap, markahMap, ulasan) => KRI.map((k) => ({ kod: k, tahap, markah: markahMap && markahMap[k] !== undefined ? markahMap[k] : undefined, ulasan: ulasan || '' }));

/** 3 pemohon (Disemak) bagi lot SM-01..03, dua penilai. Pulang konteks. */
function sedia() {
  const { env, admin } = rnReady();
  ['SM-01', 'SM-02', 'SM-03'].forEach((k) => bukaLot(env, admin, k));
  call(env, 'admin.tambah', admin, { emel: 'penilai2@utm.my', nama: 'Penilai Dua', peranan: 'Penilai', modul: '' });
  env.advance(61);
  const aina = ssuLulus(env, admin, AINA, 'seni kek aina');
  const weijie = ssuLulus(env, admin, WEIJIE, 'weijie trading');
  const kavitha = ssuLulus(env, admin, KAVITHA, 'kavitha craft');
  const ids = {
    aina: mohon(env, aina, { kodLot: 'SM-01' }), weijie: mohon(env, weijie, { kodLot: 'SM-02' }), kavitha: mohon(env, kavitha, { kodLot: 'SM-03' })
  };
  Object.values(ids).forEach((id) => assert.equal(call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'semak' }).ok, true));
  const p1 = login(env, 'penilai@utm.my').token;
  const p2 = login(env, 'penilai2@utm.my').token;
  return { env, admin, aina, weijie, kavitha, ids, p1, p2 };
}

function buatSesi(c, extra) {
  const r = call(c.env, 'rn.admin.sesi.simpan', c.admin, Object.assign({
    tarikh: hari(c.env, 10), masa: '14:30', tempat: 'Bilik Mesyuarat UTMXCITE', penilai: ['penilai@utm.my', 'penilai2@utm.my'],
    senarai: [{ id: c.ids.aina, masa: '14:30' }, { id: c.ids.weijie, masa: '15:00' }]
  }, extra || {}));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}

test('Sesi penilaian: cipta, pengesahan, status permohonan, satu sesi satu calon', () => {
  const c = sedia();
  const { env, admin, ids } = c;
  const bad = call(env, 'rn.admin.sesi.simpan', admin, { tarikh: 'x', masa: '25:00', tempat: '', penilai: ['aina.contoh@graduate.utm.my'], senarai: [{ id: 'PLT-TIADA', masa: '10:00' }] });
  ['tarikh', 'masa', 'tempat', 'penilai', 'senarai'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  // calon mesti Disemak (bukan Baharu)
  bukaLot(env, admin, 'SM-04');
  const amirul = ssuLulus(env, admin, 'amirul.contoh@graduate.utm.my', 'amirul biz');
  const baharu = mohon(env, amirul, { kodLot: 'SM-04' });
  const tak = call(env, 'rn.admin.sesi.simpan', admin, { tarikh: hari(env, 10), masa: '14:30', tempat: 'X', penilai: ['penilai@utm.my'], senarai: [{ id: baharu, masa: '10:00' }] });
  assert.ok(tak.error.extra.medan.senarai);
  const s = buatSesi(c);
  assert.match(s.id, /^SES-\d{4}-0001$/);
  assert.equal(s.status, 'Dirancang');
  assert.equal(s.versiRubrik, 1);
  assert.equal(s.kriteria.length, 6);
  assert.equal(s.senarai.length, 2);
  assert.equal(rows(env, 'Permohonan_Lot').find((r) => r.ID_Permohonan === ids.aina).Status, 'Disenarai Pendek');
  assert.equal(rows(env, 'Permohonan_Lot').find((r) => r.ID_Permohonan === ids.kavitha).Status, 'Disemak');
  assert.deepEqual(s.tersedia.map((x) => x.id), [ids.kavitha]);
  // calon sudah dalam sesi lain disekat
  const r2 = call(env, 'rn.admin.sesi.simpan', admin, { tarikh: hari(env, 11), masa: '10:00', tempat: 'X', penilai: ['penilai@utm.my'], senarai: [{ id: ids.aina, masa: '10:00' }] });
  assert.ok(r2.error.extra.medan.senarai);
  // tambah calon ketiga dan buang seorang (belum ada skor): status kembali Disemak
  const upd = call(env, 'rn.admin.sesi.simpan', admin, {
    id: s.id, tarikh: hari(env, 10), masa: '14:30', tempat: 'Bilik Mesyuarat', penilai: ['penilai@utm.my', 'penilai2@utm.my'],
    senarai: [{ id: ids.weijie, masa: '15:00' }, { id: ids.kavitha, masa: '15:30' }]
  });
  assert.equal(upd.ok, true, JSON.stringify(upd));
  const st = (id) => rows(env, 'Permohonan_Lot').find((r) => r.ID_Permohonan === id).Status;
  assert.equal(st(ids.aina), 'Disemak');
  assert.equal(st(ids.kavitha), 'Disenarai Pendek');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'CIPTA_SESI_PENILAIAN'));
});

test('Sesi: jemputan emel kepada pemohon, mula sesi, penilai hanya melihat sesi berjalan', () => {
  const c = sedia();
  const { env, admin, ids, p1, p2 } = c;
  const s = buatSesi(c);
  // sebelum mula: penilai tidak melihat apa-apa
  assert.deepEqual(call(env, 'rn.nilai.sesi', p1).data.sesi, []);
  assert.equal(call(env, 'rn.nilai.buka', p1, { sesi: s.id, permohonan: ids.aina }).error.code, 'RN_SESI_TIDAK_BERJALAN');
  const j = call(env, 'rn.admin.sesi.jemput', admin, { id: s.id });
  assert.equal(j.data.jemputanDihantar, 2);
  const m = env.sentTo(AINA).filter((x) => /Jemputan pembentangan/.test(x.subject));
  assert.equal(m.length, 1);
  assert.match(m[0].htmlBody, /14:30/);
  assert.match(m[0].htmlBody, /Bilik Mesyuarat UTMXCITE/);
  assert.equal(env.sentTo(KAVITHA).filter((x) => /Jemputan/.test(x.subject)).length, 0, 'bukan calon');
  // mula
  const mula = call(env, 'rn.admin.sesi.mula', admin, { id: s.id });
  assert.equal(mula.data.status, 'Berjalan');
  assert.equal(env.sentTo('penilai@utm.my').filter((x) => /Sesi penilaian/.test(x.subject)).length, 1);
  const l = call(env, 'rn.nilai.sesi', p1).data.sesi;
  assert.equal(l.length, 1);
  assert.equal(l[0].calon.length, 2);
  assert.equal(l[0].calon[0].status, 'belum');
  assert.equal(call(env, 'rn.admin.sesi.mula', admin, { id: s.id }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  // penilai bukan ahli sesi
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'rn.nilai.sesi', peg).data.sesi.length, 0);
  assert.equal(call(env, 'rn.nilai.buka', peg, { sesi: s.id, permohonan: ids.aina }).error.code, 'RN_BUKAN_PENILAI');
  // calon di luar senarai
  assert.equal(call(env, 'rn.nilai.buka', p2, { sesi: s.id, permohonan: ids.kavitha }).error.code, 'RN_TIDAK_DITEMUI');
  // pelajar tidak boleh memanggil rute penilai
  assert.equal(call(env, 'rn.nilai.sesi', c.aina).error.code, 'TIADA_KEBENARIAN');
});

test('Skrin penilai: maklumat calon, rubrik, skala 5 tahap, markah automatik dan laras dalam julat, draf dan hantar', () => {
  const c = sedia();
  const { env, admin, ids, p1 } = c;
  const s = buatSesi(c);
  call(env, 'rn.admin.sesi.mula', admin, { id: s.id });
  const v = call(env, 'rn.nilai.buka', p1, { sesi: s.id, permohonan: ids.aina });
  assert.equal(v.ok, true, JSON.stringify(v));
  const d = v.data;
  assert.equal(d.calon.namaPelajar, 'NURUL AINA BINTI HASSAN');
  assert.equal(d.calon.noKp, '01****001', 'No. KP bertopeng untuk penilai');
  assert.equal(d.calon.namaSyarikat, 'SENI KEK AINA');
  assert.equal(d.calon.noSsm, '202603001234');
  assert.equal(d.calon.adaCadangan, true);
  assert.deepEqual(d.kriteria.map((k) => k.maks), [10, 20, 20, 20, 20, 10]);
  assert.deepEqual(d.skala.map((x) => x.pct), [100, 80, 60, 40, 20]);
  assert.equal(d.boleh, true);
  assert.equal(d.jumlah, 0);
  // admin penuh melihat No. KP penuh jika menjadi penilai? (bukan penilai: tidak berkaitan). Fail cadangan dimuat turun melalui pelayan
  const f = call(env, 'rn.nilai.fail', p1, { sesi: s.id, permohonan: ids.aina });
  assert.equal(f.ok, true);
  assert.match(Buffer.from(f.data.data, 'base64').toString('utf8'), /^%PDF/);
  assert.equal(call(env, 'rn.nilai.fail', p1, { sesi: s.id, permohonan: ids.kavitha }).error.code, 'RN_TIDAK_DITEMUI');
  // draf: tahap sahaja -> markah automatik
  let r = call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, skor: [{ kod: 'ORG', tahap: 5 }, { kod: 'KANDUNGAN', tahap: 4 }, { kod: 'PENERANGAN', tahap: 3, ulasan: 'Cukup jelas' }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.skor.ORG.markah, 10);
  assert.equal(r.data.skor.KANDUNGAN.markah, 16);
  assert.equal(r.data.skor.PENERANGAN.markah, 12);
  assert.equal(r.data.skor.PENERANGAN.ulasan, 'Cukup jelas');
  assert.equal(r.data.jumlah, 38);
  assert.equal(r.data.status, 'draf');
  // laras dalam julat tahap: tahap 4 bagi 20 markah -> 12 hingga 16
  r = call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, skor: [{ kod: 'KANDUNGAN', tahap: 4, markah: 14.5 }] });
  assert.equal(r.data.skor.KANDUNGAN.markah, 14.5);
  assert.equal(r.data.jumlah, 36.5);
  // luar julat / tahap tiada / markah tidak sah
  r = call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, skor: [{ kod: 'KANDUNGAN', tahap: 4, markah: 18 }, { kod: 'INOVASI', markah: 5 }, { kod: 'PASARAN', tahap: 3, markah: 'abc' }, { kod: 'XYZ', tahap: 1 }] });
  assert.equal(r.error.code, 'RN_SKOR_TIDAK_SAH');
  ['KANDUNGAN', 'INOVASI', 'PASARAN'].forEach((k) => assert.ok(r.error.extra.medan[k], k));
  assert.equal(rows(env, 'Skor_Penilaian').filter((x) => x.Emel_Penilai === 'penilai@utm.my').length, 3, 'draf terdahulu tidak rosak');
  // hantar tidak lengkap
  r = call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, hantar: true, skor: [] });
  assert.equal(r.error.code, 'RN_SKOR_TIDAK_SAH');
  assert.ok(r.error.extra.medan.PASARAN && r.error.extra.medan.INOVASI && r.error.extra.medan.KEWANGAN);
  // hantar lengkap -> kunci
  r = call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, hantar: true, skor: [{ kod: 'PASARAN', tahap: 5 }, { kod: 'INOVASI', tahap: 4 }, { kod: 'KEWANGAN', tahap: 2 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'dihantar');
  assert.equal(r.data.dikunci, true);
  assert.equal(r.data.boleh, false);
  assert.equal(r.data.jumlah, 10 + 14.5 + 12 + 20 + 16 + 4);
  assert.equal(rows(env, 'Skor_Penilaian').filter((x) => x.Emel_Penilai === 'penilai@utm.my' && x.ID_Permohonan === ids.aina).every((x) => x.Dikunci === 'Ya' && x.Masa_Hantar), true);
  assert.equal(call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, skor: [{ kod: 'ORG', tahap: 1 }] }).error.code, 'RN_SKOR_DIKUNCI');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'HANTAR_SKOR_PENILAIAN' && a.Rujukan === ids.aina));
});

test('Kerahsiaan: penilai tidak melihat skor penilai lain sehingga sesi ditutup; pemohon tidak nampak skor', () => {
  const c = sedia();
  const { env, admin, ids, p1, p2, aina } = c;
  const s = buatSesi(c);
  call(env, 'rn.admin.sesi.mula', admin, { id: s.id });
  call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, hantar: true, skor: skor(5) });
  // penilai 2 melihat calon yang sama: tiada jejak skor penilai 1
  const v2 = call(env, 'rn.nilai.buka', p2, { sesi: s.id, permohonan: ids.aina });
  const txt2 = JSON.stringify(v2.data);
  assert.equal(v2.data.jumlah, 0);
  assert.equal(v2.data.ranking, undefined);
  assert.ok(!txt2.includes('penilai@utm.my') && !txt2.includes('"purata"'), 'tiada data penilai lain');
  const senarai2 = JSON.stringify(call(env, 'rn.nilai.sesi', p2).data);
  assert.ok(!senarai2.includes('100') || !/"jumlah":100/.test(senarai2));
  assert.equal(call(env, 'rn.nilai.sesi', p2).data.sesi[0].calon[0].status, 'belum');
  // pemohon tidak nampak skor dalam mana-mana paparan
  const sa = JSON.stringify(call(env, 'rn.saya', aina).data);
  assert.ok(!/purata|kedudukan|skor/i.test(sa));
  assert.equal(call(env, 'rn.admin.sesi.butiran', aina, { id: s.id }).error.code, 'TIADA_KEBENARIAN');
  // penilai tidak boleh memanggil rute admin sesi
  assert.equal(call(env, 'rn.admin.sesi.butiran', p1, { id: s.id }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.sesi.skor', p1, { sesi: s.id, permohonan: ids.aina }).error.code, 'TIADA_KEBENARIAN');
  // admin melihat skor sebenar
  const sk = call(env, 'rn.admin.sesi.skor', admin, { sesi: s.id, permohonan: ids.aina }).data;
  assert.equal(sk.penilai.find((x) => x.emel === 'penilai@utm.my').jumlah, 100);
  assert.equal(sk.penilai.find((x) => x.emel === 'penilai2@utm.my').status, 'belum');
});

test('Tutup sesi: belum lengkap perlu pengesahan; purata, kedudukan, beza jauh; admin memutuskan tanpa kelulusan automatik', () => {
  const c = sedia();
  const { env, admin, ids, p1, p2, aina } = c;
  const s = buatSesi(c);
  call(env, 'rn.admin.sesi.mula', admin, { id: s.id });
  // Aina: P1 100, P2 60 (beza 40 -> ditanda). Weijie: P1 80 sahaja.
  call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, hantar: true, skor: skor(5) });
  call(env, 'rn.nilai.simpan', p2, { sesi: s.id, permohonan: ids.aina, hantar: true, skor: skor(3) });
  call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.weijie, hantar: true, skor: skor(4) });
  let b = call(env, 'rn.admin.sesi.butiran', admin, { id: s.id }).data;
  const a = b.senarai.find((x) => x.id === ids.aina);
  assert.equal(a.purata, 80);
  assert.equal(a.kedudukan, 1);
  assert.equal(a.bezaJauh, true);
  assert.equal(a.selisih, 40);
  const w = b.senarai.find((x) => x.id === ids.weijie);
  assert.equal(w.purata, 80);
  assert.equal(w.kedudukan, 1, 'seri berkongsi kedudukan');
  assert.equal(w.bezaJauh, false);
  assert.equal(w.penilai.find((x) => x.emel === 'penilai2@utm.my').status, 'belum');
  // tutup tanpa pengesahan -> amaran
  const t1 = call(env, 'rn.admin.sesi.tutup', admin, { id: s.id });
  assert.equal(t1.error.code, 'RN_SESI_BELUM_LENGKAP');
  assert.equal(t1.error.extra.belum.length, 1);
  assert.equal(rows(env, 'Sesi_Penilaian')[0].Status, 'Berjalan');
  // admin membuka semula kunci penilai 1 (audit), penilai 1 menukar skor weijie
  assert.equal(call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.weijie, skor: [{ kod: 'ORG', tahap: 1 }] }).error.code, 'RN_SKOR_DIKUNCI');
  assert.equal(call(env, 'rn.admin.sesi.skorBuka', p1, { sesi: s.id, permohonan: ids.weijie, emel: 'penilai@utm.my' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.sesi.skorBuka', admin, { sesi: s.id, permohonan: ids.weijie, emel: 'penilai@utm.my' }).ok, true);
  assert.ok(rows(env, 'Audit').some((x) => x.Tindakan === 'BUKA_SEMULA_SKOR' && x.Rujukan === ids.weijie));
  assert.equal(call(env, 'rn.nilai.buka', p1, { sesi: s.id, permohonan: ids.weijie }).data.boleh, true);
  call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.weijie, hantar: true, skor: skor(2) });
  call(env, 'rn.nilai.simpan', p2, { sesi: s.id, permohonan: ids.weijie, hantar: true, skor: skor(2) });
  // semua dihantar: tutup tanpa paksa
  const t2 = call(env, 'rn.admin.sesi.tutup', admin, { id: s.id });
  assert.equal(t2.ok, true, JSON.stringify(t2));
  assert.equal(t2.data.status, 'Ditutup');
  const st = (id) => rows(env, 'Permohonan_Lot').find((r) => r.ID_Permohonan === id).Status;
  assert.equal(st(ids.aina), 'Dinilai');
  assert.equal(st(ids.weijie), 'Dinilai');
  const rk = t2.data.senarai;
  assert.equal(rk.find((x) => x.id === ids.aina).kedudukan, 1);
  assert.equal(rk.find((x) => x.id === ids.weijie).kedudukan, 2);
  assert.equal(rk.find((x) => x.id === ids.weijie).purata, 40);
  // tiada penilaian selepas ditutup
  assert.equal(call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, skor: [{ kod: 'ORG', tahap: 1 }] }).error.code, 'RN_SESI_DITUTUP');
  assert.equal(call(env, 'rn.admin.sesi.skorBuka', admin, { sesi: s.id, permohonan: ids.aina, emel: 'penilai@utm.my' }).error.code, 'RN_SESI_TIDAK_BERJALAN');
  // penilai kini melihat purata dan kedudukan (bukan skor individu penilai lain)
  const v = call(env, 'rn.nilai.buka', p2, { sesi: s.id, permohonan: ids.aina }).data;
  assert.deepEqual(v.ranking, { purata: 80, kedudukan: 1, bilDihantar: 2 });
  assert.ok(!JSON.stringify(v).includes('penilai@utm.my'));
  // pemohon masih tidak nampak skor
  assert.ok(!/purata|kedudukan/i.test(JSON.stringify(call(env, 'rn.saya', aina).data)));
  // tiada kelulusan automatik: kekal Dinilai sehingga admin memutuskan
  assert.equal(st(ids.aina), 'Dinilai');
  const det = call(env, 'rn.admin.perm.butiran', admin, { id: ids.aina }).data;
  assert.equal(det.penilaian.kedudukan, 1);
  assert.equal(det.penilaian.purata, 80);
  const lulus = call(env, 'rn.admin.perm.tindakan', admin, { id: ids.aina, tindakan: 'lulus', ulasan: 'Tahniah' });
  assert.equal(lulus.data.status, 'Diluluskan');
  assert.equal(lulus.data.keputusan.oleh, ADMIN);
  const tolak = call(env, 'rn.admin.perm.tindakan', admin, { id: ids.weijie, tindakan: 'tolak', catatan: 'Kedudukan rendah' });
  assert.equal(tolak.data.status, 'Ditolak');
  assert.equal(env.sentTo(AINA).filter((m) => /Permohonan lot diluluskan/.test(m.subject)).length, 1);
  // pemerhati melihat tetapi tidak boleh bertindak
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.sesi.butiran', pem, { id: s.id }).ok, true);
  assert.equal(call(env, 'rn.admin.sesi.tutup', pem, { id: s.id }).error.code, 'TIADA_KEBENARIAN');
  // sesi ditutup tidak boleh dibuka semula selepas keputusan
  assert.equal(call(env, 'rn.admin.sesi.bukaSemula', admin, { id: s.id }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
});

test('Tutup dengan paksa dan buka semula sesi (sebelum keputusan)', () => {
  const c = sedia();
  const { env, admin, ids, p1 } = c;
  const s = buatSesi(c);
  call(env, 'rn.admin.sesi.mula', admin, { id: s.id });
  call(env, 'rn.nilai.simpan', p1, { sesi: s.id, permohonan: ids.aina, hantar: true, skor: skor(4) });
  const t = call(env, 'rn.admin.sesi.tutup', admin, { id: s.id, paksa: true });
  assert.equal(t.ok, true);
  const st = (id) => rows(env, 'Permohonan_Lot').find((r) => r.ID_Permohonan === id).Status;
  assert.equal(st(ids.aina), 'Dinilai');
  assert.equal(st(ids.weijie), 'Disenarai Pendek', 'tiada skor dihantar: kekal');
  const b = call(env, 'rn.admin.sesi.bukaSemula', admin, { id: s.id, catatan: 'Penilai kedua terlepas' });
  assert.equal(b.data.status, 'Berjalan');
  assert.equal(st(ids.aina), 'Disenarai Pendek');
  assert.ok(rows(env, 'Audit').some((x) => x.Tindakan === 'BUKA_SEMULA_SESI_PENILAIAN'));
  // calon dengan skor tidak boleh dibuang daripada sesi
  const r = call(env, 'rn.admin.sesi.simpan', admin, { id: s.id, tarikh: hari(env, 10), masa: '14:30', tempat: 'X', penilai: ['penilai@utm.my'], senarai: [{ id: ids.weijie, masa: '15:00' }] });
  assert.ok(r.error.extra.medan.senarai);
});

test('Julat markah mengikut tahap', () => {
  const { env } = rnReady();
  assert.deepEqual(env.plain(env.run('[RnNilai.julat(20, 5), RnNilai.julat(20, 4), RnNilai.julat(20, 3), RnNilai.julat(20, 2), RnNilai.julat(20, 1), RnNilai.julat(10, 1)]')),
    [[16, 20], [12, 16], [8, 12], [4, 8], [0, 4], [0, 2]]);
});
