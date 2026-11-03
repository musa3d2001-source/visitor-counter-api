import { MessageCircle } from "lucide-react";

/** زر واتساب العائم: كبسولة خضراء ثلاثية الأبعاد بحافة داكنة */
export function WhatsAppButton({ number, siteName }: { number: string; siteName: string }) {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  const text = encodeURIComponent(`السلام عليكم، عندي استفسار بخصوص ${siteName}`);
  return (
    <a
      href={`https://wa.me/${digits}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed start-4 bottom-20 z-30 flex h-13 min-w-13 items-center justify-center gap-2 rounded-full bg-linear-to-b from-[#2fc46b] to-[#1a9a51] px-3.5 font-display font-extrabold text-white shadow-[0_4px_0_#0f6b36,0_18px_30px_-12px_rgb(15_107_54/0.6),inset_0_1px_0_rgb(255_255_255/0.3)] transition-transform hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[0_1px_0_#0f6b36] sm:px-5 md:start-5 md:bottom-5 no-print"
      aria-label="تواصل معنا عبر واتساب"
    >
      <MessageCircle className="size-5.5" aria-hidden />
      <span className="hidden sm:inline">الدعم عبر واتساب</span>
    </a>
  );
}
