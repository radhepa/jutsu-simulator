// Hand archetypes: rasengan, healingGlow, chakraAura, chakraBlade, signPulse.
// All effects follow their body anchor every frame and use only ctx.wait/tween/tick for time.
//
// rasengan    variant: normal | giant | shuriken | barrage   params: palette ('chakra'), scale, count (barrage, 4)
// healingGlow variant: heal | scalpel | mystical            params: palette ('medical'), scale
// chakraAura  variant: gates | sage | cloak | tailed        params: palette (per variant), scale, count (tails)
// chakraBlade variant: blade | flow                         params: palette ('chakra' / 'wind'), scale
// signPulse   ambient: { step, total, palette }  (<= 600 ms, every particle dies before it resolves)

const TAU = Math.PI * 2;

// ---------- helpers ----------
function sprite(ctx, tex, tint = 0xffffff, blend = 'add', parent = null) {
  const s = new ctx.PIXI.Sprite(ctx.tex(tex));
  s.anchor.set(0.5); s.tint = tint; s.blendMode = blend;
  if (parent) parent.addChild(s);
  return s;
}
const size = (s, w, h = w) => s.scale.set(w / (s.texture.width || 1), h / (s.texture.height || 1));
const box = (ctx, layer = 'fx') => ctx.add(new ctx.PIXI.Container(), layer);

/** One particle flying from a ring of radius r into (cx, cy), slightly spiralling. */
function gather(ctx, cx, cy, r, cfg, swirl = 0.35) {
  const a = Math.random() * TAU, d = ctx.pick(r), life = ctx.pick(cfg.life ?? [300, 450]);
  ctx.burst({ ...cfg, count: 1, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, angle: a + Math.PI + swirl,
    speed: (d / (life / 1000)) * 0.95, life: [life, life] });
}

/** Scene shockwave centred on (x, y); removes itself. */
function shockwave(ctx, x, y, { amp = 30, wave = 160, speed = 900, ms = 900, bright = 1.15 } = {}) {
  const f = ctx.filter(new ctx.filters.ShockwaveFilter({ center: { x, y }, amplitude: amp, wavelength: wave, speed, brightness: bright, radius: Math.max(ctx.W, ctx.H) * 0.75 })); // bounded: an unbounded wave smears the screen edge
  return ctx.tween(ms, (e, r) => { f.time = (r * ms) / 1000; f.amplitude = amp * (1 - r); }).then(() => ctx.removeFilter(f));
}

/** Short zoom-blur punch from (x, y). */
function zoomBlur(ctx, x, y, strength = 0.2, ms = 450) {
  const f = ctx.filter(new ctx.filters.ZoomBlurFilter({ strength, center: { x, y }, innerRadius: 40 }));
  return ctx.tween(ms, (e) => { f.strength = strength * (1 - e); }, ctx.ease.outCubic).then(() => ctx.removeFilter(f));
}

/** Expanding shock ring that fades out. Drawn as strokes: huge scaled ring textures left a dark disc on screen. */
function ring(ctx, x, y, r0, r1, color, ms = 500, alpha = 0.9, layer = 'fx') {
  const g = ctx.g().circle(0, 0, 100).stroke({ width: 18, color, alpha: 0.3 }).circle(0, 0, 100).stroke({ width: 5, color, alpha: 1 });
  g.blendMode = 'add'; ctx.add(g, layer); g.position.set(x, y);
  return ctx.tween(ms, (e) => { g.scale.set((r0 + (r1 - r0) * e) / 100); g.alpha = alpha * (1 - e); }, ctx.ease.outCubic).then(() => g.destroy());
}

// ---------- rasengan sphere ----------
// A solid (normal-blend) blue body keeps the sphere readable on bright skin; additive swirls ride on top.
function makeSphere(ctx, c, parent, { streaks = 16 } = {}) {
  const { PIXI, rand } = ctx;
  const root = new PIXI.Container(); parent.addChild(root);
  const halo = sprite(ctx, 'soft', c.glow, 'add', root); halo.alpha = 0.3;
  const body = sprite(ctx, 'circle5', c.outer, 'normal', root); body.alpha = 0.85;
  const body2 = sprite(ctx, 'circle5', c.mid, 'normal', root); body2.alpha = 0.6;
  const swirl = sprite(ctx, 'light2', c.mid, 'add', root); swirl.alpha = 0.35;
  const rings = ['twirl1', 'twirl2', 'twirl3', 'twirl1'].map((t, i) => {
    const holder = new PIXI.Container(); holder.rotation = i * 1.6; holder.scale.y = [1, 0.45, 0.75, 0.3][i]; root.addChild(holder);
    const s = sprite(ctx, t, i % 3 === 0 ? c.accent : c.mid, 'add', holder); s.rotation = rand(0, TAU); s.alpha = i % 3 === 0 ? 0.6 : 0.4;
    return { holder, s, spd: (i % 2 ? -1 : 1) * rand(10, 16) };
  });
  const rim = sprite(ctx, 'circle2', c.accent, 'add', root); rim.alpha = 0.4;
  const core = sprite(ctx, 'soft', c.core, 'add', root); core.alpha = 0.9;
  const flare = sprite(ctx, 'star8', c.core, 'add', root); flare.alpha = 0.5;
  const st = Array.from({ length: streaks }, () => ({
    s: sprite(ctx, 'spark', Math.random() < 0.5 ? c.core : c.accent, 'add', root),
    tilt: rand(0, TAU), ph: rand(0, TAU), sp: (Math.random() < 0.5 ? -1 : 1) * rand(9, 17), rf: rand(0.75, 1.2), sq: rand(0.2, 0.85),
  }));
  let t = 0;
  const S = {
    root, R: 1, spin: 1,
    update(dt) {
      const R = Math.max(0.5, S.R), k = dt / 1000, sp = S.spin;
      t += k;
      size(halo, R * 3.4); size(body, R * 5.4); size(body2, R * 3.9); // circle5's disc fills ~40% of its texture
      size(swirl, R * 2.2); swirl.rotation -= k * 14 * sp;
      for (const r of rings) { size(r.s, R * 2.3); r.s.rotation += r.spd * k * sp; r.holder.rotation += 0.9 * k * sp; }
      size(rim, R * 2.2);
      size(core, R * (0.6 + 0.08 * Math.sin(t * 37)));
      size(flare, R * (1.5 + 0.25 * Math.sin(t * 23))); flare.rotation += k * 3;
      for (const o of st) {
        const a = o.ph + t * o.sp * sp, lx = Math.cos(a) * R * o.rf, ly = Math.sin(a) * R * o.rf * o.sq;
        const ct = Math.cos(o.tilt), sn = Math.sin(o.tilt);
        o.s.position.set(lx * ct - ly * sn, lx * sn + ly * ct);
        const dx = -Math.sin(a) * o.sp, dy = Math.cos(a) * o.sq * o.sp;
        o.s.rotation = Math.atan2(dx * sn + dy * ct, dx * ct - dy * sn);
        size(o.s, R * 0.95, R * 0.12);
        o.s.alpha = Math.sin(a) > 0 ? 0.6 : 0.15;      // back half dimmer -> reads as a sphere
      }
    },
  };
  return S;
}

/** Wind wisps flung tangentially off a sphere (custom spawn so position and direction agree). */
function wisps(ctx, S, c, n = 1, layer = 'fx') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, R = S.R * 1.05, x = S.root.x + Math.cos(a) * R, y = S.root.y + Math.sin(a) * R;
    ctx.burst({ count: 1, x, y, tex: ctx.pick(['twirl2', 'twirl3', 'spark']), angle: a + Math.PI / 2 * Math.sign(S.spin || 1),
      speed: [R * 2, R * 4], life: [200, 380], size: [R * 0.9, R * 0.3], alpha: [0.45, 0], color: [c.accent, c.mid], spin: [-14, -8], drag: 3, layer });
  }
}

