'use strict';
/** Makerspace fasa 4: bil dan bayaran, penggunaan sebenar, laporan aktiviti, sekatan lewat dan kerja harian (idempotent). */
const test = require('node:test');
const H = require('./makerspace-helpers');
const { call, login, student, assert, mkEnv, AINA, AMIRUL, rows, rowsBy, LASER, TDP, RUANG, PDF, JPG, PNG, bekukan, tokenPerakuan, perakui, lulusPenuh } = H;

const HARI0 = '2026-10-19'; // Isnin: tarikh "hari ini" ketika menempah (jam dibekukan)
const jobBil = (env) => env.plain(env.run('Makerspace.jobHarian()'));
const bilAda = (env) => rows(env, 'Bayaran_Makerspace');

/** Laser Cut diluluskan pada 2026-10-21 jam 09:00 (45 minit, RM9 anggaran). Pulang id. */
function laserLulus(env, admin, t, o) {
  bekukan(env, HARI0, '09:00');
  return lulusPenuh(env, admin, t, LASER(Object.assign({ tarikh: '2026-10-21' }, o)));
}

test('Bil dijana selepas sesi oleh kerja harian: anggaran, tarikh akhir 7 hari, status Belum Bayar; idempotent; sesi ditanda Selesai', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const id = laserLulus(env, admin, t);
  bekukan(env, '2026-10-21', '07:00'); // hari sesi: belum tamat
  assert.equal(jobBil(env).bilDijana, 0);
  bekukan(env, '2026-10-22', '07:00');
  const j = jobBil(env);
  assert.equal(j.selesai, 1);
  assert.equal(j.bilDijana, 1);
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', id)[0].Status, 'Selesai');
  const b = bilAda(env)[0];
  assert.match(b.ID_Bayaran, /^BMK-2026-0001$/);
  assert.equal(b.ID_Tempahan, id);
  assert.equal(b.Emel_Pemohon, AINA);
  assert.equal(b.Anggaran_RM, 9);
  assert.equal(b.Kos_Sebenar_RM, '');
  assert.equal(b.Status, 'Belum Bayar');
  assert.equal(env.plain(env.run(`Util.dateKey(Db.rows('Bayaran_Makerspace')[0].Tarikh_Akhir)`)), '2026-10-29', 'jana 22 Okt + 7 hari');
  assert.equal(env.sentTo(AINA).filter((m) => /Bil Makerspace dijana/.test(m.subject)).length, 1);
  // idempotent
  const j2 = jobBil(env);
  assert.equal(j2.bilDijana, 0);
  assert.equal(j2.selesai, 0);
  assert.equal(bilAda(env).length, 1);
  assert.equal(env.sentTo(AINA).filter((m) => /Bil Makerspace dijana/.test(m.subject)).length, 1);
  // pemohon melihat bil
  const s = call(env, 'mk.saya', t).data.senarai[0];
  assert.equal(s.bayaran.status, 'Belum Bayar');
  assert.equal(s.bayaran.jumlah, 9);
});

