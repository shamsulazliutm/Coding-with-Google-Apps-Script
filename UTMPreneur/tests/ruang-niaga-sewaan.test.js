'use strict';
/** Ruang Niaga fasa 4: cagaran, perjanjian, pekerja/peralatan, pengaktifan sewaan, pemulangan cagaran. */
const test = require('node:test');
const { call, login, student, setCfg, assert } = require('./helpers');
const { AINA, AMIRUL, WEIJIE, ADMIN, rows, setRow, hari, otpCode, pdfFile, TPL_PERJANJIAN, diterima, sediaDiluluskan, hantarTawaran, jawabTawaran } = require('./rn-helpers');

const pdfText = (r) => Buffer.from(r.data.data, 'base64').toString('utf8');
const RESIT = (patch) => Object.assign({ noResit: 'RR-2026-001234', tarikhResit: hari(null, 0), fail: pdfFile('resit.pdf') }, patch || {});
const cag = (env, jenis) => rows(env, 'Cagaran').find((c) => c.Jenis === (jenis || 'Sewaan'));

function resit(c, patch) {
  const r = call(c.env, 'rn.cagaran.muatnaik', c.aina, Object.assign({ id: cag(c.env).ID_Cagaran }, RESIT(patch), { tarikhResit: c.env.run('Util.dateKey(new Date())') }));
  return r;
}

test('Cagaran: pemilik memuat naik resit rasmi, pengesahan ralat, ahli tidak boleh, admin mengesahkan atau mengembalikan', () => {
  const c = diterima();
  const { env, admin, aina, amirul } = c;
  const id = cag(env).ID_Cagaran;
  // pengesahan
  const bad = call(env, 'rn.cagaran.muatnaik', aina, { id, noResit: '', tarikhResit: hari(env, 3), fail: { nama: 'x.exe', data: 'AAAA' } });
  assert.equal(bad.error.code, 'RN_CAGARAN_TIDAK_SAH');
  ['noResit', 'tarikhResit', 'fail'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  assert.equal(call(env, 'rn.cagaran.muatnaik', amirul, { id, noResit: 'RR-1', tarikhResit: hari(env, 0), fail: pdfFile('r.pdf') }).error.code, 'RN_HANYA_PEMILIK');
  assert.equal(call(env, 'rn.cagaran.muatnaik', student(env, WEIJIE), { id, noResit: 'RR-1', tarikhResit: hari(env, 0), fail: pdfFile('r.pdf') }).error.code, 'RN_TIDAK_DITEMUI');
  // sah
  const r = resit(c);
  assert.equal(r.ok, true, JSON.stringify(r));
  const k = cag(env);
  assert.equal(k.Status, 'Menunggu Pengesahan');
  assert.equal(k.No_Resit_Rasmi, 'RR-2026-001234');
  assert.match(k.Fail_Resit, /drive\.google/);
  assert.equal(env.sentTo(ADMIN).filter((m) => /Resit cagaran menunggu pengesahan/.test(m.subject)).length, 1);
  // pemilik dan ahli memuat turun; orang lain tidak; admin diaudit
  assert.equal(call(env, 'rn.cagaran.fail', amirul, { id }).ok, true);
  assert.equal(call(env, 'rn.cagaran.fail', student(env, WEIJIE), { id }).error.code, 'RN_DOK_TIDAK_DITEMUI');
  assert.equal(call(env, 'rn.admin.cagaran.fail', admin, { id }).ok, true);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'PAPAR_RESIT_CAGARAN'));
  // kembalikan perlu catatan
  assert.equal(call(env, 'rn.admin.cagaran.kembali', admin, { id, catatan: '' }).error.code, 'RN_CATATAN_WAJIB');
  const kb = call(env, 'rn.admin.cagaran.kembali', admin, { id, catatan: 'Resit kabur' });
  assert.equal(kb.ok, true);
  assert.equal(cag(env).Status, 'Belum Bayar');
  assert.equal(cag(env).Catatan, 'Resit kabur');
  assert.equal(call(env, 'rn.admin.cagaran.sahkan', admin, { id }).error.code, 'RN_CAGARAN_STATUS');
  resit(c, { noResit: 'RR-2026-001300' });
  const sh = call(env, 'rn.admin.cagaran.sahkan', admin, { id });
  assert.equal(sh.ok, true, JSON.stringify(sh));
  assert.equal(cag(env).Status, 'Diterima');
  assert.equal(cag(env).Disahkan_Oleh, ADMIN);
  assert.equal(sh.data.aktivasi.aktif, false);
  assert.deepEqual(sh.data.aktivasi.menunggu, ['Perjanjian bertandatangan belum disahkan']);
  // tidak boleh muat naik lagi selepas diterima
  assert.equal(resit(c).error.code, 'RN_CAGARAN_STATUS');
  // pemerhati tidak boleh mengesahkan
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.cagaran.sahkan', pem, { id }).error.code, 'TIADA_KEBENARIAN');
});

