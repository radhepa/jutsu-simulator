# Jutsu Simulator — architecture & contracts

Static site (GitHub Pages, no build step). ES modules + import map. Webcam → hand-sign detector →
sequencer → effect. Everything runs in the browser.

## Libraries (all via CDN, pinned)
| What | Lib | License |
|---|---|---|
| Rendering / VFX | PixiJS 8.22.0 (`pixi.js` in import map) | MIT |
| Shader filters | pixi-filters 6.1.5 (`pixi-filters`): ZoomBlur, Shockwave, Godray, Twist, BulgePinch, Glow, AdvancedBloom, RGBSplit, Displacement, Glitch, OldFilm, CRT, Reflection, Radial/Motion blur, ColorOverlay, Outline... | MIT |
| Sign detection | YOLOX-Nano ONNX from Kazuhito00/NARUTO-HandSignDetection, onnxruntime-web 1.20.1 | MIT |
| Face / hands / person cutout | MediaPipe tasks-vision 0.10.14 | Apache-2.0 |
| Particle textures | Kenney Particle Pack (assets/fx/kenney) | CC0 |

## File ownership (parallel work — only edit files you own)
| Owner | Files |
|---|---|
| core (lead) | `js/engine/*`, `js/vision/*`, `js/game.js`, `js/fx/index.js`, `dev/fx.html`, `tools/shot.mjs`, `tools/build-data.mjs`, this file |
| fx-fire | `js/fx/fire.js` | fx-water `js/fx/water.js` | fx-storm `js/fx/storm.js` | fx-earth `js/fx/earth.js` |
| fx-hand | `js/fx/hand.js` | fx-ninja `js/fx/ninja.js` | fx-mystic `js/fx/mystic.js` |
| data | `data/src/<category>.json` (one file per agent) → merged into `data/jutsu.json` by `node tools/build-data.mjs` |
| assets | `assets/**`, `assets/manifest.json`, `assets/LICENSES.md` |
| ui | `index.html`, `css/**`, `js/main.js`, `js/ui/**` |

Need a change in a file you don't own? Don't edit it — work around it in your own file and list the
request in your final report.

## Effect contract
Each `js/fx/<file>.js` exports `EFFECTS = { typeName: async (ctx, params) => {} }`. The promise resolves
when the effect is over; the stage then destroys everything the effect created. Hard cap 14 s; aim for
2.5–5 s total (big S-rank jutsu may use up to ~7 s).

`params` = the jutsu's `fx` object: `{ type, palette, variant?, scale?, count? }` plus any extra keys
you document at the top of your function. Always provide defaults.

### Archetypes (fixed list; data may only use these)
| file | type | variants |
|---|---|---|
| fire | `fireball` | `single` `great` `barrage` (several balls) |
| fire | `flameStream` | `breath` `dragonflame` `inferno` (fills screen) |
| fire | `phoenixFlowers` | — (`count` = number of small fireballs) |
| fire | `ashBurn` | — (ash cloud that ignites) |
| fire | `blackFlames` | `burst` `shield` |
| water | `waterWave` | `wave` `vortex` `collision` |
| water | `waterShark` | `single` `school` (`count`) |
| water | `waterPrison` | — (sphere around the hands) |
| water | `waterBullets` | `bullet` `fang` `needles` |
| water | `iceShards` | `spikes` `mirrors` `storm` |
| water | `mist` | — (hidden mist) |
| storm | `windBlades` | `slash` `scythe` `gale` |
| storm | `airBullets` | `bullet` `vacuum` `breakthrough` |
| storm | `chidori` | `chidori` `raikiri` `spear` `current` (hand-attached) |
| storm | `lightningStrike` | `bolt` `kirin` `darkness` |
| storm | `lightningBeast` | `hound` `panther` |
| earth | `earthWall` | `wall` `dome` |
| earth | `earthSpikes` | `spikes` `golem` `quake` |
| earth | `mudSwamp` | `swamp` `mudslide` `river` |
| earth | `woodGrowth` | `branches` `forest` `prison` |
| earth | `sandSwirl` | `shield` `coffin` `tsunami` |
| hand | `rasengan` | `normal` `giant` `shuriken` `barrage` (in the palm, follows the hand) |
| hand | `healingGlow` | `heal` `scalpel` `mystical` |
| hand | `chakraAura` | `gates` `sage` `cloak` `tailed` (aura around the person) |
| hand | `chakraBlade` | `blade` `flow` |
| hand | `signPulse` | (ambient, not a jutsu: called on every accepted sign with `{step, total, palette}`; ≤ 600 ms, small, at the hands, intensifies as step→total) |
| ninja | `shadowClone` | `clone` `multi` `explode` (`count`) — uses the person cutout |
| ninja | `substitution` | — (poof, a log takes your place) |
| ninja | `transformation` | `poof` `sexy` is NOT allowed; use `poof` `animal` `elder` |
| ninja | `smokeEscape` | `smoke` `leaves` `flicker` |
| ninja | `shadowPossession` | `possession` `neckbind` `stitch` |
| mystic | `dragon` | `water` `fire` `earth` `wood` `lightning` (serpent body + head flies across) |
| mystic | `sealing` | `seal` `reaper` `tag` `chains` |
| mystic | `genjutsu` | `crows` `petals` `twist` `tsukuyomi` `bell` |

