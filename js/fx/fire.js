// Fire archetypes: fireball, flameStream, phoenixFlowers, ashBurn, blackFlames.
// Look rule: flame BODIES use normal blending (tinted Kenney fire/muzzle/smoke sprites), so overlap builds up
// orange/red, never white. Only small cores, sparks and glows are additive. Works for dark palettes too.

const TAU = Math.PI * 2;
const TONGUES = ['muzzle2', 'muzzle3', 'muzzle4', 'muzzle5']; // solid flame tongues, tip up, base low
const BLOBS = ['fire1', 'fire2'];                              // dense turbulent fire masses
const SMOKES = ['smoke1', 'smoke4', 'smoke6', 'smoke7', 'smoke8'];
const ASH = 0x6a625c;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => {
  t = clamp01(t);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  return (Math.round(ar + (((b >> 16) & 255) - ar) * t) << 16) | (Math.round(ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
};
const unit = (ctx) => Math.min(ctx.W, ctx.H);
// random element (ctx.pick samples a [min, max] range, not an element)
const any = (a) => a[Math.floor(Math.random() * a.length)];

function spr(ctx, tex, tint = 0xffffff, blend = 'normal', alpha = 1) {
  const s = new ctx.PIXI.Sprite(ctx.tex(tex));
  s.anchor.set(0.5); s.tint = tint; s.blendMode = blend; s.alpha = alpha;
  return s;
}
const setSize = (s, d) => s.scale.set(d / (s.texture.width || 1));

/** Spawns rate()/s single particles; make() returns a fresh burst cfg (own position/texture) for each one. */
function sprinkle(ctx, rate, make) {
  let acc = 0, on = true;
  ctx.tick((dt) => {
    if (!on) return false;
    // cap the backlog so a long frame (tab switch, stall) cannot dump hundreds of particles at once
    acc = Math.min(acc + (typeof rate === 'function' ? rate() : rate) * dt / 1000, 12);
    while (acc >= 1) { acc--; ctx.burst({ count: 1, ...make() }); }
  });
  return { stop() { on = false; } };
}

/** A rising flame tongue at (x, y). Tip points up; `lean` tilts it. */
const tongue = (ctx, x, y, size, colors, o = {}) => ({ tex: any(TONGUES), blend: 'normal', x, y, speed: [30, 90], angle: -Math.PI / 2,
  rotation: o.lean ?? ctx.rand(-0.2, 0.2), life: [350, 650], accel: [0, -280], size: [size, size * 0.3], color: colors, alpha: [0.95, 0], ...o });

/** Anticipation: chakra motes spiral into `at()` while a hot glow swells there. Resolves after ms. */
async function charge(ctx, at, c, ms = 500, k = 1) {
  const U = unit(ctx) * k, box = ctx.add(new ctx.PIXI.Container());
  const glow = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0));
  const hot = box.addChild(spr(ctx, 'flare1', c.accent, 'add', 0));
  const motes = Array.from({ length: Math.round(22 * k) }, () => ({
    s: box.addChild(spr(ctx, 'spark', any([c.accent, c.mid, c.core]), 'add', 0)),
    a: ctx.rand(0, TAU), r: ctx.rand(0.25, 0.5) * U, d: ctx.rand(0, 0.45), w: ctx.rand(2, 4),
  }));
  const t0 = ctx.t;
  let live = true;
  ctx.tick((dt, t) => {
    if (!live) return false;
    const p = at();
    for (const m of motes) {
      const q = clamp01(((t - t0) / ms - m.d) / 0.55), r = m.r * (1 - q * q), a = m.a + q * m.w;
      m.s.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      m.s.rotation = a + Math.PI / 2; m.s.alpha = q > 0 && q < 1 ? 0.9 : 0;
      m.s.scale.set(0.25 + 0.2 * q, 0.12);
    }
    glow.position.set(p.x, p.y); hot.position.set(p.x, p.y);
  });
  await ctx.tween(ms, (e) => {
    setSize(glow, U * (0.15 + 0.3 * e)); glow.alpha = 0.5 * e;
    setSize(hot, U * (0.2 + 0.6 * e)); hot.alpha = e; hot.rotation = e * 2;
  }, ctx.ease.inCubic);
  live = false; box.destroy({ children: true });
}

/**
 * A churning ball of fire: a corona of flame tongues around layered, counter-rotating fire masses
 * (red outside -> orange -> yellow inside) with a small additive core. ball.R = visible radius in px.
 */
function makeBall(ctx, c, layer = 'front') {
  const root = ctx.add(new ctx.PIXI.Container(), layer);
  const halo = root.addChild(spr(ctx, 'soft', c.glow, 'add', 0.28));
  const rim = [];
  for (let i = 0; i < 20; i++) {
    const s = root.addChild(spr(ctx, TONGUES[i % 4], mix(c.outer, c.mid, ctx.rand(0.1, 0.75)), 'normal', ctx.rand(0.7, 0.95)));
    s.anchor.set(0.5, 0.8);
    rim.push({ s, a: (i / 20) * TAU + ctx.rand(-0.2, 0.2), ph: ctx.rand(0, TAU), w: ctx.rand(7, 15), k: ctx.rand(0.55, 1.25), r: ctx.rand(0.5, 0.68) });
  }
  const tints = [mix(c.outer, c.dark, 0.25), mix(c.outer, c.mid, 0.45), c.mid, mix(c.mid, c.core, 0.6)];
  const sizes = [2.9, 2.5, 2.0, 1.3], counts = [3, 3, 3, 2];
  const shells = [];
  tints.forEach((tint, ring) => {
    for (let i = 0; i < counts[ring]; i++) {
      const s = root.addChild(spr(ctx, BLOBS[(i + ring) % 2], tint, 'normal', ring === 3 ? 0.85 : 0.95));
      shells.push({ s, ring, a: ctx.rand(0, TAU), w: ctx.rand(0.6, 1.4) * (ring % 2 ? -1 : 1), ph: ctx.rand(0, TAU) });
    }
  });
  const core = root.addChild(spr(ctx, 'soft', c.core, 'add', 0.5));
  const ball = { root, R: 10, spin: 1, heat: 1,
    update(t) {
      const R = ball.R, s = t * 0.001;
      setSize(halo, R * 3.2); halo.alpha = 0.28 * ball.heat;
      for (const r of rim) {
        const a = r.a + s * 0.4 * ball.spin, f = 1 + 0.25 * Math.sin(s * r.w + r.ph);
        r.s.position.set(Math.cos(a) * R * r.r, Math.sin(a) * R * r.r);
        // tongues lean upward (flame rises) instead of fanning out evenly like a sunflower
        const out = Math.atan2(Math.cos(a), -Math.sin(a));
        r.s.rotation = out * 0.6 + 0.25 * Math.sin(s * r.w * 0.5 + r.ph);
        setSize(r.s, R * 1.3 * r.k * f * (Math.sin(a) < 0 ? 1.25 : 0.85));
      }
      for (const p of shells) {
        const off = R * 0.06 * Math.sin(s * 3 + p.ph);
        p.s.position.set(Math.cos(p.ph + s) * off, Math.sin(p.ph + s) * off);
        p.s.rotation = p.a + s * p.w * ball.spin;
        setSize(p.s, R * sizes[p.ring] * (1 + 0.04 * Math.sin(s * 5 + p.ph)));
      }
      setSize(core, R * 1.4); core.alpha = ball.heat * (0.45 + 0.08 * Math.sin(t * 0.02));
    } };
  return ball;
}

