// Merge data/src/*.json into data/jutsu.json and validate everything.
// Usage: node tools/build-data.mjs        (exit code 1 on any error)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNS } from '../js/engine/sequencer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// fx archetypes and the file that implements each (keep in sync with ARCHITECTURE.md).
export const FX = {
  fire: ['fireball', 'flameStream', 'phoenixFlowers', 'ashBurn', 'blackFlames'],
  water: ['waterWave', 'waterShark', 'waterPrison', 'waterBullets', 'iceShards', 'mist'],
  storm: ['windBlades', 'airBullets', 'chidori', 'lightningStrike', 'lightningBeast'],
  earth: ['earthWall', 'earthSpikes', 'mudSwamp', 'woodGrowth', 'sandSwirl'],
  hand: ['rasengan', 'healingGlow', 'chakraAura', 'chakraBlade', 'signPulse'],
  ninja: ['shadowClone', 'substitution', 'transformation', 'smokeEscape', 'shadowPossession'],
  mystic: ['dragon', 'sealing', 'genjutsu'],
};
const FX_TYPES = new Set(Object.values(FX).flat());
const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const ELEMENTS = ['fire', 'water', 'wind', 'lightning', 'earth', 'wood', 'ice', 'lava', 'sand', 'storm', 'boil', 'scorch', 'ninjutsu', 'sealing', 'genjutsu', 'medical', 'yin', 'yang'];
const SOURCES = ['canon', 'game', 'adapted'];

const srcDir = path.join(ROOT, 'data/src');
const files = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => f.endsWith('.json')).sort() : [];
const errors = [], warnings = [], all = [];
const PALETTES = Object.keys((await import('../js/engine/palettes.js')).PALETTES);

for (const f of files) {
  let list;
  try { list = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8')); } catch (e) { errors.push(`${f}: invalid JSON: ${e.message}`); continue; }
  list = list.jutsu || list;
  for (const j of list) {
    const at = `${f}:${j.id}`;
    for (const k of ['id', 'name', 'element', 'rank', 'signs', 'signsSource', 'desc', 'fx']) if (j[k] == null) errors.push(`${at}: missing ${k}`);
    if (!/^[a-z0-9-]+$/.test(j.id || '')) errors.push(`${at}: id must be kebab-case`);
    if (!Array.isArray(j.signs) || !j.signs.length) errors.push(`${at}: signs must be a non-empty array`);
    else for (const s of j.signs) if (!SIGNS.includes(s)) errors.push(`${at}: unknown sign "${s}"`);
    if (j.rank && !RANKS.includes(j.rank)) errors.push(`${at}: rank must be one of ${RANKS}`);
    if (j.element && !ELEMENTS.includes(j.element)) errors.push(`${at}: element must be one of ${ELEMENTS}`);
    if (j.signsSource && !SOURCES.includes(j.signsSource)) errors.push(`${at}: signsSource must be one of ${SOURCES}`);
    if (j.fx && !FX_TYPES.has(j.fx.type)) errors.push(`${at}: unknown fx.type "${j.fx?.type}"`);
    if (j.fx?.palette && !PALETTES.includes(j.fx.palette)) errors.push(`${at}: unknown fx.palette "${j.fx.palette}"`);
    if (j.fx && !j.fx.palette) warnings.push(`${at}: no fx.palette`);
    if ((j.desc || '').length > 260) warnings.push(`${at}: desc is long (${j.desc.length} chars)`);
    all.push({ ...j, _file: f });
  }
}

const seenId = new Map(), seenSeq = new Map();
for (const j of all) {
  if (seenId.has(j.id)) errors.push(`duplicate id ${j.id} (${seenId.get(j.id)} and ${j._file})`);
  seenId.set(j.id, j._file);
  const key = (j.signs || []).join('>');
  if (seenSeq.has(key)) errors.push(`identical sign sequence ${key}: ${seenSeq.get(key)} and ${j.id}`);
  seenSeq.set(key, j.id);
}
// Freestyle casts on a unique exact match, so a sequence that is a prefix of another only casts after the idle wait.
for (const a of all) for (const b of all)
  if (a !== b && b.signs?.length > a.signs?.length && a.signs.every((s, i) => b.signs[i] === s)) errors.push(`${a.id} (${a.signs.join('>')}) is a prefix of ${b.id}`);

const order = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };
const out = all.map(({ _file, ...j }) => j).sort((a, b) => a.element.localeCompare(b.element) || order[a.rank] - order[b.rank] || a.name.localeCompare(b.name));
if (all.length) fs.writeFileSync(path.join(ROOT, 'data/jutsu.json'), JSON.stringify({ jutsu: out }, null, 1) + '\n');

const byFx = {}; for (const j of out) byFx[j.fx?.type] = (byFx[j.fx?.type] || 0) + 1;
console.log(`${out.length} jutsu from ${files.length} files`);
console.log('by fx:', JSON.stringify(byFx));
for (const w of warnings) console.log('warn:', w);
for (const e of errors) console.log('ERROR:', e);
if (errors.length) process.exit(1);
