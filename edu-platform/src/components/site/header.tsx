import Link from "next/link";
import { LayoutDashboard, ShoppingCart, UserRound } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { getCartIds } from "@/server/commerce/cart";
import { listGrades } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { storage } from "@/server/storage";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";

const navLink = "rounded-md px-3 py-2 text-[0.95rem] font-medium text-ink-soft transition-colors hover:text-brand-700";

export async function SiteHeader() {
  const [user, cartIds, grades, settings] = await Promise.all([getCurrentUser(), getCartIds(), listGrades(), getSettings()]);
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  const staff = user?.role === "admin" || user?.role === "teacher";
  const links = [
    { href: "/", label: "الرئيسية" },
    { href: "/teachers", label: "المعلمون" },
    { href: "/bundles", label: "الباقات" },
    ...(user ? [{ href: "/library", label: "مكتبتي" }, { href: "/account", label: "حسابي" }] : [{ href: "/login", label: "تسجيل الدخول" }, { href: "/register", label: "إنشاء حساب" }]),
    ...(staff ? [{ href: "/admin", label: "لوحة التحكم" }] : []),
    { href: "/#faq", label: "الأسئلة الشائعة" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:h-[4.5rem] sm:gap-6">
        <MobileNav grades={grades.map((g) => ({ href: `/grades/${g.slug}`, label: g.name }))} links={links} siteName={settings.site_name} />
        <Logo name={settings.site_name} logoUrl={logoUrl} />
        <nav aria-label="التنقل الرئيسي" className="hidden items-center lg:flex">
          <Link href="/#grades" className={navLink}>
            الصفوف
          </Link>
          <Link href="/teachers" className={navLink}>
            المعلمون
          </Link>
          <Link href="/bundles" className={navLink}>
            الباقات
          </Link>
          {user ? (
            <Link href="/library" className={navLink}>
              مكتبتي
            </Link>
          ) : null}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          {staff ? (
            <Link href="/admin" className="hidden h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:bg-mist xl:flex">
              <LayoutDashboard className="size-4.5" aria-hidden /> لوحة التحكم
            </Link>
          ) : null}
          <Link href="/cart" className="relative grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-mist" aria-label={`السلة (${cartIds.length})`}>
            <ShoppingCart className="size-5.5" aria-hidden />
            {cartIds.length ? (
              <span className="num absolute end-1 top-1 grid min-w-5 place-items-center rounded-full bg-accent-600 px-1 text-[0.7rem] font-bold text-ink" data-testid="cart-count">
                {cartIds.length}
              </span>
            ) : null}
          </Link>
          {user ? (
            <Link href="/account" className="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-mist" aria-label="حسابي">
              <UserRound className="size-5.5" aria-hidden />
            </Link>
          ) : (
            <Link href="/login" className="ms-1 flex h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
              دخول
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
