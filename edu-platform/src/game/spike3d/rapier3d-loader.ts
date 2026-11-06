/**
 * تجربة 3D: تحميل إحدى حزمتي Rapier3D الحتميتين في المتصفح للمقارنة.
 *  - split  : ‎@dimforge/rapier3d-deterministic‎ (ملف ‎.wasm‎ مستقل يحمّله المجمّع ويخزّنه ببصمة)
 *  - compat : ‎@dimforge/rapier3d-deterministic-compat‎ (WASM مضمّن base64 داخل JS)
 * كلاهما بـ import() حتى لا يدخل أي منهما في حزمة صفحة أخرى. لا يُستورد من كود الخادم أبدًا.
 */
import type { Rapier3 } from "./sim3d";

export type RapierFlavor = "split" | "compat";

export async function loadRapier3(flavor: RapierFlavor): Promise<Rapier3> {
  if (flavor === "compat") {
    const m = await import("@dimforge/rapier3d-deterministic-compat");
    await m.init();
    return m as unknown as Rapier3;
  }
  const m = await import("@dimforge/rapier3d-deterministic");
  return m as unknown as Rapier3;
}
