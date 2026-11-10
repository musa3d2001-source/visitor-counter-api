import type { Metadata } from "next";
import Link from "next/link";
import { libraryNote, publicFaq, type PaymentPublicState } from "@/lib/site-truth";
import { siteFacts } from "@/server/platform/site-facts";
import {
  ArrowLeft,
  AtSign,
  ChevronDown,
  CircleHelp,
  KeyRound,
  LibraryBig,
  Lightbulb,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { getPublicSettings } from "@/server/platform/public-settings";
import { mailIsReal } from "@/server/platform/mailer";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHead } from "@/components/ui/section-head";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkle } from "@/components/art";
import { subjectVars, toneVars, type ToneVars } from "@/lib/design";
import { ContactArt } from "./_components/contact-art";

export const metadata: Metadata = { title: "تواصل معنا", alternates: { canonical: "/contact" } };

type Channel = { key: string; Icon: typeof Mail; label: string; value: string; href: string; cta: string; vars: ToneVars; ltr?: boolean };

const GREEN = toneVars({ from: "#3DDC84", to: "#169C4F", deep: "#0F6B36", soft: "#E3F8EC", ink: "#0F6B36" });
const TEAL = toneVars({ from: "#2DC2B3", to: "#0A6B66", deep: "#063F3C", soft: "#DDF6F4", ink: "#0A6670" });

const helpTiles = (mailWorks: boolean, payment: PaymentPublicState) => [
  { href: "/library", Icon: LibraryBig, title: "مشترياتك في «مكتبتي»", text: libraryNote(payment, "contactTile") ?? "", vars: subjectVars("math") },
  { href: "/forgot-password", Icon: KeyRound, title: "نسيت كلمة المرور؟", text: mailWorks ? "أرسل لنفسك رابطًا لتعيين كلمة مرور جديدة." : "تواصل معنا لنصدر لك رابطًا جديدًا.", vars: subjectVars("social") },
  { href: "/refund-policy", Icon: RotateCcw, title: "سياسة الاسترجاع", text: "متى يُسترجع المبلغ، وكيف تطلب ذلك.", vars: subjectVars("arabic") },
  { href: "/terms", Icon: ScrollText, title: "الشروط والأحكام", text: "استخدام الحساب والمحتوى والدفع.", vars: subjectVars("english") },
];

