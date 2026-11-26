// LEAD-OWNED helper for the placeholder scenes. A scene agent REPLACES its src/scenes/<id>.js entirely (it does not
// need this file). The stub shows: a coloured card, the scene id, its brief, a progress bar, and every text event of
// the scene animated with kit.kinetic at its cue frames (so the timeline can be checked before the real scene exists).
import * as K from '../kit.js';

export function textStack(root, ctx, { color = K.C.paper, y0 = 560, step = 124, skip = [] } = {}) {
  return ctx.events.filter(ev => !skip.includes(ev.id)).map((ev, i) => K.kinetic(root, ev, {
    y: y0 + (i % 8) * step, size: ev.size === 'big' ? 84 : ev.size === 'mid' ? 62 : 42, color,
    dir: ev.dir, font: ev.dir === 'ltr' ? 'mono' : 'display', weight: ev.size === 'small' ? 600 : 800,
    style: ev.kind === 'ui' ? 'type' : ev.kind === 'chip' || ev.kind === 'file_chip' || ev.kind === 'tag' ? 'pop' : 'punch',
    exit: 'fade', exitDur: 4,
    shadow: '0 4px 24px rgba(0,0,0,.45)',
  }));
}

export function makeStub(id, { bg = '#222', fg = K.C.paper } = {}) {
  return {
    id,
    mount(root, ctx) {
      const s = this.s = {};
      K.el(root, 'div', 'layer', { background: bg });
      s.title = K.el(root, 'div', null, { position: 'absolute', left: '64px', top: '262px', font: '700 34px "JetBrains Mono"', color: fg, direction: 'ltr', whiteSpace: 'nowrap' }, `${id} · STUB`);
      s.what = K.el(root, 'div', null, { position: 'absolute', left: '64px', width: '952px', top: '312px', font: '500 21px "JetBrains Mono"', color: fg, opacity: '.62', direction: 'ltr', lineHeight: '1.35' }, ctx.scene.what);
      s.clock = K.el(root, 'div', null, { position: 'absolute', left: '64px', top: '1540px', font: '600 26px "JetBrains Mono"', color: fg, direction: 'ltr', whiteSpace: 'pre' });
      s.bar = K.el(root, 'div', null, { position: 'absolute', left: '64px', top: '1600px', height: '12px', width: '0px', background: K.C.lime });
      s.texts = textStack(root, ctx, { color: fg });
    },
    seek(tl, ctx) {
      const s = this.s, n = ctx.scene.out - ctx.scene.in;
      s.bar.style.width = (952 * ctx.fl / Math.max(1, n - 1)).toFixed(1) + 'px';
      s.clock.textContent = `local ${tl.toFixed(3)} s  f ${ctx.fl}/${n}   film f ${ctx.f}  beat ${ctx.G.k(ctx.t).toFixed(2)}`;
      for (const k of s.texts) k.render(ctx.t);
    },
  };
}
