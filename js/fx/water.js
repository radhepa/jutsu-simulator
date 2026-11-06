// Water archetypes: waterShark, waterPrison, waterBullets, iceShards, mist, waterWave.
// Look rule: water BODIES are normal-blend tinted blob/smoke sprites or filled shapes (they read as a mass,
// never white); foam, highlights and sparkles are additive; droplets fall with gravity. While water is on
// screen one scene-wide DisplacementFilter (procedural tileable noise) sells refraction/ripples.
// Unused optional variants fall back: waterWave vortex -> collision, waterBullets bullet/needles -> fang,
// iceShards storm -> spikes.

const TAU = Math.PI * 2;
const SMOKES = ['smoke1', 'smoke2', 'smoke4', 'smoke7', 'smoke8'];
const mix = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
};
const unit = (ctx) => Math.min(ctx.W, ctx.H);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function spr(ctx, tex, tint = 0xffffff, blend = 'normal', alpha = 1) {
  const s = new ctx.PIXI.Sprite(ctx.tex(tex));
  s.anchor.set(0.5); s.tint = tint; s.blendMode = blend; s.alpha = alpha;
  return s;
}
const setSize = (s, d) => s.scale.set(d / (s.texture.width || 1));

// ---------- procedural textures (cached per app; never destroyed by effect cleanup) ----------
const cache = new WeakMap();
function canvasTex(ctx, key, w, h, draw, repeat = false) {
  let m = cache.get(ctx.app); if (!m) cache.set(ctx.app, m = {});
  if (m[key] && !m[key].destroyed) return m[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = ctx.PIXI.Texture.from(c);
  if (repeat) t.source.style.addressMode = 'repeat';
  return (m[key] = t);
}
/** Tileable smooth noise in R/G (sum of integer-frequency sines) for DisplacementFilter. */
const noiseTex = (ctx) => canvasTex(ctx, 'noise', 256, 256, (g, S) => {
  const img = g.createImageData(S, S), d = img.data;
  const waves = () => Array.from({ length: 7 }, () => ({ fx: Math.round(ctx.rand(-4, 4)) || 1, fy: Math.round(ctx.rand(-4, 4)) || -2, ph: ctx.rand(0, TAU), a: ctx.rand(0.4, 1) }));
  const wr = waves(), wg = waves();
  const f = (w, x, y) => { let s = 0, n = 0; for (const k of w) { s += k.a * Math.sin(TAU * (k.fx * x + k.fy * y) / S + k.ph); n += k.a; } return 1.8 * s / n; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; d[i] = 128 + 127 * f(wr, x, y); d[i + 1] = 128 + 127 * f(wg, x, y); d[i + 2] = 128; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}, true);
/** Water sphere: faint centre, denser toward a bright rim. */
const orbTex = (ctx) => canvasTex(ctx, 'orb', 256, 256, (g, S) => {
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,.10)'); r.addColorStop(0.7, 'rgba(255,255,255,.28)'); r.addColorStop(0.9, 'rgba(255,255,255,.6)');
  r.addColorStop(0.97, 'rgba(255,255,255,.95)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
});
/** A single faceted ice spear pointing up (tip at the top). Two-tone facets + bright ridge. */
const spearTex = (ctx) => canvasTex(ctx, 'spear', 48, 256, (g, w, h) => {
  const P = (pts, fill) => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fillStyle = fill; g.fill(); };
  P([[24, 0], [24, h], [12, h - 6], [5, 70]], 'rgba(255,255,255,.97)');
  P([[24, 0], [43, 70], [36, h - 6], [24, h]], 'rgba(178,190,205,.95)');
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 2); g.lineTo(24, h - 4); g.stroke();
  g.strokeStyle = 'rgba(90,110,140,.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(5, 70); g.lineTo(24, 0); g.lineTo(43, 70); g.lineTo(36, h - 6); g.moveTo(5, 70); g.lineTo(12, h - 6); g.stroke();
});
/** Ice mirror pane: glassy fill, frosted border, diagonal glare band. */
const paneTex = (ctx) => canvasTex(ctx, 'pane', 160, 256, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(6, 6, w - 12, h - 12);
  const l = g.createLinearGradient(0, 0, w, h);
  l.addColorStop(0.25, 'rgba(255,255,255,0)'); l.addColorStop(0.36, 'rgba(255,255,255,.55)'); l.addColorStop(0.42, 'rgba(255,255,255,0)');
  l.addColorStop(0.5, 'rgba(255,255,255,.25)'); l.addColorStop(0.53, 'rgba(255,255,255,0)');
  g.fillStyle = l; g.fillRect(6, 6, w - 12, h - 12);
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
  g.strokeStyle = 'rgba(150,170,200,.9)'; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, h - 20);
  for (let i = 0; i < 26; i++) { // frost crystals creeping in from the frame
    const side = i % 4, x = side < 2 ? Math.random() * w : (side === 2 ? 8 : w - 8), y = side < 2 ? (side ? h - 8 : 8) : Math.random() * h;
    const a = Math.atan2(h / 2 - y, w / 2 - x) + (Math.random() - 0.5), L = 10 + Math.random() * 22;
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
});
/** Frost vignette: clear centre, icy edges with fern-like crystal growth. */
const frostTex = (ctx) => canvasTex(ctx, 'frost', 512, 512, (g, S) => {
  const r = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.72);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,255,255,.05)'); r.addColorStop(0.8, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,.95)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
  const fern = (x, y, a, L, d) => {
    if (d > 3 || L < 4) return;
    const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
    g.lineWidth = 3 - d * 0.6; g.strokeStyle = `rgba(255,255,255,${0.75 - d * 0.15})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    for (let k = 1; k <= 3; k++) { const t = k / 4, bx = x + (x2 - x) * t, by = y + (y2 - y) * t; fern(bx, by, a + 0.9, L * 0.4, d + 1); fern(bx, by, a - 0.9, L * 0.4, d + 1); }
  };
  for (let i = 0; i < 28; i++) {
    const e = i % 4, t = Math.random() * S;
    const [x, y] = [[t, 0], [t, S], [0, t], [S, t]][e];
    fern(x, y, Math.atan2(S / 2 - y, S / 2 - x) + (Math.random() - 0.5) * 0.9, 22 + Math.random() * 38, 1);
  }
});

// ---------- shared building blocks ----------
/** Scene-wide liquid displacement. Set h.amt (px) any time; it scrolls on its own. */
function ripple(ctx, amt = 0, size = 1) {
  const sp = new ctx.PIXI.Sprite(noiseTex(ctx));
  sp.scale.set(size * unit(ctx) * 1.3 / 256); sp.alpha = 0;
  ctx.add(sp, 'back');
  // displaced edges would sample outside the frame (transparent): pad the scene with an enlarged camera copy
  const pad = ctx.videoSprite() || ctx.g().rect(-80, -80, ctx.W + 160, ctx.H + 160).fill(0x000000);
  if (pad.anchor) pad.scale.set(pad.scale.x * 1.15, pad.scale.y * 1.15);
  ctx.add(pad, 'back');
  const f = ctx.filter(new ctx.PIXI.DisplacementFilter({ sprite: sp, scale: 0 }));
  const h = { f, amt, sp };
  ctx.tick((dt) => { sp.x += dt * 0.035; sp.y += dt * 0.022; f.scale.x = f.scale.y = h.amt; });
  return h;
}
/** Local liquid wobble for one container (cheap: filter area = the object's bounds). */
function wobble(ctx, target, amt = 10, size = 0.5) {
  const sp = new ctx.PIXI.Sprite(noiseTex(ctx));
  sp.scale.set(size * unit(ctx) / 256); sp.alpha = 0;
  ctx.add(sp, 'back');
  const f = new ctx.PIXI.DisplacementFilter({ sprite: sp, scale: amt });
  target.filters = [...(target.filters || []), f];
  ctx.tick((dt) => { sp.x -= dt * 0.06; sp.y += dt * 0.045; });
  return f;
}
function shockwave(ctx, x, y, o = {}) {
  const f = ctx.filter(new ctx.filters.ShockwaveFilter({ center: { x, y }, amplitude: o.amplitude ?? 24, wavelength: o.wavelength ?? 160, speed: o.speed ?? 900, brightness: o.brightness ?? 1.08, radius: -1, time: 0 }));
  const amp = f.amplitude, t0 = ctx.t;
  ctx.tick((dt, t) => { const s = (t - t0) / 1000; f.time = s; f.amplitude = amp * Math.max(0, 1 - s / 0.9); if (s > 0.9) { ctx.removeFilter(f); return false; } });
  return f;
}

/** Anticipation: droplets spiral into at() while a water orb swells there. Resolves after ms. */
async function gather(ctx, at, c, ms = 600, k = 1) {
  const U = unit(ctx) * k, box = ctx.add(new ctx.PIXI.Container());
  const glow = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0));
  const orb = box.addChild(spr(ctx, orbTex(ctx), c.mid, 'normal', 0));
  const ring = box.addChild(spr(ctx, 'circle2', c.accent, 'add', 0));
  const swirl = ['twirl1', 'twirl2', 'twirl3'].map((t) => box.addChild(spr(ctx, t, c.accent, 'add', 0)));
  const drops = Array.from({ length: Math.round(26 * Math.min(k, 1.3)) }, (_, i) => ({
    s: box.addChild(spr(ctx, i % 3 ? 'dot' : 'soft', i % 3 ? mix(c.mid, c.core, 0.4) : c.mid, i % 3 ? 'normal' : 'add', 0)),
    a: ctx.rand(0, TAU), r: ctx.rand(0.3, 0.6) * U, d: ctx.rand(0, 0.45), w: ctx.rand(2.5, 4.5), sz: ctx.rand(5, 11) * Math.min(k, 1.4),
  }));
  let live = true; const t0 = ctx.t;
  ctx.tick((dt, t) => {
    if (!live) return false;
    const p = at(), e = Math.min(1, (t - t0) / ms);
    for (const m of drops) {
      const q = clamp(((t - t0) / ms - m.d) / 0.55, 0, 1), r = m.r * (1 - q * q), a = m.a + q * m.w;
      m.s.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8);
      m.s.alpha = q > 0 && q < 1 ? 0.95 : 0;
      m.s.rotation = a + Math.PI / 2; m.s.scale.set(m.sz / 32 * (1 + 1.2 * (1 - q)), m.sz / 32);
    }
    for (const s of [glow, orb, ring, ...swirl]) s.position.set(p.x, p.y);
    swirl.forEach((s, i) => { s.rotation = t * 0.008 * (i % 2 ? -1 : 1) + i * 2; setSize(s, U * (0.16 + 0.1 * i) * (0.4 + e)); s.alpha = 0.6 * e; });
  });
  await ctx.tween(ms, (e) => {
    setSize(glow, U * (0.2 + 0.4 * e)); glow.alpha = 0.45 * e;
    setSize(orb, U * (0.03 + 0.14 * e)); orb.alpha = Math.min(1, e * 1.5);
    setSize(ring, U * (0.5 - 0.32 * e)); ring.alpha = 0.7 * e;
  }, ctx.ease.inCubic);
  live = false; box.destroy({ children: true });
}

/** Water hitting something: gravity droplets, spray, foam sparkle, ring. dir = main angle, spread rad. */
function splash(ctx, x, y, c, k = 1, dir = -Math.PI / 2, spread = Math.PI * 1.2, layer) {
  const U = unit(ctx), a = [dir - spread / 2, dir + spread / 2];
  ctx.burst({ x, y, layer, count: Math.round(48 * k), tex: 'dot', blend: 'normal', radius: [0, 24 * k], speed: [260 * k, 820 * k], angle: a,
    life: [700, 1400], size: [U * 0.022, U * 0.009], color: [mix(c.core, c.mid, 0.3), c.mid], alpha: [0.95, 0.5], gravity: 1500, drag: 0.5, rotateToVelocity: true, stretch: 0.55 });
  ctx.burst({ x, y, layer, count: Math.round(9 * k), tex: ctx.pick(SMOKES), blend: 'normal', radius: [0, 30 * k], speed: [60, 300 * k], angle: a,
    life: [700, 1300], size: [U * 0.1 * k, U * 0.26 * k], color: [c.accent, mix(c.mid, c.accent, 0.5)], alpha: [0.55, 0], drag: 2, spin: [-1, 1] });
  ctx.burst({ x, y, layer, count: Math.round(22 * k), tex: 'star6', radius: [0, 40 * k], speed: [100, 520 * k], angle: a,
    life: [300, 800], size: [U * 0.045, 0], color: c.core, drag: 2.5, gravity: 400 });
  ctx.burst({ x, y, layer, count: 1, tex: 'circle2', speed: 0, life: 450, size: [U * 0.08 * k, U * 0.5 * k], color: c.accent, alpha: [0.8, 0], rotation: 0 });
}

/** Big drops running down the "lens" after a hit (overlay layer, not shaken). */
function lensDrips(ctx, c, n = 10) {
  const U = unit(ctx);
  for (let i = 0; i < n; i++) ctx.burst({ layer: 'overlay', x: ctx.rand(0.05, 0.95) * ctx.W, y: ctx.rand(0.05, 0.7) * ctx.H, count: 1, tex: 'circle5', blend: 'normal',
    speed: [0, 20], angle: Math.PI / 2, gravity: [40, 160], life: [1200, 2000], size: [U * 0.04, U * 0.11], color: c.accent, alpha: [0.45, 0], rotation: 0 });
}

/** Falling rain of droplets over the whole width (follow-through after a big splash). */
function rainDown(ctx, c, ms = 900, rate = 120) {
  const U = unit(ctx);
  return ctx.emitter({ x: () => ctx.rand(0, ctx.W), y: () => ctx.rand(-20, ctx.H * 0.3), rate, duration: ms, tex: 'dot', blend: 'normal',
    speed: [100, 300], angle: [Math.PI * 0.45, Math.PI * 0.55], gravity: 1400, life: [500, 900], size: [U * 0.014, U * 0.008],
    color: [mix(c.core, c.mid, 0.4), c.mid], alpha: [0.85, 0.4], rotateToVelocity: true, stretch: 0.7 });
}

// ---------------------------------------------------------------------------------------------
/** Procedural shark (only if the sprite is missing): faces right, ~512x314, greyscale for tinting. */
function sharkGfx(ctx) {
  const g = ctx.g();
  g.poly([20, 60, 90, 170, 20, 260, 70, 175]).fill(0x9aa0a8);                       // tail
  g.poly([250, 120, 245, 10, 330, 110]).fill(0x8a9098);                              // dorsal
  g.poly([300, 215, 270, 300, 350, 225]).fill(0x8a9098);                             // pectoral
  g.ellipse(280, 170, 220, 62).fill(0xb8bec6);                                       // body
  g.ellipse(290, 195, 200, 30).fill(0xf0f2f4);                                       // belly
  g.circle(440, 160, 7).fill(0x202428);                                              // eye
  for (let i = 0; i < 5; i++) g.poly([420 + i * 14, 205, 427 + i * 14, 192, 434 + i * 14, 205]).fill(0xffffff);
  g.pivot.set(256, 157);
  return g;
}

/**
 * waterShark — gathered water becomes a shark that bursts from the hands, sweeps around the caster,
 * then lunges at the camera and explodes. params: palette ('water'), scale, variant 'single' | 'school', count (school).
 */
async function waterShark(ctx, p) {
  const c = ctx.palette(p.palette || 'water'), scale = p.scale ?? 1;
  const school = p.variant === 'school', n = school ? clamp(p.count ?? 4, 2, 6) : 1;
  const U = unit(ctx), W = ctx.W, H = ctx.H, hands = () => ctx.anchor('hands');
  const { PIXI, ease } = ctx;

  // 1. Anticipation: water condenses into a churning orb between the hands.
  ctx.sfx.charge(0.7);
  const rip = ripple(ctx, 0);
  await Promise.all([gather(ctx, hands, c, 750, 1.15), ctx.tween(750, (e) => { rip.amt = 6 * e; })]);

  // 2. Release: the shark tears out of the orb.
  const h0 = hands();
  ctx.sfx.splash(1.2); ctx.sfx.whoosh(1);
  ctx.flash(c.glow, 130, 0.3); ctx.shake(9, 500); ctx.zoomPunch(0.03, 250);
  splash(ctx, h0.x, h0.y, c, 0.9);
  rip.amt = 14;

  const sharks = [];
  for (let i = 0; i < n; i++) {
    const box = ctx.add(new PIXI.Container());
    const glow = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0.35));
    const body = ctx.has('shark') ? spr(ctx, 'shark', mix(c.mid, c.core, 0.15), 'normal', 0.92) : sharkGfx(ctx);
    if (!ctx.has('shark')) body.tint = mix(c.mid, c.core, 0.15);
    const sheen = ctx.has('shark') ? spr(ctx, 'shark', c.accent, 'add', 0.3) : null;
    box.addChild(body); if (sheen) box.addChild(sheen);
    wobble(ctx, box, 9, 0.35);
    // path in screen fractions: out of the hands, sweep around the caster, then a lunge point
    const side = i % 2 ? -1 : 1, j = school ? (i - (n - 1) / 2) * 0.12 : 0;
    const pts = [[h0.x / W, h0.y / H], [0.5 + side * 0.3, 0.72 + j], [0.5 + side * 0.4, 0.32 + j], [0.5 + side * 0.08, 0.14 + j * 0.5],
      [0.5 - side * 0.3, 0.3 - j], [0.5 - side * 0.18 + j, 0.55]].map(([x, y]) => ({ x: x * W, y: y * H }));
    const sz = U * (school ? 0.36 : 0.62) * scale;
    const sh = { box, body, sheen, glow, pts, sz, S: 0, x: h0.x, y: h0.y, vx: 1, vy: 0, delay: i * 140, done: false };
    sh.wake = ctx.emitter({ x: () => sh.x - Math.cos(sh.ang ?? 0) * sh.S * 0.45, y: () => sh.y - Math.sin(sh.ang ?? 0) * sh.S * 0.45, rate: () => (sh.S > 5 && !sh.done ? 70 : 0),
      tex: 'soft', blend: 'normal', radius: () => sh.S * 0.1, speed: [10, 60], life: [380, 650],
      size: [() => sh.S * 0.42, () => sh.S * 0.12], color: [mix(c.mid, c.core, 0.35), c.mid, c.outer], alpha: [0.8, 0] });
    sh.aura = ctx.emitter({ x: () => sh.x, y: () => sh.y, rate: () => (sh.S > 5 && !sh.done ? 60 : 0), tex: 'twirl2', radius: () => sh.S * 0.18,
      speed: [0, 30], life: [200, 380], size: [() => sh.S * 0.5, () => sh.S * 0.7], color: c.mid, alpha: [0.45, 0], spin: [-6, 6] });
    sh.drops = ctx.emitter({ x: () => sh.x, y: () => sh.y, rate: () => (sh.S > 5 && !sh.done ? 55 : 0), tex: 'dot', blend: 'normal', radius: () => sh.S * 0.3,
      speed: [40, 200], angle: [0, TAU], gravity: 1200, life: [400, 800], size: [U * 0.014, U * 0.006], color: [c.core, c.mid], alpha: [0.9, 0.4], rotateToVelocity: true, stretch: 0.5 });
    sh.foam = ctx.emitter({ x: () => sh.x + Math.cos(sh.ang ?? 0) * sh.S * 0.4, y: () => sh.y + Math.sin(sh.ang ?? 0) * sh.S * 0.4, rate: () => (sh.S > 5 && !sh.done ? 40 : 0),
      tex: 'star6', radius: () => sh.S * 0.15, speed: [30, 140], life: [200, 500], size: [U * 0.04, 0], color: c.core });
    sharks.push(sh);
  }
  // Catmull-Rom through the path points
  const cr = (P, u) => {
    const m = P.length - 1, f = Math.min(u * m, m - 1e-6), i = Math.floor(f), t = f - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(m, i + 2)];
    const q = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
    return { x: q(p0.x, p1.x, p2.x, p3.x), y: q(p0.y, p1.y, p2.y, p3.y) };
  };
  const place = (sh, x, y, S, t) => {
    const dx = x - sh.x, dy = y - sh.y;
    if (Math.hypot(dx, dy) > 0.5) sh.ang = Math.atan2(dy, dx);
    sh.x = x; sh.y = y; sh.S = S;
    const flip = Math.cos(sh.ang ?? 0) < 0 ? -1 : 1, sw = Math.sin(t * 0.018);
    sh.box.position.set(x, y); sh.box.rotation = (sh.ang ?? 0) + sw * 0.06;
    for (const s of [sh.body, sh.sheen]) if (s) { const k = S / 512; s.scale.set(k * (1 + 0.04 * sw), k * flip * (1 - 0.03 * sw)); }
    setSize(sh.glow, S * 1.3); sh.glow.scale.y *= 0.6;
  };

  const SWIM = school ? 1500 : 1450;
  ctx.sfx.wave(1.6);
  await ctx.tween(SWIM + (n - 1) * 140, (_, raw) => {
    const T = raw * (SWIM + (n - 1) * 140);
    for (const sh of sharks) {
      const u = clamp((T - sh.delay) / SWIM, 0, 1), e = ease.inOutCubic(u);
      const q = cr(sh.pts, e);
      place(sh, q.x, q.y, sh.sz * (0.25 + 0.75 * ease.outCubic(Math.min(1, u * 2.5))), ctx.t);
    }
    rip.amt = 14 - 6 * raw;
  });

  // 3. Lunge at the camera: grows fast, zoom blur pulls the eye in.
  ctx.sfx.roar(0.9); ctx.sfx.whoosh(0.5);
  const zoom = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength: 0, center: { x: W / 2, y: H / 2 }, innerRadius: 60 }));
  const from = sharks.map((sh) => ({ x: sh.x, y: sh.y, S: sh.S }));
  await ctx.tween(380, (e) => {
    sharks.forEach((sh, i) => {
      const tx = W / 2 + (school ? (i - (n - 1) / 2) * W * 0.18 : 0), ty = H * 0.45;
      place(sh, from[i].x + (tx - from[i].x) * e, from[i].y + (ty - from[i].y) * e, from[i].S + (U * (school ? 1.1 : 1.9) * scale - from[i].S) * e, ctx.t);
    });
    zoom.strength = 0.22 * e; zoom.center = { x: sharks[0].x, y: sharks[0].y };
  }, ease.inCubic);
  ctx.removeFilter(zoom);

  // 4. Impact: the shark bursts into a wall of water.
  ctx.sfx.boom(0.9); ctx.sfx.splash(1.6);
  ctx.flash(mix(c.core, c.glow, 0.4), 140, 0.55);
  ctx.shake(24 * scale, 1000); ctx.zoomPunch(0.07, 350);
  shockwave(ctx, W / 2, H * 0.45, { amplitude: 30, wavelength: 200 });
  for (const sh of sharks) {
    sh.done = true; sh.box.visible = false;
    splash(ctx, sh.x, sh.y, c, school ? 1.2 : 2, -Math.PI / 2, TAU);
    ctx.burst({ x: sh.x, y: sh.y, count: 12, tex: 'soft', blend: 'normal', radius: [0, sh.S * 0.3], speed: [100, 500], life: [900, 1600],
      size: [U * 0.25, U * 0.6], color: [c.accent, mix(c.mid, c.accent, 0.4)], alpha: [0.6, 0], drag: 1.8, spin: [-1, 1] });
  }
  lensDrips(ctx, c, school ? 8 : 12);
  rip.amt = 30;

  // 5. Follow-through: water rains back down, ripples settle.
  rainDown(ctx, c, 900, 110);
  await ctx.tween(1500, (e) => { rip.amt = 30 * (1 - e); }, ease.outCubic);
  await ctx.wait(300);
}

// ---------------------------------------------------------------------------------------------
/**
 * waterPrison — water spirals in and seals into a sphere beside the hands (one hand stays inside),
 * refracting what's behind it; it holds, churning, then bursts. params: palette ('water'), scale.
 */
async function waterPrison(ctx, p) {
  const c = ctx.palette(p.palette || 'water'), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, U = unit(ctx), R = U * 0.27 * scale;
  const center = () => { const h = ctx.anchor('rightHand'); return { x: clamp(h.x + R * 0.7, R * 1.05, ctx.W - R * 1.05), y: clamp(h.y - R * 0.35, R * 1.05, ctx.H - R * 0.6) }; };

  // 1. Anticipation: streams of water coil in from all around.
  ctx.sfx.charge(0.8); ctx.sfx.wave(1.2);
  const rip = ripple(ctx, 0);
  const coils = ctx.add(new PIXI.Container());
  const streams = Array.from({ length: 44 }, (_, i) => ({
    s: coils.addChild(spr(ctx, i % 2 ? 'soft' : 'trace1', i % 2 ? mix(c.mid, c.core, 0.3) : c.core, i % 2 ? 'normal' : 'add', 0)),
    a: ctx.rand(0, TAU), r: ctx.rand(1.8, 2.8) * R, d: ctx.rand(0, 0.4), w: ctx.rand(2.5, 4), big: i % 2,
  }));
  await ctx.tween(800, (e, raw) => {
    const q0 = center();
    for (const m of streams) {
      const q = clamp((raw - m.d) / 0.6, 0, 1), r = m.r * (1 - q) + R * q, a = m.a + q * m.w;
      m.s.position.set(q0.x + Math.cos(a) * r, q0.y + Math.sin(a) * r);
      m.s.alpha = q > 0 && q < 1 ? 0.8 : 0;
      if (m.big) { m.s.rotation = a; m.s.scale.set(R * 0.5 * (1 - 0.5 * q) / 128, R * 0.22 / 128); } // stretched along the coil
      else { m.s.rotation = a; m.s.scale.set(1.2, R * 0.6 / 128); }
    }
    rip.amt = 7 * e;
  });
  coils.destroy({ children: true });

  // 2. Release: the sphere snaps shut.
  ctx.sfx.splash(1.2); ctx.sfx.hum(2.6, 90);
  ctx.flash(c.glow, 120, 0.25); ctx.shake(10, 450); ctx.zoomPunch(0.03, 250);
  const q1 = center();
  splash(ctx, q1.x, q1.y, c, 0.9, -Math.PI / 2, TAU);

  const sphere = ctx.add(new PIXI.Container());
  // refracted, magnified copy of the scene behind the sphere
  const lens = sphere.addChild(new PIXI.Container());
  const vs = ctx.videoSprite();
  let maskG = null;
  if (vs) {
    lens.addChild(vs);
    maskG = sphere.addChild(ctx.g().circle(0, 0, 100).fill(0xffffff));
    lens.mask = maskG;
    wobble(ctx, lens, 22, 0.3);
    const cm = new PIXI.ColorMatrixFilter(); cm.tint(mix(c.mid, 0xffffff, 0.45), true);
    lens.filters = [...lens.filters, cm];
  }
  const fill = sphere.addChild(spr(ctx, orbTex(ctx), c.mid, 'normal', 0.85));
  const swirls = ['twirl1', 'twirl2', 'twirl3', 'twirl1'].map((t, i) => sphere.addChild(spr(ctx, t, i % 2 ? c.accent : c.core, 'add', 0.32)));
  const rim = sphere.addChild(spr(ctx, 'circle2', c.accent, 'add', 0.55));
  const spec = sphere.addChild(spr(ctx, 'soft', 0xffffff, 'add', 0.75));
  const spec2 = sphere.addChild(spr(ctx, 'star6', 0xffffff, 'add', 0.9));
  let Rk = 0;
  const bubbles = ctx.emitter({ x: () => center().x, y: () => center().y + R * 0.3, rate: () => (Rk > 0.6 ? 18 : 0), tex: 'circle2', radius: [0, R * 0.55],
    angle: [-Math.PI * 0.6, -Math.PI * 0.4], speed: [30, 90], life: [700, 1200], size: [U * 0.012, U * 0.028], color: c.core, alpha: [0.75, 0], accel: [0, -50] });
  ctx.tick((dt, t) => {
    const q = center(), r = R * Rk, wx = 1 + 0.035 * Math.sin(t * 0.007), wy = 1 - 0.035 * Math.sin(t * 0.007 + 0.6);
    if (vs) {
      // magnify around the sphere centre (lens), mask stays a circle
      lens.pivot.set(q.x, q.y); lens.position.set(0, 0); lens.scale.set(1.18);
      maskG.scale.set(r / 100 * wx, r / 100 * wy);
    }
    sphere.position.set(q.x, q.y);
    fill.scale.set(2 * r * 1.04 / 256 * wx, 2 * r * 1.04 / 256 * wy);
    swirls.forEach((s, i) => { setSize(s, r * (1.1 + 0.25 * i)); s.rotation = t * 0.0025 * (i % 2 ? -1.3 : 1) + i * 1.7; });
    setSize(rim, r * 2.25); rim.scale.x *= wx; rim.scale.y *= wy;
    spec.position.set(-r * 0.42, -r * 0.48); spec.scale.set(r * 0.5 / 128, r * 0.26 / 128); spec.rotation = -0.65;
    spec2.position.set(-r * 0.5, -r * 0.52); setSize(spec2, r * 0.35 * (0.8 + 0.2 * Math.sin(t * 0.01)));
  });
  await ctx.tween(520, (e) => { Rk = e; rip.amt = 7 + 5 * (1 - e); }, ease.outElastic);

  // 3. Hold: the target is trapped; chakra pulses from the hand keep the cage shut.
  for (let i = 0; i < 4; i++) {
    const h = ctx.anchor('rightHand');
    ctx.burst({ x: h.x, y: h.y, count: 1, tex: 'circle1', speed: 0, life: 600, size: [U * 0.04, R * 1.3], color: c.glow, alpha: [0.6, 0], rotation: 0 });
    ctx.burst({ x: h.x, y: h.y, count: 6, tex: 'star6', radius: [0, U * 0.04], speed: [20, 80], life: [300, 600], size: [U * 0.03, 0], color: c.core });
    await ctx.wait(600);
  }

  // 4. Release: the sphere bulges and bursts.
  await ctx.tween(160, (e) => { Rk = 1 + 0.12 * e; }, ease.inCubic);
  bubbles.stop(); sphere.visible = false;
  const q2 = center();
  ctx.sfx.splash(1.6); ctx.sfx.boom(0.4);
  ctx.flash(c.glow, 110, 0.3); ctx.shake(12, 600);
  splash(ctx, q2.x, q2.y, c, 1.7, -Math.PI / 2, TAU);
  ctx.burst({ x: q2.x, y: q2.y, count: 10, tex: ctx.pick(SMOKES), blend: 'normal', radius: [0, R * 0.6], speed: [60, 260], life: [800, 1400],
    size: [R * 0.6, R * 1.3], color: [c.mid, c.outer], alpha: [0.6, 0], drag: 1.5, spin: [-1, 1], gravity: 200 });
  lensDrips(ctx, c, 5);
  await ctx.tween(1200, (e) => { rip.amt = 14 * (1 - e); }, ease.outCubic);
}

// ---------------------------------------------------------------------------------------------
/**
 * waterBullets — 'fang' (default): water pools underfoot, then drill-like fangs spring up from the ground,
 * curve over and stab inward to one point, then collapse into rain. params: palette ('water'), scale, count (fangs, 4).
 */
async function waterBullets(ctx, p) {
  const c = ctx.palette(p.palette || 'water'), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, U = unit(ctx), W = ctx.W, H = ctx.H;
  const n = clamp(p.count ?? 4, 2, 6);
  const bases = Array.from({ length: n }, (_, i) => { const u = n === 1 ? 0.5 : i / (n - 1); return (0.08 + 0.84 * u) * W; });

  // 1. Anticipation: a puddle spreads underfoot; ripples pulse at each fang's base.
  ctx.sfx.charge(0.6); ctx.sfx.wave(1.2);
  const rip = ripple(ctx, 0);
  const pool = ctx.add(spr(ctx, 'soft', c.outer, 'normal', 0));
  pool.position.set(W / 2, H); pool.scale.set(W * 1.4 / 128, H * 0.3 / 128);
  const poolHi = ctx.add(spr(ctx, 'soft', c.accent, 'add', 0));
  poolHi.position.set(W / 2, H); poolHi.scale.set(W * 1.2 / 128, H * 0.12 / 128);
  const ringAt = (x, y, s = 1) => ctx.burst({ x, y, count: 1, tex: 'circle2', speed: 0, life: 650, size: [U * 0.05 * s, U * 0.35 * s], color: c.accent, alpha: [0.8, 0], rotation: 0 });
  const hop = (x) => ctx.burst({ x, y: H - 6, count: 6, tex: 'dot', blend: 'normal', speed: [150, 380], angle: [-Math.PI * 0.7, -Math.PI * 0.3], gravity: 1400,
    life: [400, 700], size: [U * 0.016, U * 0.008], color: [c.core, c.mid], alpha: [0.9, 0.5], rotateToVelocity: true, stretch: 0.5 });
  const pre = (async () => { for (let k = 0; k < 3; k++) { for (const x of bases) { ringAt(x, H - 4, 0.7 + k * 0.2); hop(x); } await ctx.wait(220); } })();
  await Promise.all([gather(ctx, () => ctx.anchor('hands'), c, 650, 0.7), pre,
    ctx.tween(650, (e) => { pool.alpha = 0.75 * e; poolHi.alpha = 0.35 * e; rip.amt = 8 * e; })]);

  // 2. Release: the fangs spring up and coil inward.
  ctx.sfx.splash(1.2); ctx.sfx.whoosh(0.7); ctx.sfx.spin(1);
  ctx.shake(8, 600); ctx.zoomPunch(0.03, 250);
  const C = { x: W / 2, y: (ctx.anchor('face').y + ctx.anchor('hands').y) / 2 };
  const SEG = 28, fangW = U * 0.1 * scale;
  const fangs = bases.map((x0, i) => {
    const box = ctx.add(new PIXI.Container());
    const tipOff = { x: (i - (n - 1) / 2) * U * 0.04, y: (i % 2 ? -1 : 1) * U * 0.02 };
    const P0 = { x: x0, y: H + 30 }, P1 = { x: x0 + (C.x - x0) * 0.15, y: H * -0.05 }, P2 = { x: C.x + tipOff.x, y: C.y + tipOff.y };
    const halo = box.addChild(ctx.g()), tube = box.addChild(ctx.g()), helix = box.addChild(ctx.g());
    halo.blendMode = 'add'; helix.blendMode = 'add';
    const tip = box.addChild(spr(ctx, 'shard', mix(c.core, c.mid, 0.2), 'normal', 0.95));
    const tipGlow = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0.6));
    const f = { box, halo, tube, helix, tip, tipGlow, P0, P1, P2, L: 0, alive: SEG, head: { ...P0 }, ang: 0, ph: ctx.rand(0, TAU) };
    splash(ctx, x0, H - 10, c, 0.7, -Math.PI / 2, Math.PI * 0.6);
    return f;
  });
  const bez = (f, s) => {
    const u = 1 - s;
    return { x: u * u * f.P0.x + 2 * u * s * f.P1.x + s * s * f.P2.x, y: u * u * f.P0.y + 2 * u * s * f.P1.y + s * s * f.P2.y };
  };
  // Each fang is a tapered tube (redrawn per frame, ~28 pts) with three helix strands spinning on it = a water drill.
  ctx.tick((dt, t) => {
    for (const f of fangs) {
      if (f.L <= 0 || f.alive < 2) { f.box.visible = false; continue; }
      f.box.visible = true;
      const m = f.alive, pts = [];
      for (let j = 0; j < m; j++) {
        const s = f.L * (j / (SEG - 1)), q = bez(f, s), q2 = bez(f, Math.min(1, s + 0.01));
        const ang = Math.atan2(q2.y - q.y, q2.x - q.x), w = fangW * (0.3 + 0.7 * (1 - j / SEG)) * (1 + 0.08 * Math.sin(j * 1.3 - t * 0.02));
        pts.push({ x: q.x, y: q.y, nx: -Math.sin(ang), ny: Math.cos(ang), w, ang });
      }
      const side = (k) => pts.map((q) => [q.x + q.nx * q.w * k, q.y + q.ny * q.w * k]).flat();
      const rev = (a) => { const o = []; for (let i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]); return o; };
      f.halo.clear().poly([...side(0.95), ...rev(side(-0.95))]).fill({ color: c.glow, alpha: 0.22 });
      f.tube.clear().poly([...side(0.62), ...rev(side(-0.62))]).fill({ color: c.outer, alpha: 0.92 })
        .poly([...side(0.42), ...rev(side(-0.2))]).fill({ color: c.mid, alpha: 0.9 })
        .poly([...side(0.3), ...rev(side(0.1))]).fill({ color: c.accent, alpha: 0.55 });
      f.helix.clear();
      for (let k = 0; k < 3; k++) {
        for (let j = 0; j < m - 1; j++) {
          const ph = j * 0.75 - t * 0.03 + k * TAU / 3 + f.ph;
          if (Math.cos(ph) < 0) continue; // only the strand's front side
          const a = pts[j], b = pts[j + 1], ph2 = ph + 0.75;
          f.helix.moveTo(a.x + a.nx * a.w * 0.6 * Math.sin(ph), a.y + a.ny * a.w * 0.6 * Math.sin(ph))
            .lineTo(b.x + b.nx * b.w * 0.6 * Math.sin(ph2), b.y + b.ny * b.w * 0.6 * Math.sin(ph2));
        }
      }
      f.helix.stroke({ width: Math.max(2, fangW * 0.09), color: c.core, alpha: 0.85, cap: 'round' });
      const hd = pts[m - 1]; f.head = hd; f.ang = hd.ang;
      f.tip.visible = f.tipGlow.visible = f.alive >= SEG;
      f.tip.position.set(hd.x + Math.cos(f.ang) * fangW * 0.25, hd.y + Math.sin(f.ang) * fangW * 0.25);
      f.tip.rotation = f.ang + Math.PI / 2; f.tip.scale.set(fangW * 0.7 / 64, fangW * 1.3 / 64);
      f.tipGlow.position.set(hd.x, hd.y); setSize(f.tipGlow, fangW * 1.6);
    }
  });
  const drip = fangs.map((f) => ctx.emitter({ x: () => f.head.x, y: () => f.head.y, rate: () => (f.L > 0.05 && f.alive >= SEG ? 45 : 0), tex: 'dot', blend: 'normal',
    radius: fangW * 0.3, speed: [30, 160], gravity: 1300, life: [400, 800], size: [U * 0.014, U * 0.007], color: [c.core, c.mid], alpha: [0.9, 0.4], rotateToVelocity: true, stretch: 0.5 }));
  await ctx.tween(620 + (n - 1) * 50, (_, raw) => {
    const T = raw * (620 + (n - 1) * 50);
    fangs.forEach((f, i) => { f.L = ease.outCubic(clamp((T - i * 50) / 620, 0, 1)); });
    rip.amt = 8 + 6 * raw;
  });

  // 3. Impact where the fangs meet.
  ctx.sfx.boom(0.7); ctx.sfx.splash(1.4);
  ctx.flash(c.glow, 120, 0.35); ctx.shake(18 * scale, 800); ctx.zoomPunch(0.05, 300);
  shockwave(ctx, C.x, C.y, { amplitude: 26 });
  splash(ctx, C.x, C.y, c, 1.8, -Math.PI / 2, TAU);
  lensDrips(ctx, c, 7);
  rip.amt = 22;
  await ctx.wait(250);

  // 4. Follow-through: the fangs lose shape and pour back down as rain.
  ctx.sfx.splash(1.5);
  drip.forEach((d) => d.stop());
  await ctx.tween(650, (e) => {
    for (const f of fangs) {
      const alive = Math.round(SEG * (1 - e));
      for (let j = alive; j < f.alive; j++) {
        const q = bez(f, f.L * (j / (SEG - 1)));
        ctx.burst({ x: q.x, y: q.y, count: 2, tex: 'dot', blend: 'normal', radius: fangW * 0.4, speed: [20, 140], gravity: 1300, life: [500, 900],
          size: [U * 0.018, U * 0.008], color: [c.core, c.mid], alpha: [0.9, 0.4], rotateToVelocity: true, stretch: 0.5 });
        if (j % 2) ctx.burst({ x: q.x, y: q.y, count: 1, tex: 'soft', blend: 'normal', speed: [10, 60], life: [500, 800], size: [fangW * 1.6, fangW * 0.8], color: c.mid, alpha: [0.8, 0], gravity: 500 });
      }
      f.alive = alive; if (!alive) f.L = 0;
    }
    rip.amt = 22 * (1 - e) + 4;
  });
  // the water lands back in the puddle: splashes, ripples, a little spray mist, then it seeps away
  for (const x of bases) { ringAt(x, H - 4, 1.2); splash(ctx, x, H - 6, c, 0.5, -Math.PI / 2, Math.PI * 0.7); }
  ctx.burst({ x: W / 2, y: H * 0.9, count: 8, tex: 'smoke2', blend: 'normal', radius: [0, W * 0.4], speed: [10, 40], angle: [-Math.PI, 0], life: [1000, 1500],
    size: [U * 0.3, U * 0.5], color: c.accent, alpha: [0.3, 0] });
  await ctx.tween(1200, (e) => { pool.alpha = 0.75 * (1 - e); poolHi.alpha = 0.35 * (1 - e); rip.amt = 6 * (1 - e); });
}

// ---------------------------------------------------------------------------------------------
function frostVignette(ctx, c) {
  const v = ctx.add(spr(ctx, frostTex(ctx), mix(c.accent, c.mid, 0.3), 'normal', 0), 'overlay');
  v.anchor.set(0); v.scale.set(ctx.W / 512, ctx.H / 512);
  return v;
}
/** Ice debris: faceted shards + crystal chunks with gravity, frost dust and glints. */
function shatter(ctx, x, y, c, k = 1, R = 30) {
  const U = unit(ctx);
  ctx.burst({ x, y, count: Math.round(40 * k), tex: 'shard', blend: 'normal', radius: [0, R], speed: [200 * k, 750 * k], life: [700, 1300], gravity: 1100, drag: 0.4,
    size: [U * 0.04, U * 0.025], color: [c.core, c.mid, c.outer], alpha: [1, 0.6], spin: [-12, 12] });
  if (ctx.has('ice-crystal')) ctx.burst({ x, y, count: Math.round(6 * k), tex: 'ice-crystal', blend: 'normal', radius: [0, R], speed: [150, 500 * k], angle: [-Math.PI * 0.95, -Math.PI * 0.05],
    life: [800, 1300], gravity: 1100, size: [U * 0.07, U * 0.05], color: 0xffffff, alpha: [1, 0.4], spin: [-6, 6] });
  ctx.burst({ x, y, count: Math.round(10 * k), tex: ctx.pick(SMOKES), blend: 'normal', radius: [0, R], speed: [40, 220 * k], life: [800, 1500],
    size: [U * 0.1, U * 0.28 * k], color: [c.core, c.mid], alpha: [0.6, 0], drag: 1.6, spin: [-1, 1] });
  ctx.burst({ x, y, count: Math.round(20 * k), tex: 'star6', radius: [0, R * 1.5], speed: [60, 400 * k], life: [300, 800], size: [U * 0.05, 0], color: c.core, drag: 2 });
}
function snowfall(ctx, c, ms = 1500) {
  const U = unit(ctx);
  return ctx.emitter({ x: () => ctx.rand(0, ctx.W), y: () => ctx.rand(0, ctx.H * 0.6), rate: 50, duration: ms, tex: 'dot', blend: 'add', speed: [10, 40], angle: [0, TAU],
    gravity: 40, drag: 0.5, life: [900, 1600], size: [U * 0.008, U * 0.003], color: c.core, alpha: [0.9, 0] });
}

/**
 * iceShards — 'spikes' (default): air freezes into a ring of ice spears around the caster that close in
 * and shatter; 'mirrors': a dome of ice mirrors, the caster's reflection darts between them firing needles,
 * then they shatter. params: palette ('ice'), scale, variant.
 */
async function iceShards(ctx, p) {
  if (p.variant === 'mirrors') return iceMirrors(ctx, p);
  const c = ctx.palette(p.palette || 'ice'), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, U = unit(ctx);
  const C = () => { const f = ctx.anchor('face'), h = ctx.anchor('hands'); return { x: (f.x + h.x) / 2, y: (f.y * 0.6 + h.y * 0.4) }; };
  const ax = Math.min(1.25, ctx.W / ctx.H);

  // 1. Anticipation: temperature drops, frost creeps in from the edges, moisture glitters.
  ctx.sfx.wind(1.4); ctx.sfx.chime();
  const frost = frostVignette(ctx, c);
  const chill = ctx.tint(c.dark, 0, 'multiply');
  const R1 = U * 0.42 * scale, R2 = U * 0.31 * scale;
  const spears = [];
  for (const [n, R, L] of [[18, R1, U * 0.24], [13, R2, U * 0.19]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (R === R2 ? 0.12 : 0);
      const s = ctx.add(spr(ctx, spearTex(ctx), mix(c.mid, c.core, 0.2), 'normal', 0));
      s.anchor.set(0.5, 0);
      const gl = ctx.add(spr(ctx, spearTex(ctx), 0xffffff, 'add', 0)); gl.anchor.set(0.5, 0);
      spears.push({ s, gl, a, R, L: L * ctx.rand(0.85, 1.15) * scale, born: ctx.rand(0, 0.85), grow: 0, r: R });
    }
  }
  const place = (sp, t) => {
    const q = C(), x = q.x + Math.cos(sp.a) * sp.r * ax, y = q.y + Math.sin(sp.a) * sp.r;
    const toC = Math.atan2(q.y - y, q.x - x), jit = sp.jit ? ctx.rand(-1.5, 1.5) : 0;
    for (const s of [sp.s, sp.gl]) {
      s.position.set(x + jit, y + jit); s.rotation = toC + Math.PI / 2 + (sp.jit ? ctx.rand(-0.02, 0.02) : 0);
      s.scale.set(sp.L * 0.27 / 48 * Math.max(0.2, sp.grow), sp.L * sp.grow / 256);
    }
    sp.s.alpha = sp.grow > 0 ? 0.95 : 0;
    sp.gl.alpha = sp.grow > 0 ? 0.3 + 0.45 * Math.max(0, Math.sin(t * 0.008 + sp.a * 3)) : 0;
  };
  const mote = ctx.emitter({ x: () => C().x, y: () => C().y, rate: 70, duration: 900, tex: 'star6', radius: [R2 * 0.8, R1 * 1.1],
    speed: [5, 25], life: [300, 600], size: [U * 0.035, 0], color: c.core });
  void mote;
  await ctx.tween(650, (e) => { frost.alpha = 0.75 * e; chill.set(0.3 * e); }, ease.outCubic);

  // 2. Crystallize: spears snap into existence one after another, pointing inward.
  ctx.sfx.crackle(0.8);
  let cracks = 0;
  await ctx.tween(700, (_, raw) => {
    for (const sp of spears) {
      const g0 = sp.grow; sp.grow = ease.outBack(clamp((raw - sp.born * 0.8) / 0.2, 0, 1));
      if (g0 === 0 && sp.grow > 0) {
        const q = C();
        ctx.burst({ x: q.x + Math.cos(sp.a) * sp.r * ax, y: q.y + Math.sin(sp.a) * sp.r, count: 4, tex: 'star6', speed: [20, 90], life: [250, 500], size: [U * 0.045, 0], color: c.core });
        if (cracks++ % 8 === 0) ctx.sfx.crack();
      }
      place(sp, ctx.t);
    }
  });
  // 3. Hold: the ring trembles, glinting.
  for (const sp of spears) sp.jit = true;
  ctx.sfx.hum(0.5, 220);
  ctx.tick((dt, t) => { for (const sp of spears) place(sp, t); });
  await ctx.wait(380);

  // 4. Strike: every spear drives into the centre.
  ctx.sfx.whoosh(0.35);
  const zoom = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength: 0, center: C(), innerRadius: 40 }));
  const streak = ctx.emitter({ x: () => C().x, y: () => C().y, rate: 140, duration: 240, tex: 'trace1', radius: [R2 * 0.5, R1], speed: [0, 0],
    life: [120, 200], size: [U * 0.12, U * 0.04], color: c.core, alpha: [0.7, 0] });
  void streak;
  for (const sp of spears) sp.jit = false;
  await ctx.tween(240, (e) => { for (const sp of spears) sp.r = sp.R * (1 - 0.85 * e); zoom.strength = 0.18 * e; zoom.center = C(); }, ease.inCubic);
  ctx.removeFilter(zoom);

  // 5. Impact: the spears shatter together.
  const q = C();
  for (const sp of spears) { sp.s.visible = sp.gl.visible = false; sp.grow = 0; }
  ctx.sfx.crack(); ctx.sfx.boom(0.6); ctx.sfx.crackle(0.6);
  ctx.flash(c.glow, 120, 0.38); ctx.shake(20 * scale, 700); ctx.zoomPunch(0.06, 300);
  shockwave(ctx, q.x, q.y, { amplitude: 22, wavelength: 140 });
  shatter(ctx, q.x, q.y, c, 1.8 * scale, U * 0.08);
  ctx.burst({ x: q.x, y: q.y, count: 1, tex: 'circle2', speed: 0, life: 450, size: [U * 0.1, U * 0.9], color: c.accent, alpha: [0.9, 0], rotation: 0 });

  // 6. Follow-through: ice dust drifts, frost slowly thaws.
  snowfall(ctx, c, 1400);
  await ctx.wait(500);
  await ctx.tween(1000, (e) => { frost.alpha = 0.75 * (1 - e); chill.set(0.3 * (1 - e)); });
}

async function iceMirrors(ctx, p) {
  const c = ctx.palette(p.palette || 'ice'), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, U = unit(ctx), W = ctx.W, H = ctx.H;
  const ok = await ctx.personReady();

  // 1. Anticipation: the air chills; frost and cold mist.
  ctx.sfx.wind(1.6);
  const frost = frostVignette(ctx, c);
  const chill = ctx.tint(c.dark, 0, 'multiply');
  ctx.emitter({ x: () => ctx.rand(0, W), y: H * 0.95, rate: 14, duration: 2600, tex: SMOKES[2], blend: 'normal', speed: [10, 40], angle: [-Math.PI * 0.6, -Math.PI * 0.4],
    life: [1500, 2400], size: [U * 0.3, U * 0.6], color: c.accent, alpha: [0.35, 0], spin: [-0.3, 0.3] });
  await ctx.tween(600, (e) => { frost.alpha = 0.55 * e; chill.set(0.25 * e); });

  // 2. Mirrors form in a dome around the caster (back ones first, smaller = farther).
  const cx = W / 2, cy = H * 0.5, rx = Math.min(W * 0.43, H * 0.85), ry = H * 0.3;
  const N = 9, panes = [];
  const dome = ctx.add(new PIXI.Container());
  for (let i = 0; i < N; i++) {
    // evenly spaced across the width on an arc over the caster (angle spacing clumped 3 panes per side)
    const u = -1 + (2 * i) / (N - 1), depth = -Math.sqrt(1 - u * u), ph = H * 0.4 * (1 + 0.25 * depth) * scale, pw = ph * 0.6;
    const box = new PIXI.Container(); box.position.set(cx + u * rx, cy + depth * ry);
    const back = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0.35)); back.scale.set(pw * 1.6 / 128, ph * 1.3 / 128);
    let refl = null;
    if (ok) {
      refl = ctx.personSprite();
      const k = ph / (H * 0.75);
      refl.position.set(0, ph * 0.2); refl.scale.set(-refl.scale.x * k, refl.scale.y * k); // a mirror flips
      refl.tint = mix(c.accent, 0xffffff, 0.3); refl.alpha = 0.5;
      refl.mask = box.addChild(ctx.g().rect(-pw / 2 + 4, -ph / 2 + 4, pw - 8, ph - 8).fill(0xffffff)); // axis-aligned rect -> cheap scissor mask
      box.addChild(refl);
    } else {
      refl = box.addChild(ctx.g().ellipse(0, -ph * 0.12, pw * 0.16, ph * 0.13).fill(c.dark).ellipse(0, ph * 0.25, pw * 0.32, ph * 0.25).fill(c.dark));
      refl.alpha = 0.5;
    }
    const glass = box.addChild(spr(ctx, paneTex(ctx), c.mid, 'normal', 0.95)); glass.scale.set(pw / 160, ph / 256);
    const edge = box.addChild(spr(ctx, paneTex(ctx), c.glow, 'add', 0.35)); edge.scale.set(pw / 160, ph / 256);
    const shine = box.addChild(spr(ctx, paneTex(ctx), 0xffffff, 'add', 0)); shine.scale.set(pw / 160, ph / 256);
    box.scale.set(1, 0);
    panes.push({ box, refl, shine, depth, ph, pw, x: box.x, y: box.y });
  }
  panes.sort((a, b) => a.depth - b.depth).forEach((pn) => dome.addChild(pn.box));
  // caster stands in front of the dome
  if (ok) ctx.add(ctx.personSprite());
  for (let i = 0; i < N; i++) {
    const pn = panes[i];
    ctx.tween(320, (e) => { pn.box.scale.set(0.6 + 0.4 * e, e); }, ease.outBack);
    ctx.burst({ x: pn.x, y: pn.y + pn.ph / 2, count: 8, tex: 'star6', radius: [0, pn.pw * 0.5], speed: [30, 160], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [300, 600], size: [U * 0.05, 0], color: c.core });
    ctx.burst({ x: pn.x, y: pn.y + pn.ph / 2, count: 3, tex: 'shard', blend: 'normal', speed: [60, 200], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 900, life: [400, 700], size: [U * 0.025, U * 0.015], color: c.mid, spin: [-8, 8] });
    if (i % 3 === 0) ctx.sfx.crack();
    await ctx.wait(70);
  }
  ctx.sfx.chime(); ctx.shake(5, 300);
  await ctx.wait(250);

  // 3. The reflection darts from mirror to mirror, loosing needles inward.
  ctx.sfx.hum(1.8, 160);
  const C = { x: cx, y: H * 0.5 };
  let prev = panes[panes.length - 1], whooshes = 0;
  const order = [...panes].sort(() => Math.random() - 0.5);
  for (let k = 0; k < 14; k++) {
    const pn = order[k % N];
    for (const q of panes) { q.refl.alpha = q === pn ? 1 : 0.18; q.shine.alpha = q === pn ? 0.7 : 0; }
    ctx.burst({ x: pn.x, y: pn.y, count: 1, tex: 'soft', speed: 0, life: 220, size: [pn.pw * 1.3, pn.pw * 2], color: c.glow, alpha: [0.75, 0], rotation: 0 });
    // blur streak between the panes
    const dx = pn.x - prev.x, dy = pn.y - prev.y, L = Math.hypot(dx, dy);
    const st = ctx.add(spr(ctx, 'spark', c.core, 'add', 0.9));
    st.position.set((pn.x + prev.x) / 2, (pn.y + prev.y) / 2); st.rotation = Math.atan2(dy, dx); st.scale.set(L / 128, U * 0.05 / 16);
    ctx.tween(160, (e) => { st.alpha = 0.9 * (1 - e); }).then(() => st.destroy());
    const ang = Math.atan2(C.y - pn.y, C.x - pn.x);
    // senbon volley: 'spark' is a horizontal streak, so rotateToVelocity aligns it with the flight path
    ctx.burst({ x: pn.x, y: pn.y, count: 8, tex: 'spark', radius: [0, pn.pw * 0.25], speed: [1300, 1800], angle: [ang - 0.2, ang + 0.2], life: [220, 320],
      size: [U * 0.17, U * 0.12], color: [0xffffff, c.accent], alpha: [1, 0.7], rotateToVelocity: true });
    if (whooshes++ % 2 === 0) ctx.sfx.whoosh(0.15); else ctx.sfx.slash();
    prev = pn;
    await ctx.wait(k < 4 ? 160 : 100);
  }
  for (const q of panes) { q.refl.alpha = 0.5; q.shine.alpha = 0; }
  ctx.burst({ x: C.x, y: C.y, count: 30, tex: 'star6', radius: [0, U * 0.15], speed: [50, 250], life: [300, 600], size: [U * 0.04, 0], color: c.core });

  // 4. The mirrors crack and shatter all at once.
  ctx.sfx.crack(); ctx.sfx.boom(0.5); ctx.sfx.crackle(0.8);
  ctx.flash(c.core, 120, 0.45); ctx.shake(14 * scale, 650); ctx.zoomPunch(0.04, 250);
  shockwave(ctx, C.x, C.y, { amplitude: 16, wavelength: 140 });
  for (const pn of panes) { shatter(ctx, pn.x, pn.y, c, 0.55, pn.pw * 0.4); }
  dome.visible = false;
  snowfall(ctx, c, 1400);
  await ctx.wait(400);
  await ctx.tween(1000, (e) => { frost.alpha = 0.55 * (1 - e); chill.set(0.25 * (1 - e)); });
}

// ---------------------------------------------------------------------------------------------
/**
 * mist — Hidden Mist: chakra-laced fog rolls in until the field is a white blank (the caster stays a
 * faint shape), a blade glints in the fog, then it thins and clears. params: palette ('smoke'), scale.
 */
async function mist(ctx, p) {
  const c = ctx.palette(p.palette || 'smoke'), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, U = unit(ctx), W = ctx.W, H = ctx.H;

  // 1. Anticipation: wisps curl up from the hands.
  ctx.sfx.wind(3); ctx.sfx.ominous(3.5);
  const hands = () => ctx.anchor('hands');
  // smoke-textured wisps (a 'soft' sprite piles into a white blob on the hands)
  ctx.emitter({ x: () => hands().x, y: () => hands().y, rate: 24, duration: 1100, tex: SMOKES[1], blend: 'normal', radius: U * 0.06, speed: [40, 130],
    angle: [-Math.PI * 0.85, -Math.PI * 0.15], life: [900, 1400], size: [U * 0.08, U * 0.42], color: [c.core, c.mid], alpha: [0.45, 0], spin: [-1.2, 1.2] });
  const rip = ripple(ctx, 0, 1.4);
  const blur = ctx.filter(new ctx.filters.KawaseBlurFilter({ strength: 0, quality: 3 }));
  const haze = ctx.tint(c.core, 0, 'normal');
  await ctx.wait(450);

  // 2. Fog rolls in from the floor and the sides in drifting layers.
  const fog = ctx.add(new PIXI.Container(), 'front');
  // the caster survives as a dark shape inside the fog (above it), so the mist never reads as a plain grey screen
  const shade = (await ctx.personReady()) ? ctx.personSprite() : null;
  if (shade) { shade.tint = 0x1c2028; shade.alpha = 0; ctx.add(shade, 'overlay'); } // over the haze wash
  const banks = Array.from({ length: 22 }, (_, i) => {
    const s = fog.addChild(spr(ctx, SMOKES[i % 5], mix(c.core, c.outer, ctx.rand(0, 0.45)), 'normal', 0));
    const side = i % 3; // 0 floor, 1 left, 2 right
    const tx = ctx.rand(-0.1, 1.1) * W, ty = ctx.rand(0.05, 1.05) * H;
    const sx = side === 0 ? tx : side === 1 ? -0.35 * W : 1.35 * W, sy = side === 0 ? H * 1.3 : ty;
    s.position.set(sx, sy); setSize(s, U * ctx.rand(1.1, 1.9) * scale);
    return { s, sx, sy, tx, ty, a: ctx.rand(0.55, 0.85), d: ctx.rand(0, 0.35), rot: ctx.rand(-0.15, 0.15), vx: ctx.rand(-14, 14), k: 0 };
  });
  ctx.tick((dt, t) => {
    for (const b of banks) {
      b.s.rotation += b.rot * dt / 1000; b.tx += b.vx * dt / 1000;
      const e = ease.inOutCubic(b.k);
      b.s.position.set(b.sx + (b.tx - b.sx) * e, b.sy + (b.ty - b.sy) * e + Math.sin(t * 0.001 + b.a * 9) * 8);
      b.s.alpha = b.a0 != null ? b.a : b.a * Math.min(1, b.k * 1.6);
    }
  });
  await ctx.tween(1600, (_, raw) => {
    for (const b of banks) b.k = clamp((raw - b.d) / 0.65, 0, 1);
    blur.strength = 4 * raw; haze.set(0.45 * raw); rip.amt = 8 * raw;
    if (shade) shade.alpha = 0.42 * clamp(raw * 1.5 - 0.3, 0, 1);
  });

  // 3. Hold: a white blank; a blade glints somewhere in the fog (cross star + horizontal edge streak).
  const glint = async (x, y) => {
    const f = ctx.add(spr(ctx, 'star6', 0xffffff, 'add', 0), 'overlay'), s = ctx.add(spr(ctx, 'flare1', c.glow, 'add', 0), 'overlay');
    const edge = ctx.add(spr(ctx, 'spark', 0xffffff, 'add', 0), 'overlay');
    f.position.set(x, y); s.position.set(x, y); edge.position.set(x, y); edge.rotation = -0.25;
    ctx.sfx.slash();
    await ctx.tween(300, (e, raw) => {
      const k = Math.sin(raw * Math.PI); f.alpha = k; s.alpha = k * 0.8; edge.alpha = k;
      setSize(f, U * 0.3 * k); setSize(s, U * 0.6 * k); f.rotation = raw * 0.8;
      edge.scale.set(U * 0.6 * k / 128, U * 0.03 / 16);
    });
    f.destroy(); s.destroy(); edge.destroy();
  };
  await ctx.wait(350);
  await glint(W * 0.22, H * 0.38);
  await ctx.wait(450);
  await glint(W * 0.76, H * 0.62);
  await ctx.wait(300);

  // 4. The mist thins and drifts away.
  ctx.sfx.wind(1.6);
  for (const b of banks) { b.sx = b.s.x; b.sy = b.s.y; b.tx = b.s.x + (b.s.x - W / 2) * 0.8; b.ty = b.s.y - H * 0.15; b.k = 0; b.a0 = b.s.alpha; }
  await ctx.tween(1400, (e) => {
    for (const b of banks) { b.k = e; b.a = b.a0 * (1 - e); }
    blur.strength = 4 * (1 - e); haze.set(0.45 * (1 - e)); rip.amt = 8 * (1 - e);
    if (shade) shade.alpha = 0.42 * (1 - e);
  }, ease.inOutCubic);
}

// ---------------------------------------------------------------------------------------------
/**
 * waterWave — 'collision' (default): water gushes from the caster's mouth, two huge surges rush in from
 * both sides and slam together in a geyser, the field floods, then drains. 'wave': one surge sweeps across.
 * params: palette ('water'), scale, variant.
 */
async function waterWave(ctx, p) {
  const c = ctx.palette(p.palette || 'water'), scale = p.scale ?? 1;
  const single = p.variant === 'wave';
  const { ease } = ctx, U = unit(ctx), W = ctx.W, H = ctx.H, mouth = () => ctx.anchor('mouth');

  // 1. Anticipation: chakra swells at the mouth, the ground trembles.
  ctx.sfx.charge(0.7); ctx.sfx.rumble(2);
  const rip = ripple(ctx, 0);
  ctx.shake(3, 700);
  await gather(ctx, mouth, c, 650, 1);

  // 2. Water gushes from the mouth down to the ground.
  ctx.sfx.splash(1.5); ctx.sfx.wave(3.2);
  ctx.flash(c.glow, 120, 0.25); ctx.zoomPunch(0.03, 250);
  const gush = ctx.emitter({ x: () => mouth().x, y: () => mouth().y, rate: 90, duration: 900, tex: 'soft', blend: 'normal', speed: [350, 650],
    angle: () => (Math.random() < 0.5 ? Math.PI * 0.72 : Math.PI * 0.28) + ctx.rand(-0.15, 0.15), gravity: 900, life: [500, 800],
    size: [U * 0.07, U * 0.2], color: [mix(c.mid, c.core, 0.35), c.mid], alpha: [0.9, 0.3] });
  const gushDrops = ctx.emitter({ x: () => mouth().x, y: () => mouth().y, rate: 80, duration: 900, tex: 'dot', blend: 'normal', speed: [300, 700],
    angle: [Math.PI * 0.2, Math.PI * 0.8], gravity: 1300, life: [400, 800], size: [U * 0.016, U * 0.008], color: [c.core, c.mid], alpha: [0.95, 0.4], rotateToVelocity: true, stretch: 0.5 });
  void gush; void gushDrops;

  // 3. Surges: walls of water rise at the edges and rush inward.
  const walls = (single ? [1] : [1, -1]).map((dir) => {
    const box = ctx.add(new ctx.PIXI.Container(), 'front'), back = box.addChild(ctx.g()), front = box.addChild(ctx.g()), foamG = box.addChild(ctx.g());
    wobble(ctx, box, 16, 0.4);
    const w = { dir, back, front, foamG, fx: -0.08 * W, Hc: 0, lip: { x: 0, y: H } };
    w.foam = ctx.emitter({ x: () => w.lip.x, y: () => w.lip.y, rate: () => (w.Hc > 10 ? 70 : 0), tex: 'soft', blend: 'normal', radius: () => w.Hc * 0.08,
      speed: [60, 220], angle: dir > 0 ? [-Math.PI * 0.5, 0.2] : [Math.PI, Math.PI * 1.5], gravity: 500, life: [400, 700],
      size: [() => w.Hc * 0.1, () => w.Hc * 0.28], color: [c.core, c.accent], alpha: [0.95, 0], layer: 'front' });
    w.spray = ctx.emitter({ x: () => w.lip.x, y: () => w.lip.y, rate: () => (w.Hc > 10 ? 60 : 0), tex: 'dot', blend: 'normal', radius: () => w.Hc * 0.1,
      speed: [200, 520], angle: dir > 0 ? [-Math.PI * 0.45, -0.1] : [Math.PI + 0.1, Math.PI * 1.45], gravity: 1300, life: [400, 800],
      size: [U * 0.016, U * 0.007], color: [c.core, c.mid], alpha: [0.95, 0.4], rotateToVelocity: true, stretch: 0.5, layer: 'front' });
    return w;
  });
  // left-wall geometry in "distance from its own edge" space; X() mirrors it for the right wall
  const drawWall = (w, t) => {
    const X = (x) => (w.dir > 0 ? x : W - x), N = 26, f = w.fx, Hc = w.Hc;
    const top = [];
    for (let i = 0; i <= N; i++) {
      const x = -30 + (f + 30) * (i / N), u = i / N;
      const h = Hc * (0.22 + 0.72 * Math.pow(u, 2.2)) + Hc * 0.05 * Math.sin(u * 11 - t * 0.012);
      top.push(x, H - h);
    }
    // curling crest: over the top, hanging tip, back under, then the steep face down to the ground
    const lip = [f + Hc * 0.14, H - Hc * 1.0, f + Hc * 0.28, H - Hc * 0.92, f + Hc * 0.34, H - Hc * 0.76, f + Hc * 0.24, H - Hc * 0.8,
      f + Hc * 0.14, H - Hc * 0.7, f + Hc * 0.1, H - Hc * 0.4, f + Hc * 0.16, H];
    const pts = [...top, ...lip, -30, H + 10];
    const m = (arr) => arr.map((v, i) => (i % 2 ? v : X(v)));
    w.back.clear().poly(m(pts)).fill({ color: c.outer, alpha: 0.72 });
    const inner = [];
    for (let i = 0; i < top.length; i += 2) inner.push(top[i] - Hc * 0.05, top[i + 1] + Hc * 0.14);
    w.front.clear().poly(m([...inner, f, H - Hc * 0.5, f - Hc * 0.04, H, -30, H + 10])).fill({ color: c.mid, alpha: 0.6 });
    w.foamG.clear().moveTo(X(top[0]), top[1]);
    for (let i = 2; i < top.length; i += 2) w.foamG.lineTo(X(top[i]), top[i + 1]);
    w.foamG.lineTo(X(lip[0]), lip[1]).lineTo(X(lip[2]), lip[3]).lineTo(X(lip[4]), lip[5]).stroke({ width: Math.max(3, Hc * 0.025), color: c.core, alpha: 0.85 });
    w.lip = { x: X(f + Hc * 0.26), y: H - Hc * 0.92 };
  };
  const wallTick = ctx.tick((dt, t) => { for (const w of walls) if (w.Hc > 0) drawWall(w, t); });
  void wallTick;
  const target = single ? W * 1.15 : W * 0.5;
  await ctx.tween(single ? 1600 : 1150, (e, raw) => {
    for (const w of walls) { w.fx = -0.08 * W + (target + 0.08 * W) * e; w.Hc = H * (single ? 0.85 : 0.72) * scale * Math.min(1, raw * 1.6); }
    rip.amt = 4 + 10 * raw; ctx.shake(3 + 6 * raw, 200);
  }, single ? ease.inOutCubic : ease.inCubic);

  // 4. Collision: the surges slam together in a towering geyser.
  const P = { x: W / 2, y: H * 0.55 };
  if (!single) {
    ctx.sfx.boom(1); ctx.sfx.splash(2);
    ctx.flash(mix(c.core, c.glow, 0.4), 140, 0.5); ctx.shake(24 * scale, 1100); ctx.zoomPunch(0.08, 400);
    shockwave(ctx, P.x, P.y, { amplitude: 30, wavelength: 220 });
    // towering geyser: a water column shoots up from the meeting point, then thins and falls away
    const col = ctx.add(spr(ctx, 'soft', c.mid, 'normal', 0), 'front'), colHi = ctx.add(spr(ctx, 'soft', c.accent, 'add', 0), 'front');
    for (const k of [col, colHi]) { k.anchor.set(0.5, 0.92); k.position.set(P.x, H + 20); }
    ctx.tween(900, (e, raw) => {
      const up = ease.outExpo(Math.min(1, raw * 3)), fade = 1 - clamp((raw - 0.3) / 0.7, 0, 1);
      col.scale.set(U * 0.3 * (1 + raw) / 128, H * 1.25 * up / 128); col.alpha = 0.8 * fade;
      colHi.scale.set(U * 0.12 * (1 + raw) / 128, H * 1.2 * up / 128); colHi.alpha = 0.7 * fade;
    });
    ctx.burst({ x: P.x, y: H * 0.75, count: 110, tex: 'dot', blend: 'normal', radius: [0, U * 0.1], speed: [600, 1500], angle: [-Math.PI * 0.62, -Math.PI * 0.38], gravity: 1500,
      life: [900, 1500], size: [U * 0.026, U * 0.01], color: [c.core, c.mid], alpha: [0.95, 0.5], rotateToVelocity: true, stretch: 0.6, layer: 'front' });
    ctx.burst({ x: P.x, y: H * 0.7, count: 16, tex: 'soft', blend: 'normal', radius: [0, U * 0.15], speed: [200, 900], angle: [-Math.PI * 0.65, -Math.PI * 0.35], gravity: 600, drag: 1,
      life: [900, 1500], size: [U * 0.2, U * 0.55], color: [c.accent, c.mid], alpha: [0.85, 0], spin: [-1, 1], layer: 'front' });
    splash(ctx, P.x, P.y, c, 1.6, -Math.PI / 2, TAU, 'front');
    lensDrips(ctx, c, 12);
  } else { ctx.sfx.splash(1.6); ctx.shake(14 * scale, 700); }
  rip.amt = 28;

  // 5. Flood: the walls collapse into one sloshing body of water that fills the lower screen, then drains.
  for (const w of walls) { w.foam.stop(); w.spray.stop(); }
  const sea = ctx.g(), seaHi = ctx.g(); ctx.add(sea, 'front'); ctx.add(seaHi, 'front');
  let level = H * 0.35, amp = H * 0.08;
  ctx.tick((dt, t) => {
    const N = 28, top = [];
    for (let i = 0; i <= N; i++) {
      const x = (W * i) / N;
      top.push(x, level + amp * Math.sin(x * 0.011 + t * 0.005) + amp * 0.5 * Math.sin(x * 0.027 - t * 0.008));
    }
    sea.clear().poly([...top, W, H + 10, 0, H + 10]).fill({ color: c.outer, alpha: 0.55 });
    const band = [];
    for (let i = top.length - 2; i >= 0; i -= 2) band.push(top[i], top[i + 1] + H * 0.07);
    seaHi.clear().poly([...top, ...band]).fill({ color: c.mid, alpha: 0.45 });
    seaHi.moveTo(top[0], top[1]); for (let i = 2; i < top.length; i += 2) seaHi.lineTo(top[i], top[i + 1]);
    seaHi.stroke({ width: 3, color: c.core, alpha: 0.85 });
  });
  const surf = ctx.emitter({ x: () => ctx.rand(0, W), y: () => level, rate: 40, duration: 1800, tex: 'star6', speed: [10, 60], angle: [-Math.PI, 0],
    life: [300, 600], size: [U * 0.04, 0], color: c.core, layer: 'front' });
  void surf;
  const wallsFade = ctx.tween(500, (e) => { for (const w of walls) { w.back.alpha = w.front.alpha = w.foamG.alpha = 1 - e; } });
  rainDown(ctx, c, 1000, single ? 60 : 130);
  await ctx.tween(1300, (e) => { level = H * (0.35 + 0.17 * e); amp = H * (0.08 - 0.04 * e); rip.amt = 28 - 10 * e; }, ease.outCubic);
  await wallsFade;
  for (const w of walls) w.Hc = 0;
  ctx.sfx.wave(1.5);
  await ctx.tween(1200, (e) => { level = H * (0.52 + 0.55 * e); amp = H * 0.04 * (1 - e); rip.amt = 18 * (1 - e); }, ease.inCubic);
  await ctx.wait(200);
}

export const EFFECTS = { waterShark, waterPrison, waterBullets, iceShards, mist, waterWave };
