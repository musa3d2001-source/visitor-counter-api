// s1_hook — builder A. Live plate h1 (src/footage/h1, film frame k = plate frame k), graded; the three questions punch in
// on their grid frames; then a fast dive INTO the laptop screen (screen.json quad_s) that blooms to pure white on the
// scene's last frame (f77, the white match into s2_screen).
//
// Direction:
// · Frame 0 is the finished plate (no half-entered word). The type frames the student: «عندك / برزنتيشن؟» on the dark
//   wall above the laptop, «تقرير؟ بحث؟» on the dark hoodie below his head. Nothing ever covers the glowing screen or
//   the hands-on-head gesture.
// · The student's world has no lime: the hook is paper on night. Lime arrives with طشّ (s3).
// · The camera lunges a step closer on each question (a 4-frame punch, zoom about the screen centre), takes a 3-frame
//   breath back, then dives into the screen (log-space zoom, ease-in) with a shutter-style zoom blur (sub-frame
//   accumulation), a growing bloom from the panel and an exposure ramp to #FFFFFF. The words are in the camera group
//   for the dive only: they sit closer to the lens than the desk, so the push throws them radially past the camera
//   (with the same shutter trail) — "the push takes them".
// · Older questions step back to 78% as the next lands, so the eye follows the voice.
import * as K from '../kit.js';

const PAPER = '#F5F5E9';
const SHADOW = '0 3px 10px rgba(0,0,0,.55), 0 10px 44px rgba(0,0,0,.6)';

/** a whole word / whole line as one element (never split into letters); measured once at mount */
function word(parent, text, { size, cls = 'hero' }) {
  const box = K.el(parent, 'div', 's1-w ' + cls, { fontSize: size + 'px', textShadow: SHADOW });
  box.dir = 'rtl'; box.dataset.safe = '1';
  K.el(box, 'span', null, {}, text);
  return { el: box, w: box.offsetWidth, h: box.offsetHeight };
}
const place = (w, x, y, anchor = 'center') => {
  const left = anchor === 'center' ? x - w.w / 2 : anchor === 'right' ? x - w.w : x;
  w.x = left; w.y = y - w.h / 2; w.cx = left + w.w / 2; w.cy = y;
};

/** kit.drawCam onto a canvas of any size (the camera is defined for the 1080x1920 frame) */
function drawCamTo(ctx, im, { z = 1, cx, cy }, w, h) {
  const iw = im.naturalWidth, ih = im.naturalHeight, sc = Math.max(1080 / iw, 1920 / ih) * z;
  ctx.drawImage(im, cx - 540 / sc, cy - 960 / sc, 1080 / sc, 1920 / sc, 0, 0, w, h);
}

