const { chromium } = require('playwright');
const { createBackend } = require('./gas-harness');
const b = createBackend(); b.setupSystem(); b.setNow(Date.parse('2026-02-01T01:30:00Z'));
const ok = (m, t, p) => { const r = b.rpc(m, t, p); if (!r.ok) throw new Error(r.error); return r.data; };
const login = e => { delete b.cache['otpwait:' + e]; ok('requestOtp', null, { email: e }); const c = b.outbox[b.outbox.length - 1].htmlBody.match(/letter-spacing:6px[^>]*>(\d{6})</)[1]; return ok('verifyOtp', null, { email: e, code: c }); };
const adm = login('utmxcite@utm.my');
const id = ok('adminSaveTenancy', adm.token, { tenancy: { kodLot: 'StudentMall-Lot1', mula: '2026-01-01', akhir: '2026-12-31', sewa: 600 } }).tenancies[0].id;
ok('adminSaveUser', adm.token, { user: { email: 'ayu@graduan.example', nama: 'Ayu', peranan: 'Penyewa', idSewa: id, status: 'Aktif' } });
ok('adminRemind', adm.token, { kodLot: 'StudentMall-Lot1', tahun: 2026, bulan: 1 });
const m = b.outbox[b.outbox.length - 1];
console.log('Subjek:', m.subject, '| Kepada:', m.to);
(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 640, height: 520 }, deviceScaleFactor: 2 });
  await p.setContent('<body style="margin:0;padding:24px;background:#f4f4f4"><div style="background:#fff;padding:24px;max-width:560px;margin:0 auto;border-radius:8px">' + m.htmlBody + '</div></body>');
  await p.screenshot({ path: 'out/mel-peringatan.png', fullPage: true }); await br.close();
})();
