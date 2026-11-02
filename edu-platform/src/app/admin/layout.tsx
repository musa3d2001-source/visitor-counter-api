import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/permissions";
import { pendingReviewCount } from "@/server/admin/products";
import { getSettings } from "@/server/platform/settings";
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
const OWNER_ONLY_PREFIXES = ["/admin/teachers", "/admin/review", "/admin/catalog", "/admin/bundles", "/admin/orders", "/admin/students", "/admin/coupons", "/admin/reports", "/admin/settings"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  if (actor.kind !== "owner") {
    const path = (await headers()).get("x-pathname") ?? "";
    if (OWNER_ONLY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) notFound();
  }
  const [settings, pending] = await Promise.all([getSettings(), actor.kind === "owner" ? pendingReviewCount() : Promise.resolve(0)]);
  const role = actor.kind;
  const name = actor.kind === "teacher" ? actor.teacherName : actor.name;
  return (
    <div className="flex min-h-dvh bg-surface">
      <AdminSidebar siteName={settings.site_name} adminName={name} role={role} pendingReview={pending} />
      <div className="min-w-0 flex-1">
        <SandboxBanner />
        <AdminMobileNav siteName={settings.site_name} role={role} pendingReview={pending} />
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
