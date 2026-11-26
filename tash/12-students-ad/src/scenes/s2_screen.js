// s2_screen — builder A. Inside the laptop screen at 2:47 a.m.: a GENERIC slide app (thin neutral chrome, no Office UI,
// no logos), a blank slide whose title placeholder «انقر لإضافة عنوان» waits with a caret blinking on the beat, the clock
// «٢:٤٧ ص», the group-chat bubble (lands first, stays), the reminder notification (drawn pin, drops with the ding), and the
// one big line «والتسليم… باجر؟». The camera keeps the dive's momentum (the UI grows out of the white), then drifts slowly
// closer; on «باجر؟» it punches in once. The cursor wanders to the title, hovers, flinches on «باجر؟», drifts off and stops.
// The UI stays up (still drifting) under s3 until the splash (f215) wipes it; the scene ends at f224.
//
// SHARED (for s3_splash; see REQUESTS.md): uiCam(t), uiTransform(t), applyUiCam(el, t), UI (geometry), chatBubble(...).
import * as K from '../kit.js';

// ---------------------------------------------------------------- geometry (UI-plane px = frame px at rest)
export const UI = {
  origin: [540, 700],                  // the camera's pivot on the plane
  perspective: 1500,
  slide: { x: 70, y: 556, w: 944, h: 531 },
  placeholder: { x: 155, y: 716, w: 774, h: 176 },
  notif: { x: 84, y: 362, w: 556, h: 128, z: 60 },
  chat: { right: 996, top: 1078, avatar: 70, gap: 16, z: 40, nextTop: 1206, maxMsgW: 800 },
  big: { y1: 1294, y2: 1472 },         // the two tiers of «والتسليم… باجر؟» (screen space; gone by f143)
  bubbleStyle: { bg: '#F4F5F7', radius: '34px 8px 34px 34px', font: '500 44px "IBM Plex Sans Arabic"', color: '#111317',
    shadow: '0 2px 6px rgba(0,0,0,.25), 0 20px 50px rgba(0,0,0,.5)', canvas: '#17191D' },
};
const F0 = 78, F_PUNCH = 117, F_END = 224;   // overwritten from cues at mount (same values)
let FR = { in: F0, punch: F_PUNCH, out: F_END, resolve: 8 };

/** the UI plane's camera at FILM time t (s): scale s, rotations rx/ry (deg), translation tx/ty (px) */
export function uiCam(t) {
  const f = t * 30, a = FR.in;
  const u = K.clamp((f - a) / (FR.out - a));
  const entry = K.lerp(0.9, 1, K.E.outExpo(K.clamp((f - a) / 18)));          // still moving forward out of the dive
  const drift = 1 + 0.025 * u;                                                 // slow creep closer: pressure
  const punch = 1 + 0.035 * K.E.outExpo(K.clamp((f - (FR.punch - 1)) / 5));   // «باجر؟»
  const w = K.E.inOutSine(u);
  return { s: entry * drift * punch, rx: K.lerp(5, 2, w), ry: K.lerp(-6, 2.5, w), tx: K.lerp(-14, 14, w), ty: K.lerp(18, -10, w) };
}
/** CSS transform for a 1080x1920 layer whose transform-origin is UI.origin (px) — the same plane as the app */
export function uiTransform(t) {
  const c = uiCam(t);
  return `translate3d(${c.tx.toFixed(2)}px, ${c.ty.toFixed(2)}px, 0) perspective(${UI.perspective}px) rotateX(${c.rx.toFixed(3)}deg) rotateY(${c.ry.toFixed(3)}deg) scale(${c.s.toFixed(5)})`;
}
/** put any element (a full-frame 1080x1920 layer) on the UI plane at film time t */
export function applyUiCam(el, t) {
  K.css(el, { transformOrigin: `${UI.origin[0]}px ${UI.origin[1]}px`, transformStyle: 'preserve-3d', transform: uiTransform(t) });
}

