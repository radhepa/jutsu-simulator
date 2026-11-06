// Earth archetypes: earthWall, earthSpikes, mudSwamp, woodGrowth, sandSwirl.
// Look rule: solid matter (rock, mud, wood, sand) is drawn with NORMAL blending in palette colors with a dark
// outline, so it reads as heavy and opaque over the camera. Only chakra glows / tip highlights are additive.
// Everything rises from ctx.anchor('ground') (bottom edge of the frame) and keeps the caster's face clear.

const TAU = Math.PI * 2;
const mix = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const choose = (a) => a[Math.floor(Math.random() * a.length)];
const DUSTS = ['smoke1', 'smoke3', 'smoke4', 'smoke6', 'smoke7'];

function spr(ctx, tex, tint = 0xffffff, blend = 'normal', alpha = 1) {
  const s = new ctx.PIXI.Sprite(ctx.tex(tex));
  s.anchor.set(0.5); s.tint = tint; s.blendMode = blend; s.alpha = alpha;
  return s;
}
const setSize = (s, d) => s.scale.set(d / (s.texture.width || 1));

/** Anticipation: chakra motes spiral into at() while a glow swells there; the ground starts to tremble. */
async function gather(ctx, at, c, ms = 550, k = 1) {
  const U = Math.min(ctx.W, ctx.H) * k, box = ctx.add(new ctx.PIXI.Container());
  const glow = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0));
  const ring = box.addChild(spr(ctx, 'circle2', c.core, 'add', 0));
  const motes = Array.from({ length: 20 }, () => ({
    s: box.addChild(spr(ctx, 'spark', choose([c.glow, c.core, c.mid]), 'add', 0)),
    a: ctx.rand(0, TAU), r: ctx.rand(0.25, 0.5) * U, d: ctx.rand(0, 0.4), w: ctx.rand(2, 4),
  }));
  const t0 = ctx.t;
  let live = true;
  ctx.tick((dt, t) => {
    if (!live) return false;
    const p = at();
    for (const m of motes) {
      const q = clamp01(((t - t0) / ms - m.d) / 0.6), r = m.r * (1 - q * q), a = m.a + q * m.w;
      m.s.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      m.s.rotation = a + Math.PI / 2; m.s.alpha = q > 0 && q < 1 ? 0.9 : 0; m.s.scale.set(0.25 + 0.2 * q, 0.12);
    }
    glow.position.set(p.x, p.y); ring.position.set(p.x, p.y);
  });
  ctx.shake(2.5, ms);
  await ctx.tween(ms, (e) => {
    setSize(glow, U * (0.12 + 0.35 * e)); glow.alpha = 0.6 * e;
    setSize(ring, U * (0.5 - 0.38 * e)); ring.alpha = 0.7 * e;
  }, ctx.ease.inCubic);
  live = false; box.destroy({ children: true });
}

/** Heavy dust cloud (normal blend) plus dirt splats along a strip of ground. */
function dust(ctx, x, y, w, c, k = 1, up = 1) {
  ctx.burst({ x, y, count: Math.round(12 * k), tex: choose(DUSTS), blend: 'normal', radius: [0, w * 0.5], speed: [40, 160 * up],
    angle: [-Math.PI * 0.95, -Math.PI * 0.05], life: [900, 1700], size: [w * 0.35, w * 0.8], color: [mix(c.mid, c.core, 0.3), c.outer],
    alpha: [0.75, 0], spin: [-0.5, 0.5], drag: 1.6, accel: [0, -20] });
  ctx.burst({ x, y, count: Math.round(5 * k), tex: choose(['dirt1', 'dirt2', 'dirt3']), blend: 'normal', radius: [0, w * 0.4],
    speed: [100, 300 * up], angle: [-Math.PI * 0.85, -Math.PI * 0.15], life: [500, 900], size: [w * 0.3, w * 0.55],
    color: [c.outer, c.dark], alpha: [0.9, 0], drag: 2, gravity: 300 });
}

/** Rock chunks thrown out with gravity. */
function debris(ctx, x, y, c, n = 10, sp = 1, size = 1) {
  ctx.burst({ x, y, count: n, tex: 'rock', blend: 'normal', radius: [0, 30], speed: [250 * sp, 650 * sp], angle: [-Math.PI * 0.85, -Math.PI * 0.15],
    life: [700, 1300], size: [[10 * size, 30 * size], [8 * size, 22 * size]], color: [mix(c.mid, c.core, 0.4), c.mid], alpha: [1, 1],
    gravity: 1500, spin: [-8, 8] });
}

/** Random crack polylines spreading from (x,y). Returns [{pts:[[x,y]...], d0}] with d0 = start delay (0..1). */
function crackPaths(ctx, x, y, n, len, angles = [-Math.PI, 0], ys = 1) {
  const out = [];
  const grow = (x0, y0, a, L, d0, depth) => {
    const pts = [[x0, y0]], segs = 6 + Math.round(L / 40);
    let px = x0, py = y0;
    for (let i = 0; i < segs; i++) {
      a += ctx.rand(-0.45, 0.45); px += Math.cos(a) * L / segs; py += Math.sin(a) * L / segs * ys;
      pts.push([px, py]);
      if (depth < 1 && Math.random() < 0.18) grow(px, py, a + choose([-0.8, 0.8]) * ys, L * 0.4, d0 + (i / segs) * 0.5, depth + 1);
    }
    out.push({ pts, d0 });
  };
  for (let i = 0; i < n; i++) grow(x, y, ctx.rand(angles[0], angles[1]), len * ctx.rand(0.6, 1), 0, 0);
  return out;
}
/** Draw cracks revealed up to progress q (0..1) into g (cleared each call). Glowing core inside a dark gash. */
function drawCracks(g, paths, q, c, width = 4, glow = true) {
  g.clear();
  for (const p of paths) {
    const r = clamp01((q - p.d0) / (1 - p.d0)), n = (p.pts.length - 1) * r;
    if (n <= 0) continue;
    const pts = [];
    for (let i = 0; i <= Math.floor(n); i++) pts.push(p.pts[i]);
    const f = n - Math.floor(n), i0 = Math.floor(n);
    if (f > 0 && p.pts[i0 + 1]) pts.push([lerp(p.pts[i0][0], p.pts[i0 + 1][0], f), lerp(p.pts[i0][1], p.pts[i0 + 1][1], f)]);
    const w = width * (p.d0 > 0 ? 0.6 : 1);
    g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.stroke({ width: w, color: c.dark, alpha: 0.95, cap: 'round', join: 'round' });
    if (glow) { g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.stroke({ width: w * 0.35, color: c.glow, alpha: 0.9, cap: 'round' }); }
  }
}

/** Shockwave distortion ring helper (one filter reused). */
function shockwaves(ctx, opts = {}) {
  const f = ctx.filter(new ctx.filters.ShockwaveFilter({ amplitude: 0, wavelength: 120, speed: 700, brightness: 1.05, radius: -1, ...opts }));
  let t0 = -1e9;
  ctx.tick((dt, t) => {
    const s = (t - t0) / 1000; f.time = s;
    f.amplitude = s < 0.7 ? (opts.amplitude ?? 25) * (1 - s / 0.7) : 0;
  });
  return { f, ring(x, y) { f.center = { x, y }; t0 = ctx.t; } };
}

// ---------------------------------------------------------------------------------------------
/**
 * earthWall — Mud Wall: the caster spits mud onto the ground, it swells into a thick stone wall in front of
 * them (up to chest height, face stays visible), cracks under its own weight, then sinks back.
 * params: palette ('earth'), scale, variant 'wall' | 'dome' (arched top)
 */
