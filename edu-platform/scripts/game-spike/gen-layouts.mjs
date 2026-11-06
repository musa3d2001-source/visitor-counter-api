// [تجربة المرحلة 0 - كود مؤقت] يولّد 8 تصاميم تمثيلية (JSON) بأعداد صحيحة بالسنتيمتر.
// التشغيل: node scripts/game-spike/gen-layouts.mjs
// المخرجات: src/app/admin/game/spike/_engine/layouts/<key>.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../src/app/admin/game/spike/_engine/layouts");
mkdirSync(outDir, { recursive: true });

const LAUNCHER = { x: 2600, y: 250 };

function builder() {
  const bodies = [];
  const lanterns = [];
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const api = {
    bodies,
    lanterns,
    box(mat, x, y, w, h, o = {}) {
      bodies.push({ id: id(mat[0]), shape: "box", material: mat, x, y, w, h, rot: o.rot ?? 0, fixed: o.fixed ?? false });
    },
    ball(mat, x, y, r, o = {}) {
      bodies.push({ id: id(mat[0]), shape: "ball", material: mat, x, y, r, rot: 0, fixed: o.fixed ?? false });
    },
    lantern(x, y, r = 20) {
      lanterns.push({ id: `L${lanterns.length + 1}`, x, y, r });
    },
    /** طابق: عمودان ثم لوح فوقهما؛ يعيد ارتفاع سطح اللوح */
    story(cx, baseY, span, o = {}) {
      const pw = o.pw ?? 20;
      const ph = o.ph ?? 100;
      const th = o.th ?? 20;
      const pm = o.pillar ?? "teak";
      const tm = o.top ?? "teak";
      api.box(pm, cx - span / 2, baseY + ph / 2, pw, ph);
      api.box(pm, cx + span / 2, baseY + ph / 2, pw, ph);
      api.box(tm, cx, baseY + ph + th / 2, span + pw + (o.overhang ?? 20), th);
      return baseY + ph + th;
    },
  };
  return api;
}

function level(key, title, tier, slots, par, streakReward, build) {
  const b = builder();
  build(b);
  const dynamic = b.bodies.filter((x) => !x.fixed).length + b.lanterns.length;
  return { version: 1, key, title, tier, slots, par, streakReward, launcher: LAUNCHER, bodies: b.bodies, lanterns: b.lanterns, _dynamic: dynamic };
}

