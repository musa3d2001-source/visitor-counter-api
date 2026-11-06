"use client";
/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): شاشات الاتجاه الفني ب «مرصد البلّور».
 * النصوص كلها في DOM فوق الـ canvas؛ three.js يُحمَّل كسولًا بـ import() داخل SceneCanvas فقط.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Lock, Pause, Play, RotateCcw, Sparkles, Star, Volume2, VolumeX, X, Minus, Plus } from "../_game-kit/icons";
import { ar } from "../_game-kit/fmt";
import { LEVEL, MASTERY, QUESTION, RESULTS, SCREENS, WORLD, type Mastery, type MapUnit, type Screen } from "./data";
import s from "./game-b.module.css";

/**
 * رسوم السماء الثابتة (أفق الكويت والهلال والشمس) تُرسم على الخادم في page.tsx وتُمرَّر جاهزة،
 * لأن استيرادها هنا في مكوّن عميل يضيف NightSky/Sunrise إلى وحدة decor المشتركة على العميل
 * فيكبر JS كل صفحات الموقع (قيس في بوابة المرحلة 0: +1,284 بايت لكل صفحة).
 */
export type SkyArt = { skyline: ReactNode; moon: ReactNode; moonPage: ReactNode; sun: ReactNode };

type Props = { screen: Screen; state: "ask" | "wrong"; quality: "high" | "low"; skyline: SkyArt };

export function GameBLab({ screen, state, quality, skyline }: Props) {
  if (screen === "results") return <Results skyline={skyline} />;
  if (screen === "map") return <WorldMap skyline={skyline} />;
  return <Level screen={screen} state={state} quality={quality} skyline={skyline} />;
}

/* ═════════════ أدوات مشتركة ═════════════ */

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setRm(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return rm;
}

/** شهاب صغير للأيقونات: نواة ذهبية وذيل فيروزي */
function MeteorGlyph({ className, dim }: { className?: string; dim?: boolean }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}t`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6EEBD3" stopOpacity="0" />
          <stop offset="1" stopColor="#6EEBD3" stopOpacity={dim ? 0.25 : 0.9} />
        </linearGradient>
      </defs>
      <path d="M30 2 L12 16 L16 20 Z" fill={`url(#${id}t)`} />
      <circle cx="11" cy="21" r="7" fill={dim ? "#3a4a7a" : "#FFD45A"} stroke={dim ? "#5b6ea8" : "#FFF4C9"} strokeWidth="2" />
      {!dim && <circle cx="9" cy="19" r="2.2" fill="#fff" opacity=".85" />}
    </svg>
  );
}

function LanternGlyph({ className, lit }: { className?: string; lit: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 32" aria-hidden focusable="false">
      {lit && <circle cx="12" cy="17" r="11" fill="#FFC531" opacity=".25" />}
      <path d="M8 6h8l-1-3H9Z" fill={lit ? "#E8A93A" : "#5b6ea8"} />
      <path d="M6 10c0-2 2-4 6-4s6 2 6 4v12c0 2-2 4-6 4s-6-2-6-4Z" fill={lit ? "#FFE39A" : "#2a3766"} stroke={lit ? "#E8A93A" : "#5b6ea8"} strokeWidth="1.6" />
      <path d="M9 28h6" stroke={lit ? "#E8A93A" : "#5b6ea8"} strokeWidth="2.4" strokeLinecap="round" />
      {lit && <path d="M12 12c2 2 2 6 0 8-2-2-2-6 0-8Z" fill="#FF9F43" />}
    </svg>
  );
}

