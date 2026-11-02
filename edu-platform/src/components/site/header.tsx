import Link from "next/link";
import { LayoutDashboard, Library, ShoppingCart, UserRound } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { getCartIds } from "@/server/commerce/cart";
import { listGrades } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { storage } from "@/server/storage";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const [user, cartIds, grades, settings] = await Promise.all([getCurrentUser(), getCartIds(), listGrades(), getSettings()]);
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  const gradeLinks = grades.map((g) => ({ href: `/grades/${g.slug}`, label: g.name.replace("الصف ", "") }));
  const links = [
    { href: "/", label: "الرئيسية" },
    { href: "/bundles", label: "الباقات والعروض" },
    ...(user ? [{ href: "/library", label: "مكتبتي" }, { href: "/account", label: "حسابي" }] : [{ href: "/login", label: "تسجيل الدخول" }, { href: "/register", label: "إنشاء حساب" }]),
    ...(user?.role === "admin" ? [{ href: "/admin", label: "لوحة الإدارة" }] : []),
    { href: "/#faq", label: "الأسئلة الشائعة" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/90 backdrop-blur-md no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <MobileNav grades={gradeLinks.map((g) => ({ ...g, label: `الصف ${g.label}` }))} links={links} siteName={settings.site_name} />
        <Logo name={settings.site_name} logoUrl={logoUrl} />
        <nav aria-label="التنقل الرئيسي" className="ms-6 hidden items-center gap-1 md:flex">
          {grades.slice(0, 6).map((g) => (
            <Link key={g.id} href={`/grades/${g.slug}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-brand-50 hover:text-brand-700">
              {g.name}
            </Link>
          ))}
          <Link href="/bundles" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-brand-50 hover:text-brand-700">
            الباقات
          </Link>
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          {user?.role === "admin" ? (
            <Link href="/admin" className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-soft hover:bg-brand-50 lg:flex">
              <LayoutDashboard className="size-4.5" aria-hidden /> الإدارة
            </Link>
          ) : null}
          {user ? (
            <Link href="/library" className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-soft hover:bg-brand-50 sm:flex">
              <Library className="size-4.5" aria-hidden /> مكتبتي
            </Link>
          ) : null}
          <Link href="/cart" className="relative grid size-10 place-items-center rounded-xl text-ink-soft hover:bg-brand-50" aria-label={`السلة (${cartIds.length})`}>
            <ShoppingCart className="size-5.5" aria-hidden />
            {cartIds.length ? (
              <span className="num absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-600 px-1 text-[0.7rem] font-bold text-ink" data-testid="cart-count">
                {cartIds.length}
              </span>
            ) : null}
          </Link>
          {user ? (
            <Link href="/account" className="grid size-10 place-items-center rounded-xl text-ink-soft hover:bg-brand-50" aria-label="حسابي">
              <UserRound className="size-5.5" aria-hidden />
            </Link>
          ) : (
            <Link href="/login" className="hidden h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 sm:flex">
              دخول
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