async function earthWall(ctx, p) {
  const c = ctx.palette(p.palette || 'earth'), scale = p.scale ?? 1, dome = p.variant === 'dome';
  const { W, H } = ctx, mouth = () => ctx.anchor('mouth'), ground = () => ctx.anchor('ground');
  const shock = shockwaves(ctx, { amplitude: 30, wavelength: 140 });

  // 1. Anticipation: earth chakra gathers at the mouth.
  ctx.sfx.charge(0.5);
  await gather(ctx, mouth, c, 500, 0.8);

  // 2. Spit: a stream of mud arcs from the mouth down to the ground.
  ctx.sfx.splash(0.5);
  const spit = ctx.emitter({ x: () => mouth().x, y: () => mouth().y + 6, rate: 160, tex: 'dot', blend: 'normal', speed: [250, 420],
    angle: [Math.PI * 0.42, Math.PI * 0.58], life: [350, 550], size: [[10, 18], [16, 26]], color: [mix(c.mid, c.dark, 0.3), c.dark],
    alpha: [1, 0.9], gravity: 1400 });
  const goo = ctx.emitter({ x: () => mouth().x, y: () => mouth().y + 6, rate: 40, tex: 'smoke4', blend: 'normal', speed: [200, 320],
    angle: [Math.PI * 0.45, Math.PI * 0.55], life: [300, 450], size: [30, 60], color: [c.outer, c.dark], alpha: [0.8, 0.2], gravity: 1200 });
  await ctx.wait(380);
  spit.stop(); goo.stop();
  const g0 = ground();
  ctx.burst({ x: g0.x, y: g0.y - 10, count: 18, tex: 'dot', blend: 'normal', speed: [150, 420], angle: [-Math.PI * 0.9, -Math.PI * 0.1],
    life: [400, 700], size: [14, 8], color: [mix(c.mid, c.dark, 0.3), c.dark], gravity: 1400 });

  // 3. Release: the wall erupts out of the ground.
  const ww = W * 0.88 * Math.min(1.1, scale), wh = H * 0.5 * scale;
  const wall = ctx.add(new ctx.PIXI.Container());
  const body = wall.addChild(ctx.g());
  // top contour: jagged slabs; dome variant arcs up in the middle
  const N = 22, top = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N * 2 - 1, edge = Math.pow(Math.abs(u), 6);
    const y = -wh * (dome ? 0.55 + 0.45 * Math.sqrt(1 - u * u) : 1 - 0.25 * edge) + (i % 2 ? ctx.rand(-0.09, -0.03) : ctx.rand(0.0, 0.05)) * wh * (1 - edge);
    top.push([u * ww / 2, y]);
  }
  const poly = (off) => [...top.flatMap(([x, y]) => [x, y + off]), ww / 2, wh * 0.4, -ww / 2, wh * 0.4];
  body.poly(poly(0)).fill({ color: mix(c.mid, c.outer, 0.25) });
  // strata bands
  for (let b = 1; b <= 4; b++) {
    const off = b * wh * 0.2;
    body.poly(poly(off)).fill({ color: b % 2 ? mix(c.outer, c.dark, 0.15) : mix(c.mid, c.outer, 0.5), alpha: 0.55 });
  }
  // vertical slab joints
  for (let i = 1; i < N; i += choose([2, 3])) {
    const [x, y] = top[i];
    body.moveTo(x, y + 4).lineTo(x + ctx.rand(-12, 12), y + wh * ctx.rand(0.25, 0.5)).stroke({ width: 3, color: c.dark, alpha: 0.6 });
  }
  // lit top face + dark outline
  body.poly(top.flatMap(([x, y]) => [x, y]).concat(top.slice().reverse().flatMap(([x, y]) => [x, y + wh * 0.07]))).fill({ color: mix(c.mid, c.core, 0.45), alpha: 0.9 });
  body.poly(poly(0)).stroke({ width: 5, color: c.dark, join: 'round' });
  // embedded boulders
  for (let i = 0; i < 12; i++) {
    const r = wall.addChild(spr(ctx, 'rock', mix(c.mid, c.core, ctx.rand(0.1, 0.5))));
    const u = ctx.rand(-0.9, 0.9);
    setSize(r, ctx.rand(0.07, 0.14) * wh * 1.4); r.rotation = ctx.rand(0, TAU);
    r.position.set(u * ww / 2, ctx.rand(-0.75, -0.1) * wh);
  }
  const wet = wall.addChild(ctx.g().poly(poly(0)).fill({ color: c.dark }));
  wet.alpha = 0.55;
  const cracksG = wall.addChild(ctx.g());
  const cpaths = [...crackPaths(ctx, -ww * 0.18, -wh * 0.85, 2, wh * 0.7, [Math.PI * 0.35, Math.PI * 0.65]),
    ...crackPaths(ctx, ww * 0.25, -wh * 0.8, 2, wh * 0.6, [Math.PI * 0.35, Math.PI * 0.65])];
  const place = (rise) => { const g = ground(); wall.position.set(g.x, g.y + wh * 1.05 * (1 - rise)); };
  place(0);
  const follow = ctx.tick(() => { place(wall._rise ?? 0); });

  ctx.sfx.rumble(1.4 * scale); ctx.sfx.boom(0.8);
  ctx.shake(16 * scale, 900); ctx.zoomPunch(0.035, 400);
  shock.ring(g0.x, g0.y - wh * 0.3);
  const baseDust = ctx.emitter({ x: () => ground().x + ctx.rand(-ww / 2, ww / 2), y: () => ground().y - 8, rate: 70, tex: 'smoke3', blend: 'normal',
    speed: [40, 140], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [900, 1600], size: [60, 150], color: [mix(c.mid, c.core, 0.3), c.outer],
    alpha: [0.7, 0], spin: [-0.4, 0.4], drag: 1.2 });
  const topBits = ctx.emitter({ x: () => wall.x + ctx.rand(-ww / 2, ww / 2), y: () => wall.y - wh, rate: 60, tex: 'rock', blend: 'normal',
    speed: [150, 450], angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [600, 1000], size: [[6, 18], [6, 14]],
    color: [mix(c.mid, c.core, 0.3), c.mid], alpha: [1, 1], gravity: 1500, spin: [-6, 6] });
  for (let i = 0; i < 5; i++) dust(ctx, g0.x + (i / 4 - 0.5) * ww, g0.y, W * 0.22, c, 1.2, 1.3);
  await ctx.tween(650, (e) => { wall._rise = e; }, ctx.ease.outBack);
  topBits.stop();
  ctx.sfx.crack(); ctx.shake(6, 250);
  debris(ctx, g0.x - ww * 0.3, g0.y - 20, c, 6, 0.6); debris(ctx, g0.x + ww * 0.3, g0.y - 20, c, 6, 0.6);

  // 4. Settle: the mud dries to stone (wet sheen fades), stress cracks run down the face.
  await ctx.tween(900, (e) => { wet.alpha = 0.55 * (1 - e); drawCracks(cracksG, cpaths, clamp01(e * 1.6 - 0.3), c, 5, false); });
  baseDust.stop();
  await ctx.wait(500);

  // 5. Follow-through: the wall sinks back into the earth, shedding rubble and dust.
  ctx.sfx.rumble(1.2);
  ctx.shake(7, 900);
  const sinkDust = ctx.emitter({ x: () => ground().x + ctx.rand(-ww / 2, ww / 2), y: () => ground().y - 10, rate: 40, tex: 'smoke6', blend: 'normal',
    speed: [30, 90], angle: [-Math.PI * 0.85, -Math.PI * 0.15], life: [1000, 1600], size: [70, 160], color: [mix(c.mid, c.core, 0.2), c.outer],
    alpha: [0.6, 0], drag: 1 });
  const crumble = ctx.emitter({ x: () => wall.x + ctx.rand(-ww / 2, ww / 2), y: () => wall.y - wh * ctx.rand(0.6, 1), rate: 35, tex: 'rock', blend: 'normal',
    speed: [20, 120], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [600, 900], size: [[8, 20], [8, 16]], color: [c.mid], alpha: [1, 1], gravity: 1300, spin: [-5, 5] });
  await ctx.tween(1000, (e) => { wall._rise = 1 - e; }, ctx.ease.inCubic);
  sinkDust.stop(); crumble.stop();
  ctx.removeFilter(shock.f);
  wall.visible = false;
  await ctx.wait(900);
}

// ---------------------------------------------------------------------------------------------
/** One stone spear: faceted polygon pointing up from its base at (0,0); extends below ground so overshoot never gaps. */
function makeSpike(ctx, c, bw, h, depth = 0) {
  const g = ctx.g(), tip = ctx.rand(-0.1, 0.1) * bw, shade = (col) => mix(col, c.dark, depth * 0.45);
  const L = [[-bw / 2, h * 0.15], [-bw * 0.5, 0], [-bw * 0.34, -h * 0.42], [tip, -h]];
  const R = [[tip, -h], [bw * 0.3, -h * 0.5], [bw * 0.5, 0], [bw / 2, h * 0.15]];
  const ridge = [[tip, -h], [bw * 0.06, -h * 0.4], [bw * 0.02, h * 0.15]];
  g.poly([...L, ...ridge.slice(1).reverse()].flat()).fill({ color: shade(mix(c.mid, c.core, 0.45)) });
  g.poly([...ridge, ...R.slice(1).reverse()].flat()).fill({ color: shade(mix(c.outer, c.dark, 0.2)) });
  // strata notches
  for (let i = 1; i <= 3; i++) {
    const y = -h * i * 0.22, w = bw * (1 - i * 0.22) * 0.5;
    g.moveTo(-w, y).lineTo(w * 0.2, y + h * 0.03).lineTo(w, y - h * 0.02).stroke({ width: 2, color: c.dark, alpha: 0.45 });
  }
  g.poly([...L, ...R.slice(1)].flat()).stroke({ width: 3, color: c.dark, join: 'round' });
  return g;
}

