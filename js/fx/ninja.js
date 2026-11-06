// Ninja-technique archetypes: shadowClone, substitution, transformation, smokeEscape, shadowPossession.
// All of them work off the person cutout (ctx.personSprite) and fall back to a drawn silhouette.
// Shared building blocks: poof() (the white "pop" cloud), gather() (chakra converging on an anchor),
// bodyKit() (person sprites / clones), tendril drawing for shadow jutsu.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// ctx.pick([a, b]) is a numeric range, not a choice — use this to pick one element
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerpC = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | (ab + ((b & 255) - ab) * t);
};

// ---------- procedural textures (cached per page) ----------
const TEX = {};
function canvasTex(ctx, key, w, h, draw) {
  if (TEX[key] && !TEX[key].destroyed) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return (TEX[key] = ctx.PIXI.Texture.from(c));
}
const leafTex = (ctx) => canvasTex(ctx, 'ninja-leaf', 64, 32, (g, w, h) => {
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(2, h / 2); g.quadraticCurveTo(w * 0.45, -h * 0.25, w - 2, h / 2); g.quadraticCurveTo(w * 0.45, h * 1.25, 2, h / 2); g.fill();
  g.strokeStyle = 'rgba(120,120,120,.8)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(4, h / 2); g.lineTo(w - 6, h / 2); g.stroke();
  g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { const x = (w * i) / 5.5; g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 7, h / 2 - 7); g.moveTo(x, h / 2); g.lineTo(x + 7, h / 2 + 7); g.stroke(); }
});
const vignetteTex = (ctx) => canvasTex(ctx, 'ninja-vignette', 256, 256, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, s * 0.22, s / 2, s / 2, s * 0.72);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(0.55, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const kunaiTex = (ctx) => canvasTex(ctx, 'ninja-kunai', 160, 40, (g, w, h) => {
  const m = h / 2;
  g.strokeStyle = '#2a2a30'; g.lineWidth = 4; g.beginPath(); g.arc(12, m, 8, 0, 7); g.stroke();      // ring
  g.fillStyle = '#3a2a22'; g.fillRect(20, m - 5, 50, 10);                                          // grip
  g.strokeStyle = '#d8c8a8'; g.lineWidth = 2;
  for (let x = 24; x < 70; x += 7) { g.beginPath(); g.moveTo(x, m - 5); g.lineTo(x + 5, m + 5); g.stroke(); }
  const bl = g.createLinearGradient(0, m - 14, 0, m + 14);
  bl.addColorStop(0, '#e8eef4'); bl.addColorStop(0.5, '#8a96a4'); bl.addColorStop(1, '#4a5260');
  g.fillStyle = bl; g.beginPath(); g.moveTo(70, m - 4); g.lineTo(88, m - 14); g.lineTo(w - 2, m); g.lineTo(88, m + 14); g.lineTo(70, m + 4); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(80, m); g.lineTo(w - 8, m); g.stroke();
});
const logTex = (ctx) => canvasTex(ctx, 'ninja-log', 180, 440, (g, w, h) => {
  const x0 = 16, x1 = w - 16, top = 34, cap = 26;
  const body = g.createLinearGradient(x0, 0, x1, 0);
  body.addColorStop(0, '#3a2414'); body.addColorStop(0.3, '#8a5a32'); body.addColorStop(0.55, '#a8743e'); body.addColorStop(1, '#2e1c10');
  g.fillStyle = body;
  g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + 3, h - 14); g.quadraticCurveTo(w / 2, h + 6, x1 - 3, h - 14); g.lineTo(x1, top); g.closePath(); g.fill();
  // bark grooves
  g.strokeStyle = 'rgba(30,16,8,.75)'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    let x = x0 + 10 + i * ((x1 - x0 - 20) / 8); g.beginPath(); g.moveTo(x, top + 10);
    for (let y = top + 10; y < h - 20; y += 30) { x += Math.sin(y * 0.05 + i * 2) * 4; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(220,170,110,.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { const x = x0 + 18 + i * 20; g.beginPath(); g.moveTo(x, top + 30 + i * 13); g.lineTo(x + 2, top + 110 + i * 31); g.stroke(); }
  // knots
  for (const [kx, ky, kr] of [[w * 0.62, h * 0.42, 13], [w * 0.36, h * 0.7, 9]]) {
    g.fillStyle = '#2a170a'; g.beginPath(); g.ellipse(kx, ky, kr, kr * 1.5, 0, 0, 7); g.fill();
    g.strokeStyle = '#6a4424'; g.lineWidth = 3; g.beginPath(); g.ellipse(kx, ky, kr + 4, kr * 1.5 + 5, 0, 0, 7); g.stroke();
  }
  // branch stub
  g.fillStyle = '#5a3a1e'; g.beginPath(); g.moveTo(x1 - 2, h * 0.28); g.lineTo(w - 1, h * 0.25); g.lineTo(w - 1, h * 0.31); g.lineTo(x1 - 2, h * 0.33); g.fill();
  // cut face on top with growth rings
  g.fillStyle = '#d8b07a'; g.beginPath(); g.ellipse(w / 2, top, (x1 - x0) / 2, cap, 0, 0, 7); g.fill();
  g.strokeStyle = 'rgba(120,70,30,.6)'; g.lineWidth = 2;
  for (let k = 0.25; k < 1; k += 0.22) { g.beginPath(); g.ellipse(w / 2 + 3, top + 1, ((x1 - x0) / 2) * k, cap * k, 0, 0, 7); g.stroke(); }
  g.strokeStyle = '#4a2c14'; g.lineWidth = 5; g.beginPath(); g.ellipse(w / 2, top, (x1 - x0) / 2, cap, 0, 0, 7); g.stroke();
});

/** Real sprite asset when it loaded, else the procedural stand-in. */
const texOr = (ctx, name, fb) => (ctx.has(name) ? ctx.tex(name) : fb(ctx));
const leafT = (ctx) => texOr(ctx, 'leaf', leafTex);
// the real leaf sprite is already green, so tint it lightly; the procedural one is white
const leafTints = (ctx) => (ctx.has('leaf') ? [0xffffff, 0xe6ffa8, 0xc4e07a, 0xffe9a0] : LEAF_COLORS);
/** An upright asset (kunai / leaf, tip at the top) laid along +x, so rotation = direction it points. tipAx: anchor along the length. */
function pointer(ctx, name, fb, tipAx = 0.92) {
  const C = new ctx.PIXI.Container();
  if (ctx.has(name)) { const s = spr(ctx, name, { ax: 0.5, ay: 1 - tipAx }); s.rotation = Math.PI / 2; C.addChild(s); }
  else C.addChild(spr(ctx, fb(ctx), { ax: tipAx }));
  return C;
}

// ---------- body helpers ----------
/** face/head metrics in screen px; d = face-to-mouth distance (scales everything head-related). */
function head(ctx) {
  const f = ctx.anchor('face'), m = ctx.anchor('mouth');
  const d = clamp(m.y - f.y, 16, ctx.H * 0.2);
  return { x: f.x, y: f.y, d, top: f.y - 2.4 * d, hw: 1.75 * d, mx: m.x, my: m.y };
}
function torso(ctx) {
  const f = ctx.anchor('face'), h = ctx.anchor('hands');
  return { x: (f.x + h.x) / 2, y: lerp(f.y, h.y, 0.55) };
}
/** Drawn stand-in for the person when segmentation is unavailable. */
function silhouette(ctx, color = 0x3a4250) {
  const hd = head(ctx), g = ctx.g(), H = ctx.H;
  g.ellipse(hd.x, hd.y - 0.35 * hd.d, hd.hw * 1.15, hd.d * 2.25).fill(color);
  g.moveTo(hd.x - hd.hw * 3.4, H).quadraticCurveTo(hd.x - hd.hw * 3.2, hd.y + hd.d * 3.1, hd.x, hd.y + hd.d * 2.9)
    .quadraticCurveTo(hd.x + hd.hw * 3.2, hd.y + hd.d * 3.1, hd.x + hd.hw * 3.4, H).closePath().fill(color);
  return g;
}
/** make() -> a new display object of the user (cutout or silhouette); real() -> cutout of the user or null. */
async function bodyKit(ctx) {
  const ok = await ctx.personReady();
  return {
    ok,
    make: () => (ok && ctx.personSprite()) || silhouette(ctx),
    real: () => (ok ? ctx.personSprite() : null),
  };
}
/** A copy of the user scaled k about the bottom-centre of the screen and shifted dx/dy. */
function cloneBody(ctx, kit, dx, k, dy = 0) {
  const c = new ctx.PIXI.Container();
  c.addChild(kit.make());
  c.pivot.set(ctx.W / 2, ctx.H);
  c.position.set(ctx.W / 2 + dx, ctx.H + dy);
  c.scale.set(k);
  return c;
}
/** where a screen point of the user lands on a clone */
const onClone = (ctx, pt, dx, k, dy = 0) => ({ x: ctx.W / 2 + dx + (pt.x - ctx.W / 2) * k, y: ctx.H + dy + (pt.y - ctx.H) * k });

function spr(ctx, tex, o = {}) {
  const s = new ctx.PIXI.Sprite(typeof tex === 'string' ? ctx.tex(tex) : tex);
  s.anchor.set(o.ax ?? 0.5, o.ay ?? 0.5);
  if (o.tint != null) s.tint = o.tint;
  s.blendMode = o.blend || 'normal';
  if (o.alpha != null) s.alpha = o.alpha;
  return s;
}

// ---------- shared VFX ----------
/** The anime "pop" cloud: puffy white smoke with a shaded underside, a ring of small puffs, speed lines. */
function poof(ctx, x, y, r, o = {}) {
  const n = o.n ?? 1, layer = o.layer || 'fx', life = o.life ?? 1;
  const light = o.color ?? 0xffffff, shade = o.shade ?? 0xe6e6ee, deep = o.deep ?? 0xb0b0bc;
  const cnt = (k) => Math.max(2, Math.round(k * n));
  // shaded back puffs, bright fluffy body, fast outer puffs (dense Kenney smoke reads as a solid anime cloud)
  ctx.burst({ x, y, layer, tex: 'smoke6', blend: 'normal', count: cnt(7), radius: [0, r * 0.35], speed: [r * 1, r * 2.4], drag: 3.2,
    life: [1000 * life, 1600 * life], size: [r * 0.95, r * 1.75], alpha: [1.2, 0], color: [shade, deep], spin: [-0.5, 0.5] });
  ctx.burst({ x, y, layer, tex: 'smoke4', blend: 'normal', count: cnt(11), radius: [0, r * 0.3], speed: [r * 1.6, r * 3.8], drag: 4,
    life: [700 * life, 1300 * life], size: [r * 0.75, r * 1.4], alpha: [1.8, 0], color: [light, light, shade], spin: [-0.9, 0.9] });
  ctx.burst({ x, y, layer, tex: 'smoke2', blend: 'normal', count: cnt(9), radius: [r * 0.2, r * 0.4], speed: [r * 4, r * 7], drag: 5,
    life: [400 * life, 750 * life], size: [r * 0.35, r * 0.7], alpha: [1.5, 0], color: [light, shade], spin: [-2, 2] });
  // Kenney smoke is mid-grey; a soft screen-blended glaze on top makes the cloud read as a bright anime pop, not a grey blob
  ctx.burst({ x, y, layer, tex: 'soft', blend: 'screen', count: cnt(4), radius: [0, r * 0.3], speed: [r * 0.6, r * 1.5], drag: 3,
    life: [600 * life, 900 * life], size: [r * 1.0, r * 1.4], alpha: [o.glaze ?? 0.55, 0], color: light });
  ctx.burst({ x, y, layer, tex: 'spark', count: cnt(7), radius: r * 0.35, speed: [r * 6, r * 10], drag: 3, life: [140, 260],
    size: [Math.min(r * 0.3, 70), 8], alpha: [0.75, 0], color: light, rotateToVelocity: true, stretch: 0.1 });
  const ring = spr(ctx, 'smoke10', { tint: light }); ctx.add(ring, layer);
  ring.position.set(x, y); ring.rotation = Math.random() * 6;
  ctx.tween(520 * life, (p) => { ring.width = ring.height = r * (0.6 + p * 2.6); ring.alpha = 1.1 * (1 - p); }, ctx.ease.outCubic).then(() => ring.destroy());
  const f = spr(ctx, 'soft', { tint: light, blend: 'add' }); ctx.add(f, layer);
  f.position.set(x, y);
  ctx.tween(200, (p) => { f.width = f.height = r * (0.6 + p * 1.6); f.alpha = 0.7 * (1 - p); }, ctx.ease.outCubic).then(() => f.destroy());
}
/** Slow wisps that linger after a poof. */
function linger(ctx, x, y, r, ms, o = {}) {
  return ctx.emitter({ x, y, layer: o.layer || 'fx', tex: 'smoke5', blend: 'normal', rate: o.rate ?? 10, duration: ms, radius: [0, r * 0.6],
    speed: [10, 40], angle: [-Math.PI * 0.85, -Math.PI * 0.15], life: [900, 1600], size: [r * 0.5, r * 1.1], alpha: [o.alpha ?? 0.45, 0],
    color: [o.color ?? 0xe8e8ee, o.shade ?? 0x9a9aa4], spin: [-0.4, 0.4], accel: [o.drift ?? 0, -10] });
}
/** Chakra converging on an anchor: shrinking ring + streaks spiralling inward + growing core. */
async function gather(ctx, c, ms, at, o = {}) {
  const { PIXI, ease } = ctx;
  const C = new PIXI.Container(); ctx.add(C, o.layer || 'fx');
  const R = (o.r ?? 1) * ctx.handScale();
  const blend = o.blend || 'add';
  const ring = spr(ctx, 'circle2', { tint: c.mid, blend }); C.addChild(ring);
  const ring2 = spr(ctx, 'twirl1', { tint: c.glow, blend }); C.addChild(ring2);
  const core = spr(ctx, o.coreTex || 'light1', { tint: c.core, blend }); C.addChild(core);
  const wisps = Array.from({ length: 18 }, () => {
    const s = spr(ctx, 'spark', { tint: Math.random() < 0.5 ? c.accent : c.mid, blend }); C.addChild(s);
    return { s, a: Math.random() * Math.PI * 2, d: ctx.rand(1.6, 3.2) * R, delay: ctx.rand(0, 0.45), len: ctx.rand(0.6, 1.2) };
  });
  ctx.sfx.charge(ms / 1000);
  await ctx.tween(ms, (p, raw) => {
    const A = at(); C.position.set(A.x, A.y);
    ring.width = ring.height = lerp(R * 4.5, R * 1.1, p); ring.alpha = 0.15 + 0.6 * p;
    ring2.width = ring2.height = lerp(R * 3.4, R * 1.4, p); ring2.rotation = raw * 5; ring2.alpha = 0.6 * p;
    core.width = core.height = R * (0.6 + 2 * p * p); core.alpha = 0.3 + 0.7 * p;
    for (const w of wisps) {
      const q = clamp((raw - w.delay) / (1 - w.delay), 0, 1);
      const a = w.a + q * 2.2, d = w.d * (1 - ease.inCubic(q));
      w.s.position.set(Math.cos(a) * d, Math.sin(a) * d);
      w.s.rotation = a; w.s.width = R * w.len * (0.4 + q); w.s.height = R * 0.12;
      w.s.alpha = Math.sin(q * Math.PI);
    }
  }, ease.inCubic);
  C.destroy({ children: true });
}

// ---------- shadowClone ----------
// [dx (×W), scale, dy (×H), row] — row 0 is the front row; rows are drawn back to front.
const SLOTS = [[-0.27, 0.88, 0, 0], [0.27, 0.88, 0, 0], [-0.43, 0.72, 0, 1], [0.43, 0.72, 0, 1], [-0.13, 0.62, -0.13, 2], [0.13, 0.62, -0.13, 2],
  [-0.36, 0.55, -0.2, 3], [0.36, 0.55, -0.2, 3], [-0.47, 0.5, -0.26, 4], [0.47, 0.5, -0.26, 4]];
/**
 * shadowClone — sign at the hands, poof clouds pop and solid copies of the user stand beside them.
 * params: palette (chakra), variant 'clone' | 'multi' | 'explode', count (2 / 6 / 2), scale
 */
async function shadowClone(ctx, p) {
  const { PIXI, ease } = ctx;
  const variant = p.variant || 'clone';
  const c = ctx.palette(p.palette || 'chakra');
  const n = clamp(Math.round(p.count ?? (variant === 'multi' ? 6 : 2)), 1, SLOTS.length);
  const scale = p.scale ?? 1;
  const kit = await bodyKit(ctx);

  // 1. Anticipation: chakra converges on the cross-shaped sign.
  await gather(ctx, c, 550, () => ctx.anchor('hands'));

  // 2. Release: every clone pops out of its own cloud.
  const W = ctx.W, H = ctx.H, T0 = torso(ctx);
  const slots = SLOTS.slice(0, n).map(([dx, k, dy, row], i) => ({ dx: dx * W, k, dy: dy * H, row, i }));
  const order = [...slots].sort((a, b) => b.row - a.row);
  const clones = order.map((s) => {
    const body = cloneBody(ctx, kit, s.dx, s.k, s.dy);
    body.children[0].tint = lerpC(0xf2f6ff, 0x7a8294, s.row / 4);
    body.alpha = 0; ctx.add(body, 'clones');
    return { ...s, body, alive: true };
  });
  const me = kit.real(); if (me) ctx.add(me, 'clones');        // the real user stays in front of the clones
  ctx.sfx.poof(); ctx.sfx.boom(0.35);
  ctx.flash(0xffffff, 140, 0.35); ctx.shake(8 * scale, 380); ctx.zoomPunch(0.04, 300);
  const density = Math.min(1, 3 / n);
  for (const cl of [...clones].sort((a, b) => a.i - b.i)) {
    (async () => {
      await ctx.wait(cl.i * 55);
      const at = onClone(ctx, T0, cl.dx, cl.k, cl.dy);
      poof(ctx, at.x, at.y - H * 0.08 * cl.k, H * 0.4 * cl.k * scale, { n: density * 1.2 });
      if (cl.i > 1 && cl.i < 5) ctx.sfx.poof();
      await ctx.wait(80);
      await ctx.tween(320, (q) => { cl.body.alpha = Math.min(1, q * 3); cl.body.scale.set(cl.k * (1.1 - 0.1 * q)); }, ease.outBack);
      linger(ctx, at.x, H - H * 0.08, H * 0.18 * cl.k, 1400, { rate: 6 * density });
    })();
  }
  // idle sway so clones read as separate bodies, not a mirror
  ctx.tick((dt, t) => {
    for (const cl of clones) {
      if (!cl.alive) continue;
      cl.body.x = W / 2 + cl.dx + Math.sin(t * 0.0026 + cl.i * 1.9) * 6 * cl.k;
      cl.body.y = H + cl.dy - Math.abs(Math.sin(t * 0.004 + cl.i)) * 4 * cl.k;
      cl.body.rotation = Math.sin(t * 0.0018 + cl.i * 2.3) * 0.012;
    }
  });
  await ctx.wait(1000 + n * 55);

  if (variant === 'explode') {
    // 3a. Clones swell and glow, then blow up one after another.
    const fire = ctx.palette('fire');
    ctx.sfx.charge(0.6); ctx.sfx.sizzle(0.8);
    const glows = clones.map((cl) => {
      const at = onClone(ctx, T0, cl.dx, cl.k, cl.dy);
      const gl = spr(ctx, 'light1', { tint: fire.glow, blend: 'add', alpha: 0 }); gl.position.set(at.x, at.y); ctx.add(gl);
      ctx.emitter({ x: at.x, y: at.y, rate: 40 * density, duration: 600, tex: 'spark', radius: [H * 0.05, H * 0.2 * cl.k], speed: [60, 200],
        angle: [-Math.PI, 0], life: [250, 450], size: [26, 6], color: [fire.core, fire.mid], rotateToVelocity: true });
      return { gl, at };
    });
    await ctx.tween(750, (q, raw) => {
      clones.forEach((cl, j) => {
        cl.body.children[0].tint = lerpC(0xf2f6ff, 0xffa060, q);
        cl.body.x += ctx.rand(-4, 4) * q;
        cl.body.scale.set(cl.k * (1 + 0.07 * q), cl.k * (1 + 0.05 * q));   // swelling with chakra
        glows[j].gl.width = glows[j].gl.height = H * 0.85 * cl.k * (0.4 + q) * (1 + 0.2 * Math.sin(raw * 50));
        glows[j].gl.alpha = 0.3 + 0.7 * q;
      });
      if (raw > 0.5) ctx.shake(3 * raw, 60);
    }, (x) => x * x);
    const shock = ctx.filter(new ctx.filters.ShockwaveFilter({ center: { x: W / 2, y: H / 2 }, amplitude: 26, wavelength: 180, speed: 900, brightness: 1.15, radius: -1, time: 0 }));
    const sorted = [...clones].sort((a, b) => a.i - b.i);
    for (let j = 0; j < sorted.length; j++) {
      const cl = sorted[j], g = glows[clones.indexOf(cl)], at = g.at, r = H * (n === 1 ? 0.42 : 0.3) * cl.k * scale;
      cl.alive = false; cl.body.visible = false; g.gl.destroy();
      if (j === 0) { shock.center = { x: at.x, y: at.y }; ctx.tween(900, (q) => { shock.time = q * 0.9; }).then(() => ctx.removeFilter(shock)); }
      if (j < 4) { ctx.sfx.boom(0.8); ctx.sfx.rumble(0.8); }
      ctx.flash(fire.core, 110, j ? 0.2 : 0.35); ctx.shake(20 * scale, 750); ctx.zoomPunch(0.07, 340);
      // smoke first so the fireball draws over it (it muddied the core when drawn on top)
      ctx.burst({ x: at.x, y: at.y, tex: 'smoke7', blend: 'normal', count: Math.round(10 * density) + 4, radius: [0, r * 0.4], speed: [r * 0.8, r * 2], drag: 2,
        life: [1000, 1700], size: [r * 0.7, r * 1.5], color: [0x4a4038, 0x16141a], alpha: [0.85, 0], spin: [-0.5, 0.5], accel: [0, -40] });
      // fireball: a bright core that balloons out and darkens through the palette
      const ball = new PIXI.Container(); ball.position.set(at.x, at.y); ctx.add(ball);
      const layersB = ['fire1', 'flame3', 'light1'].map((t, i) => { const s = spr(ctx, t, { tint: [fire.outer, fire.mid, fire.core][i], blend: 'add' }); s.rotation = Math.random() * 6; ball.addChild(s); return s; });
      ctx.tween(800, (q) => {
        layersB.forEach((s, i) => { s.width = s.height = r * (0.6 + q * (3.2 - i * 0.7)); s.alpha = (1 - q) * (i === 2 ? 1 - q : 1); s.rotation += 0.02 * (i - 1); });
      }, ease.outCubic).then(() => ball.destroy({ children: true }));
      ctx.burst({ x: at.x, y: at.y, tex: 'fire1', count: Math.round(30 * density) + 8, radius: [0, r * 0.3], speed: [r * 1.5, r * 4.2], drag: 2.5,
        life: [450, 900], size: [r * 1.0, r * 0.25], color: [fire.core, fire.mid, fire.outer], alpha: [1, 0], spin: [-2, 2] });
      ctx.burst({ x: at.x, y: at.y, tex: 'flame2', count: Math.round(14 * density) + 4, radius: [0, r * 0.2], speed: [r * 0.5, r * 1.5], accel: [0, -r * 1.2], drag: 1.5,
        life: [700, 1200], size: [r * 0.7, r * 0.3], color: [fire.core, fire.mid, fire.dark], alpha: [0.9, 0], spin: [-1, 1] });
      const scorch = spr(ctx, 'scorch2', { tint: 0x120806, alpha: 0 }); scorch.position.set(at.x, H * 0.985); ctx.add(scorch, 'clones');
      ctx.tween(300, (q) => { scorch.width = r * 2.6; scorch.height = r * 0.6; scorch.alpha = 0.75 * q; });
      ctx.emitter({ x: () => at.x + ctx.rand(-r * 0.6, r * 0.6), y: H * 0.95, rate: 30 * density, duration: 1600, tex: 'spark', speed: [40, 160], angle: [-Math.PI * 0.7, -Math.PI * 0.3],
        life: [600, 1200], size: [14, 3], color: [fire.accent, fire.outer], accel: [0, -60], alpha: [1, 0] });
      ctx.burst({ x: at.x, y: at.y, tex: 'spark', count: Math.round(18 * density) + 4, speed: [r * 3, r * 7], drag: 1, gravity: 500,
        life: [400, 900], size: [30, 6], color: [fire.core, fire.accent], rotateToVelocity: true, stretch: 0.6 });
      const ring = spr(ctx, 'circle3', { tint: fire.mid, blend: 'add' }); ring.position.set(at.x, at.y); ctx.add(ring);
      ctx.tween(500, (q) => { ring.width = ring.height = r * (0.3 + q * 3); ring.alpha = 1 - q; }, ease.outCubic).then(() => ring.destroy());
      await ctx.wait(170);
    }
    await ctx.wait(1500);
    return;
  }

  // 3b. Follow-through: hold the formation, then the clones dispel back into smoke.
  await ctx.wait(variant === 'multi' ? 700 : 900);
  const sorted = [...clones].sort((a, b) => a.i - b.i);
  for (let j = 0; j < sorted.length; j++) {
    const cl = sorted[j], at = onClone(ctx, T0, cl.dx, cl.k, cl.dy);
    poof(ctx, at.x, at.y - H * 0.06 * cl.k, H * 0.32 * cl.k * scale, { n: density, life: 0.8 });
    if (j < 3) ctx.sfx.poof();
    ctx.tween(140, (q) => { cl.body.alpha = 1 - q; cl.body.scale.set(cl.k * (1 - 0.15 * q), cl.k * (1 + 0.05 * q)); }).then(() => { cl.alive = false; cl.body.visible = false; });
    await ctx.wait(85);
  }
  await ctx.wait(1100);
}

// ---------- substitution ----------
/**
 * substitution — a kunai flies at the user, POOF, a log stands where they were (with the kunai in it),
 * a second kunai thunks in, then the log topples over in a cloud of dust.
 * params: palette (smoke) for the cloud, scale
 */
async function substitution(ctx, p) {
  const { PIXI, ease } = ctx;
  const c = ctx.palette(p.palette || 'smoke');
  const scale = p.scale ?? 1;
  const W = ctx.W, H = ctx.H;
  const T0 = torso(ctx);

  // 1. Anticipation: sign glint + a kunai streaks in from the side.
  const kun = () => { const k = pointer(ctx, 'kunai', kunaiTex); k.width = H * 0.16; k.scale.y = k.scale.x; ctx.add(k, 'front'); return k; };
  const k1 = kun();
  const hitY = T0.y - H * 0.04;
  ctx.sfx.whoosh(0.4);
  const gp = gather(ctx, ctx.palette('chakra'), 420, () => ctx.anchor('hands'), { r: 0.7 });
  ctx.emitter({ x: () => k1.x, y: () => k1.y, rate: 90, duration: 420, tex: 'spark', speed: [10, 30], life: [120, 220], size: [H * 0.1, 10], color: 0xdde6f0, alpha: [0.7, 0], rotation: Math.PI, layer: 'front' });
  await ctx.tween(420, (q) => { k1.position.set(lerp(W + 60, T0.x + H * 0.03, q), lerp(hitY - H * 0.12, hitY, q)); k1.rotation = Math.PI + 0.25 * (1 - q); }, ease.inCubic);
  await gp;

  // 2. Release: POOF — when it clears, a log has taken the user's place.
  const r = H * 0.34 * scale;
  ctx.sfx.poof(); ctx.sfx.crack();
  poof(ctx, T0.x, T0.y, r, { n: 1.5, color: c.core, shade: c.mid, deep: c.outer });
  ctx.flash(0xffffff, 120, 0.4); ctx.shake(9 * scale, 350); ctx.zoomPunch(0.05, 280);
  const logC = new PIXI.Container(); ctx.add(logC, 'clones');
  const log = spr(ctx, ctx.has('log') ? ctx.tex('log') : logTex(ctx), { ax: 0.5, ay: 0.97 });
  const logH = H * 0.78 * scale; log.height = logH; log.scale.x = log.scale.y;
  logC.addChild(log);
  logC.position.set(T0.x, H * 0.68);
  logC.alpha = 0;
  ctx.tick(() => { logC.x += (torso(ctx).x - logC.x) * 0.1; });
  linger(ctx, () => logC.x, H * 0.92, r * 0.8, 1900, { rate: 9, color: c.core, shade: c.outer });
  await ctx.wait(60);
  // the log drops into the cloud and lands with a thud
  await ctx.tween(240, (q, raw) => { logC.alpha = Math.min(1, raw * 3); logC.y = lerp(H * 0.68, H, q); logC.rotation = 0.12 * (1 - q) + 0.04; }, ease.inCubic);
  ctx.sfx.boom(0.25); ctx.shake(7 * scale, 260);
  ctx.burst({ x: logC.x, y: H * 0.98, tex: 'smoke5', blend: 'normal', count: 12, radius: [0, H * 0.08], speed: [120, 320], angle: [-Math.PI * 0.95, -Math.PI * 0.05], drag: 3,
    life: [500, 900], size: [H * 0.1, H * 0.22], color: [0xd8ccb8, 0x8a7a6a], alpha: [0.8, 0], spin: [-1, 1] });
  // kunai #1 is now stuck in the log
  k1.removeFromParent(); logC.addChild(k1); k1.position.set(H * 0.03, hitY - H); k1.rotation = Math.PI + 0.08;
  await ctx.tween(240, (q) => { log.scale.y = log.scale.x * (1 - 0.1 * Math.sin(q * Math.PI)); }, ease.outCubic);

  // 3. Follow-through: second kunai thunk, then the log topples in dust.
  await ctx.wait(350);
  const k2 = kun();
  await ctx.tween(130, (q) => { k2.position.set(lerp(-60, logC.x - H * 0.02, q), lerp(H * 0.45, H * 0.58, q)); k2.rotation = 0.12; }, ease.inCubic);
  k2.removeFromParent(); logC.addChild(k2); k2.position.set(-H * 0.02, H * 0.58 - H); k2.rotation = 0.12;
  ctx.sfx.crack(); ctx.shake(6, 250);
  const chips = (x, y, a) => ctx.burst({ x, y, tex: 'dirt1', blend: 'normal', count: 14, speed: [120, 380], angle: [a - 0.7, a + 0.7], gravity: 900, life: [400, 800],
    size: [H * 0.05, H * 0.02], color: [0xb07a44, 0x5a3a1e], alpha: [1, 0.6], spin: [-8, 8], layer: 'front' });
  chips(logC.x - H * 0.02, H * 0.58, Math.PI + 0.3);
  await ctx.wait(700);
  ctx.sfx.whoosh(0.5);
  const dir = logC.x < W / 2 ? 1 : -1;
  await ctx.tween(520, (q) => { logC.rotation = 0.04 + dir * 1.45 * q; }, ease.inCubic);
  ctx.sfx.boom(0.35); ctx.sfx.rumble(0.5);
  ctx.shake(12 * scale, 450);
  ctx.burst({ x: logC.x + dir * logH * 0.5, y: H * 0.97, tex: 'smoke5', blend: 'normal', count: 22, radius: [0, logH * 0.5], speed: [80, 260],
    angle: [-Math.PI, 0], drag: 2.5, life: [700, 1300], size: [H * 0.12, H * 0.3], color: [0xc8b8a0, 0x7a6a5a], alpha: [0.8, 0], spin: [-1, 1] });
  chips(logC.x + dir * logH * 0.4, H * 0.95, -Math.PI / 2);
  await ctx.tween(140, (q) => { logC.rotation = dir * (1.49 - 0.06 * Math.sin(q * Math.PI)); });
  await ctx.wait(350);
  await ctx.tween(500, (q) => { logC.alpha = 1 - q; });
  await ctx.wait(300);
}

// ---------- transformation ----------
/** Decorations drawn in units of d around the face anchor (0,0). */
function animalDeco(ctx, d) {
  const g = ctx.g(), fur = 0xd9822b, dark = 0x3a2010;
  for (const s of [-1, 1]) {
    const bx = s * 1.05 * d, by = -2.05 * d;
    g.poly([bx - s * 0.6 * d, by + 0.15 * d, bx + s * 0.55 * d, by + 0.05 * d, bx + s * 0.35 * d, by - 1.55 * d]).fill(fur);
    g.poly([bx - s * 0.3 * d, by + 0.05 * d, bx + s * 0.3 * d, by, bx + s * 0.28 * d, by - 1.0 * d]).fill(0xffc2a8);
    g.poly([bx + s * 0.2 * d, by - 1.05 * d, bx + s * 0.42 * d, by - 0.95 * d, bx + s * 0.35 * d, by - 1.55 * d]).fill(dark);
  }
  g.ellipse(0, 0.42 * d, 0.24 * d, 0.16 * d).fill(0x1a0e08);
  g.ellipse(-0.06 * d, 0.37 * d, 0.07 * d, 0.04 * d).fill({ color: 0xffffff, alpha: 0.7 });
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
    g.moveTo(s * 0.45 * d, 0.62 * d + i * 0.1 * d).lineTo(s * 1.65 * d, 0.5 * d + i * 0.28 * d).stroke({ width: Math.max(2, 0.045 * d), color: 0x2a1a10, alpha: 0.85 });
  }
  return g;
}
function tailDeco(ctx, d) {
  const g = ctx.g();
  g.moveTo(0, 0).bezierCurveTo(1.6 * d, -0.4 * d, 2.6 * d, -2.2 * d, 1.6 * d, -3.6 * d)
    .bezierCurveTo(1.2 * d, -2.2 * d, 0.5 * d, -1.0 * d, -0.4 * d, -0.6 * d).closePath().fill(0xd9822b);
  g.moveTo(1.6 * d, -3.6 * d).bezierCurveTo(2.1 * d, -2.9 * d, 2.0 * d, -2.6 * d, 1.75 * d, -2.4 * d)
    .bezierCurveTo(1.45 * d, -2.7 * d, 1.35 * d, -3.0 * d, 1.6 * d, -3.6 * d).closePath().fill(0xfff4e8);
  return g;
}
function elderDeco(ctx, d) {
  const g = ctx.g(), white = 0xf4f2ee, grey = 0xb8b4ac;
  const my = 1.0 * d;   // mouth is d below the face anchor
  // beard
  g.moveTo(-0.95 * d, my - 0.25 * d).bezierCurveTo(-1.1 * d, my + 1.0 * d, -0.45 * d, my + 2.1 * d, 0.05 * d, my + 2.9 * d)
    .bezierCurveTo(0.45 * d, my + 2.1 * d, 1.1 * d, my + 1.0 * d, 0.95 * d, my - 0.25 * d)
    .bezierCurveTo(0.5 * d, my + 0.25 * d, -0.5 * d, my + 0.25 * d, -0.95 * d, my - 0.25 * d).closePath().fill(white);
  for (let i = -3; i <= 3; i++) g.moveTo(i * 0.22 * d, my + 0.3 * d).quadraticCurveTo(i * 0.18 * d, my + 1.5 * d, i * 0.05 * d, my + 2.5 * d).stroke({ width: Math.max(1.5, 0.035 * d), color: grey, alpha: 0.8 });
  // moustache
  for (const s of [-1, 1]) g.moveTo(0, my - 0.32 * d).quadraticCurveTo(s * 0.7 * d, my - 0.55 * d, s * 1.05 * d, my + 0.25 * d)
    .quadraticCurveTo(s * 0.6 * d, my - 0.1 * d, 0, my - 0.12 * d).closePath().fill(white);
  // bushy eyebrows
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    g.ellipse(s * (0.25 + i * 0.16) * d, -0.62 * d - Math.sin(i / 4 * Math.PI) * 0.12 * d, 0.16 * d, 0.09 * d).fill(white);
  }
  // forehead creases
  for (let i = 0; i < 3; i++) g.moveTo(-0.7 * d, -(1.05 + i * 0.2) * d).quadraticCurveTo(0, -(1.15 + i * 0.2) * d, 0.7 * d, -(1.05 + i * 0.2) * d).stroke({ width: Math.max(1.5, 0.03 * d), color: 0x5a4438, alpha: 0.45 });
  // white side hair
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) g.ellipse(s * 1.62 * d, (-1.2 + i * 0.4) * d, 0.32 * d, 0.24 * d).fill(white);
  return g;
}

