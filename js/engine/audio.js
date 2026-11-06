// Synthesized sound effects (no audio files). Every function is fire-and-forget and safe to call
// before the AudioContext exists (it just stays silent). Durations are in seconds.

let ac = null, master = null, out = null, noiseBuf = null, muted = false;

export function initAudio() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createDynamicsCompressor();
  out = ac.createGain(); out.gain.value = muted ? 0 : 0.8;
  master.connect(out).connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) { muted = m; if (out) out.gain.value = m ? 0 : 0.8; }

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function noise({ dur = 1, type = 'lowpass', f0 = 800, f1 = 200, q = 1, peak = 0.6, attack = 0.02, delay = 0 }) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, attack, peak, dur);
  src.connect(f).connect(g).connect(master); src.start(t, Math.random() * 3); src.stop(t + dur + 0.05);
}
function tone({ freq = 440, freq1 = freq, dur = 0.3, type = 'sine', peak = 0.2, attack = 0.01, delay = 0 }) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
  const g = ac.createGain(); env(g, t, attack, peak, dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  /** UI: a sign was accepted. n = step number for rising pitch. */
  sign(n = 1) { tone({ freq: 520 * Math.pow(2, n / 12), dur: 0.18, type: 'triangle', peak: 0.18 }); tone({ freq: 1040 * Math.pow(2, n / 12), dur: 0.12, peak: 0.05, delay: 0.02 }); },
  wrong() { tone({ freq: 180, freq1: 120, dur: 0.18, type: 'square', peak: 0.05 }); },
  /** Chakra charge-up right before a cast. */
  charge(dur = 0.6) { tone({ freq: 120, freq1: 900, dur, type: 'sawtooth', peak: 0.06, attack: dur * 0.8 }); noise({ dur, type: 'bandpass', f0: 300, f1: 3000, q: 3, peak: 0.15, attack: dur * 0.8 }); },
  fizzle() { noise({ dur: 0.5, type: 'highpass', f0: 3000, f1: 800, peak: 0.12 }); tone({ freq: 300, freq1: 90, dur: 0.4, type: 'triangle', peak: 0.08 }); },
  rankUp() { [0, 4, 7, 12].forEach((s, i) => tone({ freq: 440 * Math.pow(2, s / 12), dur: 0.35, type: 'triangle', peak: 0.15, delay: i * 0.09 })); },

  roar(dur = 2.5) { noise({ dur, f0: 300, f1: 120, peak: 0.9, attack: 0.15 }); noise({ dur: dur * 0.6, type: 'bandpass', f0: 900, f1: 300, q: 0.7, peak: 0.4, attack: 0.1 }); },
  whoosh(dur = 0.5) { noise({ dur, type: 'bandpass', f0: 400, f1: 2400, q: 1.2, peak: 0.5, attack: dur * 0.4 }); },
  boom(size = 1) { noise({ dur: 1.2 * size, f0: 500, f1: 40, peak: 1, attack: 0.005 }); tone({ freq: 90, freq1: 30, dur: 0.9 * size, peak: 0.6 }); },
  crackle(dur = 1.5) { for (let i = 0; i < dur * 14; i++) noise({ dur: 0.04 + Math.random() * 0.05, type: 'highpass', f0: 2000 + Math.random() * 4000, f1: 1500, peak: 0.2 + Math.random() * 0.3, attack: 0.002, delay: Math.random() * dur }); },
  /** Chirping-birds lightning (high buzzing chirps). */
  chirp(dur = 2) { noise({ dur, type: 'bandpass', f0: 5000, f1: 4000, q: 4, peak: 0.25, attack: 0.05 }); for (let i = 0; i < dur * 10; i++) tone({ freq: 2500 + Math.random() * 2500, freq1: 1800, dur: 0.05, type: 'square', peak: 0.04, delay: Math.random() * dur }); },
  zap() { noise({ dur: 0.35, type: 'highpass', f0: 6000, f1: 1500, peak: 0.6, attack: 0.002 }); tone({ freq: 1600, freq1: 80, dur: 0.3, type: 'sawtooth', peak: 0.15 }); },
  thunder() { this.zap(); noise({ dur: 2.5, f0: 900, f1: 60, peak: 0.9, attack: 0.01, delay: 0.08 }); },
  splash(dur = 1) { noise({ dur, type: 'bandpass', f0: 1500, f1: 300, q: 0.8, peak: 0.6, attack: 0.01 }); },
  wave(dur = 2.5) { noise({ dur, f0: 200, f1: 1200, peak: 0.7, attack: dur * 0.5 }); },
  wind(dur = 1.5) { noise({ dur, type: 'bandpass', f0: 600, f1: 1800, q: 2.5, peak: 0.4, attack: dur * 0.3 }); },
  slash() { noise({ dur: 0.25, type: 'highpass', f0: 1500, f1: 5000, peak: 0.5, attack: 0.01 }); },
  rumble(dur = 2) { noise({ dur, f0: 120, f1: 50, peak: 1, attack: 0.2 }); },
  crack() { noise({ dur: 0.3, type: 'bandpass', f0: 2500, f1: 600, q: 1, peak: 0.6, attack: 0.002 }); },
  poof() { noise({ dur: 0.45, f0: 2500, f1: 300, peak: 0.6, attack: 0.005 }); },
  hum(dur = 2, freq = 110) { tone({ freq, freq1: freq * 1.5, dur, type: 'sawtooth', peak: 0.07, attack: 0.2 }); tone({ freq: freq * 2.01, dur, peak: 0.05, attack: 0.2 }); },
  spin(dur = 2) { for (let i = 0; i < dur * 8; i++) noise({ dur: 0.12, type: 'bandpass', f0: 800, f1: 2400, q: 3, peak: 0.25, delay: i / 8 }); },
  chime() { [0, 7, 12, 19].forEach((s, i) => tone({ freq: 660 * Math.pow(2, s / 12), dur: 1.2, peak: 0.07, delay: i * 0.06 })); },
  bell() { tone({ freq: 880, dur: 2, peak: 0.2 }); tone({ freq: 1320 * 1.007, dur: 1.6, peak: 0.08 }); },
  ominous(dur = 2.5) { tone({ freq: 55, freq1: 45, dur, type: 'sawtooth', peak: 0.15, attack: 0.5 }); tone({ freq: 58, freq1: 47, dur, type: 'sawtooth', peak: 0.12, attack: 0.5 }); },
  crow(n = 3) { for (let i = 0; i < n; i++) tone({ freq: 900, freq1: 500, dur: 0.25, type: 'sawtooth', peak: 0.06, delay: i * 0.3 + Math.random() * 0.1 }); },
  sizzle(dur = 1.5) { noise({ dur, type: 'highpass', f0: 4000, f1: 6000, peak: 0.25, attack: 0.05 }); },
  heal(dur = 2) { [0, 4, 7].forEach((s, i) => tone({ freq: 523 * Math.pow(2, s / 12), dur, peak: 0.05, attack: 0.4, delay: i * 0.1 })); },
};
