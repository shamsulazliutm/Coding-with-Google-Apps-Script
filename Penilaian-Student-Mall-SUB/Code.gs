/**
 * Sistem Penilaian Permohonan Student Mall & SUB (UTMPreneur · UTMXCITE)
 *
 * FAIL 1 daripada 2 (Code.gs): pelayan + penyediaan sheet. Fail 2: Index.html (antara muka).
 *
 * Skrip terikat (bound) pada satu Google Sheet. Web app dilaksanakan sebagai pemilik skrip
 * (Execute as: Me, akses: Anyone). Pengguna log masuk dengan kod OTP 6 digit yang dihantar ke e-mel
 * berdaftar dalam sheet Panel, dan menerima token sesi. Tiada akaun Google diperlukan.
 * Panel hanya menerima data dan penilaian miliknya; admin menerima semuanya.
 */

const ADMIN_EMAIL = 'utmxcite@utm.my';
const LOGO_URL = ''; // pilihan: ganti logo lalai dalam Index.html dengan URL imej lain; kosong = guna logo dalam Index.html

const SH = {
  PANEL: 'Panel', PEMOHON: 'Pemohon', PELAJAR: 'Pelajar', SESI: 'Sesi', AGENDA: 'Agenda',
  DAFTAR: 'Daftar', RUBRIK: 'Rubrik', CHIP: 'Chip', TETAPAN: 'Tetapan', NILAI: 'Penilaian', KEPUTUSAN: 'Keputusan', LOG: 'Log'
};
const HEAD = {
  Panel: ['Nama', 'Emel', 'Peranan', 'Status', 'KodHash', 'KodTamat'],
  // Lajur Slot, Susunan dan StatusAkhir dalam Pemohon ialah versi lama; kini disimpan bagi setiap mesyuarat dalam Agenda.
  Pemohon: ['ID', 'Perniagaan', 'Jenis', 'SSM', 'JenisPerniagaan', 'PautanPelan', 'Slot', 'Susunan', 'StatusAkhir', 'TarikhMohon', 'Sumber'],
  Pelajar: ['PemohonID', 'Nama', 'Matrik', 'KP', 'Tahun', 'Fakulti', 'Kursus', 'CGPA', 'Emel', 'Telefon'],
  // Rekod mentah borang pelajar. Hanya yang disahkan urusetia disalin ke Pemohon/Pelajar (medan semasa sahaja).
  Daftar: ['ID', 'Tarikh', 'Status', 'PemohonID', 'Jenis', 'Lot', 'Perniagaan', 'JenisPerniagaan', 'Produk', 'StatusSSM', 'SSM', 'PautanSSM', 'PautanSSMInfo',
    'Tifoid', 'PautanTifoid', 'KursusMakanan', 'PautanKursus', 'SumberDana', 'PembiayaDana', 'JumlahDana', 'JualanBulanan',
    'AlamatPerniagaan', 'MulaPerniagaan', 'BilPekerja', 'LokasiPerniagaan', 'SebabBerniaga', 'PautanPelan',
    'Ketua', 'Matrik', 'Emel', 'Pelajar', 'Catatan', 'DisahkanOleh', 'TarikhSah'],
  Sesi: ['Nama', 'Tarikh', 'Masa', 'RubrikVersi', 'Status', 'ID', 'Tempat', 'Bil'],
  Agenda: ['SesiID', 'PemohonID', 'Susunan', 'Slot', 'StatusAkhir'],
  Rubrik: ['Versi', 'No', 'BM', 'EN', 'Maks', 'Sub', 'Tahap5', 'Tahap3', 'Tahap1', 'Elemen'],
  Chip: ['Teks'],
  Tetapan: ['Kunci', 'Nilai'],
  Penilaian: ['PemohonID', 'Emel', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
    'Elemen', 'Ulasan', 'Layak', 'Jumlah', 'Status', 'Dikemaskini',
    'Catatan1', 'Catatan2', 'Catatan3', 'Catatan4', 'Catatan5', 'Catatan6', 'DiisiOleh', 'SesiID'],
  Log: ['Masa', 'Pengguna', 'Tindakan', 'Butiran']
};
const NCRIT = 6;
const CODE_LEN = 8;          // panjang kod OTP (digit)
const CODE_TTL_HOURS = 48;   // kod sah sehingga digunakan, atau sehingga tempoh ini tamat
const LOGIN_FAILS = 30;      // maksimum cubaan kod salah (seluruh sistem) dalam 10 minit
const OTP_TTL = 600;         // kod OTP e-mel sah 10 minit
const OTP_TRIES = 5;         // maksimum cubaan salah bagi satu kod
const OTP_REQ_MAX = 3;       // maksimum permintaan kod bagi satu e-mel dalam 10 minit
const FOLDER_PELAN = 'Pelan Perniagaan UTMXCITE';   // folder Drive bagi pelan yang dimuat naik pelajar
const MAX_PLAN_MB = 8;
const SUBMIT_MAX_PER_HOUR = 60;
const TEMPLATE_CELL = 'B15';   // sel dalam sheet Tetapan yang menyimpan pautan templat pelan perniagaan
const FOLDER_CELL = 'B16';     // sel dalam sheet Tetapan yang menyimpan pautan folder Drive bagi pelan yang dimuat naik
const SULIT_CELL = 'B17';      // folder Drive bagi dokumen sulit pelajar (kad matrik, salinan KP, dll.; tidak dikongsi)
const FOLDER_SULIT = 'Dokumen Sulit UTMXCITE';
const SESSION_TTL = 21600;   // sesi log masuk 6 jam (had maksimum CacheService)
let ACTOR_ = '';            // e-mel pengguna semasa, untuk Log

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
    .addItem('Jana kod OTP admin', 'menuIssueAdmin')
    .addItem('Jana & e-mel kod OTP semua panel', 'menuIssueAll')
    .addItem('Buka kunci log masuk', 'menuUnlock')
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

/** Normalkan e-mel (buang ruang, huruf kecil) supaya perbandingan tidak gagal kerana ketikan manual dalam sheet. */
function em_(x) { return String(x == null ? '' : x).trim().toLowerCase(); }
function sent_(r) { return em_(r.Status) === 'dihantar'; }

function table_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh && name === SH.DAFTAR) {   // sheet baharu untuk pemasangan lama
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('Sheet "' + name + '" tiada. Jalankan menu Penilaian > Sediakan sheet.');
  const v = sh.getDataRange().getValues();
  const head = v.shift();
  const want = HEAD[name];
  if (want && head.length < want.length) { // sheet versi lama: tambah lajur baharu di hujung
    sh.getRange(1, head.length + 1, 1, want.length - head.length).setValues([want.slice(head.length)]);
    want.slice(head.length).forEach(function (k) { head.push(k); });
  }
  const rows = v.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (k, j) { o[k] = r[j] === undefined ? '' : r[j]; });
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
  append_(SH.LOG, { Masa: new Date(), Pengguna: ACTOR_, Tindakan: action, Butiran: detail || '' });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== Migrasi data lama (satu sesi) kepada banyak mesyuarat ===================== */

function ensureSheets_() {
  Object.keys(HEAD).forEach(function (name) {
    let sh = ss_().getSheetByName(name);
    if (!sh) {
      sh = ss_().insertSheet(name);
      sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
}

/** Sekali sahaja: beri ID kepada sesi lama, bina Agenda daripada pemohon sedia ada dan tandakan penilaian lama sebagai sesi pertama. */
function migrate_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_V2') === '1') return;
  ensureSheets_();
  const st = table_(SH.SESI);
  let maxId = 0;
  st.rows.forEach(function (r) { if (r.ID !== '' && r.ID != null) maxId = Math.max(maxId, Number(r.ID)); });
  st.rows.forEach(function (r) { if (r.ID === '' || r.ID == null) { r.ID = ++maxId; writeRow_(SH.SESI, r._row, r); } });
  const first = table_(SH.SESI).rows.sort(function (a, b) { return Number(a.ID) - Number(b.ID); })[0];
  if (first) {
    if (!table_(SH.AGENDA).rows.length) {
      table_(SH.PEMOHON).rows.forEach(function (p) {
        append_(SH.AGENDA, { SesiID: first.ID, PemohonID: p.ID, Susunan: p.Susunan, Slot: p.Slot, StatusAkhir: p.StatusAkhir });
      });
    }
    table_(SH.NILAI).rows.forEach(function (r) {
      if (r.SesiID === '' || r.SesiID == null) { r.SesiID = first.ID; writeRow_(SH.NILAI, r._row, r); }
    });
  }
  props.setProperty('MIG_V2', '1');
}

/* ===================== Pengguna dan peranan ===================== */

function roleOf_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  const p = table_(SH.PANEL).rows.filter(function (r) { return em_(r.Emel) === email; })[0];
  const aktif = p && em_(p.Status) === 'aktif';
  if (email === ADMIN_EMAIL) return { email: email, role: 'admin', name: p ? p.Nama : 'Admin' };
  if (p && aktif) return { email: email, role: em_(p.Peranan) === 'admin' ? 'admin' : 'panel', name: p.Nama };
  return null;
}

/** Pengguna semasa daripada token sesi. Peranan disemak semula pada setiap permintaan. */
function me_(token) {
  const none = { email: '', role: 'none', name: '' };
  if (!token) return none;
  const em = CacheService.getScriptCache().get('sess:' + hash_(token));
  const r = em ? roleOf_(em) : null;
  if (!r) return none;
  ACTOR_ = r.email;
  return r;
}

function need_(role, token) {
  migrate_();
  const u = me_(token);
  if (!u.email) throw new Error('SESI_TAMAT');
  if (u.role !== role) throw new Error('Akses ditolak.');
  return u;
}

/* ===================== Log masuk OTP ===================== */
/* Utama: panel masukkan e-mel, OTP 6 digit dihantar ke e-mel itu.
 * Pilihan: admin menjana kod 8 digit (tab Panel) yang boleh dimasukkan tanpa e-mel. Semua kod sekali guna. */

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let v = props.getProperty('OTP_SECRET');
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('OTP_SECRET', v); }
  return v;
}

