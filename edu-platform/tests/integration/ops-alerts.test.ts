import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/server/env";
import { handleMyFatoorahWebhook, requestOrderRefund, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import * as mailer from "@/server/platform/mailer";
import { flushSuppressedAlerts, MAX_ALERTS_PER_DAY, OPS_ALERTS, RETRY_FAILED_SEND_MINUTES, sendOpsAlert, sendTestOpsAlert } from "@/server/platform/ops-alerts";
import { alertDelivery, lastAlertSendFailed } from "@/server/platform/ops-status";
import { resetOpsWatchdogForTests, runOpsWatchdog } from "@/server/platform/scheduled-jobs";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { confirmPaid, invoiceIdOf, newOrder, startPayment } from "../helpers/payment-flow";
import { SIM_API_KEY, SIM_PORT, WEBHOOK_SECRET } from "../test-env";

type Mail = { to_email: string; subject: string; body: string | null; status: string };
const mails = () => sql<Mail[]>`select to_email, subject, body, status from email_log where template = 'ops_alert' order by created_at`;
const state = async (kind: string) => (await sql<{ suppressed: number; last_sent_at: Date }[]>`select suppressed, last_sent_at from ops_alert_state where kind = ${kind}`)[0];
const makeOld = (kind: string, hours = 25) => sql`update ops_alert_state set last_sent_at = now() - make_interval(hours => ${hours}) where kind = ${kind}`;

const OWNER = "owner@darb.school";
const CHANGED = ["OPS_ALERT_EMAIL", "VERCEL_ENV", "MAIL_DRIVER", "SMTP_HOST", "SMTP_PORT", "MAIL_FROM", "APP_URL", "STORAGE_DRIVER", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = new Map(CHANGED.map((name) => [name, process.env[name]]));

function restoreEnv() {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/** خادم بريد لا يقبل الاتصال: كل إرسال يفشل */
function smtpDown() {
  process.env.MAIL_DRIVER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";
  process.env.MAIL_FROM = "منصة درب <no-reply@darb.school>";
  resetEnvCache();
}

function smtpBack() {
  restoreEnv();
  process.env.OPS_ALERT_EMAIL = OWNER;
  resetEnvCache();
}

let sim: Simulator;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});

afterAll(async () => {
  await sim.close();
  await closeDb();
});

beforeEach(async () => {
  await sql`truncate ops_alert_state, email_log, error_events, job_heartbeats restart identity`;
  await sql`update payments set status = 'failed' where status in ('initiated', 'pending')`;
  process.env.OPS_ALERT_EMAIL = OWNER;
  resetEnvCache();
  resetPaymentMethodsCache();
  resetOpsWatchdogForTests();
  sim.state.requests.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
  resetEnvCache();
});

describe("one message per kind per period", () => {
  it("the first goes out, to the owner, with a link and no data", async () => {
    expect(await sendOpsAlert("server_error")).toBe(true);
    const [mail] = await mails();
    expect(mail.to_email).toBe(OWNER);
    expect(mail.subject).toContain("خطأ جديد في الموقع");
    expect(mail.body).toContain("http://localhost:3000/admin/ops");
  });

  it("the second within the period does not, and is counted", async () => {
    await sendOpsAlert("server_error");
    expect(await sendOpsAlert("server_error")).toBe(false);
    expect(await mails()).toHaveLength(1);
    expect((await state("server_error")).suppressed).toBe(1);
  });

  it("a storm of events at the same moment sends exactly one", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => sendOpsAlert("server_error")));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await mails()).toHaveLength(1);
    expect((await state("server_error")).suppressed).toBe(24);
  });

  it("one kind does not hold back another", async () => {
    await sendOpsAlert("server_error");
    expect(await sendOpsAlert("payment_dispute")).toBe(true);
    expect(await mails()).toHaveLength(2);
  });

  it("the next period's message says how many were held back", async () => {
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await makeOld("server_error");
    expect(await sendOpsAlert("server_error")).toBe(true);
    const list = await mails();
    expect(list[1].body).toContain("٢");
    expect((await state("server_error")).suppressed).toBe(0);
  });

  it("the worst case of every kind firing all day stays within the daily ceiling", () => {
    const perDay = Object.values(OPS_ALERTS).reduce((total, spec) => total + Math.ceil(1440 / spec.periodMinutes), 0);
    expect(perDay).toBeLessThanOrEqual(MAX_ALERTS_PER_DAY);
  });
});

