"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import {
  BadgeCheck,
  ChartColumn,
  ExternalLink,
  FileText,
  GraduationCap,
  House,
  Layers,
  Menu,
  Package,
  Receipt,
  Settings,
  Ticket,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffRole = "owner" | "teacher";

type NavItem = { href: string; label: string; Icon: LucideIcon; exact?: boolean; badge?: "review" };

/** قائمة المالك: كل شيء */
const OWNER_NAV: NavItem[] = [
  { href: "/admin", label: "الرئيسية", Icon: House, exact: true },
  { href: "/admin/products", label: "المحتوى والمنتجات", Icon: FileText },
  { href: "/admin/review", label: "مراجعة المحتوى", Icon: BadgeCheck, badge: "review" },
  { href: "/admin/teachers", label: "المعلمون", Icon: GraduationCap },
  { href: "/admin/catalog", label: "المراحل والمواد", Icon: Layers },
  { href: "/admin/bundles", label: "الباقات والدورات", Icon: Package },
  { href: "/admin/orders", label: "الطلبات والمدفوعات", Icon: Receipt },
  { href: "/admin/students", label: "الطلاب", Icon: Users },
  { href: "/admin/coupons", label: "الكوبونات", Icon: Ticket },
  { href: "/admin/reports", label: "التقارير", Icon: ChartColumn },
  { href: "/admin/settings", label: "إعدادات المنصة", Icon: Settings },
];

/** قائمة المعلم: محتواه وأرقامه فقط */
const TEACHER_NAV: NavItem[] = [
  { href: "/admin", label: "الرئيسية", Icon: House, exact: true },
  { href: "/admin/products", label: "محتواي", Icon: FileText },
  { href: "/admin/earnings", label: "أرباحي ومبيعاتي", Icon: Wallet },
  { href: "/admin/profile", label: "ملفي التعريفي", Icon: UserRound },
];

export function navFor(role: StaffRole) {
  return role === "owner" ? OWNER_NAV : TEACHER_NAV;
}

function NavList({ role, pendingReview, onNavigate }: { role: StaffRole; pendingReview: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="قائمة لوحة التحكم" className="flex flex-col gap-0.5">
      {navFor(role).map(({ href, label, Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
              active ? "bg-surface text-ink shadow-[inset_-3px_0_0_var(--color-brand-600)]" : "text-ink-soft hover:bg-surface/70 hover:text-ink",
            )}
          >
            <Icon className={cn("size-4.5 shrink-0", active ? "text-brand-700" : "text-muted")} aria-hidden />
            <span className="flex-1">{label}</span>
            {badge === "review" && pendingReview > 0 ? (
              <span className={cn("num grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold", "bg-accent-600 text-ink")} aria-label={`${pendingReview} بانتظار المراجعة`}>
                {pendingReview}
              </span>
            ) : null}
          </Link>
        );
      })}
      <Link
        href="/"
        target="_blank"
        className="mt-4 flex min-h-10 items-center gap-3 border-t border-line-strong px-3 pt-4 text-sm font-semibold text-muted hover:text-brand-700"
      >
        <ExternalLink className="size-4.5" aria-hidden /> عرض الموقع
      </Link>
    </nav>
  );
}

export function AdminSidebar({ siteName, adminName, role, pendingReview = 0 }: { siteName: string; adminName: string; role: StaffRole; pendingReview?: number }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-mist lg:flex">
      <div className="px-5 pt-5 pb-3">
        <p className="truncate font-display text-[1.75rem] leading-tight font-semibold">{siteName}</p>
        <p className="text-xs font-semibold text-brand-700">{role === "owner" ? "لوحة المالك" : "لوحة المعلم"}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavList role={role} pendingReview={pendingReview} />
      </div>
      <div className="border-t border-line-strong px-5 py-3 text-xs text-muted">
        مسجّل الدخول باسم <span className="font-semibold text-ink-soft">{adminName}</span>
      </div>
    </aside>
  );
}

export function AdminMobileNav({ siteName, role, pendingReview = 0 }: { siteName: string; role: StaffRole; pendingReview?: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const current = navFor(role).find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)));
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-3 lg:hidden">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button className="grid size-10 place-items-center rounded-lg hover:bg-brand-50" aria-label="فتح قائمة الإدارة">
            <Menu className="size-5.5" aria-hidden />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content dir="rtl" className="fixed inset-y-0 start-0 z-50 flex w-[82%] max-w-xs flex-col bg-mist outline-none">
            <div className="flex items-center justify-between border-b border-line-strong p-4">
              <Dialog.Title className="font-display text-[1.5rem] leading-tight font-semibold">
                {siteName}
                <span className="block font-sans text-xs font-semibold text-brand-700">{role === "owner" ? "لوحة المالك" : "لوحة المعلم"}</span>
              </Dialog.Title>
              <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-brand-50" aria-label="إغلاق">
                <X className="size-5" aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">روابط لوحة الإدارة</Dialog.Description>
            <div className="flex-1 overflow-y-auto p-3">
              <NavList role={role} pendingReview={pendingReview} onNavigate={() => setOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <p className="truncate font-bold">{current?.label ?? "لوحة التحكم"}</p>
    </div>
  );
}
