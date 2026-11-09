import "server-only";
import { sql, type Db } from "../db";
import { clientIp, userAgent } from "../http";
import { ACCOUNT_CONSENT_KINDS, CONSENT_FIELD_ERRORS, CONSENT_VERSIONS, type ConsentField, type ConsentKind } from "@/lib/consent";

/**
 * سجل الموافقات (قرار D5). الصياغات وأرقام النسخ في lib/consent.ts، وهي مسودة بانتظار المحامي.
 * الصف ملحق فقط، والتسجيل يتم في معاملة الفعل نفسه: لا حساب بلا موافقته، ولا طلب بلا إقراره.
 */
export type ConsentMeta = { ip: string | null; userAgent: string | null };

export class ConsentRequiredError extends Error {
  constructor(public readonly missing: ConsentField[]) {
    super(`consent required: ${missing.join(",")}`);
    this.name = "ConsentRequiredError";
  }

  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.missing.map((f) => [f, CONSENT_FIELD_ERRORS[f]]));
  }
}

/** العنوان المجهول يُخزَّن فارغًا، لا كلمة «unknown»: هذا سجل أدلة */
export function consentMeta(input: { ip?: string | null; userAgent?: string | null }): ConsentMeta {
  const ip = input.ip && input.ip !== "unknown" ? input.ip.slice(0, 64) : null;
  return { ip, userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null };
}

/** بيانات الطلب الحالي. تعذر قراءتها لا يوقف الشراء: السجل يقوم بالوقت والنسخة */
export async function requestConsentMeta(): Promise<ConsentMeta> {
  const [ip, ua] = await Promise.all([clientIp().catch(() => null), userAgent().catch(() => null)]);
  return consentMeta({ ip, userAgent: ua });
}

export async function recordConsent(db: Db, input: { userId: string; kind: ConsentKind; orderId?: string | null; meta: ConsentMeta }): Promise<void> {
  await db`
    insert into consent_records (user_id, kind, document_version, order_id, ip, user_agent)
    values (${input.userId}, ${input.kind}, ${CONSENT_VERSIONS[input.kind]}, ${input.orderId ?? null}, ${input.meta.ip}, ${input.meta.userAgent})
    on conflict do nothing
  `;
}

/** وثائق الحساب التي لم يوافق على نسختها الحالية. الحسابات الأقدم من هذا السجل تعود بالاثنتين */
export async function missingAccountConsents(userId: string, db: Db = sql): Promise<ConsentKind[]> {
  const rows = await db<{ kind: ConsentKind }[]>`
    select distinct kind from consent_records
    where user_id = ${userId}
      and ((kind = 'terms' and document_version = ${CONSENT_VERSIONS.terms}) or (kind = 'privacy' and document_version = ${CONSENT_VERSIONS.privacy}))
  `;
  const have = new Set(rows.map((r) => r.kind));
  return ACCOUNT_CONSENT_KINDS.filter((k) => !have.has(k));
}

export type OrderConsentNeeds = { guardian: boolean; terms: boolean };

/** ما ينقص طلبًا مدفوعًا قبل إصدار فاتورته */
export async function orderConsentNeeds(input: { orderId: string; userId: string }): Promise<OrderConsentNeeds> {
  const [[declared], documents] = await Promise.all([
    sql`select 1 from consent_records where order_id = ${input.orderId} and user_id = ${input.userId} and kind = 'guardian_purchase' limit 1`,
    missingAccountConsents(input.userId),
  ]);
  return { guardian: !declared, terms: documents.length > 0 };
}

/** حارس الخادم: كل طريق إلى صفحة الدفع يمر من startPayment، فلا يفلت منه طلب ولا إعادة محاولة */
export async function assertOrderConsent(input: { orderId: string; userId: string }): Promise<void> {
  const needs = await orderConsentNeeds(input);
  const missing: ConsentField[] = [];
  if (needs.terms) missing.push("termsAccepted");
  if (needs.guardian) missing.push("guardianDeclaration");
  if (missing.length) throw new ConsentRequiredError(missing);
}

/** ما أقر به الطالب من صفحة طلب قائم: طلب أقدم من هذا السجل، أو حساب لم يوافق على النسخة الحالية */
export async function recordOrderPageConsent(input: { orderId: string; userId: string; guardianDeclared: boolean; termsAccepted: boolean; meta: ConsentMeta }): Promise<void> {
  if (!input.guardianDeclared && !input.termsAccepted) return;
  await sql.begin(async (tx) => {
    if (input.guardianDeclared) await recordConsent(tx, { userId: input.userId, kind: "guardian_purchase", orderId: input.orderId, meta: input.meta });
    if (input.termsAccepted) {
      for (const kind of await missingAccountConsents(input.userId, tx)) await recordConsent(tx, { userId: input.userId, kind, orderId: input.orderId, meta: input.meta });
    }
  });
}
