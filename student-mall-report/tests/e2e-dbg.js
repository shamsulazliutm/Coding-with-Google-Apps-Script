const { chromium } = require('playwright');
const assert = require('assert');
const { createBackend } = require('./gas-harness');
const S = __dirname;
const OUT = require('path').join(S, 'out'); require('fs').mkdirSync(OUT, { recursive: true });
const INDEX = 'file://' + require('path').join(S, '..', 'Index.html');
const b = createBackend();
const pdf = Buffer.from('%PDF-1.4\n%t\n1 0 obj<<>>endobj\n%%EOF').toString('base64');
const ok = (m, t, p) => { const r = b.rpc(m, t, p); if (!r.ok) throw new Error(m + ': ' + r.error); return r.data; };
const login = email => { delete b.cache['otpwait:' + email]; ok('requestOtp', null, { email }); const c = b.outbox[b.outbox.length - 1].htmlBody.match(/letter-spacing:6px[^>]*>(\d{6})</)[1]; return { code: c, ...ok('verifyOtp', null, { email, code: c }) }; };

// ---- benih data ----
b.setupSystem();
let adm = login('utmxcite@utm.my');
const lots = [['Student Mall', 1, 'Ayu Rahimah', 'Warung Ayu', 'ok'], ['Student Mall', 2, 'Hafiz Zainal', 'Print Siswa', 'ok'], ['Student Mall', 3, 'Aina Sofea', 'Kopi Kampus Enterprise', 'fix'],
  ['Student Mall', 4, 'Nurul Izzati', 'Roti Gebu', 'sent'], ['Student Mall', 5, 'Farah Najwa', 'Batik Muda', 'ok'], ['Student Mall', 6, 'M. Safihakimi', 'Whiskers & Bean', 'sent'],
  ['Student Mall', 7, 'Adam Harith', 'Tech Fixit', 'none'], ['SUB', 1, 'Hakim Roslan', 'Minuman Segar', 'ok'], ['SUB', 2, 'Din Ismail', 'Nasi Lemak Pak Din', 'none']];
