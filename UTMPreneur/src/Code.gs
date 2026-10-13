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
    'admin.import':  { auth: true,  roles: [ROLE.ADMIN_PENUH], fn: function (c, p) { return AdminApi.importPelajar(c, p); } },

    'rujukan.senarai': { auth: true, fn: function () { return Ref.all(); } },

    'profil.dapat':  { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c) { return Profiling.view(c); } },
    'profil.simpan': { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return Profiling.save(c, p); } },

    'ssu.saya':      { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c) { return Ssu.saya(c); } },
    'ssu.dapat':     { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return Ssu.dapat(c, p); } },
    'ssu.hantar':    { auth: true, roles: [ROLE.PELAJAR], matrik: true, fn: function (c, p) { return Ssu.hantar(c, p); } },
    'ssu.fail':      { auth: true, roles: [ROLE.PELAJAR, ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL, ROLE.PEMERHATI], fn: function (c, p) { return Ssu.fail(c, p); } },
    'ssu.admin.senarai':  { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminSenarai(c, p); } },
    'ssu.admin.butiran':  { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminButiran(c, p); } },
    'ssu.admin.putus':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminKeputusan(c, p); } },
    'ssu.admin.sijil':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminJanaSijil(c, p); } },
    'bantu.pelajar':      { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Bantu.pelajar(c, p); } },
    'profil.admin.dapat': { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Profiling.view(Bantu.ctx(c, p.noMatrik)); } },
    'profil.admin.simpan':{ auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Profiling.save(Bantu.ctx(c, p.noMatrik), p); } },
    'ssu.admin.pelajar':  { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Ssu.saya(Bantu.ctx(c, p.noMatrik)); } },
    'ssu.admin.dapat':    { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Ssu.dapat(Bantu.ctx(c, p.noMatrik), p); } },
    'ssu.admin.hantar':   { auth: true, roles: [ROLE.ADMIN_PENUH, ROLE.PEGAWAI_MODUL], fn: function (c, p) { return Ssu.hantarBagiPihak(c, p); } },
    'ssu.admin.sedia':    { auth: true, roles: ADMIN_ROLES, fn: function (c, p) { return Ssu.adminDaftarSedia(c, p); } }
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
      if (h.matrik && !ctx.noMatrik) throw appError_('MATRIK_TIDAK_DITEMUI');
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
