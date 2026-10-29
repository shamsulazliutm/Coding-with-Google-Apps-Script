'use strict';
/** Ujian antara muka: rangka baharu (log masuk satu skrin, bar sisi proses, menu KPI mengikut peranan, laci telefon). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ready, setCfg, login: rpcLogin, call } = require('./helpers');

let chromium = null;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } catch (e) { /* tiada */ }
const available = chromium && fs.existsSync(CHROME);
const SRC = path.join(__dirname, '..', 'src');
const SHOTS = process.env.UI_SHOTS || '';

function buildHtml() {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!= include\('(\w+)'\) \?>/g, (m, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
  const shim = `<script>window.google = { script: { run: (function () {
    function make(s, f) { return { withSuccessHandler: function (fn) { return make(fn, f); }, withFailureHandler: function (fn) { return make(s, fn); },
      rpc: function (m, t, p) { window.__rpc(m, t, p).then(function (r) { if (s) s(r); }).catch(function (e) { if (f) f(e); }); } }; }
    return make(null, null); })() } };</script>`;
  return html.replace('<main id="main">', shim + '<main id="main">');
}

const PEMERHATI = 'pemerhati.contoh@utm.my', PENILAI = 'penilai.contoh@utm.my', ADMIN = 'utmxcite@utm.my', PELAJAR = 'aina.contoh@graduate.utm.my';

async function open(env, viewport) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-shell-')), 'index.html');
  fs.writeFileSync(file, buildHtml());
  await page.goto('file://' + file, { waitUntil: 'load' });
  const login = async (email, matrik) => {
    env.advance(120);
    await page.waitForSelector('#v-emel:not([hidden])');
    await page.fill('#in-emel', email);
    await page.click('#btn-minta');
    await page.waitForFunction(() => !document.getElementById('btn-sahkan').disabled);
    await page.locator('#otp-boxes input').first().click();
    await page.keyboard.type(env.lastCode(email));
    if (matrik) { await page.waitForSelector('#v-matrik:not([hidden])'); await page.fill('#in-matrik', matrik); await page.click('#btn-matrik'); }
    await page.waitForSelector('#v-home:not([hidden])');
  };
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  return { browser, page, errors, login, shot };
}

function prepare() {
  const env = ready();
  setCfg(env, 'PENGUJI_EMEL', [ADMIN, PELAJAR, PEMERHATI, PENILAI].join(','));
  setCfg(env, 'KPI_URL', 'https://example.test/kpi/exec');
  setCfg(env, 'LAMAN_UTMXCITE', 'https://utmxcite.example/laman');
  const t = rpcLogin(env, ADMIN).token;
  assert.equal(call(env, 'admin.tambah', t, { emel: PEMERHATI, nama: 'Pemerhati Contoh', peranan: 'Pemerhati', modul: '' }).ok, true);
  assert.equal(call(env, 'admin.tambah', t, { emel: PENILAI, nama: 'Penilai Contoh', peranan: 'Penilai', modul: '' }).ok, true);
  return env;
}