/** Radial explosion of flame tongues + fire masses at (x, y). */
function blast(ctx, x, y, R, c, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ctx.rand(-0.3, 0.3), k = ctx.rand(0.6, 1.4);
    ctx.burst({ count: 1, tex: any(TONGUES), blend: 'normal', x, y, speed: R * 2.6 * k, angle: a, rotation: a + Math.PI / 2,
      life: [380, 600], drag: 2.6, size: [R * 1.1 * k, R * 0.4], color: [mix(c.mid, c.outer, ctx.rand(0, 0.5)), c.outer, c.dark], alpha: [0.9, 0], layer: 'front' });
  }
  ctx.burst({ x, y, count: 9, tex: any(BLOBS), blend: 'normal', radius: [0, R * 0.4], speed: [R * 0.6, R * 1.6], life: [450, 700], drag: 2,
    size: [R * 1.4, R * 2.6], color: [c.mid, c.outer, c.dark], alpha: [0.9, 0], spin: [-1.5, 1.5], layer: 'front' });
}

/** Smoke + embers left behind when a fire mass breaks up. */
function dissipate(ctx, x, y, R, c, k = 1) {
  ctx.burst({ x, y, count: Math.round(12 * k), tex: any(SMOKES), blend: 'normal', radius: [0, R * 0.7], speed: [20, 90], angle: [-Math.PI, 0],
    life: [1300, 2200], size: [R * 0.8, R * 1.5], color: [mix(c.outer, c.dark, 0.6), c.dark], alpha: [0.5, 0], spin: [-0.6, 0.6], accel: [0, -40] });
  ctx.burst({ x, y, count: Math.round(36 * k), tex: 'spark', radius: [0, R * 0.8], speed: [80, 420], life: [700, 1600], layer: 'front',
    size: [18, 3], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.6, gravity: -60, drag: 1.2 });
}

/** Shockwave filter helper: ring(x, y) fires a distortion ring (one filter reused). */
function shockwaves(ctx, opts = {}) {
  const f = ctx.filter(new ctx.filters.ShockwaveFilter({ amplitude: 0, wavelength: 90, speed: 900, brightness: 1.05, radius: -1, ...opts }));
  let t0 = -1e9;
  ctx.tick((dt, t) => {
    const s = (t - t0) / 1000; f.time = s;
    f.amplitude = s < 0.6 ? (opts.amplitude ?? 22) * (1 - s / 0.6) : 0;
  });
  return { f, ring(x, y) { f.center = { x, y }; t0 = ctx.t; } };
}

// ---------------------------------------------------------------------------------------------
/**
 * fireball — inhale, then a roiling sphere of fire is exhaled in front of the mouth, swells, churns,
 * rushes the camera and breaks into smoke and embers.
 * params: palette (default 'fire'), scale, variant: 'single' | 'great' | 'barrage', count (barrage balls, default 5)
 */
async function fireball(ctx, p) {
  const variant = p.variant || 'single';
  if (variant === 'barrage') return fireBarrage(ctx, p);
  const c = ctx.palette(p.palette || 'fire'), scale = p.scale ?? 1, great = variant === 'great';
  const U = unit(ctx), mouth = () => ctx.anchor('mouth');

  // 1. Anticipation: deep inhale, chakra gathers at the mouth, the room dims.
  const chargeMs = great ? 800 : 500;
  ctx.sfx.charge(chargeMs / 1000);
  const dim = ctx.tint(0x000000, 0, 'normal');
  await Promise.all([charge(ctx, mouth, c, chargeMs, great ? 1.3 : 1), ctx.tween(chargeMs, (e) => dim.set(0.22 * e))]);

  // 2. Release: fire bursts from the lips and balls up into a sphere.
  ctx.sfx.roar(great ? 3 : 2); ctx.sfx.boom(great ? 0.9 : 0.5);
  ctx.flash(c.glow, 120, 0.2);
  ctx.zoomPunch(great ? 0.06 : 0.04, 300);
  ctx.shake((great ? 14 : 8) * scale, great ? 2400 : 1300);
  const warm = ctx.tint(c.outer, 0, 'normal');
  const ball = makeBall(ctx, c);
  const maxR = U * (great ? 0.36 : 0.2) * scale;
  const place = () => { const m = mouth(); ball.root.position.set(m.x, m.y + ball.R * 0.3); };
  let feedOn = true;
  const feed = sprinkle(ctx, () => (feedOn ? 110 : 0), () => {
    const m = mouth(), a = ctx.rand(0, TAU);
    return { tex: any(TONGUES), blend: 'normal', x: m.x, y: m.y, speed: [ball.R * 1.8, ball.R * 2.8], angle: a, rotation: a + Math.PI / 2,
      life: [160, 280], size: [U * 0.06, ball.R * 0.9], color: [c.mid, c.outer], alpha: [0.95, 0.3], layer: 'front' };
  });
  const licks = sprinkle(ctx, great ? 50 : 28, () => {
    const b = ball.root, R = ball.R, a = ctx.rand(-Math.PI * 0.95, -Math.PI * 0.05);
    return tongue(ctx, b.x + Math.cos(a) * R * 0.85, b.y + Math.sin(a) * R * 0.8, R * 0.8, [c.mid, c.outer, c.dark], { lean: (a + Math.PI / 2) * 0.5 });
  });
  const smoke = sprinkle(ctx, great ? 7 : 4, () => {
    const b = ball.root, R = ball.R;
    return { tex: any(SMOKES), blend: 'normal', x: b.x + ctx.rand(-0.6, 0.6) * R, y: b.y - R * 0.9, speed: [30, 70], angle: [-1.9, -1.2],
      life: [1200, 1800], size: [R * 0.7, R * 1.5], color: [mix(c.outer, c.dark, 0.7), c.dark], alpha: [0.45, 0], accel: [0, -30], spin: [-0.5, 0.5] };
  });
  const embers = ctx.emitter({ x: () => ball.root.x, y: () => ball.root.y, rate: great ? 45 : 25, tex: 'spark', radius: () => ball.R, layer: 'front',
    speed: [150, 400], life: [400, 900], size: [16, 3], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.5, gravity: -120 });

  await ctx.tween(great ? 1000 : 700, (e, raw) => {
    ball.R = maxR * (0.08 + 0.92 * e); place(); ball.update(ctx.t);
    feedOn = raw < 0.55; warm.set(0.1 * e); dim.set(0.22 * (1 - e));
  }, ctx.ease.outCubic);
  feed.stop();

  // hold: the sphere churns at full size
  await ctx.tween(great ? 650 : 350, (e) => {
    ball.R = maxR * (1 + 0.04 * Math.sin(e * 12)); ball.spin = 1 + 1.5 * e; place(); ball.update(ctx.t);
  });

  // push: it rolls at the camera
  ctx.sfx.whoosh(0.5);
  const zoom = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength: 0, innerRadius: 60 }));
  await ctx.tween(400, (e) => {
    ball.R = maxR * (1 + 0.45 * e); place(); ball.update(ctx.t);
    zoom.center = { x: ball.root.x, y: ball.root.y }; zoom.strength = 0.1 * e; warm.set(0.1 + 0.06 * e);
  }, ctx.ease.inCubic);

  // 3. Follow-through: the sphere bursts into heat, smoke and embers, and clears.
  licks.stop(); smoke.stop(); embers.stop();
  ctx.sfx.boom(great ? 0.8 : 0.4); ctx.sfx.crackle(1.6);
  ctx.shake((great ? 18 : 10) * scale, 500);
  if (great) shockwaves(ctx, { amplitude: 26, wavelength: 140, speed: 1100 }).ring(ball.root.x, ball.root.y);
  const { x, y } = ball.root, R1 = ball.R;
  blast(ctx, x, y, R1 * 0.6, c, great ? 18 : 12);
  dissipate(ctx, x, y, R1, c, great ? 1.4 : 0.9);
  await ctx.tween(550, (e) => {
    ball.R = R1 * (1 + 0.3 * e); ball.heat = 1 - e; ball.update(ctx.t); ball.root.alpha = 1 - e;
    zoom.strength = 0.1 * (1 - e); warm.set(0.16 * (1 - e));
  }, ctx.ease.outCubic);
  ball.root.visible = false; ctx.removeFilter(zoom);
  await ctx.wait(1200);
}