async function rasengan(ctx, p) {
  const v = p.variant || 'normal';
  if (v === 'shuriken') return rasenshuriken(ctx, p);
  if (v === 'barrage') return rasenBarrage(ctx, p);
  const { ease } = ctx;
  const c = ctx.palette(p.palette || 'chakra');
  const giant = v === 'giant', k = (p.scale ?? 1) * (giant ? 2.3 : 1);
  const hs = ctx.handScale(), R0 = hs * 0.55 * k;
  const pos = () => { const h = ctx.anchor('hands'); return { x: h.x, y: h.y - hs * 0.25 - (giant ? R0 * 0.8 : 0) }; };

  const S = makeSphere(ctx, c, ctx.layers.fx, { streaks: giant ? 22 : 16 });
  let follow = true, wind = 0;
  ctx.tick((dt) => {
    if (follow) { const q = pos(); S.root.position.set(q.x, q.y); }
    S.update(dt);
    wind += dt * (giant ? 0.05 : 0.03) * S.spin;
    while (wind >= 1) { wind--; wisps(ctx, S, c); }
  });

  // 1. Anticipation: chakra spirals into the palm, a tiny sphere winds up.
  const gatherMs = giant ? 1000 : 650;
  ctx.sfx.charge(gatherMs / 1000);
  const palmGlow = sprite(ctx, 'soft', c.glow, 'add'); ctx.add(palmGlow);
  let gathering = true;
  ctx.tick(() => {
    if (!gathering) return false;
    const q = pos();
    for (let i = 0; i < (giant ? 4 : 3); i++)
      gather(ctx, q.x, q.y, [R0 * 2.2, R0 * 4], { tex: ctx.pick(['spark', 'dot']), life: [260, 420], size: [hs * 0.22, 2], color: [c.accent, c.mid], alpha: [0.2, 1], rotateToVelocity: true, stretch: 0.4 });
  });
  await ctx.tween(gatherMs, (e) => {
    const q = pos(); palmGlow.position.set(q.x, q.y); size(palmGlow, R0 * (1 + 3 * e)); palmGlow.alpha = 0.3 * e;
    S.R = R0 * 0.75 * ease.inCubic(e) + 1; S.spin = 0.4 + e;
  });
  gathering = false;

  // 2. Formed: pop + hum + local swirl of the air around the palm.
  ctx.sfx.hum(giant ? 2.2 : 1.6, giant ? 90 : 130); ctx.sfx.spin(giant ? 2.2 : 1.6);
  ctx.shake(giant ? 6 : 3, 300);
  let q = pos(); ring(ctx, q.x, q.y, R0, R0 * 3, c.mid, 450);
  ctx.burst({ x: q.x, y: q.y, count: giant ? 40 : 24, tex: 'spark', speed: [200, 500], life: [250, 450], size: [hs * 0.3, 4], color: [c.core, c.mid], rotateToVelocity: true, drag: 3 });
  const twist = ctx.filter(new ctx.filters.TwistFilter({ radius: R0 * 2.6, angle: 0, padding: 20, offset: { x: q.x, y: q.y } }));
  const holdMs = giant ? 1500 : 1300;
  await ctx.tween(holdMs, (e, r) => {
    const qq = pos(); palmGlow.position.set(qq.x, qq.y); size(palmGlow, R0 * 4.2); palmGlow.alpha = 0.2 + 0.06 * Math.sin(r * 40);
    S.R = R0 * (0.85 + 0.15 * e + 0.03 * Math.sin(r * 55)); S.spin = 1.4 + e;
    twist.offset = { x: qq.x, y: qq.y }; twist.radius = S.R * 2.6; twist.angle = Math.sin(r * 9) * 0.25 + 0.35 * e;
  });
  ctx.removeFilter(twist);

  // 3. Release: slammed toward the camera, grinding spiral impact.
  q = pos(); follow = false;
  ctx.sfx.whoosh(0.3);
  const tgt = { x: q.x + (ctx.W / 2 - q.x) * 0.4, y: q.y + (ctx.H * 0.5 - q.y) * 0.5 };
  await ctx.tween(220, (e) => {
    S.root.position.set(q.x + (tgt.x - q.x) * e, q.y + (tgt.y - q.y) * e);
    S.R = R0 * (1 + e * (giant ? 0.6 : 0.8)); S.spin = 2.5;
  }, ease.inCubic);
  const ix = S.root.x, iy = S.root.y, IR = S.R;
  ctx.sfx.boom(giant ? 1.6 : 1); ctx.sfx.wind(1.2);
  ctx.flash(c.glow, 120, 0.35);
  ctx.shake(giant ? 26 : 16, giant ? 900 : 600); ctx.zoomPunch(giant ? 0.1 : 0.07, 350);
  shockwave(ctx, ix, iy, { amp: giant ? 60 : 36, wave: giant ? 260 : 170, speed: giant ? 1300 : 1000, ms: 900 });
  zoomBlur(ctx, ix, iy, giant ? 0.3 : 0.2, 500);
  ring(ctx, ix, iy, IR, IR * 5, c.mid, 550, 0.7);
  ring(ctx, ix, iy, IR * 0.5, IR * 3.5, c.outer, 700, 0.6);
  ctx.burst({ x: ix, y: iy, count: giant ? 55 : 35, tex: 'spark', radius: [0, IR * 0.6], speed: [300, giant ? 1300 : 900], life: [350, 800],
    size: [IR * 0.28, 4], color: [c.accent, c.mid, c.outer], rotateToVelocity: true, stretch: 0.6, drag: 2.2 }); // bigger sparks summed to a white blob over the face
  ctx.burst({ x: ix, y: iy, count: 6, tex: ctx.pick(['twirl1', 'twirl2', 'twirl3']), speed: [20, 120], life: [500, 900], size: [IR * 1.6, IR * 3.6],
    alpha: [0.4, 0], color: [c.mid, c.outer], spin: [-14, -9] });
  if (giant) {
    const gr = ctx.anchor('ground');
    ctx.burst({ x: ix, y: gr.y - 10, count: 26, tex: 'smoke3', blend: 'normal', radius: [0, ctx.W * 0.3], speed: [80, 300], angle: [-Math.PI, 0],
      life: [900, 1600], size: [IR * 1.2, IR * 2.6], color: [c.dark, 0x5a5a60], alpha: [0.45, 0], spin: [-1, 1] });
    ctx.burst({ x: ix, y: gr.y - 10, count: 30, tex: 'dirt1', blend: 'normal', radius: [0, ctx.W * 0.3], speed: [300, 800], angle: [-Math.PI * 0.9, -Math.PI * 0.1],
      life: [600, 1100], size: [18, 6], color: 0x3a3028, alpha: [1, 0.6], gravity: 1400, spin: [-8, 8] });
  }
  // grinding: the sphere drills in, spins up and is spent
  await ctx.tween(650, (e, r) => {
    S.R = IR * (1 + 0.3 * e); S.spin = 3 - 2 * e; S.root.alpha = 1 - ease.inCubic(e);
    S.root.position.set(ix + ctx.rand(-4, 4) * (1 - e), iy + ctx.rand(-4, 4) * (1 - e));
    palmGlow.alpha = 0.2 * (1 - e);
  });
  S.root.visible = false; S.spin = 0;

  // 4. Follow-through: drifting wind dust and a few lingering sparks.
  ctx.burst({ x: ix, y: iy, count: 14, tex: ctx.pick(['smoke1', 'smoke2', 'smoke4']), blend: 'add', radius: [0, IR], speed: [20, 90], life: [800, 1300],
    size: [IR * 1.4, IR * 2.6], color: [c.mid, c.outer], alpha: [0.25, 0], spin: [-2, 2] });
  ctx.burst({ x: ix, y: iy, count: 18, tex: 'dot', radius: [0, IR * 1.5], speed: [30, 120], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [700, 1200],
    size: [6, 1], color: [c.core, c.mid], alpha: [1, 0], gravity: -40 });
  await ctx.wait(1100);
}

