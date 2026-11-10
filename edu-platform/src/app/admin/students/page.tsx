import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { CalendarDays, FileLock2, MapPin, Phone, Receipt, UserX, Users } from "lucide-react";
import { listStudents } from "@/server/admin/records";
import { listOpenDataRequests } from "@/server/platform/data-requests";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { DataList, DataRow } from "@/components/admin/data-list";
import { DATA_REQUEST_LABELS } from "@/lib/data-requests";
import { FilterBar, FilterSearch, FilterSubmit, ResultCount, Toolbar } from "@/components/admin/filter-bar";
import { StatusPill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { STRETCHED_FOCUS, toneStyle } from "@/components/admin/tones";
import { EmptyState } from "@/components/ui/empty-state";
import { displayPhone } from "@/lib/phone";
import { ar, count, gradeVars, W } from "@/lib/design";
import { cn, formatDate } from "@/lib/utils";
import { BandChip, BandChips, PeopleBand } from "../_components/people/band";
import { StudentsArt } from "../_components/people/art";
import { Metric, PersonAvatar } from "../_components/people/bits";
import { gradeLevelFromName, personTone } from "../_components/people/helpers";

export const metadata = { title: "الطلاب" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const [students, dataRequests] = await Promise.all([listStudents(sp.q?.slice(0, 80)), listOpenDataRequests()]);
  const active = students.filter((s) => s.is_active).length;
  // الحساب المحذوف ليس موقوفًا: لا يوجد قرار يمكن التراجع عنه
  const suspended = students.filter((s) => !s.is_active && !s.anonymized_at).length;
  const buyers = students.filter((s) => s.paid_orders > 0).length;

  return (
    <div className="space-y-6">
      <PeopleBand
        tone="violet"
        art={<StudentsArt className="size-full motion-safe:animate-bob" />}
        footer={
          students.length ? (
            <BandChips>
              <BandChip tone="violet" icon={<Users aria-hidden />}>
                {count(students.length, W.student)} {sp.q ? "مطابقون" : "مسجلون"}
              </BandChip>
              {buyers ? (
                <BandChip tone="green" icon={<Receipt aria-hidden />}>
                  لديهم طلبات مدفوعة: {ar(buyers)}
                </BandChip>
              ) : null}
              {suspended ? (
                <BandChip tone="coral" icon={<UserX aria-hidden />}>
                  حسابات موقوفة: {ar(suspended)}
                </BandChip>
              ) : null}
            </BandChips>
          ) : null
        }
      >
        <AdminPageHeader
          className="mb-0"
          title="الطلاب"
          description="حسابات الطلاب ومشترياتهم وصلاحياتهم"
          actions={
            <Button asChild variant="outline" size="md">
              <Link prefetch={false} href="/admin/students/shared-access">
                <MapPin aria-hidden /> مؤشر تعدد العناوين
              </Link>
            </Button>
          }
        />
      </PeopleBand>

      {dataRequests.length ? (
        <Section id="data-requests" title="طلبات تنتظر قرارك" icon={<FileLock2 />} tone="coral" description="حذف حساب أو نسخة من البيانات. افتح الطالب لتنفذ الطلب أو ترفضه. الأقدم أولًا.">
          <DataList data-testid="open-data-requests">
            {dataRequests.map((r) => (
              <DataRow
                key={r.id}
                href={`/admin/students/${r.user_id}#data-requests`}
                title={`${DATA_REQUEST_LABELS[r.kind]}: ${r.full_name}`}
                sub={
                  <>
                    <bdi dir="ltr" className="break-all">
                      {r.email}
                    </bdi>
                    {" · "}
                    {formatDate(r.created_at)}
                  </>
                }
              />
            ))}
          </DataList>
        </Section>
      ) : null}

      <div>
        <FilterBar label="البحث في الطلاب" className="lg:grid-cols-[minmax(0,1fr)_12rem]">
          <FilterSearch name="q" defaultValue={sp.q} placeholder="ابحث بالاسم أو البريد أو الهاتف" label="بحث" wide={false} className="sm:col-span-1" />
          <FilterSubmit label="بحث" resetHref="/admin/students" active={Boolean(sp.q)} />
        </FilterBar>

        {students.length === 0 ? (
          <EmptyState art={sp.q ? "search" : "generic"} title={sp.q ? "لا توجد نتائج" : "لا يوجد طلاب بعد"} description={sp.q ? "جرّب كلمة بحث أخرى." : "ستظهر هنا حسابات الطلاب بعد التسجيل."} />
        ) : (
          <>
            <Toolbar start={<ResultCount>{count(students.length, W.student)}</ResultCount>} end={<p className="text-[0.82rem] text-muted">الأحدث تسجيلًا أولًا</p>} />
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3" aria-label="قائمة الطلاب">
              {students.map((s) => {
                const level = gradeLevelFromName(s.grade_name);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "lift relative flex min-w-0 flex-col overflow-hidden rounded-[1.6rem] border border-[rgb(23_32_38/0.06)] bg-surface shadow-card",
                      STRETCHED_FOCUS,
                    )}
                  >
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(120deg,var(--a),var(--m,var(--b)),var(--b))] opacity-90"
                      style={level ? gradeVars(level) : toneStyle(personTone(s.full_name))}
                      aria-hidden
                    >
                      <span className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.35)_1.2px,transparent_1.6px)] bg-[length:16px_16px]" />
                    </span>
                    <div className="relative flex items-end gap-3 px-4 pt-7">
                      <PersonAvatar name={s.full_name} size={64} ring="lg" />
                      <div className="min-w-0 flex-1 pb-0.5">
                        {s.anonymized_at ? (
                          <StatusPill tone="neutral" className="bg-white">
                            حُذفت بياناته
                          </StatusPill>
                        ) : s.is_active ? (
                          <StatusPill tone="success" className="bg-white">
                            نشط
                          </StatusPill>
                        ) : (
                          <StatusPill tone="danger" className="bg-white">
                            موقوف
                          </StatusPill>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
                      <Link prefetch={false} href={`/admin/students/${s.id}`} className="stretched line-clamp-1 font-display text-[1.12rem] font-black text-ink hover:text-brand-700">
                        {s.full_name}
                      </Link>
                      <p className="truncate text-end text-[0.8rem] leading-5 text-muted" dir="ltr">
                        {s.email}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {s.grade_name ? (
                          <span className="chip" style={gradeVars(level)}>
                            {s.grade_name}
                          </span>
                        ) : (
                          <span className="chip">لم يُحدَّد الصف</span>
                        )}
                        {s.phone ? (
                          <span className="chip chip-white">
                            <Phone aria-hidden />
                            <span className="num">{displayPhone(s.phone)}</span>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Metric tone="green" label="طلبات مدفوعة" value={ar(s.paid_orders)} />
                        <Metric tone="violet" label="صلاحيات نشطة" value={ar(s.active_entitlements)} />
                      </div>
                      <p className="mt-3 flex items-center gap-1.5 border-t border-dashed border-line pt-2.5 text-[0.78rem] text-muted">
                        <CalendarDays className="size-3.5" aria-hidden />
                        التسجيل: {formatDate(s.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