function hash_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text + secret_()));
}

function randomCode_() {
  const hex = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const n = parseInt(hex, 16) % Math.pow(10, CODE_LEN);
  return ('00000000000' + n).slice(-CODE_LEN);
}

function groupCode_(c) { return c.replace(/(\d{4})(?=\d)/g, '$1 '); }

/** Jana kod baharu bagi satu e-mel. Kod lama dibatalkan. Dipulangkan sekali sahaja. */
function issueCode_(emel, sendMail) {
  const em = String(emel).trim().toLowerCase();
  const t = table_(SH.PANEL);
  const row = t.rows.filter(function (r) { return em_(r.Emel) === em; })[0];
  if (!row || em_(row.Status) !== 'aktif') throw new Error('Panel tidak aktif atau tiada dalam senarai: ' + em);
  const used = {};
  t.rows.forEach(function (r) { if (r.KodHash) used[r.KodHash] = 1; });
  let code = '', h = '';
  for (let i = 0; i < 20; i++) {
    code = randomCode_(); h = hash_('otp:' + code);
    if (!used[h]) break;
  }
  row.KodHash = h;
  row.KodTamat = Date.now() + CODE_TTL_HOURS * 3600 * 1000;
  writeRow_(SH.PANEL, row._row, row);
  let emailed = false, error = '';
  if (sendMail) {
    try {
      let url = '';
      try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { }
      MailApp.sendEmail({
        to: row.Emel, name: 'UTMPreneur Penilaian',
        subject: 'Kod OTP log masuk Penilaian Student Mall & SUB',
        body: 'Salam ' + row.Nama + ',\n\nKod OTP anda untuk sistem Penilaian Student Mall & SUB (UTMPreneur):\n\n    ' + groupCode_(code) +
          '\n\n' + (url ? 'Buka sistem: ' + url + '\n\n' : '') +
          'Masukkan kod ini pada skrin log masuk (tiada e-mel diperlukan). Kod hanya boleh digunakan sekali dan sah ' + CODE_TTL_HOURS +
          ' jam. Jangan kongsikan kod ini. Hubungi admin jika kod tidak berfungsi.'
      });
      emailed = true;
    } catch (e) { error = String(e.message || e); }
  }
  return { nama: row.Nama, emel: row.Emel, code: groupCode_(code), emailed: emailed, error: error };
}

function issueAll_(sendMail) {
  return table_(SH.PANEL).rows.filter(function (r) {
    return em_(r.Peranan) === 'panel' && em_(r.Status) === 'aktif';
  }).map(function (r) { return issueCode_(r.Emel, sendMail); });
}

/** Langkah 1 (log masuk e-mel): minta kod OTP 6 digit. Jawapan sama sama ada e-mel berdaftar atau tidak. */
function apiRequestOtp(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error('E-mel tidak sah.');
  return withLock_(function () {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get('otpreq:' + em) || 0);
    if (n >= OTP_REQ_MAX) throw new Error('Terlalu banyak permintaan kod. Cuba lagi dalam 10 minit.');
    cache.put('otpreq:' + em, String(n + 1), 600);
    if (roleOf_(em)) {
      const code = ('000000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000)).slice(-6);
      cache.put('otp:' + em, JSON.stringify({ h: hash_(code + em), t: 0 }), OTP_TTL);
      MailApp.sendEmail({
        to: em, name: 'UTMPreneur Penilaian',
        subject: 'Kod OTP anda: ' + code,
        body: 'Kod OTP untuk log masuk sistem Penilaian Student Mall & SUB (UTMPreneur):\n\n    ' + code +
          '\n\nKod sah selama 10 minit. Jangan kongsikan kod ini. Abaikan e-mel ini jika anda tidak memintanya.'
      });
    }
    return { ok: true };
  });
}

/** Langkah 2 (log masuk e-mel): sahkan e-mel dan kod, kemudian terima token sesi. */
function apiVerifyOtp(email, code) {
  const em = String(email || '').trim().toLowerCase();
  return withLock_(function () {
    const cache = CacheService.getScriptCache();
    const rec = JSON.parse(cache.get('otp:' + em) || 'null');
    if (!rec) throw new Error('Kod tamat tempoh atau tidak sah. Minta kod baharu.');
    if (rec.t >= OTP_TRIES) { cache.remove('otp:' + em); throw new Error('Terlalu banyak cubaan. Minta kod baharu.'); }
    if (hash_(String(code || '').trim() + em) !== rec.h) {
      rec.t++;
      cache.put('otp:' + em, JSON.stringify(rec), OTP_TTL);
      throw new Error('Kod tidak betul. Baki cubaan: ' + (OTP_TRIES - rec.t) + '.');
    }
    cache.remove('otp:' + em);
    const r = roleOf_(em);
    if (!r) throw new Error('Akaun tidak aktif.');
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('sess:' + hash_(token), em, SESSION_TTL);
    ACTOR_ = em;
    log_('Log masuk', r.role);
    return { token: token, me: r };
  });
}

/** Log masuk pilihan: kod OTP 8 digit yang dijana admin (tanpa e-mel). */
function apiLogin(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== CODE_LEN) throw new Error('Masukkan kod OTP ' + CODE_LEN + ' digit.');
  return withLock_(function () {
    const cache = CacheService.getScriptCache();
    const fails = Number(cache.get('loginfail') || 0);
    if (fails >= LOGIN_FAILS) throw new Error('Terlalu banyak cubaan salah. Cuba lagi dalam 10 minit atau hubungi admin.');
    const h = hash_('otp:' + c);
    const row = table_(SH.PANEL).rows.filter(function (r) { return r.KodHash === h; })[0];
    if (!row || Number(row.KodTamat) < Date.now() || em_(row.Status) !== 'aktif') {
      cache.put('loginfail', String(fails + 1), 600);
      throw new Error('Kod OTP tidak sah atau telah digunakan/tamat. Hubungi admin untuk kod baharu.');
    }
    row.KodHash = ''; row.KodTamat = '';   // kod sekali guna
    writeRow_(SH.PANEL, row._row, row);
    const r = roleOf_(row.Emel);
    if (!r) throw new Error('Akaun tidak aktif.');
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('sess:' + hash_(token), r.email, SESSION_TTL);
    ACTOR_ = r.email;
    log_('Log masuk', r.role);
    return { token: token, me: r };
  });
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().remove('sess:' + hash_(token));
  return true;
}

/** Admin: jana (dan e-mel) kod bagi satu panel. */
function apiIssueCode(token, emel, sendMail) {
  need_('admin', token);
  return withLock_(function () {
    const r = issueCode_(emel, !!sendMail);
    log_('Jana kod OTP', r.emel + (r.emailed ? ' (dihantar e-mel)' : ''));
    return r;
  });
}

/** Admin: jana (dan e-mel) kod bagi semua panel aktif. */
function apiIssueAll(token, sendMail) {
  need_('admin', token);
  return withLock_(function () {
    const res = issueAll_(!!sendMail);
    log_('Jana kod OTP semua panel', res.length + ' panel' + (sendMail ? ' (e-mel)' : ''));
    return res;
  });
}

