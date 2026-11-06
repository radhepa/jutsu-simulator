// Turns a noisy stream of per-frame sign detections into accepted signs, then into casts.
// Pure logic (no DOM) so it can be unit-tested in Node: see tests/sequencer.test.mjs.

export const SIGNS = ['Rat', 'Ox', 'Tiger', 'Hare', 'Dragon', 'Snake', 'Horse', 'Ram', 'Monkey', 'Bird', 'Dog', 'Boar', 'Gassho', 'Mizunoe'];

const same = (a, b) => a.length === b.length && a.every((s, i) => s === b[i]);
const startsWith = (seq, prefix) => prefix.length <= seq.length && prefix.every((s, i) => s === seq[i]);

/**
 * @param {object} o
 * @param {Array<{id:string, signs:string[]}>} o.jutsu
 * @param {number} [o.holdMs]    a sign must be seen this long to count
 * @param {number} [o.releaseMs] the same sign counts again only after being gone this long
 * @param {number} [o.idleMs]    freestyle: resolve the buffer after this long without a new sign
 * @param {number} [o.timeoutMs] guided: reset after this long without progress
 */
export function createSequencer({ jutsu, holdMs = 220, releaseMs = 300, idleMs = 1200, timeoutMs = 15000 }) {
  let mode = 'idle', target = null, step = 0, buffer = [];
  let cand = null, candSince = 0;   // sign currently held and since when
  let lock = null;                   // last accepted sign, blocks double-counting until released
  let lastAccept = 0, lastSeen = 0, startedAt = 0;

  const candidates = (buf) => jutsu.filter((j) => startsWith(j.signs, buf));
  const exact = (buf) => jutsu.find((j) => same(j.signs, buf));

  function reset() { step = 0; buffer = []; lock = null; cand = null; startedAt = 0; }

  function accept(sign, now) {
    const ev = [];
    lock = sign; lastAccept = now;
    if (!startedAt) startedAt = now;
    if (mode === 'guided') {
      if (sign === target.signs[step]) {
        step++;
        ev.push({ type: 'progress', sign, step, total: target.signs.length });
        if (step === target.signs.length) {
          ev.push({ type: 'cast', jutsu: target, ms: now - startedAt, signs: target.signs.length });
          reset();
        }
      } else {
        ev.push({ type: 'wrong', sign, expected: target.signs[step], step });
      }
    } else if (mode === 'freestyle') {
      const next = [...buffer, sign];
      const cands = candidates(next);
      if (!cands.length) {
        ev.push({ type: 'fizzle', buffer: next, closest: closest(next) });
        buffer = candidates([sign]).length ? [sign] : [];
        startedAt = buffer.length ? now : 0;
        ev.push({ type: 'buffer', buffer: [...buffer], candidates: candidates(buffer) });
        return ev;
      }
      buffer = next;
      ev.push({ type: 'buffer', buffer: [...buffer], candidates: cands });
      const hit = exact(buffer);
      if (hit && cands.length === 1) {   // nothing longer could still match: cast now
        ev.push({ type: 'cast', jutsu: hit, ms: now - startedAt, signs: buffer.length });
        reset();
      }
    }
    return ev;
  }

  // Best partial match, for "did you mean" hints after a fizzle.
  function closest(buf) {
    let best = null, bestN = 0;
    for (const j of jutsu) {
      let n = 0;
      while (n < buf.length && n < j.signs.length && buf[n] === j.signs[n]) n++;
      if (n > bestN) { bestN = n; best = j; }
    }
    return best;
  }

  return {
    get mode() { return mode; },
    get step() { return step; },
    get buffer() { return [...buffer]; },
    get target() { return target; },
    guided(j) { mode = 'guided'; target = j; reset(); },
    freestyle() { mode = 'freestyle'; target = null; reset(); },
    idle() { mode = 'idle'; target = null; reset(); },
    reset,
    candidates,
    /** Feed one detection result (sign name or null). Returns a list of events. */
    feed(sign, now) {
      if (mode === 'idle') return [];
      if (sign !== cand) { cand = sign; candSince = now; }
      const held = now - candSince;
      if (cand) lastSeen = now;
      const ev = [];
      if (lock && cand !== lock && held >= releaseMs) lock = null;
      if (cand && cand !== 'Unknown' && held >= holdMs && cand !== lock) ev.push(...accept(cand, now));

      if (mode === 'freestyle' && buffer.length && !cand && now - Math.max(lastAccept, lastSeen) > idleMs) {
        const hit = exact(buffer);
        ev.push(hit ? { type: 'cast', jutsu: hit, ms: lastAccept - startedAt, signs: buffer.length }
                    : { type: 'fizzle', buffer: [...buffer], closest: closest(buffer) });
        reset();
        ev.push({ type: 'buffer', buffer: [], candidates: [] });
      }
      if (mode === 'guided' && step > 0 && now - lastAccept > timeoutMs) {
        reset();
        ev.push({ type: 'timeout' });
      }
      return ev;
    },
  };
}
