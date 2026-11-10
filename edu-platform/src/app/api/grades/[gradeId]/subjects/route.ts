import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/uuid";
import { withBusyGuard } from "@/server/busy-response";
import { listSubjects } from "@/server/catalog/queries";

/**
 * مواد صف واحد لتبويبات الصفحة الرئيسية: الصفحة ترسم لوحة واحدة، وتطلب غيرها عند الحاجة.
 * بيانات عامة بلا جلسة: لا كوكي ولا شيء يخص الزائر. تُحفظ دقيقة في المتصفح فلا يتكرر الطلب بين التبويبات.
 */
async function handleGET(_req: NextRequest, ctx: { params: Promise<{ gradeId: string }> }) {
  const { gradeId } = await ctx.params;
  if (!isUuid(gradeId)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const subjects = await listSubjects(gradeId);
  return NextResponse.json({ subjects: subjects.map((x) => ({ id: x.id, slug: x.slug, name: x.name, icon: x.icon, productCount: x.productCount })) }, { headers: { "cache-control": "public, max-age=60" } });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
