// Storm archetypes: windBlades, airBullets, chidori, lightningStrike, lightningBeast.
// Lightning is procedural: jagged bolts re-rolled every frame and stroked in 3 additive passes (outer glow,
// mid, white core) so they read as bloom without a full-scene filter. Time only via ctx.wait/tween/tick.
//
// windBlades      variant: slash | scythe | gale           params: palette ('wind'), scale, count (slash: cuts, 2)
// airBullets      variant: bullet | vacuum | breakthrough  params: palette ('wind'), scale, count (vacuum: 6)
// chidori         variant: chidori | raikiri | spear | current  params: palette ('lightning'), scale, count (current: beams, 7)
// lightningStrike variant: bolt | kirin | darkness         params: palette ('lightning'; darkness: 'purple'), scale
// lightningBeast  variant: hound | panther                 params: palette ('lightning'), scale

const TAU = Math.PI * 2;

// ---------- helpers ----------
function sprite(ctx, tex, tint = 0xffffff, blend = 'add', parent = null) {
  const s = new ctx.PIXI.Sprite(ctx.tex(tex));
  s.anchor.set(0.5); s.tint = tint; s.blendMode = blend;
  if (parent) parent.addChild(s); else ctx.add(s);
  return s;
}
const size = (s, w, h = w) => s.scale.set(w / (s.texture.width || 1), h / (s.texture.height || 1));
const lerp = (a, b, t) => a + (b - a) * t;
// ctx.pick() is a [min,max] range, not a choice
const choose = (a) => a[(Math.random() * a.length) | 0];
/** Darken the camera image only (rect in the 'clones' layer, under the fx) - ctx.tint would dim the effect too. */
function dimScene(ctx, color) {
  const g = ctx.add(ctx.g().rect(-50, -50, ctx.W + 100, ctx.H + 100).fill(color), 'clones'); g.alpha = 0;
  return { set: (a) => { g.alpha = a; }, fade: (ms = 400) => { const a0 = g.alpha; return ctx.tween(ms, (e) => { g.alpha = a0 * (1 - e); }); } };
}

/** One particle flying from a ring of radius r into (cx, cy). */
function gather(ctx, cx, cy, r, cfg, swirl = 0.3) {
  const a = Math.random() * TAU, d = ctx.pick(r), life = ctx.pick(cfg.life ?? [260, 420]);
  ctx.burst({ ...cfg, count: 1, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, angle: a + Math.PI + swirl,
    speed: (d / (life / 1000)) * 0.95, life: [life, life] });
}
function shockwave(ctx, x, y, { amp = 30, wave = 160, speed = 900, ms = 800, bright = 1.15 } = {}) {
  const f = ctx.filter(new ctx.filters.ShockwaveFilter({ center: { x, y }, amplitude: amp, wavelength: wave, speed, brightness: bright, radius: -1 }));
  return ctx.tween(ms, (e, r) => { f.time = (r * ms) / 1000; f.amplitude = amp * (1 - r); }).then(() => ctx.removeFilter(f));
}
function zoomBlur(ctx, x, y, strength = 0.2, ms = 450) {
  const f = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength, center: { x, y }, innerRadius: 40 }));
  return ctx.tween(ms, (e) => { f.strength = strength * (1 - e); }, ctx.ease.outCubic).then(() => ctx.removeFilter(f));
}
function ring(ctx, x, y, r0, r1, color, ms = 500, tex = 'ring', alpha = 0.9, layer = 'fx') {
  const s = sprite(ctx, tex, color, 'add'); ctx.add(s, layer); s.position.set(x, y);
  return ctx.tween(ms, (e) => { size(s, 2 * (r0 + (r1 - r0) * e)); s.alpha = alpha * (1 - e); }, ctx.ease.outCubic).then(() => s.destroy());
}
/** A sprite that pops in, holds briefly and fades (cut marks, decals). */
function decal(ctx, tex, x, y, w, rot, color, { inMs = 60, holdMs = 120, outMs = 320, alpha = 1, blend = 'add', layer = 'fx' } = {}) {
  const s = sprite(ctx, tex, color, blend); ctx.add(s, layer); s.position.set(x, y); s.rotation = rot;
  return ctx.tween(inMs + holdMs + outMs, (e, r) => {
    const t = r * (inMs + holdMs + outMs);
    size(s, w * (t < inMs ? 0.4 + 0.6 * (t / inMs) : 1));
    s.alpha = alpha * (t < inMs + holdMs ? 1 : 1 - (t - inMs - holdMs) / outMs);
  }).then(() => s.destroy());
}
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};

// ---------- lightning ----------
/** Midpoint-displacement jagged polyline from a to b, flat [x,y,...]. */
function jag(ax, ay, bx, by, rough = 0.22, minSeg = 9, out = null) {
  const pts = out || [ax, ay];
  const sub = (x1, y1, x2, y2, d) => {
    if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < minSeg) { pts.push(x2, y2); return; }
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * d, my = (y1 + y2) / 2 + (Math.random() - 0.5) * d;
    sub(x1, y1, mx, my, d / 2); sub(mx, my, x2, y2, d / 2);
  };
  sub(ax, ay, bx, by, Math.hypot(bx - ax, by - ay) * rough);
  return pts;
}
/** Main bolt + side branches -> [{pts, w}] */
function bolt(ax, ay, bx, by, { w = 3, rough = 0.22, branches = 2, branchLen = 0.35, minSeg = 9, a = 1 } = {}) {
  const main = jag(ax, ay, bx, by, rough, minSeg), out = [{ pts: main, w, a }];
  const L = Math.hypot(bx - ax, by - ay), dir = Math.atan2(by - ay, bx - ax), n = main.length / 2;
  if (n < 5) return out;
  for (let i = 0; i < branches; i++) {
    const k = 2 * Math.floor(1 + Math.random() * (n - 3));
    const x = main[k], y = main[k + 1], an = dir + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6);
    const l = L * branchLen * (0.4 + Math.random() * 0.6);
    out.push({ pts: jag(x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, rough * 1.3, minSeg), w: w * 0.5, a });
  }
  return out;
}
/** Jagged path through a list of points (each leg displaced). */
function jagPath(P, rough, minSeg) {
  const out = [P[0].x, P[0].y];
  for (let i = 1; i < P.length; i++) jag(P[i - 1].x, P[i - 1].y, P[i].x, P[i].y, rough, minSeg, out);
  return out;
}
const PASSES = [[4.5, 'outer', 0.2], [2.2, 'mid', 0.6], [0.9, 'core', 1]];
function drawBolts(g, list, c, alpha = 1) {
  if (alpha <= 0.01) return;
  for (const [wm, key, a] of PASSES) for (const b of list) {
    if (b.pts.length < 4) continue;
    g.poly(b.pts, false).stroke({ width: b.w * wm, color: c[key], alpha: Math.min(1, a * alpha * (b.a ?? 1)), cap: 'round', join: 'round' });
  }
}
function boltLayer(ctx, layer = 'fx') { const g = ctx.add(ctx.g(), layer); g.blendMode = 'add'; return g; }

/** Radial lightning that bursts out of (x, y) toward the screen edges and dies away. */
function radialBolts(ctx, c, x, y, { n = 8, len = 0.6, w = 4, ms = 380, layer = 'fx' } = {}) {
  const g = boltLayer(ctx, layer), D = Math.hypot(ctx.W, ctx.H) * len;
  const rays = Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU + ctx.rand(-0.3, 0.3), l: D * ctx.rand(0.5, 1) }));
  return ctx.tween(ms, (e) => {
    g.clear();
    const list = [];
    for (const r of rays) {
      const l = r.l * Math.min(1, e * 3);
      list.push(...bolt(x, y, x + Math.cos(r.a) * l, y + Math.sin(r.a) * l, { w: w * (1 - e * 0.6), rough: 0.28, branches: 2, branchLen: 0.3, minSeg: 14 }));
    }
    drawBolts(g, list, c, 1 - ctx.ease.inCubic(e));
  }).then(() => g.destroy());
}

