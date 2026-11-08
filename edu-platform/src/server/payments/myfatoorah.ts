import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * عميل MyFatoorah API v2 — مطابق لعقد المكتبة الرسمية (myfatoorah/library 2.2.10):
 *  - POST /v2/InitiatePayment   → وسائل الدفع المفعّلة فعليًا في حساب التاجر
 *  - POST /v2/ExecutePayment    → إنشاء فاتورة لوسيلة محددة وإرجاع PaymentURL
 *  - POST /v2/SendPayment       → فاتورة برابط (كل الوسائل) وإرجاع InvoiceURL
 *  - POST /v2/GetPaymentStatus  → الاستعلام عن الحالة من الخادم (مصدر الحقيقة)
 *  - POST /v2/MakeRefund        → طلب استرداد
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

export class MyFatoorahClient {
  constructor(private readonly cfg: MfConfig) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      throw new MyFatoorahError(`تعذر الاتصال ببوابة الدفع: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
    const raw = await res.text();
    let json: MfEnvelope<T> | null = null;
    try {
      json = JSON.parse(raw) as MfEnvelope<T>;
    } catch {
      json = null;
    }
    if (!json || !json.IsSuccess) throw new MyFatoorahError(extractError(json, raw), res.status);
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

  async makeRefund(input: { key: string; keyType: "PaymentId" | "InvoiceId"; amountKwd: string; comment: string }) {
    // لا نرسل عملة: الوثائق تنص على أن مبلغ الاسترداد يُحسب دائمًا بالعملة الأساسية للحساب
    return this.call<{
      Key: string;
      RefundId: number;
      RefundReference: string;
      RefundInvoiceId?: number;
      Amount: number;
      Comment: string;
      ExternalIdentifier?: string | null;
    }>("/v2/MakeRefund", {
      Key: input.key,
      KeyType: input.keyType,
      RefundChargeOnCustomer: false,
      ServiceChargeOnCustomer: false,
      Amount: Number(input.amountKwd),
      Comment: input.comment,
    });
  }
}

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
};

/**
 * هل تدل قيمة InvoiceDisplayValue على الدينار الكويتي؟
 * الوثائق تعرضها هكذا: "1.000 KD" و"12,345.000 KD"، ونقبل أيضًا التهجئة ISO: "3.000 KWD" والرمز العربي "3.000 د.ك" لأننا نرسل Language=AR.
 * أي عملة أخرى أو نص بلا عملة نرفضه (عند الشك لا نؤكد الدفع). الحقل الفارغ مقبول
 * لأن InvoiceValue تأتي دائمًا بالعملة الأساسية للحساب، وهي الدينار.
 */
export function isKuwaitiDinarDisplay(displayValue: string | null | undefined): boolean {
  const text = (displayValue ?? "").trim();
  if (!text) return true;
  const unit = text.split(/\s+/).pop()!.toUpperCase();
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
export function interpretPaymentStatus(
  data: MfPaymentStatus,
  paymentId?: string,
): { state: "paid" | "failed" | "pending"; transaction: MfTransaction | null; error: string | null } {
  const txs = data.InvoiceTransactions ?? [];
  if (data.InvoiceStatus === "Paid" || data.InvoiceStatus === "DuplicatePayment") {
    const ok = txs.find((t) => t.TransactionStatus === "Succss" || t.TransactionStatus === "SUCCESS");
    if (ok) return { state: "paid", transaction: ok, error: null };
  }
  const focus = paymentId ? txs.find((t) => t.PaymentId === paymentId) : txs[txs.length - 1];
  if (focus && (focus.TransactionStatus === "Failed" || focus.TransactionStatus === "Canceled")) {
    return { state: "failed", transaction: focus, error: focus.Error || "فشلت عملية الدفع" };
  }
  return { state: "pending", transaction: focus ?? null, error: null };
}
