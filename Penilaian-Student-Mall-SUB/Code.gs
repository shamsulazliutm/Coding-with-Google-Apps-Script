/**
 * Sistem Penilaian Permohonan Student Mall & SUB (UTMPreneur · UTMXCITE)
 *
 * FAIL 1 daripada 2 (Code.gs): pelayan + penyediaan sheet. Fail 2: Index.html (antara muka).
 *
 * Skrip terikat (bound) pada satu Google Sheet. Web app dilaksanakan sebagai pemilik skrip
 * (executeAs USER_DEPLOYING, akses DOMAIN) dan pengguna dikenal pasti melalui e-mel Google.
 * Panel hanya menerima data dan penilaian miliknya; admin menerima semuanya.
 */

const ADMIN_EMAIL = 'utmxcite@utm.my';
const LOGO_URL = ''; // pilihan: URL imej logo (data: URI atau pautan awam); kosong = logo teks

const SH = {
  PANEL: 'Panel', PEMOHON: 'Pemohon', PELAJAR: 'Pelajar', SESI: 'Sesi',
  RUBRIK: 'Rubrik', CHIP: 'Chip', NILAI: 'Penilaian', KEPUTUSAN: 'Keputusan', LOG: 'Log'
};
const HEAD = {
  Panel: ['Nama', 'Emel', 'Peranan', 'Status'],
  Pemohon: ['ID', 'Perniagaan', 'Jenis', 'SSM', 'JenisPerniagaan', 'PautanPelan', 'Slot', 'Susunan', 'StatusAkhir'],
  Pelajar: ['PemohonID', 'Nama', 'Matrik', 'KP', 'Tahun', 'Fakulti', 'Kursus', 'CGPA'],
  Sesi: ['Nama', 'Tarikh', 'Masa', 'RubrikVersi', 'Status'],
  Rubrik: ['Versi', 'No', 'BM', 'EN', 'Maks', 'Sub', 'Tahap5', 'Tahap3', 'Tahap1', 'Elemen'],
  Chip: ['Teks'],
  Penilaian: ['PemohonID', 'Emel', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
    'Elemen', 'Ulasan', 'Layak', 'Jumlah', 'Status', 'Dikemaskini'],
  Log: ['Masa', 'Pengguna', 'Tindakan', 'Butiran']
};
const NCRIT = 6;

/* ===================== Titik masuk ===================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('UTMPreneur · Penilaian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Penilaian')
    .addItem('Sediakan sheet (kali pertama)', 'setupSheets')
    .addItem('Kemas kini tab Keputusan', 'refreshKeputusan')
    .addToUi();
}

/* ===================== Utiliti sheet ===================== */

function ss_() {
  const a = SpreadsheetApp.getActiveSpreadsheet();
  if (a) return a;
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  if (!id) throw new Error('Skrip mesti terikat pada Google Sheet, atau tetapkan SS_ID.');
  return SpreadsheetApp.openById(id);
}

function table_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tiada. Jalankan menu Penilaian > Sediakan sheet.');
  const v = sh.getDataRange().getValues();
  const head = v.shift();
  const rows = v.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  }).filter(function (o) { return head.some(function (k) { return o[k] !== '' && o[k] !== null; }); });
  return { sh: sh, head: head, rows: rows };
}

function append_(name, obj) {
  const sh = ss_().getSheetByName(name);
  const head = HEAD[name];
  sh.appendRow(head.map(function (k) { return obj[k] === undefined ? '' : obj[k]; }));
}

function writeRow_(name, rowNo, obj) {
  const sh = ss_().getSheetByName(name);
  const head = HEAD[name];
  sh.getRange(rowNo, 1, 1, head.length).setValues([head.map(function (k) { return obj[k] === undefined ? '' : obj[k]; })]);
}

