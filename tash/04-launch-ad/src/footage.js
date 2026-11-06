// Frame-accurate footage: every clip is a JPEG sequence in /review/launch-footage/<clip>/NNNN.jpg
// (built by src/tools/extract.sh from the mp4s in 04-launch-ad/footage/). Frames are drawn by INDEX,
// never by <video> time, so a render is a pure function of t.
const ROOT = '/review/launch-footage/';
export const MANIFEST = await (await fetch(ROOT + 'manifest.json')).json();

const cache = new Map(); // url → Promise<HTMLImageElement>
const LRU_MAX = 28;
function load(url) {
  if (cache.has(url)) { const p = cache.get(url); cache.delete(url); cache.set(url, p); return p; }
  const img = new Image(); img.decoding = 'async'; img.src = url;
  const p = img.decode().then(() => img, () => { throw new Error('frame missing: ' + url); });
  cache.set(url, p);
  while (cache.size > LRU_MAX) cache.delete(cache.keys().next().value);
  return p;
}

/** index of the source frame shown at source time `st` (seconds from the clip's first frame) */
export function frameIndex(clip, st) {
  const m = MANIFEST[clip]; if (!m) throw new Error('unknown clip ' + clip);
  return Math.max(0, Math.min(m.frames - 1, Math.round(st * m.fps + 1e-6)));
}
export function frame(clip, st) { return load(`${ROOT}${clip}/${String(frameIndex(clip, st)).padStart(4, '0')}.jpg`); }
export function frameAt(clip, idx) { const m = MANIFEST[clip]; idx = Math.max(0, Math.min(m.frames - 1, idx)); return load(`${ROOT}${clip}/${String(idx).padStart(4, '0')}.jpg`); }
export function still(url) { return load(url); }
