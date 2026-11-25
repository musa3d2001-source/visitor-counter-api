// First look, revision-2 geometry (BUILD-SPEC §5/§6): word ink y 331-533, dots Ø80 pitch 92 at y 342, tag 200 px on baseline 757.
import { writeFileSync } from 'node:fs';
const SLOT = [715, 352];
const word = (o = {}) => ({ t: 'word', key: 'mashrou3ak', size: 172, slot: SLOT, fill: 'paper', stroke: 'ink', lw: 16, shadow: { dx: 8, dy: 8, color: 'ink' }, dots: false, ...o });
const dots = (D = 80, pitch = 92, offs = [0, -10, -22]) => [-1, 0, 1].flatMap((n, j) => { const x = 715 + n * pitch, y = 342 + offs[j], r = D / 2; return [
  { t: 'dot', x: x + 6, y: y + 6, r: r + 4, fill: 'ink' }, { t: 'dot', x, y, r, fill: 'lime', ring: { color: 'ink', lw: 8 } }]; });
const tag = (s, size = 200, y = 757) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'lime', stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4 });
const opener = (id, src, note, ui, withTag = true) => ({ id, tc: withTag ? 'f3 · 0.10s' : 'f0 · 0.00s', note, ui, layers: [{ t: 'still', src }, ...(withTag ? [tag('حلو…')] : []), word(), ...dots()] });
const A = '/_stills/s1_a_fit.png', B = '/_stills/s1_b_fit.png';
writeFileSync(process.argv[2], JSON.stringify({ title: 'طشّ · الإعلان الجديد · أول لقطة · التوزيع المعدّل', frames: [
  opener('A', A, 'خيار A · كوب مضلّع', 'none'),
  opener('B', B, 'خيار B · كوب سادة', 'none'),
  opener('A_f0', A, 'A · أول فريم (بدون «حلو…»)', 'none', false),
  opener('A_ig', A, 'A داخل واجهة إنستغرام', 'ig'),
] }, null, 1));
