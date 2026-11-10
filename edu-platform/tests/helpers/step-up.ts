import { proveStepUp } from "@/server/auth/two-factor";
import { enrolAdmin, freshCode } from "./two-factor";

/** مالك سجّل عامله الثاني، وجلسة أثبتته للتو عبر المسار الحقيقي. للاختبارات التي لا تدور حول الإثبات نفسه */
export async function provenOwner(user: { id: string; email: string }) {
  const enrolled = await enrolAdmin(user);
  const proved = await proveStepUp({ userId: user.id, sessionId: enrolled.sessionId, code: await freshCode(user.id, enrolled.secret), ip: "192.0.2.10" });
  if (!proved.ok) throw new Error(`proof refused: ${proved.error}`);
  return enrolled;
}
