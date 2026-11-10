import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, CircleCheck, Clock, FileLock2, GraduationCap, KeyRound, Library, LogOut, Mail, Receipt, UserRound, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { listUserOrders } from "@/server/commerce/orders";
import { emailVerificationRequired } from "@/server/auth/email-verification";
import { listGrades } from "@/server/catalog/public-data";
import { myDataRequests } from "@/server/platform/data-requests";
import { logoutAction } from "../(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatPill } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Sparkle } from "@/components/art";
import { ORDER_STATUS_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar, count, gradeClass, initial, W } from "@/lib/design";
import { Eyebrow } from "@/components/ui/section-head";
import { cn, formatDate } from "@/lib/utils";
import { EmptyStart, pillParts } from "../cart/_components/commerce";
import { DataRequests, ProfileForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "حسابي", robots: { index: false } };

const PAYMENT_MESSAGES: Record<string, string> = {
  checked: "وصلتنا عودتك من صفحة الدفع. إذا أتممت الدفع فستجد حالة طلبك في «مشترياتي وفواتيري» أدناه.",
  invalid: "لم نتعرف على رابط العودة من الدفع. إذا تم الخصم من حسابك تواصل معنا مع رقم الطلب.",
  error: "حدث خطأ أثناء التحقق من الدفع. افتح الطلب واضغط «تحديث الحالة» بعد قليل.",
  rate: "وصلتنا طلبات كثيرة من شبكتك. افتح طلبك واضغط «تحديث الحالة» لنتحقق من دفعتك.",
};

