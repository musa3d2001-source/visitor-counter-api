import { writeFileSync } from 'node:fs';
const word = (o = {}) => ({ t: 'word', key: 'mashrou3ak', size: 172, slot: [715, 506], fill: 'paper', stroke: 'ink', lw: 16, shadow: { dx: 8, dy: 8, color: 'ink' }, dots: false, ...o });
const dots = (D, pitch, offs = [0, -11, -22]) => [-1, 0, 1].flatMap((n, j) => { const x = 715 + n * pitch, y = 506 + offs[j], r = D / 2; return [
  { t: 'dot', x: x + 6, y: y + 6, r: r + 4, fill: 'ink' }, { t: 'dot', x, y, r, fill: 'lime', ring: { color: 'ink', lw: 8 } }]; });
const tag = (s, size, y) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'lime', stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4 });
const opener = (id, src, note, ui) => ({ id, tc: 'f0 · 0.00s', note, ui, layers: [{ t: 'still', src }, tag('حلو…', 128, 826), word(), ...dots(76, 88)] });
const A = '/_stills/s1_a_fit.png', B = '/_stills/s1_b_fit.png';
writeFileSync(process.argv[2], JSON.stringify({ title: 'طشّ · الإعلان الجديد · تجربة أول لقطة', frames: [
  opener('A', A, 'خيار A · كوب مضلّع', 'none'),
  opener('B', B, 'خيار B · كوب سادة', 'none'),
  opener('A_ig', A, 'A داخل واجهة إنستغرام', 'ig'),
  opener('A_tt', A, 'A داخل واجهة تيك توك', 'tt'),
] }, null, 1));
