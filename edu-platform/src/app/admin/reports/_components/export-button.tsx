"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useStepUp } from "@/components/admin/step-up";
import { Button, type ButtonProps } from "@/components/ui/button";

const GENERIC_ERROR = "تعذر تجهيز الملف. حاول مرة أخرى.";

async function refusalOf(res: Response): Promise<{ error: string; stepUp?: "proof" | "enrol" }> {
  try {
    const body = (await res.json()) as { error?: string; stepUp?: "proof" | "enrol" };
    return { error: body.error ?? GENERIC_ERROR, stepUp: body.stepUp };
  } catch {
    return { error: GENERIC_ERROR };
  }
}

function saveFile(blob: Blob, res: Response) {
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "report.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** التصدير طلب POST: يمر بخطوة الإثبات إن طلبها الخادم، ثم يُحفظ الملف، وأي رفض يظهر بالعربية بدل صفحة خطأ */
export function ExportCsvButton({ query, variant, size, testId }: { query: string; variant: ButtonProps["variant"]; size: ButtonProps["size"]; testId: string }) {
  const stepUp = useStepUp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`/api/admin/reports/export?${query}`, { method: "POST", credentials: "same-origin" });
        if (res.ok) {
          saveFile(await res.blob(), res);
          return;
        }
        const refusal = await refusalOf(res);
        if (res.status === 403 && refusal.stepUp && attempt === 0 && stepUp && (await stepUp.request(refusal.stepUp)) === "proved") continue;
        setError(refusal.error);
        return;
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <Button type="button" variant={variant} size={size} disabled={busy} onClick={run} data-testid={testId}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />} تصدير CSV
      </Button>
      {error ? (
        <p role="alert" className="mt-1 max-w-64 text-xs font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
