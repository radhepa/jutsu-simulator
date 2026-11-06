// Handbook: searchable, filterable list of every jutsu + a detail view with the exact seals.
import { SIGN_INFO, signTile, esc } from './signs.js';
import { stars } from './progress.js';

export const ELEMENTS = {
  fire: ['Fire', '火'], water: ['Water', '水'], wind: ['Wind', '風'], lightning: ['Lightning', '雷'], earth: ['Earth', '土'],
  wood: ['Wood', '木'], ice: ['Ice', '氷'], lava: ['Lava', '熔'], sand: ['Sand', '砂'], storm: ['Storm', '嵐'], boil: ['Boil', '沸'],
  scorch: ['Scorch', '灼'], ninjutsu: ['Ninjutsu', '忍'], sealing: ['Sealing', '封'],
  genjutsu: ['Genjutsu', '幻'], medical: ['Medical', '医'], yin: ['Yin', '陰'], yang: ['Yang', '陽'],
};
export const SOURCE = {
  canon: ['Canon seals', 'These seals are shown in the anime, manga or a databook.'],
  game: ['Game seals', 'These seals come from an official game.'],
  adapted: ['Adapted seals', 'The original seals are unknown or not detectable, so this app assigns its own sequence.'],
};
const RANK_ORDER = 'EDCBAS';

/** "Fire Style: Great Fireball Jutsu" -> ["Fire Style", "Great Fireball Jutsu"] */
export const splitName = (n) => { const m = /^([^:]{2,24}):\s*(.+)$/.exec(n || ''); return m ? [m[1], m[2]] : ['', n || '']; };
export const users = (j) => [].concat(j.users || j.user || []).filter(Boolean);
export const elTag = (e) => `<span class="el el-${esc(e)}"><i></i>${esc(ELEMENTS[e]?.[0] || e)}</span>`;
export const rankSeal = (r) => `<span class="rankseal r-${esc(r)}" title="Rank ${esc(r)}">${esc(r)}</span>`;
export const srcBadge = (s) => `<span class="src src-${esc(s)}" title="${esc(SOURCE[s]?.[1] || '')}">${esc(SOURCE[s]?.[0] || s)}</span>`;
export const starRow = (n) => `<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => `<svg class="ic${i < n ? ' on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>`;
export const fmtMs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + ' s');

