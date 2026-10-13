'use strict';
const test = require('node:test');
const { ready, call, login, student, profiled, setCfg, SSU, PDF, b64, TEMPLAT_SIJIL, assert } = require('./helpers');

const AINA = 'aina.contoh@graduate.utm.my';
const AMIRUL = 'amirul.contoh@graduate.utm.my';
const WEIJIE = 'weijie.contoh@graduate.utm.my';
const ADMIN = 'utmxcite@utm.my';

const rows = (env, tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));
const setRow = (env, tab, keyCol, key, patch) => env.run(`(function(){ var r = Db.find(${JSON.stringify(tab)}, function(x){ return String(x[${JSON.stringify(keyCol)}])===${JSON.stringify(key)}; })[0]; Db.update(${JSON.stringify(tab)}, r._row, ${JSON.stringify(patch)}); })()`);

function addAdmin(env, adminTok, emel, peranan, modul) {
  const r = call(env, 'admin.tambah', adminTok, { emel, nama: 'Pegawai Contoh', peranan, modul });
  assert.equal(r.ok, true, JSON.stringify(r));
}

/** Persekitaran: aina (profil siap) memohon SSU. */
function submitted(opts) {
  opts = opts || {};
  const env = ready();
  const aina = profiled(env, AINA);
  const admin = login(env, ADMIN).token;
  const r = call(env, 'ssu.hantar', aina, opts.payload || SSU());
  assert.equal(r.ok, true, JSON.stringify(r));
  return { env, aina, admin, id: r.data.id };
}

test('SSU: mesti melengkapkan profiling dahulu', () => {
  const env = ready();
  const t = student(env, AINA);
  const r = call(env, 'ssu.hantar', t, SSU());
  assert.equal(r.error.code, 'PROFIL_LENGKAP_DULU');
  assert.equal(call(env, 'ssu.saya', t).data.boleh.mohonBaharu, false);
});

