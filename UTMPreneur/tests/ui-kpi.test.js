'use strict';
/** Ujian antara muka: halaman Penyegerakan KPI (Admin Penuh). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ready, setCfg } = require('./helpers');

let chromium = null;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } catch (e) { /* tiada */ }
const available = chromium && fs.existsSync(CHROME);
const SRC = path.join(__dirname, '..', 'src');

function buildHtml() {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!= include\('(\w+)'\) \?>/g, (m, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
  const shim = `<script>window.google = { script: { run: (function () {
    function make(s, f) { return { withSuccessHandler: function (fn) { return make(fn, f); }, withFailureHandler: function (fn) { return make(s, fn); },
      rpc: function (m, t, p) { window.__rpc(m, t, p).then(function (r) { if (s) s(r); }).catch(function (e) { if (f) f(e); }); } }; }
    return make(null, null); })() } };</script>`;
  return html.replace('<main id="main">', shim + '<main id="main">');
}

test('UI: Admin Penuh membuka Penyegerakan KPI dan menyegerak', { skip: !available && 'Chromium tiada' }, async () => {
  const env = ready();
  const id = env.run(`SpreadsheetApp.create('KPI UJI').getId()`);
  setCfg(env, 'KPI_SHEET_ID', id);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-uikpi-')), 'index.html');
    fs.writeFileSync(file, buildHtml());
    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.fill('#in-emel', 'utmxcite@utm.my');
    await page.click('#btn-minta');
    await page.waitForSelector('#v-otp:not([hidden])');
    await page.locator('#otp-boxes input').first().click();
    await page.keyboard.type(env.lastCode('utmxcite@utm.my'));
    await page.waitForSelector('#v-home:not([hidden])');
    await page.click('#go-kpi');
    await page.waitForSelector('#v-kpi:not([hidden])');
    assert.match(await page.textContent('#kpi-status'), /Telah ditetapkan/);
    await page.click('#kpi-btn-segerak');
    await page.waitForFunction(() => /Penyegerakan selesai/.test(document.getElementById('kpi-msg').textContent));
    assert.match(await page.textContent('#kpi-jadual'), /CKAI4_SSU/);
    assert.match(await page.textContent('#kpi-jadual'), /KAI3_Ruang_Perniagaan/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
