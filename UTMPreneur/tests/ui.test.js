'use strict';
/**
 * Ujian asap antara muka dalam pelayar sebenar (Chromium) dengan google.script.run ditiru supaya
 * memanggil rpc() sebenar dalam persekitaran tiruan. Dilangkau jika Playwright/Chromium tiada.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createEnv } = require('./gas-mock');

let chromium = null;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } catch (e) { /* tiada */ }
const available = chromium && fs.existsSync(CHROME);

const SRC = path.join(__dirname, '..', 'src');
const SHOTS = process.env.UI_SHOTS || '';

function buildHtml() {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!= include\('(\w+)'\) \?>/g, (m, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
  const shim = `<script>
    window.google = { script: { run: (function () {
      function make(s, f) { return {
        withSuccessHandler: function (fn) { return make(fn, f); },
        withFailureHandler: function (fn) { return make(s, fn); },
        rpc: function (m, t, p) { window.__rpc(m, t, p).then(function (r) { if (s) s(r); }).catch(function (e) { if (f) f(e); }); }
      }; }
      return make(null, null);
    })() } };
  </script>`;
  return html.replace('<main id="main">', shim + '<main id="main">');
}

test('UI hujung ke hujung: log masuk OTP, tuntut matrik, admin (status, import, urus admin)', { skip: !available && 'Playwright/Chromium tiada' }, async () => {
  const env = createEnv();
  env.setup('UJI');
  env.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci==='PENGUJI_EMEL'; })[0]; Db.update('Tetapan', r._row, {Nilai:'aina.contoh@graduate.utm.my,utmxcite@utm.my'}); Cfg.invalidate(); })()`);

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-ui-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, buildHtml());
    await page.goto('file://' + file, { waitUntil: 'load' });
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
    const visible = async (id) => page.locator('#' + id).isVisible();

    // 1. Skrin emel
    await page.waitForSelector('#v-emel:not([hidden])');
    assert.equal(await visible('v-emel'), true);
    assert.equal(await visible('banner-uji'), true, 'MOD UJIAN dipaparkan pada skrin log masuk');
    await shot('ui-01-emel');

    // 2. Emel tidak sah
    await page.fill('#in-emel', 'bukan-emel');
    await page.click('#btn-minta');
    assert.match(await page.textContent('#msg-emel'), /emel yang sah/i);

    // 3. Emel di luar senarai penguji (MOD UJI)
    await page.fill('#in-emel', 'orang@gmail.com');
    await page.click('#btn-minta');
    await page.waitForFunction(() => /senarai penguji/i.test(document.getElementById('msg-emel').textContent));

    // 4. OTP
    await page.fill('#in-emel', 'aina.contoh@graduate.utm.my');
    await page.click('#btn-minta');
    await page.waitForSelector('#v-otp:not([hidden])');
    await shot('ui-02-otp');
    const code = env.lastCode('aina.contoh@graduate.utm.my');
    assert.match(code, /^\d{6}$/);
    // kod salah dahulu
    const wrong = code === '123456' ? '654321' : '123456';
    await page.locator('#otp-boxes input').first().click();
    await page.keyboard.type(wrong);
    await page.waitForFunction(() => /tidak betul/i.test(document.getElementById('msg-otp').textContent));
    // kod betul
    await page.locator('#otp-boxes input').first().click();
    await page.keyboard.type(code);
    await page.waitForSelector('#v-matrik:not([hidden])');
    assert.equal(await visible('banner-uji'), true, 'sepanduk MOD UJIAN dipaparkan');
    await shot('ui-03-matrik');

    // 5. Matrik salah, kemudian betul
    await page.fill('#in-matrik', 'A99XX9999');
    await page.click('#btn-matrik');
    await page.waitForFunction(() => /tidak ditemui/i.test(document.getElementById('msg-matrik').textContent));
    await page.fill('#in-matrik', 'A23UJ0001');
    await page.click('#btn-matrik');
    await page.waitForSelector('#v-home:not([hidden])');
    assert.match(await page.textContent('#home-nama'), /NURUL AINA BINTI HASSAN/);
    assert.equal(await visible('admin-menu-wrap'), false, 'pelajar tidak nampak menu admin');
    await shot('ui-04-home-pelajar');

    // 6. Muat semula halaman: sesi dikekalkan melalui sessionStorage
    const tok = await page.evaluate(() => sessionStorage.getItem('tok'));
    assert.ok(tok && tok.length >= 32);

    // 7. Log keluar
    await page.click('#btn-keluar');
    await page.waitForSelector('#v-emel:not([hidden])');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('tok')), null);

    // 8. Admin (desktop)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.fill('#in-emel', 'utmxcite@utm.my');
    await page.click('#btn-minta');
    await page.waitForSelector('#v-otp:not([hidden])');
    await page.locator('#otp-boxes input').first().click();
    await page.keyboard.type(env.lastCode('utmxcite@utm.my'));
    await page.waitForSelector('#v-home:not([hidden])');
    assert.equal(await visible('admin-menu-wrap'), true);
    assert.equal(await visible('go-import'), true);
    await shot('ui-05-home-admin');

    await page.click('#go-status');
    await page.waitForFunction(() => /Struktur: OK/.test(document.getElementById('status-body').textContent));
    await shot('ui-06-status');
    await page.click('#v-status [data-back]');

    // 9. Import
    await page.click('#go-import');
    const csv = 'No_Matrik,Nama_Penuh,Emel,No_KP_Pasport,Jantina,Etnik,Kewarganegaraan,Fakulti,Program,Tahun_Pengajian\n' +
      'A1000001,Aina,a1@graduate.utm.my,010101010001,P,Melayu,Warganegara,Fakulti Komputeran,BSc,2\n' +
      'A1000001,Dup,a2@graduate.utm.my,010101010002,L,Melayu,Warganegara,Fakulti Komputeran,BSc,2';
    await page.fill('#imp-csv', csv);
    await page.click('#btn-imp-semak');
    await page.waitForFunction(() => /ralat/i.test(document.getElementById('imp-hasil').textContent));
    assert.equal(await page.locator('#btn-imp-jalan').isDisabled(), true, 'import dikunci jika ada ralat');
    await shot('ui-07-import-ralat');
    await page.fill('#imp-csv', csv.split('\n').slice(0, 2).join('\n'));
    assert.equal(await page.locator('#btn-imp-jalan').isDisabled(), true, 'perlu semak semula selepas ubah CSV');
    await page.click('#btn-imp-semak');
    await page.waitForFunction(() => /Semakan lulus/.test(document.getElementById('imp-hasil').textContent));
    await page.click('#btn-imp-jalan'); // tekan pertama: minta pengesahan
    assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 8, 'belum ditulis selepas satu tekan');
    await page.click('#btn-imp-jalan');
    await page.waitForFunction(() => /Import selesai/.test(document.getElementById('imp-hasil').textContent));
    assert.equal(env.plain(env.run("Db.rows('PELAJAR').length")), 9);
    await shot('ui-08-import-selesai');
    await page.click('#v-import [data-back]');

    // 10. Urus admin
    await page.click('#go-admin');
    await page.waitForSelector('#adm-body tr');
    await page.fill('#a-emel', 'pegawai@utm.my');
    await page.fill('#a-nama', 'Pegawai Makerspace');
    await page.selectOption('#a-peranan', 'Pegawai Modul');
    await page.fill('#a-modul', 'Makerspace');
    await page.click('#btn-adm-tambah');
    await page.waitForFunction(() => document.querySelectorAll('#adm-body tr').length === 2);
    await shot('ui-09-urus-admin');
    const rowsText = await page.textContent('#adm-body');
    assert.match(rowsText, /pegawai@utm\.my/);
    assert.match(rowsText, /Dikunci/);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
