/**
 * الخامات (القيم في GAME_DESIGN.md §5). الكتلة في 3D حجم لا مساحة، فعتبات الكسر معايَرة بسكربت tune:
 * أعلى حمل ساكن في عمود من 7 طبقات أقل من نصف أضعف عتبة، فلا ينهار تصميم وحده.
 */
export type MaterialKey = "frond" | "teak" | "stone" | "glass" | "cloud" | "lightbox";

export type Material = {
  label: string;
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

export const MATERIAL_KEYS: readonly MaterialKey[] = ["frond", "teak", "stone", "glass", "cloud", "lightbox"];

export const MATERIALS: Record<MaterialKey, Material> = {
  frond: { label: "سعف", density: 1.2, friction: 0.7, restitution: 0.05, breakForce: 120, shards: 10 },
  teak: { label: "خشب ساج", density: 2, friction: 0.7, restitution: 0.05, breakForce: 260, shards: 12 },
  stone: { label: "حجر بحري", density: 4.5, friction: 0.85, restitution: 0.02, breakForce: 420, heavyOnly: true, shards: 14 },
  glass: { label: "زجاج معشّق", density: 2.2, friction: 0.35, restitution: 0.1, breakForce: 100, shards: 16 },
  cloud: { label: "غيم", density: 0.8, friction: 0.2, restitution: 0.95, breakForce: Infinity, shards: 0 },
  lightbox: { label: "صندوق ضوء", density: 1.6, friction: 0.6, restitution: 0.05, breakForce: 110, pulse: { radius: 3.2, impulse: 2.6 }, shards: 18 },
};

/** القنديل: لا ينكسر، ويُرسم قفصًا نحاسيًا مضيئًا */
export const LANTERN_MATERIAL = { density: 1, friction: 0.5, restitution: 0.2 } as const;
