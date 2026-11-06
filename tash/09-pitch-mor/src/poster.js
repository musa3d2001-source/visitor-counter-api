// MOR — poster / reel cover (?poster=1): the hook's own frame (MOR's keyhole in a burgundy door, the corner glowing at
// night through it), the payoff line «الباب مفتوح… تفضّل.» and the spec slate (TASH pill + SPEC AD + Arabic slate).
// Everything sits inside the profile grid's centre 3:4 crop (y 240–1680) and the reel safe area.
import { css } from '/_system/motion/kit.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';

export const POSTER_T = 0.7;   // after the lock gives (light up), before the push

export function makePosterOverlay({ ui, lines, info, slate, stingRoot, MC }) {
  for (const l of lines) l.box.style.display = 'none';
  stingRoot.style.display = 'none'; info.style.display = 'none';
  const head = document.createElement('div'); head.className = 'm-ar';
  css(head, { top: '1262px', fontSize: '96px', fontWeight: '500', color: MC.cream, textShadow: '0 2px 18px rgba(20,6,9,.6)' });
  head.textContent = 'الباب مفتوح… تفضّل.'; ui.appendChild(head);
  const pill = document.createElement('div');
  css(pill, { position: 'absolute', left: '50%', top: '268px', transform: 'translateX(-50%)', background: '#0B0B0B', borderRadius: '26px', padding: '11px 22px 9px', lineHeight: '0' });
  pill.innerHTML = wordmarkSVG({ width: 62, body: '#F5F5E9', dot: '#C6FF00' });
  ui.appendChild(pill);
  slate.style.cssText = 'position:absolute;left:0;right:0;top:1440px;opacity:1;text-align:center';
  css(slate.querySelector('.mono'), { color: '#D9C9B4', fontSize: '22px' });
  css(slate.querySelector('.ar'), { color: '#F3E7D3', fontSize: '32px', marginTop: '10px' });
  return { render() {} };
}
