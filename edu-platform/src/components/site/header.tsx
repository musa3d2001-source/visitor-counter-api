import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Suspense, type ReactNode } from "react";
import { ArrowLeft, LayoutDashboard, LogIn, UserRound } from "lucide-react";
import { Sparkle } from "@/components/art";
import { academicYearLabel } from "@/lib/design";
import { cn } from "@/lib/utils";
import { getCurrentUser, hasSessionCookie } from "@/server/auth/session";
import type { SessionUser } from "@/server/auth/session";
import { getCartIds } from "@/server/commerce/cart";
import { firstPreviewLesson, listGrades } from "@/server/catalog/public-data";
import { getPublicSettings } from "@/server/platform/public-settings";
import { storage } from "@/server/storage";
import { CartLink } from "./cart-link";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { Skeleton } from "@/components/ui/skeleton";

const navLink =
  "inline-flex min-h-11 items-center rounded-full px-4 font-display text-[1rem] font-bold text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700";

async function WithUser({ render }: { render: (user: SessionUser | null) => ReactNode }) {
  return render(await getCurrentUser());
}

/**
 * رأس الموقع: شريط الإعلان (العام الدراسي الحقيقي) + رأس زجاجي كريمي لاصق.
 * كل ما فيه يأتي من الذاكرة أو الكوكي، فيصل مع أول بايت. ما يخص المسجل وحده يُبث بعده في أماكن محجوزة بمقاسها.
 */
export async function SiteHeader() {
  const [sessionCookie, cartIds, grades, settings, preview] = await Promise.all([
    hasSessionCookie(),
    getCartIds(),
    listGrades(),
    getPublicSettings(),
    firstPreviewLesson().catch(() => null),
  ]);
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  const isStaff = (user: SessionUser | null) => user?.role === "admin" || user?.role === "teacher";
  const links = (user: SessionUser | null) => [
    { href: "/", label: "الرئيسية" },
    { href: "/teachers", label: "المعلمون" },
    { href: "/bundles", label: "الباقات" },
    ...(user ? [{ href: "/library", label: "مكتبتي" }, { href: "/account", label: "حسابي" }] : [{ href: "/login", label: "تسجيل الدخول" }, { href: "/register", label: "إنشاء حساب" }]),
    ...(isStaff(user) ? [{ href: "/admin", label: "لوحة التحكم" }] : []),
    { href: "/#faq", label: "الأسئلة الشائعة" },
  ];
  // بلا كوكي جلسة لا يوجد ما يُنتظر: شكل الزائر يُرسم مباشرة
  const forUser = (fallback: ReactNode, render: (user: SessionUser | null) => ReactNode) =>
    sessionCookie ? (
      <Suspense fallback={fallback}>
        <WithUser render={render} />
      </Suspense>
    ) : (
      render(null)
    );
  const stageName = grades[0]?.stageName;
  const first = grades[0];
  const last = grades[grades.length - 1];
  // المدى لا يُقال إلا إن كانت كل الصفوف بين طرفيه فيها محتوى فعلًا
  const contiguous = grades.every((g, i) => i === 0 || g.level === grades[i - 1].level + 1);
  const range = first && last && first.id !== last.id && contiguous ? `المحتوى من ${first.name} إلى ${last.name} متاح الآن` : "";
  const previewHref = preview ? `/watch/${preview.productId}?lesson=${preview.lessonId}` : null;
  const cartCount = cartIds.length;

  return (
    <>
      {/* شريط الإعلان: العام الدراسي من الإعدادات، ورابط معاينة حقيقي إن وُجد */}
      <div className="on-dark bg-linear-to-l from-[color-mix(in_oklab,var(--brand)_85%,var(--brand-hi))] via-brand-600 to-brand-800 text-white no-print">
        <div className="mx-auto flex min-h-11 max-w-7xl items-center justify-center gap-x-2.5 px-4 text-[0.9rem] leading-6 font-medium sm:px-6">
          <Sparkle className="size-3.5 shrink-0" color="#FFE29A" />
          <p className="min-w-0 truncate">
            <span className="font-bold">
              العام الدراسي <span className="num">{academicYearLabel(settings.academic_year)}</span>
            </span>
            {range ? <span className="hidden md:inline">: {range}</span> : null}
          </p>
          {previewHref ? (
            <Link
              href={previewHref}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1.5 font-display font-extrabold text-[#FFD25E] underline-offset-4 hover:underline focus-visible:outline-offset-[-3px]"
            >
              جرّب درسًا مجانًا
              <ArrowLeft className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <header className="glass sticky top-0 z-40 border-b border-[rgb(23_32_38/0.07)] no-print">
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-2 px-4 sm:h-[4.875rem] sm:gap-4 sm:px-6">
          <Logo name={settings.site_name} logoUrl={logoUrl} subtitle={stageName} size={44} />
          <nav aria-label="التنقل الرئيسي" className="ms-4 hidden items-center gap-0.5 lg:flex xl:ms-7">
            <Link href="/#grades" className={navLink}>
              الصفوف
            </Link>
            <Link href="/teachers" className={navLink}>
              المعلمون
            </Link>
            <Link href="/bundles" className={navLink}>
              الباقات
            </Link>
            {forUser(null, (user) =>
              user ? (
                <Link href="/library" className={navLink}>
                  مكتبتي
                </Link>
              ) : null,
            )}
          </nav>
          <div className="ms-auto flex items-center gap-2 sm:gap-2.5">
            {forUser(null, (user) =>
              isStaff(user) ? (
                <Link
                  href="/admin"
                  className="hidden min-h-11 items-center gap-1.5 rounded-full px-3.5 font-display text-[0.92rem] font-bold text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700 xl:inline-flex"
                >
                  <LayoutDashboard className="size-4.5" aria-hidden /> لوحة التحكم
                </Link>
              ) : null,
            )}
            <CartLink count={cartCount} stamp={randomUUID()} />
            {forUser(<Skeleton className="size-11 rounded-[15px] sm:size-12 md:w-[6.6rem]" />, (user) =>
              user ? (
                <Link href="/account" className={cn("btn btn-3d btn-primary btn-icon sm:size-12 sm:rounded-[15px] md:w-auto md:px-4")} aria-label="حسابي">
                  <UserRound aria-hidden />
                  <span className="hidden md:inline" aria-hidden>
                    حسابي
                  </span>
                </Link>
              ) : (
                <Link href="/login" className="btn btn-3d btn-primary btn-md min-h-11 px-4 sm:min-h-12 sm:rounded-[15px] sm:px-5">
                  <LogIn className="hidden sm:block" aria-hidden />
                  دخول
                </Link>
              ),
            )}
            {forUser(<Skeleton className="size-11 rounded-[15px] sm:size-12 lg:hidden" />, (user) => (
              <MobileNav
                grades={grades.map((g) => ({ href: `/grades/${g.slug}`, label: g.name, level: g.level }))}
                links={links(user)}
                siteName={settings.site_name}
                subtitle={stageName}
                signedIn={Boolean(user)}
              />
            ))}
          </div>
        </div>
      </header>
    </>
  );
}
