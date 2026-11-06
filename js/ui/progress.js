// Progression: XP, ninja rank, per-jutsu mastery, achievements. Pure logic + localStorage I/O.
// State lives under "jutsu.progress". Tested from tools/ui-test.mjs (runs in Node).
export const KEY = 'jutsu.progress';

export const RANKS = [
  { name: 'Academy Student', k: '生', xp: 0 },
  { name: 'Genin', k: '下忍', xp: 150 },
  { name: 'Chūnin', k: '中忍', xp: 600 },
  { name: 'Jōnin', k: '上忍', xp: 1800 },
  { name: 'Kage', k: '影', xp: 4500 },
];
const BASE = { E: 10, D: 20, C: 35, B: 60, A: 90, S: 140 };
export const FIVE = ['fire', 'water', 'wind', 'lightning', 'earth'];

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Seal', desc: 'Cast your first jutsu.', test: (s) => s.casts >= 1 },
  { id: 'ten', name: 'Ten Scrolls', desc: 'Cast 10 different jutsu.', test: (s) => known(s) >= 10 },
  { id: 'five', name: 'Five Natures', desc: 'Cast fire, water, wind, lightning and earth.', test: (s) => FIVE.every((e) => s.elements.includes(e)) },
  { id: 'every', name: 'Every Path', desc: 'Cast a jutsu of every element in the handbook.', test: (s, c) => c.allElements.length > 0 && c.allElements.every((e) => s.elements.includes(e)) },
  { id: 'srank', name: 'S-Rank', desc: 'Cast an S-rank jutsu.', test: (s, c) => c.jutsu?.rank === 'S' },
  { id: 'blink', name: 'Blink', desc: 'Complete a sequence in under 3 seconds.', test: (s, c) => c.ms != null && c.ms < 3000 },
  { id: 'free', name: 'Improviser', desc: 'Cast in Freestyle, no guide.', test: (s, c) => c.mode === 'freestyle' },
  { id: 'master', name: 'Mastery', desc: 'Earn three stars on any jutsu.', test: (s, c) => c.jutsu && stars(s.jutsu[c.jutsu.id], c.jutsu) === 3 },
  { id: 'fifty', name: 'Tireless', desc: 'Cast 50 times.', test: (s) => s.casts >= 50 },
  { id: 'kage', name: 'Kage', desc: 'Reach the rank of Kage.', test: (s) => s.xp >= RANKS[4].xp },
  { id: 'all', name: 'Complete Handbook', desc: 'Cast every jutsu in the handbook.', test: (s, c) => c.total > 0 && known(s) >= c.total },
];

export const fresh = () => ({ xp: 0, casts: 0, jutsu: {}, elements: [], achievements: {} });
const known = (s) => Object.keys(s.jutsu).length;

export function load(storage = globalThis.localStorage) {
  try { return { ...fresh(), ...JSON.parse(storage.getItem(KEY) || '{}') }; } catch { return fresh(); }
}
export function save(s, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ } }

export function rankOf(xp) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const r = RANKS[i], next = RANKS[i + 1];
  return { ...r, index: i, next, frac: next ? (xp - r.xp) / (next.xp - r.xp) : 1 };
}

/** 1 star: cast once. 2: three casts. 3: five casts and a best time under 0.9 s per sign. */
export function stars(e, j) {
  if (!e?.casts) return 0;
  if (e.casts >= 5 && e.best != null && e.best < j.signs.length * 900) return 3;
  return e.casts >= 3 ? 2 : 1;
}

/** Speed tier from ms per sign. */
export function speedOf(ms, n) {
  if (ms == null || !n) return { mult: 1, label: '' };
  const per = ms / n;
  if (per < 600) return { mult: 2, label: 'Lightning hands' };
  if (per < 900) return { mult: 1.5, label: 'Swift' };
  if (per < 1400) return { mult: 1.2, label: 'Steady' };
  return { mult: 1, label: '' };
}

/**
 * Record a performed cast (not a handbook preview). Mutates `s`.
 * ctx: { mode, allElements, total }. Returns what happened so the UI can celebrate it.
 */
export function recordCast(s, j, ms, ctx = {}) {
  const before = rankOf(s.xp);
  const e = s.jutsu[j.id] || (s.jutsu[j.id] = { casts: 0, best: null });
  const isNew = e.casts === 0, starsBefore = stars(e, j);
  const isBest = ms != null && (e.best == null || ms < e.best);
  e.casts++; if (isBest) e.best = Math.round(ms);
  s.casts++;
  if (!s.elements.includes(j.element)) s.elements.push(j.element);
  const speed = speedOf(ms, j.signs.length);
  const xp = Math.round((BASE[j.rank] || 20) * speed.mult * (ctx.mode === 'freestyle' ? 1.25 : 1)) + (isNew ? 25 : 0);
  s.xp += xp;
  const after = rankOf(s.xp);
  const c = { ...ctx, allElements: ctx.allElements || [], jutsu: j, ms };
  const unlocked = [];
  for (const a of ACHIEVEMENTS) if (!s.achievements[a.id] && a.test(s, c)) { s.achievements[a.id] = Date.now(); unlocked.push(a); }
  return { xp, speed, isNew, isBest: isBest && !isNew, best: e.best, stars: stars(e, j), starUp: stars(e, j) > starsBefore,
    rankUp: after.index > before.index ? after : null, achievements: unlocked };
}
