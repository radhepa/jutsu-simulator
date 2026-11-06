// Mystic archetypes: dragon, sealing, genjutsu.
// dragon   — segmented serpent (sprite chain following an arc-length spline) with a procedural head.
// sealing  — Eight Trigrams style spiral seal stamped onto the body, kanji ring + paper tags.
// genjutsu — crows / petals (tree binding) / tsukuyomi (red sky, black moon, inverted world).

const TAU = Math.PI * 2;
const FLAMES = ['flame1', 'flame2', 'flame3', 'flame4', 'fire1', 'fire2'];
const SMOKES = ['smoke1', 'smoke3', 'smoke4', 'smoke6', 'smoke7'];
const mix = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
};
const unit = (ctx) => Math.min(ctx.W, ctx.H);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
// stage tint().fade() restarts from the creation alpha (0 for our dims), so fade from the current one.
const fadeTint = (ctx, t, ms) => { const a = t.g.alpha; return ctx.tween(ms, (e) => t.set(a * (1 - e))); };

function spr(ctx, tex, tint = 0xffffff, blend = 'normal', alpha = 1) {
  const s = new ctx.PIXI.Sprite(ctx.tex(tex));
  s.anchor.set(0.5); s.tint = tint; s.blendMode = blend; s.alpha = alpha;
  return s;
}
const setSize = (s, d) => s.scale.set(d / (s.texture.width || 1));

// Radial vignette texture (white edges), shared across casts.
let VIG = null;
function vignette(ctx, color, layer = 'overlay') {
  if (!VIG) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), r = g.createRadialGradient(128, 128, 50, 128, 128, 182);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    VIG = ctx.PIXI.Texture.from(cv);
  }
  const s = new ctx.PIXI.Sprite(VIG);
  s.width = ctx.W; s.height = ctx.H; s.tint = color; s.alpha = 0;
  return ctx.add(s, layer);
}

/** Anticipation: chakra motes spiral into at() while a glow swells there. */
async function charge(ctx, at, c, ms = 550, k = 1) {
  const U = unit(ctx) * k, box = ctx.add(new ctx.PIXI.Container());
  const glow = box.addChild(spr(ctx, 'soft', c.glow, 'add', 0));
  const hot = box.addChild(spr(ctx, 'flare1', c.core, 'add', 0));
  const motes = Array.from({ length: Math.round(20 * k) }, () => ({
    s: box.addChild(spr(ctx, 'spark', ctx.pick([c.accent, c.glow, c.core]), 'add', 0)),
    a: ctx.rand(0, TAU), r: ctx.rand(0.25, 0.5) * U, d: ctx.rand(0, 0.45), w: ctx.rand(2, 4),
  }));
  const t0 = ctx.t;
  let live = true;
  ctx.tick((dt, t) => {
    if (!live) return false;
    const p = at();
    for (const m of motes) {
      const q = clamp(((t - t0) / ms - m.d) / 0.55, 0, 1), r = m.r * (1 - q * q), a = m.a + q * m.w;
      m.s.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      m.s.rotation = a + Math.PI / 2; m.s.alpha = q > 0 && q < 1 ? 0.9 : 0;
      m.s.scale.set(0.25 + 0.2 * q, 0.12);
    }
    glow.position.set(p.x, p.y); hot.position.set(p.x, p.y);
  });
  await ctx.tween(ms, (e) => {
    setSize(glow, U * (0.15 + 0.35 * e)); glow.alpha = 0.6 * e;
    setSize(hot, U * (0.2 + 0.5 * e)); hot.alpha = e; hot.rotation = e * 2;
  }, ctx.ease.inCubic);
  live = false; box.destroy({ children: true });
}

/** One reusable scene shockwave: ring(x, y) fires it. */
function shockwaves(ctx, opts = {}) {
  const f = ctx.filter(new ctx.filters.ShockwaveFilter({ amplitude: 0, wavelength: 110, speed: 850, brightness: 1.1, radius: -1, ...opts }));
  let t0 = -1e9;
  ctx.tick((dt, t) => {
    const s = (t - t0) / 1000; f.time = s;
    f.amplitude = s < 0.7 ? (opts.amplitude ?? 24) * (1 - s / 0.7) : 0;
  });
  return { f, ring(x, y) { f.center = { x, y }; t0 = ctx.t; } };
}

// ---------- spline path (Catmull-Rom, arc-length parameterized) ----------
function catmull(P, u) {
  const n = P.length - 1, f = clamp(u * n, 0, n - 1e-6), i = Math.floor(f), t = f - i;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)];
  const cr = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
  return { x: cr('x'), y: cr('y'), z: cr('z') };
}
function arcPath(P, M = 300) {
  const pts = [], cum = [0];
  for (let k = 0; k <= M; k++) pts.push(catmull(P, k / M));
  for (let k = 1; k <= M; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const L = cum[M];
  function at(s) {
    s = clamp(s, 0, L);
    let lo = 0, hi = M;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const f = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1), a = pts[lo], b = pts[hi];
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) };
  }
  return { L, at };
}

// =============================================================================================
// DRAGON
// =============================================================================================

/** Procedural dragon head, drawn facing +x at ~100 px long. Returns {root, jaw, glow, flames}. */
function makeHead(ctx, v, c) {
  const { PIXI } = ctx;
  const root = new PIXI.Container();
  const skin = { fire: c.outer, water: c.mid, earth: c.mid, wood: c.mid, lightning: c.mid }[v] ?? c.mid;
  const top = { fire: c.mid, water: c.core, earth: c.core, wood: mix(c.mid, c.core, 0.35), lightning: c.core }[v] ?? c.core;
  const line = { fire: c.dark, water: c.outer, earth: c.dark, wood: c.dark, lightning: c.outer }[v] ?? c.dark;
  const eye = { fire: c.core, water: c.core, earth: c.glow, wood: c.glow, lightning: c.core }[v] ?? c.core;
  const horn = { fire: c.mid, water: c.outer, earth: c.outer, wood: c.outer, lightning: c.outer }[v] ?? c.outer;
  const tooth = v === 'earth' ? c.accent : v === 'wood' ? c.core : 0xffffff;
  const S = { width: 3.2, color: line, join: 'round' };

  const glow = root.addChild(spr(ctx, 'soft', c.glow, 'add', v === 'earth' || v === 'wood' ? 0.25 : 0.55));
  setSize(glow, 230); glow.x = 10;

  // horns / antlers + mane behind the skull
  const back = root.addChild(new PIXI.Graphics());
  if (v === 'wood') {
    back.moveTo(-20, -24).lineTo(-60, -58).lineTo(-92, -64).moveTo(-60, -58).lineTo(-70, -84)
      .moveTo(-8, -26).lineTo(-30, -62).lineTo(-26, -86).moveTo(-30, -62).lineTo(-52, -76)
      .stroke({ width: 9, color: horn, cap: 'round', join: 'round' });
    back.moveTo(-20, -24).lineTo(-60, -58).lineTo(-92, -64).moveTo(-8, -26).lineTo(-30, -62).lineTo(-26, -86)
      .stroke({ width: 3, color: top, alpha: 0.5, cap: 'round' });
  } else {
    back.poly([-25, -22, -55, -44, -98, -52, -62, -32, -38, -14]).fill(horn).stroke(S);
    back.poly([-12, -26, -36, -54, -66, -70, -48, -42, -28, -20]).fill(mix(horn, top, 0.3)).stroke(S);
  }
  for (let k = 0; k < 4; k++) {                                   // mane spikes trailing back
    const y = -12 + k * 9, len = v === 'earth' ? 34 : 52 - k * 6;
    back.poly([-40, y - 6, -40 - len, y + 2 + k * 3, -42, y + 6]).fill(k % 2 ? skin : mix(skin, c.dark, 0.25)).stroke({ ...S, width: 2.4 });
  }

  // lower jaw (hinged)
  const jaw = root.addChild(new PIXI.Graphics());
  jaw.position.set(-28, 6);
  jaw.poly([0, -4, 36, -2, 74, -2, 84, 2, 66, 12, 26, 18, -6, 10]).fill(mix(skin, c.dark, 0.2)).stroke(S);
  for (let x = 22; x < 76; x += 10) jaw.poly([x, -2, x + 4, -12, x + 8, -2]).fill(tooth).stroke({ width: 1.2, color: line });
  if (v === 'fire' || v === 'water') jaw.poly([10, 14, 0, 38, 26, 18]).fill(skin).stroke({ ...S, width: 2.4 });   // beard

  // skull
  const skull = root.addChild(new PIXI.Graphics());
  const SK = v === 'earth'
    ? [-46, -4, -40, -22, -14, -32, 12, -28, 30, -22, 50, -18, 66, -10, 70, 2, 40, 4, 10, 8, -30, 12, -46, 8]
    : [-45, -6, -38, -22, -15, -30, 10, -26, 30, -20, 52, -14, 64, -8, 68, 0, 40, 2, 10, 6, -30, 10, -45, 6];
  skull.poly(SK).fill(skin).stroke(S);
  skull.poly([-36, -18, -14, -28, 10, -24, 30, -18, 50, -12, 30, -14, 8, -18, -16, -20]).fill({ color: top, alpha: 0.55 });   // highlight
  for (let x = 18; x < 64; x += 9) skull.poly([x, 2, x + 4, 12, x + 8, 2]).fill(tooth).stroke({ width: 1.2, color: line }); // upper fangs
  skull.poly([-2, -22, 24, -32, 36, -20, 12, -16]).fill(mix(skin, c.dark, 0.35)).stroke({ ...S, width: 2.4 });            // brow ridge
  skull.circle(58, -9, 2.6).fill(c.dark);                                                                                   // nostril
  if (v === 'earth') skull.moveTo(-30, -10).lineTo(-12, -4).lineTo(-4, -16).moveTo(30, -12).lineTo(42, -4).lineTo(52, -12).stroke({ width: 2, color: c.dark });
  if (v === 'wood') {
    for (let k = 0; k < 3; k++) skull.moveTo(-40, -8 + k * 6).quadraticCurveTo(0, -14 + k * 8, 44, -6 + k * 4).stroke({ width: 1.8, color: c.dark, alpha: 0.7 });
  }
  if (v === 'fire' || v === 'water' || v === 'lightning') {      // whiskers
    skull.moveTo(60, -6).bezierCurveTo(52, -40, 10, -50, -50, -40).moveTo(56, 2).bezierCurveTo(40, 34, 0, 40, -60, 26)
      .stroke({ width: 3, color: top, alpha: 0.9, cap: 'round' });
  }
  // eye: glowing slit
  const eyeG = root.addChild(new PIXI.Graphics());
  eyeG.ellipse(18, -15, 7, 3.6).fill(eye).ellipse(19, -15, 1.6, 3.2).fill(c.dark);
  const eyeGlow = root.addChild(spr(ctx, 'soft', eye, 'add', 0.9)); setSize(eyeGlow, 34); eyeGlow.position.set(18, -15);

  // living flames on a fire dragon's mane; leaves on a wood dragon's antlers
  const flames = [];
  if (v === 'fire') {
    for (let k = 0; k < 6; k++) {
      const f = root.addChildAt(spr(ctx, FLAMES[k % FLAMES.length], k % 2 ? c.mid : c.outer, 'normal', 0.9), 1);
      flames.push({ s: f, x: -40 - k * 9, y: -30 + k * 10, ph: ctx.rand(0, TAU) });
    }
  }
  if (v === 'wood' && ctx.has('leaf')) {
    for (const [x, y, r] of [[-92, -64, -2], [-70, -84, -1.4], [-26, -86, -0.6], [-52, -76, -1]]) {
      const l = root.addChildAt(spr(ctx, 'leaf', c.accent), 1); setSize(l, 22); l.position.set(x, y); l.rotation = r;
    }
  }
  return { root, jaw, glow, flames };
}

