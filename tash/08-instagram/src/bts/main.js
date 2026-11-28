// BTS reel «من الفكرة للإعلان» — LAYL No.07 (concept ad 01). Page = pure function of t (no RAF, no clocks, no random).
// Picture: a technical sketch of the bottle (drawn from LAYL's own geometry code) → the real 3D passes of the S3 orbit
// (wire → clay → final, rendered at 60 fps and played at ≈0.48×) revealed by an RTL scan line → the real ad's ending.
// Plates come from review/ig-package/bts/frames/ (build them with src/bts/extract.sh). Times: cues.json.
import { boot, tw, E, clamp, lerp, css, grain, typing } from '/_system/motion/kit.js';
import { archPoints, DIM } from '/05-concept-ads/01-perfume-layl/src/scene.js';

const C = await (await fetch(new URL('./cues.json', import.meta.url))).json();
const W = 1080, H = 1920, SHIFT = 60;               // pass plates sit 60 px lower: room for the copy above the cap
const FR = '/review/ig-package/bts/frames/';
const COL = { ink: '#0B0B0B', paper: '#F5F5E9', lime: '#C6FF00', smoke: '#8E9088', amber: '#E09A2D', graphite: '#2A2A27' };

// ------------------------------------------------------------------------------------------ plates
const cache = new Map();
function load(src) {
  if (cache.has(src)) return cache.get(src);
  // fetch → createImageBitmap: one CPU decode path whatever the cache state (an <img> decode varied by 1 level with seek order)
  const p = fetch(src).then(r => { if (!r.ok) throw new Error('missing plate ' + src); return r.blob(); })
    .then(b => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'none' }));
  cache.set(src, p);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return p;
}
const pad = n => String(n).padStart(4, '0');
const plate = document.getElementById('plate');
const g = plate.getContext('2d', { alpha: false, willReadFrequently: true });   // software canvas: seek-order independent

/** Draw pass `name` at fractional source frame s (60 fps plates). Neighbouring 1/60 s frames are mixed by the
 *  fraction, so the ≈0.48× playback never repeats a frame. x0 > 0 clips to the part right of the scan line. */
async function drawPass(name, s, x0 = 0) {
  const n = C.passes.frames - 1, i0 = Math.min(n, Math.floor(s)), f = s - i0, i1 = Math.min(n, i0 + 1);
  const [a, b] = await Promise.all([load(`${FR}${name.toLowerCase()}/${pad(i0)}.jpg`), f > 0.002 ? load(`${FR}${name.toLowerCase()}/${pad(i1)}.jpg`) : null]);
  g.save();
  if (x0 > 0) { g.beginPath(); g.rect(x0, 0, W - x0, H); g.clip(); }
  // the 60 px uncovered at the top: the plate's own top band, mirrored (dark sky + dust; no stretched streaks)
  const put = (im, al) => { g.globalAlpha = al; g.drawImage(im, 0, SHIFT); g.save(); g.translate(0, SHIFT); g.scale(1, -1); g.drawImage(im, 0, 0, W, SHIFT, 0, 0, W, SHIFT); g.restore(); };
  put(a, 1); if (b) put(b, f);
  g.restore(); g.globalAlpha = 1;
}
async function drawAd(t) {
  const i = clamp(Math.round((t - C.ad.at) * 30), 0, C.ad.frames - 1);
  g.drawImage(await load(`${FR}ad/${pad(i)}.jpg`), 0, 0);
}

// ------------------------------------------------------------------------------------------ the sketch (front elevation)
// Units: 1 = 10 cm (LAYL's own). Screen: centre x 540, cap top at y 600 → bottom near the wire plate's footprint.
const S = 590, X0 = 540, CAP_TOP = DIM.plateau - 0.004 + 0.352, Y0 = 600 + CAP_TOP * S;
const sx = x => X0 + x * S, sy = y => Y0 - y * S;
const poly = (pts, close = true) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('') + (close ? 'Z' : '');
const B = DIM.body, bev = DIM.bevel;
const outer = archPoints({ a: B.a + bev, hs: B.hs, R: B.R + bev, f: B.f, y0: -bev, rc: B.rc + bev });
const face = archPoints(B);
const cav = archPoints(DIM.cav);
const liq = archPoints({ ...DIM.cav, yClip: DIM.fill });
const capY = DIM.plateau - 0.004;
const capR = [[0, 0], [0.085, 0], [0.085, 0.045], [0.09, 0.05], [0.235, 0.05], [0.25, 0.062], [0.25, 0.135], [0.243, 0.142], [0.243, 0.152], [0.25, 0.159], [0.25, 0.338], [0.236, 0.352], [0, 0.352]];
const capPts = [...capR.slice(1, -1).map(([r, y]) => ({ x: r, y: capY + y })), ...capR.slice(1, -1).reverse().map(([r, y]) => ({ x: -r, y: capY + y }))];
const line = (x1, y1, x2, y2) => `M${sx(x1).toFixed(1)} ${sy(y1).toFixed(1)}L${sx(x2).toFixed(1)} ${sy(y2).toFixed(1)}`;
const mm = v => String(Math.round(v * 100));        // 1 unit = 100 mm