test('Cagaran: peringatan sebelum tarikh akhir, lewat dimaklumkan kepada admin sekali (tiada pembatalan automatik)', () => {
  const c = diterima();
  const { env } = c;
  const id = cag(env).ID_Cagaran;
  const akhir = (n) => setRow(env, 'Cagaran', 'ID_Cagaran', id, { Tarikh_Akhir_Bayar: env.run(`Util.toDate(${JSON.stringify(hari(env, n))})`) });
  akhir(5); env.run('RuangNiaga.jobHarian()');
  assert.equal(env.sentTo(AINA).filter((m) => /Peringatan: bayar cagaran/.test(m.subject)).length, 0);
  akhir(3); env.run('RuangNiaga.jobHarian()'); env.run('RuangNiaga.jobHarian()');
  assert.equal(env.sentTo(AINA).filter((m) => /Peringatan: bayar cagaran/.test(m.subject)).length, 1);
  akhir(-1);
  const j = env.plain(env.run('RuangNiaga.jobHarian()'));
  assert.equal(j.cagaran.lewatBayar, 1);
  env.run('RuangNiaga.jobHarian()');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Cagaran lewat dibayar/.test(m.subject)).length, 1);
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Diterima', 'tiada pembatalan automatik');
  assert.equal(call(env, 'rn.admin.sewaan.senarai', c.admin, {}).ok, true);
  assert.equal(call(env, 'rn.butiran', c.aina, { id: c.id }).data.cagaran[0].lewatBayar, true);
});

