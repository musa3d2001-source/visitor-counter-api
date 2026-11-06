/** القذائف (GAME_DESIGN.md §5). الشهاب والحصاة والنيزك الثقيل في MVP-A، والمذنّب والنبضة في MVP-B */
export type AmmoKey = "meteor" | "pebble" | "heavy" | "comet" | "pulse";
export type SpecialAmmo = "heavy" | "comet" | "pulse";

export type Ammo = { label: string; radius: number; density: number; speedScale: number; activatable: boolean };

export const AMMO_KEYS: readonly AmmoKey[] = ["meteor", "pebble", "heavy", "comet", "pulse"];
export const SPECIAL_AMMO: readonly SpecialAmmo[] = ["heavy", "comet", "pulse"];

export const AMMO: Record<AmmoKey, Ammo> = {
  meteor: { label: "شهاب", radius: 0.34, density: 6, speedScale: 1, activatable: false },
  pebble: { label: "حصاة", radius: 0.2, density: 4, speedScale: 0.85, activatable: false },
  heavy: { label: "نيزك ثقيل", radius: 0.46, density: 12, speedScale: 0.9, activatable: false },
  comet: { label: "مذنّب", radius: 0.28, density: 6, speedScale: 1, activatable: true },
  pulse: { label: "نبضة الفجر", radius: 0.32, density: 5, speedScale: 1, activatable: true },
};

/** انقسام المذنّب: دوران سرعة القطعتين ±12° حول المحور الرأسي (جيب وتمام ثابتان) */
export const COMET_SPLIT = { c: 0.9781476007338057, s: 0.20791169081775934, offset: 0.3 } as const;
/** نبضة الفجر عند التفعيل */
export const PULSE_BURST = { radius: 3.4, impulse: 2.4 } as const;
/** عتبة أحداث قوة التلامس للقذيفة (نيوتن) */
export const PROJECTILE_FORCE_EVENT = 20;
