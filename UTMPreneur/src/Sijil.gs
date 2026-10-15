/**
 * SHAMS: penjanaan sijil SSU (PDF) daripada templat Google Slides.
 * Templat dibaca dari Drive pada masa penjanaan (Link_Dokumen: TEMPLAT_SIJIL_SSU). Penanda boleh ditulis
 * [nama_syarikat] (templat semasa) atau {{NAMA_PERNIAGAAN}}. Penanda tidak dikenali dibiarkan dan dilaporkan.
 */

var Sijil = (function () {
  /** [penanda kecil, penanda besar, kunci data] */
  var PENANDA = [
    ['nama_syarikat', 'NAMA_PERNIAGAAN', 'namaSyarikat'],
    ['no_sijil', 'NO_PENDAFTARAN', 'noPendaftaran'],
    ['tarikh_daftar', 'TARIKH_PENDAFTARAN', 'tarikhDaftar'],
    ['alamat_berdaftar', 'ALAMAT_PERNIAGAAN', 'alamat'],
    ['kod_kursus', 'KOD_SUBJEK', 'kodKursus'],
    ['nama_ahli', 'SENARAI_AHLI', 'namaAhli'],
    ['bil_ahli', 'JUMLAH_AHLI', 'bilAhli'],
    ['tarikh_tamat', 'TEMPOH_SAH_LAKU', 'tarikhTamat']
  ];
  var LEFTOVER = /\[[a-z_]{3,}\]|\{\{[A-Z_]{3,}\}\}/g;

  function templatId_() {
    var l = Db.links().TEMPLAT_SIJIL_SSU;
    return l && l.id ? l.id : '';
  }

  /** Teks yang akan menggantikan penanda. d: {namaSyarikat, noPendaftaran, tarikhDaftar, tarikhTamat, alamat, kodKursus, ahli[]} */
  function nilai_(d) {
    return {
      namaSyarikat: d.namaSyarikat,
      noPendaftaran: d.noPendaftaran,
      tarikhDaftar: Util.fmtTarikhBM(d.tarikhDaftar),
      alamat: d.alamat,
      kodKursus: d.kodKursus || '-',
      namaAhli: d.ahli.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n'),
      bilAhli: String(d.ahli.length),
      tarikhTamat: Util.fmtTarikhBM(d.tarikhTamat)
    };
  }

  function leftover_(pres) {
    var found = {};
    try {
      pres.getSlides().forEach(function (sl) {
        sl.getPageElements().forEach(function (pe) {
          var txt = '';
          try { txt = pe.asShape().getText().asString(); } catch (e) { return; }
          (txt.match(LEFTOVER) || []).forEach(function (m) { found[m] = true; });
        });
      });
    } catch (e) { /* abaikan; amaran sahaja */ }
    return Object.keys(found);
  }

  /**
   * Jana PDF sijil. Pulang {url, amaran:[..]}. Lempar SIJIL_TEMPLAT_TIADA jika templat tidak boleh dibuka.
   */
  function jana_(d) {
    var tid = templatId_();
    if (!tid) throw appError_('SIJIL_TEMPLAT_TIADA');
    var fl = Db.links().FLD_SIJIL_SSU;
    if (!fl || !fl.id) throw appError_('SETUP_TIADA_LINK', { kod: 'FLD_SIJIL_SSU' });
    var folder = DriveApp.getFolderById(fl.id);
    var copy;
    try { copy = DriveApp.getFileById(tid).makeCopy('~sementara ' + d.noPendaftaran, folder); } catch (e) {
      console.error('Templat sijil tidak boleh dibuka: ' + e);
      throw appError_('SIJIL_TEMPLAT_TIADA');
    }
    var amaran = [], pdfUrl;
    try {
      var pres = SlidesApp.openById(copy.getId());
      var v = nilai_(d);
      PENANDA.forEach(function (p) {
        var text = String(v[p[2]]);
        pres.replaceAllText('[' + p[0] + ']', text, true);
        pres.replaceAllText('{{' + p[1] + '}}', text, true);
      });
      pres.saveAndClose();
      var left = leftover_(SlidesApp.openById(copy.getId()));
      if (left.length) amaran.push('Penanda tidak dikenali dalam templat (dibiarkan): ' + left.join(', '));
      var blob = copy.getAs('application/pdf');
      var name = 'Sijil SSU ' + d.noPendaftaran + '.pdf';
      blob.setName(name);
      var file = folder.createFile(blob);
      file.setName(name);
      pdfUrl = file.getUrl();
    } finally {
      try { copy.setTrashed(true); } catch (e) { console.error('Salinan sementara tidak dapat dipadam: ' + e); }
    }
    return { url: pdfUrl, amaran: amaran };
  }

  return { jana: jana_, nilai: nilai_ };
})();
