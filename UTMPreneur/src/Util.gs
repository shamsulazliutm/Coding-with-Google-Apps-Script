/**
 * UTMPreneur: fungsi pembantu. Kebanyakannya fungsi tulen supaya boleh diuji dengan Node.
 */

/** Ralat aplikasi dengan mesej dwibahasa yang selamat dipaparkan kepada pengguna. */
function AppError(code, bm, en, extra) {
  this.name = 'AppError';
  this.code = code;
  this.bm = bm;
  this.en = en;
  this.extra = extra || null;
  this.message = code + ': ' + bm;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

var Util = {
  normEmail: function (s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  },

  isEmail: function (s) {
    return typeof s === 'string' && s.length <= 254 &&
      /^[a-z0-9._%+\-']+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$/.test(s);
  },

  normMatric: function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
  },

  isMatric: function (s) {
    return /^[A-Z0-9]{5,15}$/.test(s);
  },

  /** Tentukan peranan asas daripada domain emel. */
  roleByDomain: function (email, domainPelajar, domainStaf) {
    var e = Util.normEmail(email);
    var dp = Util.normEmail(domainPelajar);
    var ds = Util.normEmail(domainStaf);
    if (dp && e.slice(-dp.length) === dp) return ROLE.PELAJAR;
    if (ds && e.slice(-ds.length) === ds) return ROLE.STAF;
    return ROLE.LUAR;
  },

  /** Emel penyelia mesti domain staf sahaja (bukan domain pelajar). */
  isStaffEmail: function (email, domainPelajar, domainStaf) {
    return Util.roleByDomain(email, domainPelajar, domainStaf) === ROLE.STAF;
  },

  pad: function (n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  },

  /** Contoh: formatId('SSU', 2026, 14, 4) -> SSU-2026-0014 ; formatId('PRN', null, 7, 4) -> PRN-0007 */
  formatId: function (prefix, year, n, width) {
    return prefix + (year ? '-' + year : '') + '-' + Util.pad(n, width || 4);
  },

  toHex: function (bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = (bytes[i] + 256) % 256;
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  },

  sha256: function (str) {
    return Util.toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8));
  },

  /** Kod OTP 6 digit daripada rentetan heks rawak. */
  otpFromHex: function (hex) {
    var n = parseInt(String(hex).replace(/[^0-9a-f]/gi, '').substr(0, 8), 16);
    return Util.pad(n % 1000000, 6);
  },

  randomToken: function () {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  },

  randomOtp: function () {
    return Util.otpFromHex(Utilities.getUuid().replace(/-/g, ''));
  },

  safeEqual: function (a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  },

  /** Nilai sel "Ya" / TRUE / 1 dianggap benar. */
  truthy: function (v) {
    if (v === true) return true;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return ['ya', 'yes', 'true', '1', 'y', 'aktif'].indexOf(s) >= 0;
  },

  /** Ambil ID Drive daripada URL atau ID. */
  idFromUrl: function (url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return '';
    var m = s.match(/[-\w]{25,}/);
    return m ? m[0] : '';
  },

  /** Tukar nilai sel kepada rentetan ringkas. */
  str: function (v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return isNaN(v.getTime()) ? '' : v.toISOString();
    }
    return String(v).trim();
  },

  /** Penghurai CSV. Mengesan pemisah (koma, titik koma, tab) daripada baris pertama. */
  parseCsv: function (text) {
    var t = String(text == null ? '' : text).replace(/^﻿/, '');
    var firstLine = t.split(/\r?\n/)[0] || '';
    var delim = ',';
    var best = (firstLine.match(/,/g) || []).length;
    [';', '\t'].forEach(function (d) {
      var c = firstLine.split(d).length - 1;
      if (c > best) { best = c; delim = d; }
    });
    var rows = [], row = [], cell = '', inQ = false, i = 0;
    while (i < t.length) {
      var ch = t.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (t.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  },

  /** Hari dalam seminggu ISO: 1=Isnin ... 7=Ahad. */
  isoWeekday: function (date) {
    var d = date.getDay();
    return d === 0 ? 7 : d;
  },

  fmtDate: function (date, fmt) {
    return Utilities.formatDate(date, APP.TZ, fmt || 'yyyy-MM-dd');
  },

  /** Hari bekerja antara dua tarikh (tidak termasuk tarikh mula, termasuk tarikh akhir), tolak hujung minggu dan cuti. */
  workingDaysBetween: function (from, to, holidays, opDays) {
    var hol = {};
    (holidays || []).forEach(function (h) { hol[h] = true; });
    var days = opDays && opDays.length ? opDays : [1, 2, 3, 4, 5];
    var count = 0;
    var d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (d < end) {
      d.setDate(d.getDate() + 1);
      var iso = d.getFullYear() + '-' + Util.pad(d.getMonth() + 1, 2) + '-' + Util.pad(d.getDate(), 2);
      if (days.indexOf(Util.isoWeekday(d)) >= 0 && !hol[iso]) count++;
    }
    return count;
  },

  /** Terima Date atau rentetan tarikh (yyyy-MM-dd atau ISO). Pulang Date atau null. */
  toDate: function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], -8, 0, 0)); // tengah malam Asia/Kuala_Lumpur
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  },

  /** Kunci tarikh yyyy-MM-dd (zon waktu Malaysia). */
  dateKey: function (v) {
    var d = Util.toDate(v);
    return d ? Util.fmtDate(d, 'yyyy-MM-dd') : '';
  },

  BULAN_BM: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],

  /** 13 Oktober 2026 */
  fmtTarikhBM: function (v) {
    var k = Util.dateKey(v);
    if (!k) return '';
    var p = k.split('-');
    return parseInt(p[2], 10) + ' ' + Util.BULAN_BM[parseInt(p[1], 10) - 1] + ' ' + p[0];
  },

  /** Tambah n bulan pada tarikh (hari dihadkan pada hari terakhir bulan sasaran). Pulang Date. */
  addMonths: function (v, n) {
    var k = Util.dateKey(v).split('-').map(function (x) { return parseInt(x, 10); });
    var y = k[0], m = k[1] - 1 + n, d = k[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Util.toDate(y + '-' + Util.pad(m + 1, 2) + '-' + Util.pad(Math.min(d, last), 2));
  },

  /** Bilangan hari kalendar dari a ke b (b - a), mengikut tarikh Malaysia. */
  daysBetween: function (a, b) {
    var ka = Util.dateKey(a).split('-'), kb = Util.dateKey(b).split('-');
    var da = Date.UTC(+ka[0], +ka[1] - 1, +ka[2]), db = Date.UTC(+kb[0], +kb[1] - 1, +kb[2]);
    return Math.round((db - da) / 86400000);
  },

  /** Nombor sijil: XCITE-2026S00001-01 */
  noSijil: function (awalan, tahun, seq, kali) {
    return awalan + '-' + tahun + 'S' + Util.pad(seq, 5) + '-' + Util.pad(kali, 2);
  },

  /** Nombor RM tepat (maksimum 2 perpuluhan, tidak negatif). Pulang nombor atau null jika tidak sah. */
  parseRm: function (v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim().replace(/^rm\s*/i, '').replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var n = parseFloat(s);
    return n > 100000000 ? null : n;
  },

  /** Normalkan jantina kepada Lelaki / Perempuan; pulangkan '' jika tidak dikenali. */
  normJantina: function (v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (['l', 'lelaki', 'male', 'm'].indexOf(s) >= 0) return 'Lelaki';
    if (['p', 'perempuan', 'female', 'f'].indexOf(s) >= 0) return 'Perempuan';
    return '';
  }
};

