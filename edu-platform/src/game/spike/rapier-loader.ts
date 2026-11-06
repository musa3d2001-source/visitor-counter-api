/**
 * نموذج المرحلة 0: تحميل إحدى حزمتي Rapier2D الحتميتين للمقارنة.
 *  - split  : ‎@dimforge/rapier2d-deterministic‎ (ملف ‎.wasm‎ مستقل يحمّله المجمّع ويخزّنه ببصمة)
 *  - compat : ‎@dimforge/rapier2d-deterministic-compat‎ (WASM مضمّن base64 داخل JS، يعمل في أي بيئة)
 * كلاهما بـ import() حتى لا يدخل أي منهما في حزمة صفحة أخرى.
 */
import type { Rapier } from "./sim";

export type RapierFlavor = "split" | "compat";

export async function loadRapier(flavor: RapierFlavor): Promise<Rapier> {
  if (flavor === "compat") {
    const m = await import("@dimforge/rapier2d-deterministic-compat");
    await m.init();
    return m as unknown as Rapier;
  }
  const m = await import("@dimforge/rapier2d-deterministic");
  return m as unknown as Rapier;
}