/**
 * earthSpikes — Earth Flow Spears: cracks race out from under the caster, then stone spears burst out of the
 * ground in a fanning line toward both sides (biggest at the outside, face stays clear), hold, and sink back.
 * params: palette ('earth'), scale, variant 'spikes' | 'quake' (more spears, heavier shake) | 'golem' (one huge spire each side)
 */
async function earthSpikes(ctx, p) {
  const c = ctx.palette(p.palette || 'earth'), scale = p.scale ?? 1, v = p.variant || 'spikes';
  const { W, H } = ctx, hands = () => ctx.anchor('hands'), ground = () => ctx.anchor('ground');
  const shock = shockwaves(ctx, { amplitude: 22, wavelength: 110 });

  // 1. Anticipation: chakra pools in the hands and pushes down; cracks race across the ground.
  ctx.sfx.charge(0.55); ctx.sfx.rumble(1);
  const crackG = ctx.add(ctx.g());
  const g0 = ground();
  const cp = [...crackPaths(ctx, g0.x, g0.y - 8, 3, W * 0.5, [-Math.PI * 0.98, -Math.PI * 0.85], 0.22),
    ...crackPaths(ctx, g0.x, g0.y - 8, 3, W * 0.5, [-Math.PI * 0.15, -Math.PI * 0.02], 0.22)];
  const glowLine = ctx.add(spr(ctx, 'soft', c.glow, 'add', 0));
  await Promise.all([gather(ctx, hands, c, 550, 0.9),
    ctx.tween(650, (e) => {
      const g = ground(); crackG.position.set(g.x - g0.x, g.y - g0.y);
      drawCracks(crackG, cp, e, c, 6);
      glowLine.position.set(g.x, g.y); glowLine.scale.set(W * e / 128, 0.45); glowLine.alpha = 0.3 * e;
    }, ctx.ease.inCubic)]);

  // 2. Release: spears erupt in sequence from the centre outward.
  const n = v === 'quake' ? 7 : v === 'golem' ? 2 : 5, spikes = [];
  ctx.flash(c.glow, 120, 0.25);
  ctx.zoomPunch(0.04, 350);
  shock.ring(g0.x, g0.y - 40);
  ctx.sfx.boom(0.9);
  const erupt = async (side, i, depth) => {
    const f = n === 1 ? 1 : i / (n - 1);
    const big = v === 'golem' ? 1.25 : 1;
    const x = W / 2 + side * (W * (0.15 + 0.33 * f) + depth * W * 0.04);
    const h = H * (0.38 + 0.42 * f) * scale * big * (depth ? 0.7 : 1) * ctx.rand(0.9, 1.05);
    const bw = W * (0.07 + 0.04 * f) * big * (depth ? 0.75 : 1);
    const s = ctx.add(makeSpike(ctx, c, bw, h, depth));
    s.rotation = side * (0.12 + 0.3 * f) + ctx.rand(-0.05, 0.05);
    const off = x - W / 2;
    const follow = ctx.tick(() => { const g = ground(); s.position.set(g.x + off, g.y + 6); });
    // rubble at the base
    const rub = [];
    for (let k = 0; k < 3; k++) {
      const r = ctx.add(spr(ctx, 'rock', mix(c.mid, c.core, ctx.rand(0, 0.4))));
      setSize(r, bw * ctx.rand(0.35, 0.6)); r.rotation = ctx.rand(0, TAU); r.visible = false; rub.push([r, ctx.rand(-0.6, 0.6) * bw]);
    }
    ctx.tick(() => { for (const [r, dx] of rub) r.position.set(s.x + dx, s.y - 4); });
    s.scale.set(1, 0);
    spikes.push({ s, rub, h });
    ctx.sfx.crack();
    ctx.shake((7 + 8 * f) * scale * (v === 'quake' ? 1.5 : 1), 300);
    dust(ctx, x, H - 6, bw * 1.6, c, 0.7, 1.4);
    debris(ctx, x, H - 10, c, depth ? 3 : 6, 0.8 + f * 0.5);
    for (const [r] of rub) r.visible = true;
    await ctx.tween(200, (e) => { s.scale.set(1 - 0.15 * (1 - e), e); }, ctx.ease.outBack);
    return follow;
  };
  const jobs = [];
  for (let i = 0; i < n; i++) {
    jobs.push(erupt(-1, i, 0), erupt(1, i, 0));
    if (i % 2 === 1 && v !== 'golem') jobs.push(erupt(-1, i - 0.5, 1), erupt(1, i - 0.5, 1));
    await ctx.wait(v === 'golem' ? 1 : 85);
  }
  await Promise.all(jobs);
  ctx.sfx.rumble(1.2);
  ctx.shake(10 * scale, 700);
  const lingering = ctx.emitter({ x: () => ctx.rand(0, W), y: () => H - 4, rate: 30, tex: 'smoke7', blend: 'normal', speed: [20, 70],
    angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [1200, 1800], size: [60, 150], color: [mix(c.mid, c.core, 0.3), c.outer], alpha: [0.55, 0], drag: 1 });
  await ctx.tween(900, (e) => { glowLine.alpha = 0.3 * (1 - e); drawCracks(crackG, cp, 1, c, 6 * (1 - e * 0.5), e < 0.6); });

  // 3. Follow-through: the spears grind back into the ground.
  ctx.sfx.rumble(0.9);
  ctx.shake(5, 700);
  for (const sp of spikes) debris(ctx, sp.s.x, H - 10, c, 2, 0.4, 0.8);
  await ctx.tween(650, (e) => {
    for (const sp of spikes) { sp.s.scale.y = 1 - e; for (const [r] of sp.rub) r.alpha = 1 - e; }
    crackG.alpha = 1 - e;
  }, ctx.ease.inCubic);
  lingering.stop();
  ctx.removeFilter(shock.f);
  await ctx.wait(800);
}

// ---------------------------------------------------------------------------------------------
/**
 * mudSwamp — Swamp of the Underworld: the ground softens into a churning brown bog that swells up around the
 * caster's lower body with bubbles, slow swirls and globs, pulls the frame down with a twist, then drains away.
 * params: palette ('earth'), scale, variant 'swamp' | 'mudslide' (pours in from the sides) | 'river' (flows sideways)
 */
