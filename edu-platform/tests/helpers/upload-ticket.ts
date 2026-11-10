import { statSync } from "node:fs";
import { resolve } from "node:path";
import { TEST_STORAGE_DIR } from "../test-env";
import { sql } from "@/server/db";
import { completeUpload } from "@/server/admin/uploads";
import type { Actor } from "@/server/auth/permissions";

/** حجم ما في القرص مباشرة: لا يمر بـ storage() لئلا يستهلك محاكاة stat في الاختبار */
function sizeOnDisk(key: string): { bucket: "private" | "public"; size: number } {
  for (const bucket of ["private", "public"] as const) {
    try {
      return { bucket, size: statSync(resolve(TEST_STORAGE_DIR, bucket, key)).size };
    } catch {
      /* الدلو الآخر */
    }
  }
  return { bucket: "private", size: 1 };
}

/** ما كان initUpload سيسجله لهذا الكائن: الاختبار يضع الكائن في التخزين مباشرة بدل الرفع عبر الرابط */
export async function issueTicket(key: string, target: string, actorId: string, declaredSize?: number) {
  const disk = sizeOnDisk(key);
  await sql`
    insert into upload_tickets (storage_key, bucket, target, actor_id, declared_size)
    values (${key}, ${disk.bucket}, ${target}, ${actorId}, ${declaredSize ?? disk.size})
    on conflict (storage_key) do nothing
  `;
}

/** تأكيد رفع صدر له رابط من الشخص نفسه، وهو المسار الطبيعي */
export async function completeTicketed(input: Parameters<typeof completeUpload>[0], actor: Actor) {
  await issueTicket(input.key, input.target, actor.userId);
  return completeUpload(input, actor);
}
