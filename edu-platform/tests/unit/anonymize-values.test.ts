import { describe, expect, it } from "vitest";
import { ANONYMIZED_PASSWORD_HASH, anonymizedEmail, anonymizedName, isAnonymizedEmail, redactGatewayStatus, redactWebhookPayload } from "@/lib/anonymize";
import { loginSchema, registerSchema } from "@/lib/validation";
import { verifyPassword } from "@/server/auth/password";

const ID_A = "11111111-2222-4333-8444-555555555555";
const ID_B = "11111111-2222-4333-8444-666666666666";

describe("placeholders", () => {
  it("are unique per account and carry nothing about the person", () => {
    expect(anonymizedEmail(ID_A)).toBe(`deleted-${ID_A}@anonymized.invalid`);
    expect(anonymizedEmail(ID_A)).not.toBe(anonymizedEmail(ID_B));
    expect(anonymizedName(ID_A)).toBe("طالب محذوف 11111111");
  });

  it("cannot be used to register or log in", () => {
    const email = anonymizedEmail(ID_A);
    expect(registerSchema.safeParse({ fullName: "مهاجم", email, password: "Student-Pass-1" }).success).toBe(false);
    expect(loginSchema.safeParse({ email, password: "x" }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: "مهاجم", email: "  DELETED-x@ANONYMIZED.invalid ", password: "Student-Pass-1" }).success).toBe(false);
  });

  it("recognises the domain only", () => {
    expect(isAnonymizedEmail(anonymizedEmail(ID_A).toUpperCase())).toBe(true);
    expect(isAnonymizedEmail("someone@anonymized.invalid.example.com")).toBe(false);
    expect(isAnonymizedEmail("someone@example.com")).toBe(false);
  });

  it("the password value matches no password", async () => {
    await expect(verifyPassword("", ANONYMIZED_PASSWORD_HASH)).resolves.toBe(false);
    await expect(verifyPassword(ANONYMIZED_PASSWORD_HASH, ANONYMIZED_PASSWORD_HASH)).resolves.toBe(false);
  });
});

const PII = ["طالب الاسم", "person@example.com", "99887766", "512345******1234", "192.0.2.9"];
const expectNoPii = (value: unknown) => {
  const text = JSON.stringify(value);
  for (const p of PII) expect(text).not.toContain(p);
};

describe("gateway status", () => {
  const status = {
    InvoiceId: 123,
    InvoiceStatus: "Paid",
    InvoiceValue: 3,
    CustomerName: "طالب الاسم",
    CustomerEmail: "person@example.com",
    CustomerMobile: "99887766",
    CustomerReference: "order-id",
    UserDefinedField: "طالب الاسم",
    InvoiceTransactions: [{ PaymentId: "07", TransactionStatus: "Succss", TransationValue: "3.000", CardNumber: "512345******1234", CustomerIp: "192.0.2.9", Card: { Number: "512345******1234" }, Error: null }],
    InvoiceItems: [{ ItemName: "طالب الاسم" }],
  };

  it("keeps what an audit needs and what the code reads", () => {
    const out = redactGatewayStatus(status) as { InvoiceId: number; InvoiceStatus: string; InvoiceTransactions: Array<Record<string, unknown>> };
    expect(out.InvoiceId).toBe(123);
    expect(out.InvoiceStatus).toBe("Paid");
    expect(out.InvoiceTransactions[0]).toEqual({ PaymentId: "07", TransactionStatus: "Succss", TransationValue: "3.000", Error: null });
  });

  it("drops the customer, the card and any field it does not know", () => {
    expectNoPii(redactGatewayStatus(status));
    expect(redactGatewayStatus({ ...status, BrandNewField: "x" })).not.toHaveProperty("BrandNewField");
  });

  it("does not keep a nested object hiding under a known name", () => {
    expect(redactGatewayStatus({ InvoiceReference: { name: "طالب الاسم" } })).toEqual({});
  });

  it("copes with anything", () => {
    for (const v of [null, undefined, "x", 1, []]) expect(redactGatewayStatus(v)).toEqual({});
  });
});

describe("webhook payload", () => {
  const payload = {
    Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED", Reference: "WH-1" },
    Data: {
      Invoice: { Id: "123", Status: "PAID", ExternalIdentifier: "order-id", MetaData: { UDF1: "طالب الاسم" } },
      Transaction: { Id: "9", Status: "SUCCESS", PaymentId: "07", ECI: "05", IP: { Address: "192.0.2.9" }, Card: { Number: "512345******1234", HolderName: "طالب الاسم" } },
      Customer: { Name: "طالب الاسم", Email: "person@example.com", Mobile: "99887766" },
      Amount: { BaseCurrency: "KWD", ValueInBaseCurrency: "3.000" },
      Suppliers: [{ Name: "طالب الاسم" }],
    },
  };

  it("keeps the identifiers an audit needs", () => {
    const out = redactWebhookPayload(payload) as { Event: unknown; Data: Record<string, Record<string, unknown>> };
    expect(out.Event).toEqual({ Code: 1, Name: "PAYMENT_STATUS_CHANGED", Reference: "WH-1" });
    expect(out.Data.Invoice).toEqual({ Id: "123", Status: "PAID", ExternalIdentifier: "order-id" });
    expect(out.Data.Transaction).toEqual({ Id: "9", Status: "SUCCESS", PaymentId: "07" });
    expect(out.Data.Amount).toEqual({ BaseCurrency: "KWD", ValueInBaseCurrency: "3.000" });
  });

  it("drops the customer, card, address and everything unknown", () => {
    const out = redactWebhookPayload(payload) as { Data: Record<string, unknown> };
    expectNoPii(out);
    expect(out.Data).not.toHaveProperty("Customer");
    expect(out.Data).not.toHaveProperty("Suppliers");
  });

  it("keeps refund and dispute references", () => {
    const out = redactWebhookPayload({ Data: { Refund: { Id: "r1", Status: "REFUNDED", Comment: "طالب الاسم" }, ReferencedInvoice: { Id: "123" }, Dispute: { Status: "OPEN", DisputeTransactionId: "d1" } } }) as { Data: Record<string, unknown> };
    expect(out.Data).toMatchObject({ Refund: { Id: "r1", Status: "REFUNDED" }, ReferencedInvoice: { Id: "123" }, Dispute: { Status: "OPEN", DisputeTransactionId: "d1" } });
    expectNoPii(out);
  });

  it("copes with anything", () => {
    for (const v of [null, "x", 1, []]) expect(redactWebhookPayload(v)).toEqual({});
  });
});