async function mudSwamp(ctx, p) {
  const c = ctx.palette(p.palette || 'earth'), scale = p.scale ?? 1, v = p.variant || 'swamp';
  const { W, H } = ctx, hands = () => ctx.anchor('hands'), ground = () => ctx.anchor('ground');
  const mudDark = mix(c.outer, c.dark, 0.55), mudMid = mix(c.mid, c.outer, 0.55), mudLight = mix(c.mid, c.core, 0.2);

  // 1. Anticipation: chakra sinks into the earth from the hands; the ground starts to soften.
  ctx.sfx.charge(0.6); ctx.sfx.rumble(1.2);
  const dim = ctx.tint(c.dark, 0, 'normal');
  await Promise.all([gather(ctx, hands, c, 600, 0.9), ctx.tween(600, (e) => dim.set(0.18 * e))]);

  // 2. Release: the bog spreads out from under the caster and rises.
  ctx.sfx.splash(1.2); ctx.sfx.boom(0.5);
  ctx.shake(9 * scale, 600);
  const back = ctx.add(ctx.g()), surf = ctx.add(ctx.g());
  const swirls = [];
  for (let i = 0; i < 5; i++) {
    const s = ctx.add(spr(ctx, choose(['twirl1', 'twirl2', 'twirl3']), mudLight, 'normal', 0));
    swirls.push({ s, u: ctx.rand(-0.7, 0.7), d: ctx.rand(0.25, 0.75), w: ctx.rand(0.6, 1.2) * choose([-1, 1]), sz: ctx.rand(0.12, 0.22) });
  }
  const sheen = Array.from({ length: 7 }, () => ({ s: ctx.add(spr(ctx, 'spark', mix(c.mid, c.core, 0.5), 'normal', 0)), u: ctx.rand(-0.8, 0.8), d: ctx.rand(0.05, 0.5), ph: ctx.rand(0, TAU) }));
  const st = { level: 0, half: 0, drain: 0 };
  const maxLevel = H * 0.32 * scale;
  const N = 40;
  const top = (u, t) => {
    const g = ground();
    const mound = Math.pow(Math.max(0, 1 - u * u), 0.35);
    const wave = Math.sin(u * 7 + t * 0.004) * 6 + Math.sin(u * 13 - t * 0.006) * 3;
    return g.y - st.level * mound + wave * Math.min(1, st.level / 40);
  };
  const xOf = (u) => {
    const g = ground();
    if (v === 'mudslide') return lerp(-W * 0.1, W * 1.1, (u + 1) / 2);
    return g.x + u * st.half;
  };
  const ripples = []; let nextRipple = 0;
  const band = (u) => 14 + st.level * 0.26 * (1 - u * u);
  ctx.tick((dt, t) => {
    if (st.level < 1) { back.clear(); surf.clear(); return; }
    const pts = [], pts2 = [];
    for (let i = 0; i <= N; i++) { const u = i / N * 2 - 1, x = xOf(u), y = top(u, t); pts.push(x, y); pts2.push(x, y + band(u) + Math.sin(u * 9 + t * 0.005) * 4); }
    const g = ground();
    back.clear().poly([...pts, xOf(1), g.y + 40, xOf(-1), g.y + 40]).fill({ color: mudMid });
    // concentric ripples spreading over the bog's top face (lower halves hidden behind the front band)
    if (t > nextRipple && st.level > 30 && st.drain < 0.6) { ripples.push(t); nextRipple = t + 420; }
    while (ripples.length && t - ripples[0] > 1500) ripples.shift();
    for (const r0 of ripples) {
      const a = (t - r0) / 1500, cy = top(0, t) + band(0) * 0.5, rx = st.half * 0.62 * (0.08 + 0.92 * a);
      back.ellipse(g.x, cy, rx, band(0) * 0.42 * (0.3 + 0.7 * a)).stroke({ width: 3, color: mix(mudLight, c.core, 0.3), alpha: 0.7 * (1 - a) });
    }
    surf.clear().poly([...pts2, xOf(1), g.y + 40, xOf(-1), g.y + 40]).fill({ color: mudDark });
    surf.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) surf.lineTo(pts[i], pts[i + 1]);
    surf.stroke({ width: 4, color: mudLight, alpha: 0.8 });
    for (const sw of swirls) {
      const y = top(sw.u, t);
      sw.s.position.set(xOf(sw.u), lerp(y, g.y, sw.d) + 10); setSize(sw.s, W * sw.sz * clamp01(st.level / maxLevel));
      sw.s.rotation += sw.w * dt / 1000 * 2; sw.s.alpha = 0.3 * clamp01(st.level / maxLevel) * (1 - st.drain); sw.s.scale.y *= 0.45;
    }
    for (const sh of sheen) {
      const su = sh.u + Math.sin(t * 0.0007 + sh.ph) * 0.05;
      sh.s.position.set(xOf(su), lerp(top(su, t), g.y, sh.d) + 12);
      sh.s.scale.set(W * 0.0018, 0.5); sh.s.alpha = 0.5 * clamp01(st.level / maxLevel) * (0.6 + 0.4 * Math.sin(t * 0.003 + sh.ph)) * (1 - st.drain);
    }
  });
  // globs splashing up off the surface
  const globs = ctx.emitter({ x: () => xOf(ctx.rand(-0.8, 0.8)), y: () => ground().y - st.level * 0.8, rate: () => 25 * (1 - st.drain), tex: 'dot',
    blend: 'normal', speed: [150, 380], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [500, 800], size: [[8, 18], [4, 10]],
    color: [mudMid, mudDark], alpha: [1, 1], gravity: 1100 });
  // bubbles that swell and pop on the surface
  const bubbles = ctx.add(new ctx.PIXI.Container());
  let bubbleOn = true;
  const popBubble = async () => {
    const u = ctx.rand(-0.75, 0.75), b = bubbles.addChild(ctx.g()), r = ctx.rand(10, 26);
    b.circle(0, 0, r).fill({ color: mudMid }).stroke({ width: 2, color: c.dark });
    b.circle(-r * 0.35, -r * 0.35, r * 0.25).fill({ color: mudLight, alpha: 0.8 });
    await ctx.tween(ctx.rand(300, 600), (e) => { b.position.set(xOf(u), top(u, ctx.t) + 4 - r * 0.4 * e); b.scale.set(e); }, ctx.ease.outCubic);
    ctx.burst({ x: b.x, y: b.y, count: 6, tex: 'dot', blend: 'normal', speed: [80, 220], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [300, 500],
      size: [6, 3], color: mudMid, gravity: 900 });
    b.destroy();
  };
  ctx.tick(() => { if (!bubbleOn) return false; if (Math.random() < 0.12 && st.level > 20) popBubble(); });
  // the world twists down into the bog
  const twist = ctx.filter(new ctx.filters.TwistFilter({ radius: H * 0.62, angle: 0, padding: 0 }));
  ctx.tick(() => { const g = ground(); twist.offset = { x: g.x, y: g.y - st.level * 0.2 }; });
  // the "whoa": mud geysers burst up out of the softened ground, left/right of centre first, then outward
  const g1 = ground();
  ctx.zoomPunch(0.05, 400);
  (async () => {
    for (const [i, dx] of [[0, -0.16], [1, 0.16], [2, -0.36], [3, 0.36], [4, 0]].map(([i, d]) => [i, d * W])) {
      const x = g1.x + dx + ctx.rand(-15, 15), hi = i === 4 ? 0.75 : 1;
      ctx.burst({ x, y: H - 8, count: 16, tex: 'dot', blend: 'normal', radius: 14, speed: [520 * hi, 980 * hi], angle: [-Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2],
        life: [700, 1100], size: [[18, 34], [10, 18]], color: [mudLight, mudMid, mudDark], alpha: [1, 1], gravity: 1700 });
      ctx.burst({ x, y: H - 8, count: 4, tex: choose(DUSTS), blend: 'normal', radius: 20, speed: [60, 160], angle: [-Math.PI * 0.75, -Math.PI * 0.25],
        life: [700, 1100], size: [70, 150], color: [mudMid, c.outer], alpha: [0.7, 0], drag: 1.5 });
      ctx.sfx.splash(0.5);
      await ctx.wait(70);
    }
  })();
  await ctx.tween(1000, (e) => { st.level = maxLevel * e; st.half = W * 0.62 * e; }, ctx.ease.outCubic);

  // 3. Hold: everything is dragged down; the surface heaves.
  ctx.sfx.rumble(1.8);
  ctx.shake(4, 1600);
  await ctx.tween(1600, (e) => {
    twist.angle = Math.sin(e * Math.PI) * 0.95;
    st.level = maxLevel * (1 + 0.08 * Math.sin(e * TAU * 2));
  });
  ctx.removeFilter(twist);

  // 4. Follow-through: the bog drains back into the ground, leaving a wet glistening stain.
  ctx.sfx.splash(0.8);
  await Promise.all([dim.fade(900), ctx.tween(1000, (e) => { st.drain = e; st.level = maxLevel * (1 - e); st.half = W * (0.62 - 0.12 * e); }, ctx.ease.inCubic)]);
  globs.stop(); bubbleOn = false;
  await ctx.wait(400);
}

