// The 14 seals the detector knows. Each gets an original line pictogram (front view, wrists at the
// bottom, 64-unit grid) plus its zodiac kanji (Gassho and Mizunoe use their own characters).
// The pictograms are simplified study aids, not anatomical drawings: hints carry the detail.
export const SIGN_INFO = {
  Rat:     { k: '子', r: 'Ne', hint: 'Right index and middle fingers up; the left hand wraps around them.' },
  Ox:      { k: '丑', r: 'Ushi', hint: 'Both hands sideways, index and middle fingers out, one hand above the other pointing the opposite way.' },
  Tiger:   { k: '寅', r: 'Tora', hint: 'Fingers interlaced, both index and middle fingers pointing straight up together.' },
  Hare:    { k: '卯', r: 'U', hint: 'Left palm upright; right index and middle fingers point into it from the side.' },
  Dragon:  { k: '辰', r: 'Tatsu', hint: 'Hands joined across the middle, both thumbs raised like horns.' },
  Snake:   { k: '巳', r: 'Mi', hint: 'Hands clasped with fingers fully interlaced.' },
  Horse:   { k: '午', r: 'Uma', hint: 'Index fingers and thumbs meet in an upward triangle; other fingers fold in.' },
  Ram:     { k: '未', r: 'Hitsuji', hint: 'Like Tiger, but only one hand’s index and middle fingers stand up.' },
  Monkey:  { k: '申', r: 'Saru', hint: 'One hand upright, the other flat across it, palms touching in a cross.' },
  Bird:    { k: '酉', r: 'Tori', hint: 'Heels of the hands together, fingers fanned out to both sides like wings.' },
  Dog:     { k: '戌', r: 'Inu', hint: 'Left palm flat on top of the right fist.' },
  Boar:    { k: '亥', r: 'I', hint: 'Both hands flat and level, one stacked on the other, fingers toward the camera.' },
  Gassho:  { k: '合', r: 'Gasshō', hint: 'Palms pressed flat together, fingers up.' },
  Mizunoe: { k: '壬', r: 'Mizunoe', hint: 'Both palms open to the camera, fingers spread, thumb tips touching.' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

// Shapes, drawn back to front: F = finger capsule (x1 y1 x2 y2 [width]), P = palm/fist outline, L = crease line.
const F = (x1, y1, x2, y2, w = 5.5) => ({ t: 'F', d: `M${x1} ${y1}L${x2} ${y2}`, w });
const P = (d) => ({ t: 'P', d });
const L = (d) => ({ t: 'L', d });
const rr = (x, y, w, h, r = 5) => `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

const PICTOS = {
  Rat: [P(rr(21, 31, 21, 34)), F(27, 38, 27, 13), F(33.5, 38, 33.5, 10), P(rr(14, 34, 36, 22, 6)),
    L('M24 41V53M30 41V53M36 41V53M42 41V53'), F(17, 38.5, 37, 37, 5)],
  Ox: [F(40, 16, 10, 16), F(40, 22.5, 13, 22.5), P(rr(36, 10, 30, 20, 6)), L('M44 13V27M50 13V27'),
    F(24, 41.5, 54, 41.5), F(24, 48, 51, 48), P(rr(-2, 35, 30, 20, 6)), L('M14 38V52M20 38V52')],
  Tiger: [F(23.5, 40, 23.5, 15), F(29, 40, 29, 10), F(34.5, 40, 34.5, 10), F(40, 40, 40, 15), P(rr(16, 32, 32, 34, 7)),
    L('M19 43Q25.5 47 32 43Q38.5 47 45 43M19 51Q25.5 55 32 51Q38.5 55 45 51'), F(29.5, 48, 29.5, 33, 4.5), F(34.5, 48, 34.5, 33, 4.5)],
  Hare: [P(rr(8, 10, 22, 56, 6)), L('M13.5 12V31M19 11V31M24.5 12V31'), F(46, 32, 29, 32), F(46, 38.5, 30, 38.5),
    P(rr(42, 26, 26, 24, 6)), L('M48 30V46M54 30V46')],
  Dragon: [F(15, 36, 10, 9), F(49, 36, 54, 9), P('M18 54L16 66H48L46 54Z'), P(rr(9, 29, 46, 27, 7)),
    L('M17 35L25 42.5L17 50M47 35L39 42.5L47 50M32 32V53')],
  Snake: [P(rr(3, 16, 23, 46, 6)), P(rr(38, 16, 23, 46, 6)), F(21, 25, 44, 25), F(43, 31, 20, 31), F(21, 37, 44, 37),
    F(43, 43, 20, 43), F(21, 49, 44, 49), F(43, 55, 20, 55), F(14, 17, 30.5, 11, 5), F(50, 17, 33.5, 11, 5)],
  Horse: [P(rr(5, 30, 23, 36, 6)), P(rr(36, 30, 23, 36, 6)), L('M9 42H24M9 48H24M9 54H24M40 42H55M40 48H55M40 54H55'),
    F(24, 34, 31, 10), F(40, 34, 33, 10), F(24, 41, 30.5, 49, 5), F(40, 41, 33.5, 49, 5)],
  Ram: [F(25, 40, 25, 14), F(31, 40, 31, 11), P(rr(16, 32, 32, 34, 7)),
    L('M19 43Q25.5 47 32 43Q38.5 47 45 43M19 51Q25.5 55 32 51Q38.5 55 45 51'), F(39, 36, 39, 47, 4.5), F(44, 36, 44, 46, 4.5)],
  Monkey: [P(rr(24, 6, 16, 60, 6)), L('M28 9V30M32 8V30M36 9V30'), P('M-2 31H52Q59 31 59 37.5Q59 44 52 44H-2Z'),
    L('M34 35.5H54M34 40H54'), F(26, 44, 20, 52, 4.5)],
  Bird: [F(28, 42, 6, 31), F(28, 40, 8, 21), F(29, 38, 14, 12), F(31, 37, 23, 8), F(36, 42, 58, 31), F(36, 40, 56, 21),
    F(35, 38, 50, 12), F(33, 37, 41, 8), P('M22 44Q32 30 42 44L39 66H25Z'), F(27, 54, 37, 47, 4.5), F(37, 54, 27, 47, 4.5)],
  Dog: [P(rr(20, 26, 26, 40, 6)), L('M27 34V44M33 34V44M39 34V44'), P('M3 20Q3 14 9 14H54Q61 14 61 20.5Q61 27 54 27H9Q3 27 3 21Z'),
    L('M30 18.5H56M30 22.5H56'), F(29, 26, 34, 34, 4.5)],
  Boar: [P('M20 50L18 66H46L44 50Z'), P(rr(7, 34, 50, 18, 6)), L('M19.5 35V51M32 35V51M44.5 35V51'),
    P(rr(7, 17, 50, 18, 6)), L('M19.5 18V34M32 18V34M44.5 18V34'), F(7, 44, 2, 52, 4.5), F(57, 27, 62, 35, 4.5)],
  Gassho: [P('M32 5Q25 7 23.5 20L21.5 44Q21.5 53 26 59L28 66H32Z'), P('M32 5Q39 7 40.5 20L42.5 44Q42.5 53 38 59L36 66H32Z'),
    L('M32 7V64M27.5 11Q26.5 22 25.5 33M36.5 11Q37.5 22 38.5 33M25 47Q28 41 31 39M39 47Q36 41 33 39')],
  Mizunoe: [F(14, 30, 7, 9, 4.6), F(19, 27, 16.5, 4, 4.6), F(24, 27, 24.5, 4, 4.6), F(28.5, 30, 30.5, 9, 4.6),
    F(35.5, 30, 33.5, 9, 4.6), F(40, 27, 39.5, 4, 4.6), F(45, 27, 47.5, 4, 4.6), F(50, 30, 57, 9, 4.6),
    P(rr(10, 25, 20, 41, 6)), P(rr(34, 25, 20, 41, 6)), F(27, 47, 31, 42, 4.6), F(37, 47, 33, 42, 4.6)],
};

const svgCache = {};
/** Inline SVG pictogram for one sign (stroke = currentColor, hand fill = var(--pict-fill)). */
export function picto(sign) {
  if (svgCache[sign]) return svgCache[sign];
  const shapes = PICTOS[sign];
  const body = shapes ? shapes.map((s) => s.t === 'F'
    ? `<path class="po" d="${s.d}" stroke-width="${s.w + 3}"/><path class="pf" d="${s.d}" stroke-width="${s.w}"/>`
    : `<path class="${s.t === 'P' ? 'pp' : 'pl'}" d="${s.d}"/>`).join('') : '<text x="32" y="42" text-anchor="middle" font-size="30">?</text>';
  return (svgCache[sign] = `<svg class="picto" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g>${body}</g></svg>`);
}

/** Pictogram in a stamp frame. size: 'sm' | 'md' | 'lg'. md/lg carry the kanji as a small hanko. */
export function seal(sign, size = 'md') {
  const s = SIGN_INFO[sign] || { k: '?' };
  return `<span class="seal seal-${size}" aria-hidden="true">${picto(sign)}${size === 'sm' ? '' : `<span class="seal-k" lang="ja">${s.k}</span>`}</span>`;
}

/** Seal + English name + romaji, used in tracks and the guide. */
export function signTile(sign, { size = 'md', step, cls = '' } = {}) {
  const s = SIGN_INFO[sign] || { r: '' };
  return `<div class="tile ${cls}" data-sign="${esc(sign)}">${step != null ? `<span class="tile-n">${step}</span>` : ''}${seal(sign, size)}<span class="tile-name">${esc(sign)}</span><span class="tile-r">${esc(s.r)}</span></div>`;
}