// Rasenshuriken: sphere + four shrieking wind blades, thrown, detonates into a needle-filled dome.
async function rasenshuriken(ctx, p) {
  const { PIXI, ease } = ctx;
  const c = ctx.palette(p.palette || 'wind');
  const k = p.scale ?? 1, hs = ctx.handScale(), R0 = hs * 0.4 * k, L = hs * 2.1 * k;
  const pos = () => { const h = ctx.anchor('hands'); return { x: h.x, y: h.y - hs * 0.45 }; };

  const holder = box(ctx);
  const S = makeSphere(ctx, ctx.palette('chakra'), holder, { streaks: 14 }); // blue core inside pale wind blades
  // blades: three lagging copies fake motion blur
  const bladeSets = [0.9, 0.45, 0.2].map((a) => {
    const set = new PIXI.Container(); set.alpha = a; holder.addChildAt(set, 0);
    for (let i = 0; i < 4; i++) {
      const g = ctx.g();
      g.moveTo(0, -14).quadraticCurveTo(55, -34, 100, -4).quadraticCurveTo(60, 6, 0, 14).closePath().fill({ color: c.outer, alpha: 0.3 });
      g.moveTo(8, -6).quadraticCurveTo(55, -20, 92, -3).quadraticCurveTo(55, 2, 8, 6).closePath().fill({ color: c.mid, alpha: 0.4 });
      g.moveTo(14, -2).quadraticCurveTo(55, -11, 96, -4).quadraticCurveTo(55, -4, 14, 2).closePath().fill({ color: c.core, alpha: 0.7 }); // bright leading edge
      g.blendMode = 'add'; g.rotation = (i * TAU) / 4; set.addChild(g);
    }
    set.scale.set(0.01);
    return set;
  });
  const disc = sprite(ctx, 'circle3', c.core, 'add', holder); disc.alpha = 0;
  let follow = true, rot = 0, bladeSpin = 0, bladeLen = 0, wind = 0;
  ctx.tick((dt) => {
    if (follow) { const q = pos(); holder.position.set(q.x, q.y); }
    S.update(dt);
    rot += bladeSpin * dt / 1000;
    bladeSets.forEach((s, i) => { s.rotation = rot - i * 0.13; s.scale.set((bladeLen / 100) * (1 + 0.03 * Math.sin(rot * 3 + i)), (bladeLen / 100) * 0.9); });
    size(disc, R0 * 3.2 + bladeLen * 0.35);
    wind += dt * 0.03;
    while (wind >= 1 && bladeLen > 10) { wind--; const a = rot + (Math.floor(Math.random() * 4) * TAU) / 4 + 0.4;
      ctx.burst({ count: 1, x: holder.x + Math.cos(a) * bladeLen * 0.9, y: holder.y + Math.sin(a) * bladeLen * 0.9, tex: 'spark', angle: a + Math.PI / 2,
        speed: [bladeLen * 2, bladeLen * 4], life: [150, 260], size: [bladeLen * 0.5, bladeLen * 0.1], color: [c.core, c.mid], rotateToVelocity: true }); }
  });

  // 1. sphere winds up
  ctx.sfx.charge(0.7);
  const g = { on: true };
  ctx.tick(() => { if (!g.on) return false; const q = pos(); for (let i = 0; i < 3; i++) gather(ctx, q.x, q.y, [R0 * 2.5, R0 * 4.5], { tex: 'spark', life: [260, 420], size: [hs * 0.22, 2], color: [c.accent, c.mid], alpha: [0.2, 1], rotateToVelocity: true }); });
  await ctx.tween(700, (e) => { S.R = R0 * ease.inCubic(e) + 1; S.spin = 0.5 + e; });
  g.on = false;

  // 2. blades unfold with a rising metallic ring
  ctx.sfx.bell(); ctx.sfx.chime(); ctx.sfx.spin(2.2); ctx.sfx.wind(2.2);
  ctx.shake(4, 300);
  let q = pos(); ring(ctx, q.x, q.y, R0, L * 1.3, c.core, 500);
  await ctx.tween(450, (e) => { bladeLen = L * e; bladeSpin = 8 + 20 * e; disc.alpha = 0.35 * e; }, ease.outBack);
  const wash = ctx.tint(c.glow, 0, 'add');
  await ctx.tween(1100, (e, r) => { bladeSpin = 28 + 6 * Math.sin(r * 20); S.spin = 2; wash.set(0.04 + 0.03 * Math.sin(r * 30)); disc.alpha = 0.3 + 0.12 * Math.sin(r * 50); });
  ctx.sfx.bell();

  // 3. throw: flies away (shrinks) toward the upper centre
  q = pos(); follow = false;
  ctx.sfx.whoosh(0.45);
  const tgt = { x: ctx.W * 0.5 + (q.x > ctx.W / 2 ? -1 : 1) * ctx.W * 0.27, y: ctx.H * 0.36 }; // off to the side so the caster stays visible
  await ctx.tween(380, (e) => { holder.position.set(q.x + (tgt.x - q.x) * e, q.y + (tgt.y - q.y) * e - Math.sin(e * Math.PI) * 30); holder.scale.set(1 - 0.6 * e); }, ease.inCubic);

  // 4. detonation: dome of wind with micro-blade needles
  holder.visible = false; bladeSpin = 0;
  const D = Math.min(ctx.W, ctx.H) * 0.34 * k, x = tgt.x, y = tgt.y;
  ctx.sfx.boom(1.6); ctx.sfx.crackle(1.4); ctx.sfx.wind(1.6);
  ctx.flash(c.core, 120, 0.7); ctx.shake(24, 1000); ctx.zoomPunch(0.08, 400);
  shockwave(ctx, x, y, { amp: 50, wave: 220, speed: 1200, ms: 1000 });
  const dome = box(ctx); dome.position.set(x, y);
  // wind palette is near-white: an all-additive dome summed to a flat white disc, so the body is a translucent blue (normal blend)
  const cc = ctx.palette('chakra');
  const dGlow = sprite(ctx, 'soft', cc.glow, 'add', dome), dBody = sprite(ctx, 'circle5', cc.outer, 'normal', dome), dSwirl = sprite(ctx, 'light3', cc.mid, 'add', dome), dRim = sprite(ctx, 'circle3', c.core, 'add', dome);
  const dTw = ['twirl1', 'twirl3', 'twirl2'].map((t, i) => sprite(ctx, t, i ? cc.mid : c.core, 'add', dome));
  const needles = ctx.emitter({ x, y, rate: 140, tex: 'trace1', blend: 'normal', radius: [0, D * 0.3], speed: [D * 1.2, D * 2.4], life: [140, 280], size: [D * 0.3, D * 0.08],
    color: [c.dark, c.outer], alpha: [0.8, 0], rotateToVelocity: true }); // dark needles read against the bright dome
  ctx.burst({ x, y, count: 70, tex: 'trace1', speed: [D * 2, D * 4.5], life: [250, 500], size: [D * 0.35, 4], color: [c.core, c.mid], rotateToVelocity: true, drag: 2 });
  await ctx.tween(1000, (e, r) => {
    const rr = D * (0.2 + 0.8 * ease.outExpo(Math.min(1, r * 3)));
    size(dGlow, rr * 3); dGlow.alpha = 0.22; size(dBody, rr * 5); dBody.alpha = 0.32; size(dSwirl, rr * 2.2); dSwirl.rotation += 0.35; dSwirl.alpha = 0.3;
    size(dRim, rr * 2.2); dRim.alpha = 0.45 + 0.15 * Math.sin(r * 60);
    dTw.forEach((s, i) => { size(s, rr * (2 - i * 0.35)); s.rotation += 0.5 - i * 0.12; s.alpha = 0.45; });
    wash.set(0.12 * (1 - e));
  });
  needles.stop();
  // 5. collapse into wind and smoke
  ctx.burst({ x, y, count: 18, tex: ctx.pick(['smoke1', 'smoke2', 'smoke4']), radius: [0, D * 0.7], speed: [40, 160], life: [900, 1500], size: [D * 0.5, D * 0.9],
    color: [c.mid, c.outer], alpha: [0.3, 0], spin: [-2, 2] });
  await ctx.tween(600, (e) => { dome.alpha = 1 - e; dome.scale.set(1 + 0.15 * e); dSwirl.rotation += 0.2; });
  wash.fade(200);
  await ctx.wait(900);
}

// Several small rasengan float up around the hands, then are fired one after another.
async function rasenBarrage(ctx, p) {
  const { ease } = ctx;
  const c = ctx.palette(p.palette || 'chakra');
  const n = Math.max(2, Math.min(7, p.count ?? 4)), k = p.scale ?? 1, hs = ctx.handScale(), R0 = hs * 0.3 * k;
  const balls = [];
  let orbitT = 0;
  const slot = (i, R = hs * 1.35) => {
    const h = ctx.anchor('hands'), a = -Math.PI / 2 + ((i - (n - 1) / 2) / Math.max(1, n - 1)) * Math.PI * 1.1 + Math.sin(orbitT * 1.5 + i) * 0.08;
    return { x: h.x + Math.cos(a) * R * 1.3, y: h.y - hs * 0.2 + Math.sin(a) * R * 0.9 };
  };
  ctx.tick((dt) => {
    orbitT += dt / 1000;
    for (const b of balls) { if (b.free === false) { const q = slot(b.i); b.S.root.position.set(q.x, q.y); } b.S.update(dt); }
  });
  ctx.sfx.charge(0.5);
  ctx.sfx.spin(2.4);
  for (let i = 0; i < n; i++) {
    const S = makeSphere(ctx, c, ctx.layers.fx, { streaks: 8 }); S.R = 1;
    const b = { S, i, free: false }; balls.push(b);
    const q = slot(i);
    for (let j = 0; j < 14; j++) gather(ctx, q.x, q.y, [R0 * 2, R0 * 3.5], { tex: 'spark', life: [180, 260], size: [hs * 0.18, 2], color: [c.accent, c.mid], rotateToVelocity: true });
    ctx.sfx.sign(i + 3);
    ctx.tween(260, (e) => { S.R = R0 * e + 1; S.spin = 1 + e; }, ease.outBack).then(() => ring(ctx, S.root.x, S.root.y, R0, R0 * 2.6, c.mid, 350));
    await ctx.wait(220);
  }
  ctx.sfx.hum(1.2, 150);
  await ctx.wait(700);

  // fire them one by one at spread-out targets, last one hits hardest
  const targets = balls.map((b, i) => ({ x: ctx.W * (0.15 + 0.7 * (n === 1 ? 0.5 : i / (n - 1))), y: ctx.H * (0.28 + 0.12 * Math.sin(i * 2.1)) }));
  const flights = [];
  for (let i = 0; i < n; i++) {
    const b = balls[i], last = i === n - 1;
    b.free = true; const from = { x: b.S.root.x, y: b.S.root.y }, to = targets[i];
    ctx.sfx.whoosh(0.25);
    flights.push(ctx.tween(200, (e) => { b.S.root.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e); b.S.R = R0 * (1 + 0.8 * e); b.S.spin = 2.5; }, ease.inCubic).then(async () => {
      const R = b.S.R;
      ctx.sfx.boom(last ? 1.2 : 0.5);
      ctx.shake(last ? 18 : 9, last ? 600 : 300); if (last) { ctx.flash(c.glow, 140, 0.5); ctx.zoomPunch(0.06, 300); shockwave(ctx, to.x, to.y, { amp: 34, wave: 170, ms: 800 }); }
      ring(ctx, to.x, to.y, R, R * (last ? 5 : 3.2), c.core, 450);
      ctx.burst({ x: to.x, y: to.y, count: last ? 45 : 22, tex: 'spark', speed: [250, last ? 900 : 600], life: [250, 600], size: [R * 0.7, 4], color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.5, drag: 2.5 });
      ctx.burst({ x: to.x, y: to.y, count: 4, tex: 'twirl2', speed: [10, 60], life: [400, 700], size: [R * 1.8, R * 3.5], alpha: [0.8, 0], color: [c.core, c.mid], spin: [-14, -9] });
      ctx.burst({ x: to.x, y: to.y, count: 5, tex: 'smoke2', speed: [20, 70], life: [700, 1100], size: [R * 1.5, R * 2.5], alpha: [0.25, 0], color: [c.mid, c.outer] });
      await ctx.tween(300, (e) => { b.S.R = R * (1 + 0.5 * e); b.S.root.alpha = 1 - e; });
      b.S.root.visible = false;
    }));
    await ctx.wait(last ? 0 : 230);
  }
  await Promise.all(flights);
  await ctx.wait(900);
}