// ---------------------------------------------------------------------------------------------
/** A wood limb that grows along pts over time; three Graphics (outline, bark, highlight) appended per segment. */
function makeLimb(ctx, parent, c, pts, depth, glowTip = true) {
  const box = parent.addChild(new ctx.PIXI.Container());
  const line = box.addChild(ctx.g()), bark = box.addChild(ctx.g()), hi = box.addChild(ctx.g());
  const shade = (col) => mix(col, c.dark, depth * 0.4);
  const tip = glowTip ? parent.parent.addChild(spr(ctx, 'soft', c.glow, 'add', 0)) : null;
  let drawn = 0;
  return {
    box, pts, tip,
    grow(q) {
      const n = Math.floor(clamp01(q) * (pts.length - 1));
      for (; drawn < n; drawn++) {
        const a = pts[drawn], b = pts[drawn + 1];
        line.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: b.w + 5, color: c.dark, cap: 'round' });
        bark.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: b.w, color: shade(c.mid), cap: 'round' });
        const nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny) || 1, o = b.w * 0.22;
        hi.moveTo(a.x + nx / L * o, a.y + ny / L * o).lineTo(b.x + nx / L * o, b.y + ny / L * o)
          .stroke({ width: Math.max(1.5, b.w * 0.2), color: shade(mix(c.mid, c.core, 0.55)), alpha: 0.8, cap: 'round' });
        if (drawn % 4 === 2 && b.w > 10) {
          hi.moveTo(b.x - nx / L * b.w * 0.4, b.y - ny / L * b.w * 0.4).lineTo(b.x - nx / L * b.w * 0.05, b.y - ny / L * b.w * 0.05 + 3)
            .stroke({ width: 2, color: c.dark, alpha: 0.7 });
        }
      }
      if (tip) {
        const t = pts[Math.min(pts.length - 1, n + 1)];
        tip.position.set(t.x, t.y); setSize(tip, t.w * 2.6); tip.alpha = q > 0 && q < 1 ? 0.8 : Math.max(0, tip.alpha - 0.08);
      }
    },
  };
}
/** Points along a quadratic bezier with wobble and taper. */
function bez(ctx, a, ctrl, b, w0, w1, seg = 18, wob = 6) {
  const ph = ctx.rand(0, TAU), out = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, u = 1 - t;
    const x = u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, y = u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y;
    out.push({ x: x + Math.sin(t * 9 + ph) * wob * Math.sin(t * Math.PI), y: y + Math.cos(t * 7 + ph) * wob * 0.5 * Math.sin(t * Math.PI), w: lerp(w0, w1, t) });
  }
  return out;
}

/**
 * woodGrowth — Four-Pillar Prison: green chakra floods the ground, four thick wooden pillars burst up around
 * the caster, bend inward and sprout crossbeams that weave into a locked cage (face left open), leaves fall, it fades.
 * params: palette ('wood'), scale, variant 'prison' | 'branches' (pillars + side branches, no cage front) | 'forest' (more trunks)
 */
async function woodGrowth(ctx, p) {
  const c = ctx.palette(p.palette || 'wood'), scale = p.scale ?? 1, v = p.variant || 'prison';
  const { W, H } = ctx, hands = () => ctx.anchor('hands'), ground = () => ctx.anchor('ground');
  const cx = W / 2, gy = H + 30;

  // 1. Anticipation: chakra pulses down; the ground cracks with green light and leaves stir.
  ctx.sfx.charge(0.6); ctx.sfx.rumble(1.2);
  const crackG = ctx.add(ctx.g());
  const g0 = ground();
  const cp = [...crackPaths(ctx, g0.x, g0.y - 6, 4, W * 0.45, [-Math.PI * 0.98, -Math.PI * 0.85], 0.22),
    ...crackPaths(ctx, g0.x, g0.y - 6, 4, W * 0.45, [-Math.PI * 0.15, -Math.PI * 0.02], 0.22)];
  const leafWind = ctx.emitter({ x: () => ctx.rand(0, W), y: () => H + 10, rate: 18, tex: 'leaf', blend: 'normal', speed: [120, 260],
    angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [900, 1500], size: [22, 16], color: [0xffffff, mix(0xffffff, c.accent, 0.4)], alpha: [1, 0], spin: [-4, 4], drag: 0.8 });
  await Promise.all([gather(ctx, hands, c, 600, 0.9), ctx.tween(650, (e) => drawCracks(crackG, cp, e, c, 5), ctx.ease.inCubic)]);

  // 2. Release: the pillars erupt.
  const backL = ctx.add(new ctx.PIXI.Container()), frontL = ctx.add(new ctx.PIXI.Container());
  const limbs = []; // {limb, t0, dur}
  const add = (layer, pts, depth, t0, dur, glow = true) => { const limb = makeLimb(ctx, layer, c, pts, depth, glow); limb.grow(0); limbs.push({ limb, t0, dur }); return pts; };
  const pillars = [];
  const pillarDefs = [
    { side: -1, bx: 0.36, tx: 0.13, ty: 0.05, w: 0.075, depth: 0, layer: frontL, t0: 0 },
    { side: 1, bx: 0.36, tx: 0.13, ty: 0.05, w: 0.075, depth: 0, layer: frontL, t0: 90 },
    { side: -1, bx: 0.2, tx: 0.06, ty: 0.1, w: 0.045, depth: 1, layer: backL, t0: 160 },
    { side: 1, bx: 0.2, tx: 0.06, ty: 0.1, w: 0.045, depth: 1, layer: backL, t0: 230 },
  ];
  if (v === 'forest') pillarDefs.push(
    { side: -1, bx: 0.47, tx: 0.42, ty: 0.0, w: 0.06, depth: 0.5, layer: backL, t0: 300 },
    { side: 1, bx: 0.47, tx: 0.42, ty: 0.0, w: 0.06, depth: 0.5, layer: backL, t0: 340 });
  for (const d of pillarDefs) {
    const a = { x: cx + d.side * d.bx * W, y: gy }, b = { x: cx + d.side * d.tx * W, y: H * d.ty };
    const ctrl = { x: a.x, y: lerp(a.y, b.y, 0.65) };
    const pts = add(d.layer, bez(ctx, a, ctrl, b, d.w * W * scale, d.w * W * 0.55 * scale, 24, 8), d.depth, d.t0, 480);
    pillars.push({ ...d, pts });
  }
  const at = (pl, f) => pl.pts[Math.round(f * (pl.pts.length - 1))];
  const [FL, FR, BL, BR] = pillars;
  if (v !== 'branches') {
    // roof: tips knot together over the head
    add(backL, bez(ctx, at(FL, 1), { x: cx, y: -H * 0.02 }, at(BR, 0.97), W * 0.03, W * 0.018, 14, 4), 0.3, 560, 350);
    add(backL, bez(ctx, at(FR, 1), { x: cx, y: -H * 0.02 }, at(BL, 0.97), W * 0.03, W * 0.018, 14, 4), 0.3, 600, 350);
    // front lattice below the chin: crossing diagonals
    for (const [f, dy, t0] of [[0.1, -0.18, 520], [0.32, -0.12, 640], [0.52, 0.1, 760]]) {
      const l = at(FL, f), r = at(FR, f);
      add(frontL, bez(ctx, l, { x: cx, y: l.y + H * dy - H * 0.05 }, { x: r.x, y: r.y + H * dy }, W * 0.03, W * 0.016, 20, 5), 0, t0, 380);
      add(frontL, bez(ctx, r, { x: cx, y: r.y + H * dy - H * 0.02 }, { x: l.x, y: l.y + H * dy }, W * 0.03, W * 0.016, 20, 5), 0, t0 + 60, 380);
    }
  }
  // side braces front <-> back pillars (keep the face clear)
  for (const f of [0.35, 0.6, 0.85]) {
    add(backL, bez(ctx, at(FL, f), { x: lerp(at(FL, f).x, at(BL, f).x, 0.5), y: at(FL, f).y - H * 0.06 }, at(BL, f - 0.03), W * 0.024, W * 0.014, 10, 3), 0.2, 450 + f * 300, 260);
    add(backL, bez(ctx, at(FR, f), { x: lerp(at(FR, f).x, at(BR, f).x, 0.5), y: at(FR, f).y - H * 0.06 }, at(BR, f - 0.03), W * 0.024, W * 0.014, 10, 3), 0.2, 470 + f * 300, 260);
  }
  // leafy twigs (generated branch sprite) popping out of pillars
  const twigs = [];
  for (const pl of pillars) for (const f of [0.45, 0.75]) {
    const q = at(pl, f), s = pl.layer.addChild(spr(ctx, 'branch', mix(0xffffff, c.dark, pl.depth * 0.4)));
    s.anchor.set(0.05, 0.95); s.position.set(q.x, q.y); s.rotation = pl.side > 0 ? -0.2 : -1.35; s.scale.set(pl.side, 1);
    const sz = W * 0.11 * (1 - pl.depth * 0.4); s._k = sz / s.texture.width; s.scale.set(0); twigs.push({ s, t0: pl.t0 + 350 + f * 200, side: pl.side });
  }

  ctx.sfx.boom(0.8); ctx.sfx.crackle(1.2); ctx.sfx.rumble(1.5);
  ctx.zoomPunch(0.04, 350);
  ctx.shake(13 * scale, 900);
  for (const pl of pillars) { const b = pl.pts[0]; dust(ctx, b.x, H - 6, W * 0.16, { ...c, mid: mix(c.mid, c.core, 0.2) }, 0.9, 1.2); debris(ctx, b.x, H - 10, ctx.palette('earth'), 5, 0.8); }
  const t0 = ctx.t;
  const splinters = ctx.emitter({ x: () => choose(pillars).pts[0].x, y: () => H - 10, rate: 40, duration: 600, tex: 'shard', blend: 'normal',
    speed: [200, 500], angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [400, 800], size: [12, 6], color: [mix(c.mid, c.core, 0.4), c.mid], gravity: 1200, spin: [-8, 8] });
  const grow = (t) => {
    for (const l of limbs) l.limb.grow(ctx.ease.outCubic(clamp01((t - l.t0) / l.dur)));
    for (const tw of twigs) { const e = ctx.ease.outBack(clamp01((t - tw.t0) / 250)); tw.s.scale.set(tw.s._k * e * tw.side, tw.s._k * e); }
  };
  const end = Math.max(...limbs.map((l) => l.t0 + l.dur), ...twigs.map((t) => t.t0 + 250));
  await ctx.tween(end, (e, r) => grow(r * end));
  void t0; splinters.stop(); leafWind.stop();

  // 3. Lock: the cage snaps shut.
  ctx.sfx.crack(); ctx.sfx.boom(0.5);
  ctx.shake(9, 350); ctx.flash(c.glow, 160, 0.25);
  const lockGlow = ctx.add(spr(ctx, 'soft', c.glow, 'add', 0.6));
  lockGlow.position.set(cx, H * 0.08); setSize(lockGlow, W * 0.3);
  const leaves = ctx.emitter({ x: () => ctx.rand(W * 0.1, W * 0.9), y: () => ctx.rand(-10, H * 0.3), rate: 14, tex: 'leaf', blend: 'normal', speed: [20, 60],
    angle: [Math.PI * 0.3, Math.PI * 0.7], life: [1500, 2200], size: [20, 16], color: [0xffffff, mix(0xffffff, c.accent, 0.4)], alpha: [1, 0], spin: [-2, 2], gravity: 60 });
  await ctx.tween(1300, (e) => { lockGlow.alpha = 0.6 * (1 - e); crackG.alpha = 1 - e; });

  // 4. Follow-through: the wood withers away into falling leaves.
  ctx.sfx.wind(1);
  ctx.burst({ x: cx, y: H * 0.4, count: 30, tex: 'leaf', blend: 'normal', radius: W * 0.35, speed: [30, 120], angle: [0, TAU], life: [1000, 1600],
    size: [22, 14], color: 0xffffff, alpha: [1, 0], spin: [-3, 3], gravity: 160 });
  await ctx.tween(700, (e) => { backL.alpha = frontL.alpha = 1 - e; }, ctx.ease.inCubic);
  leaves.stop();
  await ctx.wait(700);
}

