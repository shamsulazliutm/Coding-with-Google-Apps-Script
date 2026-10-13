'use strict';
/** Makerspace fasa 3: pinjaman peralatan (stok, tempoh sebulan, pembaharuan, pemulangan, lewat). */
const test = require('node:test');
const H = require('./makerspace-helpers');
const { call, login, student, assert, mkEnv, AINA, AMIRUL, rows, rowsBy, PINJAM, opDay, addDays, bekukan, tokenPerakuan, perakui, lulusPenuh } = H;

const stokAlat = (env, admin, kod) => call(env, 'mk.admin.alat.senarai', admin).data.senarai.find((x) => x.kod === kod);

test('Pinjaman: baki stok = jumlah - rosak/hilang - sedang dipinjam; tempahan menunggu turut mengira', () => {
  const { env, admin } = mkEnv();
  const t1 = student(env, AINA), t2 = student(env, AMIRUL);
  assert.equal(stokAlat(env, admin, 'SOLDER').baki, 4, '5 - 1 rosak');
  const medan = (t, o) => { const r = call(env, 'mk.hantar', t, PINJAM(o)); assert.equal(r.error.code, 'MK_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  assert.match(medan(t1, { item: [{ kod: 'SOLDER', kuantiti: 5 }] }).item, /tidak mencukupi \(baki 4\)/);
  assert.ok(medan(t1, { item: [] }).item);
  assert.ok(medan(t1, { item: [{ kod: 'TIADA', kuantiti: 1 }] }).item);
  assert.ok(medan(t1, { item: [{ kod: 'SOLDER', kuantiti: 0 }] }).item);
  assert.ok(medan(t1, { item: [{ kod: 'SOLDER', kuantiti: 1 }, { kod: 'SOLDER', kuantiti: 1 }] }).item, 'pendua');
  assert.ok(medan(t1, { tujuan: '' }).tujuan);
  assert.ok(medan(t1, { tarikhPulang: '' }).tarikhPulang);
  const r = call(env, 'mk.hantar', t1, PINJAM({ item: [{ kod: 'SOLDER', kuantiti: 3 }, { kod: 'MULTIMETER', kuantiti: 1 }] }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Menunggu Perakuan');
  assert.equal(r.data.anggaran, 0, 'pinjaman percuma jika PERALATAN_TANGAN tidak ditetapkan');
  assert.deepEqual(rows(env, 'Item_Pinjaman').map((x) => x.Status), ['Dimohon', 'Dimohon']);
  // 3 ditempah (belum diluluskan) -> baki 1
  assert.equal(stokAlat(env, admin, 'SOLDER').baki, 1);
  assert.match(medan(t2, { item: [{ kod: 'SOLDER', kuantiti: 2 }] }).item, /baki 1/);
  assert.equal(call(env, 'mk.hantar', t2, PINJAM({ item: [{ kod: 'SOLDER', kuantiti: 1 }] })).ok, true);
  assert.equal(stokAlat(env, admin, 'SOLDER').baki, 0);
  // pembatalan melepaskan stok
  assert.equal(call(env, 'mk.batal', t1, { id: r.data.id }).ok, true);
  assert.equal(stokAlat(env, admin, 'SOLDER').baki, 3);
  // alat tidak aktif / tidak boleh dipinjam
  call(env, 'mk.admin.alat.simpan', admin, { kod: 'MULTIMETER', nama: 'Multimeter', jumlah: 2, rosak: 0, bolehDipinjam: false });
  assert.ok(medan(t1, { item: [{ kod: 'MULTIMETER', kuantiti: 1 }] }).item);
  const mk = call(env, 'mk.maklumat', t1).data;
  assert.ok(!mk.alat.some((a) => a.kod === 'MULTIMETER'));
  assert.equal(mk.alat.find((a) => a.kod === 'SOLDER').baki, 3);
});

test('Pinjaman: tempoh maksimum satu bulan, tarikh pulang hari operasi, kelulusan dan pemulangan menjadikan stok kembali', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, '2026-10-19', '09:00');
  const medan = (o) => { const r = call(env, 'mk.hantar', t, PINJAM(Object.assign({ tarikh: '2026-10-20' }, o))); assert.equal(r.error.code, 'MK_TIDAK_SAH', JSON.stringify(r)); return r.error.extra.medan; };
  assert.match(medan({ tarikhPulang: '2026-11-23' }).tarikhPulang, /maksimum 1 bulan/i, 'melebihi 20 Nov');
  assert.ok(medan({ tarikhPulang: '2026-11-21' }).tarikhPulang, 'Sabtu bukan hari operasi');
  assert.ok(medan({ tarikhPulang: '2026-10-19' }).tarikhPulang, 'sebelum tarikh pinjam');
  assert.ok(medan({ tarikh: '2026-10-24' }).tarikh, 'Sabtu');
  const sempadan = call(env, 'mk.hantar', t, PINJAM({ tarikh: '2026-10-20', tarikhPulang: '2026-11-20' }));
  assert.equal(sempadan.ok, true, 'tepat sebulan (Jumaat 20 Nov) dibenarkan: ' + JSON.stringify(sempadan));
  perakui(env, tokenPerakuan(env));
  const l = call(env, 'mk.admin.putus', admin, { id: sempadan.data.id, tindakan: 'lulus' });
  assert.equal(l.data.status, 'Diluluskan');
  assert.deepEqual(rows(env, 'Item_Pinjaman').map((x) => x.Status), ['Dipinjam']);
  assert.equal(stokAlat(env, admin, 'SOLDER').dipinjam, 2);
  const d = call(env, 'mk.admin.butiran', admin, { id: sempadan.data.id }).data;
  assert.equal(d.boleh.pulang, true);
  assert.equal(d.boleh.perbaharui, true);
  // pulang
  const p = call(env, 'mk.admin.pulang', admin, { id: sempadan.data.id });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.data.status, 'Selesai');
  assert.deepEqual(rows(env, 'Item_Pinjaman').map((x) => x.Status), ['Dipulangkan']);
  assert.equal(stokAlat(env, admin, 'SOLDER').baki, 4);
  assert.equal(call(env, 'mk.admin.pulang', admin, { id: sempadan.data.id }).error.code, 'MK_PERALIHAN_TIDAK_SAH');
  assert.equal(rows(env, 'Bayaran_Makerspace').length, 0, 'tiada bil jika PERALATAN_TANGAN tidak ditetapkan');
});

test('Pinjaman: kelulusan menyemak semula stok; pemulangan sebahagian; pembaharuan sekali oleh pemohon atau admin (maksimum sebulan lagi)', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, '2026-10-19', '09:00');
  const id = lulusPenuh(env, admin, t, PINJAM({ item: [{ kod: 'SOLDER', kuantiti: 2 }, { kod: 'MULTIMETER', kuantiti: 1 }], tarikh: '2026-10-20', tarikhPulang: '2026-11-13' }));
  // pulang sebahagian
  const p1 = call(env, 'mk.admin.pulang', admin, { id, kod: 'MULTIMETER' });
  assert.equal(p1.data.status, 'Diluluskan');
  assert.equal(p1.data.item.find((x) => x.kod === 'MULTIMETER').status, 'Dipulangkan');
  // pembaharuan oleh pemohon: sebulan dari tarikh pulang asal (13 Nov -> 11 Dis? 13 Dis Ahad -> Jumaat 11 Dis)
  const b = call(env, 'mk.butiran', t, { id }).data;
  assert.equal(b.boleh.perbaharui, true);
  const n = call(env, 'mk.pinjaman.perbaharui', t, { id });
  assert.equal(n.ok, true, JSON.stringify(n));
  assert.equal(n.data.tarikhTamat, '2026-12-11', '13 Dis ialah Ahad: dilaraskan ke hari operasi sebelumnya');
  assert.equal(n.data.bilPembaharuan, 1);
  assert.equal(n.data.item.find((x) => x.kod === 'SOLDER').tarikhPulangDijangka, '2026-12-11');
  assert.equal(n.data.boleh.perbaharui, false);
  // sekali sahaja, oleh pemohon atau admin
  assert.equal(call(env, 'mk.pinjaman.perbaharui', t, { id }).error.code, 'MK_PEMBAHARUAN_TIDAK_SAH');
  assert.equal(call(env, 'mk.admin.perbaharui', admin, { id }).error.code, 'MK_PEMBAHARUAN_TIDAK_SAH');
  assert.equal(call(env, 'mk.pinjaman.perbaharui', student(env, AMIRUL), { id }).error.code, 'MK_TIDAK_DITEMUI');
  assert.equal(env.sentTo(AINA).filter((m) => /Pinjaman diperbaharui/.test(m.subject)).length, 1);
  assert.equal(rows(env, 'Audit').filter((x) => x.Tindakan === 'MK_PERBAHARUI_PINJAMAN').length, 1);
  // pembaharuan oleh admin
  const id2 = lulusPenuh(env, admin, t, PINJAM({ item: [{ kod: 'SOLDER', kuantiti: 1 }], tarikh: '2026-10-20', tarikhPulang: '2026-10-30' }));
  const a = call(env, 'mk.admin.perbaharui', admin, { id: id2 });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.data.tarikhTamat, '2026-11-30');
  assert.equal(rowsBy(env, 'Tempahan', 'ID_Tempahan', id2)[0].Bil_Pembaharuan, 1);
  // tidak boleh diperbaharui jika bukan diluluskan
  const r3 = call(env, 'mk.hantar', t, PINJAM({ item: [{ kod: 'MULTIMETER', kuantiti: 1 }], tarikh: '2026-10-21', tarikhPulang: '2026-10-28' }));
  assert.equal(call(env, 'mk.pinjaman.perbaharui', t, { id: r3.data.id }).error.code, 'MK_PEMBAHARUAN_TIDAK_SAH');
});

