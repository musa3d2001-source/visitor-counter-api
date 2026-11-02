"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-danger/20 bg-surface p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-lg bg-danger-50 text-danger">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-bold">تعذر تحميل هذه الصفحة</h1>
      <p className="mt-2 text-sm leading-7 text-muted">حدث خطأ أثناء جلب البيانات. يمكنك إعادة المحاولة، وإن تكرر الخطأ راجع سجلات الخادم.</p>
      {error.digest ? <p className="num mt-2 text-xs text-muted">رمز الخطأ: {error.digest}</p> : null}
      <Button className="mt-6" onClick={reset}>
        إعادة المحاولة
      </Button>
    </div>
  );
}
