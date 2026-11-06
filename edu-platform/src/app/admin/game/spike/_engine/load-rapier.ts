/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * تحميل إحدى حزمتي Rapier كسولًا عبر import() بنص ثابت (ليطابقه المجمّع):
 * - standard: @dimforge/rapier2d-deterministic (ملف .wasm مستقل يتولاه المجمّع)
 * - compat:   @dimforge/rapier2d-deterministic-compat (WASM مضمّن base64، يتطلب init())
 */
import type { RapierModule } from "./physics-adapter";

export type RapierPackage = "standard" | "compat";

export const RAPIER_PACKAGE_NAMES: Record<RapierPackage, string> = {
  standard: "@dimforge/rapier2d-deterministic",
  compat: "@dimforge/rapier2d-deterministic-compat",
};

export async function loadRapier(pkg: RapierPackage): Promise<RapierModule> {
  if (pkg === "compat") {
    const mod = await import("@dimforge/rapier2d-deterministic-compat");
    await mod.init();
    return mod as unknown as RapierModule;
  }
  const mod = await import("@dimforge/rapier2d-deterministic");
  return mod as unknown as RapierModule;
}
