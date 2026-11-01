/**
 * Bina borang baru: BORANG PERMOHONAN SURAT PENGESAHAN PEMBIAYAAN SKIM QARDHUL HASSAN BAKES
 * Jalankan createBorangQardhulHassan() sekali sahaja dari editor Apps Script.
 */
function createBorangQardhulHassan() {
  var form = FormApp.create('BORANG PERMOHONAN SURAT PENGESAHAN PEMBIAYAAN SKIM QARDHUL HASSAN BAKES');

  form.setDescription(
    'Ahli BAKES Yang Dihormati,\n\n' +
    'Mohon lengkapkan maklumat ini untuk tujuan penyediaan surat pengesahan pembiayaaan Skim Qardul Hassn BAKES.\n\n' +
    'Surat Pengesahan akan di email sebaik maklumat diterima. Sila semak email yang didaftarkan dan maklumkan pada infoBAKES ditalian dibawah jika Surat pengesahan tidak diterima selepas maklumat diberikan.\n\n' +
    'Sekian, Terima Kasih.\n\n' +
    'BENDAHARI\n' +
    'Badan Kebajikan Staf (BAKES) UTM\n' +
    'wa.me/601163363803'
  );

  // 1. Email (dikutip automatik)
  form.setCollectEmail(true);

  // 2. No Whatsapp
  var phoneValidation = FormApp.createTextValidation()
    .setHelpText('Mulakan dengan 60, nombor sahaja (cth: 60123456789).')
    .requireTextMatchesPattern('^60[0-9]{8,10}$')
    .build();
  form.addTextItem()
    .setTitle('No Whatsapp')
    .setHelpText('Mulakan dengan 60. Pastikan Nombor WhatsApp ini aktif kerana INFOBAKES akan hantar salinan surat melalui whatsapp juga.')
    .setValidation(phoneValidation)
    .setRequired(true);

  // 3. Nama (huruf besar)
  form.addTextItem()
    .setTitle('Nama (huruf Besar)')
    .setRequired(true);

  // 4. No. Pekerja
  form.addTextItem()
    .setTitle('No. Pekerja')
    .setRequired(true);

  // 5. No. Kad Pengenalan (tanpa -)
  var icValidation = FormApp.createTextValidation()
    .setHelpText('Masukkan 12 digit tanpa tanda "-".')
    .requireTextMatchesPattern('^[0-9]{12}$')
    .build();
  form.addTextItem()
    .setTitle('No. Kad Pengenalan (Tanpa -)')
    .setValidation(icValidation)
    .setRequired(true);

  Logger.log('Borang edit : ' + form.getEditUrl());
  Logger.log('Borang awam : ' + form.getPublishedUrl());
}
