import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Sparkle } from "@/components/art";
import { ar } from "@/lib/design";
import { getSettings } from "@/server/platform/settings";
import { siteFacts } from "@/server/platform/site-facts";
import { paymentClaims, publicTagline } from "@/lib/site-truth";
import { listGrades } from "@/server/catalog/queries";
import { storage } from "@/server/storage";
import { Logo } from "./logo";

/** التذييل: فيروزي داكن بشريط قوس قزح المواد، روابط حقيقية، وسنة بالأرقام الهندية العربية */
export async function SiteFooter() {
  const [settings, grades, facts] = await Promise.all([getSettings(), listGrades(), siteFacts()]);
  const tagline = publicTagline(settings.tagline, facts);
  const paymentLine = paymentClaims(facts.payment).footer;
  const logoUrl = settings.logo_key ? storage().publicUrl(settings.logo_key) : null;
  const year = new Date().getFullYear();
  const contact = [
    settings.whatsapp_number && { href: `https://wa.me/${settings.whatsapp_number.replace(/\D/g, "")}`, label: "واتساب" },
    settings.contact_phone && { href: `tel:${settings.contact_phone.replace(/\s/g, "")}`, label: settings.contact_phone },
    settings.instagram_url && { href: settings.instagram_url, label: "إنستغرام" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <footer
      className="on-dark relative isolate mt-20 overflow-hidden text-white/80 no-print"
      style={{
        background:
          "radial-gradient(45% 80% at 100% 0%, color-mix(in oklab, var(--brand-hi) 32%, transparent), transparent 65%), radial-gradient(40% 70% at 0% 100%, rgb(255 197 49 / 0.12), transparent 65%), var(--brand-night)",
      }}
    >
      <span className="rainbow-rule absolute inset-x-0 top-0 rounded-none" aria-hidden />
      <Sparkle className="animate-twinkle absolute end-[8%] top-14 -z-10 size-5 opacity-60" color="#FFE29A" />
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 pt-16 pb-12 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:pt-20">
        <div className="col-span-2 lg:col-span-1">
          <Logo name={settings.site_name} logoUrl={logoUrl} tone="light" subtitle={grades[0]?.stageName} />
          {tagline ? <p className="mt-4 max-w-sm text-[1rem] leading-8 text-white/78">{tagline}</p> : null}
          {paymentLine ? (
            <p className="mt-5 inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/6 px-4 py-2.5 text-[0.9rem] leading-6">
              <CreditCard className="size-4.5 shrink-0 text-[#FFD25E]" aria-hidden />
              {paymentLine}
            </p>
          ) : null}
        </div>
        <FooterCol title="الصفوف" links={grades.map((g) => ({ href: `/grades/${g.slug}`, label: g.name }))} />
        <FooterCol
          title="المنصة"
          links={[
            { href: "/teachers", label: "المعلمون" },
            { href: "/bundles", label: "الباقات" },
            { href: "/library", label: "مكتبتي" },
            { href: "/cart", label: "السلة" },
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="border-t border-white/10 py-6 text-[0.86rem] leading-7 text-white/68">
          © <span className="num">{ar(year)}</span> {settings.site_name}. {settings.footer_note}
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="mb-2 font-display text-[1.05rem] font-extrabold text-white">{title}</p>
      <ul className="text-[0.98rem]">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className="inline-flex min-h-11 items-center text-white/78 transition-colors hover:text-[#FFD25E]"
              {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
