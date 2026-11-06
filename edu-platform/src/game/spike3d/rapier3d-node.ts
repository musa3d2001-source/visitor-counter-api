/**
 * تجربة 3D: Rapier3D للخادم و Node (السكربتات والاختبارات) بالحزمة -compat فقط.
 * لا يذكر الحزمة split إطلاقًا: ذِكرها في رسم الخادم يجعل Turbopack يضمّ محمّل WASM لـ Node بنمط ملفات
 * ديناميكي يتتبّع آلاف الملفات في دالة الخادم. الثنائي WASM نفسه في الحزمتين (SHA-256 متطابق: 4e9890fd…7551).
 */
import type { Rapier3 } from "./sim3d";

let cached: Promise<Rapier3> | null = null;

export function loadRapier3Node(): Promise<Rapier3> {
  cached ??= import("@dimforge/rapier3d-deterministic-compat").then(async (m) => {
    await m.init();
    return m as unknown as Rapier3;
  });
  return cached;
}