export function createHandbook({ game, getProgress, onTrain, onWatch, onClose }) {
  const root = document.getElementById('book'), cards = document.getElementById('cards'), detail = document.getElementById('detail');
  const q = document.getElementById('q');
  const f = { rank: '', source: '', element: '', text: '' };
  let selected = null, opener = null;

  const list = [...game.jutsu].sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank) || splitName(a.name)[1].localeCompare(splitName(b.name)[1]));
  const count = (k, v) => game.jutsu.filter((j) => j[k] === v).length;

  function chips(el, key, options) {
    el.innerHTML = [['', 'All'], ...options].map(([v, label]) => `<button type="button" class="chip" data-v="${esc(v)}" aria-pressed="${f[key] === v}">${label}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      f[key] = f[key] === b.dataset.v ? '' : b.dataset.v;
      for (const c of el.children) c.setAttribute('aria-pressed', String(c.dataset.v === f[key]));
      renderCards();
    };
  }
  chips(document.getElementById('fRank'), 'rank', [...RANK_ORDER].filter((r) => count('rank', r)).map((r) => [r, `Rank ${r}`]));
  chips(document.getElementById('fSource'), 'source', Object.keys(SOURCE).filter((s) => count('signsSource', s)).map((s) => [s, SOURCE[s][0].replace(' seals', '')]));
  chips(document.getElementById('fElement'), 'element', Object.keys(ELEMENTS).filter((e) => count('element', e))
    .map((e) => [e, `<i class="dot el-${e}"></i>${ELEMENTS[e][0]} <small>${count('element', e)}</small>`]));

  const hay = (j) => [j.name, j.romaji, j.jp, j.element, ELEMENTS[j.element]?.[0], ...users(j), ...j.signs].join(' ').toLowerCase();
  function filtered() {
    const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter((j) => (!f.rank || j.rank === f.rank) && (!f.source || j.signsSource === f.source) && (!f.element || j.element === f.element)
      && words.every((w) => hay(j).includes(w)));
  }

  function renderCards() {
    const items = filtered(), p = getProgress();
    document.getElementById('bookCount').textContent = items.length === list.length ? `${list.length} jutsu` : `${items.length} of ${list.length}`;
    if (!items.length) {
      cards.innerHTML = `<div class="empty"><p class="empty-k" aria-hidden="true">無</p><p>No jutsu match that search.</p><button type="button" class="btn-quiet" id="clearF">Clear filters</button></div>`;
      document.getElementById('clearF').onclick = () => { Object.assign(f, { rank: '', source: '', element: '', text: '' }); q.value = ''; document.querySelectorAll('#book .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === ''))); renderCards(); };
      return;
    }
    cards.innerHTML = items.map((j) => {
      const [pre, main] = splitName(j.name), e = p.jutsu[j.id], n = stars(e, j);
      const jp = j.jp || '';
      return `<button type="button" class="card${selected === j.id ? ' sel' : ''}${e?.casts ? ' known' : ''}" data-id="${esc(j.id)}">
        <span class="card-k" lang="ja" style="--kfs:${Math.min(1.7, 10.5 / Math.max(jp.length, 1)).toFixed(2)}rem">${esc(jp)}</span>
        <span class="card-main">
          <span class="card-meta">${rankSeal(j.rank)}${elTag(j.element)}</span>
          ${pre ? `<span class="card-pre">${esc(pre)}</span>` : ''}<span class="card-name">${esc(main)}</span>
          <span class="card-r">${esc(j.romaji || '')}</span>
          <span class="card-foot"><span class="card-seals">${j.signs.map((s) => SIGN_INFO[s]?.k || '?').join('')}</span>${srcBadge(j.signsSource)}${n ? starRow(n) : ''}</span>
        </span></button>`;
    }).join('');
  }

  function renderDetail(id) {
    const j = game.byId[id];
    if (!j) { detail.innerHTML = `<div class="detail-empty"><p class="empty-k" aria-hidden="true">巻</p><p>Pick a jutsu to read its scroll.</p></div>`; return; }
    const [pre, main] = splitName(j.name), e = getProgress().jutsu[j.id], u = users(j);
    detail.innerHTML = `
      <button type="button" class="detail-back btn-quiet" data-back><svg class="ic"><use href="#i-back"/></svg><span>All jutsu</span></button>
      <div class="paper">
        <p class="d-k" lang="ja">${esc(j.jp || '')}</p>
        ${pre ? `<p class="d-pre">${esc(pre)}</p>` : ''}<h2 class="d-name" tabindex="-1">${esc(main)}</h2>
        <p class="d-r">${esc(j.romaji || '')}</p>
        <div class="d-meta">${rankSeal(j.rank)}${elTag(j.element)}${srcBadge(j.signsSource)}</div>
        <p class="d-desc">${esc(j.desc || '')}</p>
        <h3>${j.signs.length} seal${j.signs.length === 1 ? '' : 's'}, in order</h3>
        <div class="d-signs">${j.signs.map((s, i) => signTile(s, { size: 'sm', step: i + 1 })).join('')}</div>
        <p class="d-source">${esc(SOURCE[j.signsSource]?.[1] || '')}</p>
        <dl class="d-facts">
          ${u.length ? `<div><dt>Known users</dt><dd>${u.map(esc).join(', ')}</dd></div>` : ''}
          ${j.tip ? `<div><dt>Tip</dt><dd>${esc(j.tip)}</dd></div>` : ''}
          <div><dt>Your mastery</dt><dd>${starRow(stars(e, j))} <span class="d-stat">${e?.casts ? `${e.casts} cast${e.casts === 1 ? '' : 's'} · best ${fmtMs(e.best)}` : 'Not cast yet'}</span></dd></div>
        </dl>
        <div class="d-actions">
          <button type="button" class="btn-primary" data-train><svg class="ic"><use href="#i-target"/></svg><span>Train this</span></button>
          <button type="button" class="btn-ink" data-watch><svg class="ic"><use href="#i-play"/></svg><span>Watch it</span></button>
        </div>
      </div>`;
    detail.querySelector('[data-train]').onclick = () => onTrain(j.id);
    detail.querySelector('[data-watch]').onclick = () => onWatch(j.id);
    detail.querySelector('[data-back]').onclick = () => { root.classList.remove('has-detail'); cards.querySelector(`[data-id="${CSS.escape(j.id)}"]`)?.focus(); };
  }

  function select(id) {
    selected = id;
    for (const c of cards.children) c.classList?.toggle('sel', c.dataset.id === id);
    renderDetail(id);
    root.classList.add('has-detail');
    detail.scrollTop = 0;
  }

  cards.onclick = (e) => { const c = e.target.closest('.card'); if (c) select(c.dataset.id); };
  q.oninput = () => { f.text = q.value; renderCards(); };
  document.getElementById('bookClose').onclick = () => api.close();
  // document-level: on touch devices focus is never inside the book
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden && !document.querySelector('dialog[open]')) api.close(); });

  const api = {
    get isOpen() { return !root.hidden; },
    open(id) {
      if (root.hidden) opener = document.activeElement;
      root.hidden = false;
      renderCards();
      const asked = id;
      if (!id && !selected && matchMedia('(min-width: 900px)').matches) id = list[0]?.id;   // wide: never an empty scroll pane
      if (id) select(id); else { root.classList.remove('has-detail'); renderDetail(selected); }
      // touch: don't focus the search box (it would pop the keyboard)
      const target = asked ? detail.querySelector('h2') : matchMedia('(hover: hover)').matches ? q : null;
      target?.focus({ preventScroll: true });
    },
    close() {
      root.hidden = true;
      if (opener?.isConnected && opener.offsetParent) opener.focus({ preventScroll: true }); else document.getElementById('bookBtn')?.focus({ preventScroll: true });
      opener = null; onClose?.();
    },
    refresh() { if (!root.hidden) { renderCards(); renderDetail(selected); } },
  };
  return api;
}
