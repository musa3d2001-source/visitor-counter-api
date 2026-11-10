"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action-state";
import { useStepUp } from "./step-up";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * React 19 يعيد ضبط النموذج تلقائيًا بعد انتهاء أي action — حتى عند الخطأ،
 * فيفقد المدير ما كتبه. هذا الخطاف يحفظ القيم المُرسلة ويعيدها عند فشل الحفظ.
 *
 * وإن رفض الخادم أمرًا حساسًا بلا إثبات حديث، تظهر خطوة الرمز ثم يُعاد الأمر نفسه بالبيانات نفسها.
 * الخادم يرفض قبل أي كتابة، فالإعادة آمنة. الخادم وحده يقرر، وهذا مجرد طريق أقصر للمالك.
 */
export function usePreservingAction(action: ServerAction) {
  const stepUp = useStepUp();
  const wrapped = useCallback(
    async (prev: ActionState, fd: FormData): Promise<ActionState> => {
      let res = await action(prev, fd);
      if (res?.stepUp && stepUp && (await stepUp.request(res.stepUp)) === "proved") res = await action(prev, fd);
      if (res && res.error) {
        const values: Record<string, string> = {};
        for (const [k, v] of fd.entries()) if (typeof v === "string" && !(k in values)) values[k] = v;
        return { ...res, values: { ...values, ...(res.values ?? {}) } };
      }
      return res;
    },
    [action, stepUp],
  );
  const [state, formAction, pending] = useActionState(wrapped, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !state?.error || !state.values) return;
    const values = state.values;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
      if (!el.name) continue;
      if (el instanceof HTMLInputElement) {
        if (el.type === "hidden" || el.type === "file" || el.type === "submit") continue;
        if (el.type === "checkbox" || el.type === "radio") {
          el.checked = el.type === "checkbox" ? el.name in values : values[el.name] === el.value;
          continue;
        }
      }
      if (el.name in values) el.value = values[el.name];
    }
  }, [state]);

  return { state, formAction, pending, formRef };
}