test('Peringatan hari ke-4, Lewat selepas hari ke-7, susulan setiap 3 hari; bil Lewat menyekat tempahan baharu sehingga dibayar', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  laserLulus(env, admin, t);
  bekukan(env, '2026-10-22', '07:00'); jobBil(env); // jana; akhir 29 Okt
  const mel = (re) => env.sentTo(AINA).filter((m) => re.test(m.subject)).length;
  bekukan(env, '2026-10-25', '07:00'); jobBil(env);
  assert.equal(mel(/Peringatan bayaran/), 0, 'hari ke-3: belum');
  bekukan(env, '2026-10-26', '07:00'); jobBil(env);
  assert.equal(mel(/Peringatan bayaran/), 1, 'hari ke-4');
  jobBil(env);
  assert.equal(mel(/Peringatan bayaran/), 1);
  bekukan(env, '2026-10-29', '07:00'); jobBil(env);
  assert.equal(bilAda(env)[0].Status, 'Belum Bayar', 'tarikh akhir: masih belum Lewat');
  bekukan(env, '2026-10-30', '07:00');
  const j = jobBil(env);
  assert.equal(j.bilLewat, 1);
  assert.equal(bilAda(env)[0].Status, 'Lewat');
  assert.equal(mel(/lewat dibayar/), 1);
  // sekatan: tempahan Makerspace baharu (semua jenis) disekat
  const t2 = '2026-11-03';
  [LASER({ tarikh: t2 }), TDP({ tarikh: t2 }), RUANG({ tarikh: '2026-11-05' }), H.PINJAM({ tarikh: t2, tarikhPulang: '2026-11-06' })].forEach((p) =>
    assert.equal(call(env, 'mk.hantar', t, p).error.code, 'MK_BIL_LEWAT', p.jenis));
  assert.equal(call(env, 'mk.maklumat', t).data.sekatan.bil, true);
  // pelajar lain tidak terjejas
  assert.equal(call(env, 'mk.hantar', student(env, AMIRUL), LASER({ tarikh: t2 })).ok, true);
  // susulan: setiap 3 hari selepas 29 Okt (1 Nov = 3 hari)
  bekukan(env, '2026-10-31', '07:00'); jobBil(env);
  assert.equal(mel(/Susulan/), 0);
  bekukan(env, '2026-11-01', '07:00'); jobBil(env);
  assert.equal(mel(/Susulan/), 1);
  jobBil(env);
  assert.equal(mel(/Susulan/), 1, 'idempotent');
  bekukan(env, '2026-11-04', '07:00'); jobBil(env);
  assert.equal(mel(/Susulan/), 2);
  // bayaran + pengesahan membuka sekatan
  const idb = bilAda(env)[0].ID_Bayaran;
  assert.equal(call(env, 'mk.bayaran.rekod', t, { idBayaran: idb, kaedah: 'Pindahan Bank', noRujukan: 'TRX123', resit: JPG() }).ok, true);
  assert.equal(bilAda(env)[0].Status, 'Menunggu Pengesahan');
  assert.equal(call(env, 'mk.hantar', t, LASER({ tarikh: '2026-11-06' })).ok, true, 'selepas bayaran direkod (menunggu pengesahan) sekatan dibuka');
  // admin menolak bayaran: bil kembali Lewat dan sekatan berkuat semula
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: idb, tindakan: 'tolak', catatan: 'Rujukan tidak sah' }).ok, true);
  assert.equal(bilAda(env)[0].Status, 'Lewat');
  assert.equal(call(env, 'mk.hantar', t, LASER({ tarikh: '2026-11-06', masaMula: '14:00' })).error.code, 'MK_BIL_LEWAT');
  // dibayar dan disahkan: sekatan dibuka
  call(env, 'mk.bayaran.rekod', t, { idBayaran: idb, kaedah: 'Tunai', noRujukan: 'OR-9', resit: PDF() });
  call(env, 'mk.admin.bayaran.putus', admin, { id: idb, tindakan: 'sahkan' });
  assert.equal(call(env, 'mk.hantar', t, LASER({ tarikh: '2026-11-06', masaMula: '14:00' })).ok, true);
});