const svg = document.getElementById('draw');
const P = (id, d, w, col = COL.graphite, extra = '') => `<path id="${id}" d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="butt" pathLength="1" stroke-dasharray="1 1" ${extra}/>`;
const capTop = CAP_TOP, bodyW = 2 * (B.a + bev), dimY = -0.17, dimX = B.a + bev + 0.2;
svg.innerHTML = `
  <path id="liq" d="${poly(liq)}" fill="${COL.amber}" opacity="0"/>
  ${P('outer', poly(outer), 4.2)}
  ${P('face', poly(face), 2)}
  ${P('cav', poly(cav), 2.4)}
  ${P('cap', poly(capPts), 3.4)}
  ${P('groove', line(-0.243, capY + 0.147, 0.243, capY + 0.147), 1.6)}
  ${P('lab', poly([{ x: -0.28, y: 0.024 }, { x: 0.28, y: 0.024 }, { x: 0.28, y: 0.206 }, { x: -0.28, y: 0.206 }]), 1.6, COL.smoke)}
  ${P('axis', line(0, -0.3, 0, capTop + 0.05), 1.4, COL.smoke, 'opacity=".8"')}
  ${P('dimW', line(-bodyW / 2, dimY, bodyW / 2, dimY) + line(-bodyW / 2, dimY - 0.04, -bodyW / 2, dimY + 0.04) + line(bodyW / 2, dimY - 0.04, bodyW / 2, dimY + 0.04), 1.6, COL.smoke)}
  ${P('dimH', line(dimX, -bev, dimX, capTop) + line(dimX - 0.04, -bev, dimX + 0.04, -bev) + line(dimX - 0.04, capTop, dimX + 0.04, capTop), 1.6, COL.smoke)}
  <g font-family="JetBrains Mono" font-weight="600" font-size="24" letter-spacing="4" fill="${COL.smoke}" style="direction:ltr">
    <text id="tW" x="${sx(0)}" y="${sy(dimY) + 40}" text-anchor="middle">${mm(bodyW)}</text>
    <text id="tH" x="${sx(dimX) - 18}" y="${sy(capTop / 2) + 8}" text-anchor="end">${mm(capTop + bev)}</text>
    <text id="tC" x="${sx(0.25) + 18}" y="${sy(capY + 0.2) + 8}" text-anchor="start">Ø${mm(0.5)}</text>
  </g>`;
const draw = id => svg.querySelector('#' + id);
const STROKES = [  // id, start, dur   (frame 0 already mid-drawing: the outline is ~35% on at t = 0)
  ['outer', -0.55, 1.15], ['face', 0.05, 0.85], ['cav', 0.18, 0.85], ['cap', 0.28, 0.7], ['groove', 0.62, 0.3],
  ['lab', 0.7, 0.45], ['axis', 0.12, 1.1], ['dimW', 0.78, 0.4], ['dimH', 0.86, 0.45],
].map(([id, at, dur]) => ({ el: draw(id), at, dur }));
const LABELS = [['tW', 1.05], ['tH', 1.12], ['tC', 0.95]].map(([id, at]) => ({ el: draw(id), at }));
const sketch = document.getElementById('sketch');

function renderSketch(t) {
  for (const s of STROKES) s.el.setAttribute('stroke-dashoffset', (1 - E.outCubic(clamp((t - s.at) / s.dur))).toFixed(4));
  for (const l of LABELS) l.el.setAttribute('opacity', E.outCubic(clamp((t - l.at) / 0.25)).toFixed(3));
  draw('liq').setAttribute('opacity', (0.22 * E.inOutSine(clamp((t - 0.95) / 0.45))).toFixed(3));
  // the camera never rests: a slow push and a small leftward drift (forward, in RTL)
  const k = clamp(t / 1.9), sc = 1 + 0.03 * k, dx = -10 * k;
  svg.style.transformOrigin = '540px 1130px';
  svg.style.transform = `translateX(${dx.toFixed(2)}px) scale(${sc.toFixed(4)})`;
}

