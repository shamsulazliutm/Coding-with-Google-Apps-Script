'use strict';
/** Makerspace fasa 2: tempahan ruang (notis, kapasiti, kaedah bayaran, peralatan, fail) dan perakuan penyelia melalui pautan. */
const test = require('node:test');
const H = require('./makerspace-helpers');
const { call, login, student, assert, mkEnv, AINA, AMIRUL, PENYELIA, rows, rowsBy, RUANG, LASER, PDF, opDay, bekukan, tokenPerakuan, kodOtp, perakui } = H;

const IS_ISNIN = '2026-10-19'; // Isnin
const KHAMIS = '2026-10-22';

function daftarStaf(env, emel) {
  const t = login(env, emel).token;
  assert.equal(call(env, 'daftar.profil', t, { nama: 'Dr. Staf Satu', noStaf: 'S1234', jabatan: 'Fakulti Komputeran', telefon: '0129876543' }).ok, true);
  return t;
}

test('Ruang: tempahan sah dengan anggaran (hari + caj perkhidmatan + peralatan), butiran dan fail disimpan', () => {
  const { env } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, IS_ISNIN, '09:00');
  const tarikh = KHAMIS;
  const p = RUANG({ tarikh, bilHari: 2, peralatan: [{ kod: 'ALAT_FLIP_CHART', kuantiti: 2 }, { kod: 'ALAT_LCD_PROJECTOR', kuantiti: 1 }], failSurat: PDF('surat.pdf') });
  const est = call(env, 'mk.anggar', t, p).data;
  assert.deepEqual(est.ralat, {});
  assert.equal(est.jumlah, 2 * 100 + 150 + 2 * 10 * 2 + 0, '2 hari x RM100 + RM150 + 2 flip chart x RM10 x 2 hari');
  assert.deepEqual(est.belum, []);
  const r = call(env, 'mk.hantar', t, p);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.anggaran, 390);
  const tm = rows(env, 'Tempahan')[0];
  assert.equal(tm.Jenis, 'Ruang');
  assert.equal(tm.Kod_Sumber, 'MAKER_LAB');
  assert.equal(H.todayKey().length, 10);
  assert.equal(env.plain(env.run(`Util.dateKey(Mk.tempahan(${JSON.stringify(r.data.id)}).Tarikh_Mula)`)), KHAMIS);
  assert.equal(env.plain(env.run(`Util.dateKey(Mk.tempahan(${JSON.stringify(r.data.id)}).Tarikh_Tamat)`)), '2026-10-23', '2 hari operasi: Khamis dan Jumaat');
  assert.equal(tm.Masa_Mula, '09:00');
  assert.equal(tm.Masa_Tamat, '16:00');
  const b = rows(env, 'Butiran_Ruang')[0];
  assert.equal(b.Bil_Hari, 2);
  assert.equal(b.Bil_Peserta, 50);
  assert.equal(b.Kaedah_Bayaran, 'Tunai');
  assert.match(b.Fail_Kertas_Kerja, /drive\.google\.com/);
  assert.match(b.Fail_Surat, /drive\.google\.com/);
  assert.equal(rows(env, 'Item_Peralatan_Ruang').length, 2);
  const d = call(env, 'mk.butiran', t, { id: r.data.id }).data;
  assert.equal(d.butiran.kapasiti, 200);
  assert.deepEqual(d.fail, { kertas: true, surat: true });
  assert.ok(!JSON.stringify(d).includes('drive.google.com'));
  assert.equal(call(env, 'mk.fail', t, { id: r.data.id, jenis: 'kertas' }).ok, true);
});

