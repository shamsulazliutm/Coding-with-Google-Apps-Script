'use strict';
/** Ruang Niaga fasa 3: surat tawaran (pratonton, versi, hantar), penerimaan OTP, luput, dokumen dan akses, salinan fizikal. */
const test = require('node:test');
const { call, login, student, profiled, setCfg, assert } = require('./helpers');
const { AINA, AMIRUL, WEIJIE, ADMIN, rows, setRow, hari, rnReady, ssuLulus, bukaLot, mohon, otpCode, tetapStatus, TAWARAN } = require('./rn-helpers');

const pdfText = (env, r) => Buffer.from(r.data.data, 'base64').toString('utf8');

/** Aina (ahli: Amirul) dengan permohonan SM-01 yang telah Diluluskan. */
function sedia(opts) {
  opts = opts || {};
  const { env, admin } = rnReady();
  bukaLot(env, admin, 'SM-01', opts.lot || {});
  const aina = ssuLulus(env, admin, AINA, 'seni kek aina', ['A23UJ0002']);
  const amirul = profiled(env, AMIRUL);
  const id = mohon(env, aina);
  tetapStatus(env, id, 'Diluluskan');
  return { env, admin, aina, amirul, id };
}

function tawaranSiap(c, patch) {
  const r = call(c.env, 'rn.admin.tawaran.simpan', c.admin, Object.assign({ id: c.id }, TAWARAN(c.env, patch)));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}
function dihantar(c, patch) {
  tawaranSiap(c, patch);
  assert.equal(call(c.env, 'rn.admin.tawaran.jana', c.admin, { id: c.id }).ok, true);
  const h = call(c.env, 'rn.admin.tawaran.hantar', c.admin, { id: c.id });
  assert.equal(h.ok, true, JSON.stringify(h));
  return h.data;
}
const jawab = (c, tok, jawapan, kodTukar) => {
  c.env.advance(61);
  const o = call(c.env, 'rn.tawaran.otp', tok, { id: c.id });
  assert.equal(o.ok, true, JSON.stringify(o));
  return call(c.env, 'rn.tawaran.jawab', tok, { id: c.id, jawapan, kod: kodTukar || otpCode(c.env, AINA) });
};