/**
 * transformation — chakra swirls around the body, a huge white poof, and the user reappears changed.
 * params: variant 'poof' (leaf on the head + sparkle) | 'animal' (fox-like ears, whiskers, tail) | 'elder' (grey, beard, brows),
 *         palette (chakra) for the charge, scale
 */
async function transformation(ctx, p) {
  const { PIXI, ease } = ctx;
  const variant = p.variant || 'poof';
  const c = ctx.palette(p.palette || 'chakra');
  const scale = p.scale ?? 1;
  const kit = await bodyKit(ctx);
  const W = ctx.W, H = ctx.H;

  // 1. Anticipation: chakra twirls round the body while the sign charges.
  const swirl = new PIXI.Container(); ctx.add(swirl);
  const twirls = [0, 1, 2].map((i) => { const s = spr(ctx, `twirl${i + 1}`, { tint: i === 1 ? c.accent : c.mid, blend: 'add', alpha: 0 }); swirl.addChild(s); return s; });
  const wind = ctx.emitter({ x: () => torso(ctx).x, y: () => torso(ctx).y, rate: 50, tex: 'smoke3', blend: 'add', radius: [H * 0.25, H * 0.4], speed: [20, 60],
    life: [300, 500], size: [H * 0.08, H * 0.02], color: [c.mid, c.outer], alpha: [0.5, 0] });
  ctx.sfx.wind(0.6);
  const gp = gather(ctx, c, 600, () => ctx.anchor('hands'), { r: 0.8 });
  await ctx.tween(600, (q, raw) => {
    const T = torso(ctx); swirl.position.set(T.x, T.y);
    twirls.forEach((s, i) => { s.width = s.height = H * (0.9 - i * 0.15) * (1.1 - 0.3 * q); s.rotation = raw * (6 + i * 2) + i * 2; s.alpha = q * 0.7; });
  }, ease.inCubic);
  await gp;
  wind.stop(); swirl.destroy({ children: true });

  // 2. Release: big poof + shockwave.
  const T0 = torso(ctx), R = H * 0.52 * scale;
  ctx.sfx.poof(); ctx.sfx.boom(0.45);
  // light shading: the default grey underside stacks into a muddy ball at this size
  const bright = { shade: 0xeceef4, deep: 0xc2c6d2 };
  poof(ctx, T0.x, T0.y, R, { n: 1.6, life: 0.9, ...bright });
  poof(ctx, T0.x, T0.y - H * 0.22, R * 0.6, { n: 0.8, ...bright });
  ctx.flash(0xffffff, 110, 0.3); ctx.shake(11 * scale, 450); ctx.zoomPunch(0.07, 320);
  const shock = ctx.filter(new ctx.filters.ShockwaveFilter({ center: { x: T0.x, y: T0.y }, amplitude: 22, wavelength: 200, speed: 1100, brightness: 1.1, radius: -1, time: 0 }));
  ctx.tween(700, (q) => { shock.time = q * 0.7; }).then(() => ctx.removeFilter(shock));
  const wisps = linger(ctx, () => torso(ctx).x, () => torso(ctx).y + H * 0.15, R * 0.6, 2200, { rate: 7, alpha: 0.35 });
  await ctx.wait(160);

  // Swap in the transformed body while the cloud hides it.
  const form = new PIXI.Container(); ctx.add(form, 'clones');
  const body = kit.ok ? kit.real() : silhouette(ctx);
  form.addChild(body);
  const hd0 = head(ctx), d0 = hd0.d;
  const deco = new PIXI.Container(); ctx.add(deco, 'clones');
  let tail = null, leaf = null, cm = null;
  if (variant === 'animal') {
    body.tint = 0xffb27a;
    deco.addChild(animalDeco(ctx, d0));
    tail = tailDeco(ctx, d0); form.addChildAt(tail, 0);
  } else if (variant === 'elder') {
    cm = new PIXI.ColorMatrixFilter(); cm.desaturate(); cm.brightness(1.12, true);
    body.filters = [cm];
    deco.addChild(elderDeco(ctx, d0));
  } else {
    // someone else's colouring: warmer (a hue shift looked sickly on skin; reshaping showed the real body behind the copy)
    body.tint = 0xffe0c4;
    leaf = pointer(ctx, 'leaf', leafTex, 0.5); if (!ctx.has('leaf')) leaf.children[0].tint = 0x5ab040;
    leaf.width = d0 * 1.5; leaf.scale.y = leaf.scale.x;
    ctx.add(leaf, 'front');
  }
  form.alpha = 0; deco.alpha = 0;
  let leafY = -H * 0.05, leafV = 0, leafLanded = false;
  ctx.tick((dt, t) => {
    const hd = head(ctx), k = hd.d / d0;
    deco.position.set(hd.x, hd.y); deco.scale.set(k);
    if (tail) { const hn = ctx.anchor('hands'); tail.position.set(hd.x + 3.1 * hd.d, hn.y + 1.2 * hd.d); tail.scale.set(k); tail.rotation = Math.sin(t * 0.005) * 0.22; }
    if (leaf) {
      const top = hd.top + hd.d * 0.1;
      if (!leafLanded) { leafV += dt * 0.0006 * H; leafY = Math.min(top, leafY + leafV * dt / 1000 * 1.2); if (leafY >= top) leafLanded = true; }
      else leafY = top;
      leaf.position.set(hd.x + (leafLanded ? 0.15 * hd.d : Math.sin(t * 0.008) * hd.d * 0.9), leafY);
      leaf.rotation = leafLanded ? -0.25 : Math.sin(t * 0.008 + 1) * 0.6;
    }
  });
  await ctx.tween(500, (q) => { form.alpha = q; deco.alpha = q; });

  // Reveal sparkle.
  const hd = head(ctx);
  ctx.sfx.chime();
  ctx.burst({ x: hd.x, y: hd.y, tex: 'star5', count: 14, radius: [hd.d, hd.d * 3], speed: [20, 90], life: [500, 900], size: [hd.d * 0.9, 0], color: [0xffffff, c.accent], spin: [-3, 3] });
  const ting = spr(ctx, 'star6', { tint: 0xffffff, blend: 'add' }); ctx.add(ting, 'front');
  ctx.tween(600, (q) => { const h2 = head(ctx); ting.position.set(h2.x + h2.hw * 1.1, h2.top + h2.d * 0.6); ting.width = ting.height = h2.d * 2.6 * Math.sin(q * Math.PI); ting.rotation = q * 2; })
    .then(() => ting.destroy());

  // 3. Hold the disguise, then release it with a small poof.
  const sparkle = ctx.emitter({ x: () => head(ctx).x, y: () => head(ctx).y + head(ctx).d, rate: 6, tex: 'star7', radius: [hd.d, hd.d * 3.5], speed: [5, 25],
    life: [500, 900], size: [hd.d * 0.5, 0], color: [0xffffff, c.accent], spin: [-2, 2] });
  await ctx.wait(1900);
  sparkle.stop(); wisps.stop();
  const T1 = torso(ctx);
  ctx.sfx.poof();
  poof(ctx, T1.x, T1.y - H * 0.08, R * 0.55, { n: 1.1, life: 0.9 });
  await ctx.wait(90);
  form.visible = false; deco.visible = false; if (leaf) leaf.visible = false;
  await ctx.wait(1100);
}