/** Crackling chidori-style ball of arcs that follows an anchor. Mutate O.power/R/arcs/reach/follow live. */
function makeOrb(ctx, c, { R, arcs = 8, reach = 1.7, ground = 2, anchor = 'hands', lift = 0 }) {
  const O = { x: 0, y: 0, R, R0: R, power: 0, alpha: 1, follow: true, arcs, reach, ground, lift, dead: false };
  const h0 = ctx.anchor(anchor); O.x = h0.x; O.y = h0.y - lift;
  const halo = sprite(ctx, 'soft', c.glow), light = sprite(ctx, 'light1', c.mid);
  const g = boltLayer(ctx);
  const flick = Array.from({ length: 5 }, () => sprite(ctx, 'spark1', c.core));
  const core = sprite(ctx, 'soft', c.core), star = sprite(ctx, 'star8', c.core);
  const SP = ['spark1', 'spark2', 'spark3', 'spark4'];
  ctx.tick(() => {
    if (O.dead) { g.clear(); for (const s of [halo, light, core, star, ...flick]) s.visible = false; return false; }
    if (O.follow) { const h = ctx.anchor(anchor); O.x = h.x; O.y = h.y - O.lift; }
    const P = O.power, R = O.R * (0.35 + 0.65 * P), a = O.alpha, x = O.x, y = O.y, rnd = Math.random;
    halo.position.set(x, y); size(halo, R * 5 * (0.85 + 0.3 * rnd())); halo.alpha = 0.6 * P * a * Math.min(1, (O.R0 * 1.5) / R);   // big ball = dimmer halo, no white-out
    light.position.set(x, y); size(light, R * 2.4); light.rotation = rnd() * TAU; light.alpha = 0.6 * P * a * Math.min(1, (O.R0 * 1.5) / R);
    core.position.set(x, y); size(core, R * (0.7 + 0.4 * rnd())); core.alpha = a * Math.min(1, P * 1.6);
    star.position.set(x, y); size(star, R * (2 + 2 * rnd())); star.rotation = rnd() * 0.6 - 0.3; star.alpha = 0.85 * P * a * Math.min(1, (O.R0 * 1.5) / R);
    for (const s of flick) {
      s.visible = rnd() < 0.75; s.texture = ctx.tex(SP[(rnd() * 4) | 0]);
      s.position.set(x + (rnd() - 0.5) * R * 0.6, y + (rnd() - 0.5) * R * 0.6); s.rotation = rnd() * TAU;
      size(s, R * (1.6 + 2 * rnd())); s.alpha = P * a * (0.5 + 0.5 * rnd());
    }
    g.clear();
    if (P < 0.02 || a < 0.02) return;
    const list = [], n = Math.round(O.arcs * (0.35 + 0.65 * P)), ms = Math.max(4, R * 0.06), wk = Math.min(1.6, Math.max(0.7, O.R / 60));
    for (let i = 0; i < n; i++) {
      const an = rnd() * TAU, l = R * (0.5 + rnd() * O.reach), r0 = R * 0.2 * rnd();
      list.push(...bolt(x + Math.cos(an) * r0, y + Math.sin(an) * r0, x + Math.cos(an) * l, y + Math.sin(an) * l,
        { w: (0.8 + rnd() * 1.2) * wk, rough: 0.5, branches: rnd() < 0.7 ? 2 : 0, branchLen: 0.45, minSeg: ms }));
    }
    for (let j = 0; j < O.ground; j++) if (rnd() < 0.55 * P) {
      const gx = x + (rnd() - 0.5) * R * 5, gy = ctx.H - rnd() * R * 0.5;
      list.push(...bolt(x, y, gx, gy, { w: 1.2 * wk, rough: 0.3, branches: 3, branchLen: 0.25, minSeg: 10, a: 0.8 }));
    }
    drawBolts(g, list, c, a);
  });
  return O;
}
/** Chakra gathering into the orb while `on.v`. */
function gatherInto(ctx, O, c, n = 3) {
  const on = { v: true };
  ctx.tick(() => {
    if (!on.v) return false;
    for (let i = 0; i < n; i++) gather(ctx, O.x, O.y, [O.R * 2.5, O.R * 5], { tex: 'spark', size: [O.R * 0.5, 3], color: [c.accent, c.mid], alpha: [0.2, 1], rotateToVelocity: true, stretch: 0.4 });
  });
  return on;
}

// ---------- chidori / raikiri / spear / current ----------
async function chidori(ctx, p) {
  const v = p.variant || 'chidori';
  if (v === 'current') return laserCircus(ctx, p);
  const { ease } = ctx;
  const c = ctx.palette(p.palette || 'lightning'), k = p.scale ?? 1, hs = ctx.handScale();
  const rai = v === 'raikiri', spear = v === 'spear';
  const R = hs * 0.42 * k * (rai ? 1.2 : 1);
  const O = makeOrb(ctx, c, { R, arcs: rai ? 18 : 13, reach: rai ? 2.6 : 2.2, ground: rai ? 3 : 2 });

  // 1. Anticipation: sparks gather into the palm, the scene dims, the first chirps.
  ctx.sfx.charge(0.6); ctx.sfx.chirp(rai ? 3.6 : 3.2); ctx.sfx.crackle(rai ? 3 : 2.6);
  const dim = dimScene(ctx, c.dark);
  const g1 = gatherInto(ctx, O, c, rai ? 4 : 3);
  await ctx.tween(650, (e) => { O.power = 0.85 * e; dim.set(0.32 * e); }, ease.inCubic);
  g1.v = false;

  // 2. Thousand birds: full crackling ball, blue light flickers over the scene, sparks spit off.
  ctx.shake(4, 300);
  ring(ctx, O.x, O.y, R * 0.5, R * 3, c.mid, 380);
  const glowT = ctx.tint(c.glow, 0, 'add');
  const spit = ctx.emitter({ x: () => O.x, y: () => O.y, rate: rai ? 70 : 50, tex: 'spark', speed: [250, 650], life: [100, 240],
    size: [R * 0.6, 2], color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.5, drag: 2 });
  const holdMs = rai ? 1300 : 1100;
  await ctx.tween(holdMs, (e) => {
    O.power = 0.85 + 0.15 * Math.random(); O.R = R * (1 + 0.15 * e);
    glowT.set(0.03 + 0.06 * Math.random() * (0.5 + e));
  });

  // Raikiri: a bolt from the sky slams into the hand and is split in two by it.
  if (rai) {
    const bg = boltLayer(ctx); ctx.sfx.thunder();
    ctx.flash(c.core, 90, 0.55); ctx.shake(14, 400);
    const sx = O.x + (Math.random() < 0.5 ? -1 : 1) * R * ctx.rand(2, 3);
    await ctx.tween(320, (e) => {
      bg.clear();
      const list = bolt(sx, -20, O.x, O.y - R * 0.3, { w: 4, rough: 0.2, branches: 3, branchLen: 0.25, minSeg: 14 });
      const sp = R * (1.5 + 6 * e);
      list.push(...bolt(O.x, O.y, O.x - sp, O.y + sp * 0.9 + 40, { w: 2.5, rough: 0.25, branches: 1, minSeg: 12 }));
      list.push(...bolt(O.x, O.y, O.x + sp, O.y + sp * 0.9 + 40, { w: 2.5, rough: 0.25, branches: 1, minSeg: 12 }));
      drawBolts(bg, list, c, 1 - ease.inCubic(e));
      O.power = 1; O.R = R * (1.15 + 0.25 * e);
    });
    bg.destroy();
  }
  spit.stop();
  if (spear) await spearRelease(ctx, c, O, R); else await thrustRelease(ctx, c, O, R, rai);

  // 4. Follow-through: the ball sputters out, sparks fall, smoke and stray crackles linger.
  const ox = O.x, oy = O.y;
  ctx.burst({ x: ox, y: oy, count: 26, tex: 'dot', radius: [0, R], speed: [60, 260], angle: [-Math.PI, 0], life: [600, 1100],
    size: [5, 1], color: [c.core, c.mid], gravity: 700 });
  ctx.burst({ x: ox, y: oy, count: 8, tex: choose(['smoke2', 'smoke4', 'smoke6']), blend: 'normal', radius: [0, R], speed: [20, 70],
    angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [900, 1400], size: [R * 1.5, R * 3], color: [0x8a90a0, c.dark], alpha: [0.35, 0], spin: [-1, 1] });
  dim.fade(700); glowT.fade(300);
  await ctx.tween(650, (e) => { O.power = (1 - e) * (Math.random() < 0.3 ? 0.6 : 0.15); O.R = R * (1 - 0.5 * e); O.arcs = 4; });
  O.dead = true;
  await ctx.wait(450);
}

/** Chidori / Raikiri: lunge through the target - the ball rushes the camera and detonates. */
async function thrustRelease(ctx, c, O, R, rai) {
  const { ease } = ctx;
  const x0 = O.x, y0 = O.y; O.follow = false;
  ctx.sfx.whoosh(0.2);
  await ctx.tween(170, (e) => {
    O.x = lerp(x0, ctx.W / 2, 0.3 * e); O.y = lerp(y0, ctx.H * 0.55, 0.3 * e);
    O.R = R * (1.2 + (rai ? 1.6 : 1.4) * e); O.reach = 2.2 + 1.2 * e; O.power = 1;
  }, ease.inCubic);
  const ix = O.x, iy = O.y, IR = O.R;
  ctx.sfx.zap(); ctx.sfx.boom(rai ? 1.3 : 0.9); ctx.sfx.crackle(1);
  ctx.flash(c.core, 90, rai ? 0.3 : 0.35);
  ctx.shake(rai ? 26 : 18, rai ? 800 : 600); ctx.zoomPunch(rai ? 0.1 : 0.07, 320);
  zoomBlur(ctx, ix, iy, rai ? 0.22 : 0.18, 420);
  shockwave(ctx, ix, iy, { amp: rai ? 50 : 34, wave: 180, speed: 1100, ms: 800 });
  radialBolts(ctx, c, ix, iy, { n: rai ? 11 : 8, len: 0.65, w: rai ? 3 : 2.4, ms: rai ? 480 : 380 });
  ring(ctx, ix, iy, IR * 0.5, IR * 4, c.mid, 450, 'ring', 0.7);
  ring(ctx, ix, iy, IR * 0.3, IR * 2.8, c.mid, 600, 'circle1', 0.8);
  ctx.burst({ x: ix, y: iy, count: rai ? 45 : 35, tex: 'spark', radius: [0, IR * 0.4], speed: [500, 1500], life: [200, 500],
    size: [R * 0.7, 3], color: [c.core, c.accent, c.mid], rotateToVelocity: true, stretch: 0.7, drag: 2 });
  if (rai) {
    // the refined edge: a clean diagonal cut through the frame
    const g = ctx.add(ctx.g()); g.blendMode = 'add';
    const a = -0.5, L = Math.hypot(ctx.W, ctx.H);
    ctx.tween(380, (e) => {
      g.clear();
      const dx = Math.cos(a) * L, dy = Math.sin(a) * L, w = 16 * (1 - e);
      for (const [ww, col, al] of [[w * 4, c.outer, 0.3], [w * 1.8, c.mid, 0.7], [w * 0.7 + 1, c.core, 1]])
        g.moveTo(ix - dx * Math.min(1, e * 4), iy - dy * Math.min(1, e * 4)).lineTo(ix + dx * Math.min(1, e * 4), iy + dy * Math.min(1, e * 4))
          .stroke({ width: ww, color: col, alpha: al * (1 - e) });
    }).then(() => g.destroy());
  }
  await ctx.tween(300, (e) => { O.R = IR * (1 - 0.4 * e); O.power = 1 - 0.3 * e; });
}