// ------------------------------------------------------------------------------------------ copy (two inks: the scan line re-colours it)
const copies = document.getElementById('copies');
const NS = 'http://www.w3.org/2000/svg';
function dotsSVG(fill) {
  const d = 22, gp = d * 0.178, w = 3 * d + 2 * gp;
  return `<svg width="${w}" height="${d + 12}" viewBox="0 -12 ${w} ${d + 12}">${[0, 1, 2].map(i => `<circle data-i="${i}" cx="${(w - d / 2 - i * (d + gp)).toFixed(2)}" cy="${d / 2}" r="${d / 2}" fill="${fill}"/>`).join('')}</svg>`;
}
const BLOCKS = C.text.map(b => {
  const make = (fg, dot) => {
    const el = document.createElement('div'); el.className = 'copy'; el.lang = 'ar'; el.style.color = fg;
    const ws = [];
    b.lines.forEach((ln, li) => {
      const row = document.createElement('span'); row.className = 'ln';
      const parts = ln.replace('•••', ' •••').split(/\s+/);
      parts.forEach((p, wi) => {
        const s = document.createElement('span'); s.className = 'w';
        if (p === '•••') { s.className = 'w dots'; s.innerHTML = dotsSVG(dot); }
        else s.textContent = p;
        row.appendChild(s); ws.push({ el: s, line: li, dots: p === '•••' });
        if (wi < parts.length - 1 && parts[wi + 1] !== '•••') row.appendChild(document.createTextNode(' '));
      });
      el.appendChild(row);
    });
    copies.appendChild(el);
    return { el, ws };
  };
  return { b, ink: b.id === 'hook' ? make(COL.ink, COL.ink) : null, paper: make(COL.paper, COL.lime) };
});
const GAPS = [0, 0.10, 0.17, 0.27, 0.33];           // uneven, speech-like (3, 2, 3, 2 frames)
function renderCopy(t, paperRight) {
  for (const { b, ink, paper } of BLOCKS) {
    for (const v of [ink, paper]) {
      if (!v) continue;
      let wi = 0;
      for (const w of v.ws) {
        const lineIdx = w.line, onLine = v.ws.filter(x => x.line === lineIdx).indexOf(w);
        const t0 = b.in[lineIdx] + GAPS[Math.min(onLine, GAPS.length - 1)] + (w.dots ? 0.06 : 0);
        const k = tw(t, t0, 0.55, E.outExpo);
        const ko = tw(t, b.out + wi * 0.03, 0.2, E.inCubic);
        const y = (1 - k) * 58 - ko * 74, op = clamp(k * 1.8) * (1 - ko), bl = (1 - k) * 9 + ko * 4;
        css(w.el, { transform: `translateY(${y.toFixed(2)}px)`, opacity: op.toFixed(3), filter: bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : 'none' });
        if (w.dots) {                                   // the brand ellipsis types while the line is read
          const amp = 9 * (1 - 0.5 * clamp((t - C.dotsIn - 0.8) / 0.6));
          w.el.querySelectorAll('circle').forEach((c, i) => c.setAttribute('transform', `translate(0 ${typing(t - C.dotsIn, i, { period: 0.72, phase: 0.12, amp }).toFixed(2)})`));
        }
        wi++;
      }
    }
    // where the ground is paper (left of the scan line during the first sweep) the copy is ink; elsewhere paper/lime
    if (ink) ink.el.style.clipPath = `inset(-300px ${(W - 72 - paperRight).toFixed(1)}px -300px -100px)`;
    paper.el.style.clipPath = `inset(-300px -100px -300px ${(paperRight - 72).toFixed(1)}px)`;
    const vis = t > b.in[0] - 0.05 && t < b.out + 0.4;
    v_(ink, vis); v_(paper, vis);
  }
}
const v_ = (v, on) => { if (v) v.el.style.display = on ? 'block' : 'none'; };

// ------------------------------------------------------------------------------------------ frame
const scan = document.getElementById('scan');
const grainCv = document.getElementById('grain');
const sweepAt = t => { for (const s of C.sweeps) { const k = (t - s.at) / s.dur; if (k >= 0 && k < 1) return { ...s, k, x: lerp(W + 24, -24, E.inOutSine(k)) }; } return null; };

async function seek(t) {
  let base = 'SKETCH';
  for (const s of C.sweeps) if (t >= s.at + s.dur) base = s.to;
  const sw = sweepAt(t);
  const srcF = clamp((t - C.passes.t0) / (C.passes.t1 - C.passes.t0)) * (C.passes.frames - 1);

  // picture
  if (t >= C.ad.at) await drawAd(t);
  else if (sw) {
    if (sw.from !== 'SKETCH') await drawPass(sw.from, srcF);
    await drawPass(sw.to, srcF, Math.max(0, sw.x));
  } else if (base !== 'SKETCH') await drawPass(base, srcF);
  else { g.fillStyle = COL.ink; g.fillRect(0, 0, W, H); }

  // the paper sketch: full before the first sweep, left of the line during it, gone after
  const paperRight = sw && sw.from === 'SKETCH' ? clamp(sw.x, 0, W) : base === 'SKETCH' ? W : 0;
  if (paperRight > 0) {
    sketch.style.display = 'block'; grainCv.style.display = 'block';
    sketch.style.clipPath = grainCv.style.clipPath = `inset(0 ${(W - paperRight).toFixed(1)}px 0 0)`;
    renderSketch(t);
    grain(grainCv, Math.round(t * 30), { amount: 26, scale: 2 }); grainCv.style.opacity = '0.045';
  } else { sketch.style.display = 'none'; grainCv.style.display = 'none'; }

  css(scan, { display: sw ? 'block' : 'none', left: (sw ? sw.x : -50).toFixed(1) + 'px' });
  renderCopy(t, paperRight);
}

boot({ width: W, height: H, fps: 30, duration: C.duration, seek,
  ready: Promise.all([document.fonts.load('800 112px Alexandria', 'قبل لا يلمع'), document.fonts.load('600 24px "JetBrains Mono"', 'LAYL 104')]) });
