// DOSE — frame-accurate photoreal footage. Every segment of the edit is a 30 fps JPEG sequence in ./footage/<seg>/,
// already retimed by tools/conform.py (time map in cues.json → footage.segs). Frames are drawn by INDEX
// (edit frame − first frame of the segment), never by <video> time, so a render is a pure function of t.
// Copied from 09-pitch-mor/src/footage.js (await img.decode(), small LRU).
const ROOT = new URL('./footage/', import.meta.url).href;
export const MANIFEST = await (await fetch(ROOT + 'manifest.json')).json();

const cache = new Map();   // url → Promise<HTMLImageElement>
const LRU_MAX = 12;
function load(url) {
  if (cache.has(url)) { const p = cache.get(url); cache.delete(url); cache.set(url, p); return p; }
  const img = new Image(); img.decoding = 'async'; img.src = url;
  const p = img.decode().then(() => img, () => { throw new Error('frame missing: ' + url); });
  cache.set(url, p);
  while (cache.size > LRU_MAX) cache.delete(cache.keys().next().value);
  return p;
}

/** the frame of segment `id` shown at edit frame `f` (clamped to the segment) */
export function frame(id, f) {
  const m = MANIFEST[id]; if (!m) throw new Error('unknown segment ' + id);
  const k = Math.max(0, Math.min(m.n - 1, f - m.f0));
  return load(`${ROOT}${id}/${String(k).padStart(4, '0')}.jpg`);
}
/** source position (24 fps frame index, fractional) behind edit frame f — for review overlays / the hand-off note */
export const srcPos = (id, f) => { const m = MANIFEST[id]; return m.p[Math.max(0, Math.min(m.n - 1, f - m.f0))]; };