/** Chidori Spear: the ball stretches into a long blade of lightning that stabs across the frame. */
async function spearRelease(ctx, c, O, R) {
  const { ease } = ctx;
  const g = boltLayer(ctx), tip = sprite(ctx, 'soft', c.glow), tipStar = sprite(ctx, 'star8', c.core);
  tip.alpha = tipStar.alpha = 0;
  const tgt = { x: ctx.W * 0.08, y: ctx.H * 0.2 };
  let ext = 0, thick = 1, alpha = 1, live = true;
  const end = () => ({ x: lerp(O.x, tgt.x, ext), y: lerp(O.y, tgt.y, ext) });
  ctx.tick(() => {
    if (!live) return false;
    g.clear();
    if (ext <= 0.01 || alpha <= 0) { tip.alpha = tipStar.alpha = 0; return; }
    const e = end(), w = 3.2 * thick;
    const list = [{ pts: jag(O.x, O.y, e.x, e.y, 0.03, 30), w: w * 1.6 }];
    for (let i = 0; i < 4; i++) list.push(...bolt(O.x, O.y, e.x, e.y, { w: w * 0.5, rough: 0.12, branches: 2, branchLen: 0.12, minSeg: 14 }));
    drawBolts(g, list, c, alpha);
    tip.position.set(e.x, e.y); size(tip, R * 4 * (0.8 + 0.4 * Math.random())); tip.alpha = 0.8 * alpha;
    tipStar.position.set(e.x, e.y); size(tipStar, R * (2.5 + 2 * Math.random())); tipStar.alpha = alpha;
  });
  ctx.sfx.zap(); ctx.sfx.whoosh(0.15);
  await ctx.tween(140, (e) => { ext = e; O.power = 1; }, ease.outExpo);
  const e0 = end();
  ctx.sfx.crack(); ctx.sfx.boom(0.6);
  ctx.flash(c.core, 90, 0.5); ctx.shake(14, 500); ctx.zoomPunch(0.05, 250);
  shockwave(ctx, e0.x, e0.y, { amp: 30, wave: 140, speed: 900, ms: 700 });
  radialBolts(ctx, c, e0.x, e0.y, { n: 6, len: 0.25, w: 2, ms: 350 });
  ring(ctx, e0.x, e0.y, R * 0.3, R * 3, c.core, 450, 'ring');
  ctx.burst({ x: e0.x, y: e0.y, count: 40, tex: 'spark', speed: [400, 1200], life: [200, 450], size: [R * 0.6, 3],
    color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.6, drag: 2 });
    await ctx.tween(750, (e) => { thick = 1 + 0.25 * Math.sin(e * 60); O.power = 1; });
  ctx.sfx.zap();
  await ctx.tween(220, (e) => { ext = 1 - e; thick = 1 - 0.5 * e; }, ease.inCubic);
  live = false; g.destroy(); tip.destroy(); tipStar.destroy();
}

/** Laser Circus: beams of storm chakra fire from the hands and curve after their targets. */
async function laserCircus(ctx, p) {
  const { ease, rand } = ctx;
  const c = ctx.palette(p.palette || 'lightning'), k = p.scale ?? 1, hs = ctx.handScale(), W = ctx.W, H = ctx.H;
  const n = p.count ?? 7, R = hs * 0.45 * k;
  const O = makeOrb(ctx, c, { R, arcs: 6, reach: 1.3, ground: 0 });
  ctx.sfx.charge(0.7); ctx.sfx.hum(2.6, 160); ctx.sfx.crackle(2.4);
  const dim = dimScene(ctx, c.dark);
  const g1 = gatherInto(ctx, O, c, 3);
  await ctx.tween(750, (e) => { O.power = e; dim.set(0.3 * e); }, ease.inCubic);
  g1.v = false;
  await ctx.tween(300, () => { O.power = 0.9 + 0.1 * Math.random(); O.R = R * (1 + 0.1 * Math.random()); });

  const g = boltLayer(ctx);
  const beams = Array.from({ length: n }, (_, i) => {
    const tx = W * (0.07 + 0.86 * (n === 1 ? 0.5 : i / (n - 1))) + rand(-30, 30), ty = H * rand(0.08, 0.5);
    const dirx = (i / Math.max(1, n - 1) - 0.5) * 2;
    return { t0: i * 80 + rand(0, 40), tgt: { x: tx, y: ty }, head: 0, tail: 0, hit: false,
      c1: { x: dirx * W * rand(0.1, 0.35), y: -H * rand(0.35, 0.6) }, c2: { x: -dirx * W * rand(0.15, 0.3), y: H * rand(0.15, 0.35) },
      glow: sprite(ctx, 'soft', c.glow) };
  });
  let el = 0;
  const FLY = 420, FADE = 320;
  ctx.sfx.zap();
  ctx.shake(5, 300);
  const done = new Promise((res) => ctx.tick((dt) => {
    el += dt;
    const o = { x: O.x, y: O.y - R * 0.2 };
    g.clear();
    const list = [];
    let alive = 0;
    for (const b of beams) {
      const t = el - b.t0;
      if (t < 0) { alive++; continue; }
      b.head = Math.min(1, ease.outCubic(t / FLY)); b.tail = Math.max(0, (t - FLY * 0.55) / (FLY * 0.45 + FADE));
      if (b.tail >= 1) { b.glow.visible = false; continue; }
      alive++;
      const p0 = o, p1 = { x: o.x + b.c1.x, y: o.y + b.c1.y }, p2 = { x: b.tgt.x + b.c2.x, y: b.tgt.y + b.c2.y }, p3 = b.tgt;
      const P = [];
      for (let s = 0; s <= 16; s++) P.push(bez(p0, p1, p2, p3, lerp(Math.min(b.tail, b.head), b.head, s / 16)));
      const hp = P[P.length - 1];
      const w = 3 * (1 - b.tail * 0.5);
      list.push({ pts: P.flatMap((q) => [q.x, q.y]), w });
      list.push({ pts: jagPath(P, 0.3, 8), w: w * 0.4 }, { pts: jagPath(P, 0.3, 8), w: w * 0.3 });
      b.glow.position.set(hp.x, hp.y); size(b.glow, R * 2.2 * (0.8 + 0.4 * Math.random())); b.glow.alpha = 0.9 * (1 - b.tail);
      if (b.head >= 1 && !b.hit) {
        b.hit = true; ctx.sfx.zap(); ctx.shake(7, 200);
        ring(ctx, hp.x, hp.y, R * 0.2, R * 1.5, c.core, 260, 'ring', 0.7);
        ctx.burst({ x: hp.x, y: hp.y, count: 18, tex: 'spark', speed: [300, 900], life: [150, 350], size: [R * 0.5, 2], color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.6, drag: 2 });
        ctx.burst({ x: hp.x, y: hp.y, count: 1, tex: choose(['spark1', 'spark2']), speed: 0, life: [220, 220], size: [R * 3, R * 3.5], color: c.core, alpha: [1, 0] });
      }
    }
    drawBolts(g, list, c, 1);
    if (!alive) { res(); return false; }
  }));
  ctx.flash(c.core, 80, 0.35);
  await done;
  g.destroy();
  dim.fade(600);
  await ctx.tween(500, (e) => { O.power = 1 - e; });
  O.dead = true;
  ctx.burst({ x: O.x, y: O.y, count: 16, tex: 'dot', radius: [0, R], speed: [40, 200], angle: [-Math.PI, 0], life: [500, 900], size: [4, 1], color: [c.core, c.mid], gravity: 600 });
  await ctx.wait(500);
}