lots.forEach(([lok, no, nama, biz, st], i) => {
  const email = nama.split(' ')[0].toLowerCase() + '@graduan.example', kod = lok.replace(/\s/g, '') + '-Lot' + no;
  const idSewa = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: kod, mula: '2026-01-01', akhir: '2026-12-31', sewa: '600' } }).tenancies.find(x => x.kodLot === kod).id;
  ok('adminSaveUser', adm.token, { user: { email, nama, peranan: 'Penyewa', idSewa, status: 'Aktif' } });
  const t = login(email).token;
  ok('saveBusiness', t, { biz: { nama: biz, jenis: 'Makanan dan minuman', ssm: '003412345-K', pelajar: nama, kp: '01020301' + String(1000 + i), matrik: 'A22EA01' + (10 + i), fakulti: 'FKA', telefon: '012-345 67' + (10 + i) } });
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  months.forEach(m => {
    const target = m === 9 ? st : 'ok';
    if (target === 'none') return;
    const inc = 5000 + ((i * 37 + m * 91) % 4000), exp = target === 'fix' && m === 9 ? inc + 910 : inc - 1800;
    ok('saveReport', t, { tahun: 2026, bulan: m, data: { pendapatan: inc, perbelanjaan: exp, sewa: 600, sewaPeralatan: m % 3 === 0, akuan: true } });
    ['laporan', 'sewa'].concat(m % 3 === 0 ? ['incubator'] : []).forEach(k => ok('uploadFile', t, { tahun: 2026, bulan: m, kind: k, base64: pdf }));
    ok('submitReport', t, { tahun: 2026, bulan: m });
    if (target === 'ok' || m < 9) ok('adminReview', adm.token, { kodLot: kod, tahun: 2026, bulan: m, decision: 'ok' });
    if (target === 'fix') ok('adminReview', adm.token, { kodLot: kod, tahun: 2026, bulan: m, decision: 'fix', komen: 'Perbelanjaan terlalu tinggi. Semak sama ada sewa RM600 dikira dua kali dan muat naik semula laporan.' });
  });
});
// SUB Lot 3: Cafe A (Jan-Jun) kemudian Cafe B (Jul-Dis)
[['SUB-Lot3', '2026-01-01', '2026-06-30', 'sitia@graduan.example', 'Siti A', 'Cafe A', 1, 6], ['SUB-Lot3', '2026-07-01', '2026-12-31', 'zulb@graduan.example', 'Zul B', 'Cafe B', 7, 9]].forEach(([kod, mula, akhir, email, nama, biz, m1, m2], i) => {
  const idSewa = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: kod, mula, akhir, sewa: '500' } }).tenancies.find(x => x.kodLot === kod && x.mula === mula).id;
  ok('adminSaveUser', adm.token, { user: { email, nama, peranan: 'Penyewa', idSewa, status: 'Aktif' } });
  const t = login(email).token;
  ok('saveBusiness', t, { biz: { nama: biz, jenis: 'Kafe', ssm: '', pelajar: nama, kp: '0203040' + (51111 + i), matrik: 'A22EA02' + i, fakulti: 'FKA', telefon: '0198765432' } });
  for (let m = m1; m <= m2; m++) {
    ok('saveReport', t, { tahun: 2026, bulan: m, data: { pendapatan: 4000 + m * 10, perbelanjaan: 2500, sewa: 500, sewaPeralatan: false, akuan: true } });
    ['laporan', 'sewa'].forEach(k => ok('uploadFile', t, { tahun: 2026, bulan: m, kind: k, base64: pdf }));
    ok('submitReport', t, { tahun: 2026, bulan: m });
    if (m < 9) ok('adminReview', adm.token, { kodLot: kod, tahun: 2026, bulan: m, decision: 'ok' });
  }
});
ok('adminSaveUser', adm.token, { user: { email: 'rashid@utm.my', nama: 'En. Rashid', peranan: 'Admin', status: 'Aktif' } });
b.outbox.length = 0;
Object.keys(b.cache).filter(k => k.startsWith('otpwait:')).forEach(k => delete b.cache[k]);