// ---------- smokeEscape ----------
const LEAF_COLORS = [0x4f9a34, 0x7ac043, 0x3a7a2a, 0xa8c84a, 0x6aaa3a];
/**
 * smokeEscape — 'smoke': a smoke bomb drops from the hands and engulfs the user;
 * 'leaves': a whirlwind of leaves spirals around the body and bursts outward;
 * 'flicker': body flicker — afterimages dash to one side, blink, and dash back.
 * params: variant, palette (smoke), scale
 */
async function smokeEscape(ctx, p) {
  const variant = p.variant || 'smoke';
  const scale = p.scale ?? 1;
  if (variant === 'leaves') return leafEscape(ctx, p, scale);
  if (variant === 'flicker') return bodyFlicker(ctx, p, scale);
  const { ease } = ctx;
  const c = ctx.palette(p.palette || 'smoke');
  const W = ctx.W, H = ctx.H;

  // 1. Anticipation: a lit smoke pellet in the hands.
  const hand = () => ctx.anchor('hands');
  const pellet = ctx.g(); pellet.circle(0, 0, H * 0.025).fill(0x26242a); pellet.circle(-H * 0.008, -H * 0.008, H * 0.008).fill({ color: 0xffffff, alpha: 0.4 });
  ctx.add(pellet, 'front');
  const fuse = ctx.emitter({ x: () => pellet.x + H * 0.015, y: () => pellet.y - H * 0.02, rate: 70, tex: 'spark', speed: [60, 200], angle: [-Math.PI, 0], gravity: 300,
    life: [150, 320], size: [16, 3], color: [0xfff0b0, 0xff8a2a], rotateToVelocity: true, layer: 'front' });
  ctx.sfx.sizzle(0.6);
  await ctx.tween(450, (q) => { const h = hand(); pellet.position.set(h.x, h.y - H * 0.04 * Math.sin(q * Math.PI)); pellet.scale.set(1 + 0.2 * Math.sin(q * 20)); });
  const y0 = pellet.y, groundY = H * 0.94;
  ctx.sfx.whoosh(0.25);
  await ctx.tween(200, (q) => { pellet.y = lerp(y0, groundY, q); pellet.rotation = q * 6; }, ease.inCubic);
  fuse.stop(); pellet.visible = false;

  // 2. Release: BANG — a wall of smoke billows up from the floor.
  const bx = pellet.x;
  ctx.sfx.boom(0.6); ctx.sfx.poof();
  ctx.flash(0xffffff, 110, 0.5); ctx.shake(13 * scale, 500); ctx.zoomPunch(0.05, 300);
  poof(ctx, bx, groundY, H * 0.3 * scale, { n: 1.2, color: c.core, shade: c.outer, deep: c.dark });
  ctx.burst({ x: bx, y: groundY, tex: 'spark', count: 20, speed: [400, 900], angle: [-Math.PI, 0], drag: 2, life: [200, 400], size: [40, 8], color: [0xfff0c0, 0xffa040], rotateToVelocity: true, stretch: 0.5 });
  const wall = ctx.emitter({ x: () => bx + ctx.rand(-W * 0.35, W * 0.35), y: H * 1.02, rate: 75, duration: 1100, tex: 'smoke7', blend: 'normal', radius: [0, H * 0.05],
    speed: [H * 0.5, H * 1.2], angle: [-Math.PI * 0.62, -Math.PI * 0.38], drag: 1.7, life: [1300, 2100], size: [H * 0.28 * scale, H * 0.6 * scale], alpha: [1.25, 0],
    color: [c.mid, c.outer, c.dark], spin: [-0.5, 0.5] });
  const puffs = ctx.emitter({ x: () => bx + ctx.rand(-W * 0.25, W * 0.25), y: H * 0.95, rate: 45, duration: 900, tex: 'smoke1', blend: 'normal',
    speed: [H * 0.3, H * 0.9], angle: [-Math.PI * 0.7, -Math.PI * 0.3], drag: 2, life: [900, 1500], size: [H * 0.2, H * 0.45], alpha: [1.3, 0],
    color: [c.core, c.outer], spin: [-1, 1] });
  await ctx.wait(1100);

  // 3. Follow-through: the cloud thins and drifts off.
  ctx.sfx.wind(1.6);
  linger(ctx, () => bx + ctx.rand(-W * 0.4, W * 0.4), H * 0.85, H * 0.35, 1400, { rate: 14, alpha: 0.5, drift: 30, color: c.mid, shade: c.outer });
  await ctx.wait(2200);
  void wall; void puffs;
}