test('Bayaran oleh pemohon: kaedah, no. rujukan, resit PDF/JPG/PNG; Invois Dalaman tanpa resit; pengesahan/penolakan/pengecualian oleh admin', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  laserLulus(env, admin, t);
  bekukan(env, '2026-10-22', '07:00'); jobBil(env);
  const idb = bilAda(env)[0].ID_Bayaran;
  const medan = (o) => { const r = call(env, 'mk.bayaran.rekod', t, Object.assign({ idBayaran: idb, kaedah: 'Tunai', noRujukan: 'R-1', resit: PDF('resit.pdf') }, o)); assert.equal(r.error.code, 'MK_BAYARAN_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  assert.ok(medan({ kaedah: 'Cek' }).kaedah);
  assert.ok(medan({ noRujukan: '' }).noRujukan);
  assert.ok(medan({ resit: null }).resit);
  assert.ok(medan({ resit: { nama: 'r.exe', data: PDF().data } }).resit);
  assert.ok(medan({ resit: { nama: 'r.png', data: PDF().data } }).resit, 'kandungan bukan PNG');
  assert.equal(call(env, 'mk.bayaran.rekod', student(env, AMIRUL), { idBayaran: idb, kaedah: 'Tunai', noRujukan: 'x', resit: PDF() }).error.code, 'MK_BAYARAN_TIDAK_DITEMUI');
  const ok = call(env, 'mk.bayaran.rekod', t, { idBayaran: idb, kaedah: 'Pindahan Bank', noRujukan: 'TRX999', resit: PNG('resit.png') });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.data.bayaran.status, 'Menunggu Pengesahan');
  assert.equal(ok.data.bayaran.adaResit, true);
  assert.match(bilAda(env)[0].Fail_Resit, /drive\.google\.com/);
  assert.ok(!JSON.stringify(ok.data).includes('drive.google.com'));
  assert.equal(call(env, 'mk.bayaran.rekod', t, { idBayaran: idb, kaedah: 'Tunai', noRujukan: 'x', resit: PDF() }).error.code, 'MK_PERALIHAN_TIDAK_SAH', 'sudah menunggu pengesahan');
  assert.equal(call(env, 'mk.fail', t, { id: bilAda(env)[0].ID_Tempahan, jenis: 'resit' }).ok, true);
  assert.equal(call(env, 'mk.admin.ringkasan', admin).data.bayaranMenunggu, 1);
  // admin: tolak memerlukan catatan, kembali Belum Bayar
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: idb, tindakan: 'tolak', catatan: '' }).error.code, 'MK_CATATAN_WAJIB');
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: idb, tindakan: 'tolak', catatan: 'Resit kabur' }).ok, true);
  assert.equal(bilAda(env)[0].Status, 'Belum Bayar');
  assert.equal(bilAda(env)[0].Fail_Resit, '');
  assert.equal(env.sentTo(AINA).filter((m) => /Bayaran Makerspace ditolak/.test(m.subject)).length, 1);
  // Invois Dalaman: tiada resit; disahkan admin
  const inv = call(env, 'mk.bayaran.rekod', t, { idBayaran: idb, kaedah: 'Invois Dalaman', noRujukan: 'INV-2026-77' });
  assert.equal(inv.ok, true, JSON.stringify(inv));
  assert.equal(bilAda(env)[0].Fail_Resit, '');
  const sah = call(env, 'mk.admin.bayaran.putus', admin, { id: idb, tindakan: 'sahkan' });
  assert.equal(sah.ok, true);
  const b = bilAda(env)[0];
  assert.equal(b.Status, 'Dibayar');
  assert.equal(b.Disahkan_Oleh, 'utmxcite@utm.my');
  assert.equal(b.Kaedah, 'Invois Dalaman');
  assert.equal(rows(env, 'Audit').filter((x) => x.Tindakan === 'MK_SAHKAN_BAYARAN').length, 1);
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: idb, tindakan: 'sahkan' }).error.code, 'MK_PERALIHAN_TIDAK_SAH');
  assert.equal(call(env, 'mk.bayaran.rekod', t, { idBayaran: idb, kaedah: 'Tunai', noRujukan: 'x', resit: PDF() }).error.code, 'MK_PERALIHAN_TIDAK_SAH');
  // senarai bayaran admin
  const sl = call(env, 'mk.admin.bayaran.senarai', admin, { status: 'Dibayar' }).data;
  assert.equal(sl.senarai.length, 1);
  assert.equal(sl.senarai[0].namaPemohon, 'NURUL AINA BINTI HASSAN');
  assert.equal(sl.kiraan.Dibayar, 1);
});

