/**
 * UTMPreneur: penghantaran emel dwibahasa (BM utama, English italik kecil).
 * MOD UJI: emel hanya dihantar kepada senarai penguji (Tetapan PENGUJI_EMEL) dan ditanda [UJI].
 */

var Mail = {
  esc: function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** Bina HTML dwibahasa. bm dan en ialah tatasusunan perenggan teks biasa. */
  bodyHtml: function (bm, en) {
    var p = function (arr, style) {
      return arr.map(function (t) { return '<p style="' + style + '">' + Mail.esc(t) + '</p>'; }).join('');
    };
    return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2B2023;max-width:560px">' +
      '<div style="border-top:4px solid #8A2D3B;border-bottom:3px solid #D9A02E;padding:10px 0;margin-bottom:14px">' +
      '<b style="color:#8A2D3B;font-size:17px">UTMPreneur</b> <span style="color:#74676B;font-size:12px">· UTMXCITE</span></div>' +
      p(bm, 'margin:0 0 10px') +
      '<div style="border-top:1px solid #E7DFE0;margin-top:14px;padding-top:10px">' +
      p(en, 'margin:0 0 8px;font-style:italic;font-size:12px;color:#74676B') + '</div>' +
      '<div style="font-size:11px;color:#74676B;margin-top:14px">Pusat Inovasi Mahasiswa dan Keusahawanan Teknologi (UTMXCITE) · utmxcite@utm.my · 018-967 0791</div>' +
      '</div>';
  },

  /** Adakah emel ini dibenarkan menerima emel dalam mod semasa? */
  allowed: function (to) {
    if (!Mode.isUji()) return true;
    return Cfg.list('PENGUJI_EMEL').map(Util.normEmail).indexOf(Util.normEmail(to)) >= 0;
  },

  /**
   * Hantar emel. Pulang true jika dihantar. Dalam mod UJI, pulang false jika penerima tiada dalam senarai putih.
   * opts: { subjectBm, subjectEn, bm: [..], en: [..] }
   */
  send: function (to, opts) {
    if (!Mail.allowed(to)) return false;
    var subject = (Mode.isUji() ? '[UJI] ' : '') + opts.subjectBm + ' / ' + opts.subjectEn;
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: Mail.bodyHtml(opts.bm, opts.en),
      name: Cfg.get('NAMA_PENGHANTAR', 'UTMPreneur · UTMXCITE')
    });
    return true;
  },

  sendOtp: function (to, code, minit) {
    return Mail.send(to, {
      subjectBm: 'Kod pengesahan log masuk',
      subjectEn: 'Sign-in verification code',
      bm: [
        'Kod pengesahan anda ialah: ' + code,
        'Kod ini sah selama ' + minit + ' minit. Jangan kongsikannya dengan sesiapa. Jika anda tidak meminta kod ini, abaikan emel ini.'
      ],
      en: [
        'Your verification code is: ' + code,
        'This code is valid for ' + minit + ' minutes. Do not share it with anyone. If you did not request it, ignore this email.'
      ]
    });
  }
};
