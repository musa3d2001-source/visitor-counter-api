import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-[7rem] leading-none font-medium text-brand-700" aria-hidden>
          ٤٠٤
        </p>
        <h1 className="mt-2 text-[2.2rem]">الصفحة غير موجودة</h1>
        <p className="mt-2 text-ink-soft">ربما نُقلت أو لم تعد متاحة. ابدأ من صفك وستجد ما تبحث عنه.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/#grades" className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
            اختر صفك
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-line-strong px-5 font-semibold text-ink hover:border-brand-500">
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
