"use client";

import { useActionState, useState } from "react";
import { Hash, KeyRound, LogIn } from "lucide-react";
import { verifyLoginCodeAction } from "../../two-factor/actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, IconInput } from "../../_components/auth-fields";

export function TwoFactorLoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifyLoginCodeAction, null);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate data-testid="two-factor-login-form">
      <input type="hidden" name="next" value={next} />
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={recovery ? "رمز الاسترداد" : "الرمز من التطبيق"} htmlFor="code" hint={recovery ? "كل رمز يعمل مرة واحدة" : "٦ أرقام، ويتغير كل ٣٠ ثانية"}>
        <IconInput icon={recovery ? <KeyRound /> : <Hash />} tone={recovery ? "gold" : "teal"}>
          <Input
            key={recovery ? "recovery" : "totp"}
            id="code"
            name="code"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete={recovery ? "off" : "one-time-code"}
            autoCapitalize={recovery ? "characters" : "off"}
            dir="ltr"
            required
            autoFocus
            maxLength={32}
            className={BIG_INPUT}
            data-testid="two-factor-code"
          />
        </IconInput>
      </Field>
      <SubmitButton size="xl" pendingText="جارٍ التحقق…" className="w-full" data-testid="two-factor-submit">
        إكمال الدخول
        <LogIn aria-hidden />
      </SubmitButton>
      <button
        type="button"
        onClick={() => setRecovery((r) => !r)}
        className="mx-auto inline-flex min-h-11 items-center rounded-xl px-3 text-[0.92rem] font-bold text-brand-700 underline-offset-4 hover:bg-brand-50 hover:underline"
        data-testid="two-factor-toggle-recovery"
      >
        {recovery ? "استخدم الرمز من التطبيق" : "ليس معك جوالك؟ استخدم رمز استرداد"}
      </button>
    </form>
  );
}