/** Menu Sheet (pemilik skrip): jana kod admin; juga untuk pemulihan jika admin terkunci. */
function menuIssueAdmin() {
  const r = withLock_(function () { ACTOR_ = 'pemilik skrip'; const x = issueCode_(ADMIN_EMAIL, false); log_('Jana kod OTP admin (menu)', ADMIN_EMAIL); return x; });
  SpreadsheetApp.getUi().alert('Kod OTP admin', r.code + '\n\nSekali guna, sah ' + CODE_TTL_HOURS + ' jam. Masukkan kod ini pada skrin log masuk.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Pemulihan: set semula kaunter cubaan salah apabila log masuk terkunci. */
function menuUnlock() {
  CacheService.getScriptCache().remove('loginfail');
  SpreadsheetApp.getActive().toast('Kunci log masuk dibuka.');
}

function menuIssueAll() {
  const res = withLock_(function () { ACTOR_ = 'pemilik skrip'; const x = issueAll_(true); log_('Jana kod OTP semua panel (menu)', x.length + ' panel (e-mel)'); return x; });
  SpreadsheetApp.getUi().alert('Kod OTP panel', res.map(function (r) {
    return r.nama + ': ' + r.code + (r.emailed ? '  (e-mel dihantar)' : '  (e-mel GAGAL: ' + r.error + ')');
  }).join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
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

function fmtDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, 'Asia/Kuala_Lumpur', 'd MMMM yyyy') : String(v == null ? '' : v);
}

/** Sheets menukar "01/2026" menjadi tarikh. Lajur Bil dijadikan teks; nilai yang sudah rosak dipulihkan kepada "NN/tahun" daripada ID dan tahun tarikh itu. */
function bilStr_(r) {
  const v = r.Bil;
  if (v instanceof Date) return ('0' + (Number(r.ID) || 1)).slice(-2) + '/' + Utilities.formatDate(v, 'Asia/Kuala_Lumpur', 'yyyy');
  return String(v == null ? '' : v);
}
function bilText_() {
  const sh = ss_().getSheetByName(SH.SESI);
  if (sh) sh.getRange(1, HEAD.Sesi.indexOf('Bil') + 1, Math.max(sh.getLastRow(), 2) + 200, 1).setNumberFormat('@');
}

function sesiOf_(r) {
  return { id: Number(r.ID), nama: String(r.Nama || ''), tarikh: fmtDate_(r.Tarikh), masa: String(r.Masa == null ? '' : r.Masa),
    tempat: String(r.Tempat || ''), bil: bilStr_(r), versi: Number(r.RubrikVersi) || 1, status: r.Status || 'Draf', _row: r._row };
}

function sesiList_() {
  const t = table_(SH.SESI);
  const rosak = t.rows.filter(function (r) { return r.Bil instanceof Date; });
  if (rosak.length) {   // pulihkan sel Bil yang ditukar menjadi tarikh oleh Sheets
    bilText_();
    rosak.forEach(function (r) { t.sh.getRange(r._row, HEAD.Sesi.indexOf('Bil') + 1).setValue(bilStr_(r)); });
  }
  return t.rows.map(sesiOf_).sort(function (a, b) { return a.id - b.id; });
}

function sesiGet_(id) {
  const s = sesiList_().filter(function (x) { return x.id === Number(id); })[0];
  if (!s) throw new Error('Mesyuarat tidak dijumpai.');
  return s;
}

/** Mesyuarat yang sedang dibuka kepada panel (paling banyak satu). */
function sesiAktif_() {
  return sesiList_().filter(function (x) { return x.status === 'Dibuka'; })[0] || null;
}

function sesiWrite_(s) {
  bilText_();
  writeRow_(SH.SESI, s._row, { Nama: s.nama, Tarikh: s.tarikh, Masa: s.masa, RubrikVersi: s.versi, Status: s.status, ID: s.id, Tempat: s.tempat, Bil: s.bil });
}

function chips_() {
  return table_(SH.CHIP).rows.map(function (r) { return String(r.Teks); });
}

function maskKp_(kp) {
  return String(kp || '').trim().replace(/\d{4}$/, '****');
}

/** Pemohon. Dengan sesiId: hanya pemohon dalam agenda mesyuarat itu (mengikut susunan). Tanpa sesiId: semua pemohon. */
function apps_(mask, sesiId) {
  const stud = table_(SH.PELAJAR).rows;
  const ag = table_(SH.AGENDA).rows;
  const where = {};
  ag.forEach(function (a) { (where[Number(a.PemohonID)] = where[Number(a.PemohonID)] || []).push(Number(a.SesiID)); });
  const pem = table_(SH.PEMOHON).rows;
  let list;
  if (sesiId) {
    list = ag.filter(function (a) { return Number(a.SesiID) === Number(sesiId); })
      .sort(function (x, y) { return (Number(x.Susunan) || 99) - (Number(y.Susunan) || 99); })
      .map(function (a) { return { p: pem.filter(function (p) { return Number(p.ID) === Number(a.PemohonID); })[0], a: a }; })
      .filter(function (x) { return x.p; });
  } else {
    list = pem.sort(function (x, y) { return Number(x.ID) - Number(y.ID); }).map(function (p) { return { p: p, a: null }; });
  }
  return list.map(function (x) {
    const p = x.p;
    const st = stud.filter(function (s) { return Number(s.PemohonID) === Number(p.ID); }).map(function (s) {
      const o = { n: String(s.Nama).trim(), m: String(s.Matrik).trim(), kp: mask ? maskKp_(s.KP) : String(s.KP).trim(),
        yr: s.Tahun, fac: s.Fakulti, course: String(s.Kursus).trim(), cgpa: Number(s.CGPA) };
      if (!mask) { o.email = String(s.Emel || '').trim(); o.tel = String(s.Telefon || '').trim(); }
      return o;
    });
    return {
      id: Number(p.ID), biz: p.Perniagaan, type: p.Jenis, ssm: p.SSM, kind: p.JenisPerniagaan, plan: p.PautanPelan,
      slot: x.a ? (x.a.Slot || '') : '', order: x.a ? Number(x.a.Susunan) || 0 : 0, final: x.a ? (x.a.StatusAkhir || '') : '', st: st,
      mohon: fmtDate_(p.TarikhMohon), sumber: p.Sumber || '', sesi: where[Number(p.ID)] || []
    };
  });
}

function evalRow_(r) {
  const lv = [], mk = [];
  for (let i = 1; i <= NCRIT; i++) { lv.push(Number(r['T' + i]) || 0); mk.push(Number(r['M' + i]) || 0); }
  return {
    pid: Number(r.PemohonID), sesi: Number(r.SesiID) || 0, email: r.Emel, lv: lv, mk: mk,
    els: r.Elemen ? String(r.Elemen).split(',').map(function (x) { return x === '1'; }) : [],
    by: r.DiisiOleh || '', cm: r.Ulasan || '', ok: r.Layak || '', total: Number(r.Jumlah) || 0, status: r.Status || 'Draf',
    notes: [1, 2, 3, 4, 5, 6].map(function (i) { return String(r['Catatan' + i] || ''); })
  };
}

/* ===================== API: umum ===================== */

function apiBoot(token) {
  const u = me_(token);
  return { me: u, admin: ADMIN_EMAIL, logo: LOGO_URL };
}

/* ===================== API: panel ===================== */

function panelData_(u, sesi) {
  const aktif = table_(SH.PANEL).rows.filter(function (r) { return em_(r.Peranan) === 'panel' && em_(r.Status) === 'aktif'; });
  u.no = aktif.map(function (r) { return em_(r.Emel); }).indexOf(u.email) + 1;
  if (!sesi) return { me: u, sesi: null, crit: [], chips: [], apps: [], mine: {} };
  const mine = {};
  table_(SH.NILAI).rows.filter(function (r) { return em_(r.Emel) === u.email && Number(r.SesiID) === sesi.id; })
    .forEach(function (r) { mine[Number(r.PemohonID)] = evalRow_(r); });
  return { me: u, sesi: sesi, crit: rubrik_(sesi.versi), chips: chips_(), apps: apps_(true, sesi.id), mine: mine };
}

/** Panel hanya melihat mesyuarat yang sedang dibuka. */
function apiPanelData(token) {
  return panelData_(need_('panel', token), sesiAktif_());
}

/** Admin masuk ke paparan penilaian seorang panel bagi mesyuarat tertentu (untuk memberi markah bagi pihak panel itu). */
function targetPanel_(emel) {
  const t = roleOf_(emel);
  if (!t || t.role !== 'panel') throw new Error('Panel tidak aktif atau tiada dalam senarai.');
  return t;
}

function apiAdminEvalData(token, emel, sesiId) {
  need_('admin', token);
  return panelData_(targetPanel_(emel), sesiGet_(sesiId));
}

function apiSaveEval(token, pid, p, submit) {
  const u = need_('panel', token);
  const s = sesiAktif_();
  if (!s) throw new Error('Tiada mesyuarat dibuka untuk penilaian.');
  return saveEval_(u, pid, p, submit, false, s);
}

function apiSaveEvalAs(token, emel, pid, p, submit, sesiId) {
  need_('admin', token);
  return saveEval_(targetPanel_(emel), pid, p, submit, true, sesiGet_(sesiId));
}

/** Teras simpan penilaian bagi satu mesyuarat. byAdmin=true: admin bertindak bagi pihak panel (direkodkan). */
function saveEval_(u, pid, p, submit, byAdmin, s) {
  return withLock_(function () {
    const app = apps_(true, s.id).filter(function (a) { return a.id === Number(pid); })[0];
    if (!app) throw new Error('Permohonan ini tiada dalam agenda ' + (s.bil ? 'Bil ' + s.bil : s.nama) + '.');
    const crit = rubrik_(s.versi);
    const t = table_(SH.NILAI);
    const old = t.rows.filter(function (r) { return Number(r.PemohonID) === Number(pid) && Number(r.SesiID) === s.id && em_(r.Emel) === u.email; })[0];
    if (old && sent_(old)) throw new Error('Penilaian ini telah dihantar dan dikunci.' + (byAdmin ? ' Buka semula dahulu.' : ''));

    const row = { PemohonID: Number(pid), SesiID: s.id, Emel: u.email };
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
    for (let i = 1; i <= NCRIT; i++) row['Catatan' + i] = String((p.notes && p.notes[i - 1]) || '').slice(0, 1000);
    row.Layak = p.ok === 'Ya' || p.ok === 'Tidak' ? p.ok : '';
    row.Jumlah = total;
    row.Status = submit ? 'Dihantar' : 'Draf';
    row.Dikemaskini = new Date();
    row.DiisiOleh = byAdmin ? ACTOR_ : '';
    if (old) writeRow_(SH.NILAI, old._row, row); else append_(SH.NILAI, row);
    if (submit) {
      log_(byAdmin ? 'Admin hantar penilaian bagi panel' : 'Hantar penilaian', (s.bil ? 'Bil ' + s.bil + ' · ' : '') + app.biz + ' · ' + u.email + ' · ' + total + '/100');
      writeKeputusan_();
    } else if (byAdmin && !old) {
      log_('Admin mula menilai bagi panel', app.biz + ' · ' + u.email);
    }
    return evalRow_(row);
  });
}

/* ===================== Butiran laporan jawatankuasa ===================== */
/* Butiran pelantikan (pelantik, surat, pengerusi...) sama bagi semua mesyuarat. "syor" disimpan bagi setiap mesyuarat (syor:ID). */
const CFG_KEYS = ['pelantik', 'tujuan', 'suratFail', 'suratTarikh', 'tamat', 'pengerusi', 'jawatan', 'cgpaMin'];

function cfgSheet_() {
  let sh = ss_().getSheetByName(SH.TETAPAN);
  if (!sh) {  // sheet baharu pada pemasangan lama: cipta secara automatik
    sh = ss_().insertSheet(SH.TETAPAN);
    sh.getRange(1, 1, 1, 2).setValues([HEAD.Tetapan]).setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function cfg_() {
  const v = cfgSheet_().getDataRange().getValues();
  v.shift();
  const o = {};
  v.forEach(function (r) { if (r[0]) o[String(r[0])] = String(r[1] == null ? '' : r[1]); });
  return o;
}

function cfgSet_(key, val) {
  const sh = cfgSheet_();
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === key) { sh.getRange(i + 1, 2).setValue(val); return; }
  }
  sh.appendRow([key, val]);
}

function apiSaveTetapan(token, obj, sesiId) {
  need_('admin', token);
  return withLock_(function () {
    CFG_KEYS.forEach(function (k) {
      if (obj[k] !== undefined) cfgSet_(k, String(obj[k]).slice(0, 4000));
    });
    if (obj.syor !== undefined && sesiId) cfgSet_('syor:' + Number(sesiId), String(obj.syor).slice(0, 4000));
    log_('Simpan butiran laporan', 'Laporan jawatankuasa');
    return cfg_();
  });
}

/* ===================== API: admin ===================== */

function apiAdminData(token, sesiId) {
  need_('admin', token);
  const list = sesiList_();
  if (!list.length) throw new Error('Tiada mesyuarat. Jalankan menu Penilaian > Sediakan sheet.');
  const s = sesiId ? sesiGet_(sesiId) : (sesiAktif_() || list[list.length - 1]);
  const all = table_(SH.NILAI).rows;
  const allApps = apps_(false);
  const nilai = all.filter(function (r) { return Number(r.SesiID) === s.id; }).map(evalRow_);
  return {
    sesi: s, sesiList: list.map(function (x) {
      x.n = allApps.filter(function (a) { return a.sesi.indexOf(x.id) >= 0; }).length;
      return x;
    }),
    crit: rubrik_(s.versi), chips: chips_(), apps: apps_(false, s.id), allApps: allApps,
    belum: allApps.filter(function (a) { return !a.sesi.length; }).length,
    daftar: table_(SH.DAFTAR).rows.map(daftarOf_).reverse(),
    panels: table_(SH.PANEL).rows.map(function (r) {
      const sah = r.KodHash && Number(r.KodTamat) > Date.now();
      return { nama: r.Nama, emel: r.Emel, peranan: r.Peranan, status: r.Status,
        kod: sah ? Utilities.formatDate(new Date(Number(r.KodTamat)), 'Asia/Kuala_Lumpur', 'dd/MM HH:mm') : '' };
    }),
    nilai: nilai, keputusan: computeKeputusan_(s.id), cfg: cfg_(),
    versi: table_(SH.RUBRIK).rows.map(function (r) { return Number(r.Versi); }).reduce(function (a, b) { return Math.max(a, b); }, 1),
    log: table_(SH.LOG).rows.slice(-200).reverse().map(function (r) {
      return { masa: r.Masa instanceof Date ? Utilities.formatDate(r.Masa, 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm') : String(r.Masa), user: r.Pengguna, act: r.Tindakan, det: r.Butiran };
    })
  };
}

/** Simpan maklumat pemohon (tanpa menukar mesyuarat). */
function apiSaveApp(token, a) {
  need_('admin', token);
  return withLock_(function () {
    const id = saveApplication_(a, 'Admin');
    log_('Simpan permohonan', a.biz);
    return id;
  });
}

/** Teras simpan permohonan (admin, atau pengesahan rekod Daftar). */
function saveApplication_(a, sumber) {
  const t = table_(SH.PEMOHON);
  let id = Number(a.id) || 0;
  let old = null;
  if (id) {
    old = t.rows.filter(function (r) { return Number(r.ID) === id; })[0];
    if (!old) throw new Error('Permohonan tidak dijumpai.');
  } else {
    id = t.rows.reduce(function (m, r) { return Math.max(m, Number(r.ID)); }, 0) + 1;
  }
  if (!a.biz || (a.type !== 'Student Mall' && a.type !== 'SUB')) throw new Error('Nama perniagaan dan jenis diperlukan.');
  const row = Object.assign({}, old || {}, {
    ID: id, Perniagaan: a.biz, Jenis: a.type, SSM: a.ssm || '', JenisPerniagaan: a.kind || '', PautanPelan: a.plan || ''
  });
  if (!old) { row.TarikhMohon = new Date(); row.Sumber = sumber; }
  if (old) writeRow_(SH.PEMOHON, old._row, row); else append_(SH.PEMOHON, row);

  const ps = table_(SH.PELAJAR);
  const oldS = ps.rows.filter(function (r) { return Number(r.PemohonID) === id; });
  oldS.map(function (r) { return r._row; }).sort(function (x, y) { return y - x; }).forEach(function (n) { ps.sh.deleteRow(n); });
  (a.st || []).forEach(function (s) {
    if (!s.n) return;
    const base = oldS.filter(function (r) { return String(r.Matrik).trim() === String(s.m || '').trim() && String(r.Nama).trim() === String(s.n).trim(); })[0] || {};
    const rec = Object.assign({}, base, { PemohonID: id, Nama: s.n, Matrik: s.m, KP: s.kp, Tahun: s.yr, Fakulti: s.fac, Kursus: s.course, CGPA: s.cgpa, Emel: s.email || '', Telefon: s.tel || '' });
    append_(SH.PELAJAR, rec);
  });
  return id;
}

function apiSavePanel(token, p) {
  need_('admin', token);
  return withLock_(function () {
    const emel = String(p.emel || '').trim().toLowerCase();
    if (!p.nama || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emel)) throw new Error('Nama dan e-mel sah diperlukan.');
    const t = table_(SH.PANEL);
    const o = t.rows.filter(function (r) { return em_(r.Emel) === em_(emel); })[0];
    const row = Object.assign({}, o || {}, { Nama: p.nama, Emel: emel, Peranan: (o && o.Peranan) || 'Panel', Status: p.status || 'Aktif' });
    if (emel === ADMIN_EMAIL) { row.Peranan = 'Admin'; row.Status = 'Aktif'; }
    if (em_(row.Status) !== 'aktif') { row.KodHash = ''; row.KodTamat = ''; }
    if (o) writeRow_(SH.PANEL, o._row, row); else append_(SH.PANEL, row);
    log_(o ? 'Kemas kini panel' : 'Tambah panel', p.nama + ' · ' + emel + ' · ' + row.Status);
    return true;
  });
}

/* ---------- Mesyuarat (sesi) ---------- */

/** Cipta (id=0) atau kemas kini mesyuarat. Mesyuarat baharu bermula sebagai Draf dan tidak kelihatan kepada panel. */
function apiSaveSesi(token, s) {
  need_('admin', token);
  return withLock_(function () {
    if (!String(s.nama || '').trim()) throw new Error('Nama mesyuarat diperlukan.');
    const list = sesiList_();
    const id = Number(s.id) || 0;
    if (!id) {
      const nid = list.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
      const rub = table_(SH.RUBRIK).rows.reduce(function (m, r) { return Math.max(m, Number(r.Versi)); }, 1);
      bilText_();
      append_(SH.SESI, { Nama: s.nama, Tarikh: s.tarikh || '', Masa: s.masa || '', RubrikVersi: (list.length ? list[list.length - 1].versi : rub), Status: 'Draf', ID: nid, Tempat: s.tempat || '', Bil: s.bil || '' });
      log_('Cipta mesyuarat', s.nama);
      return nid;
    }
    const cur = sesiGet_(id);
    cur.nama = s.nama; cur.tarikh = s.tarikh || ''; cur.masa = s.masa || ''; cur.tempat = s.tempat || ''; cur.bil = s.bil || '';
    sesiWrite_(cur);
    log_('Kemas kini mesyuarat', s.nama);
    return id;
  });
}

/** Buka atau tutup mesyuarat. Hanya satu mesyuarat boleh dibuka pada satu masa. */
function apiSetSesiStatus(token, id, status) {
  need_('admin', token);
  if (status !== 'Dibuka' && status !== 'Ditutup') throw new Error('Status tidak sah.');
  return withLock_(function () {
    const cur = sesiGet_(id);
    if (status === 'Dibuka') {
      const other = sesiList_().filter(function (x) { return x.status === 'Dibuka' && x.id !== cur.id; })[0];
      if (other) throw new Error('Tutup "' + other.nama + '" dahulu. Hanya satu mesyuarat boleh dibuka kepada panel.');
    }
    cur.status = status;
    sesiWrite_(cur);
    log_(status === 'Ditutup' ? 'Tutup mesyuarat' : 'Buka mesyuarat', cur.nama);
    writeKeputusan_();
    return true;
  });
}

/* ---------- Agenda: urusetia menentukan pemohon masuk mesyuarat mana ---------- */

function hasEval_(sesiId, pid) {
  return table_(SH.NILAI).rows.some(function (r) { return Number(r.SesiID) === Number(sesiId) && Number(r.PemohonID) === Number(pid); });
}

/** Masukkan beberapa pemohon ke agenda sesuatu mesyuarat. Pemohon boleh berada dalam lebih daripada satu mesyuarat. */
function apiAssign(token, sesiId, pids) {
  need_('admin', token);
  return withLock_(function () {
    const s = sesiGet_(sesiId);
    if (s.status === 'Ditutup') throw new Error('Mesyuarat telah ditutup. Buka semula dahulu untuk menambah pemohon.');
    const ag = table_(SH.AGENDA).rows;
    let n = ag.filter(function (a) { return Number(a.SesiID) === s.id; }).reduce(function (m, a) { return Math.max(m, Number(a.Susunan) || 0); }, 0);
    let added = 0;
    const pem = table_(SH.PEMOHON).rows;
    (pids || []).forEach(function (pid) {
      pid = Number(pid);
      if (!pem.some(function (p) { return Number(p.ID) === pid; })) return;
      if (ag.some(function (a) { return Number(a.SesiID) === s.id && Number(a.PemohonID) === pid; })) return;
      append_(SH.AGENDA, { SesiID: s.id, PemohonID: pid, Susunan: ++n, Slot: '', StatusAkhir: '' });
      added++;
    });
    log_('Masukkan ke mesyuarat', s.nama + ' · ' + added + ' pemohon');
    writeKeputusan_();
    return added;
  });
}

/** Keluarkan pemohon daripada agenda (hanya jika belum ada penilaian bagi mesyuarat itu). */
function apiUnassign(token, sesiId, pid) {
  need_('admin', token);
  return withLock_(function () {
    const s = sesiGet_(sesiId);
    if (s.status === 'Ditutup') throw new Error('Mesyuarat telah ditutup.');
    if (hasEval_(s.id, pid)) throw new Error('Pemohon ini sudah mempunyai penilaian dalam mesyuarat ini, jadi tidak boleh dikeluarkan.');
    const t = table_(SH.AGENDA);
    const r = t.rows.filter(function (a) { return Number(a.SesiID) === s.id && Number(a.PemohonID) === Number(pid); })[0];
    if (!r) return false;
    t.sh.deleteRow(r._row);
    log_('Keluarkan daripada mesyuarat', s.nama + ' · pemohon ' + pid);
    writeKeputusan_();
    return true;
  });
}

/** Susunan pembentangan dan slot masa bagi sesuatu mesyuarat. */
function apiSaveAgenda(token, sesiId, order) {
  need_('admin', token);
  return withLock_(function () {
    const s = sesiGet_(sesiId);
    const t = table_(SH.AGENDA);
    (order || []).forEach(function (o, i) {
      const r = t.rows.filter(function (a) { return Number(a.SesiID) === s.id && Number(a.PemohonID) === Number(o.id); })[0];
      if (r) { r.Susunan = i + 1; r.Slot = o.slot || ''; writeRow_(SH.AGENDA, r._row, r); }
    });
    log_('Kemas kini agenda', s.nama);
    return true;
  });
}

function apiReopen(token, pid, emel, sesiId) {
  need_('admin', token);
  return withLock_(function () {
    const r = table_(SH.NILAI).rows.filter(function (x) { return Number(x.PemohonID) === Number(pid) && Number(x.SesiID) === Number(sesiId) && em_(x.Emel) === em_(emel); })[0];
    if (!r) throw new Error('Penilaian tidak dijumpai.');
    r.Status = 'Draf';
    writeRow_(SH.NILAI, r._row, r);
    log_('Buka semula penilaian', 'Permohonan ' + pid + ' · ' + emel);
    writeKeputusan_();
    return true;
  });
}

function apiSetStatusAkhir(token, sesiId, pid, status) {
  need_('admin', token);
  return withLock_(function () {
    const s = sesiGet_(sesiId);
    const r = table_(SH.AGENDA).rows.filter(function (a) { return Number(a.SesiID) === s.id && Number(a.PemohonID) === Number(pid); })[0];
    if (!r) throw new Error('Pemohon tiada dalam agenda mesyuarat ini.');
    r.StatusAkhir = status === 'Belum' ? '' : status;
    writeRow_(SH.AGENDA, r._row, r);
    log_('Status akhir', (s.bil ? 'Bil ' + s.bil + ' · ' : '') + 'pemohon ' + pid + ' → ' + status);
    writeKeputusan_();
    return true;
  });
}

/** Simpan rubrik sebagai versi baharu. useNow=true menukar mesyuarat terpilih kepada versi baharu (hanya jika tiada penilaian dihantar dalam mesyuarat itu). */
function apiSaveRubrik(token, crit, chips, useNow, sesiId) {
  need_('admin', token);
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
      const cur = sesiGet_(sesiId);
      const submitted = table_(SH.NILAI).rows.some(function (r) { return Number(r.SesiID) === cur.id && sent_(r); });
      if (submitted) throw new Error('Versi ' + ver + ' disimpan, tetapi mesyuarat ini tidak boleh bertukar versi kerana sudah ada penilaian dihantar.');
      cur.versi = ver; sesiWrite_(cur);
      used = true;
    }
    log_('Simpan rubrik', 'Versi ' + ver + (used ? ' (digunakan oleh mesyuarat terpilih)' : ''));
    return ver;
  });
}

