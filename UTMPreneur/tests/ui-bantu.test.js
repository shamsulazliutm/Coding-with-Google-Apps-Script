'use strict';
/** Ujian antara muka: admin mendaftar bagi pihak pelajar (profiling dan SSU, terus lulus). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ready, TEMPLAT_SIJIL } = require('./helpers');

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

test('UI: admin bantu pelajar mengisi profiling, memohon SSU dan meluluskan terus', { skip: !available && 'Chromium tiada' }, async () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-ui3-')), 'index.html');
    fs.writeFileSync(file, buildHtml());
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.fill('#in-emel', 'utmxcite@utm.my');
    await page.click('#btn-minta');
    await page.waitForSelector('#v-otp:not([hidden])');
    await page.locator('#otp-boxes input').first().click();
    await page.keyboard.type(env.lastCode('utmxcite@utm.my'));
    await page.waitForSelector('#v-home:not([hidden])');

    await page.click('#go-bantu');
    await page.fill('#bt-matrik', 'ZZ99999');
    await page.click('#btn-bt');
    await page.waitForFunction(() => /tidak ditemui/i.test(document.getElementById('msg-bt').textContent));
    await page.fill('#bt-matrik', 'a23uj0001');
    await page.click('#btn-bt');
    await page.waitForSelector('#bt-hasil .card');
    assert.match(await page.textContent('#bt-hasil'), /NURUL AINA BINTI HASSAN/);
    assert.match(await page.textContent('#bt-hasil'), /Belum lengkap/);
    await shot('p2-bantu-1');

    // profiling bagi pihak
    await page.getByRole('button', { name: /Isi \/ kemas kini profiling/ }).click();
    await page.waitForSelector('#pf-form [data-k=telefon] input');
    assert.match(await page.textContent('#v-profiling .bagi'), /Bertindak bagi pihak: NURUL AINA BINTI HASSAN \(A23UJ0001\)/);
    await page.fill('#pf-form [data-k=alamatRumah] input', 'No 1, Jalan Mawar, 81300 Skudai');
    await page.selectOption('#pf-form [data-k=kampung] select', 'JOHOR');
    await page.check('#pf-form [data-k=keluargaBerniaga] input[value=Tidak]');
    await page.check('#pf-form [data-k=pernahBerniaga] input[value=Tidak]');
    await page.check('#pf-form [data-k=berminat] input[value=Tidak]');
    await page.click('#btn-pf');
    await page.waitForFunction(() => /Profiling disimpan/.test(document.getElementById('msg-pf').textContent));
    assert.equal(env.plain(env.run(`Db.rows('Profil')[0].No_Matrik`)), 'A23UJ0001');
    await page.click('#v-profiling [data-back]'); // kembali ke Bantu pelajar dengan status dikemas kini
    await page.waitForFunction(() => /Lengkap/.test(document.getElementById('bt-hasil').textContent) && !/Belum lengkap/.test(document.getElementById('bt-hasil').textContent));

    // SSU bagi pihak, terus lulus
    await page.getByRole('button', { name: /Urus SSU/ }).click();
    await page.getByRole('button', { name: /Mohon SSU baharu/ }).click();
    await page.waitForSelector('#sf-form [data-k=nama] input');
    assert.equal(await page.locator('#sf-form [data-k=terusLulus]').isVisible(), true);
    assert.match(await page.textContent('#sf-form [data-k=perakuan]'), /pelajar telah memberi persetujuan/);
    await page.check('#sf-form [data-k=jenisSsu] input[value=Perniagaan]');
    await page.fill('#sf-form [data-k=nama] input', 'seni kek aina');
    await page.check('#sf-form [data-k=produk] input[value=FNB]');
    await page.selectOption('#sf-form [data-k=jenisPerniagaan] select', 'SOLE');
    await page.selectOption('#sf-form [data-k=kluster] select', 'MANUF');
    await page.fill('#sf-form [data-k=alamat] textarea', 'No 12, Jalan Mawar, Taman Universiti, 81300 Skudai, Johor');
    await page.fill('#sf-form [data-k=tarikhMula] input', '2026-09-01');
    await page.selectOption('#sf-form [data-k=syaratSubjek] select', 'TIADA');
    await page.check('#sf-form [data-k=statusSsm] input[value=PROSES]');
    await page.check('#sf-form [data-k=sumber] input[value=SENDIRI]');
    await page.fill('#sf-form [data-k=modal] input', '1500');
    await page.fill('#sf-form [data-k=pendapatan] input', '0');
    await page.click('#sf-form [data-k=perakuan] input');
    await page.click('#sf-form [data-k=terusLulus] input');
    await page.click('#btn-sf');
    await page.waitForFunction(() => /Permohonan dihantar/.test(document.getElementById('ssu-body').textContent), null, { timeout: 8000 });
    await shot('p2-bantu-2');
    assert.match(await page.textContent('#ssu-body'), /Aktif/);
    const per = env.plain(env.run(`Db.rows('Perniagaan')[0]`));
    assert.equal(per.No_Matrik_Pemilik, 'A23UJ0001');
    assert.match(per.No_Pendaftaran, /^XCITE-\d{4}S00001-01$/);
    assert.match(env.plain(env.run(`Db.rows('Audit').filter(function(x){return x.Tindakan==='MOHON_SSU'})[0].Catatan`)), /bagi pihak/);

    // keluar daripada mod bantu: pulang ke menu, banner tiada
    await page.click('#v-ssu [data-back]');
    await page.waitForSelector('#v-bantu:not([hidden])');
    await page.click('#v-bantu [data-back]');
    await page.waitForSelector('#v-home:not([hidden])');
    assert.equal(await page.locator('#v-ssu .bagi').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
