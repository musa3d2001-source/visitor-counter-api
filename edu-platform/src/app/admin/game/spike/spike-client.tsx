"use client";

/**
 * [تجربة المرحلة 0 - كود مؤقت] غلاف عميل صغير لواجهة التجربة.
 *
 * الواجهة تُستورد مباشرة (لا next/dynamic ولا import() لمكوّن React): بوابة المرحلة 0
 * (scripts/check-game-bundle.mjs) قاست أن تحميل مكوّن React كسولًا في هذه الصفحة يعيد توزيع أجزاء Next
 * المشتركة فيكبر JS الأولي لكل الصفحات القائمة الـ49 بـ 52 بايتًا خامًا. three وRapier يبقيان كسولين
 * داخل spike-stage (loadEngine/loadRenderer)، وفرع import() فيهما محذوف من رسم SSR بشرط typeof window
 * (تتبّع الخادم للصفحة يبقى 356 ملفًا بلا wasm ولا @dimforge، يقيسه trace-report.mjs).
 */
import SpikeStage from "./spike-stage";
import type { LayoutMeta } from "./types";

export function SpikeClient({ layouts }: { layouts: LayoutMeta[] }) {
  return <SpikeStage layouts={layouts} />;
}