/** Mesej pengguna dwibahasa. Kunci = kod ralat. */
var MSG = {
  EMEL_TIDAK_SAH: ['Emel tidak sah.', 'Invalid email.'],
  RATE_JEDA: ['Sila tunggu sebentar sebelum meminta kod baharu.', 'Please wait a moment before requesting a new code.'],
  RATE_SEJAM: ['Terlalu banyak permintaan kod. Cuba lagi dalam satu jam.', 'Too many code requests. Try again in an hour.'],
  RATE_HARIAN: ['Perkhidmatan sibuk. Cuba lagi kemudian.', 'Service is busy. Please try again later.'],
  UJI_TIADA_SENARAI: ['MOD UJIAN: emel ini tiada dalam senarai penguji.', 'TEST MODE: this email is not on the tester list.'],
  HANTAR_GAGAL: ['Kod tidak dapat dihantar. Cuba lagi.', 'The code could not be sent. Please try again.'],
  OTP_TAMAT: ['Kod telah tamat tempoh. Minta kod baharu.', 'The code has expired. Request a new one.'],
  OTP_SALAH: ['Kod tidak betul.', 'Incorrect code.'],
  OTP_TERLALU_BANYAK: ['Terlalu banyak percubaan. Minta kod baharu.', 'Too many attempts. Request a new code.'],
  AKAUN_DISEKAT: ['Akaun ini telah disekat. Sila hubungi UTMXCITE.', 'This account has been blocked. Please contact UTMXCITE.'],
  SESI_TAMAT: ['Sesi tamat. Sila log masuk semula.', 'Session expired. Please sign in again.'],
  TIADA_KEBENARIAN: ['Anda tiada kebenaran untuk tindakan ini.', 'You do not have permission for this action.'],
  KAEDAH_TIDAK_SAH: ['Permintaan tidak sah.', 'Invalid request.'],
  MATRIK_TIDAK_SAH: ['Format No. Matrik tidak sah.', 'Invalid matric number format.'],
  MATRIK_TIDAK_DITEMUI: ['No. Matrik tidak ditemui dalam rekod pelajar. Sila hubungi UTMXCITE.', 'Matric number not found in student records. Please contact UTMXCITE.'],
  EMEL_TIDAK_SEPADAN: ['Emel anda tidak sepadan dengan No. Matrik ini.', 'Your email does not match this matric number.'],
  MATRIK_DITUNTUT: ['No. Matrik ini telah didaftarkan dengan emel lain. Sila hubungi UTMXCITE.', 'This matric number is already registered with another email. Please contact UTMXCITE.'],
  STATUS_TIDAK_AKTIF: ['Status pelajar tidak aktif. Sila hubungi UTMXCITE.', 'Student status is not active. Please contact UTMXCITE.'],
  PERANAN_TIDAK_SESUAI: ['Tindakan ini tidak sesuai dengan peranan anda.', 'This action does not match your role.'],
  MAKLUMAT_TIDAK_LENGKAP: ['Sila lengkapkan semua maklumat wajib.', 'Please complete all required fields.'],
  TELEFON_TIDAK_SAH: ['No. telefon tidak sah.', 'Invalid phone number.'],
  SETUP_INDUK: ['Sistem belum disediakan (INDUK_ID tiada).', 'System is not set up (INDUK_ID missing).'],
  SETUP_TIADA_LINK: ['Spreadsheet belum didaftar dalam Link_Dokumen.', 'Spreadsheet is not registered in Link_Dokumen.'],
  CSV_KOSONG: ['Data CSV kosong.', 'CSV data is empty.'],
  CSV_TAJUK: ['Tajuk lajur CSV tidak lengkap.', 'CSV headers are incomplete.'],
  ADMIN_DIKUNCI: ['Admin utama tidak boleh diubah atau dinyahaktifkan.', 'The primary admin cannot be changed or deactivated.'],
  ADMIN_PERANAN: ['Peranan admin tidak sah.', 'Invalid admin role.'],
  PROFIL_LENGKAP_DULU: ['Sila lengkapkan profiling anda dahulu.', 'Please complete your profiling first.'],
  PROFIL_TIDAK_SAH: ['Maklumat profiling tidak sah. Semak medan yang bertanda.', 'Profiling details are invalid. Check the highlighted fields.'],
  SSU_TIDAK_SAH: ['Maklumat permohonan SSU tidak sah. Semak medan yang bertanda.', 'The SSU application is invalid. Check the highlighted fields.'],
  SSU_SUDAH_ADA: ['Anda sudah mempunyai permohonan atau SSU yang aktif.', 'You already have an active application or SSU.'],
  SSU_TIDAK_DITEMUI: ['Permohonan SSU tidak ditemui.', 'SSU application not found.'],
  SSU_TIDAK_BOLEH_UBAH: ['Permohonan ini tidak boleh diubah pada status semasa.', 'This application cannot be changed in its current status.'],
  SSU_TIDAK_BOLEH_PERBAHARUI: ['Pembaharuan belum dibenarkan atau tidak sesuai.', 'Renewal is not yet allowed or not applicable.'],
  SSU_CATATAN_WAJIB: ['Catatan wajib diisi untuk tindakan ini.', 'A note is required for this action.'],
  SSU_PERALIHAN_TIDAK_SAH: ['Tindakan ini tidak sah pada status semasa.', 'This action is not valid in the current status.'],
  SIJIL_TEMPLAT_TIADA: ['Templat sijil belum didaftar atau tidak boleh dibuka. Semak Link_Dokumen (TEMPLAT_SIJIL_SSU) dan kebenaran akaun pelaksana.', 'The certificate template is not registered or cannot be opened. Check Link_Dokumen (TEMPLAT_SIJIL_SSU) and the executing account\'s access.'],
  SIJIL_TIADA: ['Sijil belum dijana.', 'The certificate has not been generated.'],
  FAIL_TIDAK_SAH: ['Fail tidak sah. Gunakan jenis fail yang dibenarkan dan saiz yang dibenarkan.', 'Invalid file. Use an allowed file type and size.'],
  FAIL_TIDAK_DITEMUI: ['Fail tidak ditemui.', 'File not found.'],
  RALAT_DALAMAN: ['Ralat dalaman. Sila cuba lagi atau hubungi UTMXCITE.', 'Internal error. Please try again or contact UTMXCITE.']
};

function appError_(code, extra) {
  var m = MSG[code] || MSG.RALAT_DALAMAN;
  return new AppError(code, m[0], m[1], extra);
}
