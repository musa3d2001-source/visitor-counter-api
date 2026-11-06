// MOR — layout per delivery format. '916' = 1080×1920 reel; '45' = 1080×1350 feed re-layout (all type inside the frame).
// frame[seg].oy = source y at the top of the visible window at z = 1 (the 4:5 cut is a 1350-tall window on the 1920 source);
// shades[seg] = graduated falloffs that seat a line of type in shadow (y1 < y0 → darkening toward the top);
// text = the top of each line (px) and its size; hook / card = the keyhole's scale and placement.
export const LAYOUT = {
  '916': {
    H: 1920,
    hook: { s: 1.1, x: 552, y: 600 },
    card: { s: 0.74, cy: 900 },
    frame: { A: { oy: 0 }, B: { oy: 0, fx: 540, fy: 900 }, C: { oy: 0, fx: 560, fy: 1000, z0: 1.03, z1: 1.05 }, D: { oy: 0, fx: 520, fy: 900, z0: 1.04, z1: 1.08 },
      E: { oy: 0, fx: 540, fy: 900, z0: 1.05, z1: 1.09 }, F: { oy: 0, fx: 520, fy: 820, z0: 1.04, z1: 1.08 }, G: { oy: 0 } },
    shades: {
      A: [{ y0: 760, y1: 180, k: 0.42 }],
      B: [{ y0: 1120, y1: 1500, k: 0.28 }],
      C: [{ y0: 620, y1: 200, k: 0.5 }],
      G: [{ y0: 940, y1: 180, k: 0.36 }],
    },
    text: {
      t1: { top: 236, size: 96 },
      t2: { top: 1336, size: 104 },
      t3: { top: 236, size: 120 },
      t4: { top: 262, size: 112 },
      t5: { top: 258, size: 168 },
      info: { top: 1372 },
      slate: { top: 236 },
    },
    sting: { cy: 0.46, logoW: 440, tag: 50 },
  },
  '45': {
    H: 1350,
    hook: { s: 0.84, x: 552, y: 470 },
    card: { s: 0.56, cy: 610 },
    frame: { A: { oy: 130 }, B: { oy: 330, fx: 540, fy: 900 }, C: { oy: 140, oy1: 360, fx: 560, fy: 1000, z0: 1.03, z1: 1.05 }, D: { oy: 285, fx: 520, fy: 900, z0: 1.04, z1: 1.08 },
      E: { oy: 285, fx: 540, fy: 900, z0: 1.05, z1: 1.09 }, F: { oy: 180, fx: 520, fy: 820, z0: 1.04, z1: 1.08 }, G: { oy: 170 } },
    shades: {
      A: [{ y0: 520, y1: 60, k: 0.42 }],
      B: [{ y0: 880, y1: 1250, k: 0.36 }],
      C: [{ y0: 300, y1: 40, k: 0.5 }],
      G: [{ y0: 640, y1: 60, k: 0.36 }],
    },
    text: {
      t1: { top: 86, size: 100 },
      t2: { top: 1080, size: 112 },
      t3: { top: 70, size: 104 },
      t4: { top: 96, size: 100 },
      t5: { top: 78, size: 140 },
      info: { top: 1010 },
      slate: { top: 120 },
    },
    sting: { cy: 0.47, logoW: 380, tag: 44 },
  },
};
