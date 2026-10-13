'use strict';
/**
 * Gabungkan src/ menjadi dua fail untuk ditampal terus dalam editor Apps Script:
 *   dist/Code.gs     (semua fail .gs)
 *   dist/Index.html  (Index + Styles + LogoData + App + ... dengan include() dilembutkan)
 *   dist/appsscript.json
 * Guna: node scripts/bundle.js
 */
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'dist');

function bundle() {
  fs.mkdirSync(OUT, { recursive: true });
  const gs = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  const code = '/** UTMPreneur: fail gabungan (dijana oleh scripts/bundle.js daripada src/). Jangan sunting di sini; sunting src/ dan jana semula. */\n\n' +
    gs.map((f) => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n\n');
  fs.writeFileSync(path.join(OUT, 'Code.gs'), code);

  const inline = (name, depth) => {
    if (depth > 5) throw new Error('include terlalu dalam: ' + name);
    return fs.readFileSync(path.join(SRC, name + '.html'), 'utf8')
      .replace(/<\?!= include\('(\w+)'\) \?>/g, (m, n) => inline(n, depth + 1));
  };
  fs.writeFileSync(path.join(OUT, 'Index.html'), inline('Index', 0));
  fs.copyFileSync(path.join(__dirname, '..', 'appsscript.json'), path.join(OUT, 'appsscript.json'));
  return { gs: gs.length, bytesCode: code.length };
}

if (require.main === module) console.log(JSON.stringify(bundle()));
module.exports = { bundle };