test('Admin mengesahkan bayaran tunai di kaunter (Belum Bayar), mengecualikan bil dengan catatan; Invois Dalaman bukan untuk orang luar', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  laserLulus(env, admin, t);
  laserLulus(env, admin, t, { tarikh: '2026-10-21', masaMula: '11:00' });
  bekukan(env, '2026-10-22', '07:00'); jobBil(env);
  const [b1, b2] = bilAda(env).map((x) => x.ID_Bayaran);
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: b1, tindakan: 'sahkan' }).error.code, 'MK_BAYARAN_TIDAK_SAH', 'kaedah wajib bagi pengesahan kaunter');
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: b1, tindakan: 'sahkan', kaedah: 'Tunai', noRujukan: 'OR-77' }).ok, true);
  assert.equal(bilAda(env)[0].Status, 'Dibayar');
  assert.equal(bilAda(env)[0].No_Rujukan, 'OR-77');
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: b2, tindakan: 'kecuali', catatan: '' }).error.code, 'MK_CATATAN_WAJIB');
  assert.equal(call(env, 'mk.admin.bayaran.putus', admin, { id: b2, tindakan: 'kecuali', catatan: 'Kolaborasi UTMXCITE' }).ok, true);
  assert.equal(bilAda(env)[1].Status, 'Dikecualikan');
  // orang luar
  const tl = login(env, H.LUAR).token;
  call(env, 'daftar.profil', tl, { nama: 'Ali Luar', noKp: '900101015555', telefon: '0123456789', jabatan: 'ABC' });
  const id = call(env, 'mk.hantar', tl, LASER({ tarikh: '2026-10-23', emelPenyelia: '' })).data.id;
  call(env, 'mk.admin.putus', admin, { id, tindakan: 'lulus' });
  bekukan(env, '2026-10-24', '07:00'); jobBil(env);
  const bl = bilAda(env).find((x) => x.ID_Tempahan === id);
  assert.equal(call(env, 'mk.bayaran.rekod', tl, { idBayaran: bl.ID_Bayaran, kaedah: 'Invois Dalaman', noRujukan: 'X1' }).error.extra.medan.kaedah.length > 0, true);
});

