"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import {
  ChartColumn,
  ExternalLink,
  FileText,
  House,
  Layers,
  Menu,
  Package,
  Receipt,
  Settings,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ADMIN_NAV: { href: string; label: string; Icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin", label: "الرئيسية", Icon: House, exact: true },
  { href: "/admin/products", label: "المذكرات والمنتجات", Icon: FileText },
  { href: "/admin/catalog", label: "المراحل والمواد", Icon: Layers },
  { href: "/admin/bundles", label: "الباقات", Icon: Package },
  { href: "/admin/orders", label: "الطلبات والمدفوعات", Icon: Receipt },
  { href: "/admin/students", label: "الطلاب", Icon: Users },
  { href: "/admin/coupons", label: "الكوبونات", Icon: Ticket },
  { href: "/admin/reports", label: "التقارير", Icon: ChartColumn },
  { href: "/admin/settings", label: "إعدادات المنصة", Icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="قائمة الإدارة" className="flex flex-col gap-0.5">
      {ADMIN_NAV.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-brand-600 text-white shadow-sm" : "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
      <Link
        href="/"
        target="_blank"
        className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm font-semibold text-muted hover:border-brand-300 hover:text-brand-700"
      >
        <ExternalLink className="size-4.5" aria-hidden /> عرض الموقع
      </Link>
    </nav>
  );
}

export function AdminSidebar({ siteName, adminName }: { siteName: string; adminName: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface lg:flex">
      <div className="border-b border-line px-5 py-4">
        <p className="text-xs font-semibold text-muted">لوحة الإدارة</p>
        <p className="mt-0.5 truncate text-lg font-bold">{siteName}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavList />
      </div>
      <div className="border-t border-line px-5 py-3 text-xs text-muted">
        مسجل الدخول: <span className="font-semibold text-ink-soft">{adminName}</span>
      </div>
    </aside>
  );
}

export function AdminMobileNav({ siteName }: { siteName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const current = ADMIN_NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)));
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-3 backdrop-blur lg:hidden">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button className="grid size-10 place-items-center rounded-xl hover:bg-brand-50" aria-label="فتح قائمة الإدارة">
            <Menu className="size-5.5" aria-hidden />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content dir="rtl" className="fixed inset-y-0 end-0 z-50 flex w-[82%] max-w-xs flex-col bg-surface shadow-lift outline-none">
            <div className="flex items-center justify-between border-b border-line p-4">
              <Dialog.Title className="font-bold">{siteName} — الإدارة</Dialog.Title>
              <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-brand-50" aria-label="إغلاق">
                <X className="size-5" aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">روابط لوحة الإدارة</Dialog.Description>
            <div className="flex-1 overflow-y-auto p-3">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <p className="truncate font-bold">{current?.label ?? "لوحة الإدارة"}</p>
    </div>
  );
}
