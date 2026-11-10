import { vi } from "vitest";
import type { Simulator } from "../mocks/myfatoorah-simulator";

type Envelope = { Data: Record<string, unknown> | null };

/**
 * تعديل رد البوابة داخل الاختبار: رد مزور أو ناقص لا يملك المحاكي حالة له.
 * يبدّل fetch العام، فيمر الرد المعدل بكل ما يمر به الرد الحقيقي. على الاختبار vi.unstubAllGlobals بعده.
 */
export function mutateGatewayReply(path: string, mutate: (data: Record<string, unknown>) => void) {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await real(input, init);
    if (!String(input instanceof Request ? input.url : input).endsWith(path)) return res;
    const json = (await res.json()) as Envelope;
    if (json.Data) mutate(json.Data);
    return new Response(JSON.stringify(json), { status: res.status, headers: { "content-type": "application/json" } });
  });
}

/**
 * وضع الإنتاج لا يقبل إلا عنوان البوابة الرسمي. هذا المحوّل يوصل طلبه إلى المحاكي داخل الاختبار فقط،
 * ويكتب روابط الدفع على نطاق البوابة كما ترد منها.
 */
export function routeOfficialGatewayTo(sim: Simulator, officialOrigin = "https://api.myfatoorah.com") {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(`${officialOrigin}/`)) return real(input, init);
    const res = await real(`${sim.url}${url.slice(officialOrigin.length)}`, init);
    const text = (await res.text()).split(`${sim.url}/pay/`).join("https://portal.myfatoorah.com/pay/");
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  });
}
