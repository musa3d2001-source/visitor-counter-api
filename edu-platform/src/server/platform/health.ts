import "server-only";
import { sql } from "../db";

/**
 * هل الموقع يعمل؟ جواب واحد: قاعدة البيانات ترد أو لا.
 * النتيجة محفوظة ١٠ ثوانٍ لكل نسخة خادم، والطلبات المتزامنة تشترك في فحص واحد، فلا يصير رابط عام وسيلة لإشغال قاعدة البيانات.
 */
const TTL_MS = 10_000;
const TIMEOUT_MS = 3_000;

let cached: { up: boolean; at: number } | null = null;
let running: Promise<boolean> | null = null;

async function databaseAnswers(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([sql`select 1`.then(() => true), timedOut]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer!);
  }
}

export async function isSiteUp(probe: () => Promise<boolean> = databaseAnswers): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.up;
  running ??= probe().then((up) => {
    cached = { up, at: Date.now() };
    running = null;
    return up;
  });
  return running;
}

export function resetHealthCacheForTests() {
  cached = null;
  running = null;
}
