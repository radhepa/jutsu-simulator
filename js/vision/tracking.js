// MediaPipe (Apache-2.0) face, hand and person tracking, used to anchor effects:
// fire from the mouth, Rasengan in the palm, clones cut out of the camera image.
// Each model loads lazily on first use so startup stays fast.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';

let vision = null, mp = null;
let face = null, hands = null, seg = null;
let loading = {};

async function fileset() {
  if (!mp) mp = await import(`${MP}/vision_bundle.mjs`);
  if (!vision) vision = await mp.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  return vision;
}
function lazy(key, make) {
  return (loading[key] ||= (async () => { try { return await make(await fileset()); } catch (e) { console.warn(`tracking: ${key} unavailable`, e); return null; } })());
}
const base = (path) => ({ modelAssetPath: `${MODELS}/${path}`, delegate: 'GPU' });

export const loadFace = () => lazy('face', async (v) => (face = await mp.FaceDetector.createFromOptions(v, { baseOptions: base('face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'), runningMode: 'VIDEO' })));
export const loadHands = () => lazy('hands', async (v) => (hands = await mp.HandLandmarker.createFromOptions(v, { baseOptions: base('hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'), runningMode: 'VIDEO', numHands: 2 })));
export const loadSegmenter = () => lazy('seg', async (v) => (seg = await mp.ImageSegmenter.createFromOptions(v, { baseOptions: base('image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'), runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true })));

let lastTs = 0;
const ts = () => (lastTs = Math.max(lastTs + 1, performance.now()));

/** Mouth + face center in video pixels. */
export function trackFace(video) {
  if (!face || !video.videoWidth) return null;
  const r = face.detectForVideo(video, ts());
  const d = r.detections?.[0];
  if (!d) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  const k = d.keypoints; // 0 right eye, 1 left eye, 2 nose, 3 mouth, 4/5 ears (normalized)
  const b = d.boundingBox;
  return {
    mouth: k?.[3] ? { x: k[3].x * vw, y: k[3].y * vh } : { x: b.originX + b.width / 2, y: b.originY + b.height * 0.75 },
    face: { x: b.originX + b.width / 2, y: b.originY + b.height / 2, w: b.width, h: b.height },
  };
}

/** Palm centers in video pixels: [{x, y, size, landmarks}] */
export function trackHands(video) {
  if (!hands || !video.videoWidth) return [];
  const r = hands.detectForVideo(video, ts());
  const vw = video.videoWidth, vh = video.videoHeight;
  return (r.landmarks || []).map((lm) => {
    const ids = [0, 5, 9, 13, 17];
    const x = ids.reduce((a, i) => a + lm[i].x, 0) / 5 * vw, y = ids.reduce((a, i) => a + lm[i].y, 0) / 5 * vh;
    const size = Math.hypot((lm[0].x - lm[9].x) * vw, (lm[0].y - lm[9].y) * vh);
    return { x, y, size, landmarks: lm.map((p) => ({ x: p.x * vw, y: p.y * vh })) };
  });
}

// Person cutout canvas (video resolution, unmirrored). Updated by updateSegmentation().
export const personCanvas = document.createElement('canvas');
const pc = personCanvas.getContext('2d');
const maskCanvas = document.createElement('canvas');
const mc = maskCanvas.getContext('2d');
let maskImg = null;

export function updateSegmentation(video) {
  if (!seg || !video.videoWidth) return false;
  const vw = video.videoWidth, vh = video.videoHeight;
  const r = seg.segmentForVideo(video, ts());
  const m = r.confidenceMasks?.[0];
  if (!m) return false;
  const mw = m.width, mh = m.height, conf = m.getAsFloat32Array();
  if (maskCanvas.width !== mw) { maskCanvas.width = mw; maskCanvas.height = mh; maskImg = mc.createImageData(mw, mh); }
  for (let i = 0; i < conf.length; i++) { maskImg.data[i * 4 + 3] = conf[i] > 0.5 ? 255 : conf[i] * 400; }
  mc.putImageData(maskImg, 0, 0);
  m.close();
  if (personCanvas.width !== vw) { personCanvas.width = vw; personCanvas.height = vh; }
  pc.globalCompositeOperation = 'copy';
  pc.drawImage(maskCanvas, 0, 0, vw, vh);
  pc.globalCompositeOperation = 'source-in';
  pc.drawImage(video, 0, 0, vw, vh);
  return true;
}
