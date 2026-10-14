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
let adm = login('pn.salmah@utm.my');
const lots = [['Student Mall', 1, 'Ayu Rahimah', 'Warung Ayu', 'ok'], ['Student Mall', 2, 'Hafiz Zainal', 'Print Siswa', 'ok'], ['Student Mall', 3, 'Aina Sofea', 'Kopi Kampus Enterprise', 'fix'],
  ['Student Mall', 4, 'Nurul Izzati', 'Roti Gebu', 'sent'], ['Student Mall', 5, 'Farah Najwa', 'Batik Muda', 'ok'], ['Student Mall', 6, 'M. Safihakimi', 'Whiskers & Bean', 'sent'],
  ['Student Mall', 7, 'Adam Harith', 'Tech Fixit', 'none'], ['SUB', 1, 'Hakim Roslan', 'Minuman Segar', 'ok'], ['SUB', 2, 'Din Ismail', 'Nasi Lemak Pak Din', 'none']];
lots.forEach(([lok, no, nama, biz, st], i) => {
  ok('adminSaveLot', adm.token, { lot: { lokasi: lok, noLot: no, mula: '2026-01-01', akhir: '2026-12-31', sewa: '600', status: 'Aktif' } });
  const email = nama.split(' ')[0].toLowerCase() + '@graduan.example', kod = lok.replace(/\s/g, '') + '-Lot' + no;
  ok('adminSaveUser', adm.token, { user: { email, nama, peranan: 'Penyewa', kodLot: kod, status: 'Aktif' } });
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
ok('adminSaveUser', adm.token, { user: { email: 'rashid@utm.my', nama: 'En. Rashid', peranan: 'Admin', status: 'Aktif' } });
b.outbox.length = 0;
Object.keys(b.cache).filter(k => k.startsWith('otpwait:')).forEach(k => delete b.cache[k]);

let browser;
(async () => {
  browser = await chromium.launch();
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
  const shot = (p, n, full) => p.screenshot({ path: OUT + '/ui-' + n + '.png', fullPage: !!full });
  const uiLogin = async (p, email) => {
    delete b.cache['otpwait:' + email];
    await p.fill('#lg-email', email); await p.click('[data-act=sendotp]'); await p.waitForSelector('#lg-otp');
    const mail = b.outbox.filter(m => m.to === email).pop(); const code = mail.htmlBody.match(/letter-spacing:6px[^>]*>(\d{6})</)[1];
    await p.fill('#lg-otp', code); await p.click('[data-act=verifyotp]'); await p.waitForSelector('.tabs');
  };
  const settle = p => p.waitForFunction(() => !document.body.classList.contains('busy'));

  // ===== penyewa =====
  let p = await newPage();
  await shot(p, '01-login');
  await p.fill('#lg-email', 'aina@graduan.example'); await p.click('[data-act=sendotp]'); await p.waitForSelector('#lg-otp'); await shot(p, '02-otp');
  await p.fill('#lg-otp', '000000'); await p.click('[data-act=verifyotp]'); await p.waitForSelector('.errbox'); assert.match(await p.textContent('.errbox'), /tidak betul/);
  delete b.cache['otpwait:aina@graduan.example']; p.close();
  p = await newPage(); await uiLogin(p, 'aina@graduan.example');
  assert.match(await p.textContent('.who'), /Penyewa/);
  await p.click('[data-tab=info]'); await p.waitForSelector('#b-nama'); await settle(p); await shot(p, '03-maklumat', true);
  await p.fill('#b-kp', '123'); await p.click('[data-act=savebiz]'); await p.waitForSelector('.toast.err'); assert.match(await p.textContent('.toast'), /12 digit/);
  await p.fill('#b-kp', '010203011234'); await p.click('[data-act=savebiz]'); await p.waitForFunction(() => /disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  await p.click('[data-tab=fin]'); await p.waitForSelector('#f-rows tr'); await settle(p);
  assert.strictEqual(await p.locator('#f-rows tr').count(), 10); await shot(p, '04-senarai', true);
  // penapis & carian
  await p.selectOption('#f-status', 'fix'); assert.strictEqual(await p.locator('#f-rows tr').count(), 1);
  await p.selectOption('#f-status', ''); await p.fill('#f-q', 'okt'); assert.strictEqual(await p.locator('#f-rows tr').count(), 1); await p.fill('#f-q', '');
  // edit september (perlu dibetulkan)
  await p.click('#f-rows tr:has-text("September") [data-act=open]'); await p.waitForSelector('#d-inc'); await settle(p);
  assert.match(await p.textContent('.banner'), /dua kali/); await shot(p, '05-dialog-edit');
  assert.strictEqual(await p.isDisabled('[data-act=submitreport]'), true);
  await p.fill('#d-exp', '4560'); await p.check('#d-ack'); assert.strictEqual(await p.isDisabled('[data-act=submitreport]'), false);
  // fail bukan PDF
  let [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act=pick][data-kind=laporan]')]); await fc.setFiles(S + '/fake.pdf');
  await p.click('[data-act=submitreport]'); await p.waitForSelector('.dlg .errbox'); assert.match(await p.textContent('.dlg .errbox'), /Hanya fail PDF/);
  // fail PDF sah (ganti)
  [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act=pick][data-kind=laporan]')]); await fc.setFiles(S + '/sample.pdf');
  await p.waitForFunction(() => /belum dimuat naik/.test(document.querySelector('.dlg').textContent)); assert.strictEqual(await p.inputValue('#d-exp'), '4560');
  await shot(p, '06-dialog-fail');
  await p.click('[data-act=submitreport]'); await p.waitForFunction(() => /dihantar untuk semakan/.test((document.querySelector('.toast') || {}).textContent || '')); await settle(p);
  assert.strictEqual(await p.locator('#dlg-slot .scrim').count(), 0);
  assert.match(await p.textContent('#f-rows tr:has-text("September")'), /Dihantar/); assert.match(await p.textContent('#f-rows tr:has-text("September")'), /Lewat/);
  // laporan baharu Oktober
  await p.click('[data-act=newreport]'); await p.waitForSelector('#d-month'); await settle(p);
  await p.fill('#d-inc', '3000'); await p.fill('#d-exp', '1200'); await p.click('[data-act=eq][data-v="0"]'); await p.check('#d-ack');
  for (const k of ['laporan', 'sewa']) { [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act=pick][data-kind=' + k + ']')]); await fc.setFiles(S + '/sample.pdf'); await p.waitForFunction(kk => /belum dimuat naik/.test(document.querySelector('.dlg').textContent), k); }
  await shot(p, '07-dialog-baharu');
  await p.click('[data-act=submitreport]'); await p.waitForFunction(() => /dihantar untuk semakan/.test((document.querySelector('.toast') || {}).textContent || '')); await settle(p);
  assert.match(await p.textContent('#f-rows tr:has-text("Oktober")'), /Dihantar/);
  // padam Oktober (dengan pengesahan)
  await p.click('#f-rows tr:has-text("Oktober") [data-act=del]'); await p.waitForSelector('[role=alertdialog]'); await shot(p, '08-padam');
  await p.click('[data-r="1"]'); await p.waitForFunction(() => /dipadam/.test((document.querySelector('.toast') || {}).textContent || '')); await settle(p);
  assert.match(await p.textContent('#f-rows tr:has-text("Oktober")'), /Belum dihantar/);
  // laporan disahkan: baca sahaja
  await p.click('#f-rows tr:has-text("Januari") [data-act=open]'); await p.waitForSelector('#d-inc'); assert.strictEqual(await p.isDisabled('#d-inc'), true); assert.strictEqual(await p.locator('[data-act=submitreport]').count(), 0);
  await p.click('[data-act=closedlg]');
  await p.click('[data-act=logout]'); await p.waitForSelector('#lg-email');
  // telefon
  const m = await newPage(390, 800); await uiLogin(m, 'aina@graduan.example'); await m.click('[data-tab=fin]'); await m.waitForSelector('#f-rows tr'); await settle(m); await shot(m, '09-telefon');
  const sw = await m.evaluate(() => document.documentElement.scrollWidth); assert.ok(sw <= 392, 'skrol mendatar pada telefon: ' + sw);
  await m.close();

  // ===== admin =====
  const a = await newPage(); await uiLogin(a, 'pn.salmah@utm.my'); await a.waitForSelector('#a-rows tr'); await settle(a);
  assert.match(await a.textContent('.who'), /Admin/); await shot(a, '10-admin', true);
  assert.ok((await a.locator('#a-rows tr').count()) >= 9);
  await a.selectOption('#a-status', 'sent'); const sentRows = await a.locator('#a-rows tr').count(); assert.ok(sentRows >= 3); await a.selectOption('#a-status', '');
  await a.fill('#a-q', 'kopi'); assert.strictEqual(await a.locator('#a-rows tr').count(), 1); await a.fill('#a-q', '');
  await a.click('#a-rows tr:has-text("Kopi Kampus") [data-act=review]'); await a.waitForSelector('.dlg[data-lot]'); await settle(a); await shot(a, '11-semak');
  assert.match(await a.textContent('.dlg'), /\*\*\*\*/, 'No. KP bertopeng');
  await a.click('[data-act=rv-fix]'); await a.waitForSelector('.dlg .errbox'); assert.match(await a.textContent('.dlg .errbox'), /komen/);
  await a.fill('#rv-komen', 'Sila lampirkan penyata bank.'); await a.click('[data-act=rv-fix]'); await a.waitForFunction(() => /pembetulan/i.test((document.querySelector('.toast') || {}).textContent || '')); await settle(a);
  assert.match(await a.textContent('#a-rows tr:has-text("Kopi Kampus")'), /Perlu dibetulkan/);
  const [dl] = await Promise.all([a.waitForEvent('download'), (async () => { await a.click('#a-rows tr:has-text("Roti Gebu") [data-act=review]'); await a.waitForSelector('[data-act=admfile]'); await a.click('[data-act=admfile][data-kind=laporan]'); })()]);
  assert.match(dl.suggestedFilename(), /FinancialReport\.pdf$/);
  await a.click('[data-act=rv-ok]'); await a.waitForFunction(() => /disahkan/i.test((document.querySelector('.toast') || {}).textContent || '')); await settle(a);
  assert.match(await a.textContent('#a-rows tr:has-text("Roti Gebu")'), /Disahkan/);
  await a.click('#a-rows tr:has-text("Tech Fixit") [data-act=remind]'); await a.waitForFunction(() => /Peringatan dihantar/.test((document.querySelector('.toast') || {}).textContent || ''));
  const [csv] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=export]')]); assert.match(csv.suggestedFilename(), /^Laporan_2026-09\.csv$/);
  await a.click('[data-tab=lots]'); await a.waitForSelector('[data-act=newlot]'); await settle(a); await shot(a, '12-lot', true);
  await a.click('[data-act=newlot]'); await a.fill('#l-lokasi', 'SUB'); await a.fill('#l-no', '6'); await a.click('[data-act=savelot]'); await a.waitForFunction(() => /Lot disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  assert.ok(await a.locator('td.mono:text-is("SUB-Lot6")').count());
  await a.click('[data-tab=users]'); await a.waitForSelector('#u-rows tr'); await settle(a); await shot(a, '13-pengguna', true);
  await a.click('[data-act=newuser]'); await shot(a, '14-tambah-pengguna'); await a.fill('#u-email', 'baru@graduan.example'); await a.fill('#u-nama', 'Pelajar Baru'); await a.selectOption('#u-lot', 'SUB-Lot6'); await a.click('[data-act=saveuser]');
  await a.waitForFunction(() => /Pengguna disimpan/.test((document.querySelector('.toast') || {}).textContent || ''));
  assert.ok((await a.textContent('#u-rows')).includes('baru@graduan.example'));
  // tamat sesi
  b.cache && Object.keys(b.cache).filter(k => k.startsWith('sess:')).forEach(k => delete b.cache[k]);
  await a.click('[data-tab=lots]'); await a.waitForSelector('.errbox'); assert.match(await a.textContent('.errbox'), /Sesi tamat/);
  await shot(a, '15-sesi-tamat');
  await browser.close();
  console.log(errs.length ? 'RALAT KONSOL:\n' + errs.join('\n') : 'E2E UI: semua langkah lulus, tiada ralat konsol');
  if (errs.length) process.exitCode = 1;
})().catch(async e => { console.error('E2E GAGAL:', e.message); process.exitCode = 1; try { await browser.close(); } catch (x) {} });
