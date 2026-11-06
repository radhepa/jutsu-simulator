// UI shell: wires the Game (js/game.js) to the intro, Training/Freestyle panels, handbook,
// cast callout, progression and settings. All state is in localStorage under "jutsu.*".
import { Game } from './game.js';
import { setMuted, initAudio, sfx } from './engine/audio.js';
import { SIGNS } from './engine/sequencer.js';
import { SIGN_INFO, seal, signTile, esc } from './ui/signs.js';
import * as P from './ui/progress.js';
import { createHandbook, splitName, elTag, rankSeal, srcBadge, starRow, fmtMs } from './ui/handbook.js';

const $ = (id) => document.getElementById(id);
const PUBLIC_URL = 'https://radhepa.github.io/jutsu-simulator/';
const SETTINGS = 'jutsu.settings';

let settings = { muted: false, voice: false, mode: 'guided', target: null };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS) || '{}')); } catch { /* corrupt: defaults */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* private mode */ } };

let progress = P.load();
const ui = { ready: false, mode: settings.mode, target: null, step: 0, buffer: [], t0: 0, raf: 0, pendingRank: null, cueTimer: 0 };
const game = new Game();
window.__app = { game, ui, P };   // handle for tests and the console

// ---------- boot ----------
renderQR();
renderHelp();
applySound();
applyVoice();
try {
  await game.init($('stage'));
} catch (e) {
  console.error(e);
  $('introStatus').textContent = 'This browser could not start the effects stage (WebGL). Try a recent Chrome, Edge or Safari.';
  $('introStatus').classList.add('err');
  $('startBtn').disabled = true;
}
const allElements = [...new Set(game.jutsu.map((j) => j.element))];
const handbook = createHandbook({
  game, getProgress: () => progress,
  onTrain: (id) => { handbook.close(); setTarget(id); setMode('guided'); },
  onWatch: (id) => { handbook.close(); watch(id); },
});
ui.target = game.byId[settings.target] || game.byId['great-fireball'] || [...game.jutsu].sort((a, b) => 'EDCBAS'.indexOf(a.rank) - 'EDCBAS'.indexOf(b.rank))[0];
setMode(ui.mode === 'freestyle' ? 'freestyle' : 'guided');
renderRank();
document.body.classList.add('booted');

// ---------- intro / camera ----------
$('startBtn').onclick = async () => {
  const b = $('startBtn');
  if (!navigator.mediaDevices?.getUserMedia) {   // http:// on a LAN address, or an in-app browser without camera access
    $('introStatus').textContent = 'This page can’t reach a camera here. Open it over https:// in Chrome, Edge, Safari or Firefox.';
    $('introStatus').classList.add('err'); return;
  }
  b.disabled = true; b.setAttribute('aria-busy', 'true'); b.querySelector('span').textContent = 'Starting…';
  $('introStatus').classList.remove('err');
  try {
    await game.start();
  } catch {
    b.disabled = false; b.querySelector('span').textContent = 'Try again';
  }
  b.removeAttribute('aria-busy');
};
$('introBook').onclick = () => handbook.open();
game.addEventListener('status', (e) => { if (!ui.ready) $('introStatus').textContent = e.detail.text; });
game.addEventListener('error', (e) => {
  const m = e.detail.message || '';
  const msg = m === 'Camera permission was denied.' ? 'Camera permission was denied. Allow the camera in your browser’s site settings, then try again.'
    : m === 'No camera found.' ? 'No camera found. Plug one in or open this page on your phone, then try again.'
    : /busy|could not start|in use|NotReadable|device in use/i.test(m) ? 'The camera is busy in another app or tab. Close it there, then try again.'
    : /onnx|model|wasm|fetch/i.test(m) ? 'The hand-sign model failed to load. Check your connection, then try again.' : m;
  if (!ui.ready) { $('introStatus').textContent = msg; $('introStatus').classList.add('err'); } else toast(esc(msg), 'warn');
});
game.addEventListener('ready', () => {
  ui.ready = true;
  document.body.classList.add('live');
  $('intro').classList.add('gone');
  setTimeout(() => { $('intro').hidden = true; }, 600);
  $('readout').hidden = false;
  setMode(ui.mode);
});

