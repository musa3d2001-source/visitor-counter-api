/**
 * ============================================================================
 *  محاكي MyFatoorah API v2 — بديل اختبار فقط (TEST DOUBLE). لا يُستخدم في الإنتاج أبدًا.
 * ============================================================================
 *
 * لماذا؟ بيئة التطوير هذه لا تستطيع الوصول إلى apitest.myfatoorah.com (الشبكة مقيدة)،
 * لذلك نختبر مسار الدفع كاملًا (إنشاء الفاتورة ← صفحة الدفع ← العودة ← التحقق من الخادم ← Webhook)
 * مقابل محاكٍ محلي يطابق الوثائق الرسمية (docs.myfatoorah.com) وعقد المكتبة myfatoorah/library 2.2.10:
 *   - POST /v2/InitiatePayment, /v2/ExecutePayment, /v2/SendPayment, /v2/GetPaymentStatus, /v2/MakeRefund
 *   - غلاف الاستجابة: { IsSuccess, Message, ValidationErrors, Data }
 *   - Authorization: Bearer <token>
 *   - InvoiceStatus: Pending | Paid ؛ TransactionStatus: InProgress | Succss | Failed (بنفس تهجئة البوابة "Succss")
 *   - InvoiceDisplayValue بصيغة الوثائق "3.000 KD" و"12,345.000 KD"، وCurrency/PaidCurrency = "KD"
 *   - Language: AR | EN فقط، وأي قيمة أخرى تُرفض بخطأ تحقق
 *   - Webhook V2: الترويسة MyFatoorah-Signature فقط (الوثائق لا تذكر أي ترويسة إصدار)
 *     التوقيع = Base64(HMAC-SHA256(secret, "Invoice.Id=..,Invoice.Status=..,Transaction.Status=..,Transaction.PaymentId=..,Invoice.ExternalIdentifier=.."))
 *
 * التطبيق يُوجَّه إليه فقط عبر MYFATOORAH_BASE_URL في بيئة الاختبار. قبل الإطلاق يجب اختبار
 * التكامل مقابل بيئة MyFatoorah التجريبية الحقيقية بمفاتيح التاجر.
 * فرق مقصود عن البوابة: الاختبارات تعمل على localhost، لذا لا يرفض المحاكي CallBackUrl المحلي.
 */
import { createHmac, randomInt } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type SimTransaction = {
  TransactionDate: string;
  PaymentGateway: string;
  ReferenceId: string;
  TrackId: string;
  TransactionId: string;
  PaymentId: string;
  AuthorizationId: string;
  TransactionStatus: "InProgress" | "Succss" | "Failed" | "Canceled";
  TransationValue: string;
  CustomerServiceCharge: string;
  TotalServiceCharge: string;
  DueValue: string;
  PaidCurrency: string;
  PaidCurrencyValue: string;
  Currency: string;
  Error: string | null;
  ErrorCode: string | null;
  CardNumber: string | null;
};

export type SimInvoice = {
  InvoiceId: number;
  InvoiceStatus: "Pending" | "Paid";
  InvoiceReference: string;
  CustomerReference: string | null;
  UserDefinedField: string | null;
  CustomerName: string | null;
  CustomerEmail: string | null;
  CustomerMobile: string | null;
  InvoiceValueFils: number;
  CallBackUrl: string;
  ErrorUrl: string;
  PaymentMethodId: number | null;
  CreatedDate: string;
  Transactions: SimTransaction[];
  Refunds: { RefundId: number; AmountFils: number; Comment: string }[];
};

export type SimulatorOptions = {
  port?: number;
  host?: string;
  apiKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
  /** يرسل كل Webhook مرتين (لاختبار منع التكرار) */
  duplicateWebhooks?: boolean;
  /** تأخير إرسال Webhook بعد إعادة التوجيه */
  webhookDelayMs?: number;
};

export type SimWebhookOptions = {
  secret?: string;
  tamper?: boolean;
  /** ترويسة إصدار صريحة — الوثائق لا تذكر هذه الترويسة، لذا الافتراضي عدم إرسالها */
  versionHeader?: string;
};

export type WebhookDelivery = { invoiceId: number; paymentId: string; status: number | null; error?: string; body: string };

export type SimulatorState = {
  invoices: Map<number, SimInvoice>;
  paymentIndex: Map<string, number>;
  requests: { path: string; body: unknown; auth: string | null }[];
  webhookDeliveries: WebhookDelivery[];
};

