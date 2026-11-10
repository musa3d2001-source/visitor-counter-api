import Link from "next/link";
import { Info, MapPin, Users } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { IP_SIGNAL, listAccountIpSignals } from "@/server/admin/access-signals";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, countParts, W, type CountWord } from "@/lib/design";
import { formatDateTime } from "@/lib/utils";
import { BandChip, BandChips, PeopleBand } from "../../_components/people/band";
import { StudentsArt } from "../../_components/people/art";

export const metadata = { title: "مؤشر تعدد العناوين" };

const ADDRESS: CountWord = { one: "عنوان", two: "عنوانان", plural: "عناوين", acc: "عنوانًا" };

export default async function SharedAccessSignalsPage() {
  await requireOwnerPage();
  const rows = await listAccountIpSignals();
  return (
    <div className="space-y-6">
      <PeopleBand
        tone="violet"
        art={<StudentsArt className="size-full motion-safe:animate-bob" />}
        footer={
          <BandChips>
            <BandChip tone="violet" icon={<Users aria-hidden />}>
              حسابات ظهرت: {ar(rows.length)}
            </BandChip>
            <BandChip tone="sky" icon={<MapPin aria-hidden />}>
              {count(IP_SIGNAL.minDistinctIps, ADDRESS)} فأكثر خلال {count(IP_SIGNAL.windowDays, W.day)}
            </BandChip>
          </BandChips>
        }
      >
        <AdminPageHeader
          className="mb-0"
          title="مؤشر تعدد العناوين"
          description="حسابات طلاب ظهرت من عناوين IP كثيرة مختلفة في الأيام الأخيرة"
          crumbs={[{ label: "الطلاب", href: "/admin/students" }, { label: "مؤشر تعدد العناوين" }]}
        />
      </PeopleBand>

      <Alert tone="info" title="هذا مؤشر للمراجعة، وليس دليلًا على مشاركة الحساب">
        عنوان IP يتغير كثيرًا على شبكات الجوال، ويختلف بين البيت والمدرسة وعند السفر، فقد يظهر هنا طالب لم يشارك حسابه مع أحد. لا توقف حسابًا اعتمادًا على هذا الرقم وحده، وتحدث مع الطالب أو ولي أمره أولًا. لا يرى الطلاب هذه الصفحة ولا يصلهم منها شيء، وتُعرض الأعداد فقط دون العناوين نفسها.
      </Alert>

      {rows.length === 0 ? (
        <EmptyState art="generic" title="لا توجد حسابات تستدعي المراجعة" description={`لم يظهر أي حساب طالب من ${count(IP_SIGNAL.minDistinctIps, ADDRESS)} أو أكثر خلال ${count(IP_SIGNAL.windowDays, W.day)}.`} />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="حسابات بعناوين كثيرة" data-testid="ip-signals">
          {rows.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs sm:p-4" data-testid="ip-signal-row">
              <ToneIcon tone="violet" size="md" className="max-sm:size-11">
                <MapPin />
              </ToneIcon>
              <div className="min-w-[min(100%,13rem)] flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-display font-extrabold text-ink">
                  <Link prefetch={false} href={`/admin/students/${r.id}`} className="text-ink hover:text-brand-700 hover:underline">
                    {r.full_name}
                  </Link>
                  {r.is_active ? null : <StatusPill tone="danger">موقوف</StatusPill>}
                </p>
                <p className="truncate text-end text-[0.82rem] leading-6 text-muted" dir="ltr">
                  {r.email}
                </p>
                <p className="text-[0.84rem] leading-6 text-ink-soft">
                  آخر ظهور <span className="whitespace-nowrap">{formatDateTime(r.last_seen)}</span> · جلسات نشطة الآن: {ar(r.active_sessions)}
                </p>
              </div>
              <p className="flex items-baseline gap-1.5 font-display text-ink" data-testid="ip-signal-count">
                <span className="text-[1.6rem] leading-none font-black">{countParts(r.distinct_ips, ADDRESS).num}</span>
                <span className="text-[0.85rem] font-bold text-muted">{countParts(r.distinct_ips, ADDRESS).label}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-[0.84rem] leading-6 text-muted">
        <Info className="mt-1 size-4 shrink-0" aria-hidden />
        النافذة {count(IP_SIGNAL.windowDays, W.day)}. المصدر سجلات الوصول للمحتوى والجلسات الحالية.
      </p>
    </div>
  );
}
