// Effect registry. Each archetype file exports `EFFECTS = { typeName: async (ctx, params) => {...} }`.
// Files load independently so one broken file never takes down the rest.
const FILES = ['fire', 'water', 'storm', 'earth', 'hand', 'ninja', 'mystic'];

export async function loadEffects() {
  const all = { chakraBurst };
  await Promise.all(FILES.map(async (f) => {
    try { Object.assign(all, (await import(`./${f}.js`)).EFFECTS); }
    catch (e) { console.error(`fx/${f}.js failed to load`, e); }
  }));
  return all;
}

/** Fallback when a jutsu's fx.type is missing: a generic chakra release in the jutsu's palette. */
export async function chakraBurst(ctx, p) {
  const c = ctx.palette(p.palette), a = ctx.anchor('hands');
  ctx.sfx.charge(0.4);
  await ctx.wait(400);
  ctx.sfx.boom(0.6);
  ctx.flash(c.glow, 300, 0.5);
  ctx.shake(8, 400);
  ctx.burst({ x: a.x, y: a.y, count: 80, tex: 'soft', speed: [200, 700], life: [500, 1100], size: [60, 0], color: [c.core, c.mid, c.outer], drag: 2 });
  await ctx.wait(1200);
}