test('Ruang: tempahan merentas hujung minggu menghitung hari operasi sahaja', () => {
  const { env } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, IS_ISNIN, '09:00');
  const r = call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-10-23', bilHari: 3 })); // Jumaat, Isnin, Selasa
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.plain(env.run(`Util.dateKey(Mk.tempahan(${JSON.stringify(r.data.id)}).Tarikh_Tamat)`)), '2026-10-27');
  // ruang yang sama pada Isnin 26 (di tengah julat) bertindih; ruang lain tidak
  const t2 = student(env, AMIRUL);
  const k = call(env, 'mk.hantar', t2, RUANG({ tarikh: '2026-10-26', masaMula: '10:00', masaTamat: '12:00' }));
  assert.equal(k.error.code, 'MK_TIDAK_SAH');
  assert.ok(k.error.extra.medan.tarikh);
  assert.equal(call(env, 'mk.hantar', t2, RUANG({ tarikh: '2026-10-26', kodSumber: 'BILIK_MESYUARAT', bilPeserta: 10 })).ok, true);
  // masa tidak bertindih pada hari yang sama dengan ruang sama dibenarkan? tidak: tetingkap harian 09:00-16:00 sudah menduduki hari itu
  assert.equal(call(env, 'mk.hantar', t2, RUANG({ tarikh: '2026-10-26', masaMula: '16:00', masaTamat: '17:00', peralatan: [] })).ok, true, 'bersebelahan 16:00 dibenarkan');
});