/** fireball:barrage — several balls spat in quick succession, each detonating where it lands. */
async function fireBarrage(ctx, p) {
  const c = ctx.palette(p.palette || 'fire'), scale = p.scale ?? 1, n = Math.max(2, Math.min(9, p.count ?? 5));
  const U = unit(ctx), mouth = () => ctx.anchor('mouth');
  ctx.sfx.charge(0.45);
  await charge(ctx, mouth, c, 450, 0.9);
  const sw = shockwaves(ctx, { amplitude: 14, wavelength: 70, speed: 800 });
  const shots = [];
  for (let i = 0; i < n; i++) { shots.push(oneBall(i)); await ctx.wait(220); }
  await Promise.all(shots);
  await ctx.wait(900);

  async function oneBall(i) {
    const side = i % 2 ? 1 : -1, spread = (i / (n - 1 || 1)) * 2 - 1;
    const m0 = mouth();
    ctx.sfx.whoosh(0.35); ctx.shake(5 * scale, 200);
    ctx.burst({ x: m0.x, y: m0.y, count: 8, tex: 'muzzle2', blend: 'normal', speed: [60, 160], life: [150, 260], size: [U * 0.12, U * 0.05], color: [c.mid, c.outer], alpha: [0.9, 0] });
    const ball = makeBall(ctx, c); ball.spin = 3;
    const tx = ctx.W / 2 + spread * ctx.W * 0.36 + ctx.rand(-30, 30), ty = ctx.H * ctx.rand(0.28, 0.75);
    const R1 = U * ctx.rand(0.07, 0.1) * scale;
    const trail = ctx.emitter({ x: () => ball.root.x, y: () => ball.root.y, rate: 60, tex: 'fire1', blend: 'normal', radius: () => ball.R * 0.3,
      speed: [10, 50], life: [220, 420], size: [() => ball.R * 1.8, () => ball.R * 0.4], color: [c.mid, c.outer, c.dark], alpha: [0.8, 0] });
    await ctx.tween(520, (e, raw) => {
      const m = mouth();
      ball.R = 8 + R1 * e;
      ball.root.position.set(m.x + (tx - m.x) * e + side * Math.sin(raw * Math.PI) * U * 0.08, m.y + (ty - m.y) * e - Math.sin(raw * Math.PI) * U * 0.05);
      ball.update(ctx.t);
    }, ctx.ease.inOutCubic);
    trail.stop();
    const { x, y } = ball.root;
    ball.root.visible = false;
    ctx.sfx.boom(0.45); ctx.shake(9 * scale, 300); sw.ring(x, y);
    blast(ctx, x, y, R1, c, 10);
    dissipate(ctx, x, y, R1 * 1.6, c, 0.5);
  }
}

// ---------------------------------------------------------------------------------------------
/**
 * flameStream — fire breathed from the mouth.
 * params: palette (default 'fire'), scale, variant: 'breath' (cone jet) | 'dragonflame' (a tight line of fire races
 * along a wire held in the teeth to a target and detonates it) | 'inferno' (fills the screen, ground ignites)
 */
async function flameStream(ctx, p) {
  const variant = p.variant || 'breath';
  const c = ctx.palette(p.palette || 'fire'), scale = p.scale ?? 1;
  const U = unit(ctx), mouth = () => ctx.anchor('mouth');
  if (variant === 'dragonflame') return dragonflame(ctx, c, scale, U, mouth);
  const inferno = variant === 'inferno';

  ctx.sfx.charge(0.55);
  const dim = ctx.tint(0x000000, 0, 'normal');
  await Promise.all([charge(ctx, mouth, c, 550, inferno ? 1.4 : 1), ctx.tween(550, (e) => dim.set(0.22 * e))]);
  dim.fade(500);

  // jet direction: slightly down and to screen-right; inferno sprays a wide fan toward the camera
  const dir = inferno ? Math.PI / 2 : 0.35, spread = inferno ? 1.25 : 0.2;
  let pow = 0;
  ctx.sfx.roar(inferno ? 3.4 : 2.4); ctx.sfx.whoosh(0.4);
  ctx.flash(c.glow, 120, 0.2); ctx.zoomPunch(0.04, 250);
  ctx.shake((inferno ? 14 : 8) * scale, inferno ? 2800 : 2000);
  const jetA = () => dir + ctx.rand(-spread, spread) * (0.5 + 0.5 * pow);
  const reach = (inferno ? 1.1 : 0.95) * U * scale;
  const body = ctx.emitter({ x: () => mouth().x, y: () => mouth().y, rate: () => (inferno ? 150 : 130) * pow, tex: 'fire1', blend: 'normal',
    speed: [reach * 0.9, reach * 1.25], angle: jetA, life: [500, 750], drag: 0.6, rotation: [0, TAU], spin: [-2, 2],
    size: [U * 0.06, U * (inferno ? 0.7 : 0.4) * scale], color: [mix(c.mid, c.core, 0.5), c.mid, c.outer, c.dark], alpha: [1, 0] });
  const lick = ctx.emitter({ x: () => mouth().x, y: () => mouth().y, rate: () => 60 * pow, tex: 'muzzle3', blend: 'normal',
    speed: [reach * 0.7, reach], angle: jetA, life: [400, 650], accel: [0, -300], rotation: [-0.3, 0.3],
    size: [U * 0.05, U * 0.25 * scale], color: [c.mid, c.outer], alpha: [0.9, 0] });
  const sparks = ctx.emitter({ x: () => mouth().x, y: () => mouth().y, rate: () => 40 * pow, tex: 'spark', layer: 'front',
    speed: [reach * 0.8, reach * 1.4], angle: jetA, life: [300, 700], size: [20, 3], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.8 });
  const lip = ctx.add(spr(ctx, 'muzzle2', c.mid, 'normal', 0));
  lip.anchor.set(0.5, 0.85); lip.rotation = dir + Math.PI / 2;
  ctx.tick(() => { const m = mouth(); lip.position.set(m.x, m.y); setSize(lip, U * 0.3 * ctx.rand(0.8, 1.2)); lip.alpha = 0.9 * pow; });
  const warm = ctx.tint(c.outer, 0, 'normal');
  const ground = inferno && ctx.emitter({ x: () => ctx.rand(0, ctx.W), y: () => ctx.H + 20, rate: () => 90 * pow, tex: 'muzzle4', blend: 'normal',
    speed: [100, 260], angle: [-Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2], rotation: [-0.25, 0.25], life: [700, 1100], accel: [0, -200],
    size: [U * 0.35, U * 0.12], color: [c.mid, c.outer, c.dark], alpha: [0.95, 0], radius: [0, 40] });
  await ctx.tween(350, (e) => { pow = e; warm.set((inferno ? 0.18 : 0.08) * e); }, ctx.ease.outCubic);
  await ctx.wait(inferno ? 1900 : 1500);
  ctx.sfx.crackle(1.5);
  await ctx.tween(450, (e) => { pow = 1 - e; warm.set((inferno ? 0.18 : 0.08) * (1 - e)); });
  for (const em of [body, lick, sparks, ground]) em && em.stop();
  const end = mouth();
  for (let i = 1; i <= (inferno ? 5 : 3); i++) {
    const a = dir + (inferno ? ctx.rand(-1, 1) : 0), d = reach * 0.5 * i / 2;
    dissipate(ctx, end.x + Math.cos(a) * d, end.y + Math.sin(a) * d, U * 0.16 * i * 0.6, c, 0.5);
  }
  await ctx.wait(1300);
}