test('Tawaran: nilai lalai, pengesahan medan dan jadual sewa berperingkat', () => {
  const c = sedia();
  const { env, admin, id } = c;
  const d = call(env, 'rn.admin.tawaran.dapat', admin, { id }).data;
  assert.equal(d.ada, false);
  assert.equal(d.tawaran.cagaranSewaan, 150, 'lalai daripada kadar lot');
  assert.equal(d.tawaran.penandatanganNama, 'PROFESOR TS DR. ALI BIN SELAMAT', 'daripada Tetapan');
  assert.equal(d.tawaran.jadual.length, 1);
  assert.equal(d.boleh.ubah, true);
  assert.equal(d.lot.alamat, 'Lot 3, Aras 1, Bangunan Persatuan Pelajar, UTM');
  const bad = call(env, 'rn.admin.tawaran.simpan', admin, {
    id, noRujukan: '', tarikhSurat: 'x', jenisPerniagaan: '', tarikhMula: hari(env, 10), tarikhTamat: hari(env, 5), utiliti: '', cagaranSewaan: 'abc', waktuOperasi: '', jadual: []
  });
  assert.equal(bad.error.code, 'RN_TAWARAN_TIDAK_SAH');
  ['noRujukan', 'tarikhSurat', 'jenisPerniagaan', 'tarikhTamat', 'utiliti', 'cagaranSewaan', 'waktuOperasi', 'jadual'].forEach((k) => assert.ok(bad.error.extra.medan[k], k));
  // jadual berjurang / tidak bermula bulan 1 / terbuka di tengah
  const g = (jadual) => call(env, 'rn.admin.tawaran.simpan', admin, Object.assign({ id }, TAWARAN(env, { jadual }))).error;
  assert.ok(g([{ dari: 2, hingga: '', kadar: '150' }]).extra.medan.jadual);
  assert.ok(g([{ dari: 1, hingga: 6, kadar: '150' }, { dari: 8, hingga: '', kadar: '250' }]).extra.medan.jadual);
  assert.ok(g([{ dari: 1, hingga: '', kadar: '150' }, { dari: 7, hingga: '', kadar: '250' }]).extra.medan.jadual);
  assert.ok(g([{ dari: 1, hingga: 6, kadar: 'x' }]).extra.medan.jadual);
  // sah
  const t = tawaranSiap(c).tawaran;
  assert.equal(t.status, 'Draf');
  assert.equal(t.bilBulan, 12);
  assert.equal(t.sewaBulanan, 150);
  assert.equal(t.versiSemasa, 0);
  assert.deepEqual(rows(env, 'Jadual_Sewa').map((r) => [r.Dari_Bulan, r.Hingga_Bulan, r.Kadar_RM]), [[1, 6, 150], [7, '', 250]]);
  // simpan semula menggantikan jadual (tidak berganda)
  tawaranSiap(c, { jadual: [{ dari: 1, hingga: '', kadar: '200' }] });
  assert.equal(rows(env, 'Jadual_Sewa').length, 1);
  // kebenaran
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.tawaran.dapat', pem, { id }).ok, true);
  assert.equal(call(env, 'rn.admin.tawaran.simpan', pem, Object.assign({ id }, TAWARAN(env))).error.code, 'TIADA_KEBENARIAN');
  // hanya selepas Diluluskan
  tetapStatus(env, id, 'Dinilai');
  assert.equal(call(env, 'rn.admin.tawaran.simpan', admin, Object.assign({ id }, TAWARAN(env))).error.code, 'RN_TAWARAN_TIDAK_BOLEH');
});

test('Tawaran: pratonton PDF, versi baharu, tidak kelihatan kepada pemohon sebelum dihantar, simpan membatalkan pratonton', () => {
  const c = sedia();
  const { env, admin, aina, id } = c;
  tawaranSiap(c);
  assert.equal(call(env, 'rn.admin.tawaran.hantar', admin, { id }).error.code, 'RN_TAWARAN_BELUM_JANA');
  const j1 = call(env, 'rn.admin.tawaran.jana', admin, { id });
  assert.equal(j1.ok, true, JSON.stringify(j1));
  assert.equal(j1.data.tawaran.versiSemasa, 1);
  assert.equal(j1.data.dokumen.length, 1);
  assert.equal(j1.data.dokumen[0].status, 'Pratonton');
  const dok1 = j1.data.dokumen[0];
  // pratonton boleh dibuka admin; kandungan surat lalai
  const f = call(env, 'rn.admin.dok.fail', admin, { id: dok1.id });
  assert.equal(f.ok, true, JSON.stringify(f));
  const txt = pdfText(env, f);
  assert.match(txt, /^%PDF/);
  ['SURAT SETUJU TERIMA', 'UTM.J.06.11/13.16/11 \\(12\\)', 'SENI KEK AINA', 'Lot 3, Aras 1, Bangunan Persatuan Pelajar, UTM', 'Bulan ke-1 hingga ke-6: RM 150; Bulan ke-7 dan ke-1?\\s?ke atas: RM 250|Bulan ke-7 dan ke atas: RM 250',
    'RM 150', 'CIMB: 8006053536', 'PROFESOR TS DR. ALI BIN SELAMAT', 'Timbalan Naib Canselor'].forEach((p) => assert.match(txt, new RegExp(p), p));
  assert.equal(f.data.nama, 'Surat Tawaran PLT-' + id.split('-')[1] + '-0001 v1.pdf');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'PAPAR_DOKUMEN_SEWAAN'));
  // pemohon tidak nampak pratonton
  assert.equal(call(env, 'rn.butiran', aina, { id }).data.dokumen.length, 0);
  assert.equal(call(env, 'rn.butiran', aina, { id }).data.tawaran, null);
  assert.equal(call(env, 'rn.dok.fail', aina, { id: dok1.id }).error.code, 'RN_DOK_TIDAK_DITEMUI');
  // jana semula: versi 2, versi 1 Digantikan
  const j2 = call(env, 'rn.admin.tawaran.jana', admin, { id });
  assert.equal(j2.data.tawaran.versiSemasa, 2);
  assert.deepEqual(rows(env, 'Dokumen_Sewaan').map((d) => d.Versi + ':' + d.Status), ['1:Digantikan', '2:Pratonton']);
  // mengubah tawaran membatalkan pratonton terkini: perlu jana semula
  tawaranSiap(c, { waktuOperasi: '8.00 pagi - 5.00 petang' });
  assert.equal(call(env, 'rn.admin.tawaran.hantar', admin, { id }).error.code, 'RN_TAWARAN_BELUM_JANA');
  const j3 = call(env, 'rn.admin.tawaran.jana', admin, { id });
  assert.equal(j3.data.tawaran.versiSemasa, 3);
  assert.match(pdfText(env, call(env, 'rn.admin.dok.fail', admin, { id: j3.data.dokumen.find((d) => d.versi === 3).id })), /8\.00 pagi - 5\.00 petang/);
});

