import Link from "next/link";
import { Hourglass, Lock, LogIn, ShoppingCart, Sparkles } from "lucide-react";
import { Price } from "@/components/ui/price";
import { Sparkle, SubjectArt } from "@/components/art";
import { cn } from "@/lib/utils";

/** إطار المسرح حول الفيديو: حافة زجاجية وهالة بلون المادة */
export function StageFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <span
        className="pointer-events-none absolute -inset-x-6 -top-8 -bottom-10 -z-10 rounded-[3rem] opacity-70 blur-3xl"
        style={{ background: "radial-gradient(60% 60% at 70% 30%, color-mix(in oklab, var(--a) 55%, transparent), transparent 70%)" }}
        aria-hidden
      />
      <div className="rounded-[1.6rem] bg-white/[0.07] p-1.5 shadow-[0_40px_80px_-36px_rgb(0_0_0/0.75)] ring-1 ring-white/15 sm:rounded-[2rem] sm:p-2">{children}</div>
    </div>
  );
}

type LockedReason = "not_ready" | "unauthenticated" | "forbidden";

/**
 * لوحة الدرس المقفل (سطح داكن .on-dark): سبب القفل، وسعر حقيقي ودعوة واضحة للشراء.
 * المعرّفات: data-testid="lesson-locked-panel" و "buy-from-locked".
 */
export function LockedStage({
  reason,
  loginHref,
  productHref,
  priceFils,
  compareAtFils,
  subjectSlug,
}: {
  reason: LockedReason;
  loginHref: string;
  productHref: string;
  priceFils: number | null;
  compareAtFils: number | null;
  subjectSlug: string | null;
}) {
  const processing = reason === "not_ready";
  return (
    <div
      className="on-dark relative isolate grid min-h-[19rem] place-items-center overflow-hidden rounded-[1.25rem] px-5 py-9 text-center text-white sm:aspect-video sm:min-h-0 sm:rounded-[1.5rem] sm:px-8"
      style={{
        background:
          "radial-gradient(60% 55% at 50% 50%, rgb(4 20 24 / 0.45), transparent 75%), radial-gradient(50% 70% at 100% 0%, color-mix(in oklab, var(--a) 70%, transparent), transparent 70%), radial-gradient(45% 60% at 0% 100%, color-mix(in oklab, var(--a) 40%, transparent), transparent 70%), linear-gradient(150deg, var(--b), color-mix(in oklab, var(--d) 70%, #04181c))",
      }}
      data-testid="lesson-locked-panel"
    >
      {/* نقاط وزخارف */}
      <span
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        style={{
          backgroundImage: "radial-gradient(rgb(255 255 255 / 0.16) 1.3px, transparent 1.7px)",
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(70% 70% at 50% 45%, #000 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(70% 70% at 50% 45%, #000 20%, transparent 75%)",
        }}
        aria-hidden
      />
      <span className="pointer-events-none absolute -end-6 -top-6 -z-10 hidden size-44 text-[var(--d)] opacity-60 sm:block md:size-56" aria-hidden>
        <SubjectArt slug={subjectSlug} />
      </span>
      <Sparkle className="pointer-events-none absolute start-[12%] top-[16%] size-5 animate-twinkle" />
      <Sparkle className="pointer-events-none absolute end-[14%] bottom-[18%] size-4 animate-twinkle [animation-delay:1.2s]" color="#fff" />

      <div className="max-w-[30rem]">
        <span
          className={cn(
            "mx-auto grid size-16 place-items-center rounded-[1.25rem] shadow-[0_5px_0_var(--accent-edge),0_18px_30px_-12px_rgb(0_0_0/0.6)] sm:size-[4.5rem]",
            processing ? "bg-white/15 text-white" : "bg-[linear-gradient(180deg,var(--accent-hi),var(--accent))] text-[var(--accent-ink)]",
          )}
          aria-hidden
        >
          {processing ? <Hourglass className="size-8" /> : <Lock className="size-8" strokeWidth={2.4} />}
        </span>

        {processing ? (
          <>
            <p className="mt-5 font-display text-[clamp(1.45rem,1.1rem+1.4vw,2rem)] leading-tight font-black">الدرس قيد المعالجة</p>
            <p className="mt-2 text-[0.98rem] text-white/80">سيكون متاحًا للمشاهدة بعد اكتمال المعالجة.</p>
          </>
        ) : reason === "unauthenticated" ? (
          <>
            <p className="mt-5 font-display text-[clamp(1.45rem,1.1rem+1.4vw,2rem)] leading-tight font-black">سجّل الدخول لمشاهدة هذا الدرس</p>
            <p className="mt-2 text-[0.98rem] text-white/80">إذا اشتريت المحتوى، سجّل الدخول بنفس الحساب.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href={loginHref} className="btn btn-3d btn-light btn-md">
                <LogIn aria-hidden /> تسجيل الدخول
              </Link>
              <Link href={productHref} className="btn btn-3d btn-accent btn-md">
                <ShoppingCart aria-hidden /> اشترِ للوصول لكل الدروس
              </Link>
            </div>
            {priceFils !== null ? <LockedPrice fils={priceFils} compareAt={compareAtFils} /> : null}
          </>
        ) : (
          <>
            <p className="mt-5 font-display text-[clamp(1.45rem,1.1rem+1.4vw,2rem)] leading-tight font-black">هذا الدرس لمن اشترى المحتوى</p>
            <p className="mt-2 text-[0.98rem] text-white/80">اشترِ المحتوى للوصول لكل الدروس ومتابعة التقدم.</p>
            <Link href={productHref} className="btn btn-3d btn-accent btn-lg mt-6" data-testid="buy-from-locked">
              <ShoppingCart aria-hidden /> اشترِ للوصول لكل الدروس
            </Link>
            {priceFils !== null ? <LockedPrice fils={priceFils} compareAt={compareAtFils} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function LockedPrice({ fils, compareAt }: { fils: number; compareAt: number | null }) {
  if (fils <= 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-white/80">
      <span className="font-display text-[0.9rem] font-bold">السعر</span>
      <Price fils={fils} compareAt={compareAt} size="md" tone="light" />
    </div>
  );
}

/** ملاحظة مسرح عامة (الفيديو متوقف/لا دروس) على السطح الداكن */
export function StageNotice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="on-dark grid min-h-[15rem] place-items-center rounded-[1.25rem] bg-white/[0.06] px-6 py-10 text-center text-white ring-1 ring-white/10 sm:aspect-video sm:min-h-0 sm:rounded-[1.5rem]" role="status">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/12 text-[#ffd25e]" aria-hidden>
          <Sparkles className="size-7" />
        </span>
        <p className="mt-4 font-display text-[1.4rem] leading-tight font-black">{title}</p>
        {children ? <p className="mt-2 text-white/75">{children}</p> : null}
      </div>
    </div>
  );
}