// ---------- lightning strike (kirin / bolt / darkness) ----------
// Kirin head in profile, facing +x, unit = head length. Polylines.
const KIRIN_HEAD = [[-0.35, -0.15], [-0.15, -0.32], [0.1, -0.34], [0.18, -0.28], [0.5, -0.22], [0.78, -0.23], [0.9, -0.12], [0.85, -0.03], [0.25, 0.02]];
const KIRIN_JAW = [[0.25, 0.02], [0.5, 0.2], [0.8, 0.33], [0.76, 0.43], [0.45, 0.37], [0.05, 0.3], [-0.3, 0.22]];
const KIRIN = [
  KIRIN_HEAD, KIRIN_JAW,
  [[0.84, -0.03], [0.78, 0.06], [0.7, -0.01], [0.62, 0.07], [0.54, 0.0], [0.46, 0.06], [0.38, 0.01]],   // upper fangs
  [[0.77, 0.33], [0.72, 0.24], [0.65, 0.29], [0.58, 0.19], [0.52, 0.23], [0.45, 0.14]],                // lower fangs
  [[0.0, -0.33], [-0.3, -0.55], [-0.7, -0.6], [-0.95, -0.5]], [[0.08, -0.33], [-0.15, -0.7], [-0.45, -0.9], [-0.72, -0.95]], // horns
  [[0.76, -0.2], [0.55, -0.45], [0.2, -0.58], [-0.1, -0.52]],                                           // whisker
  [[-0.35, -0.15], [-0.75, -0.28]], [[-0.38, 0.0], [-0.88, -0.04]], [[-0.36, 0.14], [-0.82, 0.24]], [[-0.3, 0.22], [-0.65, 0.48]], // mane
];
const KIRIN_FILL = [...KIRIN_HEAD, [-0.38, 0.05]];
const KIRIN_JAW_FILL = [...KIRIN_JAW, [0.1, 0.12]];
function placePts(poly, x, y, s, rot, flip = 1) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return poly.map(([px, py]) => ({ x: x + (px * flip * cs - py * sn) * s, y: y + (px * flip * sn + py * cs) * s }));
}

function stormClouds(ctx, c) {
  const W = ctx.W, H = ctx.H;
  const cl = Array.from({ length: 13 }, (_, i) => {
    const s = sprite(ctx, choose(['smoke1', 'smoke2', 'smoke3', 'smoke5', 'smoke7']), choose([0x14182a, 0x1c2238, 0x0c0f1c]), 'normal');
    ctx.add(s, 'front');
    s.position.set(W * (i / 12) + ctx.rand(-40, 40), H * ctx.rand(-0.06, 0.16)); size(s, W * ctx.rand(0.3, 0.5)); s.alpha = 0; s.rotation = ctx.rand(0, TAU);
    return { s, vx: ctx.rand(-12, 12), a: ctx.rand(0.75, 0.95), spin: ctx.rand(-0.1, 0.1) };
  });
  const lights = Array.from({ length: 3 }, () => { const s = sprite(ctx, 'soft', c.glow); ctx.add(s, 'front'); s.alpha = 0; return s; });
  const g = boltLayer(ctx, 'front');
  const C = { level: 0, storm: 0 };
  ctx.tick((dt) => {
    for (const o of cl) { o.s.x += o.vx * dt / 1000; o.s.rotation += o.spin * dt / 1000; o.s.alpha = o.a * C.level; }
    g.clear();
    for (const l of lights) {
      if (Math.random() < 0.05 * C.storm) { l.position.set(W * ctx.rand(0.05, 0.95), H * ctx.rand(0, 0.12)); size(l, W * ctx.rand(0.15, 0.3)); l.alpha = 0.7; }
      l.alpha *= 0.85;
    }
    if (Math.random() < 0.06 * C.storm) {
      const x = W * ctx.rand(0.05, 0.95), y = H * ctx.rand(0, 0.1);
      drawBolts(g, bolt(x, y, x + ctx.rand(-200, 200), y + ctx.rand(20, 90), { w: 2, branches: 2, minSeg: 10 }), c, 0.8 * C.level);
    }
  });
  return C;
}

async function lightningStrike(ctx, p) {
  const { ease, rand } = ctx;
  const v = p.variant || 'bolt', kirin = v === 'kirin';
  const c = ctx.palette(p.palette || (v === 'darkness' ? 'purple' : 'lightning'));
  const k = p.scale ?? 1, W = ctx.W, H = ctx.H, hs = ctx.handScale();
  const hand = () => ctx.anchor('hands');

  // 1. Anticipation: sky goes dark, storm clouds roll in and flicker, the caster raises a crackling hand.
  ctx.sfx.rumble(kirin ? 3 : 2); ctx.sfx.ominous(kirin ? 2.5 : 1.5);
  const dim = dimScene(ctx, 0x05070f);
  const C = stormClouds(ctx, c);
  const O = makeOrb(ctx, c, { R: hs * 0.3, arcs: 5, reach: 1.5, ground: 0, lift: hs * 0.3 });
  const charge = kirin ? 1700 : 1000;
  ctx.sfx.crackle(charge / 1000);
  await ctx.tween(charge, (e) => { C.level = Math.min(1, e * 1.6); C.storm = e; dim.set(0.45 * ease.outCubic(e)); O.power = 0.7 * e; });
  // pilot spark from the hand to the clouds
  const pg = boltLayer(ctx);
  ctx.sfx.zap();
  await ctx.tween(220, (e) => { pg.clear(); const h = hand(); drawBolts(pg, bolt(h.x, h.y - hs * 0.3, h.x + 40, H * 0.08, { w: 2, branches: 3, rough: 0.3, minSeg: 12 }), c, 1 - e); O.power = 1; });
  pg.destroy();

  // 2. Release: the strike comes down from the top.
  // Kirin dives in from the upper right, facing down-left (mirrored profile), so the caster stays visible.
  const T = { x: W * 0.72, y: H * 0.84 }, ROT = -0.6, fwd = { x: -Math.cos(0.6), y: Math.sin(0.6) };
  const D = Math.hypot(W, H) * 1.2;
  const S = kirin ? { x: T.x - fwd.x * D, y: T.y - fwd.y * D } : { x: W * 0.75, y: -H * 0.1 };
  const cloud = { x: W * 1.08, y: -H * 0.1 };
  const Hs = H * 0.4 * k;
  const fillG = ctx.add(ctx.g(), 'front'); fillG.blendMode = 'add';
  const g = boltLayer(ctx, 'front');
  const bodyGlow = sprite(ctx, 'soft', c.glow); ctx.add(bodyGlow, 'front'); bodyGlow.alpha = 0;
  const eye = sprite(ctx, 'star8', c.core); ctx.add(eye, 'front'); eye.alpha = 0;
  const st = { x: S.x, y: S.y, a: 0, t: 0, ground: false, pillar: 0 };
  const pp = (poly) => placePts(poly, st.x, st.y, Hs, ROT, -1);
  ctx.tick((dt) => {
    st.t += dt;
    g.clear(); fillG.clear();
    if (st.a <= 0.01) { bodyGlow.alpha = eye.alpha = 0; return; }
    const a = st.a * (0.75 + 0.25 * Math.random());
    const list = [];
    if (kirin) {
      const back = pp([[-0.4, 0]])[0];
      // serpentine body from the clouds to the back of the head
      const B = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16, q = bez(cloud, { x: W * 0.8, y: H * 0.1 }, { x: back.x - fwd.x * Hs * 1.2, y: back.y - fwd.y * Hs * 1.2 }, back, u);
        const nx = Math.sin(u * 9 + st.t / 90) * Hs * 0.08 * (1 - u * 0.5);
        B.push({ x: q.x + nx, y: q.y + nx * 0.4 });
      }
      // body ribbon: glowing fill with crackling edges, thickening toward the head
      const Lp = [], Rp = [];
      B.forEach((q, i) => {
        const a2 = B[Math.min(i + 1, B.length - 1)], a1 = B[Math.max(i - 1, 0)], d = Math.hypot(a2.x - a1.x, a2.y - a1.y) || 1;
        const nx = -(a2.y - a1.y) / d, ny = (a2.x - a1.x) / d, w = Hs * (0.06 + 0.16 * (i / 16));
        Lp.push({ x: q.x + nx * w, y: q.y + ny * w }); Rp.push({ x: q.x - nx * w, y: q.y - ny * w });
      });
      fillG.poly([...Lp, ...Rp.slice().reverse()].flatMap((q) => [q.x, q.y])).fill({ color: c.outer, alpha: 0.4 * a });
      list.push({ pts: jagPath(Lp, 0.25, 14), w: 3 }, { pts: jagPath(Rp, 0.25, 14), w: 3 }, { pts: jagPath(B, 0.35, 16), w: 2 });
      for (const F of [KIRIN_FILL, KIRIN_JAW_FILL]) fillG.poly(pp(F).flatMap((q) => [q.x, q.y])).fill({ color: c.outer, alpha: 0.5 * a });
      KIRIN.forEach((poly, i) => list.push({ pts: jagPath(pp(poly), i < 4 ? 0.08 : 0.18, 10), w: i < 2 ? 4 : 2.6 }));
      for (let i = 0; i < 3; i++) {   // inner arcs fill the head with crackle
        const q = pp([[rand(-0.3, 0.6), rand(-0.25, 0.25)], [rand(-0.3, 0.6), rand(-0.25, 0.25)]]);
        list.push(...bolt(q[0].x, q[0].y, q[1].x, q[1].y, { w: 1.4, branches: 1, minSeg: 10 }));
      }
      const ep = pp([[0.2, -0.2]])[0];
      eye.position.set(ep.x, ep.y); size(eye, Hs * 0.4); eye.alpha = a;
      const gp = pp([[0.1, 0]])[0];
      bodyGlow.position.set(gp.x, gp.y); size(bodyGlow, Hs * 2.6); bodyGlow.alpha = 0.55 * a;
    } else {
      list.push(...bolt(cloud.x + W * 0.1, 0, st.x, st.y, { w: 7, rough: 0.22, branches: 5, branchLen: 0.3, minSeg: 14 }));
      bodyGlow.position.set(st.x, st.y); size(bodyGlow, Hs * 1.6); bodyGlow.alpha = 0.6 * a;
    }
    if (st.pillar > 0.02) for (let i = 0; i < 2; i++)   // the strike itself: a column of lightning from the sky into the target
      list.push(...bolt(T.x + rand(-W * 0.06, W * 0.06), -20, T.x, T.y, { w: 7 * st.pillar, rough: 0.18, branches: 4, branchLen: 0.25, minSeg: 14 }));
    if (st.ground) for (let i = 0; i < 4; i++) {   // arcs crawling over the ground around the impact
      const gx = T.x + rand(-1, 1) * W * 0.3, gy = H - rand(0, H * 0.05);
      list.push(...bolt(T.x, T.y, gx, gy, { w: 2, rough: 0.3, branches: 2, minSeg: 12, a: 0.8 }));
    }
    drawBolts(g, list, c, a);
  });
  ctx.sfx.whoosh(0.3);
  const fall = kirin ? 340 : 120;
  const j = placePts([[0.8, 0.35]], 0, 0, Hs, ROT, -1)[0], stopAt = kirin ? { x: T.x - j.x, y: T.y - j.y } : T;   // jaws end on the target
  await ctx.tween(fall, (e) => { st.x = lerp(S.x, stopAt.x, e); st.y = lerp(S.y, stopAt.y, e); st.a = Math.min(1, e * 2); }, ease.inCubic);

  // impact
  ctx.sfx.thunder(); ctx.sfx.boom(kirin ? 1.8 : 1.2);
  ctx.flash(0xffffff, 100, kirin ? 0.5 : 0.6);
  ctx.shake(kirin ? 34 : 22, kirin ? 1100 : 700); ctx.zoomPunch(kirin ? 0.12 : 0.07, 400);
  shockwave(ctx, T.x, T.y, { amp: kirin ? 45 : 40, wave: 240, speed: 1300, ms: 1000 });
  if (!kirin) zoomBlur(ctx, T.x, T.y, 0.2, 500);
  st.ground = true;
  ring(ctx, T.x, T.y, 20, W * 0.35, c.core, 550, 'ring', 1, 'front');
  ring(ctx, T.x, T.y, 10, W * 0.22, c.mid, 750, 'circle1', 0.9, 'front');
  const sc = sprite(ctx, 'scorch1', 0x050508, 'normal'); ctx.add(sc, 'fx'); sc.position.set(T.x, T.y); size(sc, Hs * 1.4, Hs * 0.5); sc.alpha = 0.8;
  ctx.burst({ x: T.x, y: T.y, count: 60, tex: 'spark', speed: [500, 1600], angle: [-Math.PI, 0], life: [250, 600], size: [Hs * 0.2, 3],
    color: [c.core, c.accent, c.mid], rotateToVelocity: true, stretch: 0.7, drag: 1.8, layer: 'front' });
  ctx.burst({ x: T.x, y: T.y, count: 26, tex: choose(['dirt1', 'dirt2']), blend: 'normal', speed: [300, 900], angle: [-Math.PI * 0.9, -Math.PI * 0.1],
    life: [600, 1100], size: [22, 8], color: 0x2a2a30, gravity: 1500, spin: [-8, 8], layer: 'front' });
  ctx.tint(c.glow, 0.25, 'add').fade(500);
  await ctx.tween(kirin ? 450 : 200, (e) => { st.a = 1; st.pillar = kirin ? 1 - e : 0; });
  st.pillar = 0;

  // 3. Follow-through: the beast dissolves into the ground, crawling arcs, rising smoke, clouds clear.
  ctx.sfx.crackle(1.4);
  ctx.burst({ x: T.x, y: T.y, count: 12, tex: choose(['smoke2', 'smoke3', 'smoke6']), blend: 'normal', radius: [0, Hs * 0.4], speed: [30, 120],
    angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [1200, 1900], size: [Hs * 0.6, Hs * 1.3], color: [0x50586a, 0x1a1c24], alpha: [0.5, 0], spin: [-1, 1] });
  const embers = ctx.emitter({ x: () => T.x + rand(-W * 0.2, W * 0.2), y: H - 10, rate: 40, duration: 1200, tex: 'dot', speed: [60, 200], angle: [-Math.PI * 0.7, -Math.PI * 0.3],
    life: [400, 900], size: [5, 1], color: [c.core, c.mid] });
  await ctx.tween(kirin ? 800 : 600, (e) => { st.a = 1 - e; O.power = 1 - e; C.storm = 1 - e; });
  st.a = 0; O.dead = true;
  dim.fade(800);
  await ctx.tween(900, (e) => { C.level = 1 - e; sc.alpha = 0.8 * (1 - e * 0.6); });
  embers.stop();
  await ctx.tween(300, (e) => { sc.alpha = 0.32 * (1 - e); });
}