/** نجمة التقييم: ممتلئة (نالها) أو محيطية متقطعة (الشرط ناقص) */
function RatingStar({ earned, className }: { earned: boolean; className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF1B8" />
          <stop offset=".55" stopColor="#FFC531" />
          <stop offset="1" stopColor="#F29B17" />
        </linearGradient>
      </defs>
      <path
        d="M24 3.5l6.1 12.6 13.9 1.9-10.1 9.7 2.5 13.8L24 34.9l-12.4 6.6 2.5-13.8L4 18l13.9-1.9Z"
        fill={earned ? `url(#${id})` : "rgba(255,255,255,.04)"}
        stroke={earned ? "#B86A00" : "#8FA3D9"}
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeDasharray={earned ? undefined : "4 3.2"}
      />
      {earned && <path d="M17 15.5l3-1" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8" />}
    </svg>
  );
}

/** خلفية السماء في DOM (خلف الـ canvas): تدرج الليل إلى الشروق، نجوم، هلال، شمس، وأفق الكويت البعيد */
function Sky({ horizon, camX, dawn, skyline, page = false }: { horizon: number; camX: number; dawn: number; skyline: SkyArt; page?: boolean }) {
  // في صفحتي النتائج والخريطة يثبت الأفق قرب أسفل الصفحة مهما طالت، فيصير الشروق خاتمة المشهد
  const hz = page ? "calc(100% - 96px)" : `${(horizon * 100).toFixed(2)}%`;
  const style = { "--hz": hz, "--dawn": dawn, "--px": `${(-camX * 6).toFixed(1)}px` } as React.CSSProperties;
  const constellation = !page;
  return (
    <div className={s.sky} data-page={page || undefined} style={style} aria-hidden>
      <div className={s.stars} />
      <div className={s.starsTwinkle} />
      {page ? skyline.moonPage : skyline.moon}
      {dawn >= 0.5 && (
        <div className={s.sunWrap}>
          {skyline.sun}
        </div>
      )}
      {constellation && <LevelConstellation />}
      <div className={s.skyline}>{skyline.skyline}</div>
      <div className={s.hzGlow} />
    </div>
  );
}

/** كوكبة المستوى: كل قنديل يتحرر يضيء نجمة فيها */
function LevelConstellation() {
  const pts: [number, number][] = [
    [20, 60],
    [70, 22],
    [128, 44],
  ];
  return (
    <svg className={s.levelConst} viewBox="0 0 150 80">
      <path d="M20 60 L70 22 L128 44" fill="none" stroke="#9EF0E4" strokeOpacity=".45" strokeWidth="1.6" strokeDasharray="3 5" />
      {pts.map(([x, y], i) => {
        const lit = i < LEVEL.freed;
        return (
          <g key={i}>
            {lit && <circle cx={x} cy={y} r="13" fill="#FFC531" opacity=".22" />}
            <path
              d={`M${x} ${y - 8}c.8 5 3 7.2 8 8-5 .8-7.2 3-8 8-.8-5-3-7.2-8-8 5-.8 7.2-3 8-8Z`}
              fill={lit ? "#FFE39A" : "rgba(158,240,228,.18)"}
              stroke={lit ? "#FFC531" : "#9EF0E4"}
              strokeOpacity={lit ? 1 : 0.6}
              strokeWidth="1.2"
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ═════════════ المستوى: المشهد ولوح السؤال ═════════════ */

const ANGLE = { min: 10, max: 80 };
const POWER = { min: 20, max: 100 };

function Level({ screen, state, quality, skyline }: { screen: "scene" | "question"; state: "ask" | "wrong"; quality: "high" | "low"; skyline: SkyArt }) {
  const [angle, setAngle] = useState(LEVEL.angle);
  const [power, setPower] = useState(LEVEL.power);
  const [layout, setLayout] = useState({ horizon: 0.6, camX: 0.8 });
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [special, setSpecial] = useState(false);
  const [live, setLive] = useState("");
  const asking = screen === "question";

  useEffect(() => {
    if (asking) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "BUTTON" || t.tagName === "A")) return;
      if (e.key === "ArrowUp") setAngle((a) => Math.min(ANGLE.max, a + 1));
      else if (e.key === "ArrowDown") setAngle((a) => Math.max(ANGLE.min, a - 1));
      else if (e.key === "ArrowLeft") setPower((p) => Math.min(POWER.max, p + 1));
      else if (e.key === "ArrowRight") setPower((p) => Math.max(POWER.min, p - 1));
      else if (e.key === " ") setLive("تجربة عرض: الإطلاق الفعلي يأتي مع المحرك في المرحلة ٢.");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  return (
    <main className={s.level} data-screen={screen}>
      <Sky horizon={layout.horizon} camX={layout.camX} dawn={LEVEL.dawn} skyline={skyline} />
      <SceneCanvas angle={angle} power={power} quality={quality} onLayout={setLayout} />
      <h1 className="sr-only">
        المستوى: {LEVEL.subject}، الوحدة {ar(LEVEL.unit)}، الدرس {ar(LEVEL.lesson)}: {LEVEL.title}
      </h1>

      <Hud muted={muted} onMute={() => setMuted((m) => !m)} onPause={() => setPaused(true)} hidden={asking} />

      {!asking && (
        <AimDock
          angle={angle}
          power={power}
          setAngle={setAngle}
          setPower={setPower}
          special={special}
          onSpecial={() => setSpecial((x) => !x)}
          onFire={() => setLive("تجربة عرض: الإطلاق الفعلي يأتي مع المحرك في المرحلة ٢.")}
        />
      )}

      {asking && <QuestionPanel initial={state} />}
      {paused && <PauseSheet onClose={() => setPaused(false)} />}
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </main>
  );
}

function SceneCanvas({ angle, power, quality, onLayout }: { angle: number; power: number; quality: "high" | "low"; onLayout: (l: { horizon: number; camX: number }) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<{ setAim(a: number, p: number): void; destroy(): void } | null>(null);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  const aimRef = useRef({ angle, power });
  const layoutCb = useRef(onLayout);
  useEffect(() => {
    aimRef.current = { angle, power };
    layoutCb.current = onLayout;
  });

  useEffect(() => {
    let cancelled = false;
    const cv = ref.current;
    if (!cv) return;
    const probe = document.createElement("canvas").getContext("webgl2");
    if (!probe) {
      setFailed(true);
      return;
    }
    import("./scene")
      .then(async ({ createScene }) => {
        if (cancelled) return;
        const h = await createScene(cv, {
          angle: aimRef.current.angle,
          power: aimRef.current.power,
          dawn: LEVEL.dawn,
          reducedMotion: reduced,
          quality,
          onLayout: (l) => layoutCb.current(l),
        });
        if (cancelled) h.destroy();
        else handle.current = h;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [reduced, quality]);

  useEffect(() => {
    handle.current?.setAim(angle, power);
  }, [angle, power]);

  return (
    <>
      <canvas ref={ref} className={s.canvas} aria-hidden />
      {failed && (
        <p className={s.fallback} role="status">
          المتصفح لا يدعم الرسم ثلاثي الأبعاد، فتعمل اللعبة في وضع الأسئلة فقط.
        </p>
      )}
    </>
  );
}

function Hud({ muted, onMute, onPause, hidden }: { muted: boolean; onMute: () => void; onPause: () => void; hidden: boolean }) {
  const slotsLeft = LEVEL.slots - LEVEL.slotsUsed;
  return (
    <header className={s.hud} aria-hidden={hidden || undefined} inert={hidden || undefined}>
        <div className={s.levelChip}>
          <span className={s.levelNum} aria-hidden>
            {ar(LEVEL.lesson)}
          </span>
          <span className={s.levelText}>
            <span className={s.levelKicker}>
              {LEVEL.subject} · الوحدة {ar(LEVEL.unit)}
            </span>
            <span className={s.levelTitle}>{LEVEL.title}</span>
          </span>
        </div>

        <ul className={s.starTrack} aria-label="نجوم المستوى">
          {[
            { k: "الإتمام", on: false, note: "حرّر القناديل" },
            { k: "المعرفة", on: true, note: "دقتك حتى الآن ١٠٠٪" },
            { k: "المهارة", on: true, note: `ضمن ${ar(LEVEL.par)} طلقات` },
          ].map((x) => (
            <li key={x.k} className={s.starPip} data-on={x.on || undefined} title={x.note}>
              <Star size={16} aria-hidden fill={x.on ? "currentColor" : "none"} strokeWidth={2.4} />
              <span className={s.starPipLabel}>{x.k}</span>
              <span className="sr-only">: {x.on ? `في الطريق، ${x.note}` : `لم تتحقق بعد، ${x.note}`}</span>
            </li>
          ))}
        </ul>

        <div className={s.hudBtns}>
          <button type="button" className={s.roundBtn} onClick={onMute} aria-pressed={!muted} aria-label={muted ? "تشغيل المؤثرات الصوتية" : "كتم المؤثرات الصوتية"}>
            {muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
          </button>
          <button type="button" className={s.roundBtn} onClick={onPause} aria-label="إيقاف مؤقت">
            <Pause size={20} aria-hidden fill="currentColor" />
          </button>
        </div>

      <div className={s.hudRow}>
        <div className={s.counter} aria-label={`القناديل المحرّرة: ${ar(LEVEL.freed)} من ${ar(LEVEL.lanterns)}`}>
          <span className={s.counterIcons} aria-hidden>
            {Array.from({ length: LEVEL.lanterns }, (_, i) => (
              <LanternGlyph key={i} className={s.lanternIco} lit={i < LEVEL.freed} />
            ))}
          </span>
          <span className={s.counterText} aria-hidden>
            <b>{ar(LEVEL.freed)}</b>/{ar(LEVEL.lanterns)} قناديل
          </span>
        </div>

        <div className={s.counter} aria-label={`الخانات الباقية: ${ar(slotsLeft)} من ${ar(LEVEL.slots)}`}>
          <span className={s.slots} aria-hidden>
            {Array.from({ length: LEVEL.slots }, (_, i) => (
              <span key={i} className={s.slot} data-state={i < LEVEL.slotsUsed ? "used" : i === LEVEL.slotsUsed ? "now" : "left"}>
                <MeteorGlyph className={s.slotIco} dim={i < LEVEL.slotsUsed} />
              </span>
            ))}
          </span>
          <span className={s.counterText} aria-hidden>
            <b>{ar(slotsLeft)}</b> خانات باقية
          </span>
        </div>
      </div>
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
  valueText,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  valueText: string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={s.stepper}>
      <div className={s.stepperHead}>
        <label htmlFor={id} className={s.stepperLabel}>
          {label}
        </label>
        <output htmlFor={id} className={s.stepperVal}>
          {ar(value)}
          <small>{unit}</small>
        </output>
      </div>
      <div className={s.stepperRow}>
        <button type="button" className={s.nudge} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`إنقاص ${label} درجة واحدة`} disabled={value <= min}>
          <Minus size={18} aria-hidden strokeWidth={3} />
        </button>
        <input
          id={id}
          role="slider"
          type="range"
          className={s.range}
          min={min}
          max={max}
          step={1}
          value={value}
          aria-valuetext={valueText}
          onChange={(e) => onChange(Math.round(Number(e.target.value)))}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        />
        <button type="button" className={s.nudge} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`زيادة ${label} درجة واحدة`} disabled={value >= max}>
          <Plus size={18} aria-hidden strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

function AimDock(p: {
  angle: number;
  power: number;
  setAngle: (n: number) => void;
  setPower: (n: number) => void;
  special: boolean;
  onSpecial: () => void;
  onFire: () => void;
}) {
  return (
    <section className={s.dock} aria-label="التصويب">
      <p className={s.dockHint}>
        <Sparkles size={14} aria-hidden />
        <span className={s.hintMore}>اسحب من المِرقاب للتصويب، أو اضبط المنزلقين بدقة</span>
        <span className={s.hintShort}>اسحب للتصويب أو اضبط بدقة</span>
      </p>
      <div className={s.dockGrid}>
        <Stepper label="الزاوية" unit="°" value={p.angle} min={ANGLE.min} max={ANGLE.max} onChange={p.setAngle} valueText={`${ar(p.angle)} درجة`} />
        <Stepper label="القوة" unit="٪" value={p.power} min={POWER.min} max={POWER.max} onChange={p.setPower} valueText={`${ar(p.power)} من ${ar(POWER.max)}`} />
        <div className={s.dockActions}>
          <button type="button" className={s.specialBtn} aria-pressed={p.special} onClick={p.onSpecial}>
            <span className={s.specialIco} aria-hidden>
              <svg viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="11" fill="#8C6CFF" stroke="#E6DDFF" strokeWidth="2" />
                <path d="M10 13l5-3 6 2 1 6-4 4-6-1Z" fill="#5A3FD0" />
                <circle cx="13" cy="12" r="2" fill="#fff" opacity=".8" />
              </svg>
              <b>×{ar(LEVEL.special.count)}</b>
            </span>
            <span className={s.specialText}>
              <b>{LEVEL.special.name}</b>
              <small>{p.special ? "سيُطلق بدل الشهاب" : LEVEL.special.hint}</small>
            </span>
          </button>
          <button type="button" className={s.fireBtn} onClick={p.onFire}>
            <MeteorGlyph className={s.fireIco} />
            أطلق
            <kbd className={s.kbd}>المسافة</kbd>
          </button>
        </div>
      </div>
    </section>
  );
}

function PauseSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className={s.pauseWrap} role="dialog" aria-modal="true" aria-labelledby="pause-t">
      <div className={s.pauseCard}>
        <h2 id="pause-t" className={s.pauseTitle}>
          متوقف مؤقتًا
        </h2>
        <p className={s.pauseText}>خذ وقتك. لا مؤقت في هذه اللعبة، والقناديل تنتظرك.</p>
        <button ref={ref} type="button" className={s.goldBtn} onClick={onClose}>
          <Play size={18} aria-hidden fill="currentColor" /> تابع اللعب
        </button>
      </div>
    </div>
  );
}

/* ───────────── لوح السؤال ───────────── */

function QuestionPanel({ initial }: { initial: "ask" | "wrong" }) {
  const [picked, setPicked] = useState<string | null>(initial === "wrong" ? QUESTION.pickedId : null);
  const answered = picked !== null;
  const correct = picked === QUESTION.correctId;
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (answered) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0 && QUESTION.choices[i]) setPicked(QUESTION.choices[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered]);

  return (
    <>
      <div className={s.dim} aria-hidden />
      <section className={s.qWrap} role="dialog" aria-modal="true" aria-labelledby="q-stem">
        <div className={s.qCard}>
          <div className={s.qHead}>
            <span className={s.qSlot}>
              <MeteorGlyph className={s.qSlotIco} />
              سؤال الخانة {ar(QUESTION.slot)} من {ar(LEVEL.slots)}
            </span>
            <span className={s.qReward}>الإجابة الصحيحة تمنحك شهابًا</span>
          </div>
          <h2 id="q-stem" ref={headRef} className={s.qStem}>
            {QUESTION.stem}
          </h2>

          <ul className={s.choices}>
            {QUESTION.choices.map((c, i) => {
              const isCorrect = answered && c.id === QUESTION.correctId;
              const isWrongPick = answered && c.id === picked && !correct;
              const st = isCorrect ? "correct" : isWrongPick ? "wrong" : answered ? "rest" : "idle";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={s.choice}
                    data-state={st}
                    disabled={answered}
                    aria-describedby={answered ? "q-feedback" : undefined}
                    onClick={() => setPicked(c.id)}
                  >
                    <span className={s.letter} aria-hidden>
                      {isCorrect ? <Check size={22} strokeWidth={3.2} /> : isWrongPick ? <X size={22} strokeWidth={3.2} /> : c.letter}
                    </span>
                    <span className={s.choiceText}>
                      <span className="sr-only">{c.letter}: </span>
                      {c.text}
                    </span>
                    {isCorrect && <span className={s.choiceTag}>الإجابة الصحيحة</span>}
                    {isWrongPick && <span className={s.choiceTagWrong}>إجابتك</span>}
                    {!answered && <kbd className={s.choiceKey}>{ar(i + 1)}</kbd>}
                  </button>
                </li>
              );
            })}
          </ul>

          <div id="q-feedback" aria-live="polite">
            {answered && !correct && (
              <div className={s.feedback}>
                <div className={s.fbHead}>
                  <span className={s.pebble} aria-hidden />
                  <div>
                    <p className={s.fbTitle}>قريب جدًا! هذه الخانة تمنحك حصاة خفيفة</p>
                    <p className={s.fbSub}>والفكرة الصحيحة تبقى معك للسؤال القادم.</p>
                  </div>
                </div>
                <p className={s.explain}>{QUESTION.explanation}</p>
                <p className={s.ref}>
                  <BookOpen size={18} aria-hidden />
                  <span>{QUESTION.reference}</span>
                </p>
              </div>
            )}
            {answered && correct && (
              <div className={s.feedbackOk}>
                <p className={s.fbTitle}>أحسنت! حصلت على شهاب</p>
                <p className={s.explain}>{QUESTION.explanation}</p>
              </div>
            )}
          </div>

          {answered && (
            <div className={s.qFoot}>
              <button type="button" className={s.goldBtn}>
                فهمت
              </button>
              {initial === "ask" && (
                <button type="button" className={s.ghostBtn} onClick={() => setPicked(null)}>
                  <RotateCcw size={16} aria-hidden /> أعد المعاينة
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/* ═════════════ النتائج ═════════════ */

function Results({ skyline }: { skyline: SkyArt }) {
  const earned = RESULTS.stars.filter((x) => x.earned).length;
  return (
    <main className={s.page}>
      <Sky horizon={1} camX={0} dawn={0.75} skyline={skyline} page />
      <div className={s.pageInner}>
        <header className={s.resHead}>
          <div className={s.resLanterns} aria-hidden>
            {Array.from({ length: RESULTS.lanterns }, (_, i) => (
              <LanternGlyph key={i} className={s.resLantern} lit />
            ))}
          </div>
          <p className={s.kicker}>
            {LEVEL.subject} · الوحدة {ar(LEVEL.unit)} · الدرس {ar(LEVEL.lesson)}
          </p>
          <h1 className={s.resTitle}>حرّرت القناديل الثلاثة!</h1>
          <p className={s.resSub}>
            صعدت ثلاث نجوم جديدة إلى كوكبة «{LEVEL.title}»، ونلت {earned === 1 ? "نجمة واحدة" : earned === 2 ? "نجمتين" : `${ar(earned)} نجوم`} من ثلاث.
          </p>
        </header>

        <ol className={s.starGrid} aria-label="نجوم التقييم الثلاث">
          {RESULTS.stars.map((st, i) => (
            <li key={st.key} className={s.starCard} data-earned={st.earned || undefined} style={{ "--i": i } as React.CSSProperties}>
              <RatingStar earned={st.earned} className={s.bigStar} />
              <div className={s.starBody}>
                <p className={s.starState}>{st.earned ? "نلتها" : "تنقصك"}</p>
                <h2 className={s.starTitle}>نجمة {st.title}</h2>
                <p className={s.starWhy}>{st.why}</p>
              </div>
            </li>
          ))}
        </ol>

        <dl className={s.stats}>
          <div className={s.stat}>
            <dt>الطلقات</dt>
            <dd>
              {ar(RESULTS.shots)}
              <small> / الحد {ar(RESULTS.par)}</small>
            </dd>
          </div>
          <div className={s.stat}>
            <dt>الإجابات الصحيحة</dt>
            <dd>
              {ar(RESULTS.correct)}
              <small> من {ar(RESULTS.answered)}</small>
            </dd>
          </div>
          <div className={s.stat}>
            <dt>نقاط المرح</dt>
            <dd>{ar(RESULTS.points.toLocaleString("en-US")).replace(",", "٬")}</dd>
          </div>
        </dl>

        <section className={s.mistakes} aria-labelledby="mk-t">
          <h2 id="mk-t" className={s.secTitle}>
            راجع خطأين قبل المحاولة القادمة
          </h2>
          <ul className={s.mkList}>
            {RESULTS.mistakes.map((m) => (
              <li key={m.stem} className={s.mk}>
                <p className={s.mkStem}>{m.stem}</p>
                <p className={s.mkRow}>
                  <span className={s.mkBadWrap}>
                    <X size={16} aria-hidden strokeWidth={3} /> إجابتك: {m.picked}
                  </span>
                  <span className={s.mkGoodWrap}>
                    <Check size={16} aria-hidden strokeWidth={3} /> الصحيحة: {m.correct}
                  </span>
                </p>
                <p className={s.mkRef}>
                  <BookOpen size={16} aria-hidden /> كتاب {LEVEL.subject}، {LEVEL.grade}، {m.ref}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className={s.resActions}>
          <Link href="?screen=map" className={s.goldBtn}>
            المستوى التالي <ArrowLeft size={20} aria-hidden />
          </Link>
          <Link href="?screen=scene" className={s.glassBtn}>
            <RotateCcw size={18} aria-hidden /> أعد المحاولة
          </Link>
        </div>
        <p className={s.note}>النجوم الثلاث مستقلة وتُجمع عبر المحاولات: نجمة المعرفة ما زالت متاحة لك في هذا المستوى.</p>
        <LabNav current="results" />
      </div>
    </main>
  );
}

/* ═════════════ خريطة العالم: كوكبة SVG ═════════════ */

type Node = { key: string; x: number; y: number; unit: number; kind: "lesson" | "challenge"; title: string; n: number; mastery: Mastery; stars: number; current: boolean };
type MapLayout = { w: number; h: number; nodes: Node[]; units: { n: number; title: string; x: number; y: number; cx: number; cy: number; rx: number; ry: number; locked: boolean }[] };

function challengeMastery(u: MapUnit): Mastery {
  if (!u.challenge.open) return "locked";
  return u.challenge.stars > 0 ? "progress" : "new";
}

/** عمودي للجوال واللوح: صف لكل نجمة بتعرّج داخل العنقود */
function verticalLayout(): MapLayout {
  const W = 400;
  const nodes: Node[] = [];
  const units: MapLayout["units"] = [];
  let y = 30;
  const zig = [0.66, 0.36, 0.62, 0.34, 0.6];
  for (const u of WORLD.units) {
    const top = y;
    units.push({ n: u.n, title: u.title, x: W / 2, y: y + 16, cx: 0, cy: 0, rx: 0, ry: 0, locked: u.lessons.every((l) => l.mastery === "locked") });
    y += 86;
    u.lessons.forEach((l, i) => {
      nodes.push({ key: `${u.n}-${l.n}`, x: W * zig[i % zig.length], y, unit: u.n, kind: "lesson", title: l.title, n: l.n, mastery: l.mastery, stars: l.stars, current: WORLD.current.unit === u.n && WORLD.current.lesson === l.n });
      y += 104;
    });
    nodes.push({ key: `${u.n}-c`, x: W * 0.5, y: y + 6, unit: u.n, kind: "challenge", title: "تحدّي الوحدة", n: 0, mastery: challengeMastery(u), stars: u.challenge.stars, current: false });
    y += 130;
    const un = units[units.length - 1];
    un.cx = W / 2;
    un.cy = (top + y - 40) / 2;
    un.rx = W * 0.52;
    un.ry = (y - top) / 2;
  }
  return { w: W, h: y - 20, nodes, units };
}

/** أفقي للشاشات العريضة: عنقود لكل وحدة من اليمين إلى اليسار */
function horizontalLayout(): MapLayout {
  const W = 1400;
  const H = 470;
  const nodes: Node[] = [];
  const units: MapLayout["units"] = [];
  const colW = W / WORLD.units.length;
  WORLD.units.forEach((u, ui) => {
    const right = W - ui * colW - 70;
    const left = W - (ui + 1) * colW + 70;
    const m = u.lessons.length + 1;
    const pts = Array.from({ length: m }, (_, i) => right - ((right - left) * i) / (m - 1));
    u.lessons.forEach((l, i) => {
      nodes.push({ key: `${u.n}-${l.n}`, x: pts[i], y: i % 2 ? 330 : 200, unit: u.n, kind: "lesson", title: l.title, n: l.n, mastery: l.mastery, stars: l.stars, current: WORLD.current.unit === u.n && WORLD.current.lesson === l.n });
    });
    nodes.push({ key: `${u.n}-c`, x: pts[m - 1], y: u.lessons.length % 2 ? 350 : 220, unit: u.n, kind: "challenge", title: "تحدّي الوحدة", n: 0, mastery: challengeMastery(u), stars: u.challenge.stars, current: false });
    units.push({ n: u.n, title: u.title, x: (right + left) / 2, y: 60, cx: (right + left) / 2, cy: 250, rx: colW * 0.5, ry: 230, locked: u.lessons.every((l) => l.mastery === "locked") });
  });
  return { w: W, h: H, nodes, units };
}

const NEBULA = ["#19B8A6", "#FFC531", "#8C6CFF"];

function Constellation({ L, id }: { L: MapLayout; id: string }) {
  const byUnit = (n: number) => L.nodes.filter((x) => x.unit === n);
  const done = (m: Mastery) => m === "mastered" || m === "progress" || m === "review";
  return (
    <div className={s.constWrap} style={{ aspectRatio: `${L.w} / ${L.h}` }}>
      <svg className={s.constSvg} viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden focusable="false">
        <defs>
          {NEBULA.map((c, i) => (
            <radialGradient key={c} id={`${id}n${i}`}>
              <stop offset="0" stopColor={c} stopOpacity=".26" />
              <stop offset=".6" stopColor={c} stopOpacity=".08" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {L.units.map((u, i) => (
          <ellipse key={u.n} cx={u.cx} cy={u.cy} rx={u.rx} ry={u.ry} fill={`url(#${id}n${i % NEBULA.length})`} opacity={u.locked ? 0.45 : 1} />
        ))}
        {/* الخطوط بين الوحدات: منقّطة خافتة */}
        {L.units.slice(1).map((u) => {
          const prev = byUnit(u.n - 1).at(-1)!;
          const next = byUnit(u.n)[0];
          return <line key={`j${u.n}`} x1={prev.x} y1={prev.y} x2={next.x} y2={next.y} stroke="#9EF0E4" strokeOpacity=".25" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />;
        })}
        {/* خطوط الكوكبة داخل الوحدة: ذهبية إن اكتمل طرفاها */}
        {L.units.map((u) => {
          const ns = byUnit(u.n);
          return ns.slice(1).map((b, i) => {
            const a = ns[i];
            const lit = done(a.mastery) && (done(b.mastery) || (b.kind === "challenge" && b.mastery !== "locked"));
            return (
              <line
                key={`${a.key}-${b.key}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit ? "#FFD45A" : "#9EF0E4"}
                strokeOpacity={lit ? 0.85 : 0.3}
                strokeWidth={lit ? 3 : 2}
                strokeDasharray={lit ? undefined : "6 8"}
                strokeLinecap="round"
              />
            );
          });
        })}
        {/* نجوم خلفية صغيرة */}
        {Array.from({ length: 40 }, (_, i) => {
          const x = (i * 337) % L.w;
          const y = (i * 211 + 47) % L.h;
          return <circle key={i} cx={x} cy={y} r={i % 3 ? 1.4 : 2.2} fill="#fff" opacity={i % 4 ? 0.35 : 0.7} />;
        })}
      </svg>

      {L.units.map((u) => (
        <p key={`u${u.n}`} className={s.unitLabel} data-locked={u.locked || undefined} style={{ left: `${(u.x / L.w) * 100}%`, top: `${(u.y / L.h) * 100}%` }}>
          <span className={s.unitNum}>الوحدة {ar(u.n)}</span>
          {u.title}
        </p>
      ))}

      {L.nodes.map((nd) => {
        const locked = nd.mastery === "locked";
        const label = nd.kind === "challenge" ? `تحدّي الوحدة ${ar(nd.unit)}` : `الدرس ${ar(nd.n)}: ${nd.title}`;
        const aria = `${label}، ${MASTERY[nd.mastery].label}${locked ? "" : `، ${ar(nd.stars)} من ${ar(3)} نجوم`}`;
        const inner = (
          <>
            <span className={s.nodeOrb} aria-hidden>
              {locked ? <Lock size={18} /> : nd.kind === "challenge" ? <ChallengeGem /> : <StarGlyph />}
            </span>
            <span className={s.nodeLabel} aria-hidden>
              {nd.kind === "lesson" && <span className={s.nodeNum}>الدرس {ar(nd.n)}</span>}
              {nd.kind === "challenge" ? "تحدّي الوحدة" : nd.title}
            </span>
            {!locked && (
              <span className={s.nodeStars} aria-hidden>
                {[0, 1, 2].map((k) => (
                  <i key={k} data-on={k < nd.stars || undefined} />
                ))}
              </span>
            )}
            {nd.current && <span className={s.here}>أنت هنا</span>}
          </>
        );
        const style = { left: `${(nd.x / L.w) * 100}%`, top: `${(nd.y / L.h) * 100}%`, "--glow": MASTERY[nd.mastery].glow } as React.CSSProperties;
        return locked ? (
          <span key={nd.key} className={s.node} data-kind={nd.kind} data-m={nd.mastery} style={style} role="img" aria-label={aria}>
            {inner}
          </span>
        ) : (
          <Link key={nd.key} href="?screen=scene" className={s.node} data-kind={nd.kind} data-m={nd.mastery} data-current={nd.current || undefined} style={style} aria-label={aria}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

function StarGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={s.orbStar}>
      <path d="M12 1.5c1 6 4.5 9.5 10.5 10.5-6 1-9.5 4.5-10.5 10.5-1-6-4.5-9.5-10.5-10.5 6-1 9.5-4.5 10.5-10.5Z" />
    </svg>
  );
}
function ChallengeGem() {
  return (
    <svg viewBox="0 0 24 24" className={s.orbGem}>
      <path d="M12 2l7 7-7 13-7-13Z" />
      <path d="M5 9h14M12 2l-3 7 3 13 3-13Z" fill="none" stroke="rgba(120,60,0,.55)" strokeWidth="1.2" />
    </svg>
  );
}

function WorldMap({ skyline }: { skyline: SkyArt }) {
  const v = useMemo(verticalLayout, []);
  const h = useMemo(horizontalLayout, []);
  const id = useId().replace(/:/g, "");
  const totals = useMemo(() => {
    let lit = 0;
    let all = 0;
    for (const u of WORLD.units) {
      for (const l of u.lessons) {
        lit += l.stars;
        all += 3;
      }
      lit += u.challenge.stars;
      all += 3;
    }
    return { lit, all };
  }, []);
  const cur = WORLD.units.find((u) => u.n === WORLD.current.unit)!.lessons.find((l) => l.n === WORLD.current.lesson)!;
  const legend: Mastery[] = ["mastered", "progress", "review", "few", "new", "locked"];
  return (
    <main className={s.page}>
      <Sky horizon={1} camX={0} dawn={totals.lit / totals.all} skyline={skyline} page />
      <div className={s.mapInner}>
        <header className={s.mapHead}>
          <p className={s.kicker}>
            {WORLD.grade} · {WORLD.term}
          </p>
          <h1 className={s.mapTitle}>كوكبة {WORLD.subject}</h1>
          <div className={s.mapProgress}>
            <span className={s.mapProgNum}>
              <Star size={18} aria-hidden fill="currentColor" /> {ar(totals.lit)} من {ar(totals.all)} نجمة
            </span>
            <span className={s.mapBar} aria-hidden>
              <i style={{ width: `${(totals.lit / totals.all) * 100}%` }} />
            </span>
            <span className={s.mapProgNote}>كل نجمة تقرّب الشروق فوق الأفق</span>
          </div>
        </header>

        <div className={s.mapGrid}>
          <nav aria-label="مستويات العالم" className={s.mapNav}>
            <div className={s.onlyV}>
              <Constellation L={v} id={`${id}v`} />
            </div>
            <div className={s.onlyH}>
              <Constellation L={h} id={`${id}h`} />
            </div>
          </nav>

          <aside className={s.mapAside}>
            <section className={s.curCard} aria-labelledby="cur-t">
              <p className={s.curKicker}>
                المستوى التالي · الوحدة {ar(WORLD.current.unit)}
              </p>
              <h2 id="cur-t" className={s.curTitle}>
                الدرس {ar(cur.n)}: {cur.title}
              </h2>
              <p className={s.curMastery}>
                <span className={s.mDot} data-m={cur.mastery} aria-hidden />
                {MASTERY[cur.mastery].label}: أجب عن {ar(4)} أسئلة على الأقل لنقيس إتقانك.
              </p>
              <ul className={s.curStars}>
                <li>
                  <RatingStar earned={false} className={s.miniStar} /> الإتمام: حرّر القناديل وأجب عن {ar(3)} أسئلة
                </li>
                <li>
                  <RatingStar earned={false} className={s.miniStar} /> المعرفة: دقة {ar(80)}٪ على {ar(5)} أسئلة
                </li>
                <li>
                  <RatingStar earned={false} className={s.miniStar} /> المهارة: {ar(LEVEL.par)} طلقات أو أقل
                </li>
              </ul>
              <Link href="?screen=scene" className={s.goldBtn}>
                ابدأ المستوى <ArrowLeft size={20} aria-hidden />
              </Link>
            </section>

            <section className={s.legend} aria-labelledby="lg-t">
              <h2 id="lg-t" className={s.legendTitle}>
                سطوع النجمة = إتقانك للدرس
              </h2>
              <ul className={s.legendList}>
                {legend.map((m) => (
                  <li key={m}>
                    <span className={s.legendOrb} data-m={m} style={{ "--glow": MASTERY[m].glow } as React.CSSProperties} aria-hidden>
                      {m === "locked" ? <Lock size={12} /> : <StarGlyph />}
                    </span>
                    {MASTERY[m].label}
                  </li>
                ))}
              </ul>
              <p className={s.legendNote}>الإتقان من آخر {ar(8)} إجابات في الدرس.</p>
            </section>
          </aside>
        </div>
        <LabNav current="map" />
      </div>
    </main>
  );
}

function LabNav({ current }: { current: Screen }) {
  return (
    <nav className={s.labNav} aria-label="شاشات المختبر">
      <span className={s.labTag}>مختبر · الاتجاه ب «مرصد البلّور»</span>
      {SCREENS.map((x) => (
        <Link key={x.key} href={`?screen=${x.key}`} className={s.labLink} aria-current={x.key === current ? "page" : undefined}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