export type Simulator = {
  url: string;
  state: SimulatorState;
  close(): Promise<void>;
  /** يضيف فرقًا (بالفلس) على InvoiceValue في GetPaymentStatus — لاختبار رفض المبلغ غير المطابق */
  setAmountTamper(deltaFils: number | null): void;
  /** يستبدل عملة InvoiceDisplayValue في GetPaymentStatus (null يعيد "KD" الموثقة) */
  setDisplayCurrency(label: string | null): void;
  /** محاكاة دفع مباشرة (بدون متصفح) — تُعيد PaymentId */
  pay(invoiceId: number, outcome: "success" | "fail"): Promise<{ paymentId: string; redirectUrl: string }>;
  /** بناء Webhook V2 موقّع لفاتورة/عملية — لاستدعاء معالج Webhook مباشرة في الاختبارات */
  buildWebhook(invoiceId: number, paymentId: string, opts?: SimWebhookOptions): { body: string; headers: Headers };
  /** بناء حدث نزاع (Code 6) موقّع كما في الوثائق */
  buildDisputeWebhook(invoiceId: number, paymentId: string, dispute: SimDispute, opts?: Omit<SimWebhookOptions, "tamper">): { body: string; headers: Headers };
  lastInvoice(): SimInvoice | undefined;
};

const METHODS = [
  { PaymentMethodId: 1, PaymentMethodAr: "كي نت", PaymentMethodEn: "KNET", PaymentMethodCode: "kn", IsDirectPayment: false, IsEmbeddedSupported: false },
  { PaymentMethodId: 2, PaymentMethodAr: "فيزا / ماستر", PaymentMethodEn: "VISA/MASTER", PaymentMethodCode: "vm", IsDirectPayment: false, IsEmbeddedSupported: true },
  { PaymentMethodId: 11, PaymentMethodAr: "أبل الدفع", PaymentMethodEn: "Apple Pay", PaymentMethodCode: "ap", IsDirectPayment: false, IsEmbeddedSupported: true },
  { PaymentMethodId: 20, PaymentMethodAr: "فيزا / ماستر مباشر", PaymentMethodEn: "Visa/Master Direct", PaymentMethodCode: "vm", IsDirectPayment: true, IsEmbeddedSupported: false },
];

const kwd = (fils: number) => `${Math.floor(fils / 1000)}.${String(fils % 1000).padStart(3, "0")}`;
/** بالفواصل كما في أمثلة الوثائق: 12,345.000 */
const kwdGrouped = (fils: number) => `${Math.floor(fils / 1000).toLocaleString("en-US")}.${String(fils % 1000).padStart(3, "0")}`;

export type SimDispute = { DisputeTransactionId: number; Status: "PENDING" | "RESOLVED" | "LOST"; Type?: string; Reason?: string };

/** نفس منطق MyFatoorahWebhook::checkSignatureValidation في المكتبة الرسمية (تنفيذ مستقل عن كود التطبيق) */
export function simSignPaymentWebhook(data: { Invoice: Record<string, unknown>; Transaction: Record<string, unknown> }, secret: string): string {
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const model: [string, string][] = [
    ["Invoice.Id", v(data.Invoice.Id)],
    ["Invoice.Status", v(data.Invoice.Status)],
    ["Transaction.Status", v(data.Transaction.Status)],
    ["Transaction.PaymentId", v(data.Transaction.PaymentId)],
    ["Invoice.ExternalIdentifier", v(data.Invoice.ExternalIdentifier)],
  ];
  const output = model.map(([k, val]) => `${k}=${val}`).join(",");
  return createHmac("sha256", secret).update(output, "utf8").digest("base64");
}

/** نص التوقيع لحدث النزاع كما في صفحة Webhook Signature الرسمية (تنفيذ مستقل عن كود التطبيق) */
export function simSignDisputeWebhook(
  data: { Dispute: Record<string, unknown>; Invoice: Record<string, unknown>; Transaction: Record<string, unknown> },
  secret: string,
): string {
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const output = [
    `Dispute.DisputeTransactionId=${v(data.Dispute.DisputeTransactionId)}`,
    `Dispute.Status=${v(data.Dispute.Status)}`,
    `Invoice.Id=${v(data.Invoice.Id)}`,
    `Invoice.Status=${v(data.Invoice.Status)}`,
    `Transaction.Status=${v(data.Transaction.Status)}`,
    `Transaction.PaymentId=${v(data.Transaction.PaymentId)}`,
    `Invoice.ExternalIdentifier=${v(data.Invoice.ExternalIdentifier)}`,
  ].join(",");
  return createHmac("sha256", secret).update(output, "utf8").digest("base64");
}

