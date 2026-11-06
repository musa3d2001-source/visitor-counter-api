"use client";

/**
 * مختبر فقط (ليس كود إنتاج): الاتجاه الفني أ «فانوس الساحل» للعبة الشهب.
 * أربع شاشات تُختار بـ ?screen=: مشهد المستوى، لوح السؤال، النتائج، خريطة العالم.
 * three.js يُحمَّل كسولًا من ./scene داخل useEffect، وكل النصوص في DOM فوق الـ canvas.
 */
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  Lightbulb,
  Lock,
  Map as MapIcon,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "../_game-kit/icons";
import { ar, count } from "../_game-kit/fmt";
import {
  HeavyIcon,
  LanternIcon,
  MeteorIcon,
  ObservatoryMark,
  PebbleIcon,
  RateStar,
  SlotQuestion,
  Spark,
  SunriseHero,
  CoastSkyline,
  FreedConstellation,
} from "./art";
import { LEVEL, MASTERY_LABEL, MATERIALS, QUESTION, RESULTS, SCREENS, WORLD, type Mastery, type MapUnit, type Screen } from "./data";
import type { SceneHandle } from "./scene";
import s from "./game-a.module.css";

const W_LANTERN = { one: "قنديل", two: "قنديلان", plural: "قناديل", acc: "قنديلًا" };
const W_SLOT = { one: "خانة", two: "خانتان", plural: "خانات", acc: "خانة", oneSuffix: "واحدة" };

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setRm(mq.matches);
    const on = () => setRm(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return rm;
}

/* ───────────────────────── المشهد ثلاثي الأبعاد ───────────────────────── */

