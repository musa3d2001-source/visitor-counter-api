/**
 * نموذج المرحلة 0: مواد وتصاميم أولية لقياس الحتمية والأداء (ليست المستويات النهائية).
 * الإحداثيات بالسنتيمتر أعدادًا صحيحة؛ الأرض y = 0، والمرقاب يمينًا عند x = 3400 ويطلق يسارًا.
 */
export type MaterialKey = "frond" | "teak" | "stone" | "glass" | "cloud" | "lightbox" | "lantern";
export type AmmoKey = "meteor" | "pebble" | "heavy" | "comet" | "pulse";

export type Material = {
  label: string;
  density: number;
  friction: number;
  restitution: number;
  /** قوة الكسر بالنيوتن (Infinity = لا ينكسر إلا بالنيزك الثقيل إن كان stoneLike) */
  breakForce: number;
  heavyOnly?: boolean;
  /** صندوق الضوء: نصف قطر النبضة (م) وشدتها */
  pulse?: { radius: number; impulse: number };
};

export const MATERIALS: Record<MaterialKey, Material> = {
  frond: { label: "سعف", density: 0.45, friction: 0.7, restitution: 0.05, breakForce: 260 },
  teak: { label: "خشب ساج", density: 0.9, friction: 0.7, restitution: 0.05, breakForce: 900 },
  stone: { label: "حجر بحري", density: 2.4, friction: 0.85, restitution: 0.02, breakForce: 1600, heavyOnly: true },
  glass: { label: "زجاج ملوّن", density: 1.1, friction: 0.35, restitution: 0.1, breakForce: 140 },
  cloud: { label: "غيم", density: 0.35, friction: 0.2, restitution: 0.95, breakForce: Infinity },
  lightbox: { label: "صندوق ضوء", density: 0.8, friction: 0.6, restitution: 0.05, breakForce: 220, pulse: { radius: 3, impulse: 9 } },
  lantern: { label: "قنديل", density: 0.5, friction: 0.5, restitution: 0.2, breakForce: Infinity },
};

export type Ammo = { radius: number; density: number; speedScale: number };
export const AMMO: Record<AmmoKey, Ammo> = {
  meteor: { radius: 0.34, density: 3, speedScale: 1 },
  pebble: { radius: 0.2, density: 1.6, speedScale: 0.85 },
  heavy: { radius: 0.44, density: 7, speedScale: 0.92 },
  comet: { radius: 0.28, density: 3, speedScale: 1 },
  pulse: { radius: 0.32, density: 2.5, speedScale: 1 },
};

export type LayoutBody = { s: "box" | "ball"; m: MaterialKey; x: number; y: number; w: number; h: number };
export type SpikeShot = { ammo: AmmoKey; angleStep: number; powerStep: number; activateAt: number };
export type SpikeLayout = { key: string; title: string; version: number; tier: number; slots: number; par: number; bodies: LayoutBody[]; shots: SpikeShot[] };

/* ── مساعدات بناء (تُنتج بيانات JSON عادية) ── */
const box = (m: MaterialKey, x: number, bottom: number, w: number, h: number): LayoutBody => ({ s: "box", m, x, y: bottom + h / 2, w, h });
const lantern = (x: number, bottom: number): LayoutBody => ({ s: "ball", m: "lantern", x, y: bottom + 30, w: 60, h: 60 });
/** عمودان وسقف: يعيد الأجسام وارتفاع السطح */
function frame(m: MaterialKey, roof: MaterialKey, x: number, bottom: number, span: number, h = 140): [LayoutBody[], number] {
  const pw = 30;
  const rh = 24;
  return [[box(m, x - span / 2, bottom, pw, h), box(m, x + span / 2, bottom, pw, h), box(roof, x, bottom + h, span + pw + 20, rh)], bottom + h + rh];
}

function L(key: string, title: string, tier: number, slots: number, par: number, bodies: LayoutBody[], shots: SpikeShot[]): SpikeLayout {
  return { key, title, version: 1, tier, slots, par, bodies, shots };
}
const shot = (ammo: AmmoKey, angleStep: number, powerStep: number, activateAt = -1): SpikeShot => ({ ammo, angleStep, powerStep, activateAt });

