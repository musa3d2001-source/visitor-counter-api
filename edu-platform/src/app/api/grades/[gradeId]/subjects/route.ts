import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/uuid";
import { withBusyGuard } from "@/server/busy-response";
import { listSubjects } from "@/server/catalog/public-data";
import { LENIENT_INTS, PUBLIC_FRESHNESS_SECONDS } from "@/server/env-schema";

/**
 * مواد صف واحد لتبويبات الصفحة الرئيسية: الصفحة ترسم لوحة واحدة، وتطلب غيرها عند الحاجة.
 * بيانات عامة بلا جلسة: لا كوكي ولا شيء يخص الزائر.
 *
 * عمرها في المتصفح ما بقي من دقيقة المالك بعد أطول عمر لذاكرة الخادم (٦٠ − ٥٥ = ٥ ثوانٍ، البند R022): مادة أخفاها المالك
 * تختفي عند كل زائر خلال دقيقة، كما تختفي من بقية الصفحات. الصفحة نفسها لا تطلب التبويب مرتين ما دامت مفتوحة.
 * بلا s-maxage عن قصد: إبطال الذاكرة عند تعديل المالك لا يصل إلى نسخة على شبكة Vercel، فتبقى طبقة لا يمحوها شيء.
 */
const BROWSER_SECONDS = PUBLIC_FRESHNESS_SECONDS - LENIENT_INTS.PUBLIC_CACHE_SECONDS.max;
const CACHE_CONTROL = `public, max-age=${BROWSER_SECONDS}`;
async function handleGET(_req: NextRequest, ctx: { params: Promise<{ gradeId: string }> }) {
  const { gradeId } = await ctx.params;
  if (!isUuid(gradeId)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const subjects = await listSubjects(gradeId);
  return NextResponse.json({ subjects: subjects.map((x) => ({ id: x.id, slug: x.slug, name: x.name, icon: x.icon, productCount: x.productCount })) }, { headers: { "cache-control": CACHE_CONTROL } });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