### `ctx` API (from `js/engine/stage.js`)
- `ctx.PIXI`, `ctx.filters` (pixi-filters namespace), `ctx.app`, `ctx.W`, `ctx.H`, `ctx.t` (ms since start)
- `ctx.ease.{linear,outCubic,inCubic,inOutCubic,outBack,outElastic,outExpo}`, `ctx.rand(a,b)`, `ctx.pick(v)` ([min,max] of 2 numbers → number in range; any other array → random element; fn → result), `ctx.choose(arr)` (random element). Particle `tex` may be an array (picked per particle)
- Layers: `ctx.add(displayObject, layer)` with layer `'back'` (behind video — rarely useful), `'clones'` (over video, under fx),
  `'fx'` (default), `'front'`, `'overlay'` (not shaken). `ctx.layers.fx` etc. are containers.
- `ctx.palette(name)` → `{core, mid, outer, glow, dark, accent}` (hex numbers). Palettes: see `js/engine/palettes.js`.
- `ctx.tex(name)` → `PIXI.Texture`. Names from `assets/manifest.json`; unknown names fall back to procedural
  textures: `soft` `dot` `spark` `ring` `smoke` `shard` (and by name pattern: flame*/magic*/light* → soft, smoke* → smoke,
  spark*/trace*/slash* → spark, circle* → ring, rock*/ice*/star* → shard). `ctx.has(name)` tells you whether a real asset loaded —
  for creature/prop sprites (dragon head, log, crow...) draw a procedural fallback when `has()` is false.
  Loaded Kenney CC0 textures (white/grey on transparent, tint freely): circle1-5 dirt1-3 fire1-2 flame1-6 flare1 light1-3
  magic1-5 muzzle1-5 scorch1-3 scratch1 slash1-4 smoke1-10 spark1-7 star1-9 symbol1-2 trace1-7 twirl1-3 window1-4.
  View them in `assets/fx/kenney/`. Generated sprites (when the art agent finishes) are added to the same manifest.
- Anchors (screen coords, smoothed, live — call every frame): `ctx.anchor('mouth'|'face'|'hands'|'leftHand'|'rightHand'|'center'|'ground'|'top')`.
  During an effect, hands come from MediaPipe hand tracking; before that from the sign box. `ctx.handScale()` ≈ palm size in px.
  `ctx.hands()` → `[{x, y, size}]`.
- Time: `await ctx.wait(ms)`, `await ctx.tween(ms, (easedP, rawP) => {}, ctx.ease.outCubic)`, `ctx.tick((dt, t) => { return false to stop })`.
  Never use setTimeout/requestAnimationFrame/Date — the FX lab steps time manually for screenshots.
- Camera: `ctx.shake(amp, ms)`, `ctx.zoomPunch(amount, ms)`.
- Screen: `ctx.flash(color, ms, alpha, blend)`, `ctx.tint(color, alpha, blend)` → `{set(a), fade(ms)}`,
  `ctx.filter(f)` adds a filter to the whole scene for the effect's lifetime (`ctx.removeFilter(f)` to drop early).
- Person cutout: `await ctx.personReady()` → bool; `ctx.personSprite()` → sprite of the user only (transparent background),
  already positioned exactly over the user, mirrored. `ctx.videoSprite()` → full camera frame copy. Always handle `personReady() === false`.
- `ctx.g()` → new `PIXI.Graphics` (v8 API: `g.circle(x,y,r).fill({color, alpha})`, `g.moveTo().lineTo().stroke({width,color})`).
- `ctx.sfx.*` synthesized sounds: `sign charge fizzle rankUp roar whoosh boom crackle chirp zap thunder splash wave wind slash rumble crack poof hum spin chime bell ominous crow sizzle heal` (see `js/engine/audio.js` for args).

