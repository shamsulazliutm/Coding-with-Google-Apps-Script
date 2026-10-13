'use strict';
/** Ruang Niaga fasa 5: bil sewa berperingkat, kerja harian, bayaran, tunggakan dan notis, tamat/pembaharuan, daftar sedia ada, dashboard. */
const test = require('node:test');
const { call, login, student, profiled, setCfg, assert } = require('./helpers');
const { AINA, AMIRUL, WEIJIE, ADMIN, rows, setRow, hari, pdfFile, TPL_PERJANJIAN, sewaanAktif, rnReady, ssuLulus, bukaLot, cagaran } = require('./rn-helpers');

const bilAll = (env) => rows(env, 'Bayaran_Sewa');
const dateOf = (env, v) => env.run(`Util.dateKey(${JSON.stringify(v)})`);
const sewaan = (env) => rows(env, 'Sewaan')[0];
const D = (env, offset) => env.run(`Util.toDate(${JSON.stringify(hari(env, offset))})`);
const bayar = (c, id, patch) => call(c.env, 'rn.bil.bayar', c.aina, Object.assign({ id, kaedah: 'Interbank transfer', noRujukan: 'TRX-778899', tarikhBayar: hari(c.env, 0), fail: pdfFile('resit.pdf') }, patch || {}));
/** Mulakan kerja harian dengan JANA_BIL_SEWA_HARI = 1 supaya sentiasa menjana bil bulan semasa. */
const harian = (env) => { setCfg(env, 'JANA_BIL_SEWA_HARI', '1'); return env.plain(env.run('RuangNiaga.jobHarian()')); };

/** Sewaan aktif yang bermula tarikh lampau; bil bulan semasa ada. */
function sedia(mulaOffset, tamatOffset) {
  const c = sewaanAktif(hari(null, mulaOffset === undefined ? -20 : mulaOffset), hari(null, tamatOffset === undefined ? 340 : tamatOffset));
  setCfg(c.env, 'JANA_BIL_SEWA_HARI', '1');
  return c;
}

test('Jadual sewa berperingkat: kadar mengikut bulan sewa, tarikh akhir hari ke-7, tiada bil di luar tempoh atau berganda', () => {
  const c = sewaanAktif('2026-01-01', '2026-12-31');
  const { env } = c;
  const jana = (t, b) => env.plain(env.run(`RnSewa.janaBil(RnU.sewaanById('SWA-0001'), ${t}, ${b}, {})`));
  const sebelum = bilAll(env).length;
  const kadar = {};
  [[2026, 1], [2026, 6], [2026, 7], [2026, 12]].forEach(([t, b]) => {
    const r = jana(t, b);
    if (bilAll(env).length > sebelum || r) kadar[t + '-' + b] = r;
  });
  const by = (t, b) => bilAll(env).find((x) => x.Tahun === t && x.Bulan === b);
  // bil bulan semasa mungkin sudah dijana semasa pengaktifan; bandingkan hanya bulan yang dijana di atas
  assert.equal(by(2026, 1).Jumlah_RM, 150);
  assert.equal(by(2026, 1).Bulan_Sewa_Ke, 1);
  assert.equal(by(2026, 6).Jumlah_RM, 150);
  assert.equal(by(2026, 7).Jumlah_RM, 250);
  assert.equal(by(2026, 7).Bulan_Sewa_Ke, 7);
  assert.equal(by(2026, 12).Jumlah_RM, 250);
  assert.equal(dateOf(env, by(2026, 7).Tarikh_Akhir), '2026-07-07');
  assert.equal(dateOf(env, by(2026, 12).Tarikh_Akhir), '2026-12-07');
  // di luar tempoh dan pendua
  assert.equal(jana(2025, 12), null);
  assert.equal(jana(2027, 1), null);
  assert.equal(jana(2026, 7), null);
  // hari ke-31 dihadkan pada hari terakhir bulan
  setCfg(env, 'TARIKH_AKHIR_SEWA_HARI', '31');
  jana(2026, 2);
  assert.equal(dateOf(env, by(2026, 2).Tarikh_Akhir), '2026-02-28');
  assert.match(by(2026, 2).ID_Bil, /^BSW-2026-\d{4}$/);
});

