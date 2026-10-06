/**
 * Pengiraan dashboard. Semua sasaran ialah MINIMUM (boleh dilebihi) kecuali KPI berjenis "kemajuan"
 * (KAI 2, DKAI 1) yang berakhir pada 100%. Dashboard awam hanya menerima data agregat (tiada data peribadi).
 */

function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function round1_(n) { return Math.round(n * 10) / 10; }
function round2_(n) { return Math.round(n * 100) / 100; }
function rm_(n) { return 'RM ' + round2_(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function sumBy_(rows, keyFn, valFn) {
  var m = {}, order = [];
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k === '' || k === undefined || k === null) k = '(tiada)';
    if (!(k in m)) { m[k] = 0; order.push(k); }
    m[k] += valFn(r);
  });
  return order.map(function (k) { return { label: k, value: round2_(m[k]) }; });
}
function sumOf_(rows, field) { var t = 0; rows.forEach(function (r) { t += num_(r[field]); }); return t; }
function distinctCount_(rows, field) {
  var seen = {};
  rows.forEach(function (r) { var v = String(r[field] || '').trim().toLowerCase(); if (v) seen[v] = 1; });
  return Object.keys(seen).length;
}
function byMonth_(items) { return items.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); }); }

function countBy_(rows, keyFn) {
  var m = {}, order = [];
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k === '' || k === undefined || k === null) k = '(tiada)';
    if (!(k in m)) { m[k] = 0; order.push(k); }
    m[k] += 1;
  });
  return order.map(function (k) { return { label: k, value: m[k] }; });
}

function sortDesc_(items) { return items.sort(function (a, b) { return b.value - a.value; }); }

function perFacultyItems_(kpi, rows, faculties) {
  var counts = {};
  rows.forEach(function (r) { counts[r.fakulti] = (counts[r.fakulti] || 0) + 1; });
  var codes = kpi.facultyWhitelist ? kpi.facultyWhitelist.slice() : Object.keys(counts);
  if (!kpi.facultyWhitelist && kpi.perFacultyTarget) {
    faculties.forEach(function (f) { if (f.kod !== 'UTMXCITE' && codes.indexOf(f.kod) < 0) codes.push(f.kod); });
  }
  return codes.map(function (c) {
    var it = { label: c, value: counts[c] || 0 };
    if (kpi.perFacultyTarget) it.target = kpi.perFacultyTarget;
    return it;
  });
}

function countedInYear_(rows, statuses, dateField, year) {
  return rows.filter(function (r) {
    return statuses.indexOf(r.status) >= 0 && yearOf_(r[dateField]) === year;
  });
}

