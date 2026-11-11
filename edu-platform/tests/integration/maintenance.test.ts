import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IP_SIGNAL, listAccountIpSignals } from "@/server/admin/access-signals";
import { ACCESS_LOG_RETENTION_DAYS, ERROR_EVENT_RETENTION_DAYS, EXPIRED_TOKEN_GRACE_DAYS, PRUNE_BATCH_SIZE, runDataPruning } from "@/server/platform/maintenance";
import { SATURATION_RETENTION_DAYS } from "@/server/platform/saturation";
import { stampedCopyBudgetBytes } from "@/server/access/delivery";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createTeacher, createUser } from "../helpers/factories";

const count = async (table: "rate_limits" | "sessions" | "access_logs" | "error_events") => (await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`)[0].n;

const sessionId = () => randomBytes(32).toString("hex");

async function addSession(userId: string, createdDaysAgo: number, expiresInDays: number, ip = "10.0.0.1") {
  await sql`
    insert into sessions (id, user_id, ip, created_at, expires_at)
    values (${sessionId()}, ${userId}, ${ip}, now() - make_interval(days => ${createdDaysAgo}), now() + make_interval(days => ${expiresInDays}))
  `;
}

async function addLog(userId: string, daysAgo: number, ip = "10.0.0.1") {
  await sql`insert into access_logs (user_id, action, ip, created_at) values (${userId}, 'view', ${ip}, now() - make_interval(days => ${daysAgo}))`;
}

beforeAll(resetDb);
afterAll(closeDb);

beforeEach(async () => {
  await sql`truncate rate_limits, sessions, access_logs, error_events, saturation_counters, password_reset_tokens, email_verification_tokens, login_challenges, stamped_copies restart identity cascade`;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/server/admin/access-signals");
});

describe("rate limits", () => {
  it("removes only those that ended more than a day ago", async () => {
    await sql`insert into rate_limits (key, count, reset_at) values ('old', 1, now() - interval '2 days'), ('recent', 1, now() - interval '1 hour'), ('active', 1, now() + interval '1 hour')`;
    expect(await runDataPruning()).toMatchObject({ rateLimits: 1 });
    expect((await sql<{ key: string }[]>`select key from rate_limits order by key`).map((r) => r.key)).toEqual(["active", "recent"]);
  });
});

describe("sessions", () => {
  it("removes an expired session older than the sharing window", async () => {
    const user = await createUser();
    await addSession(user.id, 40, -10);
    expect(await runDataPruning()).toMatchObject({ sessions: 1 });
    expect(await count("sessions")).toBe(0);
  });

  it("keeps a live session however old it is", async () => {
    const user = await createUser();
    await addSession(user.id, 40, 5);
    await runDataPruning();
    expect(await count("sessions")).toBe(1);
  });

  it("keeps an expired session still inside the sharing window, because the signal reads it", async () => {
    const user = await createUser();
    await addSession(user.id, IP_SIGNAL.windowDays - 1, -1);
    await runDataPruning();
    expect(await count("sessions")).toBe(1);
  });
});

describe("access logs", () => {
  it("removes what is older than the retention period", async () => {
    const user = await createUser();
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS + 2);
    expect(await runDataPruning()).toMatchObject({ accessLogs: 1 });
    expect(await count("access_logs")).toBe(0);
  });

  it("keeps what is inside the retention period", async () => {
    const user = await createUser();
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS - 2);
    await runDataPruning();
    expect(await count("access_logs")).toBe(1);
  });

  it("the retention is longer than the many-IPs window", () => {
    expect(ACCESS_LOG_RETENTION_DAYS).toBeGreaterThan(IP_SIGNAL.windowDays);
  });

  it("the many-IPs signal reads the same after pruning", async () => {
    const user = await createUser();
    for (let i = 0; i < IP_SIGNAL.minDistinctIps; i++) await addLog(user.id, IP_SIGNAL.windowDays - 1, `10.1.0.${i + 1}`);
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS + 5, "10.9.9.9");
    const before = await listAccountIpSignals();
    expect(before.map((s) => s.id)).toContain(user.id);
    await runDataPruning();
    expect((await listAccountIpSignals()).find((s) => s.id === user.id)?.distinct_ips).toBe(before.find((s) => s.id === user.id)?.distinct_ips);
  });

  it("never reaches into the window, even if the window grows past the retention", async () => {
    vi.resetModules();
    vi.doMock("@/server/admin/access-signals", () => ({ IP_SIGNAL: { windowDays: ACCESS_LOG_RETENTION_DAYS + 30, minDistinctIps: 8, limit: 100 } }));
    const fresh = await import("@/server/platform/maintenance");
    const user = await createUser();
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS + 20);
    await fresh.runDataPruning();
    expect(await count("access_logs")).toBe(1);
  });
});

describe("error events", () => {
  it("removes what has not been seen for a month", async () => {
    await sql`insert into error_events (fingerprint, source, message, last_seen_at) values (${"a".repeat(64)}, 'old', 'm', now() - make_interval(days => ${ERROR_EVENT_RETENTION_DAYS + 1})), (${"b".repeat(64)}, 'new', 'm', now())`;
    expect(await runDataPruning()).toMatchObject({ errorEvents: 1 });
    expect((await sql<{ source: string }[]>`select source from error_events`).map((r) => r.source)).toEqual(["new"]);
  });
});

describe("expired links and login steps", () => {
  const stale = EXPIRED_TOKEN_GRACE_DAYS + 1;

  it("removes those that ended more than a day ago and keeps the rest", async () => {
    const user = await createUser();
    const id = (label: string) => label.padEnd(64, "0");
    await sql`
      insert into password_reset_tokens (id, user_id, expires_at) values
        (${id("a")}, ${user.id}, now() - make_interval(days => ${stale})),
        (${id("b")}, ${user.id}, now() + interval '1 hour')
    `;
    await sql`
      insert into email_verification_tokens (id, user_id, email, expires_at) values
        (${id("c")}, ${user.id}, 'old@farqad.test', now() - make_interval(days => ${stale})),
        (${id("d")}, ${user.id}, 'new@farqad.test', now() - interval '1 hour')
    `;
    await sql`
      insert into login_challenges (id, user_id, expires_at) values
        (${id("e")}, ${user.id}, now() - make_interval(days => ${stale})),
        (${id("f")}, ${user.id}, now() + interval '5 minutes')
    `;
    expect(await runDataPruning()).toMatchObject({ expiredTokens: 3 });
    expect((await sql<{ id: string }[]>`select id from password_reset_tokens union all select id from email_verification_tokens union all select id from login_challenges order by 1`).map((r) => r.id[0])).toEqual(["b", "d", "f"]);
  });
});

describe("saturation counters", () => {
  it("are kept for two weeks, not longer", async () => {
    await sql`
      insert into saturation_counters (hour, kind, count) values
        (now() - make_interval(days => ${SATURATION_RETENTION_DAYS + 1}), 'login_shed', 1),
        (now() - make_interval(days => ${SATURATION_RETENTION_DAYS - 1}), 'login_shed', 1)
    `;
    expect(await runDataPruning()).toMatchObject({ saturationCounters: 1 });
    expect(await sql`select 1 from saturation_counters`).toHaveLength(1);
  });
});

describe("stamped copies are condemned in bounded batches", () => {
  async function addIdleCopies(howMany: number) {
    const user = await createUser();
    await sql`
      insert into stamped_copies (cache_key, user_id, file_id, file_version, object_key, size_bytes, state, last_used_at)
      select md5(g::text) || md5(g::text), ${user.id}, gen_random_uuid(), 'v1', 'stamped/' || gen_random_uuid() || '.pdf', 100, 'ready', now() - interval '60 days'
      from generate_series(1, ${howMany}) g
    `;
  }

  it("marks at most its ceiling in one run, then says it did not finish", async () => {
    await addIdleCopies(PRUNE_BATCH_SIZE * 10 + 700);
    const report = await runDataPruning();
    expect(report.finished).toBe(false);
    const [{ alive }] = await sql<{ alive: number }[]>`select count(*)::int as alive from stamped_copies where state = 'ready'`;
    expect(alive).toBe(700);
  });

  it("the next run finishes what is left", async () => {
    await addIdleCopies(PRUNE_BATCH_SIZE + 5);
    await runDataPruning();
    await runDataPruning();
    expect(await sql`select 1 from stamped_copies where state = 'ready'`).toHaveLength(0);
  });

  /** ملف رئيسي لمنتج جديد، ومشترٍ يملكه (صلاحية مباشرة): نسخه لا تخرج بقاعدة «لم يعد يفتح ملفه» */
  async function ownedFile(title: string) {
    const product = await createProduct({ title });
    const [file] = await sql<{ id: string; storage_key: string }[]>`select id, storage_key from product_files where id = ${product.mainFileId}`;
    const owner = await createUser();
    await sql`insert into entitlements (user_id, product_id, source) values (${owner.id}, ${product.id}, 'manual')`;
    return { product, file, owner };
  }

  /** نسخة جاهزة بحجم جزء من المساحة. preparedDaysAgo فوق STAMPED_COPY_PROTECT_DAYS يجعلها غير محمية */
  const addCopy = (userId: string, file: { id: string; storage_key: string }, share: number, usedHoursAgo: number, preparedDaysAgo: number) => sql<{ id: string }[]>`
    insert into stamped_copies (cache_key, user_id, file_id, file_version, object_key, size_bytes, state, created_at, last_used_at)
    values (md5(random()::text) || md5(random()::text), ${userId}, ${file.id}, ${file.storage_key}, 'stamped/' || gen_random_uuid() || '.pdf',
      ${Math.floor(stampedCopyBudgetBytes() * share)}, 'ready', now() - make_interval(days => ${preparedDaysAgo}), now() - make_interval(hours => ${usedHoursAgo}))
    returning id
  `;
  const readyIds = async () => (await sql<{ id: string }[]>`select id from stamped_copies where state = 'ready' order by last_used_at desc`).map((r) => r.id);

  // القرار F24: التنظيف ينزل بغير المحمية إلى ٩٠٪ من المساحة لا إلى حدها، فنسختان من ٤٠٪ تبقيان والثالثة (١٢٠٪) تخرج.
  // كان الاختبار بنسخ من ٥٠٪ تبقى منها اثنتان عند ١٠٠٪ بالضبط؛ تغيّر الحجم لأن الحد المقصود تغيّر، والترتيب كما هو.
  // البند V5 والقاعدة اليومية «لم يعد يفتح ملفه» غيّرا الإعداد لا المقصود: النسخ هنا لمشترٍ يملك المنتج، وجُهزت قبل ١٠ أيام
  // فهي غير محمية (كانت قبلهما لحساب بلا صلاحية على ملف المعاينة، وهذا اليوم يُحذف بقاعدة الصلاحية وحدها)
  it("unprotected copies over the storage budget go oldest first down to 90%, and the newest stay", async () => {
    const { file, owner } = await ownedFile("ميزانية النسخ");
    for (let g = 1; g <= 5; g++) await addCopy(owner.id, file, 0.4, g, 10);
    const newestTwo = (await readyIds()).slice(0, 2);
    await runDataPruning();
    expect(await readyIds()).toEqual(newestTwo);
  });

  it("over the budget, a copy prepared this week for a current buyer outlives an idle one opened more recently", async () => {
    const { product, file, owner: buyer } = await ownedFile("نسخ محمية");
    // صاحب النسخة الأخرى يملك المنتج أيضًا، لكن نسخته جُهزت قبل ١٠ أيام فلم تعد محمية: الترتيب وحده يخرجها
    const other = await createUser();
    await sql`insert into entitlements (user_id, product_id, source) values (${other.id}, ${product.id}, 'manual')`;
    // المحمية فُتحت قبل ٥ ساعات، وغير المحمية قبل ساعتين: المحمية تبقى مع ذلك
    const [kept] = await addCopy(buyer.id, file, 0.6, 5, 1);
    const [evicted] = await addCopy(other.id, file, 0.6, 2, 10);
    await runDataPruning();
    const states = await sql<{ id: string; state: string }[]>`select id, state from stamped_copies where id in (${kept.id}, ${evicted.id})`;
    expect(Object.fromEntries(states.map((r) => [r.id, r.state]))).toMatchObject({ [kept.id]: "ready" });
    expect(states.find((r) => r.id === evicted.id)?.state ?? "gone").not.toBe("ready");
  });

  // البند V5: نسخ جهزها المالك هذا الأسبوع وتتسع لها المساحة كلها لا يُخرج التنظيف منها شيئًا، ولو تجاوزت ٩٠٪
  it("copies prepared this week for current buyers that fill 95% of the space all survive the nightly prune", async () => {
    const { product, file } = await ownedFile("الصف كله قبل الامتحان");
    for (let i = 0; i < 19; i++) {
      const buyer = await createUser();
      await sql`insert into entitlements (user_id, product_id, source) values (${buyer.id}, ${product.id}, 'manual')`;
      await addCopy(buyer.id, file, 0.05, i + 1, 1);
    }
    const before = await readyIds();
    expect(before).toHaveLength(19);
    await runDataPruning();
    expect(await readyIds()).toEqual(before);
  });

  it("prepared copies beyond the whole space go least recently used first, down to the space and not to 90%", async () => {
    const { product, file } = await ownedFile("أكثر من المساحة");
    for (let g = 1; g <= 5; g++) {
      const buyer = await createUser();
      await sql`insert into entitlements (user_id, product_id, source) values (${buyer.id}, ${product.id}, 'manual')`;
      await addCopy(buyer.id, file, 0.3, g, 1);
    }
    const newestThree = (await readyIds()).slice(0, 3);
    await runDataPruning();
    // ٣ × ٣٠٪ = ٩٠٪ تبقى، والرابعة (١٢٠٪) أول ما يتجاوز المساحة
    expect(await readyIds()).toEqual(newestThree);
  });

  it("unprotected copies go first and only down to 90%, then the prepared ones are left whole", async () => {
    const { file, owner } = await ownedFile("خليط");
    const [prepared] = await addCopy(owner.id, file, 0.7, 30, 1);
    const [recentIdle] = await addCopy(owner.id, file, 0.15, 1, 10);
    await addCopy(owner.id, file, 0.15, 2, 10);
    await runDataPruning();
    // المحمية ٧٠٪ أولًا، ثم الأحدث استعمالًا من غيرها: ٨٥٪ تبقى، و١٠٠٪ تتجاوز ٩٠٪ فتخرج رغم أنها تحت المساحة كلها
    expect((await readyIds()).sort()).toEqual([prepared.id, recentIdle.id].sort());
  });

  it("over the budget, a copy opened in the last quarter hour is not condemned, since its link may be in a student's hands", async () => {
    const user = await createUser();
    const product = await createProduct({ title: "نسخة مفتوحة الآن" });
    const [file] = await sql<{ id: string; storage_key: string }[]>`select id, storage_key from product_files where id = ${product.previewFileId}`;
    const over = stampedCopyBudgetBytes() * 2;
    await sql`
      insert into stamped_copies (cache_key, user_id, file_id, file_version, object_key, size_bytes, state, last_used_at)
      values (md5('in-use') || md5('in-use'), ${user.id}, ${file.id}, ${file.storage_key}, 'stamped/' || gen_random_uuid() || '.pdf', ${over}, 'ready', now() - interval '1 minute')
    `;
    await runDataPruning();
    expect(await sql`select 1 from stamped_copies where state = 'ready'`).toHaveLength(1);
  });
});

// البنود V1 و V2 و V3: كل طريق يسحب الوصول دون أن يعلّم النسخ (تعليق ثم استرداد، تنظيف طلبات الاختبار، انتهاء المدة،
// سحب التزم أثناء ختم) ينتهي هنا: نسخة لم يعد صاحبها يفتح ملفها بقاعدة checkFileAccess تُحذف في الجولة اليومية
describe("the nightly prune removes copies whose owner can no longer open the file", () => {
  async function copyFor(userId: string, product: { mainFileId: string | null }, usedMinutesAgo = 60) {
    const [file] = await sql<{ id: string; storage_key: string }[]>`select id, storage_key from product_files where id = ${product.mainFileId}`;
    const [c] = await sql<{ id: string }[]>`
      insert into stamped_copies (cache_key, user_id, file_id, file_version, object_key, size_bytes, state, last_used_at)
      values (md5(random()::text) || md5(random()::text), ${userId}, ${file.id}, ${file.storage_key}, 'stamped/' || gen_random_uuid() || '.pdf', 100, 'ready', now() - make_interval(mins => ${usedMinutesAgo}))
      returning id
    `;
    return c.id;
  }
  const grant = (userId: string, productId: string) => sql`insert into entitlements (user_id, product_id, source) values (${userId}, ${productId}, 'manual')`;
  const stateOf = async (id: string) => (await sql<{ state: string }[]>`select state from stamped_copies where id = ${id}`)[0]?.state ?? "gone";

  it("a copy whose access was revoked without its copies being forgotten is removed, row and object", async () => {
    const product = await createProduct();
    const buyer = await createUser();
    await grant(buyer.id, product.id);
    const copy = await copyFor(buyer.id, product);
    // سحب لم يمر بـ forgetRevokedCopies: تعليق دفعة، أو تنظيف طلبات الاختبار، أو سحب التزم أثناء الختم
    await sql`update entitlements set revoked_at = now(), revoke_reason = 'تعليق: مراجعة دفعة' where user_id = ${buyer.id}`;
    const report = await runDataPruning();
    expect(await stateOf(copy)).toBe("gone");
    expect(report.stampedCopies).toBe(1);
  });

  it("a copy whose access ran out is removed", async () => {
    const product = await createProduct();
    const buyer = await createUser();
    await sql`insert into entitlements (user_id, product_id, source, expires_at) values (${buyer.id}, ${product.id}, 'manual', now() - interval '1 day')`;
    const copy = await copyFor(buyer.id, product);
    await runDataPruning();
    expect(await stateOf(copy)).toBe("gone");
  });

  it("keeps every copy whose owner still opens the file: direct, through a bundle at any depth, an item added to the bundle later, the self-managed teacher", async () => {
    const note = await createProduct();
    const inner = await createBundle({ items: [note.id] });
    const outer = await createBundle({ items: [inner.id] });
    const later = await createProduct();
    const direct = await createUser();
    await grant(direct.id, note.id);
    const viaOuter = await createUser();
    await grant(viaOuter.id, outer.id);
    // اشترى الباقة قبل أن يُضاف إليها الملف: لا صلاحية مباشرة عليه، والقاعدة الديناميكية تعطيه إياه
    const viaLater = await createUser();
    await grant(viaLater.id, inner.id);
    await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${inner.id}, ${later.id}, 9)`;
    const teacher = await createTeacher({ mode: "self_managed" });
    await sql`update products set teacher_id = ${teacher.id} where id = ${note.id}`;
    const kept = [await copyFor(direct.id, note), await copyFor(viaOuter.id, note), await copyFor(viaLater.id, later), await copyFor(teacher.user!.id, note)];
    // الحالتان المقابلتان: معلم بإدارة ذاتية لمنتج غيره، ومعلم له حساب لكن منتجه تديره المنصة
    const otherTeacher = await createTeacher({ mode: "self_managed" });
    const managedNote = await createProduct();
    const managed = await createTeacher({ mode: "managed", withUser: true });
    await sql`update products set teacher_id = ${managed.id} where id = ${managedNote.id}`;
    const strangers = [await copyFor(otherTeacher.user!.id, note), await copyFor(managed.user!.id, managedNote)];
    await runDataPruning();
    for (const id of kept) expect(await stateOf(id)).toBe("ready");
    for (const id of strangers) expect(await stateOf(id)).toBe("gone");
  });

  it("revoking the bundle removes the copies reached through it, while a direct owner of the same note keeps theirs", async () => {
    const note = await createProduct();
    const bundle = await createBundle({ items: [note.id] });
    const viaBundle = await createUser();
    await grant(viaBundle.id, bundle.id);
    const alsoDirect = await createUser();
    await grant(alsoDirect.id, bundle.id);
    await grant(alsoDirect.id, note.id);
    const [lost, still] = [await copyFor(viaBundle.id, note), await copyFor(alsoDirect.id, note)];
    await sql`update entitlements set revoked_at = now() where product_id = ${bundle.id}`;
    await runDataPruning();
    expect(await stateOf(lost)).toBe("gone");
    expect(await stateOf(still)).toBe("ready");
  });

  it("a copy opened in the last quarter hour waits for the next run, since its link may be in a student's hands", async () => {
    const product = await createProduct();
    const former = await createUser();
    const copy = await copyFor(former.id, product, 2);
    await runDataPruning();
    expect(await stateOf(copy)).toBe("ready");
  });
});