function SceneCanvas({ angle, power, dawn, variant }: { angle: number; power: number; dawn: number; variant: "play" | "dim" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const aim = useRef({ angle, power });
  aim.current = { angle, power };

  useEffect(() => {
    let alive = true;
    const canvas = ref.current;
    if (!canvas) return;
    import("./scene")
      .then((m) => m.createScene(canvas, { dawn, reducedMotion: reduced, variant, ...aim.current }))
      .then((h) => {
        if (!alive) return h.destroy();
        handle.current = h;
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [dawn, reduced, variant]);

  useEffect(() => {
    handle.current?.setAim(angle, power);
  }, [angle, power]);

  return (
    <>
      <canvas ref={ref} className={s.canvas} aria-hidden />
      {failed && (
        <p className={s.noGl} role="status">
          هذا المتصفح لا يرسم المشهد ثلاثي الأبعاد. في اللعبة ننتقل تلقائيًا إلى وضع الأسئلة فقط.
        </p>
      )}
    </>
  );
}

/* ───────────────────────── واجهة اللعب ───────────────────────── */

function TopHud({ muted, onMute, onPause }: { muted: boolean; onMute(): void; onPause(): void }) {
  const progress = [
    { label: "إتمام", frac: LEVEL.freed / LEVEL.lanterns, aria: `نجمة الإتمام: حرّرت ${count(LEVEL.freed, W_LANTERN)} من ${ar(LEVEL.lanterns)}` },
    { label: "معرفة", frac: 2 / 5, aria: "نجمة المعرفة: إجابتان صحيحتان من ٥ أسئلة مطلوبة" },
    { label: "مهارة", frac: 0.5, aria: "نجمة المهارة: استخدمت طلقتين من ٤ مسموحة، وما زالت ممكنة" },
  ];
  return (
    <header className={s.topHud}>
      <div className={s.hudBtns}>
        <button type="button" className={s.roundBtn} onClick={onPause} aria-label="إيقاف مؤقت">
          <Pause aria-hidden />
        </button>
        <button type="button" className={s.roundBtn} onClick={onMute} aria-pressed={muted} aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}>
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
        </button>
      </div>
      <div className={s.plaque}>
        <p className={s.plaqueEyebrow}>
          {LEVEL.subject} · الوحدة {ar(LEVEL.unit)} · الدرس {ar(LEVEL.lesson)}
        </p>
        <h1 className={s.plaqueTitle}>{LEVEL.title}</h1>
        <p className={s.lanterns} aria-label={`حرّرت ${count(LEVEL.freed, W_LANTERN)} من ${ar(LEVEL.lanterns)}`}>
          {Array.from({ length: LEVEL.lanterns }, (_, i) => (
            <LanternIcon key={i} lit={i < LEVEL.freed} size={22} />
          ))}
          <span aria-hidden>
            {ar(LEVEL.freed)} من {ar(LEVEL.lanterns)}
          </span>
        </p>
      </div>
      <ul className={s.starsHud} aria-label="تقدّم النجوم في هذه الجولة">
        {progress.map((p) => (
          <li key={p.label} aria-label={p.aria}>
            <RateStar filled={false} frac={p.frac} size={32} />
            <span aria-hidden>{p.label}</span>
          </li>
        ))}
      </ul>
    </header>
  );
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={s.stepper}>
      <label htmlFor={id} className={s.stepLabel}>
        {label} <b>{ar(value)}{unit}</b>
      </label>
      <div className={s.stepRow}>
        <button type="button" className={s.stepBtn} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`إنقاص ${label}`}>
          <Minus aria-hidden />
        </button>
        <input
          id={id}
          type="range"
          role="slider"
          className={s.range}
          min={min}
          max={max}
          step={1}
          value={value}
          aria-valuetext={`${label} ${ar(value)}${unit}`}
          style={{ "--p": `${pct}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" className={s.stepBtn} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`زيادة ${label}`}>
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BottomHud({ angle, power, setAngle, setPower, onFire }: { angle: number; power: number; setAngle(v: number): void; setPower(v: number): void; onFire(): void }) {
  const slots = [
    { kind: "meteor", state: "used", label: "الخانة ١: شهاب، أُطلق" },
    { kind: "pebble", state: "used", label: "الخانة ٢: حصاة، أُطلقت" },
    { kind: "meteor", state: "flying", label: "الخانة ٣: شهاب في الطيران الآن" },
    { kind: "question", state: "next", label: "الخانة ٤: سؤال ثم طلقة" },
    { kind: "question", state: "next", label: "الخانة ٥: سؤال ثم طلقة" },
  ] as const;
  const left = slots.filter((x) => x.state === "next").length;
  return (
    <section className={s.bottomHud} aria-label="التصويب والخانات">
      <div className={s.slotsBox}>
        <p className={s.boxTitle}>
          الخانات <span>بقيت {count(left, W_SLOT)}</span>
        </p>
        <ol className={s.slots}>
          {slots.map((x, i) => (
            <li key={i} className={s.slot} data-state={x.state} aria-label={x.label}>
              {x.kind === "meteor" ? <MeteorIcon dim={x.state === "used"} /> : x.kind === "pebble" ? <PebbleIcon dim /> : <SlotQuestion />}
            </li>
          ))}
        </ol>
      </div>
      <button type="button" className={s.special} aria-label="نيزك ثقيل، واحد مخزّن. المسه أثناء الطيران ليكسر الحجر البحري">
        <HeavyIcon size={34} />
        <span className={s.specialText}>
          <b>نيزك ثقيل</b>
          <small>المسه أثناء الطيران</small>
        </span>
        <span className={s.specialCount} aria-hidden>
          ×{ar(1)}
        </span>
      </button>
      <div className={s.aim}>
        <Stepper label="الزاوية" unit="°" value={angle} min={10} max={80} onChange={setAngle} />
        <Stepper label="القوة" unit="" value={power} min={20} max={100} onChange={setPower} />
      </div>
      <button type="button" className={`btn btn-3d btn-accent btn-lg ${s.fire}`} onClick={onFire}>
        <Sparkles aria-hidden /> أطلق
        <kbd className={s.kbd}>مسافة</kbd>
      </button>
    </section>
  );
}

function SceneScreen() {
  const [angle, setAngle] = useState(40);
  const [power, setPower] = useState(70);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [msg, setMsg] = useState("");
  const fire = useCallback(() => setMsg(`انطلق الشهاب بزاوية ${ar(angle)}° وقوة ${ar(power)} (عرض في المختبر).`), [angle, power]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "BUTTON") return;
      if (e.key === " ") {
        e.preventDefault();
        fire();
      } else if (e.key === "ArrowUp") setAngle((a) => Math.min(80, a + 1));
      else if (e.key === "ArrowDown") setAngle((a) => Math.max(10, a - 1));
      else if (e.key === "ArrowLeft") setPower((p) => Math.min(100, p + 1));
      else if (e.key === "ArrowRight") setPower((p) => Math.max(20, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fire]);
  return (
    <div className={s.stage}>
      <SceneCanvas angle={angle} power={power} dawn={0.34} variant="play" />
      <TopHud muted={muted} onMute={() => setMuted((m) => !m)} onPause={() => setPaused(true)} />
      <BottomHud angle={angle} power={power} setAngle={setAngle} setPower={setPower} onFire={fire} />
      <p className={s.sr} aria-live="polite">
        {msg}
      </p>
      {paused && (
        <div className={s.pause} role="dialog" aria-modal="true" aria-labelledby="pause-t">
          <div className={s.pauseCard}>
            <h2 id="pause-t">استراحة قصيرة</h2>
            <p>المشهد ينتظرك كما تركته، بلا عدّاد ولا ضغط.</p>
            <button type="button" className="btn btn-3d btn-accent btn-lg" onClick={() => setPaused(false)} autoFocus>
              <Play aria-hidden /> تابِع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── لوح السؤال ───────────────────────── */

function QuestionScreen({ preset }: { preset: "wrong" | "ask" }) {
  const [picked, setPicked] = useState<string | null>(preset === "wrong" ? QUESTION.pickedId : null);
  const [ready, setReady] = useState(preset === "wrong");
  const titleId = useId();
  const answered = picked != null;
  const correct = picked === QUESTION.correctId;

  const pick = useCallback(
    (id: string) => {
      if (answered) return;
      setPicked(id);
      setReady(false);
      window.setTimeout(() => setReady(true), 1500);
    },
    [answered],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0 && QUESTION.choices[i]) pick(QUESTION.choices[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick]);

  return (
    <div className={s.stage}>
      <SceneCanvas angle={40} power={70} dawn={0.34} variant="dim" />
      <div className={s.dim} aria-hidden />
      <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={s.sheetTab}>
          <LanternIcon size={26} />
          <span>
            سؤال الخانة {ar(QUESTION.slot)} من {ar(LEVEL.slots)}
          </span>
          <span className={s.sheetLesson}>
            {LEVEL.subject} · الدرس {ar(LEVEL.lesson)}: {LEVEL.title}
          </span>
        </div>
        <h2 id={titleId} className={s.stem}>
          {QUESTION.stem}
        </h2>
        <ul className={s.choices}>
          {QUESTION.choices.map((c, i) => {
            const state = !answered ? "idle" : c.id === QUESTION.correctId ? "correct" : c.id === picked ? "wrong" : "muted";
            return (
              <li key={c.id}>
                <button type="button" className={s.choice} data-state={state} data-i={i} onClick={() => pick(c.id)} aria-disabled={answered} aria-keyshortcuts={String(i + 1)}>
                  <span className={s.letter} aria-hidden>
                    {c.letter}
                  </span>
                  <span className={s.choiceText}>{c.text}</span>
                  {state === "correct" && (
                    <span className={s.tag} data-kind="ok">
                      <Check aria-hidden /> الإجابة الصحيحة
                    </span>
                  )}
                  {state === "wrong" && (
                    <span className={s.tag} data-kind="no">
                      <X aria-hidden /> اختيارك
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div aria-live="polite">
          {answered && !correct && (
            <div className={s.feedback}>
              <p className={s.fbTitle}>
                <Spark size={20} color="#e2a200" /> قريبة جدًا! الآن عرفتها وستبقى معك
              </p>
              <p className={s.fbReward}>
                <PebbleIcon size={30} /> تنطلق هذه الخانة بحصاة خفيفة، والشهاب ينتظرك مع الإجابة الصحيحة القادمة.
              </p>
              <div className={s.explain}>
                <p className={s.explainHead}>
                  <Lightbulb aria-hidden /> لماذا؟
                </p>
                <p>{QUESTION.explanation}</p>
              </div>
              <p className={s.ref}>
                <BookOpen aria-hidden />
                <span>
                  <b>المرجع:</b> {QUESTION.reference}
                </span>
              </p>
            </div>
          )}
          {answered && correct && (
            <div className={s.feedback}>
              <p className={s.fbTitle}>
                <Spark size={20} color="#e2a200" /> أحسنت! شهاب جديد في المِرقاب
              </p>
              <p className={s.ref}>
                <BookOpen aria-hidden />
                <span>
                  <b>المرجع:</b> {QUESTION.reference}
                </span>
              </p>
            </div>
          )}
        </div>
        {answered ? (
          <div className={s.sheetFoot}>
            <button type="button" className={`btn btn-3d btn-accent btn-lg ${s.gotIt}`} disabled={!ready}>
              <Check aria-hidden /> فهمت
            </button>
          </div>
        ) : (
          <p className={s.hint}>اختر إجابة بالنقر أو بالأرقام ١ إلى ٤. لا عدّاد للوقت، خذ راحتك.</p>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── النتائج ───────────────────────── */

function ResultsScreen() {
  const earned = RESULTS.stars.filter((x) => x.earned).length;
  return (
    <div className={s.page}>
      <section className={s.resHero}>
        <SunriseHero className={s.resSky} />
        <CoastSkyline className={s.resSkyline} color="#2a1f55" />
        <FreedConstellation className={s.resConst} />
        <div className={s.resHead}>
          <p className={s.resEyebrow}>
            {LEVEL.subject} · الوحدة {ar(LEVEL.unit)} · الدرس {ar(LEVEL.lesson)}: {LEVEL.title}
          </p>
          <h1 className={s.resTitle}>أشرقت الشمس على الساحل!</h1>
          <p className={s.resSub}>
            حرّرت القناديل الثلاثة وصعدت نجومًا في كوكبتك. نلت {earned === 2 ? "نجمتين" : ar(earned)} من ٣ في هذه الجولة.
          </p>
        </div>
      </section>

      <div className={s.resBody}>
        <ul className={s.starCards} aria-label="نجوم الجولة">
          {RESULTS.stars.map((x) => (
            <li key={x.key} className={s.starCard} data-earned={x.earned}>
              <RateStar filled={x.earned} size={72} />
              <h2>{x.title}</h2>
              <p className={s.starState}>{x.earned ? "حصلت عليها" : "لم تكتمل بعد"}</p>
              <p className={s.starWhy}>{x.text}</p>
            </li>
          ))}
        </ul>

        <ul className={s.statRow}>
          <li>
            <b>{ar(RESULTS.shots)}</b> طلقات، والحد {ar(RESULTS.par)}
          </li>
          <li>
            <b>
              {ar(RESULTS.correct)} من {ar(RESULTS.answered)}
            </b>{" "}
            إجابات صحيحة
          </li>
          <li>
            <b>{RESULTS.points}</b> نقطة للمتعة
          </li>
        </ul>

        <section className={s.mistakes} aria-labelledby="mk-t">
          <h2 id="mk-t">
            <Lightbulb aria-hidden /> راجع ما فاتك
          </h2>
          <ol>
            {RESULTS.mistakes.map((m) => (
              <li key={m.stem} className={s.mistake}>
                <p className={s.mkStem}>{m.stem}</p>
                <p className={s.mkRow} data-kind="no">
                  <X aria-hidden /> اخترت: {m.picked}
                </p>
                <p className={s.mkRow} data-kind="ok">
                  <Check aria-hidden /> الصحيح: {m.correct}
                </p>
                <p className={s.ref}>
                  <BookOpen aria-hidden />
                  <span>{m.reference}</span>
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className={s.resActions}>
          <Link href="?screen=scene" className={`btn btn-3d btn-accent btn-xl ${s.next}`}>
            المستوى التالي <ChevronLeft aria-hidden />
          </Link>
          <Link href="?screen=scene" className={`btn btn-xl ${s.retry}`}>
            <RotateCcw aria-hidden /> أعد المحاولة
          </Link>
          <Link href="?screen=map" className={s.toMap}>
            <MapIcon aria-hidden /> الخريطة
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── الخريطة ───────────────────────── */

const WIDE = { w: 1000, h: 250, pts: [[880, 150], [700, 70], [520, 145], [340, 60], [140, 115]] };
const TALL = { w: 360, h: 820, pts: [[240, 60], [118, 220], [240, 380], [118, 540], [190, 700]] };

const BRIGHT: Record<Mastery, { halo: number; op: number; fill: string; scale: number }> = {
  mastered: { halo: 42, op: 0.4, fill: "#ffd25e", scale: 1.3 },
  progress: { halo: 32, op: 0.22, fill: "#f2c862", scale: 1.1 },
  review: { halo: 0, op: 0, fill: "#b48b4a", scale: 1 },
  few: { halo: 0, op: 0, fill: "rgba(255,255,255,.18)", scale: 0.95 },
  locked: { halo: 0, op: 0, fill: "#26325e", scale: 0.7 },
};
const STAR_D = "M0-20l5.6 11.6 12.7 1.7-9.3 8.9 2.3 12.6L0 8.7l-11.3 6.1 2.3-12.6-9.3-8.9 12.7-1.7Z";

function Cluster({ unit, geo, kind }: { unit: MapUnit; geo: typeof WIDE; kind: "wide" | "tall" }) {
  const nodes = [...unit.lessons.map((l) => ({ ...l, challenge: false })), { n: 0, title: "تحدّي الوحدة", mastery: unit.challenge.mastery, stars: unit.challenge.stars, challenge: true, current: false }];
  return (
    <div className={s.cluster} data-kind={kind} style={{ aspectRatio: `${geo.w} / ${geo.h}` }}>
      <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className={s.clusterSvg} aria-hidden focusable="false">
        {nodes.slice(1).map((nd, i) => {
          const [x1, y1] = geo.pts[i];
          const [x2, y2] = geo.pts[i + 1];
          const lit = nodes[i].stars > 0 && nd.mastery !== "locked";
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? "#ffd25e" : "#5b6aa3"} strokeWidth={lit ? 4 : 2.5} strokeDasharray={lit ? undefined : "2 10"} strokeLinecap="round" opacity={lit ? 0.85 : 0.7} />;
        })}
        {nodes.map((nd, i) => {
          const [x, y] = geo.pts[i];
          const b = BRIGHT[nd.mastery];
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              {b.halo > 0 && <circle r={b.halo} fill="#ffc531" opacity={b.op} />}
              {b.halo > 0 && <circle r={b.halo * 0.6} fill="#ffe39a" opacity={b.op * 0.8} />}
              {nd.current && <circle r="34" fill="none" stroke="#46e6d3" strokeWidth="4" className={s.pulse} />}
              {nd.mastery === "review" && <circle r="30" fill="none" stroke="#ff8a70" strokeWidth="3" strokeDasharray="5 5" />}
              {nd.challenge ? (
                <path
                  transform={`scale(${nd.mastery === "locked" ? 1.1 : 1.6})`}
                  d="M0-22c1.6 11 9 18.6 22 22-13 3.4-20.4 11-22 22-1.6-11-9-18.6-22-22 13-3.4 20.4-11 22-22Z"
                  fill={nd.mastery === "locked" ? "#26325e" : b.fill}
                  stroke={nd.mastery === "locked" ? "#5b6aa3" : "#0b1433"}
                  strokeWidth="2.4"
                />
              ) : (
                <path transform={`scale(${b.scale})`} d={STAR_D} fill={b.fill} stroke={nd.mastery === "locked" ? "#5b6aa3" : nd.mastery === "few" ? "#cfd8ff" : "#0b1433"} strokeWidth="2.6" strokeLinejoin="round" strokeDasharray={nd.mastery === "few" ? "4 3" : undefined} />
              )}
            </g>
          );
        })}
      </svg>
      <ol className={s.nodes}>
        {nodes.map((nd, i) => {
          const [x, y] = geo.pts[i];
          const locked = nd.mastery === "locked";
          const name = nd.challenge ? "تحدّي الوحدة" : `الدرس ${ar(nd.n)}`;
          const starsText = nd.stars === 0 ? "بلا نجوم بعد" : nd.stars === 1 ? "نجمة واحدة من ٣" : nd.stars === 2 ? "نجمتان من ٣" : "٣ نجوم من ٣";
          const aria = locked
            ? `${name}${nd.challenge ? "" : `: ${nd.title}`}، مقفل${nd.challenge ? "، يُفتح بإكمال دروس الوحدة" : ""}`
            : `${name}${nd.challenge ? "" : `: ${nd.title}`}، الإتقان ${MASTERY_LABEL[nd.mastery]}، ${starsText}${nd.current ? "، أنت هنا" : ""}`;
          return (
            <li key={i} className={s.node} style={{ left: `${(x / geo.w) * 100}%`, top: `${(y / geo.h) * 100}%` }} data-locked={locked} data-current={nd.current || undefined}>
              {locked ? (
                <span className={s.hit} role="img" aria-label={aria} />
              ) : (
                <Link href="?screen=scene" className={s.hit} aria-label={aria} />
              )}
              <span className={s.nodeLabel} aria-hidden>
                <b>
                  {locked && <Lock aria-hidden />}
                  {name}
                </b>
                {!nd.challenge && <span>{nd.title}</span>}
                {nd.current && <em className={s.here}>أنت هنا</em>}
                {!locked && !nd.current && (
                  <span className={s.miniStars}>
                    {[0, 1, 2].map((k) => (
                      <i key={k} data-on={k < nd.stars} />
                    ))}
                    <small>{MASTERY_LABEL[nd.mastery]}</small>
                  </span>
                )}
                {locked && nd.challenge && <small>يُفتح بإكمال الدروس</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MapScreen() {
  const pct = Math.round((WORLD.lanternsFreed / WORLD.lanternsTotal) * 100);
  const legend: Mastery[] = ["mastered", "progress", "review", "few", "locked"];
  return (
    <div className={s.page}>
      <section className={s.mapHero}>
        <CoastSkyline className={s.mapSkyline} color="#16245a" />
        <div className={s.mapHead}>
          <ObservatoryMark size={64} />
          <div>
            <p className={s.resEyebrow}>
              <span className={s.subjectChip}>{WORLD.subject}</span> {WORLD.grade} · {WORLD.term}
            </p>
            <h1 className={s.mapTitle}>كوكبة {WORLD.subject}</h1>
            <p className={s.mapSub}>كل درس نجمة، وكل وحدة عنقود. كلما أتقنت درسًا ازداد بريق نجمته.</p>
          </div>
        </div>
        <div className={s.dawnBar}>
          <p>
            <span>من الليل إلى الشروق</span>
            <b>
              حرّرت {count(WORLD.lanternsFreed, W_LANTERN)} من {ar(WORLD.lanternsTotal)}
            </b>
          </p>
          <div className={s.dawnTrack} role="progressbar" aria-valuemin={0} aria-valuemax={WORLD.lanternsTotal} aria-valuenow={WORLD.lanternsFreed} aria-label="القناديل المحررة في هذا العالم">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>

      <div className={s.mapBody}>
        <ul className={s.legend} aria-label="دليل السطوع: سطوع النجمة يعكس إتقانك">
          {legend.map((m) => (
            <li key={m}>
              <svg width="30" height="30" viewBox="-26 -26 52 52" aria-hidden>
                {BRIGHT[m].halo > 0 && <circle r="24" fill="#ffc531" opacity={BRIGHT[m].op} />}
                {m === "review" && <circle r="20" fill="none" stroke="#ff8a70" strokeWidth="3" strokeDasharray="5 5" />}
                <path transform={`scale(${BRIGHT[m].scale * 0.85})`} d={STAR_D} fill={BRIGHT[m].fill} stroke={m === "locked" ? "#5b6aa3" : m === "few" ? "#cfd8ff" : "#0b1433"} strokeWidth="3" strokeDasharray={m === "few" ? "4 3" : undefined} />
              </svg>
              {MASTERY_LABEL[m]}
            </li>
          ))}
        </ul>

        {WORLD.units.map((u) => {
          const lessonsDone = u.lessons.filter((l) => l.stars > 0).length;
          const locked = u.lessons.every((l) => l.mastery === "locked");
          return (
            <section key={u.n} className={s.unit} data-locked={locked} aria-labelledby={`u${u.n}`}>
              <header className={s.unitHead}>
                <span className={s.unitNum}>{ar(u.n)}</span>
                <div>
                  <h2 id={`u${u.n}`}>
                    الوحدة {ar(u.n)}: {u.title}
                  </h2>
                  <p>{locked ? "تُفتح بإكمال الوحدة السابقة" : `أكملت ${lessonsDone === 1 ? "درسًا واحدًا" : lessonsDone === 2 ? "درسين" : `${ar(lessonsDone)} دروس`} من ${ar(u.lessons.length)}`}</p>
                </div>
              </header>
              <Cluster unit={u} geo={WIDE} kind="wide" />
              <Cluster unit={u} geo={TALL} kind="tall" />
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── الإطار ───────────────────────── */

export function GameALab({ screen, state }: { screen: Screen; state: "wrong" | "ask" }) {
  return (
    <div className={s.root}>
      <main id="main">
        {screen === "scene" && <SceneScreen />}
        {screen === "question" && <QuestionScreen preset={state} />}
        {screen === "results" && <ResultsScreen />}
        {screen === "map" && <MapScreen />}
      </main>
      <footer className={s.labBar}>
        <p className={s.labNote}>
          مختبر الاتجاه الفني أ «فانوس الساحل» للعبة الشهب. نموذج للمراجعة ببيانات تجريبية، لا يظهر في الإنتاج.
        </p>
        <nav aria-label="شاشات المختبر" className={s.labNav}>
          {SCREENS.map((x) => (
            <Link key={x.key} href={`?screen=${x.key}`} aria-current={x.key === screen ? "page" : undefined}>
              {x.label}
            </Link>
          ))}
          <Link href="?screen=question&state=ask" aria-current={screen === "question" && state === "ask" ? "page" : undefined}>
            السؤال قبل الإجابة
          </Link>
        </nav>
        {screen === "scene" && (
          <ul className={s.matList} aria-label="المواد الست">
            {MATERIALS.map((m) => (
              <li key={m.key} data-m={m.key}>
                <i aria-hidden />
                <b>{m.name}</b> {m.note}
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