function envelope(res: ServerResponse, status: number, body: { IsSuccess: boolean; Message?: string; ValidationErrors?: { Name: string; Error: string }[] | null; Data: unknown }) {
  const json = JSON.stringify({ IsSuccess: body.IsSuccess, Message: body.Message ?? "", ValidationErrors: body.ValidationErrors ?? null, Data: body.Data });
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(json);
}

function validationError(res: ServerResponse, errors: { Name: string; Error: string }[]) {
  envelope(res, 400, { IsSuccess: false, Message: "Invalid data", ValidationErrors: errors, Data: null });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function isUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 254) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function startSimulator(opts: SimulatorOptions): Promise<Simulator> {
  const state: SimulatorState = { invoices: new Map(), paymentIndex: new Map(), requests: [], webhookDeliveries: [] };
  let nextInvoiceId = 6_400_000 + randomInt(0, 50_000);
  let nextRefundId = 900_000;
  let amountTamper: number | null = null;
  let displayCurrency: string | null = null;
  let baseUrl = "";

  const createInvoice = (b: Record<string, unknown>, paymentMethodId: number | null): SimInvoice => {
    const id = nextInvoiceId++;
    const valueFils = Math.round(Number(b.InvoiceValue) * 1000);
    const mobile = b.CustomerMobile ? `${b.MobileCountryCode ?? ""}${b.CustomerMobile}` : null;
    const inv: SimInvoice = {
      InvoiceId: id,
      InvoiceStatus: "Pending",
      InvoiceReference: `2026${String(id).slice(-6)}`,
      CustomerReference: (b.CustomerReference as string | null) ?? null,
      UserDefinedField: (b.UserDefinedField as string | null) ?? null,
      CustomerName: (b.CustomerName as string | null) ?? null,
      CustomerEmail: (b.CustomerEmail as string | null) ?? null,
      CustomerMobile: mobile,
      InvoiceValueFils: valueFils,
      CallBackUrl: (b.CallBackUrl as string) ?? "",
      ErrorUrl: (b.ErrorUrl as string) ?? "",
      PaymentMethodId: paymentMethodId,
      CreatedDate: new Date().toISOString().replace("Z", ""),
      Transactions: [],
      Refunds: [],
    };
    state.invoices.set(id, inv);
    return inv;
  };

  const validateInvoiceInput = (b: Record<string, unknown>, requireUrls: boolean) => {
    const errors: { Name: string; Error: string }[] = [];
    const value = Number(b.InvoiceValue);
    if (b.InvoiceValue === undefined || b.InvoiceValue === null || !Number.isFinite(value) || value <= 0) {
      errors.push({ Name: "InvoiceValue", Error: "The field InvoiceValue must be greater than 0." });
    } else if (Math.abs(Math.round(value * 1000) - value * 1000) > 1e-6) {
      errors.push({ Name: "InvoiceValue", Error: "InvoiceValue supports up to 3 decimal places for KWD." });
    }
    if (requireUrls) {
      if (!isUrl(b.CallBackUrl)) errors.push({ Name: "CallBackUrl", Error: "The CallBackUrl field is required." });
      if (!isUrl(b.ErrorUrl)) errors.push({ Name: "ErrorUrl", Error: "The ErrorUrl field is required." });
    }
    if (b.DisplayCurrencyIso !== undefined && b.DisplayCurrencyIso !== "KWD") {
      errors.push({ Name: "DisplayCurrencyIso", Error: "Simulator supports KWD only." });
    }
    if (b.Language !== undefined && b.Language !== null && b.Language !== "AR" && b.Language !== "EN") {
      errors.push({ Name: "Language", Error: "The Language field must be EN or AR." });
    }
    return errors;
  };

  const statusData = (inv: SimInvoice) => {
    const shownFils = inv.InvoiceValueFils + (amountTamper ?? 0);
    const expiry = new Date(Date.parse(inv.CreatedDate + "Z") + 3 * 86400_000);
    return {
      InvoiceId: inv.InvoiceId,
      InvoiceStatus: inv.InvoiceStatus,
      InvoiceReference: inv.InvoiceReference,
      CustomerReference: inv.CustomerReference,
      CreatedDate: inv.CreatedDate,
      ExpiryDate: expiry.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Kuwait" }),
      ExpiryTime: expiry.toISOString().slice(11, 23),
      InvoiceValue: Number(kwd(shownFils)),
      Comments: null,
      CustomerName: inv.CustomerName,
      CustomerMobile: inv.CustomerMobile,
      CustomerEmail: inv.CustomerEmail,
      UserDefinedField: inv.UserDefinedField,
      InvoiceDisplayValue: `${kwdGrouped(shownFils)} ${displayCurrency ?? "KD"}`,
      DueDeposit: 0,
      DepositStatus: "Not Deposited",
      InvoiceItems: [],
      InvoiceTransactions: inv.Transactions,
      Suppliers: [],
    };
  };

  const webhookPayload = (inv: SimInvoice, tx: SimTransaction) => {
    const ok = tx.TransactionStatus === "Succss";
    return {
      Event: {
        Code: 1,
        Name: "PAYMENT_STATUS_CHANGED",
        CountryIsoCode: "KWT",
        CreationDate: new Date().toISOString(),
        Reference: `WH-${inv.InvoiceId}-${tx.PaymentId.slice(-6)}`,
      },
      Data: {
        Invoice: {
          Id: String(inv.InvoiceId),
          Status: ok ? "PAID" : "PENDING",
          Reference: inv.InvoiceReference,
          CreationDate: inv.CreatedDate,
          ExpirationDate: null,
          ExternalIdentifier: inv.CustomerReference ?? "",
          UserDefinedField: inv.UserDefinedField,
          MetaData: null,
        },
        Transaction: {
          Id: tx.TransactionId,
          Status: ok ? "SUCCESS" : "FAILED",
          PaymentMethod: tx.PaymentGateway,
          PaymentId: tx.PaymentId,
          ReferenceId: tx.ReferenceId,
          TrackId: tx.TrackId,
          AuthorizationId: tx.AuthorizationId,
          TransactionDate: tx.TransactionDate,
          ECI: "",
          IP: { Address: "127.0.0.1", Country: "Kuwait" },
          Error: { Code: tx.ErrorCode ?? "", Message: tx.Error ?? "" },
          Card: { NameOnCard: "", Number: tx.CardNumber ?? "", Token: "", PanHash: "", ExpiryMonth: "", ExpiryYear: "", Brand: "", Issuer: "", IssuerCountry: "", FundingMethod: "" },
        },
        Customer: { Reference: inv.CustomerReference, Name: inv.CustomerName, Mobile: inv.CustomerMobile, Email: inv.CustomerEmail },
        Amount: {
          BaseCurrency: "KWD",
          ValueInBaseCurrency: kwd(inv.InvoiceValueFils),
          ServiceCharge: "0.000",
          ServiceChargeVAT: "0.000",
          ReceivableAmount: kwd(inv.InvoiceValueFils),
          DisplayCurrency: "KWD",
          ValueInDisplayCurrency: kwd(inv.InvoiceValueFils),
          PayCurrency: "KWD",
          ValueInPayCurrency: kwd(inv.InvoiceValueFils),
        },
        Suppliers: [],
      },
    };
  };

  const buildWebhook: Simulator["buildWebhook"] = (invoiceId, paymentId, o = {}) => {
    const inv = state.invoices.get(invoiceId);
    if (!inv) throw new Error(`unknown invoice ${invoiceId}`);
    const tx = inv.Transactions.find((t) => t.PaymentId === paymentId);
    if (!tx) throw new Error(`unknown payment ${paymentId}`);
    const payload = webhookPayload(inv, tx);
    const secret = o.secret ?? opts.webhookSecret ?? "";
    const signature = simSignPaymentWebhook(payload.Data, secret);
    if (o.tamper) payload.Data.Invoice.Status = payload.Data.Invoice.Status === "PAID" ? "PENDING" : "PAID";
    const headers = new Headers({ "content-type": "application/json", "MyFatoorah-Signature": signature });
    headers.set("MyFatoorah-Webhook-Version", o.versionHeader ?? "v2");
    return { body: JSON.stringify(payload), headers };
  };

  const buildDisputeWebhook: Simulator["buildDisputeWebhook"] = (invoiceId, paymentId, dispute, o = {}) => {
    const inv = state.invoices.get(invoiceId);
    if (!inv) throw new Error(`unknown invoice ${invoiceId}`);
    const tx = inv.Transactions.find((t) => t.PaymentId === paymentId);
    if (!tx) throw new Error(`unknown payment ${paymentId}`);
    const base = webhookPayload(inv, tx);
    const payload = {
      Event: { ...base.Event, Code: 6, Name: "DISPUTE_STATUS_CHANGED", Reference: `WH-D${dispute.DisputeTransactionId}-${dispute.Status}` },
      Data: {
        Dispute: {
          Type: dispute.Type ?? "CHARGEBACK",
          Status: dispute.Status,
          CreatedDate: new Date().toISOString(),
          ChargeBackType: "General",
          Reason: dispute.Reason ?? "CreditNotProcessed",
          DisputeTransactionId: dispute.DisputeTransactionId,
          InvoiceTransactionId: Number(tx.TransactionId),
        },
        Invoice: base.Data.Invoice,
        Transaction: base.Data.Transaction,
        Customer: base.Data.Customer,
        Amount: base.Data.Amount,
      },
    };
    const headers = new Headers({ "content-type": "application/json", "MyFatoorah-Signature": simSignDisputeWebhook(payload.Data, o.secret ?? opts.webhookSecret ?? "") });
    if (o.versionHeader !== undefined) headers.set("MyFatoorah-Webhook-Version", o.versionHeader);
    return { body: JSON.stringify(payload), headers };
  };

  const deliverWebhook = async (inv: SimInvoice, tx: SimTransaction) => {
    if (!opts.webhookUrl || !opts.webhookSecret) return;
    const { body, headers } = buildWebhook(inv.InvoiceId, tx.PaymentId);
    const times = opts.duplicateWebhooks ? 2 : 1;
    for (let i = 0; i < times; i++) {
      try {
        const r = await fetch(opts.webhookUrl, { method: "POST", headers, body });
        state.webhookDeliveries.push({ invoiceId: inv.InvoiceId, paymentId: tx.PaymentId, status: r.status, body: await r.text() });
      } catch (err) {
        state.webhookDeliveries.push({ invoiceId: inv.InvoiceId, paymentId: tx.PaymentId, status: null, error: String(err), body: "" });
      }
    }
  };

  const pay: Simulator["pay"] = async (invoiceId, outcome) => {
    const inv = state.invoices.get(invoiceId);
    if (!inv) throw new Error(`unknown invoice ${invoiceId}`);
    const paymentId = `0707${invoiceId}${String(randomInt(0, 1e9)).padStart(9, "0")}`.slice(0, 20);
    const method = METHODS.find((m) => m.PaymentMethodId === inv.PaymentMethodId) ?? METHODS[0];
    const success = outcome === "success";
    const tx: SimTransaction = {
      TransactionDate: new Date().toISOString().replace("Z", ""),
      PaymentGateway: method.PaymentMethodEn,
      ReferenceId: String(randomInt(1e11, 1e12 - 1)),
      TrackId: `${new Date().toISOString().slice(0, 10)}_${randomInt(1e6, 1e7)}`,
      TransactionId: String(randomInt(1e7, 1e8)),
      PaymentId: paymentId,
      AuthorizationId: success ? String(randomInt(100000, 999999)) : "",
      TransactionStatus: success ? "Succss" : "Failed",
      TransationValue: kwd(inv.InvoiceValueFils),
      CustomerServiceCharge: "0.000",
      TotalServiceCharge: "0.000",
      DueValue: kwd(inv.InvoiceValueFils),
      PaidCurrency: "KD",
      PaidCurrencyValue: kwd(inv.InvoiceValueFils),
      Currency: "KD",
      Error: success ? null : "Transaction declined (simulated)",
      ErrorCode: success ? null : "MF020",
      CardNumber: method.PaymentMethodCode === "kn" ? null : "450875xxxxxx1019",
    };
    inv.Transactions.push(tx);
    if (success) inv.InvoiceStatus = "Paid";
    state.paymentIndex.set(paymentId, invoiceId);
    const target = success ? inv.CallBackUrl : inv.ErrorUrl;
    const u = new URL(target);
    u.searchParams.set("paymentId", paymentId);
    u.searchParams.set("Id", paymentId);
    const deliver = () => deliverWebhook(inv, tx);
    if (opts.webhookDelayMs && opts.webhookDelayMs > 0) setTimeout(() => void deliver(), opts.webhookDelayMs);
    else void deliver();
    return { paymentId, redirectUrl: u.toString() };
  };

  const handleApi = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    const auth = req.headers.authorization ?? null;
    const raw = await readBody(req);
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return envelope(res, 400, { IsSuccess: false, Message: "Invalid JSON", Data: null });
    }
    state.requests.push({ path, body, auth });
    if (auth !== `Bearer ${opts.apiKey}`) {
      // البوابة الحقيقية ترفض الطلبات غير المصرح بها برمز 401
      return envelope(res, 401, { IsSuccess: false, Message: "Authorization has been denied for this request.", Data: null });
    }

    switch (path) {
      case "/v2/InitiatePayment": {
        const amount = Number(body.InvoiceAmount ?? 0);
        return envelope(res, 200, {
          IsSuccess: true,
          Message: "Initiated Successfully!",
          Data: {
            PaymentMethods: METHODS.map((m) => ({
              ...m,
              ServiceCharge: 0,
              TotalAmount: amount,
              CurrencyIso: "KWD",
              PaymentCurrencyIso: "KWD",
              ImageUrl: `https://portal.myfatoorah.com/imgs/payment-methods/${m.PaymentMethodCode}.png`,
            })),
          },
        });
      }
      case "/v2/ExecutePayment": {
        const errors = validateInvoiceInput(body, true);
        const methodId = Number(body.PaymentMethodId);
        const method = METHODS.find((m) => m.PaymentMethodId === methodId);
        if (!method) errors.push({ Name: "PaymentMethodId", Error: "Invalid PaymentMethodId." });
        if (errors.length) return validationError(res, errors);
        const inv = createInvoice(body, methodId);
        return envelope(res, 200, {
          IsSuccess: true,
          Message: "Invoice Created Successfully!",
          Data: {
            InvoiceId: inv.InvoiceId,
            IsDirectPayment: false,
            PaymentURL: `${baseUrl}/pay/${inv.InvoiceId}`,
            CustomerReference: inv.CustomerReference,
            UserDefinedField: inv.UserDefinedField,
            RecurringId: "",
          },
        });
      }
      case "/v2/SendPayment": {
        const errors = validateInvoiceInput(body, true);
        if (!body.CustomerName) errors.push({ Name: "CustomerName", Error: "The CustomerName field is required." });
        if (!body.NotificationOption) errors.push({ Name: "NotificationOption", Error: "The NotificationOption field is required." });
        if (errors.length) return validationError(res, errors);
        const inv = createInvoice(body, null);
        return envelope(res, 200, {
          IsSuccess: true,
          Message: "Invoice Created Successfully!",
          Data: {
            InvoiceId: inv.InvoiceId,
            InvoiceURL: `${baseUrl}/pay/${inv.InvoiceId}`,
            CustomerReference: inv.CustomerReference,
            UserDefinedField: inv.UserDefinedField,
          },
        });
      }
      case "/v2/GetPaymentStatus": {
        const key = String(body.Key ?? "");
        const keyType = String(body.KeyType ?? "");
        let inv: SimInvoice | undefined;
        if (keyType === "InvoiceId") inv = state.invoices.get(Number(key));
        else if (keyType === "PaymentId") {
          const id = state.paymentIndex.get(key);
          inv = id ? state.invoices.get(id) : undefined;
        } else if (keyType === "CustomerReference") {
          inv = [...state.invoices.values()].reverse().find((i) => i.CustomerReference === key);
        } else return validationError(res, [{ Name: "KeyType", Error: "Invalid KeyType." }]);
        if (!inv) return validationError(res, [{ Name: "Key", Error: "Invalid key." }]);
        return envelope(res, 200, { IsSuccess: true, Message: "", Data: statusData(inv) });
      }
      case "/v2/MakeRefund": {
        const key = String(body.Key ?? "");
        const keyType = String(body.KeyType ?? "");
        const invId = keyType === "PaymentId" ? state.paymentIndex.get(key) : Number(key);
        const inv = invId ? state.invoices.get(invId) : undefined;
        if (!inv) return validationError(res, [{ Name: "Key", Error: "Invalid key." }]);
        if (inv.InvoiceStatus !== "Paid") return envelope(res, 400, { IsSuccess: false, Message: "Invoice is not paid.", Data: null });
        const amountFils = Math.round(Number(body.Amount) * 1000);
        const refunded = inv.Refunds.reduce((s, r) => s + r.AmountFils, 0);
        if (!(amountFils > 0) || amountFils + refunded > inv.InvoiceValueFils) {
          return validationError(res, [{ Name: "Amount", Error: "Refund amount exceeds the paid amount." }]);
        }
        const refund = { RefundId: nextRefundId++, AmountFils: amountFils, Comment: String(body.Comment ?? "") };
        inv.Refunds.push(refund);
        return envelope(res, 200, {
          IsSuccess: true,
          Message: "Refund request submitted successfully",
          Data: {
            Key: key,
            RefundId: refund.RefundId,
            RefundReference: `RF${refund.RefundId}`,
            RefundInvoiceId: nextInvoiceId++,
            Amount: amountFils / 1000,
            Comment: refund.Comment,
            ExternalIdentifier: inv.CustomerReference,
          },
        });
      }
      default:
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ Message: `No HTTP resource was found that matches the request URI '${baseUrl}${path}'.` }));
    }
  };

  const paymentPage = (res: ServerResponse, inv: SimInvoice) => {
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyFatoorah Simulator — Invoice ${inv.InvoiceId}</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:16px;color:#222}
.card{border:1px solid #ddd;border-radius:12px;padding:20px}.warn{background:#fff4d6;padding:8px 12px;border-radius:8px;font-size:13px}
button{width:100%;padding:14px;margin-top:12px;border:0;border-radius:10px;font-size:16px;cursor:pointer}
.ok{background:#1d7a4f;color:#fff}.no{background:#b4342c;color:#fff}</style></head>
<body><div class="card"><p class="warn">محاكي اختبار MyFatoorah — لا يتم أي دفع حقيقي</p>
<h1 style="font-size:20px">فاتورة رقم <span data-testid="sim-invoice-id">${inv.InvoiceId}</span></h1>
<p>المبلغ: <strong data-testid="sim-amount">${kwd(inv.InvoiceValueFils)} KWD</strong></p>
<p>المرجع: ${escapeHtml(inv.CustomerReference ?? "")}</p>
${inv.InvoiceStatus === "Paid" ? `<p data-testid="sim-already-paid">هذه الفاتورة مدفوعة مسبقًا</p>` : ""}
<form method="post" action="/pay/${inv.InvoiceId}/success"><button class="ok" data-testid="sim-pay-success" type="submit">ادفع (نجاح)</button></form>
<form method="post" action="/pay/${inv.InvoiceId}/fail"><button class="no" data-testid="sim-pay-fail" type="submit">رفض العملية (فشل)</button></form>
</div></body></html>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://sim.local");
    const path = url.pathname;
    void (async () => {
      try {
        if (req.method === "POST" && path.startsWith("/v2/")) return await handleApi(req, res, path);
        const payMatch = path.match(/^\/pay\/(\d+)(?:\/(success|fail))?$/);
        if (payMatch) {
          const inv = state.invoices.get(Number(payMatch[1]));
          if (!inv) {
            res.writeHead(404, { "content-type": "text/plain" });
            return res.end("Invoice not found");
          }
          if (req.method === "GET" && !payMatch[2]) return paymentPage(res, inv);
          if (req.method === "POST" && payMatch[2]) {
            await readBody(req);
            const { redirectUrl } = await pay(inv.InvoiceId, payMatch[2] as "success" | "fail");
            res.writeHead(302, { location: redirectUrl });
            return res.end();
          }
        }
        if (req.method === "GET" && path === "/__sim/health") {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true, invoices: state.invoices.size }));
        }
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(err));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://${opts.host ?? "127.0.0.1"}:${addr.port}`;

  return {
    url: baseUrl,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
    setAmountTamper: (d) => {
      amountTamper = d;
    },
    setDisplayCurrency: (label) => {
      displayCurrency = label;
    },
    pay,
    buildWebhook,
    buildDisputeWebhook,
    lastInvoice: () => [...state.invoices.values()].pop(),
  };
}
