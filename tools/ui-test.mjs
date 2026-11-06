// UI test: progression self-check in Node, then index.html in headless Edge with a fake camera at
// phone (390x844) and laptop (1366x800) sizes. Screenshots go to shots/ui-<size>-<step>.png.
// Any console error / page error sets exit code 1.   Run: node tools/ui-test.mjs [--only phone|desk]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as P from '../js/ui/progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;

// ---------- 1. progression logic ----------
{
  const mem = { v: {}, getItem(k) { return this.v[k] ?? null; }, setItem(k, x) { this.v[k] = x; } };
  const s = P.load(mem);
  const fire = { id: 'f', rank: 'C', element: 'fire', signs: ['Snake', 'Ram', 'Monkey', 'Boar', 'Horse', 'Tiger'] };
  const big = { id: 's', rank: 'S', element: 'wind', signs: ['Ram', 'Dog'] };
  let r = P.recordCast(s, fire, 2900, { mode: 'guided', allElements: ['fire', 'wind'], total: 2 });
  assert.equal(r.isNew, true);
  assert.equal(r.xp, Math.round(35 * 2) + 25);                       // < 600 ms per sign doubles, +25 first cast
  assert.deepEqual(r.achievements.map((a) => a.id).sort(), ['blink', 'first']);
  r = P.recordCast(s, big, 5000, { mode: 'freestyle', allElements: ['fire', 'wind'], total: 2 });
  assert.ok(['every', 'srank', 'free', 'all'].every((id) => r.achievements.some((a) => a.id === id)), 'every/srank/free/all unlock');
  assert.equal(r.rankUp?.name, 'Genin');                                // 95 + 200 xp crosses 150
  for (let i = 0; i < 4; i++) P.recordCast(s, fire, 4000, { total: 2 });
  assert.equal(P.stars(s.jutsu.f, fire), 3);
  P.save(s, mem); assert.equal(P.load(mem).casts, 6);
  assert.equal(P.KEY.startsWith('jutsu.'), true);
  console.log('progress.js: ok');
}

// ---------- 2. browser ----------
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(0);
const URL0 = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const SIZES = [['phone', 390, 844, true], ['desk', 1366, 800, false]].filter((s) => !only || s[0] === only);