// ---------------------------------------------------------------------------------------------
/** Sand grain pool: tiny opaque dots updated by a per-grain position function. */
function grains(ctx, c, n, layer) {
  const box = ctx.add(new ctx.PIXI.Container(), layer), tex = ctx.tex('dot');
  const cols = [c.core, c.mid, c.mid, c.outer, c.accent];
  const list = Array.from({ length: n }, (_, i) => {
    const s = box.addChild(new ctx.PIXI.Sprite(tex));
    s.anchor.set(0.5); s.tint = cols[i % cols.length]; const sz = ctx.rand(2.5, 5.5); s.scale.set(sz / (tex.width || 1));
    return { s, i, r: Math.random(), r2: Math.random(), r3: Math.random(), x: 0, y: 0, vx: 0, vy: 0 };
  });
  return { box, list };
}

/** Packed-sand mass: flat fill + masked dirt-splat grain texture + an unmasked line layer on top. */
function sandBody(ctx, c, x0, y0, x1, y1) {
  const root = ctx.add(new ctx.PIXI.Container());
  const fill = root.addChild(ctx.g()), tex = root.addChild(new ctx.PIXI.Container()), mask = root.addChild(ctx.g()), line = root.addChild(ctx.g());
  for (let i = 0; i < 26; i++) {
    const s = tex.addChild(spr(ctx, choose(['dirt1', 'dirt2', 'dirt3']), choose([c.dark, c.outer, c.outer, c.core]), 'normal', ctx.rand(0.25, 0.5)));
    setSize(s, ctx.rand(0.3, 0.55) * (x1 - x0)); s.position.set(ctx.rand(x0, x1), ctx.rand(y0, y1)); s.rotation = ctx.rand(0, TAU);
  }
  tex.mask = mask;
  return { root, fill, tex, mask, line,
    draw(poly, color, alpha = 1) { fill.clear().poly(poly).fill({ color, alpha }); mask.clear().poly(poly).fill(0xffffff); tex.alpha = alpha; } };
}

/**
 * sandSwirl — Gaara's sand.
 *  coffin: sand pours up out of the ground, spirals around the body, closes into a tight shell to the neck, squeezes, crumbles.
 *  shield: sand surges up into a curved barrier in front of the caster, takes a hit (flash + ripple), then pours away.
 *  tsunami: shield rises higher and rolls forward.
 * params: palette ('sand'), scale, variant 'coffin' | 'shield' | 'tsunami'
 */
async function sandSwirl(ctx, p) {
  const v = p.variant || 'coffin';
  return v === 'coffin' ? sandCoffin(ctx, p) : sandShield(ctx, p, v === 'tsunami');
}