// ---------- lightning hound ----------
// Side view facing +x, unit = body length, origin = body centre.
const DOG = [
  [0.66, -0.25], [0.56, -0.17], [0.45, -0.16], [0.36, -0.08], [0.3, 0.03], [0.1, 0.06], [-0.12, 0.04], [-0.3, 0.03], [-0.42, -0.02],
  [-0.47, -0.16], [-0.4, -0.22], [-0.15, -0.2], [0.12, -0.24], [0.26, -0.33], [0.31, -0.45], [0.31, -0.6], [0.4, -0.45], [0.47, -0.4],
  [0.55, -0.34], [0.66, -0.3], [0.66, -0.25],
];
const CAT = [
  [0.6, -0.2], [0.5, -0.12], [0.4, -0.1], [0.32, -0.02], [0.28, 0.05], [0.05, 0.07], [-0.2, 0.06], [-0.4, 0.02], [-0.48, -0.1],
  [-0.42, -0.2], [-0.15, -0.16], [0.12, -0.2], [0.28, -0.28], [0.34, -0.38], [0.38, -0.3], [0.46, -0.37], [0.48, -0.3], [0.6, -0.26], [0.6, -0.2],
];
function beastLines(x, y, s, ph, amt, face, cat) {
  const P = (px, py) => ({ x: x + px * s * face, y: y + py * s });
  const lines = [(cat ? CAT : DOG).map(([a, b]) => P(a, b))];
  const legs = [[0.27, 0.0, 0], [0.22, 0.02, 0.5], [-0.36, -0.02, Math.PI], [-0.31, 0.0, Math.PI + 0.5]];
  for (const [hx, hy, off] of legs) {
    const front = hx > 0, sw = amt * Math.sin(ph + off);
    const a1 = sw * 0.7 + (front ? 0.1 : -0.15), a2 = a1 + (front ? -0.35 : 0.6) * (0.4 + 0.6 * Math.max(0, Math.sin(ph + off + 1.3)));
    const kx = hx + Math.sin(a1) * 0.2, ky = hy + Math.cos(a1) * 0.2, fx = kx + Math.sin(a2) * 0.2, fy = ky + Math.cos(a2) * 0.2;
    lines.push([P(hx, hy), P(kx, ky), P(fx, fy)]);
  }
  const tw = Math.sin(ph * 0.7) * 0.06;  // streaming lightning tail
  lines.push([P(-0.45, -0.17), P(-0.62, -0.26 + tw), P(-0.82, -0.27 - tw), P(-1.0, -0.2 + tw)]);
  return lines;
}

