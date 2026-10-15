/**
 * UTMPreneur: penjanaan PDF daripada HTML (tanpa templat Google Docs) dan enjin templat Google Docs.
 *   Pdf.wrap(bodyHtml, tajuk)               -> HTML A4 dengan gaya seragam (UTMXCITE)
 *   Pdf.dariHtml(html, namaFail, folderKod) -> {url}   (simpan dalam folder berdaftar)
 *   DocTpl.jana(kodTemplat, data, folderKod, namaFail) -> {url, amaran[]}  (templat Google Docs dalam Link_Dokumen)
 * Penanda dalam templat Docs: [nama] atau {{NAMA}}; data ialah {nama: 'nilai'} (kunci tanpa kurungan, huruf kecil;
 * penanda besar {{NAMA}} diterima juga). Penanda tidak dikenali dibiarkan dan dilaporkan dalam amaran.
 */

var Pdf = {
  esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  wrap: function (bodyHtml, tajuk) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + Pdf.esc(tajuk || 'UTMPreneur') + '</title><style>' +
      '@page{size:A4;margin:22mm 20mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#000}' +
      'h1{font-size:14pt;text-align:center;margin:6pt 0}h2{font-size:12pt;margin:12pt 0 4pt}p{margin:0 0 7pt;text-align:justify}' +
      'table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:4pt 6pt;vertical-align:top;font-size:10.5pt}' +
      '.nb td{border:0;padding:2pt 4pt}.c{text-align:center}.r{text-align:right}.sm{font-size:9.5pt}.sig{margin-top:36pt}' +
      '</style></head><body>' + bodyHtml + '</body></html>';
  },

  /** Jana PDF daripada HTML penuh dan simpan dalam folder berdaftar (Link_Dokumen). */
  dariHtml: function (html, namaFail, folderKod) {
    var fl = Db.links()[folderKod];
    if (!fl || !fl.id) throw appError_('SETUP_TIADA_LINK', { kod: folderKod });
    var blob = Utilities.newBlob(html, 'text/html', namaFail + '.html').getAs('application/pdf');
    blob.setName(namaFail + '.pdf');
    var file = DriveApp.getFolderById(fl.id).createFile(blob);
    file.setName(namaFail + '.pdf');
    return { url: file.getUrl() };
  }
};

var DocTpl = (function () {
  function reEsc_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function repEsc_(s) { return String(s).replace(/\$/g, '\\$'); }
  var LEFT = /\[[a-z0-9_]{3,}\]|\{\{[A-Z0-9_]{3,}\}\}/g;

  function jana_(kodTemplat, data, folderKod, namaFail) {
    var t = Db.links()[kodTemplat];
    if (!t || !t.id) throw appError_('TEMPLAT_TIADA', { kod: kodTemplat });
    var fl = Db.links()[folderKod];
    if (!fl || !fl.id) throw appError_('SETUP_TIADA_LINK', { kod: folderKod });
    var folder = DriveApp.getFolderById(fl.id);
    var copy;
    try { copy = DriveApp.getFileById(t.id).makeCopy('~sementara ' + namaFail, folder); } catch (e) {
      console.error('Templat tidak boleh dibuka (' + kodTemplat + '): ' + e);
      throw appError_('TEMPLAT_TIADA', { kod: kodTemplat });
    }
    var amaran = [], url;
    try {
      var doc = DocumentApp.openById(copy.getId());
      var parts = [doc.getBody()];
      try { if (doc.getHeader()) parts.push(doc.getHeader()); } catch (e) { /* tiada pengepala */ }
      try { if (doc.getFooter()) parts.push(doc.getFooter()); } catch (e) { /* tiada pengaki */ }
      Object.keys(data).forEach(function (k) {
        var low = String(k).toLowerCase(), up = String(k).toUpperCase();
        var val = repEsc_(data[k] == null ? '' : data[k]);
        parts.forEach(function (p) {
          p.replaceText(reEsc_('[' + low + ']'), val);
          p.replaceText(reEsc_('{{' + up + '}}'), val);
        });
      });
      doc.saveAndClose();
      var left = {};
      var txt = DocumentApp.openById(copy.getId()).getBody().getText();
      (txt.match(LEFT) || []).forEach(function (m) { left[m] = true; });
      if (Object.keys(left).length) amaran.push('Penanda tidak dikenali dalam templat (dibiarkan): ' + Object.keys(left).join(', '));
      var blob = copy.getAs('application/pdf');
      blob.setName(namaFail + '.pdf');
      var file = folder.createFile(blob);
      file.setName(namaFail + '.pdf');
      url = file.getUrl();
    } finally {
      try { copy.setTrashed(true); } catch (e) { console.error('Salinan sementara tidak dapat dipadam: ' + e); }
    }
    return { url: url, amaran: amaran };
  }

  return { jana: jana_ };
})();