function apiLogReport(token, desc) {
  need_('admin', token);
  log_('Jana laporan PDF', String(desc || '').slice(0, 100));
  return true;
}

function apiRefreshKeputusan(token) {
  need_('admin', token);
  writeKeputusan_();
  return true;
}

/* ===================== Keputusan ===================== */

function computeKeputusan_(sesiId) {
  const panels = table_(SH.PANEL).rows.filter(function (r) { return em_(r.Peranan) === 'panel' && em_(r.Status) === 'aktif'; });
  const all = table_(SH.NILAI).rows.filter(function (r) { return Number(r.SesiID) === Number(sesiId); });
  const nilai = all.filter(sent_);
  const draf = all.filter(function (r) { return !sent_(r); });
  const apps = apps_(false, sesiId);
  const rows = apps.map(function (a) {
    const pick = function (list, p) {
      return list.filter(function (r) { return Number(r.PemohonID) === a.id && em_(r.Emel) === em_(p.Emel); })[0];
    };
    const sc = panels.map(function (p) { const n = pick(nilai, p); return n ? Number(n.Jumlah) : null; });
    const dr = panels.map(function (p) { const n = pick(draf, p); return n ? Number(n.Jumlah) || 0 : null; });
    const got = sc.filter(function (x) { return x !== null; });
    const avg = got.length ? got.reduce(function (x, y) { return x + y; }, 0) / got.length : null;
    const layak = nilai.filter(function (r) { return Number(r.PemohonID) === a.id && r.Layak === 'Ya'; }).length;
    return { id: a.id, biz: a.biz, type: a.type, sc: sc, dr: dr, n: got.length, nd: dr.filter(function (x) { return x !== null; }).length,
      avg: avg, layak: layak, final: a.final, rank: null };
  });
  const sorted = rows.filter(function (r) { return r.avg !== null; }).sort(function (x, y) { return y.avg - x.avg; });
  sorted.forEach(function (r, i) {
    r.rank = i > 0 && Math.abs(sorted[i - 1].avg - r.avg) < 1e-9 ? sorted[i - 1].rank : i + 1;
  });
  return {
    panels: panels.map(function (p) {
      return {
        nama: p.Nama, emel: p.Emel,
        sent: nilai.filter(function (r) { return em_(r.Emel) === em_(p.Emel); }).length,
        draf: draf.filter(function (r) { return em_(r.Emel) === em_(p.Emel); }).length
      };
    }),
    rows: rows.sort(function (x, y) { return (x.rank || 999) - (y.rank || 999); }),
    total: apps.length, at: Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'HH:mm:ss')
  };
}

