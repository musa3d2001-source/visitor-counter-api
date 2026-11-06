/**
 * مخطط التصميم (GAME_DESIGN.md §12): JSON يُتحقق منه بـ zod عند التحميل وفي scripts/validate-levels.ts.
 * الإحداثيات بالسنتيمتر أعدادًا صحيحة لمراكز الأجسام؛ البذرة لا تغيّر البنية.
 */
import { z } from "zod";
import { MATERIAL_KEYS, type MaterialKey } from "./materials";
import { SPECIAL_AMMO } from "./ammo";
import { LANTERN_SIZE, LAUNCH, LEVEL_LIMITS } from "./world";

const cm = z.number().int().min(-3000).max(3000);
const size = z.number().int().min(10).max(800);

export const bodySchema = z
  .object({
    m: z.enum(MATERIAL_KEYS as [MaterialKey, ...MaterialKey[]]),
    x: cm,
    y: z.number().int().min(1).max(2000),
    z: cm,
    w: size,
    h: size,
    d: size,
  })
  .strict()
  .refine((b) => b.y * 2 >= b.h, { message: "body below the island surface" });

export const lanternSchema = z.object({ x: cm, y: z.number().int().min(LANTERN_SIZE.h / 2).max(2000), z: cm }).strict();

export const levelSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{3,40}$/),
    title: z.string().min(2).max(60),
    version: z.number().int().min(1),
    tier: z.number().int().min(1).max(4),
    slots: z.number().int().min(3).max(8),
    par: z.number().int().min(1).max(10),
    streakReward: z.enum(SPECIAL_AMMO as unknown as ["heavy", "comet", "pulse"]),
    bodies: z.array(bodySchema).max(LEVEL_LIMITS.maxBodies),
    lanterns: z.array(lanternSchema).min(1).max(LEVEL_LIMITS.maxLanterns),
  })
  .strict()
  .superRefine((l, ctx) => {
    // أبعد جسم عن المرقاب ≤ 18م (البرج يبقى كبيرًا على شاشة الجوال)
    const reach2 = LEVEL_LIMITS.maxReachFromLauncher * LEVEL_LIMITS.maxReachFromLauncher;
    const far = (x: number, y: number, z: number) => {
      const dx = x / 100 - LAUNCH.x;
      const dy = y / 100 - LAUNCH.y;
      const dz = z / 100 - LAUNCH.z;
      return dx * dx + dy * dy + dz * dz > reach2;
    };
    l.bodies.forEach((b, i) => {
      if (far(b.x, b.y, b.z)) ctx.addIssue({ code: "custom", path: ["bodies", i], message: "farther than 18 m from the launcher" });
    });
    l.lanterns.forEach((b, i) => {
      if (far(b.x, b.y, b.z)) ctx.addIssue({ code: "custom", path: ["lanterns", i], message: "farther than 18 m from the launcher" });
    });
    if (l.par > l.slots + 1) ctx.addIssue({ code: "custom", path: ["par"], message: "par cannot exceed slots + the opening shot" });
  });

export type LevelBody = z.infer<typeof bodySchema>;
export type LevelLantern = z.infer<typeof lanternSchema>;
export type Level = z.infer<typeof levelSchema>;

export function parseLevel(data: unknown): Level {
  return levelSchema.parse(data);
}