// ---------------------------------------------------------------- icons (drawn; no logos, no emoji)
const svg = (vb, body, attrs = '') => `<svg viewBox="${vb}" width="100%" height="100%" ${attrs} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const STROKE = 'fill="none" stroke="#5F646C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  undo: `<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>`,
  redo: `<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>`,
  text: `<path d="M5 6h14M12 6v13M9 19h6"/>`,
  shapes: `<circle cx="9" cy="9" r="5"/><rect x="11.5" y="11.5" width="8.5" height="8.5" rx="1.2"/>`,
  image: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.4"/>`,
  line: `<path d="M5 19L19 5"/>`,
  align: `<path d="M4 6h16M9 10h11M4 14h16M9 18h11"/>`,
  color: `<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="5" fill="#E9B949" stroke="none"/>`,
};
const PIN = svg('0 0 24 24', `<g transform="rotate(38 12 12)" fill="#fff"><rect x="8.2" y="2.2" width="7.6" height="3.2" rx="1.2"/>` +
  `<path d="M9.4 5.2h5.2l.9 6H8.5z"/><rect x="5.6" y="10.9" width="12.8" height="2.6" rx="1.3"/>` +
  `<path d="M11.25 13.4h1.5l-.35 8.2h-.8z"/></g>`);
const PERSON = c => `<circle cx="12" cy="9.6" r="4.1" fill="${c}"/><path d="M3.6 23a8.4 7.6 0 0 1 16.8 0z" fill="${c}"/>`;
const ARROW = svg('0 0 17 25', `<path d="M1.2 1.2v19.2l4.7-4.5 3.4 7.7 3.1-1.35-3.35-7.55h6.4z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`);
const IBEAM = svg('0 0 17 25', `<g stroke-linecap="round" fill="none"><path d="M5.2 2.4c1.6 0 3.3.6 3.3 2.2v15.8c0 1.6-1.7 2.2-3.3 2.2M11.8 2.4c-1.6 0-3.3.6-3.3 2.2M11.8 22.6c-1.6 0-3.3-.6-3.3-2.2" stroke="#fff" stroke-width="4"/>` +
  `<path d="M5.2 2.4c1.6 0 3.3.6 3.3 2.2v15.8c0 1.6-1.7 2.2-3.3 2.2M11.8 2.4c-1.6 0-3.3.6-3.3 2.2M11.8 22.6c-1.6 0-3.3-.6-3.3-2.2" stroke="#111" stroke-width="1.6"/></g>`);

