import { after, NextResponse } from "next/server";
import { isSiteUp } from "@/server/platform/health";
import { schemaStatus } from "@/server/db";
import { runOpsWatchdog } from "@/server/platform/scheduled-jobs";
import { withBusyGuard } from "@/server/busy-response";

/**
 * فحص عام لأي خدمة مراقبة خارجية: يقول يعمل أو لا يعمل.
 * لا إصدارات ولا مفاتيح ولا أعداد. 200 مع up و503 مع down.
 * الاستثناء الوحيد (F26): كود نُشر قبل ترحيلات قاعدة البيانات التي يحتاجها. يرد down ومعه أسماء ملفات الترحيل الناقصة،
 * وهي أسماء ملفات في المستودع لا تكشف شيئًا، ليعرف المالك أو المطور فورًا ما يُشغَّل.
 */
export const dynamic = "force-dynamic";

async function handleGET() {
  const up = await isSiteUp();
  // حدود الرسائل وحدود التكرار داخل الفحص نفسه، فكثرة الطلبات هنا لا تصنع رسائل
  if (up) {
    try {
      after(() => runOpsWatchdog());
    } catch {
      await runOpsWatchdog();
    }
  }
  const schema = up ? null : schemaStatus();
  if (schema?.state === "missing") {
    return NextResponse.json({ status: "down", reason: "migrations", missing: [...schema.missing] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ status: up ? "up" : "down" }, { status: up ? 200 : 503, headers: { "cache-control": "no-store" } });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