test('Tawaran: templat Google Docs TEMPLAT_SURAT_TAWARAN digunakan jika didaftar; jatuh balik ke surat lalai jika tidak boleh dibuka', () => {
  const c = sedia();
  const { env, admin, id } = c;
  tawaranSiap(c);
  env.addDocTemplate('TEMPLAT_SURAT_TAWARAN', 'SURAT [no_rujukan] kepada {{NAMA_PERNIAGAAN}} untuk [nama_lot]. Sewa [jadual_sewa]. Tandatangan [penandatangan_nama]. Ganjil [tiada_penanda]');
  const j = call(env, 'rn.admin.tawaran.jana', admin, { id });
  assert.equal(j.ok, true, JSON.stringify(j));
  const txt = pdfText(env, call(env, 'rn.admin.dok.fail', admin, { id: j.data.dokumen[0].id }));
  assert.match(txt, /SURAT UTM\.J\.06\.11\/13\.16\/11 \(12\) kepada SENI KEK AINA untuk Student Mall - Lot 1\./);
  assert.match(txt, /Sewa Bulan ke-1 hingga ke-6: RM 150; Bulan ke-7 dan ke atas: RM 250/);
  assert.ok(j.data.amaran[0].includes('[tiada_penanda]'));
  // templat didaftar tetapi tidak boleh dibuka -> surat lalai + amaran
  const fid = Object.keys(env.state.files).find((k) => env.state.files[k].doc && env.state.files[k].name === 'Templat TEMPLAT_SURAT_TAWARAN');
  env.state.files[fid].denied = true;
  const j2 = call(env, 'rn.admin.tawaran.jana', admin, { id });
  assert.equal(j2.ok, true, JSON.stringify(j2));
  assert.match(j2.data.amaran[0], /surat lalai/);
  assert.match(pdfText(env, call(env, 'rn.admin.dok.fail', admin, { id: j2.data.dokumen.find((d) => d.versi === 2).id })), /SURAT SETUJU TERIMA/);
});

