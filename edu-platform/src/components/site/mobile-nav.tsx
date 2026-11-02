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
        <button className="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-mist lg:hidden" aria-label="فتح القائمة">
          <Menu className="size-5.5" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          dir="rtl"
          className="fixed inset-y-0 start-0 z-50 flex w-[86%] max-w-sm flex-col bg-surface shadow-lift outline-none"
        >
          <div className="flex items-center justify-between border-b border-line p-4">
            <Dialog.Title className="font-display text-2xl font-bold">{siteName}</Dialog.Title>
            <Dialog.Close className="grid size-11 place-items-center rounded-lg hover:bg-mist" aria-label="إغلاق القائمة">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">روابط التنقل في المنصة</Dialog.Description>
          <nav className="flex-1 overflow-y-auto p-4">
            {grades.length ? (
              <>
                <p className="mb-2 text-sm font-semibold text-muted">الصفوف</p>
                <ul className="mb-6 grid grid-cols-2 border-t border-s border-line">
                  {grades.map((g) => (
                    <li key={g.href}>
                      <Link href={g.href} className="block border-e border-b border-line px-3 py-3 text-sm font-semibold hover:bg-mist">
                        {g.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block border-b border-line px-1 py-3.5 font-semibold hover:text-brand-700">
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
