// Builds AmiraASTAR.html from the original page and the ordered extension layers.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'";
const META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="referrer" content="no-referrer">\n`;

function once(text, old, replacement) {
  const first = text.indexOf(old);
  if (first < 0 || text.indexOf(old, first + old.length) >= 0) throw new Error(`Expected exactly one ${JSON.stringify(old.slice(0, 40))}`);
  return text.slice(0, first) + replacement + text.slice(first + old.length);
}

let html = fs.readFileSync(path.join(SRC, 'original.html'), 'utf8');
html = once(html, '<title>AmiraASTAR</title>', `<title>AmiraASTAR</title>\n${META.trimEnd()}`);
html = once(html, '</style>', fs.readFileSync(path.join(SRC, 'patch.css'), 'utf8') + '</style>');
const layers = fs.readdirSync(SRC).filter((name) => /^\d.*\.js$/.test(name)).sort();
const source = layers.map((name) => fs.readFileSync(path.join(SRC, name), 'utf8')).join('\n');
const wrapped = `/* ===== AmiraASTAR extensions (built from src/) ===== */\n(function(){\n${source}\n})();\n`;
html = once(html, '\nrender();\n</script>', `\n${wrapped}render();\n</script>`);
fs.writeFileSync(path.join(ROOT, 'AmiraASTAR.html'), html.replace(/\r?\n/g, '\n'), 'utf8');
console.log(`wrote ${path.join(ROOT, 'AmiraASTAR.html')} (${Math.floor(Buffer.byteLength(html) / 1024)} KB)`);
