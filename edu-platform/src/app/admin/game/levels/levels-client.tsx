"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import type { LevelSummary, PlayRequest } from "./levels-runner";

/**
 * ‎ssr: false‎ يُخرج المشغّل (ومعه three و Rapier و ‎.wasm‎) من رسم SSR تمامًا. بدونه يترجم Turbopack الحزمة split
 * للخادم أيضًا، ويجرّ محمّل WASM في Node نمط ملفات ديناميكيًا يتتبّع آلاف الملفات في دالة الخادم.
 */
const LevelsRunner = dynamic(() => import("./levels-runner").then((m) => m.LevelsRunner), {
  ssr: false,
  loading: () => <p className="text-muted">جارٍ تجهيز المعاينة…</p>,
});

/**
 * طلب اللعب من أزرار البطاقات (تُصيَّر في مكوّن الخادم) إلى المشغّل: مخزن صغير في هذه الوحدة،
 * فالضغطة قبل اكتمال تحميل المشغّل لا تضيع (يقرأ آخر طلب عند تركيبه).
 */
let request: PlayRequest | null = null;
let nonce = 0;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const getRequest = () => request;
const getServerRequest = () => null;
function notify() {
  for (const cb of [...listeners]) cb();
}
/** المشغّل يستهلك الطلب بعد بدء اللعب، فلا يُفتح من جديد إذا رُكّب ثانيةً (العودة إلى الصفحة) */
function consume() {
  if (!request) return;
  request = null;
  notify();
}

export function PlayLevelButton({ levelKey, title }: { levelKey: string; title: string }) {
  return (
    <button
      type="button"
      className="btn btn-3d btn-accent btn-md min-h-11 w-full"
      aria-label={`العب «${title}» بملء الشاشة`}
      data-testid={`levels-play-${levelKey}`}
      onClick={() => {
        nonce++;
        request = { key: levelKey, nonce };
        notify();
      }}
    >
      العب
    </button>
  );
}

export function LevelsClient({ levels }: { levels: LevelSummary[] }) {
  const req = useSyncExternalStore(subscribe, getRequest, getServerRequest);
  return <LevelsRunner levels={levels} request={req} onConsume={consume} />;
}