var MEASURES = {
  // KAI 1: inkubator aktif = didaftarkan DAN (dalam pembangunan atau beroperasi); sasaran minimum 20 setiap tahun.
  kai1: function (kpi, rows, year, ctx) {
    var active = rows.filter(function (r) {
      if (r.didaftarkan !== 'Ya') return false;
      var reg = yearOf_(r.tarikh_pendaftaran), off = yearOf_(r.tarikh_tidak_aktif);
      if (!reg || reg > year) return false;
      if (off && off <= year) return false;
      if (r.status === 'Dalam pembangunan' || r.status === 'Beroperasi') return true;
      return r.status === 'Tidak aktif' && !!off && off > year;
    });
    var oper = active.filter(function (r) { return r.status === 'Beroperasi'; }).length;
    var jenis = countBy_(active, function (r) { return r.jenis; });
    jenis.forEach(function (it) {
      if (it.label === 'Inkubator Fakulti') it.target = 13;
      if (it.label === 'Co-working / Ruang Individu') it.target = 10;
    });
    return {
      value: active.length,
      secondary: [{ label: 'Sudah beroperasi', value: oper }],
      breakdown: [
        { title: 'Mengikut aliran', items: countBy_(active, function (r) { return r.aliran; }) },
        { title: 'Mengikut jenis (sasaran dalaman 13 + 10)', items: jenis },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(active, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // Kemajuan berpemberat (KAI 2, DKAI 1): jumlah (peratus siap x pemberat) / 100.
  progress: function (kpi, rows) {
    var sum = 0, weight = 0, done = 0;
    rows.forEach(function (r) {
      sum += num_(r.peratus_siap) * num_(r.pemberat) / 100;
      weight += num_(r.pemberat);
      if (r.status === 'Siap') done += 1;
    });
    var warnings = [];
    if (rows.length && Math.abs(weight - 100) > 0.01) warnings.push('Jumlah pemberat milestone ialah ' + round1_(weight) + '% (sepatutnya 100%).');
    return {
      value: Math.min(100, round1_(sum)),
      secondary: [{ label: 'Milestone siap', value: done + ' / ' + rows.length }],
      warnings: warnings,
      breakdown: [{
        title: 'Kemajuan milestone (%)',
        items: rows.map(function (r) { return { label: (r.fasa || r.peringkat || '') + ' - ' + r.nama_milestone + ' (' + num_(r.pemberat) + '%)', value: num_(r.peratus_siap), target: 100 }; })
      }]
    };
  },


  // CKAI 1: bilangan profiling pelajar yang didaftarkan pada tahun itu (satu profil bagi setiap pelajar).
  profiling: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh_profiling) === year; });
    var order = ['Tiada minat', 'Rendah', 'Sederhana', 'Tinggi'];
    var ready = ['Belum ada idea', 'Ada idea', 'Ada prototaip / MVP', 'Sudah beroperasi'];
    return {
      value: inYear.length,
      secondary: [
        { label: 'Berminat (sederhana / tinggi)', value: inYear.filter(function (r) { return r.tahap_minat === 'Sederhana' || r.tahap_minat === 'Tinggi'; }).length },
        { label: 'Sudah ada idea / prototaip / berniaga', value: inYear.filter(function (r) { return r.tahap_kesediaan && r.tahap_kesediaan !== 'Belum ada idea'; }).length },
        { label: 'Sedang berniaga', value: inYear.filter(function (r) { return r.pengalaman_perniagaan === 'Sedang berniaga'; }).length }
      ],
      breakdown: [
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) },
        { title: 'Mengikut tahap minat', items: countBy_(inYear, function (r) { return r.tahap_minat; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }) },
        { title: 'Mengikut tahap kesediaan', items: countBy_(inYear, function (r) { return r.tahap_kesediaan || '(tiada)'; }).sort(function (a, b) { return ready.indexOf(a.label) - ready.indexOf(b.label); }) },
        { title: 'Mengikut sumber profiling', items: sortDesc_(countBy_(inYear, function (r) { return r.sumber_profiling; })) }
      ]
    };
  },

  // CKAI 2 dan 3: program yang SELESAI pada tahun itu (mengikut tarikh tamat), termasuk penyertaan, kos dan pendapatan.
  program: function (kpi, rows, year) {
    var done = rows.filter(function (r) { return r.status === 'Selesai' && yearOf_(r.tarikh_tamat) === year; });
    var upcoming = rows.filter(function (r) { return (r.status === 'Dirancang' || r.status === 'Sedang berjalan') && yearOf_(r.tarikh_mula) === year; });
    var cost = sumOf_(done, 'bajet_rm'), income = sumOf_(done, 'pendapatan_rm');
    return {
      value: done.length,
      secondary: [
        { label: 'Jumlah peserta', value: sumOf_(done, 'bil_peserta') },
        { label: 'Daripada itu pelajar', value: sumOf_(done, 'bil_pelajar') },
        { label: 'Kos penganjuran', value: rm_(cost) },
        { label: 'Pendapatan', value: rm_(income) },
        { label: 'Dirancang / sedang berjalan', value: upcoming.length }
      ],
      breakdown: [
        { title: 'Program selesai mengikut fakulti / penganjur', items: sortDesc_(countBy_(done, function (r) { return r.fakulti; })) },
        { title: 'Mengikut kategori', items: sortDesc_(countBy_(done, function (r) { return r.kategori; })) },
        { title: 'Peserta mengikut fakulti / penganjur', items: sortDesc_(sumBy_(done, function (r) { return r.fakulti; }, function (r) { return num_(r.bil_peserta); })) }
      ]
    };
  },

  // CKAI 4: pendaftaran SSU (Sistem Syarikat Universiti) pada tahun itu.
  ssu: function (kpi, rows, year) {
    var reg = rows.filter(function (r) { return yearOf_(r.tarikh_daftar) === year; });
    return {
      value: reg.length,
      secondary: [{ label: 'Masih aktif', value: reg.filter(function (r) { return r.status === 'Aktif'; }).length }],
      breakdown: [{ title: 'Mengikut fakulti', items: sortDesc_(countBy_(reg, function (r) { return r.fakulti; })) }]
    };
  },

  // CKAI 7: jumlah pendapatan usahawan pelajar (RM) bagi bulan-bulan dalam tahun itu.
  income: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tempoh) === year; });
    var total = sumOf_(inYear, 'pendapatan_rm');
    return {
      value: round2_(total),
      secondary: [
        { label: 'Perniagaan melaporkan pendapatan', value: distinctCount_(inYear, 'nama_perniagaan') },
        { label: 'Purata setiap perniagaan', value: rm_(distinctCount_(inYear, 'nama_perniagaan') ? total / distinctCount_(inYear, 'nama_perniagaan') : 0) }
      ],
      breakdown: [
        { title: 'Pendapatan (RM) mengikut fakulti', items: sortDesc_(sumBy_(inYear, function (r) { return r.fakulti; }, function (r) { return num_(r.pendapatan_rm); })) },
        { title: 'Pendapatan (RM) mengikut jenis', items: sortDesc_(sumBy_(inYear, function (r) { return r.jenis_pendapatan; }, function (r) { return num_(r.pendapatan_rm); })) },
        { title: 'Pendapatan (RM) mengikut bulan', items: byMonth_(sumBy_(inYear, function (r) { return r.tempoh; }, function (r) { return num_(r.pendapatan_rm); })) }
      ]
    };
  },

  // CKAI 5: bilangan penggunaan Makerspace = bilangan permohonan (satu rekod = satu penggunaan), mengikut tahun tarikh mula.
  makerspace: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh_mula) === year; });
    var users = {};
    inYear.forEach(function (r) { users[String(r.no_matrik || r.emel).toUpperCase()] = 1; });
    return {
      value: inYear.length,
      secondary: [
        { label: 'Pengguna unik', value: Object.keys(users).length },
        { label: 'Jumlah peserta', value: sumOf_(inYear, 'bil_peserta') },
        { label: 'Caj diterima', value: rm_(sumOf_(inYear.filter(function (r) { return r.status_bayaran === 'Bayar'; }), 'bayaran_rm')) },
        { label: 'Caj belum dibayar', value: rm_(sumOf_(inYear.filter(function (r) { return r.status_bayaran === 'Belum Dibayar'; }), 'bayaran_rm')) }
      ],
      breakdown: [
        { title: 'Penggunaan mengikut bulan', items: byMonth_(countBy_(inYear, function (r) { return String(r.tarikh_mula).slice(0, 7); })) },
        { title: 'Penggunaan mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) },
        { title: 'Peralatan paling banyak dipohon', items: sortDesc_(countBy_(inYear, function (r) { return String(r.peralatan || '').trim(); })).slice(0, 5) }
      ]
    };
  },

  // CKAI 6: pendapatan sewaan inkubator yang DITERIMA (status Dibayar) pada tahun itu.
  rent: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tempoh) === year; });
    var paid = inYear.filter(function (r) { return r.status_bayaran === 'Dibayar'; });
    var due = inYear.filter(function (r) { return r.status_bayaran !== 'Dibayar'; });
    return {
      value: round2_(sumOf_(paid, 'jumlah_rm')),
      secondary: [
        { label: 'Belum dibayar / tertunggak', value: rm_(sumOf_(due, 'jumlah_rm')) },
        { label: 'Penyewa', value: distinctCount_(inYear, 'penyewa') }
      ],
      breakdown: [{ title: 'Sewaan diterima (RM) mengikut bulan', items: byMonth_(sumBy_(paid, function (r) { return r.tempoh; }, function (r) { return num_(r.jumlah_rm); })) }]
    };
  },

  // CKAI 8: inovasi pelajar yang TELAH menyertai pertandingan (sekurang-kurangnya peringkat Fakulti) pada tahun itu.
  innovation: function (kpi, rows, year) {
    var done = rows.filter(function (r) { return r.status_penyertaan === 'Telah menyertai' && yearOf_(r.tarikh) === year; });
    var order = ['Fakulti', 'Universiti', 'Kebangsaan', 'Antarabangsa'];
    var students = 0;
    done.forEach(function (r) { var p = parseJson_(r.pelajar, []); if (Array.isArray(p)) students += p.length; });
    var pipeOrder = ['Belum dinilai', 'Calon peningkatan', 'Sedang disokong', 'Telah dibawa ke peringkat lebih tinggi', 'Tidak diteruskan'];
    return {
      value: done.length,
      secondary: [
        { label: 'Pelajar terlibat', value: students },
        { label: 'Memenang anugerah / pingat', value: done.filter(function (r) { return !!r.pingat; }).length },
        { label: 'Peringkat Universiti ke atas', value: done.filter(function (r) { return r.peringkat !== 'Fakulti'; }).length },
        { label: 'Calon peningkatan / sedang disokong', value: done.filter(function (r) { return r.status_peningkatan === 'Calon peningkatan' || r.status_peningkatan === 'Sedang disokong'; }).length },
        { label: 'Telah dibawa ke peringkat lebih tinggi', value: done.filter(function (r) { return r.status_peningkatan === 'Telah dibawa ke peringkat lebih tinggi'; }).length },
        { label: 'Akan menyertai (dirancang)', value: rows.filter(function (r) { return r.status_penyertaan === 'Akan menyertai' && yearOf_(r.tarikh) === year; }).length }
      ],
      breakdown: [
        { title: 'Mengikut peringkat pertandingan', items: countBy_(done, function (r) { return r.peringkat; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(done, function (r) { return r.fakulti; })) },
        { title: 'Mengikut jenis inovasi', items: sortDesc_(countBy_(done, function (r) { return r.jenis_inovasi; })) },
        { title: 'Status peningkatan', items: countBy_(done, function (r) { return r.status_peningkatan || 'Belum dinilai'; }).sort(function (a, b) { return pipeOrder.indexOf(a.label) - pipeOrder.indexOf(b.label); }) }
      ]
    };
  },

  // CKAI 9: anugerah dan pengiktirafan inovasi / keusahawanan yang diterima pada tahun itu.
  award: function (kpi, rows, year) {
    var inYear = rows.filter(function (r) { return yearOf_(r.tarikh) === year; });
    var order = ['Fakulti', 'Universiti', 'Kebangsaan', 'Antarabangsa'];
    var byLevel = countBy_(inYear, function (r) { return r.peringkat; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); });
    var students = 0;
    inYear.forEach(function (r) { var p = parseJson_(r.pelajar, []); if (Array.isArray(p)) students += p.length; });
    return {
      value: inYear.length,
      secondary: [
        { label: 'Peringkat kebangsaan / antarabangsa', value: inYear.filter(function (r) { return r.peringkat === 'Kebangsaan' || r.peringkat === 'Antarabangsa'; }).length },
        { label: 'Pingat emas / johan', value: inYear.filter(function (r) { return r.pingat === 'Emas' || r.pingat === 'Johan'; }).length },
        { label: 'Pelajar penerima', value: students }
      ],
      breakdown: [
        { title: 'Mengikut peringkat', items: byLevel },
        { title: 'Mengikut kategori', items: countBy_(inYear, function (r) { return r.kategori; }) },
        { title: 'Mengikut program', items: sortDesc_(countBy_(inYear, function (r) { return r.program; })) },
        { title: 'Mengikut fakulti', items: sortDesc_(countBy_(inYear, function (r) { return r.fakulti; })) }
      ]
    };
  },

  // KAI 3: ruang ditawarkan kepada pelajar untuk disewa (kumulatif); penggunaan = disewa / ditawarkan.
  kai3: function (kpi, rows, year) {
    var offered = rows.filter(function (r) {
      return (r.status === 'Ditawarkan' || r.status === 'Disewa') && yearOf_(r.tarikh_ditawarkan) && yearOf_(r.tarikh_ditawarkan) <= year;
    });
    var rented = offered.filter(function (r) { return r.status === 'Disewa'; });
    var rate = offered.length ? round1_(rented.length / offered.length * 100) : 0;
    var order = ['Dikenal pasti', 'Spesifikasi disediakan', 'Dalam perolehan', 'Siap', 'Ditawarkan', 'Disewa', 'Tidak aktif'];
    var pipe = countBy_(rows, function (r) { return r.status; }).sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); });
    return {
      value: offered.length,
      secondary: [{ label: 'Disewa pelajar', value: rented.length }, { label: 'Kadar penggunaan', value: rate + '%' }],
      breakdown: [
        { title: 'Ruang ditawarkan mengikut jenis', items: countBy_(offered, function (r) { return r.jenis_ruang; }) },
        { title: 'Ruang ditawarkan mengikut lokasi', items: sortDesc_(countBy_(offered, function (r) { return r.lokasi; })) },
        { title: 'Saluran paip semua ruang (mengikut status)', items: pipe }
      ]
    };
  },

  // KAI 4: pelajar mendaftar dalam GiGAUTM Ascend pada tahun itu.
  kai4: function (kpi, rows, year, ctx) {
    var counted = countedInYear_(rows, ['Mendaftar', 'Tamat'], 'tarikh_daftar', year);
    return {
      value: counted.length,
      secondary: [
        { label: 'Bootcamp tamat', value: counted.filter(function (r) { return r.bootcamp_status === 'Tamat'; }).length },
        { label: 'Gig diperoleh', value: counted.filter(function (r) { return r.gig_diperoleh === 'Ya'; }).length }
      ],
      breakdown: [
        { title: 'Pelajar mendaftar mengikut fakulti (cadangan minimum 2 setiap fakulti)', items: perFacultyItems_(kpi, counted, ctx.faculties) },
        { title: 'Semua permohonan mengikut status (keseluruhan)', items: countBy_(rows, function (r) { return r.status; }) }
      ]
    };
  },

  // KAI 5: pelajar mendaftar dalam F-SIP pada tahun itu.
  kai5: function (kpi, rows, year) {
    var counted = countedInYear_(rows, ['Mendaftar', 'Tamat'], 'tarikh_daftar', year);
    return {
      value: counted.length,
      secondary: [{ label: 'Kertas konsep diluluskan', value: rows.filter(function (r) { return r.kertas_konsep_status === 'Diluluskan'; }).length }],
      breakdown: [
        { title: 'Pelajar mendaftar mengikut fakulti', items: sortDesc_(countBy_(counted, function (r) { return r.fakulti; })) },
        { title: 'Semua pelajar mengikut status (keseluruhan)', items: countBy_(rows, function (r) { return r.status; }) }
      ]
    };
  },

  // KAI 6: pelajar dilatih membentuk startup AI pada tahun itu; minimum 5 setiap fakulti (FAI, FC, FKE, MJIIT).
  kai6: function (kpi, rows, year, ctx) {
    var counted = countedInYear_(rows, ['Dalam latihan', 'Tamat latihan'], 'tarikh_mula_latihan', year);
    var startups = {};
    counted.forEach(function (r) { if (r.nama_startup) startups[String(r.nama_startup).toLowerCase()] = 1; });
    return {
      value: counted.length,
      secondary: [
        { label: 'Startup AI (unik)', value: Object.keys(startups).length },
        { label: 'Top 5 Global Outreach', value: counted.filter(function (r) { return r.top5 === 'Ya'; }).length },
        { label: 'Startup ditubuhkan', value: counted.filter(function (r) { return r.startup_ditubuhkan === 'Ya'; }).length }
      ],
      breakdown: [
        { title: 'Mengikut fakulti (minimum 5 setiap fakulti)', items: perFacultyItems_(kpi, counted, ctx.faculties) },
        { title: 'Semua pelajar mengikut status (keseluruhan)', items: countBy_(rows, function (r) { return r.status; }) }
      ]
    };
  }
};