/** One body segment for the variant. Returns {root, update(r, ang, t)}. */
function makeSegment(ctx, v, c, i, N, woodCtx) {
  const { PIXI } = ctx;
  const root = new PIXI.Container();
  const ph = ctx.rand(0, TAU), side = i % 2;
  let parts;
  switch (v) {
    case 'fire': {
      const body = root.addChild(spr(ctx, 'soft', c.outer, 'normal', 0.95));
      const a = root.addChild(spr(ctx, FLAMES[i % 4], c.mid, 'add', 0.9));
      const b = root.addChild(spr(ctx, FLAMES[(i + 2) % 4], c.outer, 'add', 0.8));
      const core = root.addChild(spr(ctx, 'soft', c.core, 'add', 0.6));
      parts = (r, ang, t) => {
        const fl = 1 + 0.18 * Math.sin(t * 0.02 + ph);
        setSize(body, r * 2.7);
        setSize(a, r * 3.2 * fl); a.rotation = ang - Math.PI / 2;
        setSize(b, r * 2.4 / fl); b.rotation = ang - Math.PI / 2 + Math.sin(t * 0.01 + ph) * 0.4;
        setSize(core, r * 1.3);
      };
      break;
    }
    case 'water': {
      const a = root.addChild(spr(ctx, 'soft', c.outer, 'normal', 0.95));
      const b = root.addChild(spr(ctx, 'soft', c.mid, 'normal', 0.9));
      const tw = root.addChild(spr(ctx, side ? 'twirl1' : 'twirl2', c.core, 'add', 0.6));
      parts = (r, ang, t) => {
        setSize(a, r * 3.2); setSize(b, r * 2.3); b.y = -r * 0.25;
        setSize(tw, r * 2.2); tw.rotation = t * 0.006 * (side ? 1 : -1) + ph;
      };
      break;
    }
    case 'earth': {
      const d = root.addChild(spr(ctx, 'dirt2', c.mid, 'normal', 0.9));
      const rock = root.addChild(spr(ctx, 'rock', mix(c.core, c.mid, 0.35), 'normal', 1));
      const rr = ctx.rand(0, TAU);
      parts = (r, ang) => { setSize(d, r * 3.2); setSize(rock, r * 2.5); rock.rotation = rr + ang * 0.3; d.rotation = rr; };
      break;
    }
    case 'wood': {
      const g = root.addChild(new PIXI.Graphics(woodCtx));
      let leaf = null;
      if (i % 4 === 1 && ctx.has('branch')) { leaf = root.addChild(spr(ctx, 'branch', 0xffffff)); leaf.anchor.set(0.05, 0.95); }
      parts = (r, ang, t, topSign) => {
        g.scale.set(r * 2.4 / 100); g.rotation = ang;
        if (leaf) { setSize(leaf, r * 2.2); leaf.rotation = ang - topSign * 0.9 - 0.7; leaf.position.set(0, 0); }
      };
      break;
    }
    default: { // lightning
      const a = root.addChild(spr(ctx, 'soft', c.outer, 'add', 0.8));
      const b = root.addChild(spr(ctx, ctx.pick(['trace1', 'trace3', 'trace5']), c.core, 'add', 1));
      parts = (r, ang, t) => { setSize(a, r * 3); setSize(b, r * 3); b.rotation = ang + Math.PI / 2 + Math.sin(t * 0.05 + ph) * 0.6; };
    }
  }
  // dorsal spine on every other segment (not rock dragons)
  let spine = null;
  if (side === 0 && v !== 'earth') spine = root.addChildAt(spr(ctx, 'shard', v === 'wood' ? c.outer : mix(c.outer, c.dark, 0.3), 'normal', 0.95), 0);
  return {
    root,
    update(r, ang, t, topSign) {
      parts(r, ang, t, topSign);
      if (spine) {
        const nx = -Math.sin(ang) * -topSign, ny = Math.cos(ang) * -topSign;
        spine.position.set(nx * r * 0.95, ny * r * 0.95); spine.rotation = Math.atan2(ny, nx) + Math.PI / 2;
        spine.scale.set(r * 0.7 / 64, r * 1.3 / 64);
      }
    },
  };
}

function woodContext(ctx, c) {
  const g = new ctx.PIXI.GraphicsContext();
  g.roundRect(-52, -42, 104, 84, 34).fill(c.mid).stroke({ width: 5, color: c.dark });
  g.moveTo(-46, -26).quadraticCurveTo(0, -34, 46, -24).moveTo(-48, 2).quadraticCurveTo(-4, -6, 48, 4).moveTo(-44, 24).quadraticCurveTo(4, 30, 44, 22)
    .stroke({ width: 4, color: c.dark, alpha: 0.65 });
  g.moveTo(-40, -32).quadraticCurveTo(0, -40, 40, -32).stroke({ width: 6, color: mix(c.mid, c.core, 0.45), alpha: 0.6 });
  g.ellipse(14, 10, 8, 5).stroke({ width: 3, color: c.dark, alpha: 0.7 });
  return g;
}

// Per-variant flight paths. Returns {origin, pts, mode, N, gap}.
function dragonPlan(ctx, v) {
  const W = ctx.W, H = ctx.H, U = unit(ctx);
  const P = (x, y, z = 1) => ({ x, y, z });
  const hands = ctx.anchor('hands'), mouth = ctx.anchor('mouth');
  switch (v) {
    case 'fire': return {
      mode: 'lunge', N: 30, gap: U * 0.04, originName: 'mouth',
      pts: [P(mouth.x, mouth.y, 0.5), P(mouth.x + 0.1 * W, mouth.y - 0.16 * H, 0.8), P(0.8 * W, 0.14 * H, 1), P(0.9 * W, 0.48 * H, 1.05),
        P(0.66 * W, 0.74 * H, 1.15), P(0.28 * W, 0.68 * H, 1.1), P(0.12 * W, 0.36 * H, 1.05), P(0.3 * W, 0.14 * H, 1.15), P(0.5 * W, 0.36 * H, 2), P(0.5 * W, 0.5 * H, 5)],
    };
    case 'water': {
      const x = hands.x;
      return {
        mode: 'lunge', N: 32, gap: U * 0.042, originName: 'ground',
        pts: [P(x, H + 80, 0.9), P(x + 0.1 * W, 0.78 * H, 0.95), P(x - 0.1 * W, 0.58 * H, 1), P(x + 0.11 * W, 0.38 * H, 1.05), P(x - 0.04 * W, 0.16 * H, 1.1),
          P(0.22 * W, 0.12 * H, 1.15), P(0.1 * W, 0.4 * H, 1.25), P(0.28 * W, 0.6 * H, 1.6), P(0.5 * W, 0.48 * H, 5)],
      };
    }
    case 'earth': return {
      mode: 'spit', N: 22, originName: 'ground',
      pts: [P(0.22 * W, H + 90, 0.95), P(0.2 * W, 0.78 * H, 1), P(0.17 * W, 0.52 * H, 1.05), P(0.18 * W, 0.32 * H, 1.1), P(0.25 * W, 0.24 * H, 1.15), P(0.3 * W, 0.3 * H, 1.2)],   // snout stops short of the face
    };
    case 'wood': return {
      mode: 'bind', N: 40, originName: 'ground',
      pts: [P(0.8 * W, H + 90, 0.9), P(0.84 * W, 0.6 * H, 1), P(0.74 * W, 0.22 * H, 1.05), P(0.47 * W, 0.1 * H, 1.05), P(0.2 * W, 0.26 * H, 1.1),
        P(0.15 * W, 0.62 * H, 1.15), P(0.4 * W, 0.86 * H, 1.2), P(0.72 * W, 0.76 * H, 1.25), P(0.84 * W, 0.5 * H, 1.3), P(0.8 * W, 0.3 * H, 1.35), P(0.7 * W, 0.34 * H, 1.4)],   // head ends beside the face, not on it
    };
    default: return {
      mode: 'lunge', N: 30, gap: U * 0.04, originName: 'hands',
      pts: [P(hands.x, hands.y, 0.6), P(0.75 * W, 0.2 * H, 1), P(0.2 * W, 0.3 * H, 1.1), P(0.4 * W, 0.7 * H, 1.3), P(0.5 * W, 0.45 * H, 5)],
    };
  }
}

/**
 * dragon — an elemental serpent pours out of its source and flies along a spline.
 * params: palette (default = variant), variant 'fire' | 'water' | 'earth' | 'wood' | 'lightning', scale
 *  fire: coils out of the mouth, loops the frame, lunges at the camera and explodes.
 *  water: a twisting column rises from the ground, arcs over and crashes onto the camera.
 *  earth: a rock dragon heaves out of the ground, rears up and spits mud bullets at the viewer.
 *  wood: a timber dragon coils around the frame, binds and saps chakra.
 */