test('Kerja harian: jana bil bulan semasa mengikut kadar, idempotent, tarikh akhir hari ke-7, kuasa hari jana', () => {
  const c = sedia(-200, 165); // bulan semasa ialah bulan sewa ke-7: kadar 250
  const { env } = c;
  const n = bilAll(env).length;
  const bulan = env.run("parseInt(Util.fmtDate(new Date(), 'MM'), 10)"), tahun = env.run("parseInt(Util.fmtDate(new Date(), 'yyyy'), 10)");
  const semasa = bilAll(env).find((b) => b.Tahun === tahun && b.Bulan === bulan);
  assert.ok(semasa, 'bil semasa dijana semasa pengaktifan');
  assert.ok([250, 150].includes(semasa.Jumlah_RM));
  const ke = semasa.Bulan_Sewa_Ke;
  assert.equal(semasa.Jumlah_RM, ke <= 6 ? 150 : 250);
  const j = harian(env);
  assert.equal(j.sewa.bilDijana, 0, 'sudah ada');
  assert.equal(bilAll(env).length, n);
  const j2 = harian(env);
  assert.equal(j2.sewa.bilDijana, 0);
  // padam bil dan jalankan: dijana semula; hari jana belum sampai: tiada
  env.run(`Db.replaceAll('Bayaran_Sewa', [])`);
  setCfg(env, 'JANA_BIL_SEWA_HARI', '31');
  const hariIni = env.run("parseInt(Util.fmtDate(new Date(), 'dd'), 10)");
  const tidak = env.plain(env.run('RuangNiaga.jobHarian()'));
  assert.equal(tidak.sewa.bilDijana, hariIni >= 31 ? 1 : 0);
  if (hariIni < 31) {
    harian(env);
  }
  const baru = bilAll(env).find((b) => b.Tahun === tahun && b.Bulan === bulan);
  assert.ok(baru);
  assert.equal(baru.Jumlah_RM, semasa.Jumlah_RM);
  if (hariIni <= 7) assert.equal(dateOf(env, baru.Tarikh_Akhir).slice(8), '07');
  else assert.ok(env.run(`Util.daysBetween(new Date(), ${JSON.stringify(baru.Tarikh_Akhir)})`) >= 7, 'bil lewat dijana: tempoh bayar dari hari dijana');
  assert.equal(baru.Status, 'Belum Bayar');
  assert.equal(env.sentTo(AINA).filter((m) => /Bil sewa bulan/.test(m.subject)).length >= 1, true);
  // sewaan yang telah ditamatkan tidak dijana bil
  env.run(`Db.replaceAll('Bayaran_Sewa', [])`);
  call(env, 'rn.admin.sewaan.tamat', c.admin, { id: 'SWA-0001', sebab: 'Uji' });
  assert.equal(harian(env).sewa.bilDijana, 0);
});

