// Ujian prototaip pra-demo: fail HTML tunggal dibuka terus dalam pelayar (file://), tanpa pelayan.
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const out = path.join(process.env.E2E_OUT || __dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const file = 'file://' + path.join(__dirname, '..', 'demo', 'utmxcite-demo.html');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const reqs = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url()); });

  let failed = 0;
  const step = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); await page.screenshot({ path: path.join(out, 'FAIL-demo-' + name.replace(/\W+/g, '_') + '.png') }); } };
  const goNav = async (txt) => {
    const item = page.locator('.nav', { hasText: txt }).first();
    if (!(await item.isVisible())) { const g = await item.evaluate((el) => el.closest('.gb').getAttribute('data-g')); await page.click('.gh[data-g="' + g + '"]'); }
    await item.click();
  };
  const quick = async (email) => { if (!(await page.locator('#demobar.open').count())) await page.click('#demobar .dh'); await page.click(email ? '[data-d="' + email + '"]' : '[data-d=""]'); await page.waitForSelector('.kcard'); };

  console.log('Prototaip pra-demo (file:// tanpa pelayan)');
  await page.goto(file);
  await step('SHA-256 simulasi sepadan dengan nilai rujukan', async () => {
    const h = await page.evaluate(() => sha256Hex_('abc'));
    assert.strictEqual(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  await step('dashboard awam dengan data contoh: 17 kad dan nilai bukan sifar', async () => {
    await page.waitForSelector('.kcard');
    assert.strictEqual(await page.locator('.kcard').count(), 17);
    const t = await page.locator('.cont').innerText();
    assert.ok(/CKAI · PERINGKAT PUSAT/i.test(t));
    const vals = await page.locator('.kcard .v').allInnerTexts();
    assert.ok(vals.filter((v) => /[1-9]/.test(v)).length >= 14, 'kebanyakan kad patut ada nilai: ' + vals.join(' | '));
    assert.ok((await page.locator('#demobar').innerText()).toUpperCase().includes('PROTOTAIP PRA-DEMO'));
    await page.screenshot({ path: path.join(out, 'demo-1-dashboard-awam.png'), fullPage: true });
  });
  await step('tiada data peribadi atau permintaan rangkaian luar pada halaman awam', async () => {
    const t = await page.locator('.cont').innerText();
    ['Pelajar Profil Contoh', 'Pelajar Anugerah', 'P24', '000101', '@utm.my'].forEach((x) => assert.ok(!t.includes(x), 'bocor: ' + x));
    assert.deepStrictEqual(reqs, [], 'permintaan luar: ' + reqs.join(','));
  });
  await step('Infografik awam dipaparkan dengan data contoh', async () => {
    await page.click('.nav:has-text("Infografik")');
    await page.waitForSelector('.ig .igp');
    assert.ok((await page.locator('svg.ring').count()) >= 10);
    await page.click('.nav:has-text("Dashboard")');
    await page.waitForSelector('.kcard');
  });
  await step('log masuk OTP: kod simulasi muncul dan berfungsi', async () => {
    await page.click('[data-action="login"]');
    await page.fill('#l_emel', 'pic.fai@utm.my');
    await page.click('button:has-text("Hantar / Hantar Semula Kod")');
    await page.waitForSelector('#demomail .code');
    const code = await page.locator('#demomail .code').innerText();
    assert.match(code, /^\d{6}$/);
    await page.fill('#l_code', code);
    await page.click('button:has-text("Sahkan dan Log Masuk")');
    await page.waitForSelector('.prof >> text=pic.fai@utm.my');
  });
  await step('PIC FAI: hanya KPI dibenarkan; CKAI 4/5/6 tiada', async () => {
    const navs = await page.locator('.nav').evaluateAll((els) => els.map((e) => e.textContent));
    assert.ok(navs.some((n) => n.includes('CKAI 1')) && navs.some((n) => n.includes('KAI 4')));
    assert.ok(!navs.some((n) => /CKAI [456] ·/.test(n)), 'CKAI 4/5/6 tidak sepatutnya kelihatan');
    assert.ok(!navs.some((n) => n.includes('Urus Pengguna')));
  });
  await step('PIC FAI menambah profiling dan data kekal selepas muat semula halaman', async () => {
    await goNav('CKAI 1');
    await page.waitForSelector('table');
    const before = await page.locator('tbody tr').count();
    await page.click('[data-action="new"]');
    await page.waitForSelector('#f_nama_pelajar');
    assert.ok(await page.locator('#f_fakulti').isDisabled()); // dikunci kepada FAI
    await page.fill('#f_nama_pelajar', 'Pelajar Demo Baharu');
    await page.fill('#f_no_matrik', 'DEMO0001');
    await page.fill('#f_tarikh_profiling', '2026-05-05');
    await page.selectOption('#f_sumber_profiling', 'Pendaftaran minat');
    await page.selectOption('#f_tahap_minat', 'Tinggi');
    await page.selectOption('#f_persetujuan', 'Tidak');
    await page.click('#savebtn');
    await page.waitForSelector('[data-field="persetujuan"].invalid');
    await page.selectOption('#f_persetujuan', 'Ya');
    await page.click('#savebtn');
    await page.waitForSelector('td:has-text("Pelajar Demo Baharu")');
    assert.ok((await page.locator('tbody tr').count()) === before + 1);
    await page.reload();
    await page.waitForSelector('.kcard'); // sesi dan data kekal (localStorage)
    assert.ok((await page.locator('.prof').innerText()).includes('pic.fai@utm.my'));
    await goNav('CKAI 1');
    await page.waitForSelector('td:has-text("Pelajar Demo Baharu")');
  });
  await step('Anugerah: sijil PDF contoh boleh dimuat turun', async () => {
    await goNav('CKAI 9');
    await page.waitForSelector('table');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("PDF") >> nth=0')]);
    const buf = require('fs').readFileSync(await dl.path());
    assert.ok(buf.slice(0, 5).toString() === '%PDF-', 'bukan PDF');
  });
  await step('log masuk pantas sebagai Admin: 17 indikator dan menu Admin', async () => {
    await quick('admin.demo@utm.my');
    assert.strictEqual(await page.locator('.nav', { hasText: 'KAI' }).count(), 17);
    assert.strictEqual(await page.locator('.nav', { hasText: 'Urus Pengguna' }).count(), 1);
    await goNav('Log Audit');
    await page.waitForSelector('td:has-text("TAMBAH")');
    await page.screenshot({ path: path.join(out, 'demo-2-admin-audit.png') });
    await goNav('Persediaan');
    await page.waitForSelector('text=Semakan sistem');
    assert.strictEqual(await page.locator('li[data-ok="0"]').count(), 0);
  });
  await step('paparan mengikut fungsi dan sidebar PERINGKAT', async () => {
    await page.click('.nav:has-text("Dashboard")');
    await page.click('[data-action="dview"][data-view="fungsi"]');
    await page.waitForSelector('.grp:has-text("Cross-cutting")');
    assert.strictEqual(await page.locator('.grp').count(), 7);
    await page.screenshot({ path: path.join(out, 'demo-3-dashboard-fungsi.png'), fullPage: true });
  });
  await step('panduan demo dibuka dan set semula memulihkan data contoh', async () => {
    await page.click('#demobar .dh').catch(() => {});
    if (!(await page.locator('#demobar.open').count())) await page.click('#demobar .dh');
    await page.click('[data-a="guide"]');
    await page.waitForSelector('#demomodal h2');
    assert.ok((await page.locator('#demomodal').innerText()).includes('aliran demo'));
    await page.click('#demomodal button');
    page.once('dialog', (d) => d.accept());
    await page.click('[data-a="reset"]');
    await page.waitForSelector('.kcard');
    await quick('pic.fai@utm.my');
    await goNav('CKAI 1');
    await page.waitForSelector('table');
    assert.strictEqual(await page.locator('td:has-text("Pelajar Demo Baharu")').count(), 0, 'rekod demo patut hilang selepas set semula');
  });
  await step('paparan telefon tidak melimpah mendatar', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const mp = await m.newPage(); await mp.goto(file); await mp.waitForSelector('.kcard');
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, 'melimpah ' + overflow + 'px');
    await mp.screenshot({ path: path.join(out, 'demo-4-telefon.png') });
    await m.close();
  });
  console.log(errors.length ? 'Ralat konsol/halaman:\n  ' + errors.join('\n  ') : 'Tiada ralat konsol/halaman.');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
