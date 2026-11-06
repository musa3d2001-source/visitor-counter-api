"use client";

import dynamic from "next/dynamic";
import type { ServerReplay3 } from "./spike3d-runner";

/**
 * ‎ssr: false‎ يُخرج المشغّل (ومعه استيراد ‎.wasm‎ و three) من رسم SSR تمامًا. بدونه يترجم Turbopack الحزمة split
 * للخادم أيضًا، ويجرّ محمّل WASM في Node نمط ملفات ديناميكيًا يتتبّع آلاف الملفات في دالة الخادم.
 */
const Spike3dRunner = dynamic(() => import("./spike3d-runner").then((m) => m.Spike3dRunner), {
  ssr: false,
  loading: () => <p className="text-muted">جارٍ تجهيز أداة القياس…</p>,
});

export function Spike3dClient({ server }: { server: ServerReplay3 }) {
  return <Spike3dRunner server={server} />;
}
