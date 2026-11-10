import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchText } from "../outbound";

/**
 * عميل MyFatoorah API v2 — مطابق لعقد المكتبة الرسمية (myfatoorah/library 2.2.10):
 *  - POST /v2/InitiatePayment   → وسائل الدفع المفعّلة فعليًا في حساب التاجر
 *  - POST /v2/ExecutePayment    → إنشاء فاتورة لوسيلة محددة وإرجاع PaymentURL
 *  - POST /v2/SendPayment       → فاتورة برابط (كل الوسائل) وإرجاع InvoiceURL
 *  - POST /v2/GetPaymentStatus  → الاستعلام عن الحالة من الخادم (مصدر الحقيقة)
 *  - POST /v2/MakeRefund        → طلب استرداد
 *  - POST /v2/GetRefundStatus   → الاستعلام عن حالة الاسترداد
 *  - Webhook V2: الترويسة MyFatoorah-Signature = Base64(HMAC-SHA256(secret, "k=v,k=v,..."))
 *
 * لا تُخزَّن أي بيانات بطاقات — الدفع يتم بالكامل في صفحة MyFatoorah.
 */

export class MyFatoorahError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MyFatoorahError";
  }
}

export type MfPaymentMethod = {
  PaymentMethodId: number;
  PaymentMethodAr: string;
  PaymentMethodEn: string;
  PaymentMethodCode: string;
  IsDirectPayment: boolean;
  ServiceCharge: number;
  TotalAmount: number;
  CurrencyIso: string;
  ImageUrl: string;
  IsEmbeddedSupported?: boolean;
  PaymentCurrencyIso?: string;
};

export type MfTransaction = {
  TransactionDate: string;
  PaymentGateway: string;
  ReferenceId: string | null;
  TrackId: string | null;
  TransactionId: string | null;
  PaymentId: string;
  AuthorizationId: string | null;
  /** القيم الرسمية: InProgress | Succss | Failed | Canceled | Authorize */
  TransactionStatus: string;
  TransationValue: string | number;
  PaidCurrency: string | null;
  PaidCurrencyValue: string | number | null;
  Currency?: string | null;
  Error: string | null;
  ErrorCode?: string | null;
  CardNumber?: string | null;
};

export type MfPaymentStatus = {
  InvoiceId: number;
  /** القيم الرسمية: Pending | Paid | Canceled | DuplicatePayment */
  InvoiceStatus: string;
  InvoiceReference: string;
  CustomerReference: string | null;
  CreatedDate: string;
  ExpiryDate: string;
  ExpiryTime?: string;
  InvoiceValue: number;
  InvoiceDisplayValue: string;
  CustomerName: string | null;
  CustomerEmail: string | null;
  UserDefinedField: string | null;
  InvoiceTransactions: MfTransaction[];
};

export type MfConfig = { baseUrl: string; apiKey: string; timeoutMs?: number };

type MfEnvelope<T> = {
  IsSuccess: boolean;
  Message?: string;
  ValidationErrors?: { Name: string; Error: string | null }[] | null;
  FieldsErrors?: { Name: string; Error: string | null }[] | null;
  Data: T;
};

function extractError(json: MfEnvelope<unknown> | null, raw: string): string {
  if (!json) return raw.slice(0, 300) || "استجابة غير متوقعة من بوابة الدفع";
  const list = json.ValidationErrors ?? json.FieldsErrors;
  if (list && list.length) return list.map((e) => `${e.Name}: ${e.Error ?? ""}`).join(", ");
  const data = json.Data as { ErrorMessage?: string } | null;
  if (data && typeof data === "object" && data.ErrorMessage) return data.ErrorMessage;
  return json.Message || "خطأ غير معروف من بوابة الدفع";
}