async function dragon(ctx, p) {
  const v = p.variant || 'water', c = ctx.palette(p.palette || v), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, W = ctx.W, H = ctx.H, U = unit(ctx);
  const plan = dragonPlan(ctx, v);
  const path = arcPath(plan.pts);
  const N = plan.N, gap = plan.gap ?? (path.L * 0.92) / N;
  const R = U * 0.062 * scale * (v === 'wood' ? 1.15 : v === 'earth' ? 1.25 : 1);
  const src = () => (plan.originName === 'mouth' ? ctx.anchor('mouth') : plan.pts[0]);
  const dim = ctx.tint(v === 'fire' ? 0x000000 : c.dark, 0, 'normal');
  const sw = shockwaves(ctx, { amplitude: 26 });

  // ---- 1. anticipation at the source ----
  ctx.sfx.charge(0.7);
  const gnd = { x: plan.pts[0].x, y: H - U * 0.02 };
  if (v === 'fire') {
    await Promise.all([charge(ctx, () => ctx.anchor('mouth'), c, 650, 1.2), ctx.tween(650, (e) => dim.set(0.3 * e))]);
  } else {
    // hands glow + the ground at the source boils/cracks
    ctx.sfx.rumble(1.2);
    const crack = ctx.add(new PIXI.Graphics(), 'fx');
    const rays = Array.from({ length: 7 }, (_, k) => ({ a: -Math.PI + (k + 0.5) * Math.PI / 7 + ctx.rand(-0.15, 0.15), l: ctx.rand(0.12, 0.22) * U }));
    ctx.emitter({ x: gnd.x, y: gnd.y, rate: 50, duration: 650, tex: v === 'water' ? 'dot' : ctx.pick(['dirt1', 'dirt2']), blend: 'normal',
      radius: [0, U * 0.08], angle: [-Math.PI * 0.75, -Math.PI * 0.25], speed: [150, 420], life: [500, 900], gravity: 900,
      size: v === 'water' ? [U * 0.02, U * 0.008] : [U * 0.06, U * 0.03], color: v === 'water' ? [c.core, c.mid] : [c.mid, c.dark], alpha: [0.9, 0.4] });
    await Promise.all([
      charge(ctx, () => ctx.anchor('hands'), c, 650, 0.9),
      ctx.tween(650, (e) => {
        dim.set(0.22 * e); ctx.shake(3 * e, 100);
        crack.clear();
        if (v === 'water') { crack.ellipse(gnd.x, gnd.y, U * 0.25 * e, U * 0.05 * e).stroke({ width: 4, color: c.core, alpha: 0.7 * e }); return; }
        for (const r of rays) {
          let x = gnd.x, y = gnd.y; crack.moveTo(x, y);
          for (let s = 1; s <= 4; s++) { x = gnd.x + Math.cos(r.a) * r.l * e * s / 4 + (s % 2 ? 6 : -6); y = gnd.y + Math.sin(r.a) * r.l * e * s / 4 * 0.5; crack.lineTo(x, y); }
        }
        crack.stroke({ width: 5, color: v === 'wood' ? c.dark : mix(c.dark, 0x000000, 0.4), alpha: 0.9 });
      }, ease.inCubic),
    ]);
    ctx.tween(800, (e) => { crack.alpha = 1 - e; });
  }

  // ---- 2. build the dragon ----
  const box = ctx.add(new PIXI.Container(), 'fx');
  const woodCtx = v === 'wood' ? woodContext(ctx, c) : null;
  const segs = [];
  for (let i = N - 1; i >= 0; i--) { const s = makeSegment(ctx, v, c, i, N, woodCtx); box.addChild(s.root); segs[i] = s; s.root.visible = false; }
  const head = makeHead(ctx, v, c); box.addChild(head.root); head.root.visible = false;
  const st = { s: 0, size: 0, wobble: 1, jaw: 0.15, squeeze: 0, alive: true, fade: 1 };
  const pose = { x: 0, y: 0, ang: 0, z: 1, r: R };                      // head pose (read by spit/impact)
  const segPos = [];
  const W2 = W / 2, H2 = H / 2;
  const place = (s, t) => {
    const a = path.at(s), b = path.at(s + 6), ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { a, ang };
  };
  ctx.tick((dt, t) => {
    if (!st.alive) return false;
    const ss = Math.max(0, st.s);
    for (let i = 0; i < N; i++) {
      const s = ss - (i + 1) * gap, seg = segs[i];
      if (s < 0) { seg.root.visible = false; segPos[i] = null; continue; }
      const { a, ang } = place(s, t);
      const wob = Math.sin(t * 0.006 - i * 0.55) * R * 0.45 * st.wobble;
      let x = a.x - Math.sin(ang) * wob, y = a.y + Math.cos(ang) * wob;
      if (st.squeeze) { x = lerp(x, W2, st.squeeze * 0.1); y = lerp(y, H2, st.squeeze * 0.1); }
      const r = R * (1 - 0.62 * i / N) * a.z * st.size * (1 + 0.15 * Math.min(1, s / (gap * 2)) - 0.15);
      seg.root.visible = true; seg.root.position.set(x, y); seg.root.alpha = st.fade;
      seg.update(r, ang, t, Math.cos(ang) < 0 ? -1 : 1);
      segPos[i] = { x, y, r };
    }
    const { a, ang } = place(ss, t);
    const hz = a.z, hs = R * 3 * hz * st.size / 100;
    const x = a.x, y = a.y;
    head.root.visible = st.size > 0.01; head.root.alpha = st.fade;
    head.root.position.set(x, y); head.root.rotation = ang;
    head.root.scale.set(hs, Math.cos(ang) < 0 ? -hs : hs);
    head.jaw.rotation = st.jaw + Math.sin(t * 0.012) * 0.05;
    for (const f of head.flames) { f.s.position.set(f.x, f.y + Math.sin(t * 0.02 + f.ph) * 3); setSize(f.s, 42 * (1 + 0.2 * Math.sin(t * 0.03 + f.ph))); f.s.rotation = Math.PI / 2 + 0.3; }
    head.glow.alpha = (v === 'earth' || v === 'wood' ? 0.25 : 0.5) * (0.85 + 0.15 * Math.sin(t * 0.02));
    Object.assign(pose, { x, y, ang, z: hz, r: R * 3 * hz * st.size });
  });
  const mouthPt = () => {           // world position of the head's mouth
    const k = pose.r / 100, fl = Math.cos(pose.ang) < 0 ? -1 : 1;
    const lx = 60 * k, ly = 4 * k * fl;
    return { x: pose.x + Math.cos(pose.ang) * lx - Math.sin(pose.ang) * ly, y: pose.y + Math.sin(pose.ang) * lx + Math.cos(pose.ang) * ly };
  };
  const randSeg = () => { const live = segPos.filter(Boolean); return live.length ? ctx.pick(live) : { x: pose.x, y: pose.y, r: R }; };

  // trail particles shed by the body
  let trailPick = null;
  const tx = () => (trailPick = randSeg()).x, ty = () => trailPick.y;
  const TRAIL = {
    fire: [{ tex: 'flame2', blend: 'normal', rate: 70, life: [400, 800], speed: [20, 80], size: [U * 0.07, U * 0.01], color: [c.mid, c.outer, c.dark], alpha: [0.8, 0], accel: [0, -120], radius: [0, R] },
      { tex: 'spark', rate: 60, life: [500, 1100], speed: [60, 220], size: [U * 0.025, U * 0.005], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.5, gravity: -80, radius: [0, R] }],
    water: [{ tex: 'dot', blend: 'normal', rate: 90, life: [500, 900], speed: [60, 240], size: [U * 0.014, U * 0.006], color: [c.core, c.mid], alpha: [0.9, 0.3], gravity: 700, radius: [0, R] },
      { tex: 'smoke3', blend: 'normal', rate: 18, life: [700, 1200], speed: [10, 40], size: [U * 0.08, U * 0.16], color: [c.core, c.mid], alpha: [0.35, 0], radius: [0, R] }],
    earth: [{ tex: 'dirt1', blend: 'normal', rate: 40, life: [500, 900], speed: [20, 100], size: [U * 0.05, U * 0.02], color: [c.mid, c.dark], alpha: [0.9, 0.2], gravity: 900, radius: [0, R] },
      { tex: 'smoke6', blend: 'normal', rate: 14, life: [900, 1500], speed: [10, 40], size: [U * 0.08, U * 0.18], color: [c.core, c.mid], alpha: [0.35, 0], radius: [0, R] }],
    wood: [{ tex: ctx.has('leaf') ? 'leaf' : 'shard', blend: 'normal', rate: 22, life: [900, 1600], speed: [20, 80], size: [U * 0.03, U * 0.025], color: [c.accent, mix(c.accent, c.mid, 0.5)], alpha: [1, 0], gravity: 160, spin: [-3, 3], radius: [0, R] },
      { tex: 'dirt2', blend: 'normal', rate: 12, life: [500, 900], speed: [20, 80], size: [U * 0.04, U * 0.02], color: [c.outer, c.dark], alpha: [0.8, 0], gravity: 700, radius: [0, R] }],
  }[v] || [{ tex: 'spark', rate: 80, life: [200, 400], speed: [100, 400], size: [U * 0.03, 0], color: [c.core, c.mid], rotateToVelocity: true, stretch: 1, radius: [0, R] }];
  const trails = TRAIL.map((cfg) => ctx.emitter({ ...cfg, x: tx, y: ty }));
  // source plume while the body pours out
  const plume = ctx.emitter({ x: () => src().x, y: () => (v === 'fire' ? src().y : H), rate: 60, tex: v === 'fire' ? 'flame3' : v === 'water' ? 'smoke3' : 'dirt3',
    blend: v === 'fire' ? 'add' : 'normal', angle: [-Math.PI * 0.8, -Math.PI * 0.2], speed: [120, 360], life: [400, 800], radius: [0, U * 0.04],
    size: [U * 0.08, U * 0.16], color: v === 'fire' ? [c.mid, c.outer, c.dark] : v === 'water' ? [c.core, c.mid] : [c.mid, c.dark], alpha: [0.8, 0], gravity: v === 'fire' ? -100 : 500 });

  // ---- 3. release: the head bursts out ----
  ctx.sfx.roar(v === 'wood' ? 3 : 2.4); ctx.sfx.boom(0.6);
  if (v === 'water') ctx.sfx.wave(2.2);
  if (v === 'earth' || v === 'wood') ctx.sfx.rumble(2.5);
  ctx.flash(c.glow, 130, 0.35);
  ctx.shake(12, 500); ctx.zoomPunch(0.05, 300);
  const s0 = src(); sw.ring(s0.x, Math.min(s0.y, H - 10));
  ctx.tween(350, (e) => { st.size = e; }, ease.outBack);
  const flyMs = { fire: 2100, water: 2200, earth: 1300, wood: 2500 }[v] ?? 2000;
  const endS = plan.mode === 'lunge' ? path.L : path.L - 1;
  st.jaw = 0.3;
  await ctx.tween(flyMs, (e) => { st.s = endS * e; }, plan.mode === 'lunge' ? (q) => 0.2 * q + 0.8 * q * q : ease.outCubic);
  plume.stop();

  // ---- 4. finale per mode ----
  if (plan.mode === 'lunge') {
    // the head fills the camera: explode / crash
    st.jaw = 0.55;
    ctx.sfx.boom(1.2);
    if (v === 'water') ctx.sfx.splash(1.6); else ctx.sfx.crackle(1.5);
    ctx.flash(v === 'water' ? c.core : c.glow, 150, 0.55);
    ctx.shake(26, 800); ctx.zoomPunch(0.1, 450);
    sw.ring(pose.x, pose.y);
    const zb = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength: 0.25, center: { x: pose.x, y: pose.y }, innerRadius: U * 0.1 }));
    ctx.tween(500, (e) => { zb.strength = 0.25 * (1 - e); }).then(() => ctx.removeFilter(zb));
    const hx = pose.x, hy = pose.y;
    trails.forEach((e) => e.stop());
    // impact blossom: clustered soft blobs (rim -> core) expanding and breaking apart
    const blossom = (layers) => {
      const bl = ctx.add(new PIXI.Container(), 'fx');
      const blobs = layers.flatMap(([col, bm, k, n]) =>
        Array.from({ length: n }, () => ({ s: bl.addChild(spr(ctx, 'soft', col, bm, 0)), k, a: ctx.rand(0, TAU), d: ctx.rand(0.05, 0.22) * U * k })));
      ctx.tween(700, (e, raw) => {
        for (const o of blobs) {
          o.s.position.set(hx + Math.cos(o.a) * o.d * (0.4 + e), hy + Math.sin(o.a) * o.d * (0.4 + e) - raw * U * 0.08);
          setSize(o.s, U * o.k * (0.35 + 0.6 * e)); o.s.alpha = (o.k === 1 ? 0.55 : 0.9) * (1 - raw * raw);
        }
      }, ease.outCubic).then(() => bl.destroy({ children: true }));
    };
    if (v === 'fire') {
      ctx.burst({ x: hx, y: hy, count: 14, tex: 'smoke4', blend: 'normal', radius: [0, U * 0.18], speed: [150, 500], life: [800, 1400], drag: 2,
        size: [U * 0.15, U * 0.4], color: [c.outer, c.dark], alpha: [0.7, 0], spin: [-2, 2] });
      blossom([[c.dark, 'normal', 1, 7], [c.outer, 'normal', 0.8, 7], [c.mid, 'add', 0.55, 5], [c.core, 'add', 0.3, 3]]);
      for (const tx of ['flame2', 'fire1', 'flame4']) ctx.burst({ x: hx, y: hy, count: 9, tex: tx, radius: [U * 0.05, U * 0.2], speed: [500, 1300], life: [350, 750], drag: 2.6,
        size: [U * 0.2, U * 0.05], color: [c.core, c.mid, c.outer], alpha: [0.9, 0], spin: [-3, 3] });
      ctx.burst({ x: hx, y: hy, count: 70, tex: 'spark', speed: [300, 1100], life: [600, 1400], size: [U * 0.05, U * 0.008], color: [c.core, c.accent, c.outer], rotateToVelocity: true, stretch: 0.8, drag: 1.4, gravity: 150 });
      ctx.burst({ x: hx, y: hy, count: 1, tex: 'flare1', speed: 0, life: 260, size: [U * 0.4, U * 1.1], color: c.core, alpha: [1, 0] });
    } else {
      blossom([[c.outer, 'normal', 1, 7], [c.mid, 'normal', 0.8, 7], [c.core, 'add', 0.45, 4]]);
      ctx.burst({ x: hx, y: hy, count: 110, tex: 'dot', blend: 'normal', radius: [0, U * 0.1], speed: [300, 1200], life: [500, 1100], drag: 1.2, gravity: 900,
        size: [U * 0.03, U * 0.01], color: [c.core, c.mid], alpha: [0.95, 0.3] });
      ctx.burst({ x: hx, y: hy, count: 18, tex: 'smoke3', blend: 'normal', radius: [0, U * 0.15], speed: [100, 400], life: [900, 1500], drag: 2,
        size: [U * 0.2, U * 0.45], color: [c.core, c.mid], alpha: [0.6, 0] });
      for (let k = 0; k < 3; k++) ctx.burst({ x: hx, y: hy, count: 1, tex: 'circle1', speed: 0, life: 600 + k * 200, size: [U * 0.2, U * (1.2 + k * 0.4)], color: c.core, alpha: [0.8, 0], blend: 'normal' });
      // droplets left on the lens, sliding down
      const lens = ctx.add(new PIXI.Container(), 'front');
      const drops = Array.from({ length: 16 }, () => {
        const d = lens.addChild(spr(ctx, 'soft', c.core, 'add', ctx.rand(0.25, 0.5)));
        setSize(d, ctx.rand(0.03, 0.08) * U); d.position.set(ctx.rand(0.05, 0.95) * W, ctx.rand(0.05, 0.9) * H);
        return { d, v: ctx.rand(10, 60) };
      });
      ctx.tick((dt) => { for (const o of drops) o.d.y += o.v * dt / 1000; });
      ctx.tween(1800, (e) => { lens.alpha = 1 - e * e; });
    }
    // body breaks up from head to tail (segments already near the lens vanish at once)
    let near = 0;
    while (near < N && segPos[near] && segPos[near].r > U * 0.07) near++;
    await ctx.tween(320, (e) => {
      const cut = Math.max(near, Math.floor(e * N));
      st.size = 1 - e * 0.3;
      head.root.visible = false;
      for (let i = 0; i < cut; i++) {
        const sp = segPos[i];
        if (sp && segs[i].root.visible) {
          segs[i].root.visible = false;
          if (v === 'fire') ctx.burst({ x: sp.x, y: sp.y, count: 3, tex: ctx.pick(FLAMES), blend: 'normal', speed: [40, 160], life: [400, 800], size: [Math.min(sp.r * 2.5, U * 0.12), sp.r * 0.4], color: [c.mid, c.outer, c.dark], alpha: [0.9, 0], accel: [0, -150] });
          else ctx.burst({ x: sp.x, y: sp.y, count: 5, tex: 'dot', blend: 'normal', speed: [80, 280], life: [400, 800], size: [U * 0.02, U * 0.008], color: [c.core, c.mid], gravity: 900 });
        }
      }
    });
    st.alive = false; box.visible = false;
    // follow-through: embers / mist hang in the air
    if (v === 'fire') {
      ctx.emitter({ x: () => ctx.rand(0, W), y: H + 10, rate: 40, duration: 1400, tex: 'spark', angle: [-Math.PI * 0.7, -Math.PI * 0.3], speed: [60, 200], life: [900, 1600],
        size: [U * 0.02, 0], color: [c.accent, c.outer], rotateToVelocity: true, stretch: 0.5 });
      ctx.burst({ x: hx, y: hy, count: 12, tex: ctx.pick(SMOKES), blend: 'normal', radius: [0, U * 0.2], speed: [20, 80], life: [1400, 2000], size: [U * 0.25, U * 0.5],
        color: [mix(c.outer, c.dark, 0.6), c.dark], alpha: [0.5, 0], accel: [0, -30], spin: [-0.5, 0.5] });
    } else {
      ctx.emitter({ x: () => ctx.rand(0, W), y: -10, rate: 60, duration: 1200, tex: 'dot', blend: 'normal', angle: Math.PI / 2, speed: [300, 600], life: [600, 900],
        size: [U * 0.012, U * 0.006], color: c.core, alpha: [0.7, 0.2], gravity: 500 });
    }
    fadeTint(ctx, dim, 1400);
    await ctx.wait(1500);
    return;
  }

  trails.forEach((e) => e.stop());
  if (plan.mode === 'spit') {
    // earth: rear up and spit a volley of mud bullets at the viewer
    st.wobble = 0.5;
    const shots = 6;
    const front = ctx.add(new PIXI.Container(), 'front');
    const mudC = mix(c.mid, c.dark, 0.45), mudHi = mix(c.mid, c.core, 0.3);
    const mudCtx = new PIXI.GraphicsContext();
    mudCtx.circle(0, 0, 50).fill(mudC);
    for (let k = 0; k < 7; k++) { const a = k * TAU / 7; mudCtx.circle(Math.cos(a) * 42, Math.sin(a) * 42, 18 + (k % 3) * 6).fill(mudC); }
    mudCtx.ellipse(-14, -18, 18, 10).fill({ color: mudHi, alpha: 0.6 });
    const splatCtx = new PIXI.GraphicsContext();
    splatCtx.circle(0, 0, 46).fill(mudC);
    for (let k = 0; k < 9; k++) {                                  // irregular lobes + flung droplets
      const a = ctx.rand(0, TAU), l = ctx.rand(30, 60);
      splatCtx.circle(Math.cos(a) * l * 0.7, Math.sin(a) * l * 0.7, ctx.rand(14, 30)).fill(mudC);
      if (k % 2) splatCtx.circle(Math.cos(a) * (l + 30), Math.sin(a) * (l + 30), ctx.rand(4, 9)).fill(mudC);
    }
    splatCtx.ellipse(-12, -14, 20, 10).fill({ color: mudHi, alpha: 0.45 });
    for (let k = 0; k < shots; k++) {
      st.jaw = 0.65; ctx.sfx.crack(); ctx.sfx.whoosh(0.3);
      const m = mouthPt(), fc = ctx.anchor('face'), pickT = () => ({ x: ctx.rand(0.3, 0.88) * W, y: ctx.rand(0.25, 0.85) * H });
      let tgt = pickT();
      for (let n = 0; n < 8 && Math.hypot(tgt.x - fc.x, tgt.y - fc.y) < U * 0.3; n++) tgt = pickT();   // keep the caster's face clear
      const mud = front.addChild(new PIXI.Graphics(mudCtx));
      const ball = front.addChild(spr(ctx, 'rock', mix(c.mid, c.dark, 0.45)));
      ctx.burst({ x: m.x, y: m.y, count: 8, tex: 'dirt1', blend: 'normal', angle: [pose.ang - 0.5, pose.ang + 0.5], speed: [100, 300], life: [300, 600], size: [U * 0.04, U * 0.01], color: [c.mid, c.dark], gravity: 600 });
      ctx.tween(380, (e) => {
        const x = lerp(m.x, tgt.x, e), y = lerp(m.y, tgt.y, e) - Math.sin(e * Math.PI) * U * 0.08, sz = U * (0.04 + 0.32 * e * e);
        ball.position.set(x, y); setSize(ball, sz); ball.rotation = e * 6;
        mud.position.set(x, y); mud.scale.set(sz * 1.2 / 100); mud.rotation = -e * 4;
      }, ease.inCubic).then(() => {
        ball.destroy(); mud.destroy();
        ctx.shake(10, 250); ctx.sfx.boom(0.35);
        const splat = front.addChild(new PIXI.Graphics(splatCtx));
        splat.position.set(tgt.x, tgt.y); splat.scale.set(U * ctx.rand(0.0018, 0.0026)); splat.rotation = ctx.rand(0, TAU); splat.alpha = 0.92;
        ctx.burst({ x: tgt.x, y: tgt.y, count: 14, tex: 'dirt2', blend: 'normal', speed: [150, 500], life: [400, 800], size: [U * 0.06, U * 0.02], color: [c.mid, c.dark], gravity: 900, layer: 'front' });
        ctx.tween(1200, (e) => { splat.alpha = 0.92 * (1 - e * e); splat.y = tgt.y + e * U * 0.06; splat.scale.y = splat.scale.x * (1 + 0.25 * e); });
      });
      await ctx.tween(110, (e) => { st.s = path.L - 1 - U * 0.03 * Math.sin(e * Math.PI); });
      st.jaw = 0.2;
      await ctx.wait(140);
    }
    await ctx.wait(450);
    // crumble back into the earth
    ctx.sfx.rumble(1.5); ctx.shake(8, 900);
    for (const sp of segPos) if (sp) ctx.burst({ x: sp.x, y: sp.y, count: 2, tex: 'rock', blend: 'normal', speed: [30, 150], life: [700, 1100], size: [sp.r * 1.6, sp.r * 1.2], color: mix(c.core, c.mid, 0.35), gravity: 1200, spin: [-3, 3], alpha: [1, 1] });
    ctx.burst({ x: pose.x, y: pose.y, count: 3, tex: 'rock', blend: 'normal', speed: [30, 150], life: [700, 1100], size: [R * 2.5, R * 2], color: mix(c.core, c.mid, 0.35), gravity: 1200, spin: [-3, 3], alpha: [1, 1] });
    ctx.burst({ x: W * 0.22, y: H * 0.7, count: 16, tex: ctx.pick(SMOKES), blend: 'normal', radius: [0, U * 0.3], speed: [20, 80], life: [1200, 1900], size: [U * 0.25, U * 0.5], color: [c.core, c.mid], alpha: [0.5, 0], accel: [0, -20] });
    st.alive = false; box.visible = false;
    fadeTint(ctx, dim, 1200);
    await ctx.wait(1300);
    return;
  }

  // wood: coil tightens around the frame, then saps chakra from the bound target
  st.jaw = 0.5;
  ctx.sfx.crack(); ctx.sfx.rumble(1.5);
  await ctx.tween(450, (e) => { st.squeeze = e; st.wobble = 1 - e * 0.9; ctx.shake(6 * e, 100); }, ease.outBack);
  ctx.sfx.crack();
  const ch = ctx.palette('chakra');
  ctx.sfx.hum(1.6, 90);
  const center = () => ({ x: ctx.anchor('face').x, y: lerp(ctx.anchor('face').y, ctx.anchor('hands').y, 0.6) });
  // chakra wisps leave the target and are drawn into the timber
  const wisps = ctx.add(new PIXI.Container(), 'fx');
  const list = [];
  let draining = true;
  ctx.tick((dt) => {
    for (let n = 0; n < 2; n++) if (draining && list.length < 80) {
      const cpos = center(), sg = randSeg();
      const s = wisps.addChild(spr(ctx, 'soft', ctx.pick([ch.core, ch.mid, ch.glow]), 'add', 0.9));
      list.push({ s, x0: cpos.x + ctx.rand(-U * 0.1, U * 0.1), y0: cpos.y + ctx.rand(-U * 0.15, U * 0.15), tx: sg.x, ty: sg.y, age: 0, life: ctx.rand(450, 800), cv: ctx.rand(-0.3, 0.3) });
    }
    for (let k = list.length - 1; k >= 0; k--) {
      const o = list[k]; o.age += dt; const q = o.age / o.life;
      if (q >= 1) { o.s.destroy(); list.splice(k, 1); continue; }
      const e = q * q, mx = (o.x0 + o.tx) / 2 + (o.ty - o.y0) * o.cv, my = (o.y0 + o.ty) / 2 - (o.tx - o.x0) * o.cv;
      const x = (1 - e) * (1 - e) * o.x0 + 2 * (1 - e) * e * mx + e * e * o.tx, y = (1 - e) * (1 - e) * o.y0 + 2 * (1 - e) * e * my + e * e * o.ty;
      o.s.rotation = Math.atan2(y - o.s.y, x - o.s.x); o.s.position.set(x, y); o.s.scale.set(U * 0.07 / 128, U * 0.035 / 128); o.s.alpha = Math.sin(q * Math.PI);
    }
  });
  const drainGlow = vignette(ctx, ch.mid);
  const sap = ctx.emitter({ x: () => center().x, y: () => center().y, rate: 40, tex: 'soft', radius: [0, U * 0.12], speed: [10, 40], life: [400, 700], size: [U * 0.08, U * 0.02], color: [ch.mid, ch.outer], alpha: [0.5, 0] });
  await ctx.tween(1500, (e) => { drainGlow.alpha = 0.3 * Math.sin(e * Math.PI); st.squeeze = 1 + 0.15 * Math.sin(e * 18); });
  sap.stop();
  draining = false;
  // the wood creaks, sheds leaves and withers away
  ctx.sfx.crack();
  for (const sp of segPos) if (sp && Math.random() < 0.5) ctx.burst({ x: sp.x, y: sp.y, count: 2, tex: ctx.has('leaf') ? 'leaf' : 'shard', blend: 'normal', speed: [20, 90], life: [900, 1500], size: [U * 0.03, U * 0.025], color: c.accent, gravity: 200, spin: [-3, 3] });
  fadeTint(ctx, dim, 900);
  await ctx.tween(900, (e) => { st.fade = 1 - e; });
  st.alive = false; box.visible = false;
  await ctx.wait(200);
}

