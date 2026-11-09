import "server-only";
import { sql } from "../db";

/**
 * مؤشر للمالك: حسابات طلاب ظهرت من عناوين IP كثيرة مختلفة خلال نافذة قصيرة.
 * مؤشر للمراجعة لا دليل: شبكات الجوال تغيّر العنوان كثيرًا، والطالب يتنقل بين البيت والمدرسة.
 *
 * حد أدنى من البيانات: لا جدول جديد ولا عمود جديد. يقرأ access_logs و sessions كما هما، ولا يعيد
 * العناوين نفسها، بل عددها فقط. والطالب لا يرى شيئًا من هذا.
 */
export const IP_SIGNAL = { windowDays: 7, minDistinctIps: 8, limit: 100 } as const;

export type AccountIpSignal = { id: string; full_name: string; email: string; is_active: boolean; distinct_ips: number; active_sessions: number; last_seen: Date };

export async function listAccountIpSignals(): Promise<AccountIpSignal[]> {
  const rows = await sql<AccountIpSignal[]>`
    with seen as (
      select user_id, ip, created_at from access_logs
      where created_at > now() - make_interval(days => ${IP_SIGNAL.windowDays})
        and user_id is not null and action <> 'denied' and ip is not null and ip <> 'unknown'
      union all
      select user_id, ip, created_at from sessions
      where created_at > now() - make_interval(days => ${IP_SIGNAL.windowDays})
        and ip is not null and ip <> 'unknown'
    )
    select u.id, u.full_name, u.email, u.is_active,
      count(distinct s.ip)::int as distinct_ips,
      max(s.created_at) as last_seen,
      (select count(*)::int from sessions x where x.user_id = u.id and x.expires_at > now()) as active_sessions
    from seen s join users u on u.id = s.user_id and u.role = 'student'
    group by u.id
    having count(distinct s.ip) >= ${IP_SIGNAL.minDistinctIps}
    order by distinct_ips desc, last_seen desc
    limit ${IP_SIGNAL.limit}
  `;
  return [...rows];
}