function abs(parent, cls, x, y, styles = {}, text = null) {
  const e = K.el(parent, 'div', 's2-abs ' + cls, { left: x + 'px', top: y + 'px', ...styles }, text);
  return e;
}
function icon(parent, name, x, y, size = 32) {
  const e = K.el(parent, 'div', 's2-ico', { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px' });
  e.innerHTML = svg('0 0 24 24', ICONS[name], STROKE); return e;
}
/** RTL text placed by its right edge (x) and vertical centre (y); measured once */
function arText(parent, cls, text, xRight, yMid, safe = true) {
  const e = K.el(parent, 'div', 's2-abs s2-ar ' + cls, { left: '0px', top: '0px' }, text);
  e.dir = 'rtl'; if (safe) e.dataset.safe = '1';
  const w = e.offsetWidth, h = e.offsetHeight;
  K.css(e, { left: (xRight - w).toFixed(1) + 'px', top: (yMid - h / 2).toFixed(1) + 'px' });
  return { el: e, w, h, x: xRight - w, y: yMid - h / 2 };
}

/**
 * chatBubble(parent, ctx, opts) — a message bubble in the SAME style as the group-chat bubble (for s3's TASH bubble).
 *   opts: text (string) or node (your own content element), avatar: 'group' | 'tash' | null, right (px, the avatar's
 *   right edge, default UI.chat.right), top (px, default UI.chat.nextTop), size (font px, default 44).
 *   Returns { el, av, msg, width, height } — el is absolutely positioned; animate it yourself (transform-origin: top right).
 *   Loads s2_screen.css, so it also works when s3 is rendered alone (?scene=s3_splash).
 */
export async function chatBubble(parent, ctx, { text = null, node = null, avatar = 'group', right = UI.chat.right, top = UI.chat.nextTop, size = 44 } = {}) {
  await ctx.loadCSS(new URL('./s2_screen.css', import.meta.url));
  const el = K.el(parent, 'div', 's2-abs s2-bub', { left: '0px', top: top + 'px', transformOrigin: '100% 0%' });
  let av = null;
  if (avatar) {
    av = K.el(el, 'div', 'av');
    if (avatar === 'tash') {
      K.css(av, { background: '#0B0B0B', boxShadow: '0 0 0 2px #2F3238, 0 8px 20px rgba(0,0,0,.4)' });
      av.innerHTML = svg('0 0 66 66', [21, 33, 45].map(cx => `<circle cx="${66 - cx}" cy="33" r="4.6" fill="#C6FF00"/>`).join(''));
    } else av.innerHTML = svg('0 0 24 24', PERSON('#fff'));
  }
  const msg = K.el(el, 'div', 'msg', { fontSize: size + 'px' });
  msg.dir = 'rtl';
  if (node) msg.appendChild(node); else if (text != null) { msg.textContent = text; msg.dataset.safe = '1'; }
  const width = el.offsetWidth, height = el.offsetHeight;
  el.style.left = (right - width).toFixed(1) + 'px';
  return { el, av, msg, width, height };
}

// ---------------------------------------------------------------- the scene
export default {
  id: 's2_screen',
  async mount(root, ctx) {
    const s = this.s = {};
    await ctx.loadCSS(new URL('./s2_screen.css', import.meta.url));
    const ev = id => ctx.ev(id);
    FR = { in: ctx.scene.in, punch: ev('L2').words[1].land, out: ctx.scene.out, resolve: 8 };
    s.G = ctx.G;
    root.classList.add('s2-root'); s.root = root;

    // ---- the plane
    const W = s.world = K.el(root, 'div', 's2-world');
    const box = (cls, x, y, w, h, st = {}) => abs(W, cls, x, y, { width: w + 'px', height: h + 'px', ...st });
    box('s2-canvas', -310, -380, 1700, 2700);
    box('s2-thumbs', 1036, 498, 420, 1600);
    box('s2-status', -310, -306, 1700, 652);
    box('s2-title', -310, 346, 1700, 80);
    box('s2-tools', -310, 426, 1700, 72);
    // status bar: clock on the left (RTL end), wifi + a low battery on the right
    s.clock = arText(W, 's2-clock', ev('ui.clock').text, 232, 316);
    const wifi = K.el(W, 'div', 's2-ico', { left: '916px', top: '300px', width: '32px', height: '32px' });
    wifi.innerHTML = svg('0 0 24 24', `<path d="M2.5 9.2a14 14 0 0 1 19 0M5.6 12.6a9.4 9.4 0 0 1 12.8 0M8.8 16a4.8 4.8 0 0 1 6.4 0" fill="none" stroke="#E2E5EA" stroke-width="2.1" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.5" fill="#E2E5EA"/>`);
    const bat = K.el(W, 'div', 's2-ico', { left: '958px', top: '300px', width: '38px', height: '32px' });
    bat.innerHTML = svg('0 0 26 24', `<rect x="1.5" y="6.5" width="20" height="11" rx="3" fill="none" stroke="#E2E5EA" stroke-width="1.8"/><rect x="22.6" y="10" width="2" height="4" rx="1" fill="#E2E5EA"/><rect x="3.4" y="8.4" width="3.6" height="7.2" rx="1.2" fill="#FF5A5F"/>`);
    // title bar: app glyph + file name on the right (RTL start); avatar + share on the left
    const app = box('s2-appico', 950, 364, 44, 44);
    app.innerHTML = svg('0 0 24 24', `<rect x="4.5" y="6.5" width="15" height="11" rx="1.6" fill="#1C1E23"/><rect x="7.6" y="9.8" width="8.8" height="1.9" rx=".95" fill="#E9EBEF"/><rect x="7.6" y="13" width="5.4" height="1.5" rx=".75" fill="#8D939C"/>`);
    s.file = arText(W, 's2-file', ev('ui.file').text, 928, 386);
    const avt = box('s2-avatar', 108, 366, 40, 40); avt.innerHTML = svg('0 0 24 24', PERSON('#fff'));
    const sh = box('s2-share', 160, 366, 92, 40);
    sh.innerHTML = `<div style="position:absolute;left:31px;top:5px;width:30px;height:30px">${svg('0 0 24 24', '<circle cx="10" cy="9" r="3.4"/><path d="M4 19a6 5.4 0 0 1 12 0"/><path d="M18.5 7.5v6M15.5 10.5h6"/>', 'fill="none" stroke="#1C1E23" stroke-width="2" stroke-linecap="round"')}</div>`;
    // toolbar (right → left)
    const T = [['undo', 986], ['redo', 930], null, ['text', 836], ['shapes', 780], ['image', 724], ['line', 668], null, ['align', 576], ['color', 520]];
    let dx = 884;
    for (const it of T) {
      if (!it) { abs(W, '', dx, 444, { width: '2px', height: '36px', background: '#33363D' }); dx = 622; continue; }
      icon(W, it[0], it[1] - 16, 446, 32);
    }
    // the slide + its title placeholder (selected, empty), the caret on its RTL start edge
    const SL = UI.slide;
    box('s2-slide', SL.x, SL.y, SL.w, SL.h);
    const P = UI.placeholder;
    const ph = box('s2-ph', P.x, P.y, P.w, P.h);
    for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) {
      K.el(ph, 'i', null, { left: (hx * P.w - 8.5).toFixed(1) + 'px', top: (hy * P.h - 8.5).toFixed(1) + 'px' });
    }
    const phCx = P.x + P.w / 2, phCy = P.y + P.h / 2;
    s.ph = arText(W, 's2-phtext', ev('ui.placeholder').text, 0, phCy);
    K.css(s.ph.el, { left: (phCx - s.ph.w / 2).toFixed(1) + 'px' });
    s.ph.x = phCx - s.ph.w / 2;
    s.caret = abs(W, 's2-caret', s.ph.x + s.ph.w + 12, phCy - 35);

    // ---- floating layers (closer to the lens)
    const N = UI.notif;
    s.notif = abs(W, 's2-notif', N.x, N.y, { width: N.w + 'px', height: N.h + 'px' });
    const tile = K.el(s.notif, 'div', 's2-ntile'); tile.innerHTML = `<div style="position:absolute;left:12px;top:12px;width:42px;height:42px">${PIN}</div>`;
    s.nt = K.el(s.notif, 'div', 's2-abs s2-ar s2-ntitle', { right: '114px', top: '22px' }, ev('ui.notif_title').text);
    s.nb = K.el(s.notif, 'div', 's2-abs s2-ar s2-nbody', { right: '114px', top: '63px' }, ev('ui.notif').text);
    for (const e of [s.nt, s.nb]) { e.dir = 'rtl'; e.dataset.safe = '1'; }
    s.nPin = tile;

    s.bub = await chatBubble(W, ctx, { text: ev('ui.group_chat').text, avatar: 'group', top: UI.chat.top });
    s.cursor = abs(W, 's2-cursor', 0, 0); s.cursor.innerHTML = ARROW;
    s.ibeam = abs(W, 's2-cursor', 0, 0); s.ibeam.innerHTML = IBEAM;

    // ---- screen space: vignette, the big line
    s.vig = K.el(root, 'div', 's2-vig');
    const L2 = ev('L2');
    const big = (text, size, weight, y, lh) => {
      const e = K.el(root, 'div', 's2-big', { fontSize: size + 'px', fontWeight: String(weight), lineHeight: String(lh) });
      e.dir = 'rtl'; e.dataset.safe = '1'; K.el(e, 'span', null, {}, text);
      const w = e.offsetWidth, h = e.offsetHeight;
      K.css(e, { left: (540 - w / 2).toFixed(1) + 'px', top: (y - h / 2).toFixed(1) + 'px' });
      return { el: e, w, h };
    };
    s.b1 = { ...big(L2.words[0].text, 100, 700, UI.big.y1, 1.3), land: L2.words[0].land };
    s.b2 = { ...big(L2.words[1].text, 200, 900, UI.big.y2, 1.15), land: L2.words[1].land };
    s.bOut = L2.out;

    s.ev = { chat: ev('ui.group_chat'), notif: ev('ui.notif'), ui: ev('ui.file') };
    // cursor path (UI px, the arrow's tip): wander to the title, hover, flinch on «باجر؟», drift off, stop
    const p = FR.punch;
    s.path = [[84, 826, 1050], [97, 660, 848], [104, 632, 828], [111, 614, 834], [p - 1, 606, 831], [p + 2, 624, 814],
      [p + 11, 470, 852], [p + 21, 318, 1004], [p + 33, 286, 1044], [F_END + 10, 286, 1044]];
  },

  cursorAt(f) {
    const P = this.s.path;
    if (f <= P[0][0]) return [P[0][1], P[0][2]];
    let i = 0; while (i < P.length - 2 && f > P[i + 1][0]) i++;
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    const u = K.E.inOutSine(K.clamp((f - b[0]) / (c[0] - b[0])));
    const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
    return [cr(a[1], b[1], c[1], d[1]), cr(a[2], b[2], c[2], d[2])];
  },

  seek(tl, ctx) {
    const s = this.s, f = ctx.f, t = ctx.t;
    // camera
    applyUiCam(s.world, t);
    // resolve out of the dive's white like an exposure settling: the white slide holds, the dark UI comes down around it
    // (s1's last frame f77 is pure white; here the exposure comes down from ~6.4x on f78 to 1x by ~f85)
    const rk = K.clamp((f - (FR.in - 1)) / FR.resolve);
    const E = 1 + 8 * (1 - K.E.outCubic(rk));
    s.root.style.filter = E < 1.002 ? 'none' : `brightness(${E.toFixed(3)})`;
    // tension: the edges darken slowly
    s.vig.style.opacity = K.lerp(0.7, 1, K.smoothstep(FR.in, 215, f)).toFixed(3);

    // group chat: lands first
    const c = s.ev.chat, ck = K.clamp((f - c.in) / (c.land - c.in + 2));
    const cs = K.lerp(0.55, 1, K.E.outBack(ck, 1.4));
    K.css(s.bub.el, { opacity: K.clamp(ck * 2.5).toFixed(3), transform: `translate3d(0, ${((1 - K.E.outCubic(ck)) * 26).toFixed(2)}px, ${UI.chat.z}px) scale(${cs.toFixed(4)})` });

    // reminder: drops in from above the frame, lands on the ding (f85), a small settle; the pin wobbles once
    const n = s.ev.notif, nk = K.clamp((f - n.in) / (n.land - n.in));
    const ny = (1 - K.E.outBack(nk, 1.6)) * -84;                               // a short drop: its text never leaves the safe area
    const settle = f >= n.land ? Math.sin((f - n.land) * 1.9) * 5 * Math.exp(-(f - n.land) / 2.4) : 0;
    K.css(s.notif, { display: f >= n.in ? 'block' : 'none', opacity: K.clamp(nk * 2.2).toFixed(3),
      transform: `translate3d(0, ${(ny + settle).toFixed(2)}px, ${UI.notif.z}px) scale(${K.lerp(0.94, 1, K.E.outCubic(nk)).toFixed(4)})` });
    const wob = f >= n.land ? Math.sin((f - n.land) * 1.6) * 14 * Math.exp(-(f - n.land) / 4) : 0;
    s.nPin.style.transform = `rotate(${wob.toFixed(2)}deg)`;

    // caret: blinks on the beat (on for the first half of every beat), once the UI has resolved
    const kb = ctx.G.k(t), on = f >= FR.in + 5 && ((kb % 1) + 1) % 1 < 0.5;
    s.caret.style.opacity = on ? '1' : '0';

    // cursor
    const [cx, cy] = this.cursorAt(f);
    const P = UI.placeholder, inBox = cx > P.x && cx < P.x + P.w && cy > P.y && cy < P.y + P.h;
    const cOn = f >= 84;
    K.css(s.cursor, { display: cOn && !inBox ? 'block' : 'none', transform: `translate3d(${(cx - 2).toFixed(2)}px, ${(cy - 2).toFixed(2)}px, 20px)` });
    K.css(s.ibeam, { display: cOn && inBox ? 'block' : 'none', transform: `translate3d(${(cx - 17).toFixed(2)}px, ${(cy - 25).toFixed(2)}px, 20px)` });

    // the big line: «والتسليم…» rises in; «باجر؟» arrives from oversize on the punch; both leave fast as the TASH bubble lands
    const out = K.E.inCubic(K.clamp((f - (s.bOut - 4)) / 4));
    const showBig = (o, mode) => {
      const kk = K.clamp((f - (o.land - (mode === 'rise' ? 6 : 5))) / (mode === 'rise' ? 6 : 5));
      if (kk <= 0 || out >= 1) { o.el.style.display = 'none'; return; }
      o.el.style.display = 'block';
      let tr, blur;
      if (mode === 'rise') { const e = K.E.outCubic(kk); tr = `translateY(${((1 - e) * 54 - out * 60).toFixed(2)}px)`; blur = (1 - K.clamp(kk * 1.5)) * 9; }
      else { const e = K.E.outExpo(kk); tr = `translateY(${(-out * 60).toFixed(2)}px) scale(${K.lerp(1.7, 1, e).toFixed(4)})`; blur = (1 - K.clamp(kk * 1.4)) * 12; }
      blur += out * 10;
      K.css(o.el, { transform: tr, opacity: (K.clamp(kk * 2.2) * (1 - out)).toFixed(3), filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none' });
    };
    showBig(s.b1, 'rise'); showBig(s.b2, 'slam');
  },
};
