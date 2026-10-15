/**
 * SHAMS: OTP berasaskan tujuan (bukan log masuk). Contoh: pemohon mengesahkan penerimaan tawaran,
 * penyelia memperakui tempahan. OTP dihantar ke emel yang ditentukan, disimpan sebagai hash dalam CacheService,
 * had percubaan, jeda dan had sejam; dikira dalam kuota OTP harian yang sama dengan log masuk.
 *   Otp.issue('TERIMA_TAWARAN:PLT-2026-0001', emel, {subjectBm, subjectEn, bm:[...], en:[...]})
 *   Otp.verify('TERIMA_TAWARAN:PLT-2026-0001', emel, kod)   // lempar AppError jika tidak sah, pulang true
 * opts.bm / opts.en ialah tatasusunan perenggan; "{kod}" dalam perenggan diganti kod OTP.
 */

var Otp = (function () {
  var P = 'otpx:', CD = 'otpxcd:', HR = 'otpxh:';

  function key_(purpose, email) { return Util.sha256(Auth.pepper() + '|x|' + purpose + '|' + email).substr(0, 40); }
  function hash_(purpose, email, code) { return Util.sha256(Auth.pepper() + '|xc|' + purpose + '|' + email + '|' + code); }

  function issue_(purpose, emailRaw, opts) {
    opts = opts || {};
    var email = Util.normEmail(emailRaw);
    if (!Util.isEmail(email)) throw appError_('EMEL_TIDAK_SAH');
    if (Mode.isUji() && !Mail.allowed(email)) throw appError_('UJI_TIADA_SENARAI');
    var c = Db.cache(), k = key_(purpose, email);
    if (c.get(CD + k)) throw appError_('RATE_JEDA');
    var hourly = parseInt(c.get(HR + k) || '0', 10);
    if (hourly >= Cfg.num('OTP_MAKS_SEJAM', 3) + 2) throw appError_('RATE_SEJAM');
    if (Auth.bumpDaily() > Cfg.num('OTP_MAKS_HARIAN', 1000)) throw appError_('RATE_HARIAN');
    var minit = Cfg.num('OTP_TAMAT_MINIT', 5);
    var code = Util.randomOtp();
    c.put(P + k, JSON.stringify({ h: hash_(purpose, email, code), t: 0, exp: new Date().getTime() + minit * 60000 }), minit * 60);
    c.put(CD + k, '1', Cfg.num('OTP_JEDA_SAAT', 60));
    c.put(HR + k, String(hourly + 1), 3600);
    var sub = function (arr) { return (arr || []).map(function (t) { return String(t).replace(/\{kod\}/g, code); }); };
    var sent;
    try {
      sent = Mail.send(email, {
        subjectBm: opts.subjectBm || 'Kod pengesahan', subjectEn: opts.subjectEn || 'Verification code',
        bm: sub(opts.bm && opts.bm.length ? opts.bm : ['Kod pengesahan anda ialah: {kod}', 'Kod ini sah selama ' + minit + ' minit. Jangan kongsikannya.']),
        en: sub(opts.en && opts.en.length ? opts.en : ['Your verification code is: {kod}', 'This code is valid for ' + minit + ' minutes. Do not share it.'])
      });
    } catch (e) {
      console.error('Emel OTP tujuan gagal: ' + e);
      throw appError_('HANTAR_GAGAL');
    }
    if (!sent) throw appError_('UJI_TIADA_SENARAI');
    return { jedaSaat: Cfg.num('OTP_JEDA_SAAT', 60), tamatMinit: minit };
  }

  function verify_(purpose, emailRaw, codeRaw) {
    var email = Util.normEmail(emailRaw);
    var code = String(codeRaw == null ? '' : codeRaw).replace(/\s+/g, '');
    var c = Db.cache(), k = key_(purpose, email);
    var raw = c.get(P + k);
    if (!raw) throw appError_('OTP_TAMAT');
    var rec = JSON.parse(raw);
    var maxTries = Cfg.num('OTP_MAKS_PERCUBAAN', 5);
    if (rec.t >= maxTries) { c.remove(P + k); throw appError_('OTP_TERLALU_BANYAK'); }
    if (!/^\d{6}$/.test(code) || !Util.safeEqual(rec.h, hash_(purpose, email, code))) {
      rec.t++;
      if (rec.t >= maxTries) { c.remove(P + k); throw appError_('OTP_TERLALU_BANYAK'); }
      c.put(P + k, JSON.stringify(rec), Math.max(1, Math.floor((rec.exp - new Date().getTime()) / 1000)));
      throw appError_('OTP_SALAH');
    }
    c.remove(P + k);
    return true;
  }

  return { issue: issue_, verify: verify_ };
})();
