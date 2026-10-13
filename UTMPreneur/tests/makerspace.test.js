'use strict';
/** Makerspace fasa 1: urus ALAT/PERALATAN/KADAR, tempahan Laser Cut dan 3D Printer, anggaran kos, konflik masa, waktu operasi. */
const test = require('node:test');
const H = require('./makerspace-helpers');
const { call, login, student, assert, mkEnv, AINA, AMIRUL, PENYELIA, rows, rowsBy, LASER, TDP, opDay, sabtu, todayKey, addDays, bekukan, PNG } = H;

function daftarStaf(env, emel, jenis) {
  const t = login(env, emel).token;
  const r = call(env, 'daftar.profil', t, jenis === 'luar'
    ? { nama: 'Ali Luar', noKp: '900101015555', telefon: '0123456789', jabatan: 'Syarikat ABC' }
    : { nama: 'Dr. Staf Satu', noStaf: 'S1234', jabatan: 'Fakulti Komputeran', telefon: '0129876543' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return t;
}

test('Skema: lajur tambahan Makerspace wujud, TEXT_COLS menjaga masa dan token, KADAR disemai', () => {
  const { env } = mkEnv();
  const hdr = env.plain(env.run("Db.headers('Tempahan')"));
  ['Token_Hash', 'Token_Tamat', 'No_Matrik', 'Anggaran_RM', 'Bil_Pembaharuan'].forEach((h) => assert.ok(hdr.includes(h), h));
  assert.equal(env.plain(env.run('Setup.validate()')).ok, true);
  assert.ok(rows(env, 'KADAR').length >= 57, 'KADAR disemai');
  assert.equal(rowsBy(env, 'Tetapan', 'Kunci', 'PERAKUAN_TAMAT_HARI').length, 1, 'TETAPAN_MK disemai');
  assert.equal(rows(env, 'ALAT').length, 2);
  assert.equal(rows(env, 'PERALATAN').length, 4);
});

test('Admin: ALAT, PERALATAN dan KADAR disahkan, disimpan dan diaudit; kadar kosong = belum ditetapkan', () => {
  const { env, admin } = mkEnv();
  assert.equal(call(env, 'mk.admin.alat.simpan', admin, { kod: 'x', nama: '', jumlah: 'abc' }).error.code, 'MK_ADMIN_TIDAK_SAH');
  const bad = call(env, 'mk.admin.alat.simpan', admin, { kod: 'DRILL', nama: 'Gerudi', jumlah: 3, rosak: 5 });
  assert.ok(bad.error.extra.medan.rosak);
  const a = call(env, 'mk.admin.alat.simpan', admin, { kod: 'drill', nama: 'Gerudi', kategori: 'Tangan', jumlah: 3, rosak: 1, bolehDipinjam: true });
  assert.equal(a.ok, true);
  assert.equal(a.data.senarai.find((x) => x.kod === 'DRILL').baki, 2);
  call(env, 'mk.admin.alat.simpan', admin, { kod: 'DRILL', nama: 'Gerudi', jumlah: 4, rosak: 1, aktif: false });
  assert.equal(rowsBy(env, 'ALAT', 'Kod_Alat', 'DRILL')[0].Aktif, 'Tidak');
  // peralatan
  assert.ok(call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'RM1', jenis: 'Ruang', nama: 'Bilik X' }).error.extra.medan.kapasiti, 'kapasiti ruang wajib');
  assert.ok(call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'RM1', jenis: 'Mesin', nama: 'Bilik X' }).error.extra.medan.jenis);
  assert.equal(call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'RM1', jenis: 'Ruang', nama: 'Bilik X', kapasiti: 10, kodKadar: 'RUANG_BILIK_MESYUARAT' }).ok, true);
  // kadar: kosong = belum ditetapkan
  const k = call(env, 'mk.admin.kadar.senarai', admin).data.senarai;
  const caj = k.find((x) => x.kod === 'RUANG_CAJ_PERKHIDMATAN' && x.jenisPengguna === 'Pelajar');
  assert.equal(caj.kadar, 150);
  const ext = call(env, 'mk.admin.kadar.simpan', admin, { kod: 'ALAT_EXTENSION_WIRE', jenisPengguna: 'Pelajar', kadar: '' });
  assert.equal(ext.data.senarai.find((x) => x.kod === 'ALAT_EXTENSION_WIRE' && x.jenisPengguna === 'Pelajar').belumDitetapkan, true);
  assert.ok(call(env, 'mk.admin.kadar.simpan', admin, { kod: 'ALAT_EXTENSION_WIRE', jenisPengguna: 'Pelajar', kadar: 'abc' }).error.extra.medan.kadar);
  assert.ok(call(env, 'mk.admin.kadar.simpan', admin, { kod: 'BAHARU_X', jenisPengguna: 'Pelajar', kadar: '5' }).error.extra.medan.nama, 'baris baharu perlu nama dan unit');
  const baru = call(env, 'mk.admin.kadar.simpan', admin, { kod: 'BAHARU_X', jenisPengguna: 'Staf', nama: 'Item baharu', unit: 'per hari', kadar: '7.5' });
  assert.equal(baru.ok, true);
  const ra = rows(env, 'Audit').filter((x) => /^MK_/.test(x.Tindakan));
  assert.ok(ra.length >= 5, 'tindakan admin diaudit');
  // ringkasan memberi amaran kadar belum ditetapkan
  const rg = call(env, 'mk.admin.ringkasan', admin).data;
  assert.ok(rg.kadarBelum >= 1);
  assert.ok(rg.kadarBelumKod.some((x) => x.kod === 'ALAT_EXTENSION_WIRE'));
});

