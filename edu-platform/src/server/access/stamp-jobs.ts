import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "../db";
import { storage } from "../storage";
import { getSettings } from "../platform/settings";
import { reportError } from "../platform/report-error";
import { exceedsStampLimit } from "@/lib/pdf-limits";
import { DELIVERY_STAMP_BUDGET_MS, PdfUnusableError, StampDeadlineError } from "./pdf";
import { hasProductAccess } from "./entitlements";
import { identityAndCopies, produceCopy, StampInProgressError, type DeliverableFile, type DeliveryUser } from "./delivery";
import { StampBusyError, stampGateContended } from "./stamp-gate";
import { reserveStampMemory } from "./stamp-memory";
import { PARKED_DAYS, STAMP_JOB_MAX_ATTEMPTS, type DrainScope } from "./stamp-queue";

/**
 * تفريغ طابور النسخ المجهزة (القرار F23). من يفرّغه: بعد الرد على منح صلاحية أو رفع ملف (after)، والمهمة اليومية،
 * وزر المالك. فتح الطالب نفسه يختم نسخته إن وجد مهمته في الطابور (delivery.ts)، فلا يختمها أحد مرتين.
 *
 *  - المطالبة دفعية: MATERIALIZED + FOR UPDATE SKIP LOCKED مع عقد (holder و lease_until)، فلا يأخذ مفرّغان المهمة نفسها،
 *    ومفرّغ مات تعود مهامه بعد انتهاء عقده. فوق ذلك عقد الختم في stamped_copies يمنع ختم المفتاح نفسه مرتين.
 *  - كل دفعة لملف واحد: الأصل يُقرأ من التخزين مرة للدفعة كلها، لا مرة لكل مشترٍ.
 *  - قبل الختم يُفحص كل شيء من جديد: الحساب فعال، والمشتري ما زال يملك المنتج (قاعدة الملكية نفسها)، والنسخة غير موجودة.
 *    ملف مدفوع لا يُختم إلا لمشتريه.
 *  - ميزانية وقت، ومفرّغان على الأكثر في النسخة الواحدة، والختم نفسه يمر بمكان الختم المحدود وسقف الذاكرة.
 *    إن انتظر طالب مكانًا يتوقف التفريغ ويعيد مهامه: الطلاب قبل التجهيز.
 */

export const STAMP_JOB_LEASE_SECONDS = 300;
export const STAMP_JOB_BATCH = 20;
export { STAMP_JOB_MAX_ATTEMPTS };
const MAX_DRAINERS = 2;
/** لا يبدأ ختمًا جديدًا إن بقي أقل من هذا من الميزانية */
const MIN_JOB_MS = 5_000;

let drainers = 0;

export type DrainReport = { prepared: number; alreadyReady: number; dropped: number; deferred: number; failed: number; remaining: boolean; skipped: null | "busy" | "watermark_off" };

type ClaimedJob = { id: string; user_id: string; attempts: number };
type FileRow = { id: string; product_id: string; storage_key: string; kind: "main" | "preview"; size_bytes: string; page_count: number | null; check_status: string };
type UserRow = { id: string; email: string; role: string; is_active: boolean; anonymized_at: Date | null; file_current: boolean };

const scopeSql = (scope: DrainScope) => sql`
  ${scope.userId ? sql`and user_id = ${scope.userId}` : sql``}
  ${scope.fileIds ? sql`and file_id = any(${scope.fileIds}::uuid[])` : sql``}
`;

async function done(jobId: string, token: string) {
  await sql`delete from stamp_jobs where id = ${jobId} and holder = ${token}`;
}

/** مهام أُخذت ولم تُجرَّب (نفد الوقت أو احتاج طالب المكان): تعود كما كانت، ولا تُحتسب محاولة */
async function giveBack(jobIds: string[], token: string) {
  if (jobIds.length === 0) return;
  await sql`update stamp_jobs set holder = null, lease_until = null, attempts = greatest(attempts - 1, 0) where id = any(${jobIds}::uuid[]) and holder = ${token}`;
}