/**
 * flameStream:dragonflame — a wire held in the teeth glints out to a target; a tight line of fire races along it
 * like a burning fuse, the dragon-headed front detonates the target, then the line burns out.
 */
async function dragonflame(ctx, c, scale, U, mouth) {
  const T = () => ({ x: ctx.W * 0.86, y: ctx.H * 0.24 });
  const at = (u) => {
    const m = mouth(), t = T(), q = { x: (m.x + t.x) / 2, y: Math.max(m.y, t.y) + U * 0.1 }, v = 1 - u;
    return { x: v * v * m.x + 2 * v * u * q.x + u * u * t.x, y: v * v * m.y + 2 * v * u * q.y + u * u * t.y };
  };
  const wire = ctx.add(ctx.g()), line = ctx.add(ctx.g()), hot = ctx.add(ctx.g());
  hot.blendMode = 'add';
  let reveal = 0, wireA = 0, from = 0, to = 0, heat = 0;
  const stroke = (g, u0, u1, width, color, alpha) => {
    g.clear();
    if (u1 - u0 < 0.004 || alpha <= 0.01 || width < 0.5) return;
    const p0 = at(u0); g.moveTo(p0.x, p0.y);
    for (let i = 1; i <= 24; i++) { const q = at(u0 + (u1 - u0) * i / 24); g.lineTo(q.x, q.y); }
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  };
  ctx.tick(() => {
    stroke(wire, 0, reveal, 1.6, 0xd8d8e0, wireA);
    stroke(line, from, to, U * 0.03 * heat * scale, c.outer, 0.95);
    stroke(hot, from, to, U * 0.011 * heat * scale, c.core, 0.7);
  });

  // 1. Anticipation: chakra at the lips while the wire glints out to the target.
  ctx.sfx.charge(0.6); ctx.sfx.whoosh(0.3);
  const glint = ctx.add(spr(ctx, 'star4', 0xffffff, 'add', 0), 'front');
  await Promise.all([charge(ctx, mouth, c, 600, 1),
    ctx.tween(600, (e) => { reveal = e; wireA = 0.75 * Math.min(1, e * 3); const q = at(e); glint.position.set(q.x, q.y); setSize(glint, U * 0.12); glint.alpha = 1 - e * 0.3; glint.rotation = e * 4; }, ctx.ease.outCubic)]);
  glint.visible = false;

  // 2. Release: the fuse races along the wire.
  ctx.sfx.roar(2.4); ctx.flash(c.glow, 110, 0.18); ctx.zoomPunch(0.035, 220); ctx.shake(6 * scale, 1400);
  const head = makeBall(ctx, c); head.spin = 4; head.R = U * 0.055 * scale;
  const lip = ctx.add(spr(ctx, 'muzzle2', c.mid, 'normal', 0), 'front');
  lip.anchor.set(0.5, 0.85);
  ctx.tick(() => { const m = mouth(), q = at(0.04); lip.position.set(m.x, m.y); lip.rotation = Math.atan2(q.y - m.y, q.x - m.x) + Math.PI / 2; setSize(lip, U * 0.2 * ctx.rand(0.85, 1.15)); lip.alpha = 0.9 * heat * (from < 0.05 ? 1 : 0); });
  const tongues = sprinkle(ctx, () => 200 * heat * Math.max(0.15, to - from), () => {
    const q = at(ctx.rand(from, to));
    return tongue(ctx, q.x, q.y, U * ctx.rand(0.07, 0.12) * scale, [c.mid, c.outer, c.dark], { life: [250, 450] });
  });
  const embers = sprinkle(ctx, () => 50 * heat, () => {
    const q = at(ctx.rand(from, to));
    return { x: q.x, y: q.y, tex: 'spark', speed: [60, 200], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [400, 900], layer: 'front',
      size: [14, 2], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.5, gravity: -60 };
  });
  heat = 1;
  let prev = at(0);
  await ctx.tween(520, (e) => {
    to = e; const q = at(e), a = Math.atan2(q.y - prev.y, q.x - prev.x) || 0; prev = q;
    head.root.position.set(q.x, q.y); head.root.rotation = a; head.root.scale.set(1.5, 0.85); head.update(ctx.t);
  }, (x) => x * (0.6 + 0.4 * x));

  // impact: the target detonates
  const t = T();
  ctx.sfx.boom(1); ctx.shake(15 * scale, 600); ctx.zoomPunch(0.05, 300); ctx.flash(c.glow, 110, 0.22);
  shockwaves(ctx, { amplitude: 24, wavelength: 120, speed: 1000 }).ring(t.x, t.y);
  head.root.scale.set(1);
  blast(ctx, t.x, t.y, U * 0.12 * scale, c, 16);
  const boomSmoke = sprinkle(ctx, 14, () => ({ tex: any(SMOKES), blend: 'normal', x: t.x + ctx.rand(-1, 1) * U * 0.08, y: t.y - U * 0.05,
    speed: [30, 80], angle: [-2, -1.1], life: [1200, 1900], size: [U * 0.12, U * 0.3], color: [mix(c.outer, c.dark, 0.6), c.dark], alpha: [0.5, 0], accel: [0, -30] }));
  await ctx.tween(320, (e) => { head.R = U * (0.055 + 0.16 * e) * scale; head.update(ctx.t); }, ctx.ease.outCubic);
  ctx.tween(550, (e) => { head.R = U * (0.215 + 0.05 * e) * scale; head.heat = 1 - e; head.root.alpha = 1 - e; head.update(ctx.t); }, ctx.ease.inCubic)
    .then(() => { head.root.visible = false; });
  dissipate(ctx, t.x, t.y, U * 0.18 * scale, c, 0.9);
  await ctx.wait(500);
  boomSmoke.stop();

  // 3. Follow-through: the line burns out from the mouth toward the target, leaving smoke.
  ctx.sfx.crackle(1.4);
  const ash = sprinkle(ctx, 22, () => {
    const q = at(from + ctx.rand(0, 0.05));
    return { tex: any(SMOKES), blend: 'normal', x: q.x, y: q.y, speed: [15, 50], angle: [-2, -1.1], life: [900, 1500],
      size: [U * 0.04, U * 0.14], color: [ASH, c.dark], alpha: [0.45, 0], accel: [0, -25] };
  });
  await ctx.tween(800, (e) => { from = e; wireA = 0.75 * (1 - e); }, ctx.ease.inCubic);
  ash.stop(); tongues.stop(); embers.stop(); heat = 0;
  await ctx.wait(1000);
}