// ---------- healing ----------
function makeOrb(ctx, c, parent) {
  const root = new ctx.PIXI.Container(); parent.addChild(root);
  const base = sprite(ctx, 'circle5', c.outer, 'normal', root); // keeps the glow green over bright skin
  const halo = sprite(ctx, 'soft', c.glow, 'add', root);
  const body = sprite(ctx, 'light3', c.mid, 'add', root);
  const body2 = sprite(ctx, 'light1', c.accent, 'add', root);
  const rim = sprite(ctx, 'circle1', c.mid, 'add', root);
  const core = sprite(ctx, 'soft', c.core, 'add', root);
  let t = 0;
  return { root, R: 1, update(dt) {
    t += dt / 1000; const R = Math.max(1, this.R), pulse = 1 + 0.06 * Math.sin(t * 7);
    size(base, R * 5.5 * pulse); base.alpha = 0.45;
    size(halo, R * 4 * pulse); halo.alpha = 0.35; size(body, R * 2.2 * pulse); body.rotation += dt / 1000 * 0.8; body.alpha = 0.45;
    size(body2, R * 1.8); body2.rotation -= dt / 1000 * 1.3; body2.alpha = 0.4; size(rim, R * 2.3 * pulse); rim.alpha = 0.45; size(core, R * 0.8 * pulse); core.alpha = 0.6;
  } };
}

async function healingGlow(ctx, p) {
  const v = p.variant || 'heal';
  if (v === 'scalpel') return chakraScalpel(ctx, p);
  const { ease } = ctx;
  const c = ctx.palette(p.palette || 'medical');
  const mystical = v === 'mystical', k = p.scale ?? 1, hs = ctx.handScale(), R0 = hs * (mystical ? 0.75 : 0.6) * k;
  const at = () => ctx.anchor('hands');
  const O = makeOrb(ctx, c, ctx.layers.fx); O.R = 1;
  ctx.tick((dt) => { const h = at(); O.root.position.set(h.x, h.y - hs * 0.1); O.update(dt); });

  // 1. gather: soft motes drift into the palms
  ctx.sfx.heal(mystical ? 3.6 : 3);
  const gOn = { on: true };
  ctx.tick(() => { if (!gOn.on) return false; const h = at(); for (let i = 0; i < 2; i++) gather(ctx, h.x, h.y, [R0 * 2, R0 * 4], { tex: 'dot', life: [380, 560], size: [8, 2], color: [c.accent, c.mid], alpha: [0, 1] }, 0.6); });
  await ctx.tween(600, (e) => { O.R = R0 * 0.6 * e + 1; }, ease.inOutCubic);
  gOn.on = false;

  // 2. bloom: palms light up
  const wash = ctx.tint(c.glow, 0, 'add');
  let h = at(); ring(ctx, h.x, h.y, R0, R0 * 3, c.core, 600);
  ctx.burst({ x: h.x, y: h.y, count: 20, tex: 'star4', speed: [60, 220], life: [400, 700], size: [hs * 0.25, 0], color: [c.core, c.mid], drag: 2 });
  const rise = ctx.emitter({ x: () => at().x, y: () => at().y, rate: mystical ? 55 : 40, tex: 'dot', radius: [0, R0 * 1.4], speed: [40, 110], angle: [-Math.PI * 0.7, -Math.PI * 0.3],
    life: [1100, 1700], size: [9, 2], color: [c.core, c.mid, c.outer], alpha: [1, 0], gravity: -30 });
  const twinkle = ctx.emitter({ x: () => at().x, y: () => at().y, rate: 10, tex: 'star7', radius: [R0 * 0.5, R0 * 2], speed: [5, 20], life: [400, 700], size: [4, hs * 0.22], alpha: [1, 0], color: c.core, spin: 2 });

  // mystical: chakra seeps into the whole body (green rim on the person cutout) + water-like ripples at the palms
  const rim = mystical && (await ctx.personReady(600)) ? personHalo(ctx, c.mid, 12)?.rim : null;
  const orbit = mystical ? Array.from({ length: 10 }, (_, i) => ({ s: sprite(ctx, 'spark', i % 2 ? c.core : c.accent, 'add', ctx.layers.fx), ph: (i / 10) * TAU, sp: 2.2 + (i % 3) * 0.6, tilt: (i % 3) * 0.6 - 0.6 })) : [];
  let orbitA = 1;
  ctx.tick((dt, t) => {
    const hh = at();
    for (const o of orbit) {
      const a = o.ph + (t / 1000) * o.sp, lx = Math.cos(a) * R0 * 1.8, ly = Math.sin(a) * R0 * 0.6;
      o.s.position.set(hh.x + lx * Math.cos(o.tilt) - ly * Math.sin(o.tilt), hh.y + lx * Math.sin(o.tilt) + ly * Math.cos(o.tilt));
      o.s.rotation = a + Math.PI / 2 + o.tilt; size(o.s, R0 * 0.8, R0 * 0.1); o.s.alpha = (Math.sin(a) > 0 ? 0.9 : 0.3) * orbitA;
    }
  });

  const holdMs = mystical ? 2600 : 2200;
  let nextPulse = 0, pulses = 0;
  await ctx.tween(holdMs, (e, r) => {
    const tt = r * holdMs;
    O.R = R0 * (0.6 + 0.4 * ease.outCubic(Math.min(1, r * 2.5)));
    wash.set(0.05 * Math.min(1, r * 3) * (0.8 + 0.2 * Math.sin(tt / 140)));
    if (rim) rim.alpha = Math.min(1, r * 2) * (0.7 + 0.3 * Math.sin(tt / 120));
    if (tt >= nextPulse) {
      nextPulse += mystical ? 650 : 750; pulses++;
      const hh = at();
      ring(ctx, hh.x, hh.y, R0 * 0.8, R0 * (mystical ? 3.6 : 2.6), c.mid, 700, 0.7);
      if (mystical && pulses > 1) shockwave(ctx, hh.x, hh.y, { amp: 10, wave: 70, speed: 380, ms: 600, bright: 1.05 });
    }
  });

  // 3. release: the healing completes in a bright, gentle bloom
  h = at();
  ctx.sfx.chime();
  ctx.flash(c.glow, 220, 0.25);
  ring(ctx, h.x, h.y, R0, R0 * 5, c.core, 700);
  ctx.burst({ x: h.x, y: h.y, count: 36, tex: 'dot', speed: [120, 380], life: [600, 1100], size: [10, 2], color: [c.core, c.mid], drag: 2, gravity: -60 });
  ctx.burst({ x: h.x, y: h.y, count: 10, tex: 'star6', radius: [0, R0 * 2], speed: [10, 60], life: [500, 900], size: [hs * 0.35, 0], color: c.core, spin: 1.5 });
  rise.stop(); twinkle.stop();
  await ctx.tween(800, (e) => {
    O.R = R0 * (1 + 0.6 * e); O.root.alpha = 1 - ease.inCubic(e); wash.set(0.1 * (1 - e));
    if (rim) rim.alpha = 1 - e; orbitA = 1 - e;
  });
  // 4. lingering motes float away
  await ctx.wait(900);
}

