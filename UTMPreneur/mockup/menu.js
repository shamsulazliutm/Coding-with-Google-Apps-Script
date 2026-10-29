// Menu bar sisi untuk ilustrasi (bukan kod sistem). renderSide(peranan, kunciAktif, subAktif)
function renderSide(role, key, sub) {
  const pel = role === 'pelajar';
  const U = pel ? { ini: 'NA', nama: 'NURUL AINA BINTI HASSAN', info: 'A23UJ0001 · Pelajar' } : { ini: 'SS', nama: 'SHAMSUL AZLI', info: 'shamsulazli@utm.my · Admin Penuh' };
  const G = pel ? [
    ['profiling', 'Profiling', [], 'Kemas kini'],
    ['ssu', 'SSU', ['Status dan permohonan', 'Sijil dan pembaharuan']],
    ['lot', 'Sewaan Lot', ['Lot tersedia', 'Permohonan saya', 'Tawaran dan dokumen', 'Bil dan bayaran', 'Pekerja dan peralatan']],
    ['kew', 'Laporan Kewangan', [], '1'],
    ['mk', 'Makerspace', ['Tempah ruang', 'Laser Cut dan 3D Printer', 'Pinjaman peralatan', 'Tempahan dan bayaran saya']]
  ] : [
    ['profiling', 'Profiling', []],
    ['ssu', 'SSU', ['Permohonan|3', 'Hampir tamat dan tamat|2', 'Daftar SSU sedia ada']],
    ['lot', 'Sewaan Lot', ['Lot dan tempoh permohonan', 'Permohonan|4', 'Penilaian jawatankuasa', 'Tawaran dan dokumen|2', 'Cagaran', 'Sewaan dan bil|2']],
    ['kew', 'Laporan Kewangan', ['Semakan laporan|5', 'Ringkasan kepatuhan']],
    ['mk', 'Makerspace', ['Tempahan|1', 'Pinjaman', 'Bil dan bayaran', 'Alat, peralatan dan kadar']]
  ];
  let h = `<div class="brand"><div class="burger">≡</div><img src="logo.png" alt=""><div><b>UTMPreneur</b><i>UTMXCITE · UTM</i></div></div>
  <div class="user"><div class="av">${U.ini}</div><div><b>${U.nama}</b><span>${U.info}</span></div></div><div class="out">Log keluar semua peranti</div>
  <div class="nav"><div class="${key === 'utama' ? 'on' : ''}"><span class="ic">⌂</span>Utama</div>${pel ? '' : '<div class="' + (key === 'bantu' ? 'on' : '') + '"><span class="ic">☺</span>Bantu pelajar</div>'}</div>
  <div class="sec">PROSES</div><div class="nav">`;
  G.forEach(g => {
    const open = g[0] === key, has = g[2].length;
    h += `<div class="${open && !has ? 'on' : 'grp'}"><span class="ic">${open ? '◉' : '◎'}</span>${g[1]}${g[3] ? '<span class="bd" style="' + (g[3] === 'Kemas kini' ? 'background:var(--warn-l);color:var(--warn)' : '') + '">' + g[3] + '</span>' : ''}${has ? '<span class="ch">' + (open ? '⌃' : '⌄') + '</span>' : ''}</div>`;
    if (open && has) g[2].forEach((s, i) => { const [t, n] = s.split('|'); h += `<div class="sub ${i === (sub || 0) ? 'on' : ''}">${t}${n ? '<span class="bd">' + n + '</span>' : ''}</div>`; });
  });
  h += '</div>';
  if (pel) h += `<div class="sec">LAIN-LAIN</div><div class="nav"><div class="off"><span class="ic">◌</span>Mikro Kredit<span class="soon">AKAN DATANG</span></div><div class="off"><span class="ic">◌</span>Dana Program<span class="soon">AKAN DATANG</span></div><div class="off"><span class="ic">◌</span>Inovasi dan Anugerah<span class="soon">AKAN DATANG</span></div></div>`;
  else h += `<div class="sec">ADMIN</div><div class="nav"><div class="grp"><span class="ic">⚙</span>Pentadbiran<span class="ch">⌄</span></div><div class="sub" style="color:#8a7f82">Laporan KPI · Dashboard · Import · Admin · Status</div></div>`;
  return h;
}
