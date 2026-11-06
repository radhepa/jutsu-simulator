# Jutsu Simulator

Make Naruto hand signs at your webcam and cast 50 jutsu, each with its own effect:
Fireball, Chidori, Rasengan, Shadow Clone, Water Dragon, Wood Prison, Tsukuyomi and more.

Live: https://radhepa.github.io/jutsu-simulator/

## Modes
- **Training**: pick a jutsu, follow the signs one by one with live detection feedback.
- **Freestyle**: perform any signs; the game shows which jutsu are still reachable and casts the match.
- **Handbook**: every jutsu with its exact signs in order, search and filters (element, rank, source),
  "Train this" and "Watch it".
- **Progress**: XP, ranks (Academy Student to Kage), mastery stars, best times and achievements,
  saved in your browser.

Each jutsu says where its signs come from: **canon** (shown in the anime/manga, per the Naruto wiki),
or **adapted** (canon has no usable signs, uses a sign the detector can't see, or is too long, e.g. the
44-sign Water Dragon).

## How it works
Everything runs in the browser; video never leaves your device.
- Hand signs: YOLOX-Nano from [Kazuhito00/NARUTO-HandSignDetection](https://github.com/Kazuhito00/NARUTO-HandSignDetection)
  (MIT, `model/LICENSE`) on onnxruntime-web (WebGPU, else WASM).
- Face, hands and person cutout (for clones and auras): MediaPipe Tasks Vision.
- Effects: PixiJS 8 + pixi-filters, CC0 particle textures from Kenney and original sprites
  (`assets/LICENSES.md`).

See `ARCHITECTURE.md` for the code layout and contracts.

## Develop
```
npx http-server -p 8137 -c-1
```
Open http://localhost:8137 (the camera needs localhost or HTTPS).

- Effects lab: http://localhost:8137/dev/fx.html (fake camera, pick any effect).
- Render an effect to a contact sheet: `cd tools && npm i && node shot.mjs fireball --variant great`.
- Rebuild and validate jutsu data after editing `data/src/*.json`: `node tools/build-data.mjs`.
- Tests: `node --test tests/` and `node tools/ui-test.mjs` (headless Edge, fake camera).

Fan project, not affiliated with Naruto or its owners.