test('Pinjaman lewat pulang menyekat pinjaman baharu sahaja [LALAI]; pemulangan membuka sekatan; pembaharuan pemohon tidak dibenarkan selepas lewat', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, '2026-10-19', '09:00');
  const id = lulusPenuh(env, admin, t, PINJAM({ tarikh: '2026-10-20', tarikhPulang: '2026-10-23' }));
  bekukan(env, '2026-10-26', '09:00');
  assert.equal(call(env, 'mk.hantar', t, PINJAM({ tarikh: '2026-10-27', tarikhPulang: '2026-10-30', item: [{ kod: 'MULTIMETER', kuantiti: 1 }] })).error.code, 'MK_PINJAMAN_LEWAT');
  // tempahan jenis lain tidak disekat (tiada sekatan silang jenis untuk pinjaman lewat)
  assert.equal(call(env, 'mk.hantar', t, H.LASER({ tarikh: '2026-10-28' })).ok, true);
  const s = call(env, 'mk.saya', t).data;
  assert.deepEqual(s.sekatan.pinjaman, [id]);
  assert.equal(s.senarai.find((x) => x.id === id).lewat, true);
  assert.equal(call(env, 'mk.maklumat', t).data.sekatan.pinjaman, true);
  assert.equal(call(env, 'mk.pinjaman.perbaharui', t, { id }).error.code, 'MK_PEMBAHARUAN_TIDAK_SAH', 'pemohon tidak boleh memperbaharui pinjaman lewat');
  const rg = call(env, 'mk.admin.ringkasan', admin).data;
  assert.equal(rg.pinjamanLewat, 1);
  const d = call(env, 'mk.admin.butiran', admin, { id }).data;
  assert.equal(d.item[0].lewat, true);
  call(env, 'mk.admin.pulang', admin, { id });
  assert.equal(call(env, 'mk.hantar', t, PINJAM({ tarikh: '2026-10-27', tarikhPulang: '2026-10-30', item: [{ kod: 'MULTIMETER', kuantiti: 1 }] })).ok, true);
});