async function lightningBeast(ctx, p) {
  const { ease, rand } = ctx;
  const cat = p.variant === 'panther';
  const c = ctx.palette(p.palette || 'lightning'), k = p.scale ?? 1, hs = ctx.handScale(), W = ctx.W, H = ctx.H;
  const L = H * 0.46 * k;
  const O = makeOrb(ctx, c, { R: hs * 0.38 * k, arcs: 8, reach: 1.6, ground: 1 });

  // 1. Anticipation: lightning crackles in the hand.
  ctx.sfx.charge(0.6); ctx.sfx.crackle(2.4);
  const dim = dimScene(ctx, c.dark);
  const g1 = gatherInto(ctx, O, c, 3);
  await ctx.tween(700, (e) => { O.power = e; dim.set(0.3 * e); }, ease.inCubic);
  g1.v = false;

  const h0 = ctx.anchor('hands');
  const face = h0.x < W * 0.6 ? 1 : -1;
  const B = { x: h0.x, y: h0.y, s: 0.01, ph: 0, amt: 0, a: 0, gspd: 0 };
  const g = boltLayer(ctx);
  const glow = sprite(ctx, 'soft', c.glow), eye = sprite(ctx, 'star8', c.core);
  glow.alpha = eye.alpha = 0;
  ctx.tick((dt) => {
    B.ph += B.gspd * dt / 1000;
    g.clear();
    if (B.a <= 0.01) { glow.alpha = eye.alpha = 0; return; }
    const s = L * B.s, bob = -Math.abs(Math.sin(B.ph)) * s * 0.05 * B.amt, a = B.a * (0.8 + 0.2 * Math.random());
    const lines = beastLines(B.x, B.y + bob, s, B.ph, B.amt, face, cat);
    const list = lines.map((ln, i) => ({ pts: jagPath(ln, 0.2, Math.max(6, s * 0.035)), w: Math.min(4, i === 0 ? s / 70 : s / 90) }));
    for (let i = 0; i < 4; i++) {   // body made of arcs
      const q1 = lines[0][(Math.random() * lines[0].length) | 0], q2 = lines[0][(Math.random() * lines[0].length) | 0];
      list.push(...bolt(q1.x, q1.y, q2.x, q2.y, { w: 1.2, rough: 0.35, branches: 1, minSeg: 8 }));
    }
    drawBolts(g, list, c, a);
    glow.position.set(B.x, B.y + bob - s * 0.1); size(glow, s * 1.9, s * 1.1); glow.alpha = 0.55 * a / Math.max(1, B.s * B.s);
    eye.position.set(B.x + face * s * (cat ? 0.5 : 0.53), B.y + bob - s * (cat ? 0.27 : 0.3)); size(eye, s * 0.16); eye.rotation += 0.2; eye.alpha = a;
  });

  // 2. The hound takes shape out of the hand.
  ctx.sfx.zap(); ctx.sfx.roar(0.6);
  ctx.shake(6, 300);
  const fx0 = h0.x + face * L * 0.35, fy0 = H - L * 0.32;
  ring(ctx, h0.x, h0.y, 10, L * 0.6, c.mid, 400);
  await ctx.tween(380, (e) => {
    const h = ctx.anchor('hands');
    B.x = lerp(h.x, fx0, e); B.y = lerp(h.y, fy0, e); B.s = 0.15 + 0.85 * e; B.a = Math.min(1, e * 2); B.amt = 0.3 * e; B.gspd = 6;
    O.power = 1 - 0.7 * e;
  }, ease.outBack);
  await ctx.wait(150);

  // 3. Sprint across the ground, then pounce at the camera.
  ctx.sfx.whoosh(0.6); ctx.sfx.chirp(0.8);
  const trail = ctx.emitter({ x: () => B.x - face * L * B.s * 0.3, y: () => B.y + L * B.s * 0.15, rate: 90, tex: 'spark', speed: [80, 300],
    angle: face > 0 ? [Math.PI * 0.8, Math.PI * 1.2] : [-0.2, 0.2], life: [150, 350], size: [L * 0.08, 2], color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.5 });
  const rx = face > 0 ? W * 0.8 : W * 0.2;
  await ctx.tween(600, (e) => { B.x = lerp(fx0, rx, e); B.amt = 1; B.gspd = 26; O.power = 0.3 * (1 - e); }, ease.inOutCubic);
  trail.stop();
  ctx.sfx.zap();
  const px = B.x, py = B.y;
  await ctx.tween(260, (e) => {
    B.x = lerp(px, W * (face > 0 ? 0.62 : 0.38), e); B.y = lerp(py, H * 0.5, e) - Math.sin(e * Math.PI) * L * 0.3;
    B.s = 1 + 0.9 * e; B.amt = 0.6; B.gspd = 12;
  }, ease.inCubic);

  // impact
  const ix = B.x, iy = B.y;
  ctx.sfx.boom(1); ctx.sfx.thunder();
  ctx.flash(c.core, 90, 0.35); ctx.shake(22, 700); ctx.zoomPunch(0.08, 300);
  shockwave(ctx, ix, iy, { amp: 40, wave: 200, speed: 1200, ms: 800 });
  radialBolts(ctx, c, ix, iy, { n: 9, len: 0.6, w: 2.4, ms: 420 });
  ring(ctx, ix, iy, 20, L * 1.4, c.core, 450, 'ring');
  ctx.burst({ x: ix, y: iy, count: 60, tex: 'spark', radius: [0, L * 0.3], speed: [400, 1400], life: [200, 500], size: [L * 0.15, 3],
    color: [c.core, c.accent, c.mid], rotateToVelocity: true, stretch: 0.7, drag: 2 });
  await ctx.tween(350, (e) => { B.s = 1.9 + 0.5 * e; B.a = 1 - e; B.amt = 0; }, ease.outCubic);
  B.a = 0; O.dead = true;

  // 4. Follow-through
  ctx.burst({ x: ix, y: iy, count: 22, tex: 'dot', radius: [0, L * 0.5], speed: [40, 220], life: [600, 1100], size: [5, 1], color: [c.core, c.mid], gravity: 500 });
  ctx.burst({ x: ix, y: iy, count: 8, tex: choose(['smoke2', 'smoke4']), blend: 'normal', radius: [0, L * 0.3], speed: [20, 80], life: [900, 1400],
    size: [L * 0.5, L * 0.9], color: [0x6a7080, c.dark], alpha: [0.35, 0], spin: [-1, 1] });
  dim.fade(700);
  await ctx.wait(900);
}

// ---------- wind: blades ----------
async function windBlades(ctx, p) {
  const v = p.variant || 'slash';
  if (v === 'slash') return windCutter(ctx, p);
  return sickleWeasel(ctx, p, v === 'gale');
}

/** Wind leaves/dust lifted and spun around the hands while charging. */
function windGather(ctx, c, hs, on) {
  ctx.tick(() => {
    if (!on.v) return false;
    const h = ctx.anchor('hands');
    if (Math.random() < 0.5) gather(ctx, h.x, h.y, [hs * 1.2, hs * 2.6], { tex: choose(['twirl1', 'twirl2', 'twirl3']), size: [hs * 1.2, hs * 0.4], alpha: [0, 0.6], color: [c.mid, c.core], spin: [-10, -6], life: [300, 450] }, 0.9);
    if (Math.random() < 0.6) gather(ctx, h.x, h.y, [hs * 1.5, hs * 3], { tex: 'spark', size: [hs * 0.6, 3], alpha: [0, 0.8], color: [c.accent, c.mid], rotateToVelocity: true, stretch: 0.5, life: [250, 400] }, 0.7);
  });
}

/** Sickle Weasel: a fan sweep throws a gale full of invisible blades across the screen. */
async function sickleWeasel(ctx, p, gale) {
  const { ease, rand } = ctx;
  const c = ctx.palette(p.palette || 'wind'), k = (p.scale ?? 1) * (gale ? 1.3 : 1), hs = ctx.handScale(), W = ctx.W, H = ctx.H;
  // 1. Anticipation: the air winds up around the hands, leaves lift off the ground.
  ctx.sfx.wind(1.0);
  const on = { v: true }; windGather(ctx, c, hs, on);
  const lift = ctx.emitter({ x: () => rand(W * 0.1, W * 0.9), y: H + 10, rate: 14, tex: 'leaf', blend: 'normal', speed: [120, 260], angle: [-Math.PI * 0.6, -Math.PI * 0.4],
    life: [700, 1000], size: [26, 22], color: 0xffffff, alpha: [1, 0.6], spin: [-6, 6] });
  await ctx.wait(700);
  on.v = false; lift.stop();

  // 2. The swing: a huge crescent sweeps across the frame.
  const h = ctx.anchor('hands');
  ctx.sfx.whoosh(0.35); ctx.sfx.slash();
  const sw = ctx.add(ctx.g()); sw.blendMode = 'add';
  const Rr = Math.min(W, H) * 0.55 * k, a0 = Math.PI * 1.05, a1 = Math.PI * 2.05;
  const sweep = ctx.tween(380, (e) => {
    sw.clear();
    const head = lerp(a0, a1, ease.outCubic(Math.min(1, e * 1.4))), tail = lerp(a0, a1, ease.inCubic(e));
    if (head - tail < 0.02) return;
    for (const [w, col, al] of [[70, c.mid, 0.1], [30, c.core, 0.22], [7, c.core, 0.9]])
      sw.arc(h.x, h.y + Rr * 0.3, Rr, tail, head).stroke({ width: w * k * (1 - e * 0.5), color: col, alpha: al * (1 - e * 0.5), cap: 'round' });
  }).then(() => sw.destroy());
  await ctx.wait(140);

  // 3. The gale: crescent blades, speed lines, cuts in the air, flying leaves.
  ctx.sfx.wind(1.6); ctx.sfx.whoosh(1.2);
  ctx.shake(10, 400); ctx.zoomPunch(0.04, 250);
  shockwave(ctx, h.x, h.y, { amp: 26, wave: 260, speed: 1400, ms: 900, bright: 1.05 });
  const wash = ctx.tint(c.glow, 0.08, 'add');
  const GUST = gale ? 1700 : 1300;
  const em = [
    ctx.emitter({ x: () => rand(-W * 0.1, W * 0.35), y: () => rand(H * 0.1, H * 0.95), rate: gale ? 40 : 30, tex: 'slash3', speed: [1400, 2400], angle: [-0.12, 0.12],
      life: [350, 600], size: [[60 * k, 220 * k], [60 * k, 220 * k]], alpha: [0.9, 0], color: [c.core, c.mid], rotateToVelocity: true }),
    ctx.emitter({ x: () => rand(-W * 0.2, W * 0.5), y: () => rand(0, H), rate: 90, tex: 'spark', speed: [1800, 2800], angle: [-0.05, 0.05],
      life: [200, 400], size: [W * 0.15, W * 0.06], alpha: [0.55, 0], color: c.core, rotateToVelocity: true, stretch: 0.3 }),
    ctx.emitter({ x: () => rand(-W * 0.1, W * 0.3), y: () => rand(H * 0.2, H), rate: 22, tex: 'leaf', blend: 'normal', speed: [900, 1600], angle: [-0.25, 0.1],
      life: [600, 900], size: [30, 26], color: 0xffffff, spin: [-14, 14] }),
    ctx.emitter({ x: () => rand(-W * 0.1, W * 0.4), y: () => rand(H * 0.5, H), rate: 16, tex: choose(['smoke1', 'smoke3', 'smoke5']), blend: 'normal', speed: [500, 900], angle: [-0.15, 0.05],
      life: [700, 1100], size: [H * 0.2, H * 0.45], alpha: [0.22, 0], color: [c.mid, c.dark], spin: [-1, 1] }),
  ];
  let cut = 0;
  await ctx.tween(GUST, (e, r) => {
    wash.set(0.08 * (1 - r));
    const due = Math.floor(r * GUST / 85);
    while (cut < due) {
      cut++;
      decal(ctx, choose(['scratch1', 'slash3', 'slash4']), rand(W * 0.25, W * 0.95), rand(H * 0.1, H * 0.9), rand(90, 220) * k, rand(-0.6, 0.6), c.core, { holdMs: 80, outMs: 260, alpha: 0.9 });
      if (cut % 3 === 0) { ctx.sfx.slash(); ctx.shake(5, 120); }
    }
  });
  em.forEach((x) => x.stop());
  await sweep;
  wash.set(0);

  // 4. Follow-through: leaves flutter down, dust settles, the last wisps blow out.
  ctx.burst({ x: W * 0.6, y: H * 0.4, count: 14, tex: 'leaf', blend: 'normal', radius: [0, W * 0.4], speed: [100, 300], angle: [-0.3, 0.3],
    life: [1100, 1600], size: [28, 22], alpha: [1, 0], spin: [-5, 5], gravity: 160, drag: 1.5 });
  ctx.burst({ x: W * 0.7, y: H * 0.75, count: 6, tex: 'smoke2', blend: 'normal', radius: [0, W * 0.3], speed: [100, 250], angle: [-0.2, 0.1],
    life: [1100, 1500], size: [H * 0.3, H * 0.5], alpha: [0.18, 0], color: c.mid });
  ctx.burst({ x: W * 0.3, y: H * 0.5, count: 10, tex: 'twirl2', radius: [0, H * 0.4], speed: [300, 600], angle: [-0.1, 0.1], life: [500, 800], size: [hs * 1.6, hs * 0.6], alpha: [0.5, 0], color: c.core, spin: [-6, -3] });
  await ctx.wait(1100);
}

