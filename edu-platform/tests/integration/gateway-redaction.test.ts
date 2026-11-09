import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redactGatewayStatus, redactWebhookPayload, STATUS_INVOICE_KEYS, STATUS_TRANSACTION_KEYS, WEBHOOK_EVENT_KEYS, WEBHOOK_SECTIONS } from "@/lib/anonymize";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";

beforeAll(resetDb);
afterAll(closeDb);

const everyKey = (keys: readonly string[]) => Object.fromEntries(keys.map((k, i) => [k, i % 3 === 0 ? `v-${k}` : i % 3 === 1 ? i : null]));

const STATUSES: unknown[] = [
  { ...everyKey(STATUS_INVOICE_KEYS), CustomerName: "سارة", CustomerEmail: "sara@example.com", CustomerMobile: "99887766", InvoiceTransactions: [{ ...everyKey(STATUS_TRANSACTION_KEYS), CardNumber: "450875xxxxxx1019", CustomerIp: "1.2.3.4" }, { TransactionStatus: "Succss", PaymentId: "2", CardNumber: "x" }] },
  { InvoiceStatus: true, InvoiceTransactions: [] },
  { InvoiceId: { nested: "object is dropped" }, InvoiceStatus: ["array is dropped"], InvoiceTransactions: ["not an object", 7, null, { PaymentId: { deep: 1 }, Error: "kept" }] },
  { InvoiceTransactions: "not an array" },
  {},
  [],
  "text",
  3,
];

const WEBHOOKS: unknown[] = [
  {
    Event: { ...everyKey(WEBHOOK_EVENT_KEYS), Extra: "dropped" },
    Data: {
      ...Object.fromEntries(Object.entries(WEBHOOK_SECTIONS).map(([section, keys]) => [section, { ...everyKey(keys), Secret: "dropped", Nested: { a: 1 } }])),
      Customer: { Name: "سارة", Email: "sara@example.com", Mobile: "99887766" },
      Card: { Number: "450875xxxxxx1019" },
      IP: { Address: "1.2.3.4" },
    },
  },
  { Event: "not an object", Data: "not an object" },
  { Data: { Invoice: "not an object", Transaction: { PaymentId: "1" } } },
  { Event: { Code: 1 } },
  {},
  [],
  "text",
];

describe("the database cleaners match the code", () => {
  const migrationText = readFileSync(resolve(process.cwd(), "db/migrations/0011_accounts_hardening.sql"), "utf8");
  const sqlArray = (keys: readonly string[]) => `array[${keys.map((k) => `'${k}'`).join(", ")}]`;

  it("both allow-lists hold exactly the same keys", () => {
    expect(migrationText).toContain(sqlArray(STATUS_INVOICE_KEYS));
    expect(migrationText).toContain(sqlArray(STATUS_TRANSACTION_KEYS));
    expect(migrationText).toContain(sqlArray(WEBHOOK_EVENT_KEYS));
    for (const [section, keys] of Object.entries(WEBHOOK_SECTIONS)) expect(migrationText).toContain(`('${section}', ${sqlArray(keys)})`);
  });

  it.each(STATUSES.map((value, i) => [i, value] as const))("gateway status %i", async (_i, value) => {
    const [row] = await sql<{ out: unknown }[]>`select redact_gateway_status(${sql.json(value as never)}::jsonb) as out`;
    expect(row.out).toEqual(redactGatewayStatus(value));
  });

  it.each(WEBHOOKS.map((value, i) => [i, value] as const))("webhook payload %i", async (_i, value) => {
    const [row] = await sql<{ out: unknown }[]>`select redact_webhook_payload(${sql.json(value as never)}::jsonb) as out`;
    expect(row.out).toEqual(redactWebhookPayload(value));
  });

  it("a NULL column stays harmless", async () => {
    const [row] = await sql<{ a: unknown; b: unknown }[]>`select redact_gateway_status(null) as a, redact_webhook_payload(null) as b`;
    expect(row).toEqual({ a: {}, b: {} });
  });
});

describe("the migration cleans rows stored before this release", () => {
  const migration = readFileSync(resolve(process.cwd(), "db/migrations/0011_accounts_hardening.sql"), "utf8");
  const statement = (start: string) => {
    const from = migration.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    return migration.slice(from, migration.indexOf(";", from) + 1);
  };

  it("removes the customer and the card, and keeps every id the system reads", async () => {
    const u = await createUser();
    const [o] = await sql<{ id: string }[]>`insert into orders (user_id, subtotal_fils, total_fils, status, is_test, paid_at, customer_name, customer_email) values (${u.id}, 1000, 1000, 'paid', false, now(), 'سارة', 'sara@example.com') returning id`;
    const status = { InvoiceId: 5, InvoiceStatus: "Paid", CustomerName: "سارة", CustomerEmail: "sara@example.com", InvoiceTransactions: [{ PaymentId: "77", TransactionStatus: "InProgress", CardNumber: "450875xxxxxx1019" }] };
    const [p] = await sql<{ id: string }[]>`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id, last_gateway_status) values (${o.id}, 'myfatoorah', 'sandbox', 'paid', 1000, '5', ${sql.json(status)}) returning id`;
    const [none] = await sql<{ id: string }[]>`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id) values (${o.id}, 'myfatoorah', 'sandbox', 'expired', 1000, '6') returning id`;
    const webhook = { Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED" }, Data: { Invoice: { Id: "5", Status: "PAID" }, ReferencedInvoice: { Id: "9" }, Transaction: { PaymentId: "77", Card: { Number: "450875xxxxxx1019" } }, Customer: { Email: "sara@example.com" } } };
    await sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid) values ('myfatoorah', 'backfill-1', 'PAYMENT_STATUS_CHANGED', ${sql.json(webhook)}, true)`;

    await sql.unsafe(statement("update payments set last_gateway_status = redact_gateway_status"));
    await sql.unsafe(statement("update payment_events set payload = redact_webhook_payload"));

    const [clean] = await sql<{ last_gateway_status: unknown; attempt: string; open: boolean; invoice: string }[]>`
      select last_gateway_status, last_gateway_status->'InvoiceTransactions'->-1->>'PaymentId' as attempt, last_gateway_status->>'InvoiceStatus' as invoice,
        last_gateway_status @? '$.InvoiceTransactions[*] ? (@.TransactionStatus == "InProgress")' as open
      from payments where id = ${p.id}
    `;
    expect(JSON.stringify(clean.last_gateway_status)).not.toMatch(/سارة|sara@example|450875/);
    expect(clean).toMatchObject({ attempt: "77", open: true, invoice: "Paid" });
    const [untouched] = await sql<{ last_gateway_status: unknown }[]>`select last_gateway_status from payments where id = ${none.id}`;
    expect(untouched.last_gateway_status).toBeNull();

    const [event] = await sql<{ payload: unknown; invoice: string; referenced: string }[]>`
      select payload, payload #>> '{Data,Invoice,Id}' as invoice, payload #>> '{Data,ReferencedInvoice,Id}' as referenced from payment_events where event_key = 'backfill-1'
    `;
    expect(JSON.stringify(event.payload)).not.toMatch(/sara@example|450875|"Customer"|"Card"/);
    expect(event).toMatchObject({ invoice: "5", referenced: "9" });
  });
});
