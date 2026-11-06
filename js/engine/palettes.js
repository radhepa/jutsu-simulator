// Named color palettes for effects. Every effect takes `palette` and should read colors from here,
// so one archetype can serve many jutsu (blue fire, black flames, lava, ...).
// core = hottest/brightest center, mid = main body, outer = edges, glow = light cast on the scene,
// dark = shadows/smoke, accent = secondary sparks.
export const PALETTES = {
  fire:      { core: 0xfff4c2, mid: 0xffa11a, outer: 0xe8380d, glow: 0xff7a1a, dark: 0x3a1a10, accent: 0xffd36b },
  bluefire:  { core: 0xf0fbff, mid: 0x5fc8ff, outer: 0x1d5cff, glow: 0x3aa0ff, dark: 0x0a1634, accent: 0xb5f0ff },
  blackfire: { core: 0x2a0a2e, mid: 0x0d0410, outer: 0x000000, glow: 0x6b1a7a, dark: 0x000000, accent: 0xff2a4d },
  lava:      { core: 0xffe08a, mid: 0xff5a12, outer: 0x8a1a06, glow: 0xff4a10, dark: 0x2a0c06, accent: 0x3a2a24 },
  water:     { core: 0xeafcff, mid: 0x3fb8ff, outer: 0x1458c8, glow: 0x5ac8ff, dark: 0x0a2a4a, accent: 0xc8f4ff },
  ice:       { core: 0xffffff, mid: 0xbdeeff, outer: 0x6fb6e8, glow: 0xa8e4ff, dark: 0x2a4a68, accent: 0xe8fbff },
  wind:      { core: 0xffffff, mid: 0xd9f7e8, outer: 0x8fe0c0, glow: 0xc8ffe8, dark: 0x5a8a7a, accent: 0xf0fff8 },
  lightning: { core: 0xffffff, mid: 0x9ad8ff, outer: 0x3a6dff, glow: 0x7ab8ff, dark: 0x0a1030, accent: 0xe0f4ff },
  earth:     { core: 0xe8d2a8, mid: 0xa07848, outer: 0x6a4a2a, glow: 0xc89a5a, dark: 0x2a1c10, accent: 0x8a8a80 },
  wood:      { core: 0xd8f0a0, mid: 0x8a6a3a, outer: 0x4a3420, glow: 0x9ad860, dark: 0x22180c, accent: 0x5ab040 },
  sand:      { core: 0xfff0c8, mid: 0xe0b870, outer: 0xa87a40, glow: 0xf0c880, dark: 0x5a3c1c, accent: 0xc8a060 },
  chakra:    { core: 0xffffff, mid: 0x8ad8ff, outer: 0x3a8aff, glow: 0x6ab8ff, dark: 0x0a1a3a, accent: 0xd0f0ff },
  medical:   { core: 0xf0fff0, mid: 0x7affa0, outer: 0x20c060, glow: 0x60ff90, dark: 0x0a3a1a, accent: 0xd0ffe0 },
  shadow:    { core: 0x1a1a22, mid: 0x0a0a10, outer: 0x000000, glow: 0x3a3a50, dark: 0x000000, accent: 0x5a5a70 },
  smoke:     { core: 0xffffff, mid: 0xe8e8ec, outer: 0xb8b8c0, glow: 0xffffff, dark: 0x7a7a84, accent: 0xd8d8e0 },
  genjutsu:  { core: 0xffd0d8, mid: 0xd01030, outer: 0x5a0010, glow: 0xff2040, dark: 0x100004, accent: 0x000000 },
  sakura:    { core: 0xfff0f6, mid: 0xffb0cc, outer: 0xe06a9a, glow: 0xffc0d8, dark: 0x5a1a30, accent: 0xffffff },
  seal:      { core: 0xffffff, mid: 0x30102a, outer: 0x000000, glow: 0xfff0b0, dark: 0x000000, accent: 0xd01818 },
  gold:      { core: 0xfffbe0, mid: 0xffd040, outer: 0xd08a10, glow: 0xffc020, dark: 0x4a2a00, accent: 0xff8a20 },
  toxic:     { core: 0xf0ffc0, mid: 0x9ae020, outer: 0x5a8a10, glow: 0xb0ff40, dark: 0x203008, accent: 0x7a20a0 },
  purple:    { core: 0xf8e8ff, mid: 0xb070ff, outer: 0x6020c0, glow: 0x9a50ff, dark: 0x1a0838, accent: 0xff60e0 },
  boil:      { core: 0xffffff, mid: 0xf0e0d0, outer: 0xd8a890, glow: 0xffd8c0, dark: 0x8a6a5a, accent: 0xff9a7a },
};

export const lerpColor = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | (ab + ((b & 255) - ab) * t);
};