/** Wind Cutter: thin crescents of wind flung at the camera, each slicing the frame. */
async function windCutter(ctx, p) {
  const { ease, rand } = ctx;
  const c = ctx.palette(p.palette || 'wind'), k = p.scale ?? 1, hs = ctx.handScale(), W = ctx.W, H = ctx.H;
  const n = Math.max(1, Math.min(5, p.count ?? 2));
  const line = sprite(ctx, 'spark', c.core); line.alpha = 0;
  const lineGlow = sprite(ctx, 'soft', c.glow); lineGlow.alpha = 0;
  for (let i = 0; i < n; i++) {
    // 1. Charge: wind wraps the hand and compresses into a thin bright edge.
    const on = { v: true }; windGather(ctx, c, hs, on);
    ctx.sfx.wind(i ? 0.4 : 0.7);
    const tilt = (i % 2 ? 1 : -1) * rand(0.2, 0.4);
    await ctx.tween(i ? 320 : 600, (e) => {
      const h = ctx.anchor('hands');
      line.position.set(h.x, h.y - hs * 0.2); line.rotation = tilt; size(line, hs * 2.6 * e, hs * 0.18 * (1 + Math.random() * 0.3)); line.alpha = e;
      lineGlow.position.set(h.x, h.y - hs * 0.2); size(lineGlow, hs * 3 * e, hs * 1.2 * e); lineGlow.alpha = 0.4 * e;
    }, ease.inCubic);
    on.v = false;

    // 2. Throw: the crescent rushes the camera (grows) with afterimages.
    const h = ctx.anchor('hands');
    const from = { x: h.x, y: h.y - hs * 0.2 }, to = { x: W * 0.5 + (i % 2 ? -1 : 1) * W * 0.08, y: H * 0.45 };
    line.alpha = lineGlow.alpha = 0;
    ctx.sfx.whoosh(0.25);
    const blades = [0, 1, 2, 3].map((j) => { const s = sprite(ctx, 'slash4', j ? c.mid : c.core); s.alpha = 0; return s; });
    ctx.burst({ x: from.x, y: from.y, count: 8, tex: 'spark', speed: [600, 1300], angle: [-Math.PI * 0.85, -Math.PI * 0.15], life: [150, 300], size: [hs * 0.45, 3], color: c.core, rotateToVelocity: true, stretch: 0.4 });
    await ctx.tween(300, (e) => {
      blades.forEach((s, j) => {
        const q = Math.max(0, e - j * 0.07), qe = ease.inCubic(q);
        s.position.set(lerp(from.x, to.x, qe), lerp(from.y, to.y, qe)); s.rotation = tilt;
        size(s, (hs * 1.8 + W * 1.1 * k * qe), (hs * 0.5 + H * 0.35 * k * qe)); s.alpha = (j ? 0.35 / j : 1) * Math.min(1, q * 5);
      });
    });
    blades.forEach((s) => s.destroy());

    // 3. Cut: the slice lands as a razor line through the whole frame.
    ctx.sfx.slash(); ctx.sfx.crack();
    ctx.flash(c.core, 80, 0.3); ctx.shake(12, 300); ctx.zoomPunch(0.03, 200);
    shockwave(ctx, to.x, to.y, { amp: 18, wave: 90, speed: 1500, ms: 500, bright: 1.1 });
    const cg = ctx.add(ctx.g()); cg.blendMode = 'add';
    const L = Math.hypot(W, H), dx = Math.cos(tilt) * L, dy = Math.sin(tilt) * L;
    ctx.tween(420, (e) => {
      cg.clear();
      const sp = Math.min(1, e * 5);
      for (const [w, col, al] of [[34, c.outer, 0.45], [11, c.mid, 0.85], [3.5, c.core, 1]])   // pale wind on a grey room needs width to read
        cg.moveTo(to.x - dx * sp, to.y - dy * sp).lineTo(to.x + dx * sp, to.y + dy * sp).stroke({ width: w * (1 - e * 0.8), color: col, alpha: al * (1 - ease.inCubic(e)) });
    }).then(() => cg.destroy());
    for (let j = 0; j < 16; j++) {   // shavings of air blown off along the cut
      const t = rand(-0.5, 0.5) * W, x = to.x + Math.cos(tilt) * t, y = to.y + Math.sin(tilt) * t, dir = (Math.random() < 0.5 ? 0 : Math.PI) + tilt;
      ctx.burst({ x, y, count: 1, tex: 'spark', speed: [500, 1100], angle: [dir - 0.08, dir + 0.08], life: [200, 380], size: [hs * 0.9, hs * 0.2], alpha: [0.8, 0], color: [c.core, c.mid], rotateToVelocity: true, drag: 3 });
    }
    for (let j = 0; j < 3; j++) decal(ctx, 'scratch1', to.x + rand(-W * 0.3, W * 0.3), to.y + rand(-H * 0.2, H * 0.2), rand(120, 200) * k, tilt + rand(-0.4, 0.4), c.core, { holdMs: 100, outMs: 400, alpha: 0.8 });
    await ctx.wait(i < n - 1 ? 180 : 250);
  }
  // 4. Follow-through: drifting dust and wind wisps.
  ctx.burst({ x: W * 0.5, y: H * 0.5, count: 8, tex: 'smoke3', blend: 'normal', radius: [0, W * 0.35], speed: [40, 140], life: [1000, 1500],
    size: [H * 0.2, H * 0.4], alpha: [0.16, 0], color: c.mid, spin: [-1, 1] });
  ctx.burst({ x: W * 0.5, y: H * 0.5, count: 5, tex: 'twirl3', radius: [0, W * 0.35], speed: [100, 300], life: [500, 900], size: [hs * 2.2, hs * 1.2], alpha: [0.3, 0], color: c.core, spin: [-6, -3] });
  await ctx.wait(1000);
}

// ---------- wind: air bullets ----------
async function airBullets(ctx, p) {
  const v = p.variant || 'bullet';
  if (v === 'breakthrough') return breakthrough(ctx, p);
  return vacuumBullets(ctx, p, v === 'bullet' ? (p.count ?? 1) : (p.count ?? 6));
}

/** Inhale: air and dust are sucked into the mouth. */
async function inhale(ctx, c, hs, ms, n = 3) {
  const on = { v: true };
  ctx.tick(() => {
    if (!on.v) return false;
    const m = ctx.anchor('mouth');
    for (let i = 0; i < n; i++) gather(ctx, m.x, m.y, [hs * 1.5, hs * 4], { tex: 'spark', size: [hs * 0.45, 3], alpha: [0, 0.7], color: [c.accent, c.mid], rotateToVelocity: true, stretch: 0.5, life: [260, 420] }, 0.15);
    if (Math.random() < 0.3) gather(ctx, m.x, m.y, [hs * 1.5, hs * 3], { tex: 'twirl2', size: [hs * 1.4, hs * 0.3], alpha: [0, 0.5], color: c.core, spin: [6, 10], life: [300, 450] }, 0.6);
  });
  const glow = sprite(ctx, 'soft', c.glow);
  await ctx.tween(ms, (e) => { const m = ctx.anchor('mouth'); glow.position.set(m.x, m.y); size(glow, hs * (0.4 + 0.8 * e)); glow.alpha = 0.2 * e; }, ctx.ease.inCubic);
  on.v = false;
  return glow;
}

