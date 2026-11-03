import Link from "next/link";
import { GraduationCap, KeyRound, Plus, UserCog, Users } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { listTeachersAdmin, teacherSubjectsLabeled } from "@/server/admin/teachers";
import { storage } from "@/server/storage";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterBar, FilterSearch, FilterSubmit, ResultCount, Toolbar } from "@/components/admin/filter-bar";
import { StatusPill } from "@/components/admin/status-badge";
import { STRETCHED_FOCUS } from "@/components/admin/tones";
import { SubjectArt, SubjectIcon } from "@/components/art";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, subjectVars, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { BandChip, BandChips, PeopleBand } from "../_components/people/band";
import { TeachersArt } from "../_components/people/art";
import { Kwd, Metric } from "../_components/people/bits";
import { SALE_WORD, sharePct, subjectSlugOf } from "../_components/people/helpers";

export const metadata = { title: "المعلمون" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const teachers = await listTeachersAdmin(sp.q?.slice(0, 80));
  // المواد المسندة لكل معلم (قراءة فقط، للكبسولات الملوّنة)
  const subjectsByTeacher = await Promise.all(teachers.map((t) => teacherSubjectsLabeled(t.id)));
  const selfManaged = teachers.filter((t) => t.mode === "self_managed").length;
  const visible = teachers.filter((t) => t.is_published).length;

  return (
    <div className="space-y-6">
      <PeopleBand
        tone="pink"
        art={<TeachersArt className="size-full motion-safe:animate-bob" />}
        footer={
          teachers.length ? (
            <BandChips>
              <BandChip tone="pink" icon={<GraduationCap aria-hidden />}>
                {count(teachers.length, W.teacher)}
              </BandChip>
              <BandChip tone="teal" icon={<KeyRound aria-hidden />}>
                بحساب دخول: {ar(selfManaged)}
              </BandChip>
              <BandChip tone="slate" icon={<UserCog aria-hidden />}>
                يديرهم المالك: {ar(teachers.length - selfManaged)}
              </BandChip>
              <BandChip tone="green" icon={<Users aria-hidden />}>
                صفحات ظاهرة: {ar(visible)}
              </BandChip>
            </BandChips>
          ) : null
        }
      >
        <AdminPageHeader
          className="mb-0"
          title="المعلمون"
          description="ملفات المعلمين العامة، حساباتهم، صلاحيات الرفع، ونسب الأرباح"
          actions={
            <Button asChild variant="accent">
              <Link href="/admin/teachers/new">
                <Plus aria-hidden /> إضافة معلم
              </Link>
            </Button>
          }
        />
      </PeopleBand>

      <div>
        <FilterBar label="البحث في المعلمين" className="lg:grid-cols-[minmax(0,1fr)_12rem]">
          <FilterSearch name="q" defaultValue={sp.q} placeholder="ابحث بالاسم أو البريد" label="بحث" wide={false} className="sm:col-span-1" />
          <FilterSubmit label="بحث" resetHref="/admin/teachers" active={Boolean(sp.q)} />
        </FilterBar>

        {teachers.length === 0 ? (
          <EmptyState
            art={sp.q ? "search" : "generic"}
            title={sp.q ? "لا توجد نتائج" : "لا يوجد معلمون بعد"}
            description="أضف معلمًا: يمكنك إدارة محتواه بنفسك، أو تفعيل حساب له ليرفع شروحه بنفسه."
            action={
              <Button asChild>
                <Link href="/admin/teachers/new">إضافة معلم</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Toolbar start={<ResultCount>{count(teachers.length, W.teacher)}</ResultCount>} />
            <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="قائمة المعلمين">
              {teachers.map((t, i) => {
                const subs = subjectsByTeacher[i];
                const names = [...new Set(subs.map((s) => s.subject_name))];
                const grades = new Set(subs.map((s) => s.grade_name)).size;
                const lead = subjectSlugOf(names[0]);
                const photo = t.photo_key ? storage().publicUrl(t.photo_key) : null;
                return (
                  <li
                    key={t.id}
                    style={subjectVars(lead)}
                    className={cn("lift relative flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface shadow-card", STRETCHED_FOCUS)}
                  >
                    {/* الشريط الملوّن بلون المادة الأولى */}
                    <div className="relative h-24 overflow-hidden bg-linear-to-br from-[var(--a)] to-[var(--b)]" aria-hidden>
                      <span className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.32)_1.2px,transparent_1.6px)] bg-[length:16px_16px]" />
                      <span className="absolute -end-8 -top-10 size-32 rounded-full border-[14px] border-white/25" />
                      <div className="absolute end-3 top-2 size-24 text-[var(--d)] opacity-95">
                        <SubjectArt slug={lead} />
                      </div>
                    </div>
                    <div className="relative -mt-11 flex items-end justify-between gap-3 px-4">
                      <TeacherAvatar name={t.display_name} photoUrl={photo} size={84} subjectSlug={lead} ring="lg" decorative />
                      <span className={cn("chip mb-1 min-h-8 shadow-xs", t.mode === "self_managed" ? "chip-mint" : "chip-white")}>
                        {t.mode === "self_managed" ? <KeyRound aria-hidden /> : <UserCog aria-hidden />}
                        {t.mode === "self_managed" ? "حساب معلم" : "يديره المالك"}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
                      <Link href={`/admin/teachers/${t.id}`} className="stretched line-clamp-1 font-display text-[1.2rem] font-black text-ink hover:text-brand-700">
                        {t.display_name}
                      </Link>
                      {t.headline ? <p className="line-clamp-1 text-[0.85rem] text-muted">{t.headline}</p> : null}
                      {t.mode === "self_managed" && t.account_email ? (
                        <p className="truncate text-end text-[0.78rem] text-muted" dir="ltr">
                          {t.account_email}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {names.length ? (
                          <>
                            {names.slice(0, 4).map((n) => (
                              <span key={n} className="chip" style={subjectVars(subjectSlugOf(n))}>
                                <SubjectIcon slug={subjectSlugOf(n) ?? undefined} name={n} />
                                {n}
                              </span>
                            ))}
                            {names.length > 4 ? <span className="chip chip-white">+{ar(names.length - 4)}</span> : null}
                            {grades ? <span className="chip chip-white">{count(grades, W.grade)}</span> : null}
                          </>
                        ) : (
                          <span className="chip chip-white">لم تُحدَّد مواد</span>
                        )}
                      </div>

                      <div className="mt-3.5 grid grid-cols-3 gap-2">
                        <Metric
                          tone="sky"
                          label="المحتوى"
                          value={
                            <>
                              {ar(t.published_products)} <span className="text-[0.75rem] font-bold text-muted">منشور من {ar(t.products)}</span>
                            </>
                          }
                        />
                        <Metric
                          tone="green"
                          label="المبيعات"
                          value={<span className="text-[0.92rem]">{count(t.paid_items, SALE_WORD)}</span>}
                        />
                        <Metric
                          tone="gold"
                          label="الرصيد المستحق"
                          value={t.revenue_share_bps === null ? <span className="text-[0.85rem] text-muted">غير مفعّل</span> : <Kwd fils={t.balance} />}
                        />
                      </div>
                      <p className="mt-2 text-[0.78rem] leading-6 text-muted">
                        قيمة المبيعات <Kwd fils={Number(t.paid_gross)} className="font-bold text-ink-soft" />
                        {t.revenue_share_bps !== null ? (
                          <>
                            {" "}
                            · نسبة {sharePct(t.revenue_share_bps)}
                          </>
                        ) : null}
                      </p>

                      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-dashed border-line pt-3">
                        {t.is_published ? <StatusPill tone="success">صفحة ظاهرة</StatusPill> : <StatusPill tone="neutral">صفحة مخفية</StatusPill>}
                        {!t.can_upload ? <StatusPill tone="warning">الرفع موقوف</StatusPill> : null}
                        {t.mode === "self_managed" && t.account_active === false ? <StatusPill tone="danger">الحساب معطّل</StatusPill> : null}
                      </div>
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
