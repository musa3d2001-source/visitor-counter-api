/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * مخطط التصميم (zod). الإحداثيات أعداد صحيحة بالسنتيمتر، والزاوية بالدرجات الصحيحة،
 * فلا يدخل التصميمَ أي عدد عشري. أرضية المشهد (y = 0) يضيفها المحرك تلقائيًا.
 * الحد: 90 جسمًا ديناميكيًا (الأجسام غير الثابتة + القناديل)، دون القذائف.
 */
import { z } from "zod";
import { AMMO_IDS, MATERIAL_IDS } from "./materials";
import { ANGLE_STEPS, POWER_STEPS } from "./aim-table";

export const MAX_DYNAMIC_BODIES = 90;

const int = () => z.number().int();

export const bodySchema = z
  .object({
    id: z.string().min(1).max(32),
    shape: z.enum(["box", "ball"]),
    material: z.enum(MATERIAL_IDS).exclude(["lantern"]),
    x: int().min(-1500).max(4000),
    y: int().min(0).max(2500),
    w: int().min(4).max(1200).optional(),
    h: int().min(4).max(1200).optional(),
    r: int().min(4).max(200).optional(),
    rot: int().min(-180).max(180).default(0),
    fixed: z.boolean().default(false),
  })
  .refine((b) => (b.shape === "box" ? b.w !== undefined && b.h !== undefined : b.r !== undefined), {
    message: "box needs w/h, ball needs r",
  });

export const lanternSchema = z.object({
  id: z.string().min(1).max(32),
  x: int().min(-1500).max(4000),
  y: int().min(0).max(2500),
  r: int().min(10).max(60).default(20),
});

export const levelSchema = z
  .object({
    version: int().min(1),
    key: z.string().regex(/^[a-z0-9-]{3,48}$/),
    title: z.string().min(1).max(60),
    tier: int().min(1).max(4),
    slots: int().min(1).max(8),
    par: int().min(1).max(10),
    streakReward: z.enum(["comet", "heavy", "pulse"]),
    launcher: z.object({ x: int().min(0).max(4000), y: int().min(0).max(1000) }),
    bodies: z.array(bodySchema).max(200),
    lanterns: z.array(lanternSchema).min(1).max(6),
  })
  .superRefine((lvl, ctx) => {
    const dynamic = lvl.bodies.filter((b) => !b.fixed).length + lvl.lanterns.length;
    if (dynamic > MAX_DYNAMIC_BODIES) ctx.addIssue({ code: "custom", message: `dynamic bodies ${dynamic} > ${MAX_DYNAMIC_BODIES}` });
    const ids = new Set<string>();
    for (const b of [...lvl.bodies, ...lvl.lanterns]) {
      if (ids.has(b.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${b.id}` });
      ids.add(b.id);
    }
  });

export type Level = z.infer<typeof levelSchema>;
export type LevelBody = z.infer<typeof bodySchema>;

export const shotSchema = z.object({
  idx: int().min(0).max(20),
  ammo: z.enum(AMMO_IDS),
  angleStep: int().min(0).max(ANGLE_STEPS - 1),
  powerStep: int().min(0).max(POWER_STEPS - 1),
  /** خطوة تفعيل القذيفة الخاصة بعد الإطلاق، أو -1 (غير مستخدمة في التجربة) */
  activateAt: int().min(-1).max(900),
});

export type Shot = z.infer<typeof shotSchema>;

export function parseLevel(input: unknown): Level {
  return levelSchema.parse(input);
}

export function countDynamic(level: Level): number {
  return level.bodies.filter((b) => !b.fixed).length + level.lanterns.length;
}