test('Status bil: Belum Bayar menjadi Lewat selepas tarikh akhir; peringatan jana, sebelum tarikh akhir dan susulan setiap 3 hari tanpa pendua', () => {
  const c = sedia();
  const { env } = c;
  const b = bilAll(env)[0];
  const id = b.ID_Bil;
  const akhir = (n) => setRow(env, 'Bayaran_Sewa', 'ID_Bil', id, { Tarikh_Akhir: D(env, n) });
  const emel = (re) => env.sentTo(AINA).filter((m) => re.test(m.subject)).length;
  // jana: satu emel (hari jana) walaupun hampir tarikh akhir
  akhir(2);
  env.run('Db.reset()');
  harian(env);
  assert.equal(emel(/Bil sewa bulan/), 1);
  harian(env);
  assert.equal(emel(/Bil sewa bulan/), 1);
  assert.equal(emel(/Peringatan: bil sewa hampir/), 0, 'digabung dengan emel jana');
  // hari berikutnya: sebelum tarikh akhir (1 hari)
  akhir(1); harian(env);
  assert.equal(emel(/hampir tarikh akhir/), 0, 'sudah digabung (kunci SEBELUM telah dicatat)');
  // bil baharu tanpa log: peringatan sebelum tarikh akhir dihantar sekali selepas emel jana
  env.run(`(function(){ var l = Db.rows('Peringatan').filter(function(x){ return x.Jenis === 'RN_BIL_SEBELUM_${id}'; })[0]; Db.update('Peringatan', l._row, { Jenis: 'dibuang' }); })()`);
  harian(env);
  assert.equal(emel(/hampir tarikh akhir/), 1);
  harian(env);
  assert.equal(emel(/hampir tarikh akhir/), 1);
  // lewat
  akhir(0); harian(env);
  assert.equal(bilAll(env)[0].Status, 'Belum Bayar', 'tarikh akhir hari ini belum lewat');
  akhir(-1);
  const j = harian(env);
  assert.equal(j.sewa.lewat, 1);
  assert.equal(bilAll(env)[0].Status, 'Lewat');
  assert.equal(emel(/Bil sewa lewat dibayar/), 1);
  harian(env);
  assert.equal(emel(/Bil sewa lewat dibayar/), 1, 'tiada pendua pada hari yang sama');
  akhir(-3); harian(env);
  assert.equal(emel(/Bil sewa lewat dibayar/), 1);
  akhir(-4); harian(env);
  assert.equal(emel(/Bil sewa lewat dibayar/), 2, 'susulan setiap 3 hari');
  akhir(-7); harian(env);
  assert.equal(emel(/Bil sewa lewat dibayar/), 3);
  // bil yang sudah dibayar tidak diingatkan
  const r = bayar(c, id);
  assert.equal(r.ok, true, JSON.stringify(r));
  akhir(-10); harian(env);
  assert.equal(emel(/Bil sewa lewat dibayar/), 3);
  assert.equal(bilAll(env)[0].Status, 'Menunggu Pengesahan');
});

test('Pemilik merekod bayaran, admin mengesahkan atau mengembalikan; ahli lihat sahaja; resit melalui pelayan', () => {
  const c = sedia();
  const { env, admin, aina, amirul } = c;
  const id = bilAll(env)[0].ID_Bil;
  const bad = call(env, 'rn.bil.bayar', aina, { id, kaedah: 'Tunai', noRujukan: '', tarikhBayar: hari(env, 5), fail: { nama: 'x.exe', data: 'AAAA' } });
  assert.equal(bad.error.code, 'RN_BORANG_TIDAK_SAH');
  ['kaedah', 'noRujukan', 'tarikhBayar', 'fail'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  assert.equal(bayar(c, id).ok, true);
  assert.equal(call(env, 'rn.bil.bayar', amirul, { id, kaedah: 'PayHub UTM', noRujukan: 'X-123', tarikhBayar: hari(env, 0), fail: pdfFile('r.pdf') }).error.code, 'RN_HANYA_PEMILIK');
  assert.equal(call(env, 'rn.bil.bayar', student(env, WEIJIE), { id, kaedah: 'PayHub UTM', noRujukan: 'X-123', tarikhBayar: hari(env, 0), fail: pdfFile('r.pdf') }).error.code, 'RN_TIDAK_DITEMUI');
  let b = bilAll(env)[0];
  assert.equal(b.Status, 'Menunggu Pengesahan');
  assert.equal(b.Kaedah, 'Interbank transfer');
  assert.equal(b.No_Rujukan, 'TRX-778899');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Bayaran sewa menunggu pengesahan/.test(m.subject)).length, 1);
  // ahli dan pemilik memuat turun resit; admin diaudit
  assert.equal(call(env, 'rn.bil.fail', amirul, { id }).ok, true);
  assert.equal(call(env, 'rn.bil.fail', student(env, WEIJIE), { id }).error.code, 'RN_BIL_TIDAK_DITEMUI');
  assert.equal(call(env, 'rn.admin.bil.fail', admin, { id }).ok, true);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'PAPAR_RESIT_SEWA'));
  // kembalikan dengan catatan
  assert.equal(call(env, 'rn.admin.bil.kembali', admin, { id, catatan: '' }).error.code, 'RN_CATATAN_WAJIB');
  assert.equal(call(env, 'rn.admin.bil.kembali', admin, { id, catatan: 'Jumlah tidak sepadan' }).ok, true);
  b = bilAll(env)[0];
  assert.equal(b.Status, 'Belum Bayar');
  assert.equal(b.Catatan, 'Jumlah tidak sepadan');
  assert.equal(b.Fail_Resit, '');
  assert.equal(call(env, 'rn.admin.bil.sahkan', admin, { id }).error.code, 'RN_BIL_STATUS');
  // rekod semula dan sahkan; bil lewat yang dikembalikan kembali Lewat
  bayar(c, id, { noRujukan: 'TRX-100200' });
  const sh = call(env, 'rn.admin.bil.sahkan', admin, { id });
  assert.equal(sh.ok, true, JSON.stringify(sh));
  assert.equal(bilAll(env)[0].Status, 'Dibayar');
  assert.equal(bilAll(env)[0].Disahkan_Oleh, ADMIN);
  assert.equal(bayar(c, id).error.code, 'RN_BIL_STATUS');
  assert.equal(env.sentTo(AINA).filter((m) => /Bayaran sewa disahkan/.test(m.subject)).length, 1);
  // pemerhati tidak boleh bertindak
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.bil.sahkan', pem, { id }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.bil.senarai', pem, {}).ok, true);
});