/** Tab Keputusan dalam Sheet: semua mesyuarat disusun berturutan, dengan lajur Mesyuarat. */
function writeKeputusan_() {
  const sh = ss_().getSheetByName(SH.KEPUTUSAN) || ss_().insertSheet(SH.KEPUTUSAN);
  sh.clear();
  const panels = table_(SH.PANEL).rows.filter(function (r) { return em_(r.Peranan) === 'panel' && em_(r.Status) === 'aktif'; });
  const head = ['Mesyuarat', 'Rank', 'Perniagaan', 'Jenis'].concat(panels.map(function (p) { return p.Nama; }), ['Dinilai', 'Draf (belum hantar)', 'Purata (/100)', 'Layak (Ya)', 'Status Akhir']);
  const body = [];
  sesiList_().forEach(function (s) {
    const k = computeKeputusan_(s.id);
    k.rows.forEach(function (r) {
      body.push([s.bil ? 'Bil ' + s.bil : s.nama, r.rank || '', r.biz, r.type].concat(r.sc.map(function (x) { return x === null ? '' : x; }),
        [r.n + '/' + k.panels.length, r.nd - 0, r.avg === null ? '' : Math.round(r.avg * 100) / 100, r.layak, r.final || 'Belum']));
    });
  });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#8a2d3b').setFontColor('#ffffff').setWrap(true);
  if (body.length) sh.getRange(2, 1, body.length, head.length).setValues(body);
  sh.setFrozenRows(1);
}

