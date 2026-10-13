'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bundle } = require('../scripts/bundle');
const { createEnv } = require('./gas-mock');

test('Versi dua fail (Code.gs + Index.html) berfungsi sama: persediaan, log masuk, profiling dan SSU', () => {
  bundle();
  const dist = path.join(__dirname, '..', 'dist');
  assert.deepEqual(fs.readdirSync(dist).sort(), ['Code.gs', 'Index.html', 'appsscript.json']);
  const html = fs.readFileSync(path.join(dist, 'Index.html'), 'utf8');
  assert.ok(!/<\?!= include/.test(html), 'tiada include tertinggal');
  assert.match(html, /id="v-ssu-form"/);
  assert.match(html, /window\.UP = /);

  // muatkan hanya dist/Code.gs
  const only = fs.mkdtempSync(path.join(os.tmpdir(), 'utm-bundle-'));
  fs.copyFileSync(path.join(dist, 'Code.gs'), path.join(only, 'Code.gs'));
  const env = createEnv({ dir: only });
  env.setup('UJI');
  assert.equal(env.plain(env.run('Setup.validate()')).ok, true);
  env.run(`(function(){ var r = Db.find('Tetapan', function(x){ return x.Kunci==='PENGUJI_EMEL'; })[0]; Db.update('Tetapan', r._row, {Nilai:'aina.contoh@graduate.utm.my'}); Cfg.invalidate(); })()`);
  const call = (m, t, p) => env.plain(env.run(`rpc(${JSON.stringify(m)}, ${JSON.stringify(t)}, ${JSON.stringify(p || {})})`));
  assert.equal(call('ping').ok, true);
  call('otp.minta', null, { emel: 'aina.contoh@graduate.utm.my' });
  const r = call('otp.sahkan', null, { emel: 'aina.contoh@graduate.utm.my', kod: env.lastCode('aina.contoh@graduate.utm.my') });
  assert.equal(r.ok, true);
  assert.equal(call('daftar.matrik', r.data.token, { noMatrik: 'A23UJ0001' }).ok, true);
  assert.equal(call('profil.dapat', r.data.token).data.status.lengkap, false);
  assert.equal(call('ssu.saya', r.data.token).ok, true);
});
