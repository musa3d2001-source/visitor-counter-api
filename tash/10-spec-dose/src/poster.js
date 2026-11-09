// DOSE — story cover / thumbnail (?poster=1): the terrace at the end of the crane, the recreated dose mark on the wall, the
// mood widget at ١٠٠٪, their line, and the spec label (the tag + the full slate line). All inside the story safe area.
import { css } from '/_system/motion/kit.js';
export const POSTER_T = 12.45;   // the sign sharp on the wall, their line landed, before the match
export function makePosterOverlay({ LY, tagWallTop, h1, h2, mwrap, meter, fill, pct, ring, ring2, chips, tag1, logo, info, stingRoot, slate, tag, AR, FILLW }) {
  const sheen = fill.querySelector('.sheen'); if (sheen) sheen.style.opacity = '0';
  for (const l of [h1, h2]) l.box.style.display = 'none';
  for (const c of chips) c.c.style.display = 'none';
  stingRoot.style.display = 'none'; info.style.display = 'none'; logo.style.display = 'none';
  css(ring, { opacity: '0' }); css(ring2, { opacity: '0' });
  css(fill, { width: FILLW + 'px', opacity: '1' }); pct.textContent = AR(100) + '٪';
  css(meter, { transform: 'translateY(1010px) scale(1.55)', opacity: '1' });
  tag1.spans.forEach(s => css(s, { opacity: '1', transform: 'none', filter: 'none' }));
  css(tag1.box, { left: LY.tagline.wallL + 'px', right: LY.tagline.wallR + 'px', top: tagWallTop(POSTER_T).toFixed(2) + 'px' });   // v3: on the wall, as in the film
  slate.style.cssText = 'position:absolute;left:0;right:0;top:1452px;opacity:1;text-align:center';
  slate.querySelector('.mono').style.display = 'none';
  css(slate.querySelector('.sar'), { color: '#1B1511', fontSize: '30px', fontWeight: '600', background: 'rgba(255,255,255,.86)', display: 'inline-block', padding: '8px 22px 10px', borderRadius: '22px' });
  return { render() {} };
}