// ---------- modes ----------
for (const t of document.querySelectorAll('.modes [role=tab]')) {
  t.onclick = () => setMode(t.dataset.mode);
  t.onkeydown = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const o = t.dataset.mode === 'guided' ? 'freestyle' : 'guided'; setMode(o); document.querySelector(`[data-mode=${o}]`).focus(); } };
}
function setMode(mode) {
  ui.mode = settings.mode = mode; saveSettings();
  for (const t of document.querySelectorAll('.modes [role=tab]')) { const on = t.dataset.mode === mode; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
  $('panelGuided').hidden = mode !== 'guided';
  $('panelFree').hidden = mode !== 'freestyle';
  document.body.dataset.mode = mode;
  ui.step = 0; ui.buffer = []; stopClock(true);
  if (mode === 'guided' && ui.target) game.setMode('guided', ui.target.id); else game.setMode(mode);
  if (mode === 'guided') renderGuided(); else renderFree();
  renderTrack();
  renderIntroTarget();
}
function setTarget(id) {
  ui.target = game.byId[id]; settings.target = id; saveSettings();
}

// ---------- training (guided) ----------
function renderGuided() {
  const j = ui.target; if (!j) { $('panelGuided').innerHTML = '<p class="cue">No jutsu loaded.</p>'; return; }
  const [pre, main] = splitName(j.name), e = progress.jutsu[j.id];
  $('panelGuided').innerHTML = `
    <div class="target">
      <p class="target-k" lang="ja">${esc(j.jp || '')}</p>
      <div class="target-txt">
        ${pre ? `<p class="target-pre">${esc(pre)}</p>` : ''}<h2>${esc(main)}</h2>
        <div class="target-meta">${rankSeal(j.rank)}${elTag(j.element)}${srcBadge(j.signsSource)}</div>
      </div>
    </div>
    <div class="cue" id="cue" aria-live="polite"></div>
    <dl class="stats">
      <div><dt>Best</dt><dd>${fmtMs(e?.best)}</dd></div>
      <div><dt>Mastery</dt><dd>${starRow(P.stars(e, j))}</dd></div>
      <div><dt>Casts</dt><dd>${e?.casts || 0}</dd></div>
    </dl>
    <div class="row">
      <button type="button" class="btn-quiet" id="pickBtn"><svg class="ic"><use href="#i-book"/></svg><span>Choose jutsu</span></button>
      <button type="button" class="btn-ink" id="watchBtn"><svg class="ic"><use href="#i-play"/></svg><span>Watch it</span></button>
    </div>`;
  $('pickBtn').onclick = () => handbook.open(j.id);
  $('watchBtn').onclick = () => watch(j.id);
  cueNext();
}
function cueNext() {
  const j = ui.target, s = j?.signs[ui.step]; if (!s || !$('cue')) return;
  const info = SIGN_INFO[s] || {};
  $('cue').className = 'cue';
  $('cue').innerHTML = `${seal(s, 'md')}<div><p class="cue-label">${ui.step ? `Seal ${ui.step + 1} of ${j.signs.length}` : `Begin with seal 1 of ${j.signs.length}`}</p>
    <p class="cue-sign">${esc(s)} <span lang="ja">${info.k}</span> <small>${esc(info.r)}</small></p>${info.hint ? `<p class="cue-hint">${esc(info.hint)}</p>` : ''}</div>`;
}
function cueMsg(html, cls) {
  const c = $(ui.mode === 'guided' ? 'cue' : 'freeCue'); if (!c) return;
  c.className = 'cue ' + (cls || ''); c.innerHTML = html;
}

game.addEventListener('progress', (e) => {
  const { step, total } = e.detail;
  ui.step = step;
  if (step === 1) startClock();
  renderTrack();
  if (step < total) cueNext();
});
game.addEventListener('wrong', (e) => {
  const { sign, expected } = e.detail;
  const tile = $('track').querySelector('.tile.now');
  tile?.classList.remove('nope'); void tile?.offsetWidth; tile?.classList.add('nope');
  cueMsg(`${seal(sign, 'md')}<div><p class="cue-label">That read as ${esc(sign)}</p><p class="cue-sign">Next is ${esc(expected)} <span lang="ja">${SIGN_INFO[expected]?.k || ''}</span></p>
    <p class="cue-hint">Drop your hands, then form ${esc(expected)}. Your progress is kept.</p></div>`, 'bad');
  clearTimeout(ui.cueTimer); ui.cueTimer = setTimeout(cueNext, 2600);
});
game.addEventListener('timeout', () => {
  ui.step = 0; stopClock(true); renderTrack();
  cueMsg(`<div><p class="cue-label">Sequence reset</p><p class="cue-sign">You paused for 15 seconds.</p><p class="cue-hint">Start again from seal 1.</p></div>`, 'warn');
  clearTimeout(ui.cueTimer); ui.cueTimer = setTimeout(cueNext, 3000);
});

// ---------- freestyle ----------
function renderFree() {
  const openers = {};
  for (const j of game.jutsu) openers[j.signs[0]] = (openers[j.signs[0]] || 0) + 1;
  const top = Object.entries(openers).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('panelFree').innerHTML = `
    <div class="cue" id="freeCue" aria-live="polite"></div>
    <div class="cands-head" id="candsHead" hidden><h3>Still reachable</h3><span id="candCount"></span></div>
    <ol class="cands" id="cands"></ol>
    <div class="openers" id="openers"><h3>Good first seals</h3><div class="opener-list">${top.map(([s, n]) => `<span class="opener">${seal(s, 'sm')}<span><b>${esc(s)}</b><small>opens ${n} jutsu</small></span></span>`).join('')}</div></div>`;
  freeIdle();
  renderCands([]);
}
function freeIdle() {
  cueMsg(`<div><p class="cue-label">Freestyle</p><p class="cue-sign">Form any seals, in any order.</p><p class="cue-hint">When only one jutsu fits, it fires. Otherwise pause for about a second and the sequence is judged.</p></div>`);
}
function renderCands(cands) {
  const list = $('cands'); if (!list) return;
  const n = ui.buffer.length;
  $('openers').hidden = n > 0;
  $('candsHead').hidden = n === 0;
  $('candCount').textContent = n ? `${cands.length} jutsu` : '';
  const sorted = [...cands].sort((a, b) => (a.signs.length - b.signs.length) || 'EDCBAS'.indexOf(a.rank) - 'EDCBAS'.indexOf(b.rank)).slice(0, 6);
  list.innerHTML = n ? sorted.map((j) => {
    const left = j.signs.length - n, next = j.signs[n];
    return `<li class="cand${left === 0 ? ' ready' : ''}"><span class="cand-k" lang="ja">${esc((j.jp || '').slice(0, 2))}</span>
      <span class="cand-body"><b>${esc(splitName(j.name)[1])}</b><span class="meter"><i style="width:${(n / j.signs.length) * 100}%"></i></span>
      <small>${left === 0 ? 'Complete. Pause to release.' : `${n} of ${j.signs.length} · next ${esc(next)}`}</small></span>
      ${next ? seal(next, 'sm') : rankSeal(j.rank)}</li>`;
  }).join('') + (cands.length > 6 ? `<li class="cand-more">and ${cands.length - 6} more</li>` : '') : '';
}
game.addEventListener('buffer', (e) => {
  const { buffer, candidates } = e.detail;
  const grew = buffer.length > ui.buffer.length;
  ui.buffer = buffer;
  if (buffer.length && !ui.t0) startClock();
  if (!buffer.length && !game.casting) stopClock(true);
  renderTrack(); renderCands(candidates);
  if (grew && buffer.length) {
    $('fizzle')?.remove();
    const only = candidates.length === 1 ? candidates[0] : null;
    cueMsg(`<div><p class="cue-label">${buffer.length} seal${buffer.length > 1 ? 's' : ''} formed</p><p class="cue-sign">${only ? `Locked on: ${esc(splitName(only.name)[1])}` : `${candidates.length} jutsu still possible`}</p>
      <p class="cue-hint">${only ? `Next: ${esc(only.signs[buffer.length] || 'release')}` : 'Keep going, or pause to release.'}</p></div>`);
  }
});
game.addEventListener('fizzle', (e) => {
  const { buffer, closest } = e.detail;
  stopClock(true);
  let match = 0; while (closest && match < buffer.length && closest.signs[match] === buffer[match]) match++;
  cueMsg(`<div><p class="cue-label">The chakra fizzled</p><p class="cue-sign">${esc(buffer.join(' · '))}</p><p class="cue-hint">No jutsu uses that sequence.</p></div>`, 'bad');
  $('fizzle')?.remove();
  if (closest && $('candsHead')) {
    const box = document.createElement('div'); box.className = 'fizzle'; box.id = 'fizzle';
    box.innerHTML = `<p class="cue-label">Did you mean</p><p class="fizzle-name">${esc(closest.name)}</p>
      <div class="fizzle-signs">${closest.signs.map((s, i) => signTile(s, { size: 'sm', cls: i < match ? 'done' : i === match ? 'miss' : '' })).join('')}</div>
      <p class="cue-hint">You matched ${match} of ${closest.signs.length}. ${closest.signs[match] ? `Seal ${match + 1} should be ${esc(closest.signs[match])}.` : ''}</p>
      <button type="button" class="btn-quiet" data-train><svg class="ic"><use href="#i-target"/></svg><span>Train it</span></button>`;
    box.querySelector('[data-train]').onclick = () => { setTarget(closest.id); setMode('guided'); };
    $('candsHead').before(box);
  }
});

// ---------- track (sign strip under the stage) ----------
function renderTrack() {
  const t = $('track');
  if (ui.mode === 'guided') {
    const j = ui.target; if (!j) { t.innerHTML = ''; return; }
    t.innerHTML = j.signs.map((s, i) => signTile(s, { size: 'lg', step: i + 1, cls: i < ui.step ? 'done' : i === ui.step ? 'now' : '' })).join('');
  } else {
    t.innerHTML = ui.buffer.length
      ? ui.buffer.map((s, i) => signTile(s, { size: 'lg', step: i + 1, cls: 'done' })).join('') + `<div class="tile ghost" aria-hidden="true"><span class="seal seal-lg"><span class="ghost-q">?</span></span><span class="tile-name">Next</span></div>`
      : `<p class="track-empty">Your seals appear here as you form them.</p>`;
  }
  const cur = t.querySelector('.tile.now') || t.lastElementChild;
  if (cur && t.scrollWidth > t.clientWidth) t.scrollTo({ left: cur.offsetLeft - t.clientWidth / 2 + cur.offsetWidth / 2, behavior: 'smooth' });
}

// ---------- live readout + clock ----------
let lastSign;
game.addEventListener('detect', (e) => {
  const { sign, score } = e.detail;
  const expected = ui.mode === 'guided' ? ui.target?.signs[ui.step] : null;
  const ro = $('readout');
  if (sign !== lastSign) {
    lastSign = sign;
    const known = sign && SIGN_INFO[sign];
    $('roSeal').innerHTML = known ? seal(sign, 'sm') : '';
    $('roName').textContent = known ? sign : 'No seal';
    ro.classList.toggle('none', !known);
  }
  ro.classList.toggle('match', !!sign && sign === expected);
  $('roBar').style.width = `${Math.round((sign ? score : 0) * 100)}%`;
  $('roPct').textContent = sign ? `${Math.round(score * 100)}%` : '';
});
function startClock() {
  ui.t0 = performance.now(); $('clock').hidden = false; $('clock').classList.remove('final');
  cancelAnimationFrame(ui.raf);
  const tick = () => { $('clockTxt').textContent = ((performance.now() - ui.t0) / 1000).toFixed(2); ui.raf = requestAnimationFrame(tick); };
  tick();
}
function stopClock(hide, ms) {
  cancelAnimationFrame(ui.raf); ui.t0 = 0;
  if (ms != null) { $('clockTxt').textContent = (ms / 1000).toFixed(2); $('clock').classList.add('final'); }
  if (hide) $('clock').hidden = true;
}

// ---------- cast moment ----------
function watch(id) {
  initAudio();   // a click: safe to unlock audio even before the camera
  if (game.casting) return;
  if (!ui.ready) document.body.classList.add('watching');
  game.cast(id, { preview: true });
}
game.addEventListener('cast', (e) => {
  const { jutsu: j, ms, preview } = e.detail;
  clearTimeout(ui.cueTimer);
  document.body.classList.add('casting');
  let res = null;
  if (!preview && ms != null) {
    const before = P.rankOf(progress.xp);
    res = P.recordCast(progress, j, ms, { mode: ui.mode, allElements, total: game.jutsu.length });
    res.from = before.frac;
    P.save(progress);
    renderRank(true);
    stopClock(false, ms);
    if (ui.mode === 'guided') { ui.step = j.signs.length; renderTrack(); }
  }
  showCallout(j, res, ms);
  speak(j);
  if (res) celebrate(j, res, ms);
});
game.addEventListener('castEnd', () => {
  document.body.classList.remove('casting', 'watching');
  $('callout').classList.remove('show');
  ui.step = 0; ui.buffer = [];
  stopClock(true);
  $('fizzle')?.remove();
  if (ui.mode === 'guided') renderGuided(); else { freeIdle(); renderCands([]); }
  renderTrack();
  handbook.refresh();
  if (ui.pendingRank) { rankUp(ui.pendingRank); ui.pendingRank = null; }
});

function showCallout(j, res, ms) {
  const c = $('callout');
  $('coKanji').textContent = j.jp || '';
  $('coRomaji').textContent = j.romaji && j.romaji !== j.name ? j.romaji : '';
  $('coName').textContent = j.name;
  $('coRank').textContent = j.rank; $('coRank').className = `rankseal r-${j.rank}`;
  $('coXp').innerHTML = res
    ? `<b>+${res.xp} XP</b>${res.speed.label ? `<em>${esc(res.speed.label)}</em>` : ''}<span class="co-ms">${fmtMs(ms)}</span><span class="xpbar co" aria-hidden="true"><i style="width:${Math.round(res.from * 100)}%"></i></span>`
    : '<span class="co-tag">Preview</span>';
  c.dataset.el = j.element;
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  // the XP bar fills after the names settle; a rank-up fills it to the end
  if (res) setTimeout(() => { const i = $('coXp').querySelector('i'); if (i) i.style.width = `${res.rankUp ? 100 : Math.round(P.rankOf(progress.xp).frac * 100)}%`; }, 900);
}
function celebrate(j, res, ms) {
  const name = esc(splitName(j.name)[1]);
  if (res.isNew) toast(`<b>Jutsu unlocked</b><span>${name} is now in your record.</span>`, 'unlock', j.jp);
  else if (res.isBest) toast(`<b>New best: ${fmtMs(ms)}</b><span>${name}</span>`, 'best');
  if (res.starUp && !res.isNew) toast(`<b>Mastery ${'★'.repeat(res.stars)}</b><span>${name}</span>`, 'best');
  for (const a of res.achievements) toast(`<b>${esc(a.name)}</b><span>${esc(a.desc)}</span>`, 'ach', '章');
  if (res.rankUp) ui.pendingRank = res.rankUp;
}
function rankUp(r) {
  sfx.rankUp();
  $('ruKanji').textContent = r.k; $('ruName').textContent = r.name;
  const el = $('rankup'); el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  const done = () => { el.hidden = true; el.onclick = null; document.removeEventListener('keydown', done); clearTimeout(t); };
  el.onclick = done; document.addEventListener('keydown', done); const t = setTimeout(done, 3600);
}

// ---------- toasts ----------
function toast(html, kind = '', k = '') {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstElementChild.remove();
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `${k ? `<span class="toast-k" lang="ja">${esc(k.slice(0, 2))}</span>` : ''}<span class="toast-txt">${html}</span>`;
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3600);
}

