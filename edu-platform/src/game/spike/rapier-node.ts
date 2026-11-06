/**
 * نموذج المرحلة 0: Rapier للخادم و Node (السكربتات والاختبارات) بالحزمة -compat فقط.
 * لا يذكر الحزمة split إطلاقًا: ذِكرها في رسم الخادم يجعل Turbopack يضمّ محمّل WASM لـ Node بنمط ملفات
 * ديناميكي يتتبّع نحو ١٤ ألف ملف في دالة الخادم. الثنائي WASM نفسه في الحزمتين (SHA-256 متطابق).
 */
import type { Rapier } from "./sim";

let cached: Promise<Rapier> | null = null;

export function loadRapierNode(): Promise<Rapier> {
  cached ??= import("@dimforge/rapier2d-deterministic-compat").then(async (m) => {
    await m.init();
    return m as unknown as Rapier;
  });
  return cached;
}
