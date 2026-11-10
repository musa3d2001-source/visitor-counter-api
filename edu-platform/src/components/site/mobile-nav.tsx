"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import {
  BadgePercent,
  ChevronLeft,
  CircleHelp,
  House,
  LayoutDashboard,
  LibraryBig,
  LogIn,
  Menu,
  UserPlus,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/art";
import { ar, gradeClass } from "@/lib/design";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; level?: number };

const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/teachers": Users,
  "/bundles": BadgePercent,
  "/library": LibraryBig,
  "/account": UserRound,
  "/login": LogIn,
  "/register": UserPlus,
  "/admin": LayoutDashboard,
  "/#faq": CircleHelp,
};

/** قائمة الجوال: لوح جانبي كريمي، بطاقات صفوف ملونة، وروابط كبيرة سهلة اللمس بأيقونات */
export function MobileNav({
  grades,
  links,
  siteName,
  subtitle,
  signedIn,
}: {
  grades: NavLink[];
  links: NavLink[];
  siteName: string;
  subtitle?: string;
  signedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const primary = links.filter((l) => !["/login", "/register"].includes(l.href));
  const auth = links.filter((l) => ["/login", "/register"].includes(l.href));
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="grid size-11 place-items-center rounded-[15px] border border-[rgb(23_32_38/0.07)] bg-white text-ink shadow-card transition-transform hover:-translate-y-px sm:size-12 lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="size-5.5" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(6_30_28/0.45)] backdrop-blur-[3px] data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
        <Dialog.Content
          dir="rtl"
          className="bg-sunny fixed inset-y-0 start-0 z-50 flex w-[88%] max-w-sm flex-col overflow-hidden rounded-e-[2rem] shadow-pop outline-none"
        >
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <LogoMark size={42} />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-xl leading-tight font-black text-brand-800">{siteName}</Dialog.Title>
              {subtitle ? <p className="text-[0.78rem] leading-5 font-bold text-muted">{subtitle}</p> : null}
            </div>
            <Dialog.Close
              className="grid size-11 place-items-center rounded-[15px] border border-[rgb(23_32_38/0.07)] bg-white text-ink shadow-card"
              aria-label="إغلاق القائمة"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">روابط التنقل في المنصة</Dialog.Description>
          <nav className="flex-1 overflow-y-auto px-4 pb-6">
            {grades.length ? (
              <>
                <p className="mt-2 mb-2.5 font-display text-[0.85rem] font-extrabold text-muted">اختر صفك</p>
                <ul className="mb-5 grid grid-cols-2 gap-2.5">
                  {grades.map((g) => (
                    <li key={g.href} className={gradeClass(g.level)}>
                      <Link prefetch={false}
                        href={g.href}
                        className="flex min-h-15 items-center gap-2.5 rounded-[1.1rem] border-2 border-[color-mix(in_oklab,var(--d)_14%,white)] bg-white p-2 font-display text-[0.95rem] leading-snug font-extrabold text-ink shadow-[0_4px_0_color-mix(in_oklab,var(--d)_60%,white)] transition-transform active:translate-y-0.5"
                      >
                        {g.level ? (
                          <span className="num-tile size-10 rounded-xl text-[1.3rem]" aria-hidden>
                            {ar(g.level)}
                          </span>
                        ) : null}
                        <span className="flex min-w-0 flex-col leading-tight">
                          {/^الصف\s+/.test(g.label) ? (
                            <>
                              <span className="text-[0.72rem] font-bold text-muted">الصف</span>
                              <span className="truncate">{g.label.replace(/^الصف\s+/, "")}</span>
                            </>
                          ) : (
                            g.label
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <ul className="flex flex-col gap-1 rounded-[1.4rem] bg-white p-1.5 shadow-card">
              {primary.map((l) => {
                const Icon = ICONS[l.href] ?? ChevronLeft;
                const active = l.href === pathname;
                return (
                  <li key={l.href}>
                    <Link prefetch={false}
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-13 items-center gap-3 rounded-[1rem] px-3 font-display text-[1.02rem] font-extrabold text-ink transition-colors hover:bg-brand-50",
                        active && "bg-brand-50 text-brand-800",
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <Icon className="size-[1.15rem]" aria-hidden />
                      </span>
                      <span className="flex-1">{l.label}</span>
                      <ChevronLeft className="size-4 text-muted/60" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {!signedIn && auth.length ? (
              <div className="mt-5 grid gap-3">
                {auth.map((l, i) => (
                  <Link prefetch={false} key={l.href} href={l.href} className={cn("btn btn-3d btn-lg w-full", i === 0 ? "btn-primary" : "btn-outline")}>
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