// ---------------------------------------------------------------------------------------------
/**
 * phoenixFlowers — a fan of small fireballs flicked from the mouth; each weaves on its own path and
 * blooms into a flower of flame where it lands. params: palette, scale, count (default 6, max 12)
 */
async function phoenixFlowers(ctx, p) {
  const c = ctx.palette(p.palette || 'fire'), scale = p.scale ?? 1, n = Math.max(1, Math.min(12, p.count ?? 6));
  const U = unit(ctx), mouth = () => ctx.anchor('mouth');
  ctx.sfx.charge(0.5);
  await charge(ctx, mouth, c, 500, 1.1);
  ctx.sfx.roar(1.6); ctx.flash(c.glow, 110, 0.18); ctx.zoomPunch(0.035, 250); ctx.shake(7 * scale, 600);
  blast(ctx, mouth().x, mouth().y, U * 0.05, c, 10);
  const sw = shockwaves(ctx, { amplitude: 10, wavelength: 60, speed: 700 });
  // targets spread over the frame, shuffled so neighbours do not launch together
  const order = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
  const all = [];
  for (let i = 0; i < n; i++) { all.push(flower(i, order[i])); await ctx.wait(85); }
  await Promise.all(all);
  ctx.sfx.crackle(1.2);
  await ctx.wait(1000);

  async function flower(i, slot) {
    const f = n === 1 ? 0.5 : slot / (n - 1);
    const out = -Math.PI + 0.3 + f * (Math.PI - 0.6);                    // launch fan over the head
    const tx = ctx.W * (0.08 + 0.84 * f) + ctx.rand(-20, 20);
    const ty = ctx.H * (Math.abs(f - 0.5) < 0.18 ? ctx.rand(0.7, 0.86) : ctx.rand(0.2, 0.82));
    const r1 = U * ctx.rand(0.065, 0.085) * scale, dur = ctx.rand(650, 950);
    const ball = makeBall(ctx, c); ball.spin = 4;
    let ang = out;
    const trail = sprinkle(ctx, 70, () => ({ tex: any(TONGUES), blend: 'normal', x: ball.root.x, y: ball.root.y, speed: [10, 40], angle: ang + Math.PI,
      rotation: ang - Math.PI / 2 + ctx.rand(-0.2, 0.2), life: [200, 340], size: [ball.R * 2.4, ball.R * 0.6], color: [c.mid, c.outer, c.dark], alpha: [0.9, 0] }));
    const sparkle = ctx.emitter({ x: () => ball.root.x, y: () => ball.root.y, rate: 16, tex: 'spark', speed: [20, 80], life: [300, 600], layer: 'front',
      size: [12, 2], color: [c.accent, c.outer], rotateToVelocity: true, gravity: 120 });
    ctx.sfx.whoosh(0.3);
    let px = mouth().x, py = mouth().y;
    await ctx.tween(dur, (e) => {
      const m = mouth(), cx = m.x + Math.cos(out) * U * 0.45, cy = m.y + Math.sin(out) * U * 0.45, v = 1 - e;
      const bx = v * v * m.x + 2 * v * e * cx + e * e * tx, by = v * v * m.y + 2 * v * e * cy + e * e * ty;
      if (Math.hypot(bx - px, by - py) > 0.5) ang = Math.atan2(by - py, bx - px);
      px = bx; py = by;
      ball.R = r1 * (0.5 + 0.5 * e); ball.root.position.set(bx, by); ball.update(ctx.t);
    }, ctx.ease.inOutCubic);
    trail.stop(); sparkle.stop();
    const x = px, y = py; ball.root.visible = false;
    // bloom: a flower of six flame petals around a hot heart
    ctx.sfx.boom(0.3); ctx.shake(4 * scale, 200); sw.ring(x, y);
    const rot = ctx.rand(0, TAU), petals = [];
    for (let k = 0; k < 6; k++) {
      const a = rot + (k / 6) * TAU, s = ctx.add(spr(ctx, TONGUES[k % 4], c.mid, 'normal', 1), 'front');
      s.anchor.set(0.5, 0.82); s.position.set(x, y); s.rotation = a + Math.PI / 2; petals.push(s);
    }
    const heart = ctx.add(spr(ctx, BLOBS[i % 2], mix(c.mid, c.core, 0.5), 'normal', 1), 'front'); heart.position.set(x, y);
    const flare = ctx.add(spr(ctx, 'star4', c.core, 'add', 0.9), 'front'); flare.position.set(x, y);
    ctx.burst({ x, y, count: 10, tex: 'spark', speed: [120, 320], life: [500, 1000], size: [14, 2], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.6, gravity: 150, layer: 'front' });
    ctx.burst({ x, y, count: 4, tex: any(SMOKES), blend: 'normal', radius: [0, r1], speed: [10, 50], angle: [-Math.PI, 0], life: [900, 1400],
      size: [r1 * 2.5, r1 * 5], color: [mix(c.outer, c.dark, 0.6), c.dark], alpha: [0.45, 0], accel: [0, -40] });
    await ctx.tween(560, (e, raw) => {
      const fade = raw < 0.45 ? 1 : 1 - (raw - 0.45) / 0.55;
      petals.forEach((s, k) => { setSize(s, r1 * (1.2 + 3.4 * e) * (k % 2 ? 0.85 : 1)); s.alpha = fade; s.tint = mix(c.mid, c.outer, raw); s.rotation += 0.01; });
      setSize(heart, r1 * (1.5 + 1.5 * e)); heart.alpha = fade; heart.tint = mix(mix(c.mid, c.core, 0.5), c.outer, raw);
      setSize(flare, r1 * (6 - 4 * raw)); flare.alpha = 0.9 * (1 - raw); flare.rotation = raw;
    }, ctx.ease.outBack);
    for (const s of [...petals, heart, flare]) s.destroy();
  }
}

