/**
 * قيم حذف بيانات الطالب وفلاتر ردود البوابة. بلا اعتماديات خادم: يستخدمها التحقق من البريد والواجهة أيضًا.
 * القيود في 0011_accounts_hardening.sql تكرر النطاق وقيمة كلمة المرور: غيّرها معًا.
 */
export const ANONYMIZED_EMAIL_DOMAIN = "anonymized.invalid";

/** ليست هاش scrypt: verifyPassword يرفضها دائمًا، فلا كلمة مرور تطابقها */
export const ANONYMIZED_PASSWORD_HASH = "!anonymized";

/** معرّف الحساب يجعل القيمة فريدة، والنطاق .invalid محجوز فلا يمكن أن يملكه أحد */
export function anonymizedEmail(userId: string): string {
  return `deleted-${userId}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

export function anonymizedName(userId: string): string {
  return `طالب محذوف ${userId.slice(0, 8)}`;
}

export function isAnonymizedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`);
}

export type AnonymizationBlockerKind = "open_order" | "payable_invoice" | "refund" | "extra_payment" | "payment_alert";
export type AnonymizationBlocker = { kind: AnonymizationBlockerKind; orderId: string; orderNumber: string };

export const ANONYMIZATION_BLOCKER_LABELS: Record<AnonymizationBlockerKind, string> = {
  open_order: "طلب مفتوح لم يُغلق بعد",
  payable_invoice: "فاتورة ما زال يمكن دفعها",
  refund: "استرداد لم يُحسم",
  extra_payment: "دفعة زائدة لم يُبت فيها",
  payment_alert: "تنبيه دفع لم يُغلق",
};

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** قائمة سماح لا قائمة منع: حقل تضيفه البوابة لاحقًا لا يبقى إلا إذا أضفناه هنا. القيم البسيطة فقط */
function pick(source: unknown, keys: readonly string[]): Json {
  const out: Json = {};
  if (!isObject(source)) return out;
  for (const key of keys) {
    const value = source[key];
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) out[key] = value;
  }
  return out;
}

const STATUS_INVOICE_KEYS = ["InvoiceId", "InvoiceStatus", "InvoiceReference", "CustomerReference", "CreatedDate", "ExpiryDate", "InvoiceValue", "InvoiceDisplayValue", "DueDeposit", "DepositStatus"] as const;
const STATUS_TRANSACTION_KEYS = [
  "TransactionDate",
  "PaymentGateway",
  "ReferenceId",
  "TrackId",
  "TransactionId",
  "PaymentId",
  "AuthorizationId",
  "TransactionStatus",
  "TransationValue",
  "CustomerServiceCharge",
  "DueValue",
  "PaidCurrency",
  "PaidCurrencyValue",
  "Currency",
  "Error",
  "ErrorCode",
] as const;

/** آخر رد GetPaymentStatus بلا اسم العميل وبريده وهاتفه ورقم البطاقة. ما يبقى يكفي لتدقيق العملية */
export function redactGatewayStatus(status: unknown): Json {
  if (!isObject(status)) return {};
  const out = pick(status, STATUS_INVOICE_KEYS);
  if (Array.isArray(status.InvoiceTransactions)) out.InvoiceTransactions = status.InvoiceTransactions.map((t) => pick(t, STATUS_TRANSACTION_KEYS));
  return out;
}

const WEBHOOK_SECTIONS: Record<string, readonly string[]> = {
  Invoice: ["Id", "Status", "Reference", "CreationDate", "ExpirationDate", "ExternalIdentifier"],
  Transaction: ["Id", "Status", "PaymentMethod", "PaymentId", "ReferenceId", "TrackId", "AuthorizationId", "TransactionDate", "Error"],
  Amount: ["BaseCurrency", "ValueInBaseCurrency", "ServiceCharge", "ReceivableAmount", "DisplayCurrency", "ValueInDisplayCurrency"],
  Refund: ["Id", "Reference", "Status", "InvoiceId", "CreationDate", "RefundDate", "RRN"],
  ReferencedInvoice: ["Id", "Reference", "ExternalIdentifier", "PaymentMethod", "BaseCurrency", "ValueInBaseCurrency", "RemainingValueInBaseCurrency"],
  Dispute: ["Type", "Status", "CreatedDate", "ChargeBackType", "Reason", "DisputeTransactionId", "InvoiceTransactionId"],
};

/** حدث Webhook بلا Customer و Card و IP وما شابهها. ما لا يرد في القائمة يسقط */
export function redactWebhookPayload(payload: unknown): Json {
  if (!isObject(payload)) return {};
  const out: Json = { Event: pick(payload.Event, ["Code", "Name", "CountryIsoCode", "CreationDate", "Reference"]) };
  if (isObject(payload.Data)) {
    const source = payload.Data;
    const data: Json = {};
    for (const [section, keys] of Object.entries(WEBHOOK_SECTIONS)) if (isObject(source[section])) data[section] = pick(source[section], keys);
    out.Data = data;
  }
  return out;
}