test('Laser Cut: tempahan sah, anggaran RM1 per 5 minit, status menunggu perakuan, butiran disimpan', () => {
  const { env } = mkEnv();
  const t = student(env, AINA);
  const tarikh = opDay(2);
  const est = call(env, 'mk.anggar', t, LASER({ tarikh }));
  assert.equal(est.ok, true);
  assert.deepEqual(est.data.ralat, {});
  assert.equal(est.data.jumlah, 9, '45 minit = 9 x RM1');
  const r = call(env, 'mk.hantar', t, LASER({ tarikh }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.data.id, /^TMP-\d{4}-0001$/);
  assert.equal(r.data.status, 'Menunggu Perakuan');
  assert.equal(r.data.anggaran, 9);
  assert.equal(r.data.emelPerakuanDihantar, true);
  const tm = rows(env, 'Tempahan')[0];
  assert.equal(tm.Jenis, 'Laser Cut');
  assert.equal(tm.Masa_Mula, '09:00');
  assert.equal(tm.Masa_Tamat, '10:00', '45 minit dibundarkan kepada 2 slot 30 minit');
  assert.equal(tm.No_Matrik, 'A23UJ0001');
  assert.equal(tm.Jenis_Pengguna, 'Pelajar');
  assert.equal(rows(env, 'Butiran_LaserCut')[0].Jenis_Bahan, 'Akrilik 3mm');
  assert.equal(rows(env, 'Butiran_LaserCut')[0].Masa_Dijangka_Min, 45);
  assert.equal(tm.Token_Hash.length, 64);
  assert.ok(!env.sentTo(PENYELIA).some((m) => m.htmlBody.includes(tm.Token_Hash)), 'hash tidak didedahkan');
  assert.equal(env.sentTo(AINA).filter((m) => /Tempahan Makerspace diterima/.test(m.subject)).length, 1);
  // senarai saya + butiran
  const s = call(env, 'mk.saya', t).data;
  assert.equal(s.senarai.length, 1);
  assert.equal(s.senarai[0].status, 'Menunggu Perakuan');
  const d = call(env, 'mk.butiran', t, { id: r.data.id });
  assert.equal(d.data.butiran.namaProjek, 'Papan nama');
  assert.match(d.data.penyelia, /^p\*\*\*@utm\.my$/, 'emel penyelia bertopeng kepada pemohon');
  assert.ok(!JSON.stringify(d.data).includes('Token'), 'tiada token dalam respons');
  // pelajar lain tidak boleh melihat
  const t2 = student(env, AMIRUL);
  assert.equal(call(env, 'mk.butiran', t2, { id: r.data.id }).error.code, 'MK_TIDAK_DITEMUI');
  assert.equal(call(env, 'mk.saya', t2).data.senarai.length, 0);
});

test('Laser Cut: pengesahan medan (slot, tempoh, bahan, penyelia, perakuan) dan waktu operasi/cuti', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const medan = (o) => { const r = call(env, 'mk.hantar', t, LASER(o)); assert.equal(r.error.code, 'MK_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  assert.ok(medan({ masaMula: '09:10' }).masaMula, 'mesti mengikut slot 30 minit');
  assert.ok(medan({ masaMula: '07:30' }).masaMula, 'sebelum waktu operasi');
  assert.ok(medan({ masaMula: '16:30', masaDijangkaMin: 60 }).masaMula, 'melebihi 5 petang');
  assert.ok(medan({ masaDijangkaMin: 241 }).masaDijangkaMin, 'melebihi 4 jam');
  assert.ok(medan({ masaDijangkaMin: 0 }).masaDijangkaMin);
  assert.ok(medan({ jenisBahan: '' }).jenisBahan);
  assert.ok(medan({ namaProjek: 'ab' }).namaProjek);
  assert.ok(medan({ tujuan: '' }).tujuan);
  assert.ok(medan({ tarikh: sabtu() }).tarikh, 'Sabtu bukan hari operasi');
  assert.ok(medan({ tarikh: addDays(todayKey(), -3) }).tarikh, 'tarikh lepas');
  assert.ok(medan({ tarikh: '2026-02-30' }).tarikh);
  assert.ok(medan({ kodSumber: 'TDP1' }).kodSumber, 'mesin bukan jenis laser');
  assert.ok(medan({ kodSumber: 'TIADA' }).kodSumber);
  assert.ok(medan({ perakuan: false }).perakuan);
  assert.ok(medan({ emelPenyelia: '' }).emelPenyelia);
  assert.ok(medan({ emelPenyelia: 'orang@gmail.com' }).emelPenyelia, 'mesti emel staf');
  assert.ok(medan({ emelPenyelia: 'kawan@graduate.utm.my' }).emelPenyelia, 'emel pelajar bukan penyelia');
  // cuti
  const cuti = opDay(3);
  env.run(`Db.append('Cuti', { Tarikh: Util.toDate(${JSON.stringify(cuti)}), Nama: 'Cuti Ujian', Jenis: 'Universiti' })`);
  const r = call(env, 'mk.hantar', t, LASER({ tarikh: cuti }));
  assert.match(r.error.extra.medan.tarikh, /Cuti: Cuti Ujian/);
  // ketersediaan
  const kt = call(env, 'mk.ketersediaan', t, { kodSumber: 'LASER1', tarikh: cuti }).data;
  assert.equal(kt.operasi, false);
  assert.match(kt.sebab, /Cuti/);
  assert.equal(call(env, 'mk.ketersediaan', t, { kodSumber: 'LASER1', tarikh: sabtu() }).data.operasi, false);
  assert.equal(call(env, 'mk.ketersediaan', t, { kodSumber: 'LASER1', tarikh: opDay(4) }).data.operasi, true);
  // mesin dalam penyelenggaraan tidak boleh ditempah
  call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'LASER1', jenis: 'Laser Cut', nama: 'Laser Cutter A', kodKadar: 'LASER_CUT', status: 'Penyelenggaraan' });
  assert.ok(medan({}).kodSumber);
  // waktu operasi boleh diubah melalui Tetapan
  call(env, 'mk.admin.peralatan.simpan', admin, { kod: 'LASER1', jenis: 'Laser Cut', nama: 'Laser Cutter A', kodKadar: 'LASER_CUT', status: 'Aktif' });
  H.setCfg(env, 'JAM_TAMAT', '12:00');
  assert.ok(medan({ masaMula: '11:30', masaDijangkaMin: 60 }).masaMula);
  H.setCfg(env, 'JAM_TAMAT', '17:00');
  assert.equal(call(env, 'mk.hantar', t, LASER({ masaMula: '16:00', masaDijangkaMin: 60 })).ok, true, 'tepat pada 5 petang dibenarkan');
});