function readTargets_() {
  var out = {};
  readTable_(SHEETS.TARGETS, { tahun: 'number', sasaran: 'number', q1: 'number', q2: 'number', q3: 'number', q4: 'number' }).rows.forEach(function (r) {
    if (!r.kpi || r.tahun === '') return;
    out[r.kpi] = out[r.kpi] || {};
    out[r.kpi][r.tahun] = { sasaran: r.sasaran, q: [r.q1, r.q2, r.q3, r.q4], jenis: r.jenis, bajet: r.bajet_rm, catatan: r.catatan };
  });
  return out;
}

function statusFor_(kpi, value, target) {
  if (target === '' || target === undefined || target === null) return 'Tiada sasaran';
  if (kpi.jenis === 'kemajuan') {
    if (value >= 100) return 'Selesai';
    return value >= target ? 'Capai sasaran' : 'Di bawah sasaran';
  }
  if (value > target) return 'Melebihi sasaran';
  return value === target ? 'Capai sasaran' : 'Di bawah sasaran';
}

function currentQuarter_() {
  return Math.ceil(parseInt(Utilities.formatDate(new Date(), APP.TZ, 'M'), 10) / 3);
}

function buildKpiCard_(kpi, rows, year, targets, ctx) {
  var m = MEASURES[kpi.measure](kpi, rows, year, ctx);
  var t = (targets[kpi.id] || {})[year] || null;
  var target = t && t.sasaran !== '' ? t.sasaran : '';
  var card = {
    id: kpi.id, title: kpi.title, short: kpi.short, group: kpi.group, level: kpi.level, fungsi: kpi.fungsi || null, unit: kpi.unit, jenis: kpi.jenis, format: kpi.valueFormat || '',
    value: m.value, target: target,
    pct: target !== '' && target > 0 ? round1_(m.value / target * 100) : null,
    status: statusFor_(kpi, m.value, target),
    secondary: m.secondary || [], breakdown: m.breakdown || [], warnings: m.warnings || [],
    note: t ? t.catatan : ''
  };
  var nowYear = yearOf_(todayIso_());
  if (t && target !== '' && year === nowYear) {
    var q = currentQuarter_();
    var qt = t.q[q - 1];
    card.quarter = q;
    card.quarterTarget = qt === '' || qt === undefined ? '' : qt;
    card.quarterStatus = card.quarterTarget === '' ? 'Tiada sasaran suku tahun' : statusFor_(kpi, m.value, card.quarterTarget);
  }
  if (kpi.id === 'KAI6') card.secondaryTargets = 'Sasaran sekunder startup AI 2026: Q1 0, Q2 1, Q3 2, Q4 3';
  return card;
}

