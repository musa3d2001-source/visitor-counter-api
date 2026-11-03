"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncLessonsAction } from "@/app/admin/products/actions";

/** يحدّث حالة معالجة الفيديو تلقائيًا كل فترة ما دام هناك درس قيد المعالجة */
export function AutoSyncLessons({ productId, active, intervalMs = 15000 }: { productId: string; active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const fd = new FormData();
      fd.set("productId", productId);
      try {
        await syncLessonsAction(null, fd);
      } catch {
        /* تجاهل — نعيد المحاولة في الدورة التالية */
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [active, productId, intervalMs, router]);
  return active ? (
    <p className="inline-flex min-h-8 items-center gap-2 rounded-full bg-sky-50 px-3 font-display text-[0.8rem] font-bold text-sky-700 ring-1 ring-sky/20 ring-inset" role="status">
      <RefreshCw className="size-3.5 motion-safe:animate-spin motion-safe:[animation-duration:2.5s]" aria-hidden />
      يتم تحديث حالة المعالجة تلقائيًا…
    </p>
  ) : null;
}