export default {
  id: 's1_hook',
  async mount(root, ctx) {
    const s = this.s = {};
    await ctx.loadCSS(new URL('./s1_hook.css', import.meta.url));
    const key = ctx.cues.key;
    s.F = { hook1: key.hook1, hook2: key.hook2, dive0: key.hook3, white: key.whiteout };   // 13, 42, 64, 77
    s.seq = K.frames(ctx.src + 'footage/h1/', 90);
    s.quads = (await K.json(ctx.src + 'footage/h1/screen.json')).frames.map(r => r.quad_s);
    await s.seq.get(0);

    s.cv = K.el(root, 'canvas', 's1-cv'); s.cv.width = 1080; s.cv.height = 1920;
    s.g = s.cv.getContext('2d', { alpha: false });
    // 'medium', not 'high': identical on this plate (mean diff 0.06/255 at z≈1.05) and ~2x faster in the renderer
    s.g.imageSmoothingEnabled = true; s.g.imageSmoothingQuality = 'medium';

    // grade layers, built once
    const g = s.g;
    s.nd = g.createLinearGradient(0, 0, 0, 1920);                 // graduated ND: darker wall/window and hoodie bands
    s.nd.addColorStop(0.00, 'rgb(120,124,132)'); s.nd.addColorStop(0.13, 'rgb(150,154,160)');
    s.nd.addColorStop(0.27, 'rgb(205,207,210)'); s.nd.addColorStop(0.34, 'rgb(255,255,255)');
    s.nd.addColorStop(0.62, 'rgb(255,255,255)'); s.nd.addColorStop(0.74, 'rgb(196,198,202)');
    s.nd.addColorStop(1.00, 'rgb(120,122,128)');
    s.vig = g.createRadialGradient(540, 860, 260, 540, 900, 1250);  // vignette centred on the desk
    s.vig.addColorStop(0, 'rgb(255,255,255)'); s.vig.addColorStop(0.55, 'rgb(236,238,242)'); s.vig.addColorStop(1, 'rgb(150,152,160)');
    // the screen's bloom sprite: a blurred white panel, rendered once
    s.bloom = document.createElement('canvas'); s.bloom.width = 640; s.bloom.height = 440;
    const b = s.bloom.getContext('2d');
    b.filter = 'blur(38px)'; b.fillStyle = 'rgb(214,228,255)'; b.fillRect(140, 120, 360, 200);
    b.filter = 'blur(14px)'; b.fillStyle = 'rgb(255,255,255)'; b.fillRect(170, 140, 300, 160);

    // the questions (text straight from the cue events)
    const L11 = ctx.ev('L1.1'), L12 = ctx.ev('L1.2'), L13 = ctx.ev('L1.3');
    s.layer = K.el(root, 'div', 's1-txt');
    const kick = word(s.layer, L11.words[0].text, { size: 66, cls: 'kick' });
    const hero = word(s.layer, L11.words[1].text, { size: 150 });
    const q2 = word(s.layer, L12.text, { size: 138 });
    const q3 = word(s.layer, L13.text, { size: 138 });
    // top lock-up: kicker right-aligned to the hero (RTL start), the hero centred
    place(hero, 540, 436); place(kick, hero.x + hero.w - 6, 312, 'right');
    // bottom row: «تقرير؟» then «بحث؟» (RTL: first on the right), centred as a row. Fix round: lifted 70 px (ink ends
    // ~y 1512, above the platform caption rows; higher would cover his hands) and its right edge <= 920 (clear of the
    // TikTok/Reels button column)
    const gap = 58, row = q2.w + gap + q3.w, x0 = Math.min(540 + row / 2, 920);
    place(q2, x0, 1428, 'right'); place(q3, x0 - q2.w - gap, 1428, 'right');
    const D = s.F.dive0;
    // (fix round) frame 0 already carries the hook: «عندك» + «برزنتيشن؟» are on, full size and sharp, from f0 (the type
    // leads the voice, which starts at 0.10 s); «بحث؟» lands ~0.2 s before its word (f59) and holds sharp to f73.
    // Exits: a staggered focus rack as the dive starts, in reading order (each word stays inside the safe area)
    s.ws = [
      { w: kick, land: -1, dur: 4, from: 0.86, rise: 26, out: [D, D + 5] },
      { w: hero, land: -1, dur: 4, from: 1.6, rise: 0, out: [D + 1, D + 7] },
      { w: q2, land: L12.land, dur: 4, from: 1.6, rise: 0, out: [D + 3, D + 9] },
      { w: q3, land: L13.land, dur: 4, from: 1.6, rise: 0, out: [D + 9, D + 13] },
    ];
    // exposure: a soft lift on the desk and hands for the first ~1.3 s (phone night brightness), then on his head and
    // shoulders while it drops (f50–77: the hair keeps its texture, a cool rim of the laptop's light on it)
    s.lc = document.createElement('canvas'); s.lc.width = 1080; s.lc.height = 1920; s.lg = s.lc.getContext('2d');
    s.lift = document.createElement('canvas'); s.lift.width = 256; s.lift.height = 256;
    const lg = s.lift.getContext('2d'), rg = lg.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    lg.fillStyle = rg; lg.fillRect(0, 0, 256, 256);
    for (const o of s.ws) K.css(o.w.el, { left: o.w.x.toFixed(1) + 'px', top: o.w.y.toFixed(1) + 'px' });
    // a half-res buffer for the shutter accumulation (fast camera only)
    s.half = document.createElement('canvas'); s.half.width = 540; s.half.height = 960;
    s.hg = s.half.getContext('2d', { alpha: false }); s.hg.imageSmoothingEnabled = true; s.hg.imageSmoothingQuality = 'medium';
    s.lastF = ctx.scene.out - ctx.scene.in - 1;                     // 77 (local = film here)
  },

  /** the radial sprite multiplied by a colour (a soft coloured light for 'screen' compositing) */
  tinted(src, col) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return c;
  },

  /** camera at film frame f (float): zoom z about the screen centre, slid toward the frame centre during the dive */
  cam(f, q) {
    const s = this.s, F = s.F;
    const fit = K.fitQuad(q, 1080, 1920);
    // creep + one punch step per question (lands with the word), a breath back, then the dive
    let z = 1 + 0.018 * K.clamp(f / F.dive0);
    z *= 1 + 0.05 * K.E.outCubic(K.clamp((f + 2) / 9));            // (fix round) the first lunge is already moving on f0
    for (const P of [F.hook1, F.hook2]) z *= 1 + 0.03 * K.E.outExpo(K.clamp((f - (P - 1)) / 5));
    z *= 1 - 0.016 * K.smoothstep(F.dive0 - 3, F.dive0, f);       // anticipation (3 f) before the dive
    const p = K.clamp((f - F.dive0) / (F.white - F.dive0));
    const e = p <= 0 ? 0 : (Math.exp(3.0 * p) - 1) / (Math.exp(3.0) - 1);   // accelerating
    const zEnd = fit.z * 1.45;
    z = Math.exp(K.lerp(Math.log(z), Math.log(zEnd), e));
    const S = [K.lerp(fit.cx, 540, e), K.lerp(fit.cy, 960, e)];    // where the screen centre sits in the frame
    return { z, cx: fit.cx - (S[0] - 540) / z, cy: fit.cy - (S[1] - 960) / z, e, p, S };
  },

  async seek(tl, ctx) {
    const s = this.s, F = s.F, g = s.g;
    const f = ctx.f;                                               // s1 starts at film frame 0
    const k = Math.min(89, f);
    const im = await s.seq.get(k);
    const q = s.quads[k];
    const c0 = this.cam(f, q);

    // ---- plate (+ shutter-style zoom blur while the camera moves fast: 180°, up to 20 sub-frames, half-res buffer)
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const GRADE = 'contrast(1.12) saturate(0.86) brightness(0.97)';
    const cPrev = this.cam(f - 0.5, q);
    const dz = Math.abs(Math.log(c0.z / cPrev.z)) + Math.hypot(c0.cx - cPrev.cx, c0.cy - cPrev.cy) / 400;
    const n = Math.max(1, Math.min(20, Math.ceil(dz * 90)));
    if (n <= 2) {
      g.filter = GRADE; K.drawCam(g, im, c0); g.filter = 'none';
    } else {
      const h = s.hg; h.globalAlpha = 1;
      for (let i = 0; i < n; i++) {
        const c = this.cam(f - 0.5 * i / (n - 1), q);
        h.globalAlpha = 1 / (i + 1);
        drawCamTo(h, im, c, 540, 960);
      }
      h.globalAlpha = 1;
      g.filter = GRADE; g.drawImage(s.half, 0, 0, 1080, 1920); g.filter = 'none';
    }
    g.globalAlpha = 1;

    // ---- grade: teal-lifted blacks, graduated ND for the type bands, vignette (all fade out as we enter the screen)
    const inside = K.smoothstep(0.35, 0.9, c0.e);
    g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgb(7,15,21)'; g.fillRect(0, 0, 1080, 1920);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1 - inside;
    g.fillStyle = s.nd; g.fillRect(0, 0, 1080, 1920);
    g.fillStyle = s.vig; g.fillRect(0, 0, 1080, 1920);
    g.globalAlpha = 1;

    // ---- (fix round) exposure lift: desk + hands f0–40 (x1.32 ≈ +0.4 stop through a soft mask), then the head and
    // shoulders f46–77 (≈ +12 IRE in the blacks) with a cool rim of the laptop's light on the hair
    const L1 = 1 - K.smoothstep(40, 52, f), L2 = K.smoothstep(42, 54, f) * (1 - inside);
    const P2F = (px, py) => K.plateToFrame([px, py], { ...c0, iw: 1080, ih: 1920 });
    if (L1 > 0) {                                                  // a true exposure lift (x1.32) through a soft mask
      const h = s.lg, [x, y] = P2F(520, 1150), rx = 760 * c0.z, ry = 640 * c0.z;
      h.globalCompositeOperation = 'source-over'; h.clearRect(0, 0, 1080, 1920);
      h.filter = 'brightness(1.32)'; h.drawImage(s.cv, 0, 0); h.filter = 'none';
      h.globalCompositeOperation = 'destination-in'; h.drawImage(s.lift, x - rx, y - ry, 2 * rx, 2 * ry);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = L1; g.drawImage(s.lc, 0, 0); g.globalAlpha = 1;
    }
    if (L2 > 0) {                                                  // the head: blacks up ~+12 IRE, a cool rim on the hair
      g.save(); g.globalCompositeOperation = 'screen';
      const [x, y] = P2F(540, 1330), r = 430 * c0.z;
      g.globalAlpha = 0.13 * L2; g.drawImage(s.tint2 || (s.tint2 = this.tinted(s.lift, 'rgb(255,255,255)')), x - r * 1.25, y - r, 2.5 * r, 2 * r);
      const [rx, ry] = P2F(560, 1110), rr = 300 * c0.z;
      g.globalAlpha = 0.32 * L2; g.drawImage(s.tint3 || (s.tint3 = this.tinted(s.lift, 'rgb(70,104,170)')), rx - rr * 1.5, ry - rr * 0.6, 3 * rr, 1.2 * rr);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    // ---- bloom from the panel: a faint halo, growing as we dive
    const qf = q.map(P => K.plateToFrame(P, { ...c0, iw: 1080, ih: 1920 }));
    const xs = qf.map(P => P[0]), ys = qf.map(P => P[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const bw = (bx1 - bx0) * 640 / 360, bh = (by1 - by0) * 440 / 200;
    const bA = 0.10 + 0.55 * K.smoothstep(0.0, 0.8, c0.e);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = bA;
    g.drawImage(s.bloom, (bx0 + bx1) / 2 - bw / 2, (by0 + by1) / 2 - bh / 2, bw, bh);
    // exposure: the whole frame burns up to pure white on the last frame
    const ex = K.E.inQuad(K.smoothstep(0.62, 1, c0.p));
    if (ex > 0) { g.globalAlpha = Math.min(1, ex); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 1080, 1920); }
    if (f >= s.lastF) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 1080, 1920); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    // ---- the questions: land on their grid frames, step back as the next lands, rack out of focus as the dive starts
    const V = c0.S;                                                // the screen centre in the frame (vanishing point)
    s.layer.style.display = f >= s.lastF ? 'none' : 'block';
    s.ws.forEach((o, i) => {
      const kk = K.clamp((f - (o.land - o.dur)) / o.dur);
      const ko = K.E.inQuad(K.clamp((f - o.out[0]) / (o.out[1] - o.out[0])));
      if (kk <= 0 || ko >= 1) { o.w.el.style.display = 'none'; return; }
      o.w.el.style.display = 'block';
      const ke = K.E.outExpo(kk);
      const m = 1 + 0.06 * ko;                                     // pushed a touch toward the lens, radially from V
      const dx = (o.w.cx - V[0]) * (m - 1), dy = (o.w.cy - V[1]) * (m - 1);
      const sc = K.lerp(o.from, 1, ke) * (1 + 0.012 * K.clamp((f - o.land) / 60)) * m;   // living hold: slow creep
      const ty = (1 - K.E.outCubic(kk)) * o.rise + dy;
      const blur = (kk < 1 ? (1 - K.clamp(kk * 1.4)) * 12 : 0) + 18 * ko;
      const nxt = s.ws[i === 0 ? 2 : i + 1];                       // step back when the next question lands
      const back = nxt ? 0.22 * K.smoothstep(nxt.land - 3, nxt.land + 2, f) : 0;
      K.css(o.w.el, {
        transform: `translate(${dx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sc.toFixed(4)})`,
        opacity: (K.clamp(kk * 2.2) * (1 - back) * (1 - ko)).toFixed(3),
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none',
      });
    });
  },
};
