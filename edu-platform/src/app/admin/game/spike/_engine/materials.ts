/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * المواد معاملات فيزيائية فقط (الجودة لا تمسها). القيم ضُبطت تجريبيًا في التجربة.
 * breakForce: أقل قوة تماس (نيوتن، كما يبلغها Rapier) تكسر الجسم؛ null = لا ينكسر.
 * breakOnlyBy: لا ينكسر إلا بقذيفة من هذا النوع (الحجر البحري والنيزك الثقيل).
 */
export const MATERIAL_IDS = ["frond", "teak", "stone", "glass", "cloud", "lightbox", "lantern"] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

export interface Material {
  id: MaterialId;
  nameAr: string;
  density: number;
  friction: number;
  restitution: number;
  /** استخدام قاعدة "الأكبر" للارتداد (الغيم) */
  restitutionMax: boolean;
  breakForce: number | null;
  breakOnlyBy: AmmoId | null;
  /** صندوق الضوء: نبضة تدفع ما حوله عند انكساره */
  pulse: { radius: number; strength: number } | null;
}

export const MATERIALS: Record<MaterialId, Material> = {
  frond: { id: "frond", nameAr: "سعف", density: 0.35, friction: 0.6, restitution: 0.05, restitutionMax: false, breakForce: null, breakOnlyBy: null, pulse: null },
  teak: { id: "teak", nameAr: "خشب ساج", density: 1.0, friction: 0.7, restitution: 0.05, restitutionMax: false, breakForce: null, breakOnlyBy: null, pulse: null },
  stone: { id: "stone", nameAr: "حجر بحري", density: 2.6, friction: 0.8, restitution: 0.0, restitutionMax: false, breakForce: 400, breakOnlyBy: "heavy", pulse: null },
  glass: { id: "glass", nameAr: "زجاج ملوّن هش", density: 1.2, friction: 0.4, restitution: 0.1, restitutionMax: false, breakForce: 120, breakOnlyBy: null, pulse: null },
  cloud: { id: "cloud", nameAr: "غيم شديد الارتداد", density: 0.2, friction: 0.2, restitution: 0.95, restitutionMax: true, breakForce: null, breakOnlyBy: null, pulse: null },
  lightbox: { id: "lightbox", nameAr: "صندوق ضوء", density: 0.8, friction: 0.6, restitution: 0.05, restitutionMax: false, breakForce: 90, breakOnlyBy: null, pulse: { radius: 3.2, strength: 7 } },
  lantern: { id: "lantern", nameAr: "قنديل", density: 0.5, friction: 0.5, restitution: 0.2, restitutionMax: false, breakForce: null, breakOnlyBy: null, pulse: null },
};

export const AMMO_IDS = ["meteor", "pebble", "heavy"] as const;
export type AmmoId = (typeof AMMO_IDS)[number];

export interface Ammo {
  id: AmmoId;
  nameAr: string;
  radius: number;
  density: number;
  friction: number;
  restitution: number;
}

export const AMMO: Record<AmmoId, Ammo> = {
  meteor: { id: "meteor", nameAr: "شهاب", radius: 0.22, density: 5, friction: 0.5, restitution: 0.2 },
  pebble: { id: "pebble", nameAr: "حصاة", radius: 0.12, density: 2.5, friction: 0.5, restitution: 0.3 },
  heavy: { id: "heavy", nameAr: "نيزك ثقيل", radius: 0.3, density: 12, friction: 0.6, restitution: 0.05 },
};