/** أكبر رد معقول من البوابة (حالة فاتورة بكل محاولاتها). ما فوقه ليس ردًا منها */
const MF_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class MyFatoorahClient {
  constructor(private readonly cfg: MfConfig) {}

  private async call<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    // المهلة تغطي الجسم أيضًا: رد يرسل ترويساته ثم يتوقف ينتهي هنا ولا يحجز الدالة. ولا تحويلات: المفتاح لا يُرسل إلى غير البوابة
    let res: { status: number; text: string };
    try {
      res = await fetchText(
        `${this.cfg.baseUrl.replace(/\/$/, "")}${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.cfg.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...extraHeaders,
          },
          body: JSON.stringify(body),
          cache: "no-store",
        },
        { timeoutMs: this.cfg.timeoutMs ?? 20_000, maxBytes: MF_MAX_RESPONSE_BYTES },
      );
    } catch (err) {
      // بلا status: النتيجة مجهولة (قد تكون البوابة نفذت الطلب)، كما عند انقطاع الاتصال
      throw new MyFatoorahError(`تعذر الاتصال ببوابة الدفع: ${err instanceof Error ? err.message : String(err)}`);
    }
    const raw = res.text;
    let json: MfEnvelope<T> | null = null;
    try {
      json = JSON.parse(raw) as MfEnvelope<T>;
    } catch {
      json = null;
    }
    // جسم غير JSON لم يأتِ من منطق البوابة (وسيط أو جدار حماية)، فلا نعده ردًا منها: يبقى بلا status وتكون نتيجته مجهولة
    if (!json || !json.IsSuccess) throw new MyFatoorahError(extractError(json, raw), json ? res.status : undefined);
    return json.Data;
  }

  async initiatePayment(invoiceAmountKwd: string): Promise<MfPaymentMethod[]> {
    const data = await this.call<{ PaymentMethods: MfPaymentMethod[] }>("/v2/InitiatePayment", {
      InvoiceAmount: Number(invoiceAmountKwd),
      CurrencyIso: "KWD",
    });
    return data.PaymentMethods ?? [];
  }

  async executePayment(input: ExecuteInput & { PaymentMethodId: number }) {
    return this.call<{ InvoiceId: number; IsDirectPayment?: boolean; PaymentURL: string; CustomerReference: string | null; UserDefinedField: string | null; RecurringId?: string | null }>(
      "/v2/ExecutePayment",
      input,
    );
  }

  async sendPayment(input: ExecuteInput) {
    return this.call<{ InvoiceId: number; InvoiceURL: string; CustomerReference: string | null; UserDefinedField: string | null }>(
      "/v2/SendPayment",
      { ...input, NotificationOption: "LNK" },
    );
  }

  async getPaymentStatus(key: string, keyType: "PaymentId" | "InvoiceId") {
    return this.call<MfPaymentStatus>("/v2/GetPaymentStatus", { Key: key, KeyType: keyType });
  }

  /**
   * externalIdentifier يربط الاسترداد بسجلنا ليُعثر عليه في GetRefundStatus،
   * وidempotencyKey (ترويسة موثقة، صالحة ٢٥٠ دقيقة) يجعل إعادة الإرسال بالمفتاح نفسه تعيد الرد الأصلي دون استرداد ثانٍ.
   */
  async makeRefund(input: { key: string; keyType: "PaymentId" | "InvoiceId"; amountKwd: string; comment: string; externalIdentifier?: string; idempotencyKey?: string }) {
    // لا نرسل عملة: الوثائق تنص على أن مبلغ الاسترداد يُحسب دائمًا بالعملة الأساسية للحساب
    return this.call<{
      Key: string;
      RefundId: number;
      RefundReference: string;
      RefundInvoiceId?: number;
      Amount: number;
      Comment: string;
      ExternalIdentifier?: string | null;
    }>(
      "/v2/MakeRefund",
      {
        Key: input.key,
        KeyType: input.keyType,
        RefundChargeOnCustomer: false,
        ServiceChargeOnCustomer: false,
        Amount: Number(input.amountKwd),
        Comment: input.comment,
        ...(input.externalIdentifier ? { ExternalIdentifier: input.externalIdentifier } : {}),
      },
      input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
    );
  }

  async getRefundStatus(key: string, keyType: "InvoiceId" | "RefundId" | "RefundReference") {
    // الوثائق تصف Data بأنها قابلة لأن تكون null، وغياب النتيجة يعني أن البوابة لا تعرف استردادًا بهذا المفتاح
    const data = await this.call<{ RefundStatusResult?: MfRefundStatus[] | null } | null>("/v2/GetRefundStatus", { Key: key, KeyType: keyType });
    return data?.RefundStatusResult ?? [];
  }
}

export type MfRefundStatus = {
  RefundId: number;
  /** القيم الموثقة: Refunded | Canceled | Pending */
  RefundStatus: string;
  InvoiceId: number;
  Amount: number;
  RefundReference: string;
  RefundAmount: number;
  ExternalIdentifier: string | null;
};

export type ExecuteInput = {
  InvoiceValue: number;
  DisplayCurrencyIso: "KWD";
  CustomerName: string;
  CustomerEmail: string | null;
  MobileCountryCode?: string;
  CustomerMobile?: string;
  CustomerReference: string;
  UserDefinedField: string;
  /** القيم الموثقة: AR | EN */
  Language: "AR" | "EN";
  CallBackUrl: string;
  ErrorUrl: string;
  SourceInfo?: string;
  /** صيغة date-time: متى ينتهي رابط الفاتورة. انظر gatewayExpiryDate */
  ExpiryDate?: string;
};

/**
 * وقت انتهاء الفاتورة بالصيغة التي تنص عليها أمثلة الوثائق الرسمية: Y-m-d\TH:i:s بتوقيت Asia/Kuwait، بلا إزاحة ولا Z.
 * الكويت UTC+3 طوال السنة، فلا حاجة إلى قواعد توقيت صيفي. نفس الأرقام يجب أن تُقرأ كوقت محلي للكويت،
 * وأي قراءة خاطئة تغيّر عمر الرابط فقط، بينما يبقى منع الدفع المزدوج قائمًا على فحص كل الفواتير.
 * يجب التأكد من ذلك على بيئة البوابة التجريبية الحقيقية قبل الإطلاق.
 */
export function gatewayExpiryDate(at: Date): string {
  return new Date(at.getTime() + 3 * 3600_000).toISOString().slice(0, 19);
}

/** ردود لا تعني أن البوابة قررت الرفض: مهلة أو تعارض مع طلب جارٍ أو ضغط، والعملية ربما ما زالت قيد التنفيذ */
const UNCLEAR_STATUSES = new Set([408, 409, 425, 429]);

/** رفض صريح من البوابة وصلنا رده: العملية لم تُنفذ. انقطاع الاتصال أو خطأ 5xx نتيجته مجهولة */
export function isDefiniteGatewayRefusal(err: unknown): boolean {
  return err instanceof MyFatoorahError && err.status !== undefined && err.status < 500 && !UNCLEAR_STATUSES.has(err.status);
}

/**
 * هل تدل قيمة InvoiceDisplayValue على الدينار الكويتي؟
 * الوثائق تعرضها هكذا: "1.000 KD" و"12,345.000 KD"، ونقبل أيضًا التهجئة ISO: "3.000 KWD" والرمز العربي "3.000 د.ك" لأننا نرسل Language=AR.
 * أي عملة أخرى أو نص بلا عملة أو حقل فارغ نرفضه: عند الشك لا نؤكد الدفع، ويراجعه المالك.
 */
export function isKuwaitiDinarDisplay(displayValue: string | null | undefined): boolean {
  const text = (displayValue ?? "").trim();
  if (!text) return false;
  return isKuwaitiDinarCode(text.split(/\s+/).pop());
}

/**
 * رمز العملة في حقل Currency على العملية: الوثائق تعرضه "KD"، ونقبل ISO "KWD" كذلك. الفارغ مرفوض.
 * يطابق الرمز كله، فلا يمر "1KD" ولا "KDX".
 */
export function isKuwaitiDinarCode(code: string | null | undefined): boolean {
  const unit = (code ?? "").trim().toUpperCase();
  return unit === "KD" || unit === "KWD" || unit === "د.ك" || unit === "د.ك.";
}

/** الاسم بدون رموز خاصة (نفس قاعدة المكتبة الرسمية) */
export function sanitizeCustomerName(name: string): string {
  return name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().slice(0, 100) || "Customer";
}

// ---------------------------------------------------------------------------
// Webhook V2
// ---------------------------------------------------------------------------

export type WebhookV2Body = {
  Event: { Code: number; Name: string; CountryIsoCode?: string; CreationDate?: string; Reference?: string };
  Data: Record<string, unknown>;
};

function pick(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const p of path.split(".")) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
    else return "";
  }
  return cur === null || cur === undefined ? "" : String(cur);
}

/** الحقول الموقَّعة لكل حدث — بنفس الترتيب الوارد في المكتبة الرسمية */
const V2_SIGNED_FIELDS: Record<number, string[]> = {
  1: ["Invoice.Id", "Invoice.Status", "Transaction.Status", "Transaction.PaymentId", "Invoice.ExternalIdentifier"],
  2: ["Refund.Id", "Refund.Status", "Amount.ValueInBaseCurrency", "ReferencedInvoice.Id"],
  3: ["Deposit.Reference", "Deposit.ValueInBaseCurrency", "Deposit.NumberOfTransactions"],
  4: ["Supplier.Code", "KycDecision.Status"],
  5: ["Recurring.Id", "Recurring.Status", "Recurring.InitialInvoiceId"],
  6: ["Dispute.DisputeTransactionId", "Dispute.Status", "Invoice.Id", "Invoice.Status", "Transaction.Status", "Transaction.PaymentId", "Invoice.ExternalIdentifier"],
  7: ["Supplier.Code", "RequestStatus.Status"],
};

export function webhookV2SigningString(body: WebhookV2Body): string | null {
  const fields = V2_SIGNED_FIELDS[Number(body?.Event?.Code)];
  if (!fields) return null;
  return fields.map((f) => `${f}=${pick(body.Data, f)}`).join(",");
}

export function signWebhookV2(body: WebhookV2Body, secret: string): string | null {
  const s = webhookV2SigningString(body);
  if (s === null) return null;
  return createHmac("sha256", secret).update(s, "utf8").digest("base64");
}

export function verifyWebhookV2Signature(body: WebhookV2Body, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = signWebhookV2(body, secret);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** تفسير نتيجة GetPaymentStatus بنفس منطق المكتبة الرسمية */
/** عملية نجحت فعلًا لدى البوابة (تُكتب Succss في الوثائق) */
export const isSuccessfulTransaction = (t: MfTransaction): boolean => t.TransactionStatus === "Succss" || t.TransactionStatus === "SUCCESS";

export function interpretPaymentStatus(
  data: MfPaymentStatus,
  paymentId?: string,
): { state: "paid" | "failed" | "pending" | "expired"; transaction: MfTransaction | null; error: string | null } {
  const txs = data.InvoiceTransactions ?? [];
  if (data.InvoiceStatus === "Paid" || data.InvoiceStatus === "DuplicatePayment") {
    const ok = txs.find(isSuccessfulTransaction);
    if (ok) return { state: "paid", transaction: ok, error: null };
  }
  // Canceled هي القيمة الموثقة الوحيدة لفاتورة أُغلقت دون دفع. نعاملها كانتهاء: الطلب نفسه لا يتغير، ويمكن إنشاء فاتورة جديدة
  if (/^(canceled|cancelled|expired)$/i.test(data.InvoiceStatus ?? "")) return { state: "expired", transaction: null, error: null };
  const focus = paymentId ? txs.find((t) => t.PaymentId === paymentId) : txs[txs.length - 1];
  if (focus && (focus.TransactionStatus === "Failed" || focus.TransactionStatus === "Canceled")) {
    return { state: "failed", transaction: focus, error: focus.Error || "فشلت عملية الدفع" };
  }
  return { state: "pending", transaction: focus ?? null, error: null };
}

/**
 * هل على الفاتورة محاولة لم تُحسم؟ الوثائق تقول إن InProgress يعني أن العميل لم يحاول الدفع بعد،
 * فقد تكون صفحة بنك تركها الطالب. لذلك لا تعني خصمًا جاريًا، لكنها تمنعنا من الجزم بأن شيئًا لم يُخصم.
 */
export function hasOpenTransaction(data: MfPaymentStatus): boolean {
  return (data.InvoiceTransactions ?? []).some((t) => t.TransactionStatus === "InProgress" || t.TransactionStatus === "Authorize");
}
