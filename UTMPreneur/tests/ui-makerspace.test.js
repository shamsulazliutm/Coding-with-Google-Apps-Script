'use strict';
/**
 * Ujian antara muka Makerspace dalam Chromium: pelajar menempah, penyelia memperakui melalui pautan tanpa log masuk,
 * admin meluluskan; bil, bayaran dan pengurusan admin. google.script.run dan google.script.url.getLocation ditiru.
 * Dilangkau jika Chromium tiada.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./makerspace-helpers');

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
    window.google = { script: {
      run: (function () {
        function make(s, f) { return {
          withSuccessHandler: function (fn) { return make(fn, f); },
          withFailureHandler: function (fn) { return make(s, fn); },
          rpc: function (m, t, p) { window.__rpc(m, t, p).then(function (r) { if (s) s(r); }).catch(function (e) { if (f) f(e); }); }
        }; }
        return make(null, null);
      })(),
      url: { getLocation: function (cb) { cb({ hash: '', parameter: window.__PARAM || {}, parameters: {} }); } }
    } };
  </script>`;
  return html.replace('<main id="main">', shim + '<main id="main">');
}

test('UI Makerspace: pelajar menempah Laser Cut, penyelia memperakui melalui pautan, admin meluluskan, bil dan bayaran, urus admin', { skip: !available && 'Chromium tiada' }, async () => {
  const { env, admin } = H.mkEnv();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.exposeFunction('__rpc', async (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`)));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utmpreneur-uimk-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, buildHtml());
    const track = (pg) => {
      pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    };
    const page = await ctx.newPage();
    track(page);
    const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
    const text = async (sel, pg) => ((await (pg || page).locator(sel).first().textContent()) || '');
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

    // ---------- Pelajar ----------
    await login('aina.contoh@graduate.utm.my', 'A23UJ0001');
    assert.equal(await page.locator('#go-mk').isEnabled(), true, 'butang Makerspace dihidupkan');
    assert.equal(await page.locator('#go-mk-admin').isVisible(), false);
    await shot(page, 'mk-01-home');
    await page.click('#go-mk');
    await page.waitForSelector('#v-mk:not([hidden])');
    await page.waitForFunction(() => /NURUL AINA/.test(document.getElementById('mk-pemohon').textContent));
    assert.equal(await page.locator('#mk-new-laser').isEnabled(), true);
    assert.match(await text('#mk-list'), /Belum ada tempahan/);
    await shot(page, 'mk-02-hub');

    // borang ruang: medan bersyarat
    await page.click('#mk-new-ruang');
    await page.waitForSelector('#mk-form-box [data-k=namaProgram] input');
    assert.equal(await visible('#mk-form-box [data-k=noVot]'), false);
    assert.equal(await visible('#mk-form-box [data-k=kaedahLain]'), false);
    await page.check('#mk-form-box [data-k=kaedahBayaran] input[value="Invois Dalaman"]');
    assert.equal(await visible('#mk-form-box [data-k=noVot]'), true);
    await page.check('#mk-form-box [data-k=kaedahBayaran] input[value="Lain-lain"]');
    assert.equal(await visible('#mk-form-box [data-k=kaedahLain]'), true);
    assert.equal(await page.locator('#mk-form-box [data-k=emelPenyelia]').isVisible(), true, 'pelajar wajib penyelia');
    await page.selectOption('#mk-form-box [data-k=kodSumber] select', 'MAKER_LAB');
    await page.fill('#mk-form-box [data-k=tarikh] input', H.opDay(5));
    await page.fill('#mk-form-box [data-k=bilPeserta] input', '30');
    await page.check('#mk-form-box [data-k=kaedahBayaran] input[value=Tunai]');
    await page.click('#mk-form-box [data-k=peralatan] .btn.link');
    await page.selectOption('#mk-form-box [data-k=peralatan] .rep-row select', 'ALAT_FLIP_CHART');
    await page.waitForFunction(() => /Jumlah anggaran: RM260\.00/.test((document.getElementById('mk-est') || {}).textContent || ''), null, { timeout: 8000 });
    await shot(page, 'mk-03-borang-ruang');
    // hantar tanpa kertas kerja -> ralat bertanda
    await page.click('#btn-mk-hantar');
    await page.waitForFunction(() => document.querySelectorAll('#mk-form-box .has-err').length >= 2);
    assert.equal(await page.locator('#mk-form-box [data-k=failKertasKerja] .fe').isVisible(), true);
    await page.click('#btn-mk-form-balik');
    await page.waitForSelector('#v-mk:not([hidden])');

    // borang Laser Cut
    await page.click('#mk-new-laser');
    await page.waitForSelector('#mk-form-box [data-k=namaProjek] input');
    const tarikh = H.opDay(2);
    await page.selectOption('#mk-form-box [data-k=kodSumber] select', 'LASER1');
    await page.fill('#mk-form-box [data-k=namaProjek] input', 'Papan nama');
    await page.fill('#mk-form-box [data-k=tujuan] textarea', 'Projek kursus');
    await page.fill('#mk-form-box [data-k=tarikh] input', tarikh);
    await page.selectOption('#mk-form-box [data-k=masaMula] select', '09:00');
    await page.fill('#mk-form-box [data-k=masaDijangkaMin] input', '45');
    await page.fill('#mk-form-box [data-k=jenisBahan] input', 'Akrilik 3mm');
    await page.fill('#mk-form-box [data-k=emelPenyelia] input', 'rakan@graduate.utm.my');
    await page.waitForFunction(() => /Jumlah anggaran: RM9\.00/.test((document.getElementById('mk-est') || {}).textContent || ''), null, { timeout: 8000 });
    await page.click('#mk-form-box [data-k=perakuan] input');
    await page.click('#btn-mk-hantar');
    await page.waitForFunction(() => /utm\.my/.test((document.querySelector('#mk-form-box [data-k=emelPenyelia] .fe') || {}).textContent || ''));
    assert.equal(env.plain(env.run("Db.rows('Tempahan').length")), 0, 'tiada tempahan dibuat dengan emel penyelia yang salah');
    await page.fill('#mk-form-box [data-k=emelPenyelia] input', H.PENYELIA);
    await page.waitForFunction(() => /Slot sudah ditempah/.test((document.getElementById('mk-avail') || {}).textContent || ''));
    await shot(page, 'mk-04-borang-laser');
    await page.click('#btn-mk-hantar');
    await page.waitForFunction(() => /Tempahan dihantar: TMP-/.test(document.getElementById('mk-det-body').textContent), null, { timeout: 8000 });
    assert.match(await text('#mk-det-body'), /Menunggu Perakuan/);
    assert.match(await text('#mk-det-body'), /Papan nama/);
    assert.match(await text('#mk-det-body'), /p\*\*\*@utm\.my/);
    await shot(page, 'mk-05-butiran');
    const id = env.plain(env.run("Db.rows('Tempahan')[0].ID_Tempahan"));
    // slot kini sibuk dan konflik dilaporkan oleh pelayan
    await page.click('#btn-mk-det-balik');
    await page.waitForFunction(() => document.querySelectorAll('#mk-list .mk-item').length === 1);
    assert.match(await text('#mk-list'), new RegExp(id));
    await logout();

    // ---------- Penyelia: pautan tanpa log masuk ----------
    const tok = H.tokenPerakuan(env);
    const pg2 = await ctx.newPage();
    track(pg2);
    await pg2.addInitScript((t) => { window.__PARAM = { perakuan: t }; }, tok);
    await pg2.goto('file://' + file, { waitUntil: 'load' });
    await pg2.waitForSelector('#v-mk-perakuan:not([hidden])');
    await pg2.waitForSelector('#mk-pk-ringkasan');
    const rk = await text('#mk-pk-body', pg2);
    assert.match(rk, /NURUL AINA BINTI HASSAN/);
    assert.match(rk, /Papan nama/);
    assert.ok(!rk.includes('A23UJ0001') && !rk.includes('aina.contoh'), 'tiada data peribadi lanjut');
    assert.equal(await pg2.locator('#v-emel').isVisible(), false, 'tidak perlu log masuk');
    assert.equal(await pg2.locator('#btn-keluar').isVisible(), false);
    await shot(pg2, 'mk-06-perakuan');
    env.advance(61);
    await pg2.click('#mk-pk-otp');
    await pg2.waitForSelector('#mk-pk-kod');
    // OTP salah
    await pg2.fill('#mk-pk-kod', '000000');
    await pg2.click('#mk-pk-sahkan');
    await pg2.waitForFunction(() => /Kod tidak betul|OTP/i.test(document.getElementById('msg-mk-pk2').textContent));
    // OTP betul, tolak memerlukan catatan; kemudian perakui
    await pg2.fill('#mk-pk-kod', H.kodOtp(env));
    await pg2.check('#mk-pk-body [data-k=tindakan] input[value=tolak]');
    await pg2.click('#mk-pk-sahkan');
    await pg2.waitForFunction(() => /Catatan wajib/.test(document.getElementById('msg-mk-pk2').textContent));
    await pg2.check('#mk-pk-body [data-k=tindakan] input[value=perakui]');
    await pg2.click('#mk-pk-sahkan');
    await pg2.waitForSelector('#mk-pk-selesai');
    assert.match(await text('#mk-pk-selesai', pg2), /diperakui/);
    assert.equal(env.plain(env.run("Db.rows('Tempahan')[0].Status")), 'Menunggu Kelulusan');
    // muat semula pautan sama: tidak sah (mesej generik)
    await pg2.reload({ waitUntil: 'load' });
    await pg2.waitForFunction(() => /Pautan tidak sah atau telah tamat tempoh/.test(document.getElementById('mk-pk-body').textContent));
    await pg2.close();

    // ---------- Admin ----------
    await page.setViewportSize({ width: 1280, height: 900 });
    await login('utmxcite@utm.my');
    assert.equal(await page.locator('#go-mk-admin').isVisible(), true);
    await page.waitForFunction(() => /1 menunggu/.test(document.getElementById('pill-mk-admin').textContent));
    await page.click('#go-mk-admin');
    await page.waitForSelector('#mk-ad-senarai tr[data-id]');
    assert.match(await text('#mk-ad-ringkas'), /Menunggu kelulusan: 1/);
    assert.equal(await page.locator('[data-amaran=kadar]').count(), 1, 'amaran kadar belum ditetapkan');
    await shot(page, 'mk-07-admin');
    await page.fill('#mk-f-q', 'tidak-wujud');
    await page.waitForFunction(() => document.querySelectorAll('#mk-ad-senarai tr[data-id]').length === 0);
    await page.fill('#mk-f-q', 'aina');
    await page.waitForFunction(() => document.querySelectorAll('#mk-ad-senarai tr[data-id]').length === 1);
    await page.click('#mk-ad-senarai tr[data-id]');
    await page.waitForSelector('#mk-adet-body [data-act=lulus]');
    assert.match(await text('#mk-adet-body'), /AMIRUL|NURUL AINA/);
    assert.match(await text('#mk-adet-body'), /Diperakui|Status perakuan/);
    await shot(page, 'mk-08-admin-butiran');
    // tolak memerlukan catatan
    await page.click('#mk-adet-body [data-act=tolak]');
    await page.click('#mk-adet-body [data-act=tolak]');
    await page.waitForFunction(() => /Catatan wajib/.test(document.getElementById('msg-mk-adet').textContent));
    // luluskan: dua tekan
    await page.click('#mk-adet-body [data-act=lulus]');
    assert.equal(env.plain(env.run("Db.rows('Tempahan')[0].Status")), 'Menunggu Kelulusan', 'belum diluluskan selepas satu tekan');
    await page.click('#mk-adet-body [data-act=lulus]');
    await page.waitForFunction(() => /Diluluskan/.test(document.querySelector('#mk-adet-body .pill').textContent));
    assert.equal(env.plain(env.run("Db.rows('Tempahan')[0].Status")), 'Diluluskan');

    // tab jadual
    await page.click('#btn-mk-adet-balik');
    await page.click('#mk-ad-tabs [data-tab=jadual]');
    await page.waitForFunction((t) => new RegExp(t).test(document.getElementById('mk-j-hasil').textContent), tarikh);
    assert.match(await text('#mk-j-hasil'), /Papan nama|Laser Cutter A/);

    // tab alat: tambah alat
    await page.click('#mk-ad-tabs [data-tab=alat]');
    await page.waitForSelector('#mk-ad-panel [data-kod=SOLDER]');
    await page.fill('#mk-ad-panel .fbox [data-k=kod] input', 'gerudi');
    await page.fill('#mk-ad-panel .fbox [data-k=nama] input', 'Gerudi tangan');
    await page.fill('#mk-ad-panel .fbox [data-k=jumlah] input', '3');
    await page.click('#btn-mk-alat');
    await page.waitForSelector('#mk-ad-panel [data-kod=GERUDI]');
    assert.equal(env.plain(env.run("Mk.alat('GERUDI').Kuantiti_Jumlah")), 3);
    // ralat pengesahan
    await page.fill('#mk-ad-panel .fbox [data-k=kod] input', 'x');
    await page.click('#btn-mk-alat');
    await page.waitForFunction(() => document.querySelectorAll('#mk-ad-panel .fbox .has-err').length >= 1);

    // tab kadar: tetapkan kadar kosong
    await page.click('#mk-ad-tabs [data-tab=kadar]');
    await page.waitForSelector('#mk-ad-panel [data-kod=ALAT_EXTENSION_WIRE]');
    assert.match(await text('#mk-ad-panel'), /Belum ditetapkan/);
    await page.locator('#mk-ad-panel tr[data-kod=ALAT_EXTENSION_WIRE]').first().click();
    await page.fill('#mk-ad-panel .fbox [data-k=kadar] input', '3.50');
    await page.click('#btn-mk-kadar');
    await page.waitForFunction(() => /Disimpan/.test(document.getElementById('msg-mk-kadar').textContent));
    assert.equal(env.plain(env.run("Db.rows('KADAR').filter(function(r){return r.Kod_Sumber==='ALAT_EXTENSION_WIRE' && r.Jenis_Pengguna==='Pelajar';})[0].Kadar_RM")), 3.5);

    // tab bagi pihak: pinjaman untuk pelajar lain
    await page.click('#mk-ad-tabs [data-tab=bagi]');
    await page.fill('#mk-bg-nilai', 'ZZ99999');
    await page.click('#btn-mk-bg');
    await page.waitForFunction(() => /tidak ditemui/i.test(document.getElementById('msg-mk-bg').textContent));
    await page.fill('#mk-bg-nilai', 'A23UJ0002');
    await page.click('#btn-mk-bg');
    await page.waitForSelector('#mk-bg-hasil [data-jenis=Pinjaman]');
    assert.match(await text('#mk-bg-hasil'), /AMIRUL HAKIM/);
    await page.click('#mk-bg-hasil [data-jenis=Pinjaman]');
    await page.waitForSelector('#mk-form-box [data-k=tarikhPulang] input');
    assert.match(await text('#mk-bagi-info'), /Bertindak bagi pihak: AMIRUL HAKIM BIN ROSLI \(A23UJ0002\)/);
    await page.click('#mk-form-box [data-k=item] .rep-row ~ .btn.link').catch(() => {});
    await page.selectOption('#mk-form-box [data-k=item] .rep-row select', 'SOLDER');
    await page.fill('#mk-form-box [data-k=tarikh] input', H.opDay(1));
    await page.fill('#mk-form-box [data-k=tarikhPulang] input', H.opDay(8));
    await page.fill('#mk-form-box [data-k=tujuan] textarea', 'Projek PSM');
    await page.fill('#mk-form-box [data-k=emelPenyelia] input', H.PENYELIA);
    await page.click('#mk-form-box [data-k=perakuan] input');
    await page.click('#btn-mk-hantar');
    await page.waitForFunction(() => /Tempahan dihantar: TMP-/.test(document.getElementById('mk-adet-body').textContent), null, { timeout: 8000 });
    assert.match(await text('#mk-adet-body'), /Menunggu Perakuan/);
    assert.match(await text('#mk-adet-body'), /Didaftar|didaftar admin/);
    const pj = env.plain(env.run("Db.rows('Tempahan')[1]"));
    assert.equal(pj.Emel_Pemohon, 'amirul.contoh@graduate.utm.my');
    assert.equal(pj.Didaftar_Oleh, 'utmxcite@utm.my');
    await logout();

    // ---------- Bil dihasilkan oleh kerja harian; pelajar membayar; admin mengesahkan ----------
    H.bekukan(env, H.addDays(tarikh, 1), '07:00');
    env.run('Makerspace.jobHarian()');
    assert.equal(env.plain(env.run("Db.rows('Bayaran_Makerspace').length")), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await login('aina.contoh@graduate.utm.my');
    await page.waitForFunction(() => /Perlu tindakan|aktif|Tempah/.test(document.getElementById('pill-mk').textContent));
    await page.click('#go-mk');
    await page.waitForSelector('#mk-list .mk-item');
    assert.match(await text('#mk-list'), /Bil BMK-\d{4}-0001: Belum Bayar RM9\.00/);
    await page.click('#mk-list .mk-item');
    await page.waitForSelector('#btn-mk-bayar');
    await shot(page, 'mk-09-bayaran');
    await page.click('#btn-mk-bayar');
    await page.waitForFunction(() => /Masukkan no\. rujukan/.test(document.getElementById('msg-mk-bayar').textContent + document.getElementById('mk-det-body').textContent));
    await page.selectOption('#mk-det-body [data-k=kaedah] select', 'Pindahan Bank');
    await page.fill('#mk-det-body [data-k=noRujukan] input', 'TRX-001');
    await page.setInputFiles('#mk-det-body [data-k=resit] input[type=file]', { name: 'resit.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]) });
    await page.waitForFunction(() => /resit\.png/.test(document.querySelector('#mk-det-body [data-k=resit]').textContent));
    await page.click('#btn-mk-bayar');
    await page.waitForFunction(() => /Menunggu Pengesahan/.test(document.getElementById('mk-det-body').textContent), null, { timeout: 8000 });
    assert.equal(env.plain(env.run("Db.rows('Bayaran_Makerspace')[0].Status")), 'Menunggu Pengesahan');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Resit/ }).first().click()]);
    assert.match(dl.suggestedFilename(), /^RESIT_BMK-/);
    await logout();

    await page.setViewportSize({ width: 1280, height: 900 });
    await login('utmxcite@utm.my');
    await page.click('#go-mk-admin');
    await page.click('#mk-ad-tabs [data-tab=bayaran]');
    await page.waitForSelector('#mk-ad-panel tr[data-id^=BMK]');
    await page.click('#mk-ad-panel tr[data-id^=BMK]');
    await page.waitForSelector('#mk-bay-aksi [data-act=sahkan]');
    await page.click('#mk-bay-aksi [data-act=sahkan]');
    await page.waitForFunction(() => /Dibayar/.test(document.querySelector('#mk-ad-panel').textContent) && !document.querySelector('#mk-bay-aksi .card'));
    assert.equal(env.plain(env.run("Db.rows('Bayaran_Makerspace')[0].Status")), 'Dibayar');
    await shot(page, 'mk-10-admin-bayaran');
    await logout();

    // Penilai tiada akses, Pemerhati baca sahaja (menu)
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
