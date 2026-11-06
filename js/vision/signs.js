// Hand-sign detector: YOLOX-Nano from Kazuhito00/NARUTO-HandSignDetection (MIT), via onnxruntime-web.
// Uses WebGPU when available, otherwise WASM in a worker so rendering stays smooth.
/* global ort */

// Model class index -> sign, from the model's setting/labels.csv (minus its leading "None" row).
export const CLASSES = ['Rat', 'Ox', 'Tiger', 'Hare', 'Dragon', 'Snake', 'Horse', 'Ram', 'Monkey', 'Bird', 'Dog', 'Boar', 'Gassho', 'Unknown', 'Mizunoe', 'Unknown'];
const SIZE = 416;
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

let session = null, backend = '';
const prep = document.createElement('canvas'); prep.width = prep.height = SIZE;
const pctx = prep.getContext('2d', { willReadFrequently: true });
const input = new Float32Array(3 * SIZE * SIZE);

export async function initSigns(modelUrl = 'model/yolox_nano.onnx') {
  ort.env.wasm.wasmPaths = ORT_CDN;
  if (navigator.gpu) {
    try {
      session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu'] });
      backend = 'webgpu';
      return backend;
    } catch (e) { console.warn('WebGPU unavailable for sign model, using WASM', e); }
  } else {
    ort.env.wasm.proxy = true;
  }
  session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
  backend = ort.env.wasm.proxy ? 'wasm-worker' : 'wasm';
  return backend;
}

/** Detect the best sign in a video frame. Returns {name, score, x, y, w, h} in video pixels, or null. */
export async function detectSign(video, minScore = 0.5) {
  if (!session || !video.videoWidth) return null;
  const vw = video.videoWidth, vh = video.videoHeight, r = Math.min(SIZE / vw, SIZE / vh);
  // Same preprocessing as the model's Python demo: letterbox top-left, pad 114, BGR, 0-255, CHW.
  pctx.fillStyle = 'rgb(114,114,114)'; pctx.fillRect(0, 0, SIZE, SIZE);
  pctx.drawImage(video, 0, 0, vw * r, vh * r);
  const px = pctx.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE;
  for (let i = 0; i < n; i++) { input[i] = px[i * 4 + 2]; input[n + i] = px[i * 4 + 1]; input[2 * n + i] = px[i * 4]; }
  const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input.slice(), [1, 3, SIZE, SIZE]) });
  const out = res[session.outputNames[0]];
  const best = decode(await out.getData?.() ?? out.data, out.dims, r);
  return best && best.score >= minScore ? best : null;
}

// YOLOX grid decode, keeping only the top detection.
function decode(data, dims, r) {
  const cols = dims[2], nc = cols - 5;
  let best = null, row = 0;
  for (const stride of [8, 16, 32]) {
    const g = SIZE / stride;
    for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++, row++) {
      const o = row * cols, obj = data[o + 4];
      if (obj < 0.1) continue;
      let c = 0, cs = data[o + 5];
      for (let k = 1; k < nc; k++) if (data[o + 5 + k] > cs) { cs = data[o + 5 + k]; c = k; }
      const score = obj * cs;
      if (!best || score > best.score) {
        const cx = (data[o] + gx) * stride, cy = (data[o + 1] + gy) * stride;
        const w = Math.exp(data[o + 2]) * stride, h = Math.exp(data[o + 3]) * stride;
        best = { name: CLASSES[c] || 'Unknown', score, x: (cx - w / 2) / r, y: (cy - h / 2) / r, w: w / r, h: h / r };
      }
    }
  }
  return best;
}

export const signBackend = () => backend;