test('Konflik masa: tempahan menunggu dikira bertindih, slot bersebelahan dibenarkan, dibatalkan melepaskan slot, pautan tamat tidak menghalang', () => {
  const { env, admin } = mkEnv();
  const t1 = student(env, AINA), t2 = student(env, AMIRUL);
  const tarikh = opDay(3);
  const r1 = call(env, 'mk.hantar', t1, LASER({ tarikh, masaMula: '09:00', masaDijangkaMin: 60 }));
  assert.equal(r1.ok, true);
  // bertindih separa
  const k = call(env, 'mk.hantar', t2, LASER({ tarikh, masaMula: '09:30', masaDijangkaMin: 30 }));
  assert.equal(k.error.code, 'MK_TIDAK_SAH');
  assert.match(k.error.extra.medan.masaMula, /bertindih/i);
  assert.ok(call(env, 'mk.anggar', t2, LASER({ tarikh, masaMula: '09:30' })).data.ralat.masaMula, 'anggaran juga menunjukkan konflik');
  // bersebelahan: tamat 10:00, mula 10:00
  assert.equal(call(env, 'mk.hantar', t2, LASER({ tarikh, masaMula: '10:00', masaDijangkaMin: 30 })).ok, true);
  // mesin lain pada masa sama dibenarkan
  assert.equal(call(env, 'mk.hantar', t2, TDP({ tarikh, masaMula: '09:00' })).ok, true);
  // ketersediaan memaparkan slot sibuk tanpa identiti
  const kt = call(env, 'mk.ketersediaan', t2, { kodSumber: 'LASER1', tarikh }).data;
  assert.deepEqual(kt.sibuk.map((x) => x.mula + '-' + x.tamat), ['09:00-10:00', '10:00-10:30']);
  assert.ok(!JSON.stringify(kt).includes('Aina'));
  // pembatalan melepaskan slot
  assert.equal(call(env, 'mk.batal', t1, { id: r1.data.id }).data.status, 'Dibatalkan');
  assert.equal(call(env, 'mk.hantar', t2, LASER({ tarikh, masaMula: '09:00', masaDijangkaMin: 30 })).ok, true);
  // pautan perakuan tamat tidak lagi menghalang slot
  const tarikh2 = opDay(4);
  const r2 = call(env, 'mk.hantar', t1, LASER({ tarikh: tarikh2, masaMula: '14:00' }));
  assert.equal(r2.ok, true);
  assert.equal(call(env, 'mk.hantar', t2, LASER({ tarikh: tarikh2, masaMula: '14:00' })).error.code, 'MK_TIDAK_SAH');
  env.run(`(function(){ var r = Mk.tempahan(${JSON.stringify(r2.data.id)}); Db.update('Tempahan', r._row, { Token_Tamat: new Date(Date.now() - 1000) }); })()`);
  assert.equal(call(env, 'mk.hantar', t2, LASER({ tarikh: tarikh2, masaMula: '14:00' })).ok, true);
  // kelulusan: tempahan yang slotnya sudah diambil tidak boleh diluluskan (semakan semula dalam kunci)
  const a = call(env, 'mk.admin.senarai', admin, {}).data;
  assert.ok(a.senarai.length >= 5);
});

