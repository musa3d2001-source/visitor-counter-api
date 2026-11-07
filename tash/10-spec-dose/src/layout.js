// DOSE — layout (1080×1920 IG story). Everything that reads sits inside the story safe area: y 250–1620, x 64–1016.
// frame[seg]: z0→z1 = scale over the shot; fx, fy = the source point that stays put on screen (focus);
// anchor 'tr' = top-right anchored crop (A: keeps grinder 2's invented rating plate (source y ≥ 1745) out of frame
// and card 1 inside it to the end of the shot).
export const LY = {
  W: 1080, H: 1920,
  frame: {
    H: { z0: 1.0, z1: 1.1, fx: 560, fy: 760 },          // the hook pour: a slow push-in under the type
    A: { z0: 1.12, z1: 1.15, anchor: 'tr', push: { at: 3.30, z: 1.30 } },   // v3: push in on card 3 as COLOMBIA prints
    B: { z0: 1.03, z1: 1.065, fx: 560, fy: 1000 },
    C: { z0: 1.03, z1: 1.05, fx: 600, fy: 900 },
    D: { z0: 1.035, z1: 1.075, fx: 560, fy: 1020 },
    E: { z0: 1.04, z1: 1.06, fx: 500, fy: 640 },
  },
  hookBlur: 3,                                          // hook defocus: 2^3 = 8x
  meter: { hookCy: 905, hookS: 1.85, peakCy: 1010, peakS: 1.55 },   // the mood widget: centre y + scale in the hook / at the ١٠٠٪ peak
  // v2: the widget + dose chip are a LEFT-aligned stack at 0.8x through the montage, re-placed on each cut so they
  // never sit on the money moment (owner rule; CD v1: the stack covered the carafe spout, the ice over the lip and
  // the espresso pitcher). left = the stack's left edge, cy = the widget's centre, the chip hangs under it.
  // S1 top-left over the wall; S2 mid-left over the dark forearm (the carafe owns the top-left, the stream runs at
  // x >= 540); S3 top-left over the grey backdrop (the pitcher is at x >= 495); S4 top-left over the wall (the
  // sauce ribbon falls at x ~ 540).
  // v3: A/C/D moved down 30 px (the widget's top was 12 px under the 250 safe line, right under the IG header)
  stack: { s: 0.8, left: 64, gap: 12, at: { A: 330, B: 740, C: 330, D: 330 }, originStep: 94 },   // originStep: the S1 origin chips STACK (v3), 94 px apart
  hook: { l1Top: 556, l2Top: 1112, size: 118 },
  // «تعديل المزاج يبدأ من هنا.»: on the wall in d5, then above the mark on the card. v3: it RIDES THE WALL (its box top
  // = the wall sign's top − above, so it drifts down with the crane and keeps a 12 px gap over «specialty»); that puts
  // its ink at y ≈ 262 when it lands (11.70; v2: 251 at 256, 1 px inside the safe line) and ≥ 290 from ≈ 12.1 s on. On the
  // wall it sits 40 px right of centre (wallL/wallR) so «هنا.» clears the tree's leaf tips at x ≈ 130-147; it eases back
  // to centre (64/64) during the settle into the lockup. top = the box top used before the wall track exists (poster)
  tagline: { top: 296, size: 64, endTop: 574, wallL: 104, wallR: 24, above: 97, rise: 24 },
  card: { cx: 540, cy: 930, w: 600 },                    // end-card mark: centre and width (56 % of the frame; the plate filled 85 %)
  info: { top: 1178 },
  tag: { right: 64, bottom: 1590 },                      // the spec tag pill: bottom-right corner, above the reply bar (v3: 1612 → 1590, 30 px clear of the 1620 line)
  slate: { top: 1300 },                                 // v2: under the TASH lockup, where the eye is (was 270, under the IG header)
  sting: { cy: 0.47, logoW: 440, tag: 50 },
};
