import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { SandboxBanner } from "@/components/site/sandbox-banner";
import { getSettings } from "@/server/platform/settings";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <SandboxBanner />
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppButton number={settings.whatsapp_number} siteName={settings.site_name} />
    </>
  );
}