async function leafEscape(ctx, p, scale) {
  const { PIXI, ease } = ctx;
  const W = ctx.W, H = ctx.H;
  const kit = await bodyKit(ctx);
  const back = new PIXI.Container(), front = new PIXI.Container();
  ctx.add(back, 'clones');
  const me = kit.real(); if (me) ctx.add(me, 'clones');       // leaves behind the body pass behind the user
  ctx.add(front, 'fx');
  const tex = leafTex(ctx);
  const N = 70;
  const leaves = Array.from({ length: N }, (_, i) => {
    const s = spr(ctx, tex, { tint: LEAF_COLORS[i % LEAF_COLORS.length] });
    s.width = H * ctx.rand(0.04, 0.07) * scale; s.scale.y = s.scale.x * ctx.rand(0.7, 1);
    return { s, a: Math.random() * Math.PI * 2, h: Math.random(), w: ctx.rand(2.5, 4.5),
      on: i < 26, spin: ctx.rand(-8, 8), vx: 0, vy: 0, free: false, rr: ctx.rand(0.85, 1.15) };
  });
  let rad = 0.18, speed = 1.4, lift = 0;
  const place = (L, dt) => {
    if (L.free) {
      L.vy += 260 * dt; L.vx *= 1 - 1.2 * dt; L.vy *= 1 - 1.4 * dt;
      L.s.x += (L.vx + Math.sin(L.a * 3 + L.s.y * 0.02) * 60) * dt; L.s.y += L.vy * dt; L.s.rotation += L.spin * dt;
      return;
    }
    const T = torso(ctx);
    L.a += speed * L.w * 0.3 * dt;
    const R = H * rad * L.rr * (1 + 0.6 * L.h), sin = Math.sin(L.a);
    L.s.x = T.x + Math.cos(L.a) * R * 1.4;
    L.s.y = T.y + H * 0.35 - L.h * H * (0.75 + lift) + sin * R * 0.22;
    L.s.rotation = L.a * 2 + L.spin; L.s.alpha = L.on ? 1 : 0;
    const want = sin > 0 ? front : back;
    if (L.s.parent !== want) want.addChild(L.s);
    L.s.tint = sin > 0 ? LEAF_COLORS[0] : LEAF_COLORS[2];
  };
  leaves.forEach((L) => { L.s.tint = choose(LEAF_COLORS); });
  ctx.tick((dt) => { for (const L of leaves) place(L, dt / 1000); });

  // 1. Anticipation: wind gathers, the first leaves start circling.
  ctx.sfx.wind(1.4);
  const gust = new PIXI.Container(); ctx.add(gust);
  const tw = [1, 2].map((i) => { const s = spr(ctx, `twirl${i}`, { tint: 0xdff8e0, blend: 'add', alpha: 0 }); gust.addChild(s); return s; });
  await ctx.tween(650, (q) => {
    leaves.forEach((L, i) => { L.on = i < 26 + q * (N - 26); });
    rad = 0.18 + 0.1 * q; speed = 1.4 + 2.6 * q;
    const T = torso(ctx); gust.position.set(T.x, T.y + H * 0.05);
    tw.forEach((s, i) => { s.width = H * (1.1 + i * 0.2); s.height = H * (0.5 + i * 0.1); s.rotation = 0; s.alpha = 0.25 * q; s.scale.x *= i ? -1 : 1; });
  }, ease.inCubic);

  // 2. Release: full whirlwind lifting up, then it bursts outward.
  ctx.sfx.spin(1.0); ctx.sfx.whoosh(0.8);
  ctx.shake(5, 900);
  const dust = ctx.emitter({ x: () => torso(ctx).x + ctx.rand(-H * 0.4, H * 0.4), y: H * 0.98, rate: 25, duration: 900, tex: 'smoke5', blend: 'normal',
    speed: [40, 120], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [600, 1000], size: [H * 0.12, H * 0.25], color: [0xd8e0d0, 0x8a9a80], alpha: [0.45, 0] });
  await ctx.tween(900, (q, raw) => {
    speed = 4 + 5 * q; rad = 0.28 - 0.06 * q; lift = 0.15 * q;
    tw.forEach((s, i) => { s.rotation = raw * 9 * (i ? -1 : 1); s.alpha = 0.25 + 0.25 * q; });
  }, ease.inCubic);
  dust.stop();
  const T = torso(ctx);
  ctx.sfx.poof(); ctx.sfx.wind(1.2);
  ctx.flash(0xeaffea, 120, 0.3); ctx.zoomPunch(0.05, 300); ctx.shake(9 * scale, 400);
  poof(ctx, T.x, T.y, H * 0.32 * scale, { n: 0.9, color: 0xf4fff0, shade: 0xa8b8a0, deep: 0x5a6a58 });
  for (const L of leaves) {
    if (!L.on) continue;
    const ang = Math.atan2(L.s.y - T.y, L.s.x - T.x) + ctx.rand(-0.4, 0.4), sp = ctx.rand(H * 0.9, H * 2.2);
    L.free = true; L.vx = Math.cos(ang) * sp; L.vy = Math.sin(ang) * sp - H * 0.3; L.spin = ctx.rand(-10, 10);
    if (L.s.parent !== front) front.addChild(L.s);
  }
  ctx.tween(400, (q) => tw.forEach((s) => { s.alpha = 0.5 * (1 - q); s.width *= 1.04; s.height *= 1.04; })).then(() => gust.destroy({ children: true }));

  // 3. Follow-through: leaves flutter down while the smoke thins.
  linger(ctx, T.x, T.y + H * 0.1, H * 0.3, 900, { rate: 8, color: 0xf0f8ee, shade: 0xa0b098 });
  await ctx.wait(1500);
  await ctx.tween(500, (q) => { for (const L of leaves) L.s.alpha = L.on ? 1 - q : 0; });
}