/** تعثر: المحاولة التالية بعد مهلة تتضاعف (دقيقتان، ٤، ٨...). بعد STAMP_JOB_MAX_ATTEMPTS تتوقف (PARKED_DAYS) ولا تُعاد وحدها */
async function failed(job: ClaimedJob, token: string, code: string) {
  const final = job.attempts >= STAMP_JOB_MAX_ATTEMPTS;
  await sql`
    update stamp_jobs set holder = null, lease_until = null, last_error = ${code},
      not_before = now() + ${final ? sql`make_interval(days => ${PARKED_DAYS * 10})` : sql`make_interval(mins => ${2 ** Math.min(job.attempts, 10)})`}
    where id = ${job.id} and holder = ${token}
  `;
  return final;
}

/** النسخة تُختم الآن في طلب أو مفرّغ آخر: تعود بعد قليل دون أن تُحتسب محاولة */
async function deferred(job: ClaimedJob, token: string) {
  await sql`update stamp_jobs set holder = null, lease_until = null, attempts = greatest(attempts - 1, 0), not_before = now() + interval '1 minute' where id = ${job.id} and holder = ${token}`;
}

export async function drainStampJobs(opts: DrainScope & { budgetMs: number }): Promise<DrainReport> {
  const report: DrainReport = { prepared: 0, alreadyReady: 0, dropped: 0, deferred: 0, failed: 0, remaining: false, skipped: null };
  if (drainers >= MAX_DRAINERS) return { ...report, remaining: true, skipped: "busy" };
  drainers++;
  try {
    const deadline = Date.now() + opts.budgetMs;
    const settings = await getSettings();
    if (!settings.watermark_enabled) {
      // بلا ختم يُسلَّم الأصل ولا تلزم نسخ: المهام لا معنى لها
      await sql`delete from stamp_jobs where true ${scopeSql(opts)}`;
      return { ...report, skipped: "watermark_off" };
    }
    while (Date.now() < deadline - MIN_JOB_MS) {
      if (stampGateContended()) {
        report.remaining = true;
        break;
      }
      const [pick] = await sql<{ file_id: string }[]>`
        select file_id from stamp_jobs
        where not_before <= now() and (holder is null or lease_until < now()) ${scopeSql(opts)}
        order by not_before, created_at limit 1
      `;
      if (!pick) break;
      const token = randomUUID();
      const jobs = await sql<ClaimedJob[]>`
        with picked as materialized (
          select id from stamp_jobs
          where file_id = ${pick.file_id} and not_before <= now() and (holder is null or lease_until < now()) ${opts.userId ? sql`and user_id = ${opts.userId}` : sql``}
          order by created_at limit ${STAMP_JOB_BATCH}
          for update skip locked
        )
        update stamp_jobs j set holder = ${token}, lease_until = now() + make_interval(secs => ${STAMP_JOB_LEASE_SECONDS}), attempts = j.attempts + 1
        from picked where j.id = picked.id
        returning j.id, j.user_id, j.attempts
      `;
      // مفرّغ آخر أخذها بين السؤالين: يكمل هو، ونحن نتوقف بدل أن ندور على الملف نفسه
      if (jobs.length === 0) {
        report.remaining = true;
        break;
      }
      const stop = await drainFile(pick.file_id, jobs, token, deadline, report);
      if (stop) {
        report.remaining = true;
        break;
      }
    }
    if (!report.remaining) {
      const [left] = await sql<{ n: number }[]>`select count(*)::int as n from stamp_jobs where not_before <= now() ${scopeSql(opts)}`;
      report.remaining = (left?.n ?? 0) > 0;
    }
    return report;
  } finally {
    drainers--;
  }
}

