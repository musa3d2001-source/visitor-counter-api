// HABBA / حبّة — logo builders (fictional client of a TASH concept ad).
// The mark: «حبّة» outlined from Alexandria (OFL). The single dot under ب is replaced by a roasted coffee bean —
// «حبّة» literally means "a bean", so the letter carries the product. Latin: HABBA in Archivo expanded.
import D from './habba-logo-data.mjs';

export const HC = { paper: '#EFE6D8', roast: '#4A2F23', terra: '#C46A4A', ink: '#17110E', crema: '#C58A52' };
const [X0, Y0, X1, Y1] = D.box;
export const PAD = 40;
export const VB = { x: X0 - PAD, y: Y0 - PAD, w: X1 - X0 + PAD * 2, h: Y1 - Y0 + PAD * 2 };
/** bean anchor in logo units (where the dot of ب used to be) */
export const BEAN = { cx: D.dot.cx + 4, cy: D.dot.cy - 4, len: D.dot.r * 2.55, wid: D.dot.r * 1.78, rot: -26 };

/** Bean outline (with the S-crease cut out, evenodd) centred at 0,0, long axis on x. Units: len/wid. */
export function beanPath(len = 1, wid = 0.66) {
  const a = len / 2, b = wid / 2, k = 0.5523;
  // slightly egg-shaped body: the right end a touch fuller
  const ra = a * 1.02, la = a * 0.98;
  const body = `M${-la} 0 C${-la} ${-b * k * 1.02} ${-la * k} ${-b} 0 ${-b} C${ra * k} ${-b} ${ra} ${-b * k} ${ra} 0 ` +
    `C${ra} ${b * k} ${ra * k} ${b} 0 ${b} C${-la * k} ${b} ${-la} ${b * k} ${-la} 0 Z`;
  // the crease: a thin S-shaped sliver, tapering to points
  const e = a * 0.80, t = b * 0.30, s = b * 0.34;
  const crease = `M${-e} ${s * 0.25} C${-e * 0.45} ${-s - t} ${e * 0.05} ${s + t * 0.2} ${e} ${-s * 0.25} ` +
    `C${e * 0.05} ${s - t * 1.6} ${-e * 0.45} ${-s + t * 0.6} ${-e} ${s * 0.25} Z`;
  return body + ' ' + crease;
}

/** Inner markup in logo units. opts: color, beanColor, bean: {dx,dy,rot,scale,opacity} override for animation, ids */
export function markInner({ color = HC.roast, beanColor = null, bean = null, ids = false, showBean = true } = {}) {
  const B = { dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1, ...(bean || {}) };
  const id = n => (ids ? ` id="${n}"` : '');
  const bp = beanPath(BEAN.len, BEAN.wid);
  return `<path${id('habba-body')} d="${D.body}" fill="${color}"/>` +
    (showBean ? `<g${id('habba-bean')} transform="translate(${(BEAN.cx + B.dx).toFixed(2)} ${(BEAN.cy + B.dy).toFixed(2)}) rotate(${(BEAN.rot + B.rot).toFixed(2)}) scale(${B.scale})" opacity="${B.opacity}">` +
      `<path d="${bp}" fill="${beanColor || color}" fill-rule="evenodd"/></g>` : '');
}

export function markSVG({ width = null, bg = null, ...rest } = {}) {
  const size = width ? ` width="${width}" height="${(width * VB.h / VB.w).toFixed(1)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}"${size} role="img" aria-label="حبّة — HABBA">` +
    (bg ? `<rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="${bg}"/>` : '') + markInner(rest) + `</svg>`;
}