async function bodyFlicker(ctx, p, scale) {
  const { ease } = ctx;
  const c = ctx.palette(p.palette || 'chakra');
  const W = ctx.W, H = ctx.H;
  const kit = await bodyKit(ctx);
  const dir = choose([-1, 1]);
  const T0 = torso(ctx);
  const lt = leafT(ctx), tints = leafTints(ctx);
  /** leaves scattered from (x,y); one burst per tint since particle colour is a gradient, not a random pick */
  const leaves = (x, y, count, o = {}) => tints.forEach((col) => ctx.burst({ x, y, tex: lt, blend: 'normal', count: Math.max(1, Math.round(count / tints.length)),
    radius: [0, o.radius ?? H * 0.1], speed: o.speed ?? [150, 520], angle: o.angle ?? [-Math.PI, 0], drag: 1.8, gravity: 260, life: [900, 1600],
    size: [H * 0.05 * scale, H * 0.04 * scale], alpha: [1, 0], color: col, spin: [-7, 7], layer: o.layer || 'front' }));

  // 1. Anticipation: crouch — chakra at the sign, dust pulled in at the feet, leaves start to stir.
  const gp = gather(ctx, c, 400, () => ctx.anchor('hands'), { r: 0.7 });
  ctx.emitter({ x: () => torso(ctx).x + ctx.rand(-W * 0.3, W * 0.3), y: H * 0.98, rate: 40, duration: 400, tex: 'smoke3', blend: 'normal', speed: [40, 120],
    angle: [-Math.PI * 0.6, -Math.PI * 0.4], life: [300, 500], size: [H * 0.06, H * 0.12], color: 0xc8c8cc, alpha: [0.5, 0] });
  ctx.emitter({ x: () => torso(ctx).x + ctx.rand(-W * 0.2, W * 0.2), y: H * 0.97, rate: 14, duration: 400, tex: lt, blend: 'normal', speed: [80, 200],
    angle: [-Math.PI * 0.65, -Math.PI * 0.35], gravity: 120, life: [500, 800], size: [H * 0.035, H * 0.03], color: tints[0], alpha: [1, 0], spin: [-6, 6], layer: 'front' });
  await gp;

  // 2. Release: dash — speed blur, afterimages smear out to one side, a gust of leaves where the user stood.
  const ghosts = [];
  const ghost = (dx, k, a, tint) => {
    const g = cloneBody(ctx, kit, dx, k); g.children[0].tint = tint; g.alpha = a; ctx.add(g, 'clones'); ghosts.push(g); return g;
  };
  const me = kit.real(); if (me) ctx.add(me, 'clones');
  ctx.sfx.whoosh(0.35); ctx.sfx.slash();
  ctx.shake(7 * scale, 300); ctx.zoomPunch(0.035, 220);
  const blur = ctx.filter(new ctx.filters.MotionBlurFilter({ velocity: { x: 0, y: 0 }, kernelSize: 9 }));
  for (let i = 0; i < 12; i++) {
    ctx.burst({ x: T0.x + dir * ctx.rand(-W * 0.1, W * 0.5), y: ctx.rand(H * 0.12, H * 0.95), tex: choose(['trace1', 'trace4']), count: 1, speed: [W * 1.6, W * 2.6],
      angle: dir > 0 ? 0 : Math.PI, life: [160, 260], size: [ctx.rand(H * 0.3, H * 0.7), H * 0.2], alpha: [0.45, 0], color: c.mid, rotateToVelocity: true, stretch: 0.6 });
  }
  leaves(T0.x, T0.y, 26, { angle: dir > 0 ? [-Math.PI * 0.45, 0.2] : [Math.PI - 0.2, Math.PI * 1.45], speed: [300, 900], radius: H * 0.2 });
  for (let i = 1; i <= 5; i++) ghost(dir * W * 0.11 * i, 0.98 - i * 0.03, 0.6 - i * 0.08, lerpC(0xffffff, c.mid, i / 5));
  await ctx.tween(260, (q) => {
    blur.velocity = { x: dir * 40 * (1 - q), y: 0 };
    ghosts.forEach((g, i) => { g.alpha = (0.65 - i * 0.1) * (1 - q * 0.6); });
  });
  ctx.removeFilter(blur);
  for (const g of ghosts) g.destroy({ children: true });
  ghosts.length = 0;

  // The "real" body pops up at the side and flickers in and out of sight, shedding leaves.
  const side = ghost(dir * W * 0.34, 0.82, 1, 0xffffff);
  const sideAt = () => onClone(ctx, torso(ctx), dir * W * 0.34, 0.82);
  const s0 = sideAt();
  ctx.sfx.whoosh(0.2);
  leaves(s0.x, s0.y, 20, { speed: [200, 600], radius: H * 0.15 });
  ctx.burst({ x: s0.x, y: H * 0.97, tex: 'smoke5', blend: 'normal', count: 10, speed: [100, 260], angle: [-Math.PI, 0], drag: 3, life: [500, 900], size: [H * 0.1, H * 0.2], color: [0xd0d0d4, 0x8a8a90], alpha: [0.7, 0] });
  const fall = ctx.emitter({ x: () => sideAt().x + ctx.rand(-W * 0.12, W * 0.12), y: H * 0.05, rate: 10, duration: 1400, tex: lt, blend: 'normal', speed: [30, 80],
    angle: [Math.PI * 0.3, Math.PI * 0.7], gravity: 60, drag: 0.6, life: [1400, 2000], size: [H * 0.04, H * 0.035], color: tints[1 % tints.length], alpha: [1, 0.2], spin: [-3, 3], layer: 'front' });
  for (let i = 0; i < 4; i++) {
    await ctx.wait(220 - i * 30);
    side.visible = !side.visible;
    const s = sideAt();
    ctx.sfx.whoosh(0.12);
    side.alpha = side.visible ? 1 : 0;
    ctx.burst({ x: s.x, y: s.y, tex: 'spark', count: 6, speed: [300, 600], life: [120, 220], size: [H * 0.08, 6], color: c.core, rotateToVelocity: true, stretch: 0.6 });
    leaves(s.x, s.y, 6, { speed: [120, 320] });
  }
  side.visible = true; side.alpha = 1;
  await ctx.wait(280);

  // 3. Follow-through: flicker back into place in a swirl of leaves, dust ring at the feet.
  ctx.sfx.whoosh(0.3);
  for (let i = 1; i <= 3; i++) ghost(dir * W * 0.34 * (1 - i / 4), 0.82 + 0.05 * i, 0.5 - i * 0.1, c.mid);
  const s1 = sideAt();
  leaves(s1.x, s1.y, 12, { speed: [150, 400] });
  side.visible = false;
  await ctx.tween(220, () => { ghosts.forEach((g) => { g.alpha *= 0.85; }); });
  for (const g of ghosts) g.visible = false;
  fall.stop();
  const T1 = torso(ctx);
  leaves(T1.x, T1.y, 18, { speed: [250, 650], radius: H * 0.18 });
  ctx.burst({ x: T1.x, y: H * 0.99, tex: 'smoke5', blend: 'normal', count: 16, radius: [0, W * 0.1], speed: [150, 380], angle: [-Math.PI, 0], drag: 3,
    life: [600, 1100], size: [H * 0.12, H * 0.25], color: [0xd8d8dc, 0x8a8a90], alpha: [0.75, 0], spin: [-1, 1] });
  const ring = spr(ctx, 'circle3', { tint: c.mid, blend: 'add' }); ctx.add(ring);
  ring.position.set(T1.x, H * 0.97);
  ctx.shake(5, 250);
  await ctx.tween(500, (q) => { ring.width = W * (0.2 + q * 0.7); ring.height = ring.width * 0.18; ring.alpha = 0.8 * (1 - q); }, ease.outCubic);
  await ctx.wait(900);
}