function log_(action, detail) {
  append_(SH.LOG, { Masa: new Date(), Pengguna: (Session.getActiveUser().getEmail() || ''), Tindakan: action, Butiran: detail || '' });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== Pengguna dan peranan ===================== */

function me_() {
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { email: '', role: 'none', name: '' };
  const p = table_(SH.PANEL).rows.filter(function (r) { return String(r.Emel).toLowerCase() === email; })[0];
  const aktif = p && String(p.Status).toLowerCase() === 'aktif';
  if (email === ADMIN_EMAIL) return { email: email, role: 'admin', name: p ? p.Nama : 'Admin' };
  if (p && aktif) return { email: email, role: String(p.Peranan).toLowerCase() === 'admin' ? 'admin' : 'panel', name: p.Nama };
  return { email: email, role: 'none', name: '' };
}

function need_(role) {
  const u = me_();
  if (u.role !== role) throw new Error('Akses ditolak.');
  return u;
}

/* ===================== Data rujukan ===================== */

function rubrik_(versi) {
  const rows = table_(SH.RUBRIK).rows.filter(function (r) { return Number(r.Versi) === Number(versi); })
    .sort(function (a, b) { return a.No - b.No; });
  return rows.map(function (r) {
    return {
      id: Number(r.No), bm: r.BM, en: r.EN, max: Number(r.Maks), sub: r.Sub, a5: r.Tahap5, a3: r.Tahap3, a1: r.Tahap1,
      els: r.Elemen ? String(r.Elemen).split('|').filter(String) : []
    };
  });
}

function sesi_() {
  const r = table_(SH.SESI).rows[0];
  if (!r) throw new Error('Sesi belum dicipta.');
  return {
    nama: r.Nama, tarikh: r.Tarikh instanceof Date ? Utilities.formatDate(r.Tarikh, 'Asia/Kuala_Lumpur', 'd MMMM yyyy') : String(r.Tarikh),
    masa: String(r.Masa), versi: Number(r.RubrikVersi), status: r.Status, _row: r._row
  };
}

function chips_() {
  return table_(SH.CHIP).rows.map(function (r) { return String(r.Teks); });
}

function maskKp_(kp) {
  return String(kp || '').trim().replace(/\d{4}$/, '****');
}

function apps_(mask) {
  const stud = table_(SH.PELAJAR).rows;
  return table_(SH.PEMOHON).rows.sort(function (a, b) { return (Number(a.Susunan) || 99) - (Number(b.Susunan) || 99); })
    .map(function (a) {
      const st = stud.filter(function (s) { return Number(s.PemohonID) === Number(a.ID); }).map(function (s) {
        return {
          n: String(s.Nama).trim(), m: String(s.Matrik).trim(), kp: mask ? maskKp_(s.KP) : String(s.KP).trim(),
          yr: s.Tahun, fac: s.Fakulti, course: String(s.Kursus).trim(), cgpa: Number(s.CGPA)
        };
      });
      return {
        id: Number(a.ID), biz: a.Perniagaan, type: a.Jenis, ssm: a.SSM, kind: a.JenisPerniagaan, plan: a.PautanPelan,
        slot: a.Slot, order: Number(a.Susunan) || 0, final: a.StatusAkhir || '', st: st
      };
    });
}

function evalRow_(r) {
  const lv = [], mk = [];
  for (let i = 1; i <= NCRIT; i++) { lv.push(Number(r['T' + i]) || 0); mk.push(Number(r['M' + i]) || 0); }
  return {
    pid: Number(r.PemohonID), email: r.Emel, lv: lv, mk: mk,
    els: r.Elemen ? String(r.Elemen).split(',').map(function (x) { return x === '1'; }) : [],
    cm: r.Ulasan || '', ok: r.Layak || '', total: Number(r.Jumlah) || 0, status: r.Status || 'Draf'
  };
}

/* ===================== API: umum ===================== */

function apiBoot() {
  const u = me_();
  return { me: u, admin: ADMIN_EMAIL, logo: LOGO_URL };
}

/* ===================== API: panel ===================== */

function apiPanelData() {
  const u = need_('panel');
  const s = sesi_();
  const mine = {};
  table_(SH.NILAI).rows.filter(function (r) { return String(r.Emel).toLowerCase() === u.email; })
    .forEach(function (r) { mine[Number(r.PemohonID)] = evalRow_(r); });
  return { me: u, sesi: s, crit: rubrik_(s.versi), chips: chips_(), apps: apps_(true), mine: mine };
}

function apiSaveEval(pid, p, submit) {
  const u = need_('panel');
  return withLock_(function () {
    const s = sesi_();
    if (s.status !== 'Dibuka') throw new Error('Sesi telah ditutup.');
    const app = apps_(true).filter(function (a) { return a.id === Number(pid); })[0];
    if (!app) throw new Error('Permohonan tidak sah.');
    const crit = rubrik_(s.versi);
    const t = table_(SH.NILAI);
    const old = t.rows.filter(function (r) { return Number(r.PemohonID) === Number(pid) && String(r.Emel).toLowerCase() === u.email; })[0];
    if (old && old.Status === 'Dihantar') throw new Error('Penilaian ini telah dihantar dan dikunci.');

    const row = { PemohonID: Number(pid), Emel: u.email };
    let total = 0;
    crit.forEach(function (c, i) {
      const lv = Math.round(Number(p.lv[i]) || 0);
      const mk = Math.round(Number(p.mk[i]) || 0);
      if (lv < 0 || lv > 5) throw new Error('Tahap tidak sah (kriteria ' + c.id + ').');
      if (mk < 0 || mk > c.max) throw new Error('Markah kriteria ' + c.id + ' mesti 0 hingga ' + c.max + '.');
      if (submit && lv < 1) throw new Error('Pilih tahap bagi kriteria ' + c.id + '.');
      row['T' + (i + 1)] = lv; row['M' + (i + 1)] = mk; total += mk;
    });
    if (submit && p.ok !== 'Ya' && p.ok !== 'Tidak') throw new Error('Pilih sama ada pelajar layak.');
    row.Elemen = (p.els || []).map(function (x) { return x ? 1 : 0; }).join(',');
    row.Ulasan = String(p.cm || '').slice(0, 2000);
    row.Layak = p.ok === 'Ya' || p.ok === 'Tidak' ? p.ok : '';
    row.Jumlah = total;
    row.Status = submit ? 'Dihantar' : 'Draf';
    row.Dikemaskini = new Date();
    if (old) writeRow_(SH.NILAI, old._row, row); else append_(SH.NILAI, row);
    if (submit) { log_('Hantar penilaian', app.biz + ' · ' + u.email + ' · ' + total + '/100'); writeKeputusan_(); }
    return evalRow_(row);
  });
}

/* ===================== API: admin ===================== */

function apiAdminData() {
  need_('admin');
  const s = sesi_();
  const nilai = table_(SH.NILAI).rows.map(evalRow_);
  return {
    sesi: s, crit: rubrik_(s.versi), chips: chips_(), apps: apps_(false),
    panels: table_(SH.PANEL).rows.map(function (r) { return { nama: r.Nama, emel: r.Emel, peranan: r.Peranan, status: r.Status }; }),
    nilai: nilai, keputusan: computeKeputusan_(),
    versi: table_(SH.RUBRIK).rows.map(function (r) { return Number(r.Versi); }).reduce(function (a, b) { return Math.max(a, b); }, 1),
    log: table_(SH.LOG).rows.slice(-200).reverse().map(function (r) {
      return { masa: r.Masa instanceof Date ? Utilities.formatDate(r.Masa, 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm') : String(r.Masa), user: r.Pengguna, act: r.Tindakan, det: r.Butiran };
    })
  };
}

function apiSaveApp(a) {
  need_('admin');
  return withLock_(function () {
    const t = table_(SH.PEMOHON);
    let id = Number(a.id);
    let rowNo = 0, order = 99, final = '';
    if (id) {
      const o = t.rows.filter(function (r) { return Number(r.ID) === id; })[0];
      if (!o) throw new Error('Permohonan tidak dijumpai.');
      rowNo = o._row; order = o.Susunan; final = o.StatusAkhir;
    } else {
      id = t.rows.reduce(function (m, r) { return Math.max(m, Number(r.ID)); }, 0) + 1;
      order = t.rows.length + 1;
    }
    if (!a.biz || (a.type !== 'Student Mall' && a.type !== 'SUB')) throw new Error('Nama perniagaan dan jenis diperlukan.');
    const row = { ID: id, Perniagaan: a.biz, Jenis: a.type, SSM: a.ssm || '', JenisPerniagaan: a.kind || '', PautanPelan: a.plan || '',
      Slot: a.slot || '', Susunan: order, StatusAkhir: final };
    if (rowNo) writeRow_(SH.PEMOHON, rowNo, row); else append_(SH.PEMOHON, row);

    const ps = table_(SH.PELAJAR);
    ps.rows.filter(function (r) { return Number(r.PemohonID) === id; }).map(function (r) { return r._row; })
      .sort(function (x, y) { return y - x; }).forEach(function (n) { ps.sh.deleteRow(n); });
    (a.st || []).forEach(function (s) {
      if (!s.n) return;
      append_(SH.PELAJAR, { PemohonID: id, Nama: s.n, Matrik: s.m, KP: s.kp, Tahun: s.yr, Fakulti: s.fac, Kursus: s.course, CGPA: s.cgpa });
    });
    log_('Simpan permohonan', a.biz);
    return id;
  });
}

function apiSavePanel(p) {
  need_('admin');
  return withLock_(function () {
    const emel = String(p.emel || '').trim().toLowerCase();
    if (!p.nama || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emel)) throw new Error('Nama dan e-mel sah diperlukan.');
    const t = table_(SH.PANEL);
    const o = t.rows.filter(function (r) { return String(r.Emel).toLowerCase() === emel; })[0];
    const row = { Nama: p.nama, Emel: emel, Peranan: (o && o.Peranan) || 'Panel', Status: p.status || 'Aktif' };
    if (emel === ADMIN_EMAIL) { row.Peranan = 'Admin'; row.Status = 'Aktif'; }
    if (o) writeRow_(SH.PANEL, o._row, row); else append_(SH.PANEL, row);
    log_(o ? 'Kemas kini panel' : 'Tambah panel', p.nama + ' · ' + emel + ' · ' + row.Status);
    return true;
  });
}

function apiSaveSesi(s) {
  need_('admin');
  return withLock_(function () {
    const cur = sesi_();
    const row = { Nama: s.nama, Tarikh: s.tarikh, Masa: s.masa, RubrikVersi: cur.versi, Status: cur.status };
    writeRow_(SH.SESI, cur._row, row);
    (s.order || []).forEach(function (o, i) {
      const r = table_(SH.PEMOHON).rows.filter(function (x) { return Number(x.ID) === Number(o.id); })[0];
      if (r) { r.Susunan = i + 1; r.Slot = o.slot || ''; writeRow_(SH.PEMOHON, r._row, r); }
    });
    log_('Kemas kini sesi', row.Nama);
    return true;
  });
}

function apiSetSesiStatus(status) {
  need_('admin');
  if (status !== 'Dibuka' && status !== 'Ditutup') throw new Error('Status tidak sah.');
  return withLock_(function () {
    const cur = sesi_();
    writeRow_(SH.SESI, cur._row, { Nama: cur.nama, Tarikh: cur.tarikh, Masa: cur.masa, RubrikVersi: cur.versi, Status: status });
    log_(status === 'Ditutup' ? 'Tutup sesi' : 'Buka sesi', cur.nama);
    return true;
  });
}

function apiReopen(pid, emel) {
  need_('admin');
  return withLock_(function () {
    const r = table_(SH.NILAI).rows.filter(function (x) { return Number(x.PemohonID) === Number(pid) && String(x.Emel).toLowerCase() === String(emel).toLowerCase(); })[0];
    if (!r) throw new Error('Penilaian tidak dijumpai.');
    r.Status = 'Draf';
    writeRow_(SH.NILAI, r._row, r);
    log_('Buka semula penilaian', 'Permohonan ' + pid + ' · ' + emel);
    writeKeputusan_();
    return true;
  });
}

function apiSetStatusAkhir(pid, status) {
  need_('admin');
  return withLock_(function () {
    const r = table_(SH.PEMOHON).rows.filter(function (x) { return Number(x.ID) === Number(pid); })[0];
    if (!r) throw new Error('Permohonan tidak dijumpai.');
    r.StatusAkhir = status === 'Belum' ? '' : status;
    writeRow_(SH.PEMOHON, r._row, r);
    log_('Status akhir', r.Perniagaan + ' → ' + status);
    writeKeputusan_();
    return true;
  });
}

/** Simpan rubrik sebagai versi baharu. useNow=true menukar sesi kepada versi baharu (hanya jika tiada penilaian dihantar). */
function apiSaveRubrik(crit, chips, useNow) {
  need_('admin');
  return withLock_(function () {
    let total = 0;
    crit.forEach(function (c) {
      c.max = Math.round(Number(c.max));
      if (!(c.max > 0)) throw new Error('Markah maksimum mesti lebih daripada 0.');
      total += c.max;
    });
    if (total !== 100) throw new Error('Jumlah markah maksimum mesti 100 (sekarang ' + total + ').');
    const rt = table_(SH.RUBRIK);
    const ver = rt.rows.reduce(function (m, r) { return Math.max(m, Number(r.Versi)); }, 0) + 1;
    crit.forEach(function (c) {
      append_(SH.RUBRIK, { Versi: ver, No: c.id, BM: c.bm, EN: c.en, Maks: c.max, Sub: c.sub, Tahap5: c.a5, Tahap3: c.a3, Tahap1: c.a1, Elemen: (c.els || []).join('|') });
    });
    const cs = table_(SH.CHIP);
    if (cs.rows.length) cs.sh.deleteRows(2, cs.rows.length);
    (chips || []).filter(String).forEach(function (t) { append_(SH.CHIP, { Teks: t }); });
    let used = false;
    if (useNow) {
      const submitted = table_(SH.NILAI).rows.some(function (r) { return r.Status === 'Dihantar'; });
      if (submitted) throw new Error('Versi ' + ver + ' disimpan, tetapi sesi tidak boleh bertukar versi kerana sudah ada penilaian dihantar.');
      const cur = sesi_();
      writeRow_(SH.SESI, cur._row, { Nama: cur.nama, Tarikh: cur.tarikh, Masa: cur.masa, RubrikVersi: ver, Status: cur.status });
      used = true;
    }
    log_('Simpan rubrik', 'Versi ' + ver + (used ? ' (digunakan oleh sesi)' : ''));
    return ver;
  });
}

function apiRefreshKeputusan() {
  need_('admin');
  writeKeputusan_();
  return true;
}

/* ===================== Keputusan ===================== */

function computeKeputusan_() {
  const panels = table_(SH.PANEL).rows.filter(function (r) { return String(r.Peranan).toLowerCase() === 'panel' && String(r.Status).toLowerCase() === 'aktif'; });
  const nilai = table_(SH.NILAI).rows.filter(function (r) { return r.Status === 'Dihantar'; });
  const apps = apps_(false);
  const rows = apps.map(function (a) {
    const sc = panels.map(function (p) {
      const n = nilai.filter(function (r) { return Number(r.PemohonID) === a.id && String(r.Emel).toLowerCase() === String(p.Emel).toLowerCase(); })[0];
      return n ? Number(n.Jumlah) : null;
    });
    const got = sc.filter(function (x) { return x !== null; });
    const avg = got.length ? got.reduce(function (x, y) { return x + y; }, 0) / got.length : null;
    const layak = nilai.filter(function (r) { return Number(r.PemohonID) === a.id && r.Layak === 'Ya'; }).length;
    return { id: a.id, biz: a.biz, type: a.type, sc: sc, n: got.length, avg: avg, layak: layak, final: a.final, rank: null };
  });
  const sorted = rows.filter(function (r) { return r.avg !== null; }).sort(function (x, y) { return y.avg - x.avg; });
  sorted.forEach(function (r, i) {
    r.rank = i > 0 && Math.abs(sorted[i - 1].avg - r.avg) < 1e-9 ? sorted[i - 1].rank : i + 1;
  });
  return {
    panels: panels.map(function (p) { return { nama: p.Nama, emel: p.Emel }; }),
    rows: rows.sort(function (x, y) { return (x.rank || 999) - (y.rank || 999); })
  };
}

function writeKeputusan_() {
  const k = computeKeputusan_();
  const sh = ss_().getSheetByName(SH.KEPUTUSAN) || ss_().insertSheet(SH.KEPUTUSAN);
  sh.clear();
  const head = ['Rank', 'Perniagaan', 'Jenis'].concat(k.panels.map(function (p) { return p.nama; }), ['Dinilai', 'Purata (/100)', 'Layak (Ya)', 'Status Akhir']);
  const body = k.rows.map(function (r) {
    return [r.rank || '', r.biz, r.type].concat(r.sc.map(function (x) { return x === null ? '' : x; }),
      [r.n + '/' + k.panels.length, r.avg === null ? '' : Math.round(r.avg * 100) / 100, r.layak, r.final || 'Belum']);
  });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff').setWrap(true);
  if (body.length) sh.getRange(2, 1, body.length, head.length).setValues(body);
  sh.setFrozenRows(1);
}

function refreshKeputusan() {
  writeKeputusan_();
  SpreadsheetApp.getActive().toast('Tab Keputusan dikemas kini.');
}

/* ===================== Penyediaan sheet dan data awal ===================== */
/* Menu Penilaian > Sediakan sheet. Selamat dijalankan semula: sheet yang sudah ada isi tidak ditimpa. */

function setupSheets() {
  const book = ss_();
  Object.keys(HEAD).forEach(function (name) {
    const sh = book.getSheetByName(name) || book.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]])
        .setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  // KP, matrik dan SSM mesti kekal sebagai teks
  book.getSheetByName(SH.PELAJAR).getRange('C:D').setNumberFormat('@');
  book.getSheetByName(SH.PEMOHON).getRange('D:D').setNumberFormat('@');

  seedIfEmpty_(SH.PANEL, seedPanel_());
  seedIfEmpty_(SH.SESI, [['Penilaian Student Mall & SUB', '21 Oktober 2026 (Rabu)', '9.00 pagi', 1, 'Dibuka']]);
  seedIfEmpty_(SH.RUBRIK, seedRubrik_());
  seedIfEmpty_(SH.CHIP, [['Pelan kewangan kurang realistik'], ['Idea inovatif'], ['Strategi pemasaran jelas'],
    ['Objektif tidak boleh diukur'], ['Analisis pesaing lemah'], ['Pembentangan yakin']]);
  const s = seedPemohon_();
  seedIfEmpty_(SH.PEMOHON, s.pemohon);
  seedIfEmpty_(SH.PELAJAR, s.pelajar);

  const def = book.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(def);
  writeKeputusan_();
  SpreadsheetApp.getActive().toast('Sheet sedia. Seterusnya: Deploy > New deployment > Web app.');
}

function seedIfEmpty_(name, rows) {
  const sh = ss_().getSheetByName(name);
  if (sh.getLastRow() > 1) return;
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function seedPanel_() {
  return [
    ['Dr. Noraindah binti Abdullah Fahim', 'noraindah@utm.my', 'Panel', 'Aktif'],
    ['Dr. Osman bin Ayop', 'osmanayop@utm.my', 'Panel', 'Aktif'],
    ['En. Shamsul Azli bin Shamsuray', 'shamsulazli@utm.my', 'Panel', 'Aktif'],
    ['PM. Dr. Syed Norris Hikmi Syed Abdullah', 'norris@utm.my', 'Panel', 'Aktif'],
    ['Pn. Ayu Azrin binti Abdul Aziz', 'ayuazrin@utm.my', 'Panel', 'Aktif'],
    ['Pn. Sri Nurul Izza Bte Zakaria', 'srinurulizza@utm.my', 'Panel', 'Aktif'],
    ['Admin UTMXCITE', ADMIN_EMAIL, 'Admin', 'Aktif']
  ];
}

function seedRubrik_() {
  const els = 'Penerangan perniagaan|Misi & visi|Objektif|Analisis persaingan & tinjauan pasaran|Pelan operasi|Pelan pemasaran|Perancangan kewangan';
  return [
    [1, 1, 'Organisasi keseluruhan', 'Overall organization', 10, 'Tersusun · perintah logik yang jelas · agihan tugas yang jelas',
      'Sangat tersusun, aliran logik jelas, tugas ahli jelas', 'Kebanyakannya tersusun, ada bahagian kurang jelas', 'Tidak tersusun, tugas tidak dinyatakan', ''],
    [1, 2, 'Kandungan pelan perniagaan', 'Business proposal content', 20, 'Penerangan perniagaan · misi & visi · objektif · analisis persaingan & tinjauan pasaran · pelan operasi · pelan pemasaran · perancangan kewangan',
      'Ketujuh-tujuh elemen lengkap dan berkualiti', '4 hingga 5 elemen lengkap', '2 elemen atau kurang', els],
    [1, 3, 'Penerangan perniagaan', 'Description of business', 20, 'Cadangan perniagaan · objektif yang jelas · strategi keseluruhan',
      'Cadangan jelas, objektif spesifik dan boleh diukur, strategi menyeluruh', 'Jelas tetapi umum', 'Kabur, tiada objektif', ''],
    [1, 4, 'Kebolehpasaran produk / perkhidmatan', 'Marketability of product / services', 20, 'Strategi pemasaran · tahap permintaan produk/perkhidmatan',
      'Pasaran sasaran jelas, strategi sesuai, ada bukti permintaan', 'Ada strategi tanpa bukti', 'Tiada strategi atau permintaan tidak dinyatakan', ''],
    [1, 5, 'Inovasi', 'Innovativeness', 20, 'Sesuatu yang baharu · keunikan yang memberi kelebihan daya saing',
      'Baharu dan kelebihan daya saing jelas', 'Penambahbaikan kecil daripada yang sedia ada', 'Meniru yang sedia ada', ''],
    [1, 6, 'Pengurusan kewangan', 'Financial management', 10, 'Pengurusan modal & sumber · tempoh pulangan modal · perancangan jualan · pelan penggajian (HR Plan)',
      'Modal, kos, jualan, tempoh pulangan dan pelan penggajian realistik', 'Sebahagian dirancang', 'Tiada perancangan', '']
  ];
}

function seedPemohon_() {
  const D = 'https://drive.google.com/file/d/';
  const L = '/view?usp=drive_link';
  const pemohon = [
    [1, 'MARZMELL ENTERPRISE', 'SUB', '202403283104 (003661701-A)', 'Menjual & membaiki telefon bimbit', D + '1H237JlG0IYujW2igMaexEc_SoU_c6Gar' + L, '', 1, ''],
    [2, 'NANEL ENTERPRISE', 'Student Mall', '202503046671 (003700610-V)', 'Mini mart', D + '1a8IuaqowH9BMhnE0NbU0Fgxi8mJ2EdUE' + L, '', 2, ''],
    [3, 'CHEVAL ENTERPRISE', 'Student Mall', '201803349713 (JM0883451-V)', 'Pengurusan acara / menjual pakaian & aksesori', D + '1rEoTHeiVEj8nTMxz8G5RrhPXLGNLLHVj' + L, '', 3, ''],
    [4, 'VOLTRO CAFE', 'Student Mall', '202403299581 (003667755-D)', 'Makanan & minuman (waffle & sparkling drink)', D + '1NonrrvvqHrvJDz1NlSXTEOeRcdnROfw9' + L, '', 4, ''],
    [5, 'THE CUBE', 'Student Mall', '202503075507 (JM1020317-T)', 'Makanan & minuman (shave ice)', D + '1MfMIWN1ezl3MrodD76ZOJqrlnpMH1Kun' + L, '', 5, ''],
    [6, 'MAJORA BARBER', 'Student Mall', '202503331550 (SA0646761-T)', 'Kedai gunting rambut', D + '1NdfydnbvyPuG27IzI_vf-XSJeqUcLpZD' + L, '', 6, '']
  ];
  const pelajar = [
    [1, 'UMAR ADDIN BIN ZAINAL ABIDIN', 'A24KE0315', '050205-01-0217', 3, 'FKE', 'SARJANA MUDA KEJURUTERAAN ELEKTRONIK', 2.62],
    [1, 'MUHAMMAD FAIZ HAKIMI BIN PAUZI', 'A24FM0084', '050214-11-0551', 3, 'FM', 'SARJANA MUDA PERAKAUNAN', 3.53],
    [2, 'NURUL LIYANA BINTI RAHMAD', 'A23SC0330', '040301-14-0098', 4, 'FS', 'SARJANA MUDA SAINS (KIMIA)', 2.48],
    [3, 'ARVINTHIRAN A/L THANA BALAN', 'A25KT0110', '060623-05-0341', 2, 'FKT', 'SARJANA MUDA KEJURUTERAAN KIMIA', 1.95],
    [4, 'MUHAMMAD HARITH DANIEL BIN MOHD FAWZI', 'A22EA0095', '031210-10-0619', 4, 'FKA', 'SARJANA MUDA KEJURUTERAAN AWAM', 2.39],
    [5, 'LEANNE CHUNG HUI RU', 'A24KT0314', '050505-13-1088', 3, 'FKT', 'SARJANA MUDA KEJURUTERAAN KIMIA', 3.71],
    [6, 'MUHAMMAD KHAIRUL IKHWAN BIN ABDUL RAZAK', 'A25HP0143', '031115-08-0613', 2, 'FEST', 'SARJANA MUDA TEKNOLOGI DENGAN PENDIDIKAN (KEJURUTERAAN ELEKTRIK DAN ELEKTRONIK)', 3.42]
  ];
  return { pemohon: pemohon, pelajar: pelajar };
}