test('Bil Lewat dikembalikan kekal Lewat; dikecualikan perlu catatan', () => {
  const c = sedia();
  const { env, admin } = c;
  const id = bilAll(env)[0].ID_Bil;
  setRow(env, 'Bayaran_Sewa', 'ID_Bil', id, { Tarikh_Akhir: D(env, -5), Status: 'Lewat' });
  bayar(c, id);
  call(env, 'rn.admin.bil.kembali', admin, { id, catatan: 'Salah akaun' });
  assert.equal(bilAll(env)[0].Status, 'Lewat');
  assert.equal(call(env, 'rn.admin.bil.kecuali', admin, { id, catatan: '' }).error.code, 'RN_CATATAN_WAJIB');
  const k = call(env, 'rn.admin.bil.kecuali', admin, { id, catatan: 'Kelonggaran Covid' });
  assert.equal(k.ok, true);
  assert.equal(bilAll(env)[0].Status, 'Dikecualikan');
  assert.equal(call(env, 'rn.admin.bil.kecuali', admin, { id, catatan: 'lagi' }).error.code, 'RN_BIL_STATUS');
});

test('Caj utiliti pada bil: ditambah admin, jumlah dikira semula, tidak boleh selepas bayaran direkod', () => {
  const c = sedia();
  const { env, admin } = c;
  const b0 = bilAll(env)[0];
  const id = b0.ID_Bil;
  const sewa = b0.Sewa_RM;
  assert.ok(call(env, 'rn.admin.bil.utiliti', admin, { id, jumlah: 'abc' }).error.extra.medan.jumlah);
  const r = call(env, 'rn.admin.bil.utiliti', admin, { id, jumlah: '35.50', catatan: 'Elektrik September' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const b = bilAll(env)[0];
  assert.equal(b.Caj_Utiliti_RM, 35.5);
  assert.equal(b.Jumlah_RM, sewa + 35.5);
  assert.equal(b.Catatan_Utiliti, 'Elektrik September');
  assert.equal(env.sentTo(AINA).filter((m) => /Caj utiliti ditambah/.test(m.subject)).length, 1);
  // kerja harian tidak menimpa; jumlah kekal
  harian(env);
  assert.equal(bilAll(env)[0].Jumlah_RM, sewa + 35.5);
  bayar(c, id);
  assert.equal(call(env, 'rn.admin.bil.utiliti', admin, { id, jumlah: '10' }).error.code, 'RN_BIL_STATUS');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'CAJ_UTILITI_BIL'));
});

