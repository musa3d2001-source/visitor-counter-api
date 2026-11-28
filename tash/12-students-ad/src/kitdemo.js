// Kit demo (lead-owned): every kit component on one 3 s page, a pure function of t. Render a still of it:
//   node _system/tools/render.mjs --page 12-students-ad/src/kitdemo.html --stills 0.4,1.2,2.9 --stills-dir <dir>
import * as K from './kit.js';

const stage = document.getElementById('stage');
await document.fonts.load('800 100px "Alexandria"'); await document.fonts.load('700 40px "JetBrains Mono"'); await document.fonts.load('500 27px "IBM Plex Sans Arabic"');
K.el(stage, 'div', 'layer', { background: 'radial-gradient(120% 80% at 50% 40%, #23232a, #0B0B0B)' });

// 3D cards: a fan of three, with depth, tilt, contact shadow and a floor reflection
const SL = '../samples/deck-uni-01-title.png', SL2 = '../samples/deck-school-01-title.png';
await Promise.all([K.img(SL), K.img(SL2)]);
const s3 = K.stage3d(stage, { perspective: 1700, ox: 540, oy: 900 });
const cards = [SL2, SL, SL2].map((src, i) => K.card3d(s3, { src, w: 720, h: 405, radius: 16, reflection: i === 1 }));

// kinetic Arabic: per word (punch) and per line (rise); a lime word
const L1 = K.kinetic(stage, { text: 'برزنتيشن؟ يشدّ من أول سلايد.', land: 10, out: 80 }, { y: 420, size: 80, style: 'punch', colors: { 0: K.C.lime } });
const L2 = K.kinetic(stage, { text: 'المعلومة منك…', land: 30, out: 80 }, { y: 1290, size: 64, style: 'rise', perLine: true });
// chips: a sticker chip, file chips (LTR), the samples label
const ch = K.chip(stage, { text: 'برزنتيشن؟', theme: 'lime', size: 52, x: 820, y: 640 });
const files = ['.pptx', '.docx', '.xlsx', '.pdf', '.mp4'].map((ext, i) => K.fileChip(stage, { ext, size: 36, x: 170 + i * 185, y: 1420 }));
const lab = K.samplesLabel(stage, 'نماذج من تصميمنا');
// a slide mapped onto a quad (as on the h2 projection screen)
const q = [[640, 1470], [990, 1500], [985, 1610], [640, 1600]];
const quadImg = K.el(stage, 'img', null, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' }); quadImg.src = SL;
await K.img(quadImg.src);
const G = K.grid({ beat: 0.48, phase: 0.2, fps: 30, bpm: 125 });
const gd = new URLSearchParams(location.search).has('guide') ? K.guide(stage, { beat: 0.48, phase: 0.2, fps: 30, bpm: 125 }) : null;

async function seek(t) {
  const f = Math.round(t * 30); t = f / 30;
  cards.forEach((c, i) => {
    const k = K.kIn(t, 4 + i * 4, 18 + i * 4, K.E.outCubic);
    const spread = (i - 1);
    c.set({ x: 540 + spread * 250 * k, y: 900 + Math.abs(spread) * 40 * k, z: (i === 1 ? 120 : -60) * k, ry: -spread * 28 * k, rz: spread * 6 * k,
      rx: 8, s: K.lerp(0.6, 1, k) * (1 + 0.04 * G.pulse(t, 0, 10, 0.1)), o: K.clamp(k * 3), lift: i === 1 ? 0.9 : 0.4 });
  });
  L1.render(t); L2.render(t);
  ch.render(t, 20, 26, 82);
  files.forEach((fc, i) => fc.render(t, 40 + i * 4, 44 + i * 4, 84));
  lab.show(true); lab.place('top');
  quadImg.style.transform = K.quadTransform(quadImg.naturalWidth, quadImg.naturalHeight, q);
  if (gd) gd.render(t, f, ['kitdemo']);
}
let queue = Promise.resolve();
window.TASH = { width: 1080, height: 1920, fps: 30, duration: 3, ready: K.preloadAll(), seek: t => (queue = queue.then(() => seek(t))) };
window.TASH.ready.then(() => seek(2.9));
