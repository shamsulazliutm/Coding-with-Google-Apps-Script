/**
 * UTMPreneur: titik masuk web app dan penghantar RPC.
 * Semua panggilan antara muka melalui rpc(kaedah, token, muatan). Peranan disemak di sini (server),
 * bukan di antara muka.
 */

function doGet(e) {
  var t;
  try {
    if (!PropertiesService.getScriptProperties().getProperty(PROPS.INDUK_ID)) {
      return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">UTMPreneur belum disediakan. Tetapkan INDUK_ID dan jalankan setup().<br><i>UTMPreneur is not set up yet.</i></p>')
        .setTitle('UTMPreneur');
    }
    t = HtmlService.createTemplateFromFile('Index');
    t.versi = APP.VERSI;
    return t.evaluate()
      .setTitle('UTMPreneur · UTMXCITE')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    console.error('doGet gagal: ' + err);
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">Ralat. Sila cuba lagi.<br><i>Error. Please try again.</i></p>');
  }
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Jadual kaedah RPC. auth=false bermaksud tidak memerlukan sesi. roles=null bermaksud mana-mana peranan.
 * Dibina semasa dipanggil (bukan semasa muat fail) kerana Apps Script memuat fail mengikut urutan
 * dan ROLE/ADMIN_ROLES ditakrifkan dalam Config.gs.
 */
function rpcTable_() {
  return {
    'ping':          { auth: false, fn: function () { return { versi: APP.VERSI, masa: new Date().toISOString() }; } },
    'otp.minta':     { auth: false, fn: function (c, p) { return Auth.requestOtp(p.emel); } },
    'otp.sahkan':    { auth: false, fn: function (c, p) { return Auth.verifyOtp(p.emel, p.kod); } },
    'sesi.saya':     { auth: true,  fn: function (c) { return Auth.me(c); } },
    'daftar.matrik': { auth: true,  roles: [ROLE.PELAJAR], fn: function (c, p) { return Auth.claimMatric(c, p.noMatrik); } },
    'daftar.profil': { auth: true,  roles: [ROLE.STAF, ROLE.LUAR], fn: function (c, p) { return Auth.registerProfile(c, p); } },
    'admin.status':  { auth: true,  roles: ADMIN_ROLES, fn: function (c) { return AdminApi.status(c); } },
    'admin.senarai': { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c) { return AdminApi.listAdmins(c); } },
    'admin.tambah':  { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.addAdmin(c, p); } },
    'admin.aktif':   { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.setAdminActive(c, p); } },
    'admin.import':  { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.importPelajar(c, p); } }
  };
}

/** Dipanggil oleh antara muka melalui google.script.run. Sentiasa pulang objek {ok, data|error}. */
function rpc(method, token, payload) {
  try {
    if (method === 'sesi.keluar') { Auth.logout(token); return { ok: true, data: null }; }
    var table = rpcTable_();
    var h = Object.prototype.hasOwnProperty.call(table, method) ? table[method] : null;
    if (!h) throw appError_('KAEDAH_TIDAK_SAH');
    var ctx = null;
    if (h.auth) {
      ctx = Auth.requireSession(token);
      if (h.roles && h.roles.indexOf(ctx.role) < 0) {
        Audit.log(ctx, 'TIADA_KEBENARIAN', 'RPC', method, '', '', '');
        throw appError_('TIADA_KEBENARIAN');
      }
    }
    var out = h.fn(ctx, payload && typeof payload === 'object' ? payload : {});
    return { ok: true, data: out === undefined ? null : out };
  } catch (err) {
    if (err instanceof AppError || (err && err.name === 'AppError')) {
      return { ok: false, error: { code: err.code, bm: err.bm, en: err.en, extra: err.extra || null } };
    }
    console.error('RPC ' + method + ' gagal: ' + (err && err.stack ? err.stack : err));
    var m = MSG.RALAT_DALAMAN;
    return { ok: false, error: { code: 'RALAT_DALAMAN', bm: m[0], en: m[1], extra: null } };
  }
}