let browser;
(async () => {
  browser = await chromium.launch();
  console.log('L56');
  const errs = [];
  async function newPage(w = 1150, h = 800) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
    p.setDefaultTimeout(15000); await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.exposeFunction('__rpc', (m, t, params) => JSON.stringify(b.rpc(m, t, JSON.parse(params))));
    await p.addInitScript(() => {
      const make = (s, f) => ({ withSuccessHandler: fn => make(fn, f), withFailureHandler: fn => make(s, fn),
        rpc(m, t, params) { window.__rpc(m, t, JSON.stringify(params === undefined ? {} : params)).then(r => s && s(JSON.parse(r))).catch(e => f && f(e)); } });
      window.google = { script: { run: make(null, null) } };
    });
    await p.goto(INDEX);
    return p;
  }
  console.log('L69');
  const shot = (p, n, full) => p.screenshot({ path: OUT + '/ui-' + n + '.png', fullPage: !!full });
  console.log('L70');
  const uiLogin = async (p, email) => {
    delete b.cache['otpwait:' + email];
    await p.fill('#lg-email', email); await p.click('[data-act=sendotp]'); await p.waitForSelector('#lg-otp');
    const mail = b.outbox.filter(m => m.to === email).pop(); const code = mail.htmlBody.match(/letter-spacing:6px[^>]*>(\d{6})</)[1];
    await p.fill('#lg-otp', code); await p.click('[data-act=verifyotp]'); await p.waitForSelector('.tabs');
  };
  console.log('L76');
  const settle = p => p.waitForFunction(() => !document.body.classList.contains('busy'));

  // ===== penyewa =====
  console.log('L79');
  let p = await newPage();
  console.log('L80');
  await shot(p, '01-login');
  console.log('L81');
  await p.fill('#lg-email', 'aina@graduan.example'); await p.click('[data-act=sendotp]'); await p.waitForSelector('#lg-otp'); await shot(p, '02-otp');
  console.log('L82');
  await p.fill('#lg-otp', '000000'); await p.click('[data-act=verifyotp]'); await p.waitForSelector('.errbox'); assert.match(await p.textContent('.errbox'), /tidak betul/);
  delete b.cache['otpwait:aina@graduan.example']; p.close();
  p = await newPage(); await uiLogin(p, 'aina@graduan.example');
  console.log('L85');
  assert.match(await p.textContent('.who'), /Penyewa/);
  // ===== dashboard penyewa =====
  console.log('L87');
  await p.waitForSelector('.kpis'); await settle(p);
  console.log('L88');
  assert.match(await p.textContent('.hero'), /Kopi Kampus Enterprise/); assert.match(await p.textContent('.kpis'), /Jumlah pendapatan 2026/);
  console.log('L89');
  assert.ok(await p.locator('.chart svg rect[fill="var(--c1)"]').count() >= 8, 'carta mempunyai bar pendapatan');
  console.log('L90');
  assert.match(await p.textContent('.focus'), /Laporan September 2026/); assert.match(await p.textContent('.kmsg'), /dua kali/);
  console.log('L91');
  await shot(p, '20-dash-penyewa', true);
  console.log('L92');
  await p.click('.focus [data-act=dash-open]'); await p.waitForSelector('#d-inc'); await settle(p);
  console.log('L93');
  assert.match(await p.textContent('#dt'), /September 2026/); await p.click('[data-act=closedlg]');
  console.log('L94');
  await p.click('[data-tab=dash]'); await p.waitForSelector('.kpis');
  console.log('L95');
  await p.click('[data-tab=info]'); await p.waitForSelector('#b-nama'); await settle(p); await shot(p, '03-maklumat', true);
  console.log('L96');
  await p.fill('#b-kp', '123'); await p.click('[data-act=savebiz]'); await p.waitForSelector('.toast.err'); assert.match(await p.textContent('.toast'), /12 digit/);
  console.log('L97');
  await p.fill('#b-kp', '010203011234'); await p.click('[data-act=savebiz]'); await p.waitForFunction(() => /disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  console.log('L98');
  await p.click('[data-tab=fin]'); await p.waitForSelector('#f-rows tr'); await settle(p);
  console.log('L99');
  assert.strictEqual(await p.locator('#f-rows tr').count(), 10); await shot(p, '04-senarai', true);
  // penapis & carian
  console.log('L101');
  await p.selectOption('#f-status', 'fix'); assert.strictEqual(await p.locator('#f-rows tr').count(), 1);
  console.log('L102');
  await p.selectOption('#f-status', ''); await p.fill('#f-q', 'okt'); assert.strictEqual(await p.locator('#f-rows tr').count(), 1); await p.fill('#f-q', '');
  // edit september (perlu dibetulkan)
  console.log('L104');
  await p.click('#f-rows tr:has-text("September") [data-act=open]'); await p.waitForSelector('#d-inc'); await settle(p);
  console.log('L105');
  assert.match(await p.textContent('.banner'), /dua kali/); await shot(p, '05-dialog-edit');
  console.log('L106');
  assert.strictEqual(await p.isDisabled('[data-act=submitreport]'), true);
  console.log('L107');
  await p.fill('#d-exp', '4560'); await p.check('#d-ack'); assert.strictEqual(await p.isDisabled('[data-act=submitreport]'), false);
  // fail bukan PDF
  console.log('L109');
  let [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act=pick][data-kind=laporan]')]); await fc.setFiles(S + '/fake.pdf');
  console.log('L110');
  await p.click('[data-act=submitreport]'); await p.waitForSelector('.dlg .errbox'); assert.match(await p.textContent('.dlg .errbox'), /Hanya fail PDF/);
  // fail PDF sah (ganti)
  [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act=pick][data-kind=laporan]')]); await fc.setFiles(S + '/sample.pdf');
  console.log('L113');
  await p.waitForFunction(() => /belum dimuat naik/.test(document.querySelector('.dlg').textContent)); assert.strictEqual(await p.inputValue('#d-exp'), '4560');
  console.log('L114');
  await shot(p, '06-dialog-fail');
  console.log('L115');
  await p.click('[data-act=submitreport]'); await p.waitForFunction(() => /dihantar untuk semakan/.test((document.querySelector('.toast') || {}).textContent || '')); await settle(p);
  console.log('L116');
  assert.strictEqual(await p.locator('#dlg-slot .scrim').count(), 0);
  console.log('L117');
  assert.match(await p.textContent('#f-rows tr:has-text("September")'), /Dihantar/); assert.match(await p.textContent('#f-rows tr:has-text("September")'), /Lewat/);
  // laporan baharu Oktober
  console.log('L119');
  await p.click('[data-act=newreport]'); await p.waitForSelector('#d-month'); await settle(p);
  console.log('L120');
  await p.fill('#d-inc', '3000'); await p.fill('#d-exp', '1200'); await p.click('[data-act=eq][data-v="0"]'); await p.check('#d-ack');
  for (const k of ['laporan', 'sewa']) { [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act=pick][data-kind=' + k + ']')]); await fc.setFiles(S + '/sample.pdf'); await p.waitForFunction(kk => /belum dimuat naik/.test(document.querySelector('.dlg').textContent), k); }
  console.log('L122');
  await shot(p, '07-dialog-baharu');
  console.log('L123');
  await p.click('[data-act=submitreport]'); await p.waitForFunction(() => /dihantar untuk semakan/.test((document.querySelector('.toast') || {}).textContent || '')); await settle(p);
  console.log('L124');
  assert.match(await p.textContent('#f-rows tr:has-text("Oktober")'), /Dihantar/);
  // padam Oktober (dengan pengesahan)
  console.log('L126');
  await p.click('#f-rows tr:has-text("Oktober") [data-act=del]'); await p.waitForSelector('[role=alertdialog]'); await shot(p, '08-padam');
  console.log('L127');
  await p.click('[data-r="1"]'); await p.waitForFunction(() => /dipadam/.test((document.querySelector('.toast') || {}).textContent || '')); await settle(p);
  console.log('L128');
  assert.match(await p.textContent('#f-rows tr:has-text("Oktober")'), /Belum dihantar/);
  // laporan disahkan: baca sahaja
  console.log('L130');
  await p.click('#f-rows tr:has-text("Januari") [data-act=open]'); await p.waitForSelector('#d-inc'); assert.strictEqual(await p.isDisabled('#d-inc'), true); assert.strictEqual(await p.locator('[data-act=submitreport]').count(), 0);
  console.log('L131');
  await p.click('[data-act=closedlg]');
  console.log('L132');
  await p.click('[data-act=logout]'); await p.waitForSelector('#lg-email');
  // telefon
  console.log('L134');
  const m = await newPage(390, 800); await uiLogin(m, 'aina@graduan.example'); await m.click('[data-tab=fin]'); await m.waitForSelector('#f-rows tr'); await settle(m); await shot(m, '09-telefon');
  console.log('L135');
  const sw = await m.evaluate(() => document.documentElement.scrollWidth); assert.ok(sw <= 392, 'skrol mendatar pada telefon: ' + sw);
  console.log('L136');
  await m.close();

  // ===== admin =====
  console.log('L139');
  const a = await newPage(); await uiLogin(a, 'utmxcite@utm.my'); await a.waitForSelector('.kpis'); await settle(a);
  // ===== dashboard admin =====
  console.log('L141');
  assert.match(await a.textContent('.hero'), /Ringkasan September 2026/, 'lalai: bulan lepas');
  console.log('L142');
  assert.match(await a.textContent('.kpis'), /Kadar penghantaran/); assert.ok(await a.locator('.chart svg').count() >= 2);
  console.log('L143');
  assert.ok(await a.locator('.todo [data-act=review]').count() >= 3, 'senarai menunggu semakan'); await shot(a, '21-dash-admin', true);
  console.log('L144');
  await a.selectOption('#d-month', '0'); await a.waitForFunction(() => /sepanjang 2026/.test(document.querySelector('.hero').textContent)); await settle(a);
  console.log('L145');
  assert.match(await a.textContent('.hero'), /laporan dijangka/); await a.selectOption('#d-month', '9'); await a.waitForFunction(() => /September 2026/.test(document.querySelector('.hero').textContent)); await settle(a);
  console.log('L146');
  await a.click('.todo [data-act=review]'); await a.waitForSelector('.dlg[data-lot]'); await settle(a); await a.click('[data-act=closedlg]');
  console.log('L147');
  await a.click('[data-tab=adm]'); await a.waitForSelector('#a-rows tr'); await settle(a);
  console.log('L148');
  assert.match(await a.textContent('.who'), /Admin/); await shot(a, '10-admin', true);
  console.log('L149');
  assert.strictEqual(await a.inputValue('#a-month'), '0', 'lalai: Bulan Semua');
  console.log('L150');
  assert.ok((await a.locator('#a-rows tr').count()) >= 90, 'semua bulan semua lot');
  console.log('L151');
  const rowText = async (bulan, lot) => a.textContent('#a-rows tr:has-text("' + bulan + '"):has-text("' + lot + '")');
  console.log('L152');
  assert.match(await rowText('Januari 2026', 'SUB · Lot 3'), /Cafe A/); assert.match(await rowText('Jun 2026', 'SUB · Lot 3'), /Cafe A/);
  console.log('L153');
  assert.match(await rowText('Julai 2026', 'SUB · Lot 3'), /Cafe B/); assert.match(await rowText('September 2026', 'SUB · Lot 3'), /Cafe B/);
  console.log('L154');
  assert.ok(!/Cafe B/.test(await rowText('Mei 2026', 'SUB · Lot 3')), 'Cafe B tidak dikenakan sebelum Julai');
  console.log('L155');
  assert.ok(!/NaN/.test(await a.textContent('#a-rows')), 'tiada NaN');
  console.log('L156');
  await a.selectOption('#a-month', '9'); await a.waitForFunction(() => document.querySelectorAll('#a-rows tr').length < 20); await settle(a);
  console.log('L157');
  assert.strictEqual(await a.locator('#a-rows tr').count(), 10); await shot(a, '10b-admin-bulan');
  console.log('L158');
  await a.selectOption('#a-status', 'sent'); const sentRows = await a.locator('#a-rows tr').count(); assert.ok(sentRows >= 3); await a.selectOption('#a-status', '');
  console.log('L159');
  await a.fill('#a-q', 'kopi'); assert.strictEqual(await a.locator('#a-rows tr').count(), 1); await a.fill('#a-q', '');
  console.log('L160');
  await a.click('#a-rows tr:has-text("Kopi Kampus") [data-act=review]'); await a.waitForSelector('.dlg[data-lot]'); await settle(a); await shot(a, '11-semak');
  console.log('L161');
  assert.match(await a.textContent('.dlg'), /\*\*\*\*/, 'No. KP bertopeng');
  console.log('L162');
  await a.click('[data-act=rv-fix]'); await a.waitForSelector('.dlg .errbox'); assert.match(await a.textContent('.dlg .errbox'), /komen/);
  console.log('L163');
  await a.fill('#rv-komen', 'Sila lampirkan penyata bank.'); await a.click('[data-act=rv-fix]'); await a.waitForFunction(() => /pembetulan/i.test((document.querySelector('.toast') || {}).textContent || '')); await settle(a);
  console.log('L164');
  assert.match(await a.textContent('#a-rows tr:has-text("Kopi Kampus")'), /Perlu dibetulkan/);
  console.log('L165');
  const [dl] = await Promise.all([a.waitForEvent('download'), (async () => { await a.click('#a-rows tr:has-text("Roti Gebu") [data-act=review]'); await a.waitForSelector('[data-act=admfile]'); await a.click('[data-act=admfile][data-kind=laporan]'); })()]);
  console.log('L166');
  assert.match(dl.suggestedFilename(), /FinancialReport\.pdf$/);
  console.log('L167');
  await a.click('[data-act=rv-ok]'); await a.waitForFunction(() => /disahkan/i.test((document.querySelector('.toast') || {}).textContent || '')); await settle(a);
  console.log('L168');
  assert.match(await a.textContent('#a-rows tr:has-text("Roti Gebu")'), /Disahkan/);
  console.log('L169');
  await a.click('#a-rows tr:has-text("Tech Fixit") [data-act=remind]'); await a.waitForFunction(() => /Peringatan dihantar/.test((document.querySelector('.toast') || {}).textContent || ''));
  console.log('L170');
  const [csv] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=export]')]); assert.match(csv.suggestedFilename(), /^Laporan_2026-09\.csv$/);
  console.log('L171');
  await a.click('[data-tab=lots]'); await a.waitForSelector('[data-act=newlot]'); await settle(a); await shot(a, '12-lot', true);
  console.log('L172');
  await a.click('[data-act=newlot]'); await a.fill('#l-lokasi', 'SUB'); await a.fill('#l-no', '6'); await a.click('[data-act=savelot]'); await a.waitForFunction(() => /Lot disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  console.log('L173');
  assert.ok(await a.locator('td.mono:text-is("SUB-Lot6")').count());
  console.log('L174');
  await a.click('[data-tab=tn]'); await a.waitForSelector('#t-rows tr'); await settle(a); await shot(a, '12b-penyewaan', true);
  console.log('L175');
  assert.match(await a.textContent('#t-rows'), /Cafe A/); assert.match(await a.textContent('#t-rows'), /Cafe B/);
  console.log('L176');
  await a.click('[data-act=newtn]'); await a.selectOption('#n-lot', 'SUB-Lot6'); await a.fill('#n-mula', '2026-07'); await a.fill('#n-akhir', '2026-05'); await a.fill('#n-sewa', '450'); await a.click('[data-act=savetn]');
  console.log('L177');
  await a.waitForSelector('.dlg .errbox'); assert.match(await a.textContent('.dlg .errbox'), /selepas tarikh mula/);
  console.log('L178');
  await a.fill('#n-akhir', '2026-12'); await shot(a, '12c-tambah-penyewaan'); await a.click('[data-act=savetn]');
  console.log('L179');
  await a.waitForFunction(() => /Penyewaan disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  console.log('L180');
  assert.match(await a.textContent('#t-rows tr:has-text("SUB · Lot 6")'), /Jul 2026 hingga Dis 2026/);
  console.log('L181');
  await a.click('[data-tab=users]'); await a.waitForSelector('#u-rows tr'); await settle(a); await shot(a, '13-pengguna', true);
  console.log('L182');
  await a.click('[data-act=newuser]'); await shot(a, '14-tambah-pengguna'); await a.fill('#u-email', 'baru@graduan.example'); await a.fill('#u-nama', 'Pelajar Baru'); const opt = await a.$eval('#u-lot', el => [...el.options].find(o => /SUB · Lot 6/.test(o.textContent)).value); await a.selectOption('#u-lot', opt); await a.click('[data-act=saveuser]');
  console.log('L183');
  await a.waitForFunction(() => /Pengguna disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  console.log('L184');
  assert.ok((await a.textContent('#u-rows')).includes('baru@graduan.example'));
  // tamat sesi
  b.cache && Object.keys(b.cache).filter(k => k.startsWith('sess:')).forEach(k => delete b.cache[k]);
  console.log('L187');
  await a.click('[data-tab=lots]'); await a.waitForSelector('.errbox'); assert.match(await a.textContent('.errbox'), /Sesi tamat/);
  console.log('L188');
  await shot(a, '15-sesi-tamat');
  console.log('L189');
  await browser.close();
  console.log(errs.length ? 'RALAT KONSOL:\n' + errs.join('\n') : 'E2E UI: semua langkah lulus, tiada ralat konsol');
  if (errs.length) process.exitCode = 1;
})().catch(async e => { console.error('E2E GAGAL:', e.message); process.exitCode = 1; try { await browser.close(); } catch (x) {} });