// ---------- rank + record ----------
function renderRank(gain) {
  const r = P.rankOf(progress.xp);
  if (gain) { const c = $('rankBtn'); c.classList.remove('gain'); void c.offsetWidth; c.classList.add('gain'); }
  $('rankKanji').textContent = r.k;
  $('rankName').textContent = r.name;
  $('xpFill').style.width = `${Math.round(r.frac * 100)}%`;
  $('rankBtn').setAttribute('aria-label', `${r.name}, ${progress.xp} XP. Open your ninja record.`);
}
$('rankBtn').onclick = () => {
  const r = P.rankOf(progress.xp), learned = Object.keys(progress.jutsu).filter((id) => game.byId[id]).length;
  $('recordBody').innerHTML = `
    <div class="rec-now"><span class="rec-k" lang="ja">${r.k}</span><div><p class="rec-name">${r.name}</p>
      <p class="rec-sub">${progress.xp} XP${r.next ? ` · ${r.next.xp - progress.xp} to ${r.next.name}` : ' · the highest rank'}</p>
      <span class="xpbar big"><i style="width:${Math.round(r.frac * 100)}%"></i></span></div></div>
    <ol class="ladder">${P.RANKS.map((x, i) => `<li class="${i < r.index ? 'past' : i === r.index ? 'cur' : ''}"><span lang="ja">${x.k}</span><b>${x.name}</b><small>${x.xp} XP</small></li>`).join('')}</ol>
    <p class="rec-line"><b>${learned}</b> of ${game.jutsu.length} jutsu learned · <b>${progress.casts}</b> cast${progress.casts === 1 ? '' : 's'} · <b>${Object.keys(progress.achievements).length}</b> of ${P.ACHIEVEMENTS.length} achievements</p>
    <h3>Achievements</h3>
    <ul class="achs">${P.ACHIEVEMENTS.map((a) => `<li class="${progress.achievements[a.id] ? 'got' : ''}"><span class="ach-k" aria-hidden="true">${progress.achievements[a.id] ? '章' : '—'}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></li>`).join('')}</ul>
    <h3>How XP works</h3>
    <p class="rec-help">Each performed cast earns XP by rank (E 10 up to S 140), multiplied by speed: under 0.6 s per seal doubles it. Freestyle casts earn 25% more, and the first cast of any jutsu adds 25. Watching a jutsu in the handbook earns nothing.</p>`;
  $('record').showModal();
};