function refreshKeputusan() {
  writeKeputusan_();
  SpreadsheetApp.getActive().toast('Tab Keputusan dikemas kini.');
}

/* ===================== Borang permohonan pelajar (awam, tanpa log masuk) ===================== */

function cleanStr_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }

function folderIdOf_(v) {
  v = String(v || '').trim();
  const m = v.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || v.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || v.match(/^([A-Za-z0-9_-]{15,})$/);
  return m ? m[1] : '';
}

/**
 * Folder simpanan dibaca daripada sel Tetapan (B16 untuk pelan, B17 untuk dokumen sulit): pautan folder Drive atau ID folder.
 * Jika kosong atau tidak boleh diakses, folder lalai dicipta dan pautannya ditulis semula ke sel itu supaya urusetia nampak lokasinya.
 */
function driveFolder_(cellRef, defaultName) {
  const cell = cfgSheet_().getRange(cellRef);
  const raw = String(cell.getValue() || '').trim();
  const id = folderIdOf_(raw);
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { log_('Folder dalam Tetapan!' + cellRef + ' tidak boleh diakses', 'Guna folder lalai. ' + String(e.message || e).slice(0, 120)); }
  } else if (raw) {
    log_('Pautan folder dalam Tetapan!' + cellRef + ' tidak sah', 'Guna folder lalai.');
  }
  const it = DriveApp.getFoldersByName(defaultName);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(defaultName);
  if (!raw) { try { cell.setValue(f.getUrl()); } catch (e) { } }
  return f;
}

function planFolder_() { return driveFolder_(FOLDER_CELL, FOLDER_PELAN); }

/**
 * Pelajar mengisi maklumat dan memuat naik (atau memaut) pelan perniagaan. Rekod disimpan dengan Sumber = Pelajar dan belum dimasukkan
 * ke mana-mana mesyuarat; urusetia menentukan mesyuarat dalam tab Permohonan.
 */
const DOC_MAX_MB = 5;
const SUBMIT_MAX_TOTAL_MB = 24;

/** Semak jenis fail melalui bait awal. Pulangkan { mime, ext } atau null. */
function sniffDoc_(bytes, pdfOnly) {
  const b = [0, 1, 2, 3].map(function (i) { return i < bytes.length ? bytes[i] & 255 : -1; });   // bait GAS bertanda (-128..127)
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { mime: 'application/pdf', ext: 'pdf' };
  if (pdfOnly) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}
function hasDoc_(d) { return !!(d && d.b64); }
function oneOf_(v, list, label) {
  v = cleanStr_(v, 60);
  if (list.indexOf(v) < 0) throw new Error('Pilih ' + label + '.');
  return v;
}
function numOpt_(v, label) {
  if (v === '' || v == null) return '';
  const n = Number(String(v).replace(/,/g, ''));
  if (!(n >= 0 && n < 1e9)) throw new Error(label + ' tidak sah.');
  return Math.round(n * 100) / 100;
}