for (const [tag, width, height, mobile] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split(/\n/).slice(1, 3).join(' ').trim()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().replace(URL0, '/')}`); });
  const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, `ui-${tag}-${name}.png`) }); console.log(`  shot ui-${tag}-${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { failed++; console.log(`  FAIL ${tag} ${name}: ${e.message.split('\n')[0]}`); } };
  const fire = (type, detail) => page.evaluate(([t, d]) => window.__app.game.handle({ type: t, ...d }), [type, detail]);
  console.log(`[${tag} ${width}x${height}]`);

  await page.goto(URL0);
  await step('boot', async () => { await page.waitForSelector('body.booted', { timeout: 30000 }); await page.evaluate(() => document.fonts.ready); });
  await shot('1-intro');

  await step('error-state', async () => {
    await page.evaluate(() => window.__app.game.emit('error', { message: 'Camera permission was denied.' }));
    assert.ok(await page.locator('#introStatus.err', { hasText: 'site settings' }).count() === 1, 'denied message shown');
    await page.evaluate(() => { const s = document.getElementById('introStatus'); s.textContent = ''; s.classList.remove('err'); });
  });

  await step('handbook', async () => {
    await page.click('#introBook');
    await page.waitForSelector('#book:not([hidden]) .card');
    assert.equal(await page.locator('#cards .card').count(), 50);
    await page.fill('#q', 'fire'); await page.waitForTimeout(100);
    const n = await page.locator('#cards .card').count(); assert.ok(n > 0 && n < 50, 'search filters');
    await page.fill('#q', ''); await page.dispatchEvent('#q', 'input');
    await page.click('#fSource .chip[data-v=adapted]');
    assert.ok(await page.locator('#cards .card .src-adapted').count() > 0);
    await page.click('#fSource .chip[data-v=adapted]');
    await page.fill('#q', 'zzzz'); await page.waitForSelector('#cards .empty');
    await page.click('#clearF'); assert.equal(await page.locator('#cards .card').count(), 50, 'clear filters');
  });
  await shot('2-handbook');

  await step('detail', async () => {
    await page.locator('#cards .card', { hasText: 'Great Fireball' }).first().click();
    await page.waitForSelector('#detail .paper .d-signs .tile');
    assert.ok(await page.locator('#detail .picto').count() >= 3, 'pictograms in detail');
  });
  await shot('3-detail');
  await step('detail-scroll', async () => { await page.locator('#detail [data-watch]').scrollIntoViewIfNeeded(); });
  await shot('4-detail-actions');

  await step('watch', async () => {
    await page.click('#detail [data-watch]');
    await page.waitForSelector('#callout.show', { timeout: 5000 });
    await page.waitForTimeout(900);
  });
  await shot('5-watch');
  // headless software GL runs far below 60 fps and the stage clamps dt, so effects take longer in real time here
  await step('watch-end', async () => { await page.waitForFunction(() => !window.__app.game.casting, null, { timeout: 60000 }); });

  await step('handbook-keyboard', async () => {
    await page.click('#introBook'); await page.waitForSelector('#book:not([hidden])');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#book[hidden]').count() === 1, 'Esc closes handbook');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'introBook', 'focus returns to opener');
  });

  await step('start', async () => {
    await page.click('#startBtn');
    await page.waitForSelector('body.live', { timeout: 90000 });
    await page.waitForTimeout(600);
  });
  await shot('6-training');

  await step('guided-progress', async () => {
    const j = await page.evaluate(() => window.__app.ui.target.signs);
    await fire('progress', { sign: j[0], step: 1, total: j.length });
    await fire('progress', { sign: j[1], step: 2, total: j.length });
    await fire('wrong', { sign: 'Dog', expected: j[2], step: 2 });
    assert.ok(await page.locator('#track .tile.done').count() === 2);
    assert.ok(await page.locator('#cue.bad').count() === 1);
  });
  await shot('7-wrong');

  await step('cast', async () => {
    const id = await page.evaluate(() => window.__app.ui.target.id);
    await page.evaluate((i) => { const g = window.__app.game; g.handle({ type: 'cast', jutsu: g.byId[i], ms: 2400, signs: g.byId[i].signs.length }); }, id);
    await page.waitForSelector('#callout.show'); await page.waitForTimeout(1200);
    const p = await page.evaluate(() => JSON.parse(localStorage.getItem('jutsu.progress')));
    assert.ok(p.xp > 0 && p.casts === 1, 'xp recorded');
  });
  await shot('8-cast');
  await step('cast-end', async () => { await page.waitForFunction(() => !window.__app.game.casting, null, { timeout: 60000 }); await page.waitForTimeout(400); });

  await step('freestyle', async () => {
    await page.click('#tabFree');
    assert.equal(await page.evaluate(() => window.__app.game.mode), 'freestyle');
    const c = await page.evaluate(() => window.__app.game.jutsu.filter((j) => j.signs[0] === 'Snake' && j.signs[1] === 'Ram').map((j) => j.id));
    await page.evaluate(() => { const g = window.__app.game; g.handle({ type: 'buffer', buffer: ['Snake'], candidates: g.jutsu.filter((j) => j.signs[0] === 'Snake') }); });
    await page.evaluate(() => { const g = window.__app.game; g.handle({ type: 'buffer', buffer: ['Snake', 'Ram'], candidates: g.jutsu.filter((j) => j.signs[0] === 'Snake' && j.signs[1] === 'Ram') }); });
    assert.equal(await page.locator('#cands .cand').count(), Math.min(6, c.length));
  });
  await shot('9-freestyle');

  await step('fizzle', async () => {
    await page.evaluate(() => { const g = window.__app.game; const b = ['Snake', 'Ram', 'Dog']; g.handle({ type: 'fizzle', buffer: b, closest: g.jutsu.find((j) => j.signs[0] === 'Snake' && j.signs[1] === 'Ram') }); g.handle({ type: 'buffer', buffer: [], candidates: [] }); });
    await page.waitForSelector('#fizzle');
    await page.locator('#fizzle').scrollIntoViewIfNeeded();
  });
  await shot('10-fizzle');

  await step('rank-up', async () => {
    // a freestyle S/A-rank cast pushes the 95 XP from training past Genin (150)
    await page.evaluate(() => { const g = window.__app.game; const j = g.jutsu.find((x) => x.rank === 'S') || g.jutsu.find((x) => x.rank === 'A'); g.handle({ type: 'cast', jutsu: j, ms: 900 * j.signs.length, signs: j.signs.length }); });
    await page.waitForSelector('#callout.show .xpbar.co'); await page.waitForTimeout(1400);
  });
  await shot('10b-cast-xp');
  await step('rank-up-show', async () => {
    await page.waitForFunction(() => !window.__app.game.casting, null, { timeout: 60000 });
    await page.waitForSelector('#rankup:not([hidden])', { timeout: 3000 }); await page.waitForTimeout(1300);
  });
  await shot('10c-rankup');
  await step('rank-up-dismiss', async () => { await page.keyboard.press('Space'); assert.ok(await page.locator('#rankup[hidden]').count() === 1, 'key dismisses rank-up'); });

  await step('help', async () => { await page.click('#helpBtn'); await page.waitForSelector('#help[open] .picto'); assert.equal(await page.locator('#signGrid .guide-sign').count(), 14); });
  await shot('11-help');
  await step('help-close', async () => { await page.click('#help [data-close]'); });

  await step('record', async () => { await page.click('#rankBtn'); await page.waitForSelector('#record[open] .ladder'); });
  await shot('12-record');
  await step('record-close', async () => { await page.click('#record [data-close]'); });

  await step('settings', async () => {
    await page.click('#muteBtn');
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('jutsu.settings')));
    assert.equal(s.muted, true); assert.equal(s.mode, 'freestyle');
    await page.click('#muteBtn');
    await page.click('#voiceBtn');
    if (await page.evaluate(() => 'speechSynthesis' in window)) {
      assert.equal(await page.getAttribute('#voiceBtn', 'aria-pressed'), 'true');
      assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('jutsu.settings')))).voice, true);
      await page.click('#voiceBtn');
    }
    await page.keyboard.press('Shift+Slash'); await page.waitForSelector('#help[open]'); await page.keyboard.press('Escape');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert.ok(keys.every((k) => k.startsWith('jutsu.')), 'only jutsu.* keys: ' + keys.join(','));
  });

  // errors from third-party model/runtime warnings are reported but only ours count
  const mine = errors.filter((e) => !/onnxruntime|ort-wasm|WebGPU|webgpu|GPU stall|swiftshader|powerPreference/i.test(e));
  if (mine.length) { failed += mine.length; console.log('  console errors:\n   ' + mine.join('\n   ')); }
  else console.log(`  no console errors${errors.length ? ` (${errors.length} runtime notices ignored)` : ''}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `FAILED (${failed})` : 'ALL OK');
process.exit(failed ? 1 : 0);
