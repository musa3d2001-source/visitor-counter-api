/**
 * Rapier3D للخادم و Node (السكربتات والاختبارات) بالحزمة -compat فقط.
 * لا يذكر الحزمة split إطلاقًا: ذكرها في رسم الخادم يجعل Turbopack يضمّ محمّل WASM لـ Node بنمط ملفات
 * ديناميكي يتتبّع آلاف الملفات في دالة الخادم.
 */
import type { Rapier } from "./types";

let cached: Promise<Rapier> | null = null;

export function loadRapierNode(): Promise<Rapier> {
  cached ??= import("@dimforge/rapier3d-deterministic-compat").then(async (m) => {
    await m.init();
    return m as unknown as Rapier;
  });
  return cached;
}