test('Perjanjian: templat tiada memberi TEMPLAT_TIADA; templat F&B dan bukan F&B dipilih mengikut jenis lot; penanda diisi', () => {
  const c = diterima();
  const { env, admin, aina, amirul, id } = c;
  const gagal = call(env, 'rn.admin.perjanjian.jana', admin, { id });
  assert.equal(gagal.error.code, 'TEMPLAT_TIADA');
  assert.match(gagal.error.bm, /Templat dokumen belum didaftar/);
  // pekerja dan peralatan masuk dalam perjanjian
  assert.equal(call(env, 'rn.pekerja.simpan', aina, { idPermohonan: id, nama: 'ali bin abu', umur: '22', fakulti: 'FC', tugas: 'Juru jual', pelajarUtm: 'Ya', noMatrik: 'A22UJ0003' }).ok, true);
  assert.equal(call(env, 'rn.admin.peralatan.simpan', admin, { kodLot: 'SM-01', nama: 'Peti sejuk', bilangan: '1' }).ok, true);
  // bukan F&B (SM-01 jenis RETAIL): guna templat bukan F&B sahaja
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_FNB', 'TEMPLAT FNB [no_rujukan]');
  assert.equal(call(env, 'rn.admin.perjanjian.jana', admin, { id }).error.code, 'TEMPLAT_TIADA');
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN + '\nPenanda tidak dikenali [tiada_ini]');
  const j = call(env, 'rn.admin.perjanjian.jana', admin, { id });
  assert.equal(j.ok, true, JSON.stringify(j));
  assert.equal(j.data.status, 'Perjanjian');
  assert.equal(j.data.perjanjian.status, 'Menunggu salinan bertandatangan');
  assert.equal(j.data.perjanjian.versi, 1);
  assert.ok(j.data.amaranPerjanjian.some((a) => a.includes('[tiada_ini]')));
  const dok = j.data.dokumen.find((d) => d.jenis === 'Perjanjian');
  const txt = pdfText(call(env, 'rn.admin.dok.fail', admin, { id: dok.id }));
  assert.ok(!txt.includes('TEMPLAT FNB'));
  const tuj = [
    'NO. RUJUKAN UTM\\.J\\.06\\.11/13\\.16/11 \\(12\\)', 'SENI KEK AINA \\(202603001234\\) beralamat di No 12, Jalan Mawar', 'Lot: Student Mall - Lot 1 \\(SM-01\\)',
    'Sewa: Bulan ke-1 hingga ke-6: RM 150; Bulan ke-7 dan ke atas: RM 250\\. Bayar pada atau sebelum hari ke-7', 'Cagaran sewaan RM 150, utiliti Tiada',
    'Waktu operasi 12\\.00 tengahari - 9\\.00 malam', 'UTM: Ybrs\\. Prof\\. Ts\\. Dr\\. Ali bin Selamat, Timbalan Naib Canselor', 'di hadapan Prof\\. Madya Dr\\. Syed Norris Hikmi',
    'Syarikat: NURUL AINA BINTI HASSAN di hadapan Pn\\. Siti Noraziah binti Satapah, Pegawai Tadbir UTMXCITE', 'Pekerja \\(1\\): 1\\. ALI BIN ABU, umur 22, FC, Juru jual', 'Peralatan \\(1\\): 1\\. Peti sejuk - 1'
  ];
  tuj.forEach((p) => assert.match(txt, new RegExp(p), p));
  // pemilik dan ahli melihat perjanjian dan Lampiran 1 (SSM)
  const b = call(env, 'rn.butiran', amirul, { id }).data;
  assert.deepEqual(b.dokumen.map((d) => d.jenis), ['Surat Tawaran', 'Penerimaan', 'Perjanjian', 'Lampiran']);
  assert.equal(b.perjanjian.status, 'Menunggu salinan bertandatangan');
  assert.equal(call(env, 'rn.dok.fail', amirul, { id: dok.id }).ok, true);
  // jana semula: versi baharu, versi lama Digantikan
  const j2 = call(env, 'rn.admin.perjanjian.jana', admin, { id });
  assert.equal(j2.data.perjanjian.versi, 2);
  assert.deepEqual(rows(env, 'Dokumen_Sewaan').filter((d) => d.Jenis === 'Perjanjian').map((d) => d.Versi + ':' + d.Status), ['1:Digantikan', '2:Menunggu salinan bertandatangan']);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'JANA_PERJANJIAN_SEWA' && /TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB/.test(a.Catatan)));
  // kebenaran
  assert.equal(call(env, 'rn.admin.perjanjian.jana', login(env, 'pemerhati@utm.my').token, { id }).error.code, 'TIADA_KEBENARIAN');
});

test('Perjanjian F&B menggunakan templat F&B; SSM dalam proses memberi amaran admin', () => {
  const c = diterima({ lot: { jenis: 'FNB' }, ssu: { statusSsm: 'PROSES', failSsm: null, noSsm: '' } });
  const { env, admin, id } = c;
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_FNB', 'TEMPLAT FNB [no_rujukan] [no_pendaftaran_syarikat]');
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', 'TEMPLAT BUKAN FNB');
  const j = call(env, 'rn.admin.perjanjian.jana', admin, { id });
  assert.equal(j.ok, true, JSON.stringify(j));
  const txt = pdfText(call(env, 'rn.admin.dok.fail', admin, { id: j.data.dokumen.find((d) => d.jenis === 'Perjanjian').id }));
  assert.match(txt, /TEMPLAT FNB UTM\.J\.06\.11\/13\.16\/11 \(12\) Dalam proses \(XCITE-\d{4}S00001-01\)/);
  assert.ok(j.data.amaranPerjanjian.some((a) => /Pendaftaran SSM: Dalam proses/.test(a)));
  assert.ok(j.data.amaran.some((a) => /SSM/.test(a)));
});

