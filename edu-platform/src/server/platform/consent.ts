import "server-only";
import { createHash } from "node:crypto";
import { sql, type Db } from "../db";
import { readSettings, type PlatformSettings } from "./settings";
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

/**
 * إعدادات تطبعها صفحتا الشروط والخصوصية داخل نصهما (اسم المنصة، مزود البريد، هوية البائع).
 * tests/integration/legal-pages.test.ts يفشل إذا طبعت إحدى الصفحتين إعدادًا ليس في هذه القائمة.
 */
export const LEGAL_TEXT_SETTINGS = ["site_name", "mail_provider_name", "seller_legal_name", "seller_license_number", "seller_address"] as const satisfies readonly (keyof PlatformSettings)[];

export type LegalTextSettings = Pick<PlatformSettings, (typeof LEGAL_TEXT_SETTINGS)[number]>;

/** بصمة قصيرة لقيم هذه الإعدادات: نفس القيم تعطي نفس البصمة، وأي تغيير فيها يعطي بصمة أخرى */
export function legalTextTag(s: LegalTextSettings): string {
  return createHash("sha256")
    .update(JSON.stringify(LEGAL_TEXT_SETTINGS.map((k) => s[k])))
    .digest("hex")
    .slice(0, 10);
}

/**
 * ما يُسجَّل في document_version. نص الشروط والخصوصية يتغير بإعدادات المالك، فتحمل نسختهما المسجلة بصمة تلك الإعدادات
 * (مثل 2026-11-draft-5+3f9a0c1b2d)، ليعرف السجل أي نص بالضبط وافق عليه المستخدم. الإقرار واتفاقية المعلم نصهما ثابت في الكود.
 * إعادة طلب الموافقة تتبع رقم النسخة وحده (missingAccountConsents): تغيير جوهري في النص = رقم جديد في lib/consent.ts.
 */
export function recordedConsentVersion(kind: ConsentKind, s: LegalTextSettings): string {
  return printsSettings(kind) ? `${CONSENT_VERSIONS[kind]}+${legalTextTag(s)}` : CONSENT_VERSIONS[kind];
}

const printsSettings = (kind: ConsentKind) => kind === "terms" || kind === "privacy";

export async function recordConsent(db: Db, input: { userId: string; kind: ConsentKind; orderId?: string | null; meta: ConsentMeta }): Promise<void> {
  // داخل معاملة تُقرأ الإعدادات عبر اتصالها نفسه
  const version = printsSettings(input.kind) ? recordedConsentVersion(input.kind, await readSettings(db)) : CONSENT_VERSIONS[input.kind];
  await db`
    insert into consent_records (user_id, kind, document_version, order_id, ip, user_agent)
    values (${input.userId}, ${input.kind}, ${version}, ${input.orderId ?? null}, ${input.meta.ip}, ${input.meta.userAgent})
    on conflict do nothing
  `;
}

/** وثائق الحساب التي لم يوافق على نسختها الحالية. الحسابات الأقدم من هذا السجل تعود بالاثنتين. البصمة بعد «+» لا تدخل في المقارنة */
export async function missingAccountConsents(userId: string, db: Db = sql): Promise<ConsentKind[]> {
  const rows = await db<{ kind: ConsentKind }[]>`
    select distinct kind from consent_records
    where user_id = ${userId}
      and ((kind = 'terms' and split_part(document_version, '+', 1) = ${CONSENT_VERSIONS.terms})
        or (kind = 'privacy' and split_part(document_version, '+', 1) = ${CONSENT_VERSIONS.privacy}))
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