// Chakra scalpels: razor-thin blades of light on the fingertips, a few surgical cuts.
async function chakraScalpel(ctx, p) {
  const { PIXI, ease } = ctx;
  const c = ctx.palette(p.palette || 'medical');
  const k = p.scale ?? 1, hs = ctx.handScale(), L = hs * 1.35 * k;
  const hands = () => {
    const l = ctx.anchor('leftHand'), r = ctx.anchor('rightHand');
    if (Math.abs(l.x - r.x) < hs * 0.6) { const m = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }; return [{ x: m.x - hs * 0.45, y: m.y }, { x: m.x + hs * 0.45, y: m.y }]; }
    return [l, r];
  };
  const blades = [0, 1].map((i) => {
    const b = box(ctx); b.base = i ? 0.35 : -0.35;
    const glow = sprite(ctx, 'soft', c.glow, 'add', b), mid = sprite(ctx, 'spark', c.mid, 'add', b), core = sprite(ctx, 'spark', c.core, 'add', b);
    for (const s of [glow, mid, core]) s.anchor.set(0, 0.5);
    glow.anchor.set(0.15, 0.5);
    b.parts = { glow, mid, core }; b.len = 0; b.swing = 0;
    return b;
  });
  let t = 0;
  ctx.tick((dt) => {
    t += dt; const hp = hands();
    blades.forEach((b, i) => {
      b.position.set(hp[i].x, hp[i].y - hs * 0.25); b.rotation = -Math.PI / 2 + b.base + b.swing;
      const fl = 1 + 0.08 * Math.sin(t / 25 + i * 3), Lb = Math.max(1, b.len);
      size(b.parts.glow, Lb * 1.3, hs * 0.5 * fl); b.parts.glow.alpha = 0.45;
      size(b.parts.mid, Lb, hs * 0.13 * fl); size(b.parts.core, Lb * 0.95, hs * 0.045);
    });
  });

  // 1. focus: needles of chakra into the fingertips
  ctx.sfx.charge(0.35);
  await ctx.tween(380, () => { for (const hp of hands()) gather(ctx, hp.x, hp.y - hs * 0.25, [hs * 0.6, hs * 1.3], { tex: 'spark', life: [160, 240], size: [hs * 0.18, 2], color: [c.accent, c.mid], rotateToVelocity: true }, 0); });

  // 2. blades extend with a high whine
  ctx.sfx.hum(2.6, 520); ctx.sfx.sizzle(0.5);
  for (const hp of hands()) ctx.burst({ x: hp.x, y: hp.y - hs * 0.25, count: 12, tex: 'spark', speed: [150, 400], life: [150, 300], size: [hs * 0.2, 2], color: c.core, rotateToVelocity: true, drag: 3 });
  await ctx.tween(260, (e) => { for (const b of blades) b.len = L * e; }, ease.outBack);
  const hum = ctx.emitter({ x: () => blades[t % 2 < 1 ? 0 : 1].x, y: () => blades[0].y, rate: 30, tex: 'dot', radius: [0, hs * 0.2], speed: [20, 60], angle: [-Math.PI * 0.8, -Math.PI * 0.2], life: [300, 500], size: [5, 1], color: [c.core, c.mid] });
  await ctx.wait(350);

  // 3. three precise cuts, alternating hands
  const cuts = [[1, 1], [0, -1], [1, -1]];
  for (const [bi, dir] of cuts) {
    const b = blades[bi];
    ctx.sfx.slash();
    const from = -0.9 * dir, to = 1.0 * dir;
    await ctx.tween(130, (e) => { b.swing = from + (to - from) * e; }, ease.outExpo);
    // the cut: thin hairline across this hand's arc + arc flash at the blade tip
    const tip = { x: b.x + Math.cos(b.rotation) * L, y: b.y + Math.sin(b.rotation) * L };
    const arc = sprite(ctx, 'slash3', c.core, 'add'); ctx.add(arc, 'front'); arc.position.set(b.x, b.y);
    arc.rotation = b.rotation - (Math.PI / 2) * dir * 0.6; size(arc, L * 1.1, L * 1.9); arc.scale.x *= dir;
    const line = ctx.g(); const ang = b.rotation + Math.PI / 2 * 0.8 * dir, len = ctx.W * 0.35;
    line.moveTo(tip.x - Math.cos(ang) * len, tip.y - Math.sin(ang) * len).lineTo(tip.x + Math.cos(ang) * len, tip.y + Math.sin(ang) * len).stroke({ width: 2, color: c.core, alpha: 1 });
    line.blendMode = 'add'; ctx.add(line, 'front');
    ctx.burst({ x: tip.x, y: tip.y, count: 14, tex: 'spark', speed: [200, 500], life: [160, 320], size: [hs * 0.18, 2], color: [c.core, c.mid], rotateToVelocity: true, drag: 3 });
    ctx.shake(4, 160);
    ctx.tween(380, (e) => { arc.alpha = 1 - e; line.alpha = 1 - e; }).then(() => { arc.destroy(); line.destroy(); });
    await ctx.tween(140, (e) => { b.swing = to * (1 - e); }, ease.inOutCubic);
    await ctx.wait(140);
  }
  ctx.sfx.crack();
  ctx.flash(c.glow, 160, 0.2);
  await ctx.wait(400);

  // 4. blades flicker off into motes
  hum.stop();
  ctx.sfx.fizzle();
  await ctx.tween(320, (e) => { for (const b of blades) { b.len = L * (1 - e); b.alpha = 1 - e * 0.5; } }, ease.inCubic);
  for (const b of blades) ctx.burst({ x: b.x, y: b.y, count: 10, tex: 'dot', speed: [30, 120], angle: [-Math.PI * 0.9, -Math.PI * 0.1], life: [400, 800], size: [6, 1], color: [c.core, c.mid] });
  for (const b of blades) b.visible = false;
  await ctx.wait(800);
}