function apiSubmitApplication(p) {
  migrate_();
  p = p || {};
  if (cleanStr_(p.website, 50)) throw new Error('Permohonan tidak sah.');                 // honeypot untuk bot
  const type = p.type;
  if (type !== 'Student Mall' && type !== 'SUB') throw new Error('Pilih jenis permohonan: Student Mall atau SUB.');
  const biz = cleanStr_(p.biz, 120), kind = cleanStr_(p.kind, 160), ssm = cleanStr_(p.ssm, 80);
  if (biz.length < 2) throw new Error('Masukkan nama perniagaan.');
  if (kind.length < 3) throw new Error('Pilih jenis perniagaan.');
  const produk = cleanStr_(p.produk, 600);
  if (produk.length < 3) throw new Error('Nyatakan produk atau perkhidmatan utama.');
  const isFB = /^makanan/i.test(kind);
  const docs = p.docs || {};
  const ssmSts = oneOf_(p.ssmStatus, ['Berdaftar', 'Belum berdaftar'], 'status pendaftaran SSM');
  const ssmPlan = cleanStr_(p.ssmPlan, 160);
  if (ssmSts === 'Berdaftar') {
    if (ssm.length < 5) throw new Error('Masukkan No. pendaftaran SSM.');
    if (!hasDoc_(docs.ssm)) throw new Error('Muat naik sijil SSM.');
  }
  let ssmInfo = cleanStr_(p.ssmInfo, 500);
  if (ssmInfo && !/^https:\/\/[^\s]+$/i.test(ssmInfo)) throw new Error('Pautan maklumat SSM mesti bermula dengan https://');
  let tifoid = '', kursus = '';
  if (isFB) {
    tifoid = oneOf_(p.tifoid, ['Sudah (semua pengendali)', 'Sebahagian', 'Belum'], 'status suntikan tifoid');
    kursus = oneOf_(p.kursus, ['Sudah', 'Belum'], 'status kursus pengendali makanan');
    if (tifoid !== 'Belum' && !hasDoc_(docs.tifoid)) throw new Error('Muat naik bukti suntikan tifoid.');
    if (kursus === 'Sudah' && !hasDoc_(docs.kursus)) throw new Error('Muat naik sijil kursus pengendali makanan.');
  }
  const sumber = cleanStr_(p.sumber, 40), pembiaya = cleanStr_(p.pembiaya, 120);
  const jumlah = numOpt_(p.jumlah, 'Jumlah modal'), jualan = numOpt_(p.jualan, 'Jangkaan jualan');
  const pekerja = p.pekerja === '' || p.pekerja == null ? '' : Math.round(Number(p.pekerja));
  if (pekerja !== '' && !(pekerja >= 0 && pekerja < 1000)) throw new Error('Bilangan pekerja tidak sah.');
  let mula = '';
  if (cleanStr_(p.mula, 20)) { const d = new Date(String(p.mula).slice(0, 10) + 'T00:00:00+08:00'); if (isNaN(d.getTime())) throw new Error('Tarikh mula berniaga tidak sah.'); mula = d; }

  const sts = (p.st || []).slice(0, 4);
  if (!sts.length) throw new Error('Masukkan sekurang-kurangnya seorang pelajar.');
  const students = sts.map(function (x, i) {
    const k = 'Pelajar ' + (i + 1) + ': ';
    const utm = x.utm === 'Tidak' ? 'Tidak' : 'Ya';
    if (utm === 'Tidak' && i === 0) throw new Error(k + 'ketua mesti pelajar UTM.');
    const need = utm === 'Ya';
    const n = cleanStr_(x.n, 120).toUpperCase(), m = cleanStr_(x.m, 20).toUpperCase().replace(/\s+/g, '');
    const kpd = String(x.kp || '').replace(/[^0-9A-Za-z]/g, '');
    const yr = x.yr === '' || x.yr == null ? '' : Math.round(Number(x.yr)), cg = x.cgpa === '' || x.cgpa == null ? '' : Number(x.cgpa);
    const email = cleanStr_(x.email, 120).toLowerCase(), tel = String(x.tel || '').replace(/[^\d+]/g, '');
    const sex = oneOf_(x.sex, ['Lelaki', 'Perempuan'], 'jantina (' + k.trim() + ')');
    const nat = oneOf_(x.nat, ['Malaysia', 'Antarabangsa'], 'warganegara (' + k.trim() + ')');
    if (n.length < 3) throw new Error(k + 'masukkan nama penuh.');
    if (need && !/^[A-Z0-9]{7,12}$/.test(m)) throw new Error(k + 'No. Matrik tidak sah.');
    if (nat === 'Malaysia' ? kpd.length !== 12 || /\D/.test(kpd) : kpd.length < 5) throw new Error(k + (nat === 'Malaysia' ? 'No. Kad Pengenalan mesti 12 digit.' : 'No. pasport tidak sah.'));
    if (need && !(yr >= 1 && yr <= 6)) throw new Error(k + 'tahun pengajian mesti 1 hingga 6.');
    if (need && cleanStr_(x.fac, 40).length < 2) throw new Error(k + 'masukkan fakulti.');
    if (need && cleanStr_(x.course, 200).length < 3) throw new Error(k + 'masukkan program / kursus.');
    if (need && !(cg >= 0 && cg <= 4)) throw new Error(k + 'CGPA mesti antara 0.00 dan 4.00.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(k + 'e-mel tidak sah.');
    if (tel.length < 9 || tel.length > 14) throw new Error(k + 'no. telefon tidak sah.');
    return { n: n, m: m, kp: nat === 'Malaysia' ? kpd.slice(0, 6) + '-' + kpd.slice(6, 8) + '-' + kpd.slice(8) : kpd.toUpperCase(),
      yr: yr, fac: cleanStr_(x.fac, 40).toUpperCase(), course: cleanStr_(x.course, 200).toUpperCase(),
      cgpa: cg === '' ? '' : Math.round(cg * 100) / 100, email: email, tel: tel,
      extra: { Jantina: sex, Warganegara: nat, Bidang: cleanStr_(x.bid, 120), PelajarUTM: utm, AlamatKolej: cleanStr_(x.kol, 200), AlamatRumah: cleanStr_(x.rmh, 300) },
      docM: x.docM, docK: x.docK };
  });
  let planUrl = cleanStr_(p.planUrl, 500);
  if (planUrl && !/^https:\/\/[^\s]+$/i.test(planUrl)) throw new Error('Pautan pelan perniagaan mesti bermula dengan https://');
  const hasFile = !!(p.file && p.file.b64);
  if (!planUrl && !hasFile) throw new Error('Muat naik pelan perniagaan (PDF) atau berikan pautan.');
  if (p.ack !== true) throw new Error('Sila tandakan pengakuan sebelum menghantar.');

  return withLock_(function () {
    const cache = CacheService.getScriptCache();
    const cnt = Number(cache.get('subm') || 0);
    if (cnt >= SUBMIT_MAX_PER_HOUR) throw new Error('Terlalu banyak permohonan dihantar buat masa ini. Cuba lagi sebentar lagi.');
    cache.put('subm', String(cnt + 1), 3600);

    // elak permohonan berganda: matrik pelajar pertama + nama perniagaan yang sama
    const dafs = table_(SH.DAFTAR).rows;
    const dup = dafs.filter(function (r) { return r.Status !== 'Ditolak' && em_(r.Perniagaan) === em_(biz) && String(r.Matrik).trim().toUpperCase() === students[0].m; })[0];
    if (dup) throw new Error('Permohonan ini telah direkodkan (rujukan ' + dref_(dup.ID) + '). Tiada keperluan menghantar semula.');

    // semua fail disahkan dahulu sebelum apa-apa ditulis ke Drive
    const nextId = dafs.reduce(function (m, r) { return Math.max(m, Number(r.ID)); }, 0) + 1;
    const stem = dref_(nextId) + '_' + biz.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30);
    const jobs = [];
    let total = 0;
    function queue(d, label, pdfOnly, kind, put) {
      if (!hasDoc_(d)) return;
      let bytes;
      try { bytes = Utilities.base64Decode(String(d.b64)); } catch (e) { throw new Error('Fail ' + label + ' tidak dapat dibaca. Cuba lagi.'); }
      const lim = (pdfOnly ? MAX_PLAN_MB : DOC_MAX_MB) * 1024 * 1024;
      if (bytes.length > lim) throw new Error('Fail ' + label + ' melebihi ' + (pdfOnly ? MAX_PLAN_MB : DOC_MAX_MB) + ' MB.');
      total += bytes.length;
      const t = sniffDoc_(bytes, pdfOnly);
      if (!t) throw new Error('Fail ' + label + ' mesti ' + (pdfOnly ? 'PDF.' : 'PDF, JPG atau PNG.'));
      jobs.push({ bytes: bytes, t: t, name: stem + '_' + label.replace(/[^A-Za-z0-9]+/g, '_') + '.' + t.ext, kind: kind, put: put });
    }
    const out = { ssm: '', tifoid: '', kursus: '', plan: '' };
    queue(p.file, 'pelan perniagaan', true, 'pub', function (u) { out.plan = u; });
    queue(docs.ssm, 'sijil SSM', false, 'pub', function (u) { out.ssm = u; });
    if (isFB) { queue(docs.tifoid, 'bukti tifoid', false, 'pub', function (u) { out.tifoid = u; }); queue(docs.kursus, 'sijil makanan', false, 'pub', function (u) { out.kursus = u; }); }
    students.forEach(function (x, i) {
      queue(x.docM, 'kad matrik pelajar ' + (i + 1), false, 'prv', function (u) { x.extra.PautanMatrik = u; });
      queue(x.docK, 'kad pengenalan pelajar ' + (i + 1), false, 'prv', function (u) { x.extra.PautanKP = u; });
    });
    if (total > SUBMIT_MAX_TOTAL_MB * 1024 * 1024) throw new Error('Jumlah saiz fail melebihi ' + SUBMIT_MAX_TOTAL_MB + ' MB. Kecilkan fail atau gunakan pautan.');
    let pubF = null, prvF = null;
    jobs.forEach(function (j) {
      let f;
      if (j.kind === 'pub') { pubF = pubF || planFolder_(); f = pubF.createFile(Utilities.newBlob(j.bytes, j.t.mime, j.name)); }
      else { prvF = prvF || driveFolder_(SULIT_CELL, FOLDER_SULIT); f = prvF.createFile(Utilities.newBlob(j.bytes, j.t.mime, j.name)); }
      if (j.kind === 'pub') {
        try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
        catch (e) { log_('Perkongsian fail disekat (dasar domain)', dref_(nextId) + '. Kongsi folder kepada panel secara manual.'); }
      }
      j.put(f.getUrl());
    });
    if (out.plan) planUrl = out.plan;

    ACTOR_ = students[0].email;
    const extra = {
      StatusSSM: ssmSts === 'Berdaftar' ? 'Berdaftar' : ('Belum berdaftar' + (ssmPlan ? ': ' + ssmPlan : '')),
      Bentuk: cleanStr_(p.lot, 80), Produk: produk, PautanSSM: out.ssm, PautanSSMInfo: ssmInfo,
      Tifoid: tifoid, PautanTifoid: out.tifoid, KursusMakanan: kursus, PautanKursus: out.kursus,
      SumberDana: sumber, PembiayaDana: pembiaya, JumlahDana: jumlah, JualanBulanan: jualan,
      AlamatPerniagaan: cleanStr_(p.alamat, 300), MulaPerniagaan: mula, BilPekerja: pekerja,
      LokasiPerniagaan: cleanStr_(p.lokasi, 160), SebabBerniaga: cleanStr_(p.sebab, 600)
    };
    const id = nextId;
    append_(SH.DAFTAR, Object.assign({ ID: id, Tarikh: new Date(), Status: 'Baharu', Jenis: type, Perniagaan: biz.toUpperCase(), JenisPerniagaan: kind, SSM: ssmSts === 'Berdaftar' ? ssm : '',
      PautanPelan: planUrl, Ketua: students[0].n, Matrik: students[0].m, Emel: students[0].email, Pelajar: JSON.stringify(students.map(stuJson_)) }, extra));
    log_('Daftar baharu daripada pelajar', dref_(id) + ' · ' + biz + ' · ' + students[0].m);
    const ref = dref_(id);
    try {
      MailApp.sendEmail({ to: students[0].email, name: 'UTMXCITE', subject: 'Permohonan ' + type + ' diterima (rujukan ' + ref + ')',
        body: 'Salam ' + students[0].n + ',\n\nPermohonan ' + type + ' bagi ' + biz + ' telah diterima dan direkodkan.\n\nNo. rujukan: ' + ref +
          '\n\nUrusetia UTMXCITE akan menyemak dan mengesahkan pendaftaran anda, kemudian menentukan mesyuarat penilaian. Simpan no. rujukan ini untuk semakan.' });
    } catch (e) { }
    try {
      MailApp.sendEmail({ to: ADMIN_EMAIL, name: 'UTMPreneur Penilaian', subject: 'Pendaftaran baharu: ' + biz + ' (' + ref + ')',
        body: 'Permohonan ' + type + ' baharu telah diterima.\n\n' + biz + '\nPelajar: ' + students.map(function (x) { return x.n + ' (' + (x.m || 'bukan pelajar UTM') + ')'; }).join(', ') +
          '\nRujukan: ' + ref + '\n\nSemak dan sahkan dalam tab Daftar di sistem penilaian. Selepas disahkan, rekod masuk ke Permohonan.' });
    } catch (e) { }
    return { ok: true, ref: ref, id: id };
  });
}

