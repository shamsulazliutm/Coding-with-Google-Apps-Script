// Ujian hujung ke hujung: pelayar sebenar + pelayan GAS tiruan (logik .gs yang sama).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { loadGas } = require('./mock');

const root = path.join(__dirname, '..');
const out = path.join(process.env.E2E_OUT || __dirname, 'shots');
fs.mkdirSync(out, { recursive: true });

function buildHtml() {
  const inc = (n) => fs.readFileSync(path.join(root, n + '.html'), 'utf8');
  return inc('Index').replace('<?= appName ?>', 'UTMXCITE 4 ASCEEN 2030 Report')
    .replace(/<\?!= include\('(\w+)'\) \?>/g, (_, n) => inc(n));
}

(async () => {
  const env = loadGas({ now: Date.UTC(2026, 4, 15, 4, 0, 0) });
  const g = env.g;
  g.setup();
  const code = () => /OTP anda ialah: (\d{6})/.exec(env.sent[env.sent.length - 1].body)[1];
  const login = (e) => { g.api_requestOtp(e); return g.api_verifyOtp(e, code()).data.token; };
  const admin = login('admin@utm.my');
  g.api_saveUser(admin, { emel: 'pic.fai@utm.my', nama: 'Siti Aminah', peranan: 'PIC', fakulti: 'FAI', kpi_akses: 'KAI1,KAI4,KAI6', aktif: 'Ya' });
  // Data contoh untuk dashboard (hanya dalam ujian, bukan dalam produk).
  g.api_save(admin, 'KAI1', { aliran: 'Technology Startup', jenis: 'Inkubator Fakulti', fakulti: 'FC', nama_inkubator: 'Launchpad FC', didaftarkan: 'Ya', tarikh_pendaftaran: '2026-03-01', status: 'Beroperasi', tarikh_beroperasi: '2026-04-01' });
  for (let i = 0; i < 6; i++) g.api_save(admin, 'KAI4', { fakulti: i % 2 ? 'FAI' : 'FC', nama_pelajar: 'Pelajar ' + i, no_matrik: 'A24' + i, status: 'Mendaftar', tarikh_daftar: '2026-03-0' + (i + 1) });
  for (let i = 0; i < 7; i++) g.api_save(admin, 'KAI6', { fakulti: ['FAI', 'FC', 'FKE', 'MJIIT'][i % 4], nama_pelajar: 'AI ' + i, no_matrik: 'B' + i, status: 'Dalam latihan', tarikh_mula_latihan: '2026-05-04', nama_startup: 'Startup ' + (i % 3) });
  const m2 = g.api_list(admin, 'KAI2', {}).data.rows[0];
  g.api_save(admin, 'KAI2', Object.assign({}, m2, { peratus_siap: 60, status: 'Dalam proses' }));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.exposeFunction('__gas', (fn, args) => JSON.parse(JSON.stringify(g[fn](...args))));
  await page.addInitScript(() => {
    window.google = { script: { run: new Proxy({}, { get: (_, fn) => {
      if (fn === 'withSuccessHandler' || fn === 'withFailureHandler') return undefined;
      return undefined;
    } }) } };
    function makeRunner(ok, fail) {
      return new Proxy({}, { get: (_, name) => {
        if (name === 'withSuccessHandler') return (f) => makeRunner(f, fail);
        if (name === 'withFailureHandler') return (f) => makeRunner(ok, f);
        return (...args) => { window.__gas(name, args).then((r) => ok && ok(r), (e) => fail && fail(e)); };
      } });
    }
    window.google = { script: { run: makeRunner(null, null) } };
  });
  const htmlPath = path.join(out, 'index.html');
  fs.writeFileSync(htmlPath, buildHtml());
  await page.goto('file://' + htmlPath);

  const step = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); process.exitCode = 1; await page.screenshot({ path: path.join(out, 'FAIL-' + name.replace(/\W+/g, '_') + '.png') }); } };
  const text = async (sel) => (await page.locator(sel).innerText());

  console.log('Pelayar (Chromium)');
  await step('dashboard awam dimuatkan tanpa log masuk (14 kad: 7 KPI + 7 CKAI)', async () => {
    await page.waitForSelector('.kcard');
    assert.strictEqual(await page.locator('.kcard').count(), 14);
    assert.ok((await text('.cont')).toUpperCase().includes('CENTER (CKAI)'));
    assert.ok((await text('.side')).includes('Pengunjung'));
    assert.ok(!(await text('.side')).includes('Urus Pengguna'));
    assert.ok((await text('.kcard >> nth=0')).includes('KAI 1'));
    const logoOk = await page.evaluate(() => { const i = document.querySelector('.brandlogo img'); return !!i && i.complete && i.naturalWidth > 100; });
    assert.ok(logoOk, 'logo UTM tidak dimuatkan dalam sidebar');
    await page.screenshot({ path: path.join(out, '1-dashboard-awam.png'), fullPage: true });
  });
  await step('KAI 6 menunjukkan 7 / 20 minimum dan butiran fakulti', async () => {
    const k6 = page.locator('.kcard:has(.t:text-is("KAI 6 · Tubuhkan UTM AI Start Up"))');
    assert.ok((await k6.innerText()).includes('7'));
    assert.ok((await k6.innerText()).includes('20'));
    await k6.locator('summary').click();
    assert.ok((await k6.innerText()).includes('FAI'));
  });
  await step('pemilih tahun menukar sasaran KAI 3 kepada 30 (2027)', async () => {
    await page.selectOption('#yr', '2027');
    await page.waitForFunction(() => document.querySelector('#yr').value === '2027' && /30/.test(document.body.innerText));
    assert.ok((await text('.kcard >> nth=2')).includes('30'));
    await page.selectOption('#yr', '2026');
    await page.waitForFunction(() => /25/.test(document.querySelectorAll('.kcard')[2].innerText));
  });
  await step('log masuk Admin dengan OTP', async () => {
    await page.click('[data-action="login"]');
    await page.fill('#l_emel', 'admin@utm.my');
    await page.click('button:has-text("Hantar OTP")');
    await page.waitForSelector('#l_code');
    await page.fill('#l_code', code());
    await page.click('button:has-text("Sahkan")');
    await page.waitForSelector('.prof >> text=admin@utm.my');
    assert.ok((await text('.side')).includes('Urus Pengguna'));
    assert.strictEqual(await page.locator('.nav', { hasText: 'KAI' }).count(), 14);
    await page.screenshot({ path: path.join(out, '2-dashboard-admin.png') });
  });
  await step('OTP salah menunjukkan ralat', async () => {
    await page.click('[data-action="logout"]');
    await page.click('[data-action="login"]');
    await page.fill('#l_emel', 'admin@utm.my');
    await page.click('button:has-text("Hantar OTP")');
    await page.waitForSelector('#l_code');
    const wrong = code() === '123456' ? '654321' : '123456';
    await page.fill('#l_code', wrong);
    await page.click('button:has-text("Sahkan")');
    await page.waitForSelector('.dlg .err:has-text("tidak sah")');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.dlg', { state: 'detached' });
  });
  await step('PIC FAI: hanya 3 KPI, fakulti dikunci, simpan rekod KAI 4', async () => {
    await page.click('[data-action="login"]');
    await page.fill('#l_emel', 'pic.fai@utm.my');
    await page.click('button:has-text("Hantar OTP")');
    await page.waitForSelector('#l_code');
    await page.fill('#l_code', code());
    await page.click('button:has-text("Sahkan")');
    await page.waitForSelector('.prof >> text=Siti Aminah');
    assert.strictEqual(await page.locator('.nav', { hasText: 'KAI' }).count(), 3);
    assert.ok(!(await text('.side')).includes('Urus Pengguna'));
    assert.ok(!(await text('.side')).includes('Makerspace'));
    await page.click('.nav:has-text("GiGAUTM")');
    await page.waitForSelector('table');
    await page.click('[data-action="new"]');
    await page.waitForSelector('#kform');
    assert.ok(await page.locator('#f_fakulti').isDisabled());
    assert.strictEqual(await page.inputValue('#f_fakulti'), 'FAI');
    // Hantar kosong: ralat medan wajib
    await page.click('#savebtn');
    await page.waitForSelector('.invalid .err:has-text("wajib")');
    await page.fill('#f_nama_pelajar', 'Nur Aina <b>x</b>');
    await page.fill('#f_no_matrik', 'A24CS0001');
    await page.selectOption('#f_status', 'Mendaftar');
    await page.click('#savebtn');
    await page.waitForSelector('.invalid .err:has-text("Wajib diisi apabila")'); // tarikh_daftar diperlukan
    await page.fill('#f_tarikh_daftar', '2026-05-10');
    await page.screenshot({ path: path.join(out, '3-borang-kai4.png'), fullPage: true });
    await page.click('#savebtn');
    await page.waitForSelector('.tab.act:has-text("Senarai")');
    await page.waitForSelector('td:has-text("A24CS0001")');
    // XSS: teks HTML dipaparkan sebagai teks, bukan dilaksanakan
    assert.strictEqual(await page.locator('table b').count(), 0);
    assert.ok((await text('table')).includes('<b>x</b>'));
    await page.screenshot({ path: path.join(out, '4-senarai-kai4.png') });
  });
  await step('PIC FAI mengedit rekod sendiri; carian menapis', async () => {
    await page.click('button:has-text("Edit") >> nth=0');
    await page.waitForSelector('#kform');
    assert.ok((await page.inputValue('#f_no_matrik')).length > 0);
    await page.click('[data-action="cancelform"]');
    await page.fill('#q', 'tiada-padanan-xyz');
    await page.waitForSelector('td:has-text("Tiada rekod")');
  });
  await step('log keluar kembali ke paparan awam', async () => {
    await page.click('[data-action="logout"]');
    await page.waitForSelector('.prof >> text=Pengunjung');
    assert.strictEqual(await page.locator('.nav', { hasText: 'KAI 1' }).count(), 0);
  });
  await step('Admin: urus pengguna, sasaran dan log audit', async () => {
    await page.click('[data-action="login"]');
    await page.fill('#l_emel', 'admin@utm.my');
    await page.click('button:has-text("Hantar OTP")');
    await page.waitForSelector('#l_code');
    await page.fill('#l_code', code());
    await page.click('button:has-text("Sahkan")');
    await page.waitForSelector('.prof >> text=admin@utm.my');
    await page.click('.nav:has-text("Urus Pengguna")');
    await page.waitForSelector('#uform');
    await page.fill('#u_emel', 'pic.baru@utm.my');
    await page.fill('#u_akses', 'KAI2'); // tidak dibenarkan bagi PIC
    await page.selectOption('#u_fakulti', 'FKE');
    await page.click('#uform button[type=submit]');
    await page.waitForSelector('.invalid .err:has-text("KPI tidak sah")');
    await page.fill('#u_akses', 'KAI1,KAI6');
    await page.click('#uform button[type=submit]');
    await page.waitForSelector('td:has-text("pic.baru@utm.my")');
    await page.screenshot({ path: path.join(out, '5-admin-pengguna.png') });
    await page.click('.nav:has-text("Sasaran")');
    await page.waitForSelector('input[data-k="sasaran"]');
    await page.click('.nav:has-text("Log Audit")');
    await page.waitForSelector('td:has-text("PENGGUNA_TAMBAH")');
    await page.screenshot({ path: path.join(out, '6-admin-audit.png') });
  });
  await step('Admin memadam rekod melalui dialog pengesahan (batal tidak memadam)', async () => {
    await page.click('.nav:has-text("GiGAUTM")');
    await page.waitForSelector('table');
    const before = await page.locator('tbody tr').count();
    await page.click('button:has-text("Padam") >> nth=0');
    await page.waitForSelector('.dlg:has-text("Padam rekod")');
    await page.click('#cno');
    await page.waitForSelector('.dlg', { state: 'detached' });
    assert.strictEqual(await page.locator('tbody tr').count(), before);
    await page.click('button:has-text("Padam") >> nth=0');
    await page.click('#cyes');
    await page.waitForFunction((n) => document.querySelectorAll('tbody tr').length === n, before - 1);
  });
  await step('Admin merekod pendapatan CKAI 4 (input bulan) dan dashboard memaparkan RM', async () => {
    await page.click('.nav:has-text("CKAI 4")');
    await page.waitForSelector('table');
    await page.click('[data-action="new"]');
    await page.waitForSelector('#f_tempoh');
    await page.selectOption('#f_fakulti', 'FC');
    await page.fill('#f_tempoh', '2026-05');
    await page.fill('#f_nama_perniagaan', 'Kedai E2E');
    await page.selectOption('#f_jenis_pendapatan', 'Jualan produk');
    await page.fill('#f_pendapatan_rm', '1500.5');
    await page.screenshot({ path: path.join(out, '8-borang-ckai4.png'), fullPage: true });
    await page.click('#savebtn');
    await page.waitForSelector('td:has-text("Kedai E2E")');
    await page.click('.nav:has-text("Dashboard")');
    const card = page.locator('.kcard:has(.t:text-is("CKAI 4 · Pendapatan usahawan pelajar"))');
    await card.waitFor();
    assert.ok((await card.innerText()).includes('RM 1,500.50'), await card.innerText());
    assert.ok((await card.innerText()).includes('Tiada sasaran'));
    await page.screenshot({ path: path.join(out, '9-dashboard-ckai.png'), fullPage: true });
  });
  await step('CKAI 7: borang anugerah dengan pelajar berbilang dan muat naik sijil PDF', async () => {
    await page.click('.nav:has-text("CKAI 7")');
    await page.waitForSelector('table');
    await page.click('[data-action="new"]');
    await page.waitForSelector('#f_nama_anugerah');
    await page.selectOption('#f_fakulti', 'FC');
    await page.fill('#f_nama_anugerah', 'Anugerah Inovasi Negara');
    await page.fill('#f_tarikh', '2026-05-12');
    await page.fill('#f_agensi', 'MOSTI');
    await page.selectOption('#f_peringkat', 'Kebangsaan');
    await page.selectOption('#f_kategori', 'Inovasi');
    await page.selectOption('#f_program', 'UTM AI Start Up');
    await page.fill('#f_mentor', 'Dr. Mentor');
    const pk = (i, f) => page.locator('[data-pk="pelajar"][data-pi="' + i + '"][data-pf="' + f + '"]');
    await pk(0, 'nama').fill('Ali Bin Abu'); await pk(0, 'matrik').fill('A24CS0001'); await pk(0, 'nokp').fill('123');
    await page.click('[data-action="padd"][data-key="pelajar"]');
    await pk(1, 'nama').fill('Siti Binti Ahmad'); await pk(1, 'matrik').fill('A24CS0002'); await pk(1, 'nokp').fill('010203-10-1234');
    assert.strictEqual(await page.locator('.prow').count(), 2);
    // fail bukan PDF ditolak di klien
    await page.setInputFiles('#f_sijil_file', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('bukan pdf') });
    await page.waitForSelector('[data-field="sijil"].invalid .err:has-text("format PDF")');
    // fail palsu bernama .pdf ditolak di pelayan (kandungan sebenar disemak)
    await page.setInputFiles('#f_sijil_file', { name: 'palsu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>bukan pdf sebenar</html>') });
    await page.waitForSelector('[data-field="sijil"].invalid .err:has-text("format PDF")');
    // PDF sebenar diterima
    await page.setInputFiles('#f_sijil_file', { name: 'sijil-anugerah.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF') });
    await page.waitForSelector('.fileinfo:has-text("sijil-anugerah.pdf")');
    await page.screenshot({ path: path.join(out, '10-borang-ckai7.png'), fullPage: true });
    // no. KP pelajar 1 tidak sah: ralat jelas
    await page.click('#savebtn');
    await page.waitForSelector('[data-field="pelajar"].invalid .err:has-text("Pelajar 1")');
    // betulkan, simpan
    await pk(0, 'nokp').fill('900101-14-5678');
    await page.click('#savebtn');
    await page.waitForSelector('td:has-text("Anugerah Inovasi Negara")');
    assert.ok((await text('table')).includes('Ali Bin Abu, Siti Binti Ahmad'));
    assert.ok(!(await text('table')).includes('900101'), 'no. KP tidak boleh dipaparkan dalam jadual');
    await page.screenshot({ path: path.join(out, '11-senarai-ckai7.png') });
  });
  await step('CKAI 7: muat turun sijil dan edit mengekalkan pelajar dan fail', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("PDF")')]);
    assert.strictEqual(dl.suggestedFilename(), 'sijil-anugerah.pdf');
    const content = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(content.startsWith('%PDF-1.4'), 'kandungan muat turun: ' + content.slice(0, 20));
    await page.click('button:has-text("Edit") >> nth=0');
    await page.waitForSelector('#kform');
    assert.strictEqual(await page.locator('.prow').count(), 2);
    assert.strictEqual(await page.locator('[data-pk="pelajar"][data-pi="1"][data-pf="nokp"]').inputValue(), '010203101234');
    assert.ok((await text('.fileinfo')).includes('sijil-anugerah.pdf'));
    await page.click('#savebtn'); // simpan tanpa muat naik semula: rujukan fail sedia ada diterima
    await page.waitForSelector('td:has-text("Anugerah Inovasi Negara")');
    await page.click('.nav:has-text("Dashboard")');
    const card = page.locator('.kcard:has(.t:text-is("CKAI 7 · Anugerah & pengiktirafan inovasi dan keusahawanan"))');
    await card.waitFor();
    assert.ok((await card.innerText()).includes('Pelajar penerima: 2'), await card.innerText());
    const all = await page.locator('.cont').innerText();
    ['Ali Bin Abu', '900101145678', 'A24CS0001', 'sijil-anugerah'].forEach(x => assert.ok(!all.includes(x), 'bocor dalam dashboard: ' + x));
  });
  await step('paparan telefon: menu boleh dibuka dan dashboard tidak melimpah mendatar', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const mp = await mobile.newPage();
    await mp.exposeFunction('__gas', (fn, args) => JSON.parse(JSON.stringify(g[fn](...args))));
    await mp.addInitScript(() => {
      function makeRunner(ok, fail) { return new Proxy({}, { get: (_, name) => {
        if (name === 'withSuccessHandler') return (f) => makeRunner(f, fail);
        if (name === 'withFailureHandler') return (f) => makeRunner(ok, f);
        return (...args) => { window.__gas(name, args).then((r) => ok && ok(r), (e) => fail && fail(e)); };
      } }); }
      window.google = { script: { run: makeRunner(null, null) } };
    });
    await mp.goto('file://' + htmlPath);
    await mp.waitForSelector('.kcard');
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, 'melimpah mendatar: ' + overflow + 'px');
    await mp.click('.burger');
    await mp.waitForSelector('.side.open');
    await mp.screenshot({ path: path.join(out, '7-telefon-menu.png') });
    await mobile.close();
  });

  console.log(errors.length ? 'Ralat konsol:\n  ' + errors.join('\n  ') : 'Tiada ralat konsol/halaman.');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
