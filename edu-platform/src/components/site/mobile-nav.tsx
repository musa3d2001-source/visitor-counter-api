"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { Menu, X } from "lucide-react";

type NavLink = { href: string; label: string };

export function MobileNav({ grades, links, siteName }: { grades: NavLink[]; links: NavLink[]; siteName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="grid size-10 place-items-center rounded-xl text-ink-soft hover:bg-brand-50 md:hidden" aria-label="فتح القائمة">
          <Menu className="size-5.5" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          dir="rtl"
          className="fixed inset-y-0 end-0 z-50 flex w-[86%] max-w-sm flex-col bg-surface shadow-lift outline-none data-[state=open]:animate-fade-up"
        >
          <div className="flex items-center justify-between border-b border-line p-4">
            <Dialog.Title className="text-lg font-bold">{siteName}</Dialog.Title>
            <Dialog.Close className="grid size-10 place-items-center rounded-xl hover:bg-brand-50" aria-label="إغلاق القائمة">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">روابط التنقل في المنصة</Dialog.Description>
          <nav className="flex-1 overflow-y-auto p-4">
            {grades.length ? (
              <>
                <p className="mb-2 text-xs font-semibold text-muted">الصفوف الدراسية</p>
                <ul className="mb-6 grid grid-cols-2 gap-2">
                  {grades.map((g) => (
                    <li key={g.href}>
                      <Link href={g.href} className="block rounded-xl border border-line px-3 py-2.5 text-center text-sm font-semibold hover:border-brand-300 hover:bg-brand-50">
                        {g.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <ul className="flex flex-col gap-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block rounded-xl px-3 py-3 font-semibold hover:bg-brand-50">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