/** Great Breakthrough: a huge blast of wind exhaled straight at the camera. */
async function breakthrough(ctx, p) {
  const { rand } = ctx;
  const c = ctx.palette(p.palette || 'wind'), k = p.scale ?? 1, hs = ctx.handScale(), W = ctx.W, H = ctx.H;
  // 1. Anticipation: deep inhale.
  ctx.sfx.wind(0.8);
  const glow = await inhale(ctx, c, hs, 750, 4);
  // 2. Release: rings of compressed air rush outward, everything blows past the lens.
  const m = ctx.anchor('mouth');
  ctx.sfx.boom(0.8); ctx.sfx.wind(2); ctx.sfx.whoosh(1.4);
  ctx.flash(c.core, 90, 0.35); ctx.shake(16, 600); ctx.zoomPunch(0.06, 300);
  shockwave(ctx, m.x, m.y, { amp: 40, wave: 260, speed: 1400, ms: 900, bright: 1.08 });
  const zb = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength: 0.13, center: { x: m.x, y: m.y }, innerRadius: hs * 1.2 }));
  const wash = ctx.tint(c.glow, 0.1, 'add');
  const D = Math.hypot(W, H) * k;
  const em = [
    ctx.emitter({ x: () => ctx.anchor('mouth').x, y: () => ctx.anchor('mouth').y, rate: 110, tex: 'spark', radius: [hs * 0.6, hs * 1.5], speed: [1400, 2600],
      life: [250, 450], size: [W * 0.06, W * 0.2], alpha: [0.7, 0], color: c.core, rotateToVelocity: true, stretch: 0.3 }),
    ctx.emitter({ x: () => ctx.anchor('mouth').x, y: () => ctx.anchor('mouth').y, rate: 16, tex: 'leaf', blend: 'normal', speed: [700, 1300],
      life: [500, 900], size: [14, 70], color: 0xffffff, spin: [-12, 12] }),
    ctx.emitter({ x: () => ctx.anchor('mouth').x, y: () => ctx.anchor('mouth').y, rate: 14, tex: choose(['smoke1', 'smoke3', 'smoke5']), blend: 'add', speed: [600, 1100],
      life: [500, 800], size: [hs, H * 0.7], alpha: [0.14, 0], color: [c.mid, c.outer], spin: [-1, 1] }),
    ctx.emitter({ x: () => ctx.anchor('mouth').x, y: () => ctx.anchor('mouth').y, rate: 12, tex: choose(['twirl1', 'twirl2', 'twirl3']), speed: [100, 300],
      life: [400, 600], size: [hs * 1.5, D * 0.6], alpha: [0.7, 0], color: c.core, spin: [-8, 8] }),
  ];
  let rings = 0;
  const BLAST = 1400;
  await ctx.tween(BLAST, (e, r) => {
    const q = ctx.anchor('mouth');
    zb.center = { x: q.x, y: q.y }; zb.strength = 0.13 * (1 - r) * (1 - r);
    glow.position.set(q.x, q.y); size(glow, hs * 1.6 * (0.9 + 0.2 * Math.random())); glow.alpha = 0.5 * (1 - r);
    wash.set(0.1 * (1 - r));
    const due = Math.floor(r * BLAST / 110);
    while (rings < due) { rings++; ring(ctx, q.x, q.y, hs * 0.4, D * 0.6, rings % 2 ? c.core : c.mid, 600, rings % 2 ? 'ring' : 'circle2', 0.4); }
    if (Math.random() < 0.08) ctx.shake(8, 150);
  });
  em.forEach((x) => x.stop());
  ctx.removeFilter(zb); wash.set(0); glow.destroy();
  // 3. Follow-through: debris tumbles, dust drifts and settles.
  ctx.burst({ x: W / 2, y: H / 2, count: 16, tex: 'leaf', blend: 'normal', radius: [0, W * 0.45], speed: [60, 200], life: [1100, 1600],
    size: [30, 22], alpha: [1, 0], spin: [-5, 5], gravity: 200, drag: 1.5 });
  ctx.burst({ x: W / 2, y: H * 0.8, count: 8, tex: 'smoke2', blend: 'normal', radius: [0, W * 0.45], speed: [60, 160], angle: [-Math.PI, 0],
    life: [1100, 1500], size: [H * 0.3, H * 0.5], alpha: [0.18, 0], color: [c.mid, c.dark] });
  await ctx.wait(1100);
}

/** Vacuum bullets: compressed balls of cutting air spat in rapid fire. */
async function vacuumBullets(ctx, p, n) {
  const { ease, rand } = ctx;
  const c = ctx.palette(p.palette || 'wind'), k = (p.scale ?? 1) * (n === 1 ? 1.6 : 1), hs = ctx.handScale(), W = ctx.W, H = ctx.H;
  ctx.sfx.wind(0.6);
  const glow = await inhale(ctx, c, hs, 600, 3);
  const shots = [];
  for (let i = 0; i < n; i++) {
    const m = ctx.anchor('mouth');
    const tx = n === 1 ? W * 0.5 : W * (0.12 + 0.76 * ((i * 0.618) % 1)), ty = H * rand(0.2, 0.75);
    ctx.sfx.whoosh(0.15); ctx.sfx.boom(0.25);
    ctx.shake(5, 120);
    const ang = Math.atan2(ty - m.y, tx - m.x);
    ctx.burst({ x: m.x, y: m.y, count: 1, tex: choose(['muzzle2', 'muzzle3']), speed: 0, rotation: ang + Math.PI / 2, life: [140, 140], size: [hs * 0.7, hs * 1.2], color: c.mid, alpha: [0.6, 0] });
    ctx.burst({ x: m.x, y: m.y, count: 8, tex: 'spark', speed: [400, 900], angle: [ang - 0.5, ang + 0.5], life: [120, 250], size: [hs * 0.35, 2], color: c.core, rotateToVelocity: true });
    // spawn a little ahead of the lips so 6 rapid bullets don't bury the face in glow
    shots.push(fireBullet(ctx, c, { x: m.x + Math.cos(ang) * hs * 0.9, y: m.y + Math.sin(ang) * hs * 0.9 }, { x: tx, y: ty }, hs * 0.45 * k, Math.min(W, H) * 0.22 * k, i % 2 === 0));
    glow.alpha = 0.2 * (1 - i / n);
    await ctx.wait(150);
  }
  glow.destroy();
  await Promise.all(shots);
  // follow-through: cut air settles
  ctx.burst({ x: W / 2, y: H / 2, count: 8, tex: 'twirl3', radius: [0, W * 0.4], speed: [50, 160], life: [600, 1000], size: [hs * 1.6, hs * 0.6], alpha: [0.4, 0], color: c.core, spin: [-5, -2] });
  ctx.burst({ x: W / 2, y: H * 0.6, count: 6, tex: 'smoke3', blend: 'normal', radius: [0, W * 0.4], speed: [30, 100], life: [1000, 1400], size: [H * 0.2, H * 0.35], alpha: [0.14, 0], color: c.mid });
  await ctx.wait(900);
}
async function fireBullet(ctx, c, from, to, r0, r1, wave) {
  const { ease, PIXI } = ctx;
  const b = ctx.add(new PIXI.Container());
  const halo = sprite(ctx, 'soft', c.glow, 'add', b), body = sprite(ctx, 'light2', c.mid, 'add', b), shell = sprite(ctx, 'circle2', c.core, 'add', b), sw = sprite(ctx, 'twirl1', c.core, 'add', b);
  halo.alpha = 0.4; body.alpha = 0.6;
  await ctx.tween(260, (e) => {
    const q = ease.inCubic(e), r = lerp(r0, r1, q);
    b.position.set(lerp(from.x, to.x, q), lerp(from.y, to.y, q));
    size(halo, r * 3); size(body, r * 2.2); size(shell, r * 2); size(sw, r * 2.4); body.rotation -= 0.4; sw.rotation += 0.6;
    if (Math.random() < 0.5) ctx.burst({ x: b.x, y: b.y, count: 1, tex: 'twirl2', speed: 0, life: [150, 250], size: [r * 2, r * 2.6], alpha: [0.35, 0], color: c.mid, spin: 8 });
  });
  const x = b.x, y = b.y; b.destroy();
  ctx.sfx.crack(); ctx.sfx.slash();
  ctx.shake(9, 200);
  if (wave) shockwave(ctx, x, y, { amp: 22, wave: 120, speed: 1100, ms: 450, bright: 1.1 });
  ring(ctx, x, y, r1 * 0.6, r1 * 2.2, c.core, 380, 'ring');
  ring(ctx, x, y, r1 * 0.3, r1 * 1.6, c.mid, 500, 'twirl3', 0.7);
  for (let j = 0; j < 3; j++) decal(ctx, choose(['scratch1', 'slash3']), x + rand2(ctx, r1 * 0.4), y + rand2(ctx, r1 * 0.4), r1 * 1.4, ctx.rand(0, TAU), c.core, { holdMs: 60, outMs: 260, alpha: 0.85 });
  ctx.burst({ x, y, count: 20, tex: 'spark', speed: [400, 1100], life: [150, 350], size: [r1 * 0.35, 2], color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.4, drag: 2 });
  ctx.burst({ x, y, count: 4, tex: 'smoke3', blend: 'normal', speed: [40, 120], life: [500, 800], size: [r1, r1 * 2], alpha: [0.2, 0], color: c.mid });
}
const rand2 = (ctx, r) => ctx.rand(-r, r);

export const EFFECTS = { windBlades, airBullets, chidori, lightningStrike, lightningBeast };