// ---------- shadowPossession ----------
function crPoint(P, u) {
  const n = P.length - 1, f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const k = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: k(p0.x, p1.x, p2.x, p3.x), y: k(p0.y, p1.y, p2.y, p3.y) };
}
/** Fill a tapered, wriggling ribbon along control points P, revealed up to `grow` (0..1). Returns the tip. */
function ribbon(g, P, grow, w0, w1, time, o = {}) {
  const N = o.N ?? 34, wob = o.wob ?? 1, ph = o.phase ?? 0, tipW = o.tipW ?? 0, sp = o.speed ?? 1;
  const L = [], R = [];
  let tip = P[0], tx = 0, ty = -1;
  for (let i = 0; i <= N; i++) {
    const f = i / N, u = grow * f;
    const q = crPoint(P, u), q2 = crPoint(P, Math.min(1, u + 0.01));
    const dx = q2.x - q.x, dy = q2.y - q.y, len = Math.hypot(dx, dy);
    if (len > 1e-4) { tx = dx / len; ty = dy / len; }
    const nx = -ty, ny = tx;
    const wig = Math.sin(u * 13 - time * 0.006 * sp + ph) * wob * (4 + 18 * u);
    const x = q.x + nx * wig, y = q.y + ny * wig;
    const taper = tipW ? 1 : (f > 0.72 ? Math.pow((1 - f) / 0.28, 0.8) : 1);
    let w = lerp(w0, w1, u) * taper + (tipW ? tipW * Math.pow(f, 4) : 0);
    w *= 1 + 0.12 * Math.sin(u * 47 + ph * 3 + time * 0.002 * sp);
    L.push(x + nx * w / 2, y + ny * w / 2); R.push(x - nx * w / 2, y - ny * w / 2);
    tip = { x, y, w };
  }
  const pts = [...L];
  for (let i = R.length - 2; i >= 0; i -= 2) pts.push(R[i], R[i + 1]);
  g.poly(pts).fill({ color: o.color ?? 0x000000, alpha: o.alpha ?? 0.92 });
  if (tipW) g.circle(tip.x, tip.y, tip.w / 2).fill({ color: o.color ?? 0x000000, alpha: o.alpha ?? 0.92 });
  return tip;
}

