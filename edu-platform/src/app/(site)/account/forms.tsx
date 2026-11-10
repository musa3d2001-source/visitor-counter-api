"use client";

import { useActionState } from "react";
import type * as React from "react";
import Link from "next/link";
import { CircleCheck, Clock, Copy, KeyRound, Save, Trash2, Undo2, XCircle } from "lucide-react";
import { changePasswordAction, requestDataAction, updateProfileAction, withdrawDataRequestAction } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { STUDENT_PASSWORD_HINT } from "@/lib/password-policy";
import { DATA_REQUEST_LABELS, type DataRequestKind, type DataRequestStatus } from "@/lib/data-requests";
import { Button } from "@/components/ui/button";

export function ProfileForm({ user, grades }: { user: { fullName: string; phone: string | null; gradeId: string | null }; grades: { id: string; name: string }[] }) {
  const [state, action] = useActionState(updateProfileAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state?.ok ? (
        <Alert tone="success" className="sm:col-span-2">
          {state.message}
        </Alert>
      ) : null}
      <Field label="الاسم" htmlFor="fullName" error={fe.fullName} className="sm:col-span-2">
        <Input id="fullName" name="fullName" defaultValue={user.fullName} required />
      </Field>
      <Field label="رقم الهاتف" htmlFor="phone" error={fe.phone} hint="اختياري، رقم كويتي">
        <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={user.phone?.replace("+965", "") ?? ""} />
      </Field>
      <Field label="الصف الدراسي" htmlFor="gradeId">
        <Select id="gradeId" name="gradeId" defaultValue={user.gradeId ?? ""}>
          <option value="">غير محدد</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton size="lg" className="w-full sm:w-auto sm:min-w-44">
          <Save aria-hidden /> حفظ
        </SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm({ staff = false }: { staff?: boolean }) {
  const [state, action] = useActionState(changePasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="كلمة المرور الحالية" htmlFor="currentPassword" error={fe.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required />
      </Field>
      <Field label="كلمة المرور الجديدة" htmlFor="newPassword" error={fe.newPassword} hint={staff ? "١٢ حرفًا على الأقل، ولا تعتمد على كلمة شائعة" : STUDENT_PASSWORD_HINT}>
        <Input id="newPassword" name="newPassword" type="password" dir="ltr" autoComplete="new-password" required minLength={staff ? 12 : 8} />
      </Field>
      <Field label="تأكيد كلمة المرور الجديدة" htmlFor="confirmPassword" error={fe.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" dir="ltr" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" variant="accent" className="w-full sm:w-fit">
        <KeyRound aria-hidden /> تغيير كلمة المرور
      </SubmitButton>
    </form>
  );
}

type DataRequestView = { id: string; kind: DataRequestKind; status: DataRequestStatus; createdLabel: string; closedLabel: string | null; note: string | null };

const DATA_REQUEST_COPY: Record<DataRequestKind, { icon: React.ReactNode; ask: string; note: string }> = {
  delete: { icon: <Trash2 aria-hidden />, ask: "اطلب حذف حسابي", note: "عند تنفيذ الحذف لا يعود بالإمكان الدخول إلى حسابك أو مكتبتك، ولا يمكن التراجع عنه بعد تنفيذه." },
  copy: { icon: <Copy aria-hidden />, ask: "اطلب نسخة من بياناتي", note: "تعدّها إدارة المنصة يدويًا وترسلها إلى بريد حسابك." },
};

const CLOSED_COPY: Record<Exclude<DataRequestStatus, "open">, string> = {
  done: "نُفّذ طلبك",
  declined: "لم يُنفَّذ طلبك",
  withdrawn: "سحبت طلبك",
};

function DataRequestRow({ kind, open }: { kind: DataRequestKind; open: DataRequestView | undefined }) {
  const [state, action] = useActionState(open ? withdrawDataRequestAction : requestDataAction, null);
  const copy = DATA_REQUEST_COPY[kind];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4" data-testid={`data-request-${kind}`}>
      <div className="min-w-0">
        <h3 className="font-display text-[1.05rem] font-extrabold text-ink">{DATA_REQUEST_LABELS[kind]}</h3>
        <p className="mt-1 text-[0.92rem] leading-7 text-ink-soft">{copy.note}</p>
      </div>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {open ? (
        <p className="flex items-center gap-2 text-[0.92rem] font-bold text-ink-soft" data-testid="data-request-open">
          <Clock className="size-4 shrink-0" aria-hidden />
          طلبك بانتظار المراجعة منذ {open.createdLabel}
        </p>
      ) : null}
      <form action={action}>
        {open ? <input type="hidden" name="requestId" value={open.id} /> : <input type="hidden" name="kind" value={kind} />}
        {open ? (
          <SubmitButton size="md" variant="outline" className="w-full sm:w-fit" pendingText="جارٍ السحب…">
            <Undo2 aria-hidden /> سحب الطلب
          </SubmitButton>
        ) : (
          <SubmitButton size="md" variant="outline" className="w-full sm:w-fit" pendingText="جارٍ الإرسال…">
            {copy.icon} {copy.ask}
          </SubmitButton>
        )}
      </form>
    </li>
  );
}

/** الطالب يطلب، والإدارة تراجع وتنفذ: لا زر هنا يحذف شيئًا مباشرة */
export function DataRequests({ requests }: { requests: DataRequestView[] }) {
  const closed = requests.filter((r) => r.status !== "open").slice(0, 3);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.95rem] leading-7 text-ink-soft">
        تصل طلباتك إلى إدارة المنصة فتراجعها بنفسها، ولا يحدث شيء تلقائيًا. وما يبقى بعد الحذف مذكور في{" "}
        <Link href="/privacy#rights" className="font-bold text-brand-700 underline underline-offset-4">
          سياسة الخصوصية
        </Link>
        .
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {(["delete", "copy"] as const).map((kind) => {
          const open = requests.find((r) => r.kind === kind && r.status === "open");
          return <DataRequestRow key={kind} kind={kind} open={open} />;
        })}
      </ul>
      {closed.length ? (
        <ul className="flex flex-col gap-2 text-[0.92rem] leading-7 text-ink-soft" data-testid="data-request-history">
          {closed.map((r) => (
            <li key={r.id} className="flex items-start gap-2">
              {r.status === "done" ? <CircleCheck className="mt-1.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-1.5 size-4 shrink-0 text-muted" aria-hidden />}
              <span className="min-w-0 break-words">
                {DATA_REQUEST_LABELS[r.kind]}: {CLOSED_COPY[r.status as Exclude<DataRequestStatus, "open">]} في {r.closedLabel}
                {r.status === "declined" && r.note ? `. السبب: ${r.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
