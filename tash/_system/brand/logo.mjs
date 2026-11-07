// TASH / طشّ — logo builders. Isomorphic ES module (Node + browser).
// Geometry is outlined from Alexandria Black (OFL) and customised:
//   • ط stem re-cut at an angle that rises toward the reading direction (leftward = forward motion)
//   • the three dots of ش are perfect circles in a row — the "typing…" indicator: people are talking about you
//   • the shadda keeps the punch of the name: طشّ!
import D from './logo-data.mjs';

export const COLORS = { ink: '#0B0B0B', paper: '#F5F5E9', lime: '#C6FF00', smoke: '#8E9088', char: '#1A1A18' };
export const VB = { w: D.W, h: D.H };            // normalised wordmark viewBox (0 0 W H)
export const DOT_R = D.DOTS.r;                    // in viewBox units (diameter 180 = the brand unit "D")

/** Dot centres in normalised viewBox units, ordered RIGHT → LEFT (Arabic reading order). */
export function dots() {
  const { cx, cy, r, gap } = D.DOTS, dx = 2 * r + gap;
  return [1, 0, -1].map(k => ({ cx: cx + k * dx + D.TX, cy: cy + D.TY, r }));
}

/** Inner SVG markup of the wordmark in normalised coordinates.
 *  opts: body, dots (colour), shadda (colour), ids (bool: add ids for animation), dotOffsets [[dx,dy]×3], dotScale [s×3] */
export function wordmarkInner({ body = COLORS.paper, dot = COLORS.lime, shadda = null, ids = false, dotOffsets = null, dotScale = null, bodyOpacity = 1, shaddaOffset = [0, 0], shaddaOpacity = 1 } = {}) {
  const id = n => (ids ? ` id="${n}"` : '');
  const ds = dots().map((d, i) => {
    const [ox, oy] = dotOffsets ? dotOffsets[i] : [0, 0];
    const s = dotScale ? dotScale[i] : 1;
    return `<circle${id('tash-dot-' + (i + 1))} cx="${(d.cx + ox).toFixed(2)}" cy="${(d.cy + oy).toFixed(2)}" r="${(d.r * s).toFixed(2)}" fill="${dot}"/>`;
  }).join('');
  return `<g${id('tash-body')} transform="translate(${D.TX} ${D.TY})" opacity="${bodyOpacity}"><path d="${D.BODY}" fill="${body}"/></g>` +
    `<g${id('tash-shadda')} transform="translate(${D.TX + D.SHADDA_DX + shaddaOffset[0]} ${D.TY + D.SHADDA_DY + shaddaOffset[1]})" opacity="${shaddaOpacity}"><path d="${D.SHADDA}" fill="${shadda || body}"/></g>` +
    `<g${id('tash-dots')}>${ds}</g>`;
}

/** Complete wordmark SVG. pad = padding in viewBox units on every side. */
export function wordmarkSVG({ bg = null, pad = 0, width = null, title = 'طشّ — TASH Creative', ...rest } = {}) {
  const w = VB.w + pad * 2, h = VB.h + pad * 2;
  const size = width ? ` width="${width}" height="${(width * h / w).toFixed(1)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w} ${h}"${size} role="img" aria-label="${title}"><title>${title}</title>` +
    (bg ? `<rect x="${-pad}" y="${-pad}" width="${w}" height="${h}" fill="${bg}"/>` : '') + wordmarkInner(rest) + `</svg>`;
}

/** The symbol: three dots alone (avatar fallback, watermark, bullets, loaders). */
export function symbolSVG({ dot = COLORS.lime, bg = null, pad = 60 } = {}) {
  const ds = dots(), r = ds[0].r;
  const minX = ds[2].cx - r - pad, maxX = ds[0].cx + r + pad, cy = ds[0].cy;
  const w = maxX - minX, h = 2 * r + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${cy - r - pad} ${w} ${h}" role="img" aria-label="طشّ dots"><title>طشّ — dots</title>` +
    (bg ? `<rect x="${minX}" y="${cy - r - pad}" width="${w}" height="${h}" fill="${bg}"/>` : '') +
    ds.map(d => `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${dot}"/>`).join('') + `</svg>`;
}

