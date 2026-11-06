// PixiJS stage: mirrored camera video + effect layers, and the `ctx` object every effect receives.
// Contract for effect authors lives in ARCHITECTURE.md.
import * as PIXI from 'pixi.js';
import * as filters from 'pixi-filters';
import { PALETTES, lerpColor } from './palettes.js';
import { sfx } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);
const val = (v) => (typeof v === 'function' ? v() : v);
// number | [min,max] | () => number, and ranges may contain functions too
// [min,max] numbers -> random number in range; any other array -> random element; function -> its result.
const pick = (v) => (Array.isArray(v) ? (typeof v[0] === 'number' && v.length === 2 ? rand(val(v[0]), val(v[1])) : val(v[Math.floor(Math.random() * v.length)])) : val(v));
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

// ---------- procedural fallback textures ----------
function canvasTex(size, draw, h = size) {
  const c = document.createElement('canvas'); c.width = size; c.height = h;
  draw(c.getContext('2d'), size, h);
  return PIXI.Texture.from(c);
}
function makeProcedural() {
  const soft = canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const dot = canvasTex(32, (g, s) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 1, 0, 7); g.fill(); });
  const spark = canvasTex(128, (g, w, h) => {
    const r = g.createLinearGradient(0, 0, w, 0);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 7); g.fill();
  }, 16);
  const ring = canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const smoke = canvasTex(128, (g, s) => {
    for (let i = 0; i < 14; i++) {
      const x = s / 2 + rand(-s / 5, s / 5), y = s / 2 + rand(-s / 5, s / 5), rr = rand(s / 6, s / 3);
      const r = g.createRadialGradient(x, y, 0, x, y, rr);
      r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    }
  });
  const shard = canvasTex(64, (g, s) => {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s * 0.8, s * 0.6); g.lineTo(s / 2, s); g.lineTo(s * 0.2, s * 0.6); g.closePath(); g.fill();
  });
  return { soft, dot, spark, ring, smoke, shard };
}
const FALLBACK = [[/flame|fire|magic|light|glow|flare|muzzle/, 'soft'], [/smoke|cloud|dust|dirt/, 'smoke'], [/spark|trace|slash|streak/, 'spark'], [/circle|ring/, 'ring'], [/shard|ice|rock|star/, 'shard']];

// ---------- particles ----------
class Particles {
  constructor() { this.live = []; this.pool = []; }
  spawn(parent, cfg, tex, x, y) {
    let s = this.pool.pop();
    while (s && s.destroyed) s = this.pool.pop();
    if (!s) s = new PIXI.Sprite();
    s.texture = tex; s.anchor.set(0.5); s.blendMode = cfg.blend ?? 'add'; s.visible = true;
    const ang = pick(cfg.angle ?? [0, Math.PI * 2]), sp = pick(cfg.speed ?? [50, 150]);
    const rad = pick(cfg.radius ?? 0), ra = Math.random() * Math.PI * 2;
    const size = cfg.size ?? [40, 0];
    const p = {
      s, x: x + Math.cos(ra) * rad, y: y + Math.sin(ra) * rad, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      life: pick(cfg.life ?? [600, 1000]), age: 0, size0: pick(size[0]), size1: pick(size[1]),
      a0: (cfg.alpha ?? [1, 0])[0], a1: (cfg.alpha ?? [1, 0])[1], colors: [].concat(cfg.color ?? 0xffffff),
      g: cfg.gravity ?? 0, drag: cfg.drag ?? 0, spin: pick(cfg.spin ?? 0), rotV: !!cfg.rotateToVelocity,
      ax: cfg.accel?.[0] ?? 0, ay: cfg.accel?.[1] ?? 0, stretch: cfg.stretch ?? 0,
    };
    s.rotation = cfg.rotation != null ? pick(cfg.rotation) : Math.random() * Math.PI * 2;
    parent.addChild(s); this.live.push(p);
    this.apply(p, 0);
    return p;
  }
  apply(p, t) {
    const sz = p.size0 + (p.size1 - p.size0) * t;
    const w = p.s.texture.width || 1;
    p.s.scale.set(sz / w);
    if (p.stretch) p.s.scale.x *= 1 + p.stretch * Math.hypot(p.vx, p.vy) / 300;
    p.s.alpha = p.a0 + (p.a1 - p.a0) * t;
    const c = p.colors;
    if (c.length === 1) p.s.tint = c[0];
    else { const f = t * (c.length - 1), i = Math.min(c.length - 2, Math.floor(f)); p.s.tint = lerpColor(c[i], c[i + 1], f - i); }
    p.s.position.set(p.x, p.y);
  }
  update(dt) {
    const k = dt / 1000;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life || p.s.destroyed) { this.kill(i); continue; }
      const damp = Math.max(0, 1 - p.drag * k);
      p.vx = (p.vx + p.ax * k) * damp; p.vy = (p.vy + (p.g + p.ay) * k) * damp;
      p.x += p.vx * k; p.y += p.vy * k;
      p.s.rotation = p.rotV ? Math.atan2(p.vy, p.vx) : p.s.rotation + p.spin * k;
      this.apply(p, p.age / p.life);
    }
  }
  kill(i) { const p = this.live[i]; if (!p.s.destroyed) { p.s.removeFromParent(); this.pool.push(p.s); } this.live.splice(i, 1); }
  /** Return to the pool every live particle whose parent is in `parents` (before those parents are destroyed). */
  release(parents) { for (let i = this.live.length - 1; i >= 0; i--) if (parents.includes(this.live[i].s.parent)) this.kill(i); }
  clear() { while (this.live.length) this.kill(this.live.length - 1); }
}