const STATUS_LOOK = {
  paid: { icon: <CircleCheck />, tile: "from-[#34d9a0] to-[#0b8a66] text-white" },
  pending: { icon: <Clock />, tile: "from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]" },
  failed: { icon: <XCircle />, tile: "from-[#ffa07a] to-[#e8483f] text-white" },
  cancelled: { icon: <Receipt />, tile: "from-[#b9c2c8] to-[#6b7780] text-white" },
  refunded: { icon: <Receipt />, tile: "from-[#b28cff] to-[#6a3fe0] text-white" },
} as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const [orders, grades, mustVerify, dataRequests] = await Promise.all([listUserOrders(user.id), listGrades(), emailVerificationRequired(user.id), user.role === "student" ? myDataRequests(user.id) : Promise.resolve([])]);
  const myGrade = grades.find((g) => g.id === user.gradeId) ?? null;

  return (
    <>
      <section className="page-hero" aria-labelledby="account-title">
        <Sparkle className="animate-twinkle absolute end-[9%] top-10 size-6" />
        <Sparkle className="animate-twinkle absolute start-[2%] bottom-4 size-3.5 [animation-delay:1.3s]" color="#17A398" />
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="min-w-0">
            <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "حسابي" }]} className="mb-6" />
            <Eyebrow icon={<UserRound />} tone="violet" className="mb-3">
              أهلًا {user.fullName.split(" ")[0]}
            </Eyebrow>
            <h1 id="account-title" className="h-page">
              حسابي
            </h1>
            <p className="lead mt-3 max-w-xl">طلباتك وفواتيرك وبياناتك في مكان واحد.</p>
            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <Button asChild size="lg">
                <Link href="/library">
                  <Library aria-hidden /> مكتبتي
                </Link>
              </Button>
              <form action={logoutAction}>
                <Button variant="outline" size="lg" type="submit">
                  <LogOut aria-hidden /> تسجيل الخروج
                </Button>
              </form>
            </div>
          </div>
          <div className={cn("tile-3d overflow-hidden p-2", myGrade ? gradeClass(myGrade.level) : "tone-brand")}>
            <div className={cn("poster relative h-28 rounded-[1.4rem]", myGrade && "poster-grade")} aria-hidden>
              <Sparkle className="absolute start-[46%] top-5 size-6" />
              <Sparkle className="absolute start-[34%] top-14 size-3.5" color="#ffffff" />
              {myGrade ? <span className="absolute end-6 top-2 font-display text-[4.5rem] leading-none font-black text-white/85 [text-shadow:0_4px_0_var(--d)]">{ar(myGrade.level)}</span> : null}
            </div>
            <div className="px-4 pb-5">
              <span
                className={cn(
                  "relative -mt-12 grid size-24 place-items-center rounded-[1.8rem] border-4 border-white font-display text-[2.6rem] font-black text-white shadow-[0_8px_0_var(--d),0_22px_36px_-18px_rgb(6_63_60/0.55)]",
                  myGrade ? "poster-grade" : "bg-linear-to-br from-brand-400 to-brand-600",
                )}
                aria-hidden
              >
                {initial(user.fullName)}
              </span>
              <p className="mt-3 font-display text-[1.35rem] leading-snug font-black text-ink">{user.fullName}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="chip chip-white min-h-8 max-w-full px-3 text-[0.85rem]">
                  <Mail aria-hidden />
                  <span className="truncate" dir="auto">
                    {user.email}
                  </span>
                </span>
                {myGrade ? (
                  <span className="chip min-h-8 px-3 text-[0.85rem]">
                    <GraduationCap aria-hidden />
                    {myGrade.name}
                  </span>
                ) : null}
                <span className="chip chip-mint min-h-8 px-3 text-[0.85rem]">
                  <Receipt aria-hidden />
                  {orders.length ? count(orders.length, W.order) : "لا طلبات بعد"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        {sp.payment && PAYMENT_MESSAGES[sp.payment] ? (
          <Alert tone="warning" className="mb-6">
            {PAYMENT_MESSAGES[sp.payment]}
          </Alert>
        ) : null}

        {mustVerify ? (
          <Alert tone="warning" title="بريدك غير مؤكد" className="mb-6">
            <p>
              تأكيده مطلوب قبل أول عملية دفع. <Link href="/verify-email?next=/account">أكّد بريدك</Link>
            </p>
          </Alert>
        ) : null}

        {orders.length === 0 ? (
          <EmptyStart
            art="receipt"
            title="لا توجد طلبات بعد"
            description="عند أي شراء ستظهر فاتورته هنا."
            grades={[]}
            actions={
              <Button asChild size="lg">
                <Link href="/#grades">اختر صفك</Link>
              </Button>
            }
          />
        ) : (
          <section className="panel p-5 sm:p-8" aria-labelledby="orders-title">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="icon-tile tone-social size-12 rounded-[0.95rem] [&_svg]:size-6" aria-hidden>
                  <Receipt />
                </span>
                <h2 id="orders-title" className="font-display text-[1.5rem] font-black sm:text-[1.75rem]">
                  مشترياتي وفواتيري
                </h2>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <StatPill icon={<Receipt />} tone="gold" {...pillParts(orders.length, W.order)} />
              </div>
            </div>
            <ul className="grid gap-3">
              {orders.map((o) => {
                const look = STATUS_LOOK[o.status as keyof typeof STATUS_LOOK] ?? STATUS_LOOK.cancelled;
                return (
                  <li key={o.id}>
                    <Link
                      href={`/orders/${o.id}`}
                      className="group flex items-center gap-3.5 rounded-[1.4rem] border-2 border-line bg-field p-3 transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white sm:gap-4 sm:p-4 motion-reduce:hover:translate-y-0"
                    >
                      <span className={cn("grid size-12 shrink-0 place-items-center rounded-[0.95rem] bg-linear-to-br shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)] [&_svg]:size-6", look.tile)} aria-hidden>
                        {look.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="num font-display text-[1.05rem] font-black text-ink">{o.number}</span>
                          <Badge tone={o.status === "paid" ? "success" : o.status === "failed" ? "danger" : o.status === "pending" ? "warning" : "neutral"}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                          {o.is_test ? <Badge tone="warning">تجريبي</Badge> : null}
                        </span>
                        <span className="mt-1 block text-[0.88rem] text-muted">
                          {formatDate(o.created_at)} · {count(o.item_count, W.product)}
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span className="block font-display text-[1.15rem] font-black text-brand-800">
                          <span className="num">{filsToKwdString(o.total_fils)}</span> <span className="text-[0.7em] text-muted">د.ك</span>
                        </span>
                      </span>
                      <ChevronLeft className="hidden size-5 shrink-0 text-muted transition-transform group-hover:-translate-x-1 sm:block" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="panel p-5 sm:p-8" aria-labelledby="profile-title">
            <div className="mb-6 flex items-center gap-3.5">
              <span className="icon-tile tone-brand size-12 rounded-[0.95rem] [&_svg]:size-6" aria-hidden>
                <UserRound />
              </span>
              <h2 id="profile-title" className="font-display text-[1.4rem] font-black">
                بياناتي
              </h2>
            </div>
            <ProfileForm user={{ fullName: user.fullName, phone: user.phone, gradeId: user.gradeId }} grades={grades.map((g) => ({ id: g.id, name: g.name }))} />
          </section>
          <section className="panel p-5 sm:p-8" aria-labelledby="password-title">
            <div className="mb-6 flex items-center gap-3.5">
              <span className="icon-tile tone-default size-12 rounded-[0.95rem] [&_svg]:size-6" aria-hidden>
                <KeyRound />
              </span>
              <h2 id="password-title" className="font-display text-[1.4rem] font-black">
                تغيير كلمة المرور
              </h2>
            </div>
            <PasswordForm staff={user.role !== "student"} />
          </section>
          {user.role === "student" ? (
            <section className="panel p-5 sm:p-8" aria-labelledby="data-title" id="my-data">
              <div className="mb-6 flex items-center gap-3.5">
                <span className="icon-tile tone-default size-12 rounded-[0.95rem] [&_svg]:size-6" aria-hidden>
                  <FileLock2 />
                </span>
                <h2 id="data-title" className="font-display text-[1.4rem] font-black">
                  بياناتي وحذف حسابي
                </h2>
              </div>
              <DataRequests requests={dataRequests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, createdLabel: formatDate(r.created_at), closedLabel: r.closed_at ? formatDate(r.closed_at) : null, note: r.close_note }))} />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
