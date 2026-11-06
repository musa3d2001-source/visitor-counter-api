import { Sparkle, SubjectArt, SubjectIcon } from "@/components/art";
import { ar, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * رسومات زخرفية لشرائط صفحات المنهج (aria-hidden، تملأ حاويتها h-40 w-60 في CatalogBand).
 * أغلفة كتب مائلة مكدّسة بألوان المواد، من أصناف النظام نفسها (.poster ‎.tone-*‎).
 */

/** غلاف كتاب صغير: كعب داكن على الحافة، شريط عنوان أبيض، وأيقونة المادة */
function MiniBook({ slug, className }: { slug: string; className?: string }) {
  return (
    <span className={cn("poster absolute block h-32 w-24 rounded-[0.9rem] rounded-s-[0.35rem] border-[3px] border-white shadow-[0_14px_26px_-14px_rgb(23_32_38/0.55)]", toneClass(slug), className)}>
      <span className="absolute inset-y-0 start-0 w-3 bg-[var(--d)] opacity-70" />
      <span className="absolute inset-x-4 top-3 ms-1 flex h-5 items-center justify-center rounded-md bg-white/90 text-[var(--b)]">
        <SubjectIcon slug={slug} size={12} />
      </span>
      <span className="absolute inset-x-4 top-11 bottom-3 ms-1 block">
        <SubjectArt slug={slug} />
      </span>
    </span>
  );
}

/** كتب ملونة مكدّسة + بطاقة نطاق صفحات: لقائمة الكتب */
export function BooksArt() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-8 inset-y-4 rounded-full bg-[#FFC531]/25 blur-xl" />
      <MiniBook slug="science" className="end-1 top-5 rotate-[9deg]" />
      <MiniBook slug="arabic" className="start-4 top-6 -rotate-[10deg]" />
      <MiniBook slug="math" className="start-[4.4rem] top-0 z-10 -rotate-2" />
      <span className="absolute start-0 bottom-1 z-20 flex -rotate-6 items-center gap-1.5 rounded-xl border-2 border-white bg-white px-2 py-1 font-display text-[0.8rem] font-black text-[#6A3FE0] shadow-[0_12px_20px_-12px_rgb(23_32_38/0.5)]">
        <span className="size-2 rounded-full bg-[#FFC531]" />
        ص {ar(45)} إلى {ar(52)}
      </span>
      <Sparkle className="absolute end-0 top-0 size-5 animate-twinkle" />
      <Sparkle className="absolute start-1 top-1 size-3.5 animate-twinkle [animation-delay:1s]" color="#17A398" />
    </div>
  );
}

/** غلاف الكتاب الحالي بلون مادته + علامات صفحات ملونة: لصفحة الكتاب */
export function BookCoverArt({ slug, edition }: { slug: string; edition: string }) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-10 inset-y-3 rounded-full bg-[var(--a)]/25 blur-xl" />
      {/* صفحات بيضاء خلف الغلاف */}
      <span className="absolute end-9 top-3 h-36 w-28 rotate-[8deg] rounded-[1rem] border-2 border-white bg-[#FFFBF2] shadow-[0_12px_22px_-14px_rgb(23_32_38/0.5)]" />
      <span className="absolute end-5 top-2 z-10 block h-36 w-28 rotate-[4deg]">
        <span className="poster absolute inset-0 block rounded-[1rem] rounded-s-[0.4rem] border-[3px] border-white shadow-[0_16px_28px_-14px_rgb(23_32_38/0.6)]">
          <span className="absolute inset-y-0 start-0 w-3.5 bg-[var(--d)] opacity-70" />
          <span className="absolute inset-x-4 top-12 bottom-3 ms-1 block">
            <SubjectArt slug={slug} />
          </span>
          <span className="absolute inset-x-3 top-3 ms-1.5 block truncate rounded-md bg-white/95 px-1.5 py-0.5 text-center font-display text-[0.72rem] font-black text-[var(--tink)]">
            {ar(edition)}
          </span>
        </span>
        {/* علامات صفحات بارزة من الحافة */}
        <span className="absolute -end-2 top-6 h-4 w-5 rounded-e-md bg-[#FFC531] shadow-xs" />
        <span className="absolute -end-2 top-12 h-4 w-5 rounded-e-md bg-[#FF6B5A] shadow-xs" />
        <span className="absolute -end-2 top-[4.5rem] h-4 w-5 rounded-e-md bg-[#4D8DFF] shadow-xs" />
      </span>
      <span className="absolute start-2 bottom-3 z-20 grid size-12 -rotate-6 place-items-center rounded-2xl border-2 border-white bg-white text-[var(--b)] shadow-card">
        <SubjectIcon slug={slug} size={22} />
      </span>
      <Sparkle className="absolute start-10 top-2 size-5 animate-twinkle" />
    </div>
  );
}