// =============================================================================================
// SEALING
// =============================================================================================
const TRIGRAMS = [7, 3, 5, 1, 6, 2, 4, 0];        // 3-bit patterns (1 = solid bar)
const KANJI = ['封', '印', '八', '卦', '乾', '坤', '震', '巽', '坎', '離', '艮', '兌'];

function drawSpiral(g, R, turns, upto, width, color, alpha) {
  const n = 140, m = Math.max(2, Math.floor(n * upto));
  g.moveTo(0, 0);
  for (let k = 1; k <= m; k++) { const q = k / n, a = q * turns * TAU; g.lineTo(Math.cos(a) * R * q, Math.sin(a) * R * q); }
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/**
 * sealing — a spiral seal is written onto the body and locked in.
 * params: palette (default 'seal'), variant 'seal' (Eight Trigrams; others fall back to it), scale
 */
async function sealing(ctx, p) {
  const c = ctx.palette(p.palette || 'seal'), scale = p.scale ?? 1;
  const { PIXI, ease } = ctx, W = ctx.W, H = ctx.H, U = unit(ctx) * scale;
  const body = () => { const f = ctx.anchor('face'), h = ctx.anchor('hands'); return { x: f.x, y: Math.min(H * 0.86, lerp(f.y, h.y, 0.75)) }; };
  const Rs = U * 0.13;
  const dim = ctx.tint(0x000000, 0, 'normal');
  const sw = shockwaves(ctx, { amplitude: 20, wavelength: 80 });
  const ink = c.outer, gold = c.glow, red = c.accent;

  // ---- 1. five fingertip flames gather at the hand ----
  ctx.sfx.charge(0.7); ctx.sfx.hum(0.9, 140);
  const tips = ctx.add(new PIXI.Container(), 'fx');
  const flames = Array.from({ length: 5 }, (_, k) => ({
    f: tips.addChild(spr(ctx, 'fire' + (1 + (k % 2)), mix(red, gold, 0.45), 'add', 0)),
    core: tips.addChild(spr(ctx, 'soft', gold, 'add', 0)), a: -Math.PI / 2 + (k - 2) * 0.32,
  }));
  const tipPos = (k, spread) => {
    const h = ctx.anchor('hands'), hs = ctx.handScale();
    return { x: h.x + Math.cos(flames[k].a) * hs * 0.55 * spread, y: h.y - hs * 0.15 + Math.sin(flames[k].a) * hs * 0.55 * spread };
  };
  let tipK = 1, tipTo = null;
  ctx.tick((dt, t) => {
    if (tips.destroyed) return false;
    flames.forEach((o, k) => {
      let q = tipPos(k, 1);
      if (tipTo) { const b = tipTo.at; q = { x: lerp(q.x, b.x + Math.cos(o.a) * Rs * 0.25, tipTo.e), y: lerp(q.y, b.y + Math.sin(o.a) * Rs * 0.25, tipTo.e) }; }
      o.f.position.set(q.x, q.y - U * 0.03); o.core.position.set(q.x, q.y);
      setSize(o.f, U * 0.17 * tipK * (1 + 0.2 * Math.sin(t * 0.03 + k))); o.f.rotation = Math.sin(t * 0.01 + k) * 0.15; setSize(o.core, U * 0.05 * tipK);
    });
  });
  ctx.emitter({ x: () => tipPos(Math.floor(Math.random() * 5), 1).x, y: () => ctx.anchor('hands').y - ctx.handScale() * 0.5, rate: 30, duration: 700,
    tex: 'spark', speed: [20, 80], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [300, 600], size: [U * 0.02, 0], color: [c.core, gold] });
  await ctx.tween(700, (e) => { for (const o of flames) { o.f.alpha = 0.9 * e; o.core.alpha = e; } dim.set(0.3 * e); }, ease.outCubic);

  // ---- 2. strike: fingers slam onto the body ----
  ctx.sfx.whoosh(0.25);
  await ctx.tween(150, (e) => { tipTo = { at: body(), e }; }, ease.inCubic);
  const b0 = body();
  ctx.sfx.boom(0.7); ctx.sfx.bell();
  ctx.flash(gold, 130, 0.45);
  ctx.shake(14, 400); ctx.zoomPunch(0.06, 280);
  sw.ring(b0.x, b0.y);
  ctx.burst({ x: b0.x, y: b0.y, count: 40, tex: 'spark', speed: [200, 700], life: [300, 700], size: [U * 0.04, 0], color: [c.core, gold, red], rotateToVelocity: true, stretch: 0.8, drag: 2 });
  ctx.tween(300, (e) => { for (const o of flames) { o.f.alpha = 0.9 * (1 - e); o.core.alpha = 1 - e; } }).then(() => tips.destroy({ children: true }));

  // ---- 3. the seal writes itself outward ----
  const seal = ctx.add(new PIXI.Container(), 'fx');
  const circDark = seal.addChild(spr(ctx, ctx.has('seal-circle') ? 'seal-circle' : 'circle1', ink, 'normal', 0));
  const circGold = seal.addChild(spr(ctx, ctx.has('seal-circle') ? 'seal-circle' : 'circle1', gold, 'add', 0));
  const halo = seal.addChildAt(spr(ctx, 'soft', gold, 'add', 0), 0);
  const spGlow = seal.addChild(new PIXI.Graphics()); spGlow.blendMode = 'add';
  const spInk = seal.addChild(new PIXI.Graphics());
  const tri = seal.addChild(new PIXI.Container());
  const triG = TRIGRAMS.map((bits, k) => {
    const g = tri.addChild(new PIXI.Graphics()), a = k * TAU / 8, bw = U * 0.05, bh = U * 0.008, gp = U * 0.016;
    for (let j = 0; j < 3; j++) {
      const y = -j * gp, solid = (bits >> j) & 1;
      if (solid) g.rect(-bw / 2, y - bh / 2, bw, bh); else g.rect(-bw / 2, y - bh / 2, bw * 0.42, bh).rect(bw * 0.08, y - bh / 2, bw * 0.42, bh);
    }
    g.fill(gold).stroke({ width: 1.5, color: ink });
    g.position.set(Math.cos(a) * Rs * 1.35, Math.sin(a) * Rs * 1.35); g.rotation = a + Math.PI / 2; g.alpha = 0; g.scale.set(0);
    return g;
  });
  const ringC = seal.addChild(new PIXI.Container());
  const kan = KANJI.map((ch, k) => {
    const tt = ringC.addChild(new PIXI.Text({ text: ch, style: { fontFamily: 'serif', fontSize: Math.round(U * 0.045), fontWeight: 'bold', fill: gold, stroke: { color: ink, width: 4 } } }));
    const a = k * TAU / KANJI.length; tt.anchor.set(0.5); tt.position.set(Math.cos(a) * Rs * 2.05, Math.sin(a) * Rs * 2.05); tt.rotation = a + Math.PI / 2; tt.alpha = 0;
    return tt;
  });
  let spin = 0.6, contract = 1;
  ctx.tick((dt, t) => {
    if (seal.destroyed) return false;
    const b = body(); seal.position.set(b.x, b.y); seal.scale.set(contract);
    circDark.rotation += spin * dt / 1000; circGold.rotation = circDark.rotation;
    ringC.rotation -= spin * 0.5 * dt / 1000; tri.rotation += spin * 0.25 * dt / 1000;
    halo.alpha = (0.35 + 0.1 * Math.sin(t * 0.01)) * Math.min(1, circGold.alpha * 2);
  });
  ctx.sfx.hum(2.4, 70);
  await ctx.tween(900, (e, raw) => {
    spGlow.clear(); spInk.clear();
    drawSpiral(spGlow, Rs, 3.5, e, U * 0.03, gold, 0.55);
    drawSpiral(spInk, Rs, 3.5, e, U * 0.011, ink, 0.95);
    const ce = ease.outBack(clamp(raw * 1.4 - 0.2, 0, 1));
    setSize(circDark, Rs * 3.4 * ce); setSize(circGold, Rs * 3.3 * ce); setSize(halo, Rs * 5 * ce);
    circDark.alpha = 0.55 * clamp(raw * 2, 0, 1); circGold.alpha = 0.95 * clamp(raw * 2, 0, 1);
    triG.forEach((g, k) => { const q = clamp(raw * 2.2 - k * 0.12, 0, 1); g.alpha = q; g.scale.set(ease.outBack(q)); });
    kan.forEach((tt, k) => { tt.alpha = clamp(raw * 2.5 - 0.6 - k * 0.08, 0, 1); });
  }, ease.outCubic);

  // ---- 4. paper tags slap on around the seal ----
  const tags = [];
  const tagTex = ctx.has('paper-tag') ? 'paper-tag' : 'window1';
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI * 0.75 + k * Math.PI / 2 + 0.2, tg = ctx.add(spr(ctx, tagTex, 0xffffff), 'fx');
    const fromX = k < 2 ? -U * 0.2 : W + U * 0.2, fromY = ctx.rand(0, H);
    tags.push({ tg, a });
    ctx.sfx.whoosh(0.2);
    ctx.tween(220, (e) => {
      const b = body(), tx = b.x + Math.cos(a) * Rs * 2.7, ty = b.y + Math.sin(a) * Rs * 2.7;
      tg.position.set(lerp(fromX, tx, e), lerp(fromY, ty, e)); tg.rotation = (1 - e) * 8 + a + Math.PI / 2;
      setSize(tg, U * 0.06 * (1 + (1 - e) * 1.5)); tg.scale.y = tg.scale.x;
    }, ease.outCubic).then(() => {
      ctx.sfx.slash(); ctx.shake(5, 150);
      ctx.burst({ x: tg.x, y: tg.y, count: 10, tex: 'spark', speed: [80, 300], life: [200, 500], size: [U * 0.025, 0], color: [gold, red], rotateToVelocity: true, stretch: 0.6 });
    });
    await ctx.wait(140);
  }
  ctx.tick(() => {
    if (seal.destroyed) return false;
    const b = body();
    for (const o of tags) if (!o.tg.destroyed && !o.burning) { o.tg.position.set(b.x + Math.cos(o.a) * Rs * 2.7 * contract, b.y + Math.sin(o.a) * Rs * 2.7 * contract); }
  });
  await ctx.wait(220);

  // ---- 5. lock: chakra is drawn in, the seal spins up ----
  ctx.sfx.charge(1); ctx.sfx.ominous(1.6);
  const motes = ctx.add(new PIXI.Container(), 'fx'), ml = [];
  let pulling = true;
  ctx.tick((dt) => {
    if (motes.destroyed) return false;
    if (pulling && ml.length < 70) for (let k = 0; k < 2; k++) {
      const s = motes.addChild(spr(ctx, 'spark', ctx.pick([gold, c.core, red]), 'add', 0));
      ml.push({ s, a: ctx.rand(0, TAU), r: ctx.rand(2.6, 4) * Rs, w: ctx.rand(2, 4), age: 0, life: ctx.rand(500, 800) });
    }
    const b = body();
    for (let k = ml.length - 1; k >= 0; k--) {
      const o = ml[k]; o.age += dt; const q = o.age / o.life;
      if (q >= 1) { o.s.destroy(); ml.splice(k, 1); continue; }
      const r = o.r * (1 - q * q), a = o.a + q * o.w;
      o.s.position.set(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); o.s.rotation = a + Math.PI / 2 + 0.6;
      o.s.scale.set(0.3, 0.1); o.s.alpha = Math.sin(q * Math.PI);
    }
  });
  await ctx.tween(1000, (e) => {
    spin = 0.6 + e * 7; dim.set(0.3 + 0.15 * e);
    for (const o of tags) o.tg.tint = mix(0xffffff, 0xffc8a0, e);
    ctx.shake(2 + 4 * e, 80);
  }, ease.inCubic);
  pulling = false;

  // ---- 6. seal: everything collapses into the body ----
  ctx.sfx.boom(0.9); ctx.sfx.chime();
  await ctx.tween(220, (e) => { contract = 1 - 0.75 * e; }, ease.inCubic);
  const b1 = body();
  ctx.flash(gold, 120, 0.4); ctx.shake(18, 500); ctx.zoomPunch(0.08, 350);
  sw.ring(b1.x, b1.y);
  ctx.burst({ x: b1.x, y: b1.y, count: 1, tex: 'flare1', speed: 0, life: 260, size: [U * 0.3, U * 0.8], color: gold, alpha: [0.9, 0] });
  ctx.burst({ x: b1.x, y: b1.y, count: 50, tex: 'spark', speed: [250, 800], life: [400, 900], size: [U * 0.04, 0], color: [c.core, gold, red], rotateToVelocity: true, stretch: 0.8, drag: 1.8 });
  for (const o of tags) {                     // tags burn away into embers + ash
    o.burning = true;
    ctx.burst({ x: o.tg.x, y: o.tg.y, count: 14, tex: 'flame2', speed: [20, 80], life: [400, 900], size: [U * 0.05, U * 0.01], color: [gold, red, c.dark], accel: [0, -150], radius: [0, U * 0.03] });
    ctx.burst({ x: o.tg.x, y: o.tg.y, count: 8, tex: 'dot', blend: 'normal', speed: [10, 50], life: [900, 1500], size: [U * 0.008, U * 0.004], color: 0x2a2a2a, accel: [0, -50] });
    ctx.tween(400, (e) => { o.tg.alpha = 1 - e; o.tg.tint = mix(0xffa060, 0x301010, e); });
  }
  seal.destroy({ children: true });

  // ---- 7. residue: the finished spiral mark glows on the body and fades ----
  const mark = ctx.add(new PIXI.Container(), 'fx');
  const mg = mark.addChild(new PIXI.Graphics()); mg.blendMode = 'add';
  drawSpiral(mg, Rs * 0.8, 3.5, 1, U * 0.022, gold, 0.6);
  const mi = mark.addChild(new PIXI.Graphics()); drawSpiral(mi, Rs * 0.8, 3.5, 1, U * 0.009, ink, 0.9);
  const mt = TRIGRAMS.map((bits, k) => {
    const g = mark.addChild(new PIXI.Graphics()), a = k * TAU / 8;
    g.rect(-U * 0.015, -U * 0.003, U * 0.03, U * 0.006).fill(ink); g.position.set(Math.cos(a) * Rs * 1.05, Math.sin(a) * Rs * 1.05); g.rotation = a + Math.PI / 2;
    return g;
  });
  ctx.sfx.hum(1.2, 55);
  ctx.emitter({ x: () => body().x, y: () => body().y, rate: 18, duration: 1100, tex: 'spark', radius: [0, Rs], speed: [10, 40], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [600, 1000], size: [U * 0.015, 0], color: [gold, red] });
  fadeTint(ctx, dim, 1300);
  await ctx.tween(1400, (e, raw) => {
    const b = body(); mark.position.set(b.x, b.y); mark.rotation = raw * 0.4;
    mg.alpha = (0.5 + 0.5 * Math.abs(Math.sin(raw * Math.PI * 2))) * (1 - raw);
    mi.alpha = 1 - raw * raw; for (const g of mt) g.alpha = mi.alpha;
  });
}

