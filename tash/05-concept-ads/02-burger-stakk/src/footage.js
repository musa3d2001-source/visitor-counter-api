// STAKK photoreal: frame-accurate footage. Each sequence is a graded, retimed 30 fps JPEG sequence baked by
// src/tools/conform.py into ./footage/<seq>/NNNN.jpg; frame k shows edit time (n0 + k) / 30.
// Frames are drawn by INDEX (never <video> time) and awaited with img.decode(), so a render is a pure function of t.
const ROOT = new URL('./footage/', import.meta.url).href;
export const MANIFEST = await (await fetch(ROOT + 'manifest.json')).json();

const cache = new Map(); // url → Promise<HTMLImageElement>
const LRU_MAX = 24;
function load(url) {
  if (cache.has(url)) { const p = cache.get(url); cache.delete(url); cache.set(url, p); return p; }
  const img = new Image(); img.decoding = 'async'; img.src = url;
  const p = img.decode().then(() => img, () => { throw new Error('frame missing: ' + url); });
  cache.set(url, p);
  while (cache.size > LRU_MAX) cache.delete(cache.keys().next().value);
  return p;
}

/** frame of sequence `id` shown at edit time t (clamped to the sequence's baked range) */
export function frameIndex(id, t) {
  const m = MANIFEST[id]; if (!m) throw new Error('unknown sequence ' + id);
  return Math.max(0, Math.min(m.frames - 1, Math.round(t * 30 + 1e-6) - m.n0));
}
export function frame(id, t) { return load(`${ROOT}${id}/${String(frameIndex(id, t)).padStart(4, '0')}.jpg`); }
/** source position (seconds in the AI clip) shown at edit time t — used for the hand-off notes */
export function sourceAt(id, t) { return MANIFEST[id].src[frameIndex(id, t)]; }
