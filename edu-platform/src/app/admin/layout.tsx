import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { getSettings } from "@/server/platform/settings";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/sidebar";
import { SandboxBanner } from "@/components/site/sandbox-banner";

export const metadata: Metadata = {
  title: { default: "لوحة الإدارة", template: "%s | لوحة الإدارة" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const settings = await getSettings();
  return (
    <div className="flex min-h-dvh bg-canvas">
      <AdminSidebar siteName={settings.site_name} adminName={admin.fullName} />
      <div className="min-w-0 flex-1">
        <SandboxBanner />
        <AdminMobileNav siteName={settings.site_name} />
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
