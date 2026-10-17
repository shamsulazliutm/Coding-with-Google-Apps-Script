// Pelaksanaan tiruan API Google Apps Script supaya Code.gs boleh diuji dalam Node.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
const path = require('path');
const CODE = path.join(__dirname, '..', 'Code.gs');

function createBackend(opts = {}) {
  let NOW = opts.now || Date.parse('2026-10-14T01:30:00Z');   // 09:30 MYT
  const outbox = []; const ctxFlags = { failMail: false };
  const props = {}, cache = {};
  const sheets = {}; const driveFiles = {}; const folders = {};
  let fid = 0;

  class FakeDate extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } }

  function makeRange(sh, r, c, nr, nc) {
    return {
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
      setValues(vals) { for (let i = 0; i < nr; i++) { sh.data[r - 1 + i] = sh.data[r - 1 + i] || []; for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { if (sh.data[r - 1 + i]) sh.data[r - 1 + i][c - 1 + j] = undefined; } return this; }, setValue(v) { sh.data[r - 1] = sh.data[r - 1] || []; sh.data[r - 1][c - 1] = v; return this; }, setNumberFormat() { return this; }, setDataValidation() { return this; }, setFontWeight() { return this; }, setBackground() { return this; }
    };
  }
  function makeSheet(name) {
    const sh = { name, gid: 1000 + Object.keys(sheets).length, getSheetId() { return this.gid; }, data: [], getLastRow() { let l = 0; this.data.forEach((row, i) => { if (row && row.some(v => v !== '' && v !== undefined)) l = i + 1; }); return l; },
      getMaxRows() { return 1000; }, setFrozenRows() {},
      getLastColumn() { let w = 0; this.data.forEach(row => { if (row) row.forEach((v, i) => { if (v !== undefined && v !== '') w = Math.max(w, i + 1); }); }); return w; },
      insertColumnAfter(col) { this.data.forEach(row => { if (row && row.length > col) row.splice(col, 0, undefined); }); },
      getRange(r, c, nr, nc) { return makeRange(this, r, c, nr || 1, nc || 1); },
      appendRow(arr) { this.data[this.getLastRow()] = arr.slice(); },
      deleteRow(n) { this.data.splice(n - 1, 1); } };
    return sh;
  }
  const ss = {
    getId() { return 'SS1'; }, getName() { return 'Laporan Kewangan Penyewa'; }, setSpreadsheetTimeZone() {},
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
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, newDataValidation: () => { const o = { requireDate() { return o; }, setAllowInvalid() { return o; }, setHelpText() { return o; }, build() { return {}; } }; return o; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'Pn.Salmah@utm.my' }) },
    MailApp: { sendEmail: m => { if (ctxFlags.failMail) throw new Error('You do not have permission to call MailApp.sendEmail'); outbox.push(m); }, getRemainingDailyQuota: () => 100 },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, create() {} }), deleteTrigger() {} },
    HtmlService: { createHtmlOutputFromFile: n => ({ html: fs.readFileSync(CODE.replace('Code.gs', n + '.html'), 'utf8'), setTitle() { return this; }, addMetaTag() { return this; } }) },
    Utilities: {
      formatDate: fmtDate,
      parseDate: (str, tz, f) => { const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/); if (!m) throw new Error('parseDate: ' + str); return new FakeDate(Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 0) - 8, +m[5] || 0, +m[6] || 0)); }, getUuid: () => crypto.randomUUID(),
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
  function makeFolder(name, forcedId) {
    const id = forcedId || 'F' + (++fid); const kids = {};
    const f = { id, name, kids, getId: () => id, getName: () => name,
      getFoldersByName(n) { const k = kids[n]; let used = false; return { hasNext: () => !!k && !used, next: () => { used = true; return k; } }; },
      createFolder(n) { const c = makeFolder(n); kids[n] = c; return c; },
      createFile(blob) { const fl = { id: 'D' + (++fid), name: blob.name, blob, trashed: false, getId() { return this.id; }, getName() { return this.name; }, getSize() { return this.blob.bytes.length; }, setTrashed(v) { this.trashed = v; }, getBlob() { return this.blob; } }; driveFiles[fl.id] = fl; return fl; } };
    folders[id] = f; return f;
  }
  if (opts.configuredFolder !== false) makeFolder('Folder simpanan (dikongsi pengguna)', '1n7GPr2AIOQ4qBWJCZxWBID4RvbfKHONE');
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE, 'utf8') + '\n;this.__exports = { rpc, setupSystem, checkSystem, runReminders_, dailyReminderJob, readTable_, COLS, SHEETS };', ctx, { filename: 'Code.gs' });
  const ex = ctx.__exports;
  return { ...ex, outbox, ctxFlags, folders, props, cache, sheets, driveFiles, ctx, setNow: t => { NOW = t; }, ss };
}
module.exports = { createBackend };