test('Tunggakan lebih satu bulan ditanda; admin dicadangkan Notis Peringatan 1, 2 dan Penamatan; tiada tindakan automatik', () => {
  const c = sedia();
  const { env, admin, aina, amirul } = c;
  const id = bilAll(env)[0].ID_Bil;
  // satu bil lewat belum sebulan: tidak ditanda
  setRow(env, 'Bayaran_Sewa', 'ID_Bil', id, { Tarikh_Akhir: D(env, -10), Status: 'Lewat' });
  assert.equal(call(env, 'rn.admin.sewaan.butiran', admin, { id: 'SWA-0001' }).data.tunggakan.ditanda, false);
  assert.equal(call(env, 'rn.admin.notis.jana', admin, { id: 'SWA-0001', jenis: 'Peringatan 1' }).ok, true, 'notis boleh dijana apabila ada bil lewat');
  env.run(`Db.replaceAll('Dokumen_Sewaan', Db.rows('Dokumen_Sewaan').filter(function (d) { return d.Jenis !== 'Notis'; }))`);
  // satu bil lewat > 30 hari: ditanda
  setRow(env, 'Bayaran_Sewa', 'ID_Bil', id, { Tarikh_Akhir: D(env, -35) });
  let s = call(env, 'rn.admin.sewaan.butiran', admin, { id: 'SWA-0001' }).data;
  assert.equal(s.tunggakan.ditanda, true);
  assert.equal(s.tunggakan.bilLewat, 1);
  assert.equal(s.cadanganNotis, 'Peringatan 1');
  // kerja harian memaklumkan admin sekali
  harian(env);
  assert.equal(env.sentTo(ADMIN).filter((m) => /Tunggakan sewa melebihi satu bulan/.test(m.subject)).length, 1);
  harian(env);
  assert.equal(env.sentTo(ADMIN).filter((m) => /Tunggakan sewa melebihi satu bulan/.test(m.subject)).length, 1);
  assert.equal(sewaan(env).Status, 'Aktif', 'tiada tindakan automatik');
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Sewaan Aktif');
  // jana notis berturutan
  const n1 = call(env, 'rn.admin.notis.jana', admin, { id: 'SWA-0001', jenis: 'Peringatan 1' });
  assert.equal(n1.ok, true, JSON.stringify(n1));
  assert.equal(n1.data.cadanganNotis, 'Peringatan 2');
  assert.deepEqual(n1.data.notis.map((n) => n.tajuk), ['Notis Peringatan 1']);
  const txt = Buffer.from(call(env, 'rn.admin.dok.fail', admin, { id: n1.data.notis[0].id }).data.data, 'base64').toString('utf8');
  assert.match(txt, /NOTIS PERINGATAN 1/);
  assert.match(txt, /SENI KEK AINA/);
  assert.match(txt, /Jumlah tertunggak/);
  // pemilik dan ahli melihat notis
  assert.equal(call(env, 'rn.butiran', aina, { id: c.id }).data.sewaan.notis.length, 1);
  assert.equal(call(env, 'rn.butiran', amirul, { id: c.id }).data.dokumen.some((d) => d.jenis === 'Notis'), true);
  assert.equal(env.sentTo(AINA).filter((m) => /Notis Peringatan 1/.test(m.subject)).length, 2, 'termasuk notis percubaan awal');
  harian(env);
  assert.equal(env.sentTo(ADMIN).filter((m) => /Tunggakan sewa melebihi satu bulan/.test(m.subject)).length, 2, 'cadangan baharu: Peringatan 2');
  const n2 = call(env, 'rn.admin.notis.jana', admin, { id: 'SWA-0001', jenis: 'Peringatan 2' });
  assert.equal(n2.data.cadanganNotis, 'Penamatan');
  const n3 = call(env, 'rn.admin.notis.jana', admin, { id: 'SWA-0001', jenis: 'Penamatan' });
  assert.equal(n3.data.cadanganNotis, '');
  const t3 = Buffer.from(call(env, 'rn.admin.dok.fail', admin, { id: n3.data.notis.find((n) => n.tajuk === 'Notis Penamatan').id }).data.data, 'base64').toString('utf8');
  assert.match(t3, /mengosongkan premis dalam tempoh 7 hari/);
  assert.equal(sewaan(env).Status, 'Aktif', 'admin yang memutuskan penamatan, bukan sistem');
  // dua bil lewat (kurang 30 hari) juga ditanda
  setRow(env, 'Bayaran_Sewa', 'ID_Bil', id, { Tarikh_Akhir: D(env, -5) });
  env.run(`Db.append('Bayaran_Sewa', { ID_Bil: 'BSW-X', ID_Sewaan: 'SWA-0001', Kod_Lot: 'SM-01', ID_Perniagaan: 'PRN-0001', Bulan: 1, Tahun: 2020, Jumlah_RM: 150, Tarikh_Akhir: Util.toDate(${JSON.stringify(hari(env, -3))}), Status: 'Lewat' })`);
  assert.equal(call(env, 'rn.admin.sewaan.butiran', admin, { id: 'SWA-0001' }).data.tunggakan.ditanda, true);
  // tanpa bil lewat: notis tidak boleh
  env.run(`Db.replaceAll('Bayaran_Sewa', [])`);
  assert.equal(call(env, 'rn.admin.notis.jana', admin, { id: 'SWA-0001', jenis: 'Peringatan 1' }).error.code, 'RN_BIL_STATUS');
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.notis.jana', pem, { id: 'SWA-0001', jenis: 'Peringatan 1' }).error.code, 'TIADA_KEBENARIAN');
});

