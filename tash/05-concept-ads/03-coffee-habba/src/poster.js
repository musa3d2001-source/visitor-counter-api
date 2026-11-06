// HABBA — poster / reel cover (?poster=1). Background = a photoreal end-card frame (k5: the cup in the low sun, the
// sunlit limewash wall free above it), re-framed so everything that matters sits inside the profile-grid crop:
// the centre 3:4 (1080×1440, y 240–1680). Layout, centred and RTL-first: TASH pill + concept slate · the HABBA mark ·
// HABBA · «قهوتك… على مهلك.» · the cup.
import { css } from '/_system/motion/kit.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';
import { HC } from './habba-logo.mjs';

// the picture: k5 at edit 10.6 s (cup centred, steam rising), scaled ×1.25 about the bottom centre so cup + saucer sit
// inside the 3:4 crop with real footage all the way to the bottom edge (no mirrored or stretched extension: the ECD
// review found the mirror seam in the bottom 90 px of the full 9:16 cover)
export const POSTER_FRAME = { t: 10.6, z: 1.25, fx: 540, fy: 1920, dy: 0 };

export function makePosterOverlay({ ui, t1, t2, t3, ec, svg, hw0, hw1, beanG, beanBase, lat, sub, slate, stingRoot }) {
  for (const l of [t1, t2, t3]) l.box.style.display = 'none';
  stingRoot.style.display = 'none';
  // the mark, fully drawn, bean in its slot
  const mw = 400, mh = mw * svg.viewBox.baseVal.height / svg.viewBox.baseVal.width, mt = 478;
  hw0.setAttribute('offset', '1'); hw1.setAttribute('offset', '1');
  beanG.setAttribute('opacity', '1'); beanG.setAttribute('transform', beanBase);
  css(svg, { top: mt + 'px', width: mw + 'px', height: mh.toFixed(1) + 'px', left: ((1080 - mw) / 2) + 'px' });
  ec.style.opacity = '1';
  css(lat, { top: (mt + mh + 26) + 'px', fontSize: '34px', opacity: '1', letterSpacing: '.42em', paddingLeft: '.42em' });
  sub.style.display = 'none';
  const line = document.createElement('div'); line.className = 'h-ar'; line.textContent = 'قهوتك… على مهلك.';
  css(line, { top: (mt + mh + 84) + 'px', fontSize: '56px', color: HC.roast, fontWeight: '300' }); ec.appendChild(line);
  // concept slate (inside the safe area AND the 3:4 grid crop): a small ink pill with the real TASH mark (paper + lime),
  // the slate set in roasted on the wall
  const pill = document.createElement('div');
  css(pill, { position: 'absolute', left: '50%', top: '292px', transform: 'translateX(-50%)', background: '#0B0B0B', borderRadius: '26px', padding: '11px 22px 9px', lineHeight: '0' });
  pill.innerHTML = wordmarkSVG({ width: 62, body: '#F5F5E9', dot: '#C6FF00' });
  ui.appendChild(pill);
  slate.style.cssText = 'position:absolute;left:0;right:0;top:364px;opacity:1;text-align:center';
  css(slate.querySelector('.mono'), { color: '#4A2F23' });
  css(slate.querySelector('.ar'), { color: '#4A2F23', marginTop: '8px' });
  return { render() {} };
}
