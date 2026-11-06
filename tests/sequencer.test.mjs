import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequencer } from '../js/engine/sequencer.js';

const J = [
  { id: 'fireball', signs: ['Snake', 'Ram', 'Monkey', 'Boar', 'Horse', 'Tiger'] },
  { id: 'tiger', signs: ['Tiger'] },
  { id: 'tiger-snake', signs: ['Tiger', 'Snake'] },
  { id: 'double', signs: ['Ox', 'Ox', 'Dog'] },
];

// Hold each sign 300ms, then 100ms of nothing; returns all events.
function play(seq, signs, t0 = 0, gap = 100) {
  let t = t0; const ev = [];
  for (const s of signs) {
    for (let k = 0; k <= 6; k++) ev.push(...seq.feed(s, t += 50));
    for (let k = 0; k < gap / 50; k++) ev.push(...seq.feed(null, t += 50));
  }
  return { ev, t };
}

test('guided: full sequence casts once', () => {
  const s = createSequencer({ jutsu: J });
  s.guided(J[0]);
  const { ev } = play(s, J[0].signs);
  assert.equal(ev.filter((e) => e.type === 'cast').length, 1);
  assert.equal(ev.filter((e) => e.type === 'progress').length, 6);
});

test('guided: wrong sign does not advance', () => {
  const s = createSequencer({ jutsu: J });
  s.guided(J[0]);
  const { ev } = play(s, ['Snake', 'Dog', 'Ram']);
  assert.equal(s.step, 2);
  assert.ok(ev.some((e) => e.type === 'wrong' && e.expected === 'Ram'));
});

test('flicker does not double count, but a released repeat does', () => {
  const s = createSequencer({ jutsu: J });
  s.freestyle();
  let t = 0, ev = [];
  for (let k = 0; k < 20; k++) ev.push(...s.feed('Ox', t += 50));
  ev.push(...s.feed(null, t += 50));                       // 50ms flicker: not a release
  for (let k = 0; k < 10; k++) ev.push(...s.feed('Ox', t += 50));
  assert.deepEqual(s.buffer, ['Ox']);
  for (let k = 0; k < 8; k++) ev.push(...s.feed(null, t += 50)); // real release (400ms)
  for (let k = 0; k < 8; k++) ev.push(...s.feed('Ox', t += 50));
  assert.deepEqual(s.buffer, ['Ox', 'Ox']);
});

test('freestyle: unique match casts immediately; ambiguous prefix waits for idle', () => {
  const s = createSequencer({ jutsu: J });
  s.freestyle();
  let r = play(s, J[0].signs);
  assert.equal(r.ev.find((e) => e.type === 'cast')?.jutsu.id, 'fireball');

  r = play(s, ['Tiger'], r.t);
  assert.ok(!r.ev.some((e) => e.type === 'cast'));         // could still become tiger-snake
  let ev = [], t = r.t;
  for (let k = 0; k < 30; k++) ev.push(...s.feed(null, t += 50));
  assert.equal(ev.find((e) => e.type === 'cast')?.jutsu.id, 'tiger');
});

test('freestyle: dead-end sequence fizzles and restarts from the new sign', () => {
  const s = createSequencer({ jutsu: J });
  s.freestyle();
  const { ev } = play(s, ['Snake', 'Tiger']);
  const f = ev.find((e) => e.type === 'fizzle');
  assert.ok(f);
  assert.equal(f.closest.id, 'fireball');
  assert.deepEqual(s.buffer, ['Tiger']);
});
