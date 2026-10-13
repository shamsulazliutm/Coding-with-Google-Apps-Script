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
    base64Decode(str) {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(String(str))) throw new Error('Input tidak sah base64');
      return Array.from(Buffer.from(String(str), 'base64')).map((b) => (b > 127 ? b - 256 : b));
    },
    base64Encode(bytes) { return Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64'); },
    newBlob(bytes, mime, name) { return makeBlob(bytes, mime, name); },
    formatDate(date, tz, fmt) {
      const d = new Date(date.getTime() + 8 * 3600 * 1000); // Asia/Kuala_Lumpur = UTC+8
      const p = (n, w) => String(n).padStart(w || 2, '0');
      return String(fmt)
        .replace('yyyy', p(d.getUTCFullYear(), 4)).replace('MM', p(d.getUTCMonth() + 1))
        .replace('dd', p(d.getUTCDate())).replace('HH', p(d.getUTCHours())).replace('mm', p(d.getUTCMinutes()));
    }
  };

  function makeBlob(bytes, type, name) {
    const b = {
      bytes, type, name,
      getBytes() { return b.bytes; }, getContentType() { return b.type; }, getName() { return b.name; },
      setName(n) { b.name = n; return b; }
    };
    return b;
  }

  // ---------- Cache / Properties / Lock / Mail ----------
  const CacheService = {
    getScriptCache() {
      return {
        get(k) { const e = state.cache[k]; if (!e) return null; if (e.exp <= state.clock) { delete state.cache[k]; return null; } return e.v; },
        put(k, v, sec) { state.cache[k] = { v: String(v), exp: state.clock + (sec || 600) }; },
        removeAll(keys) { (keys || []).forEach((k) => delete state.cache[k]); },
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
  function wrapFile(rec) {
    const f = {
      rec,
      getId() { return rec.id; },
      getName() { return rec.name || ''; },
      setName(n) { rec.name = n; return f; },
      getUrl() { return 'https://drive.google.com/file/d/' + rec.id + '/view'; },
      getParents() { let i = 0; return { hasNext() { return i < rec.parents.length; }, next() { return rec.parents[i++]; } }; },
      moveTo(folder) { rec.parents = [folder]; return f; },
      setTrashed(t) { rec.trashed = !!t; return f; },
      getBlob() { if (!rec.blob) throw new Error('Fail tiada kandungan'); return rec.blob; },
      makeCopy(name, folder) {
        const id = newId('CP');
        const r2 = { id, name, parents: [folder || rec.parents[0]], blob: rec.blob, slides: rec.slides ? { text: rec.slides.text } : null };
        state.files[id] = r2;
        if (folder) folder.children.push({ name, file: r2 });
        return wrapFile(r2);
      },
      getAs(mime) {
        if (mime !== 'application/pdf') throw new Error('Tukar jenis tidak disokong dalam mock');
        const txt = rec.slides ? rec.slides.text : '';
        return makeBlob(Array.from(Buffer.from('%PDF-1.4\n' + txt, 'utf8')).map((b) => (b > 127 ? b - 256 : b)), 'application/pdf', (rec.name || 'fail') + '.pdf');
      }
    };
    return f;
  }

  function makeFolder(name) {
    const id = newId('FD');
    const f = {
      id, name, children: [],
      getName() { return name; }, getId() { return id; },
      getUrl() { return 'https://drive.google.com/drive/folders/' + id; },
      getFoldersByName(n) {
        const m = f.children.filter((c) => c.name === n && !c.file);
        let i = 0;
        return { hasNext() { return i < m.length; }, next() { return m[i++]; } };
      },
      createFolder(n) { const c = makeFolder(n); f.children.push(c); return c; },
      createFile(blob) {
        const id2 = newId('FL');
        const rec = { id: id2, name: blob.getName(), parents: [f], blob };
        state.files[id2] = rec;
        f.children.push({ name: rec.name, file: rec });
        return wrapFile(rec);
      }
    };
    state.folders[id] = f;
    return f;
  }
  state.folders.root = makeFolder('Drive Saya');
  const DriveApp = {
    getRootFolder() { return state.folders.root; },
    getFolderById(id) { const f = state.folders[id]; if (!f) throw new Error('Tiada folder: ' + id); return f; },
    getFileById(id) {
      const rec = state.files[id];
      if (!rec || rec.denied) throw new Error('Tiada fail: ' + id);
      return wrapFile(rec);
    }
  };

  const SlidesApp = {
    openById(id) {
      const rec = state.files[id];
      if (!rec || !rec.slides) throw new Error('Bukan persembahan: ' + id);
      const pres = {
        replaceAllText(find, repl, matchCase) {
          const parts = rec.slides.text.split(find);
          rec.slides.text = parts.join(repl);
          return parts.length - 1;
        },
        saveAndClose() {},
        getSlides() {
          return [{ getPageElements() { return [{ asShape() { return { getText() { return { asString() { return rec.slides.text; } }; } }; } }]; } }];
        }
      };
      return pres;
    }
  };

  const triggers = [];
  state.triggers = triggers;
  const ScriptApp = {
    getProjectTriggers() { return triggers.slice(); },
    deleteTrigger(t) { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger(fn) {
      const t = { fn, getHandlerFunction() { return fn; } };
      const b = { timeBased() { return b; }, everyDays(n) { t.every = n; return b; }, atHour(h) { t.hour = h; return b; }, inTimezone(z) { t.tz = z; return b; }, create() { triggers.push(t); return t; } };
      return b;
    }
  };

  const sandbox = {
    Utilities, CacheService, PropertiesService, LockService, MailApp, SpreadsheetApp, DriveApp, SlidesApp, ScriptApp,
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} }
  };
  const ctx = vm.createContext(sandbox);

  const dir = opts.dir || SRC;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort();
  const order = opts.reverse ? files.slice().reverse() : files;
  order.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
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
    /** Daftar templat sijil (Slides) dalam Drive tiruan dan pautkan dalam Link_Dokumen. */
    addSijilTemplate(text) {
      const id = newId('TP');
      state.files[id] = { id, name: 'Templat sijil', parents: [state.folders.root], slides: { text } };
      env.run(`(function(){ var r = Db.find('Link_Dokumen', function(x){ return x.Kod==='TEMPLAT_SIJIL_SSU'; })[0];
        Db.update('Link_Dokumen', r._row, {URL: 'https://docs.google.com/presentation/d/${id}/edit'}); Db.reset(); })()`);
      return id;
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
