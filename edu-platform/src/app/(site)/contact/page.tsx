import type { Metadata } from "next";
import { AtSign, Mail, MessageCircle, Phone } from "lucide-react";
import { getSettings } from "@/server/platform/settings";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "تواصل معنا", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const s = await getSettings();
  const channels = [
    s.whatsapp_number && { Icon: MessageCircle, label: "واتساب", value: s.whatsapp_number, href: `https://wa.me/${s.whatsapp_number.replace(/\D/g, "")}` },
    s.contact_email && { Icon: Mail, label: "البريد الإلكتروني", value: s.contact_email, href: `mailto:${s.contact_email}` },
    s.contact_phone && { Icon: Phone, label: "الهاتف", value: s.contact_phone, href: `tel:${s.contact_phone.replace(/\s/g, "")}` },
    s.instagram_url && { Icon: AtSign, label: "إنستغرام", value: s.instagram_url.replace(/^https?:\/\/(www\.)?/, ""), href: s.instagram_url },
  ].filter(Boolean) as { Icon: typeof Mail; label: string; value: string; href: string }[];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "تواصل معنا" }]} />
      <h1 className="mt-4 text-3xl font-bold">تواصل معنا</h1>
      <p className="mt-2 text-muted">يسعدنا الرد على استفساراتك حول المذكرات والطلبات.</p>
      {channels.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {channels.map(({ Icon, label, value, href }) => (
            <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card hover:border-brand-300">
              <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="size-6" aria-hidden />
              </span>
              <span>
                <span className="block text-sm text-muted">{label}</span>
                <span className="num font-bold">{value}</span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <EmptyState className="mt-6" title="بيانات التواصل قيد التحديث" description="سيتم إضافة وسائل التواصل قريبًا." />
      )}
    </div>
  );
}
