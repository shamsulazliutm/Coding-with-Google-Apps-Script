/**
 * Web App: Borang Permohonan Surat Pengesahan Pembiayaan Skim Qardhul Hassan BAKES
 * Jawapan disimpan dalam Google Sheet (tab "Permohonan").
 *
 * Setup: Deploy > New deployment > Web app
 *   Execute as: Me | Who has access: Anyone (atau Anyone within UTM)
 */
var SHEET_NAME = 'Permohonan';
var HEADERS = ['Masa', 'Email', 'No Whatsapp', 'Nama', 'No. Pekerja', 'No. Kad Pengenalan'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Borang Qardhul Hassan BAKES')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function submitForm(d) {
  var email = String(d.email || '').trim();
  var phone = String(d.phone || '').trim();
  var nama = String(d.nama || '').trim().toUpperCase();
  var noPekerja = String(d.noPekerja || '').trim();
  var ic = String(d.ic || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email tidak sah.');
  if (!/^60[0-9]{8,10}$/.test(phone)) throw new Error('No Whatsapp mesti bermula dengan 60 (nombor sahaja).');
  if (!nama) throw new Error('Nama diperlukan.');
  if (!noPekerja) throw new Error('No. Pekerja diperlukan.');
  if (!/^[0-9]{12}$/.test(ic)) throw new Error('No. Kad Pengenalan mesti 12 digit tanpa "-".');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getSheet_();
    // Simpan sebagai teks supaya sifar pendahulu kekal
    sh.appendRow([new Date(), email, "'" + phone, nama, "'" + noPekerja, "'" + ic]);
  } finally {
    lock.release();
  }
  return { ok: true };
}

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Jawapan - Qardhul Hassan BAKES');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.getSheets()[0].setName(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}