export default async function ContactPage() {
  const s = await getPublicSettings();
  const channels = [
    s.whatsapp_number && {
      key: "wa",
      Icon: MessageCircle,
      label: "واتساب",
      value: s.whatsapp_number,
      href: `https://wa.me/${s.whatsapp_number.replace(/\D/g, "")}`,
      cta: "ابدأ المحادثة",
      vars: GREEN,
      ltr: true,
    },
    s.contact_email && { key: "mail", Icon: Mail, label: "البريد الإلكتروني", value: s.contact_email, href: `mailto:${s.contact_email}`, cta: "اكتب لنا رسالة", vars: TEAL, ltr: true },
    s.contact_phone && {
      key: "tel",
      Icon: Phone,
      label: "الهاتف",
      value: s.contact_phone,
      href: `tel:${s.contact_phone.replace(/\s/g, "")}`,
      cta: "اتصل بنا",
      vars: subjectVars("arabic"),
      ltr: true,
    },
    s.instagram_url && {
      key: "ig",
      Icon: AtSign,
      label: "إنستغرام",
      value: s.instagram_url.replace(/^https?:\/\/(www\.)?/, ""),
      href: s.instagram_url,
      cta: "تابعنا",
      vars: subjectVars("english"),
      ltr: true,
    },
  ].filter(Boolean) as Channel[];
  const facts = await siteFacts();
  const faq = publicFaq(s.faq ?? [], facts);
  const cols = channels.length >= 4 ? "lg:grid-cols-4" : channels.length === 3 ? "lg:grid-cols-3" : "";

  return (
    <>
      <PageHeader
        title={
          <>
            تواصل <span className="text-hl">معنا</span>
          </>
        }
        sub="يسعدنا الرد على استفساراتك حول المحتوى والطلبات. اختر الطريقة الأنسب لك."
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "تواصل معنا" }]}
        eyebrow={{ icon: <MessagesSquare aria-hidden />, label: "نحن هنا لمساعدتك", tone: "coral" }}
        aside={
          <div className="mx-auto aspect-[42/32] w-full max-w-md">
            <ContactArt />
          </div>
        }
      >
        {channels.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="وسائل التواصل المتاحة">
            {channels.map((c) => (
              <li key={c.key} className="chip min-h-9 px-3.5 text-[0.88rem]" style={c.vars}>
                <c.Icon aria-hidden />
                {c.label}
              </li>
            ))}
          </ul>
        ) : null}
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        {/* وسائل التواصل الحقيقية من الإعدادات */}
        <section aria-labelledby="channels-title" className="-mt-2">
          <h2 id="channels-title" className="sr-only">
            وسائل التواصل
          </h2>
          {channels.length ? (
            <ul className={`grid gap-4 sm:grid-cols-2 sm:gap-5 ${cols}`}>
              {channels.map(({ key, Icon, label, value, href, cta, vars, ltr }) => (
                <li key={key} className="min-w-0">
                  <a
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="tile-3d group relative isolate flex h-full flex-col overflow-hidden p-5 sm:p-6"
                    style={vars}
                  >
                    <span className="absolute -top-14 -left-14 -z-10 size-40 rounded-full bg-[var(--soft)]" aria-hidden />
                    <span className="flex items-center justify-between gap-3">
                      <span className="icon-tile size-15 rounded-[1.2rem] [&_svg]:size-7">
                        <Icon aria-hidden />
                      </span>
                      <Sparkle className="size-5 opacity-80" />
                    </span>
                    <span className="mt-5 font-display text-[1.05rem] font-extrabold text-[var(--tink)]">{label}</span>
                    <span dir={ltr ? "ltr" : undefined} className="num mt-1 block truncate text-end font-display text-[1.3rem] font-black text-ink">
                      {value}
                    </span>
                    <span className="mt-5 inline-flex items-center gap-1.5 self-start rounded-full bg-[var(--soft)] px-3.5 py-1.5 font-display text-[0.9rem] font-extrabold text-[var(--tink)] transition-colors group-hover:bg-[var(--d)] group-hover:text-white">
                      {cta}
                      <ArrowLeft className="size-4" aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="بيانات التواصل قيد التحديث"
              description="سيتم إضافة وسائل التواصل قريبًا. حتى ذلك الحين قد تجد جوابك في الروابط والأسئلة أدناه."
              action={
                faq.length ? (
                  <a href="#faq" className="btn btn-3d btn-primary btn-md">
                    <CircleHelp aria-hidden />
                    الأسئلة الشائعة
                  </a>
                ) : null
              }
            />
          )}
        </section>

        {/* روابط مساعدة حقيقية */}
        <section aria-labelledby="help-title" className="mt-16 sm:mt-20">
          <SectionHead id="help-title" icon={<Lightbulb aria-hidden />} eyebrow="قبل أن تراسلنا" tone="gold" title="جوابك قد يكون هنا" sub="أسرع طريق لأكثر ما يسأل عنه الطلاب وأولياء الأمور." />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {helpTiles(mailIsReal(), facts.payment).map(({ href, Icon, title, text, vars }) => (
              <li key={href} className="min-w-0">
                <Link prefetch={false} href={href} className="tile-3d group flex h-full items-start gap-4 p-5" style={vars}>
                  <span className="icon-tile [&_svg]:size-6">
                    <Icon aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-[1.08rem] leading-snug font-black text-ink">{title}</span>
                    <span className="mt-1 block text-[0.92rem] leading-7 text-ink-soft">{text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* الأسئلة الشائعة (من إعدادات المنصة) */}
        {faq.length ? (
          <section aria-labelledby="faq" className="mt-16 grid scroll-mt-28 gap-8 sm:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-12">
            <div className="min-w-0">
              <SectionHead id="faq" icon={<CircleHelp aria-hidden />} eyebrow="عندك سؤال؟" tone="coral" title="الأسئلة الشائعة" sub="إجابات مختصرة عن الشراء والمشاهدة والمكتبة." className="mb-6 sm:mb-8" />
              <div className="bg-teal-night on-dark relative isolate overflow-hidden rounded-[1.75rem] p-6 shadow-pop">
                <span className="absolute -bottom-16 -left-16 -z-10 size-44 rounded-full border-[22px] border-white/8" aria-hidden />
                <Sparkle className="absolute top-5 left-6 size-4" color="#FFE29A" />
                <span className="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00] shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)]">
                  <Lightbulb className="size-6" aria-hidden />
                </span>
                <p className="mt-4 font-display text-[1.2rem] font-black text-white">لنرد عليك أسرع</p>
                <p className="mt-1.5 text-[0.95rem] leading-7 text-white/85">اذكر في رسالتك البريد المسجّل في حسابك، ورقم الطلب إن كان سؤالك عن عملية شراء.</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              {faq.map((f, i) => (
                <details key={f.q} open={i === 0} className="group card-soft overflow-hidden transition-shadow open:shadow-lift">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 font-display text-[1.02rem] font-extrabold text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-open:bg-brand-600 group-open:text-white" aria-hidden>
                      <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[0.98rem] leading-8 text-ink-soft sm:px-6">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