test('Penggunaan sebenar: Laser Cut (minit), 3D Printer (gram dan minit), Ruang (hari); mencipta atau mengemas kini bil', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, HARI0, '09:00');
  const idL = lulusPenuh(env, admin, t, LASER({ tarikh: '2026-10-21' }));
  const idT = lulusPenuh(env, admin, t, TDP({ tarikh: '2026-10-21', masaMula: '10:00' }));
  const idR = lulusPenuh(env, admin, t, RUANG({ tarikh: '2026-10-22', bilHari: 2, peralatan: [{ kod: 'ALAT_FLIP_CHART', kuantiti: 2 }] }));
  // belum bermula: tidak boleh
  assert.equal(call(env, 'mk.admin.penggunaan', admin, { id: idL, minitSebenar: 60 }).error.code, 'MK_PENGGUNAAN_TIDAK_SAH');
  bekukan(env, '2026-10-21', '17:30');
  const bad = call(env, 'mk.admin.penggunaan', admin, { id: idL, minitSebenar: 0 });
  assert.ok(bad.error.extra.medan.minitSebenar);
  assert.ok(call(env, 'mk.admin.penggunaan', admin, { id: idT, minitSebenar: 100 }).error.extra.medan.beratSebenarG);
  // Laser: 62 minit sebenar = ceil(62/5)=13 x RM1; bil dicipta oleh admin (belum ada)
  const l = call(env, 'mk.admin.penggunaan', admin, { id: idL, minitSebenar: 62 });
  assert.equal(l.ok, true, JSON.stringify(l));
  assert.equal(l.data.status, 'Selesai');
  assert.equal(rowsBy(env, 'Butiran_LaserCut', 'ID_Tempahan', idL)[0].Masa_Sebenar_Min, 62);
  const bl = bilAda(env).find((x) => x.ID_Tempahan === idL);
  assert.equal(bl.Anggaran_RM, 9);
  assert.equal(bl.Kos_Sebenar_RM, 13);
  assert.equal(bl.Penggunaan_Sebenar, '62 minit');
  assert.equal(call(env, 'mk.saya', t).data.senarai.find((x) => x.id === idL).bayaran.jumlah, 13, 'jumlah dibayar = kos sebenar');
  // 3DP: 55 g x 0.5 + 3 jam x 4 = 27.5 + 12 = 39.5
  const p = call(env, 'mk.admin.penggunaan', admin, { id: idT, minitSebenar: 180, beratSebenarG: 55 });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(bilAda(env).find((x) => x.ID_Tempahan === idT).Kos_Sebenar_RM, 39.5);
  // kemas kini selepas bil wujud (job dahulu)
  bekukan(env, '2026-10-24', '07:00'); jobBil(env);
  assert.equal(bilAda(env).filter((x) => x.ID_Tempahan === idR).length, 1, 'bil ruang dijana kerja harian (anggaran)');
  const anggR = bilAda(env).find((x) => x.ID_Tempahan === idR);
  assert.equal(anggR.Anggaran_RM, 2 * 100 + 150 + 2 * 10 * 2);
  // ruang sebenar 1 hari sahaja
  assert.ok(call(env, 'mk.admin.penggunaan', admin, { id: idR, hariSebenar: 3 }).error.extra.medan.hariSebenar);
  const r = call(env, 'mk.admin.penggunaan', admin, { id: idR, hariSebenar: 1 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(bilAda(env).find((x) => x.ID_Tempahan === idR).Kos_Sebenar_RM, 100 + 150 + 20);
  // bil sudah dibayar: kos sebenar dikemas kini dengan amaran
  const idbR = anggR.ID_Bayaran;
  call(env, 'mk.admin.bayaran.putus', admin, { id: idbR, tindakan: 'sahkan', kaedah: 'Tunai' });
  const ulang = call(env, 'mk.admin.penggunaan', admin, { id: idR, hariSebenar: 2 });
  assert.equal(ulang.ok, true);
  assert.ok(ulang.data.amaranPenggunaan.some((a) => /sudah Dibayar/.test(a)));
  assert.match(bilAda(env).find((x) => x.ID_Tempahan === idR).Catatan, /Kos sebenar dikemas kini selepas bayaran/);
  // pinjaman tiada penggunaan sebenar
  const pj = call(env, 'mk.hantar', t, H.PINJAM({ tarikh: '2026-10-26', tarikhPulang: '2026-10-28' }));
  assert.equal(call(env, 'mk.admin.penggunaan', admin, { id: pj.data.id, minitSebenar: 5 }).error.code, 'MK_PENGGUNAAN_TIDAK_SAH');
});

test('Kadar belum ditetapkan: bil tidak dijana, admin diberi amaran sekali sahaja; bil dijana selepas kadar ditetapkan', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  call(env, 'mk.admin.kadar.simpan', admin, { kod: '3D_PRINTER_JAM', jenisPengguna: 'Pelajar', kadar: '' });
  bekukan(env, HARI0, '09:00');
  const id = lulusPenuh(env, admin, t, TDP({ tarikh: '2026-10-21' }));
  bekukan(env, '2026-10-22', '07:00');
  const j = jobBil(env);
  assert.equal(j.bilDijana, 0);
  assert.equal(j.amaranKadar, 1);
  assert.equal(bilAda(env).length, 0);
  const w = env.sentTo('utmxcite@utm.my').filter((m) => /Amaran: kadar Makerspace belum ditetapkan/.test(m.subject));
  assert.equal(w.length, 1);
  assert.match(w[0].htmlBody, /3D_PRINTER_JAM/);
  jobBil(env);
  assert.equal(env.sentTo('utmxcite@utm.my').filter((m) => /Amaran: kadar/.test(m.subject)).length, 1, 'amaran sekali');
  // penggunaan sebenar tanpa kadar: usaha direkod, bil tidak dijana
  const pg = call(env, 'mk.admin.penggunaan', admin, { id, minitSebenar: 150, beratSebenarG: 45 });
  assert.equal(pg.ok, true);
  assert.ok(pg.data.amaranPenggunaan.some((a) => /Kadar belum ditetapkan/.test(a)));
  assert.equal(bilAda(env).length, 0);
  // tetapkan kadar -> bil dijana pada kerja harian seterusnya
  call(env, 'mk.admin.kadar.simpan', admin, { kod: '3D_PRINTER_JAM', jenisPengguna: 'Pelajar', kadar: '4' });
  bekukan(env, '2026-10-23', '07:00');
  assert.equal(jobBil(env).bilDijana, 1);
  assert.equal(bilAda(env)[0].Anggaran_RM, 28);
});

