"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type * as React from "react";
import { Dialog } from "radix-ui";
import {
  Activity,
  BadgeCheck,
  ChartColumn,
  ExternalLink,
  FileText,
  GraduationCap,
  House,
  Layers,
  Mail,
  Menu,
  Package,
  Receipt,
  Rocket,
  Settings,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
  ScrollText,
} from "lucide-react";
import { LogoMark, Sparkle } from "@/components/art";
import { ar, initial } from "@/lib/design";
import { cn } from "@/lib/utils";
import { toneStyle, type AdminTone } from "./tones";

export type StaffRole = "owner" | "teacher";

type NavItem = { href: string; label: string; Icon: LucideIcon; exact?: boolean; badge?: "review"; tone: AdminTone };
type NavGroup = { title?: string; items: NavItem[] };

/** قائمة المالك: كل شيء، مقسمة لمجموعات حسب طبيعة العمل */
const OWNER_GROUPS: NavGroup[] = [
  {
    title: "نظرة عامة",
    items: [
      { href: "/admin", label: "الرئيسية", Icon: House, exact: true, tone: "teal" },
      { href: "/admin/reports", label: "التقارير", Icon: ChartColumn, tone: "violet" },
    ],
  },
  {
    title: "المحتوى",
    items: [
      { href: "/admin/products", label: "المحتوى والمنتجات", Icon: FileText, tone: "sky" },
      { href: "/admin/review", label: "مراجعة المحتوى", Icon: BadgeCheck, badge: "review", tone: "gold" },
      { href: "/admin/content-health", label: "سلامة المحتوى", Icon: ShieldCheck, tone: "coral" },
      { href: "/admin/teachers", label: "المعلمون", Icon: GraduationCap, tone: "pink" },
      { href: "/admin/catalog", label: "المراحل والمواد", Icon: Layers, tone: "green" },
      { href: "/admin/bundles", label: "الباقات والدورات", Icon: Package, tone: "coral" },
    ],
  },
  {
    title: "المبيعات والطلاب",
    items: [
      { href: "/admin/orders", label: "الطلبات والمدفوعات", Icon: Receipt, tone: "green" },
      { href: "/admin/students", label: "الطلاب", Icon: Users, tone: "sky" },
      { href: "/admin/coupons", label: "الكوبونات", Icon: Ticket, tone: "coral" },
    ],
  },
  {
    title: "المنصة",
    items: [
      { href: "/admin/launch", label: "خطوات الإطلاق", Icon: Rocket, tone: "green" },
      { href: "/admin/settings", label: "إعدادات المنصة", Icon: Settings, tone: "slate" },
      { href: "/admin/mail", label: "البريد الصادر", Icon: Mail, tone: "sky" },
      { href: "/admin/ops", label: "صحة المنصة", Icon: Activity, tone: "coral" },
      { href: "/admin/security", label: "أمان الحساب", Icon: ShieldCheck, tone: "teal" },
    ],
  },
];

/** قائمة المعلم: محتواه وأرقامه فقط */
const TEACHER_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/admin", label: "الرئيسية", Icon: House, exact: true, tone: "teal" },
      { href: "/admin/products", label: "محتواي", Icon: FileText, tone: "sky" },
      { href: "/admin/earnings", label: "أرباحي ومبيعاتي", Icon: Wallet, tone: "gold" },
      { href: "/admin/profile", label: "ملفي التعريفي", Icon: UserRound, tone: "pink" },
      { href: "/admin/agreement", label: "اتفاقية المعلم", Icon: ScrollText, tone: "violet" },
    ],
  },
];

function groupsFor(role: StaffRole) {
  return role === "owner" ? OWNER_GROUPS : TEACHER_GROUPS;
}

/** القائمة المسطحة (للاستخدام خارج الشريط الجانبي) */
export function navFor(role: StaffRole) {
  return groupsFor(role).flatMap((g) => g.items);
}

function isActive(item: Pick<NavItem, "href" | "exact">, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** عنصر القائمة المطابق لمسار معيّن (الأيقونة واللون في رأس الصفحة) */
export function navMatch(pathname: string): Pick<NavItem, "Icon" | "tone" | "label"> | null {
  const all = [...navFor("owner"), ...navFor("teacher")];
  // الأطول أولًا حتى لا يطابق «/admin» كل المسارات
  const hit = all.sort((a, b) => b.href.length - a.href.length).find((n) => isActive(n, pathname));
  return hit ?? null;
}

/** مربع الأيقونة الملوّن للقائمة */
function NavSquircle({ Icon, tone, active }: { Icon: LucideIcon; tone: AdminTone; active: boolean }) {
  return (
    <span
      style={toneStyle(tone)}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[0.8rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] text-[var(--icon)] transition-transform duration-200",
        "shadow-[inset_0_-3px_0_rgb(0_0_0/0.16),inset_0_1px_0_rgb(255_255_255/0.3),0_6px_12px_-6px_rgb(0_0_0/0.45)]",
        active ? "scale-105" : "opacity-[0.92] group-hover:scale-105 group-hover:opacity-100 motion-reduce:group-hover:scale-100",
      )}
      aria-hidden
    >
      <Icon className="size-[1.1rem]" strokeWidth={2.2} />
    </span>
  );
}

