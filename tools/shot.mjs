// Render an effect at several timestamps into one contact-sheet PNG (headless Edge + WebGL).
// Usage: node tools/shot.mjs <fxType> [--palette fire] [--variant great] [--count 3] [--scale 1]
//                            [--times 200,600,1000,1500,2200,3000] [--out shots/<fx>.png]
// Then view the PNG (e.g. with your image Read tool). Console errors from the page are printed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fx = args[0];
if (!fx) { console.error('usage: node tools/shot.mjs <fxType> [--palette p] [--variant v] [--times a,b,c] [--out file]'); process.exit(1); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const times = opt('times', '200,600,1000,1500,2200,3000');
const out = path.resolve(ROOT, opt('out', `shots/${fx}${opt('variant') ? '-' + opt('variant') : ''}.png`));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.onnx': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const q = new URLSearchParams({ fx, shot: times });
for (const k of ['palette', 'variant', 'count', 'scale']) if (opt(k)) q.set(k, opt(k));

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[http ' + r.status() + ']', r.url()); });
  await page.goto(`http://localhost:${port}/dev/fx.html?${q}`);
  await page.waitForFunction(() => window.__sheet, null, { timeout: 120000 });
  const sheet = await page.evaluate(() => window.__sheet);
  const errs = await page.evaluate(() => window.__errors || []);
  if (sheet.startsWith('ERROR')) { console.error(sheet); process.exitCode = 1; }
  else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, out));
  }
  if (errs.length) { console.log('effect errors:', errs.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
  server.close();
}
