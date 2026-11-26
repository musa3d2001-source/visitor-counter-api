// s6_payoff — STARTER by the lead: the lecture-hall plate with a slide comped on the projection screen BEHIND the
// presenter's hand, and a slow single-plane push-in; the type is the stub stack. The scene agent replaces this file.
// Assets (src/footage/h2/screen.json): plate.jpg (1512x2688, 9:16, 1.4x the frame), screen.quad_draw (plate px; the
// slide goes there), fg.png (her forearm/hand/clicker, decontaminated RGBA, drawn at fg.box). Order: plate → slide →
// fg. The camera is a pure scale + translate, so every layer uses the same mapping (kit.plateToFrame).
import * as K from '../kit.js';
import { textStack } from './_stub.js';

const SLIDE = '../samples/deck-uni-01-title.png';   // stand-in: the real scene uses card 1's slide

export default {
  id: 's6_payoff',
  async mount(root, ctx) {
    const s = this.s = {};
    const J = s.J = await K.json(ctx.src + 'footage/h2/screen.json');
    const mk = (src, z) => { const i = K.el(root, 'img', null, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', zIndex: String(z) }); i.src = new URL(src, ctx.src).href; return i; };
    s.plate = mk('footage/h2/plate.jpg', 1); s.slide = mk(SLIDE, 2); s.fg = mk('footage/h2/fg.png', 3);
    await Promise.all([K.img(s.plate.src), K.img(s.slide.src), K.img(s.fg.src)]);
    s.sw = s.slide.naturalWidth; s.sh = s.slide.naturalHeight;
    const q = J.screen.quad;
    s.c0 = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[3][1]) / 2 + 180];     // look a little below the screen centre
    const layer = K.el(root, 'div', 'layer', { zIndex: '4' });
    s.texts = textStack(layer, ctx, { y0: 1180, step: 150 });
  },
  seek(tl, ctx) {
    const s = this.s, J = s.J, [iw, ih] = J.plate.size;
    const n = (ctx.scene.out - ctx.scene.in) / ctx.fps;
    const z = K.lerp(1.0, 1.085, K.E.inOutSine(K.clamp(tl / n)));
    const cam = { z, cx: s.c0[0], cy: s.c0[1], iw, ih };
    const sc = Math.max(1080 / iw, 1920 / ih) * z;
    const [px, py] = K.plateToFrame([0, 0], cam);
    s.plate.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) scale(${sc.toFixed(5)})`;
    const qf = J.screen.quad_draw.map(p => K.plateToFrame(p, cam));
    s.slide.style.transform = K.quadTransform(s.sw, s.sh, qf);
    const [fx, fy] = K.plateToFrame([J.fg.box[0], J.fg.box[1]], cam);
    s.fg.style.transform = `translate(${fx.toFixed(2)}px, ${fy.toFixed(2)}px) scale(${sc.toFixed(5)})`;
    for (const t of s.texts) t.render(ctx.t);
  },
};