function computeDashboard_(year) {
  var targets = readTargets_();
  var ctx = { faculties: listFaculties_() };
  var cards = KPIS.map(function (kpi) {
    var rows = readTable_(kpi.sheet, typesFor_(kpi)).rows;
    return buildKpiCard_(kpi, rows, year, targets, ctx);
  });
  var withTarget = cards.filter(function (c) { return c.target !== ''; }).length;
  var meet = cards.filter(function (c) { return c.status === 'Capai sasaran' || c.status === 'Melebihi sasaran' || c.status === 'Selesai'; }).length;
  return {
    year: year, years: APP.YEARS, levels: LEVELS, functions: FUNCTIONS, generatedAt: nowIso_(),
    ds: { label: 'DS 04 · Pekerjaan Premium Tier 1', goal: '40% Pekerjaan Premium Tier 1 (2030)', owner: 'Pengarah UTMXCITE' },
    summary: { total: withTarget, meet: meet },
    kpis: cards
  };
}

/** Dashboard awam dengan cache pendek. Tidak memerlukan log masuk. */
function getDashboard_(yearIn) {
  var year = parseInt(yearIn, 10);
  if (APP.YEARS.indexOf(year) < 0) year = Math.min(Math.max(yearOf_(todayIso_()), APP.YEARS[0]), APP.YEARS[APP.YEARS.length - 1]);
  var cache = CacheService.getScriptCache();
  var hit = cache.get('dash:' + year);
  if (hit) return JSON.parse(hit);
  var d = computeDashboard_(year);
  try { cache.put('dash:' + year, JSON.stringify(d), APP.DASH_CACHE_TTL); } catch (e) { /* terlalu besar: abaikan cache */ }
  return d;
}
