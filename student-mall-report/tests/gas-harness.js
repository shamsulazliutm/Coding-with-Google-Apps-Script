// Pelaksanaan tiruan API Google Apps Script supaya Code.gs boleh diuji dalam Node.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
const path = require('path');
const CODE = path.join(__dirname, '..', 'Code.gs');

function createBackend(opts = {}) {
  let NOW = opts.now || Date.parse('2026-10-14T01:30:00Z');   // 09:30 MYT
  const outbox = [];
  const props = {}, cache = {};
  const sheets = {}; const driveFiles = {}; const folders = {};
  let fid = 0;

  class FakeDate extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } }

  function makeRange(sh, r, c, nr, nc) {
    return {
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
      setValues(vals) { for (let i = 0; i < nr; i++) { sh.data[r - 1 + i] = sh.data[r - 1 + i] || []; for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }, setBackground() { return this; }
    };
  }
  function makeSheet(name) {
    const sh = { name, data: [], getLastRow() { let l = 0; this.data.forEach((row, i) => { if (row && row.some(v => v !== '' && v !== undefined)) l = i + 1; }); return l; },
      getMaxRows() { return 1000; }, setFrozenRows() {},
      getRange(r, c, nr, nc) { return makeRange(this, r, c, nr || 1, nc || 1); },
      appendRow(arr) { this.data[this.getLastRow()] = arr.slice(); },
      deleteRow(n) { this.data.splice(n - 1, 1); } };
    return sh;
  }
  const ss = {
    getId() { return 'SS1'; }, setSpreadsheetTimeZone() {},
    getSheetByName(n) { return sheets[n] || null; },
    insertSheet(n) { sheets[n] = makeSheet(n); return sheets[n]; }
  };

  function fmtDate(d, tz, f) {
    const t = new Date(d.getTime() + 8 * 3600e3), p = n => String(n).padStart(2, '0');
    const base = t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate());
    return f === 'yyyy-MM-dd' ? base : base + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds());
  }
  const signed = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));

  const ctx = {
    console, Date: FakeDate, Math, JSON, Object, Array, String, Number, isFinite, isNaN, parseInt, Error, RegExp,
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'Pn.Salmah@utm.my' }) },
    MailApp: { sendEmail: m => outbox.push(m) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, create() {} }), deleteTrigger() {} },
    HtmlService: { createHtmlOutputFromFile: n => ({ html: fs.readFileSync(CODE.replace('Code.gs', n + '.html'), 'utf8'), setTitle() { return this; }, addMetaTag() { return this; } }) },
    Utilities: {
      formatDate: fmtDate, getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA256' }, computeDigest: (a, s) => signed(crypto.createHash('sha256').update(s).digest()),
      base64Decode: s => { if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('bad b64'); return signed(Buffer.from(s, 'base64')); },
      base64Encode: bytes => Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b))).toString('base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes })
    },
    DriveApp: {
      createFolder: n => makeFolder(n), getFolderById: id => { if (!folders[id]) throw new Error('no folder'); return folders[id]; },
      getFileById: id => { if (!driveFiles[id]) throw new Error('no file'); return driveFiles[id]; }
    }
  };
  function makeFolder(name) {
    const id = 'F' + (++fid); const kids = {};
    const f = { id, name, kids, getId: () => id,
      getFoldersByName(n) { const k = kids[n]; let used = false; return { hasNext: () => !!k && !used, next: () => { used = true; return k; } }; },
      createFolder(n) { const c = makeFolder(n); kids[n] = c; return c; },
      createFile(blob) { const fl = { id: 'D' + (++fid), name: blob.name, blob, trashed: false, getId() { return this.id; }, getName() { return this.name; }, getSize() { return this.blob.bytes.length; }, setTrashed(v) { this.trashed = v; }, getBlob() { return this.blob; } }; driveFiles[fl.id] = fl; return fl; } };
    folders[id] = f; return f;
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE, 'utf8') + '\n;this.__exports = { rpc, setupSystem, runReminders_, dailyReminderJob, readTable_, COLS, SHEETS };', ctx, { filename: 'Code.gs' });
  const ex = ctx.__exports;
  return { ...ex, outbox, props, cache, sheets, driveFiles, ctx, setNow: t => { NOW = t; }, ss };
}
module.exports = { createBackend };
