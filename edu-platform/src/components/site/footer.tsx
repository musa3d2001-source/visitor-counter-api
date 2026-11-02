import Link from "next/link";
import { AtSign, Mail, Phone } from "lucide-react";
import { getSettings } from "@/server/platform/settings";
import { listGrades } from "@/server/catalog/queries";
import { Logo } from "./logo";
import { storage } from "@/server/storage";

export async function SiteFooter() {
  const [settings, grades] = await Promise.all([getSettings(), listGrades()]);
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 bg-brand-900 text-white/85 no-print">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo name={settings.site_name} logoUrl={logoUrl} tone="light" />
          <p className="mt-4 max-w-sm text-sm leading-7 text-white/70">{settings.tagline}</p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            {settings.contact_phone ? (
              <span className="flex items-center gap-2">
                <Phone className="size-4" aria-hidden /> <span className="num">{settings.contact_phone}</span>
              </span>
            ) : null}
            {settings.contact_email ? (
              <a href={`mailto:${settings.contact_email}`} className="flex items-center gap-2 hover:text-white">
                <Mail className="size-4" aria-hidden /> {settings.contact_email}
              </a>
            ) : null}
            {settings.instagram_url ? (
              <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
                <AtSign className="size-4" aria-hidden /> إنستغرام
              </a>
            ) : null}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold text-white">الصفوف</h2>
          <ul className="space-y-2 text-sm">
            {grades.map((g) => (
              <li key={g.id}>
                <Link href={`/grades/${g.slug}`} className="hover:text-white">
                  {g.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/bundles" className="hover:text-white">
                الباقات والعروض
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold text-white">روابط مهمة</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/library" className="hover:text-white">مكتبتي</Link></li>
            <li><Link href="/#faq" className="hover:text-white">الأسئلة الشائعة</Link></li>
            <li><Link href="/contact" className="hover:text-white">تواصل معنا</Link></li>
            <li><Link href="/terms" className="hover:text-white">الشروط والأحكام</Link></li>
            <li><Link href="/privacy" className="hover:text-white">سياسة الخصوصية</Link></li>
            <li><Link href="/refund-policy" className="hover:text-white">سياسة الاسترجاع</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-white/60">
          © <span className="num">{year}</span> {settings.site_name}. {settings.footer_note}
        </p>
      </div>
    </footer>
  );
}
