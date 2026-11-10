"use client";

import { useActionState, useState } from "react";
import { Check, Copy, ExternalLink, Hash, LockKeyhole } from "lucide-react";
import type * as React from "react";
import { confirmTwoFactorSetupAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { RecoveryCodesPanel } from "@/components/site/recovery-codes";
import { BIG_INPUT, IconInput } from "../../_components/auth-fields";

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-3 text-[0.98rem] leading-7 text-ink">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#14a597] to-[#0a6b66] font-display text-[0.95rem] font-black text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]">{n}</span>
      <span className="min-w-0 self-center">{children}</span>
    </p>
  );
}

export function TwoFactorSetupForm({ manualKey, otpauthUri, qr }: { manualKey: string; otpauthUri: string; qr: React.ReactNode }) {
  const [state, action] = useActionState(confirmTwoFactorSetupAction, null);
  const [copied, setCopied] = useState(false);
  const recoveryCodes = state?.ok ? state.secrets?.recoveryCodes?.split("\n") : undefined;

  if (recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="تم تفعيل التحقق بخطوتين">
          من الآن سيُطلب الرمز عند كل دخول وعند كل أمر حساس، وأُنهيت أي جلسة أخرى على هذا الحساب.
        </Alert>
        <RecoveryCodesPanel codes={recoveryCodes} doneLabel="حفظتها، متابعة إلى اللوحة" onDone={() => window.location.assign("/admin")} />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate data-testid="two-factor-setup-form">
      <Step n="١">ثبّت على جوالك تطبيق مصادقة، مثل Google Authenticator أو Microsoft Authenticator.</Step>
      <Step n="٢">امسح الرمز بالتطبيق.</Step>
      <div className="mx-auto w-fit rounded-[1.4rem] border border-line bg-white p-2 shadow-xs">{qr}</div>
      <div className="rounded-2xl bg-brand-50/70 p-3.5">
        <p className="text-[0.88rem] leading-6 text-ink-soft">أو أدخل هذا المفتاح يدويًا:</p>
        <code className="num mt-1.5 block rounded-xl bg-white px-2 py-2.5 text-center font-mono text-[0.92rem] font-bold tracking-wide break-all text-ink shadow-xs" dir="ltr" data-testid="totp-manual-key">
          {manualKey}
        </code>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={copied ? "soft" : "outline"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(manualKey.replace(/\s/g, ""));
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "تم النسخ" : "نسخ المفتاح"}
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={otpauthUri} data-testid="totp-otpauth-link">
              <ExternalLink aria-hidden /> فتح في تطبيق المصادقة
            </a>
          </Button>
        </div>
      </div>
      <Step n="٣">اكتب الرمز الذي يظهر في التطبيق، ثم كلمة مرور حسابك للتأكيد.</Step>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="الرمز من التطبيق" htmlFor="code" hint="٦ أرقام، ويتغير كل ٣٠ ثانية">
        <IconInput icon={<Hash />} tone="teal">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" required maxLength={8} className={BIG_INPUT} data-testid="two-factor-code" />
        </IconInput>
      </Field>
      <Field label="كلمة المرور الحالية" htmlFor="currentPassword" hint="ربط جوال جديد بحسابك يحتاج كلمة المرور في هذه اللحظة">
        <IconInput icon={<LockKeyhole />} tone="gold">
          <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" dir="ltr" required maxLength={128} className={BIG_INPUT} data-testid="two-factor-password" />
        </IconInput>
      </Field>
      <SubmitButton size="xl" pendingText="جارٍ التحقق…" className="w-full" data-testid="two-factor-submit">
        تفعيل التحقق بخطوتين
      </SubmitButton>
    </form>
  );
}
