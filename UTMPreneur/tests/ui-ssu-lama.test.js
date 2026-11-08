'use strict';
/** Ujian antara muka: ciri SSU diserap daripada proses lama (tujuan, pensyarah, pengesahan ahli, dashboard). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ready, setCfg, login: rpcLogin, call, profiled, SSU } = require('./helpers');

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
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-ssulama-')), 'index.html');
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


const AINA = 'aina.contoh@graduate.utm.my', AMIRUL = 'amirul.contoh@graduate.utm.my';

test('UI SSU lama: tujuan, pilihan pensyarah, pengesahan ahli, butiran admin dan dashboard', { skip: !available && 'Chromium tiada' }, async () => {
  const env = ready();
  setCfg(env, 'PENGUJI_EMEL', [ADMIN, AINA, AMIRUL].join(','));
  const adm = rpcLogin(env, ADMIN).token;
  assert.equal(call(env, 'ssu.admin.pensyarahImport', adm, { teks: '12345;Dr. Contoh;FC;Pensyarah;dr.contoh@utm.my;' }).ok, true);
  profiled(env, AINA);

  const { browser, page, errors, login, shot } = await open(env, { width: 1280, height: 900 });
  const vis = (s) => page.locator(s).isVisible();
  const logout = async () => { await page.click('#btn-keluar'); await page.waitForSelector('#v-emel:not([hidden])'); };
  try {
    // ---------- pelajar: borang ----------
    await login(AINA);
    await page.click('#go-ssu');
    await page.click('text=Mohon SSU baharu');
    await page.waitForSelector('#sf-form [data-k=tujuan]');
    assert.equal(await vis('#sf-form [data-k=syaratSubjek]'), false);
    assert.equal(await vis('#sf-form [data-k=pensyarahPilih]'), false);
    await page.check('#sf-form [data-k=tujuan] input[value=SUBJEK]');
    assert.equal(await vis('#sf-form [data-k=pensyarahPilih]'), true, 'pilihan pensyarah dari senarai');
    assert.equal(await vis('#sf-form [data-k=pensyarah]'), false);
    const opts = await page.locator('#sf-form [data-k=pensyarahPilih] option').allTextContents();
    assert.ok(opts.some((t) => /DR\. CONTOH|Dr\. Contoh/i.test(t)) || opts.some((t) => /Contoh/i.test(t)));
    await page.selectOption('#sf-form [data-k=pensyarahPilih] select', '__LAIN');
    assert.equal(await vis('#sf-form [data-k=pensyarah]'), true, 'taip manual jika tiada dalam senarai');
    assert.equal(await vis('#sf-form [data-k=pensyarahNo]'), true);
    await page.selectOption('#sf-form [data-k=pensyarahPilih] select', '12345');
    assert.equal(await vis('#sf-form [data-k=pensyarah]'), false);
    await page.check('#sf-form [data-k=tujuan] input[value=ACARA]');
    assert.equal(await vis('#sf-form [data-k=syaratSubjek]'), false, 'subjek tersembunyi jika bukan keperluan subjek');
    await logout();

    // ---------- permohonan melalui RPC, ahli mengesahkan melalui UI ----------
    const aina = rpcLogin(env, AINA).token;
    const r = call(env, 'ssu.hantar', aina, Object.assign(SSU(), { pensyarahPilih: '12345', pensyarah: '', pensyarahNo: '', pensyarahEmel: '' }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const id = r.data.id;
    await login(AMIRUL, 'A23UJ0002');
    await page.click('#go-ssu');
    await page.waitForSelector('#ssu-sah');
    assert.match(await page.textContent('#ssu-sah'), /Sahkan penyertaan/);
    await shot('ssulama-01-sahkan');
    await page.click('#ssu-sah [data-sah]');
    await page.waitForFunction(() => !document.getElementById('ssu-sah'));
    assert.match(await page.textContent('#ssu-body'), /Penyertaan disahkan/);
    await logout();

    // ---------- admin: butiran dan dashboard ----------
    await login(ADMIN);
    await page.click('#go-ssu-admin');
    await page.waitForSelector('#sa-body tr');
    assert.ok((await page.locator('#sa-tujuan option').count()) >= 5, 'penapis tujuan');
    await page.selectOption('#sa-tujuan', 'ACARA');
    await page.waitForFunction(() => !document.querySelector('#sa-body tr'));
    await page.selectOption('#sa-tujuan', 'SUBJEK');
    await page.waitForSelector('#sa-body tr');
    await page.click('#sa-body tr');
    await page.waitForSelector('#sd-body table');
    const txt = await page.textContent('#sd-body');
    assert.match(txt, /Tujuan permohonan/);
    assert.match(txt, /Disahkan \d{4}-\d{2}-\d{2}/, 'ahli telah mengesahkan');
    assert.match(txt, /Disahkan \/ Verified/, 'pensyarah dipilih daripada senarai');
    assert.equal(await vis('#btn-tambah-pensyarah'), false);
    await shot('ssulama-02-butiran');
    await page.click('#btn-sa-balik');
    await page.click('#btn-sa-dash');
    await page.waitForSelector('#dash-body [data-dash]');
    assert.match(await page.textContent('#dash-body'), /Jumlah permohonan/);
    assert.equal(await vis('#dash-urus'), true, 'Admin Penuh boleh import pensyarah');
    await page.fill('#in-pensyarah', '777;Prof Baru;FKE;Prof;baru@utm.my;');
    await page.click('#btn-import-pensyarah');
    await page.waitForFunction(() => /1 ditambah/.test(document.getElementById('msg-import').textContent));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-dash-csv')]);
    assert.match(dl.suggestedFilename(), /^daftar-ssu_/);
    await shot('ssulama-03-dashboard');
    // sub-halaman bar sisi
    await page.click('#nav-ssu > button');
    assert.ok((await page.locator('#nav-ssu [data-sub]').allTextContents()).some((t) => /Dashboard SSU/.test(t)));
  } finally { await browser.close(); }
  assert.deepEqual(errors, []);
});
