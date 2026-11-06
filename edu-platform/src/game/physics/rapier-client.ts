/**
 * Rapier3D للمتصفح فقط: الحزمة split (ملف .wasm مستقل يُخزَّن ببصمة)، و -compat احتياطًا إن فشل تحميله.
 * يُستورد بـ import() من جزيرة عميل ssr:false فقط. لا يُستورد من أي كود خادم (اختبار حدود الاستيراد يمنعه).
 */
import type { Rapier } from "./types";

export type RapierFlavor = "split" | "compat";
let cached: Promise<{ R: Rapier; flavor: RapierFlavor }> | null = null;

export function loadRapierClient(prefer: RapierFlavor = "split"): Promise<{ R: Rapier; flavor: RapierFlavor }> {
  cached ??= (async () => {
    if (prefer === "split") {
      try {
        return { R: (await import("@dimforge/rapier3d-deterministic")) as unknown as Rapier, flavor: "split" as const };
      } catch {
        // شبكة ضعيفة أو حظر .wasm: الحزمة المضمّنة تعمل في كل بيئة
      }
    }
    const m = await import("@dimforge/rapier3d-deterministic-compat");
    await m.init();
    return { R: m as unknown as Rapier, flavor: "compat" as const };
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