/** Latin "TASH" outlines (Archivo Black Expanded) + mono sub-line, as inner markup.
 *  Returns {svg, w, h} in its own units: cap height = capH. */
export function latinInner({ fg = COLORS.paper, sub = COLORS.smoke, capH = 520, subGap = 150, subCapH = 92 } = {}) {
  const s = capH / D.LATIN.capH;
  const latinW = D.LATIN.w * s;
  const subS = latinW / D.SUB.adv; // sub-line justified to the exact width of TASH
  const subTop = capH + subGap;
  const subY = subTop + 730 * subS; // JetBrains Mono cap height ≈ 730/1000
  const svg = `<g transform="translate(${-D.LATIN.x0 * s} ${capH}) scale(${s})"><path d="${D.LATIN.d}" fill="${fg}"/></g>` +
    `<g transform="translate(0 ${subY}) scale(${subS})" fill="${sub}">${D.SUB.svg}</g>`;
  return { svg, w: latinW, h: subY + 40 * subS };
}

/** Horizontal lockup: [TASH / CREATIVE STUDIO · KUWAIT] | [طشّ]  (Arabic leads on the right). */
export function lockupHorizontalSVG({ bg = null, body = COLORS.paper, dot = COLORS.lime, latin = COLORS.paper, sub = COLORS.smoke, rule = '#2C2C29', pad = 160 } = {}) {
  const L = latinInner({ fg: latin, sub, capH: 470 });
  const gap = 230, ruleW = 10;
  const wmX = L.w + gap * 2 + ruleW;
  const W = wmX + VB.w, H = VB.h;
  const latY = (H - L.h) / 2 + 40;
  const vb = `${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="طشّ — TASH Creative"><title>طشّ — TASH Creative</title>` +
    (bg ? `<rect x="${-pad}" y="${-pad}" width="${W + 2 * pad}" height="${H + 2 * pad}" fill="${bg}"/>` : '') +
    `<g transform="translate(0 ${latY})">${L.svg}</g>` +
    `<rect x="${L.w + gap}" y="${H * 0.18}" width="${ruleW}" height="${H * 0.7}" fill="${rule}"/>` +
    `<g transform="translate(${wmX} 0)">${wordmarkInner({ body, dot })}</g></svg>`;
}

/** Stacked lockup: طشّ over TASH CREATIVE STUDIO · KUWAIT, centred. */
export function lockupStackedSVG({ bg = null, body = COLORS.paper, dot = COLORS.lime, latin = COLORS.paper, sub = COLORS.smoke, pad = 200 } = {}) {
  const L = latinInner({ fg: latin, sub, capH: 330, subGap: 110 });
  const gap = 260;
  const W = Math.max(VB.w, L.w), H = VB.h + gap + L.h;
  const vb = `${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="طشّ — TASH Creative"><title>طشّ — TASH Creative</title>` +
    (bg ? `<rect x="${-pad}" y="${-pad}" width="${W + 2 * pad}" height="${H + 2 * pad}" fill="${bg}"/>` : '') +
    `<g transform="translate(${(W - VB.w) / 2} 0)">${wordmarkInner({ body, dot })}</g>` +
    `<g transform="translate(${(W - L.w) / 2} ${VB.h + gap})">${L.svg}</g></svg>`;
}

/** Profile picture (square, circle-safe). Wordmark optically centred (the ش tail hangs below the baseline). */
export function avatarSVG({ bg = COLORS.lime, body = COLORS.ink, dot = COLORS.ink, size = 1080, scale = 0.70 } = {}) {
  const w = size * scale, s = w / VB.w, h = VB.h * s;
  const x = (size - w) / 2 + size * 0.012, y = (size - h) / 2 + size * 0.005;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${bg}"/>` +
    `<g transform="translate(${x} ${y}) scale(${s})">${wordmarkInner({ body, dot })}</g></svg>`;
}