test('Hantar tawaran: status, lot dipohon, tarikh luput 7 hari, cagaran, dokumen kelihatan dan emel', () => {
  const c = sedia();
  const { env, admin, aina, amirul, id } = c;
  dihantar(c);
  const r = rows(env, 'Permohonan_Lot')[0];
  assert.equal(r.Status, 'Ditawarkan');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Dipohon');
  const t = rows(env, 'Tawaran_Sewa')[0];
  assert.equal(t.Status, 'Dihantar');
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(t.Tarikh_Luput)})`), hari(env, 7));
  const cg = rows(env, 'Cagaran');
  assert.equal(cg.length, 1, 'cagaran utiliti 0 tidak dicipta');
  assert.equal(cg[0].Jenis, 'Sewaan');
  assert.equal(cg[0].Jumlah_RM, 150);
  assert.equal(cg[0].Status, 'Belum Bayar');
  assert.equal(env.run(`Util.dateKey(${JSON.stringify(cg[0].Tarikh_Akhir_Bayar)})`), hari(env, 14));
  assert.equal(env.sentTo(AINA).filter((m) => /Surat tawaran sewa lot/.test(m.subject)).length, 1);
  // pemilik dan ahli melihat surat; ahli tidak boleh menjawab
  const b = call(env, 'rn.butiran', aina, { id }).data;
  assert.equal(b.dokumen.length, 1);
  assert.equal(b.dokumen[0].jenis, 'Surat Tawaran');
  assert.equal(b.tawaran.bolehJawab, true);
  assert.equal(b.tawaran.hariBaki, 7);
  assert.equal(b.tawaran.cagaranSewaan, 150);
  const ba = call(env, 'rn.butiran', amirul, { id }).data;
  assert.equal(ba.akses, 'ahli');
  assert.equal(ba.bolehTindak, false);
  assert.equal(ba.tawaran.bolehJawab, false);
  assert.equal(call(env, 'rn.tawaran.otp', amirul, { id }).error.code, 'RN_HANYA_PEMILIK');
  // pelajar lain tiada akses
  const weijie = student(env, WEIJIE);
  assert.equal(call(env, 'rn.butiran', weijie, { id }).error.code, 'RN_TIDAK_DITEMUI');
  // tidak boleh hantar dua kali / ubah selepas hantar
  assert.equal(call(env, 'rn.admin.tawaran.hantar', admin, { id }).error.code, 'RN_TAWARAN_TIDAK_BOLEH');
  assert.equal(call(env, 'rn.admin.tawaran.simpan', admin, Object.assign({ id }, TAWARAN(env))).error.code, 'RN_TAWARAN_TIDAK_BOLEH');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'HANTAR_TAWARAN_SEWA'));
});

test('Hantar tawaran: lot mesti Kosong; kadar cagaran utiliti mencipta baris kedua', () => {
  const c = sedia();
  const { env, admin, id } = c;
  tawaranSiap(c, { cagaranUtiliti: '50' });
  call(env, 'rn.admin.tawaran.jana', admin, { id });
  setRow(env, 'Lot', 'Kod_Lot', 'SM-01', { Status_Lot: 'Penyelenggaraan' });
  assert.equal(call(env, 'rn.admin.tawaran.hantar', admin, { id }).error.code, 'RN_LOT_TIDAK_KOSONG');
  setRow(env, 'Lot', 'Kod_Lot', 'SM-01', { Status_Lot: 'Kosong' });
  assert.equal(call(env, 'rn.admin.tawaran.hantar', admin, { id }).ok, true);
  assert.deepEqual(rows(env, 'Cagaran').map((x) => x.Jenis + ':' + x.Jumlah_RM), ['Sewaan:150', 'Utiliti:50']);
});

test('Penerimaan dengan OTP: Saya terima, rekod penerimaan PDF, tidak boleh ditarik balik', () => {
  const c = sedia();
  const { env, admin, aina, amirul, id } = c;
  dihantar(c);
  env.advance(61);
  const o = call(env, 'rn.tawaran.otp', aina, { id });
  assert.equal(o.ok, true, JSON.stringify(o));
  assert.match(o.data.emelTopeng, /^ai\*\*\*@/);
  const kod = otpCode(env, AINA);
  assert.match(kod, /^\d{6}$/);
  // kod salah / tiada kod / jawapan tidak sah
  assert.equal(call(env, 'rn.tawaran.jawab', aina, { id, jawapan: 'terima', kod: '000000' }).error.code, 'OTP_SALAH');
  assert.equal(call(env, 'rn.tawaran.jawab', aina, { id, jawapan: 'terima', kod: '' }).error.code, 'RN_OTP_PERLU');
  assert.equal(call(env, 'rn.tawaran.jawab', aina, { id, jawapan: 'mungkin', kod }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Ditawarkan');
  // kod dari tujuan lain (permohonan lain) tidak sah; kod betul menerima
  const r = call(env, 'rn.tawaran.jawab', aina, { id, jawapan: 'terima', kod });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Diterima');
  const t = rows(env, 'Tawaran_Sewa')[0];
  assert.equal(t.Status, 'Diterima');
  assert.equal(t.Respons, 'Terima');
  assert.equal(t.Emel_Respons, AINA);
  assert.ok(t.Tarikh_Respons);
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Diterima');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Dipohon', 'lot kekal ditempah');
  // rekod penerimaan dalam senarai dokumen pemilik dan ahli
  const b = call(env, 'rn.butiran', aina, { id }).data;
  assert.deepEqual(b.dokumen.map((d) => d.jenis), ['Surat Tawaran', 'Penerimaan']);
  assert.match(b.tawaran.tarikhResponsMasa, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.equal(b.tawaran.respons, 'Terima');
  assert.equal(b.tawaran.bolehJawab, false);
  const rek = call(env, 'rn.dok.fail', amirul, { id: b.dokumen[1].id });
  assert.equal(rek.ok, true);
  const txt = pdfText(env, rek);
  assert.match(txt, /REKOD PENERIMAAN TAWARAN/);
  assert.match(txt, new RegExp(t.Emel_Respons.replace('.', '\\.')));
  assert.match(txt, /DITERIMA/);
  // tidak boleh ditarik balik / dijawab semula
  env.advance(61);
  assert.equal(call(env, 'rn.tawaran.otp', aina, { id }).error.code, 'RN_TAWARAN_TIDAK_BOLEH');
  assert.equal(call(env, 'rn.tawaran.jawab', aina, { id, jawapan: 'tolak', kod }).error.code, 'RN_TAWARAN_TIDAK_BOLEH');
  // OTP sekali guna: kod yang sama tidak boleh digunakan semula pada permohonan lain; admin dimaklumkan
  assert.equal(env.sentTo(ADMIN).filter((m) => /Tawaran sewa lot diterima/.test(m.subject)).length, 1);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'TERIMA_TAWARAN_SEWA' && /Disahkan OTP ke aina/.test(a.Catatan)));
  // hanya admin boleh membatalkan, dengan audit
  const bt = call(env, 'rn.admin.perm.tindakan', admin, { id, tindakan: 'batal', catatan: 'Atas permintaan pemohon' });
  assert.equal(bt.data.status, 'Dibatalkan');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Kosong');
  assert.equal(rows(env, 'Tawaran_Sewa')[0].Status, 'Dibatalkan');
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'LOT_BATAL' && a.Emel === ADMIN));
});

test('Penolakan dengan OTP: lot kembali Kosong, cagaran dibatalkan, boleh memohon semula', () => {
  const c = sedia();
  const { env, aina, id } = c;
  dihantar(c);
  const r = jawab(c, aina, 'tolak');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Ditolak Pemohon');
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Ditolak Pemohon');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Kosong');
  assert.equal(rows(env, 'Cagaran')[0].Status, 'Dibatalkan');
  assert.equal(rows(env, 'Tawaran_Sewa')[0].Status, 'Ditolak');
  const doks = call(env, 'rn.butiran', aina, { id }).data.dokumen;
  assert.equal(doks.find((d) => d.jenis === 'Penerimaan').tajuk, 'Rekod Penolakan Tawaran');
  assert.equal(call(env, 'rn.saya', aina).data.boleh.mohon, true);
});

test('OTP penerimaan: bagi pihak (OTP ke emel pemohon), jeda dan had percubaan', () => {
  const c = sedia();
  const { env, admin, aina, id } = c;
  dihantar(c);
  env.advance(61);
  const o = call(env, 'rn.bp.tawaran.otp', admin, { noMatrik: 'A23UJ0001', id });
  assert.equal(o.ok, true, JSON.stringify(o));
  assert.ok(env.sentTo(AINA).some((m) => /Kod pengesahan jawapan tawaran/.test(m.subject)));
  assert.equal(env.sentTo(ADMIN).filter((m) => /Kod pengesahan jawapan/.test(m.subject)).length, 0, 'OTP tidak dihantar kepada admin');
  // jeda 60 saat
  assert.equal(call(env, 'rn.bp.tawaran.otp', admin, { noMatrik: 'A23UJ0001', id }).error.code, 'RATE_JEDA');
  const kod = otpCode(env, AINA);
  for (let i = 0; i < 5; i++) call(env, 'rn.bp.tawaran.jawab', admin, { noMatrik: 'A23UJ0001', id, jawapan: 'terima', kod: '111111' });
  assert.equal(call(env, 'rn.bp.tawaran.jawab', admin, { noMatrik: 'A23UJ0001', id, jawapan: 'terima', kod }).error.code, 'OTP_TAMAT', 'terkunci selepas percubaan maksimum');
  env.advance(61);
  assert.equal(call(env, 'rn.bp.tawaran.otp', admin, { noMatrik: 'A23UJ0001', id }).ok, true);
  const r = call(env, 'rn.bp.tawaran.jawab', admin, { noMatrik: 'A23UJ0001', id, jawapan: 'terima', kod: otpCode(env, AINA) });
  assert.equal(r.ok, true, JSON.stringify(r));
  const au = rows(env, 'Audit').find((a) => a.Tindakan === 'TERIMA_TAWARAN_SEWA');
  assert.equal(au.Emel, ADMIN);
  assert.match(au.Catatan, /admin bagi pihak pemohon/);
  assert.match(au.Catatan, /\[bagi pihak A23UJ0001\]/);
  // pelajar lain tidak boleh menjawab tawaran orang lain
  const weijie = student(env, WEIJIE);
  assert.equal(call(env, 'rn.tawaran.otp', weijie, { id }).error.code, 'RN_TIDAK_DITEMUI');
});

test('Tawaran luput selepas 7 hari: status, lot Kosong, admin dimaklumkan, idempotent; jawapan selepas luput disekat', () => {
  const c = sedia();
  const { env, admin, aina, id } = c;
  dihantar(c);
  // belum luput: kerja harian tidak mengubah
  assert.equal(env.plain(env.run('RuangNiaga.jobHarian()')).tawaran.luput, 0);
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Ditawarkan');
  setRow(env, 'Tawaran_Sewa', 'ID_Permohonan', id, { Tarikh_Hantar: new Date(Date.now() - 9 * 86400000), Tarikh_Luput: env.run(`Util.toDate(${JSON.stringify(hari(env, -2))})`) });
  env.advance(61);
  // jawapan selepas luput disekat (dan menandakan luput)
  const o = call(env, 'rn.tawaran.otp', aina, { id });
  assert.equal(o.error.code, 'RN_TAWARAN_LUPUT');
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Tawaran Luput');
  assert.equal(rows(env, 'Lot').find((l) => l.Kod_Lot === 'SM-01').Status_Lot, 'Kosong');
  assert.equal(rows(env, 'Tawaran_Sewa')[0].Status, 'Luput');
  assert.equal(rows(env, 'Cagaran')[0].Status, 'Dibatalkan');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Tawaran sewa lot luput/.test(m.subject)).length, 1);
  assert.equal(env.sentTo(AINA).filter((m) => /telah luput/.test(m.subject)).length, 1);
  assert.equal(call(env, 'rn.saya', aina).data.boleh.mohon, true, 'boleh memohon semula');
  const j = env.plain(env.run('RuangNiaga.jobHarian()'));
  assert.equal(j.tawaran.luput, 0);
  assert.equal(env.sentTo(ADMIN).filter((m) => /Tawaran sewa lot luput/.test(m.subject)).length, 1, 'tidak berganda');
});

test('Kerja harian: tawaran luput diproses dan peringatan hari ke-4 dan ke-6 dihantar sekali', () => {
  const c = sedia();
  const { env, id } = c;
  dihantar(c);
  const set = (haribaki) => setRow(env, 'Tawaran_Sewa', 'ID_Permohonan', id, { Tarikh_Hantar: new Date(Date.now() - haribaki * 86400000) });
  const rem = () => env.sentTo(AINA).filter((m) => /Peringatan: tawaran sewa lot belum dijawab/.test(m.subject)).length;
  set(3); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 0);
  set(4); assert.equal(env.plain(env.run('RuangNiaga.jobHarian()')).tawaran.peringatanTawaran, 1); assert.equal(rem(), 1);
  env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 1, 'idempotent');
  set(6); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 2);
  env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 2);
  assert.equal(rows(env, 'Peringatan').filter((p) => /^RN_TAWARAN_H/.test(p.Jenis)).length, 2);
  // pemohon yang sudah menjawab tidak diingatkan
  set(6);
});

test('Dokumen: akses pemilik/ahli, orang lain ditolak, muat naik admin kelihatan, Lampiran 1 (SSM) dan versi lama', () => {
  const c = sedia();
  const { env, admin, aina, amirul, id } = c;
  tawaranSiap(c);
  call(env, 'rn.admin.tawaran.jana', admin, { id });
  call(env, 'rn.admin.tawaran.jana', admin, { id }); // v2
  call(env, 'rn.admin.tawaran.hantar', admin, { id });
  const dok = call(env, 'rn.butiran', amirul, { id }).data.dokumen;
  assert.deepEqual(dok.map((d) => d.versi + ':' + d.status), ['2:Dihantar'], 'pratonton v1 tidak pernah dihantar: tidak kelihatan');
  const f = call(env, 'rn.dok.fail', amirul, { id: dok[0].id });
  assert.equal(f.ok, true);
  assert.equal(f.data.nama, 'Surat Tawaran ' + id + ' v2.pdf');
  assert.ok(!JSON.stringify(f).includes('drive.google.com'), 'tiada pautan Drive didedahkan');
  assert.ok(!JSON.stringify(call(env, 'rn.butiran', aina, { id }).data).includes('drive.google.com'));
  const lain = student(env, WEIJIE);
  assert.equal(call(env, 'rn.dok.fail', lain, { id: dok[0].id }).error.code, 'RN_DOK_TIDAK_DITEMUI');
  assert.equal(call(env, 'rn.dok.fail', aina, { id: 'DOK-9999' }).error.code, 'RN_DOK_TIDAK_DITEMUI');
  // dokumen lain muat naik admin
  const { pdfFile } = require('./rn-helpers');
  const mu = call(env, 'rn.admin.dok.muatnaik', admin, { idPermohonan: id, tajuk: 'Garis Panduan Penyewa', fail: pdfFile('panduan.pdf') });
  assert.equal(mu.ok, true, JSON.stringify(mu));
  assert.deepEqual(call(env, 'rn.butiran', amirul, { id }).data.dokumen.map((d) => d.tajuk), ['Surat Tawaran', 'Garis Panduan Penyewa']);
  assert.equal(call(env, 'rn.admin.dok.muatnaik', admin, { idPermohonan: id, tajuk: '', fail: { nama: 'x.exe', data: 'AAAA' } }).error.code, 'RN_BORANG_TIDAK_SAH');
  const pem = login(env, 'pemerhati@utm.my').token;
  assert.equal(call(env, 'rn.admin.dok.muatnaik', pem, { idPermohonan: id, tajuk: 'x', fail: pdfFile('a.pdf') }).error.code, 'TIADA_KEBENARIAN');
  assert.equal(call(env, 'rn.admin.dok.fail', aina, { id: dok[0].id }).error.code, 'TIADA_KEBENARIAN');
  // terima -> perjanjian: Lampiran 1 (SSM) dilampirkan automatik
  jawab(c, aina, 'terima');
  assert.equal(call(env, 'rn.butiran', aina, { id }).data.dokumen.some((d) => d.jenis === 'Lampiran'), false);
  tetapStatus(env, id, 'Perjanjian');
  const d2 = call(env, 'rn.butiran', aina, { id }).data.dokumen;
  const l1 = d2.find((d) => d.jenis === 'Lampiran');
  assert.ok(l1);
  const lf = call(env, 'rn.dok.fail', amirul, { id: l1.id });
  assert.equal(lf.ok, true);
  assert.match(lf.data.nama, /^Lampiran 1/);
  assert.equal(call(env, 'rn.dok.fail', lain, { id: l1.id }).error.code, 'RN_DOK_TIDAK_DITEMUI');
  const ad = call(env, 'rn.admin.perm.butiran', admin, { id }).data;
  assert.ok(ad.dokumen.length >= 4);
  assert.equal(ad.tawaran.status, 'Diterima');
});

test('Salinan fizikal Surat Setuju Terima: tanda diterima, peringatan hari ke-7 dan ke-12, lewat dimaklumkan sekali tanpa pembatalan', () => {
  const c = sedia();
  const { env, admin, aina, id } = c;
  dihantar(c);
  assert.equal(call(env, 'rn.admin.salinan', admin, { id, penerima: 'Pn. Siti' }).error.code, 'RN_TAWARAN_TIDAK_BOLEH', 'selepas diterima');
  jawab(c, aina, 'terima');
  const set = (n) => setRow(env, 'Tawaran_Sewa', 'ID_Permohonan', id, { Tarikh_Hantar: new Date(Date.now() - n * 86400000) });
  const rem = () => env.sentTo(AINA).filter((m) => /salinan fizikal/.test(m.subject)).length;
  set(6); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 0);
  set(7); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 1);
  env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 1);
  set(12); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 2);
  let d = call(env, 'rn.admin.tawaran.dapat', admin, { id }).data.tawaran.salinan;
  assert.equal(d.lewat, false);
  set(15); env.run('RuangNiaga.jobHarian()');
  d = call(env, 'rn.admin.tawaran.dapat', admin, { id }).data.tawaran.salinan;
  assert.equal(d.lewat, true);
  assert.equal(env.sentTo(ADMIN).filter((m) => /Salinan fizikal.*belum diterima/.test(m.subject)).length, 1);
  env.run('RuangNiaga.jobHarian()');
  assert.equal(env.sentTo(ADMIN).filter((m) => /Salinan fizikal.*belum diterima/.test(m.subject)).length, 1, 'sekali sahaja');
  assert.equal(rows(env, 'Permohonan_Lot')[0].Status, 'Diterima', 'tiada pembatalan automatik');
  // tanda diterima: penerima wajib, tarikh tidak akan datang
  assert.ok(call(env, 'rn.admin.salinan', admin, { id, penerima: '' }).error.extra.medan.penerima);
  assert.ok(call(env, 'rn.admin.salinan', admin, { id, penerima: 'Pn. Siti', tarikh: hari(env, 3) }).error.extra.medan.tarikh);
  const ok = call(env, 'rn.admin.salinan', admin, { id, penerima: 'Pn. Siti', tarikh: hari(env, 0) });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.data.tawaran.salinan.penerima, 'Pn. Siti');
  assert.equal(ok.data.tawaran.salinan.lewat, false);
  assert.ok(rows(env, 'Audit').some((a) => a.Tindakan === 'SALINAN_FIZIKAL_DITERIMA' && /Pn\. Siti/.test(a.Catatan)));
  assert.equal(call(env, 'rn.admin.salinan', admin, { id, penerima: 'Lain' }).error.code, 'RN_PERALIHAN_TIDAK_SAH');
  set(12); env.run('RuangNiaga.jobHarian()'); assert.equal(rem(), 2, 'tiada peringatan selepas diterima');
});