describe("what was held back is not lost", () => {
  it("is sent when the period ends, once", async () => {
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await makeOld("server_error");
    await flushSuppressedAlerts();
    await flushSuppressedAlerts();
    const list = await mails();
    expect(list).toHaveLength(2);
    expect(list[1].body).toContain("متابعة");
  });

  it("is not sent before the period ends", async () => {
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await flushSuppressedAlerts();
    expect(await mails()).toHaveLength(1);
  });

  it("nothing held back means nothing to send", async () => {
    await sendOpsAlert("server_error");
    await makeOld("server_error");
    await flushSuppressedAlerts();
    expect(await mails()).toHaveLength(1);
  });

  it("a follow-up with nothing held back sends nothing, even after the period", async () => {
    await sendOpsAlert("server_error");
    await makeOld("server_error");
    expect(await sendOpsAlert("server_error", { followUp: true })).toBe(false);
    expect(await mails()).toHaveLength(1);
  });

  it("a kind this version does not know is ignored", async () => {
    await sql`insert into ops_alert_state (kind, last_sent_at, suppressed) values ('from_the_future', now() - interval '3 days', 4)`;
    await expect(flushSuppressedAlerts()).resolves.toBeUndefined();
    expect(await mails()).toHaveLength(0);
  });
});

describe("the alert path cannot feed on itself", () => {
  it("a mail server that refuses leaves no error event and does not throw", async () => {
    process.env.MAIL_DRIVER = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1";
    process.env.MAIL_FROM = "منصة درب <no-reply@darb.school>";
    resetEnvCache();
    await expect(sendOpsAlert("server_error")).resolves.toBe(false);
    expect(await sql`select 1 from error_events`).toHaveLength(0);
    expect(await sql`select 1 from email_log where template = 'ops_alert' and status = 'failed'`).toHaveLength(1);
  });

  it("a failed send is not retried at once, so an outage sends no rapid attempts", async () => {
    smtpDown();
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await flushSuppressedAlerts();
    expect(await sql`select 1 from email_log where template = 'ops_alert'`).toHaveLength(1);
  });

  it("a failed send is not lost: the follow-up after the retry delay carries it", async () => {
    smtpDown();
    expect(await sendOpsAlert("payment_dispute")).toBe(false);
    expect((await state("payment_dispute")).suppressed).toBe(1);
    smtpBack();
    await sql`update ops_alert_state set last_sent_at = last_sent_at - make_interval(mins => ${RETRY_FAILED_SEND_MINUTES + 1}) where kind = 'payment_dispute'`;
    await flushSuppressedAlerts();
    const list = await mails();
    expect(list.map((mail) => mail.status)).toEqual(["failed", "logged"]);
    expect(list[1].body).toContain(OPS_ALERTS.payment_dispute.body);
    expect((await state("payment_dispute")).suppressed).toBe(0);
  });

  it("a failed send keeps the count held back before it", async () => {
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await sendOpsAlert("server_error");
    await makeOld("server_error");
    smtpDown();
    expect(await sendOpsAlert("server_error")).toBe(false);
    expect((await state("server_error")).suppressed).toBe(3);
    smtpBack();
    await makeOld("server_error");
    await flushSuppressedAlerts();
    expect((await mails()).at(-1)?.body).toContain("٣");
  });

  it("a test alert says plainly whether it went out, and leaves every alert period alone", async () => {
    expect(await sendTestOpsAlert()).toBe("logged");
    expect(await alertDelivery()).toBe("logged");
    smtpDown();
    expect(await sendTestOpsAlert()).toBe("failed");
    expect(await alertDelivery()).toBe("failed");
    expect(await sql`select 1 from ops_alert_state`).toHaveLength(0);
    smtpBack();
    delete process.env.OPS_ALERT_EMAIL;
    resetEnvCache();
    expect(await sendTestOpsAlert()).toBe("no_address");
    expect(await alertDelivery()).toBe("none");
    expect(await sql`select 1 from email_log where template = 'ops_alert_test'`).toHaveLength(2);
  });

  it("the owner page learns that the last alert did not go out", async () => {
    expect(await lastAlertSendFailed()).toBe(false);
    smtpDown();
    await sendOpsAlert("job_failed");
    expect(await lastAlertSendFailed()).toBe(true);
    smtpBack();
    await makeOld("job_failed");
    await flushSuppressedAlerts();
    expect(await lastAlertSendFailed()).toBe(false);
  });

  it("a mail server that never answers cannot hold the caller", async () => {
    vi.spyOn(mailer, "sendMail").mockImplementation(() => new Promise<never>(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let outcome: boolean | undefined;
      void sendOpsAlert("server_error").then((sent) => {
        outcome = sent;
      });
      await vi.waitFor(
        async () => {
          await vi.advanceTimersByTimeAsync(15_000);
          expect(outcome).toBe(false);
        },
        { timeout: 3000, interval: 20 },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("a database failure inside the alert does not throw or record an error", async () => {
    await sql`alter table ops_alert_state rename to ops_alert_state_moved`;
    try {
      await expect(sendOpsAlert("server_error")).resolves.toBe(false);
    } finally {
      await sql`alter table ops_alert_state_moved rename to ops_alert_state`;
    }
    expect(await sql`select 1 from error_events`).toHaveLength(0);
  });
});

describe("when no message should go out", () => {
  it("no address configured: nothing is sent, nothing breaks, and the period is not used up", async () => {
    delete process.env.OPS_ALERT_EMAIL;
    resetEnvCache();
    expect(await sendOpsAlert("server_error")).toBe(false);
    expect(await mails()).toHaveLength(0);
    expect(await state("server_error")).toBeUndefined();
  });

  it("a preview deployment never wakes the owner", async () => {
    // نشر Vercel حقيقي: عنوان https وتخزين Supabase، وإلا لا يبدأ الخادم أصلًا (env-schema: deploymentProblems)
    Object.assign(process.env, { VERCEL_ENV: "preview", APP_URL: "https://darb-preview.vercel.app", STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://example-project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test" });
    resetEnvCache();
    expect(await sendOpsAlert("payment_dispute")).toBe(false);
    expect(await mails()).toHaveLength(0);
  });
});

describe("each money event reaches the owner", () => {
  async function paidThroughGateway() {
    const made = await newOrder();
    const { url } = await startPayment(made.order, null);
    const invoice = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    return { ...made, invoice, paymentId };
  }

  it("a second payment on the same invoice", async () => {
    const { invoice } = await paidThroughGateway();
    expect(await mails()).toHaveLength(0);
    await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    const list = await mails();
    expect(list).toHaveLength(1);
    expect(list[0].subject).toContain("دفعة زائدة");
    expect(list[0].body).toContain("/admin/orders#extra-payments");
    expect(list[0].body).not.toContain("example.com");
  });

  it("an amount that does not match the order", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.setAmountTamper(500);
    await sim.pay(invoiceIdOf(url), "success");
    await verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(url)) });
    sim.setAmountTamper(null);
    expect((await mails())[0].subject).toContain("دفعة زائدة");
  });

  it("a new dispute, once, and again only when its status changes", async () => {
    const { invoice, paymentId } = await paidThroughGateway();
    const delivered = sim.buildDisputeWebhook(invoice, paymentId, { DisputeTransactionId: 7001, Status: "PENDING" });
    expect((await handleMyFatoorahWebhook(delivered.body, delivered.headers)).status).toBe(200);
    const list = await mails();
    expect(list).toHaveLength(1);
    expect(list[0].subject).toContain("نزاع");
    expect(list[0].body).toContain("/admin/orders#payment-holds");

    await makeOld("payment_dispute");
    const again = sim.buildDisputeWebhook(invoice, paymentId, { DisputeTransactionId: 7001, Status: "PENDING" });
    await handleMyFatoorahWebhook(again.body, again.headers);
    expect(await mails()).toHaveLength(1);

    const changed = sim.buildDisputeWebhook(invoice, paymentId, { DisputeTransactionId: 7001, Status: "LOST" });
    await handleMyFatoorahWebhook(changed.body, changed.headers);
    expect(await mails()).toHaveLength(2);
  });

  it("a failure while processing a signed webhook is recorded for the owner, and the event can be retried", async () => {
    const { invoice, paymentId } = await paidThroughGateway();
    const delivered = sim.buildDisputeWebhook(invoice, paymentId, { DisputeTransactionId: 7002, Status: "PENDING" });
    await sql`alter table payment_alerts rename to payment_alerts_moved`;
    let outcome;
    try {
      outcome = await handleMyFatoorahWebhook(delivered.body, delivered.headers);
    } finally {
      await sql`alter table payment_alerts_moved rename to payment_alerts`;
    }
    expect(outcome.status).toBe(500);
    expect(await sql`select 1 from error_events where source = 'webhook:processing'`).toHaveLength(1);
  });

  describe("a refund with no known result", () => {
    const stuckRefund = async (status: "unknown" | "sending", minutes: number) => {
      const { order, user } = await newOrder();
      await confirmPaid(order);
      await sql`
        insert into refunds (order_id, amount_fils, reason, status, attempt, claimed_at, created_by)
        values (${order.id}, ${order.total_fils}, 'سبب الاسترداد', ${status}, 1, now() - make_interval(mins => ${minutes}), ${user.id})
      `;
    };

    it("left unknown is reported by the watchdog", async () => {
      await stuckRefund("unknown", 45);
      await runOpsWatchdog({ force: true });
      const list = await mails();
      expect(list).toHaveLength(1);
      expect(list[0].subject).toContain("استرداد");
      expect(list[0].body).toContain("/admin/orders#refund-queue");
      await sql`delete from refunds`;
    });

    it("still being sent, a few minutes old, is not", async () => {
      await stuckRefund("sending", 1);
      await runOpsWatchdog({ force: true });
      expect(await mails()).toHaveLength(0);
      await sql`delete from refunds`;
    });

    it("the reminder repeats daily, not on every check", async () => {
      await stuckRefund("unknown", 45);
      await runOpsWatchdog({ force: true });
      await runOpsWatchdog({ force: true });
      expect(await mails()).toHaveLength(1);
      await makeOld("refund_unknown");
      await runOpsWatchdog({ force: true });
      expect(await mails()).toHaveLength(2);
      await sql`delete from refunds`;
    });

    it("an extra payment whose refund is unknown counts too", async () => {
      const { invoice, order } = await paidThroughGateway();
      await sim.pay(invoice, "success");
      await verifyAndApplyPayment({ invoiceId: String(invoice) });
      await sql`truncate email_log, ops_alert_state`;
      await sql`update payment_extras set state = 'refund_unknown', created_at = now() - interval '2 hours' where order_id = ${order.id}`;
      await runOpsWatchdog({ force: true });
      expect((await mails())[0].subject).toContain("استرداد");
      await sql`update payment_extras set state = 'dismissed' where order_id = ${order.id}`;
    });

    it("an ordinary refund in progress does not raise anything", async () => {
      const admin = await createUser({ role: "admin" });
      const { order } = await paidThroughGateway();
      await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب ولي الأمر" });
      await runOpsWatchdog({ force: true });
      expect(await mails()).toHaveLength(0);
    });
  });
});
