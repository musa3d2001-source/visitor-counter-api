"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { leavingPath } from "@/lib/nav-target";

/** حد أمان: طلب لم ينتهِ لا يترك الشريط ظاهرًا إلى الأبد */
const GIVE_UP_MS = 15_000;
/** لا تُجلب صفحة لمجرد مرور المؤشر فوقها في طريقه إلى مكان آخر */
const HOVER_INTENT_MS = 120;
/** حد لكل زيارة: كل جلب طلب خادم، والمتصفح لا يحتاج أكثر من هذا */
const MAX_PREFETCHES = 30;

function navigationTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const a = target.closest("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return null;
  return leavingPath({ href: a.href, download: a.hasAttribute("download"), role: a.getAttribute("role"), target: a.target }, window.location.href);
}

/**
 * استجابة النقرة في لحظتها: شريط رفيع أعلى الصفحة حتى تتغير الصفحة.
 * والجلب المسبق عند نية الانتقال فقط (الوقوف على الرابط أو لمسه أو التركيز عليه): الروابط كلها prefetch={false}
 * كي لا تطلق كل بطاقة تظهر على الشاشة طلبًا إلى الخادم.
 */
export function NavFeedback() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const giveUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [last, setLast] = useState({ pathname, search });

  // وصلت الصفحة الجديدة
  if (last.pathname !== pathname || last.search !== search) {
    setLast({ pathname, search });
    setActive(false);
  }

  useEffect(() => {
    const seen = new Set<string>();
    let hover: ReturnType<typeof setTimeout> | undefined;

    const prefetch = (href: string) => {
      if (seen.has(href) || seen.size >= MAX_PREFETCHES) return;
      seen.add(href);
      router.prefetch(href);
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!navigationTarget(e.target)) return;
      setActive(true);
      clearTimeout(giveUp.current);
      giveUp.current = setTimeout(() => setActive(false), GIVE_UP_MS);
    };
    const onPointerDown = (e: PointerEvent) => {
      const href = navigationTarget(e.target);
      if (href) prefetch(href);
    };
    const onPointerOver = (e: PointerEvent) => {
      clearTimeout(hover);
      if (e.pointerType !== "mouse") return;
      const href = navigationTarget(e.target);
      if (href) hover = setTimeout(() => prefetch(href), HOVER_INTENT_MS);
    };
    const onFocus = (e: FocusEvent) => {
      const href = navigationTarget(e.target);
      if (href) prefetch(href);
    };
    // العودة بزر الرجوع من صفحة غادرناها كاملة تعيد الحالة كما تركناها
    const onShow = () => setActive(false);

    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("focusin", onFocus);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearTimeout(hover);
      clearTimeout(giveUp.current);
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("pageshow", onShow);
    };
  }, [router]);

  if (!active) return null;
  return (
    <div aria-hidden data-testid="nav-progress" className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <div className="animate-nav-progress h-full origin-right bg-linear-to-l from-brand-600 via-[var(--accent)] to-brand-500 motion-reduce:animate-none" />
    </div>
  );
}

/**
 * بلا JavaScript لا يستطيع React وضع المحتوى المبثوث مكان الهيكل، فيبقى الهيكل إلى الأبد.
 * هذه القاعدة تعمل فقط حين يكون JavaScript معطلًا: تخفي الهياكل وتعرض المحتوى المبثوث قبل التذييل.
 * الصفحات العامة تأتي عادة كاملة من الذاكرة بلا بث، فهذا لحالة الذاكرة الباردة: النص والروابط تُقرأ وإن تغير ترتيب بعض القطع.
 * داخل @layer base لأن قاعدة [hidden] في Tailwind مهمة (!important) في تلك الطبقة، والطبقة تغلب ما خارجها.
 * النص ثابت في الكود ولا يدخله أي شيء من الطلب أو قاعدة البيانات.
 */
const NO_SCRIPT_CSS = `
[role="status"][aria-label="جاري التحميل"]{display:none!important}
main:has(>[role="status"][aria-label="جاري التحميل"]){display:none}
body:has(>div[hidden][id^="S:"]){display:flex;flex-direction:column;overflow-x:clip}
body:has(>div[hidden][id^="S:"])>footer{order:3}
@layer base{body>div[hidden][id^="S:"]{display:block!important;order:2}}
`;

export function NoScriptStreaming() {
  return (
    <noscript>
      <style dangerouslySetInnerHTML={{ __html: NO_SCRIPT_CSS }} />
    </noscript>
  );
}