test('Pembaharuan sewaan oleh admin: sambung satu tahun, kadar baharu, dokumen baharu, tarikh akhir pulang dikemas kini', () => {
  const c = sedia(-20, 340);
  const { env, admin } = c;
  const tamatLama = dateOf(env, sewaan(env).Tarikh_Tamat);
  const pul = dateOf(env, cagaran(env).Tarikh_Akhir_Pulang);
  assert.ok(call(env, 'rn.admin.sewaan.perbaharui', admin, { id: 'SWA-0001', kadarBaharu: 'x' }).error.extra.medan.kadarBaharu);
  const r = call(env, 'rn.admin.sewaan.perbaharui', admin, { id: 'SWA-0001', kadarBaharu: '300' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const tamatBaru = env.run(`Util.dateKey(Util.addMonths(${JSON.stringify(tamatLama)}, 12))`);
  assert.equal(dateOf(env, sewaan(env).Tarikh_Tamat), tamatBaru);
  assert.equal(sewaan(env).Bil_Pembaharuan, 1);
  assert.equal(dateOf(env, cagaran(env).Tarikh_Akhir_Pulang), env.run(`Util.dateKey(RnU.tambahHari(${JSON.stringify(tamatBaru)}, 90))`));
  assert.notEqual(dateOf(env, cagaran(env).Tarikh_Akhir_Pulang), pul);
  // dokumen baharu dijana (templat tersedia)
  assert.deepEqual(r.data.amaranPembaharuan, []);
  assert.ok(r.data.dokumen.some((d) => d.tajuk === 'Perjanjian Sewa (pembaharuan)'));
  // jadual: peringkat akhir ditutup, peringkat baharu RM300
  const j = rows(env, 'Jadual_Sewa').filter((x) => x.ID_Sewaan === 'SWA-0001').map((x) => [x.Dari_Bulan, x.Hingga_Bulan, x.Kadar_RM]);
  assert.deepEqual(j, [[1, 6, 150], [7, 12, 250], [13, '', 300]]);
  assert.equal(env.run(`RnSewa.kadarBulan(RnTawaran.jadualOf('${c.id}', 'SWA-0001'), 13, 0)`), 300);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'PERBAHARUI_SEWAAN'));
  // tanpa templat: pembaharuan berjaya, amaran jelas
  env.state.files[Object.keys(env.state.files).find((k) => env.state.files[k].name === 'Templat TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB')].denied = true;
  const r2 = call(env, 'rn.admin.sewaan.perbaharui', admin, { id: 'SWA-0001' });
  assert.equal(r2.ok, true);
  assert.match(r2.data.amaranPembaharuan[0], /Templat dokumen/);
  assert.equal(sewaan(env).Bil_Pembaharuan, 2);
  // sewaan yang sudah tamat tidak boleh diperbaharui
  call(env, 'rn.admin.sewaan.tamat', admin, { id: 'SWA-0001', sebab: 'Selesai' });
  assert.equal(call(env, 'rn.admin.sewaan.perbaharui', admin, { id: 'SWA-0001' }).error.code, 'RN_SEWAAN_STATUS');
  assert.equal(call(env, 'rn.admin.sewaan.tamat', admin, { id: 'SWA-0001', sebab: 'Lagi' }).error.code, 'RN_SEWAAN_STATUS');
});

