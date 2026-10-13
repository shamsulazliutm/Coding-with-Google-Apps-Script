'use strict';
/**
 * Persekitaran tiruan Google Apps Script untuk ujian setempat dengan Node.
 * Memuat fail src/*.gs ke dalam satu konteks vm dan menyediakan SpreadsheetApp, DriveApp,
 * CacheService, PropertiesService, LockService, MailApp dan Utilities dalam ingatan.
 * Ini hanya menguji logik; tingkah laku sebenar Google (kebenaran, kuota) hanya boleh diuji selepas deploy.
 */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SRC = path.join(__dirname, '..', 'src');

function colLetter() { return ''; }

function createEnv(opts) {
  opts = opts || {};
  const state = {
    clock: 1000000, // saat, untuk tamat tempoh cache
    props: {},
    cache: {},
    sent: [],
    files: {},
    folders: {},
    spreadsheets: {},
    created: [],
    seq: 0
  };

  // ---------- Utilities ----------
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(alg, str) {
      const buf = crypto.createHash('sha256').update(String(str), 'utf8').digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
    getUuid() { return crypto.randomUUID(); },
    formatDate(date, tz, fmt) {
      const d = new Date(date.getTime() + 8 * 3600 * 1000); // Asia/Kuala_Lumpur = UTC+8
      const p = (n, w) => String(n).padStart(w || 2, '0');
      return String(fmt)
        .replace('yyyy', p(d.getUTCFullYear(), 4)).replace('MM', p(d.getUTCMonth() + 1))
        .replace('dd', p(d.getUTCDate())).replace('HH', p(d.getUTCHours())).replace('mm', p(d.getUTCMinutes()));
    }
  };

  // ---------- Cache / Properties / Lock / Mail ----------
  const CacheService = {
    getScriptCache() {
      return {
        get(k) { const e = state.cache[k]; if (!e) return null; if (e.exp <= state.clock) { delete state.cache[k]; return null; } return e.v; },
        put(k, v, sec) { state.cache[k] = { v: String(v), exp: state.clock + (sec || 600) }; },
        remove(k) { delete state.cache[k]; }
      };
    }
  };
  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(k) { return Object.prototype.hasOwnProperty.call(state.props, k) ? state.props[k] : null; },
        setProperty(k, v) { state.props[k] = String(v); },
        deleteProperty(k) { delete state.props[k]; }
      };
    }
  };
  const LockService = { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } };
  const MailApp = { sendEmail(o) { state.sent.push(o); } };

  // ---------- Spreadsheet ----------
  function makeRange(sheet, r, c, nr, nc) {
    const self = {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) {
            const v = (sheet.data[r - 1 + i] || [])[c - 1 + j];
            row.push(v === undefined ? '' : v);
          }
          out.push(row);
        }
        return out;
      },
      getValue() { return self.getValues()[0][0]; },
      setValues(vals) {
        for (let i = 0; i < vals.length; i++) {
          while (sheet.data.length < r - 1 + i + 1) sheet.data.push([]);
          for (let j = 0; j < vals[i].length; j++) {
            let v = vals[i][j];
            // Meniru Sheets: apostrof di hadapan ialah pelepas teks dan tidak disimpan; teks bermula "=" tanpa
            // pelepas akan menjadi formula (dicatat dalam sheet.liveFormulas supaya ujian boleh mengesannya).
            if (typeof v === 'string') {
              if (v.charAt(0) === "'") { v = v.slice(1); sheet.escaped.push(v); }
              else if (/^[=+\-]/.test(v) && v.length > 1 && !/^[+\-]?\d[\d.,]*$/.test(v)) sheet.liveFormulas.push(v);
            }
            sheet.data[r - 1 + i][c - 1 + j] = v;
          }
        }
        if (r - 1 + vals.length > sheet.maxRows) throw new Error('Julat melebihi bilangan baris maksimum');
        return self;
      },
      setValue(v) { return self.setValues([[v]]); },
      clearContent() {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sheet.data[r - 1 + i]) sheet.data[r - 1 + i][c - 1 + j] = '';
        return self;
      },
      setFormula(f) { sheet.formulas[r + ':' + c] = f; return self; },
      setNumberFormat(f) { sheet.formats[c] = f; return self; },
      setBackground() { return self; }, setFontColor() { return self; }, setFontWeight() { return self; }
    };
    return self;
  }

  function makeSheet(name) {
    const sheet = {
      name, data: [], maxRows: 1000, formulas: {}, formats: {}, escaped: [], liveFormulas: [],
      getName() { return name; },
      getRange(r, c, nr, nc) { return makeRange(sheet, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc); },
      getLastRow() {
        for (let i = sheet.data.length - 1; i >= 0; i--) if ((sheet.data[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
        return 0;
      },
      getLastColumn() {
        let max = 0;
        sheet.data.forEach((row) => row.forEach((v, j) => { if (v !== '' && v !== undefined && v !== null) max = Math.max(max, j + 1); }));
        return max;
      },
      getMaxRows() { return sheet.maxRows; },
      insertRowsAfter(after, n) { sheet.maxRows += n; },
      setFrozenRows() {}
    };
    return sheet;
  }

  function makeSpreadsheet(name, id) {
    const sheets = [makeSheet('Sheet1')];
    const ss = {
      id, name,
      getId() { return id; }, getName() { return ss.name; },
      getUrl() { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },
      getSheetByName(n) { return sheets.find((s) => s.name === n) || null; },
      getSheets() { return sheets.slice(); },
      insertSheet(n) { const s = makeSheet(n); sheets.push(s); return s; },
      deleteSheet(s) { const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); }
    };
    return ss;
  }

  function newId(prefix) {
    state.seq++;
    return (prefix + state.seq + 'x'.repeat(40)).substr(0, 33);
  }

  const SpreadsheetApp = {
    create(name) {
      const ss = makeSpreadsheet(name, newId('SS'));
      state.spreadsheets[ss.id] = ss;
      state.created.push(name);
      const f = { id: ss.id, parents: [state.folders.root] };
      state.files[ss.id] = f;
      return ss;
    },
    openById(id) {
      const ss = state.spreadsheets[id];
      if (!ss) throw new Error('Tiada spreadsheet: ' + id);
      return ss;
    }
  };

  // ---------- Drive ----------
  function makeFolder(name) {
    const id = newId('FD');
    const f = {
      id, name, children: [],
      getName() { return name; }, getId() { return id; },
      getUrl() { return 'https://drive.google.com/drive/folders/' + id; },
      getFoldersByName(n) {
        const m = f.children.filter((c) => c.name === n);
        let i = 0;
        return { hasNext() { return i < m.length; }, next() { return m[i++]; } };
      },
      createFolder(n) { const c = makeFolder(n); f.children.push(c); return c; }
    };
    state.folders[id] = f;
    return f;
  }
  state.folders.root = makeFolder('Drive Saya');
  const DriveApp = {
    getRootFolder() { return state.folders.root; },
    getFileById(id) {
      const rec = state.files[id];
      if (!rec) throw new Error('Tiada fail: ' + id);
      return {
        getParents() { let i = 0; return { hasNext() { return i < rec.parents.length; }, next() { return rec.parents[i++]; } }; },
        moveTo(folder) { rec.parents = [folder]; }
      };
    }
  };

  const sandbox = {
    Utilities, CacheService, PropertiesService, LockService, MailApp, SpreadsheetApp, DriveApp,
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} }
  };
  const ctx = vm.createContext(sandbox);

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  const order = opts.reverse ? files.slice().reverse() : files;
  order.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

  const env = {
    ctx, state,
    plain: (x) => JSON.parse(JSON.stringify(x === undefined ? null : x)),
    run: (code) => vm.runInContext(code, ctx),
    advance(sec) { state.clock += sec; },
    setProp(k, v) { state.props[k] = v; },
    sentTo(email) { return state.sent.filter((m) => m.to === email); },
    lastCode(email) {
      const msgs = env.sentTo(email);
      if (!msgs.length) return null;
      const m = msgs[msgs.length - 1].htmlBody.match(/kod pengesahan anda ialah: (\d{6})/i);
      return m ? m[1] : null;
    },
    /** Sediakan Induk kosong dalam folder, tetapkan properties dan jalankan Setup.run(). */
    setup(mode) {
      const folder = state.folders.root.createFolder('Folder UTMPreneur');
      const ind = SpreadsheetApp.create('UTMPreneur - Induk');
      state.files[ind.id].parents = [folder];
      state.created.length = 0;
      state.props[PROPS_INDUK()] = ind.getUrl();
      state.props[PROPS_MODE()] = mode || 'UJI';
      env.induk = ind; env.folder = folder;
      return vm.runInContext('Setup.run()', ctx);
    }
  };
  function PROPS_INDUK() { return 'INDUK_ID'; }
  function PROPS_MODE() { return 'MODE'; }
  return env;
}

module.exports = { createEnv, colLetter };
