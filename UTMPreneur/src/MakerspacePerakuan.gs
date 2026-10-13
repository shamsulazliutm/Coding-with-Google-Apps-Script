/**
 * UTMPreneur: Makerspace, perakuan penyelia melalui pautan emel (tanpa log masuk).
 * Token rawak sekali guna (hanya hash disimpan dalam sheet), tamat tempoh, pengesahan OTP ke emel penyelia
 * (Otp.issue/verify dengan tujuan unik bagi setiap tempahan), had kadar dan mesej generik. Direkod dalam Audit.
 * Halaman hanya memaparkan ringkasan tempahan, bukan data peribadi tambahan.
 */

var MkPerakuan = (function () {
  function hash_(tok) { return Util.sha256('mk-perakuan|' + String(tok).toLowerCase()); }
  function bentuk_(tok) { return typeof tok === 'string' && /^[a-f0-9]{64}$/i.test(tok); }
  function tujuan_(id) { return 'MK_PERAKUAN:' + id; }

  /** Had kadar: setiap pautan, dan kiraan global bagi token tidak sah. */
  function jaga_(tok) {
    var ok = bentuk_(tok);
    var key = ok ? 'mkpk:' + hash_(tok).substr(0, 24) : 'mkpk:bad';
    if (!Mk.had(key, ok ? Cfg.num('PERAKUAN_HAD_10MIN', 30) : 60, 600)) throw appError_('MK_PERAKUAN_HAD');
    return ok;
  }

  /** Cari tempahan bagi token yang masih sah; null jika tidak. Pelbagai sebab dilaporkan sama (generik). */
  function cari_(tok) {
    if (!bentuk_(tok)) { Mk.had('mkpk:nf', 200, 600); return null; }
    var h = hash_(tok);
    var l = Db.find('Tempahan', function (r) { return Util.str(r.Token_Hash) === h; });
    var r = l.length ? l[0] : null;
    if (!r || Util.str(r.Status) !== 'Menunggu Perakuan' || Mk.tokenTamat(r)) {
      if (!Mk.had('mkpk:nf', 200, 600)) throw appError_('MK_PERAKUAN_HAD');
      return null;
    }
    return r;
  }

  function pautan_(tok) {
    var url = Cfg.get('WEBAPP_URL', '');
    if (!url) return '';
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'perakuan=' + tok;
  }

  /** Hantar emel pautan perakuan kepada penyelia. Pulang true jika emel dihantar. */
  function hantarPautan_(r, tok) {
    var id = Util.str(r.ID_Tempahan);
    var url = pautan_(tok);
    var bm = [
      'Pelajar ' + Util.str(r.Nama_Pemohon) + ' memohon tempahan Makerspace UTM (' + Util.str(r.Jenis) + ', ' + id + ') dan menamakan anda sebagai penyelia / pensyarah yang memperakui.',
      url ? 'Sila semak dan perakui melalui pautan ini (sah sehingga ' + Util.fmtTarikhBM(r.Token_Tamat) + '): ' + url : 'Pautan perakuan tidak dapat dijana kerana URL aplikasi belum ditetapkan. Sila hubungi UTMXCITE.',
      'Anda akan diminta memasukkan kod OTP yang dihantar ke emel ini. Jangan kongsikan pautan ini. Jika anda tidak mengenali pemohon, abaikan emel ini.'
    ];
    var en = [
      'Student ' + Util.str(r.Nama_Pemohon) + ' requested a UTM Makerspace booking (' + Util.str(r.Jenis) + ', ' + id + ') and named you as the endorsing supervisor.',
      url ? 'Please review and endorse it using this link (valid until ' + Util.dateKey(r.Token_Tamat) + '): ' + url : 'The endorsement link could not be created because the application URL is not set. Please contact UTMXCITE.',
      'You will be asked to enter an OTP sent to this email. Do not share this link. If you do not know the applicant, ignore this email.'
    ];
    var sent = Mk.mel(Util.normEmail(r.Emel_Penyelia), 'Permohonan perakuan tempahan Makerspace', 'Makerspace booking endorsement request', bm, en, true);
    return !!sent && !!url;
  }

  // ---------- Awam (tanpa sesi) ----------
  function maklumat_(p) {
    p = p || {};
    jaga_(p.token);
    var r = cari_(p.token);
    if (!r) throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var o = MkTempahan.paparan(r, {});
    var ring = {
      id: o.id, jenis: o.jenis, sumberNama: o.sumberNama, namaPemohon: o.namaPemohon, tujuan: o.tujuan,
      tarikhMula: o.tarikhMula, tarikhTamat: o.tarikhTamat, masaMula: o.masaMula, masaTamat: o.masaTamat,
      emelPenyelia: MkTempahan.maskEmel(Util.str(r.Emel_Penyelia)), pautanTamat: Util.dateKey(r.Token_Tamat)
    };
    if (o.butiran) {
      ring.projek = o.butiran.namaProjek || o.butiran.namaProgram || '';
      if (o.jenis === 'Ruang') ring.bilPeserta = o.butiran.bilPeserta;
    }
    if (o.item) ring.item = o.item.map(function (x) { return { nama: x.nama, kuantiti: x.kuantiti }; });
    return ring;
  }

  function otp_(p) {
    p = p || {};
    jaga_(p.token);
    var r = cari_(p.token);
    if (!r) throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var id = Util.str(r.ID_Tempahan);
    var emel = Util.normEmail(r.Emel_Penyelia);
    var res = Otp.issue(tujuan_(id), emel, {
      subjectBm: 'Kod pengesahan perakuan tempahan Makerspace', subjectEn: 'Makerspace booking endorsement code',
      bm: ['Kod pengesahan untuk memperakui tempahan ' + id + ' (pemohon: ' + Util.str(r.Nama_Pemohon) + ') ialah: {kod}', 'Kod ini sah beberapa minit sahaja. Jangan kongsikannya.'],
      en: ['Your code to endorse booking ' + id + ' (applicant: ' + Util.str(r.Nama_Pemohon) + ') is: {kod}', 'This code is valid for a few minutes only. Do not share it.']
    });
    return { jedaSaat: res.jedaSaat, tamatMinit: res.tamatMinit, emelPenyelia: MkTempahan.maskEmel(emel) };
  }

  function sahkan_(p) {
    p = p || {};
    jaga_(p.token);
    var r = cari_(p.token);
    if (!r) throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var tindakan = Util.str(p.tindakan);
    if (tindakan !== 'perakui' && tindakan !== 'tolak') throw appError_('MK_PERAKUAN_TIDAK_SAH');
    var catatan = Util.str(p.catatan).substr(0, 300);
    if (tindakan === 'tolak' && !catatan) throw appError_('MK_CATATAN_WAJIB');
    var id = Util.str(r.ID_Tempahan);
    var emel = Util.normEmail(r.Emel_Penyelia);
    Otp.verify(tujuan_(id), emel, p.kod); // lempar OTP_SALAH / OTP_TAMAT / OTP_TERLALU_BANYAK
    var h = hash_(p.token);
    var pemohon = Db.withLock(function () {
      var cur = Db.find('Tempahan', function (x) { return Util.str(x.Token_Hash) === h; })[0];
      if (!cur || Util.str(cur.Status) !== 'Menunggu Perakuan' || Mk.tokenTamat(cur)) throw appError_('MK_PERAKUAN_TIDAK_SAH');
      var now = new Date();
      if (tindakan === 'perakui') {
        Db.update('Tempahan', cur._row, { Status: 'Menunggu Kelulusan', Status_Perakuan: 'Diperakui', Tarikh_Perakuan: now, Token_Hash: '', Catatan_Penyelia: catatan });
      } else {
        Db.update('Tempahan', cur._row, {
          Status: 'Ditolak', Status_Perakuan: 'Ditolak', Tarikh_Perakuan: now, Tarikh_Keputusan: now, Token_Hash: '', Catatan_Penyelia: catatan,
          Catatan: 'Ditolak oleh penyelia: ' + catatan
        });
      }
      Audit.log({ email: emel, role: 'Penyelia' }, tindakan === 'perakui' ? 'MK_PERAKUAN' : 'MK_PERAKUAN_TOLAK', 'Makerspace', id, 'Menunggu Perakuan',
        tindakan === 'perakui' ? 'Menunggu Kelulusan' : 'Ditolak', catatan);
      return Util.normEmail(cur.Emel_Pemohon);
    });
    if (tindakan === 'perakui') {
      Mk.mel(pemohon, 'Tempahan Makerspace diperakui', 'Makerspace booking endorsed',
        ['Penyelia anda telah memperakui tempahan ' + id + '. Tempahan kini menunggu kelulusan UTMXCITE.'],
        ['Your supervisor has endorsed booking ' + id + '. It is now awaiting UTMXCITE approval.']);
    } else {
      Mk.mel(pemohon, 'Tempahan Makerspace tidak diperakui', 'Makerspace booking not endorsed',
        ['Penyelia anda tidak memperakui tempahan ' + id + '. Catatan: ' + catatan],
        ['Your supervisor did not endorse booking ' + id + '. Note: ' + catatan]);
    }
    return { diproses: true, tindakan: tindakan };
  }

  // ---------- Pemohon: hantar semula pautan ----------
  function hantarSemula_(ctx, p) {
    var pem = Mk.pemohonSendiri(ctx);
    var id = Util.str(p.id);
    var r = Mk.tempahan(id);
    if (!r || !MkTempahan.milik(r, pem.emel, pem.noMatrik)) throw appError_('MK_TIDAK_DITEMUI');
    if (Util.str(r.Status) !== 'Menunggu Perakuan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
    var penyelia = Util.normEmail(p.emelPenyelia) || Util.normEmail(r.Emel_Penyelia);
    var dp = Cfg.get('DOMAIN_PELAJAR', '@graduate.utm.my'), ds = Cfg.get('DOMAIN_STAF', '@utm.my');
    var e = {};
    if (!Util.isEmail(penyelia)) e.emelPenyelia = 'Masukkan emel penyelia yang sah / Enter a valid supervisor email';
    else if (!Util.isStaffEmail(penyelia, dp, ds)) e.emelPenyelia = 'Emel penyelia mesti emel staf ' + ds + ' / Must be a staff email ' + ds;
    else if (penyelia === pem.emel) e.emelPenyelia = 'Emel penyelia tidak boleh sama dengan emel pemohon / Cannot be the applicant\'s own email';
    if (Object.keys(e).length) throw appError_('MK_TIDAK_SAH', { medan: e });
    if (!Mk.had('mkpk:re:' + id, 3, 3600)) throw appError_('RATE_JEDA');
    var tok = Util.randomToken();
    var tamat = new Date(new Date().getTime() + Cfg.num('PERAKUAN_TAMAT_HARI', 5) * 86400000);
    Db.withLock(function () {
      var cur = Mk.tempahan(id);
      if (Util.str(cur.Status) !== 'Menunggu Perakuan') throw appError_('MK_PERALIHAN_TIDAK_SAH');
      Db.update('Tempahan', cur._row, { Emel_Penyelia: penyelia, Token_Hash: hash_(tok), Token_Tamat: tamat });
      Audit.log(ctx, 'MK_HANTAR_SEMULA_PERAKUAN', 'Makerspace', id, Util.str(cur.Emel_Penyelia), penyelia, '');
    });
    var dihantar = hantarPautan_(Mk.tempahan(id), tok);
    return { emelDihantar: dihantar, penyelia: MkTempahan.maskEmel(penyelia) };
  }

  return { hash: hash_, hantarPautan: hantarPautan_, maklumat: maklumat_, otp: otp_, sahkan: sahkan_, hantarSemula: hantarSemula_ };
})();