describe("each run is bounded and repeatable", () => {
  it("stops at its ceiling and the next run finishes", async () => {
    await sql`insert into rate_limits (key, count, reset_at) select 'k' || g, 1, now() - interval '3 days' from generate_series(1, ${PRUNE_BATCH_SIZE * 10 + 500}) g`;
    expect(await runDataPruning()).toMatchObject({ rateLimits: PRUNE_BATCH_SIZE * 10, finished: false });
    expect(await runDataPruning()).toMatchObject({ rateLimits: 500, finished: true });
  });

  it("two overlapping runs delete each row once and neither fails", async () => {
    await sql`insert into rate_limits (key, count, reset_at) select 'k' || g, 1, now() - interval '3 days' from generate_series(1, 3000) g`;
    const [a, b] = await Promise.all([runDataPruning(), runDataPruning()]);
    expect(a.rateLimits + b.rateLimits).toBe(3000);
    expect(await count("rate_limits")).toBe(0);
  });

  it("a second run with nothing left does nothing", async () => {
    await runDataPruning();
    expect(await runDataPruning()).toEqual({ rateLimits: 0, sessions: 0, accessLogs: 0, errorEvents: 0, stampedCopies: 0, unconfirmedUploads: 0, videoEvents: 0, expiredTokens: 0, saturationCounters: 0, videos: { checked: 0, held: 0, failed: 0, finished: true }, finished: true });
  });
});
