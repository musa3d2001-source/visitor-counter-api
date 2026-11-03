"use client";

import { useState } from "react";
import type * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * حقول الدخول: أيقونة ملونة صغيرة داخل الحقل (على اليمين) وحقل أكبر (٥٢px).
 * الصفحة RTL دائمًا والحقول ‎dir="ltr"‎ أحيانًا، لذا الحشو فيزيائي (pr/pl) لا منطقي.
 */
export type FieldTone = "teal" | "gold" | "coral" | "sky" | "violet";

const TONE: Record<FieldTone, string> = {
  teal: "from-[#2dc2b3] to-[#0a6b66] text-white",
  gold: "from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]",
  coral: "from-[#ffa07a] to-[#e8483f] text-white",
  sky: "from-[#86cbff] to-[#4d6dff] text-white",
  violet: "from-[#c09cff] to-[#6a3fe0] text-white",
};

export const BIG_INPUT = "h-13 pr-14 text-[1.02rem]";

export function FieldIcon({ icon, tone = "teal" }: { icon: React.ReactNode; tone?: FieldTone }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 right-2.5 grid size-8.5 -translate-y-1/2 place-items-center rounded-[0.7rem] bg-linear-to-br shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] [&_svg]:size-[1.05rem]",
        TONE[tone],
      )}
      aria-hidden
    >
      {icon}
    </span>
  );
}

/** حقل بأيقونة: ضع <Input className={BIG_INPUT} …/> بداخله */
export function IconInput({ icon, tone, children }: { icon: React.ReactNode; tone?: FieldTone; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <FieldIcon icon={icon} tone={tone} />
    </div>
  );
}

/** حقل كلمة مرور بأيقونة + زر إظهار/إخفاء (٤٤px). يحافظ على id و name كما هي. */
export function PasswordInput({ icon, tone = "gold", className, ...props }: React.ComponentProps<"input"> & { icon: React.ReactNode; tone?: FieldTone }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn(BIG_INPUT, "pl-14", className)} />
      <FieldIcon icon={icon} tone={tone} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-controls={props.id}
        aria-label="إظهار كلمة المرور"
        className="absolute top-1/2 left-1 grid size-11 -translate-y-1/2 place-items-center rounded-[0.8rem] text-muted transition-colors hover:bg-brand-50 hover:text-brand-700"
      >
        {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
