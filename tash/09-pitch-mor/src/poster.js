// MOR — poster / reel cover (?poster=1): the hook's door and MOR's keyhole, framing MOR's cup (m3: the correct emblem and
// «MOR مور»; the AI sign is no longer shown), the payoff line «الباب مفتوح… تفضّل.» and the spec slate (TASH pill + SPEC AD + Arabic slate).
// Everything sits inside the profile grid's centre 3:4 crop (y 240–1680) and the reel safe area.
import { css } from '/_system/motion/kit.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';

export const POSTER_T = 0.7;   // the hook's keyhole geometry (after the lock gives, before the push)
// the picture inside the keyhole: m3's cup (segment C, frame i), scaled by k so source point `src` (the centre of «MOR مور»)
// lands on screen point `at`: «MOR مور» sits in the keyhole's wide base, the emblem in its neck; the misprinted small Arabic is softened.
// (CD review: the AI sign's O folds into a heart; MOR's real sign has a plain O, so the cover no longer shows it.)
export const POSTER_PIC = { seg: 'C', i: 55, k: 0.45, src: [535, 1720], at: [556, 1128] };

export function makePosterOverlay({ ui, lines, info, slate, stingRoot, MC }) {
  for (const l of lines) l.box.style.display = 'none';
  stingRoot.style.display = 'none'; info.style.display = 'none';
  const head = document.createElement('div'); head.className = 'm-ar';
  css(head, { top: '1300px', fontSize: '96px', fontWeight: '500', color: MC.cream, textShadow: '0 2px 18px rgba(20,6,9,.6)' });
  head.textContent = 'الباب مفتوح… تفضّل.'; ui.appendChild(head);
  const pill = document.createElement('div');
  css(pill, { position: 'absolute', left: '50%', top: '268px', transform: 'translateX(-50%)', background: '#0B0B0B', borderRadius: '26px', padding: '11px 22px 9px', lineHeight: '0' });
  pill.innerHTML = wordmarkSVG({ width: 62, body: '#F5F5E9', dot: '#C6FF00' });
  ui.appendChild(pill);
  slate.style.cssText = 'position:absolute;left:0;right:0;top:1474px;opacity:1;text-align:center';
  css(slate.querySelector('.mono'), { color: '#D9C9B4', fontSize: '22px' });
  css(slate.querySelector('.ar'), { color: '#F3E7D3', fontSize: '32px', marginTop: '10px' });
  return { render() {} };
}