function stuJson_(x) {
  return { n: x.n, m: x.m, kp: x.kp, yr: x.yr, fac: x.fac, course: x.course, cgpa: x.cgpa, email: x.email, tel: x.tel,
    sex: x.extra.Jantina, nat: x.extra.Warganegara, bid: x.extra.Bidang, utm: x.extra.PelajarUTM, kol: x.extra.AlamatKolej, rmh: x.extra.AlamatRumah,
    docM: x.extra.PautanMatrik || '', docK: x.extra.PautanKP || '' };
}
function daftarOf_(r) {
  let st = [];
  try { st = JSON.parse(r.Pelajar || '[]'); } catch (e) { }
  return { id: Number(r.ID), ref: dref_(r.ID), tarikh: fmtDate_(r.Tarikh), status: r.Status || 'Baharu', pid: r.PemohonID === '' ? 0 : Number(r.PemohonID),
    jenis: r.Jenis, lot: r.Lot, biz: r.Perniagaan, kind: r.JenisPerniagaan, produk: r.Produk, ssmStatus: r.StatusSSM, ssm: r.SSM, pautanSsm: r.PautanSSM, pautanSsmInfo: r.PautanSSMInfo,
    tifoid: r.Tifoid, pautanTifoid: r.PautanTifoid, kursusMakanan: r.KursusMakanan, pautanKursus: r.PautanKursus,
    sumber: r.SumberDana, pembiaya: r.PembiayaDana, jumlah: r.JumlahDana === '' ? '' : String(r.JumlahDana), jualan: r.JualanBulanan === '' ? '' : String(r.JualanBulanan),
    alamat: r.AlamatPerniagaan, mula: fmtDate_(r.MulaPerniagaan), pekerja: r.BilPekerja === '' ? '' : String(r.BilPekerja), lokasi: r.LokasiPerniagaan, sebab: r.SebabBerniaga,
    plan: r.PautanPelan, ketua: r.Ketua, matrik: r.Matrik, emel: r.Emel, st: st, catatan: r.Catatan || '', oleh: r.DisahkanOleh || '', sah: fmtDate_(r.TarikhSah) };
}

/** Urusetia mengesahkan rekod Daftar: disalin ke Pemohon/Pelajar (medan semasa sahaja) supaya boleh dimasukkan ke mesyuarat. */
function apiSahkanDaftar(token, id) {
  const u = need_('admin', token);
  return withLock_(function () {
    const t = table_(SH.DAFTAR);
    const r = t.rows.filter(function (x) { return Number(x.ID) === Number(id); })[0];
    if (!r) throw new Error('Rekod pendaftaran tidak dijumpai.');
    if (r.Status === 'Disahkan' && r.PemohonID !== '') return { pid: Number(r.PemohonID), already: true };
    const d = daftarOf_(r);
    const pid = saveApplication_({ id: 0, biz: d.biz, type: d.jenis, ssm: d.ssm, kind: d.kind, plan: d.plan,
      st: d.st.map(function (x) { return { n: x.n, m: x.m, kp: x.kp, yr: x.yr, fac: x.fac, course: x.course, cgpa: x.cgpa === '' ? 0 : x.cgpa, email: x.email, tel: x.tel }; }) }, 'Pelajar');
    const pem = table_(SH.PEMOHON).rows.filter(function (x) { return Number(x.ID) === pid; })[0];
    if (pem && r.Tarikh instanceof Date) { pem.TarikhMohon = r.Tarikh; writeRow_(SH.PEMOHON, pem._row, pem); }
    r.Status = 'Disahkan'; r.PemohonID = pid; r.DisahkanOleh = u.email; r.TarikhSah = new Date();
    writeRow_(SH.DAFTAR, r._row, r);
    log_('Sahkan pendaftaran', d.ref + ' -> ' + ref_(pid) + ' · ' + d.biz);
    try {
      MailApp.sendEmail({ to: d.emel, name: 'UTMXCITE', subject: 'Permohonan ' + d.jenis + ' disahkan (' + d.ref + ')',
        body: 'Salam ' + d.ketua + ',\n\nPermohonan ' + d.jenis + ' bagi ' + d.biz + ' telah disahkan oleh urusetia dan akan diproses untuk penilaian.\n\nRujukan pendaftaran: ' + d.ref + '\nRujukan permohonan: ' + ref_(pid) + '\n\nUrusetia akan memaklumkan mesyuarat penilaian anda.' });
    } catch (e) { }
    return { pid: pid };
  });
}

/** Tolak (atau pulihkan) rekod Daftar. Rekod yang sudah disahkan tidak boleh ditolak. */
function apiTolakDaftar(token, id, catatan, pulih) {
  const u = need_('admin', token);
  return withLock_(function () {
    const r = table_(SH.DAFTAR).rows.filter(function (x) { return Number(x.ID) === Number(id); })[0];
    if (!r) throw new Error('Rekod pendaftaran tidak dijumpai.');
    if (r.Status === 'Disahkan') throw new Error('Rekod sudah disahkan. Sunting atau gugurkan melalui tab Permohonan.');
    r.Status = pulih ? 'Baharu' : 'Ditolak'; r.Catatan = cleanStr_(catatan, 300); r.DisahkanOleh = u.email; r.TarikhSah = new Date();
    writeRow_(SH.DAFTAR, r._row, r);
    log_(pulih ? 'Pulihkan pendaftaran' : 'Tolak pendaftaran', dref_(id) + ' · ' + r.Perniagaan);
    return true;
  });
}

/** Maklumat awam untuk borang pelajar: pautan templat pelan perniagaan dibaca daripada Tetapan!B15 (hanya pautan https diterima). */
function apiPublicInfo() {
  let url = '';
  try { url = String(cfgSheet_().getRange(TEMPLATE_CELL).getValue() || '').trim(); } catch (e) { }
  if (!/^https:\/\/[^\s]+$/i.test(url)) url = '';
  return { templateUrl: url };
}

function ref_(id) { return 'PM-' + ('0000' + Number(id)).slice(-4); }
function dref_(id) { return 'DF-' + ('0000' + Number(id)).slice(-4); }

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
  // Tetapan!B15: pautan templat pelan perniagaan (dipaparkan kepada pelajar pada borang permohonan)
  const ts = cfgSheet_();
  if (!String(ts.getRange('A15').getValue() || '').trim()) {
    ts.getRange('A15:C15').setValues([['TemplatPelan', '', '<- Tampal pautan templat pelan perniagaan (https) dalam sel B15. Pelajar akan nampak butang muat turun pada borang permohonan.']]);
  }
  // Tetapan!B16: folder Drive bagi pelan yang dimuat naik pelajar (kosong = folder lalai dicipta dan pautannya ditulis di sini)
  if (!String(ts.getRange('A16').getValue() || '').trim()) {
    ts.getRange('A16:C16').setValues([['FolderPelan', '', '<- Tampal pautan folder Drive untuk menyimpan pelan yang dimuat naik pelajar (pilihan). Kosongkan untuk folder lalai.']]);
  }
  // Tetapan!B17: folder Drive sulit bagi kad matrik / kad pengenalan pelajar (tidak dikongsi dengan sesiapa)
  if (!String(ts.getRange('A17').getValue() || '').trim()) {
    ts.getRange('A17:C17').setValues([['FolderSulit', '', '<- Pilihan: pautan folder Drive untuk kad matrik dan kad pengenalan pelajar. Fail di sini tidak dikongsi. Kosongkan untuk folder lalai.']]);
  }
  // KP, matrik dan SSM mesti kekal sebagai teks
  book.getSheetByName(SH.PELAJAR).getRange('C:D').setNumberFormat('@');
  book.getSheetByName(SH.PEMOHON).getRange('D:D').setNumberFormat('@');

  seedIfEmpty_(SH.PANEL, seedPanel_());
  bilText_();
  seedIfEmpty_(SH.SESI, [['Mesyuarat JPPPDKP Bil 1/2026', '21 Oktober 2026 (Rabu)', '9.00 pagi', 1, 'Dibuka', 1, '', '01/2026']]);
  seedIfEmpty_(SH.RUBRIK, seedRubrik_());
  seedIfEmpty_(SH.CHIP, [['Pelan kewangan kurang realistik'], ['Idea inovatif'], ['Strategi pemasaran jelas'],
    ['Objektif tidak boleh diukur'], ['Analisis pesaing lemah'], ['Pembentangan yakin']]);
  const s = seedPemohon_();
  seedIfEmpty_(SH.PEMOHON, s.pemohon);
  seedIfEmpty_(SH.PELAJAR, s.pelajar);

  migrate_();   // bina Agenda mesyuarat pertama daripada pemohon sedia ada
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
