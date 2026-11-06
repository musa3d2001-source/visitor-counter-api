/**
 * تجربة 3D: مواد وتصاميم أولية لقياس الحتمية والأداء على الجوال (ليست المستويات النهائية).
 * الإحداثيات بالسنتيمتر أعدادًا صحيحة: x يمين، y أعلى (الأرض y = 0)، z نحو الكاميرا.
 * الجزيرة حول z = 0، والمرقاب خلفها عند z = 1250 على ارتفاع 220، ويرمي نحو z السالبة.
 * السقف: 120 جسمًا فيزيائيًا لكل تصميم (القذائف ضمنًا)، والشظايا مرئية فقط.
 */
import { aimAt } from "./det3d";

export type MaterialKey = "frond" | "teak" | "stone" | "glass" | "cloud" | "lightbox" | "lantern";
export type AmmoKey = "meteor" | "pebble" | "heavy" | "comet" | "pulse";

export type Material3 = {
  label: string;
  /** الكثافة (كتلة لكل متر مكعب في وحدات Rapier) */
  density: number;
  friction: number;
  restitution: number;
  /** ذروة قوة التلامس في خطوة واحدة (نيوتن) التي تكسر الجسم؛ Infinity = لا ينكسر */
  breakForce: number;
  /** لا يكسره إلا النيزك الثقيل */
  heavyOnly?: boolean;
  /** صندوق الضوء: نبضة شعاعية عند انكساره */
  pulse?: { radius: number; impulse: number };
  /** عدد الشظايا المرئية عند الكسر (العرض فقط) */
  shards: number;
};

/**
 * الأرقام معايَرة بسكربت tune3d (ذروة الحمل الساكن في أعلى عمود أقل من نصف أضعف عتبة).
 * الكتل في 3D أخف بكثير منها في 2D (حجم لا مساحة)، فالعتبات أصغر.
 */
export const MATERIALS3: Record<MaterialKey, Material3> = {
  frond: { label: "سعف", density: 1.2, friction: 0.7, restitution: 0.05, breakForce: 120, shards: 10 },
  teak: { label: "خشب ساج", density: 2, friction: 0.7, restitution: 0.05, breakForce: 260, shards: 12 },
  stone: { label: "حجر بحري", density: 4.5, friction: 0.85, restitution: 0.02, breakForce: 420, heavyOnly: true, shards: 14 },
  glass: { label: "زجاج ملوّن", density: 2.2, friction: 0.35, restitution: 0.1, breakForce: 100, shards: 16 },
  cloud: { label: "غيم", density: 0.8, friction: 0.2, restitution: 0.95, breakForce: Infinity, shards: 0 },
  lightbox: { label: "صندوق ضوء", density: 1.6, friction: 0.6, restitution: 0.05, breakForce: 110, pulse: { radius: 3.2, impulse: 2.6 }, shards: 18 },
  lantern: { label: "قنديل", density: 1, friction: 0.5, restitution: 0.2, breakForce: Infinity, shards: 0 },
};

export type Ammo3 = { radius: number; density: number; speedScale: number };
export const AMMO3: Record<AmmoKey, Ammo3> = {
  meteor: { radius: 0.34, density: 6, speedScale: 1 },
  pebble: { radius: 0.2, density: 4, speedScale: 0.85 },
  heavy: { radius: 0.46, density: 12, speedScale: 0.9 },
  comet: { radius: 0.28, density: 6, speedScale: 1 },
  pulse: { radius: 0.32, density: 5, speedScale: 1 },
};

/** فوهة المرقاب (متر) */
export const LAUNCH3 = { x: 0, y: 2.2, z: 12.5 };

export type Body3 = { s: "box" | "ball"; m: MaterialKey; x: number; y: number; z: number; w: number; h: number; d: number };
export type Shot3 = { ammo: AmmoKey; yawStep: number; pitchStep: number; powerStep: number; activateAt: number };
export type Layout3 = { key: string; title: string; version: number; tier: number; slots: number; par: number; bodies: Body3[]; shots: Shot3[] };

export const MAX_BODIES_3D = 120;

/* ── مساعدات بناء (تُنتج بيانات JSON عادية) ── */
const box = (m: MaterialKey, x: number, bottom: number, z: number, w: number, h: number, d: number): Body3 => ({ s: "box", m, x, y: bottom + h / 2, z, w, h, d });
const cube = (m: MaterialKey, x: number, bottom: number, z: number, s: number) => box(m, x, bottom, z, s, s, s);
/** القنديل صندوق 50×60×50 (الكرة تتدحرج بلا نهاية على أرض مستوية لأن Rapier بلا مقاومة تدحرج)، ويُرسم قنديلًا */
const lantern = (x: number, bottom: number, z: number): Body3 => ({ s: "box", m: "lantern", x, y: bottom + 30, z, w: 50, h: 60, d: 50 });

