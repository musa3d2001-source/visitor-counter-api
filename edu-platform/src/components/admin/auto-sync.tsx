"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <p className="text-xs text-muted" role="status">
      يتم تحديث حالة المعالجة تلقائيًا…
    </p>
  ) : null;
}
