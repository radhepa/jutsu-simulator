'use strict';

// Model class index -> sign. Order from the model's setting/labels.csv (minus the leading "None" row).
const CLASSES = ['Rat', 'Ox', 'Tiger', 'Hare', 'Dragon', 'Snake', 'Horse', 'Ram', 'Monkey', 'Bird', 'Dog', 'Boar', 'Gassho', 'Unknown', 'Mizunoe', 'Other'];
const KANJI = { Snake: '巳', Ram: '未', Monkey: '申', Boar: '亥', Horse: '午', Tiger: '寅' };
const HINTS = {
  Snake: 'Clasp both hands, fingers interlocked.',
  Ram: 'Index + middle fingers up on both hands; left hand wraps the right fingers.',
  Monkey: 'Left hand flat over the right, palms together crosswise.',
  Boar: 'Fingers curled, hands turned down, knuckles pressed together.',
  Horse: 'Index fingers point up and touch, thumbs folded in, other knuckles pressed together.',
  Tiger: 'Fingers interlocked, index + middle fingers of both hands pointing up together.',
};
// Great Fireball: Snake, Ram, Monkey, Boar, Horse, Tiger (same order the model's own jutsu list uses).
const SEQ = ['Snake', 'Ram', 'Monkey', 'Boar', 'Horse', 'Tiger'];

const SIZE = 416;          // model input
const MIN_SCORE = 0.55;    // detection confidence to count a sign
const HOLD = 2;            // consecutive inferences needed to accept a sign
const TIMEOUT_MS = 12000;  // reset sequence if stuck this long

const $ = (id) => document.getElementById(id);
const view = $('view'), ctx = view.getContext('2d');
const cam = $('cam');
const prep = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
const pctx = prep.getContext('2d', { willReadFrequently: true });

let session, busy = false;
let step = 0, holdName = null, holdCount = 0, lastProgress = 0;
let lastDet = null, casting = null, audio;

// ---------- UI ----------
function renderSeq() {
  $('seq').innerHTML = SEQ.map((s, i) =>
    `<div class="sign ${i < step ? 'done' : i === step ? 'next' : ''}"><b>${KANJI[s]}</b>${s}<br><small>${i + 1}</small></div>`
  ).join('');
  $('hint').innerHTML = step < SEQ.length
    ? `Next: <strong>${SEQ[step]}</strong>. ${HINTS[SEQ[step]]}`
    : '<strong>Katon! Gōkakyū no Jutsu!</strong>';
}
function reset() { step = 0; holdName = null; holdCount = 0; renderSeq(); }

$('resetBtn').onclick = reset;
$('qrBtn').onclick = () => {
  const url = location.href.split('#')[0];
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  $('qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
  $('qrUrl').textContent = url;
  $('qrDialog').showModal();
};
$('qrClose').onclick = () => $('qrDialog').close();
renderSeq();

// ---------- startup ----------
$('startBtn').onclick = async () => {
  const msg = $('loadMsg');
  $('startBtn').disabled = true;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    msg.textContent = 'Starting camera…';
    cam.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
    await cam.play();
    msg.textContent = 'Loading hand-sign model…';
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
    session = await ort.InferenceSession.create('model/yolox_nano.onnx', { executionProviders: ['wasm'] });
    $('startCard').hidden = true;
    $('status').hidden = false;
    lastProgress = performance.now();
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e);
    msg.textContent = e.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Error: ' + e.message;
    $('startBtn').disabled = false;
  }
};

// ---------- detection ----------
// Letterbox the frame top-left into 416x416 (pad 114), BGR, 0-255 floats, CHW. Matches the model's Python preprocessing.
function preprocess() {
  const vw = cam.videoWidth, vh = cam.videoHeight;
  const r = Math.min(SIZE / vw, SIZE / vh);
  pctx.fillStyle = 'rgb(114,114,114)';
  pctx.fillRect(0, 0, SIZE, SIZE);
  pctx.drawImage(cam, 0, 0, vw * r, vh * r);
  const px = pctx.getImageData(0, 0, SIZE, SIZE).data;
  const n = SIZE * SIZE, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = px[i * 4 + 2];         // B
    out[n + i] = px[i * 4 + 1];     // G
    out[2 * n + i] = px[i * 4];     // R
  }
  return { tensor: new ort.Tensor('float32', out, [1, 3, SIZE, SIZE]), r };
}

