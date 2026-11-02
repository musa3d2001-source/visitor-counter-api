import Link from "next/link";
import { getSettings } from "@/server/platform/settings";
import { listGrades } from "@/server/catalog/queries";
import { storage } from "@/server/storage";
import { Logo } from "./logo";

export async function SiteFooter() {
  const [settings, grades] = await Promise.all([getSettings(), listGrades()]);
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  const year = new Date().getFullYear();
  const contact = [
    settings.whatsapp_number && { href: `https://wa.me/${settings.whatsapp_number.replace(/\D/g, "")}`, label: "واتساب" },
    settings.contact_phone && { href: `tel:${settings.contact_phone.replace(/\s/g, "")}`, label: settings.contact_phone },
    settings.instagram_url && { href: settings.instagram_url, label: "إنستغرام" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <footer className="mt-24 bg-ink text-white/80 no-print">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo name={settings.site_name} logoUrl={logoUrl} tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-7 text-white/70">{settings.tagline}</p>
        </div>
        <FooterCol title="الصفوف" links={grades.map((g) => ({ href: `/grades/${g.slug}`, label: g.name }))} />
        <FooterCol
          title="المنصة"
          links={[
            { href: "/teachers", label: "المعلمون" },
            { href: "/bundles", label: "الباقات" },
            { href: "/library", label: "مكتبتي" },
            { href: "/#faq", label: "الأسئلة الشائعة" },
          ]}
        />
        <FooterCol
          title="المساعدة"
          links={[
            { href: "/contact", label: "تواصل معنا" },
            ...contact,
            { href: "/terms", label: "الشروط والأحكام" },
            { href: "/privacy", label: "سياسة الخصوصية" },
            { href: "/refund-policy", label: "سياسة الاسترجاع" },
          ]}
        />
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs leading-6 text-white/60">
          © <span className="num">{year}</span> {settings.site_name}. {settings.footer_note}
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-white">{title}</p>
      <ul className="space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="hover:text-white" {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
