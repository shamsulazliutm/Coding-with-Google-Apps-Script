'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./gas-mock');

const env = createEnv();
const U = (code) => env.plain(env.run(code));

test('normEmail dan isEmail', () => {
  assert.equal(U("Util.normEmail('  Aina@Graduate.UTM.my ')"), 'aina@graduate.utm.my');
  assert.equal(U("Util.isEmail('aina@graduate.utm.my')"), true);
  assert.equal(U("Util.isEmail('aina@')"), false);
  assert.equal(U("Util.isEmail('a b@utm.my')"), false);
  assert.equal(U("Util.isEmail('')"), false);
});

test('roleByDomain: pelajar, staf, luar', () => {
  assert.equal(U("Util.roleByDomain('a@graduate.utm.my','@graduate.utm.my','@utm.my')"), 'Pelajar');
  assert.equal(U("Util.roleByDomain('a@utm.my','@graduate.utm.my','@utm.my')"), 'Staf');
  assert.equal(U("Util.roleByDomain('a@gmail.com','@graduate.utm.my','@utm.my')"), 'Luar');
  // domain lain yang berakhir dengan "utm.my" tetapi bukan @utm.my
  assert.equal(U("Util.roleByDomain('a@notutm.my','@graduate.utm.my','@utm.my')"), 'Luar');
  assert.equal(U("Util.roleByDomain('a@mail.utm.my','@graduate.utm.my','@utm.my')"), 'Luar');
});

test('penyelia mesti emel staf, bukan pelajar', () => {
  assert.equal(U("Util.isStaffEmail('dr@utm.my','@graduate.utm.my','@utm.my')"), true);
  assert.equal(U("Util.isStaffEmail('a@graduate.utm.my','@graduate.utm.my','@utm.my')"), false);
});

test('matrik', () => {
  assert.equal(U("Util.normMatric(' a23ec 0123 ')"), 'A23EC0123');
  assert.equal(U("Util.isMatric('A23EC0123')"), true);
  assert.equal(U("Util.isMatric('A2')"), false);
  assert.equal(U("Util.isMatric('A23-EC0123')"), false);
});

test('formatId', () => {
  assert.equal(U("Util.formatId('SSU', 2026, 14, 4)"), 'SSU-2026-0014');
  assert.equal(U("Util.formatId('PRN', null, 7, 4)"), 'PRN-0007');
});

test('otpFromHex sentiasa 6 digit', () => {
  assert.equal(U("Util.otpFromHex('00000000ffff')"), '000000');
  assert.match(U("Util.otpFromHex('ffffffff')"), /^\d{6}$/);
  assert.equal(U("Util.otpFromHex('000f4240')"), '000000'); // 1,000,000 mod 1,000,000
  assert.equal(U("Util.otpFromHex('00000001')"), '000001');
  for (let i = 0; i < 50; i++) assert.match(U('Util.randomOtp()'), /^\d{6}$/);
});

test('sha256 sepadan dengan Node', () => {
  const crypto = require('node:crypto');
  assert.equal(U("Util.sha256('abc')"), crypto.createHash('sha256').update('abc').digest('hex'));
});

test('safeEqual', () => {
  assert.equal(U("Util.safeEqual('abc','abc')"), true);
  assert.equal(U("Util.safeEqual('abc','abd')"), false);
  assert.equal(U("Util.safeEqual('abc','abcd')"), false);
});

test('idFromUrl', () => {
  assert.equal(U("Util.idFromUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=0')"), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.equal(U("Util.idFromUrl('')"), '');
  assert.equal(U("Util.idFromUrl('pendek')"), '');
});

test('parseCsv: petikan, koma dalam medan, baris kosong, BOM', () => {
  const r = U("Util.parseCsv('\\uFEFFa,b,c\\r\\n1,\"x,y\",\"say \"\"hi\"\"\"\\r\\n\\r\\n2,,3\\r\\n')");
  assert.deepEqual(r, [['a', 'b', 'c'], ['1', 'x,y', 'say "hi"'], ['2', '', '3']]);
});

test('parseCsv mengesan pemisah titik koma dan tab', () => {
  assert.deepEqual(U("Util.parseCsv('a;b;c\\n1;2;3')"), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(U("Util.parseCsv('a\\tb\\n1\\t2')"), [['a', 'b'], ['1', '2']]);
});

test('normJantina', () => {
  assert.equal(U("Util.normJantina('L')"), 'Lelaki');
  assert.equal(U("Util.normJantina('perempuan')"), 'Perempuan');
  assert.equal(U("Util.normJantina('Female')"), 'Perempuan');
  assert.equal(U("Util.normJantina('x')"), '');
});

test('truthy', () => {
  for (const v of ["'Ya'", "'ya'", 'true', "'TRUE'", "'1'"]) assert.equal(U(`Util.truthy(${v})`), true);
  for (const v of ["'Tidak'", 'false', "''", 'null']) assert.equal(U(`Util.truthy(${v})`), false);
});

test('workingDaysBetween: tolak hujung minggu dan cuti', () => {
  // Isnin 19 Okt 2026 -> Jumaat 23 Okt 2026 = 4 hari bekerja selepas Isnin
  assert.equal(U("Util.workingDaysBetween(new Date(2026,9,19), new Date(2026,9,23), [], [1,2,3,4,5])"), 4);
  // Jumaat 23 -> Isnin 26 = 1 (hanya Isnin)
  assert.equal(U("Util.workingDaysBetween(new Date(2026,9,23), new Date(2026,9,26), [], [1,2,3,4,5])"), 1);
  // dengan cuti pada Selasa 20 Okt
  assert.equal(U("Util.workingDaysBetween(new Date(2026,9,19), new Date(2026,9,23), ['2026-10-20'], [1,2,3,4,5])"), 3);
});

test('AppError dan appError_', () => {
  const r = U("(function(){ var e = appError_('OTP_SALAH'); return {code:e.code, bm:e.bm, en:e.en, name:e.name}; })()");
  assert.equal(r.code, 'OTP_SALAH');
  assert.equal(r.name, 'AppError');
  assert.ok(r.bm && r.en);
});
