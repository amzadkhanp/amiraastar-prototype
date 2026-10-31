// Tiny static server for local runs and tests: http://127.0.0.1:8000/AmiraASTAR.html
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = __dirname, port = Number(process.env.PORT || 8000);
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'AmiraASTAR.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(p));
}).listen(port, '127.0.0.1', () => console.log(`AmiraASTAR: http://127.0.0.1:${port}/AmiraASTAR.html`));