test('Salinan perjanjian bertandatangan: muat naik pemilik, dikembalikan dengan catatan, disahkan admin', () => {
  const c = diterima();
  const { env, admin, aina, amirul, id } = c;
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  // belum ada perjanjian
  assert.equal(call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') }).error.code, 'RN_PERJANJIAN_STATUS');
  call(env, 'rn.admin.perjanjian.jana', admin, { id });
  assert.equal(call(env, 'rn.perjanjian.muatnaik', amirul, { id, fail: pdfFile('tt.pdf') }).error.code, 'RN_HANYA_PEMILIK');
  assert.ok(call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: { nama: 'tt.exe', data: 'AAAA' } }).error.extra.medan.fail);
  assert.equal(call(env, 'rn.admin.perjanjian.sahkan', admin, { id }).error.code, 'RN_PERJANJIAN_STATUS', 'belum ada salinan');
  assert.equal(call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') }).ok, true);
  let b = call(env, 'rn.butiran', aina, { id }).data;
  assert.equal(b.perjanjian.status, 'Dimuat naik');
  assert.equal(b.perjanjian.salinan.status, 'Dimuat naik');
  assert.ok(b.dokumen.some((d) => d.jenis === 'Perjanjian Bertandatangan'));
  assert.equal(call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt2.pdf') }).error.code, 'RN_PERJANJIAN_STATUS', 'menunggu pengesahan');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Salinan perjanjian bertandatangan dimuat naik/.test(m.subject)).length, 1);
  // dikembalikan
  assert.equal(call(env, 'rn.admin.perjanjian.kembali', admin, { id, catatan: '' }).error.code, 'RN_CATATAN_WAJIB');
  assert.equal(call(env, 'rn.admin.perjanjian.kembali', admin, { id, catatan: 'Tandatangan saksi tiada' }).ok, true);
  b = call(env, 'rn.butiran', aina, { id }).data;
  assert.equal(b.perjanjian.status, 'Dikembalikan');
  assert.equal(b.perjanjian.salinan.catatan, 'Tandatangan saksi tiada');
  assert.equal(call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt3.pdf') }).ok, true);
  assert.deepEqual(rows(env, 'Dokumen_Sewaan').filter((d) => d.Jenis === 'Perjanjian Bertandatangan').map((d) => d.Versi + ':' + d.Status), ['1:Dikembalikan', '2:Dimuat naik']);
  // salinan bertandatangan ahli boleh melihat dan memuat turun
  const sal = b.dokumen.filter((d) => d.jenis === 'Perjanjian Bertandatangan').pop();
  assert.equal(call(env, 'rn.dok.fail', amirul, { id: sal.id }).ok, true);
});

test('Sewaan aktif hanya selepas perjanjian disahkan DAN cagaran sewaan disahkan (perjanjian dahulu)', () => {
  const c = diterima();
  const { env, admin, aina, id } = c;
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  call(env, 'rn.admin.perjanjian.jana', admin, { id });
  call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') });
  // cagaran belum disahkan: perjanjian disahkan tetapi sewaan belum aktif
  const s1 = call(env, 'rn.admin.perjanjian.sahkan', admin, { id });
  assert.equal(s1.ok, true, JSON.stringify(s1));
  assert.equal(s1.data.aktivasi.aktif, false);
  assert.deepEqual(s1.data.aktivasi.menunggu, ['Cagaran sewaan belum disahkan']);
  assert.equal(rows(env, 'Sewaan').length, 0);
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Perjanjian');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Dipohon');
  // cagaran dimuat naik tetapi belum disahkan: masih belum aktif
  resit(c);
  assert.equal(rows(env, 'Sewaan').length, 0);
  // salinan fizikal bukan syarat (tidak diterima), cagaran disahkan -> aktif
  const sh = call(env, 'rn.admin.cagaran.sahkan', admin, { id: cag(env).ID_Cagaran });
  assert.equal(sh.data.aktivasi.aktif, true, JSON.stringify(sh.data.aktivasi));
  assert.equal(rows(env, 'Tawaran_Sewa')[0].Salinan_Fizikal_Tarikh, '');
  const sew = rows(env, 'Sewaan');
  assert.equal(sew.length, 1);
  assert.match(sew[0].ID_Sewaan, /^SWA-0001$/);
  assert.equal(sew[0].Status, 'Aktif');
  assert.equal(sew[0].Kod_Lot, 'SM-01');
  assert.equal(sew[0].Kadar_RM, 150);
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(sew[0].Tarikh_Mula)})`), hari(env, 10));
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(sew[0].Tarikh_Tamat)})`), hari(env, 10 + 364));
  const p = rows(env, 'Permohonan_Lot')[0];
  assert.equal(p.Status, 'Sewaan Aktif');
  assert.equal(p.ID_Sewaan, 'SWA-0001');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Disewa');
  // jadual sewa disalin untuk sewaan
  assert.deepEqual(rows(env, 'Jadual_Sewa').filter((j) => j.ID_Sewaan === 'SWA-0001').map((j) => [j.Dari_Bulan, j.Hingga_Bulan, j.Kadar_RM]), [[1, 6, 150], [7, '', 250]]);
  assert.equal(rows(env, 'Jadual_Sewa').filter((j) => j.ID_Sewaan === '').length, 2, 'jadual tawaran kekal');
  // tarikh akhir pulang = tamat + 90 hari; cagaran dipaut ke sewaan
  assert.equal(cag(env).ID_Sewaan, 'SWA-0001');
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(cag(env).Tarikh_Akhir_Pulang)})`), hari(env, 10 + 364 + 90));
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'AKTIFKAN_SEWAAN'));
  assert.equal(env.sentTo(AINA).filter((m) => /Sewaan lot anda kini aktif/.test(m.subject)).length, 1);
  // tarikh mula sewaan dalam masa hadapan: tiada bil bagi bulan semasa jika mula selepas bulan ini (dipanggil di bawah)
  const bulanMula = env.run(`Util.fmtDate(Util.toDate(${JSON.stringify(hari(env, 10))}), 'yyyy-MM')`);
  const bulanIni = env.run("Util.fmtDate(new Date(), 'yyyy-MM')");
  assert.equal(rows(env, 'Bayaran_Sewa').length, bulanMula === bulanIni ? 1 : 0);
  // idempotent
  assert.equal(env.run(`RnPerjanjian.cubaAktif({ email: 'x', role: 'Admin Penuh' }, 'PLT-TIADA').aktif`), false);
  assert.equal(env.run(`RnSewa.aktifkan({ email: 'x', role: 'Admin Penuh' }, ${JSON.stringify(id)})`), 'SWA-0001');
  assert.equal(rows(env, 'Sewaan').length, 1);
});

test('Sewaan aktif: cagaran dahulu kemudian perjanjian; tarikh mula ditetapkan admin dan bil pertama dijana', () => {
  const c = diterima();
  const { env, admin, aina, id } = c;
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  resit(c);
  assert.equal(call(env, 'rn.admin.cagaran.sahkan', admin, { id: cag(env).ID_Cagaran }).data.aktivasi.aktif, false);
  call(env, 'rn.admin.perjanjian.jana', admin, { id });
  call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') });
  // admin menetapkan tarikh mula = hari ini supaya bil pertama dijana serta-merta
  const mula = hari(env, 0), tamat = hari(env, 364);
  const bad = call(env, 'rn.admin.perjanjian.sahkan', admin, { id, tarikhMula: 'x' });
  assert.ok(bad.error.extra.medan.tarikhMula);
  const sh = call(env, 'rn.admin.perjanjian.sahkan', admin, { id, tarikhMula: mula, tarikhTamat: tamat });
  assert.equal(sh.data.aktivasi.aktif, true, JSON.stringify(sh.data.aktivasi));
  assert.equal(sh.data.status, 'Sewaan Aktif');
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(rows(env, 'Sewaan')[0].Tarikh_Mula)})`), mula);
  const bil = rows(env, 'Bayaran_Sewa');
  assert.equal(bil.length, 1);
  assert.match(bil[0].ID_Bil, /^BSW-\d{4}-0001$/);
  assert.equal(bil[0].Jumlah_RM, 150);
  assert.equal(bil[0].Bulan_Sewa_Ke, 1);
  assert.equal(bil[0].Status, 'Belum Bayar');
  assert.ok(env.run(`Util.daysBetween(new Date(), ${JSON.stringify(bil[0].Tarikh_Akhir)})`) >= 0, 'tarikh akhir bil pertama tidak lampau');
  // pemilik melihat sewaan dan bil
  const b = call(env, 'rn.butiran', aina, { id }).data;
  assert.equal(b.sewaan.id, 'SWA-0001');
  assert.equal(b.sewaan.bil.length, 1);
  assert.equal(b.status, 'Sewaan Aktif');
  assert.equal(call(env, 'rn.admin.perjanjian.sahkan', admin, { id }).error.code, 'RN_PERJANJIAN_STATUS', 'tidak boleh disahkan semula');
  assert.equal(call(env, 'rn.admin.perjanjian.jana', admin, { id }).error.code, 'RN_PERJANJIAN_STATUS');
});