// =============================================================================================
// GENJUTSU
// =============================================================================================

// Procedural feather (white, tint it), rendered once.
let FEATHER = null;
function featherTex(ctx) {
  if (FEATHER) return FEATHER;
  const g = new ctx.PIXI.Graphics();
  g.poly([0, -44, 8, -26, 11, 4, 6, 32, 0, 40, -5, 30, -10, 4, -8, -26]).fill(0xffffff);
  for (let k = -3; k <= 3; k++) g.moveTo(0, k * 10).lineTo(k % 2 ? 10 : -10, k * 10 - 8).stroke({ width: 1.5, color: 0x9a9aa8 });
  g.moveTo(0, -42).lineTo(0, 50).stroke({ width: 2, color: 0xb8b8c8 });
  FEATHER = ctx.app.renderer.generateTexture(g);
  g.destroy();
  return FEATHER;
}

/** Crow flock manager on a layer. spawn(o) adds a crow; it bursts into feathers when its life ends. */
function crowFlock(ctx, c, layer = 'front') {
  const { PIXI } = ctx, U = unit(ctx);
  const box = ctx.add(new PIXI.Container(), layer), list = [];
  const crowTex = ctx.has('crow') ? 'crow' : 'shard';
  const fTex = featherTex(ctx), halo = mix(c.accent, 0x8070c0, 0.6);
  const feather = (x, y, n, z = 1) => ctx.burst({ x, y, count: n, tex: fTex, blend: 'normal', speed: [40, 220], life: [900, 1600], size: [U * 0.011 * z, U * 0.009 * z],
    color: [0x2a2a36, 0x0a0a0e], alpha: [1, 0], drag: 2, gravity: 120, spin: [-4, 4], layer });
  const f = {
    box, list, feather,
    spawn(o) {
      const h = box.addChildAt(spr(ctx, 'soft', halo, 'add', 0), 0);   // cold rim light so black birds read on dark rooms
      const s = box.addChild(spr(ctx, crowTex, crowTex === 'crow' ? 0xffffff : 0x111116));
      list.push({ s, h, age: 0, ph: ctx.rand(0, TAU), flap: ctx.rand(0.022, 0.032), base: U * ctx.rand(0.07, 0.1), curl: ctx.rand(-1.2, 1.2), ...o });
    },
    update(dt) {
      const k = dt / 1000;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i]; o.age += dt; const q = o.age / o.life;
        if (q >= 1) { if (o.poof !== false) feather(o.s.x, o.s.y, 4, Math.min(2, o.z1)); o.s.destroy(); o.h.destroy(); list.splice(i, 1); continue; }
        const ca = Math.cos(o.curl * k), sa = Math.sin(o.curl * k);   // curving flight paths
        [o.vx, o.vy] = [o.vx * ca - o.vy * sa, o.vx * sa + o.vy * ca];
        o.x += o.vx * k; o.y += o.vy * k;
        const z = lerp(o.z0, o.z1, q * q), dir = o.vx < 0 ? -1 : 1, fl = Math.sin(o.age * o.flap + o.ph);
        o.s.position.set(o.x, o.y);
        o.s.scale.set(dir * o.base * z / (o.s.texture.width || 1), o.base * z * (0.75 + 0.35 * fl) / (o.s.texture.width || 1));
        o.s.rotation = Math.atan2(o.vy, Math.abs(o.vx)) * 0.5 * dir;
        o.s.alpha = Math.min(1, q * 8);
        o.h.position.set(o.x, o.y); setSize(o.h, o.base * z * 1.7); o.h.alpha = 0.4 * o.s.alpha;
      }
    },
  };
  ctx.tick((dt) => { if (box.destroyed) return false; f.update(dt); });
  return f;
}

