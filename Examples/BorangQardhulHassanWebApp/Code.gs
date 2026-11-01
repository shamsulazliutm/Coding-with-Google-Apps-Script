/**
 * Web App BAKES - Permohonan Surat Pengesahan Pembiayaan QH
 *
 * Aliran:
 *   index.html --> submitForm() --> sheet "ANTRIAN" --> prosesAntrian() (trigger masa)
 *   --> tulis baris ke "DATASURAT" --> onFormSubmit(e)  [kod SEDIA ADA, tidak diubah]
 *       --> rekod / surat PDF / email / WhatsApp
 *
 * SYARAT: skrip ini mesti berada dalam projek Apps Script YANG SAMA (container-bound
 * pada spreadsheet) dengan kod sedia ada (onFormSubmit, rekodPembiayaan, noRujukan,
 * generateSuratRespond, emailLinkPDFrespond, notisWhatsapp, phone02, formatkpa ...).
 *
 * Deploy: Deploy > New deployment > Web app (Execute as: Me).
 */
var SHEET_DATA  = 'DATASURAT';
var SHEET_QUEUE = 'ANTRIAN';
// Lajur ANTRIAN: A Masa | B Email | C Nama | D No.Pekerja | E No.KP | F WhatsApp | G Status | H Catatan
var QUEUE_HEADERS = ['Masa', 'Email', 'Nama', 'No. Pekerja', 'No. Kad Pengenalan', 'No Whatsapp', 'Status', 'Catatan'];
var MAX_RUN_MS = 4 * 60 * 1000; // berhenti sebelum had 6 minit, jadual semula jika masih ada baki

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Borang Qardhul Hassan BAKES')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Dipanggil dari index.html. Hanya sahkan, simpan dalam antrian dan jadualkan pemprosesan. */
function submitForm(d) {
  var email = String(d.email || '').trim().toLowerCase();
  var phone = String(d.phone || '').trim();
  var nama = String(d.nama || '').trim().toUpperCase();
  var noPekerja = String(d.noPekerja || '').trim();
  var ic = String(d.ic || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email tidak sah.');
  if (!/^60[0-9]{8,10}$/.test(phone)) throw new Error('No Whatsapp mesti bermula dengan 60 (nombor sahaja).');
  if (!nama) throw new Error('Nama diperlukan.');
  if (!noPekerja) throw new Error('No. Pekerja diperlukan.');
  if (!/^[0-9]{12}$/.test(ic)) throw new Error('No. Kad Pengenalan mesti 12 digit tanpa "-".');

  // appendRow adalah atomik; "'" mengekalkan sifar pendahulu sebagai teks
  getQueueSheet_().appendRow([new Date(), email, nama, "'" + noPekerja, "'" + ic, "'" + phone, '', '']);
  scheduleProses_();
  return { ok: true };
}

/** Dijalankan oleh trigger masa. Proses satu demi satu supaya andaian "baris terakhir" kod lama kekal sah. */
function prosesAntrian() {
  deleteProsesTriggers_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { scheduleProses_(); return; }
  var start = Date.now();
  try {
    var q = getQueueSheet_();
    while (Date.now() - start < MAX_RUN_MS) {
      var rows = q.getDataRange().getValues();
      var idx = -1;
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][6] === '') { idx = i; break; }
      }
      if (idx < 0) return; // antrian kosong
      var r = idx + 1;
      try {
        prosesSatu_(rows[idx]);
        q.getRange(r, 7, 1, 2).setValues([['SELESAI', '']]);
      } catch (err) {
        q.getRange(r, 7, 1, 2).setValues([['RALAT', String(err)]]); // tidak diulang automatik
      }
    }
    scheduleProses_(); // masa hampir habis, sambung kemudian
  } finally {
    lock.release();
  }
}

/** Tulis satu permohonan ke DATASURAT dalam susunan lajur borang lama, kemudian panggil onFormSubmit(e). */
function prosesSatu_(row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName(SHEET_DATA);
  var r = ds.getLastRow() + 1;

  // Susunan lajur borang lama: A Cap masa | B Email | C Nama | D No.Pekerja | E No.KP | F WhatsApp
  var values = [
    Utilities.formatDate(new Date(), 'GMT+8', 'M/d/yyyy HH:mm:ss'),
    String(row[1]), String(row[2]), String(row[3]), String(row[4]), String(row[5])
  ];
  ds.getRange(r, 1).setValue(new Date());
  ds.getRange(r, 2, 1, 5).setValues([[row[1], row[2], "'" + row[3], "'" + row[4], "'" + row[5]]]);
  SpreadsheetApp.flush();

  // Event tiruan (sama bentuk dengan trigger borang Google) untuk kod sedia ada
  var e = {
    source: { getActiveSheet: function () { return ds; } },
    values: values,
    range: ds.getRange(r, 1)
  };
  onFormSubmit(e);
}

function getQueueSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_QUEUE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_QUEUE);
    sh.appendRow(QUEUE_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function scheduleProses_() {
  var ada = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'prosesAntrian';
  });
  if (!ada) ScriptApp.newTrigger('prosesAntrian').timeBased().after(1000).create();
}

function deleteProsesTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'prosesAntrian') ScriptApp.deleteTrigger(t);
  });
}
