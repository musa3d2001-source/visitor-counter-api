import Link from "next/link";
import { BookOpen, CircleAlert, CircleCheck, CircleHelp, CircleMinus, CreditCard, Hand, ListChecks, MapPin, Rocket, Scale, Server, Undo2, type LucideIcon } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { launchStatus } from "@/server/platform/launch";
import { AdminPageHeader, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { DataList, DataRow } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { StatusPill, type StatusTone } from "@/components/admin/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";
import type { AdminTone } from "@/components/admin/tones";
import { Panel } from "@/components/admin/panel";
import { Alert } from "@/components/ui/alert";
import { ar, count, type CountWord } from "@/lib/design";
import { LAUNCH_GROUPS, type LaunchGroup, type LaunchStep, type LaunchVerdict } from "@/lib/launch";
import { formatDateTime } from "@/lib/utils";
import { PageBand } from "../_components/overview/bands";
import { setLaunchCheckAction } from "./actions";

export const metadata = { title: "خطوات الإطلاق" };

const GROUP_LOOK: Record<LaunchGroup, { Icon: LucideIcon; tone: AdminTone }> = {
  hosting: { Icon: Server, tone: "sky" },
  legal: { Icon: Scale, tone: "violet" },
  content: { Icon: BookOpen, tone: "gold" },
  payments: { Icon: CreditCard, tone: "green" },
};

function stateLook(step: LaunchStep): { label: string; pill: StatusTone; tone: AdminTone; Icon: LucideIcon } {
  if (step.state === "done") return { label: "منجزة", pill: "success", tone: "green", Icon: CircleCheck };
  if (step.state === "na") return { label: "غير مطلوبة الآن", pill: "neutral", tone: "slate", Icon: CircleMinus };
  if (step.state === "unknown") return { label: "تعذر الفحص", pill: "warning", tone: "gold", Icon: CircleHelp };
  return step.blocking ? { label: "لازمة ولم تُنجز", pill: "danger", tone: "coral", Icon: CircleAlert } : { label: "تنبيه غير لازم", pill: "warning", tone: "gold", Icon: CircleAlert };
}

const ITEM: CountWord = { one: "بند", two: "بندان", plural: "بنود", acc: "بندًا" };

/** مقطع لاتيني (اسم متغير، رابط، رقم نسخة، تاريخ): كلمات متصلة بمسافات، ولا ينتهي بنقطة الجملة */
const LATIN_WORD = "[A-Za-z0-9_/](?:[A-Za-z0-9_./:=@?&#*-]*[A-Za-z0-9_/*])?";
const LATIN_RUN = new RegExp(`(${LATIN_WORD}(?: ${LATIN_WORD})*)`);

/** نص عربي فيه أسماء لاتينية: كل مقطع لاتيني معزول باتجاهه حتى لا تنقلب «/terms» أو «2026-11-draft-2» داخل الجملة */
function Bidi({ text }: { text: string }) {
  return text.split(LATIN_RUN).map((part, i) =>
    i % 2 === 1 ? (
      <bdi key={i} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}

/** أول الخطوات اللازمة المفتوحة، روابط تنزل إلى صفوفها */
const SHOW_OPEN = 6;

/**
 * مرحلتان، لأن الدفع الحقيقي يُفتح لكل الزوار لحظة تفعيله ولا بوابة تقصره على المالك:
 * ما قبل التفعيل شرط له، وخطوات اليوم الأول (التفعيل، ودفعتك الصغيرة، وإشعاراتها) لا تُنجز إلا بعده
 */
function verdictText(verdict: LaunchVerdict): { phase: "ready" | "first_day" | "before_live"; title: string; body: string } {
  if (verdict.ready) {
    return { phase: "ready", title: "المنصة جاهزة، والدفع الحقيقي يعمل", body: "كل خطوة لازمة منجزة على هذا النشر، ومنها دفعتك الحقيقية الصغيرة واستردادها. أبقِ هذه الصفحة مرجعك بعد أي تغيير في الإعدادات." };
  }
  if (verdict.readyToSwitchOn) {
    return {
      phase: "first_day",
      title: "جاهزة لتفعيل الدفع الحقيقي",
      body: "كل خطوة قبل التفعيل منجزة. التفعيل يفتح الدفع لكل الزوار في اللحظة نفسها، فأنجز خطوات اليوم الأول معًا: اضبط PAYMENTS_MODE=live، ثم اشترِ فورًا دفعتك الصغيرة، وتأكد من وصول إشعاري الدفع والاسترداد.",
    };
  }
  return {
    phase: "before_live",
    title: "لا تفعّل الدفع الحقيقي بعد",
    body: `أُنجزت ${ar(verdict.beforeLiveDone)} من ${ar(verdict.beforeLiveTotal)} خطوة لازمة قبل التفعيل. لا تضبط PAYMENTS_MODE=live قبل إنجازها كلها، وبعدها تأتي خطوات اليوم الأول.`,
  };
}

function Verdict({ verdict }: { verdict: LaunchVerdict }) {
  const pct = verdict.blockingTotal > 0 ? Math.round((verdict.blockingDone / verdict.blockingTotal) * 100) : 0;
  const text = verdictText(verdict);
  // ما يُعرض أولًا: ما يمنع التفعيل، أو خطوات اليوم الأول إن لم يبق غيرها
  const firstDay = new Set(verdict.firstDayOpen.map((step) => step.key));
  const shown = text.phase === "first_day" ? verdict.firstDayOpen : verdict.blockingOpen.filter((step) => !firstDay.has(step.key));
  const rest = shown.length - SHOW_OPEN;
  const good = text.phase !== "before_live";
  return (
    <Panel data-testid="launch-verdict" data-ready={verdict.ready ? "true" : "false"} data-phase={text.phase} className="space-y-4">
      <div className="flex items-start gap-3.5">
        <ToneIcon tone={good ? "green" : "coral"}>{good ? <Rocket /> : <Hand />}</ToneIcon>
        <div className="min-w-0">
          <h2 className="font-display text-[1.3rem] leading-snug font-black text-ink sm:text-[1.5rem]">{text.title}</h2>
          <p className="mt-1 text-[0.92rem] leading-7 text-ink-soft">
            <Bidi text={text.body} />
          </p>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label="الخطوات اللازمة المنجزة" aria-valuemin={0} aria-valuemax={verdict.blockingTotal} aria-valuenow={verdict.blockingDone}>
        <div className={verdict.ready ? "h-full rounded-full bg-linear-to-l from-[#34d399] to-success" : "h-full rounded-full bg-linear-to-l from-brand-400 to-brand-600"} style={{ width: `${pct}%` }} />
      </div>
      {shown.length > 0 ? (
        <div>
          <p className="font-display text-[0.9rem] font-extrabold text-ink">{text.phase === "first_day" ? "خطوات اليوم الأول بعد التفعيل:" : "ما بقي قبل التفعيل:"}</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {shown.slice(0, SHOW_OPEN).map((step) => (
              <li key={step.key}>
                <a
                  href={`#step-${step.key}`}
                  className="inline-flex min-h-11 items-center rounded-full bg-coral-50 px-3.5 font-display text-[0.85rem] font-extrabold text-coral-700 ring-1 ring-coral/25 ring-inset transition-shadow hover:ring-2 hover:ring-coral/50"
                >
                  {step.title}
                </a>
              </li>
            ))}
            {rest > 0 ? <li className="inline-flex min-h-11 items-center px-1 text-[0.85rem] font-bold text-muted">{`و${ar(rest)} غيرها في القائمة أدناه`}</li> : null}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function ManualControl({ step }: { step: LaunchStep }) {
  if (!step.manual || step.state === "na" || step.state === "unknown") return null;
  return step.state === "done" ? (
    <ConfirmButton
      action={setLaunchCheckAction}
      hidden={{ key: step.manual.key, done: "0" }}
      label="إعادة فتح"
      icon={<Undo2 aria-hidden />}
      variant="outline"
      title={`إعادة فتح: ${step.title}`}
      description="تعود الخطوة غير منجزة، ويعود الحكم العام إلى «ليست جاهزة» حتى تؤشر عليها من جديد. يُسجَّل ذلك باسمك في سجل العمليات."
      confirmLabel="إعادة الفتح"
    />
  ) : (
    <ConfirmButton
      action={setLaunchCheckAction}
      hidden={{ key: step.manual.key, done: "1" }}
      label="أنجزتها"
      icon={<CircleCheck aria-hidden />}
      variant="primary"
      title={`تأكيد إنجاز: ${step.title}`}
      description="النظام لا يستطيع التحقق من هذه الخطوة بنفسه، فتأشيرك هو الدليل الوحيد عليها. أشّر فقط بعد إنجازها فعلًا. يُسجَّل باسمك ووقته في سجل العمليات."
      confirmLabel="نعم، أنجزتها"
    />
  );
}

function StepFooter({ step }: { step: LaunchStep }) {
  const tick = step.manual?.tick;
  return (
    <div className="space-y-2 border-t border-[rgb(23_32_38/0.06)] pt-2.5 text-[0.84rem] leading-6 text-ink-soft">
      <p className="flex items-start gap-1.5">
        <MapPin className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 break-words">
          <span className="font-bold text-ink">أين: </span>
          {step.where.href ? (
            <Link href={step.where.href} className="font-bold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
              <Bidi text={step.where.label} />
            </Link>
          ) : (
            <Bidi text={step.where.label} />
          )}
        </span>
      </p>
      {step.facts.length > 0 ? (
        <ul className="space-y-0.5 ps-5.5" data-testid="launch-step-facts">
          {step.facts.map((fact) => (
            <li key={fact} className="list-disc break-words marker:text-muted">
              <Bidi text={fact} />
            </li>
          ))}
        </ul>
      ) : null}
      {step.checklist ? (
        <details open={step.state !== "done"} className="rounded-2xl bg-canvas px-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-display font-extrabold text-brand-700">
            <ListChecks className="size-4 shrink-0" aria-hidden />
            {`ما يجب أن تؤكده التجربة (${count(step.checklist.length, ITEM)})`}
          </summary>
          <ol className="list-[arabic-indic] space-y-1 ps-6 pb-3 marker:font-bold marker:text-muted">
            {step.checklist.map((item) => (
              <li key={item} className="break-words">
                <Bidi text={item} />
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {tick ? (
        <p className="text-[0.8rem] text-muted" data-testid="launch-step-tick">
          {`أشّر عليها ${tick.by ?? "حساب محذوف"} في `}
          <span className="whitespace-nowrap">{formatDateTime(tick.at)}</span>
        </p>
      ) : null}
    </div>
  );
}

function StepRow({ step }: { step: LaunchStep }) {
  const look = stateLook(step);
  return (
    <DataRow
      id={`step-${step.key}`}
      leading={
        <ToneIcon tone={look.tone} size="sm">
          <look.Icon />
        </ToneIcon>
      }
      title={
        <span data-testid="launch-step" data-key={step.key} data-state={step.state} data-blocking={step.blocking ? "true" : "false"}>
          {step.title}
        </span>
      }
      sub={
        <span className="text-ink-soft">
          <Bidi text={step.todo} />
        </span>
      }
      badges={
        <>
          <StatusPill tone={look.pill}>{look.label}</StatusPill>
          {step.firstDay ? <StatusPill tone="info">اليوم الأول بعد التفعيل</StatusPill> : null}
          <StatusPill tone={step.kind === "manual" ? "violet" : "info"}>{step.kind === "manual" ? "تؤشر عليها بنفسك" : "يكشفها النظام"}</StatusPill>
        </>
      }
      aside={<ManualControl step={step} />}
      footer={<StepFooter step={step} />}
    />
  );
}

/**
 * صفحة المالك: كل خطوة قبل الإطلاق، ما يكشفه النظام بنفسه وما يؤشر عليه المالك.
 * لا تعرض قيمة أي سر ولا طوله: وجوده فقط. والحكم لا يقول «جاهزة» وخطوة لازمة واحدة مفتوحة أو تعذر فحصها.
 */
export default async function LaunchPage() {
  await requireOwnerPage();
  const { steps, verdict } = await launchStatus();

  return (
    <div className="space-y-6" data-testid="launch-page">
      <PageBand tone="green" art="review">
        <AdminPageHeader
          title="خطوات الإطلاق"
          description="كل ما يجب أن يكون صحيحًا قبل أن تدفع أسرة دينارًا حقيقيًا. ما يكشفه النظام يتحدث وحده، والباقي تؤشر عليه أنت بعد إنجازه."
          className="mb-0"
        />
      </PageBand>

      <Verdict verdict={verdict} />

      <StatGrid cols={3}>
        <StatTile label="خطوات لازمة منجزة" tone={verdict.ready ? "green" : "coral"} icon={<Rocket />} value={<span className="num">{`${ar(verdict.blockingDone)} من ${ar(verdict.blockingTotal)}`}</span>} />
        <StatTile label="خطوات تؤشر عليها بنفسك" tone="violet" icon={<Hand />} value={<span className="num">{`${ar(verdict.manualDone)} من ${ar(verdict.manualTotal)}`}</span>} />
        <StatTile label="تنبيهات غير لازمة" tone={verdict.optionalOpen > 0 ? "gold" : "green"} icon={<CircleAlert />} value={<span className="num">{ar(verdict.optionalOpen)}</span>} />
      </StatGrid>

      {LAUNCH_GROUPS.map((group) => {
        const look = GROUP_LOOK[group.key];
        const groupSteps = steps.filter((step) => step.group === group.key);
        return (
          <Section key={group.key} id={`group-${group.key}`} title={group.title} description={group.description} icon={<look.Icon />} tone={look.tone}>
            <DataList data-testid={`launch-group-${group.key}`}>
              {groupSteps.map((step) => (
                <StepRow key={step.key} step={step} />
              ))}
            </DataList>
          </Section>
        );
      })}

      <Alert tone="info" title="حدود هذه الصفحة">
        <p>تفحص الصفحة النشر الذي تفتحها منه وقاعدة بياناته فقط، فافتحها من نطاق الإنتاج الحقيقي. ولا تعرض قيمة أي مفتاح أو سر، بل وجوده فقط.</p>
        <p>التأشير اليدوي تأكيدك أنت لما لا يستطيع النظام رؤيته، ويُسجَّل باسمك ووقته في «التقارير» ضمن سجل العمليات.</p>
      </Alert>
    </div>
  );
}