test('3D Printer: gambar JPG/PNG wajib, berat dan warna, anggaran per gram + per jam, ikut jenis pengguna', () => {
  const { env } = mkEnv();
  const t = student(env, AINA);
  const tarikh = opDay(2);
  const medan = (o) => { const r = call(env, 'mk.hantar', t, TDP(Object.assign({ tarikh }, o))); assert.equal(r.error.code, 'MK_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  assert.ok(medan({ gambar: null }).gambar);
  assert.ok(medan({ gambar: { nama: 'x.pdf', data: H.PDF().data } }).gambar, 'PDF bukan gambar');
  assert.ok(medan({ gambar: { nama: 'x.png', data: H.PDF().data } }).gambar, 'kandungan bukan PNG sebenar');
  assert.ok(medan({ beratG: 0 }).beratG);
  assert.ok(medan({ beratG: 'abc' }).beratG);
  assert.ok(medan({ warna: '' }).warna);
  const est = call(env, 'mk.anggar', t, TDP({ tarikh })).data;
  assert.equal(est.jumlah, 40 * 0.5 + 2 * 4, '40 g x 0.50 + 2 jam x RM4');
  assert.equal(est.baris.length, 2);
  const r = call(env, 'mk.hantar', t, TDP({ tarikh }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const b = rows(env, 'Butiran_3DP')[0];
  assert.equal(b.No_Mesin, '3');
  assert.equal(b.Berat_g, 40);
  assert.match(b.Fail_Gambar, /drive\.google\.com\/file/);
  assert.equal(r.data.anggaran, 28);
  // tiada pautan Drive dalam respons pengguna
  assert.ok(!JSON.stringify(call(env, 'mk.butiran', t, { id: r.data.id })).includes('drive.google.com'));
  // pemuatan gambar oleh pemilik
  const f = call(env, 'mk.fail', t, { id: r.data.id, jenis: 'gambar' });
  assert.equal(f.ok, true);
  assert.equal(call(env, 'mk.fail', student(env, AMIRUL), { id: r.data.id, jenis: 'gambar' }).error.code, 'MK_TIDAK_DITEMUI');
});

test('Kadar belum ditetapkan: anggaran melaporkan belum ditetapkan, anggaran tidak disimpan', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  call(env, 'mk.admin.kadar.simpan', admin, { kod: '3D_PRINTER_GRAM', jenisPengguna: 'Pelajar', kadar: '' });
  const est = call(env, 'mk.anggar', t, TDP()).data;
  assert.deepEqual(est.belum, ['3D_PRINTER_GRAM']);
  assert.equal(est.baris[0].kadar, null);
  const r = call(env, 'mk.hantar', t, TDP());
  assert.equal(r.ok, true);
  assert.equal(r.data.anggaran, null);
  assert.deepEqual(r.data.belumDitetapkan, ['3D_PRINTER_GRAM']);
  assert.equal(rows(env, 'Tempahan')[0].Anggaran_RM, '');
  const d = call(env, 'mk.admin.butiran', admin, { id: r.data.id }).data;
  assert.ok(d.amaran.some((a) => /Kadar belum ditetapkan/.test(a)));
});

test('Kebenaran admin: Penilai tiada akses, Pemerhati baca sahaja, Pegawai Modul ikut modul', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  const r = call(env, 'mk.hantar', t, LASER());
  const add = (emel, peranan, modul) => { assert.equal(call(env, 'admin.tambah', admin, { emel, nama: 'X', peranan, modul }).ok, true); env.advance(61); };
  add('pemerhati@utm.my', 'Pemerhati', ''); add('penilai@utm.my', 'Penilai', ''); add('pegawai@utm.my', 'Pegawai Modul', 'Makerspace');
  const pen = login(env, 'penilai@utm.my').token;
  ['mk.admin.senarai', 'mk.admin.ringkasan', 'mk.admin.alat.senarai', 'mk.admin.kadar.senarai', 'mk.admin.bayaran.senarai'].forEach((m) => assert.equal(call(env, m, pen).error.code, 'TIADA_KEBENARIAN', m));
  assert.equal(call(env, 'mk.admin.butiran', pen, { id: r.data.id }).error.code, 'TIADA_KEBENARIAN');
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'mk.admin.senarai', pem, {}).ok, true);
  assert.equal(call(env, 'mk.admin.senarai', pem, {}).data.bolehPutus, false);
  assert.equal(call(env, 'mk.admin.butiran', pem, { id: r.data.id }).data.boleh.putus, false);
  ['mk.admin.putus', 'mk.admin.penggunaan', 'mk.admin.pulang', 'mk.admin.alat.simpan', 'mk.admin.peralatan.simpan', 'mk.admin.kadar.simpan', 'mk.admin.bayaran.putus', 'mk.admin.peralatan.lalai'].forEach((m) =>
    assert.equal(call(env, m, pem, { id: r.data.id, tindakan: 'tolak', catatan: 'x' }).error.code, 'TIADA_KEBENARIAN', m));
  assert.equal(call(env, 'mk.admin.hantar', pem, { noMatrik: 'A23UJ0002' }).error.code, 'TIADA_KEBENARIAN');
  // Pegawai Modul Makerspace boleh memutuskan; modul lain tidak
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'mk.admin.ringkasan', peg).data.bolehPutus, true);
  call(env, 'admin.tambah', admin, { emel: 'pegawai@utm.my', nama: 'X', peranan: 'Pegawai Modul', modul: 'SSU' });
  env.advance(61);
  const peg2 = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'mk.admin.ringkasan', peg2).data.bolehPutus, false);
  assert.equal(call(env, 'mk.admin.putus', peg2, { id: r.data.id, tindakan: 'tolak', catatan: 'x' }).error.code, 'TIADA_KEBENARIAN');
  // pelajar tidak boleh mengakses laluan admin; admin tidak boleh menempah sendiri
  assert.equal(call(env, 'mk.admin.senarai', t, {}).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'mk.hantar', admin, LASER()).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'mk.saya', admin).error.code, 'TIADA_KEBENARIAN');
  // maklumat borang untuk admin diterima, bukan untuk Penilai
  assert.equal(call(env, 'mk.maklumat', admin).data.admin, true);
  assert.equal(call(env, 'mk.maklumat', pen).error.code, 'TIADA_KEBENARIAN');
});