test('Tiada cagaran sewaan: sewaan aktif sebaik perjanjian disahkan', () => {
  const c = diterima({ tawaran: { cagaranSewaan: '0', cagaranUtiliti: '0' } });
  const { env, admin, aina, id } = c;
  assert.equal(rows(env, 'Cagaran').length, 0);
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  call(env, 'rn.admin.perjanjian.jana', admin, { id });
  call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') });
  const sh = call(env, 'rn.admin.perjanjian.sahkan', admin, { id });
  assert.equal(sh.data.aktivasi.aktif, true);
  assert.equal(rows(env, 'Sewaan').length, 1);
});

test('Pekerja penyewa (Lampiran 2): pelajar UTM terus diluluskan, pekerja luar perlu kelulusan admin, umur dan akses', () => {
  const c = diterima();
  const { env, admin, aina, amirul, id } = c;
  const pk = (patch) => call(env, 'rn.pekerja.simpan', aina, Object.assign({ idPermohonan: id, nama: 'Siti Aminah', umur: '21', fakulti: 'FM', tugas: 'Juruwang', pelajarUtm: 'Tidak' }, patch));
  const bad = pk({ nama: '', umur: '17', tugas: '', pelajarUtm: 'Ya', noMatrik: 'TIADA123' });
  assert.equal(bad.error.code, 'RN_PEKERJA_TIDAK_SAH');
  ['nama', 'umur', 'tugas', 'noMatrik'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  assert.equal(call(env, 'rn.pekerja.simpan', amirul, { idPermohonan: id, nama: 'X Y Z', umur: '20', tugas: 't' }).error.code, 'RN_HANYA_PEMILIK');
  const a = pk({ nama: '', pelajarUtm: 'Ya', noMatrik: 'A22UJ0003', tugas: 'Jurujual' });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.data.pekerja[0].status, 'Diluluskan');
  assert.equal(a.data.pekerja[0].nama, 'LIM WEI JIE', 'nama diambil daripada rekod pelajar');
  const luar = pk({});
  assert.equal(luar.data.pekerja.find((x) => x.nama === 'SITI AMINAH').status, 'Menunggu Kelulusan');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Pekerja luar UTM menunggu kelulusan/.test(m.subject)).length, 1);
  // admin meluluskan/menolak
  const pid = luar.data.pekerja.find((x) => x.nama === 'SITI AMINAH').id;
  assert.equal(call(env, 'rn.admin.pekerja.putus', admin, { id: pid, tindakan: 'tolak' }).error.code, 'RN_CATATAN_WAJIB');
  const ok = call(env, 'rn.admin.pekerja.putus', admin, { id: pid, tindakan: 'lulus' });
  assert.equal(ok.data.pekerja.find((x) => x.id === pid).status, 'Diluluskan');
  assert.equal(call(env, 'rn.admin.pekerja.putus', admin, { id: pid, tindakan: 'lulus' }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  // buang oleh pemilik sahaja
  assert.equal(call(env, 'rn.pekerja.buang', amirul, { id: pid }).error.code, 'RN_HANYA_PEMILIK');
  assert.equal(call(env, 'rn.pekerja.buang', aina, { id: pid }).data.pekerja.length, 1);
  // ahli melihat senarai
  assert.equal(call(env, 'rn.butiran', amirul, { id }).data.pekerja.length, 1);
});

