import type { Metadata, Viewport } from "next";
import { getPublicSettings } from "@/server/platform/public-settings";
import { siteFacts } from "@/server/platform/site-facts";
import { publicHero, publicTagline } from "@/lib/site-truth";
import { env } from "@/server/env";
import { siteIndexable } from "@/server/platform/indexing";
import { fontClassNames } from "./fonts";
import "./globals.css";

/** كل الصفحات ديناميكية (جلسات + CSP nonce لكل طلب) — البناء لا يحتاج قاعدة بيانات */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [s, facts] = await Promise.all([getPublicSettings(), siteFacts()]);
  const base = new URL(env().APP_URL);
  const tagline = publicTagline(s.tagline, facts);
  const title = tagline ? `${s.site_name} | ${tagline}` : s.site_name;
  const description = publicHero({ title: s.hero_title, subtitle: s.hero_subtitle }, facts).subtitle;
  return {
    metadataBase: base,
    title: { default: title, template: `%s | ${s.site_name}` },
    description,
    applicationName: s.site_name,
    openGraph: {
      type: "website",
      locale: "ar_KW",
      siteName: s.site_name,
      title,
      description,
      images: [{ url: "/brand/v2/og.jpg", width: 1200, height: 630, alt: s.site_name }],
    },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
    // الصفحة التي تضبط robots بنفسها تبقى أقوى، وكل ما عداها يرث هذا المنع
    ...(siteIndexable() ? {} : { robots: { index: false, follow: false } }),
  };
}

export const viewport: Viewport = {
  themeColor: "#0a6b66",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  const style = { "--brand": s.primary_color, "--accent": s.accent_color } as React.CSSProperties;
  return (
    <html lang="ar" dir="rtl" style={style} data-scroll-behavior="smooth" className={fontClassNames}>
      <body className="min-h-dvh bg-canvas font-sans text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-5 focus:py-2.5 focus:font-display focus:font-bold focus:shadow-lift">
          تخطَّ إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