test('Tempahan percuma (kos RM0) tidak menjana bil; kadar berkuat kuasa mengikut tarikh sesi', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  call(env, 'mk.admin.kadar.simpan', admin, { kod: 'LASER_CUT', jenisPengguna: 'Pelajar', kadar: '0' });
  bekukan(env, HARI0, '09:00');
  lulusPenuh(env, admin, t, LASER({ tarikh: '2026-10-21' }));
  bekukan(env, '2026-10-22', '07:00');
  assert.equal(jobBil(env).bilDijana, 0);
  assert.equal(bilAda(env).length, 0);
  // kadar baharu berkuat kuasa kemudian tidak menjejaskan sesi sebelum tarikh itu
  call(env, 'mk.admin.kadar.simpan', admin, { kod: 'LASER_CUT', jenisPengguna: 'Pelajar', kadar: '2', berkuatKuasa: '2026-12-01' });
  const est = (tarikh) => call(env, 'mk.anggar', t, LASER({ tarikh, masaMula: '14:00' })).data.jumlah;
  assert.equal(est('2026-11-25'), 0, 'sebelum 1 Dis: kadar lama');
  assert.equal(est('2026-12-02'), 18, 'selepas 1 Dis: 9 blok x RM2');
});

test('Laporan aktiviti: dijana selepas sesi ruang, Lewat selepas 3 hari, menyekat tempahan ruang baharu sahaja; hantar PDF membuka sekatan', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, HARI0, '09:00');
  const id = lulusPenuh(env, admin, t, RUANG({ tarikh: '2026-10-22' }));
  // sebelum tamat: tidak boleh hantar
  bekukan(env, '2026-10-21', '12:00');
  assert.equal(call(env, 'mk.laporan.hantar', t, { id, fail: PDF('laporan.pdf') }).error.code, 'MK_LAPORAN_TIDAK_SAH');
  bekukan(env, '2026-10-23', '07:00');
  jobBil(env);
  const lap = () => rows(env, 'Laporan_Aktiviti');
  assert.equal(lap().length, 1);
  assert.equal(lap()[0].Status, 'Belum Dihantar');
  assert.equal(env.sentTo(AINA).filter((m) => /hantar laporan aktiviti/.test(m.subject)).length, 1);
  const d = call(env, 'mk.butiran', t, { id }).data;
  assert.equal(d.laporan.tarikhHad, '2026-10-25');
  assert.equal(d.boleh.laporan, true);
  // masih dalam tempoh 3 hari: tempahan ruang baharu dibenarkan
  bekukan(env, '2026-10-25', '07:00'); jobBil(env);
  assert.equal(lap()[0].Status, 'Belum Dihantar');
  // 26 Okt: lewat
  bekukan(env, '2026-10-26', '07:00');
  jobBil(env);
  assert.equal(lap()[0].Status, 'Lewat');
  assert.equal(env.sentTo(AINA).filter((m) => /Laporan aktiviti Makerspace lewat/.test(m.subject)).length, 1);
  jobBil(env);
  assert.equal(env.sentTo(AINA).filter((m) => /Laporan aktiviti Makerspace lewat/.test(m.subject)).length, 1, 'idempotent');
  // sekatan: ruang disekat; mesin dan pinjaman tidak
  assert.equal(call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-11-10', kodSumber: 'BILIK_MESYUARAT', bilPeserta: 10 })).error.code, 'MK_LAPORAN_LEWAT');
  assert.equal(call(env, 'mk.hantar', t, LASER({ tarikh: '2026-10-28' })).ok, true);
  assert.equal(call(env, 'mk.maklumat', t).data.sekatan.laporan, true);
  // PDF sahaja
  assert.equal(call(env, 'mk.laporan.hantar', t, { id, fail: PNG('x.png') }).error.code, 'MK_TIDAK_SAH');
  assert.equal(call(env, 'mk.laporan.hantar', student(env, AMIRUL), { id, fail: PDF() }).error.code, 'MK_TIDAK_DITEMUI');
  const ok = call(env, 'mk.laporan.hantar', t, { id, fail: PDF('laporan.pdf') });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.data.laporan.status, 'Dihantar');
  assert.equal(lap()[0].Status, 'Dihantar');
  assert.match(lap()[0].Fail_Laporan, /drive\.google\.com/);
  assert.equal(call(env, 'mk.fail', t, { id, jenis: 'laporan' }).ok, true);
  assert.equal(call(env, 'mk.hantar', t, RUANG({ tarikh: '2026-11-10', kodSumber: 'BILIK_MESYUARAT', bilPeserta: 10, peralatan: [] })).ok, true, 'sekatan dibuka selepas laporan dihantar');
  jobBil(env);
  assert.equal(lap()[0].Status, 'Dihantar', 'kerja harian tidak menimpa status Dihantar');
});