### Particles
`ctx.burst(cfg)` (one shot) / `ctx.emitter(cfg)` (continuous, returns `{stop(), cfg}` — you may mutate `cfg` live).
Any numeric field may be a number, `[min, max]`, or a function (evaluated per particle); x/y may be functions to follow anchors.
```
{ tex: 'flame1', x, y, count (burst) | rate (per second, emitter), duration (ms, emitter),
  life: [min,max] ms, speed: [min,max] px/s, angle: [min,max] rad (0 = right, -PI/2 = up), radius: spawn radius,
  size: [start, end] px, alpha: [start, end], color: hex | [c0, c1, c2...] (gradient over life),
  blend: 'add' (default) | 'normal' | 'screen' | 'multiply', gravity px/s², accel: [ax, ay], drag (1/s),
  spin: rad/s, rotation, rotateToVelocity: bool, stretch (velocity stretch factor), layer }
```
Budget for phones: keep ≤ ~500 live particles, ≤ 2 full-scene filters at once, avoid redrawing huge Graphics paths every frame.

## What makes an effect good here
- Read like the anime moment: a clear **anticipation** (chakra gathers, ~300–600 ms), a big **release** (flash,
  shake, zoom punch, sound), a satisfying **follow-through** (lingering embers / smoke / ripples), then clean exit.
- Anchor to the body: fire from the mouth, Rasengan/Chidori in the palm and following it, auras around the person cutout.
- Layer 3+ things: core shape + particles + screen response (tint, filter, shake). Use pixi-filters for anime punch
  (ZoomBlur on release, Shockwave rings, Godray for light, Twist/BulgePinch for genjutsu/space, Displacement for heat/water).
- Never white out the whole screen for more than ~150 ms. Keep the user visible most of the time — it's about *them* casting.
- Variants must look meaningfully different, not just bigger.
- Original art only: no copied anime frames, logos or character likenesses.

## FX lab (visual testing)
- Interactive: serve the repo (`npx http-server -p 8137 -c-1`) and open `/dev/fx.html?fx=fireball&variant=great`.
- Screenshots: `node tools/shot.mjs <type> [--variant v] [--palette p] [--count n] [--times 200,600,1000,1500,2200,3000] [--out shots/x.png]`
  renders a contact sheet with a fake camera (person silhouette, mouth/hands anchors fixed) in headless Edge. Then look at the PNG.
  Page/effect errors are printed and set exit code 1.

## Data (`data/src/*.json` → `data/jutsu.json`)
```json
{ "id": "great-fireball", "name": "Fire Style: Great Fireball Jutsu", "romaji": "Katon: Gōkakyū no Jutsu", "jp": "火遁・豪火球の術",
  "element": "fire", "rank": "C", "signs": ["Snake","Ram","Monkey","Boar","Horse","Tiger"],
  "signsSource": "canon", "users": ["Sasuke Uchiha"], "desc": "Original one- or two-sentence description.",
  "fx": { "type": "fireball", "palette": "fire", "variant": "great" } }
```
- Signs: `Rat Ox Tiger Hare Dragon Snake Horse Ram Monkey Bird Dog Boar` + `Gassho` (palms pressed together) + `Mizunoe`. These are the only things the detector sees.
- `signsSource`: `canon` = shown in anime/manga/databook; `game` = from an official game; `adapted` = canon seals unknown or undetectable, so this app assigns a sequence.
- 50 jutsu total, no summoning jutsu. Every sign sequence must be unique and must not be a prefix of another (build-data errors). Elements: `fire water wind lightning earth wood ice lava sand storm boil scorch ninjutsu sealing genjutsu medical yin yang`.
- `node tools/build-data.mjs` merges + validates (unknown signs/fx/palettes, duplicate ids or sequences).

## Game API (for UI) — see the header comment in `js/game.js`
`const game = await new Game().init(hostElement)`; `await game.start()` (in a click handler); `game.setMode('guided', id) | ('freestyle') | ('idle')`;
`game.cast(id)` plays an effect directly (handbook "watch"); `game.jutsu`, `game.byId`. Events: `status ready detect progress wrong buffer fizzle timeout cast castEnd error`.
`index.html` must load `ort.webgpu.min.js` (onnxruntime-web 1.20.1) as a classic script before modules and define the import map for `pixi.js` / `pixi-filters`.
