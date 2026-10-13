// Menjana src/LogoData.html daripada fail PNG logo (lalai: mockup/logo.png).
// Penggunaan: node scripts/build-logo.js [laluan-png]
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'mockup', 'logo.png');
const b64 = fs.readFileSync(src).toString('base64');
const out = path.join(__dirname, '..', 'src', 'LogoData.html');
fs.writeFileSync(out, '<script>window.LOGO_DEFAULT="data:image/png;base64,' + b64 + '";</script>\n');
console.log('Ditulis', out, Math.round(b64.length / 1024) + ' KB');