test('Ruang: notis 3 hari bekerja (cuti dikecualikan), kapasiti, kaedah bayaran, VOT, peralatan dan fail', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, IS_ISNIN, '09:00');
  const medan = (o) => { const r = call(env, 'mk.hantar', t, RUANG(Object.assign({ tarikh: '2026-10-26' }, o))); assert.equal(r.error.code, 'MK_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  // Isnin 19 -> Rabu 21 = 2 hari bekerja sahaja; Khamis 22 = 3
  assert.match(medan({ tarikh: '2026-10-21' }).tarikh, /3 hari bekerja/);
  assert.equal(call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-10-22', masaMula: '08:00', masaTamat: '09:00', peralatan: [] })).ok, true, 'tepat 3 hari bekerja');
  // cuti pada Rabu 21 mengurangkan hari bekerja: Khamis 29 selepas Isnin 26 = ok; tetapi tarikh 23 dengan cuti 21,22 -> hanya 1
  env.run(`Db.append('Cuti', { Tarikh: Util.toDate('2026-10-21'), Nama: 'Cuti', Jenis: 'Universiti' })`);
  env.run(`Db.append('Cuti', { Tarikh: Util.toDate('2026-10-22'), Nama: 'Cuti', Jenis: 'Universiti' })`);
  assert.ok(medan({ tarikh: '2026-10-23', masaMula: '08:00', masaTamat: '09:00' }).tarikh, 'cuti tidak dikira hari bekerja (hanya 20 dan 23)');
  assert.equal(call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-10-27', masaMula: '08:00', masaTamat: '09:00', peralatan: [] })).ok, true);
  assert.ok(medan({ bilPeserta: 201 }).bilPeserta, 'melebihi kapasiti Maker Lab');
  assert.ok(medan({ kodSumber: 'BILIK_MESYUARAT', bilPeserta: 21 }).bilPeserta, 'melebihi kapasiti Bilik Mesyuarat');
  assert.ok(medan({ bilPeserta: 0 }).bilPeserta);
  assert.ok(medan({ bilHari: 0 }).bilHari);
  assert.ok(medan({ bilHari: 15 }).bilHari);
  assert.ok(medan({ masaMula: '07:00' }).masaMula);
  assert.ok(medan({ masaMula: '15:00', masaTamat: '14:00' }).masaTamat);
  assert.ok(medan({ masaTamat: '18:00' }).masaMula);
  assert.ok(medan({ namaProgram: '' }).namaProgram);
  assert.ok(medan({ kaedahBayaran: 'Cek' }).kaedahBayaran);
  assert.ok(medan({ kaedahBayaran: 'Lain-lain' }).kaedahLain);
  const iv = medan({ kaedahBayaran: 'Invois Dalaman' });
  assert.ok(iv.noVot && iv.namaStafKewangan && iv.telStafKewangan, 'VOT, nama dan telefon staf kewangan wajib');
  assert.ok(medan({ peralatan: [{ kod: 'ALAT_TIDAK_WUJUD', kuantiti: 1 }] }).peralatan);
  assert.ok(medan({ peralatan: [{ kod: 'ALAT_FLIP_CHART', kuantiti: 0 }] }).peralatan);
  assert.ok(medan({ peralatan: [{ kod: 'ALAT_FLIP_CHART', kuantiti: 1 }, { kod: 'ALAT_FLIP_CHART', kuantiti: 1 }] }).peralatan, 'pendua');
  assert.ok(medan({ failKertasKerja: null }).failKertasKerja, 'kertas kerja wajib');
  assert.ok(medan({ failKertasKerja: H.PNG('x.png') }).failKertasKerja, 'kertas kerja PDF sahaja');
  assert.ok(medan({ failSurat: { nama: 's.pdf', data: H.PNG().data } }).failSurat, 'kandungan bukan PDF');
  // pilihan sah
  const ok = call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-10-28', kaedahBayaran: 'Invois Dalaman', noVot: 'V12345', namaStafKewangan: 'Puan Aminah', telStafKewangan: '0123456789', kodSumber: 'BILIK_MESYUARAT', bilPeserta: 20 }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(rowsBy(env, 'Butiran_Ruang', 'ID_Tempahan', ok.data.id)[0].No_VOT, 'V12345');
  const lain = call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-10-29', kaedahBayaran: 'Lain-lain', kaedahLain: 'Bayaran melalui persatuan' }));
  assert.equal(lain.ok, true, JSON.stringify(lain));
  assert.equal(rowsBy(env, 'Butiran_Ruang', 'ID_Tempahan', lain.data.id)[0].Kaedah_Lain, 'Bayaran melalui persatuan');
  // peralatan dengan kadar belum ditetapkan boleh dipilih tetapi dilaporkan dalam anggaran
  const est = call(env, 'mk.anggar', t, RUANG({ tarikh: '2026-10-30', peralatan: [{ kod: 'ALAT_EXTENSION_WIRE', kuantiti: 1 }] })).data;
  assert.deepEqual(est.belum, ['ALAT_EXTENSION_WIRE']);
  assert.equal(call(env, 'mk.admin.ringkasan', admin).data.menungguPerakuan, 4);
});

test('Ruang: staf dan orang luar - surat wajib, Invois Dalaman untuk warga UTM sahaja, kadar ikut jenis', () => {
  const { env } = mkEnv();
  bekukan(env, IS_ISNIN, '09:00');
  const ts = daftarStaf(env, H.STAF);
  const tl = login(env, H.LUAR).token;
  call(env, 'daftar.profil', tl, { nama: 'Ali Luar', noKp: '900101015555', telefon: '0123456789', jabatan: 'ABC' });
  const medan = (t, o) => { const r = call(env, 'mk.hantar', t, RUANG(Object.assign({ tarikh: '2026-10-27', emelPenyelia: '' }, o))); assert.equal(r.error.code, 'MK_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  assert.ok(medan(ts, {}).failSurat, 'surat permohonan wajib bagi staf');
  assert.ok(medan(tl, { kaedahBayaran: 'Invois Dalaman', noVot: 'V1', namaStafKewangan: 'Aminah', telStafKewangan: '0123456789', failSurat: PDF() }).kaedahBayaran);
  const rs = call(env, 'mk.hantar', ts, RUANG({ tarikh: '2026-10-27', emelPenyelia: '', failSurat: PDF('s.pdf') }));
  assert.equal(rs.ok, true, JSON.stringify(rs));
  assert.equal(rs.data.anggaran, 200 + 150 + 2 * 10);
  const rl = call(env, 'mk.hantar', tl, RUANG({ tarikh: '2026-10-28', emelPenyelia: '', failSurat: PDF('s.pdf') }));
  assert.equal(rl.data.anggaran, 300 + 150 + 2 * 10);
  assert.equal(rl.data.status, 'Menunggu Kelulusan');
});

test('Perakuan penyelia: pautan tanpa log masuk, OTP, ringkasan sahaja, token sekali guna, direkod dalam Audit', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const r = call(env, 'mk.hantar', t, LASER());
  assert.equal(r.ok, true);
  const msg = env.sentTo(PENYELIA).filter((m) => /perakuan=/.test(m.htmlBody))[0];
  assert.match(msg.subject, /^\[UJI\] Permohonan perakuan/);
  assert.match(msg.htmlBody, /https:\/\/example\.test\/exec\?perakuan=[a-f0-9]{64}/);
  const tok = tokenPerakuan(env);
  const row = rows(env, 'Tempahan')[0];
  assert.notEqual(row.Token_Hash, tok, 'hanya hash disimpan');
  assert.ok(!JSON.stringify(rows(env, 'Tempahan')).includes(tok), 'token tidak ada dalam sheet');
  assert.ok(!JSON.stringify(env.state.cache).includes(tok), 'token tidak ada dalam cache');

  // ringkasan: tiada data peribadi lanjut
  const m = call(env, 'mk.perakuan.maklumat', null, { token: tok });
  assert.equal(m.ok, true, JSON.stringify(m));
  assert.equal(m.data.namaPemohon, 'NURUL AINA BINTI HASSAN');
  assert.equal(m.data.projek, 'Papan nama');
  assert.equal(m.data.emelPenyelia, 'p***@utm.my');
  const dump = JSON.stringify(m.data);
  [AINA, 'A23UJ0001', '0111111101', 'Token', 'drive.google.com', PENYELIA].forEach((x) => assert.ok(!dump.includes(x), 'tidak didedahkan: ' + x));

  // admin belum boleh meluluskan sebelum diperakui
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' }).error.code, 'MK_BELUM_DIPERAKUI');
  // OTP salah
  env.advance(61);
  assert.equal(call(env, 'mk.perakuan.otp', null, { token: tok }).ok, true);
  const kod = kodOtp(env);
  const salah = call(env, 'mk.perakuan.sahkan', null, { token: tok, kod: kod === '000000' ? '111111' : '000000', tindakan: 'perakui' });
  assert.equal(salah.error.code, 'OTP_SALAH');
  assert.equal(rows(env, 'Tempahan')[0].Status, 'Menunggu Perakuan');
  // tindakan tidak sah / tolak tanpa catatan
  assert.equal(call(env, 'mk.perakuan.sahkan', null, { token: tok, kod, tindakan: 'lain' }).error.code, 'MK_PERAKUAN_TIDAK_SAH');
  assert.equal(call(env, 'mk.perakuan.sahkan', null, { token: tok, kod, tindakan: 'tolak', catatan: '' }).error.code, 'MK_CATATAN_WAJIB');
  // OTP betul
  const ok = call(env, 'mk.perakuan.sahkan', null, { token: tok, kod, tindakan: 'perakui', catatan: 'Disokong' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const after = rows(env, 'Tempahan')[0];
  assert.equal(after.Status, 'Menunggu Kelulusan');
  assert.equal(after.Status_Perakuan, 'Diperakui');
  assert.equal(after.Token_Hash, '');
  assert.equal(after.Catatan_Penyelia, 'Disokong');
  const au = rows(env, 'Audit').filter((x) => x.Tindakan === 'MK_PERAKUAN')[0];
  assert.equal(au.Emel, PENYELIA);
  assert.equal(au.Peranan, 'Penyelia');
  assert.equal(au.Rujukan, r.data.id);
  // pemohon dimaklumkan
  assert.equal(env.sentTo(AINA).filter((x) => /diperakui/.test(x.subject)).length, 1);
  // guna semula token / OTP lama ditolak dengan mesej generik
  const guna = call(env, 'mk.perakuan.maklumat', null, { token: tok });
  assert.equal(guna.error.code, 'MK_PERAKUAN_TIDAK_SAH');
  assert.equal(call(env, 'mk.perakuan.sahkan', null, { token: tok, kod, tindakan: 'perakui' }).error.code, 'MK_PERAKUAN_TIDAK_SAH');
  assert.equal(call(env, 'mk.perakuan.otp', null, { token: tok }).error.code, 'MK_PERAKUAN_TIDAK_SAH');
  // admin kini boleh meluluskan
  const l = call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'lulus', catatan: 'OK' });
  assert.equal(l.data.status, 'Diluluskan');
  assert.equal(env.sentTo(AINA).filter((x) => /diluluskan/.test(x.subject)).length, 1);
});

test('Perakuan penyelia: token salah/tidak wujud/tamat mesej sama; tolak oleh penyelia; OTP tujuan berasingan setiap tempahan; had kadar', () => {
  const { env } = mkEnv();
  const t = student(env, AINA);
  const generik = call(env, 'mk.perakuan.maklumat', null, { token: 'abc' });
  assert.equal(generik.error.code, 'MK_PERAKUAN_TIDAK_SAH');
  const mesej = generik.error.bm;
  assert.equal(call(env, 'mk.perakuan.maklumat', null, { token: 'a'.repeat(64) }).error.bm, mesej, 'token berbentuk betul tetapi tiada: mesej sama');
  assert.equal(call(env, 'mk.perakuan.maklumat', null, {}).error.bm, mesej);
  assert.equal(call(env, 'mk.perakuan.otp', null, { token: 12345 }).error.bm, mesej);
  assert.equal(call(env, 'mk.perakuan.sahkan', null, { token: "' OR 1=1", kod: '123456', tindakan: 'perakui' }).error.bm, mesej);

  // dua tempahan, penyelia sama: OTP tempahan pertama tidak sah untuk kedua
  const r1 = call(env, 'mk.hantar', t, LASER({ masaMula: '09:00' }));
  const tok1 = tokenPerakuan(env);
  const r2 = call(env, 'mk.hantar', t, LASER({ masaMula: '11:00' }));
  const tok2 = tokenPerakuan(env);
  assert.notEqual(tok1, tok2);
  env.advance(61);
  call(env, 'mk.perakuan.otp', null, { token: tok1 });
  const kod1 = kodOtp(env);
  const silang = call(env, 'mk.perakuan.sahkan', null, { token: tok2, kod: kod1, tindakan: 'perakui' });
  assert.ok(['OTP_TAMAT', 'OTP_SALAH'].includes(silang.error.code), 'OTP tujuan lain ditolak: ' + silang.error.code);
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', r2.data.id)[0].Status, 'Menunggu Perakuan');
  // tolak oleh penyelia memerlukan catatan; menolak tempahan
  const tolak = call(env, 'mk.perakuan.sahkan', null, { token: tok1, kod: kod1, tindakan: 'tolak', catatan: 'Tidak berkaitan kursus' });
  assert.equal(tolak.ok, true, JSON.stringify(tolak));
  const row1 = rowsBy(env, 'Tempahan', 'ID_Tempahan', r1.data.id)[0];
  assert.equal(row1.Status, 'Ditolak');
  assert.equal(row1.Status_Perakuan, 'Ditolak');
  assert.match(row1.Catatan, /Tidak berkaitan kursus/);
  assert.equal(env.sentTo(AINA).filter((x) => /tidak diperakui/.test(x.subject)).length, 1);
  // slot dilepaskan selepas ditolak
  assert.equal(call(env, 'mk.hantar', student(env, AMIRUL), LASER({ masaMula: '09:00' })).ok, true);

  // pautan tamat tempoh
  env.run(`(function(){ var r = Mk.tempahan(${JSON.stringify(r2.data.id)}); Db.update('Tempahan', r._row, { Token_Tamat: new Date(Date.now() - 1000) }); })()`);
  assert.equal(call(env, 'mk.perakuan.maklumat', null, { token: tok2 }).error.bm, mesej, 'tamat: mesej generik');
  assert.equal(call(env, 'mk.perakuan.otp', null, { token: tok2 }).error.code, 'MK_PERAKUAN_TIDAK_SAH');

  // had kadar: token tidak sah berulang
  let had = null;
  for (let i = 0; i < 70 && !had; i++) { const x = call(env, 'mk.perakuan.maklumat', null, { token: 'x' + i }); if (x.error.code === 'MK_PERAKUAN_HAD') had = x; }
  assert.ok(had, 'had kadar bagi token tidak sah');
  // had kadar bagi satu pautan sah
  const r3 = call(env, 'mk.hantar', t, LASER({ masaMula: '14:00' }));
  const tok3 = tokenPerakuan(env);
  let hadSah = null;
  for (let i = 0; i < 40 && !hadSah; i++) { const x = call(env, 'mk.perakuan.maklumat', null, { token: tok3 }); if (!x.ok) hadSah = x; }
  assert.equal(hadSah && hadSah.error.code, 'MK_PERAKUAN_HAD');
  assert.ok(r3.ok);
});

test('Perakuan penyelia: emel mesti staf @utm.my dan bukan emel pemohon; hantar semula menggantikan pautan lama', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const gagal = (emel) => call(env, 'mk.hantar', t, LASER({ emelPenyelia: emel })).error.extra.medan.emelPenyelia;
  assert.ok(gagal('rakan@graduate.utm.my'), 'emel pelajar ditolak');
  assert.ok(gagal('pensyarah@gmail.com'), 'emel bukan domain staf ditolak');
  assert.ok(gagal('bukan emel'));
  assert.ok(gagal(AINA), 'emel pemohon sendiri ditolak');
  assert.ok(gagal('x@utm.my.penipu.com'));
  // emel pemohon sama dengan penyelia (pelajar yang emelnya domain staf, melalui bagi pihak)
  env.run(`(function(){ var r = Db.find('PELAJAR', function(x){ return x.No_Matrik==='A22UJ0003'; })[0]; Db.update('PELAJAR', r._row, { Emel: 'pelajar.staf@utm.my' }); })()`);
  const sama = call(env, 'mk.admin.hantar', admin, Object.assign(LASER({ emelPenyelia: 'pelajar.staf@utm.my' }), { noMatrik: 'A22UJ0003' }));
  assert.ok(sama.error.extra.medan.emelPenyelia, 'penyelia sama dengan pemohon ditolak');
  assert.equal(rows(env, 'Tempahan').length, 0);

  const r = call(env, 'mk.hantar', t, LASER());
  const lama = tokenPerakuan(env);
  env.advance(1);
  // hantar semula kepada penyelia lain
  const re = call(env, 'mk.perakuan.hantarSemula', t, { id: r.data.id, emelPenyelia: 'staf1@utm.my' });
  assert.equal(re.ok, true, JSON.stringify(re));
  assert.equal(re.data.emelDihantar, true);
  const baru = tokenPerakuan(env, 'staf1@utm.my');
  assert.notEqual(baru, lama);
  assert.equal(call(env, 'mk.perakuan.maklumat', null, { token: lama }).error.code, 'MK_PERAKUAN_TIDAK_SAH', 'pautan lama tidak sah');
  assert.equal(call(env, 'mk.perakuan.maklumat', null, { token: baru }).ok, true);
  assert.equal(rows(env, 'Tempahan')[0].Emel_Penyelia, 'staf1@utm.my');
  // OTP dihantar kepada penyelia baharu sahaja
  env.advance(61);
  call(env, 'mk.perakuan.otp', null, { token: baru });
  assert.ok(env.sentTo('staf1@utm.my').some((m) => /ialah: \d{6}/.test(m.htmlBody)));
  assert.ok(!env.sentTo(PENYELIA).some((m) => /ialah: \d{6}/.test(m.htmlBody)));
  // hantar semula: emel tidak sah, orang lain, had kekerapan
  assert.ok(call(env, 'mk.perakuan.hantarSemula', t, { id: r.data.id, emelPenyelia: 'x@gmail.com' }).error.extra.medan.emelPenyelia);
  assert.equal(call(env, 'mk.perakuan.hantarSemula', student(env, AMIRUL), { id: r.data.id }).error.code, 'MK_TIDAK_DITEMUI');
});

test('Kelulusan: tolak/batal memerlukan catatan; konflik disemak semula; pemohon boleh membatalkan; kerja harian membatalkan perakuan tamat', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const r = call(env, 'mk.hantar', t, LASER());
  perakui(env, tokenPerakuan(env));
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'tolak', catatan: '' }).error.code, 'MK_CATATAN_WAJIB');
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'lain' }).error.code, 'MK_PERALIHAN_TIDAK_SAH');
  // sisipan tempahan Diluluskan yang bertindih (contoh: diluluskan melalui jalan lain) -> kelulusan gagal
  const tarikh = rows(env, 'Tempahan')[0].Tarikh_Mula;
  env.run(`Db.append('Tempahan', { ID_Tempahan: 'TMP-LUAR-1', Jenis: 'Laser Cut', Kod_Sumber: 'LASER1', Jenis_Pengguna: 'Staf', Emel_Pemohon: 'staf1@utm.my', Nama_Pemohon: 'S', Tarikh_Mula: ${JSON.stringify(tarikh)}, Masa_Mula: '09:00', Tarikh_Tamat: ${JSON.stringify(tarikh)}, Masa_Tamat: '10:00', Status: 'Diluluskan' })`);
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' }).error.code, 'MK_KONFLIK');
  const d = call(env, 'mk.admin.butiran', admin, { id: r.data.id }).data;
  assert.ok(d.amaran.some((a) => /Bertindih/.test(a)));
  env.run(`(function(){ var r = Mk.tempahan('TMP-LUAR-1'); Db.update('Tempahan', r._row, { Status: 'Dibatalkan' }); })()`);
  const tol = call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'tolak', catatan: 'Mesin rosak' });
  assert.equal(tol.data.status, 'Ditolak');
  assert.equal(tol.data.catatan, 'Mesin rosak');
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' }).error.code, 'MK_PERALIHAN_TIDAK_SAH');
  // pemohon membatalkan tempahan diluluskan sebelum hari tersebut
  const r2 = call(env, 'mk.hantar', t, LASER({ masaMula: '11:00' }));
  perakui(env, tokenPerakuan(env));
  call(env, 'mk.admin.putus', admin, { id: r2.data.id, tindakan: 'lulus' });
  const bt = call(env, 'mk.batal', t, { id: r2.data.id, catatan: 'Tidak jadi' });
  assert.equal(bt.data.status, 'Dibatalkan');
  assert.equal(call(env, 'mk.batal', t, { id: r2.data.id }).error.code, 'MK_BATAL_TIDAK_BOLEH', 'tidak boleh dibatalkan dua kali');
  // admin membatalkan
  const r3 = call(env, 'mk.hantar', t, LASER({ masaMula: '13:00' }));
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r3.data.id, tindakan: 'batal', catatan: '' }).error.code, 'MK_CATATAN_WAJIB');
  assert.equal(call(env, 'mk.admin.putus', admin, { id: r3.data.id, tindakan: 'batal', catatan: 'Penyelenggaraan' }).data.status, 'Dibatalkan');
  // kerja harian: perakuan tamat tempoh
  const r4 = call(env, 'mk.hantar', t, LASER({ masaMula: '15:00' }));
  env.run(`(function(){ var r = Mk.tempahan(${JSON.stringify(r4.data.id)}); Db.update('Tempahan', r._row, { Token_Tamat: new Date(Date.now() - 1000) }); })()`);
  const job = env.plain(env.run('Makerspace.jobHarian()'));
  assert.equal(job.tamatPerakuan, 1);
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', r4.data.id)[0].Status, 'Dibatalkan');
  assert.equal(env.plain(env.run('Makerspace.jobHarian()')).tamatPerakuan, 0, 'idempotent');
});