// ---------- help sheet ----------
function renderHelp() {
  $('signGrid').innerHTML = SIGNS.map((s) => `<div class="guide-sign">${signTile(s, { size: 'md' })}<p>${esc(SIGN_INFO[s].hint || 'Hold the pose square to the camera until the readout names it.')}</p></div>`).join('');
}
$('helpBtn').onclick = () => $('help').showModal();
for (const d of document.querySelectorAll('dialog.sheet')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}

// ---------- sound + voice ----------
function applySound() {
  setMuted(settings.muted);
  const b = $('muteBtn'); b.setAttribute('aria-pressed', String(settings.muted));
  b.title = settings.muted ? 'Sound off' : 'Sound on';
  b.setAttribute('aria-label', settings.muted ? 'Turn sound on' : 'Turn sound off');
  b.querySelector('use').setAttribute('href', settings.muted ? '#i-muted' : '#i-sound');
}
$('muteBtn').onclick = () => { settings.muted = !settings.muted; saveSettings(); applySound(); if (settings.muted) speechSynthesis?.cancel(); };
const jaVoice = () => (window.speechSynthesis?.getVoices() || []).find((v) => /^ja(-|_|$)/i.test(v.lang));
function applyVoice() {
  const b = $('voiceBtn'); b.setAttribute('aria-pressed', String(settings.voice));
  b.title = settings.voice ? 'Japanese voice callout on' : 'Japanese voice callout off';
  b.setAttribute('aria-label', settings.voice ? 'Turn Japanese voice off' : 'Turn Japanese voice on');
  b.querySelector('use').setAttribute('href', settings.voice ? '#i-voice' : '#i-voice-off');
}
$('voiceBtn').onclick = () => {
  if (!('speechSynthesis' in window)) { toast('<b>No speech support</b><span>This browser cannot speak the callout.</span>', 'warn'); return; }
  settings.voice = !settings.voice; saveSettings(); applyVoice();
  if (settings.voice && speechSynthesis.getVoices().length && !jaVoice()) toast('<b>No Japanese voice found</b><span>Install a Japanese voice in your system settings to hear the callout.</span>', 'warn');
};
function speak(j) {
  if (!settings.voice || settings.muted || !j.jp || !window.speechSynthesis) return;
  const v = jaVoice(); if (!v) return;
  const u = new SpeechSynthesisUtterance(j.jp.replace(/・/g, '、'));
  u.voice = v; u.lang = v.lang; u.rate = 1; u.pitch = 0.8;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// ---------- bar ----------
$('bookBtn').onclick = () => (handbook.isOpen ? handbook.close() : handbook.open());
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, dialog')) return;
  if (e.key === '?') $('help').showModal();
});

function renderIntroTarget() {
  const j = ui.target;
  $('introTarget').innerHTML = j && ui.mode === 'guided'
    ? `First up: <b>${esc(splitName(j.name)[1])}</b>, ${j.signs.length} seals, rank ${esc(j.rank)}.` : 'Freestyle: any sequence you know.';
}

// ---------- QR (qrcode-generator, MIT, loaded as a classic script) ----------
function renderQR() {
  const local = !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.hostname.endsWith('.localhost');
  const url = local ? PUBLIC_URL : location.origin + location.pathname;
  const a = $('qrLink'); a.href = url; a.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (typeof window.qrcode !== 'function') { $('qr').hidden = true; return; }
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  $('qr').innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#efe4cb"/><path d="${d}" fill="#15110c"/></svg>`;
}