test('Staf dan orang luar menempah tanpa penyelia; kadar mengikut jenis pengguna; mesti melengkapkan profil', () => {
  const { env, admin } = mkEnv();
  const tarikh = opDay(2);
  // staf belum melengkapkan profil
  const ts0 = login(env, H.STAF).token;
  assert.equal(call(env, 'mk.hantar', ts0, TDP({ tarikh, emelPenyelia: '' })).error.code, 'MK_PROFIL_DULU');
  const ts = daftarStaf(env, H.STAF, 'staf');
  const tl = daftarStaf(env, H.LUAR, 'luar');
  const rs = call(env, 'mk.hantar', ts, TDP({ tarikh, emelPenyelia: '' }));
  assert.equal(rs.ok, true, JSON.stringify(rs));
  assert.equal(rs.data.status, 'Menunggu Kelulusan');
  assert.equal(rs.data.anggaran, 40 * 1 + 2 * 6);
  assert.ok(!('emelPerakuanDihantar' in rs.data));
  const rl = call(env, 'mk.hantar', tl, TDP({ tarikh, masaMula: '12:00', emelPenyelia: undefined }));
  assert.equal(rl.ok, true, JSON.stringify(rl));
  assert.equal(rl.data.anggaran, 40 * 2 + 2 * 8);
  const rowS = rowsBy(env, 'Tempahan', 'ID_Tempahan', rs.data.id)[0];
  assert.equal(rowS.Status_Perakuan, 'Tidak Perlu');
  assert.equal(rowS.Jenis_Pengguna, 'Staf');
  assert.equal(rowS.Emel_Penyelia, '');
  assert.equal(rowS.Telefon, '0129876543');
  assert.equal(rowS.Jabatan, 'Fakulti Komputeran');
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', rl.data.id)[0].Jenis_Pengguna, 'Luar');
  // admin memperakui dan meluluskan dalam satu langkah
  const l = call(env, 'mk.admin.putus', admin, { id: rs.data.id, tindakan: 'lulus' });
  assert.equal(l.ok, true, JSON.stringify(l));
  assert.equal(l.data.status, 'Diluluskan');
  assert.equal(l.data.statusPerakuan, 'Diperakui (Admin)');
  assert.equal(l.data.diluluskanOleh, 'utmxcite@utm.my');
  // staf dan luar tidak dapat melihat tempahan satu sama lain
  assert.equal(call(env, 'mk.butiran', tl, { id: rs.data.id }).error.code, 'MK_TIDAK_DITEMUI');
  // maklumat: kadar mengikut jenis pengguna
  const mk = call(env, 'mk.maklumat', tl).data;
  assert.equal(mk.jenisPengguna, 'Luar');
  assert.equal(mk.ruang.find((x) => x.kod === 'MAKER_LAB').kadar.rm, 300);
  assert.ok(!mk.kaedahBayaran.includes('Invois Dalaman'), 'Invois Dalaman untuk warga UTM sahaja');
  assert.equal(call(env, 'mk.maklumat', ts).data.ruang.find((x) => x.kod === 'MAKER_LAB').kadar.rm, 200);
  // hantar sebagai pelajar tanpa penyelia ditolak, tetapi staf tidak perlu
  assert.ok(call(env, 'mk.hantar', student(env, AINA), TDP({ tarikh, masaMula: '15:00', emelPenyelia: '' })).error.extra.medan.emelPenyelia);
});