// ---------- stage ----------
export async function createStage(host, video, { manual = false } = {}) {
  const app = new PIXI.Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl' });
  host.appendChild(app.canvas);
  const root = new PIXI.Container();          // shaken / zoomed / filtered
  const overlay = new PIXI.Container();       // flashes and tints, never shaken
  app.stage.addChild(root, overlay);
  const layers = {};
  for (const n of ['back', 'video', 'clones', 'fx', 'front']) root.addChild(layers[n] = new PIXI.Container());

  const proc = makeProcedural();
  const textures = {};
  try {
    const man = await (await fetch(new URL('../../assets/manifest.json', import.meta.url))).json();
    const entries = Object.entries(man.textures || {});
    await Promise.all(entries.map(async ([k, url]) => {
      try { textures[k] = await PIXI.Assets.load(new URL('../../' + url, import.meta.url).href); } catch { /* missing file: fall back */ }
    }));
  } catch { /* no manifest yet */ }
  const has = (name) => !!(textures[name] || proc[name]);
  function tex(name) {
    if (name instanceof PIXI.Texture) return name;
    if (textures[name]) return textures[name];
    if (proc[name]) return proc[name];
    for (const [re, f] of FALLBACK) if (re.test(name)) return proc[f];
    return proc.soft;
  }

  // Camera video, mirrored, cover-fit.
  let videoSprite = null;
  const vsize = () => ({ vw: video?.videoWidth || 640, vh: video?.videoHeight || 480 });
  function coverScale() { const { vw, vh } = vsize(); return Math.max(app.screen.width / vw, app.screen.height / vh); }
  function placeLikeVideo(sp) {
    const s = coverScale();
    sp.anchor.set(0.5); sp.position.set(app.screen.width / 2, app.screen.height / 2);
    sp.scale.set(-s * (vsize().vw / (sp.texture.width || vsize().vw)), s * (vsize().vh / (sp.texture.height || vsize().vh)));
  }
  function attachVideo() {
    if (!video || videoSprite) return;
    const source = new PIXI.VideoSource({ resource: video, autoPlay: false, updateFPS: 0 });
    videoSprite = new PIXI.Sprite(new PIXI.Texture({ source }));
    layers.video.addChild(videoSprite);
  }
  /** raw video pixel coords -> screen coords (accounts for mirror + cover crop) */
  function toScreen(vx, vy) {
    const { vw, vh } = vsize(), s = coverScale();
    return { x: app.screen.width / 2 - (vx - vw / 2) * s, y: app.screen.height / 2 + (vy - vh / 2) * s };
  }

  // Anchors fed by the vision layer in raw video pixels; smoothed into screen space.
  const raw = { mouth: null, hands: [], signBox: null, face: null };
  const smooth = {};
  function screenAnchor(name) {
    const W = app.screen.width, H = app.screen.height;
    const hands = raw.hands.map((h) => toScreen(h.x, h.y));
    const box = raw.signBox && toScreen(raw.signBox.x + raw.signBox.w / 2, raw.signBox.y + raw.signBox.h / 2);
    const handsC = hands.length ? { x: hands.reduce((a, h) => a + h.x, 0) / hands.length, y: hands.reduce((a, h) => a + h.y, 0) / hands.length } : box;
    const mouth = raw.mouth && toScreen(raw.mouth.x, raw.mouth.y);
    const sortedH = [...hands].sort((a, b) => a.x - b.x);
    switch (name) {
      case 'mouth': return mouth || { x: W / 2, y: H * 0.38 };
      case 'face': return (raw.face && toScreen(raw.face.x, raw.face.y)) || mouth || { x: W / 2, y: H * 0.33 };
      case 'hands': return handsC || { x: W / 2, y: H * 0.62 };
      case 'leftHand': return sortedH[0] || handsC || { x: W * 0.35, y: H * 0.62 };   // screen-left
      case 'rightHand': return sortedH[sortedH.length - 1] || handsC || { x: W * 0.65, y: H * 0.62 };
      case 'center': return { x: W / 2, y: H / 2 };
      case 'ground': return { x: W / 2, y: H };
      case 'top': return { x: W / 2, y: 0 };
      default: return { x: W / 2, y: H / 2 };
    }
  }
  function anchor(name) {
    const target = screenAnchor(name);
    const cur = smooth[name] || (smooth[name] = { ...target });
    cur.x += (target.x - cur.x) * 0.35; cur.y += (target.y - cur.y) * 0.35;
    return { x: cur.x, y: cur.y };
  }
  function handScale() {
    const h = raw.hands[0];
    return h?.size ? h.size * coverScale() : Math.min(app.screen.width, app.screen.height) * 0.12;
  }

  // Person cutout (segmentation) supplied by tracking.js; null until enabled.
  let personCanvas = null, personTex = null, personRequest = null;

  // ---------- time ----------
  const tickers = new Set();
  const particles = new Particles();
  let shakeAmp = 0, shakeDecay = 0, zoom = 0, zoomDecay = 0;
  function update(dt) {
    dt = Math.min(dt, 50);
    if (videoSprite) placeLikeVideo(videoSprite);
    if (personTex && personCanvas) personTex.source.update();
    for (const t of [...tickers]) if (t(dt) === false) tickers.delete(t);
    particles.update(dt);
    shakeAmp = Math.max(0, shakeAmp - shakeDecay * dt);
    zoom = Math.max(0, zoom - zoomDecay * dt);
    const W = app.screen.width, H = app.screen.height;
    root.pivot.set(W / 2, H / 2);
    root.position.set(W / 2 + rand(-shakeAmp, shakeAmp), H / 2 + rand(-shakeAmp, shakeAmp));
    root.scale.set(1 + zoom + (2 * shakeAmp) / Math.max(1, Math.min(W, H))); // overscan so shake never shows the page edge
  }
  if (manual) app.ticker.stop(); else app.ticker.add((t) => update(t.deltaMS));

  // ---------- effect context ----------
  let current = null;
  const texOf = (n) => tex(Array.isArray(n) ? choose(n) : n || 'soft');
  function makeCtx(ambient = false) {
    const own = { containers: [], tickers: new Set(), filters: [], emitters: [] };
    const start = { t: 0 };
    const reg = (fn) => { own.tickers.add(fn); tickers.add(fn); return fn; };
    const W = () => app.screen.width, H = () => app.screen.height;
    const mk = (layer) => { const c = new PIXI.Container(); layers[layer].addChild(c); own.containers.push(c); return c; };
    const fxC = mk('fx'), frontC = mk('front'), backC = mk('back'), clonesC = mk('clones');
    const overC = new PIXI.Container(); overlay.addChild(overC); own.containers.push(overC);
    const layerOf = (l) => ({ fx: fxC, front: frontC, back: backC, clones: clonesC, overlay: overC }[l || 'fx']);
    reg((dt) => { start.t += dt; });

    const ctx = {
      PIXI, filters, app, ease, rand, pick, choose, sfx,
      get W() { return W(); }, get H() { return H(); },
      /** ms since the effect started */
      get t() { return start.t; },
      layers: { fx: fxC, front: frontC, back: backC, clones: clonesC, overlay: overC },
      palette: (name) => PALETTES[name] || PALETTES.chakra,
      tex, has,
      anchor, handScale,
      hands: () => raw.hands.map((h) => ({ ...toScreen(h.x, h.y), size: (h.size || 0) * coverScale() })),
      add(obj, layer) { layerOf(layer).addChild(obj); return obj; },
      /** fn(dtMs, tMs) each frame; return false to stop. Auto-removed when the effect ends. */
      tick(fn) { return reg((dt) => fn(dt, start.t)); },
      wait(ms) { return new Promise((res) => { let e = 0; reg((dt) => { e += dt; if (e >= ms) { res(); return false; } }); }); },
      /** Animate p from 0..1 over ms. fn(easedP, rawP). */
      tween(ms, fn, e = ease.linear) {
        return new Promise((res) => { let el = 0; fn(e(0), 0); reg((dt) => { el += dt; const p = Math.min(1, el / ms); fn(e(p), p); if (p >= 1) { res(); return false; } }); });
      },
      shake(amp = 10, ms = 400) { shakeAmp = Math.max(shakeAmp, amp); shakeDecay = amp / ms; },
      zoomPunch(amount = 0.06, ms = 300) { zoom = Math.max(zoom, amount); zoomDecay = amount / ms; },
      /** Full-screen color flash on the overlay (not shaken). */
      flash(color = 0xffffff, ms = 250, alpha = 0.8, blend = 'add') {
        const g = new PIXI.Graphics().rect(0, 0, W(), H()).fill(color); g.blendMode = blend; overC.addChild(g);
        return ctx.tween(ms, (p) => { g.alpha = alpha * (1 - p); }, ease.outCubic).then(() => g.destroy());
      },
      /** Hold a color wash: returns {set(alpha), fade(ms)}. */
      tint(color, alpha = 0.3, blend = 'normal') {
        const g = new PIXI.Graphics().rect(0, 0, W(), H()).fill(color); g.alpha = alpha; g.blendMode = blend; overC.addChild(g);
        return { g, set: (a) => { g.alpha = a; }, fade: (ms = 400) => { const a0 = g.alpha; return ctx.tween(ms, (p) => { g.alpha = a0 * (1 - p); }).then(() => g.destroy()); } };
      },
      /** Add a filter to the whole scene (video + fx) for the duration of the effect. */
      filter(f) { own.filters.push(f); root.filters = [...(root.filters || []), f]; return f; },
      removeFilter(f) { root.filters = (root.filters || []).filter((x) => x !== f); },
      /** One-shot burst. cfg: see ARCHITECTURE.md (Particles). */
      burst(cfg) {
        const parent = layerOf(cfg.layer);
        const x = val(cfg.x ?? W() / 2), y = val(cfg.y ?? H() / 2);
        for (let i = 0; i < (cfg.count ?? 20); i++) particles.spawn(parent, cfg, texOf(cfg.tex), x, y);
      },
      /** Continuous emitter. Returns {stop(), cfg}. x/y may be functions (follow anchors). */
      emitter(cfg) {
        const parent = layerOf(cfg.layer);
        let acc = 0, el = 0, on = true;
        const h = { cfg, stop() { on = false; } };
        reg((dt) => {
          if (!on) return false;
          el += dt; if (cfg.duration && el > cfg.duration) return false;
          acc += (val(cfg.rate) ?? 60) * dt / 1000;
          const x = val(cfg.x ?? W() / 2), y = val(cfg.y ?? H() / 2);
          while (acc >= 1) { acc--; particles.spawn(parent, cfg, texOf(cfg.tex), x, y); }
        });
        return h;
      },
      /** Resolves true when the person-cutout texture is live (segmentation), false if unavailable. */
      async personReady(timeoutMs = 1500) {
        if (personTex) return true;
        if (!personRequest) return false;
        const ok = await Promise.race([personRequest(), new Promise((r) => setTimeout(() => r(false), timeoutMs))]);
        return !!(ok && personTex);
      },
      /** New sprite of the segmented person placed exactly over the user (mirrored). Null if unavailable. */
      personSprite() { if (!personTex) return null; const s = new PIXI.Sprite(personTex); placeLikeVideo(s); return s; },
      /** New sprite showing the full camera frame placed like the background video. */
      videoSprite() { if (!videoSprite) return null; const s = new PIXI.Sprite(videoSprite.texture); placeLikeVideo(s); return s; },
      /** Graphics helper */
      g() { return new PIXI.Graphics(); },
    };
    ctx._cleanup = () => {
      for (const f of own.tickers) tickers.delete(f);
      root.filters = (root.filters || []).filter((x) => !own.filters.includes(x));
      particles.release(own.containers); // pool the effect's particles before their parents are destroyed
      for (const c of own.containers) c.destroy({ children: true });
    };
    return ctx;
  }

  async function play(effectFn, params = {}, { maxMs = 14000 } = {}) {
    cancel();
    const ctx = makeCtx();
    current = ctx;
    try {
      await Promise.race([effectFn(ctx, params), ctx.wait(maxMs)]);
    } catch (e) { console.error('effect failed', e); }
    finally {
      if (current === ctx) { ctx._cleanup(); current = null; }
    }
  }
  /** Run a small effect alongside the main one (sign pulses). Never cancels anything. */
  async function playAmbient(effectFn, params = {}) {
    const ctx = makeCtx(true);
    try { await Promise.race([effectFn(ctx, params), ctx.wait(4000)]); } catch (e) { console.error('ambient effect failed', e); }
    finally { ctx._cleanup(); }
  }
  function cancel() { if (current) { current._cleanup(); current = null; } }

  return {
    app, layers, PIXI,
    attachVideo, toScreen, anchor,
    setAnchors(a) { Object.assign(raw, a); },
    setPersonSource(canvas, request) {
      personRequest = request;
      if (canvas && canvas !== personCanvas) { personCanvas = canvas; personTex = PIXI.Texture.from(canvas); }
    },
    play, playAmbient, cancel,
    get playing() { return !!current; },
    /** manual mode only: advance time and render (used by dev/fx.html screenshots) */
    // yields a macrotask per frame so effect code awaiting ctx.wait()/tween() keeps running
    async step(ms, frame = 16) { for (let t = 0; t < ms; t += frame) { update(frame); await new Promise((r) => setTimeout(r, 0)); } app.render(); },
  };
}
