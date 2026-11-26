// «طشّ للطلاب» — the page (lead-owned). A pure function of time: window.TASH.seek(t) mounts/positions the scenes of
// cues.json; nothing moves by itself (no CSS animation/transition, no rAF, no Date). Rendered by
// _system/tools/render.mjs (see CONTRACT.md for the commands).
//
// Scene interface (CONTRACT.md §1): src/scenes/<id>.js exports default { id, mount(root, ctx), seek(tLocal, ctx) }.
//   mount(root, ctx)  once, before the first frame; root = the scene's own 1080x1920 div (laid out but hidden while
//                     mounting, so text can be measured); may be async (await kit.img(...) etc.).
//   seek(tl, ctx)     every frame the scene is active (cue in <= frame < out); tl = film time - scene in (seconds);
//                     may be async (await a footage frame). Must set EVERYTHING it shows from (tl, ctx) alone.
//   ctx = { cues, vo, kit, G (beat grid), scene (its cues entry), events (its text events), ev(id) → event,
//           t (film s), f (film frame), tl, fl (local s / frame), W, H, fps, src (URL of src/), params (URLSearchParams),
//           loadCSS(url) }
// URL params: ?scene=<id>[,<id>] isolate · ?guide=1 overlay · ?t=<s> freeze · ?play[&from&to] live loop.
import * as kit from './kit.js';

const params = new URLSearchParams(location.search);
const SRC = new URL('./', import.meta.url).href;
const cues = await kit.json(SRC + 'cues.json');
const vo = await kit.json(SRC + 'vo/vo_timeline.json');
const FPS = cues.fps, W = cues.width, H = cues.height;
const NF = cues.duration_frames;
const G = kit.grid(cues);
const stage = document.getElementById('stage');

// fonts before any mount (text is measured at mount)
await Promise.all([
  ...[300, 500, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 100px "Alexandria"`)),
  ...[400, 500, 600, 700].map(w => document.fonts.load(`${w} 40px "IBM Plex Sans Arabic"`)),
  document.fonts.load('800 60px "Archivo"'), document.fonts.load('600 24px "JetBrains Mono"'), document.fonts.load('700 24px "JetBrains Mono"'),
]);

const loadCSS = url => new Promise((res, rej) => {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(url, SRC).href;
  l.onload = () => res(l); l.onerror = () => rej(new Error('css missing: ' + l.href)); document.head.appendChild(l);
});

// ---------------------------------------------------------------- scenes
const only = params.get('scene') ? params.get('scene').split(',') : null;
const SCENES = cues.scenes.filter(s => !only || only.includes(s.id));
if (only && !SCENES.length) throw new Error('no such scene: ' + params.get('scene'));
const byScene = id => cues.text.filter(e => e.scene === id);
const evMap = Object.fromEntries(cues.text.map(e => [e.id, e]));
const base = { cues, vo, kit, G, W, H, fps: FPS, src: SRC, params, loadCSS, ev: id => evMap[id] };

const live = [];
for (const [i, s] of SCENES.entries()) {
  const mod = (await import(`./scenes/${s.id}.js`)).default;
  if (!mod || mod.id !== s.id) throw new Error(`scenes/${s.id}.js must export default { id: '${s.id}', mount, seek }`);
  const root = kit.el(stage, 'div', 'scene', { zIndex: String(10 + i * 10) });
  root.id = 'scene-' + s.id; root.dataset.scene = s.id;
  const ctx = { ...base, scene: s, events: byScene(s.id), t: s.in / FPS, f: s.in, tl: 0, fl: 0 };
  root.style.display = 'block'; root.style.visibility = 'hidden';
  await mod.mount(root, ctx);
  root.style.display = 'none'; root.style.visibility = 'visible';
  live.push({ s, mod, root, ctx });
}

// ---------------------------------------------------------------- global overlays (above every scene)
const top = kit.el(stage, 'div', 'layer', { zIndex: '500' });
const L = cues.samples_label;
const label = kit.samplesLabel(top, L.text);
const gd = params.has('guide') ? kit.guide(stage, cues) : null;

async function seekFrame(t) {
  const f = Math.max(0, Math.min(NF - 1, Math.round(t * FPS + 1e-6)));
  const tq = f / FPS;                                         // quantised: every render of frame f is identical
  const active = [];
  for (const L_ of live) {
    const { s, mod, root, ctx } = L_;
    const on = f >= s.in && f < s.out;
    if (!on) { if (root.style.display !== 'none') root.style.display = 'none'; continue; }
    root.style.display = 'block';
    ctx.t = tq; ctx.f = f; ctx.tl = tq - s.in / FPS; ctx.fl = f - s.in;
    await mod.seek(ctx.tl, ctx);
    active.push(s.id);
  }
  // the samples label: on every frame from the reveal to the end of the payoff, placed per scene
  const lon = f >= L.in && f < L.out && active.length > 0;
  label.show(lon);
  if (lon) label.place(cues.label_pos[active[active.length - 1]] || 'top');
  if (gd) gd.render(tq, f, active);
}

let queue = Promise.resolve();
const seek = t => (queue = queue.then(() => seekFrame(t)));
const ready = Promise.all([kit.preloadAll(), document.fonts.ready]);
const from = params.has('from') ? parseFloat(params.get('from')) : 0;
const to = params.has('to') ? parseFloat(params.get('to')) : NF / FPS;
window.TASH = { width: W, height: H, fps: FPS, duration: to, from, ready, seek: t => seek(t), cues };

ready.then(async () => {
  if (params.has('t')) await seek(parseFloat(params.get('t')));
  else if (params.has('play')) {
    const t0 = performance.now();
    const loop = async () => { await seek(from + (((performance.now() - t0) / 1000) % (to - from))); requestAnimationFrame(loop); };
    loop();
  } else await seek(from);
});
