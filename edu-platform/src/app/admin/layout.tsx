import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/permissions";
import { pendingReviewCount } from "@/server/admin/products";
import { getSettings } from "@/server/platform/settings";
import { storage } from "@/server/storage";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/sidebar";
import { SandboxBanner } from "@/components/site/sandbox-banner";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

/**
 * لوحة واحدة للمالك والمعلم — الصلاحيات تُفرض على الخادم في كل صفحة وإجراء.
 * الصفحات الخاصة بالمالك تستدعي requireOwnerPage() (المعلم يحصل على 404).
 */
/** مسارات المالك فقط — يُرفض المعلم مبكرًا هنا (قبل بث الصفحة) لتعود حالة 404 صحيحة */
const OWNER_ONLY_PREFIXES = ["/admin/teachers", "/admin/review", "/admin/catalog", "/admin/bundles", "/admin/orders", "/admin/students", "/admin/coupons", "/admin/reports", "/admin/settings", "/admin/mail"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  if (actor.kind !== "owner") {
    const path = (await headers()).get("x-pathname") ?? "";
    if (OWNER_ONLY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) notFound();
  }
  const [settings, pending] = await Promise.all([getSettings(), actor.kind === "owner" ? pendingReviewCount() : Promise.resolve(0)]);
  const role = actor.kind;
  const name = actor.kind === "teacher" ? actor.teacherName : actor.name;
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  return (
    <div className="flex min-h-dvh bg-canvas">
      <AdminSidebar siteName={settings.site_name} adminName={name} role={role} pendingReview={pending} logoUrl={logoUrl} />
      <div className="relative isolate min-w-0 flex-1">
        {/* وهج مشمس خفيف أعلى مساحة العمل (زخرفي) */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(42%_60%_at_100%_0%,rgb(255_197_49/0.2),transparent_70%),radial-gradient(38%_55%_at_0%_10%,color-mix(in_oklab,var(--brand-hi)_14%,transparent),transparent_70%)]"
          aria-hidden
        />
        <SandboxBanner />
        <AdminMobileNav siteName={settings.site_name} role={role} pendingReview={pending} adminName={name} logoUrl={logoUrl} />
        <main id="main" className="mx-auto w-full max-w-[84rem] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-9">
          {children}
        </main>
      </div>
    </div>
  );
}