test('Peringatan tempahan akan datang (sehari sebelum), idempotent; semua emel melalui Mail.send (MOD UJI hanya senarai penguji)', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const id = laserLulus(env, admin, t);
  bekukan(env, '2026-10-20', '07:00');
  jobBil(env); jobBil(env);
  const m = env.sentTo(AINA).filter((x) => /Peringatan tempahan Makerspace esok/.test(x.subject));
  assert.equal(m.length, 1);
  assert.match(m[0].subject, /^\[UJI\]/);
  assert.match(m[0].htmlBody, /pukul 09:00/);
  assert.ok(rows(env, 'Peringatan').some((x) => x.Jenis === 'MK_AKAN:' + id && x.Status === 'Dihantar'));
  // pemohon di luar senarai penguji: log 'Dilangkau', tiada emel
  env.run(`(function(){ var r = Mk.tempahan(${JSON.stringify(id)}); Db.update('Tempahan', r._row, { Emel_Pemohon: 'tidak.disenarai@gmail.com' }); })()`);
  env.run(`Db.append('Peringatan', { Masa: new Date(), Emel: 'x', Jenis: 'MK_AKAN:' + ${JSON.stringify(id)} + 'X', Rujukan: 'x', Status: 'Dihantar' })`);
  env.run(`(function(){ var l = Db.find('Peringatan', function(x){ return x.Jenis === 'MK_AKAN:' + ${JSON.stringify(id)}; })[0]; Db.update('Peringatan', l._row, { Jenis: 'LAIN' }); })()`);
  jobBil(env);
  assert.equal(env.sentTo('tidak.disenarai@gmail.com').length, 0);
  assert.equal(rows(env, 'Peringatan').filter((x) => x.Jenis === 'MK_AKAN:' + id)[0].Status, 'Dilangkau');
});

test('Jobs.harian memanggil Makerspace.jobHarian dan melaporkan hasil', () => {
  const { env } = mkEnv();
  const h = env.plain(env.run('Jobs.harian()'));
  assert.ok(h.mk && !h.mk.ralat, JSON.stringify(h.mk));
  assert.equal(h.mk.bilDijana, 0);
});