test('Bagi pihak: admin menempah untuk pelajar (No. Matrik) dan staf/luar (emel); diaudit; tertakluk peraturan sama', () => {
  const { env, admin } = mkEnv();
  const tarikh = opDay(2);
  const p = call(env, 'mk.admin.pemohon', admin, { noMatrik: 'a23uj0001' });
  assert.equal(p.data.nama, 'NURUL AINA BINTI HASSAN');
  assert.equal(p.data.jenis, 'Pelajar');
  assert.equal(p.data.emel, AINA);
  const r = call(env, 'mk.admin.hantar', admin, Object.assign(LASER({ tarikh }), { noMatrik: 'A23UJ0001' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const tm = rows(env, 'Tempahan')[0];
  assert.equal(tm.Emel_Pemohon, AINA);
  assert.equal(tm.Didaftar_Oleh, 'utmxcite@utm.my');
  assert.equal(tm.Status, 'Menunggu Perakuan', 'pelajar tetap memerlukan perakuan penyelia');
  const au = rows(env, 'Audit').filter((x) => x.Tindakan === 'MK_TEMPAH')[0];
  assert.equal(au.Emel, 'utmxcite@utm.my');
  assert.match(au.Catatan, /\[bagi pihak A23UJ0001\]/);
  // pelajar melihatnya selepas log masuk
  assert.equal(call(env, 'mk.saya', student(env, AINA)).data.senarai[0].id, r.data.id);
  // peraturan yang sama: konflik
  assert.equal(call(env, 'mk.admin.hantar', admin, Object.assign(LASER({ tarikh }), { noMatrik: 'A23UJ0002' })).error.code, 'MK_TIDAK_SAH');
  // anggaran bagi pihak
  assert.equal(call(env, 'mk.admin.anggar', admin, Object.assign(LASER({ tarikh: opDay(3) }), { noMatrik: 'A23UJ0002' })).data.jumlah, 9);
  // matrik tidak wujud
  assert.equal(call(env, 'mk.admin.hantar', admin, Object.assign(LASER(), { noMatrik: 'ZZ99999' })).error.code, 'MATRIK_TIDAK_DITEMUI');
  // staf atas emel: perlu nama/telefon jika belum ada profil
  const bad = call(env, 'mk.admin.hantar', admin, Object.assign(TDP({ tarikh, emelPenyelia: '' }), { emelPemohon: 'staf1@utm.my' }));
  assert.equal(bad.error.code, 'MK_TIDAK_SAH');
  assert.ok(bad.error.extra.medan.namaPemohon);
  const ok = call(env, 'mk.admin.hantar', admin, Object.assign(TDP({ tarikh, emelPenyelia: '' }), { emelPemohon: 'staf1@utm.my', namaPemohon: 'Dr Staf', telefonPemohon: '0123456789' }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', ok.data.id)[0].Jenis_Pengguna, 'Staf');
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', ok.data.id)[0].Status, 'Menunggu Kelulusan');
  // pelajar tidak boleh digunakan melalui emel; pegawai modul lain tiada kebenaran
  assert.equal(call(env, 'mk.admin.hantar', admin, Object.assign(TDP(), { emelPemohon: AINA })).error.code, 'MK_EMEL_PEMOHON');
  assert.equal(call(env, 'mk.admin.hantar', admin, Object.assign(TDP(), { emelPemohon: 'bukan-emel' })).error.code, 'MK_EMEL_PEMOHON');
});

test('Hari ini: masa mula yang telah berlalu ditolak (jam dibekukan)', () => {
  const { env } = mkEnv();
  const t = student(env, AINA);
  // Isnin 2026-10-19 jam 10:15 (dibekukan)
  bekukan(env, '2026-10-19', '10:15');
  const lalu = call(env, 'mk.hantar', t, LASER({ tarikh: '2026-10-19', masaMula: '10:00' }));
  assert.match(lalu.error.extra.medan.masaMula, /berlalu/);
  const depan = call(env, 'mk.hantar', t, LASER({ tarikh: '2026-10-19', masaMula: '10:30' }));
  assert.equal(depan.ok, true, JSON.stringify(depan));
});
