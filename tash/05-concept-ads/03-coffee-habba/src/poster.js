// HABBA — poster / cover (?poster=1). Background = the end-card world (cup turned, mark on the cup, bars on the wall).
// Layout: TASH slate chip (concept label) · the HABBA mark · the line · HABBA wordmark · the cup.
import { css } from '/_system/motion/kit.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';
import { HC } from './habba-logo.mjs';

export function makePosterOverlay({ ui, t1, t2, t3, ec, svg, hw0, hw1, beanG, beanBase, lat, sub, slate, stingRoot }) {
  for (const l of [t1, t2, t3]) l.box.style.display = 'none';
  stingRoot.style.display = 'none';
  // mark: fully drawn, bean in its slot
  hw0.setAttribute('offset', '1'); hw1.setAttribute('offset', '1');
  beanG.setAttribute('opacity', '1'); beanG.setAttribute('transform', beanBase);
  css(svg, { top: '452px', width: '430px', height: (430 * svg.viewBox.baseVal.height / svg.viewBox.baseVal.width).toFixed(1) + 'px', left: ((1080 - 430) / 2) + 'px' });
  ec.style.opacity = '1';
  // the line under the mark (support size), then the Latin name as the label level
  const line = document.createElement('div'); line.className = 'h-ar'; line.textContent = 'قهوتك… على مهلك.';
  css(line, { top: '776px', fontSize: '60px', color: HC.roast, fontWeight: '300' }); ec.appendChild(line);
  css(lat, { top: '880px', fontSize: '34px', opacity: '1', letterSpacing: '.42em', paddingLeft: '.42em' });
  sub.style.display = 'none';
  // concept slate chip (TASH): ink tab with the TASH wordmark, CONCEPT AD and the Arabic label
  const chip = document.createElement('div');
  css(chip, { position: 'absolute', left: '50%', top: '228px', transform: 'translateX(-50%)', background: '#0B0B0B', borderRadius: '28px', padding: '22px 40px 20px', textAlign: 'center', minWidth: '470px' });
  chip.innerHTML = `<div style="display:flex;justify-content:center;margin-bottom:12px">${wordmarkSVG({ width: 78, body: '#F5F5E9', dot: '#C6FF00' })}</div>`;
  slate.style.cssText = 'position:static;opacity:1;text-align:center';
  chip.appendChild(slate); ui.appendChild(chip);
  return { render() {} };
}