/**
 * shadowPossession — the user's shadow pools at their feet and a tendril crawls out along the floor and
 * rears up at the camera; when it connects the whole scene freezes (grayscale + dark vignette).
 * params: variant 'possession' (one thick tendril that lunges at the lens) | 'neckbind' (shadow hands climb
 *         the screen edges and squeeze) | 'stitch' (many needle-thin shadows skewer the frame), palette (shadow), scale
 */
async function shadowPossession(ctx, p) {
  const { PIXI, ease } = ctx;
  const variant = p.variant || 'possession';
  const c = ctx.palette(p.palette || 'shadow');
  const scale = p.scale ?? 1;
  const W = ctx.W, H = ctx.H;
  const ink = c.mid, rim = c.glow;

  // 1. Anticipation: darkness is drawn into the sign, the shadow pool spreads at the user's feet.
  ctx.sfx.ominous(4);
  const hands = () => ctx.anchor('hands');
  const gp = gather(ctx, { core: 0x000000, mid: ink, glow: rim, accent: c.accent }, 700, hands, { blend: 'normal', r: 0.9 });
  const pool = spr(ctx, 'soft', { tint: 0x000000, alpha: 0 }); ctx.add(pool);
  const poolX = () => torso(ctx).x;
  const pc = { w: 0, a: 0 };
  ctx.tick(() => { pool.position.set(poolX(), H * 1.0); pool.width = pc.w; pool.height = pc.w * 0.32; pool.alpha = pc.a; });
  await ctx.tween(700, (q) => { pc.w = W * 0.85 * q; pc.a = 0.9 * q; }, ease.outCubic);
  await gp;

  // 2. Release: tendril(s) crawl out and connect.
  const g = ctx.g(); ctx.add(g, 'front');
  const side = choose([-1, 1]);
  const cx = poolX();
  const mk = (pts) => pts.map(([x, y]) => ({ x: cx + x * W, y: y * H }));
  // ribbons: {P, grow, w0, w1, tipW, phase, wob}
  let ribbons;
  if (variant === 'stitch') {
    ribbons = Array.from({ length: 10 }, (_, i) => {
      const s = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      const tx = s * (0.2 + 0.07 * k + ctx.rand(-0.03, 0.03)), ty = 0.85 - 0.13 * k - ctx.rand(0, 0.06);
      return { P: mk([[s * 0.03, 1.02], [tx * 0.5, (1.02 + ty) / 2 + 0.03], [tx, ty]]), grow: 0, w0: H * 0.035, w1: H * 0.012, phase: i * 1.3, wob: 0.25, delay: i * 0.06 };
    });
  } else if (variant === 'neckbind') {
    ribbons = [];
    for (const s of [-1, 1]) {
      const base = [[s * 0.05, 1.03], [s * 0.3, 0.98], [s * 0.46, 0.78], [s * 0.44, 0.52]];
      ribbons.push({ P: mk(base), grow: 0, w0: H * 0.12, w1: H * 0.07, phase: s, wob: 0.6, delay: 0, arm: s });
      for (let f = 0; f < 4; f++) {
        const a = -0.9 + f * 0.45;
        const fx = s * 0.44 - s * Math.cos(a) * 0.06, fy = 0.52 + Math.sin(a) * 0.12;
        ribbons.push({ P: mk([[s * 0.44, 0.52], [fx, fy - 0.08], [s * (0.36 - f * 0.012), 0.3 + f * 0.05], [s * (0.27 - f * 0.01), 0.36 + f * 0.06]]), grow: 0,
          w0: H * 0.05, w1: H * 0.025, phase: f + s, wob: 0.2, delay: 0.55, finger: s, f });
      }
    }
  } else {
    // one thick tendril crawls out along the floor, rears up beside the user, then splays into a claw that lunges at the lens
    ribbons = [{ P: mk([[0, 1.03], [side * 0.17, 0.99], [side * 0.31, 0.93], [side * 0.37, 0.78], [side * 0.31, 0.6]]), grow: 0, w0: H * 0.09, w1: H * 0.1, phase: 0, wob: 0.7, delay: 0, tipW: 1 }];
    const a0 = side > 0 ? -Math.PI * 0.72 : -Math.PI * 0.28;     // claws point up and in, toward the middle of the frame
    for (let f = 0; f < 5; f++) {
      const a = a0 + (f - 2) * 0.42, L = H * (0.2 + 0.07 * (1 - Math.abs(f - 2) / 2)), curl = side * 0.35;
      ribbons.push({ rel: [[0, 0], [Math.cos(a) * L * 0.55, Math.sin(a) * L * 0.55], [Math.cos(a + curl) * L, Math.sin(a + curl) * L]], P: null, grow: 0,
        w0: H * 0.06, w1: H * 0.02, phase: f * 1.7, wob: 0.25, finger: true });
    }
  }
  let time = 0, wobSpeed = 1, claw = 1;
  ctx.tick((dt) => {
    time += dt * wobSpeed;
    g.clear();
    for (const r of ribbons) {
      if (r.grow <= 0) continue;
      if (r.rel) { const t0 = ribbons[0].tip || r.P?.[0] || { x: cx, y: H }; r.P = r.rel.map(([x, y]) => ({ x: t0.x + x * claw, y: t0.y + y * claw })); }
      ribbon(g, r.P, r.grow, r.w0 * 1.25 * scale, r.w1 * 1.25 * scale, time, { color: rim, alpha: 0.55, phase: r.phase, wob: r.wob, tipW: r.tipW * 1.1 });
      r.tip = ribbon(g, r.P, r.grow, r.w0 * scale, r.w1 * scale, time, { color: 0x000000, alpha: 0.95, phase: r.phase, wob: r.wob, tipW: r.tipW });
    }
  });
  const crawl = ctx.emitter({ x: () => ribbons[0].tip?.x ?? cx, y: () => ribbons[0].tip?.y ?? H, rate: 40, tex: 'smoke3', blend: 'normal', speed: [10, 50], life: [400, 700],
    size: [H * 0.06, H * 0.14], color: [rim, 0x000000], alpha: [0.6, 0], layer: 'front' });
  ctx.sfx.rumble(1.2); ctx.sfx.whoosh(1);
  const growMs = variant === 'stitch' ? 700 : 1000;
  await ctx.tween(growMs, (q, raw) => {
    for (const r of ribbons) {
      if (r.finger) continue;
      r.grow = ease.outCubic(clamp((raw - r.delay) / (1 - r.delay), 0, 1));
    }
    if (variant === 'stitch') for (const r of ribbons) if (r.grow > 0.98 && !r.hit) { r.hit = true; hitBurst(r.tip); }
  }, ease.linear);
  function hitBurst(t) {
    if (!t) return;
    ctx.burst({ x: t.x, y: t.y, tex: 'smoke3', blend: 'normal', count: 6, speed: [60, 200], life: [300, 600], size: [H * 0.05, H * 0.1], color: [rim, 0x000000], alpha: [0.8, 0], layer: 'front' });
    ctx.sfx.slash();
  }
  if (variant === 'stitch') ctx.shake(6, 300);

  // the connecting moment
  if (variant === 'neckbind') {
    ctx.sfx.crack();
    await ctx.tween(380, (q) => { for (const r of ribbons) if (r.finger) r.grow = q; }, ease.outBack);
  } else if (variant === 'possession') {
    ctx.sfx.whoosh(0.3); ctx.sfx.crack();
    await ctx.tween(320, (q) => { for (const r of ribbons) if (r.finger) r.grow = q; claw = 1 + 0.75 * q; }, ease.outBack);
    ctx.burst({ x: ribbons[0].tip.x, y: ribbons[0].tip.y, tex: 'smoke6', blend: 'normal', count: 10, speed: [200, 500], drag: 3, life: [400, 800], size: [H * 0.15, H * 0.35], color: [rim, 0x000000], alpha: [0.8, 0], layer: 'front' });
  }
  crawl.stop();
  ctx.sfx.boom(0.4); ctx.sfx.crack();
  ctx.shake(12 * scale, 450); ctx.zoomPunch(0.06, 350);
  ctx.flash(0x000000, 220, 0.6, 'normal');
  const freeze = ctx.filter(new PIXI.ColorMatrixFilter());
  freeze.desaturate(); freeze.alpha = 0;
  const vig = spr(ctx, vignetteTex(ctx), { tint: 0x000000, alpha: 0 }); ctx.add(vig, 'overlay');
  vig.position.set(W / 2, H / 2);
  const lines = ctx.g(); ctx.add(lines, 'overlay');     // shadow veins creeping in from the frame edge
  const veins = Array.from({ length: 12 }, (_, i) => {
    const e = i % 4, t = (Math.floor(i / 4) + 0.5 + ctx.rand(-0.2, 0.2)) / 3;
    const st = [[t * W, 0], [W, t * H], [t * W, H], [0, t * H]][e];
    const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]][e];
    const L = ctx.rand(0.08, 0.16) * Math.min(W, H);
    return { P: [{ x: st[0], y: st[1] }, { x: st[0] + inward[0] * L * 0.5 + inward[1] * L * 0.3, y: st[1] + inward[1] * L * 0.5 + inward[0] * L * 0.3 },
      { x: st[0] + inward[0] * L, y: st[1] + inward[1] * L }], phase: i };
  });
  let veinGrow = 0;
  ctx.tick(() => {
    lines.clear();
    if (veinGrow <= 0) return;
    for (const v of veins) ribbon(lines, v.P, veinGrow, H * 0.03, H * 0.004, time, { color: 0x000000, alpha: 0.9, phase: v.phase, wob: 0.15, N: 12 });
  });
  await ctx.tween(220, (q) => { freeze.alpha = q; vig.width = W * (1.6 - 0.5 * q); vig.height = H * (1.6 - 0.5 * q); vig.alpha = 0.9 * q; }, ease.outCubic);
  wobSpeed = 0.12;

  // 3. Hold: everything is caught. Neckbind squeezes in pulses.
  ctx.sfx.hum(2, 55);
  const holdMs = 1700;
  await ctx.tween(holdMs, (q, raw) => {
    veinGrow = ease.outCubic(Math.min(1, raw * 1.6));
    let squeeze = 0;
    if (variant === 'neckbind') {
      squeeze = Math.max(0, Math.sin(raw * Math.PI * 4));
      if (squeeze > 0.97) ctx.shake(5, 120);
      for (const r of ribbons) if (r.finger) r.grow = 1 - 0.12 * (1 - squeeze);
    }
    const breathe = 1.1 - 0.03 * Math.sin(raw * Math.PI * 3) - 0.05 * squeeze;
    vig.width = W * breathe; vig.height = H * breathe;
  });

  // 4. Release the hold: colour returns, shadows retract to the feet.
  wobSpeed = 1;
  ctx.sfx.whoosh(0.8);
  await ctx.tween(800, (q) => {
    freeze.alpha = 1 - q; vig.alpha = 0.9 * (1 - q); veinGrow = 1 - q;
    for (const r of ribbons) r.grow = Math.min(r.grow, 1 - q);
    pc.a = 0.9 * (1 - q * 0.6);
  }, ease.inCubic);
  ctx.removeFilter(freeze);
  await ctx.tween(400, (q) => { pc.a = 0.36 * (1 - q); pc.w = W * 0.85 * (1 - 0.4 * q); });
}

export const EFFECTS = { shadowClone, substitution, transformation, smokeEscape, shadowPossession };
