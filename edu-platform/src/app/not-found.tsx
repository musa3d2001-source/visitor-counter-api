import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <Compass className="size-8" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-bold">الصفحة غير موجودة</h1>
        <p className="mt-2 text-muted">ربما تم نقلها أو لم تعد متاحة.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