function firstLight() {
  const [f, top] = frame("teak", "frond", 1300, 0, 120);
  return L("first-light", "أول ضوء", 1, 4, 2, [...f, lantern(1300, top)], [shot("meteor", 22, 18), shot("meteor", 14, 24), shot("pebble", 20, 22)]);
}
function frondWall() {
  const b: LayoutBody[] = [];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) b.push(box("frond", 1500 + c * 62, r * 60, 60, 60));
  b.push(lantern(1200, 0), lantern(1300, 0));
  return L("frond-wall", "سور السعف", 1, 5, 3, b, [shot("meteor", 10, 26), shot("meteor", 18, 22), shot("pebble", 6, 30), shot("meteor", 26, 18)]);
}
function glassTower() {
  const b: LayoutBody[] = [];
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const [f, top] = frame("glass", "teak", 1200, y, 110, 110);
    b.push(...f);
    if (i % 2 === 1) b.push(lantern(1200, y));
    y = top;
  }
  b.push(lantern(1200, y));
  return L("glass-tower", "برج الزجاج", 2, 5, 3, b, [shot("meteor", 24, 20), shot("meteor", 30, 21), shot("comet", 20, 22, 40), shot("pebble", 16, 23)]);
}
function stoneArch() {
  const b: LayoutBody[] = [box("stone", 1050, 0, 50, 160), box("stone", 1350, 0, 50, 160), box("stone", 1200, 160, 400, 50)];
  b.push(box("teak", 1200, 210, 40, 120), lantern(1200, 0), lantern(1200, 330));
  return L("stone-arch", "قوس الحجر", 2, 5, 3, b, [shot("meteor", 20, 21), shot("heavy", 16, 24), shot("meteor", 28, 20), shot("pebble", 12, 26)]);
}
function cloudBounce() {
  const b: LayoutBody[] = [box("teak", 900, 0, 30, 320), box("teak", 1100, 0, 30, 320), box("teak", 1000, 320, 260, 24)];
  b.push(lantern(960, 344), lantern(1040, 344), box("cloud", 2000, 0, 300, 50));
  b.push(box("frond", 2000, 50, 40, 40));
  return L("cloud-bounce", "غيمة مرتدة", 3, 5, 3, b, [shot("meteor", 34, 22), shot("meteor", 40, 20), shot("pulse", 30, 21, 45), shot("meteor", 18, 24)]);
}
function lightboxHeart() {
  const b: LayoutBody[] = [];
  const [f1, t1] = frame("teak", "teak", 1150, 0, 220, 130);
  b.push(...f1, box("lightbox", 1150, 0, 70, 70), lantern(1070, 0), lantern(1230, 0));
  const [f2, t2] = frame("frond", "glass", 1150, t1, 150, 110);
  b.push(...f2, lantern(1150, t1), lantern(1150, t2));
  return L("lightbox-heart", "قلب الضوء", 3, 5, 2, b, [shot("meteor", 18, 22), shot("meteor", 26, 21), shot("heavy", 20, 23), shot("pebble", 22, 22)]);
}
function twinTowers() {
  const b: LayoutBody[] = [];
  for (const x of [900, 1500]) {
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const [f, top] = frame(i === 0 ? "stone" : "teak", i === 2 ? "glass" : "frond", x, y, 100, 120);
      b.push(...f);
      y = top;
    }
    b.push(lantern(x, y));
  }
  b.push(box("frond", 1200, 432, 520, 20));
  return L("twin-beacons", "منارتان", 4, 6, 4, b, [shot("meteor", 30, 23), shot("comet", 26, 24, 35), shot("heavy", 22, 25), shot("meteor", 34, 22), shot("pebble", 24, 25)]);
}
function pyramid() {
  const b: LayoutBody[] = [];
  const mats: MaterialKey[] = ["stone", "teak", "frond", "glass", "lightbox"];
  for (let r = 0; r < 5; r++) {
    const n = 6 - r;
    for (let c = 0; c < n; c++) b.push(box(mats[r], 1000 + (c - (n - 1) / 2) * 72 + (r % 2) * 0, r * 64, 70, 64));
  }
  b.push(lantern(1000, 320), lantern(760, 0), lantern(1240, 0));
  return L("pyramid", "هرم الألوان", 4, 6, 4, b, [shot("meteor", 24, 20), shot("heavy", 18, 24), shot("pulse", 28, 21, 50), shot("meteor", 14, 26), shot("comet", 22, 23, 30)]);
}
/** تصميم ضغط بـ 90 جسمًا ديناميكيًا (الحد الأعلى في المخطط) لقياس الأداء */
function stress90() {
  const b: LayoutBody[] = [];
  const mats: MaterialKey[] = ["teak", "frond", "glass", "stone", "teak", "frond"];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 14; r++) b.push(box(mats[(c + r) % 6], 700 + c * 120, r * 50, 100, 50));
  for (let i = 0; i < 6; i++) b.push(lantern(700 + i * 120, 700));
  return L("stress-90", "ضغط ٩٠ جسمًا", 4, 6, 6, b, [shot("heavy", 20, 26), shot("meteor", 28, 24), shot("comet", 24, 25, 30), shot("pulse", 30, 24, 40), shot("meteor", 16, 28), shot("heavy", 24, 26)]);
}

export const SPIKE_LAYOUTS: SpikeLayout[] = [firstLight(), frondWall(), glassTower(), stoneArch(), cloudBounce(), lightboxHeart(), twinTowers(), pyramid(), stress90()];