test('Daftar sewaan sedia ada: terus Sewaan Aktif tanpa aliran tawaran, cagaran diterima, pemilik melihat, satu lot satu pelajar', () => {
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-02');
  const weijie = ssuLulus(env, admin, WEIJIE, 'weijie trading');
  setCfg(env, 'JANA_BIL_SEWA_HARI', '1');
  const f = (patch) => Object.assign({ idPerniagaan: 'PRN-0001', kodLot: 'SM-02', tarikhMula: hari(env, -60), tarikhTamat: hari(env, 300), kadar: '180', cagaranSewaan: '180', cagaranUtiliti: '50' }, patch || {});
  const bad = call(env, 'rn.admin.sewaan.sedia', admin, { idPerniagaan: 'PRN-9999', kodLot: 'TIADA', tarikhMula: 'x', tarikhTamat: hari(env, -2), jadual: [] });
  assert.equal(bad.error.code, 'RN_SEDIA_TIDAK_SAH');
  ['idPerniagaan', 'kodLot', 'tarikhMula', 'jadual'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  assert.ok(call(env, 'rn.admin.sewaan.sedia', admin, f({ tarikhTamat: hari(env, -2) })).error.extra.medan.tarikhTamat);
  setRow(env, 'Lot', 'Kod_Lot', 'SM-02', { Status_Lot: 'Penyelenggaraan' });
  assert.ok(call(env, 'rn.admin.sewaan.sedia', admin, f()).error.extra.medan.kodLot);
  setRow(env, 'Lot', 'Kod_Lot', 'SM-02', { Status_Lot: 'Kosong' });
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.sewaan.sedia', pem, f()).error.code, 'TIADA_KEBENARIAN');
  const r = call(env, 'rn.admin.sewaan.sedia', admin, f());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Aktif');
  assert.equal(r.data.jenisDaftar, 'Sedia ada');
  const p = rows(env, 'Permohonan_Lot')[0];
  assert.equal(p.Status, 'Sewaan Aktif');
  assert.equal(p.Jenis_Permohonan, 'Sedia ada');
  assert.equal(p.No_Matrik, 'A22UJ0003');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-02').Status_Lot, 'Disewa');
  assert.deepEqual(rows(env, 'Cagaran').map((x) => x.Jenis + ':' + x.Status + ':' + x.Jumlah_RM), ['Sewaan:Diterima:180', 'Utiliti:Diterima:50']);
  assert.equal(rows(env, 'Cagaran')[0].ID_Sewaan, 'SWA-0001');
  assert.ok(rows(env, 'Cagaran')[0].Tarikh_Akhir_Pulang);
  assert.deepEqual(rows(env, 'Jadual_Sewa').map((j) => [j.ID_Sewaan, j.Dari_Bulan, j.Kadar_RM]), [['SWA-0001', 1, 180]]);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'DAFTAR_SEWAAN_SEDIA_ADA'));
  // kerja harian menjana bil bulan semasa mengikut kadar
  const j = harian(env);
  assert.equal(j.sewa.bilDijana, 1);
  assert.equal(bilAll(env)[0].Jumlah_RM, 180);
  assert.equal(bilAll(env)[0].Bulan_Sewa_Ke >= 3, true);
  // pemilik melihat sewaan dan bil; satu lot satu pelajar
  const s = call(env, 'rn.saya', weijie).data;
  assert.equal(s.permohonan[0].status, 'Sewaan Aktif');
  assert.equal(s.sebab, 'SUDAH_ADA_LOT');
  const b = call(env, 'rn.butiran', weijie, { id: p.ID_Permohonan }).data;
  assert.equal(b.sewaan.bil.length, 1);
  assert.equal(b.bolehPekerja, true);
  // lot yang sudah disewa tidak boleh didaftar semula; perniagaan sama tidak boleh dua lot
  assert.ok(call(env, 'rn.admin.sewaan.sedia', admin, f({ kodLot: 'SM-02' })).error.extra.medan.kodLot);
  bukaLot(env, admin, 'SM-03');
  assert.ok(call(env, 'rn.admin.sewaan.sedia', admin, f({ kodLot: 'SM-03' })).error.extra.medan.idPerniagaan);
  // tamat sewaan membolehkan permohonan baharu selepas tempoh dibuka
  call(env, 'rn.admin.sewaan.tamat', admin, { id: 'SWA-0001', sebab: 'Tamat kontrak' });
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-02').Status_Lot, 'Kosong');
});

