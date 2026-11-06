/**
 * لوحة «فانوس الخليج» (PLAN.md §2): كرتون دافئ على هوية «الفصل المشمس» (كريمي، فيروزي، ذهبي).
 * المشهد ليل على ساحل الكويت يتدرج إلى الشروق كلما تحرر قنديل (GAME_DESIGN.md §1): ثلاث محطات
 * (ليل ← سَحَر ← شروق) تُمزج خطيًا بتقدم 0..1. ملف بيانات خالص بلا three، فتستعمله الواجهة أيضًا.
 */
import type { AmmoKey } from "../core/ammo";
import type { MaterialKey } from "../core/materials";

/** ألوان المشهد التي تتغير مع الفجر (hex بنظام sRGB) */
export type SkyStop = {
  skyTop: string;
  skyMid: string;
  horizon: string;
  /** حافة متوهجة على الأفق: فيروزية ليلًا وذهبية عند الشروق */
  horizonGlow: string;
  fog: string;
  sea: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** الضوء الرئيس: القمر ليلًا ثم الشمس */
  key: string;
  keyIntensity: number;
  rim: string;
  rimIntensity: number;
  skyline: string;
  exposure: number;
  /** شفافية نجوم السماء والقمر */
  night: number;
};

export const NIGHT: SkyStop = {
  skyTop: "#081236",
  skyMid: "#1b2c6e",
  horizon: "#33508f",
  horizonGlow: "#2fe0cf",
  fog: "#2f4a8a",
  sea: "#0d3f63",
  hemiSky: "#c4c2f2",
  hemiGround: "#2a4f5c",
  hemiIntensity: 1.35,
  key: "#d8dcff",
  keyIntensity: 1.6,
  rim: "#5fe6d8",
  rimIntensity: 0.7,
  skyline: "#2a2d6a",
  exposure: 1.02,
  night: 1,
};

export const TWILIGHT: SkyStop = {
  skyTop: "#27306f",
  skyMid: "#8a5aa6",
  horizon: "#ff9f86",
  horizonGlow: "#ffc36b",
  fog: "#d98a96",
  sea: "#1f6787",
  hemiSky: "#ffc9c2",
  hemiGround: "#2c5d6c",
  hemiIntensity: 1.3,
  key: "#ffc3a0",
  keyIntensity: 2,
  rim: "#ff9fc0",
  rimIntensity: 0.6,
  skyline: "#5b3f7e",
  exposure: 1.06,
  night: 0.35,
};

export const SUNRISE: SkyStop = {
  skyTop: "#4f9be0",
  skyMid: "#ffc1a1",
  horizon: "#ffd27a",
  horizonGlow: "#fff0b8",
  fog: "#f9cf92",
  sea: "#1f97a6",
  hemiSky: "#ffe7c4",
  hemiGround: "#3f8a8e",
  hemiIntensity: 1.4,
  key: "#ffd796",
  keyIntensity: 2.7,
  rim: "#ffe0a8",
  rimIntensity: 0.5,
  skyline: "#9a7395",
  exposure: 1.1,
  night: 0,
};

/** ألوان الخامات: زاهية مشبعة، لا سماوي شاحب للزجاج */
export const MATERIAL_COLORS: Record<MaterialKey, string> = {
  frond: "#e7b84a",
  teak: "#b0622c",
  stone: "#f2b8a2",
  glass: "#ffffff",
  cloud: "#fbf7ff",
  lightbox: "#ffd84d",
};

/** ألوان الزجاج المعشّق (خلايا النقش وشظاياه) */
export const STAINED = ["#e8285f", "#2a5fe0", "#12a57e", "#ffb000", "#9147ec", "#0fb8b0"] as const;

export const LANTERN = { glow: "#ffb547", glowDim: "#5a3d2a", copper: "#d27a3e", copperDark: "#8c4a22", star: "#ffd76a" } as const;

export const AMMO_COLORS: Record<AmmoKey, string> = { meteor: "#ffe08a", pebble: "#d9e4ff", heavy: "#b6c3d6", comet: "#8ff3ff", pulse: "#ffb3f1" };

/** هوية المنصة في المشهد (المصطبة والمرقاب) */
export const BRAND = {
  cream: "#fbf1dc",
  creamDark: "#ecd9b4",
  teal: "#0a6b66",
  tealHi: "#21a79d",
  gold: "#ffc531",
  sand: "#f3ddb0",
  sandDark: "#dcb57c",
  palmTrunk: "#9a6337",
  palmLeaf: "#2fa36b",
  palmLeafHi: "#45c27f",
  coral: ["#f29a86", "#e9c4a6", "#d97f74", "#f6d3b6"],
} as const;

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** مزج لونين hex (للواجهة؛ المشهد يمزج بـ THREE.Color) */
export function mixHex(a: string, b: string, t: number): string {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return `#${((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1)}`;
}

/** محطتا المزج ونسبته لتقدم الفجر 0..1 (0 ليل، 0.5 سَحَر، 1 شروق) */
export function dawnStops(progress: number): { a: SkyStop; b: SkyStop; t: number } {
  const p = progress > 0 ? (progress < 1 ? progress : 1) : 0;
  return p < 0.5 ? { a: NIGHT, b: TWILIGHT, t: p * 2 } : { a: TWILIGHT, b: SUNRISE, t: (p - 0.5) * 2 };
}

/** تدرج CSS للسماء نفسها (خلفية المنصة قبل تحميل المشهد) */
export function skyCss(progress: number): string {
  const { a, b, t } = dawnStops(progress);
  return `linear-gradient(180deg, ${mixHex(a.skyTop, b.skyTop, t)}, ${mixHex(a.skyMid, b.skyMid, t)} 58%, ${mixHex(a.horizon, b.horizon, t)})`;
}
