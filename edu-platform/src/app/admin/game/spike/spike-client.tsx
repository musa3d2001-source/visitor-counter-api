"use client";

import dynamic from "next/dynamic";
import type { ServerReplay } from "./spike-runner";

/**
 * ‎ssr: false‎ يُخرج المشغّل (ومعه استيراد ‎.wasm‎) من رسم SSR تمامًا. بدونه يترجم Turbopack الحزمة split
 * للخادم أيضًا، ويجرّ محمّل WASM في Node نمط ملفات ديناميكيًا يتتبّع آلاف الملفات في دالة الخادم.
 */
const SpikeRunner = dynamic(() => import("./spike-runner").then((m) => m.SpikeRunner), {
  ssr: false,
  loading: () => <p className="text-muted">جارٍ تجهيز أداة القياس…</p>,
});

export function SpikeClient({ server }: { server: ServerReplay }) {
  return <SpikeRunner server={server} />;
}
