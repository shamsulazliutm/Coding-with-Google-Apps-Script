/**
 * UTMPreneur: admin bertindak bagi pihak pelajar ("Bantu pelajar").
 * Admin Penuh, atau Pegawai Modul yang modulnya kosong / Semua / mengandungi SSU atau Profiling, boleh
 * mengisi profiling dan memohon SSU untuk mana-mana pelajar dalam PELAJAR (pelajar tidak perlu sudah log masuk).
 * Semua tindakan menggunakan peraturan pengesahan yang sama seperti pelajar dan direkod dalam Audit dengan
 * emel admin serta tanda [bagi pihak]. Modul lain (Ruang Niaga, Kewangan, Makerspace) akan menggunakan Bantu.ctx yang sama.
 */

var Bantu = (function () {
  function allowed_(ctx) {
    if (ctx.role === ROLE.ADMIN_PENUH) return true;
    if (ctx.role === ROLE.PEGAWAI_MODUL) {
      var a = Admins.find(ctx.email);
      var mod = a ? a.modul.toLowerCase() : '';
      return !mod || mod.indexOf('semua') >= 0 || mod.indexOf('ssu') >= 0 || mod.indexOf('profil') >= 0;
    }
    return false;
  }

  /** Konteks pelajar untuk fungsi modul. Identiti audit kekal emel admin. */
  function ctx_(ctx, noMatrik) {
    if (!allowed_(ctx)) throw appError_('TIADA_KEBENARIAN');
    var m = Util.normMatric(noMatrik);
    var pel = Util.isMatric(m) ? Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === m; }) : [];
    if (!pel.length) throw appError_('MATRIK_TIDAK_DITEMUI');
    return { email: ctx.email, role: ctx.role, noMatrik: m, nama: Util.str(pel[0].Nama_Penuh), bagiPihak: true };
  }

  function pelajar_(ctx, p) {
    var c = ctx_(ctx, p.noMatrik);
    var pel = Db.find('PELAJAR', function (r) { return Util.normMatric(r.No_Matrik) === c.noMatrik; })[0];
    var pg = Db.find('Pengguna', function (r) { return Util.normMatric(r.No_Matrik) === c.noMatrik; });
    return {
      pelajar: {
        noMatrik: c.noMatrik, nama: c.nama, emel: Util.str(pel.Emel), fakulti: Util.str(pel.Fakulti), program: Util.str(pel.Program),
        statusPelajar: Util.str(pel.Status_Pelajar), sudahLogMasuk: pg.length > 0
      },
      profil: Profiling.status(c.noMatrik),
      ssu: Ssu.saya(c)
    };
  }

  return { ctx: ctx_, pelajar: pelajar_, allowed: allowed_ };
})();