// ---------- aura ----------
/** Live silhouette edge points from the person cutout (resampled), or an anchor-based head+shoulders outline. */
function silhouette(ctx) {
  const cw = 96, ch = 72, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  const S = { pts: [], top: null, cx: ctx.W / 2, real: false, map: null };
  function fallback() {
    const f = ctx.anchor('face'), W = ctx.W, H = ctx.H, rx = H * 0.17, ry = H * 0.22, cy = f.y - H * 0.02, pts = [];
    for (let i = 0; i <= 40; i++) { const a = Math.PI * 0.8 + (i / 40) * Math.PI * 1.4; pts.push({ x: f.x + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
    for (const sgn of [-1, 1]) {
      const p0 = { x: f.x + sgn * rx * 0.7, y: cy + ry * 1.05 }, p1 = { x: f.x + sgn * W * 0.3, y: H * 1.02 }, cp = { x: f.x + sgn * W * 0.29, y: cy + ry * 1.15 };
      for (let i = 0; i <= 30; i++) { const u = i / 30, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u; pts.push({ x: a * p0.x + b * cp.x + d * p1.x, y: a * p0.y + b * cp.y + d * p1.y }); }
    }
    S.pts = pts; S.top = { x: f.x, y: cy - ry }; S.cx = f.x; S.real = false;
  }
  function sample() {
    const s = ctx.personSprite(); if (!s) return false;
    const src = s.texture.source?.resource;
    if (!src || !src.width) { s.destroy(); return false; }
    g2.clearRect(0, 0, cw, ch);
    try { g2.drawImage(src, 0, 0, cw, ch); } catch { s.destroy(); return false; }
    const d = g2.getImageData(0, 0, cw, ch).data, on = (x, y) => d[(y * cw + x) * 4 + 3] > 110;
    const tw = s.texture.width, th = s.texture.height, pts = [];
    let top = null, sx = 0;
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      if (!on(x, y) || (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1))) continue;
      const P = { x: s.x + ((x + 0.5) / cw - 0.5) * tw * s.scale.x, y: s.y + ((y + 0.5) / ch - 0.5) * th * s.scale.y };
      pts.push(P); sx += P.x; if (!top || P.y < top.y) top = P;
    }
    S.map = { x: s.x, y: s.y, sx: s.scale.x, sy: s.scale.y };
    s.destroy();
    if (pts.length < 20) return false;
    S.pts = pts; S.top = top; S.cx = sx / pts.length; S.real = true;
    return true;
  }
  S.update = () => { if (!sample()) fallback(); };
  S.rand = () => S.pts[(Math.random() * S.pts.length) | 0];
  S.update();
  return S;
}

/** Swaying chain of glowing blobs (chakra tail) from base, drawn behind the person. */
function makeTail(ctx, c, parent, i, n, len) {
  const segs = 16, parts = [];
  for (let j = 0; j < segs; j++) {
    const s = sprite(ctx, j % 3 ? 'soft' : 'flame3', j < segs * 0.3 ? c.outer : c.mid, 'add', parent);
    s.alpha = 0.75; parts.push(s);
  }
  const spread = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * Math.PI * 0.95;
  return {
    parts,
    update(base, t, grow) {
      let x = base.x, y = base.y, a = -Math.PI / 2 + spread;
      const step = (len * grow) / segs;
      for (let j = 0; j < segs; j++) {
        const u = j / segs;
        a += (Math.sin(t * 2.1 + i * 1.7 + u * 3) * 0.18 + spread * 0.07) * (0.4 + u);
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        const s = parts[j], r = len * 0.16 * (1 - u * 0.7) * (0.9 + 0.1 * Math.sin(t * 9 + j));
        s.position.set(x, y); size(s, r * 2); s.rotation = a + Math.PI / 2;
      }
    },
  };
}

/** Solid-colour, blurred copy of the person cutout drawn just behind an exact copy (both on 'clones'):
 *  only a soft halo outside the outline shows. Null when there is no cutout. */
function personHalo(ctx, color, blur = 14) {
  const rim = ctx.personSprite(); if (!rim) return null;
  const tint = new ctx.filters.ColorOverlayFilter({ color, alpha: 1 });
  rim.filters = [tint, new ctx.PIXI.BlurFilter({ strength: blur, quality: 3 })];
  rim.blendMode = 'add'; rim.alpha = 0; rim.baseY = rim.y;
  ctx.add(rim, 'clones');
  const person = ctx.personSprite(); ctx.add(person, 'clones');
  return { rim, person, tint };
}

const AURA_PAL = { gates: 'boil', sage: 'fire', cloak: 'fire', tailed: 'genjutsu' };
// Gates: green chakra while the gates open, then red-hot once they blow (the palette only colours the steam).
const GATE_GREEN = [0xeaffee, 0x5affa0, 0x10b060], GATE_RED = [0xffe2d0, 0xff4a20, 0xb00c0c];

async function chakraAura(ctx, p) {
  const { ease } = ctx;
  const v = AURA_PAL[p.variant] ? p.variant : 'gates';
  const c = ctx.palette(p.palette || AURA_PAL[v]);
  const k = p.scale ?? 1, W = ctx.W, H = ctx.H, hs = ctx.handScale();
  const sil = silhouette(ctx);
  const ready = sil.real || (await ctx.personReady(800));
  if (ready && !sil.real) sil.update();

  // layers (all 'clones', in order): back glow + tails -> coloured halo -> exact person copy; overlay + front flames on 'fx'
  const back = box(ctx, 'clones');
  const backGlow = sprite(ctx, 'soft', v === 'gates' ? GATE_GREEN[1] : c.glow, 'add', back); backGlow.alpha = 0;
  const flameColor = v === 'gates' ? [...GATE_GREEN] : v === 'tailed' ? [c.glow, c.mid, c.outer] : [c.core, c.mid, c.outer];
  const halo = sil.real ? personHalo(ctx, v === 'gates' ? GATE_GREEN[1] : c.mid, v === 'sage' ? 10 : 16) : null;
  const rim = halo?.rim;
  let overlay = null;
  if (halo && v !== 'sage') {
    overlay = ctx.personSprite(); overlay.alpha = 0; ctx.add(overlay, 'fx');
    if (v === 'tailed') { overlay.tint = 0x000000; overlay.blendMode = 'normal'; } // darkened, cloaked body
    else { overlay.tint = v === 'gates' ? 0xff3a20 : c.mid; overlay.blendMode = 'add'; } // red skin (gates) / chakra cloak
  }
  const tails = [];
  const nT = v === 'tailed' ? Math.max(1, Math.min(9, p.count ?? 4)) : v === 'cloak' ? Math.max(1, Math.min(9, p.count ?? 1)) : 0;
  for (let i = 0; i < nT; i++) tails.push(makeTail(ctx, c, back, i, nT, H * 0.55 * k));

  // edge flames (custom spawn so each particle starts on the outline); muzzle/flame tongues point up
  const F = { rate: 0, size: 1, rise: 1, tex: v === 'sage' ? ['flame5', 'flame6', 'muzzle5'] : ['muzzle1', 'muzzle4', 'muzzle5', 'flame6'] };
  let acc = 0, resample = 0, tailGrow = 0;
  ctx.tick((dt, t) => {
    resample += dt; if (resample > 220) { resample = 0; sil.update(); }
    const top = sil.top || { x: W / 2, y: H * 0.2 };
    backGlow.position.set(sil.cx, top.y + H * 0.35); size(backGlow, H * 1.3 * k, H * 1.6 * k);
    if (rim) rim.y = rim.baseY - hs * 0.12 * F.rise * (1.5 + 0.5 * Math.sin(t / 70) * Math.sin(t / 43)); // halo licks upward like flame
    const base = { x: sil.cx, y: Math.min(H * 1.02, top.y + H * 0.85) };
    for (const tl of tails) tl.update(base, t / 1000, tailGrow);
    acc += (F.rate * dt) / 1000;
    while (acc >= 1) {
      acc--; const P = sil.rand(); if (!P) break;
      const sz = hs * 0.38 * F.size * k * ctx.rand(0.6, 1.2);
      ctx.burst({ count: 1, x: P.x + ctx.rand(-4, 4), y: P.y + ctx.rand(-4, 4), tex: ctx.pick(F.tex), rotation: ctx.rand(-0.15, 0.15), angle: [-Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25],
        speed: [60 * F.rise, 170 * F.rise], life: [320, 620], size: [sz, sz * 0.3], color: flameColor, alpha: [0.8, 0], accel: [0, -120 * F.rise], layer: Math.random() < 0.6 ? 'clones' : 'fx' });
    }
  });
  const chest = () => ({ x: sil.cx, y: (sil.top?.y ?? H * 0.2) + H * 0.45 });

  // ---- 1. anticipation ----
  const chargeMs = v === 'sage' ? 1300 : v === 'gates' ? 1200 : 750;
  ctx.sfx.charge(chargeMs / 1000);
  if (v === 'tailed') ctx.sfx.ominous(4.5);
  if (v === 'sage') ctx.sfx.hum(4.5, 98);
  let drawing = true, gate = 0;
  ctx.tick(() => {
    if (!drawing) return false;
    const ch = chest();
    if (v === 'sage') { // nature energy drifts in from the whole frame
      if (Math.random() < 0.6) gather(ctx, ch.x, ch.y, [W * 0.45, W * 0.7], { tex: ctx.pick(['dot', 'star4', 'leaf']), life: [900, 1300], size: [10, 3], color: [c.accent, c.core], alpha: [0, 0.9] }, 0.5);
    } else for (let i = 0; i < 2; i++) { const P = sil.rand(); if (P) gather(ctx, P.x, P.y, [hs * 0.8, hs * 2], { tex: 'spark', life: [220, 340], size: [hs * 0.25, 2], color: [flameColor[0], flameColor[1]], alpha: [0, 1], rotateToVelocity: true }, 0); }
  });
  await ctx.tween(chargeMs, (e, r) => {
    let pump = e;
    if (v === 'gates') { // gates thump open one after another, each step brighter
      const g = Math.min(4, Math.floor(r * 4.6));
      if (g > gate) { gate = g; const ch = chest(); ctx.sfx.boom(0.2 + 0.1 * g); ctx.shake(2 + 2 * g, 180); ring(ctx, ch.x, ch.y, H * 0.08, H * (0.25 + 0.08 * g), GATE_GREEN[1], 380, 0.6); }
      pump = (gate + 1) / 5;
    }
    F.rate = 60 * pump; F.size = 0.55 + 0.3 * pump; backGlow.alpha = 0.25 * pump; if (rim) rim.alpha = 0.95 * pump;
  });
  drawing = false;

  // ---- 2. release ----
  const ch = chest();
  const big = v === 'sage' ? 0.4 : v === 'gates' || v === 'tailed' ? 1.2 : 1;
  if (v === 'gates') { flameColor.splice(0, 3, ...GATE_RED); if (halo) halo.tint.color = GATE_RED[1]; backGlow.tint = GATE_RED[1]; }
  if (v === 'sage') { ctx.sfx.chime(); ctx.sfx.wind(1.5); } else { ctx.sfx.boom(big); ctx.sfx.roar(v === 'tailed' ? 2.4 : 1.6); }
  ctx.flash(v === 'gates' ? GATE_RED[1] : c.glow, 140, v === 'sage' ? 0.2 : 0.35);
  ctx.shake(18 * big, 700); ctx.zoomPunch(0.05 * big, 350);
  shockwave(ctx, ch.x, ch.y, v === 'sage' ? { amp: 14, wave: 120, speed: 700, ms: 900, bright: 1.05 } : { amp: 36 * big, wave: 200, speed: 1100, ms: 900 }); // sage: a calm ripple
  // sage: the eyes take on a steady golden glint (generic glow, no character markings)
  let eyeA = 0;
  if (v === 'sage') {
    const eyes = [-1, 1].map(() => [sprite(ctx, 'soft', c.accent, 'add'), sprite(ctx, 'star4', c.core, 'add')]);
    for (const e of eyes) for (const s of e) ctx.add(s, 'front');
    ctx.tick((dt, t) => {
      const f = ctx.anchor('face'), d = H * 0.045, tw = 1 + 0.15 * Math.sin(t / 90);
      eyes.forEach(([g, s], i) => { const x = f.x + (i ? d : -d), y = f.y - H * 0.03;
        g.position.set(x, y); s.position.set(x, y); size(g, H * 0.06 * tw); size(s, H * 0.045 * tw); g.alpha = 0.7 * eyeA; s.alpha = eyeA; s.rotation = t / 600; });
    });
  }
  ring(ctx, ch.x, ch.y, H * 0.2, H * 0.9, v === 'gates' ? GATE_RED[1] : c.mid, 700, 0.5);
  const gr = ctx.anchor('ground');
  if (v !== 'sage') {
    ctx.burst({ x: ch.x, y: gr.y - 8, count: 22, tex: ctx.pick(['smoke2', 'smoke3']), blend: 'normal', radius: [0, W * 0.35], speed: [120, 380], angle: [-Math.PI, 0], life: [900, 1500],
      size: [H * 0.14, H * 0.3], color: [v === 'tailed' ? c.dark : 0x8a8a90, 0x3a3a40], alpha: [0.45, 0], spin: [-1, 1] });
    ctx.burst({ x: ch.x, y: gr.y - 8, count: v === 'gates' ? 36 : 20, tex: ctx.pick(['dirt2', 'rock']), blend: 'normal', radius: [0, W * 0.3], speed: [400, 900], angle: [-Math.PI * 0.85, -Math.PI * 0.15],
      life: [700, 1200], size: [16, 8], color: 0x6a5a4a, alpha: [1, 0.7], gravity: 1500, spin: [-8, 8] });
  } else {
    ctx.burst({ x: ch.x, y: ch.y, count: 30, tex: 'dot', radius: [0, H * 0.3], speed: [60, 200], life: [700, 1200], size: [8, 2], color: [c.core, c.mid], alpha: [1, 0], gravity: -40 });
  }

  // gates: steam pours off the body (palette colours it); tailed: dark vapour
  const steam = v === 'gates' || v === 'tailed' ? ctx.emitter({ x: () => sil.cx, y: () => (sil.top?.y ?? H * 0.2) + H * 0.3, rate: v === 'gates' ? 22 : 12, tex: 'smoke4', blend: v === 'gates' ? 'screen' : 'add', radius: [0, H * 0.25],
    speed: [90, 200], angle: [-Math.PI * 0.65, -Math.PI * 0.35], life: [700, 1200], size: [H * 0.1, H * 0.28], color: v === 'gates' ? [c.core, c.mid, c.outer] : [c.mid, c.dark], alpha: [0.3, 0], spin: [-1, 1], layer: 'clones' }) : null;
  // tailed/cloak: bubbling chakra
  const bubbles = v === 'cloak' || v === 'tailed' ? ctx.emitter({ x: () => sil.rand()?.x ?? W / 2, y: () => sil.rand()?.y ?? H / 2, rate: 18, tex: 'circle2', radius: [0, 20], speed: [20, 70], angle: [-Math.PI * 0.8, -Math.PI * 0.2],
    life: [400, 800], size: [4, hs * 0.22], color: [c.core, c.mid], alpha: [0.9, 0] }) : null;
  let nextZap = 0;

  // ---- 3. sustain ----
  const holdMs = v === 'sage' ? 2400 : 2800;
  await ctx.tween(holdMs, (e, r) => {
    const tt = r * holdMs, fl = 0.85 + 0.15 * Math.sin(tt / 60) * Math.sin(tt / 37);
    const flare = Math.max(0, 1 - tt / 500); // burst of extra size right after release
    F.rate = v === 'sage' ? 100 : v === 'gates' ? 160 : 140;
    F.size = (v === 'sage' ? 0.75 : v === 'tailed' ? 1.1 : 1) * (1 + flare * 0.8);
    eyeA = Math.min(1, r * 5);
    F.rise = v === 'gates' ? 1.5 : v === 'sage' ? 0.6 : 1.1;
    backGlow.alpha = (v === 'sage' ? 0.25 : 0.35) * fl * (sil.real ? 1 : 0.6);
    if (rim) rim.alpha = fl;
    if (overlay) overlay.alpha = (v === 'tailed' ? 0.5 : v === 'gates' ? 0.16 + 0.05 * Math.sin(tt / 90) : 0.3) * Math.min(1, r * 4);
    tailGrow = ease.outBack(Math.min(1, r * 2.2));
    if (v === 'sage' && Math.random() < 0.6) { const P = sil.rand(), leaf = Math.random() < 0.3; // nature energy keeps drifting off the body
      if (P) ctx.burst({ x: P.x, y: P.y, count: 1, tex: leaf ? 'leaf' : 'dot', blend: leaf ? 'normal' : 'add', speed: [15, 50], angle: [-Math.PI * 0.75, -Math.PI * 0.25], life: [700, 1200],
        size: leaf ? [hs * 0.22, hs * 0.12] : [7, 1], color: leaf ? 0x9ad060 : [c.core, c.accent], alpha: [0.9, 0], spin: leaf ? [-3, 3] : 0, gravity: -30 }); }
    if ((v === 'tailed' || v === 'gates') && tt >= nextZap) {
      nextZap = tt + ctx.rand(140, 320);
      const P = sil.rand();
      if (P) ctx.burst({ x: P.x, y: P.y, count: 1, tex: ctx.pick(['spark1', 'spark2', 'spark3']), speed: 0, life: [90, 160], size: [hs * 0.8, hs * 0.9], color: v === 'tailed' ? c.glow : GATE_RED[0], alpha: [1, 0.2] });
    }
  });

  // ---- 4. dissipation ----
  steam?.stop(); bubbles?.stop();
  if (v !== 'sage') ctx.sfx.wind(1.2);
  await ctx.tween(900, (e) => {
    F.rate = 100 * (1 - e); F.size = 0.8 * (1 - e * 0.5);
    backGlow.alpha *= 0.94; if (rim) rim.alpha = 1 - e; if (overlay) overlay.alpha *= 0.92;
    tailGrow = 1 - ease.inCubic(e); eyeA = 1 - e;
    for (const t of tails) for (const s of t.parts) s.alpha = 0.75 * (1 - e);
  });
  F.rate = 0;
  // embers and smoke drift up from the outline
  for (let i = 0; i < 26; i++) {
    const P = sil.rand(); if (!P) break;
    ctx.burst({ x: P.x, y: P.y, count: 1, tex: i % 2 ? 'dot' : 'smoke2', blend: i % 2 ? 'add' : 'normal', speed: [20, 70], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [600, 1100],
      size: i % 2 ? [6, 1] : [hs * 0.6, hs * 1.2], color: i % 2 ? [flameColor[0], flameColor[1]] : c.dark, alpha: i % 2 ? [1, 0] : [0.25, 0] });
  }
  await ctx.wait(900);
}

// ---------- chakra blade ----------
function makeBeam(ctx, c, parent) {
  const b = new ctx.PIXI.Container(); parent.addChild(b);
  const glow = sprite(ctx, 'soft', c.glow, 'add', b), mid = sprite(ctx, 'spark', c.mid, 'add', b), core = sprite(ctx, 'spark', c.core, 'add', b), tip = sprite(ctx, 'star7', c.core, 'add', b);
  glow.anchor.set(0.12, 0.5); mid.anchor.set(0.02, 0.5); core.anchor.set(0.02, 0.5);
  let t = 0;
  return Object.assign(b, { len: 0, wid: 10, update(dt) {
    t += dt; const L = Math.max(1, b.len), f = 1 + 0.12 * Math.sin(t / 20) * Math.sin(t / 47);
    size(glow, L * 1.35, b.wid * 4.5 * f); glow.alpha = 0.5; size(mid, L, b.wid * 1.6 * f); mid.alpha = 0.95; size(core, L * 0.96, b.wid * 0.55);
    tip.position.set(L * 0.98, 0); size(tip, b.wid * 4 * f); tip.alpha = b.len > 4 ? 0.8 : 0;
  } });
}

async function chakraBlade(ctx, p) {
  const { ease } = ctx;
  const flow = p.variant === 'flow';
  const c = ctx.palette(p.palette || (flow ? 'wind' : 'chakra'));
  const k = p.scale ?? 1, hs = ctx.handScale(), L = hs * (flow ? 2.3 : 2.4) * k;
  const hilt = () => { const h = ctx.anchor('rightHand'); return { x: h.x + hs * 0.1, y: h.y - hs * 0.2 }; };
  const side = hilt().x >= ctx.W / 2 ? 1 : -1;          // blade leans away from the face
  const B = makeBeam(ctx, c, ctx.layers.fx); B.wid = hs * (flow ? 0.1 : 0.13) * k;
  const restAng = -Math.PI / 2 + 0.6 * side;
  let swing = 0, acc = 0, stream = 0;
  ctx.tick((dt) => {
    const q = hilt(); B.position.set(q.x, q.y);
    B.rotation = restAng + swing; B.update(dt);
    const on = Math.min(1, B.len / L), ca = Math.cos(B.rotation), sa = Math.sin(B.rotation);
    acc += dt * 0.06 * on;
    while (acc >= 1) { // chakra licks along the edge of the blade
      acc--; const u = Math.random() * B.len, sd = Math.random() < 0.5 ? -1 : 1;
      ctx.burst({ count: 1, x: B.x + ca * u - sa * B.wid * sd, y: B.y + sa * u + ca * B.wid * sd, tex: flow ? 'trace6' : 'muzzle5', rotation: B.rotation + (flow ? Math.PI / 2 : 0),
        angle: B.rotation + (Math.PI / 2) * sd, speed: [20, 80], life: [180, 320], size: [B.wid * (flow ? 4 : 3.5), B.wid], color: [c.core, c.mid, c.outer], alpha: [0.7, 0] });
    }
    if (flow) { // flow: chakra visibly streams out of the palm, up the blade and off the tip
      stream += dt * 0.08 * on;
      while (stream >= 1) {
        stream--; const life = ctx.rand(220, 320), off = ctx.rand(-1, 1) * B.wid * 1.2;
        ctx.burst({ count: 1, x: B.x - sa * off, y: B.y + ca * off, tex: 'spark', angle: B.rotation, speed: (B.len * 1.1) / (life / 1000), life: [life, life],
          size: [B.wid * 2.6, B.wid * 0.8], color: [c.core, c.accent, c.mid], alpha: [0.9, 0.2], rotateToVelocity: true, stretch: 0.25 });
      }
    }
  });

  // 1. anticipation: chakra runs down the arm and pools in the palm
  ctx.sfx.charge(0.6);
  const palm = sprite(ctx, 'soft', c.glow, 'add'); ctx.add(palm); palm.alpha = 0;
  const spiral = [0, 1, 2].map((i) => { const s = sprite(ctx, ['twirl1', 'twirl2', 'twirl3'][i], i ? c.mid : c.core, 'add'); ctx.add(s); s.alpha = 0; return s; });
  const sheath = (r, e) => { const q = hilt(); palm.position.set(q.x, q.y); spiral.forEach((s, i) => { s.position.set(q.x, q.y); s.rotation = r * (i % 2 ? -30 : 30); size(s, hs * (1.3 - i * 0.25) * e); }); };
  await ctx.tween(650, (e, r) => {
    const q = hilt();
    for (let i = 0; i < 2; i++) gather(ctx, q.x, q.y, [hs * 1, hs * 2.2], { tex: 'spark', life: [200, 320], size: [hs * 0.25, 2], color: [c.accent, c.mid], alpha: [0.2, 1], rotateToVelocity: true }, flow ? 0.6 : 0.1);
    sheath(r, e); size(palm, hs * 2 * e); palm.alpha = 0.4 * e; spiral.forEach((s) => (s.alpha = 0.7 * e));
  });

  // 2. the blade ignites and grows out of the hand
  ctx.sfx.hum(1.8, flow ? 260 : 170); ctx.sfx.sizzle(1); if (flow) ctx.sfx.wind(1.6);
  let q = hilt(); ring(ctx, q.x, q.y, hs * 0.3, hs * 1.4, c.core, 350);
  ctx.burst({ x: q.x, y: q.y, count: 16, tex: 'spark', speed: [150, 400], life: [180, 320], size: [hs * 0.25, 2], color: [c.core, c.mid], rotateToVelocity: true, drag: 3 });
  await ctx.tween(320, (e, r) => { B.len = L * e; sheath(0.65 + r * 0.3, 1); }, ease.outBack);
  ctx.shake(3, 200);
  await ctx.tween(800, (e, r) => {
    sheath(1 + r, 1 + 0.08 * Math.sin(r * 30)); palm.alpha = 0.3 + 0.08 * Math.sin(r * 40);
    swing = 0.35 * side * ease.inOutCubic(e);                // wind-up: cocks back before the cut
    B.len = L * (1 + 0.04 * Math.sin(r * 50));
  });

  // 3. release: one big diagonal cut (blade) or a fast X of two cuts (flow); each leaves a hairline across the screen
  const cuts = flow ? [[0.35, -2.3, 150], [-2.3, 0.6, 130]] : [[0.35, -2.4, 170]];
  for (let n = 0; n < cuts.length; n++) {
    const [a0, a1, ms] = cuts[n], s0 = a0 * side, s1 = a1 * side, last = n === cuts.length - 1;
    ctx.sfx.slash(); ctx.sfx.whoosh(0.3);
    const trail = sprite(ctx, 'slash4', c.mid, 'add'); ctx.add(trail, 'front'); trail.alpha = 0; // mid, not core: a white crescent read as paper over the face
    const mid = restAng + (s0 + s1) / 2;
    await ctx.tween(ms, (e) => {
      swing = s0 + (s1 - s0) * e;
      trail.position.set(B.x + Math.cos(mid) * L * 0.55, B.y + Math.sin(mid) * L * 0.55);
      trail.rotation = mid + Math.PI / 2; size(trail, L * 1.7, L * 0.75); trail.alpha = 0.75 * e; trail.scale.y *= Math.sign(s1 - s0);
    }, ease.outExpo);
    ctx.sfx.crack(); ctx.flash(c.glow, 110, last ? 0.3 : 0.2); ctx.shake(last ? 16 : 9, last ? 500 : 250); ctx.zoomPunch(last ? 0.05 : 0.03, 220);
    const cx = B.x + Math.cos(mid) * L * 0.8, cy = B.y + Math.sin(mid) * L * 0.8, cutA = mid + Math.PI / 2, len = Math.hypot(ctx.W, ctx.H);
    const cut = ctx.g(), x0 = cx - Math.cos(cutA) * len, y0 = cy - Math.sin(cutA) * len, x1 = cx + Math.cos(cutA) * len, y1 = cy + Math.sin(cutA) * len;
    cut.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 24, color: c.mid, alpha: 0.3 });
    cut.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 5, color: c.core, alpha: 1 });
    cut.blendMode = 'add'; ctx.add(cut, 'front');
    const wave = sprite(ctx, 'slash1', c.core, 'add'); ctx.add(wave, 'front'); const w0 = { x: B.x, y: B.y };
    for (let i = 0; i < 30; i++) { const u = ctx.rand(-0.5, 0.5) * len; ctx.burst({ x: cx + Math.cos(cutA) * u, y: cy + Math.sin(cutA) * u, count: 1, tex: 'spark', angle: cutA + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) + ctx.rand(-0.3, 0.3), speed: [100, 400], life: [250, 600], size: [hs * 0.3, 3], color: [c.core, c.mid], rotateToVelocity: true, drag: 2 }); }
    if (last) zoomBlur(ctx, cx, cy, 0.15, 400);
    ctx.tween(480, (e) => {
      trail.alpha = 0.75 * (1 - e);
      wave.position.set(w0.x + (cx - w0.x) * (1 + e), w0.y + (cy - w0.y) * (1 + e)); wave.rotation = cutA + Math.PI; size(wave, L * (1.2 + 3 * e), L * (0.8 + 2 * e)); wave.alpha = 1 - e;
      cut.alpha = 1 - ease.inCubic(e);
    }, ease.outCubic).then(() => { trail.destroy(); wave.destroy(); cut.destroy(); });
    if (!last) await ctx.wait(90);
  }
  const sEnd = swing;
  await ctx.tween(300, (e) => { swing = sEnd * (1 - e); }, ease.inOutCubic);
  await ctx.wait(250);

  // 4. follow-through: blade fades into rising wisps
  ctx.sfx.fizzle();
  await ctx.tween(450, (e) => { B.alpha = 1 - e; B.len *= 0.985; palm.alpha *= 0.9; spiral.forEach((s) => (s.alpha *= 0.85)); }, ease.inCubic);
  const ca = Math.cos(B.rotation), sa = Math.sin(B.rotation);
  for (let i = 0; i < 16; i++) { const u = Math.random() * B.len; ctx.burst({ x: B.x + ca * u, y: B.y + sa * u, count: 1, tex: i % 3 ? 'dot' : 'smoke2', speed: [20, 60], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [500, 900], size: i % 3 ? [6, 1] : [hs * 0.5, hs], color: [c.mid, c.outer], alpha: i % 3 ? [1, 0] : [0.2, 0] }); }
  B.visible = false; palm.visible = false;
  await ctx.wait(800);
}

