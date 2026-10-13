'use strict';
/**
 * Ujian antara muka Ruang Niaga dalam Chromium: pelajar memohon lot, admin menyemak/menyenarai/mula sesi, penilai menskor di skrin telefon,
 * admin menutup sesi, meluluskan, menyediakan dan menghantar surat tawaran, pelajar menerima dengan OTP dan memuat turun dokumen,
 * kemudian cagaran, perjanjian, sewaan aktif dan bil sewa. google.script.run ditiru dengan rpc() sebenar. Dilangkau jika Chromium tiada.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setCfg } = require('./helpers');
const { ssuLulus, rnReady, bukaLot, otpCode, hari, TPL_PERJANJIAN, AINA, ADMIN } = require('./rn-helpers');

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
const PDF_BUF = (t) => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n' + (t || ''));

test('UI Ruang Niaga: permohonan, penilaian, kelulusan, surat tawaran, OTP, dokumen, cagaran, perjanjian, sewaan dan bil', { skip: !available && 'Chromium tiada' }, async () => {
  const { env, admin } = rnReady();
  setCfg(env, 'OTP_MAKS_SEJAM', '100');
  bukaLot(env, admin, 'SM-01');
  bukaLot(env, admin, 'SM-02', { jenis: 'FNB' });
  ssuLulus(env, admin, AINA, 'seni kek aina');
  env.addDocTemplate('TEMPLAT_PERJANJIAN_SEWA_BUKAN_FNB', TPL_PERJANJIAN);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'utmpreneur-uirn-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, buildHtml());
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
    const text = async (sel) => (await page.locator(sel).first().textContent()) || '';
    const visible = async (sel) => page.locator(sel).first().isVisible();

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
    const two = async (sel) => { await page.click(sel); await page.click(sel); };
    const dbRows = (tab) => env.plain(env.run(`Db.rows(${JSON.stringify(tab)})`));

    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.waitForSelector('#v-emel:not([hidden])');

    // ---------- Pelajar memohon ----------
    await login(AINA);
    await page.waitForFunction(() => /Boleh memohon/.test(document.getElementById('pill-rn').textContent));
    assert.equal(await page.locator('#go-rn').isDisabled(), false);
    assert.equal(await visible('#go-rn-admin'), false);
    await shot('rn-01-home');
    await page.click('#go-rn');
    await page.waitForSelector('#rn-body [data-lot=SM-01]');
    assert.match(await text('#rn-body'), /Dibuka/);
    assert.equal(await page.locator('#rn-body [data-lot=SM-02]').count(), 1);
    assert.equal(await page.locator('#rn-body [data-lot=SM-03]').count(), 0, 'lot Ditutup tidak kelihatan');
    await shot('rn-02-lot');
    await page.click('#rn-body [data-lot=SM-01] button');
    await page.waitForSelector('#rn-form [data-k=kodLot] select');
    assert.equal(await page.locator('#rn-form [data-k=kodLot] select').inputValue(), 'SM-01');
    assert.equal(await visible('#rn-form [data-k=vaksin]'), false, 'medan F&B tersembunyi bagi lot bukan F&B');
    await page.selectOption('#rn-form [data-k=kodLot] select', 'SM-02');
    assert.equal(await visible('#rn-form [data-k=vaksin]'), true, 'medan F&B muncul untuk lot F&B');
    await page.selectOption('#rn-form [data-k=kodLot] select', 'SM-01');
    await page.click('#btn-rn-hantar');
    await page.waitForFunction(() => document.querySelectorAll('#rn-form .has-err').length >= 5);
    await shot('rn-03-borang-ralat');
    await page.fill('#rn-form [data-k=tempohMula] input', hari(env, 30));
    await page.fill('#rn-form [data-k=tempohTamat] input', hari(env, 30 + 364));
    await page.check('#rn-form [data-k=sumber] input[value=SENDIRI]');
    await page.fill('#rn-form [data-k=jumlahDana] input', '5000');
    await page.fill('#rn-form [data-k=jualan] input', '8000');
    await page.fill('#rn-form [data-k=bilPekerja] input', '3');
    await page.setInputFiles('#rn-form [data-k=failCadangan] input[type=file]', { name: 'cadangan.pdf', mimeType: 'application/pdf', buffer: PDF_BUF('cadangan') });
    await page.waitForFunction(() => /cadangan\.pdf/.test(document.querySelector('#rn-form [data-k=failCadangan]').textContent));
    await page.fill('#rn-form [data-k=sebab] textarea', 'Mahu memperluas perniagaan kek ke kampus.');
    await page.click('#rn-form [data-k=perakuan] input');
    await page.click('#btn-rn-hantar');
    await page.waitForFunction(() => /Permohonan dihantar: PLT-/.test(document.getElementById('rn-body').textContent), null, { timeout: 8000 });
    await shot('rn-04-dihantar');
    const idPer = dbRows('Permohonan_Lot')[0].ID_Permohonan;
    assert.match(idPer, /^PLT-\d{4}-0001$/);
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Baharu');
    assert.match(await text('#rn-body'), /Baharu/);
    await logout();

    // ---------- Admin: semak, sesi ----------
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(ADMIN);
    await page.waitForFunction(() => /perlu tindakan/.test(document.getElementById('pill-rn-admin').textContent));
    await page.click('#go-rn-admin');
    await page.waitForSelector('#rn-dash');
    assert.match(await text('#rn-dash'), /Okupansi/);
    await shot('rn-05-admin-ringkasan');
    await page.click('#rn-a-tabs [data-tab=perm]');
    await page.waitForSelector('#rn-a-body tr.click');
    await page.click('#rn-a-body tr.click');
    await page.waitForSelector('#rn-kad-tindakan [data-act=semak]');
    assert.match(await text('#rn-a-det-body'), /SENI KEK AINA/);
    await shot('rn-06-admin-permohonan');
    await page.click('#rn-kad-tindakan [data-act=semak]');
    await page.waitForFunction(() => /Tindakan direkod/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Disemak');
    // sesi baharu
    await page.click('#btn-rn-a-det-balik');
    await page.click('#rn-a-tabs [data-tab=sesi]');
    await page.waitForSelector('#rn-btn-sesi-baharu');
    await page.click('#rn-btn-sesi-baharu');
    await page.waitForSelector('#rn-sesi-form [data-k=tarikh] input');
    await page.fill('#rn-sesi-form [data-k=tarikh] input', hari(env, 10));
    await page.fill('#rn-sesi-form [data-k=masa] input', '14:30');
    await page.fill('#rn-sesi-form [data-k=tempat] input', 'Bilik Mesyuarat UTMXCITE');
    await page.check('#rn-sesi-form [data-k=penilai] input[value="penilai@utm.my"]');
    await page.selectOption('#rn-calon-pilih', idPer);
    await page.click('#rn-sesi-form [data-k=senarai] .btn.link');
    await page.fill('#rn-sesi-form [data-k=senarai] .rep-row input', '14:30');
    await page.click('#rn-btn-sesi-simpan');
    await page.waitForFunction(() => /Sesi disimpan/.test(document.getElementById('rn-a-det-body').textContent));
    await shot('rn-07-sesi');
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Disenarai Pendek');
    await page.click('#rn-btn-jemput');
    await page.waitForFunction(() => /Jemputan dihantar/.test(document.getElementById('rn-a-det-body').textContent));
    await page.click('#rn-btn-mula');
    await page.waitForFunction(() => /Sesi bermula/.test(document.getElementById('rn-a-det-body').textContent));
    await logout();

    // ---------- Penilai (telefon) ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await login('penilai@utm.my');
    assert.match(await text('#go-rn-admin'), /Penilaian ruang niaga/);
    await page.waitForFunction(() => /1 sesi berjalan/.test(document.getElementById('pill-rn-admin').textContent));
    await page.click('#go-rn-admin');
    await page.waitForSelector('#rn-p-body [data-calon]');
    await page.click('#rn-p-body [data-calon] button');
    await page.waitForSelector('#rn-skor-kad .rn-k');
    assert.match(await text('#rn-p-skor-body'), /NURUL AINA BINTI HASSAN/);
    assert.match(await text('#rn-p-skor-body'), /01\*\*\*\*001/);
    await shot('rn-08-penilai');
    assert.equal(await page.locator('#rn-skor-kad .rn-k').count(), 6);
    // hantar tidak lengkap -> ralat
    await two('#rn-btn-hantar-skor');
    await page.waitForFunction(() => /Skor tidak sah/.test(document.getElementById('msg-rn-skor').textContent));
    // tahap 5 bagi ORG (10), laras markah KANDUNGAN dalam julat
    const pilih = async (kod, tahap) => page.click(`#rn-skor-kad [data-kod=${kod}] .rn-skala [data-tahap="${tahap}"]`);
    await pilih('ORG', 5);
    assert.equal(await page.locator('#rn-skor-kad [data-kod=ORG] [data-mk]').inputValue(), '10');
    await pilih('KANDUNGAN', 4);
    assert.equal(await page.locator('#rn-skor-kad [data-kod=KANDUNGAN] [data-mk]').inputValue(), '16');
    await page.fill('#rn-skor-kad [data-kod=KANDUNGAN] [data-mk]', '14');
    await pilih('PENERANGAN', 3); await pilih('PASARAN', 5); await pilih('INOVASI', 4); await pilih('KEWANGAN', 2);
    await page.fill('#rn-skor-kad [data-kod=ORG] [data-ul]', 'Tersusun dan jelas');
    // 10 + 14 + 12 + 20 + 16 + 4 = 76
    assert.equal(await text('#rn-jumlah'), '76');
    await page.click('#rn-btn-draf');
    await page.waitForFunction(() => /Draf disimpan/.test(document.getElementById('msg-rn-skor').textContent));
    assert.equal(dbRows('Skor_Penilaian').length, 6);
    assert.ok(dbRows('Skor_Penilaian').every((x) => x.Dikunci === ''));
    await two('#rn-btn-hantar-skor');
    await page.waitForFunction(() => /Skor dihantar dan dikunci/.test(document.getElementById('msg-rn-skor').textContent));
    assert.ok(dbRows('Skor_Penilaian').every((x) => x.Dikunci === 'Ya'));
    assert.equal(await page.locator('#rn-btn-hantar-skor').count(), 0, 'butang hantar tiada selepas dikunci');
    assert.equal(await page.locator('#rn-skor-kad [data-kod=ORG] .rn-skala button').first().isDisabled(), true);
    assert.equal(await text('#rn-jumlah'), '76');
    await shot('rn-09-penilai-dihantar');
    // penilai bukan pemilik skor lain; tiada akses admin
    await logout();

    // ---------- Admin: tutup sesi, luluskan, surat tawaran ----------
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(ADMIN);
    await page.click('#go-rn-admin');
    await page.click('#rn-a-tabs [data-tab=sesi]');
    await page.waitForSelector('#rn-a-body tr.click');
    await page.click('#rn-a-body tr.click');
    await page.waitForSelector('#rn-btn-tutup');
    assert.match(await text('#rn-kad-skor'), /76/);
    await two('#rn-btn-tutup');
    await page.waitForFunction(() => /Sesi ditutup/.test(document.getElementById('rn-a-det-body').textContent));
    const sel = (n) => page.locator('#rn-kad-skor tbody tr').first().locator('td').nth(n).textContent();
    assert.equal(await sel(4), '76', 'purata');
    assert.equal(await sel(5), '1', 'kedudukan');
    await shot('rn-10-sesi-ditutup');
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Dinilai');
    await page.click('#btn-rn-a-det-balik');
    await page.click('#rn-a-tabs [data-tab=perm]');
    await page.waitForSelector('#rn-a-body tr.click');
    await page.click('#rn-a-body tr.click');
    await page.waitForSelector('#rn-kad-penilaian');
    assert.match(await text('#rn-kad-penilaian'), /Kedudukan/);
    await two('#rn-kad-tindakan [data-act=lulus]');
    await page.waitForFunction(() => /Tindakan direkod/.test(document.getElementById('rn-a-det-body').textContent));
    await page.waitForSelector('#rn-kad-tawaran-admin [data-form=tawaran]');
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Diluluskan');
    // pengesahan: no. rujukan wajib
    await page.click('#rn-kad-tawaran-admin [data-form=tawaran] button.rn-submit');
    await page.waitForFunction(() => document.querySelectorAll('#rn-kad-tawaran-admin .has-err').length >= 1);
    await page.fill('#rn-kad-tawaran-admin [data-k=noRujukan] input', 'UTM.J.06.11/13.16/11 (12)');
    await page.fill('#rn-kad-tawaran-admin [data-k=waktuOperasi] input', '12.00 tengahari - 9.00 malam');
    await page.fill('#rn-kad-tawaran-admin [data-k=cagaranSewaan] input', '150');
    // jadual berperingkat: 6 bulan RM150 kemudian RM250
    await page.fill('#rn-kad-tawaran-admin [data-k=jadual] [data-j=hingga]', '6');
    await page.click('#rn-kad-tawaran-admin [data-k=jadual] .btn.link');
    const rowsJ = page.locator('#rn-kad-tawaran-admin [data-k=jadual] .rep-row');
    await rowsJ.nth(1).locator('[data-j=dari]').fill('7');
    await rowsJ.nth(1).locator('[data-j=kadar]').fill('250');
    await page.click('#rn-kad-tawaran-admin [data-form=tawaran] button.rn-submit');
    await page.waitForFunction(() => /Butiran tawaran disimpan/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Jadual_Sewa').length, 2);
    // hantar sebelum pratonton ditolak; jana pratonton
    await page.waitForSelector('#rn-btn-jana');
    assert.equal(await page.locator('#rn-btn-hantar-tawaran').count(), 0, 'belum boleh hantar sebelum pratonton dijana');
    await page.click('#rn-btn-jana');
    await page.waitForFunction(() => /Pratonton versi 1 dijana/.test(document.getElementById('rn-a-det-body').textContent));
    await shot('rn-11-tawaran-pratonton');
    const [dlP] = await Promise.all([page.waitForEvent('download'), page.locator('#rn-kad-tawaran-admin [data-dok] [data-act=muat]').first().click()]);
    assert.match(dlP.suggestedFilename(), /^Surat Tawaran PLT-\d{4}-0001 v1\.pdf$/);
    const pdfP = fs.readFileSync(await dlP.path(), 'utf8');
    assert.match(pdfP, /SURAT SETUJU TERIMA/);
    assert.match(pdfP, /Bulan ke-7 dan ke atas: RM 250/);
    await two('#rn-btn-hantar-tawaran');
    await page.waitForFunction(() => /Surat tawaran dihantar kepada pemohon/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Ditawarkan');
    assert.equal(env.sentTo(AINA).filter((m) => /Surat tawaran sewa lot/.test(m.subject)).length, 1);
    await logout();

    // ---------- Pelajar menerima dengan OTP ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await login(AINA);
    await page.waitForFunction(() => /Ditawarkan/.test(document.getElementById('pill-rn').textContent));
    await page.click('#go-rn');
    await page.waitForSelector('#rn-body [data-id] [data-act=buka]');
    await page.click('#rn-body [data-id] [data-act=buka]');
    await page.waitForSelector('#rn-kad-tawaran');
    assert.match(await text('#rn-kad-tawaran'), /UTM\.J\.06\.11\/13\.16\/11 \(12\)/);
    assert.match(await text('#rn-kad-tawaran'), /Bulan 7 dan ke atas: RM 250/);
    assert.equal(await page.locator('#rn-kad-penerimaan').count(), 0);
    await shot('rn-12-pelajar-tawaran');
    // dokumen penyertaan dimuat turun sebelum menerima
    const [dlS] = await Promise.all([page.waitForEvent('download'), page.locator('#rn-kad-dokumen [data-dok] [data-act=muat]').first().click()]);
    assert.match(dlS.suggestedFilename(), /^Surat Tawaran/);
    await page.click('#rn-btn-terima');
    await page.waitForSelector('#rn-otp-kod');
    // kod salah
    await page.fill('#rn-otp-kod', '000000');
    await page.click('#rn-otp-sahkan');
    await page.waitForFunction(() => /Kod tidak betul/.test(document.querySelector('#rn-otp-panel').textContent));
    await page.fill('#rn-otp-kod', otpCode(env, AINA));
    await page.click('#rn-otp-sahkan');
    await page.waitForSelector('#rn-kad-penerimaan');
    assert.match(await text('#rn-kad-penerimaan'), /Tawaran telah diterima pada \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Diterima');
    await shot('rn-13-diterima');
    const dokNames = await page.locator('#rn-kad-dokumen .rn-lnk').allTextContents();
    assert.deepEqual(dokNames.map((x) => x.replace(/^\d+\. /, '')), ['Surat Tawaran', 'Rekod Penerimaan Tawaran']);
    const [dlR] = await Promise.all([page.waitForEvent('download'), page.locator('#rn-kad-dokumen [data-dok]').nth(1).locator('[data-act=muat]').click()]);
    assert.match(dlR.suggestedFilename(), /^Rekod Penerimaan Tawaran PLT-\d{4}-0001\.pdf$/);
    assert.match(fs.readFileSync(await dlR.path(), 'utf8'), /REKOD PENERIMAAN TAWARAN/);
    // cagaran: muat naik resit rasmi
    await page.waitForSelector('#rn-kad-cagaran [data-form=cagaran]');
    await page.fill('#rn-kad-cagaran [data-k=noResit] input', 'RR-2026-001234');
    await page.fill('#rn-kad-cagaran [data-k=tarikhResit] input', hari(env, 0));
    await page.setInputFiles('#rn-kad-cagaran [data-k=fail] input[type=file]', { name: 'resit.pdf', mimeType: 'application/pdf', buffer: PDF_BUF('resit') });
    await page.waitForFunction(() => /resit\.pdf/.test(document.querySelector('#rn-kad-cagaran [data-k=fail]').textContent));
    await page.click('#rn-kad-cagaran [data-form=cagaran] button.rn-submit');
    await page.waitForFunction(() => /Resit dimuat naik/.test(document.getElementById('rn-det-body').textContent));
    assert.equal(dbRows('Cagaran')[0].Status, 'Menunggu Pengesahan');
    await logout();

    // ---------- Admin: sahkan cagaran, jana perjanjian ----------
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(ADMIN);
    await page.click('#go-rn-admin');
    await page.click('#rn-a-tabs [data-tab=perm]');
    await page.waitForSelector('#rn-a-body tr.click');
    await page.click('#rn-a-body tr.click');
    await page.waitForSelector('#rn-kad-cagaran-admin [data-act=sahkan]');
    await page.click('#rn-kad-cagaran-admin [data-act=sahkan]');
    await page.waitForFunction(() => /Cagaran dikemas kini/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Cagaran')[0].Status, 'Diterima');
    assert.equal(dbRows('Sewaan').length, 0, 'sewaan belum aktif: perjanjian belum disahkan');
    await page.click('#rn-btn-jana-perjanjian');
    await page.waitForFunction(() => /Perjanjian dijana/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Perjanjian');
    await shot('rn-14-admin-perjanjian');
    await logout();

    // ---------- Pelajar memuat naik salinan bertandatangan ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await login(AINA);
    await page.click('#go-rn');
    await page.click('#rn-body [data-id] [data-act=buka]');
    await page.waitForSelector('#rn-kad-perjanjian');
    assert.match(await text('#rn-kad-perjanjian'), /Menunggu salinan bertandatangan/);
    assert.match(await text('#rn-kad-dokumen'), /Lampiran 1/);
    await page.setInputFiles('#rn-fail-tt', { name: 'perjanjian-tt.pdf', mimeType: 'application/pdf', buffer: PDF_BUF('tt') });
    await page.waitForFunction(() => /perjanjian-tt\.pdf/.test(document.querySelector('#rn-kad-perjanjian').textContent));
    await page.click('#rn-btn-muat-tt');
    await page.waitForFunction(() => /menunggu pengesahan admin/i.test(document.getElementById('rn-det-body').textContent));
    // senarai pekerja: pelajar UTM
    await page.waitForSelector('#rn-kad-pekerja [data-form=pekerja]');
    await page.check('#rn-kad-pekerja [data-k=pelajarUtm] input[value=Ya]');
    await page.fill('#rn-kad-pekerja [data-k=noMatrik] input', 'A22UJ0003');
    await page.fill('#rn-kad-pekerja [data-k=umur] input', '22');
    await page.fill('#rn-kad-pekerja [data-k=tugas] input', 'Juru jual');
    await page.click('#rn-kad-pekerja [data-form=pekerja] button.rn-submit');
    await page.waitForFunction(() => /Pekerja ditambah/.test(document.getElementById('rn-det-body').textContent));
    assert.match(await text('#rn-kad-pekerja'), /LIM WEI JIE/);
    await logout();

    // ---------- Admin: sahkan perjanjian -> sewaan aktif ----------
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(ADMIN);
    await page.click('#go-rn-admin');
    await page.click('#rn-a-tabs [data-tab=perm]');
    await page.click('#rn-a-body tr.click');
    await page.waitForSelector('#rn-btn-sahkan-perj');
    await page.fill('#rn-tm-mula', hari(env, 0));
    await page.fill('#rn-tm-tamat', hari(env, 364));
    await page.click('#rn-btn-sahkan-perj');
    await page.waitForFunction(() => /Sewaan kini aktif/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Sewaan').length, 1);
    assert.equal(dbRows('Permohonan_Lot')[0].Status, 'Sewaan Aktif');
    assert.equal(dbRows('Bayaran_Sewa').length, 1, 'bil pertama dijana');
    await shot('rn-15-sewaan-aktif');
    await page.click('#rn-a-det-body button:has-text("Buka sewaan dan bil")');
    await page.waitForSelector('#rn-kad-bil [data-bil]');
    assert.match(await text('#rn-kad-bil'), /Belum Bayar/);
    await logout();

    // ---------- Pelajar bayar sewa; admin sahkan ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await login(AINA);
    await page.click('#go-rn');
    await page.click('#rn-body [data-id] [data-act=buka]');
    await page.waitForSelector('#rn-kad-sewaan [data-bil] details');
    await page.click('#rn-kad-sewaan [data-bil] summary');
    await page.selectOption('#rn-kad-sewaan [data-form=bil] [data-k=kaedah] select', 'PayHub UTM');
    await page.fill('#rn-kad-sewaan [data-form=bil] [data-k=noRujukan] input', 'PH-778899');
    await page.fill('#rn-kad-sewaan [data-form=bil] [data-k=tarikhBayar] input', hari(env, 0));
    await page.setInputFiles('#rn-kad-sewaan [data-form=bil] [data-k=fail] input[type=file]', { name: 'bayar.pdf', mimeType: 'application/pdf', buffer: PDF_BUF('bayar') });
    await page.waitForFunction(() => /bayar\.pdf/.test(document.querySelector('#rn-kad-sewaan [data-form=bil] [data-k=fail]').textContent));
    await page.click('#rn-kad-sewaan [data-form=bil] button.rn-submit');
    await page.waitForFunction(() => /Bayaran direkodkan/.test(document.getElementById('rn-det-body').textContent));
    assert.equal(dbRows('Bayaran_Sewa')[0].Status, 'Menunggu Pengesahan');
    await shot('rn-16-pelajar-bil');
    await logout();
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(ADMIN);
    await page.click('#go-rn-admin');
    await page.click('#rn-a-tabs [data-tab=bil]');
    await page.waitForSelector('#rn-a-body tr.click');
    await page.click('#rn-a-body tr.click');
    await page.waitForSelector('#rn-kad-bil [data-act=sahkan-bil]');
    await page.click('#rn-kad-bil [data-act=sahkan-bil]');
    await page.waitForFunction(() => /Bil dikemas kini/.test(document.getElementById('rn-a-det-body').textContent));
    assert.equal(dbRows('Bayaran_Sewa')[0].Status, 'Dibayar');
    await logout();

    // ---------- Admin bagi pihak pelajar ----------
    await login(ADMIN);
    await page.click('#go-rn-admin');
    await page.waitForSelector('#rn-bp-matrik');
    await page.fill('#rn-bp-matrik', 'A23UJ0001');
    await page.click('#rn-bp-cari');
    await page.waitForSelector('#rn-bagi:not([hidden])');
    assert.match(await text('#rn-bagi'), /bagi pihak: NURUL AINA BINTI HASSAN/);
    await page.waitForSelector('#rn-body [data-id] [data-act=buka]');
    await page.click('#v-rn [data-back]');
    await page.waitForSelector('#rn-dash');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
