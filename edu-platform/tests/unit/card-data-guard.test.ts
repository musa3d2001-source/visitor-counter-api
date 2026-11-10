import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { redactGatewayStatus, redactWebhookPayload } from "@/lib/anonymize";
import { scrubForOps } from "@/lib/redact";

/**
 * بيانات البطاقة لا تمس هذا الخادم: الدفع كله في صفحة البوابة المستضافة.
 * هذا الفحص يفشل إن أضاف أحد حقل نموذج، أو عمود جدول، أو سطر سجل يمكن أن يحمل رقم بطاقة أو تاريخ انتهاء أو CVV.
 */
const ROOT = resolve(__dirname, "../..");

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full, ext);
    return ext.test(name) ? [full] : [];
  });
}

const CARD_WORD = /(card[-_ ]?(number|no|num|holder|expiry|exp|cvv|cvc|pan)|cardnumber|cvv|cvc|\bpan\b|pan[-_]?hash|expiry[-_]?(month|year)|exp[-_]?(month|year)|security[-_ ]?code)/i;

describe("no form field can carry card data", () => {
  const tsx = files(resolve(ROOT, "src"), /\.tsx$/);

  it("scans the real pages", () => {
    expect(tsx.length).toBeGreaterThan(50);
  });

  it("no input is named like a card field, and none asks the browser to fill one", () => {
    const hits = tsx.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const names = [...text.matchAll(/\b(?:name|id|htmlFor)=["']([^"']+)["']/g)].map((m) => m[1]).filter((name) => CARD_WORD.test(name));
      const autofill = [...text.matchAll(/autoComplete=["'](cc-[^"']*)["']/g)].map((m) => m[1]);
      return [...names, ...autofill].map((n) => `${file}: ${n}`);
    });
    expect(hits).toEqual([]);
  });
});

/** أسماء الأعمدة التي يعرّفها نص SQL وتشبه حقول البطاقة */
function cardColumns(text: string): string[] {
  return text.split(/\r?\n/).flatMap((line) => {
    if (line.trim().startsWith("--")) return [];
    const m = /^\s*(?:alter table\s+\S+\s+)?(?:add column\s+(?:if not exists\s+)?)?"?([a-z_]+)"?\s+(?:text|varchar|char|int|integer|bigint|smallint|jsonb|json|uuid|boolean|bytea)\b/i.exec(line);
    return m && CARD_WORD.test(m[1]) ? [m[1]] : [];
  });
}

describe("no table can carry card data", () => {
  const migrations = files(resolve(ROOT, "db/migrations"), /\.sql$/);

  it("the scan recognises a card column in every form a migration writes one", () => {
    for (const line of ["  card_number text not null,", "cvv varchar(4)", "alter table payments add column card_expiry text;", "  add column if not exists expiry_month int,", '  "pan_hash" bytea,']) {
      expect(cardColumns(line)).toHaveLength(1);
    }
    expect(cardColumns("  card_brand text,\n  -- card_number text\n  company text")).toEqual([]);
  });

  it("no migration defines a card column", () => {
    expect(migrations.length).toBeGreaterThan(5);
    const hits = migrations.flatMap((file) => cardColumns(readFileSync(file, "utf8")).map((name) => `${file}: ${name}`));
    expect(hits).toEqual([]);
  });
});

describe("no log line carries card data", () => {
  const server = files(resolve(ROOT, "src"), /\.tsx?$/);

  it("no console call or error report names a card field", () => {
    const hits = server.flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => /(console\.\w+|reportError)\(/.test(line) && CARD_WORD.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("a card number or CVV inside an error text is removed before it is stored", () => {
    const out = scrubForOps("declined card 4508 7500 0000 1019 cvv=123 CardNumber=4508750000001019");
    expect(out).not.toMatch(/4508/);
    expect(out).not.toMatch(/=123/);
  });
});

describe("gateway payloads keep no card data", () => {
  const card = { CardNumber: "450875xxxxxx1019", Card: { Number: "450875xxxxxx1019", NameOnCard: "Sara", Token: "tok", PanHash: "hash", ExpiryMonth: "12", ExpiryYear: "29", Brand: "VISA" } };

  it("the stored status has no card field or number", () => {
    const stored = JSON.stringify(redactGatewayStatus({ InvoiceId: 1, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: "9", TransactionStatus: "Succss", ...card }] } as never));
    expect(stored).not.toMatch(/4508|NameOnCard|ExpiryMonth|PanHash|CardNumber|"Token"/);
  });

  it("the stored webhook event has no card field or number", () => {
    const stored = JSON.stringify(redactWebhookPayload({ Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED" }, Data: { Invoice: { Id: "1" }, Transaction: { PaymentId: "9", ...card } } } as never));
    expect(stored).not.toMatch(/4508|NameOnCard|ExpiryMonth|PanHash|CardNumber|"Token"/);
  });
});