// ---------- sign pulse (ambient) ----------
async function signPulse(ctx, p) {
  const c = ctx.palette(p.palette || 'chakra');
  const total = Math.max(1, p.total || 1), step = Math.max(1, Math.min(p.step || 1, total)), k = step / total, fin = step >= total;
  const hs = ctx.handScale(), at = () => ctx.anchor('hands');
  const C = box(ctx);
  const glow = sprite(ctx, 'soft', c.glow, 'add', C), r1 = sprite(ctx, 'circle2', c.mid, 'add', C), r2 = sprite(ctx, 'circle4', c.core, 'add', C);
  const seal = sprite(ctx, total >= 6 ? 'magic2' : 'magic1', c.accent, 'add', C), flare = sprite(ctx, fin ? 'star9' : 'star6', c.core, 'add', C);
  // progress pips: one per sign of the sequence, the done ones lit
  const pips = Array.from({ length: Math.min(total, 16) }, (_, i) => {
    const s = sprite(ctx, i < step ? 'star7' : 'dot', i < step ? c.core : c.mid, 'add', C); s.i = i; return s;
  });
  const dur = fin ? 600 : 460, R = hs * (0.75 + 0.35 * k);
  const pos = () => { const a = at(); C.position.set(a.x, a.y - hs * 0.1); };
  pos();
  // particles: all lives end before `dur` (ambient effects don't clear particles)
  const life = [Math.min(160, dur - 200), dur - 140];
  ctx.burst({ x: C.x, y: C.y, count: Math.round(8 + 18 * k + (fin ? 20 : 0)), tex: 'spark', radius: [R * 0.2, R * 0.5], speed: [140 * (1 + k), 360 * (1 + k)], life,
    size: [hs * (0.18 + 0.15 * k), 2], color: [c.core, c.mid], rotateToVelocity: true, stretch: 0.4, drag: 3 });
  if (k >= 0.5) ctx.burst({ x: C.x, y: C.y, count: Math.round(4 + 6 * k), tex: 'twirl2', speed: [5, 30], life, size: [R * 0.8, R * 2.2], alpha: [0.6, 0], color: [c.core, c.mid], spin: [-12, -7] });
  if (fin) {
    ctx.flash(c.glow, 160, 0.22); ctx.shake(5, 220); ctx.zoomPunch(0.025, 220); ctx.sfx.chime();
    ctx.burst({ x: C.x, y: C.y, count: 16, tex: 'star7', radius: [0, R], speed: [200, 500], life, size: [hs * 0.3, 0], color: c.core, drag: 3 });
  }
  await ctx.tween(dur, (e, r) => {
    pos();
    const out = 1 - r;
    size(glow, R * (2.2 + 1.2 * k) * (0.7 + 0.5 * e)); glow.alpha = (0.35 + 0.35 * k) * out;
    size(r1, R * (0.5 + (2.2 + 1.2 * k) * e)); r1.alpha = (0.6 + 0.4 * k) * out;
    size(r2, R * (0.3 + (1.4 + 2.2 * k) * ctx.ease.outCubic(Math.min(1, r * 1.4)))); r2.alpha = fin ? 0.9 * out : 0.5 * k * out;
    size(seal, R * 1.8 * (0.8 + 0.2 * e)); seal.rotation = r * (1 + 2 * k) * (step % 2 ? 1 : -1); seal.alpha = Math.max(0, k - 0.15) * Math.sin(r * Math.PI);
    size(flare, R * (0.9 + 1.4 * k + (fin ? 1.2 : 0)) * Math.sin(Math.min(1, r * 2.5) * Math.PI * 0.5 + 0.1) * out); flare.rotation = r * 0.8;
    for (const s of pips) {
      const a = -Math.PI / 2 + (s.i / pips.length) * TAU + r * 0.6;
      s.position.set(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05);
      const lit = s.i < step, cur = s.i === step - 1;
      size(s, lit ? hs * (cur ? 0.32 : 0.2) * (cur ? 1 + 0.6 * Math.sin(r * Math.PI) : 1) : hs * 0.06);
      s.alpha = (lit ? 1 : 0.45) * Math.min(1, r * 6) * (r > 0.7 ? (1 - r) / 0.3 : 1);
    }
  }, ctx.ease.outCubic);
}

export const EFFECTS = { rasengan, healingGlow, chakraAura, chakraBlade, signPulse };