function NavList({ role, pendingReview, onNavigate }: { role: StaffRole; pendingReview: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="قائمة لوحة التحكم" className="flex flex-col gap-4">
      {groupsFor(role).map((group, gi) => (
        <div key={group.title ?? gi}>
          {group.title ? <p className="mb-1.5 px-3 font-display text-[0.72rem] font-extrabold tracking-wide text-white/55">{group.title}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const { href, label, Icon, badge, tone } = item;
              const active = isActive(item, pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-11 items-center gap-3 rounded-2xl py-1 ps-2 pe-3 font-display text-[0.95rem] transition-colors",
                      active
                        ? "bg-white/[0.13] font-extrabold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_10px_22px_-14px_rgb(0_0_0/0.6)]"
                        : "font-bold text-white/80 hover:bg-white/[0.07] hover:text-white",
                    )}
                  >
                    {active ? (
                      <span
                        className="absolute -start-3 top-1/2 h-7 w-1.5 -translate-y-1/2 rounded-e-full bg-accent shadow-[0_0_14px_2px_rgb(255_197_49/0.55)]"
                        aria-hidden
                      />
                    ) : null}
                    <NavSquircle Icon={Icon} tone={tone} active={active} />
                    <span className="min-w-0 flex-1 leading-snug">{label}</span>
                    {badge === "review" && pendingReview > 0 ? (
                      <span
                        className="grid h-6 min-w-6 place-items-center rounded-full bg-coral px-1.5 font-display text-[0.78rem] font-black text-white shadow-[0_0_0_3px_rgb(255_111_89/0.25)]"
                        aria-label={`${ar(pendingReview)} بانتظار المراجعة`}
                      >
                        {ar(pendingReview)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function roleLabel(role: StaffRole) {
  return role === "owner" ? "لوحة المالك" : "لوحة المعلم";
}

/** رأس الشريط: الشعار + اسم المنصة + كبسولة الدور */
function Brand({ siteName, role, logoUrl, as: As = "p" }: { siteName: string; role: StaffRole; logoUrl?: string | null; as?: React.ElementType }) {
  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[15px] bg-white shadow-card">
          <Image src={logoUrl} alt="" width={44} height={44} className="size-full object-contain p-1" />
        </span>
      ) : (
        <LogoMark size={44} className="shrink-0 drop-shadow-[0_8px_14px_rgb(0_0_0/0.35)]" />
      )}
      <As className="flex min-w-0 flex-col items-start gap-1">
        <span className="max-w-full truncate font-display text-[1.25rem] leading-tight font-black text-white">{siteName}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 font-display text-[0.72rem] leading-6 font-extrabold",
            role === "owner" ? "bg-accent text-accent-900" : "bg-brand-200 text-brand-900",
          )}
        >
          {roleLabel(role)}
        </span>
      </As>
    </div>
  );
}

/** بطاقة المستخدم أسفل الشريط + رابط الموقع */
function UserFoot({ adminName, role }: { adminName?: string; role: StaffRole }) {
  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-2.5 rounded-2xl bg-black/15 p-2 ring-1 ring-white/10">
        {adminName ? (
          <>
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#FFE08A] to-accent font-display text-[1.05rem] font-black text-accent-900 shadow-[0_0_0_3px_rgb(255_255_255/0.12)]"
              aria-hidden
            >
              {initial(adminName)}
            </span>
            <p className="min-w-0 flex-1 text-[0.74rem] leading-5 text-white/65">
              مسجّل الدخول باسم <span className="block truncate font-display text-[0.9rem] font-extrabold text-white">{adminName}</span>
              <span className="sr-only">، {roleLabel(role)}</span>
            </p>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <Link
          href="/"
          target="_blank"
          title="عرض الموقع"
          aria-label="عرض الموقع (يفتح في نافذة جديدة)"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-accent ring-1 ring-white/15 transition-colors hover:bg-white/20"
        >
          <ExternalLink className="size-[1.15rem]" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** خلفية الشريط الفيروزية الداكنة مع وهج ذهبي ونقاط */
const NIGHT =
  "on-dark relative isolate overflow-hidden text-white bg-[radial-gradient(120%_40%_at_100%_0%,rgb(255_197_49/0.22),transparent_60%),radial-gradient(90%_40%_at_0%_100%,color-mix(in_oklab,var(--brand-glow)_22%,transparent),transparent_65%),linear-gradient(180deg,var(--brand-edge),var(--brand-deep)_55%,var(--brand-night))]";

function NightDecor() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.09)_1.2px,transparent_1.6px)] bg-[length:20px_20px] [mask-image:linear-gradient(180deg,#000,transparent_35%,transparent_70%,#000)]"
        aria-hidden
      />
      <Sparkle className="animate-twinkle pointer-events-none absolute end-24 top-3 -z-10 size-4 opacity-80" />
      <Sparkle className="animate-twinkle pointer-events-none absolute start-8 bottom-40 -z-10 size-2.5 opacity-60 [animation-delay:1.4s]" color="#9BEBD8" />
    </>
  );
}

export function AdminSidebar({
  siteName,
  adminName,
  role,
  pendingReview = 0,
  logoUrl,
}: {
  siteName: string;
  adminName: string;
  role: StaffRole;
  pendingReview?: number;
  logoUrl?: string | null;
}) {
  return (
    <aside className={cn(NIGHT, "sticky top-0 hidden h-dvh w-72 shrink-0 flex-col shadow-[-18px_0_40px_-28px_rgb(6_63_60/0.55)] lg:flex")}>
      <NightDecor />
      <div className="px-5 pt-5 pb-4">
        <Link href="/admin" className="block rounded-2xl" aria-label={`${siteName}، ${roleLabel(role)}`}>
          <Brand siteName={siteName} role={role} logoUrl={logoUrl} as="span" />
        </Link>
      </div>
      <div className="mx-5 h-px bg-linear-to-l from-transparent via-white/20 to-transparent" aria-hidden />
      <div className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]">
        <NavList role={role} pendingReview={pendingReview} />
      </div>
      <UserFoot adminName={adminName} role={role} />
    </aside>
  );
}

export function AdminMobileNav({
  siteName,
  role,
  pendingReview = 0,
  adminName,
  logoUrl,
}: {
  siteName: string;
  role: StaffRole;
  pendingReview?: number;
  adminName?: string;
  logoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const current = navFor(role)
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => isActive(n, pathname));
  return (
    <div className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line px-3 sm:px-5 lg:hidden">
      <Link href="/admin" className="grid size-11 shrink-0 place-items-center rounded-[15px]" aria-label={`${siteName}، ${roleLabel(role)}`}>
        {logoUrl ? (
          <span className="grid size-10 place-items-center overflow-hidden rounded-[13px] bg-white shadow-card">
            <Image src={logoUrl} alt="" width={40} height={40} className="size-full object-contain p-1" />
          </span>
        ) : (
          <LogoMark size={40} className="drop-shadow-[0_6px_10px_rgb(6_80_75/0.25)]" />
        )}
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-display text-[1.05rem] font-black text-brand-800">{siteName}</p>
        <p className="truncate font-display text-[0.75rem] font-bold text-muted">
          {roleLabel(role)}
          {current ? <span className="text-ink-soft"> · {current.label}</span> : null}
        </p>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button className="btn btn-3d btn-outline btn-icon relative shrink-0" aria-label="فتح قائمة الإدارة">
            <Menu aria-hidden />
            {role === "owner" && pendingReview > 0 ? <span className="absolute -end-1 -top-1 size-3 rounded-full bg-coral ring-2 ring-white" aria-hidden /> : null}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(6_30_29/0.5)] backdrop-blur-[2px]" />
          <Dialog.Content
            dir="rtl"
            className={cn(NIGHT, "fixed inset-y-0 start-0 z-50 flex w-[86%] max-w-[20rem] flex-col rounded-s-none rounded-e-[1.75rem] shadow-pop outline-none")}
          >
            <NightDecor />
            <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-4">
              <Dialog.Title asChild>
                <div>
                  <Brand siteName={siteName} role={role} logoUrl={logoUrl} as="span" />
                </div>
              </Dialog.Title>
              <Dialog.Close
                className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 transition-colors hover:bg-white/20"
                aria-label="إغلاق"
              >
                <X className="size-5" aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">روابط لوحة الإدارة</Dialog.Description>
            <div className="mx-4 h-px bg-linear-to-l from-transparent via-white/20 to-transparent" aria-hidden />
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <NavList role={role} pendingReview={pendingReview} onNavigate={() => setOpen(false)} />
            </div>
            <UserFoot adminName={adminName} role={role} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