/** جناح: أربعة أعمدة وسقف؛ يعيد الأجسام وارتفاع السطح */
function pavilion(m: MaterialKey, roof: MaterialKey, x: number, z: number, bottom: number, span: number, h = 140, p = 30): [Body3[], number] {
  const o = span / 2;
  const rt = 24;
  return [
    [
      box(m, x - o, bottom, z - o, p, h, p),
      box(m, x + o, bottom, z - o, p, h, p),
      box(m, x - o, bottom, z + o, p, h, p),
      box(m, x + o, bottom, z + o, p, h, p),
      box(roof, x, bottom + h, z, span + p + 30, rt, span + p + 30),
    ],
    bottom + h + rt,
  ];
}

/** رمية مصوّبة نحو نقطة (سم) بالبحث في جداول التصويب الصحيحة */
function shotAt(ammo: AmmoKey, tx: number, ty: number, tz: number, activateAt = -1, maxPitch = 30): Shot3 {
  const a = aimAt(LAUNCH3, { x: tx / 100, y: ty / 100, z: tz / 100 }, { speedScale: AMMO3[ammo].speedScale, maxPitch });
  return { ammo, ...a, activateAt };
}

function L(key: string, title: string, tier: number, slots: number, par: number, bodies: Body3[], shots: Shot3[]): Layout3 {
  if (bodies.length + 3 > MAX_BODIES_3D) throw new Error(`${key}: ${bodies.length} bodies exceeds the 3D cap`);
  return { key, title, version: 1, tier, slots, par, bodies, shots };
}

function firstLight() {
  const [p, top] = pavilion("teak", "frond", 0, 0, 0, 140);
  return L("first-light", "أول ضوء", 1, 4, 2, [...p, lantern(0, top, 0), lantern(0, 0, 0)], [shotAt("meteor", 0, 120, 70), shotAt("meteor", 0, 190, 0), shotAt("pebble", 40, 60, 0)]);
}

function frondWall() {
  const b: Body3[] = [];
  for (let c = 0; c < 7; c++) for (let r = 0; r < 4; r++) b.push(cube("frond", (c - 3) * 62, r * 60, 300, 60));
  b.push(lantern(-120, 0, 0), lantern(0, 0, -40), lantern(120, 0, 0));
  return L("frond-wall", "سور السعف", 1, 5, 3, b, [shotAt("meteor", 0, 150, 330), shotAt("meteor", -120, 90, 330), shotAt("meteor", 130, 60, 330), shotAt("pebble", 0, 60, 300)]);
}

function glassTower() {
  const b: Body3[] = [];
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const [p, top] = pavilion("glass", "teak", 0, 0, y, 110, 110, 26);
    b.push(...p);
    if (i % 2 === 1) b.push(lantern(0, y, 0));
    y = top;
  }
  b.push(lantern(0, y, 0));
  return L("glass-tower", "برج الزجاج", 2, 5, 3, b, [shotAt("meteor", 0, 130, 60), shotAt("meteor", 0, 320, 60), shotAt("comet", 0, 250, 60, 40), shotAt("pebble", 0, 420, 0)]);
}

function stoneGate() {
  const b: Body3[] = [box("stone", -180, 0, 0, 60, 180, 60), box("stone", 180, 0, 0, 60, 180, 60), box("stone", 0, 180, 0, 460, 50, 80)];
  b.push(box("teak", 0, 230, 0, 40, 120, 40), lantern(0, 0, 0), lantern(0, 350, 0));
  for (let i = 0; i < 4; i++) b.push(cube("frond", -60 + i * 40, 0, -160, 38));
  return L("stone-gate", "بوابة الحجر", 2, 5, 3, b, [shotAt("meteor", 0, 280, 20), shotAt("heavy", -180, 120, 40), shotAt("meteor", 0, 40, 30), shotAt("pebble", 0, 40, -150)]);
}