async function sandCoffin(ctx, p) {
  const c = ctx.palette(p.palette || 'sand'), scale = p.scale ?? 1;
  const { W, H } = ctx, hands = () => ctx.anchor('hands'), mouth = () => ctx.anchor('mouth'), ground = () => ctx.anchor('ground');
  const G = grains(ctx, c, 360);
  for (const gr of G.list) gr.b = gr.s.scale.x * 1.7; // chunkier grains so the swirl reads at phone size
  const st = { phase: 0, q: 0 };
  const shellW = W * 0.26 * scale;
  // shell geometry (relative to body centre): from neck (mouth + offset) down past the bottom edge
  const shell = () => { const m = mouth(), g = ground(); const top = m.y + H * 0.07; return { x: m.x, top, bot: g.y + 30, cy: (top + g.y) / 2 }; };
  for (const gr of G.list) { gr.x = ctx.rand(0, W); gr.y = H + ctx.rand(0, 60); gr.s.position.set(gr.x, gr.y); }

  ctx.tick((dt, t) => {
    const k = dt / 1000, sh = shell(), hd = hands();
    for (const gr of G.list) {
      let tx, ty, a;
      if (st.phase === 0) { // rising streams toward the hands
        a = gr.r * TAU + t * 0.004 * (1 + gr.r2); const r = (0.4 + gr.r3) * W * 0.12 * (1 - st.q * 0.5);
        tx = hd.x + Math.cos(a) * r * 1.6; ty = hd.y + Math.sin(a) * r * 0.5;
        const lag = clamp01(st.q * 1.6 - gr.r2 * 0.6);
        tx = lerp(gr.x0 ?? (gr.x0 = gr.x), tx, lag); ty = lerp(H + 20, ty, lag);
      } else if (st.phase === 1) { // helix around the body, tightening
        a = gr.r * TAU + t * 0.006 * (1 + gr.r2 * 0.6);
        const R = lerp(W * 0.42, shellW * 1.05, st.q) * (0.85 + 0.3 * gr.r3);
        const y = lerp(sh.bot, sh.top, (gr.r2 + t * 0.0004 * (1 + gr.r)) % 1);
        tx = sh.x + Math.cos(a) * R; ty = y + Math.sin(a) * R * 0.12;
        gr.s.alpha = Math.sin(a) > 0 ? 1 : 0.45;
      } else if (st.phase === 2) { // packed onto the shell surface
        const u = gr.r * 2 - 1, y = lerp(sh.top + 6, sh.bot, gr.r2);
        const wAt = shellW * Math.sqrt(Math.max(0, 1 - Math.pow((y - sh.top) / (sh.bot - sh.top) * 0.9 - 0.9, 2) * 0.3)) * (y < sh.top + 30 ? 0.8 : 1);
        tx = sh.x + u * wAt * (1 - st.q * 0.04 * Math.sin(t * 0.03)); ty = y;
        gr.s.alpha = 1;
      }
      if (st.phase < 3) {
        const f = 1 - Math.exp(-k * (st.phase === 2 ? 14 : 8));
        gr.x += (tx - gr.x) * f; gr.y += (ty - gr.y) * f;
      } else { // crumble: free fall
        gr.vy += 1200 * k; gr.x += gr.vx * k; gr.y += gr.vy * k;
      }
      if (gr.i % 3 === 0 && st.phase === 1) { // motion streaks sell the spin
        const dx = gr.x - gr.s.x, dy = gr.y - gr.s.y;
        gr.s.rotation = Math.atan2(dy, dx); gr.s.scale.set(gr.b * (1 + Math.min(5, Math.hypot(dx, dy) / 3)), gr.b);
      } else gr.s.scale.set(gr.b);
      gr.s.position.set(gr.x, gr.y);
    }
  });

  // 1. Anticipation: sand streams up out of the ground into a swirl at the hands.
  ctx.sfx.wind(1.2); ctx.sfx.hum(1.4, 90);
  const groundDust = ctx.emitter({ x: () => ctx.rand(0, W), y: () => H, rate: 30, tex: 'smoke3', blend: 'normal', speed: [40, 120],
    angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [800, 1300], size: [50, 120], color: [c.mid, c.outer], alpha: [0.5, 0], drag: 1 });
  await ctx.tween(800, (e) => { st.q = e; });

  // 2. Wrap: the sand spirals around the body and tightens.
  st.phase = 1; st.q = 0;
  ctx.sfx.spin(1.2); ctx.sfx.whoosh(0.8);
  const swirlClouds = Array.from({ length: 12 }, (_, i) => ({ s: ctx.add(spr(ctx, choose(['smoke4', 'smoke6', 'smoke7']), mix(c.mid, c.outer, Math.random() * 0.5), 'normal', 0)), a: i / 12 * TAU, y: (i * 0.37) % 1 }));
  const cloudTick = ctx.tick((dt, t) => {
    const sh = shell();
    for (const cl of swirlClouds) {
      const a = cl.a + t * 0.005, R = lerp(W * 0.38, shellW, st.q);
      cl.s.position.set(sh.x + Math.cos(a) * R, lerp(sh.bot - 40, sh.top + 30, cl.y) + Math.sin(a) * 18);
      setSize(cl.s, W * 0.2); cl.s.rotation = a; cl.s.alpha = (cl.s._a ?? 0) * (Math.sin(a) > 0 ? 1 : 0.55);
    }
  });
  await ctx.tween(1000, (e) => { st.q = e; for (const cl of swirlClouds) cl.s._a = 0.7 * Math.min(1, e * 3); }, ctx.ease.inOutCubic);
  groundDust.stop();

  // 3. Close: the coffin seals (solid shell fades in under the grains), hardens with a crack.
  st.phase = 2; st.q = 0;
  const sh0 = shell(), body = sandBody(ctx, c, sh0.x - shellW, sh0.top - 20, sh0.x + shellW, H + 20);
  G.box.parent.addChild(G.box); // loose grains stay on top of the shell
  const outline = (t) => (t < 0.25 ? 0.32 + 0.53 * Math.sin(t / 0.25 * Math.PI / 2) : 0.85 + 0.15 * Math.sin((t - 0.25) / 0.75 * Math.PI));
  const drawShell = (alpha, squeeze = 0) => {
    const sh = shell(), w = shellW * (1 - squeeze), L = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; L.push([sh.x - w * outline(t), lerp(sh.top, sh.bot, t)]); }
    const poly = [...L.flat(), ...L.slice().reverse().flatMap(([x, y]) => [2 * sh.x - x, y])];
    body.tex.position.set(sh.x - sh0.x, sh.top - sh0.top);
    body.draw(poly, mix(c.mid, c.outer, 0.35), alpha);
    // rounded light in the middle -> reads as a curved shell
    const inner = [...L.flatMap(([x, y]) => [lerp(sh.x, x, 0.55), y]), ...L.slice().reverse().flatMap(([x, y]) => [lerp(sh.x, 2 * sh.x - x, 0.55), y])];
    body.fill.poly(inner).fill({ color: c.mid, alpha: alpha * 0.6 });
    for (const s of [-1, 1]) { // shadowed flanks -> cylinder
      const fl = [...L.flatMap(([x, y]) => [sh.x + s * (sh.x - x), y]), ...L.slice().reverse().flatMap(([x, y]) => [sh.x + s * (sh.x - x) * 0.78, y])];
      body.fill.poly(fl).fill({ color: c.outer, alpha: alpha * 0.6 });
    }
    const ln = body.line.clear();
    for (let i = 0; i < 6; i++) { // spiral wrap bands
      const t0 = 0.22 + i * 0.13, y = lerp(sh.top, sh.bot, t0), ww = w * outline(t0) * 0.9;
      ln.moveTo(sh.x - ww, y + 26).quadraticCurveTo(sh.x, y + 22, sh.x + ww, y - 24).stroke({ width: 6, color: mix(c.outer, c.dark, 0.3), alpha: alpha * 0.85 });
      ln.moveTo(sh.x - ww, y + 20).quadraticCurveTo(sh.x, y + 16, sh.x + ww, y - 30).stroke({ width: 2.5, color: c.core, alpha: alpha * 0.6 });
    }
    ln.poly(poly).stroke({ width: 4, color: c.dark, alpha, join: 'round' });
  };
  ctx.sfx.whoosh(0.4);
  await ctx.tween(380, (e) => { drawShell(e); st.q = e; for (const cl of swirlClouds) cl.s._a = 0.7 * (1 - e); }, ctx.ease.outCubic);
  cloudTick && swirlClouds.forEach((cl) => (cl.s.visible = false));
  ctx.sfx.crack(); ctx.sfx.boom(0.6);
  ctx.shake(10 * scale, 400); ctx.zoomPunch(0.04, 300);
  ctx.flash(c.core, 120, 0.3);
  const s0 = shell();
  ctx.burst({ x: s0.x, y: s0.top, count: 30, tex: 'dot', blend: 'normal', radius: shellW * 0.7, speed: [120, 340], angle: [-Math.PI * 0.9, -Math.PI * 0.1],
    life: [400, 800], size: [5, 3], color: [c.mid, c.outer], gravity: 900 });
  // 4. Squeeze: the grip tightens (two pulses).
  await ctx.wait(350);
  ctx.sfx.rumble(0.8);
  ctx.shake(6, 600);
  await ctx.tween(700, (e) => drawShell(1, 0.06 * Math.sin(e * Math.PI * 2) ** 2));
  await ctx.wait(250);

  // 5. Burial: the grip crushes shut and the coffin bursts apart into pouring sand.
  ctx.sfx.boom(0.9); ctx.sfx.crack();
  ctx.shake(15 * scale, 500); ctx.zoomPunch(0.05, 300);
  const sc = shell();
  ctx.burst({ x: sc.x, y: sc.cy, count: 50, tex: 'dot', blend: 'normal', radius: shellW * 0.8, speed: [250, 650], angle: [-Math.PI * 0.95, -Math.PI * 0.05],
    life: [500, 900], size: [8, 4], color: [c.core, c.mid, c.outer], gravity: 1000, drag: 0.5 });
  st.phase = 3;
  for (const gr of G.list) { gr.vx = ctx.rand(-160, 160); gr.vy = ctx.rand(-380, 0); }
  ctx.sfx.wind(1.2);
  const sh1 = shell();
  ctx.burst({ x: sh1.x, y: sh1.cy, count: 14, tex: choose(DUSTS), blend: 'normal', radius: shellW, speed: [20, 80], life: [1000, 1600],
    size: [80, 160], color: [c.mid, c.outer], alpha: [0.6, 0], drag: 1, gravity: 60 });
  await ctx.tween(800, (e) => { drawShell(1 - e); }, ctx.ease.inCubic);
  body.root.visible = false;
  await ctx.wait(700);
}