test('Bagi pihak pelajar: rekod bayaran sewa dan dashboard admin (okupansi, kutipan, tertunggak, cagaran)', () => {
  const c = sedia();
  const { env, admin } = c;
  const id = bilAll(env)[0].ID_Bil;
  const r = call(env, 'rn.bp.bil.bayar', admin, { noMatrik: 'A23UJ0001', id, kaedah: 'PayHub UTM', noRujukan: 'PH-0001', tarikhBayar: hari(env, 0), fail: pdfFile('r.pdf') });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(rows(env, 'Audit').find((a) => a.Tindakan === 'REKOD_BAYARAN_SEWA').Catatan, /\[bagi pihak A23UJ0001\]/);
  call(env, 'rn.admin.bil.sahkan', admin, { id });
  const d = call(env, 'rn.admin.dashboard', admin).data;
  assert.equal(d.okupansi.lot, 15);
  assert.equal(d.okupansi.disewa, 1);
  assert.equal(d.okupansi.kosong, 14);
  assert.equal(d.okupansi.peratus, 6.7);
  assert.equal(d.kutipan.dikutip, bilAll(env)[0].Jumlah_RM);
  assert.equal(d.tertunggak.bil, 0);
  assert.equal(d.permohonan.diluluskan, 0);
  // bil lewat
  env.run(`Db.append('Bayaran_Sewa', { ID_Bil: 'BSW-Y', ID_Sewaan: 'SWA-0001', Kod_Lot: 'SM-01', ID_Perniagaan: 'PRN-0001', Bulan: 1, Tahun: 2020, Jumlah_RM: 150, Tarikh_Akhir: Util.toDate(${JSON.stringify(hari(env, -40))}), Status: 'Lewat' })`);
  const d2 = call(env, 'rn.admin.dashboard', admin).data;
  assert.equal(d2.tertunggak.jumlah, 150);
  assert.equal(d2.tunggakanDitanda.length, 1);
  assert.equal(d2.tunggakanDitanda[0].cadanganNotis, 'Peringatan 1');
  const lst = call(env, 'rn.admin.bil.senarai', admin, { status: 'Lewat' });
  assert.equal(lst.data.senarai.length, 1);
  assert.equal(lst.data.senarai[0].perniagaan, 'SENI KEK AINA');
  assert.equal(lst.data.senarai[0].hariLewat, 40);
  assert.equal(call(env, 'rn.admin.sewaan.senarai', admin, { q: 'kek' }).data.senarai.length, 1);
  const penilai = login(env, 'penilai@utm.my').token;
  assert.equal(call(env, 'rn.admin.dashboard', penilai).error.code, 'TIADA_KEBENARIAN');
});