async function genCrows(ctx, c, U) {
  const W = ctx.W, H = ctx.H;
  const body = () => { const f = ctx.anchor('face'), h = ctx.anchor('hands'); return { x: f.x, y: lerp(f.y, h.y, 0.5) }; };
  const vig = vignette(ctx, 0x000000), dark = ctx.tint(0x05050a, 0, 'normal');
  const flock = crowFlock(ctx, c, 'front');

  // ---- anticipation: feathers whirl around the caster, a few crows circle ----
  ctx.sfx.ominous(1.4); ctx.sfx.crow(2);
  ctx.emitter({ x: () => body().x, y: () => body().y, rate: 40, duration: 700, tex: featherTex(ctx), blend: 'normal', radius: [U * 0.15, U * 0.3],
    speed: [60, 160], life: [600, 1000], size: [U * 0.012, U * 0.009], color: 0x1a1a24, alpha: [0, 1], spin: [-5, 5], accel: [0, -60] });
  for (let k = 0; k < 6; k++) {
    const b = body(), a = k * TAU / 6;
    flock.spawn({ x: b.x + Math.cos(a) * U * 0.25, y: b.y + Math.sin(a) * U * 0.2, vx: -Math.sin(a) * 260, vy: Math.cos(a) * 200, z0: 0.8, z1: 1.2, life: 750, curl: 3.5, base: U * 0.08 });
  }
  await ctx.tween(700, (e) => { vig.alpha = 0.5 * e; dark.set(0.1 * e); }, ctx.ease.inCubic);

  // ---- release: the caster bursts into a storm of crows ----
  ctx.sfx.crow(7); ctx.sfx.wind(2.5); ctx.sfx.whoosh(0.6);
  ctx.flash(0x000000, 200, 0.5, 'normal'); ctx.shake(10, 400); ctx.zoomPunch(0.05, 300);
  const b = body();
  flock.feather(b.x, b.y, 30, 1.4);
  ctx.burst({ x: b.x, y: b.y, count: 14, tex: ctx.pick(SMOKES), blend: 'normal', radius: [0, U * 0.15], speed: [60, 220], life: [800, 1300], size: [U * 0.2, U * 0.4], color: [0x1a1a22, 0x050508], alpha: [0.85, 0], layer: 'front' });
  const wave = (n, z1) => {
    for (let k = 0; k < n; k++) {
      const a = ctx.rand(0, TAU), sp = ctx.rand(250, 650), bb = body();
      flock.spawn({ x: bb.x + ctx.rand(-U * 0.08, U * 0.08), y: bb.y + ctx.rand(-U * 0.08, U * 0.08), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 60, z0: 0.35, z1: ctx.rand(z1 * 0.5, z1), life: ctx.rand(900, 1500) });
    }
  };
  wave(34, 3.2);
  await ctx.tween(500, (e) => dark.set(0.1 + 0.18 * e));
  wave(16, 4.5); ctx.sfx.crow(4);
  // swirl across the whole screen, some crows fly right into the lens
  for (let k = 0; k < 14; k++) {
    const left = k % 2 === 0;
    flock.spawn({ x: left ? -U * 0.2 : W + U * 0.2, y: ctx.rand(0.1, 0.9) * H, vx: (left ? 1 : -1) * ctx.rand(500, 800), vy: ctx.rand(-120, 120), z0: ctx.rand(1, 2), z1: ctx.rand(2, 5), life: ctx.rand(1000, 1500), curl: ctx.rand(-0.6, 0.6) });
  }
  const fall = ctx.emitter({ x: () => ctx.rand(0, W), y: -20, rate: 26, duration: 2200, tex: featherTex(ctx), blend: 'normal', angle: [Math.PI * 0.3, Math.PI * 0.7],
    speed: [40, 120], life: [1400, 2200], size: [U * 0.014, U * 0.012], color: 0x1c1c26, spin: [-3, 3], gravity: 40, layer: 'front' });
  await ctx.wait(900);
  wave(10, 3);
  await ctx.wait(700);

  // ---- follow-through: the flock scatters into drifting feathers, the dark lifts ----
  for (const o of flock.list) o.life = Math.min(o.life, o.age + ctx.rand(50, 400));
  ctx.sfx.crow(2);
  await ctx.tween(1100, (e) => { vig.alpha = 0.5 * (1 - e); dark.set(0.28 * (1 - e)); });
  fall.stop();
  await ctx.wait(500);
}