// ---------------------------------------------------------------------------------------------
/**
 * ashBurn — a cloud of grey ash is exhaled from the mouth and spreads; a click of the teeth sparks it,
 * and the whole cloud ignites in a wave out from the mouth. params: palette (default 'fire'), scale
 */
async function ashBurn(ctx, p) {
  const { PIXI } = ctx;
  const c = ctx.palette(p.palette || 'fire'), scale = p.scale ?? 1;
  const U = unit(ctx), mouth = () => ctx.anchor('mouth');
  const box = ctx.add(new PIXI.Container());
  // fire + glow live in their own containers: as children of the grey smoke they would inherit its tint/alpha (mud)
  const fireBox = ctx.add(new PIXI.Container()), glowBox = ctx.add(new PIXI.Container());
  const puffs = [];
  let ignite = -1; // ignition wave radius (px), -1 = not yet

  // 1. Exhale: a wide plume of ash pours out and hangs in front of the user.
  ctx.sfx.wind(1.6); ctx.sfx.charge(1.4);
  const spawn = () => {
    const m = mouth(), a = ctx.rand(-0.15, Math.PI + 0.15);               // sideways / downward fan
    const sp = U * ctx.rand(0.5, 1.2) * scale;
    const base = mix(ASH, c.dark, ctx.rand(0, 0.35));
    const s = box.addChild(spr(ctx, any(SMOKES), base, 'normal', 0));
    const fire = fireBox.addChild(spr(ctx, any(BLOBS), c.mid, 'normal', 0));
    const glow = glowBox.addChild(spr(ctx, 'soft', c.glow, 'add', 0));
    puffs.push({ s, fire, glow, base, x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, size: U * 0.08, grow: U * ctx.rand(0.22, 0.4) * scale,
      rot: ctx.rand(-0.6, 0.6), burn: -1, ox: m.x, oy: m.y });
  };
  ctx.tick((dt) => {
    const k = dt / 1000;
    for (const q of puffs) {
      q.vx *= 1 - 1.6 * k; q.vy = q.vy * (1 - 1.6 * k) - 12 * k;
      q.x += q.vx * k; q.y += q.vy * k; q.size += q.grow * k * (q.burn >= 0 ? 1.6 : 1);
      q.s.position.set(q.x, q.y); q.s.rotation += q.rot * k; setSize(q.s, q.size);
      q.fire.position.set(q.x, q.y); setSize(q.fire, q.size * 0.6);
      q.glow.position.set(q.x, q.y); setSize(q.glow, q.size * 1.3);
      if (q.burn < 0) {
        q.s.alpha = Math.min(0.85, q.s.alpha + 2.5 * k);
        if (ignite >= 0 && Math.hypot(q.x - q.ox, q.y - q.oy) <= ignite) q.burn = 0;
      } else {
        q.burn += dt;
        const b = clamp01(q.burn / 200), f = clamp01(1 - (q.burn - 200) / 700);
        q.fire.alpha = 0.75 * b * f; q.fire.tint = mix(c.mid, c.outer, 1 - f * 0.7); q.fire.rotation -= 2 * k;
        q.glow.alpha = 0.1 * b * f; // 46 overlapping puffs: keep low or the screen whites out
        q.s.tint = mix(q.base, c.dark, clamp01(q.burn / 500));
        if (q.burn > 500) q.s.alpha = Math.max(0, q.s.alpha - 1.1 * k);
      }
    }
  });
  await ctx.tween(1500, (e, raw) => { const want = Math.floor(raw * 46); while (puffs.length < want) spawn(); });
  await ctx.wait(250);

  // 2. Anticipation: a click of the teeth, a single spark at the lips.
  ctx.sfx.crack();
  const m = mouth();
  ctx.burst({ x: m.x, y: m.y, count: 10, tex: 'spark', speed: [150, 350], life: [150, 300], size: [18, 2], color: [c.core, c.accent], rotateToVelocity: true, stretch: 0.5, layer: 'front' });
  ctx.burst({ x: m.x, y: m.y, count: 1, tex: 'flare1', speed: 0, life: 250, size: [U * 0.4, U * 0.1], color: c.accent, alpha: [1, 0], layer: 'front' });
  await ctx.wait(280);

  // 3. Release: the ash ignites in a rolling wave out from the mouth.
  ctx.sfx.boom(1.2); ctx.sfx.roar(2.2);
  ctx.flash(c.glow, 130, 0.22); ctx.zoomPunch(0.06, 350); ctx.shake(18 * scale, 1400);
  shockwaves(ctx, { amplitude: 30, wavelength: 160, speed: 1000 }).ring(m.x, m.y);
  const warm = ctx.tint(c.outer, 0, 'normal');
  const flames = sprinkle(ctx, 170, () => {
    const burning = puffs.filter((q) => q.burn >= 0 && q.burn < 700);
    if (!burning.length) return { count: 0 }; // no flames floating in clear air once the cloud has burnt out
    const q = any(burning);
    return tongue(ctx, q.x + ctx.rand(-0.3, 0.3) * q.size, q.y + ctx.rand(-0.2, 0.2) * q.size, U * ctx.rand(0.2, 0.36) * scale, [mix(c.mid, c.core, 0.3), c.mid, c.outer, c.dark], { life: [350, 600], layer: 'front' });
  });
  const max = Math.max(ctx.W, ctx.H) * 1.1;
  await ctx.tween(800, (e) => { ignite = e * max; warm.set(0.16 * e); }, ctx.ease.outCubic);
  ctx.sfx.crackle(1.8);
  await ctx.wait(600);
  flames.stop();

  // 4. Follow-through: char smoke and floating embers.
  ctx.burst({ x: ctx.W / 2, y: ctx.H * 0.55, count: 50, tex: 'spark', radius: [0, U * 0.6], speed: [30, 160], angle: [-Math.PI, 0], layer: 'front',
    life: [900, 1800], size: [14, 3], color: [c.accent, c.outer], rotateToVelocity: true, gravity: -40 });
  await ctx.tween(900, (e) => warm.set(0.16 * (1 - e)));
  await ctx.wait(500);
}

// ---------------------------------------------------------------------------------------------
/**
 * blackFlames — inextinguishable dark flames summoned by a glance.
 * params: palette (default 'blackfire'), scale, variant: 'burst' (the gaze locks on a spot ahead and it bursts into
 * a clinging black blaze) | 'shield' (jagged spikes of black fire erupt in a ring around you)
 */
