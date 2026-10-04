/**
 * Pengesahan: log masuk e-mel + OTP, sesi berasaskan token, semakan peranan.
 * OTP dan sesi disimpan dalam CacheService (dalam bentuk hash); token tidak pernah disimpan dalam teks biasa.
 */

function normRole_(v) {
  var r = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return r === 'admin' ? ROLES.ADMIN : r === 'pic' ? ROLES.PIC : '';
}

/**
 * Tab Pengguna boleh disunting terus dalam Sheet, jadi nilai dinormalkan (huruf besar/kecil, ruang kosong).
 * Peranan selain Admin/PIC dianggap tidak sah: pengguna tidak aktif dan tiada akses (tidak jatuh ke PIC secara lalai).
 */
function parseUser_(row) {
  var akses = String(row.kpi_akses || '').split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(String);
  var role = normRole_(row.peranan);
  return {
    emel: normEmail_(row.emel),
    nama: String(row.nama || ''),
    peranan: role,
    fakulti: String(row.fakulti || '').trim(),
    kpiAkses: akses,
    aktif: /^ya$/i.test(String(row.aktif || '').trim()) && role !== '',
    _row: row._row
  };
}

function findUser_(email) {
  email = normEmail_(email);
  if (!email) return null;
  var rows = readTable_(SHEETS.USERS).rows;
  for (var i = 0; i < rows.length; i++) {
    if (normEmail_(rows[i].emel) === email) return parseUser_(rows[i]);
  }
  return null;
}

function publicUser_(u) {
  return { emel: u.emel, nama: u.nama, peranan: u.peranan, fakulti: u.fakulti, kpiAkses: u.kpiAkses };
}

function otpHash_(email, code) {
  return sha256Hex_(getSalt_() + '|' + email + '|' + code);
}

function requestOtp_(emailIn) {
  var email = normEmail_(emailIn);
  if (!isEmail_(email)) throw userError_('Alamat e-mel tidak sah.');

  var cache = CacheService.getScriptCache();
  var reqKey = 'otpreq:' + sha256Hex_(email);
  var count = parseInt(cache.get(reqKey) || '0', 10);
  if (count >= APP.OTP_MAX_REQUESTS) {
    throw userError_('Terlalu banyak permintaan OTP. Cuba lagi dalam satu jam.');
  }
  cache.put(reqKey, String(count + 1), 3600);

  var user = findUser_(email);
  if (user && user.aktif && emailDomainAllowed_(email)) {
    var code = randomDigits_(6);
    cache.put('otp:' + sha256Hex_(email), JSON.stringify({ h: otpHash_(email, code), a: 0 }), APP.OTP_TTL);
    MailApp.sendEmail({
      to: email,
      subject: '[' + APP.NAME + '] Kod OTP log masuk anda',
      name: APP.NAME,
      body: 'Salam ' + (user.nama || '') + ',\n\nKod OTP anda ialah: ' + code + '\n\n' +
        'Kod ini sah selama ' + Math.round(APP.OTP_TTL / 60) + ' minit dan hanya boleh digunakan sekali. ' +
        'Jika anda tidak membuat permintaan ini, abaikan e-mel ini.\n\n' + APP.NAME
    });
    audit_(user, 'OTP_DIMINTA', '', '', '');
  }
  // Mesej sama tanpa mengira sama ada e-mel berdaftar (elak penghitungan akaun).
  return { message: 'Jika e-mel itu berdaftar, kod OTP telah dihantar. Semak peti masuk anda.', ttl: APP.OTP_TTL };
}

function verifyOtp_(emailIn, codeIn) {
  var email = normEmail_(emailIn);
  var code = String(codeIn === null || codeIn === undefined ? '' : codeIn).replace(/\s+/g, '');
  var cache = CacheService.getScriptCache();
  var key = 'otp:' + sha256Hex_(email);
  var raw = cache.get(key);
  var bad = 'Kod OTP tidak sah atau telah tamat tempoh.';
  if (!raw || !/^\d{6}$/.test(code)) throw userError_(bad);
  var st = JSON.parse(raw);
  if (st.a >= APP.OTP_MAX_ATTEMPTS) { cache.remove(key); throw userError_('Terlalu banyak percubaan. Sila minta kod OTP baharu.'); }
  if (st.h !== otpHash_(email, code)) {
    st.a += 1;
    if (st.a >= APP.OTP_MAX_ATTEMPTS) cache.remove(key); else cache.put(key, JSON.stringify(st), APP.OTP_TTL);
    throw userError_(bad);
  }
  cache.remove(key);
  var user = findUser_(email);
  if (!user || !user.aktif) throw userError_(bad);

  var token = randomHex_(48);
  cache.put('sess:' + sha256Hex_(token), email, APP.SESSION_TTL);
  audit_(user, 'LOG_MASUK', '', '', '');
  return { token: token, user: publicUser_(user) };
}

function logout_(token) {
  if (!token) return true;
  var cache = CacheService.getScriptCache();
  var key = 'sess:' + sha256Hex_(String(token));
  var email = cache.get(key);
  cache.remove(key);
  if (email) audit_({ emel: email }, 'LOG_KELUAR', '', '', '');
  return true;
}

/** Pulangkan pengguna sah bagi token, atau lontar ralat pengesahan. Peranan dibaca semula daripada Sheet setiap kali. */
function requireUser_(token) {
  if (!token || typeof token !== 'string' || token.length < 32) throw authError_();
  var email = CacheService.getScriptCache().get('sess:' + sha256Hex_(token));
  if (!email) throw authError_();
  var user = findUser_(email);
  if (!user || !user.aktif) throw authError_();
  return user;
}

function requireAdmin_(token) {
  var user = requireUser_(token);
  if (user.peranan !== ROLES.ADMIN) throw userError_('Akses ditolak. Fungsi ini untuk Admin sahaja.');
  return user;
}

function facultyAllowedForKpi_(kpi, fakulti) {
  return !kpi.facultyWhitelist || kpi.facultyWhitelist.indexOf(fakulti) >= 0;
}

function canAccessKpi_(user, kpi) {
  if (user.peranan === ROLES.ADMIN) return true;
  return kpi.entry === 'faculty' && user.kpiAkses.indexOf(kpi.id) >= 0 && facultyAllowedForKpi_(kpi, user.fakulti);
}

function accessibleKpis_(user) {
  return KPIS.filter(function (k) { return canAccessKpi_(user, k); });
}
