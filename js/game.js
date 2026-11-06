// Game controller: camera -> vision -> sequencer -> effects. UI talks to this through events.
//
// Events (game.addEventListener(type, e => e.detail)):
//   status   {text}                         loading / camera messages
//   ready    {backend}                      camera + sign model running
//   detect   {sign, score}                  every detection (sign may be null)
//   progress {sign, step, total}            guided: correct sign
//   wrong    {sign, expected, step}         guided: wrong sign (no reset)
//   buffer   {buffer, candidates}           freestyle: current signs + jutsu still reachable
//   fizzle   {buffer, closest}              freestyle: no jutsu matches
//   timeout  {}                             guided: reset after inactivity
//   cast     {jutsu, ms, signs, preview}    jutsu fires (effect starting)
//   castEnd  {jutsu}                        effect finished
//   error    {message}
import { createSequencer } from './engine/sequencer.js';
import { createStage } from './engine/stage.js';
import { initAudio, sfx } from './engine/audio.js';
import { loadEffects, chakraBurst } from './fx/index.js';
import { initSigns, detectSign, signBackend } from './vision/signs.js';
import * as track from './vision/tracking.js';

export class Game extends EventTarget {
  constructor() {
    super();
    this.jutsu = []; this.byId = {}; this.effects = {};
    this.stage = null; this.video = null; this.running = false; this.casting = null;
    this.seq = null; this.lastDetect = null;
  }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  /** Load data + effects and mount the stage into `host`. Safe to call before the camera starts. */
  async init(host) {
    const [data, effects] = await Promise.all([
      fetch(new URL('../data/jutsu.json', import.meta.url)).then((r) => r.json()),
      loadEffects(),
    ]);
    this.jutsu = data.jutsu || data;
    this.byId = Object.fromEntries(this.jutsu.map((j) => [j.id, j]));
    this.effects = effects;
    this.seq = createSequencer({ jutsu: this.jutsu });
    this.video = Object.assign(document.createElement('video'), { playsInline: true, muted: true, autoplay: true });
    this.video.setAttribute('playsinline', '');
    this.stage = await createStage(host, this.video);
    this.stage.setPersonSource(track.personCanvas, async () => !!(await track.loadSegmenter()));
    return this;
  }

  /** Must be called from a user gesture (camera + audio permissions). */
  async start() {
    initAudio();
    try {
      this.emit('status', { text: 'Starting camera…' });
      this.video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
      });
      await this.video.play();
      this.stage.attachVideo();
      this.emit('status', { text: 'Loading hand-sign model…' });
      await initSigns(new URL('../model/yolox_nano.onnx', import.meta.url).href);
      track.loadFace(); track.loadHands(); // warm up in background
      this.running = true;
      this.loop();
      this.emit('ready', { backend: signBackend() });
    } catch (e) {
      console.error(e);
      const message = {
        NotAllowedError: 'Camera permission was denied.',
        NotFoundError: 'No camera found.',
        NotReadableError: 'Camera is busy in another app.',
        TrackStartError: 'Camera is busy in another app.',
        OverconstrainedError: 'This camera does not support the requested video size.',
      }[e.name] || e.message;
      this.emit('error', { message });
      throw e;
    }
  }

  setMode(mode, jutsuId) {
    if (mode === 'guided') this.seq.guided(this.byId[jutsuId]);
    else if (mode === 'freestyle') this.seq.freestyle();
    else this.seq.idle();
    this.mode = mode;
  }
  reset() { this.seq.reset(); }

  /** Play a jutsu's effect directly (handbook "watch" / after a successful sequence). */
  async cast(id, info = {}) {
    const j = this.byId[id];
    if (!j || this.casting) return;
    this.casting = j;
    this.emit('cast', { jutsu: j, ...info });
    const fn = this.effects[j.fx?.type] || chakraBurst;
    if (/clone|transformation|substitution/.test(j.fx?.type || '')) track.loadSegmenter();
    try { await this.stage.play(fn, { palette: j.element, ...j.fx }); }
    finally {
      this.casting = null;
      this.seq.reset();
      this.emit('castEnd', { jutsu: j });
    }
  }

  async loop() {
    let frame = 0;
    while (this.running) {
      await new Promise((r) => (this.video.requestVideoFrameCallback ? this.video.requestVideoFrameCallback(() => r()) : requestAnimationFrame(r)));
      frame++;
      const v = this.video;
      try {
        // Face every few frames (mouth anchor); hands + segmentation only while an effect plays.
        if (frame % 3 === 0) { const f = track.trackFace(v); if (f) this.stage.setAnchors(f); }
        if (this.casting) {
          this.stage.setAnchors({ hands: track.trackHands(v) });
          track.updateSegmentation(v);
          continue;
        }
        const d = await detectSign(v, 0.5);
        this.lastDetect = d;
        this.stage.setAnchors({ signBox: d, hands: [] });
        this.emit('detect', { sign: d?.name ?? null, score: d?.score ?? 0, box: d });
        for (const e of this.seq.feed(d?.name ?? null, performance.now())) this.handle(e);
      } catch (e) { console.error(e); }
    }
  }

  handle(e) {
    const pulse = (step, total, palette) => this.stage.playAmbient(this.effects.signPulse || chakraBurstSmall, { step, total, palette });
    if (e.type === 'progress') { sfx.sign(e.step); pulse(e.step, e.total, this.seq.target?.fx?.palette); }
    if (e.type === 'buffer' && e.buffer.length) {
      sfx.sign(e.buffer.length);
      const only = e.candidates.length === 1 ? e.candidates[0] : null;   // tint by element once the jutsu is certain
      pulse(e.buffer.length, only ? only.signs.length : e.buffer.length + 1, only?.fx?.palette || 'chakra');
    }
    if (e.type === 'wrong') sfx.wrong();
    if (e.type === 'fizzle') { sfx.fizzle(); this.stage.play(fizzleFx, {}); }
    if (e.type === 'cast') { this.cast(e.jutsu.id, { ms: e.ms, signs: e.signs }); return; }
    this.emit(e.type, e);
  }
}

async function chakraBurstSmall(ctx, p) {
  const c = ctx.palette(p.palette), a = ctx.anchor('hands');
  ctx.burst({ x: a.x, y: a.y, count: 10 + 4 * p.step, tex: 'soft', speed: [80, 260], life: [250, 500], size: [30, 0], color: [c.core, c.mid] });
  await ctx.wait(500);
}

// Chakra sputters out: a small grey puff at the hands.
async function fizzleFx(ctx) {
  const a = ctx.anchor('hands');
  ctx.burst({ x: a.x, y: a.y, count: 18, tex: 'smoke1', blend: 'normal', speed: [40, 140], life: [500, 900], size: [40, 90], color: 0x9a9aa4, alpha: [0.6, 0] });
  ctx.burst({ x: a.x, y: a.y, count: 14, tex: 'spark', speed: [100, 300], life: [200, 500], size: [16, 2], color: 0x8ad8ff, rotateToVelocity: true });
  await ctx.wait(900);
}