test('SSU: hantar sah mencipta permohonan Baharu, ahli, fail dan emel pengesahan', () => {
  const { env, aina, id } = submitted();
  assert.match(id, /^SSU-\d{4}-0001$/);
  const p = rows(env, 'Permohonan_SSU')[0];
  assert.equal(p.Status, 'Baharu');
  assert.equal(p.Nama_Perniagaan, 'SENI KEK AINA');
  assert.equal(p.No_Matrik_Pemilik, 'A23UJ0001');
  assert.equal(p.Bil_Ahli, 2);
  assert.equal(p.Modal_RM, 1500);
  assert.equal(p.Pendapatan_Bulanan_RM, 2000.5);
  assert.equal(p.Jenis_Permohonan, 'Baharu');
  assert.match(p.Fail_SSM, /drive\.google\.com\/file\/d\//);
  const ahli = rows(env, 'Ahli_Pasukan');
  assert.deepEqual(ahli.map((a) => a.Peranan_Ahli + ':' + a.No_Matrik), ['Pemilik:A23UJ0001', 'Ahli:A23UJ0002']);
  assert.equal(ahli[1].Nama, 'AMIRUL HAKIM BIN ROSLI');
  const m = env.sentTo(AINA).filter((x) => /Permohonan SSU diterima/.test(x.subject));
  assert.equal(m.length, 1);
  const s = call(env, 'ssu.saya', aina).data;
  assert.equal(s.permohonan[0].status, 'Baharu');
  assert.equal(s.boleh.mohonBaharu, false);
  // fail disimpan dalam folder lampiran SSU
  const folderId = env.plain(env.run(`Db.links().FLD_LAMPIRAN_SSU.id`));
  assert.equal(env.state.folders[folderId].children.length, 1);
});

test('SSU: pengesahan medan (nama UTM, alamat kolej, SSM tanpa fail, fail palsu, RM, ahli)', () => {
  const env = ready();
  const aina = profiled(env, AINA);
  const bad = Object.assign(SSU(), {
    nama: 'Kedai UTM Mart', alamat: 'Kolej Tun Fatimah, UTM Skudai', failSsm: null, modal: 'RM abc', pendapatan: '-5',
    ahli: ['A23UJ0001', 'A23UJ0002', 'A23UJ0002', 'ZZ99999'], syaratSubjek: 'UBSS1032', pensyarah: '', perakuan: false, produk: [], kluster: 'XX', tarikhMula: ''
  });
  const r = call(env, 'ssu.hantar', aina, bad);
  assert.equal(r.error.code, 'SSU_TIDAK_SAH');
  const m = r.error.extra.medan;
  ['nama', 'alamat', 'failSsm', 'modal', 'pendapatan', 'ahli', 'pensyarah', 'perakuan', 'produk', 'kluster', 'tarikhMula'].forEach((k) => assert.ok(m[k], 'ralat dijangka pada ' + k + ': ' + JSON.stringify(m)));
  assert.equal(rows(env, 'Permohonan_SSU').length, 0);
  // fail palsu: teks dengan sambungan .pdf
  let p = Object.assign(SSU(), { failSsm: { nama: 'ssm.pdf', data: b64('ini bukan pdf') } });
  assert.ok(call(env, 'ssu.hantar', aina, p).error.extra.medan.failSsm);
  // sambungan tidak dibenarkan
  p = Object.assign(SSU(), { failSsm: { nama: 'ssm.exe', data: b64('%PDF-1.4') } });
  assert.ok(call(env, 'ssu.hantar', aina, p).error.extra.medan.failSsm);
  // saiz melebihi had
  setCfg(env, 'MAKS_SAIZ_FAIL_MB', '0.0001');
  p = Object.assign(SSU(), { failSsm: { nama: 'ssm.pdf', data: b64('%PDF-1.4' + 'x'.repeat(500)) } });
  assert.ok(call(env, 'ssu.hantar', aina, p).error.extra.medan.failSsm);
  setCfg(env, 'MAKS_SAIZ_FAIL_MB', '10');
  // had ahli
  setCfg(env, 'MAKS_AHLI_SSU', '2');
  p = Object.assign(SSU(), { ahli: ['A23UJ0002', 'A22UJ0003'] });
  assert.ok(call(env, 'ssu.hantar', aina, p).error.extra.medan.ahli);
  setCfg(env, 'MAKS_AHLI_SSU', '12');
  // SSM Tidak/Dalam proses tidak perlu fail
  p = Object.assign(SSU(), { statusSsm: 'PROSES', failSsm: null, noSsm: '' });
  assert.equal(call(env, 'ssu.hantar', aina, p).ok, true);
});

test('SSU: satu permohonan aktif bagi satu pemilik, dan nama tidak boleh sama', () => {
  const { env, aina } = submitted();
  assert.equal(call(env, 'ssu.hantar', aina, SSU()).error.code, 'SSU_SUDAH_ADA');
  const amirul = profiled(env, AMIRUL);
  const p = SSU(); p.ahli = [];
  const r = call(env, 'ssu.hantar', amirul, p); // nama sama dengan permohonan aktif lain
  assert.equal(r.error.code, 'SSU_TIDAK_SAH');
  assert.ok(r.error.extra.medan.nama);
  p.nama = 'Kek Amirul';
  assert.equal(call(env, 'ssu.hantar', amirul, p).ok, true);
  // ahli melihat SSU yang disertai (baca sahaja)
  const aminS = call(env, 'ssu.saya', amirul).data;
  assert.equal(aminS.sertaan.length, 1);
  assert.equal(aminS.sertaan[0].pemilik, 'NURUL AINA BINTI HASSAN');
  assert.equal(aminS.sertaan[0].bolehUbah, false);
});

test('SSU admin: senarai, butiran dengan amaran, kebenaran', () => {
  const { env, aina, admin, id } = submitted({ payload: Object.assign(SSU(), { statusSsm: 'PROSES', failSsm: null, noSsm: '' }) });
  let r = call(env, 'ssu.admin.senarai', admin, {});
  assert.equal(r.ok, true);
  assert.equal(r.data.kiraan.Baharu, 1);
  assert.equal(r.data.senarai[0].pemilik, 'NURUL AINA BINTI HASSAN');
  assert.equal(call(env, 'ssu.admin.senarai', admin, { status: 'Ditolak' }).data.senarai.length, 0);
  assert.equal(call(env, 'ssu.admin.senarai', admin, { q: 'kek' }).data.senarai.length, 1);
  r = call(env, 'ssu.admin.butiran', admin, { id });
  assert.equal(r.ok, true);
  assert.equal(r.data.pemilik.noKp, '010101-01-0001', 'Admin Penuh nampak No. KP');
  assert.ok(r.data.amaran.some((a) => /SSM/.test(a)));
  assert.deepEqual(r.data.label.produk, ['Makanan dan Minuman']);
  // pelajar tidak boleh ke API admin
  assert.equal(call(env, 'ssu.admin.senarai', aina, {}).error.code, 'TIADA_KEBENARIAN');
  // Pegawai Modul tidak nampak No. KP; Penilai ditolak
  addAdmin(env, admin, 'pegawai@utm.my', 'Pegawai Modul', 'Semua');
  addAdmin(env, admin, 'penilai@utm.my', 'Penilai', '');
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'ssu.admin.butiran', peg, { id }).data.pemilik.noKp, undefined);
  const pen = login(env, 'penilai@utm.my').token;
  assert.equal(call(env, 'ssu.admin.senarai', pen, {}).error.code, 'TIADA_KEBENARIAN');
});