async function genPetals(ctx, c, U) {
  const { PIXI, ease } = ctx, W = ctx.W, H = ctx.H;
  const petal = ctx.has('sakura') ? 'sakura' : 'soft';
  const bark = mix(0x3a2418, c.dark, 0.2), barkHi = mix(0x7a5238, c.outer, 0.15);
  const vig = vignette(ctx, c.dark);
  const twist = ctx.filter(new ctx.filters.TwistFilter({ radius: U * 0.9, angle: 0, padding: 20, offset: { x: W / 2, y: H / 2 } }));

  // ---- anticipation: petals drift from the caster's hands; reality wavers ----
  ctx.sfx.ominous(1.5); ctx.sfx.chime();
  ctx.emitter({ x: () => ctx.anchor('hands').x, y: () => ctx.anchor('hands').y, rate: 30, duration: 800, tex: petal, blend: 'normal', radius: [0, U * 0.06],
    speed: [40, 140], angle: [-Math.PI, 0], life: [900, 1500], size: [U * 0.03, U * 0.025], color: [c.core, c.mid], spin: [-3, 3], gravity: 30 });
  await ctx.tween(700, (e) => { twist.angle = Math.sin(e * Math.PI) * 1.2; vig.alpha = 0.35 * e; });
  ctx.removeFilter(twist);

  // ---- release: a tree erupts around the viewer and locks them in ----
  ctx.sfx.crack(); ctx.sfx.rumble(1.6); ctx.shake(10, 500);
  ctx.flash(c.glow, 120, 0.35);
  const limbs = [
    [[-0.03, 1.03], [0.12, 0.72], [0.3, 0.56], 0.11], [[1.03, 1.03], [0.86, 0.68], [0.72, 0.5], 0.11],
    [[-0.03, -0.03], [0.18, 0.12], [0.3, 0.3], 0.08], [[1.03, -0.03], [0.82, 0.16], [0.68, 0.24], 0.08],
    [[-0.03, 0.5], [0.08, 0.4], [0.2, 0.44], 0.07], [[1.03, 0.55], [0.92, 0.42], [0.8, 0.38], 0.07],
    [[0.3, 1.04], [0.38, 0.9], [0.5, 0.86], 0.06], [[0.7, 1.04], [0.62, 0.92], [0.55, 0.88], 0.05],
  ].map(([a, m, b, w]) => ({ a: { x: a[0] * W, y: a[1] * H }, m: { x: m[0] * W, y: m[1] * H }, b: { x: b[0] * W, y: b[1] * H }, w: w * U * 1.5 }));
  const qb = (L, t) => ({ x: (1 - t) * (1 - t) * L.a.x + 2 * (1 - t) * t * L.m.x + t * t * L.b.x, y: (1 - t) * (1 - t) * L.a.y + 2 * (1 - t) * t * L.m.y + t * t * L.b.y });
  const tree = ctx.add(new PIXI.Container(), 'front');
  const tg = tree.addChild(new PIXI.Graphics());
  const deco = tree.addChild(new PIXI.Container());
  const drawTree = (e) => {
    tg.clear();
    for (const L of limbs) {
      const n = 26, m = Math.max(1, Math.floor(n * e));
      // ink outline -> bark -> one-sided highlight (a centred stripe read as a glowing pipe)
      for (const pass of [0, 1, 2]) {
        let prev = qb(L, 0);
        for (let k = 1; k <= m; k++) {
          const q = qb(L, k / n), wd = L.w * (1 - 0.8 * k / n);
          const dl = Math.hypot(q.x - prev.x, q.y - prev.y) || 1, ox = pass === 2 ? -(q.y - prev.y) / dl * wd * 0.22 : 0, oy = pass === 2 ? (q.x - prev.x) / dl * wd * 0.22 : 0;
          tg.moveTo(prev.x + ox, prev.y + oy).lineTo(q.x + ox, q.y + oy);
          tg.stroke(pass === 0 ? { width: wd + U * 0.012, color: 0x120a06, cap: 'round' }
            : pass === 1 ? { width: wd, color: bark, cap: 'round' } : { width: wd * 0.22, color: barkHi, alpha: 0.55, cap: 'round' });
          prev = q;
        }
      }
    }
  };
  // twigs + blossom clusters pop out along each limb as it grows
  const buds = [];
  limbs.forEach((L, li) => [0.45, 0.75, 1].forEach((t, k) => {
    const q = qb(L, t), q2 = qb(L, Math.max(0, t - 0.05)), ang = Math.atan2(q.y - q2.y, q.x - q2.x);
    let tw = null;
    if (ctx.has('branch') && k < 2) { tw = deco.addChild(spr(ctx, 'branch', mix(0xffffff, c.mid, 0.4))); tw.anchor.set(0.05, 0.95); tw.position.set(q.x, q.y); tw.rotation = ang + (k ? 0.6 : -1.2) + Math.PI / 4; tw.scale.set(0); }
    const cl = deco.addChild(new PIXI.Container()); cl.position.set(q.x, q.y); cl.scale.set(0);
    const gl = cl.addChild(spr(ctx, 'soft', c.glow, 'add', 0.5)); setSize(gl, U * 0.16);
    for (let j = 0; j < 5; j++) { const pp = cl.addChild(spr(ctx, petal, j % 2 ? c.mid : c.core)); setSize(pp, U * 0.035); pp.position.set(Math.cos(j * 1.26) * U * 0.025, Math.sin(j * 1.26) * U * 0.025); pp.rotation = j * 1.26 + Math.PI / 2; }
    buds.push({ t, tw, cl, li });
  }));
  await ctx.tween(1100, (e) => {
    drawTree(e);
    for (const bd of buds) { const q = clamp((e - bd.t) / 0.15 + 1, 0, 1); const s = ease.outBack(q); if (bd.tw) setSize(bd.tw, U * 0.16 * s); bd.cl.scale.set(s); }
    vig.alpha = 0.35 + 0.25 * e; ctx.shake(4, 80);
  }, ease.outCubic);
  ctx.sfx.crack();
  // tightening creak
  await ctx.tween(300, (e) => { tree.scale.set(1 + 0.02 * Math.sin(e * Math.PI)); tree.pivot.set(W / 2 * 0.02 * Math.sin(e * Math.PI), H / 2 * 0.02 * Math.sin(e * Math.PI)); });

  // ---- petal storm while the caster closes in ----
  ctx.sfx.wind(2); ctx.sfx.chime();
  const storm = ctx.emitter({ x: () => ctx.rand(-0.1, 1.1) * W, y: -20, rate: 70, duration: 1800, tex: petal, blend: 'normal', angle: [Math.PI * 0.2, Math.PI * 0.6],
    speed: [120, 320], life: [1500, 2500], size: [U * 0.035, U * 0.03], color: [c.core, c.mid, c.outer], spin: [-4, 4], gravity: 40, layer: 'front' });
  await ctx.wait(800);
  // a kunai rushes out of the bound victim's blind spot at the lens
  const kn = ctx.add(spr(ctx, ctx.has('kunai') ? 'kunai' : 'shard', 0xffffff), 'front');
  const f = ctx.anchor('face');
  ctx.sfx.slash(); ctx.sfx.whoosh(0.3);
  await ctx.tween(320, (e) => { kn.position.set(lerp(f.x + U * 0.2, W / 2 + U * 0.05, e), lerp(f.y + U * 0.05, H / 2, e)); kn.rotation = -0.5 + e * 0.2; setSize(kn, U * (0.1 + 0.8 * e * e)); kn.scale.y = kn.scale.x; }, ease.inCubic);
  // ---- the illusion shatters ----
  ctx.sfx.boom(0.6); ctx.sfx.crack();
  ctx.flash(c.core, 140, 0.6); ctx.shake(16, 400); ctx.zoomPunch(0.07, 300);
  const zb = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength: 0.2, center: { x: W / 2, y: H / 2 }, innerRadius: U * 0.15 }));
  kn.destroy();
  ctx.burst({ x: W / 2, y: H / 2, count: 60, tex: petal, blend: 'normal', speed: [300, 900], life: [900, 1500], size: [U * 0.04, U * 0.03], color: [c.core, c.mid], drag: 1.5, spin: [-5, 5], gravity: 80, layer: 'front' });
  storm.stop();
  await ctx.tween(700, (e) => { zb.strength = 0.2 * (1 - e); tree.alpha = 1 - e; tree.scale.set(1 + 0.08 * e); tree.pivot.set(W / 2 * 0.08 * e, H / 2 * 0.08 * e); vig.alpha = 0.6 * (1 - e); }, ease.outCubic);
  ctx.removeFilter(zb);
  await ctx.wait(800);
}