const levels = [
  level("t1-first-tower", "البرج الأول", 1, 3, 2, "comet", (b) => {
    let top = b.story(1400, 0, 120, { ph: 100 });
    b.lantern(1400, top + 20);
    top = b.story(1400, top, 120, { ph: 80, top: "frond" });
  }),
  level("t1-glass-window", "نافذة الزجاج", 1, 3, 2, "comet", (b) => {
    b.box("stone", 1300, 30, 200, 60, { fixed: true });
    b.box("glass", 1215, 60 + 60, 16, 120);
    b.box("glass", 1385, 60 + 60, 16, 120);
    b.box("glass", 1300, 180 + 8, 200, 16);
    b.lantern(1300, 80);
    let top = b.story(950, 0, 120, { ph: 140, top: "glass" });
    b.box("frond", 950, top + 20, 40, 40);
  }),
  level("t2-teak-scaffold", "سقالة الساج", 2, 4, 3, "heavy", (b) => {
    for (const cx of [900, 1500]) {
      let top = b.story(cx, 0, 160, { ph: 90 });
      top = b.story(cx, top, 160, { ph: 90 });
      b.lantern(cx, top + 20);
      top = b.story(cx, top, 160, { ph: 90, top: "frond" });
      b.box("frond", cx - 50, top + 15, 30, 30);
      b.box("frond", cx + 50, top + 15, 30, 30);
    }
    b.box("teak", 1200, 15, 120, 30);
  }),
  level("t2-cloud-bounce", "ارتداد الغيم", 2, 4, 3, "pulse", (b) => {
    b.box("stone", 1750, 200, 40, 400, { fixed: true });
    b.box("cloud", 1350, 720, 360, 40, { fixed: true, rot: -12 });
    let top = b.story(1150, 0, 140, { ph: 100 });
    b.lantern(1150, top + 20);
    top = b.story(1150, top, 140, { ph: 100 });
    b.lantern(1150, top + 20);
    top = b.story(1150, top, 140, { ph: 60, top: "frond" });
    b.box("glass", 900, 60, 16, 120);
    b.box("glass", 1400, 60, 16, 120);
  }),
  level("t3-stone-keep", "حصن الحجر البحري", 3, 5, 3, "heavy", (b) => {
    for (const cx of [1080, 1420]) for (let k = 0; k < 3; k++) b.box("stone", cx, 30 + k * 60, 60, 60);
    b.box("teak", 1250, 180 + 12, 420, 24);
    b.box("glass", 1170, 204 + 50, 16, 100);
    b.box("glass", 1330, 204 + 50, 16, 100);
    b.box("glass", 1250, 304 + 8, 180, 16);
    b.lantern(1250, 204 + 20);
    b.lantern(1250, 20);
    for (let row = 0; row < 4; row++) for (const x of [1760, 1800, 1840]) b.box("stone", x, 20 + row * 40, 40, 40);
    for (const cx of [1100, 1400]) b.box("stone", cx, 204 + 20, 40, 40);
    let top = b.story(700, 0, 140, { ph: 120 });
    b.box("lightbox", 700, top + 25, 50, 50);
    for (const x of [625, 657, 743, 775]) b.box("frond", x, top + 15, 30, 30);
  }),
  level("t3-lightbox-chain", "سلسلة صناديق الضوء", 3, 4, 2, "pulse", (b) => {
    for (const cx of [900, 1200, 1500]) {
      let top = b.story(cx, 0, 140, { ph: 90 });
      b.box("lightbox", cx, top + 25, 50, 50);
      b.box("frond", cx - 45, top + 20, 20, 40);
      b.box("frond", cx + 45, top + 20, 20, 40);
      top = b.story(cx, top, 140, { ph: 70, top: "glass" });
      b.lantern(cx, top + 20);
      b.box("frond", cx - 60, top + 20, 20, 40);
      b.box("frond", cx + 60, top + 20, 20, 40);
      top += 40;
      b.box("teak", cx, top + 8, 160, 16);
    }
    for (let k = 0; k < 6; k++) b.box("frond", 1750 + (k % 2) * 30, 20 + Math.floor(k / 2) * 40, 30, 40);
    b.box("glass", 1050, 60, 16, 120);
    b.box("glass", 1350, 60, 16, 120);
  }),
  level("t4-domino-row", "صف الدومينو", 4, 5, 3, "comet", (b) => {
    for (let k = 0; k < 16; k++) b.box("teak", 1900 - k * 70, 65, 16, 130);
    let top = b.story(500, 0, 120, { ph: 110 });
    b.lantern(500, top + 20);
    top = b.story(500, top, 120, { ph: 80, top: "glass" });
    b.box("lightbox", 500, top + 25, 50, 50);
    top = b.story(250, 0, 120, { ph: 150 });
    b.lantern(250, top + 20);
    b.box("frond", 200, top + 20, 20, 40);
    b.box("frond", 300, top + 20, 20, 40);
    b.box("stone", 1300, 400, 300, 30, { fixed: true });
    b.box("glass", 1220, 415 + 40, 14, 80);
    b.box("glass", 1380, 415 + 40, 14, 80);
    b.box("glass", 1300, 495 + 7, 180, 14);
    b.lantern(1300, 415 + 20);
    for (let k = 0; k < 4; k++) b.box("frond", 1240 + k * 40, 509 + 14, 28, 28);
    for (let k = 0; k < 6; k++) b.box("frond", 2050 + (k % 3) * 34, 20 + Math.floor(k / 3) * 40, 30, 40);
  }),
  level("t4-grand-observatory", "المرصد الكبير", 4, 6, 4, "pulse", (b) => {
    // أربعة أبراج متدرجة بمواد مختلفة وثلاثة صناديق ضوء وأربعة قناديل
    const towers = [
      { cx: 450, mats: ["stone", "teak", "glass"] },
      { cx: 800, mats: ["teak", "teak", "frond"] },
      { cx: 1150, mats: ["teak", "glass", "teak"] },
      { cx: 1500, mats: ["stone", "teak", "frond"] },
    ];
    towers.forEach((t, ti) => {
      let top = 0;
      t.mats.forEach((m, si) => {
        const pillar = m === "glass" ? "teak" : m;
        top = b.story(t.cx, top, 150, { ph: 80, pillar, top: m === "stone" ? "teak" : m });
        if (si === 0) {
          b.box("frond", t.cx - 35, top + 20, 20, 40);
          b.box("frond", t.cx + 35, top + 20, 20, 40);
        }
        if (si === 1) {
          if (ti % 2 === 0) b.box("lightbox", t.cx, top + 25, 50, 50);
          else b.lantern(t.cx, top + 20);
        }
      });
      if (ti % 2 === 0) b.lantern(t.cx, top + 20);
      else {
        b.box("frond", t.cx - 40, top + 15, 30, 30);
        b.box("frond", t.cx + 40, top + 15, 30, 30);
      }
    });
    for (let k = 0; k < 12; k++) b.box("frond", 1800 + (k % 3) * 32, 20 + Math.floor(k / 3) * 40, 30, 40);
    for (const x of [625, 975, 1325]) b.box("glass", x, 40, 14, 80);
    for (let row = 0; row < 5; row++) for (let k = 0; k <= 4 - row; k++) b.box("frond", 2000 + row * 16 + k * 32, 15 + row * 30, 30, 30);
    for (let k = 0; k < 6; k++) b.box("teak", 150 + (k % 3) * 30, 15 + Math.floor(k / 3) * 30, 30, 30);
    b.box("cloud", 1000, 900, 300, 40, { fixed: true, rot: 10 });
  }),
];

for (const l of levels) {
  const { _dynamic, ...data } = l;
  writeFileSync(join(outDir, `${l.key}.json`), JSON.stringify(data, null, 1) + "\n");
  console.log(l.key, "bodies", l.bodies.length, "dynamic(incl. lanterns)", _dynamic, "lanterns", l.lanterns.length);
}
