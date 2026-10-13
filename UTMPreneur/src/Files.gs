/**
 * UTMPreneur: muat naik dan muat turun fail melalui pelayan.
 * Semakan jenis dan saiz dibuat di pelayan: sambungan, jenis MIME dan tandatangan fail (magic bytes).
 * Fail disimpan dalam folder Drive berdaftar (Link_Dokumen); pengguna tidak pernah menerima pautan Drive.
 */

var Files = (function () {
  var MIME = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel'
  };

  /** Jenis sebenar berdasarkan beberapa bait pertama. Pulang pdf, png, jpg, zip (xlsx), ole (xls) atau ''. */
  function sniff_(b) {
    var u = function (i) { return (b[i] + 256) % 256; };
    if (b.length >= 5 && u(0) === 0x25 && u(1) === 0x50 && u(2) === 0x44 && u(3) === 0x46) return 'pdf';
    if (b.length >= 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47) return 'png';
    if (b.length >= 3 && u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF) return 'jpg';
    if (b.length >= 4 && u(0) === 0x50 && u(1) === 0x4B && u(2) === 0x03 && u(3) === 0x04) return 'zip';
    if (b.length >= 4 && u(0) === 0xD0 && u(1) === 0xCF && u(2) === 0x11 && u(3) === 0xE0) return 'ole';
    return '';
  }

  function extOf_(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1] : '';
  }

  var SNIFF_OK = { pdf: ['pdf'], png: ['png'], jpg: ['jpg'], jpeg: ['jpg'], xlsx: ['zip'], xls: ['ole'] };

  /**
   * Semak fail {nama, data(base64)}. allow = senarai sambungan dibenarkan (tertakluk kepada JENIS_FAIL dalam Tetapan).
   * Pulang {bytes, ext, nama, mime}. Lempar FAIL_TIDAK_SAH jika tidak sah.
   */
  function validate_(f, allow) {
    if (!f || typeof f !== 'object' || !f.data || !f.nama) throw appError_('FAIL_TIDAK_SAH');
    var ext = extOf_(f.nama);
    var global = Cfg.list('JENIS_FAIL').map(function (x) { return x.toLowerCase(); });
    if (!ext || allow.indexOf(ext) < 0 || global.indexOf(ext) < 0) throw appError_('FAIL_TIDAK_SAH');
    var maxMb = Cfg.num('MAKS_SAIZ_FAIL_MB', 10);
    var b64 = String(f.data).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (b64.length > Math.ceil(maxMb * 1024 * 1024 * 4 / 3) + 8) throw appError_('FAIL_TIDAK_SAH');
    var bytes;
    try { bytes = Utilities.base64Decode(b64); } catch (e) { throw appError_('FAIL_TIDAK_SAH'); }
    if (!bytes || !bytes.length || bytes.length > maxMb * 1024 * 1024) throw appError_('FAIL_TIDAK_SAH');
    if ((SNIFF_OK[ext] || []).indexOf(sniff_(bytes)) < 0) throw appError_('FAIL_TIDAK_SAH');
    return { bytes: bytes, ext: ext, nama: String(f.nama).substr(-80), mime: MIME[ext] };
  }

  function folderOf_(kod) {
    var l = Db.links()[kod];
    if (!l || !l.id) throw appError_('SETUP_TIADA_LINK', { kod: kod });
    return DriveApp.getFolderById(l.id);
  }

  /** Simpan fail yang telah disemak ke folder berdaftar. Pulang URL fail. */
  function save_(folderKod, baseName, v) {
    var folder = folderOf_(folderKod);
    var blob = Utilities.newBlob(v.bytes, v.mime, baseName + '.' + v.ext);
    var file = folder.createFile(blob);
    file.setName(baseName + '.' + v.ext);
    return file.getUrl();
  }

  /** Baca fail Drive (daripada URL dalam sheet) dan pulang {nama, mime, data(base64)}. */
  function read_(url) {
    var id = Util.idFromUrl(url);
    if (!id) throw appError_('FAIL_TIDAK_DITEMUI');
    var file;
    try { file = DriveApp.getFileById(id); } catch (e) { throw appError_('FAIL_TIDAK_DITEMUI'); }
    var blob = file.getBlob();
    return { nama: file.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  }

  return { validate: validate_, save: save_, read: read_, sniff: sniff_, extOf: extOf_ };
})();