const IDENT = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
// greyscale, then negative (offsets are 0..1 in pixi's colour matrix)
// ...with contrast x1.4 around mid-grey so the red sky reads deep and shadows go black
const INV_GREY = [-0.42, -0.826, -0.154, 0, 1.2, -0.42, -0.826, -0.154, 0, 1.2, -0.42, -0.826, -0.154, 0, 1.2, 0, 0, 0, 1, 0];

async function genTsukuyomi(ctx, c, U) {
  const { PIXI, ease } = ctx, W = ctx.W, H = ctx.H;
  const face = () => ctx.anchor('face');

  // ---- anticipation: the eyes lock on — a red sigil spins up at the face ----
  ctx.sfx.ominous(2.2);
  const dim = ctx.tint(0x000000, 0, 'normal');
  const eye = ctx.add(new PIXI.Container(), 'fx');
  const er = eye.addChild(spr(ctx, 'circle1', c.mid, 'add', 0));
  const eg = eye.addChild(spr(ctx, 'soft', c.glow, 'add', 0));
  const ticks = eye.addChild(new PIXI.Graphics());
  for (let k = 0; k < 6; k++) {               // six thin curved blades (original pinwheel sigil)
    const a = k * TAU / 6;
    ticks.poly([Math.cos(a) * 14, Math.sin(a) * 14, Math.cos(a + 0.5) * 50, Math.sin(a + 0.5) * 50, Math.cos(a + 0.25) * 30, Math.sin(a + 0.25) * 30]).fill(0x000000);
  }
  ticks.circle(0, 0, 14).fill(0x000000).circle(0, 0, 6).fill(c.mid);
  ticks.circle(0, 0, 58).stroke({ width: 4, color: c.mid });
  await ctx.tween(800, (e, raw) => {          // sigil snaps open fast, then spins up toward the release
    const f = face(); eye.position.set(f.x, f.y - U * 0.02);
    setSize(er, U * 0.22 * e); er.alpha = e; setSize(eg, U * (0.3 + 0.15 * raw * raw)); eg.alpha = 0.7 * e;
    ticks.scale.set(U * 0.0011 * e); ticks.rotation = raw * raw * 9;
    dim.set(0.4 * raw);
    if (raw > 0.5) ctx.zoomPunch(0.02 * raw, 120);
  }, ease.outCubic);

  // ---- release: the sigil rushes at the lens and the world turns inside out ----
  ctx.sfx.boom(0.8); ctx.sfx.bell();
  const twist = ctx.filter(new ctx.filters.TwistFilter({ radius: U * 0.9, angle: 0, padding: 20, offset: { x: face().x, y: face().y } }));
  const cm = ctx.filter(new PIXI.ColorMatrixFilter());
  const setCM = (k) => { cm.matrix = IDENT.map((v, i) => lerp(v, INV_GREY[i], k)); };
  ctx.flash(c.mid, 140, 0.6);
  ctx.shake(14, 400);
  setCM(1);                                   // hard cut under the flash: lerping the matrix passes through flat grey
  const sky = ctx.tint(c.mid, 0.8, 'multiply');  // red sky lands with the cut, else the inverted room reads as blank grey
  await ctx.tween(450, (e) => {
    const f = face(); eye.position.set(f.x, f.y);
    eye.scale.set(1 + e * 9); eye.alpha = 1 - e; eye.rotation = e * 2;
    twist.angle = Math.sin(e * Math.PI) * 4;
  }, ease.inCubic);
  eye.destroy({ children: true });
  ctx.removeFilter(twist);
  dim.set(0);
  const split = ctx.filter(new ctx.filters.RGBSplitFilter({ red: { x: -6, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 6, y: 0 } }));

  // red sky + black moon live on the overlay so the inverted-grey matrix does not touch them
  const bands = ctx.add(new PIXI.Graphics(), 'overlay');
  for (let k = 0; k < 10; k++) bands.rect(0, k * H * 0.06, W, H * 0.06).fill({ color: c.outer, alpha: 0.45 * (1 - k / 10) });
  bands.blendMode = 'multiply';
  const clouds = ctx.add(new PIXI.Container(), 'overlay');
  const cl = Array.from({ length: 7 }, (_, k) => {
    const s = clouds.addChild(spr(ctx, SMOKES[k % SMOKES.length], c.dark, 'normal', 0.6));
    s.width = U * ctx.rand(0.6, 1.1); s.height = U * ctx.rand(0.12, 0.2); s.position.set(ctx.rand(0, W), ctx.rand(0.05, 0.45) * H);
    return { s, v: ctx.rand(400, 900) };
  });
  const moon = ctx.add(new PIXI.Container(), 'overlay');
  const mh = moon.addChild(spr(ctx, 'soft', c.glow, 'add', 0.85)); setSize(mh, U * 0.75);
  const mring = moon.addChild(spr(ctx, 'circle1', c.core, 'add', 0.6)); setSize(mring, U * 0.38);
  const md = moon.addChild(new PIXI.Graphics());
  md.circle(0, 0, U * 0.172).fill({ color: c.glow, alpha: 0.9 }).circle(0, 0, U * 0.16).fill(0x000000).circle(-U * 0.04, -U * 0.04, U * 0.11).fill({ color: c.dark, alpha: 0.6 });
  moon.position.set(W * 0.76, -U * 0.2);
  const vig = vignette(ctx, 0x000000); vig.alpha = 0.7;
  ctx.sfx.hum(3, 50); ctx.sfx.ominous(3);

  // ---- torment: days pass in a blink — clouds race, the moon flickers, the image tears ----
  let tGlitch = 0;
  await ctx.tween(2900, (e, raw) => {
    moon.y = lerp(-U * 0.2, H * 0.24, ease.outCubic(clamp(raw * 3, 0, 1)));
    const day = Math.floor(raw * 8), within = raw * 8 - day;
    const pulse = within < 0.12 ? 1 - within / 0.12 : 0;           // each "day" passes as a flicker
    mh.alpha = 0.6 + 0.4 * pulse; sky.set(0.75 + 0.2 * pulse);
    for (const o of cl) { o.s.x += o.v * 0.016 * (1 + raw * 2); if (o.s.x > W + o.s.width) o.s.x = -o.s.width; }
    const amp = 4 + 10 * pulse + 3 * Math.sin(raw * 40);
    split.red = { x: -amp, y: pulse * 3 }; split.blue = { x: amp, y: -pulse * 3 };
    if (pulse > 0.9 && raw - tGlitch > 0.05) { tGlitch = raw; ctx.shake(6, 150); ctx.sfx.crack(); }
  });

  // ---- release back to reality ----
  ctx.sfx.boom(0.6); ctx.sfx.zap();
  ctx.flash(0xffffff, 110, 0.6);
  setCM(0);
  await ctx.tween(300, (e) => { sky.set(0.8 * (1 - e)); bands.alpha = 1 - e; moon.alpha = 1 - e; clouds.alpha = 1 - e; split.red = { x: -20 * (1 - e), y: 0 }; split.blue = { x: 20 * (1 - e), y: 0 }; });
  ctx.removeFilter(cm); ctx.removeFilter(split);
  const red = vignette(ctx, c.mid); red.alpha = 0.5;
  await ctx.tween(700, (e) => { red.alpha = 0.5 * (1 - e); vig.alpha = 0.7 * (1 - e); });
}

/**
 * genjutsu — illusions that hijack the viewer's senses.
 * params: palette, variant 'crows' (default palette shadow) | 'petals' (sakura) | 'tsukuyomi' (genjutsu), scale
 */
async function genjutsu(ctx, p) {
  const v = p.variant || 'crows';
  const pal = p.palette || { crows: 'shadow', petals: 'sakura', tsukuyomi: 'genjutsu' }[v] || 'genjutsu';
  const c = ctx.palette(pal), U = unit(ctx) * (p.scale ?? 1);
  if (v === 'petals') return genPetals(ctx, c, U);
  if (v === 'tsukuyomi') return genTsukuyomi(ctx, c, U);
  return genCrows(ctx, c, U);
}

export const EFFECTS = { dragon, sealing, genjutsu };