test('Kerja harian pinjaman: peringatan sehari sebelum, susulan lewat setiap 3 hari, idempotent, hormati MOD UJI', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  bekukan(env, '2026-10-19', '09:00');
  const id = lulusPenuh(env, admin, t, PINJAM({ tarikh: '2026-10-20', tarikhPulang: '2026-10-23' }));
  const n0 = env.sentTo(AINA).length;
  bekukan(env, '2026-10-22', '07:00'); // sehari sebelum
  assert.equal(env.plain(env.run('Makerspace.jobHarian()')).peringatan >= 1, true);
  assert.equal(env.sentTo(AINA).filter((m) => /pulangkan peralatan esok/.test(m.subject)).length, 1);
  env.run('Makerspace.jobHarian()');
  assert.equal(env.sentTo(AINA).filter((m) => /pulangkan peralatan esok/.test(m.subject)).length, 1, 'idempotent');
  // lewat 1 hari, 2 hari (tiada baharu), 4 hari (susulan)
  const lewat = () => env.sentTo(AINA).filter((m) => /lewat dipulangkan/.test(m.subject)).length;
  bekukan(env, '2026-10-24', '07:00'); env.run('Makerspace.jobHarian()');
  assert.equal(lewat(), 1, 'lewat 1 hari');
  bekukan(env, '2026-10-26', '07:00'); env.run('Makerspace.jobHarian()');
  assert.equal(lewat(), 1, 'lewat 3 hari: belum susulan');
  bekukan(env, '2026-10-27', '07:00'); env.run('Makerspace.jobHarian()');
  assert.equal(lewat(), 2, 'susulan selepas 3 hari');
  env.run('Makerspace.jobHarian()');
  assert.equal(lewat(), 2);
  const log = rows(env, 'Peringatan').filter((x) => /^MK_PULANG/.test(x.Jenis));
  assert.equal(log.length, 3);
  assert.ok(log.every((x) => x.Rujukan === id));
  assert.ok(n0 > 0);
  // selepas pulang tiada peringatan baharu
  call(env, 'mk.admin.pulang', admin, { id });
  bekukan(env, '2026-11-05', '07:00'); env.run('Makerspace.jobHarian()');
  assert.equal(lewat(), 2);
});