test('SSU admin: Pegawai Modul hanya boleh memutuskan jika modulnya SSU atau Semua; Pemerhati baca sahaja', () => {
  const { env, admin, id } = submitted();
  addAdmin(env, admin, 'pegawai@utm.my', 'Pegawai Modul', 'Makerspace');
  addAdmin(env, admin, 'pemerhati@utm.my', 'Pemerhati', '');
  const peg = login(env, 'pegawai@utm.my').token;
  assert.equal(call(env, 'ssu.admin.putus', peg, { id, tindakan: 'semak' }).error.code, 'TIADA_KEBENARIAN');
  const mer = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'ssu.admin.butiran', mer, { id }).data.bolehPutus, false);
  assert.equal(call(env, 'ssu.admin.putus', mer, { id, tindakan: 'semak' }).error.code, 'TIADA_KEBENARIAN');
  call(env, 'admin.tambah', admin, { emel: 'pegawai@utm.my', nama: 'P', peranan: 'Pegawai Modul', modul: 'SSU, Ruang Niaga' });
  env.advance(61); // cache admin 60s
  assert.equal(call(env, 'ssu.admin.putus', peg, { id, tindakan: 'semak' }).ok, true);
});

test('SSU: aliran pembetulan (catatan wajib, edit, hantar semula) dan tolak (boleh mohon semula)', () => {
  const { env, aina, admin, id } = submitted();
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: '' }).error.code, 'SSU_CATATAN_WAJIB');
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'semak' }).data.status, 'Disemak');
  let r = call(env, 'ssu.admin.putus', admin, { id, tindakan: 'pembetulan', catatan: 'Sila lampirkan sijil SSM yang jelas.' });
  assert.equal(r.data.status, 'Perlu Pembetulan');
  assert.equal(env.sentTo(AINA).filter((x) => /perlu dibetulkan/.test(x.subject)).length, 1);
  const s = call(env, 'ssu.saya', aina).data.permohonan[0];
  assert.equal(s.status, 'Perlu Pembetulan');
  assert.equal(s.catatan, 'Sila lampirkan sijil SSM yang jelas.');
  assert.equal(s.bolehUbah, true);
  // lulus tidak sah dari Perlu Pembetulan
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus' }).error.code, 'SSU_PERALIHAN_TIDAK_SAH');
  // pelajar edit: borang dimuatkan dengan data sedia ada
  const d = call(env, 'ssu.dapat', aina, { id }).data;
  assert.equal(d.borang.nama, 'SENI KEK AINA');
  assert.equal(d.borang.failSsmAda, true);
  const upd = Object.assign(SSU(), { id, nama: 'Seni Kek Aina Enterprise', failSsm: null });
  r = call(env, 'ssu.hantar', aina, upd);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.id, id);
  assert.equal(rows(env, 'Permohonan_SSU').length, 1);
  assert.equal(rows(env, 'Permohonan_SSU')[0].Status, 'Baharu');
  assert.equal(rows(env, 'Permohonan_SSU')[0].Nama_Perniagaan, 'SENI KEK AINA ENTERPRISE');
  // tidak boleh ubah selepas status Baharu
  assert.equal(call(env, 'ssu.hantar', aina, upd).error.code, 'SSU_TIDAK_BOLEH_UBAH');
  // tolak, lalu pelajar boleh mohon semula
  r = call(env, 'ssu.admin.putus', admin, { id, tindakan: 'tolak', catatan: 'Tidak memenuhi syarat.' });
  assert.equal(r.data.status, 'Ditolak');
  assert.equal(call(env, 'ssu.saya', aina).data.boleh.mohonBaharu, true);
  const n = SSU(); n.nama = 'Kek Aina Baharu';
  assert.equal(call(env, 'ssu.hantar', aina, n).ok, true);
  assert.equal(rows(env, 'Permohonan_SSU').length, 2);
});

