import type { Metadata, Viewport } from "next";
import { getSettings } from "@/server/platform/settings";
import { env } from "@/server/env";
import "./globals.css";

/** كل الصفحات ديناميكية (جلسات + CSP nonce لكل طلب) — البناء لا يحتاج قاعدة بيانات */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const base = new URL(env().APP_URL);
  return {
    metadataBase: base,
    title: { default: `${s.site_name} — ${s.tagline}`, template: `%s | ${s.site_name}` },
    description: s.hero_subtitle,
    applicationName: s.site_name,
    openGraph: {
      type: "website",
      locale: "ar_KW",
      siteName: s.site_name,
      title: `${s.site_name} — ${s.tagline}`,
      description: s.hero_subtitle,
      images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: s.site_name }],
    },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0f5257",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const style = { "--brand": s.primary_color, "--accent": s.accent_color } as React.CSSProperties;
  return (
    <html lang="ar" dir="rtl" style={style}>
      <body className="min-h-dvh font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
          تخطَّ إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
