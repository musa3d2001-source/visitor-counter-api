"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <TriangleAlert className="mx-auto size-12 text-danger" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-muted">حاول مرة أخرى، وإذا تكرر الخطأ تواصل معنا.</p>
      <Button className="mt-6" onClick={reset}>
        إعادة المحاولة
      </Button>
    </div>
  );
}
