'use strict';
/**
 * Ujian antara muka Peringkat 2 dalam Chromium: Profiling, SSU (pelajar) dan semakan/kelulusan (admin).
 * google.script.run ditiru supaya memanggil rpc() sebenar dalam persekitaran tiruan. Dilangkau jika Chromium tiada.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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

test('UI Peringkat 2: profiling, permohonan SSU, semakan admin, kelulusan dan muat turun sijil', { skip: !available && 'Chromium tiada' }, async () => {
  const env = ready();
  env.addSijilTemplate(TEMPLAT_SIJIL);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'utmpreneur-ui2-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, buildHtml());
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
    const visible = async (sel) => page.locator(sel).isVisible();
    const text = async (sel) => (await page.locator(sel).first().textContent()) || '';

    async function login(email, matrik) {
      env.advance(120);
      await page.fill('#in-emel', email);
      await page.click('#btn-minta');
      await page.waitForSelector('#v-otp:not([hidden])');
      await page.locator('#otp-boxes input').first().click();
      await page.keyboard.type(env.lastCode(email));
      if (matrik) {
        await page.waitForSelector('#v-matrik:not([hidden])');
        await page.fill('#in-matrik', matrik);
        await page.click('#btn-matrik');
      }
      await page.waitForSelector('#v-home:not([hidden])');
    }
    const logout = async () => { await page.click('#btn-keluar'); await page.waitForSelector('#v-emel:not([hidden])'); };

    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.waitForSelector('#v-emel:not([hidden])');

    // ---------- Pelajar: profiling ----------
    await login('aina.contoh@graduate.utm.my', 'A23UJ0001');
    await page.waitForFunction(() => /Belum lengkap/.test(document.getElementById('pill-profil').textContent));
    assert.equal(await page.locator('#go-ssu-admin').isVisible(), false);
    await shot('p2-01-home');

    // SSU sebelum profiling: dinasihatkan melengkapkan profiling
    await page.click('#go-ssu');
    await page.waitForFunction(() => /Lengkapkan profiling/.test(document.getElementById('ssu-body').textContent));
    assert.equal(await page.getByText('Mohon SSU baharu').count(), 0, 'tiada butang mohon sebelum profiling');
    await page.click('#v-ssu [data-back]');

    await page.click('#go-profil');
    await page.waitForSelector('#pf-form [data-k=telefon] input');
    assert.match(await text('#pf-pelajar'), /NURUL AINA BINTI HASSAN/);
    assert.match(await text('#pf-pelajar'), /01\*\*\*\*001/);
    assert.ok(!(await text('#pf-pelajar')).includes('010101-01-0001'));
    assert.equal(await page.locator('#pf-form [data-k=telefon] input').inputValue(), '0111111101', 'telefon diisi awal');
    assert.equal(await page.locator('#pf-form [data-k=fakulti] select').inputValue(), 'FC', 'fakulti dipadankan dengan rujukan');
    assert.equal(await visible('#pf-form [data-k=keluarga]'), false, 'bahagian bersyarat tersembunyi');
    await shot('p2-02-profiling');

    // simpan kosong -> ralat bertanda
    await page.click('#btn-pf');
    await page.waitForFunction(() => document.querySelectorAll('#pf-form .has-err').length > 0);
    assert.equal(await page.locator('#pf-form [data-k=kampung] .fe').isVisible(), true);

    await page.fill('#pf-form [data-k=alamatRumah] input', 'No 1, Jalan Mawar, 81300 Skudai');
    await page.selectOption('#pf-form [data-k=kampung] select', 'JOHOR');
    await page.check('#pf-form [data-k=keluargaBerniaga] input[value=Ya]');
    assert.equal(await visible('#pf-form [data-k=keluarga]'), true, 'bahagian keluarga muncul');
    await page.click('#pf-form [data-k=keluarga] .btn.link');
    await page.selectOption('#pf-form [data-k=keluarga] .rep-row select', 'IBU');
    await page.fill('#pf-form [data-k=keluarga] .rep-row input >> nth=0', 'Kedai runcit');
    await page.check('#pf-form [data-k=pernahBerniaga] input[value=Tidak]');
    assert.equal(await visible('#pf-form [data-k=jenisDijalankan]'), false);
    await page.check('#pf-form [data-k=berminat] input[value=Ya]');
    await page.check('#pf-form [data-k=klusterDiminati] input[value=ICT]');
    await page.check('#pf-form [data-k=klusterDiminati] input[value=LAIN]');
    assert.equal(await visible('#pf-form [data-k=klusterLain]'), true, 'lain-lain meminta penjelasan');
    await page.fill('#pf-form [data-k=klusterLain] input', 'Seni kraf');
    await page.check('#pf-form [data-k=mahuKampus] input[value=Mungkin]');
    await page.selectOption('#pf-form [data-k=aliran] select', 'TEKNO');
    await page.click('#btn-pf');
    await page.waitForFunction(() => /Profiling disimpan/.test(document.getElementById('msg-pf').textContent));
    await shot('p2-03-profiling-disimpan');
    const pf = env.plain(env.run(`Db.rows('Profil')[0]`));
    assert.equal(pf.Kampung_Halaman, 'JOHOR');
    assert.equal(pf.Aliran_Pilihan, 'TEKNO');
    assert.equal(pf.Kluster_Diminati, 'ICT,LAIN');
    await page.click('#v-profiling [data-back]');
    await page.waitForFunction(() => /Lengkap/.test(document.getElementById('pill-profil').textContent) && !/Belum/.test(document.getElementById('pill-profil').textContent));

    // ---------- Pelajar: SSU ----------
    await page.click('#go-ssu');
    await page.waitForFunction(() => /Mohon SSU baharu/.test(document.getElementById('ssu-body').textContent));
    await page.getByRole('button', { name: /Mohon SSU baharu/ }).click();
    await page.waitForSelector('#sf-form [data-k=nama] input');
    assert.match(await text('#sf-pemilik'), /NURUL AINA BINTI HASSAN/);
    // hantar kosong -> ralat
    await page.click('#btn-sf');
    await page.waitForFunction(() => document.querySelectorAll('#sf-form .has-err').length >= 5);
    await shot('p2-04-ssu-ralat');
    // isi borang
    await page.check('#sf-form [data-k=jenisSsu] input[value=Perniagaan]');
    await page.fill('#sf-form [data-k=nama] input', 'seni kek aina');
    await page.check('#sf-form [data-k=produk] input[value=FNB]');
    await page.selectOption('#sf-form [data-k=jenisPerniagaan] select', 'SOLE');
    await page.selectOption('#sf-form [data-k=kluster] select', 'MANUF');
    await page.fill('#sf-form [data-k=alamat] textarea', 'Kolej Tun Fatimah, UTM Skudai');
    await page.fill('#sf-form [data-k=tarikhMula] input', '2026-09-01');
    await page.selectOption('#sf-form [data-k=syaratSubjek] select', 'UBSS1032');
    assert.equal(await visible('#sf-form [data-k=pensyarah]'), true);
    await page.fill('#sf-form [data-k=pensyarah] input', 'Dr. Contoh');
    await page.fill('#sf-form [data-k=seksyen] input', '01');
    await page.fill('#sf-form [data-k=kumpulan] input', 'A');
    assert.equal(await visible('#sf-form [data-k=failSsm]'), false);
    await page.check('#sf-form [data-k=statusSsm] input[value=YA]');
    assert.equal(await visible('#sf-form [data-k=failSsm]'), true);
    await page.fill('#sf-form [data-k=noSsm] input', '202603001234');
    await page.setInputFiles('#sf-form [data-k=failSsm] input[type=file]', { name: 'ssm.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n') });
    await page.waitForFunction(() => /ssm\.pdf/.test(document.querySelector('#sf-form [data-k=failSsm]').textContent));
    await page.check('#sf-form [data-k=sumber] input[value=SENDIRI]');
    await page.fill('#sf-form [data-k=modal] input', '1500');
    await page.fill('#sf-form [data-k=pendapatan] input', '2000.50');
    await page.click('#sf-form [data-k=ahli] .btn.link');
    await page.fill('#sf-form [data-k=ahli] .rep-row input', 'A23UJ0002');
    await page.click('#sf-form [data-k=perakuan] input');
    await page.click('#btn-sf');
    // alamat kolej ditolak oleh pelayan
    await page.waitForFunction(() => /bukan kolej/i.test(document.querySelector('#sf-form [data-k=alamat] .fe').textContent));
    assert.equal(env.plain(env.run(`Db.rows('Permohonan_SSU').length`)), 0);
    await page.fill('#sf-form [data-k=alamat] textarea', 'No 12, Jalan Mawar, Taman Universiti, 81300 Skudai, Johor');
    await page.click('#btn-sf');
    await page.waitForFunction(() => /Permohonan dihantar/.test(document.getElementById('ssu-body').textContent), null, { timeout: 8000 }).catch(async (e) => {
      const errs = await page.$$eval('#sf-form .fe:not([hidden])', (n) => n.map((x) => x.parentElement.getAttribute('data-k') + ': ' + x.textContent));
      throw new Error('hantar gagal: ' + (await page.textContent('#msg-sf')) + ' | ' + errs.join(' ; '));
    });
    await shot('p2-05-ssu-dihantar');
    assert.match(await text('#ssu-body'), /SENI KEK AINA/);
    assert.match(await text('#ssu-body'), /Baharu/);
    assert.equal(env.plain(env.run(`Db.rows('Permohonan_SSU')[0].Nama_Perniagaan`)), 'SENI KEK AINA');
    await logout();

    // ---------- Admin ----------
    await page.setViewportSize({ width: 1280, height: 900 });
    await login('utmxcite@utm.my');
    await page.waitForFunction(() => /1 baharu/.test(document.getElementById('pill-ssu-admin').textContent));
    await shot('p2-06-home-admin');
    await page.click('#go-ssu-admin');
    await page.waitForSelector('#sa-body tr');
    assert.match(await text('#sa-body'), /SENI KEK AINA/);
    await shot('p2-07-admin-senarai');
    await page.fill('#sa-q', 'tidak-wujud');
    await page.waitForFunction(() => document.querySelectorAll('#sa-body tr').length === 0);
    await page.fill('#sa-q', 'kek');
    await page.waitForFunction(() => document.querySelectorAll('#sa-body tr').length === 1);
    await page.click('#sa-body tr');
    await page.waitForSelector('#sd-body [data-act=lulus]');
    assert.match(await text('#sd-body'), /AMIRUL HAKIM BIN ROSLI/);
    await shot('p2-08-admin-butiran');

    // pembetulan memerlukan catatan
    await page.click('#sd-body [data-act=pembetulan]');
    await page.waitForFunction(() => /Catatan wajib/.test(document.getElementById('msg-sd').textContent));
    // lulus: dua tekan
    await page.click('#sd-body [data-act=lulus]');
    assert.equal(env.plain(env.run(`Db.rows('Perniagaan').length`)), 0, 'belum diluluskan selepas satu tekan');
    await page.click('#sd-body [data-act=lulus]');
    await page.waitForFunction(() => /Diluluskan/.test(document.querySelector('#sd-body .pill').textContent));
    await shot('p2-09-admin-diluluskan');
    assert.match(await text('#sd-body'), /XCITE-\d{4}S00001-01/);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Sijil SSU \(PDF\)/ }).click()
    ]);
    assert.match(dl.suggestedFilename(), /^Sijil SSU XCITE-\d{4}S00001-01\.pdf$/);
    const pdf = fs.readFileSync(await dl.path(), 'utf8');
    assert.match(pdf, /^%PDF/);
    assert.match(pdf, /1\. NURUL AINA BINTI HASSAN\n2\. AMIRUL HAKIM BIN ROSLI/);

    // daftar SSU sedia ada
    await page.click('#btn-sa-balik');
    await page.waitForSelector('#btn-sa-sedia:not([hidden])');
    await page.click('#btn-sa-sedia');
    await page.waitForSelector('#sd-form [data-k=noMatrik] input');
    await page.fill('#sd-form [data-k=noMatrik] input', 'A22UJ0003');
    await page.fill('#sd-form [data-k=nama] input', 'weijie trading');
    await page.selectOption('#sd-form [data-k=jenisPerniagaan] select', 'PARTNER');
    await page.selectOption('#sd-form [data-k=kluster] select', 'RETAIL');
    await page.fill('#sd-form [data-k=alamat] textarea', 'Lot 5, Jalan Industri, 81300 Skudai, Johor');
    await page.fill('#sd-form [data-k=tarikhDaftar] input', '2025-01-15');
    await page.click('#btn-sedia');
    await page.waitForFunction(() => /Diluluskan/.test(document.querySelector('#sd-body .pill').textContent));
    assert.match(await text('#sd-body'), /sedia ada/);
    await logout();

    // ---------- Pelajar: lihat sijil ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await login('aina.contoh@graduate.utm.my');
    await page.waitForFunction(() => /Aktif/.test(document.getElementById('pill-ssu').textContent));
    await page.click('#go-ssu');
    await page.waitForFunction(() => /XCITE-\d{4}S00001-01/.test(document.getElementById('ssu-body').textContent));
    await shot('p2-10-pelajar-sijil');
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Muat turun sijil/ }).first().click()
    ]);
    assert.match(dl2.suggestedFilename(), /^Sijil SSU/);
    assert.equal(await page.getByText('Mohon SSU baharu').count(), 0);
    await logout();

    // Staf: modul pelajar dilumpuhkan
    await login('staf1@utm.my').catch(() => {});
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
