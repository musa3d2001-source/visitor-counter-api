import { MessageCircle } from "lucide-react";

export function WhatsAppButton({ number, siteName }: { number: string; siteName: string }) {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  const text = encodeURIComponent(`السلام عليكم، عندي استفسار بخصوص ${siteName}`);
  return (
    <a
      href={`https://wa.me/${digits}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 start-5 z-30 flex h-13 items-center gap-2 rounded-full bg-[#1f9d55] px-4 font-semibold text-white shadow-lift transition-transform hover:scale-105 no-print"
      aria-label="تواصل معنا عبر واتساب"
    >
      <MessageCircle className="size-5.5" aria-hidden />
      <span className="hidden sm:inline">الدعم عبر واتساب</span>
    </a>
  );
}