test('Pinjaman: kadar PERALATAN_TANGAN yang ditetapkan menjana bil selepas pemulangan; bayaran oleh pemohon', () => {
  const { env, admin } = mkEnv();
  const t = student(env, AINA);
  call(env, 'mk.admin.kadar.simpan', admin, { kod: 'PERALATAN_TANGAN', jenisPengguna: 'Pelajar', kadar: '5' });
  bekukan(env, '2026-10-19', '09:00');
  const est = call(env, 'mk.anggar', t, PINJAM({ tarikh: '2026-10-20', tarikhPulang: '2026-10-23' })).data;
  assert.equal(est.jumlah, 5);
  const id = lulusPenuh(env, admin, t, PINJAM({ tarikh: '2026-10-20', tarikhPulang: '2026-10-23' }));
  assert.equal(rows(env, 'Bayaran_Makerspace').length, 0, 'bil dijana selepas pemulangan');
  call(env, 'mk.admin.pulang', admin, { id });
  const b = rows(env, 'Bayaran_Makerspace')[0];
  assert.equal(b.Anggaran_RM, 5);
  assert.equal(b.Status, 'Belum Bayar');
  assert.equal(b.ID_Tempahan, id);
  assert.match(b.ID_Bayaran, /^BMK-2026-0001$/);
});
