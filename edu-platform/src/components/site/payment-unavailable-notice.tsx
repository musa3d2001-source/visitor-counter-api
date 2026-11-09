import { Mail, MessageCircle, Phone } from "lucide-react";
import { Alert } from "@/components/ui/alert";

type ContactSettings = { whatsapp_number: string; contact_email: string; contact_phone: string };

/** وسائل التواصل المضبوطة فعلًا في الإعدادات (لا نعرض رابطًا لا يوصل إلى أحد) */
export function realContactLinks(s: ContactSettings) {
  const links: { key: string; label: string; href: string; external?: boolean; Icon: typeof Mail }[] = [];
  if (s.whatsapp_number) links.push({ key: "wa", label: "واتساب", href: `https://wa.me/${s.whatsapp_number.replace(/\D/g, "")}`, external: true, Icon: MessageCircle });
  if (s.contact_email) links.push({ key: "mail", label: "البريد الإلكتروني", href: `mailto:${s.contact_email}`, Icon: Mail });
  if (s.contact_phone) links.push({ key: "tel", label: "الهاتف", href: `tel:${s.contact_phone.replace(/\s/g, "")}`, Icon: Phone });
  return links;
}

/** قائمة وسائل التواصل الحقيقية. لا تعرض شيئًا إن لم يُضبط أي منها */
export function ContactLinks({ settings, testId }: { settings: ContactSettings; testId: string }) {
  const links = realContactLinks(settings);
  if (!links.length) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-5" data-testid={testId}>
      {links.map(({ key, label, href, external, Icon }) => (
        <li key={key}>
          <a href={href} className="inline-flex min-h-11 items-center gap-1.5" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * تنبيه للطالب عندما يكون الدفع الإلكتروني متوقفًا: صادق ولا يَعِد بشيء لا يحدث،
 * ويعرض وسائل التواصل الحقيقية إن وُجدت. سبب التوقف التقني للمالك فقط (صفحة الإعدادات).
 */
export function PaymentUnavailableNotice({ settings, className }: { settings: ContactSettings; className?: string }) {
  return (
    <Alert tone="warning" title="الدفع الإلكتروني غير متاح حاليًا" className={className}>
      {realContactLinks(settings).length ? (
        <>
          <p>للاستفسار عن شراء هذا المحتوى تواصل معنا:</p>
          <ContactLinks settings={settings} testId="payment-unavailable-contacts" />
        </>
      ) : (
        <p>لا يمكن إتمام الشراء الآن. تبقى المنتجات في سلتك لتعود إليها لاحقًا.</p>
      )}
    </Alert>
  );
}
