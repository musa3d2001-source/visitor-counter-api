// DOSE — layout (1080×1920 IG story). Everything that reads sits inside the story safe area: y 250–1620, x 64–1016.
// frame[seg]: z0→z1 = scale over the shot; fx, fy = the source point that stays put on screen (focus);
// anchor 'tr' = top-right anchored crop (A: keeps grinder 2's invented rating plate (source y ≥ 1745) out of frame
// and card 1 inside it to the end of the shot).
export const LY = {
  W: 1080, H: 1920,
  frame: {
    A: { z0: 1.12, z1: 1.15, anchor: 'tr' },
    B: { z0: 1.03, z1: 1.065, fx: 560, fy: 1000 },
    C: { z0: 1.03, z1: 1.05, fx: 600, fy: 900 },
    D: { z0: 1.035, z1: 1.075, fx: 560, fy: 1020 },
    E: { z0: 1.04, z1: 1.06, fx: 500, fy: 640 },
  },
  meter: { homeCy: 306, hookCy: 905, hookS: 1.85, peakCy: 1010, peakS: 1.55 },   // the mood widget: centre y + scale at home / in the hook / at the ١٠٠٪ peak
  chipTop: 378,                                         // the dose lines, under the widget
  hook: { l1Top: 556, l2Top: 1112, size: 118 },
  tagline: { top: 268, size: 64, endTop: 574 },          // «تعديل المزاج يبدأ من هنا.»: on the wall in d5, above the mark on the card
  card: { cx: 540, cy: 930, w: 600 },                    // end-card mark: centre and width (56 % of the frame; the plate filled 85 %)
  info: { top: 1178 },
  tag: { right: 64, bottom: 1612 },                      // the spec tag pill: bottom-right corner, above the reply bar
  slate: { top: 270 },
  sting: { cy: 0.47, logoW: 440, tag: 50 },
};
