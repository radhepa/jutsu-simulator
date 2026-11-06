# Jutsu Simulator

Make Naruto hand signs at your webcam and cast **Fire Style: Fireball Jutsu**
(Snake → Ram → Monkey → Boar → Horse → Tiger).

Live: https://radhepa.github.io/jutsu-simulator/

- Runs entirely in the browser; video never leaves your device.
- Hand-sign detection: YOLOX-Nano model from
  [Kazuhito00/NARUTO-HandSignDetection](https://github.com/Kazuhito00/NARUTO-HandSignDetection)
  (MIT, see `model/LICENSE`), run with onnxruntime-web.
- "Open on phone" shows a QR code for the current page.

Run locally: `npx http-server -p 8137` and open http://localhost:8137 (camera needs localhost or HTTPS).

Fan project, not affiliated with Naruto or its owners.
