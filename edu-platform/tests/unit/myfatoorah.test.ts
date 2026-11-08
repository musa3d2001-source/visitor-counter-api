import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  interpretPaymentStatus,
  isKuwaitiDinarDisplay,
  sanitizeCustomerName,
  signWebhookV2,
  verifyWebhookV2Signature,
  webhookV2SigningString,
  type MfPaymentStatus,
  type WebhookV2Body,
} from "@/server/payments/myfatoorah";
import { simSignDisputeWebhook, simSignPaymentWebhook } from "../mocks/myfatoorah-simulator";

const body: WebhookV2Body = {
  Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED" },
  Data: {
    Invoice: { Id: "6409988", Status: "PAID", ExternalIdentifier: "asdqwd-f13sdf-fasjkz" },
    Transaction: { Status: "SUCCESS", PaymentId: "07076409988323998875" },
  },
};

describe("MyFatoorah Webhook V2 signature", () => {
  it("builds the signing string in the official library field order", () => {
    // المثال الوارد في المكتبة الرسمية (MyFatoorahWebhook::getV2DataModel)
    expect(webhookV2SigningString(body)).toBe(
      "Invoice.Id=6409988,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=07076409988323998875,Invoice.ExternalIdentifier=asdqwd-f13sdf-fasjkz",
    );
  });

  it("uses empty string for missing values", () => {
    const b = { Event: { Code: 1, Name: "X" }, Data: { Invoice: { Id: 1, Status: "PAID" }, Transaction: { Status: "SUCCESS", PaymentId: "9" } } };
    expect(webhookV2SigningString(b)).toBe("Invoice.Id=1,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=9,Invoice.ExternalIdentifier=");
  });

  it("refund event fields", () => {
    const b = { Event: { Code: 2, Name: "REFUND_STATUS_CHANGED" }, Data: { Refund: { Id: 5, Status: "REFUNDED" }, Amount: { ValueInBaseCurrency: "1.500" }, ReferencedInvoice: { Id: 77 } } };
    expect(webhookV2SigningString(b)).toBe("Refund.Id=5,Refund.Status=REFUNDED,Amount.ValueInBaseCurrency=1.500,ReferencedInvoice.Id=77");
  });

  it("dispute event fields, exactly as in the official Webhook Signature page", () => {
    const b = {
      Event: { Code: 6, Name: "DISPUTE_STATUS_CHANGED" },
      Data: {
        Dispute: { DisputeTransactionId: 112, Status: "PENDING" },
        Invoice: { Id: "5897264", Status: "PAID", ExternalIdentifier: "1hGonC7bf2vNuJWuTgCGURYzi6Yu" },
        Transaction: { Status: "SUCCESS", PaymentId: "07075897264282534874" },
      },
    };
    expect(webhookV2SigningString(b)).toBe(
      "Dispute.DisputeTransactionId=112,Dispute.Status=PENDING,Invoice.Id=5897264,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=07075897264282534874,Invoice.ExternalIdentifier=1hGonC7bf2vNuJWuTgCGURYzi6Yu",
    );
    expect(signWebhookV2(b, "my-secret")).toBe(simSignDisputeWebhook(b.Data, "my-secret"));
  });

  it("supplier update request event fields, as in the official page", () => {
    expect(webhookV2SigningString({ Event: { Code: 7, Name: "SUPPLIER_UPDATE_REQUEST_CHANGED" }, Data: { Supplier: { Code: 236 }, RequestStatus: { Status: "APPROVED" } } })).toBe(
      "Supplier.Code=236,RequestStatus.Status=APPROVED",
    );
  });

  it("unknown event code is not signable", () => {
    expect(webhookV2SigningString({ Event: { Code: 99, Name: "?" }, Data: {} })).toBeNull();
  });

  it("signature = base64(HMAC-SHA256(secret, string)) and matches independent simulator implementation", () => {
    const secret = "my-secret";
    const expected = createHmac("sha256", secret).update(webhookV2SigningString(body)!).digest("base64");
    expect(signWebhookV2(body, secret)).toBe(expected);
    expect(simSignPaymentWebhook(body.Data as never, secret)).toBe(expected);
  });

  it("verifies valid and rejects invalid/tampered signatures", () => {
    const secret = "my-secret";
    const sig = signWebhookV2(body, secret)!;
    expect(verifyWebhookV2Signature(body, sig, secret)).toBe(true);
    expect(verifyWebhookV2Signature(body, ` ${sig} `, secret)).toBe(true);
    expect(verifyWebhookV2Signature(body, sig, "other-secret")).toBe(false);
    expect(verifyWebhookV2Signature(body, null, secret)).toBe(false);
    expect(verifyWebhookV2Signature(body, sig, "")).toBe(false);
    expect(verifyWebhookV2Signature(body, "AAAA", secret)).toBe(false);
    const tampered = JSON.parse(JSON.stringify(body)) as WebhookV2Body;
    (tampered.Data.Transaction as { PaymentId: string }).PaymentId = "123";
    expect(verifyWebhookV2Signature(tampered, sig, secret)).toBe(false);
  });
});

