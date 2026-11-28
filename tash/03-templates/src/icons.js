// TASH icon set — simple geometric SVG in the brand's own geometry: solid shapes, round joins, and the three dots
// (diameter : gap = 1 : 0.178, the logo's ratio) wherever dots make sense. All icons sit in a 600×600 box with
// ~70 px of air, so they survive a 64 px highlight circle and a 160 px carousel mark alike.
// icon(name, { fg, bg, accent }) → SVG markup. fg = the shape, bg = cut-outs (normally the ground colour),
// accent = the signal (used only by 'order', the action).
import { bubblePath } from './tpl.js';

const DOT = 1, GAP = 0.178;
function dotRow(n, d, cx, cy, fill, align = 'center') {
  const g = d * GAP, w = n * d + (n - 1) * g;
  const x0 = align === 'right' ? cx - w : align === 'left' ? cx : cx - w / 2;
  return Array.from({ length: n }, (_, i) => `<circle cx="${(x0 + d / 2 + i * (d + g)).toFixed(1)}" cy="${cy}" r="${d / 2}" fill="${fill}"/>`).join('');
}

const ICONS = {
  // خدماتنا — a clapperboard: production. The slate on the board is the three dots.
  services: ({ fg, bg }) => {
    const stripes = y => [136, 226, 316, 406].map(x => `<path d="M${x} ${y + 48}L${x + 30} ${y}H${x + 72}L${x + 42} ${y + 48}Z" fill="${bg}"/>`).join('');
    return `
    <rect x="96" y="276" width="408" height="250" rx="30" fill="${fg}"/>
    <rect x="96" y="214" width="408" height="48" rx="10" fill="${fg}"/>${stripes(214)}
    <g transform="rotate(-17 104 200)"><rect x="96" y="152" width="408" height="48" rx="10" fill="${fg}"/>${stripes(152)}</g>
    <circle cx="112" cy="207" r="22" fill="${fg}"/>
    ${dotRow(3, 60, 300, 401, bg)}`;
  },

  // أعمالنا — a vertical (9:16) frame with play: the work is ads you watch.
  work: ({ fg, bg }) => `
    <rect x="166" y="62" width="268" height="476" rx="42" fill="${fg}"/>
    <path d="M262 226 L262 374 L382 300 Z" fill="${bg}" stroke="${bg}" stroke-width="22" stroke-linejoin="round"/>`,

  // شلون تطلب؟ — the typing bubble itself: the order starts with a message. The only icon that carries the accent.
  order: ({ accent, bg }) => `
    <g transform="translate(60 184) scale(1.55)"><path d="${bubblePath(300, 150, 75, 'right')}" fill="${accent}"/></g>
    ${dotRow(3, 78, 292.5, 300, bg)}`,

  // الأسعار — three packages: • لقطة · •• ريل · ••• إطلاق (as in 07-ops), set right-aligned like Arabic.
  prices: ({ fg }) => `
    ${dotRow(1, 92, 470, 158, fg, 'right')}
    ${dotRow(2, 92, 470, 300, fg, 'right')}
    ${dotRow(3, 92, 470, 442, fg, 'right')}`,

  // أسئلة — one glyph, set from the font (Alexandria), never drawn by hand.
  faq: ({ fg }) => `
    <text x="300" y="300" fill="${fg}" font-family="Alexandria" font-weight="800" font-size="500" text-anchor="middle" dominant-baseline="central" direction="rtl">؟</text>`,

  // step icons for the how-to-order deck
  message: ({ fg, bg }) => `
    <g transform="translate(60 184) scale(1.55)"><path d="${bubblePath(300, 150, 75, 'right')}" fill="${fg}"/></g>
    ${dotRow(3, 78, 292.5, 300, bg)}`,
  offer: ({ fg, bg }) => `
    <path d="M150 70h220l80 80v380a20 20 0 0 1-20 20H150a20 20 0 0 1-20-20V90a20 20 0 0 1 20-20z" fill="${fg}"/>
    <path d="M370 70v62a18 18 0 0 0 18 18h62z" fill="${bg}" opacity=".35"/>
    <rect x="196" y="236" width="208" height="30" rx="15" fill="${bg}"/>
    <rect x="236" y="306" width="168" height="30" rx="15" fill="${bg}"/>
    <rect x="276" y="376" width="128" height="30" rx="15" fill="${bg}"/>`,
};
ICONS.build = ICONS.services;
ICONS.deliver = ICONS.work;

export const ICON_NAMES = Object.keys(ICONS);
export function icon(name, { fg = '#F5F5E9', bg = '#0B0B0B', accent = '#C6FF00', size = 600 } = {}) {
  const f = ICONS[name];
  if (!f) throw new Error('unknown icon: ' + name + ' (have: ' + ICON_NAMES.join(', ') + ')');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 600 600" style="display:block;overflow:visible">${f({ fg, bg, accent })}</svg>`;
}