async function blackFlames(ctx, p) {
  const c = ctx.palette(p.palette || 'blackfire'), scale = p.scale ?? 1, shield = p.variant === 'shield';
  const U = unit(ctx), face = () => ctx.anchor('face');
  const eye = () => { const f = face(); return { x: f.x - U * 0.07, y: f.y - U * 0.02 }; };
  const rimC = [mix(c.glow, c.accent, 0.35), c.glow, c.dark], blackC = [c.mid, c.outer, c.outer];

  const cutP = shield ? ctx.personReady() : null; // the shield puts its back half behind the person cutout
  // 1. Anticipation: the world darkens, a red glint flares in one eye.
  ctx.sfx.ominous(3);
  const dark = ctx.tint(0x000000, 0, 'normal');
  const red = ctx.tint(c.accent, 0, 'multiply');
  const glint = ctx.add(spr(ctx, 'flare1', c.accent, 'add', 0), 'front');
  const pupil = ctx.add(spr(ctx, 'soft', c.accent, 'add', 0), 'front');
  const ringS = ctx.add(spr(ctx, 'circle3', c.accent, 'add', 0), 'front');
  ctx.tick(() => { const e = eye(); glint.position.set(e.x, e.y); pupil.position.set(e.x, e.y); });
  await ctx.tween(700, (e) => {
    dark.set(0.24 * e); red.set(0.1 * e);
    const q = eye(); ringS.position.set(q.x, q.y);
    setSize(pupil, U * 0.06); pupil.alpha = e;
    setSize(ringS, U * (0.5 - 0.44 * e)); ringS.alpha = 0.8 * e;
    setSize(glint, U * 0.5 * e); glint.alpha = e; glint.rotation = 0.3;
  }, ctx.ease.inCubic);
  ctx.sfx.zap(); ctx.zoomPunch(0.05, 250);
  ctx.tween(500, (e) => { glint.alpha = 1 - e * 0.7; setSize(glint, U * (0.5 + 0.4 * e)); });

  const ems = [];
  let pow = 1;
  /** black tongue with a purple rim (rim drawn on the fx layer, black on front, so the rim stays behind) */
  const darkFire = (rate, where, size, o = {}) => {
    const spiky = () => any(['muzzle1', 'muzzle3', 'muzzle4', 'muzzle5']);
    ems.push(sprinkle(ctx, () => rate * pow, () => { const q = where(); return tongue(ctx, q.x, q.y, size() * 1.4, rimC, { alpha: [0.9, 0], ...o, blend: 'add', lean: q.lean, tex: spiky() }); }));
    ems.push(sprinkle(ctx, () => rate * 1.3 * pow, () => { const q = where(); return tongue(ctx, q.x, q.y, size(), blackC, { layer: 'front', ...o, lean: q.lean, tex: spiky() }); }));
  };
  const rgb = ctx.filter(new ctx.filters.RGBSplitFilter({ red: { x: -6, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 6, y: 0 } }));
  const splitOff = () => ctx.tween(400, (e) => { const k = 6 * (1 - e); rgb.red = { x: -k, y: 0 }; rgb.blue = { x: k, y: 0 }; }).then(() => ctx.removeFilter(rgb));

  if (!shield) {
    // 2a. The gaze locks onto a spot ahead (ring snaps shut there), then it bursts into black fire.
    const spot = () => { const f = face(); return { x: Math.min(ctx.W * 0.8, f.x + ctx.W * 0.28), y: Math.min(ctx.H * 0.7, f.y + U * 0.32) }; };
    ringS.alpha = 0;
    await ctx.tween(300, (e) => { const s = spot(); ringS.position.set(s.x, s.y); setSize(ringS, U * (0.6 - 0.5 * e)); ringS.alpha = 0.9 * e; }, ctx.ease.inCubic);
    ringS.alpha = 0;
    splitOff();
    ctx.sfx.roar(2.5); ctx.sfx.sizzle(2.5); ctx.sfx.boom(0.6); ctx.shake(10 * scale, 700);
    const s0 = spot();
    shockwaves(ctx, { amplitude: 18, wavelength: 100, speed: 800 }).ring(s0.x, s0.y);
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * (0.1 + 0.8 * i / 11);
      ctx.burst({ count: 1, tex: any(TONGUES), blend: 'normal', x: s0.x, y: s0.y, speed: [U * 0.5, U * 0.9], angle: a, rotation: a + Math.PI / 2,
        life: [350, 550], drag: 3, size: [U * 0.16, U * 0.08], color: blackC, alpha: [0.95, 0], layer: 'front' });
    }
    ctx.burst({ x: s0.x, y: s0.y, count: 24, tex: 'spark', speed: [150, 450], life: [300, 800], size: [16, 2], color: [c.accent, c.glow], rotateToVelocity: true, stretch: 0.5, layer: 'front' });
    let spreadR = 0;
    const aura = ctx.add(spr(ctx, 'soft', mix(c.glow, c.accent, 0.25), 'add', 0));
    ctx.tick(() => { const s = spot(); aura.position.set(s.x, s.y - U * 0.12); setSize(aura, U * 0.5 + spreadR * 3); });
    // a writhing black mass clinging to the spot
    const mass = [];
    for (let i = 0; i < 9; i++) {
      const s = ctx.add(spr(ctx, BLOBS[i % 2], i < 4 ? c.glow : c.outer, 'normal', 0), i < 4 ? 'fx' : 'front');
      mass.push({ s, u: ctx.rand(-1, 1), k: i < 4 ? 1.25 : 1, ph: ctx.rand(0, TAU) });
    }
    ctx.tick((dt, t) => {
      const s = spot();
      for (const q of mass) {
        q.s.position.set(s.x + q.u * spreadR * 0.8, s.y + U * 0.02 + Math.sin(t * 0.004 + q.ph) * U * 0.01);
        setSize(q.s, (U * 0.12 + spreadR * 0.35) * q.k * scale * (1 + 0.08 * Math.sin(t * 0.006 + q.ph)));
        q.s.rotation = q.ph + t * 0.0012 * (q.u > 0 ? 1 : -1); q.s.alpha = 0.92 * pow; aura.alpha = 0.75 * pow;
      }
    });
    const where = () => { const s = spot(), u = ctx.rand(-1, 1); return { x: s.x + u * spreadR, y: s.y - ctx.rand(0, 0.08) * U * (1 - Math.abs(u)), lean: u * 0.25 }; };
    darkFire(60, where, () => U * ctx.rand(0.3, 0.5) * scale, { life: [600, 950], accel: [0, -260], speed: [60, 140] });
    ems.push(sprinkle(ctx, () => 10 * pow, () => { const q = where(); return { tex: any(SMOKES), blend: 'normal', x: q.x, y: q.y - U * 0.15, speed: [30, 70], angle: [-1.8, -1.3],
      life: [1200, 1800], size: [U * 0.15, U * 0.4], color: [c.core, 0x000000], alpha: [0.55, 0], accel: [0, -50] }; }));
    ems.push(sprinkle(ctx, () => 25 * pow, () => { const q = where(); return { tex: 'spark', x: q.x, y: q.y, speed: [60, 200], angle: [-2.5, -0.6], layer: 'front',
      life: [500, 1100], size: [14, 2], color: [c.accent, c.glow], rotateToVelocity: true, gravity: -100 }; }));
    await ctx.tween(600, (e) => { spreadR = U * 0.3 * e * scale; }, ctx.ease.outBack);
    await ctx.tween(1700, (e) => { spreadR = U * (0.3 + 0.08 * e) * scale; });
    // 3a. Follow-through: the blaze ebbs but clings on; the darkness lifts.
    ctx.sfx.crackle(1.5);
    await ctx.tween(900, (e) => { pow = 1 - e * 0.8; glint.alpha = 0.3 * (1 - e); pupil.alpha = 1 - e; });
    for (const em of ems) em.stop();
    await ctx.tween(800, (e) => { pow = 0.2 * (1 - e); aura.alpha = 0.75 * pow; dark.set(0.24 * (1 - e)); red.set(0.1 * (1 - e)); });
    await ctx.wait(300);
    return;
  }

  // 2b. Shield: jagged spikes of black fire erupt in a ring around the user, front-centre first.
  ringS.alpha = 0;
  splitOff();
  const body = () => { const f = face(); return { x: f.x, y: Math.min(ctx.H * 0.97, f.y + U * 0.78), rx: U * 0.6 * scale, ry: U * 0.13 * scale }; };
  const N = 15, spikes = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU + 0.21, front = Math.sin(th) > 0;
    const h = U * (front ? ctx.rand(0.28, 0.44) : ctx.rand(0.6, 0.9)) * scale, w = U * ctx.rand(0.1, 0.15) * scale;
    const g = ctx.g();
    const pts = [-w / 2, 0];
    const steps = 5, tipX = ctx.rand(-0.15, 0.15) * w;
    for (let k = 1; k <= steps; k++) { const t = k / (steps + 1); pts.push(-w / 2 * (1 - t) + tipX * t + (k % 2 ? -1 : 0.3) * w * 0.22 * (1 - t), -h * t); }
    pts.push(tipX, -h);
    for (let k = steps; k >= 1; k--) { const t = k / (steps + 1); pts.push(w / 2 * (1 - t) + tipX * t + (k % 2 ? 1 : -0.3) * w * 0.22 * (1 - t), -h * t); }
    pts.push(w / 2, 0);
    g.poly(pts).stroke({ width: 16, color: mix(c.glow, c.accent, 0.3), alpha: 0.3, join: 'round' });
    g.poly(pts).fill({ color: c.outer, alpha: 0.96 }).stroke({ width: 3, color: c.glow, alpha: 0.95, join: 'round' });
    g.scale.set(1, 0);
    spikes.push({ g, th, front, d: Math.abs(Math.cos(th)) * (front ? 1 : 1.4), ph: ctx.rand(0, TAU), up: 0 });
  }
  // depth: back spikes + back flames on 'clones', then the person cutout on 'fx', front spikes on 'front'.
  // Without a cutout, drop the back spikes that would stand right in front of the face.
  const cut = await cutP;
  if (cut) { const me = ctx.personSprite(); if (me) ctx.add(me, 'fx'); }
  for (let i = spikes.length - 1; i >= 0; i--) if (!cut && !spikes[i].front && Math.abs(Math.cos(spikes[i].th)) < 0.45) { spikes[i].g.destroy(); spikes.splice(i, 1); }
  spikes.sort((a, b) => Math.sin(a.th) - Math.sin(b.th)).forEach((s) => ctx.add(s.g, s.front ? 'front' : 'clones'));
  ctx.tick((dt, t) => {
    const b = body();
    for (const s of spikes) {
      s.g.position.set(b.x + Math.cos(s.th) * b.rx, b.y + Math.sin(s.th) * b.ry);
      s.g.rotation = Math.cos(s.th) * 0.3;
      s.g.skew.x = 0.07 * Math.sin(t * 0.007 + s.ph);
      s.g.scale.set(1, s.up * (1 + 0.05 * Math.sin(t * 0.011 + s.ph)));
    }
  });
  const ring = (front) => () => { const b = body(), th = front ? ctx.rand(0, Math.PI) : ctx.rand(Math.PI, TAU); return { x: b.x + Math.cos(th) * b.rx, y: b.y + Math.sin(th) * b.ry, lean: Math.cos(th) * 0.3 }; };
  ctx.sfx.roar(2.6); ctx.sfx.sizzle(2.6); ctx.sfx.boom(0.9); ctx.shake(12 * scale, 900);
  const b0 = body();
  shockwaves(ctx, { amplitude: 22, wavelength: 120, speed: 900 }).ring(b0.x, b0.y);
  darkFire(55, ring(true), () => U * ctx.rand(0.14, 0.24) * scale, { life: [450, 750], accel: [0, -420] });
  darkFire(30, ring(false), () => U * ctx.rand(0.16, 0.26) * scale, { life: [450, 750], accel: [0, -420], layer: 'clones' });
  ems.push(sprinkle(ctx, () => 12 * pow, () => { const q = ring(Math.random() < 0.5)(); return { tex: any(SMOKES), blend: 'normal', x: q.x, y: q.y - U * 0.25, speed: [30, 80], angle: [-1.8, -1.3],
    life: [1100, 1700], size: [U * 0.15, U * 0.4], color: [c.core, 0x000000], alpha: [0.5, 0], accel: [0, -50] }; }));
  ems.push(sprinkle(ctx, () => 30 * pow, () => { const q = ring(true)(); return { tex: 'spark', x: q.x, y: q.y, speed: [100, 260], angle: [-2.2, -0.9], layer: 'front',
    life: [400, 900], size: [14, 2], color: [c.accent, c.glow], rotateToVelocity: true, gravity: -120 }; }));
  await ctx.tween(700, (e) => { for (const s of spikes) s.up = ctx.ease.outBack(clamp01((e - s.d * 0.4) / 0.45)); });
  ctx.shake(5 * scale, 1800);
  await ctx.wait(1700);
  // 3b. Follow-through: the spikes sink back into smoke; the darkness lifts.
  ctx.sfx.crackle(1.5);
  await ctx.tween(800, (e) => { pow = 1 - e * 0.8; for (const s of spikes) s.up = 1 - ctx.ease.inCubic(clamp01((e - (1 - s.d) * 0.3) / 0.7)); glint.alpha = 0.3 * (1 - e); pupil.alpha = 1 - e; });
  for (const s of spikes) { const q = s.g.position; ctx.burst({ x: q.x, y: q.y - U * 0.05, count: 1, tex: any(SMOKES), blend: 'normal', speed: [20, 50], angle: [-1.9, -1.2],
    life: [900, 1400], size: [U * 0.12, U * 0.3], color: [c.core, 0x000000], alpha: [0.55, 0], accel: [0, -40] }); }
  for (const em of ems) em.stop();
  await ctx.tween(800, (e) => { dark.set(0.24 * (1 - e)); red.set(0.1 * (1 - e)); });
  await ctx.wait(300);
}

export const EFFECTS = { fireball, flameStream, phoenixFlowers, ashBurn, blackFlames };
