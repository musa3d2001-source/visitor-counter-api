"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** زر إرسال يعرض حالة التحميل تلقائيًا ويمنع النقر المزدوج */
export function SubmitButton({ children, pendingText, pending: forced, ...props }: ButtonProps & { pendingText?: string; pending?: boolean }) {
  const status = useFormStatus();
  // pending من الخارج لنموذج يرسله الكود بنفسه، فلا يراه useFormStatus
  const pending = status.pending || Boolean(forced);
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingText ?? "جارٍ التنفيذ…") : children}
    </Button>
  );
}
