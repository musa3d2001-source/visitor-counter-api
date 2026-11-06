/**
 * [تجربة المرحلة 0 - كود مؤقت] تحميل Rapier على الخادم (Node): حزمة -compat فقط.
 * السبب (مقيس): إدخال الحزمة العادية في رسم الخادم يجعل محمّل wasm في Turbopack
 * ([turbopack-wasm]/node/loadWasm.ts) يطابق 27,420 ملفًا، فيتتبّع next build للمسار 13,724 ملفًا (652.2MB)،
 * وهو فوق حد دوال Vercel. -compat تضمّن WASM في JS فلا تحتاج محمّلًا ولا ملفًا خارجيًا.
 */
import type { RapierModule } from "./physics-adapter";

export async function loadRapierServer(): Promise<RapierModule> {
  const mod = await import("@dimforge/rapier2d-deterministic-compat");
  await mod.init();
  return mod as unknown as RapierModule;
}
