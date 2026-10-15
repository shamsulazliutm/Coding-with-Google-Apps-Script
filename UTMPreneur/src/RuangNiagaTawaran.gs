/**
 * SHAMS: Ruang Niaga fasa 3. Surat tawaran (Surat Setuju Terima), pratonton PDF, hantar, penerimaan dengan OTP,
 * rekod penerimaan, tawaran luput, peringatan dan salinan fizikal.
 *
 * Aliran: Diluluskan -> admin isi Tawaran_Sewa (+ Jadual_Sewa) -> jana pratonton (versi) -> hantar (Ditawarkan, lot Dipohon,
 * Cagaran dicipta) -> pemilik "Saya terima"/"Saya tolak" disahkan OTP (Diterima / Ditolak Pemohon) -> rekod penerimaan PDF.
 * Tiada jawapan dalam TAWARAN_TEMPOH_HARI (7) -> Tawaran Luput, lot kembali Kosong.
 */

var RnTawaran = (function () {
  function S(v) { return Util.str(v); }
  function wd_(d) { return RnU.dk(d); }

  function jadualOf_(id, idSewaan) {
    return Db.find('Jadual_Sewa', function (r) { return S(r.ID_Permohonan) === id && S(r.ID_Sewaan) === (idSewaan || ''); })
      .map(function (r) { return { dari: Number(r.Dari_Bulan) || 1, hingga: S(r.Hingga_Bulan) === '' ? '' : Number(r.Hingga_Bulan), kadar: Number(r.Kadar_RM) || 0 }; })
      .sort(function (a, b) { return a.dari - b.dari; });
  }

  /** Bil. bulan kontrak: bilangan bulan penuh terkecil yang meliputi mula hingga tamat. */
  function bilBulan_(mula, tamat) {
    var m = 0;
    while (m < 120 && Util.daysBetween(Util.addMonths(mula, m), tamat) >= 0) m++;
    return m;
  }

  function teksJadual_(jadual) {
    if (!jadual.length) return '';
    if (jadual.length === 1) return RnU.rm(jadual[0].kadar) + ' sebulan';
    return jadual.map(function (j) {
      var julat = j.hingga === '' ? ('Bulan ke-' + j.dari + ' dan ke atas') : (j.dari === j.hingga ? 'Bulan ke-' + j.dari : 'Bulan ke-' + j.dari + ' hingga ke-' + j.hingga);
      return julat + ': ' + RnU.rm(j.kadar);
    }).join('; ');
  }

  function konteks_(r) {
    var per = RnU.perniagaan(S(r.ID_Perniagaan)) || {};
    var ssu = RnU.ssuLulus(S(per.ID_Perniagaan)) || {};
    var lot = RnU.lotById(S(r.Kod_Lot)) || {};
    var m = Util.normMatric(r.No_Matrik);
    var pel = RnU.pelajar(m) || {};
    return { r: r, per: per, ssu: ssu, lot: lot, pel: pel, m: m };
  }

  function alamatPenyewa_(k) {
    return S(k.ssu.Alamat_Perniagaan) || S(k.per.Alamat) || S(k.pel.Alamat_Rumah);
  }

  /** Nilai lalai tawaran daripada permohonan, lot dan Tetapan. */
  function lalai_(k) {
    var lot = k.lot;
    var produk = RnU.split(k.ssu.Produk).map(function (c) { return Ref.bm('PRODUK', c); }).join(', ');
    var mula = RnU.dk(k.r.Tempoh_Mula), tamat = RnU.dk(k.r.Tempoh_Tamat);
    var kadar = S(lot.Kadar_Sewa_RM) === '' ? 0 : Number(lot.Kadar_Sewa_RM);
    return {
      noRujukan: '', tarikhSurat: wd_(new Date()), jenisPerniagaan: produk, tarikhMula: mula, tarikhTamat: tamat,
      utiliti: 'Tanggungjawab syarikat (Air & Elektrik)', cagaranSewaan: kadar, cagaranUtiliti: 0, waktuOperasi: '',
      penandatanganNama: Cfg.get('SURAT_PENANDATANGAN_NAMA', ''), penandatanganJawatan: Cfg.get('SURAT_PENANDATANGAN_JAWATAN', ''),
      jadual: [{ dari: 1, hingga: '', kadar: kadar }]
    };
  }

  function view_(t, jadual) {
    var luput = Util.toDate(t.Tarikh_Luput);
    var tarikhAkhirSalinan = '';
    if (t.Tarikh_Hantar) tarikhAkhirSalinan = RnU.dk(RnU.tambahHari(t.Tarikh_Hantar, Cfg.num('SALINAN_FIZIKAL_HARI', 14)));
    return {
      noRujukan: S(t.No_Rujukan), tarikhSurat: wd_(t.Tarikh_Surat), jenisPerniagaan: S(t.Jenis_Perniagaan), tarikhMula: wd_(t.Tarikh_Mula), tarikhTamat: wd_(t.Tarikh_Tamat),
      bilBulan: Number(t.Bil_Bulan) || 0, sewaBulanan: Number(t.Sewa_Bulanan_RM) || 0, utiliti: S(t.Utiliti), cagaranSewaan: Number(t.Cagaran_Sewaan_RM) || 0,
      cagaranUtiliti: Number(t.Cagaran_Utiliti_RM) || 0, waktuOperasi: S(t.Waktu_Operasi), penandatanganNama: S(t.Penandatangan_Nama),
      penandatanganJawatan: S(t.Penandatangan_Jawatan), versiSemasa: Number(t.Versi_Semasa) || 0, status: S(t.Status), tarikhHantar: wd_(t.Tarikh_Hantar),
      tarikhLuput: luput ? wd_(luput) : '', respons: S(t.Respons), tarikhResponsMasa: t.Tarikh_Respons ? Util.fmtDate(Util.toDate(t.Tarikh_Respons), 'dd/MM/yyyy HH:mm') : '',
      emelRespons: S(t.Emel_Respons), jadual: jadual,
      salinan: {
        tarikh: wd_(t.Salinan_Fizikal_Tarikh), penerima: S(t.Salinan_Fizikal_Penerima), tarikhAkhir: tarikhAkhirSalinan,
        lewat: !!(t.Tarikh_Hantar && !S(t.Salinan_Fizikal_Tarikh) && ['Diterima'].indexOf(S(t.Status)) >= 0 && tarikhAkhirSalinan && Util.daysBetween(new Date(), tarikhAkhirSalinan) < 0)
      }
    };
  }

  // ---------- Admin: isi tawaran ----------
  function dapat_(ctx, p) {
    RnU.requireViewer(ctx);
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var k = konteks_(r);
    var t = RnU.tawaranById(id);
    var out = {
      id: id, statusPermohonan: S(r.Status), ada: !!t,
      tawaran: t ? view_(t, jadualOf_(id)) : Object.assign({ status: '', versiSemasa: 0, bilBulan: 0 }, lalai_(k)),
      dokumen: RnDok.senarai(r, true).filter(function (d) { return d.jenis === 'Surat Tawaran'; }),
      boleh: {
        ubah: S(r.Status) === 'Diluluskan' && (!t || S(t.Status) === 'Draf') && RnU.isDecider(ctx),
        jana: S(r.Status) === 'Diluluskan' && !!t && S(t.Status) === 'Draf' && RnU.isDecider(ctx),
        hantar: S(r.Status) === 'Diluluskan' && !!t && S(t.Status) === 'Draf' && !!Number(t.Versi_Semasa) && RnU.isDecider(ctx)
      },
      alamatPenyewa: alamatPenyewa_(k), lot: { kod: S(k.lot.Kod_Lot), nama: RnU.namaLot(k.lot), alamat: RnU.alamatLot(k.lot), status: S(k.lot.Status_Lot) }
    };
    if (!out.tawaran.bilBulan && out.tawaran.tarikhMula && out.tawaran.tarikhTamat) out.tawaran.bilBulan = bilBulan_(out.tawaran.tarikhMula, out.tawaran.tarikhTamat);
    return out;
  }

  function semakJadual_(arr, e) {
    var out = [];
    arr = Array.isArray(arr) ? arr : [];
    if (!arr.length) { e.jadual = 'Sekurang-kurangnya satu peringkat sewa / At least one rent tier'; return out; }
    var prevHingga = 0;
    arr.forEach(function (x, i) {
      var dari = parseInt(x.dari, 10), hingga = S(x.hingga) === '' ? '' : parseInt(x.hingga, 10), kadar = Util.parseRm(x.kadar);
      if (isNaN(dari) || dari < 1 || kadar === null || (hingga !== '' && (isNaN(hingga) || hingga < dari))) { e.jadual = 'Jadual sewa tidak sah (bulan dan kadar RM) / Invalid rent schedule'; return; }
      if (dari !== prevHingga + 1) { e.jadual = 'Peringkat mesti bersambung tanpa jurang: bermula bulan 1 / Tiers must be contiguous starting at month 1'; return; }
      if (hingga === '' && i < arr.length - 1) { e.jadual = 'Hanya peringkat terakhir boleh terbuka (tiada "hingga") / Only the last tier may be open-ended'; return; }
      prevHingga = hingga === '' ? dari : hingga;
      out.push({ dari: dari, hingga: hingga, kadar: kadar });
    });
    return out;
  }

  function simpan_(ctx, p) {
    RnU.requireDecider(ctx);
    p = p || {};
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var cur = RnU.tawaranById(id);
    if (S(r.Status) !== 'Diluluskan' || (cur && S(cur.Status) !== 'Draf')) throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    var e = {}, bad = function (k, msg) { e[k] = msg || 'Wajib diisi / Required'; };
    var noRujukan = S(p.noRujukan).replace(/\s+/g, ' ').substr(0, 100);
    if (!noRujukan) bad('noRujukan');
    var tarikhSurat = S(p.tarikhSurat); if (!RnU.isDate(tarikhSurat)) bad('tarikhSurat', 'Tarikh tidak sah / Invalid date');
    var jenis = S(p.jenisPerniagaan).substr(0, 200); if (!jenis) bad('jenisPerniagaan');
    var mula = S(p.tarikhMula), tamat = S(p.tarikhTamat);
    if (!RnU.isDate(mula)) bad('tarikhMula', 'Tarikh tidak sah / Invalid date');
    if (!RnU.isDate(tamat)) bad('tarikhTamat', 'Tarikh tidak sah / Invalid date');
    else if (!e.tarikhMula && Util.daysBetween(Util.toDate(mula), Util.toDate(tamat)) <= 0) bad('tarikhTamat', 'Tarikh tamat mesti selepas tarikh mula / End date must be after start date');
    var utiliti = S(p.utiliti).substr(0, 200); if (!utiliti) bad('utiliti');
    var cs = S(p.cagaranSewaan) === '' ? 0 : Util.parseRm(p.cagaranSewaan);
    var cu = S(p.cagaranUtiliti) === '' ? 0 : Util.parseRm(p.cagaranUtiliti);
    if (cs === null) bad('cagaranSewaan', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    if (cu === null) bad('cagaranUtiliti', 'Masukkan nilai RM yang tepat / Enter an exact RM value');
    var waktu = S(p.waktuOperasi).substr(0, 100); if (!waktu) bad('waktuOperasi');
    var jadual = semakJadual_(p.jadual, e);
    var nama = S(p.penandatanganNama) || Cfg.get('SURAT_PENANDATANGAN_NAMA', '');
    var jawatan = S(p.penandatanganJawatan) || Cfg.get('SURAT_PENANDATANGAN_JAWATAN', '');
    if (!nama || !jawatan) bad('penandatanganNama', 'Isi nama dan jawatan penandatangan (atau tetapkan dalam Tetapan) / Signatory required');
    if (Object.keys(e).length) throw appError_('RN_TAWARAN_TIDAK_SAH', { medan: e });
    var rec = {
      ID_Permohonan: id, No_Rujukan: noRujukan, Tarikh_Surat: Util.toDate(tarikhSurat), Jenis_Perniagaan: jenis, Tarikh_Mula: Util.toDate(mula), Tarikh_Tamat: Util.toDate(tamat),
      Bil_Bulan: bilBulan_(mula, tamat), Sewa_Bulanan_RM: jadual[0].kadar, Utiliti: utiliti, Cagaran_Sewaan_RM: cs, Cagaran_Utiliti_RM: cu, Waktu_Operasi: waktu,
      Penandatangan_Nama: nama, Penandatangan_Jawatan: jawatan, Versi_Semasa: '', Status: 'Draf'
    };
    Db.withLock(function () {
      var c2 = RnU.tawaranById(id);
      if (c2) Db.update('Tawaran_Sewa', c2._row, rec); else Db.append('Tawaran_Sewa', rec);
      RnU.gantiBaris('Jadual_Sewa', function (x) { return S(x.ID_Permohonan) === id && S(x.ID_Sewaan) === ''; }, jadual.map(function (j) {
        return { ID_Permohonan: id, ID_Sewaan: '', Dari_Bulan: j.dari, Hingga_Bulan: j.hingga, Kadar_RM: j.kadar };
      }));
      Audit.log(ctx, 'SIMPAN_TAWARAN_SEWA', 'Ruang Niaga', id, c2 ? S(c2.No_Rujukan) : '', noRujukan, 'Pratonton perlu dijana semula');
    });
    return dapat_(ctx, { id: id });
  }

  // ---------- Kandungan surat ----------
  function dataSurat_(k, t, jadual) {
    var tempohHari = Cfg.num('TAWARAN_TEMPOH_HARI', 7);
    var hantar = t.Tarikh_Hantar ? RnU.tambahHari(t.Tarikh_Hantar, 0) : RnU.today();
    var luput = t.Tarikh_Luput ? Util.toDate(t.Tarikh_Luput) : RnU.tambahHari(hantar, tempohHari);
    var cs = Number(t.Cagaran_Sewaan_RM) || 0, cu = Number(t.Cagaran_Utiliti_RM) || 0;
    var bayarHari = Cfg.num('CAGARAN_BAYAR_HARI', 14);
    var salinanHari = Cfg.num('SALINAN_FIZIKAL_HARI', 14);
    var mula = RnU.dk(t.Tarikh_Mula), tamat = RnU.dk(t.Tarikh_Tamat);
    return {
      no_rujukan: S(t.No_Rujukan), tarikh_surat: Util.fmtTarikhBM(t.Tarikh_Surat), id_permohonan: S(k.r.ID_Permohonan),
      nama_perniagaan: S(k.per.Nama_Perniagaan), nama_wakil: S(k.pel.Nama_Penuh), no_matrik: k.m, no_telefon: S(k.pel.No_Telefon), alamat_penyewa: alamatPenyewa_(k),
      no_ssm: S(k.ssu.No_SSM), nama_lot: RnU.namaLot(k.lot), kod_lot: S(k.lot.Kod_Lot), alamat_lot: RnU.alamatLot(k.lot), jenis_perniagaan: S(t.Jenis_Perniagaan),
      tarikh_mula: Util.fmtTarikhBM(mula), tarikh_tamat: Util.fmtTarikhBM(tamat), bil_bulan: String(Number(t.Bil_Bulan) || ''),
      tempoh_kontrak: Util.fmtTarikhBM(mula) + ' hingga ' + Util.fmtTarikhBM(tamat) + ' (' + (Number(t.Bil_Bulan) || '') + ' bulan)',
      sewa_bulanan: RnU.rm(Number(t.Sewa_Bulanan_RM) || 0), jadual_sewa: teksJadual_(jadual), utiliti: S(t.Utiliti),
      cagaran_sewaan: cs > 0 ? RnU.rm(cs) : 'Tiada', cagaran_utiliti: cu > 0 ? RnU.rm(cu) : 'Tiada', waktu_operasi: S(t.Waktu_Operasi),
      tarikh_luput: Util.fmtTarikhBM(luput), tempoh_terima_hari: String(tempohHari), hari_bayar_cagaran: String(bayarHari),
      tarikh_akhir_cagaran: Util.fmtTarikhBM(RnU.tambahHari(hantar, bayarHari)), hari_salinan_fizikal: String(salinanHari),
      akaun_bank: Cfg.get('AKAUN_BANK_UTM', ''), penandatangan_nama: S(t.Penandatangan_Nama), penandatangan_jawatan: S(t.Penandatangan_Jawatan),
      alamat_utmxcite: Cfg.get('ALAMAT_UTMXCITE', ''), hari_tahun: ''
    };
  }

  /** Surat tawaran lalai (HTML, BM) berdasarkan Surat Setuju Terima UTMXCITE. */
  function htmlSurat_(d, tajuk) {
    var e = Pdf.esc;
    var p = function (t) { return '<p>' + t + '</p>'; };
    var row = function (a, b, c) { return '<tr><td style="width:6%">' + a + '</td><td style="width:28%">' + e(b) + '</td><td>' + e(c) + '</td></tr>'; };
    var cagUtil = d.cagaran_utiliti;
    var h = '';
    h += '<table class="nb"><tr><td>Ruj. Kami : ' + e(d.no_rujukan) + '</td><td class="r">Tarikh : ' + e(d.tarikh_surat) + '</td></tr></table>';
    h += '<h1>SURAT SETUJU TERIMA</h1>';
    h += '<p><b>' + e(d.nama_perniagaan) + '</b><br>' + e(d.alamat_penyewa) + '<br>(u.p: ' + e(d.nama_wakil) + (d.no_telefon ? ', Tel: ' + e(d.no_telefon) : '') + ')</p>';
    h += p('Saudara,');
    h += '<p><b>PENYEWAAN ' + e(d.alamat_lot).toUpperCase() + '</b></p>';
    h += p('Dengan hormatnya dimaklumkan bahawa pihak pengurusan Student Mall (UTMXCITE) bersetuju melantik pihak Saudara bagi tujuan Penyewaan ' + e(d.alamat_lot) + '.');
    h += p('2. Dengan penerimaan tawaran ini, pihak Saudara adalah dinasihatkan bahawa suatu ikatan kontrak terwujud antara pihak UTM dengan pihak Saudara. Surat Setuju Terima ini dan satu Dokumen Perjanjian yang akan ditandatangani selepas ini akan menjadi dokumen yang akan mengikat di antara pihak Saudara dan UTM dengan sah. Sebarang urusan ataupun tuntutan perlu berpandukan dokumen ini.');
    h += p('3. Butiran dan syarat yang ditawarkan adalah seperti berikut:');
    h += '<table class="nb">' +
      row('a.', 'Lokasi', ': ' + d.alamat_lot) + row('b.', 'Jenis Perniagaan', ': ' + d.jenis_perniagaan) + row('c.', 'Tempoh Kontrak', ': ' + d.tempoh_kontrak) +
      row('d.', 'Sewaan Bulanan', ': ' + d.jadual_sewa) + row('e.', 'Utiliti', ': ' + d.utiliti) + row('f.', 'Cagaran Sewaan', ': ' + d.cagaran_sewaan) +
      row('g.', 'Cagaran Utiliti', ': ' + cagUtil) + row('h.', 'Waktu Operasi', ': ' + d.waktu_operasi) + '</table>';
    h += p('4. Wang cagaran sewaan' + (cagUtil !== 'Tiada' ? ' dan cagaran utiliti' : '') + ' boleh dibayar secara deposit tunai atau kredit ke bank (&ldquo;interbank transfer&rdquo;) ke akaun bank rasmi Universiti iaitu ' + e(d.akaun_bank) + ' atau PayHub. Salinan ASAL resit akan dikeluarkan oleh Jabatan Bendahari UTM dan hendaklah dikemukakan sebagai bukti dan untuk simpanan pejabat ini. Kegagalan pihak Saudara untuk menjelaskan kesemua bayaran tersebut dalam masa ' + e(d.hari_bayar_cagaran) + ' hari dari tarikh surat ini dihantar (selewat-lewatnya ' + e(d.tarikh_akhir_cagaran) + ') akan menyebabkan pelantikan pihak Saudara dibatalkan.');
    h += p('5. UTM berhak merampas kesemua atau sebahagian wang cagaran sebagai ganti rugi kepada UTM oleh sebab kemungkiran atau pelanggaran mana-mana syarat dan peraturan yang ditetapkan UTM oleh pihak Saudara. Wang cagaran akan dikembalikan kepada pihak Saudara dalam masa sembilan puluh (90) hari selepas tamat tempoh kontrak tertakluk kepada penyempurnaan syarat dan peraturan kontrak oleh pihak Saudara.');
    h += p('6. Bagi tujuan pembayaran sewa bulanan, pihak Saudara dikehendaki membuat pembayaran melalui deposit tunai atau kredit ke bank (&ldquo;interbank transfer&rdquo;) ke akaun bank rasmi Universiti iaitu ' + e(d.akaun_bank) + '; atau PayHub UTM.');
    h += p('7. Kesemua transaksi pembayaran adalah dianggap sempurna dan selesai setelah Resit Rasmi dikeluarkan oleh Jabatan Bendahari UTM. Salinan resit hendaklah dimajukan kepada UTMXCITE, Jabatan Timbalan Naib Canselor (Hal Ehwal Pelajar dan Alumni) bagi tujuan bukti dan perekodan.');
    h += p('8. Tiada apa-apa urusniaga boleh dimulakan kecuali dan sehingga Saudara telah mengemukakan wang cagaran sewaan.');
    h += p('9. Pihak UTM juga berhak menamatkan penyewaan Saudara pada bila-bila masa sekiranya prestasi tidak memuaskan atau melanggar mana-mana syarat yang ditetapkan oleh Universiti dan juga pihak berkuasa.');
    h += p('10. Lain-lain syarat adalah sebagaimana yang akan dipersetujui seperti di dalam Syarat / Prosedur UTMXCITE dan akan dimuktamadkan melalui Dokumen Perjanjian yang akan disempurnakan.');
    h += p('11. Tawaran ini hendaklah diterima atau ditolak dalam sistem SHAMS (disahkan dengan kod OTP) selewat-lewatnya pada ' + e(d.tarikh_luput) + ' (' + e(d.tempoh_terima_hari) + ' hari dari tarikh surat ini dihantar). Kegagalan berbuat demikian akan menyebabkan tawaran ini terbatal secara automatik. Di samping itu, sila kembalikan dua (2) salinan surat ini, termasuk satu yang ASAL, yang telah ditandatangani oleh Saudara dan disaksikan dengan sempurnanya ke pejabat ini dalam masa ' + e(d.hari_salinan_fizikal) + ' hari dari tarikh surat ini dihantar, dan satu (1) salinan untuk simpanan Saudara.');
    h += p('Kerjasama yang diberikan amatlah kami hargai.');
    h += p('Sekian, terima kasih.');
    h += p('&ldquo;Malaysia Madani&rdquo;<br>&quot;Berkhidmat untuk Negara kerana Allah&quot;');
    h += '<p class="sig">Saya yang menjalankan amanah,</p><p><b>(' + e(d.penandatangan_nama) + ')</b><br>' + e(d.penandatangan_jawatan) + '<br>Universiti Teknologi Malaysia<br>b.p. Naib Canselor</p>';
    h += '<hr><p class="sm">Dengan ini yang bertandatangan di bawah ini mengaku penerimaan surat di atas dan salinannya telah disimpan serta memahami dan bersetuju untuk mematuhi syarat-syarat penyewaan sebagaimana dalam Surat Setuju Terima di atas.</p>';
    h += '<table class="nb sig"><tr><td>.......................................<br>Tandatangan Penyewa<br>Nama Penuh: ' + e(d.nama_wakil.toUpperCase()) + '<br>Tarikh:</td><td>.......................................<br>Tandatangan Saksi<br>Nama Penuh:<br>Tarikh:</td><td>.......................................<br>Cop Rasmi Syarikat</td></tr></table>';
    return Pdf.wrap(h, tajuk);
  }

  /** Jana PDF surat (templat Google Docs jika didaftar dan boleh dibuka; jika tidak, surat lalai). Pulang {url, amaran[]}. */
  function janaPdf_(data, nama) {
    var amaran = [];
    var tpl = Db.links().TEMPLAT_SURAT_TAWARAN;
    if (tpl && tpl.id) {
      try {
        var g = DocTpl.jana('TEMPLAT_SURAT_TAWARAN', data, 'FLD_LAMPIRAN_LOT', nama);
        return { url: g.url, amaran: g.amaran || [] };
      } catch (err) {
        amaran.push('Templat surat tawaran (Google Docs) tidak boleh dibuka; surat lalai digunakan.');
        console.error('Templat surat tawaran gagal: ' + err);
      }
    }
    var res = Pdf.dariHtml(htmlSurat_(data, nama), nama, 'FLD_LAMPIRAN_LOT');
    return { url: res.url, amaran: amaran };
  }

  function jana_(ctx, p) {
    RnU.requireDecider(ctx);
    var r = RnU.perById(S(p.id));
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    var id = S(r.ID_Permohonan);
    var t = RnU.tawaranById(id);
    if (S(r.Status) !== 'Diluluskan' || !t || S(t.Status) !== 'Draf') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    var k = konteks_(r);
    var data = dataSurat_(k, t, jadualOf_(id));
    var versi = RnDok.versiSeterusnya(id, 'Surat Tawaran');
    var nama = 'Surat Tawaran ' + id + ' v' + versi;
    var res = janaPdf_(data, nama);
    Db.withLock(function () {
      var cur = RnU.tawaranById(id);
      if (!cur || S(cur.Status) !== 'Draf') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      RnDok.semua(id).forEach(function (d) {
        if (S(d.Jenis) === 'Surat Tawaran' && S(d.Status) === 'Pratonton') Db.update('Dokumen_Sewaan', d._row, { Status: 'Digantikan' });
      });
      RnDok.tambahLocked({
        ID_Permohonan: id, Jenis: 'Surat Tawaran', Versi: versi, Tajuk: 'Surat Tawaran', Fail: res.url, Nama_Fail: nama + '.pdf', Dijana_Oleh: ctx.email,
        Status: 'Pratonton', Kelihatan: 'Tidak', Catatan: res.amaran.join('; ')
      });
      Db.update('Tawaran_Sewa', cur._row, { Versi_Semasa: versi });
      Audit.log(ctx, 'JANA_PRATONTON_TAWARAN', 'Ruang Niaga', id, '', 'v' + versi, res.amaran.join('; '));
    });
    var out = dapat_(ctx, { id: id });
    out.amaran = res.amaran;
    return out;
  }

  function hantar_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id);
    var lot = null;
    var info = Db.withLock(function () {
      var r = RnU.perById(id);
      if (!r) throw appError_('RN_TIDAK_DITEMUI');
      var t = RnU.tawaranById(id);
      if (S(r.Status) !== 'Diluluskan' || !t || S(t.Status) !== 'Draf') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      if (!Number(t.Versi_Semasa)) throw appError_('RN_TAWARAN_BELUM_JANA');
      lot = RnU.lotById(S(r.Kod_Lot));
      if (!lot || S(lot.Status_Lot) !== 'Kosong') throw appError_('RN_LOT_TIDAK_KOSONG');
      var now = new Date();
      var hariTerima = Cfg.num('TAWARAN_TEMPOH_HARI', 7);
      var luput = RnU.tambahHari(now, hariTerima);
      var akhirBayar = RnU.tambahHari(now, Cfg.num('CAGARAN_BAYAR_HARI', 14));
      Db.update('Tawaran_Sewa', t._row, { Status: 'Dihantar', Tarikh_Hantar: now, Tarikh_Luput: luput });
      RnDok.semua(id).forEach(function (d) {
        if (S(d.Jenis) === 'Surat Tawaran' && Number(d.Versi) === Number(t.Versi_Semasa)) Db.update('Dokumen_Sewaan', d._row, { Status: 'Dihantar', Kelihatan: 'Ya', Tarikh: now });
      });
      Db.update('Permohonan_Lot', r._row, { Status: 'Ditawarkan' });
      RnU.setLot(S(r.Kod_Lot), 'Dipohon');
      [['Sewaan', Number(t.Cagaran_Sewaan_RM) || 0], ['Utiliti', Number(t.Cagaran_Utiliti_RM) || 0]].forEach(function (c) {
        if (c[1] <= 0) return;
        Db.append('Cagaran', {
          ID_Cagaran: Util.formatId('CGR', null, Db.nextSeqLocked('CGR'), 4), ID_Permohonan: id, ID_Perniagaan: S(r.ID_Perniagaan), Jenis: c[0], Jumlah_RM: c[1],
          Tarikh_Akhir_Bayar: akhirBayar, Status: 'Belum Bayar'
        });
      });
      Audit.log(ctx, 'HANTAR_TAWARAN_SEWA', 'Ruang Niaga', id, 'Diluluskan', 'Ditawarkan', S(t.No_Rujukan) + ' | luput ' + RnU.dk(luput));
      return { m: Util.normMatric(r.No_Matrik), luput: luput, akhirBayar: akhirBayar, nama: RnU.namaLot(lot) };
    });
    RnU.mel(RnU.emelOf(info.m), 'Surat tawaran sewa lot', 'Lot tenancy offer letter',
      ['Surat tawaran sewa ' + info.nama + ' (' + id + ') telah dihantar. Sila lihat dan muat turun surat dalam SHAMS, kemudian terima atau tolak tawaran dengan kod OTP selewat-lewatnya ' + Util.fmtTarikhBM(info.luput) + '. Bayaran cagaran hendaklah dijelaskan sebelum ' + Util.fmtTarikhBM(info.akhirBayar) + '.'],
      ['The tenancy offer letter for ' + info.nama + ' (' + id + ') has been sent. View and download it in SHAMS, then accept or decline with an OTP by ' + RnU.dk(info.luput) + '. The deposit must be paid by ' + RnU.dk(info.akhirBayar) + '.']);
    return dapat_(ctx, { id: id });
  }

  // ---------- Pemohon: lihat tawaran, OTP, jawab ----------
  function untukPemohon_(ctx, r) {
    var t = RnU.tawaranById(S(r.ID_Permohonan));
    if (!t || ['Dihantar', 'Diterima', 'Ditolak', 'Luput', 'Dibatalkan'].indexOf(S(t.Status)) < 0 || !t.Tarikh_Hantar) return null;
    var v = view_(t, jadualOf_(S(r.ID_Permohonan)));
    var luput = Util.toDate(t.Tarikh_Luput);
    var baki = luput ? Util.daysBetween(new Date(), luput) : null;
    var pemilik = RnU.akses(ctx, r) === 'pemilik';
    delete v.salinan.penerima;
    v.alamatLot = RnU.alamatLot(RnU.lotById(S(r.Kod_Lot)) || {});
    v.hariBaki = baki;
    v.bolehJawab = pemilik && S(t.Status) === 'Dihantar' && S(r.Status) === 'Ditawarkan' && baki !== null && baki >= 0;
    return v;
  }

  function emelPemohon_(r) { return RnU.emelOf(Util.normMatric(r.No_Matrik)); }

  function otpMinta_(ctx, p) {
    var id = S(p.id);
    var r = RnU.perById(id);
    if (!r) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r);
    semakLuput_(id);
    var v = untukPemohon_(ctx, RnU.perById(id));
    if (!v || !v.bolehJawab) throw appError_(v && v.status === 'Luput' ? 'RN_TAWARAN_LUPUT' : 'RN_TAWARAN_TIDAK_BOLEH');
    var emel = emelPemohon_(r);
    if (!emel) throw appError_('EMEL_TIDAK_SAH');
    var res = Otp.issue('TERIMA_TAWARAN:' + id, emel, {
      subjectBm: 'Kod pengesahan jawapan tawaran sewa lot', subjectEn: 'Verification code for your lot offer response',
      bm: ['Kod pengesahan anda untuk menerima atau menolak tawaran sewa lot (' + id + ') ialah: {kod}', 'Kod ini sah selama ' + Cfg.num('OTP_TAMAT_MINIT', 5) + ' minit. Jangan kongsikannya dengan sesiapa.'],
      en: ['Your verification code to accept or decline the lot offer (' + id + ') is: {kod}', 'This code is valid for ' + Cfg.num('OTP_TAMAT_MINIT', 5) + ' minutes. Do not share it.']
    });
    res.emelTopeng = emel.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    return res;
  }

  function jawab_(ctx, p) {
    var id = S(p.id), jawapan = S(p.jawapan);
    if (['terima', 'tolak'].indexOf(jawapan) < 0) throw appError_('RN_PERALIHAN_TIDAK_SAH');
    var r0 = RnU.perById(id);
    if (!r0) throw appError_('RN_TIDAK_DITEMUI');
    RnU.requireOwner(ctx, r0);
    semakLuput_(id);
    var v0 = untukPemohon_(ctx, RnU.perById(id));
    if (!v0 || !v0.bolehJawab) throw appError_(v0 && v0.status === 'Luput' ? 'RN_TAWARAN_LUPUT' : 'RN_TAWARAN_TIDAK_BOLEH');
    var emel = emelPemohon_(r0);
    if (!S(p.kod)) throw appError_('RN_OTP_PERLU');
    Otp.verify('TERIMA_TAWARAN:' + id, emel, p.kod);
    var now = new Date();
    var info = Db.withLock(function () {
      var r = RnU.perById(id), t = RnU.tawaranById(id);
      if (!r || !t || S(r.Status) !== 'Ditawarkan' || S(t.Status) !== 'Dihantar') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      var terima = jawapan === 'terima';
      Db.update('Tawaran_Sewa', t._row, { Status: terima ? 'Diterima' : 'Ditolak', Respons: terima ? 'Terima' : 'Tolak', Tarikh_Respons: now, Emel_Respons: emel });
      if (terima) Db.update('Permohonan_Lot', r._row, { Status: 'Diterima' });
      else {
        Db.update('Permohonan_Lot', r._row, { Status: 'Ditolak Pemohon', Tarikh_Keputusan: now });
        RnU.setLot(S(r.Kod_Lot), 'Kosong');
        Db.find('Cagaran', function (c) { return S(c.ID_Permohonan) === id && ['Belum Bayar', 'Menunggu Pengesahan'].indexOf(S(c.Status)) >= 0; })
          .forEach(function (c) { Db.update('Cagaran', c._row, { Status: 'Dibatalkan' }); });
      }
      Audit.log(ctx, terima ? 'TERIMA_TAWARAN_SEWA' : 'TOLAK_TAWARAN_SEWA', 'Ruang Niaga', id, 'Ditawarkan', terima ? 'Diterima' : 'Ditolak Pemohon',
        'Disahkan OTP ke ' + emel + (ctx.bagiPihak ? ' (admin bagi pihak pemohon)' : ''));
      return { nama: RnU.namaLot(RnU.lotById(S(r.Kod_Lot))), no: S(t.No_Rujukan) };
    });
    var amaran = [];
    try { janaRekod_(id, jawapan, now, emel, ctx); } catch (err) {
      console.error('Rekod penerimaan gagal: ' + err);
      amaran.push('Rekod penerimaan (PDF) gagal dijana; admin akan menjana semula.');
      Audit.log(ctx, 'REKOD_PENERIMAAN_GAGAL', 'Ruang Niaga', id, '', '', String(err && err.message ? err.message : err).substr(0, 300));
    }
    RnU.mel(emel, jawapan === 'terima' ? 'Tawaran sewa lot diterima' : 'Tawaran sewa lot ditolak', jawapan === 'terima' ? 'Lot offer accepted' : 'Lot offer declined',
      [jawapan === 'terima'
        ? 'Anda telah menerima tawaran sewa ' + info.nama + ' (' + id + ') pada ' + Util.fmtDate(now, 'dd/MM/yyyy HH:mm') + '. Sila bayar cagaran dan tunggu perjanjian sewa daripada UTMXCITE.'
        : 'Anda telah menolak tawaran sewa ' + info.nama + ' (' + id + ') pada ' + Util.fmtDate(now, 'dd/MM/yyyy HH:mm') + '.'],
      [jawapan === 'terima' ? 'You accepted the tenancy offer for ' + info.nama + ' (' + id + ').' : 'You declined the tenancy offer for ' + info.nama + ' (' + id + ').']);
    RnU.melAdmin(jawapan === 'terima' ? 'Tawaran sewa lot diterima' : 'Tawaran sewa lot ditolak pemohon', 'Lot offer ' + (jawapan === 'terima' ? 'accepted' : 'declined'),
      ['Pemohon ' + id + ' telah ' + (jawapan === 'terima' ? 'menerima' : 'menolak') + ' tawaran sewa ' + info.nama + '.'], ['Applicant ' + id + ' has ' + (jawapan === 'terima' ? 'accepted' : 'declined') + ' the offer.']);
    return { id: id, status: jawapan === 'terima' ? 'Diterima' : 'Ditolak Pemohon', amaran: amaran };
  }

  /** Jana Rekod Penerimaan (PDF) dan simpan dalam Dokumen_Sewaan. */
  function janaRekod_(id, jawapan, masa, emel, ctx) {
    var r = RnU.perById(id), t = RnU.tawaranById(id);
    var k = konteks_(r);
    var terima = jawapan === 'terima';
    var e = Pdf.esc;
    var tajuk = terima ? 'Rekod Penerimaan Tawaran' : 'Rekod Penolakan Tawaran';
    var versi = RnDok.versiSeterusnya(id, 'Penerimaan');
    var nama = tajuk + ' ' + id + (versi > 1 ? ' v' + versi : '');
    var tm = Util.fmtDate(masa, 'dd/MM/yyyy HH:mm');
    var h = '<h1>' + e(tajuk.toUpperCase()) + '</h1>' +
      '<p>Dokumen ini merekodkan bahawa tawaran sewa lot berikut telah <b>' + (terima ? 'DITERIMA' : 'DITOLAK') + '</b> oleh pemohon secara elektronik melalui sistem SHAMS.</p>' +
      '<table><tr><td>ID permohonan</td><td>' + e(id) + '</td></tr><tr><td>No. rujukan surat tawaran</td><td>' + e(S(t.No_Rujukan)) + '</td></tr>' +
      '<tr><td>Perniagaan</td><td>' + e(S(k.per.Nama_Perniagaan)) + '</td></tr><tr><td>Pemohon</td><td>' + e(S(k.pel.Nama_Penuh)) + ' (' + e(k.m) + ')</td></tr>' +
      '<tr><td>Lot</td><td>' + e(RnU.alamatLot(k.lot)) + '</td></tr><tr><td>Tempoh kontrak</td><td>' + e(Util.fmtTarikhBM(t.Tarikh_Mula) + ' hingga ' + Util.fmtTarikhBM(t.Tarikh_Tamat)) + '</td></tr>' +
      '<tr><td>Tarikh dan masa ' + (terima ? 'penerimaan' : 'penolakan') + '</td><td>' + e(tm) + '</td></tr><tr><td>Emel pengesahan</td><td>' + e(emel) + '</td></tr>' +
      '<tr><td>Kaedah pengesahan</td><td>Kod OTP dihantar ke emel pemohon' + (ctx && ctx.bagiPihak ? ' (dikendalikan oleh admin bagi pihak pemohon)' : '') + '</td></tr></table>' +
      '<p class="sm">Rekod ini dijana secara automatik oleh sistem dan sah tanpa tandatangan. Penerimaan tidak boleh ditarik balik oleh pemohon.</p>';
    var res = Pdf.dariHtml(Pdf.wrap(h, nama), nama, 'FLD_LAMPIRAN_LOT');
    Db.withLock(function () {
      RnDok.tambahLocked({
        ID_Permohonan: id, Jenis: 'Penerimaan', Versi: versi, Tajuk: tajuk, Fail: res.url, Nama_Fail: nama + '.pdf', Tarikh: masa, Dijana_Oleh: 'sistem',
        Status: 'Rekod', Kelihatan: 'Ya', Catatan: tm
      });
    });
  }

  /** Admin menjana semula rekod penerimaan jika gagal dijana. */
  function rekodSemula_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id);
    var t = RnU.tawaranById(id);
    if (!t || ['Diterima', 'Ditolak'].indexOf(S(t.Status)) < 0) throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    if (RnDok.semua(id).some(function (d) { return S(d.Jenis) === 'Penerimaan'; })) throw appError_('RN_TAWARAN_TIDAK_BOLEH');
    janaRekod_(id, S(t.Respons) === 'Terima' ? 'terima' : 'tolak', Util.toDate(t.Tarikh_Respons), S(t.Emel_Respons), ctx);
    Audit.log(ctx, 'JANA_SEMULA_REKOD_PENERIMAAN', 'Ruang Niaga', id, '', '', '');
    return dapat_(ctx, { id: id });
  }

  // ---------- Luput, peringatan, salinan fizikal ----------
  /** Tandakan Tawaran Luput jika tarikh luput telah lalu dan pemohon belum menjawab. Pulang true jika diluputkan. */
  function semakLuput_(id) {
    var r = RnU.perById(id), t = RnU.tawaranById(id);
    if (!r || !t || S(t.Status) !== 'Dihantar' || S(r.Status) !== 'Ditawarkan' || !t.Tarikh_Luput) return false;
    if (Util.daysBetween(new Date(), t.Tarikh_Luput) >= 0) return false;
    var nama = '';
    Db.withLock(function () {
      var r2 = RnU.perById(id);
      if (!r2 || S(r2.Status) !== 'Ditawarkan') return;
      nama = RnU.namaLot(RnU.lotById(S(r2.Kod_Lot)));
      RnPer.lepas(r2, 'Tawaran Luput', 'Tawaran luput tanpa jawapan', RnU.sys());
      Audit.log(RnU.sys(), 'TAWARAN_LUPUT', 'Ruang Niaga', id, 'Ditawarkan', 'Tawaran Luput', RnU.dk(t.Tarikh_Luput));
    });
    RnU.mel(RnU.emelOf(Util.normMatric(r.No_Matrik)), 'Tawaran sewa lot telah luput', 'Your lot offer has expired',
      ['Tawaran sewa ' + nama + ' (' + id + ') telah luput kerana tiada jawapan dalam tempoh yang ditetapkan.'], ['The tenancy offer for ' + nama + ' (' + id + ') has expired because no response was received in time.']);
    RnU.melAdmin('Tawaran sewa lot luput', 'Lot offer expired',
      ['Tawaran ' + id + ' (' + nama + ') telah luput tanpa jawapan. Lot kembali Kosong; anda boleh menawarkan kepada pemohon seterusnya mengikut kedudukan.'],
      ['Offer ' + id + ' expired without a response. The lot is vacant again.']);
    return true;
  }

  function peringatanBertingkat_(log, awalan, id, hari, ambang, hantar) {
    var due = ambang.filter(function (a) { return hari >= a; });
    if (!due.length) return 0;
    var tertinggi = due[due.length - 1], n = 0;
    due.forEach(function (a) {
      var key = awalan + id + '_' + a;
      if (log.ada(key)) return;
      if (a === tertinggi) { hantar(a); n++; }
      log.tambah(key, '-', id, 'hari ' + hari);
    });
    return n;
  }
  function ambang_(key) {
    return Cfg.list(key).map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
  }

  function jobHarian_() {
    var hasil = { luput: 0, peringatanTawaran: 0, peringatanSalinan: 0, salinanLewat: 0 };
    var log = RnU.peringatan();
    Db.rows('Tawaran_Sewa').forEach(function (t) {
      var id = S(t.ID_Permohonan);
      var r = RnU.perById(id);
      if (!r || !t.Tarikh_Hantar) return;
      var hari = Util.daysBetween(t.Tarikh_Hantar, new Date());
      var emel = RnU.emelOf(Util.normMatric(r.No_Matrik));
      var nama = RnU.namaLot(RnU.lotById(S(r.Kod_Lot)));
      if (S(t.Status) === 'Dihantar' && S(r.Status) === 'Ditawarkan') {
        if (semakLuput_(id)) { hasil.luput++; return; }
        hasil.peringatanTawaran += peringatanBertingkat_(log, 'RN_TAWARAN_H', id, hari, ambang_('TAWARAN_PERINGATAN_HARI'), function (a) {
          RnU.mel(emel, 'Peringatan: tawaran sewa lot belum dijawab', 'Reminder: lot offer not yet answered',
            ['Tawaran sewa ' + nama + ' (' + id + ') akan luput pada ' + Util.fmtTarikhBM(t.Tarikh_Luput) + '. Sila terima atau tolak tawaran dalam SHAMS.'],
            ['Your tenancy offer for ' + nama + ' (' + id + ') expires on ' + RnU.dk(t.Tarikh_Luput) + '. Please accept or decline in SHAMS.']);
        });
      }
      // salinan fizikal Surat Setuju Terima
      if (S(t.Status) === 'Diterima' && !S(t.Salinan_Fizikal_Tarikh) && ['Diterima', 'Perjanjian', 'Sewaan Aktif'].indexOf(S(r.Status)) >= 0) {
        var maks = Cfg.num('SALINAN_FIZIKAL_HARI', 14);
        if (hari <= maks) {
          hasil.peringatanSalinan += peringatanBertingkat_(log, 'RN_SALINAN_H', id, hari, ambang_('SALINAN_FIZIKAL_PERINGATAN_HARI'), function () {
            RnU.mel(emel, 'Peringatan: pulangkan salinan fizikal Surat Setuju Terima', 'Reminder: return the signed Letter of Acceptance',
              ['Sila pulangkan dua (2) salinan Surat Setuju Terima (' + id + ') yang telah ditandatangani dan disaksikan ke pejabat UTMXCITE selewat-lewatnya ' + Util.fmtTarikhBM(RnU.tambahHari(t.Tarikh_Hantar, maks)) + '.'],
              ['Please return two (2) signed and witnessed copies of the Letter of Acceptance (' + id + ') to the UTMXCITE office.']);
          });
        } else if (!log.ada('RN_SALINAN_LEWAT_' + id)) {
          log.tambah('RN_SALINAN_LEWAT_' + id, '-', id, 'hari ' + hari);
          RnU.melAdmin('Salinan fizikal Surat Setuju Terima belum diterima', 'Signed letter copy not yet received',
            ['Pemohon ' + id + ' (' + nama + ') belum memulangkan salinan fizikal Surat Setuju Terima dalam ' + maks + ' hari. Sila putuskan tindakan (tiada pembatalan automatik).'],
            ['Applicant ' + id + ' has not returned the signed letter within ' + maks + ' days. Please decide (no automatic cancellation).']);
          hasil.salinanLewat++;
        }
      }
    });
    return hasil;
  }

  /** Admin menanda salinan fizikal diterima. */
  function salinanFizikal_(ctx, p) {
    RnU.requireDecider(ctx);
    var id = S(p.id), penerima = S(p.penerima).substr(0, 120);
    var tarikh = S(p.tarikh) || RnU.dk(new Date());
    var e = {};
    if (!penerima) e.penerima = 'Wajib diisi / Required';
    if (!RnU.isDate(tarikh) || Util.daysBetween(new Date(), Util.toDate(tarikh)) > 0) e.tarikh = 'Tarikh tidak sah atau akan datang / Invalid or future date';
    if (Object.keys(e).length) throw appError_('RN_BORANG_TIDAK_SAH', { medan: e });
    Db.withLock(function () {
      var t = RnU.tawaranById(id);
      if (!t || S(t.Status) !== 'Diterima') throw appError_('RN_TAWARAN_TIDAK_BOLEH');
      if (S(t.Salinan_Fizikal_Tarikh)) throw appError_('RN_PERALIHAN_TIDAK_SAH');
      Db.update('Tawaran_Sewa', t._row, { Salinan_Fizikal_Tarikh: Util.toDate(tarikh), Salinan_Fizikal_Penerima: penerima });
      Audit.log(ctx, 'SALINAN_FIZIKAL_DITERIMA', 'Ruang Niaga', id, '', tarikh, 'Penerima: ' + penerima);
    });
    return dapat_(ctx, { id: id });
  }

  return {
    jadualOf: jadualOf_, semakJadual: semakJadual_, bilBulan: bilBulan_, teksJadual: teksJadual_, konteks: konteks_, alamatPenyewa: alamatPenyewa_, view: view_, dapat: dapat_, simpan: simpan_,
    jana: jana_, hantar: hantar_, untukPemohon: untukPemohon_, otpMinta: otpMinta_, jawab: jawab_, rekodSemula: rekodSemula_, semakLuput: semakLuput_,
    jobHarian: jobHarian_, salinanFizikal: salinanFizikal_, peringatanBertingkat: peringatanBertingkat_, ambang: ambang_
  };
})();