// Decode YOLOX grid output and return the single best detection (we only need the top sign).
function bestDetection(data, dims, r) {
  const [, rows, cols] = dims;
  const nc = cols - 5;
  let best = null, row = 0;
  for (const stride of [8, 16, 32]) {
    const g = SIZE / stride;
    for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++, row++) {
      const o = row * cols, obj = data[o + 4];
      if (obj < 0.1) continue;
      let c = 0, cs = data[o + 5];
      for (let k = 1; k < nc; k++) if (data[o + 5 + k] > cs) { cs = data[o + 5 + k]; c = k; }
      const score = obj * cs;
      if (!best || score > best.score) {
        const cx = (data[o] + gx) * stride, cy = (data[o + 1] + gy) * stride;
        const w = Math.exp(data[o + 2]) * stride, h = Math.exp(data[o + 3]) * stride;
        best = { name: CLASSES[c], score, x: (cx - w / 2) / r, y: (cy - h / 2) / r, w: w / r, h: h / r };
      }
    }
  }
  console.assert(row === rows, 'unexpected YOLOX output size', dims);
  return best;
}

async function detect() {
  busy = true;
  try {
    const { tensor, r } = preprocess();
    const res = await session.run({ [session.inputNames[0]]: tensor });
    const out = res[session.outputNames[0]];
    const d = bestDetection(out.data, out.dims, r);
    lastDet = d && d.score >= MIN_SCORE ? d : null;
    onSign(lastDet && lastDet.name);
  } finally { busy = false; }
}

function onSign(name) {
  const now = performance.now();
  $('status').textContent = name ? `Seeing: ${name} ${Math.round(lastDet.score * 100)}%` : 'Seeing: —';
  if (casting) return;
  if (step > 0 && now - lastProgress > TIMEOUT_MS) reset();
  if (name !== SEQ[step]) { holdName = null; holdCount = 0; return; }
  holdCount = holdName === name ? holdCount + 1 : 1;
  holdName = name;
  if (holdCount < HOLD) return;
  step++; holdName = null; holdCount = 0; lastProgress = now;
  chime(step);
  renderSeq();
  if (step === SEQ.length) castFireball();
}

// ---------- render loop ----------
function loop(t) {
  if (!busy && cam.readyState >= 2) detect();
  const W = cam.videoWidth || 640, H = cam.videoHeight || 480;
  if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
  ctx.save();
  if (casting) { const s = casting.shake(t); ctx.translate(s, -s * 0.6); }
  ctx.translate(W, 0); ctx.scale(-1, 1);   // mirror so it feels like a mirror
  ctx.drawImage(cam, 0, 0, W, H);
  if (lastDet && !casting) {
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3;
    ctx.strokeRect(lastDet.x, lastDet.y, lastDet.w, lastDet.h);
  }
  ctx.restore();
  if (casting) casting.draw(t, W, H);
  requestAnimationFrame(loop);
}

// ---------- Fireball effect (original canvas particles) ----------
function castFireball() {
  const start = performance.now(), DUR = 3200;
  // Launch from just above the hands (≈ mouth), mirrored to screen space.
  const W = view.width, H = view.height;
  const ox = lastDet ? W - (lastDet.x + lastDet.w / 2) : W / 2;
  const oy = lastDet ? Math.max(H * 0.2, lastDet.y - lastDet.h * 0.3) : H * 0.4;
  const parts = [];
  roar();
  casting = {
    shake: (t) => { const p = (t - start) / DUR; return p < 0.8 ? (Math.random() - 0.5) * 18 * Math.sin(Math.PI * p / 0.8) : 0; },
    draw(t, W, H) {
      const p = Math.min(1, (t - start) / DUR);
      const grow = 1 - Math.pow(1 - Math.min(1, p / 0.55), 3);           // ease-out growth
      const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      const R = 30 + grow * Math.max(W, H) * 0.75;
      const cx = ox + (W / 2 - ox) * grow * 0.5, cy = oy + (H / 2 - oy) * grow * 0.5;
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
        parts.push({ x: cx + Math.cos(a) * R * 0.6, y: cy + Math.sin(a) * R * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1, s: 20 + Math.random() * 50 });
      }
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(255,90,0,0.2)';   // orange wash
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(255,245,200,0.95)');
      g.addColorStop(0.2, 'rgba(255,200,60,0.9)');
      g.addColorStop(0.5, 'rgba(255,110,10,0.85)');
      g.addColorStop(0.8, 'rgba(190,30,0,0.5)');
      g.addColorStop(1, 'rgba(120,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';  // flames add light on top of the ball
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.x += q.vx; q.y += q.vy; q.life -= 0.03;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        const pg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.s);
        pg.addColorStop(0, `rgba(255,150,30,${0.35 * q.life})`);
        pg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (p >= 1) { casting = null; reset(); }
    },
  };
}

// ---------- sound (synthesized, no assets) ----------
function chime(n) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, n / 6);
  g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.3);
}
function roar() {
  if (!audio) return;
  const t = audio.currentTime, len = 3;
  const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(); src.buffer = buf;
  const f = audio.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1800, t + 0.6); f.frequency.linearRampToValueAtTime(200, t + len);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f).connect(g).connect(audio.destination); src.start(t);
}
