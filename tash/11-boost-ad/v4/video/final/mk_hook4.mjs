// Hook preview on the 1080p final, remap R3-21 as revised: f0-14 = n2-n16 wide; f15-27 = n6-n18 in the 1.25x punch-in about (540,900) (the crash replays closer, landing on the clap at f15), hold n18 (crown at its peak) on f28-29. Frames: BT.709 extraction, specks removed, top clean plate.
// usage: node mk_hook2.mjs <out spec.json>
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const SLOT = [715, 352], DOT_X = [623, 715, 807], DOT_Y = 342;
const word = { t: 'word', key: 'mashrou3ak', size: 172, slot: SLOT, fill: 'paper', stroke: 'ink', lw: 16, shadow: { dx: 8, dy: 8, color: 'ink' }, dots: false };
const typing = f => DOT_X.map((_, j) => -Math.round(22 * Math.max(0, Math.sin(2 * Math.PI * (f / 15) - j * 2 * Math.PI / 3))));
const dots = f => typing(f).flatMap((o, j) => { const x = DOT_X[j], y = DOT_Y + o; return [
  { t: 'dot', x: x + 6, y: y + 6, r: 44, fill: 'ink' }, { t: 'dot', x, y, r: 40, fill: 'lime', ring: { color: 'ink', lw: 8 } }]; });
const tagSize = f => f < 3 ? 0 : f === 3 ? 230 : f === 4 ? 212 : f >= 15 && f <= 17 ? [216, 208, 202][f - 15] : 200;   // lands f3, pulses on f15
const frames = [];
for (let f = 0; f < 30; f++) {
  const n = f < 15 ? f + 2 : Math.min(f - 9, 18), src = `/_stills/${String(n + 1).padStart(4, '0')}.png`;
  const pic = f < 15 ? { t: 'still', src } : { t: 'still', src, scale: 1.25, cx: 0.5, cy: 900 / 1920 };
  const L = [pic];
  if (tagSize(f)) L.push({ t: 'text', s: 'حلو…', size: tagSize(f), x: 540, y: 757, w: 800, fill: 'lime', stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4 });
  L.push(word, ...dots(f));
  frames.push({ id: String(f).padStart(2, '0'), tc: `f${f} · n${n}`, note: '', layers: L });
}
writeFileSync(out, JSON.stringify({ title: 'hook preview (1080p final, no spill, retouched)', frames }));
console.log('frames', frames.length);