async function sandShield(ctx, p, tsunami = false) {
  const c = ctx.palette(p.palette || 'sand'), scale = (p.scale ?? 1) * (tsunami ? 1.25 : 1);
  const { W, H } = ctx, hands = () => ctx.anchor('hands'), ground = () => ctx.anchor('ground');
  const sw = W * 0.86, sh = H * 0.47 * scale;
  const st = { rise: 0, fall: 0, dent: 0, dentX: 0 };
  // top edge of the barrier, u in [-1,1] (arched: higher in the middle)
  const topY = (u, t) => {
    const g = ground();
    return g.y - sh * st.rise * (1 - 0.3 * u * u) + Math.sin(u * 8 + t * 0.006) * 5 + sh * st.fall * (0.6 + 0.4 * Math.sin(u * 5 + 1));
  };
  const xOf = (u) => ground().x + u * sw / 2 * (1 + st.dent * 0.03 * Math.cos(u * 3));

  // 1. Anticipation: sand trickles up from the ground and churns at the hands.
  ctx.sfx.wind(1); ctx.sfx.hum(1.2, 80);
  const G = grains(ctx, c, 280);
  for (const gr of G.list) { gr.u = gr.r * 2 - 1; gr.x = xOf(gr.u); gr.y = H + 10; }
  const swirl = ctx.emitter({ x: () => hands().x, y: () => hands().y, rate: 60, tex: 'dot', blend: 'normal', radius: [30, 90], speed: [60, 140],
    angle: [-Math.PI, 0], life: [400, 700], size: [4, 2], color: [c.mid, c.outer], alpha: [1, 0.5], gravity: 300 });
  const rising = ctx.emitter({ x: () => ctx.rand(W * 0.1, W * 0.9), y: () => H, rate: 90, tex: 'dot', blend: 'normal', speed: [200, 380],
    angle: [-Math.PI * 0.6, -Math.PI * 0.4], life: [500, 800], size: [4, 3], color: [c.mid, c.outer], alpha: [1, 0.6], gravity: 200 });
  await ctx.wait(500);

  // 2. Rise: the barrier surges up in a wave.
  const body = sandBody(ctx, c, W / 2 - sw / 2, H - sh * 1.1, W / 2 + sw / 2, H + 20), front = body.line;
  G.box.parent.addChild(G.box); // grains above the shell
  const N = 36;
  ctx.tick((dt, t) => {
    if (st.rise <= 0.01) return;
    const pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N * 2 - 1; pts.push(xOf(u), topY(u, t)); }
    const g = ground();
    const alpha = clamp01(1 - st.fall * 1.2);
    const poly = [...pts, xOf(1), g.y + 40, xOf(-1), g.y + 40];
    body.draw(poly, mix(c.mid, c.outer, 0.45), alpha * 0.95);
    // lighter bulge in the middle + darker flanks -> a curved barrier
    const mid = []; for (let i = 0; i <= N; i++) { const u = i / N * 2 - 1; mid.push(lerp(g.x, pts[i * 2], 0.6), lerp(pts[i * 2 + 1], g.y, 0.08)); }
    body.fill.poly([...mid, lerp(g.x, xOf(1), 0.6), g.y + 40, lerp(g.x, xOf(-1), 0.6), g.y + 40]).fill({ color: c.mid, alpha: alpha * 0.5 });
    front.clear();
    // flowing bands that bow toward the camera and slide sideways
    for (let b = 1; b <= 5; b++) {
      for (let i = 0; i < pts.length; i += 2) {
        const u = i / 2 / N * 2 - 1, y = pts[i + 1] + b * sh * 0.15 * st.rise + (1 - u * u) * b * 9 + Math.sin(u * 6 + t * 0.006 * (b % 2 ? 1 : -1) + b) * 5;
        i ? front.lineTo(pts[i], y) : front.moveTo(pts[i], y);
      }
      front.stroke({ width: 7 - b * 0.8, color: b % 2 ? c.core : c.outer, alpha: alpha * (b % 2 ? 0.35 : 0.6) });
    }
    front.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) front.lineTo(pts[i], pts[i + 1]);
    front.stroke({ width: 4, color: c.core, alpha: alpha * 0.85 });
    front.poly(poly).stroke({ width: 3, color: c.dark, alpha: alpha * 0.7, join: 'round' });
    // grains stream across the face of the shield
    const k = dt / 1000;
    for (const gr of G.list) {
      if (st.fall > 0) { gr.vy = (gr.vy || 0) + 900 * k; gr.y += gr.vy * k; gr.x += Math.sin(gr.r * 50) * 20 * k; }
      else {
        gr.u += (0.25 + gr.r2 * 0.4) * k * (gr.r3 > 0.5 ? 1 : -1);
        if (gr.u > 1) gr.u -= 2; if (gr.u < -1) gr.u += 2;
        const ty = lerp(topY(gr.u, t), g.y, gr.r2 * 0.95), tx = xOf(gr.u);
        const f = 1 - Math.exp(-k * 10); gr.x += (tx - gr.x) * f; gr.y += (ty - gr.y) * f;
      }
      gr.s.position.set(gr.x, gr.y);
    }
  });
  ctx.sfx.whoosh(0.7); ctx.sfx.rumble(1);
  ctx.shake(8 * scale, 500);
  for (let i = 0; i < 3; i++) dust(ctx, W * (0.25 + i * 0.25), H - 6, W * 0.2, c, 0.8, 1.2);
  const crestU = () => (st.cu = ctx.rand(-0.9, 0.9));
  const crest = ctx.emitter({ x: () => xOf(crestU()), y: () => topY(st.cu, ctx.t) + 4, rate: 160, tex: 'dot', blend: 'normal',
    speed: [60, 200], angle: [-Math.PI * 0.85, -Math.PI * 0.15], life: [400, 800], size: [4, 2], color: [c.core, c.mid], gravity: 500 });
  await ctx.tween(550, (e) => { st.rise = e; }, ctx.ease.outBack);
  rising.stop(); swirl.stop();
  await ctx.wait(300);

  // 3. Impact: an incoming attack slams into the shield; it holds.
  const hx = W / 2 + W * 0.12, hy = topY(0.25, ctx.t) + sh * 0.3;
  ctx.sfx.boom(0.9); ctx.sfx.crack();
  ctx.flash(c.core, 120, 0.35);
  ctx.shake(14 * scale, 500); ctx.zoomPunch(0.05, 300);
  const shock = ctx.filter(new ctx.filters.ShockwaveFilter({ center: { x: hx, y: hy }, amplitude: 30, wavelength: 100, speed: 600, brightness: 1.1, radius: W * 0.5 }));
  const hit = ctx.add(spr(ctx, 'flare1', c.core, 'add', 1)); hit.position.set(hx, hy);
  const ring = ctx.add(spr(ctx, 'circle3', c.core, 'add', 0.9)); ring.position.set(hx, hy);
  ctx.burst({ x: hx, y: hy, count: 60, tex: 'dot', blend: 'normal', speed: [200, 600], angle: [-Math.PI, 0], life: [500, 900], size: [6, 3],
    color: [c.core, c.mid], gravity: 900, drag: 1 });
  ctx.burst({ x: hx, y: hy, count: 6, tex: choose(DUSTS), blend: 'normal', speed: [40, 120], life: [800, 1300], size: [70, 150], color: [c.mid, c.outer], alpha: [0.6, 0] });
  await ctx.tween(600, (e, r) => {
    shock.time = r * 0.6; shock.amplitude = 30 * (1 - r);
    setSize(hit, W * (0.15 + 0.1 * e)); hit.alpha = 1 - e;
    setSize(ring, W * (0.05 + 0.4 * e)); ring.alpha = 0.9 * (1 - e);
    st.dent = Math.sin(r * Math.PI);
  }, ctx.ease.outCubic);
  ctx.removeFilter(shock);
  await ctx.wait(tsunami ? 200 : 600);

  // 4. Follow-through: the barrier pours back down into the ground.
  ctx.sfx.wind(1.4);
  for (const gr of G.list) gr.vy = ctx.rand(-120, 0);
  crest.stop();
  const pour = ctx.emitter({ x: () => xOf(ctx.rand(-0.9, 0.9)), y: () => H - 6, rate: 30, tex: 'smoke4', blend: 'normal', speed: [20, 70],
    angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [900, 1400], size: [60, 140], color: [c.mid, c.outer], alpha: [0.5, 0], drag: 1 });
  await ctx.tween(1000, (e) => { st.fall = e; }, ctx.ease.inCubic);
  body.root.visible = false; pour.stop();
  await ctx.wait(700);
}

export const EFFECTS = { earthWall, earthSpikes, mudSwamp, woodGrowth, sandSwirl };