test('Peralatan lot (Lampiran 3): admin urus, pemerhati lihat', () => {
  const { env, admin } = diterima();
  const s = call(env, 'rn.admin.peralatan.simpan', admin, { kodLot: 'SM-01', nama: 'Meja stainless', bilangan: '2', catatan: 'Baik' });
  assert.equal(s.ok, true, JSON.stringify(s));
  const bad = call(env, 'rn.admin.peralatan.simpan', admin, { kodLot: 'XX', nama: '', bilangan: '0' });
  ['kodLot', 'nama', 'bilangan'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  const id = s.data.peralatan[0].id;
  assert.equal(call(env, 'rn.admin.peralatan.simpan', admin, { id, kodLot: 'SM-01', nama: 'Meja stainless', bilangan: '3' }).data.peralatan[0].bilangan, 3);
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.peralatan.senarai', pem, { kodLot: 'SM-01' }).data.bolehUbah, false);
  assert.equal(call(env, 'rn.admin.peralatan.simpan', pem, { kodLot: 'SM-01', nama: 'x', bilangan: '1' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.peralatan.buang', admin, { id }).data.peralatan.length, 0);
});

/** Sewaan aktif dengan tarikh mula/tamat ditetapkan. */
function aktif(mula, tamat) {
  const c = diterima();
  const { env, admin, aina, id } = c;
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  resit(c);
  call(env, 'rn.admin.cagaran.sahkan', admin, { id: cag(env).ID_Cagaran });
  call(env, 'rn.admin.perjanjian.jana', admin, { id });
  call(env, 'rn.perjanjian.muatnaik', aina, { id, fail: pdfFile('tt.pdf') });
  const sh = call(env, 'rn.admin.perjanjian.sahkan', admin, { id, tarikhMula: mula, tarikhTamat: tamat });
  assert.equal(sh.data.aktivasi.aktif, true);
  return c;
}

test('Pemulangan cagaran: hanya selepas sewaan tamat, potongan perlu sebab, rampas perlu sebab, tarikh akhir 90 hari, peringatan hari ke-60 dan ke-80, Lewat Pulang', () => {
  const c = aktif(hari(null, -30), hari(null, 330));
  const { env, admin, id } = c;
  const idC = cag(env).ID_Cagaran;
  assert.equal(call(env, 'rn.admin.cagaran.pulang', admin, { id: idC }).error.code, 'RN_CAGARAN_BELUM_TAMAT');
  assert.equal(call(env, 'rn.admin.cagaran.rampas', admin, { id: idC, sebab: '' }).error.code, 'RN_CATATAN_WAJIB');
  // tamatkan sewaan 100 hari lepas supaya tarikh akhir pulang = tamat + 90 sudah lepas? (tamat hari ini - 30)
  const tm = call(env, 'rn.admin.sewaan.tamat', admin, { id: 'SWA-0001', sebab: 'Penyewa berpindah', tarikh: hari(env, 0) });
  assert.equal(tm.ok, true, JSON.stringify(tm));
  assert.equal(tm.data.status, 'Tamat');
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Tamat');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Kosong');
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(cag(env).Tarikh_Akhir_Pulang)})`), hari(env, 90));
  // peringatan admin: hari ke-60 dan ke-80
  const set = (n) => setRow(env, 'Sewaan', 'ID_Sewaan', 'SWA-0001', { Tarikh_Tamat_Sebenar: env.run(`Util.toDate(${JSON.stringify(hari(env, -n))})`) });
  const rem = () => env.sentTo(ADMIN).filter((m) => /Peringatan: pulangkan cagaran/.test(m.subject)).length;
  set(59); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 0);
  set(60); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 1);
  env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 1);
  set(80); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 2);
  // lewat pulang selepas hari ke-90
  setRow(env, 'Cagaran', 'ID_Cagaran', idC, { Tarikh_Akhir_Pulang: env.run(`Util.toDate(${JSON.stringify(hari(env, -1))})`) });
  set(91); env.run('RuangNiaga.jobHarian()');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Cagaran lewat dipulangkan/.test(m.subject)).length, 1);
  assert.equal(call(env, 'rn.admin.sewaan.butiran', admin, { id: 'SWA-0001' }).data.cagaran[0].lewatPulang, true);
  assert.equal(call(env, 'rn.admin.dashboard', admin).data.cagaran.lewatPulang.length, 1);
  // pulang dengan potongan
  const bad = call(env, 'rn.admin.cagaran.pulang', admin, { id: idC, jumlah: '100' });
  assert.ok(bad.error.extra.medan.sebab);
  assert.ok(call(env, 'rn.admin.cagaran.pulang', admin, { id: idC, jumlah: '999', sebab: 'x' }).error.extra.medan.jumlah);
  const ok = call(env, 'rn.admin.cagaran.pulang', admin, { id: idC, jumlah: '100', sebab: 'Kerosakan dinding', tarikh: hari(env, 0) });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(cag(env).Status, 'Dipulangkan');
  assert.equal(cag(env).Jumlah_Pulang_RM, 100);
  assert.equal(cag(env).Sebab_Potongan, 'Kerosakan dinding');
  assert.equal(call(env, 'rn.admin.cagaran.pulang', admin, { id: idC }).error.code, 'RN_CAGARAN_STATUS');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'PULANG_CAGARAN'));
});

test('Rampas cagaran dengan sebab; tamat sewaan perlu sebab; kebenaran', () => {
  const c = aktif(hari(null, -10), hari(null, 355));
  const { env, admin } = c;
  const idC = cag(env).ID_Cagaran;
  assert.equal(call(env, 'rn.admin.sewaan.tamat', admin, { id: 'SWA-0001', sebab: '' }).error.code, 'RN_CATATAN_WAJIB');
  assert.ok(call(env, 'rn.admin.sewaan.tamat', admin, { id: 'SWA-0001', sebab: 'x', tarikh: hari(env, 5) }).error.extra.medan.tarikh);
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.sewaan.tamat', pem, { id: 'SWA-0001', sebab: 'x' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.cagaran.rampas', pem, { id: idC, sebab: 'x' }).error.code, 'TIADA_KEBENARIAN');
  const r = call(env, 'rn.admin.cagaran.rampas', admin, { id: idC, sebab: 'Melanggar syarat perjanjian' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(cag(env).Status, 'Dirampas');
  assert.equal(cag(env).Jumlah_Pulang_RM, 0);
  assert.equal(call(env, 'rn.admin.cagaran.rampas', admin, { id: idC, sebab: 'x' }).error.code, 'RN_CAGARAN_STATUS');
});