/** دفعة ملف واحد. يعيد true إن وجب التوقف (الوقت، أو طالب ينتظر مكانًا، أو الذاكرة ممتلئة) */
async function drainFile(fileId: string, jobs: ClaimedJob[], token: string, deadline: number, report: DrainReport): Promise<boolean> {
  const [f] = await sql<FileRow[]>`select id, product_id, storage_key, kind, size_bytes::text, page_count, check_status from product_files where id = ${fileId}`;
  if (!f || f.kind !== "main") {
    for (const job of jobs) await done(job.id, token);
    report.dropped += jobs.length;
    return false;
  }
  const file: DeliverableFile = { id: f.id, productId: f.product_id, storageKey: f.storage_key, kind: f.kind, sizeBytes: Number(f.size_bytes), pageCount: f.page_count, checkStatus: f.check_status };
  // ملف فوق الحد أو عُلّم معيبًا: لا يُختم في الخلفية. فتح الطالب يقول له الصدق، والمالك يراه في «سلامة المحتوى»
  if (exceedsStampLimit(file) || (file.checkStatus !== "ok" && file.checkStatus !== "unchecked")) {
    for (const job of jobs) await done(job.id, token);
    report.dropped += jobs.length;
    return false;
  }

  let lease: ReturnType<typeof reserveStampMemory>;
  try {
    lease = reserveStampMemory(file.sizeBytes);
  } catch (err) {
    if (!(err instanceof StampBusyError)) throw err;
    await giveBack(jobs.map((j) => j.id), token);
    return true;
  }
  let original: Uint8Array | null = null;
  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (Date.now() > deadline - MIN_JOB_MS || stampGateContended()) {
        await giveBack(jobs.slice(i).map((j) => j.id), token);
        return true;
      }
      // الملف يُفحص مع كل مهمة لا مرة للدفعة (البند V3): ملف حُذف أثناء الدفعة لا يُختم منه ما بقي من أصله في الذاكرة،
      // ونسخة له بدّلت مفتاحها تُقرأ من جديد. مهامه تعود (أو حُذفت معه)، وتأخذها الجولة التالية بصف الملف الجديد
      const [u] = await sql<UserRow[]>`
        select u.id, u.email, u.role, u.is_active, u.anonymized_at,
          exists (select 1 from product_files f where f.id = ${file.id} and f.storage_key = ${file.storageKey}) as file_current
        from users u where u.id = ${job.user_id}
      `;
      if (u && !u.file_current) {
        await giveBack(jobs.slice(i).map((j) => j.id), token);
        return false;
      }
      if (!u || !u.is_active || u.anonymized_at || u.role === "admin" || !(await hasProductAccess(u.id, file.productId))) {
        await done(job.id, token);
        report.dropped++;
        continue;
      }
      const user: DeliveryUser = { id: u.id, email: u.email, role: u.role };
      const { identity, key, hit } = await identityAndCopies(user, file);
      if (hit) {
        await done(job.id, token);
        report.alreadyReady++;
        continue;
      }
      try {
        if (!original) {
          original = await storage().read("private", file.storageKey);
          lease.resize(original.length);
        }
        const produced = await produceCopy(key, user, file, identity.lines, { original, budgetMs: Math.min(DELIVERY_STAMP_BUDGET_MS, Math.max(MIN_JOB_MS, deadline - Date.now())) });
        if (produced.kind === "kept") {
          await done(job.id, token);
          report.prepared++;
        } else {
          // لم تُحفظ: لا أحد يقرؤها هنا، فتُحرر
          await produced.shared.open().cancel();
          if (produced.refused && !(await hasProductAccess(u.id, file.productId))) {
            // سُحب الوصول أثناء الختم (استرداد أو تعليق أو سحب، البند V3): حُذف كائنها، والمهمة لا تُعاد
            await done(job.id, token);
            report.dropped++;
          } else if (await failed(job, token, "not_kept")) {
            // التخزين رفض، أو تغيّر البريد أو أُخذ العقد أثناء الختم: تُعاد المهمة لاحقًا بما هو قائم حينها
            report.failed++;
          }
        }
      } catch (err) {
        if (err instanceof StampInProgressError) {
          await deferred(job, token);
          report.deferred++;
          continue;
        }
        if (err instanceof StampBusyError) {
          await giveBack(jobs.slice(i).map((j) => j.id), token);
          return true;
        }
        if (err instanceof PdfUnusableError && !(err instanceof StampDeadlineError)) {
          // الملف نفسه لا يُختم: كل مهامه في هذه الدفعة مثلها. فتح الطالب يسجل المشكلة للمالك
          for (const rest of jobs.slice(i)) await done(rest.id, token);
          report.dropped += jobs.length - i;
          return false;
        }
        await reportError("stamp-jobs:job", err);
        if (await failed(job, token, err instanceof StampDeadlineError ? "deadline" : "error")) report.failed++;
      }
    }
    return false;
  } finally {
    original = null;
    lease.release();
  }
}