test('SSU: kelulusan mencipta Perniagaan, nombor sijil, sijil PDF daripada templat, dan emel', () => {
  const { env, aina, admin, id } = submitted();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const r = call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus', catatan: 'Lengkap.' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.amaranSijil, []);
  const tahun = String(new Date().getFullYear());
  const per = rows(env, 'Perniagaan')[0];
  assert.equal(per.ID_Perniagaan, 'PRN-0001');
  assert.equal(per.No_Pendaftaran, `XCITE-${tahun}S00001-01`);
  assert.equal(per.Bil_Sijil, 1);
  assert.equal(per.Status_SSU, 'Aktif');
  assert.equal(per.No_Matrik_Pemilik, 'A23UJ0001');
  assert.equal(per.No_SSM, '202603001234');
  const p = rows(env, 'Permohonan_SSU')[0];
  assert.equal(p.Status, 'Diluluskan');
  assert.equal(p.ID_Perniagaan, 'PRN-0001');
  assert.equal(p.Diluluskan_Oleh, ADMIN);
  assert.ok(p.Pautan_Sijil);
  // tarikh tamat = tarikh daftar + 12 bulan
  const k = env.run(`Util.dateKey(Db.rows('Perniagaan')[0].Tarikh_Tamat)`);
  const d0 = env.run(`Util.dateKey(Db.rows('Perniagaan')[0].Tarikh_Pendaftaran)`);
  assert.equal(Number(k.substr(0, 4)), Number(d0.substr(0, 4)) + 1);
  assert.equal(k.substr(5), d0.substr(5));

  // muat turun sijil: pemilik dan ahli boleh; pelajar lain tidak
  const dl = call(env, 'ssu.fail', aina, { id, jenis: 'sijil' });
  assert.equal(dl.ok, true, JSON.stringify(dl));
  const pdf = Buffer.from(dl.data.data, 'base64').toString('utf8');
  assert.match(pdf, /^%PDF/);
  assert.match(pdf, new RegExp(`NO. PENDAFTARAN : XCITE-${tahun}S00001-01`));
  assert.match(pdf, /^\s*SENI KEK AINA$/m);
  assert.match(pdf, /1\. NURUL AINA BINTI HASSAN\n2\. AMIRUL HAKIM BIN ROSLI/);
  assert.match(pdf, /Jumlah Ahli : 2 ORANG/);
  assert.match(pdf, /Kod Pendaftaran Subjek : UBSS1032/);
  assert.match(pdf, /beralamat di No 12, Jalan Mawar, Taman Universiti, 81300 Skudai, Johor\./);
  assert.match(pdf, /telah didaftarkan pada \d{1,2} (Januari|Februari|Mac|April|Mei|Jun|Julai|Ogos|September|Oktober|November|Disember) \d{4}/);
  assert.ok(!/\[[a-z_]+\]/.test(pdf), 'tiada penanda tertinggal');
  const amirul = student(env, AMIRUL);
  assert.equal(call(env, 'ssu.fail', amirul, { id, jenis: 'sijil' }).ok, true);
  assert.equal(call(env, 'ssu.fail', amirul, { id, jenis: 'ssm' }).error.code, 'TIADA_KEBENARIAN', 'ahli tidak boleh muat turun lampiran SSM');
  const weijie = student(env, WEIJIE);
  assert.equal(call(env, 'ssu.fail', weijie, { id, jenis: 'sijil' }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'ssu.fail', aina, { id, jenis: 'ssm' }).ok, true);
  assert.equal(call(env, 'ssu.fail', aina, { id, jenis: 'tiada' }).error.code, 'FAIL_TIDAK_DITEMUI');
  // salinan sementara dipadam; tinggal satu PDF sijil dalam folder sijil
  const fid = env.plain(env.run(`Db.links().FLD_SIJIL_SSU.id`));
  const kids = env.state.folders[fid].children.map((c) => c.file).filter((f) => !f.trashed);
  assert.equal(kids.length, 1);
  assert.match(kids[0].name, /^Sijil SSU XCITE-\d{4}S00001-01\.pdf$/);
  // emel: pemilik dan ahli dimaklumkan
  assert.equal(env.sentTo(AINA).filter((x) => /diluluskan/.test(x.subject)).length, 1);
  assert.equal(env.sentTo(AMIRUL).filter((x) => /diluluskan/.test(x.subject)).length, 1);
  // pelajar melihat perniagaan
  const s = call(env, 'ssu.saya', aina).data;
  assert.equal(s.perniagaan.noPendaftaran, `XCITE-${tahun}S00001-01`);
  assert.equal(s.perniagaan.status, 'Aktif');
  assert.equal(s.boleh.perbaharui, false);
  assert.equal(s.boleh.mohonBaharu, false);
  // lulus kali kedua tidak sah
  assert.equal(call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus' }).error.code, 'SSU_PERALIHAN_TIDAK_SAH');
});

test('SSU: kelulusan berjaya walaupun templat tiada; sijil dijana kemudian; penanda tidak dikenali dilaporkan', () => {
  const { env, admin, id } = submitted();
  let r = call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Diluluskan');
  assert.equal(r.data.amaranSijil.length, 1);
  assert.match(r.data.amaranSijil[0], /Templat sijil/);
  assert.equal(r.data.fail.sijil, false);
  assert.equal(rows(env, 'Perniagaan').length, 1);
  assert.equal(env.sentTo('aina.contoh@graduate.utm.my').filter((x) => /diluluskan/.test(x.subject)).length, 1, 'emel kelulusan tetap dihantar');
  // templat didaftar tetapi ada penanda tidak dikenali
  env.addSijilTemplate(TEMPLAT_SIJIL + '\nPengesahan: [kod_qr] dan {{CAP_MASA}}');
  r = call(env, 'ssu.admin.sijil', admin, { id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.fail.sijil, true);
  assert.match(r.data.amaranSijil[0], /\[kod_qr\]/);
  assert.match(r.data.amaranSijil[0], /\{\{CAP_MASA\}\}/);
  // jana semula menggantikan sijil lama (yang lama dialihkan ke tong sampah)
  call(env, 'ssu.admin.sijil', admin, { id });
  const fid = env.plain(env.run(`Db.links().FLD_SIJIL_SSU.id`));
  const kids = env.state.folders[fid].children.filter((c) => c.file);
  assert.equal(kids.filter((c) => !c.file.trashed).length, 1);
  assert.equal(kids.filter((c) => c.file.trashed && /^Sijil SSU/.test(c.file.name)).length, 1, 'versi pertama dialihkan ke tong sampah');
});

test('SSU: sijil dengan templat tidak boleh diakses melaporkan ralat jelas', () => {
  const { env, admin, id } = submitted();
  const tid = env.addSijilTemplate(TEMPLAT_SIJIL);
  env.state.files[tid].denied = true;
  const r = call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus' });
  assert.equal(r.ok, true);
  assert.match(r.data.amaranSijil[0], /kebenaran akaun pelaksana/);
});

test('SSU: pembaharuan (tetingkap, borang awal, nombor asal + akhiran -02, tamat dilanjutkan)', () => {
  const { env, aina, admin, id } = submitted();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus' });
  const per0 = rows(env, 'Perniagaan')[0];
  // di luar tetingkap 60 hari
  let s = call(env, 'ssu.saya', aina).data;
  assert.equal(s.boleh.perbaharui, false);
  assert.equal(call(env, 'ssu.hantar', aina, Object.assign(SSU(), { perniagaanId: per0.ID_Perniagaan })).error.code, 'SSU_TIDAK_BOLEH_PERBAHARUI');
  // laraskan tarikh tamat kepada 20 hari lagi
  const tamat = env.run(`Util.dateKey(new Date(new Date().getTime() + 20*86400000))`);
  setRow(env, 'Perniagaan', 'ID_Perniagaan', 'PRN-0001', { Tarikh_Tamat: env.run(`Util.toDate(${JSON.stringify(tamat)})`) });
  s = call(env, 'ssu.saya', aina).data;
  assert.equal(s.perniagaan.hariBaki, 20);
  assert.equal(s.boleh.perbaharui, true);
  // borang diisi awal daripada permohonan terdahulu
  const pre = call(env, 'ssu.dapat', aina, { perniagaanId: 'PRN-0001' }).data.borang;
  assert.equal(pre.nama, 'SENI KEK AINA');
  assert.equal(pre.jenisPermohonan, 'Pembaharuan');
  assert.equal(pre.id, '');
  // hantar pembaharuan (nama sendiri tidak dianggap pendua; fail SSM lama digunakan semula)
  const p = Object.assign(SSU(), { perniagaanId: 'PRN-0001', failSsm: null, alamat: 'No 99, Jalan Melur, Taman Universiti, 81300 Skudai, Johor' });
  const r = call(env, 'ssu.hantar', aina, p);
  assert.equal(r.ok, true, JSON.stringify(r));
  const baru = rows(env, 'Permohonan_SSU')[1];
  assert.equal(baru.Jenis_Permohonan, 'Pembaharuan');
  assert.equal(baru.ID_Perniagaan, 'PRN-0001');
  assert.ok(baru.Fail_SSM);
  // satu permohonan aktif sahaja
  assert.equal(call(env, 'ssu.hantar', aina, p).error.code, 'SSU_SUDAH_ADA');
  const res = call(env, 'ssu.admin.putus', admin, { id: r.data.id, tindakan: 'lulus' });
  assert.equal(res.ok, true, JSON.stringify(res));
  const per = rows(env, 'Perniagaan')[0];
  assert.equal(rows(env, 'Perniagaan').length, 1, 'tiada perniagaan berganda');
  assert.equal(per.No_Pendaftaran, per0.No_Pendaftaran.replace(/-01$/, '-02'));
  assert.equal(per.Bil_Sijil, 2);
  assert.equal(per.Alamat, 'No 99, Jalan Melur, Taman Universiti, 81300 Skudai, Johor');
  const k = env.run(`Util.dateKey(Db.rows('Perniagaan')[0].Tarikh_Tamat)`);
  assert.equal(k, env.run(`Util.dateKey(Util.addMonths(Util.toDate(${JSON.stringify(tamat)}), 12))`), 'dilanjutkan 12 bulan daripada tarikh tamat lama');
  assert.equal(per.Status_SSU, 'Aktif');
  const pdf = Buffer.from(call(env, 'ssu.fail', aina, { id: r.data.id, jenis: 'sijil' }).data.data, 'base64').toString('utf8');
  assert.match(pdf, /S00001-02/);
});

test('SSU: SSU tamat tempoh ditandakan oleh kerja harian; peringatan 60/30/7 hari dihantar sekali sahaja', () => {
  const { env, aina, admin, id } = submitted();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  call(env, 'ssu.admin.putus', admin, { id, tindakan: 'lulus' });
  const setTamat = (hari) => setRow(env, 'Perniagaan', 'ID_Perniagaan', 'PRN-0001', { Tarikh_Tamat: env.run(`Util.toDate(Util.dateKey(new Date(new Date().getTime() + (${hari})*86400000)))`) });
  const reminders = () => env.sentTo(AINA).filter((x) => /Peringatan pembaharuan SSU/.test(x.subject)).length;
  const job = () => env.plain(env.run('Jobs.harian()')).ssu;
  setTamat(100);
  assert.deepEqual(job(), { tamat: 0, peringatan: 0 });
  setTamat(55);
  assert.equal(job().peringatan, 1);
  assert.equal(job().peringatan, 0, 'tidak berulang pada peringkat sama');
  setTamat(25);
  assert.equal(job().peringatan, 1);
  setTamat(6);
  assert.equal(job().peringatan, 1);
  assert.equal(reminders(), 3);
  assert.equal(rows(env, 'Peringatan').length, 3);
  setTamat(-2);
  let j = job();
  assert.equal(j.tamat, 1);
  assert.equal(rows(env, 'Perniagaan')[0].Status_SSU, 'Tamat Tempoh');
  assert.equal(env.sentTo(AINA).filter((x) => /telah tamat tempoh/.test(x.subject)).length, 1);
  assert.equal(job().tamat, 0, 'hanya sekali');
  // pelajar masih boleh memperbaharui; permohonan baharu disekat
  const s = call(env, 'ssu.saya', aina).data;
  assert.equal(s.perniagaan.status, 'Tamat Tempoh');
  assert.equal(s.boleh.perbaharui, true);
  assert.equal(s.boleh.mohonBaharu, false);
  // dashboard admin menyenaraikan SSU hampir/telah tamat
  const lst = call(env, 'ssu.admin.senarai', admin, {}).data.hampirTamat;
  assert.equal(lst.length, 1);
  assert.equal(lst[0].status, 'Tamat Tempoh');
});

test('SSU: admin daftar SSU sedia ada (terus diluluskan, tarikh daftar lampau, tanpa emel secara lalai)', () => {
  const env = ready();
  const admin = login(env, ADMIN).token;
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const p = {
    noMatrik: 'A22UJ0003', nama: 'weijie trading', alamat: 'Lot 5, Jalan Industri, 81300 Skudai, Johor', jenisPerniagaan: 'PARTNER', kluster: 'RETAIL',
    tarikhDaftar: '2025-01-15', ahli: ['A23UJ0001']
  };
  let r = call(env, 'ssu.admin.sedia', admin, Object.assign({}, p, { noMatrik: 'XX00000' }));
  assert.equal(r.error.code, 'SSU_TIDAK_SAH');
  r = call(env, 'ssu.admin.sedia', admin, Object.assign({}, p, { tarikhDaftar: '2999-01-01' }));
  assert.ok(r.error.extra.medan.tarikhDaftar);
  r = call(env, 'ssu.admin.sedia', admin, p);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Diluluskan');
  assert.equal(r.data.ringkas.jenisPermohonan, 'Sedia ada');
  assert.equal(r.data.diluluskanOleh, ADMIN + ' (sedia ada)');
  const per = rows(env, 'Perniagaan')[0];
  assert.equal(per.Status_SSU, 'Tamat Tempoh', '15 Jan 2025 + 12 bulan sudah lepas');
  assert.match(per.No_Pendaftaran, /^XCITE-2025S00001-01$/);
  assert.equal(env.run(`Util.dateKey(Db.rows('Perniagaan')[0].Tarikh_Tamat)`), '2026-01-15');
  assert.equal(env.state.sent.filter((m) => /diluluskan/.test(m.subject)).length, 0, 'tiada emel secara lalai');
  // pemilik sama tidak boleh didaftar dua kali
  assert.equal(call(env, 'ssu.admin.sedia', admin, Object.assign({}, p, { nama: 'lain' })).error.code, 'SSU_SUDAH_ADA');
  // pemilik log masuk dan melihat SSU-nya (tamat tempoh, boleh perbaharui)
  const w = student(env, WEIJIE);
  const s = call(env, 'ssu.saya', w).data;
  assert.equal(s.perniagaan.status, 'Tamat Tempoh');
  assert.equal(s.boleh.perbaharui, true);
});

test('SSU: pasangPencetus memasang satu pencetus harian dan selamat diulang', () => {
  const env = ready();
  env.run('pasangPencetus()');
  env.run('pasangPencetus()');
  assert.equal(env.state.triggers.length, 1);
  assert.equal(env.state.triggers[0].fn, 'jobHarian');
  assert.equal(env.state.triggers[0].hour, 7);
});

test('Setup: pemasangan sedia ada menerima kumpulan Rujukan baharu tanpa mengubah yang lama', () => {
  const env = ready();
  env.run(`(function(){
    var keep = Db.rows('Rujukan').filter(function(r){ return r.Kumpulan !== 'NEGERI' && r.Kumpulan !== 'ALIRAN'; });
    keep[0].BM = 'DIUBAH PENGGUNA';
    Db.replaceAll('Rujukan', keep); Ref.invalidate();
  })()`);
  assert.equal(env.run(`Ref.list('NEGERI').length`), 0);
  env.run('Setup.run()');
  assert.equal(env.run(`Ref.list('NEGERI').length`), 17);
  assert.equal(env.run(`Ref.list('ALIRAN').length`), 4);
  assert.equal(env.run(`Db.rows('Rujukan')[0].BM`), 'DIUBAH PENGGUNA');
});

test('Util: tarikh BM, tambah bulan, hari antara, nombor sijil, RM', () => {
  const env = ready();
  assert.equal(env.run(`Util.fmtTarikhBM(Util.toDate('2026-10-13'))`), '13 Oktober 2026');
  assert.equal(env.run(`Util.dateKey(Util.addMonths(Util.toDate('2026-01-31'), 1))`), '2026-02-28');
  assert.equal(env.run(`Util.dateKey(Util.addMonths(Util.toDate('2026-10-13'), 12))`), '2027-10-13');
  assert.equal(env.run(`Util.daysBetween(Util.toDate('2026-10-13'), Util.toDate('2026-12-12'))`), 60);
  assert.equal(env.run(`Util.noSijil('XCITE', 2026, 1, 1)`), 'XCITE-2026S00001-01');
  assert.equal(env.run(`Util.parseRm('RM 1,234.50')`), 1234.5);
  assert.equal(env.run(`Util.parseRm('12.345')`), null);
  assert.equal(env.run(`Util.parseRm('-1')`), null);
});