function lightboxCourt() {
  const b: Body3[] = [];
  const [p1, t1] = pavilion("teak", "teak", 0, 0, 0, 240, 130);
  b.push(...p1, box("lightbox", 0, 0, 0, 70, 70, 70), lantern(-80, 0, -80), lantern(80, 0, 80));
  const [p2, t2] = pavilion("frond", "glass", 0, 0, t1, 150, 110);
  b.push(...p2, lantern(0, t1, 0), lantern(0, t2, 0));
  for (const [x, z] of [
    [-260, 0],
    [260, 0],
  ] as const) {
    const [p, t] = pavilion("glass", "frond", x, z, 0, 90, 100, 24);
    b.push(...p, lantern(x, t, z));
  }
  return L("lightbox-court", "ساحة الضوء", 3, 5, 2, b, [shotAt("meteor", 0, 40, 120), shotAt("meteor", 0, 220, 60), shotAt("heavy", -260, 80, 40), shotAt("pebble", 260, 80, 40)]);
}

function pyramid() {
  const b: Body3[] = [];
  const mats: MaterialKey[] = ["stone", "teak", "frond", "glass", "lightbox"];
  const s = 56;
  for (let r = 0; r < 5; r++) {
    const n = 5 - r;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) b.push(cube(mats[r], (i - (n - 1) / 2) * (s + 2), r * s, (k - (n - 1) / 2) * (s + 2), s));
  }
  b.push(lantern(0, 5 * s, 0), lantern(-220, 0, 0), lantern(220, 0, 0), lantern(0, 0, -220));
  return L("pyramid", "هرم الألوان", 4, 6, 4, b, [
    shotAt("meteor", 0, 200, 140),
    shotAt("heavy", 0, 60, 160),
    shotAt("pulse", 0, 150, 120, 52),
    shotAt("meteor", -120, 80, 120),
    shotAt("comet", 60, 120, 120, 34),
  ]);
}

/** ضغط ٩٠ جسمًا (مقابل تصميم 2D بالعدد نفسه) */
function stress90() {
  const b: Body3[] = [];
  const mats: MaterialKey[] = ["teak", "frond", "glass", "stone", "teak", "frond"];
  for (let c = 0; c < 6; c++) for (let k = 0; k < 2; k++) for (let r = 0; r < 7; r++) b.push(box(mats[(c + r + k) % 6], (c - 2.5) * 70, r * 50, k * 70 - 35, 64, 50, 64));
  for (let i = 0; i < 6; i++) b.push(lantern((i - 2.5) * 70, 350, 0));
  return L("stress-90", "ضغط ٩٠ جسمًا", 4, 6, 6, b, [
    shotAt("heavy", 0, 120, 60),
    shotAt("meteor", -120, 220, 60),
    shotAt("comet", 100, 180, 60, 34),
    shotAt("pulse", 0, 250, 40, 48),
    shotAt("meteor", 150, 80, 60),
    shotAt("heavy", -60, 60, 60),
  ]);
}

/** الحد الأعلى: ١١٢ كتلة و٨ قناديل (١٢٠ جسمًا) في أربعة أبراج حول ساحة */
function stress120() {
  const b: Body3[] = [];
  const mats: MaterialKey[] = ["teak", "frond", "glass", "teak", "stone", "frond", "lightbox"];
  const towers: [number, number][] = [
    [-170, -60],
    [170, -60],
    [-80, 120],
    [80, 120],
  ];
  towers.forEach(([tx, tz], t) => {
    for (let r = 0; r < 7; r++) for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) b.push(cube(mats[(r + t + i + k) % 7], tx + (i - 0.5) * 56, r * 54, tz + (k - 0.5) * 56, 54));
  });
  for (const [tx, tz] of towers) b.push(lantern(tx, 7 * 54, tz), lantern(tx, 0, tz + (tz < 0 ? -110 : 110)));
  if (b.length !== 120) throw new Error(`stress-120 has ${b.length} bodies`);
  return {
    key: "stress-120",
    title: "ضغط ١٢٠ جسمًا",
    version: 1,
    tier: 4,
    slots: 6,
    par: 6,
    bodies: b,
    shots: [
      shotAt("heavy", -80, 150, 150),
      shotAt("meteor", 80, 250, 150),
      shotAt("comet", -170, 200, -40, 34),
      shotAt("pulse", 170, 180, -40, 46),
      shotAt("meteor", 0, 80, 60),
      shotAt("heavy", 0, 200, -60),
    ],
  } satisfies Layout3;
}

export const SPIKE3D_LAYOUTS: Layout3[] = [firstLight(), frondWall(), glassTower(), stoneGate(), lightboxCourt(), pyramid(), stress90(), stress120()];
