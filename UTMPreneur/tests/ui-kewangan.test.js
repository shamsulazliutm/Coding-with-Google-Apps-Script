'use strict';
/**
 * Ujian antara muka modul Kewangan dalam Chromium: pelajar menghantar laporan, ahli baca sahaja,
 * admin memulangkan/menerima, mengisi bagi pihak pemilik dan mengeksport CSV. Dilangkau jika Chromium tiada.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ready } = require('./helpers');
const { addPer, addAhli, addSewaan, jobAt, lap, rows } = require('./kew-helpers');

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

test('UI Kewangan: pelajar hantar laporan, ahli baca sahaja, admin kembalikan/isi bagi pihak/terima, CSV', { skip: !available && 'Chromium tiada' }, async () => {
  const env = ready();
  addPer(env, { id: 'PRN-0001', nama: 'KEK AINA', matrik: 'A23UJ0001' });
  addAhli(env, 'SSU-2026-0001', 'PRN-0001', 'A23UJ0001', ['A23UJ0002']);
  addSewaan(env, 'PRN-0001', 'Aktif');
  jobAt(env, '2026-10-09'); // laporan September: Lewat
  const id = lap(env)[0].id;
  assert.equal(lap(env)[0].status, 'Lewat');

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-uikew-')), 'index.html');
    fs.writeFileSync(file, buildHtml());
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
    const text = async (sel) => (await page.locator(sel).first().textContent()) || '';
    const visible = async (sel) => page.locator(sel).isVisible();

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

    // ---------- Pelajar pemilik ----------
    await login('aina.contoh@graduate.utm.my', 'A23UJ0001');
    await page.waitForFunction(() => /belum dihantar/.test(document.getElementById('pill-kew').textContent));
    assert.equal(await page.locator('#go-kew').isDisabled(), false, 'menu Kewangan dihidupkan');
    assert.equal(await visible('#go-kew-admin'), false, 'pelajar tidak melihat menu admin');
    assert.match(await text('#pill-kew'), /1 belum dihantar/);
    await shot('kew-01-home');

    await page.click('#go-kew');
    await page.waitForSelector('#kew-body .kew-rep');
    assert.match(await text('#kew-body'), /KEK AINA/);
    assert.match(await text('#kew-body'), /September 2026/);
    assert.match(await text('#kew-body'), /Lewat/);
    assert.match(await text('#kew-body'), /Penyewa lot/);
    await shot('kew-02-senarai');
    // templat belum didaftar: mesej jelas daripada pelayan
    await page.getByRole('button', { name: /Muat turun templat laporan/ }).click();
    await page.waitForFunction(() => /Templat laporan belum didaftar/.test(document.getElementById('kew-msg-tpl').textContent));

    await page.click('.kew-isi');
    await page.waitForSelector('#kew-f-form [data-k=pendapatan] input');
    assert.match(await text('#kew-f-tajuk'), /KEK AINA · September 2026/);
    // hantar kosong: ralat bertanda (fail wajib bagi penyewa lot)
    await page.click('#kew-btn-hantar');
    await page.waitForFunction(() => document.querySelectorAll('#kew-f-form .has-err').length >= 3);
    for (const k of ['pendapatan', 'perbelanjaan', 'fail', 'perakuan']) assert.equal(await visible(`#kew-f-form [data-k=${k}] .fe`), true, k);
    await shot('kew-03-ralat');
    // tiada aktiviti menyembunyikan RM
    await page.check('#kew-f-form [data-k=tiadaAktiviti] input');
    assert.equal(await visible('#kew-f-form [data-k=pendapatan]'), false);
    await page.uncheck('#kew-f-form [data-k=tiadaAktiviti] input');
    assert.equal(await visible('#kew-f-form [data-k=pendapatan]'), true);
    await page.fill('#kew-f-form [data-k=pendapatan] input', '1,000.50');
    await page.fill('#kew-f-form [data-k=perbelanjaan] input', '1200');
    await page.fill('#kew-f-form [data-k=bilPekerja] input', '2');
    assert.match(await text('#kew-f-untung'), /-RM 199\.50/, 'untung negatif dipaparkan');
    await page.setInputFiles('#kew-f-form [data-k=fail] input[type=file]', { name: 'laporan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n') });
    await page.waitForFunction(() => /laporan\.pdf/.test(document.querySelector('#kew-f-form [data-k=fail]').textContent));
    await page.check('#kew-f-form [data-k=perakuan] input');
    await shot('kew-04-borang');
    await page.click('#kew-btn-hantar');
    await page.waitForFunction(() => /Laporan dihantar/.test(document.getElementById('kew-body').textContent));
    const x = lap(env)[0];
    assert.equal(x.status, 'Dihantar');
    assert.equal(x.untung, -199.5);
    assert.match(x.fail, /drive\.google\.com/);
    assert.match(await text('#kew-body .kew-rep'), /Dihantar lewat/, 'Tarikh_Hantar > Tarikh_Akhir ditandakan');
    assert.equal(await page.locator('#kew-body .kew-isi').count(), 0, 'Dihantar tidak boleh disunting');
    await shot('kew-05-dihantar');
    await page.click('#v-kew [data-back]');
    await page.waitForFunction(() => /Semua dihantar/.test(document.getElementById('pill-kew').textContent));
    await logout();

    // ---------- Ahli: baca sahaja ----------
    await login('amirul.contoh@graduate.utm.my', 'A23UJ0002');
    await page.waitForFunction(() => !/…/.test(document.getElementById('pill-kew').textContent));
    await page.click('#go-kew');
    await page.waitForSelector('#kew-body .kew-rep');
    assert.match(await text('#kew-body'), /Ahli \(baca sahaja\)/);
    assert.match(await text('#kew-body'), /baca laporan sahaja|melihat laporan sahaja/);
    assert.equal(await page.locator('#kew-body .kew-isi').count(), 0, 'ahli tidak boleh menyunting');
    assert.match(await text('#kew-body .kew-rep'), /-RM 199\.50/);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Muat turun fail/ }).click();
    assert.equal((await dl).suggestedFilename().startsWith('LAPORAN_PRN-0001_2026-09'), true, 'ahli boleh memuat turun fail');
    await shot('kew-06-ahli');
    await logout();

    // ---------- Admin ----------
    await page.setViewportSize({ width: 1000, height: 900 });
    await login('utmxcite@utm.my');
    await page.waitForFunction(() => /menunggu semakan/.test(document.getElementById('pill-kew-admin').textContent));
    assert.match(await text('#pill-kew-admin'), /1 menunggu semakan/);
    assert.equal(await page.locator('#go-kew').isDisabled(), true, 'menu pelajar tidak aktif bagi admin');
    await page.click('#go-kew-admin');
    await page.waitForSelector('#kew-a-body tr');
    assert.equal(await page.locator('#kew-a-bulan').inputValue(), '9');
    assert.equal(await page.locator('#kew-a-tahun').inputValue(), '2026');
    assert.match(await text('#kew-a-ring'), /Pematuhan/);
    assert.match(await text('#kew-a-ring'), /100%/);
    assert.match(await text('#kew-a-chips'), /Dihantar \(1\)/);
    await shot('kew-07-admin-senarai');
    // penapis carian
    await page.fill('#kew-a-q', 'tiada-padanan');
    await page.waitForFunction(() => !document.querySelector('#kew-a-kosong').hidden);
    await page.fill('#kew-a-q', 'a23uj0001');
    await page.waitForSelector('#kew-a-body tr');
    // CSV
    const csvDl = page.waitForEvent('download');
    await page.click('#kew-btn-csv');
    const dlo = await csvDl;
    assert.match(dlo.suggestedFilename(), /^laporan-kewangan_2026-09\.csv$/);
    const csv = fs.readFileSync(await dlo.path(), 'utf8');
    assert.ok(csv.includes('KEK AINA') && csv.includes('-199.5'));
    // butiran
    await page.click('#kew-a-body tr');
    await page.waitForSelector('#kew-btn-pembetulan');
    assert.match(await text('#kew-det-body'), /NURUL AINA BINTI HASSAN/);
    assert.match(await text('#kew-det-body'), /-RM 199\.50/);
    assert.match(await text('#kew-det-body'), /Dihantar lewat/);
    await shot('kew-08-admin-butiran');
    // muat turun fail oleh admin
    const fdl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Muat turun fail laporan/ }).click();
    assert.equal((await fdl).suggestedFilename().startsWith('LAPORAN_PRN-0001_2026-09'), true);
    // pembetulan tanpa catatan: ditolak
    await page.click('#kew-btn-pembetulan');
    await page.waitForFunction(() => /Catatan wajib/.test(document.getElementById('kew-msg-d').textContent));
    assert.equal(lap(env)[0].status, 'Dihantar');
    await page.fill('#kew-d-catatan', 'Sila semak jumlah perbelanjaan.');
    await page.click('#kew-btn-pembetulan');
    await page.waitForFunction(() => /dikembalikan untuk pembetulan/.test(document.getElementById('kew-det-body').textContent));
    assert.equal(lap(env)[0].status, 'Perlu Pembetulan');
    assert.equal(lap(env)[0].catatan, 'Sila semak jumlah perbelanjaan.');
    // bagi pihak pemilik
    await page.getByRole('button', { name: /Isi bagi pihak pemilik/ }).click();
    await page.waitForSelector('#kew-f-form [data-k=pendapatan] input');
    assert.match(await text('#kew-bagi'), /Bertindak bagi pihak: NURUL AINA BINTI HASSAN \(A23UJ0001\)/);
    assert.match(await text('#kew-f-catatan'), /Sila semak jumlah perbelanjaan/);
    assert.equal(await page.locator('#kew-f-form [data-k=pendapatan] input').inputValue(), '1000.5', 'nilai sedia ada diisi awal');
    await page.fill('#kew-f-form [data-k=perbelanjaan] input', '900');
    await page.fill('#kew-f-form [data-k=bilPekerja] input', '2');
    await page.check('#kew-f-form [data-k=perakuan] input');
    await shot('kew-09-bagi-pihak');
    await page.click('#kew-btn-hantar');
    await page.waitForFunction(() => /dihantar bagi pihak pemilik/.test(document.getElementById('kew-det-body').textContent));
    assert.equal(lap(env)[0].status, 'Dihantar');
    assert.equal(lap(env)[0].untung, 100.5);
    assert.match(rows(env, 'Audit').find((a) => a.Tindakan === 'KEW_HANTAR_BAGI_PIHAK').Catatan, /\[bagi pihak A23UJ0001\]/);
    // terima: dua langkah pengesahan
    await page.click('#kew-btn-terima');
    assert.equal(lap(env)[0].status, 'Dihantar', 'klik pertama hanya meminta pengesahan');
    await page.click('#kew-btn-terima');
    await page.waitForFunction(() => /diterima dan dikunci/.test(document.getElementById('kew-det-body').textContent));
    assert.equal(lap(env)[0].status, 'Diterima');
    assert.equal(await page.locator('#kew-btn-terima').count(), 0, 'terkunci');
    await shot('kew-10-diterima');
    await page.click('#kew-btn-senarai');
    await page.waitForSelector('#kew-a-body tr');
    assert.match(await text('#kew-a-ring'), /RM 100\.50/);
    // jana sekarang
    assert.equal(await visible('#kew-btn-jana'), true);
    await page.click('#kew-btn-jana');
    await page.waitForFunction(() => /Selesai/.test(document.getElementById('kew-msg-a').textContent));
    await logout();

    // ---------- Pelajar melihat laporan Diterima (terkunci) ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await login('aina.contoh@graduate.utm.my');
    await page.click('#go-kew');
    await page.waitForSelector('#kew-body .kew-rep');
    const sep = `#kew-body .kew-rep[data-id="${id}"]`;
    assert.match(await text(sep), /Diterima/);
    assert.equal(await page.locator(sep + ' .kew-isi').count(), 0, 'laporan Diterima terkunci');
    assert.equal(await page.locator('#kew-body .kew-isi').count(), 1, 'laporan Oktober (dijana manual) masih boleh diisi');
    const kpi = rows(env, 'Ringkasan_KPI').find((r) => r.Petunjuk === 'KEW_BIL_DITERIMA_2026_09');
    assert.equal(kpi.Nilai, 1);

    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
  } finally {
    await browser.close();
  }
});