test('Log masuk satu skrin: pengepala, e-mel + OTP, dua butang, pautan UTMXCITE, MOD UJIAN', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare();
  const { browser, page, errors, shot } = await open(env, { width: 1100, height: 700 });
  try {
    await page.waitForSelector('#v-emel:not([hidden])');
    const vis = (s) => page.locator(s).isVisible();
    assert.equal(await vis('#hero'), true);
    assert.equal(await vis('#topbar'), false, 'bar atas tiada sebelum log masuk');
    assert.equal(await vis('#side'), false);
    assert.match(await page.textContent('#hero'), /UTMPreneur/);
    assert.match(await page.textContent('#hero'), /UTMXCITE · UTM/);
    await page.waitForFunction(() => !document.getElementById('banner-uji').hidden);
    // satu skrin: e-mel, kod OTP dan kedua-dua butang kelihatan serentak; OTP dikunci
    assert.equal(await vis('#in-emel'), true);
    assert.equal(await vis('#otp-boxes'), true);
    assert.equal(await page.locator('#otp-boxes input').first().isDisabled(), true);
    assert.equal(await page.locator('#btn-sahkan').isDisabled(), true);
    assert.match(await page.textContent('#btn-minta'), /Hantar \/ Hantar Semula Kod/);
    assert.match(await page.textContent('#btn-sahkan'), /Sahkan dan Log Masuk/);
    const a = await page.locator('#btn-minta').boundingBox(), b = await page.locator('#btn-sahkan').boundingBox();
    assert.ok(Math.abs(a.y - b.y) < 4 && a.x < b.x, 'butang bersebelahan');
    // pautan balik ke laman UTMXCITE
    await page.waitForFunction(() => !document.getElementById('lnk-laman').hidden);
    assert.equal(await page.getAttribute('#lnk-laman', 'href'), 'https://utmxcite.example/laman');
    await shot('shell-01-login');
    // selepas kod dihantar: OTP dibuka, butang hantar semula dikunci sementara
    await page.fill('#in-emel', PELAJAR);
    await page.click('#btn-minta');
    await page.waitForFunction(() => !document.getElementById('btn-sahkan').disabled);
    assert.equal(await page.locator('#btn-minta').isDisabled(), true);
    assert.equal(await vis('#btn-ubah-emel'), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Pautan UTMXCITE disembunyikan jika LAMAN_UTMXCITE kosong', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare(); setCfg(env, 'LAMAN_UTMXCITE', '');
  const { browser, page } = await open(env, { width: 1100, height: 700 });
  try {
    await page.waitForFunction(() => !document.getElementById('banner-uji').hidden);
    assert.equal(await page.locator('#lnk-laman').isVisible(), false);
  } finally { await browser.close(); }
});

test('Bar sisi pelajar: PROSES, sub-halaman, lipat, AKAN DATANG, tiada menu KPI', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare();
  const { browser, page, errors, login, shot } = await open(env, { width: 1280, height: 900 });
  try {
    await login(PELAJAR, 'A23UJ0001');
    const vis = (s) => page.locator(s).isVisible();
    assert.equal(await vis('#side'), true);
    assert.equal(await vis('#topbar'), true);
    assert.equal(await vis('#hero'), false);
    assert.equal(await vis('#nav-utama'), true);
    assert.equal(await vis('#nav-profiling'), true);
    assert.equal(await vis('#nav-ssu'), true);
    assert.equal(await vis('#nav-lot'), true);
    assert.equal(await vis('#nav-kew'), true);
    assert.equal(await vis('#nav-mk'), true);
    assert.equal(await vis('#nav-kpi'), false, 'pelajar tidak melihat KPI');
    assert.equal(await vis('#nav-pentadbiran'), false);
    const side = await page.textContent('#side');
    for (const t of ['Mikro Kredit', 'Dana Program', 'Inovasi dan Anugerah', 'AKAN DATANG']) assert.match(side, new RegExp(t));
    assert.equal(await page.locator('#side button.off').first().isDisabled(), true);
    // sub-halaman terlipat pada mulanya
    assert.equal(await page.locator('#nav-lot [data-sub]').count(), 0);
    await page.click('#nav-lot > button');
    await page.waitForSelector('#v-rn:not([hidden])');
    const subs = await page.locator('#nav-lot [data-sub]').allTextContents();
    assert.deepEqual(subs.map((x) => x.trim()), ['Lot tersedia', 'Permohonan saya', 'Tawaran dan dokumen', 'Bil dan bayaran', 'Pekerja dan peralatan']);
    await shot('shell-02-pelajar-lot');
    // klik semula pengepala melipat
    await page.click('#nav-lot > button');
    assert.equal(await page.locator('#nav-lot [data-sub]').count(), 0);
    // Makerspace: sub-halaman
    await page.click('#nav-mk > button');
    await page.waitForSelector('#v-mk:not([hidden])');
    assert.deepEqual((await page.locator('#nav-mk [data-sub]').allTextContents()).map((x) => x.trim()),
      ['Tempah ruang', 'Laser Cut dan 3D Printer', 'Pinjaman peralatan', 'Tempahan dan bayaran saya']);
    // tiada ruang/alat dikonfigurasi dalam persekitaran ujian: butang tempahan dikunci, jadi sub-halaman hanya menjadi aktif
    await page.click('#nav-mk [data-sub="2"]');
    assert.match(await page.getAttribute('#nav-mk [data-sub="2"]', 'class'), /on/);
    assert.equal(await vis('#v-mk'), true);
    // Utama kembali ke halaman utama
    await page.click('#nav-utama');
    await page.waitForSelector('#v-home:not([hidden])');
    assert.match(await page.getAttribute('#nav-utama', 'class') || '', /on/);
    // log keluar dari bar sisi
    await page.click('#side-keluar');
    await page.waitForSelector('#v-emel:not([hidden])');
    assert.equal(await vis('#side'), false);
    assert.equal(await vis('#hero'), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Menu KPI mengikut peranan: Admin Penuh ubah; Pemerhati baca sahaja; Penilai dan pelajar tiada', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare();
  const { browser, page, errors, login, shot } = await open(env, { width: 1280, height: 900 });
  const logout = async () => { await page.click('#btn-keluar'); await page.waitForSelector('#v-emel:not([hidden])'); };
  try {
    // Admin Penuh
    await login(ADMIN);
    assert.equal(await page.locator('#nav-kpi').isVisible(), true);
    assert.equal(await page.locator('#nav-pentadbiran').isVisible(), true);
    await page.click('#nav-kpi > button');
    await page.waitForSelector('#v-kpi-frame:not([hidden])');
    const subs = (await page.locator('#nav-kpi [data-sub]').allTextContents()).map((x) => x.trim());
    assert.deepEqual(subs, ['Infografik', 'Dashboard', 'KPT · Kementerian', 'KAI · Universiti', 'DKAI · Jabatan (JTNC HEPA)', 'CKAI · Pusat (UTMXCITE)', 'Sasaran dan input manual']);
    assert.match(await page.getAttribute('#kf-frame', 'src'), /^https:\/\/example\.test\/kpi\/exec\?view=infografik&embed=1$/);
    await page.click('#nav-kpi [data-sub="6"]');
    await page.waitForFunction(() => /view=sasaran/.test(document.getElementById('kf-frame').getAttribute('src')));
    assert.equal(await page.locator('#kf-ro').isVisible(), false, 'Admin Penuh boleh mengubah sasaran');
    assert.doesNotMatch(await page.getAttribute('#kf-frame', 'src'), /mode=baca/);
    await shot('shell-03-kpi-admin');
    // Pentadbiran memuat Penyegerakan KPI
    await page.click('#nav-pentadbiran > button');
    const pent = (await page.locator('#nav-pentadbiran [data-sub]').allTextContents()).map((x) => x.trim());
    for (const t of ['Import pelajar', 'Urus admin', 'Status sistem', 'Penyegerakan KPI']) assert.ok(pent.includes(t), t);
    await page.click('#nav-pentadbiran [data-sub="3"]');
    await page.waitForSelector('#v-kpi:not([hidden])');
    await logout();

    // Pemerhati: baca sahaja
    await login(PEMERHATI);
    assert.equal(await page.locator('#nav-kpi').isVisible(), true);
    await page.click('#nav-kpi > button');
    await page.click('#nav-kpi [data-sub="6"]');
    await page.waitForSelector('#kf-ro:not([hidden])');
    assert.match(await page.getAttribute('#kf-frame', 'src'), /mode=baca/);
    const pp = (await page.locator('#nav-pentadbiran').count()) ? (await page.locator('#nav-pentadbiran').textContent()) : '';
    assert.doesNotMatch(pp, /Import pelajar|Urus admin/);
    await logout();

    // Penilai: tiada KPI
    await login(PENILAI);
    assert.equal(await page.locator('#nav-kpi').count(), 0);
    await logout();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Menu KPI: URL belum ditetapkan memaparkan mesej mesra', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare(); setCfg(env, 'KPI_URL', '');
  const { browser, page, login } = await open(env, { width: 1280, height: 900 });
  try {
    await login(ADMIN);
    await page.click('#nav-kpi > button');
    await page.waitForSelector('#v-kpi-frame:not([hidden])');
    assert.equal(await page.locator('#kf-kosong').isVisible(), true);
    assert.equal(await page.locator('#kf-frame').isVisible(), false);
  } finally { await browser.close(); }
});

test('Bar sisi admin: kumpulan proses, lencana tugasan; telefon: laci hamburger', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare();
  const { browser, page, errors, login, shot } = await open(env, { width: 390, height: 844 });
  try {
    await login(ADMIN);
    const vis = (s) => page.locator(s).isVisible();
    // telefon: bar sisi tersembunyi di luar skrin; butang hamburger kelihatan
    assert.equal(await vis('#btn-menu'), true);
    const x0 = (await page.locator('#side').boundingBox()).x;
    assert.ok(x0 < 0, 'laci tertutup (di luar skrin)');
    await page.click('#btn-menu');
    await page.waitForFunction(() => document.getElementById('side').classList.contains('open'));
    assert.equal(await vis('#scrim'), true);
    assert.equal(await page.getAttribute('#btn-menu', 'aria-expanded'), 'true');
    await page.waitForFunction(() => document.getElementById('side').getBoundingClientRect().x >= 0);
    await shot('shell-04-telefon-laci');
    for (const id of ['#nav-bantu', '#nav-ssu', '#nav-lot', '#nav-kew', '#nav-mk']) assert.equal(await vis(id), true, id);
    // memilih item menutup laci
    await page.click('#nav-mk > button');
    await page.waitForSelector('#v-mk-admin:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('side').classList.contains('open'));
    assert.equal(await vis('#scrim'), false);
    // buka semula dan tutup melalui tabir
    await page.click('#btn-menu');
    await page.waitForFunction(() => document.getElementById('side').classList.contains('open'));
    await page.mouse.click(380, 600);
    await page.waitForFunction(() => !document.getElementById('side').classList.contains('open'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Lencana tugasan pada bar sisi admin daripada data sedia ada', { skip: !available && 'Chromium tiada' }, async () => {
  const env = prepare();
  const { browser, page, login } = await open(env, { width: 1280, height: 900 });
  try {
    await login(ADMIN);
    // simulasi: pil modul dikemas kini oleh kod modul selepas data dimuat
    await page.evaluate(() => { var p = document.getElementById('pill-ssu-admin'); p.textContent = '3 perlu tindakan'; p.className = 'pill warn'; });
    await page.waitForFunction(() => { var b = document.querySelector('#nav-ssu .bd'); return b && !b.hidden && b.textContent === '3'; });
  } finally { await browser.close(); }
});