function status(partial: Partial<MfPaymentStatus>): MfPaymentStatus {
  return {
    InvoiceId: 1,
    InvoiceStatus: "Pending",
    InvoiceReference: "r",
    CustomerReference: "ORD-1",
    CreatedDate: "",
    ExpiryDate: "",
    InvoiceValue: 3,
    InvoiceDisplayValue: "3.000 KD",
    CustomerName: null,
    CustomerEmail: null,
    UserDefinedField: null,
    InvoiceTransactions: [],
    ...partial,
  };
}
const tx = (PaymentId: string, TransactionStatus: string, Error: string | null = null) =>
  ({ PaymentId, TransactionStatus, Error, TransactionDate: "", PaymentGateway: "KNET", ReferenceId: null, TrackId: null, TransactionId: null, AuthorizationId: null, TransationValue: "3.000", PaidCurrency: "KD", PaidCurrencyValue: "3.000" }) as MfPaymentStatus["InvoiceTransactions"][number];

describe("interpretPaymentStatus (same rules as official library)", () => {
  it("Paid + Succss transaction → paid", () => {
    const r = interpretPaymentStatus(status({ InvoiceStatus: "Paid", InvoiceTransactions: [tx("1", "Failed", "x"), tx("2", "Succss")] }), "2");
    expect(r.state).toBe("paid");
    expect(r.transaction?.PaymentId).toBe("2");
  });
  it("DuplicatePayment with a Succss transaction → paid", () => {
    expect(interpretPaymentStatus(status({ InvoiceStatus: "DuplicatePayment", InvoiceTransactions: [tx("2", "Succss")] })).state).toBe("paid");
  });
  it("Paid status without a successful transaction is NOT treated as paid", () => {
    expect(interpretPaymentStatus(status({ InvoiceStatus: "Paid", InvoiceTransactions: [tx("2", "Failed")] }), "2").state).toBe("failed");
  });
  it("Failed transaction for the given PaymentId → failed with error", () => {
    const r = interpretPaymentStatus(status({ InvoiceTransactions: [tx("1", "Failed", "Declined")] }), "1");
    expect(r).toMatchObject({ state: "failed", error: "Declined" });
  });
  it("Failed transaction of another PaymentId does not mark this one failed", () => {
    expect(interpretPaymentStatus(status({ InvoiceTransactions: [tx("1", "Failed", "Declined")] }), "999").state).toBe("pending");
  });
  it("InProgress / no transactions → pending", () => {
    expect(interpretPaymentStatus(status({ InvoiceTransactions: [tx("1", "InProgress")] }), "1").state).toBe("pending");
    expect(interpretPaymentStatus(status({})).state).toBe("pending");
  });
});

describe("isKuwaitiDinarDisplay (InvoiceDisplayValue)", () => {
  it("accepts the documented KD samples and the ISO spelling", () => {
    for (const v of ["1.000 KD", "100.000 KD", "12,345.000 KD", "3.000 KWD", "3.000 kd", "  3.000   KD  "]) expect(isKuwaitiDinarDisplay(v)).toBe(true);
  });
  it("accepts the Arabic symbol too: we send Language AR, the docs only show English samples, and a false mismatch would leave a paid order without access", () => {
    for (const v of ["3.000 د.ك", "3.000 د.ك."]) expect(isKuwaitiDinarDisplay(v)).toBe(true);
  });
  it("rejects any other currency, and text with no clear currency", () => {
    for (const v of ["3.000 USD", "3.000 SAR", "3.000 SR", "3.000 KDX", "3.000", "3.000KD", "3.000 ر.س", "3.000 د.إ", "3.000 د.ب", "3.000 دينار"]) expect(isKuwaitiDinarDisplay(v)).toBe(false);
  });
  it("an absent value is not a foreign currency (InvoiceValue is in the account's KWD base currency)", () => {
    for (const v of ["", "   ", null, undefined]) expect(isKuwaitiDinarDisplay(v)).toBe(true);
  });
});

describe("sanitizeCustomerName", () => {
  it("strips special characters like the official library", () => {
    expect(sanitizeCustomerName("test: <b>Ali</b>")).toBe("test bAlib");
    expect(sanitizeCustomerName("سارة-أحمد")).toBe("سارةأحمد");
    expect(sanitizeCustomerName("***")).toBe("Customer");
  });
});
