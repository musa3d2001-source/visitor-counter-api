"use client";
/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): شاشات الاتجاه الفني ج «سماء الشروق».
 * النصوص كلها في DOM فوق الـ canvas؛ three.js يُحمَّل كسولًا بـ import() داخل SkyCanvas فقط.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Lock, Map as MapIcon, Minus, Pause, Play, Plus, RotateCcw, Sparkles, Volume2, VolumeX, X } from "../_game-kit/icons";
import { ar, count } from "../_game-kit/fmt";
import { GW, LETTERS, LEVEL, MASTERY, QUESTION, RESULTS, SCREENS, WORLD, worldProgress, type ChoiceKey, type MapStar, type MapUnit, type Mastery, type Screen } from "./data";
import type { SceneHandle } from "./scene";
import s from "./game-c.module.css";

type Props = { screen: Screen; state: "ask" | "wrong"; freed: number; quality: "high" | "low"; skyline: ReactNode };

export function GameCLab({ screen, state, freed, quality, skyline }: Props) {
  if (screen === "results") return <Results skyline={skyline} />;
  if (screen === "map") return <WorldMap skyline={skyline} />;
  return <Level screen={screen} state={state} freed={freed} quality={quality} skyline={skyline} />;
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

/** ألوان السماء نفسها في المشهد ثلاثي الأبعاد: [ارتفاع، ليل، شروق] */
const SKY: [number, string, string][] = [
  [0.0, "#24357E", "#FFC531"],
  [0.07, "#1E2E73", "#FF9F43"],
  [0.15, "#1A2766", "#FF6B5A"],
  [0.25, "#16215C", "#E2508F"],
  [0.38, "#121B52", "#A04AD8"],
  [0.55, "#0E1748", "#5B44D6"],
  [0.75, "#0B1240", "#3A36B8"],
  [1.0, "#070D2E", "#24288F"],
];
function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(" ")})`;
}
/** سماء بأشرطة حادة (toon) لأي نسبة فجر، بالقاعدة نفسها في مظلّل المشهد */
function skyGradient(dawn: number) {
  const stops: string[] = [];
  SKY.forEach(([h, n, d], i) => {
    const t = Math.min(1, Math.max(0, dawn * 1.35 - h * 0.55));
    const c = mix(n, d, t);
    const from = Math.round(h * 100);
    const to = i < SKY.length - 1 ? Math.round(SKY[i + 1][0] * 100) : 100;
    stops.push(`${c} ${from}%`, `${c} ${to}%`);
  });
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

/** شهاب: نواة ذهبية وذيل مرجاني وردي */
function MeteorGlyph({ className, dim }: { className?: string; dim?: boolean }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}t`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D9468F" stopOpacity="0" />
          <stop offset=".6" stopColor="#FF6B5A" stopOpacity={dim ? 0.3 : 0.9} />
          <stop offset="1" stopColor="#FFC531" stopOpacity={dim ? 0.3 : 1} />
        </linearGradient>
      </defs>
      <path d="M31 1 L10 15 L17 22 Z" fill={`url(#${id}t)`} />
      <circle cx="11" cy="21" r="7.5" fill={dim ? "#3B4888" : "#FFD84A"} stroke={dim ? "#6070B0" : "#141A3A"} strokeWidth="2" />
      {!dim && <circle cx="8.6" cy="18.6" r="2.4" fill="#fff" opacity=".9" />}
    </svg>
  );
}
function PebbleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
      <path d="M7 20c0-6 5-10 10-10s9 4 9 9-4 8-10 8-9-2-9-7Z" fill="#6070B0" stroke="#8A98D0" strokeWidth="2" />
    </svg>
  );
}
function HeavyGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
      <circle cx="16" cy="16" r="11" fill="#A04AD8" stroke="#141A3A" strokeWidth="2.4" />
      <path d="M10 13l4 2-1 4 5-2 3 3" fill="none" stroke="#FFE39A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="2.2" fill="#fff" opacity=".7" />
    </svg>
  );
}
function LanternGlyph({ className, lit }: { className?: string; lit: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 32" aria-hidden focusable="false">
      {lit && <circle cx="12" cy="18" r="11.5" fill="#FFC531" opacity=".3" />}
      <path d="M5 10h14l-3-5H8Z" fill={lit ? "#FF6B5A" : "#4A5794"} stroke="#141A3A" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="6" y="10" width="12" height="15" rx="3" fill={lit ? "#FFD84A" : "#26306A"} stroke={lit ? "#141A3A" : "#6070B0"} strokeWidth="1.6" />
      <path d="M8 27h8" stroke={lit ? "#FF6B5A" : "#6070B0"} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="12" cy="3.5" r="2" fill="none" stroke={lit ? "#FFC531" : "#6070B0"} strokeWidth="1.6" />
    </svg>
  );
}
function StarGlyph({ className, on, size = 28 }: { className?: string; on: boolean; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7L12 17.8l-6.2 3.3 1.2-7L1.9 9.2l7-1Z"
        fill={on ? "#FFC531" : "none"}
        stroke={on ? "#141A3A" : "currentColor"}
        strokeWidth={on ? 1.6 : 1.8}
        strokeLinejoin="round"
        strokeDasharray={on ? undefined : "3 2.4"}
      />
      {on && <path d="M9 8.6l1.6-.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/* ═════════════ canvas المشهد ═════════════ */

function SkyCanvas({ angle, power, freed, quality, skylineSvg, launchKey, onAim }: { angle: number; power: number; freed: number; quality: "high" | "low"; skylineSvg: string; launchKey: number; onAim?: (a: number, p: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const reduced = useReducedMotion();
  const init = useRef({ angle, power, freed });
  init.current = { angle, power, freed };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    let h: SceneHandle | null = null;
    import("./scene")
      .then(({ createScene }) => {
        if (dead || !host.current) return;
        try {
          h = createScene(host.current, { ...init.current, reducedMotion: reduced, quality, skylineSvg });
          handle.current = h;
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      h?.destroy();
      handle.current = null;
    };
  }, [reduced, quality, skylineSvg]);

  useEffect(() => handle.current?.setAim(angle, power), [angle, power]);
  useEffect(() => handle.current?.setFreed(freed), [freed]);
  useEffect(() => {
    if (launchKey) handle.current?.launch();
  }, [launchKey]);

  // السحب كالنابض: عكس اتجاه السحب هو اتجاه الإطلاق، وطوله القوة (مكمّم إلى خطوات صحيحة)
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!onAim) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !onAim) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (dx * dx + dy * dy < 100) return;
    const a = Math.round((Math.atan2(dy, Math.max(dx, 1)) * 180) / Math.PI);
    const p = Math.round(Math.min(1, Math.sqrt(dx * dx + dy * dy) / 220) * 100);
    onAim(Math.max(10, Math.min(80, a)), Math.max(0, Math.min(100, p)));
  };
  const onUp = () => (drag.current = null);

  return (
    <div ref={host} className={s.canvasHost} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {failed && <p className={s.noGl}>تعذّر تشغيل الرسم ثلاثي الأبعاد على هذا الجهاز، فستعمل اللعبة في وضع الأسئلة فقط.</p>}
    </div>
  );
}

/* ═════════════ المشهد + لوح السؤال ═════════════ */

function Level({ screen, state, freed, quality, skyline }: { screen: "scene" | "question"; state: "ask" | "wrong"; freed: number; quality: "high" | "low"; skyline: ReactNode }) {
  const svgHost = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  useEffect(() => setSvg(svgHost.current?.innerHTML ?? ""), []);

  const [angle, setAngle] = useState(LEVEL.angle);
  const [power, setPower] = useState(LEVEL.power);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [special, setSpecial] = useState(false);
  const [launchKey, setLaunchKey] = useState(0);
  const [live, setLive] = useState("");
  const launch = useCallback(() => {
    setLaunchKey((k) => k + 1);
    setLive(`انطلق ${special ? "النيزك الثقيل" : "الشهاب"} بزاوية ${ar(angle)} درجة وقوة ${ar(power)}٪`);
  }, [angle, power, special]);

  const asking = screen === "question";
  // القنديل الأخير المحرر يُعرض في منتصف صعوده (إلا عند الصفر والاكتمال)
  const display = freed === 0 || freed === 3 ? freed : freed - 0.22;

  useEffect(() => {
    if (asking || paused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "BUTTON" || t.tagName === "A")) return;
      if (e.key === "ArrowUp") setAngle((a) => Math.min(80, a + 1));
      else if (e.key === "ArrowDown") setAngle((a) => Math.max(10, a - 1));
      else if (e.key === "ArrowLeft") setPower((p) => Math.min(100, p + 1));
      else if (e.key === "ArrowRight") setPower((p) => Math.max(0, p - 1));
      else if (e.key === " ") launch();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, paused, launch]);

  return (
    <main className={s.stage} data-screen={screen}>
      <div ref={svgHost} hidden>
        {skyline}
      </div>
      <div className={s.skyFallback} style={{ background: skyGradient(display / 3) }} aria-hidden />
      {svg && <SkyCanvas angle={angle} power={power} freed={display} quality={quality} skylineSvg={svg} launchKey={launchKey} onAim={asking ? undefined : (a, p) => (setAngle(a), setPower(p))} />}
      <h1 className="sr-only">
        مستوى {LEVEL.title}: حرّر القناديل بإطلاق الشهب من المِرقاب
      </h1>

      <TopHud freed={freed} muted={muted} onMute={() => setMuted((m) => !m)} onPause={() => setPaused(true)} />
      {!asking && (
        <AimDock angle={angle} power={power} setAngle={setAngle} setPower={setPower} special={special} setSpecial={setSpecial} onLaunch={launch} />
      )}
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {asking && <QuestionPanel initial={state} />}
      {paused && <PauseMenu freed={freed} quality={quality} onClose={() => setPaused(false)} />}
    </main>
  );
}

function TopHud({ freed, muted, onMute, onPause }: { freed: number; muted: boolean; onMute: () => void; onPause: () => void }) {
  const dawn = freed / LEVEL.lanterns;
  const freedText = freed === 0 ? "لم يتحرر قنديل بعد" : freed >= LEVEL.lanterns ? "تحررت القناديل كلها" : `${count(freed, GW.lantern)} من ${ar(LEVEL.lanterns)}`;
  const track = { "--dawn": `${Math.round(dawn * 100)}%`, background: skyGradient(1).replace("to top", "to right") } as CSSProperties;
  const live = [
    { name: "الإتمام", on: false, why: "حرّر القناديل الثلاثة" },
    { name: "المعرفة", on: false, why: "دقة ٨٠٪ على ٥ أسئلة" },
    { name: "المهارة", on: true, why: `حتى ${count(LEVEL.par, GW.shot)}` },
  ];
  return (
    <header className={s.topHud}>
      <div className={s.lessonCard}>
        <span className={s.subjectBadge}>{LEVEL.subject}</span>
        <span className={s.lessonText}>
          <span className={s.lessonMeta}>
            الوحدة {ar(LEVEL.unit)} · الدرس {ar(LEVEL.lesson)}
          </span>
          <span className={s.lessonTitle}>{LEVEL.title}</span>
        </span>
      </div>

      <div className={s.dawnCard}>
        <div className={s.dawnHead}>
          <span className={s.dawnLabel}>سماء الشروق</span>
          <span className={s.dawnValue}>{freedText}</span>
        </div>
        <div className={s.dawnTrack} style={track} role="img" aria-label={`تقدّم السماء نحو الشروق: ${freedText}`}>
          {Array.from({ length: LEVEL.lanterns }, (_, i) => (
            <span key={i} className={s.dawnMark} style={{ insetInlineStart: `${((i + 1) / LEVEL.lanterns) * 100}%` }} data-on={i < freed || undefined}>
              <LanternGlyph className={s.dawnLantern} lit={i < freed} />
            </span>
          ))}
          <span className={s.dawnSun} style={{ insetInlineStart: `${dawn * 100}%` }} />
        </div>
      </div>

      <div className={s.hudStars}>
        <ul className={s.starsLive} aria-label="نجوم المستوى">
          {live.map((x) => (
            <li key={x.name} className={s.starLive} data-on={x.on || undefined} title={x.why}>
              <StarGlyph on={x.on} size={24} />
              <span>{x.name}</span>
              <span className="sr-only">{x.on ? ": على المسار" : `: ${x.why}`}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={s.hudBtns}>
        <button type="button" className={s.iconBtn} onClick={onMute} aria-pressed={muted} aria-label={muted ? "تشغيل المؤثرات الصوتية" : "كتم المؤثرات الصوتية"}>
          {muted ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />}
        </button>
        <button type="button" className={s.iconBtn} onClick={onPause} aria-label="إيقاف مؤقت">
          <Pause size={22} aria-hidden />
        </button>
      </div>
    </header>
  );
}

function Stepper({ label, unit, value, min, max, onChange, id }: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void; id: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  const text = unit === "°" ? `${ar(value)} درجة` : `${ar(value)}٪`;
  return (
    <div className={s.stepper}>
      <label htmlFor={id} className={s.stepLabel}>
        {label}
        <output htmlFor={id} className={s.stepValue}>
          {ar(value)}
          {unit}
        </output>
      </label>
      <div className={s.stepRow}>
        <button type="button" className={s.stepBtn} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`إنقاص ${label}`}>
          <Minus size={20} aria-hidden />
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
          aria-valuetext={text}
          style={{ "--pct": `${pct}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" className={s.stepBtn} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`زيادة ${label}`}>
          <Plus size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function AimDock({ angle, power, setAngle, setPower, special, setSpecial, onLaunch }: { angle: number; power: number; setAngle: (v: number) => void; setPower: (v: number) => void; special: boolean; setSpecial: (v: boolean) => void; onLaunch: () => void }) {
  const left = LEVEL.slots - LEVEL.spent.length;
  return (
    <section className={s.dock} aria-label="التصويب والإطلاق">
      <div className={s.dockSlots}>
        <div className={s.slotsHead}>
          <span className={s.dockTitle}>الخانات</span>
          <span className={s.slotsLeft}>بقيت {count(left, GW.slot)}</span>
        </div>
        <ol className={s.slots}>
          {Array.from({ length: LEVEL.slots }, (_, i) => {
            const spent = LEVEL.spent[i];
            const isCur = i === LEVEL.spent.length;
            const label = spent ? (spent === "meteor" ? "خانة مستخدمة: شهاب" : "خانة مستخدمة: حصاة") : isCur ? "الخانة الحالية: شهاب جاهز" : "خانة قادمة: سؤال ثم طلقة";
            return (
              <li key={i} className={s.slot} data-state={spent ? "spent" : isCur ? "current" : "next"} aria-label={label}>
                {spent === "meteor" ? <MeteorGlyph className={s.slotIcon} dim /> : spent === "pebble" ? <PebbleGlyph className={s.slotIcon} /> : isCur ? <MeteorGlyph className={s.slotIcon} /> : <span aria-hidden>؟</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <button type="button" className={s.special} aria-pressed={special} onClick={() => setSpecial(!special)}>
        <HeavyGlyph className={s.specialIcon} />
        <span className={s.specialText}>
          <span className={s.specialName}>{LEVEL.special.name}</span>
          <span className={s.specialHint}>{special ? "سيُطلق بدل الشهاب" : LEVEL.special.hint}</span>
        </span>
        <span className={s.specialCount} aria-label={`لديك ${ar(LEVEL.special.count)}`}>×{ar(LEVEL.special.count)}</span>
      </button>

      <div className={s.aim}>
        <Stepper id="aim-angle" label="الزاوية" unit="°" value={angle} min={10} max={80} onChange={setAngle} />
        <Stepper id="aim-power" label="القوة" unit="٪" value={power} min={0} max={100} onChange={setPower} />
      </div>

      <button type="button" className={s.fire} onClick={onLaunch}>
        <Sparkles size={22} aria-hidden />
        <span>أطلق</span>
        <kbd className={s.kbd}>مسافة</kbd>
      </button>
    </section>
  );
}

/* ═════════════ لوح السؤال ═════════════ */

function QuestionPanel({ initial }: { initial: "ask" | "wrong" }) {
  const [phase, setPhase] = useState<"ask" | "wrong" | "right">(initial);
  const [picked, setPicked] = useState<ChoiceKey | null>(initial === "wrong" ? QUESTION.picked : null);
  const [ready, setReady] = useState(false);
  const titleId = useId();

  // زر «فهمت» يتفعّل بعد ١٫٥ ثانية من ظهور الشرح (§4.2)
  useEffect(() => {
    if (phase === "ask") return;
    setReady(false);
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [phase]);

  const answer = useCallback(
    (k: ChoiceKey) => {
      if (phase !== "ask") return;
      setPicked(k);
      setPhase(k === QUESTION.correct ? "right" : "wrong");
    },
    [phase],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0 && QUESTION.choices[i]) answer(QUESTION.choices[i].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  return (
    <div className={s.dim}>
      <section className={s.qPanel} role="dialog" aria-modal="true" aria-labelledby={titleId} data-phase={phase}>
        <div className={s.qBand} aria-hidden>
          <LanternGlyph className={s.qBandLantern} lit />
        </div>
        <header className={s.qHead}>
          <span className={s.qChip}>
            سؤال الخانة {ar(QUESTION.slot)} من {ar(LEVEL.slots)}
          </span>
          <span className={s.qReward}>
            <MeteorGlyph className={s.qRewardIcon} />
            الإجابة الصحيحة تمنحك شهابًا
          </span>
        </header>
        <h2 id={titleId} className={s.qStem}>
          {QUESTION.stem}
        </h2>
        <ul className={s.choices}>
          {QUESTION.choices.map((c, i) => {
            const isRight = phase !== "ask" && c.key === QUESTION.correct;
            const isWrong = phase === "wrong" && c.key === picked;
            const st = isRight ? "right" : isWrong ? "wrong" : phase === "ask" ? "idle" : "faded";
            return (
              <li key={c.key}>
                <button type="button" className={s.choice} data-state={st} data-key={c.key} onClick={() => answer(c.key)} aria-disabled={phase !== "ask"} aria-keyshortcuts={String(i + 1)}>
                  <span className={s.letter} aria-hidden>
                    {LETTERS[c.key]}
                  </span>
                  <span className="sr-only">{LETTERS[c.key]}: </span>
                  <span className={s.choiceText}>{c.text}</span>
                  {isRight && (
                    <span className={s.choiceTag} data-tone="right">
                      <Check size={16} aria-hidden /> الصحيحة
                    </span>
                  )}
                  {isWrong && (
                    <span className={s.choiceTag} data-tone="wrong">
                      <X size={16} aria-hidden /> إجابتك
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div aria-live="polite">
          {phase === "wrong" && (
            <div className={s.feedback}>
              <p className={s.fbTitle}>قريب! لنفهمها معًا</p>
              <p className={s.fbText}>{QUESTION.explanation}</p>
              <p className={s.ref}>
                <BookOpen size={18} aria-hidden />
                <span>{QUESTION.reference}</span>
              </p>
              <p className={s.fbNote}>
                <PebbleGlyph className={s.fbIcon} />
                هذه الخانة تطلق حصاة خفيفة، والشهاب ينتظرك في السؤال القادم.
              </p>
            </div>
          )}
          {phase === "right" && (
            <div className={s.feedback} data-tone="right">
              <p className={s.fbTitle}>أحسنت! ربحت شهابًا</p>
              <p className={s.fbText}>{QUESTION.explanation}</p>
              <p className={s.ref}>
                <BookOpen size={18} aria-hidden />
                <span>{QUESTION.reference}</span>
              </p>
            </div>
          )}
        </div>

        {phase !== "ask" && (
          <div className={s.qFoot}>
            <button type="button" className={s.gotIt} data-ready={ready || undefined} aria-disabled={!ready} onClick={() => ready && (location.href = "?screen=scene")}>
              <span className={s.gotFill} aria-hidden />
              <span className={s.gotLabel}>فهمت</span>
            </button>
          </div>
        )}
        {phase === "ask" && <p className={s.qKeys}>اختر بالنقر أو بالأرقام ١ إلى ٤. لا يوجد وقت محدد، خذ وقتك.</p>}
      </section>
    </div>
  );
}

/* ═════════════ قائمة الإيقاف (فيها روابط المختبر) ═════════════ */

function PauseMenu({ freed, quality, onClose }: { freed: number; quality: "high" | "low"; onClose: () => void }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.dim}>
      <section className={s.pause} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id} className={s.pauseTitle}>
          متوقف مؤقتًا
        </h2>
        <button ref={btn} type="button" className={s.fire} onClick={onClose}>
          <Play size={22} aria-hidden />
          <span>متابعة</span>
        </button>
        <Link className={s.ghostBtn} href="?screen=map">
          <MapIcon size={20} aria-hidden /> خريطة العالم
        </Link>
        <div className={s.labBox}>
          <p className={s.labTitle}>مختبر التصميم (للمراجعة فقط)</p>
          <nav className={s.labRow} aria-label="شاشات المختبر">
            {SCREENS.map((x) => (
              <Link key={x.key} className={s.labLink} href={`?screen=${x.key}`}>
                {x.label}
              </Link>
            ))}
          </nav>
          <p className={s.labTitle}>معاينة رحلة السماء</p>
          <nav className={s.labRow} aria-label="عدد القناديل المحررة">
            {[0, 1, 2, 3].map((n) => (
              <Link key={n} className={s.labLink} href={`?screen=scene&freed=${n}${quality === "low" ? "&quality=low" : ""}`} aria-current={n === freed ? "true" : undefined}>
                {n === 0 ? "ليل" : n === 3 ? "شروق" : count(n, GW.lantern)}
              </Link>
            ))}
          </nav>
          <Link className={s.labLink} href={`?screen=scene&freed=${freed}${quality === "low" ? "" : "&quality=low"}`}>
            {quality === "low" ? "الجودة العالية" : "الجودة المنخفضة"}
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ═════════════ رسم السماء في DOM (النتائج والخريطة) ═════════════ */

function SkyBand({ dawn, skyline, children, className }: { dawn: number; skyline: ReactNode; children?: ReactNode; className?: string }) {
  // مركز الشمس يصعد من تحت البحر (ليلًا) إلى فوق الأفق (عند الشروق)
  const sunCenter = 2 + Math.pow(dawn, 0.85) * 20;
  return (
    <div className={`${s.skyBand} ${className ?? ""}`} style={{ background: skyGradient(dawn) }}>
      <div className={s.bandStars} style={{ opacity: Math.max(0, 1 - dawn * 1.4) }} aria-hidden />
      <div className={s.bandSun} style={{ bottom: `${sunCenter}%`, opacity: dawn > 0.05 ? 1 : 0 }} aria-hidden />
      <div className={s.bandSkyline} style={{ color: mix("#0B1238", "#5A2A78", dawn) }} aria-hidden>
        {skyline}
      </div>
      <div className={s.bandSea} style={{ background: mix("#126A86", "#18B9A7", dawn) }} aria-hidden />
      {children}
    </div>
  );
}

/* ═════════════ النتائج ═════════════ */

function Results({ skyline }: { skyline: ReactNode }) {
  const acc = Math.round((RESULTS.correct / RESULTS.answered) * 100);
  return (
    <main className={s.page} data-screen="results">
      <SkyBand dawn={1} skyline={skyline} className={s.resultsHero}>
        <svg className={s.heroConst} viewBox="0 0 600 120" aria-hidden focusable="false">
          <path d="M60 80 L190 40 L300 70 L420 30 L540 76" fill="none" stroke="#FFF1C4" strokeWidth="2.5" strokeDasharray="7 7" opacity=".85" />
          {[
            [190, 40],
            [300, 70],
            [420, 30],
          ].map(([x, y]) => (
            <g key={x} transform={`translate(${x} ${y})`}>
              <circle r="26" fill="#FFC531" opacity=".3" />
              <path d="M0-22Q5-5 22 0Q5 5 0 22Q-5 5-22 0Q-5-5 0-22Z" fill="#FF9F43" />
              <path d="M0-16Q4-4 16 0Q4 4 0 16Q-4 4-16 0Q-4-4 0-16Z" fill="#FFE39A" />
            </g>
          ))}
          {[
            [60, 80],
            [540, 76],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="5" fill="#FFF1C4" />
          ))}
        </svg>
        <div className={s.heroText}>
          <p className={s.heroKicker}>
            {LEVEL.subject} · الوحدة {ar(LEVEL.unit)} · الدرس {ar(LEVEL.lesson)}
          </p>
          <h1 className={s.heroTitle}>أشرقت الشمس فوق المِرقاب!</h1>
          <p className={s.heroSub}>حرّرت القناديل الثلاثة في «{LEVEL.title}» فصارت نجومًا في كوكبتك.</p>
          <p className={s.heroPoints}>
            <Sparkles size={18} aria-hidden /> {ar(RESULTS.points)} {GW.point.acc} للمتعة
          </p>
        </div>
      </SkyBand>

      <div className={s.resultsBody}>
        <section aria-labelledby="stars-h">
          <h2 id="stars-h" className={s.sectionTitle}>
            نجوم المستوى
            <span className={s.sectionNote}>كل نجمة مستقلة، وما تكسبه يبقى لك</span>
          </h2>
          <ul className={s.starCards}>
            {RESULTS.stars.map((st) => (
              <li key={st.key} className={s.starCard} data-earned={st.earned || undefined} data-key={st.key}>
                <div className={s.starBadge}>
                  <StarGlyph on={st.earned} size={56} />
                </div>
                <h3 className={s.starName}>نجمة {st.name}</h3>
                <p className={s.starStatus}>{st.earned ? "حصلت عليها" : "لم تكتمل بعد"}</p>
                <p className={s.starReason}>{st.reason}</p>
                {!st.earned && "missing" in st && (
                  <p className={s.starMissing}>
                    <strong>الشرط: </strong>
                    {st.missing}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <ul className={s.statRow} aria-label="ملخص الجولة">
          <li>
            <span className={s.statNum}>{ar(RESULTS.answered)}</span>
            <span className={s.statLabel}>أسئلة أجبت عنها</span>
          </li>
          <li>
            <span className={s.statNum}>{ar(RESULTS.correct)}</span>
            <span className={s.statLabel}>إجابات صحيحة</span>
          </li>
          <li>
            <span className={s.statNum}>{ar(acc)}٪</span>
            <span className={s.statLabel}>دقة الجولة</span>
          </li>
          <li>
            <span className={s.statNum}>
              {ar(RESULTS.shots)} / {ar(RESULTS.par)}
            </span>
            <span className={s.statLabel}>طلقاتك والحد</span>
          </li>
        </ul>

        <section aria-labelledby="mistakes-h" className={s.mistakes}>
          <h2 id="mistakes-h" className={s.sectionTitle}>
            راجع أخطاءك
            <span className={s.sectionNote}>{count(RESULTS.mistakes.length, GW.question)} من كتابك، مع الصفحة</span>
          </h2>
          <ol className={s.mistakeList}>
            {RESULTS.mistakes.map((m, i) => (
              <li key={i} className={s.mistake}>
                <p className={s.mStem}>{m.stem}</p>
                <div className={s.mPair}>
                  <p className={s.mYours}>
                    <X size={16} aria-hidden />
                    <span>
                      <span className={s.mLbl}>إجابتك: </span>
                      {m.yours}
                    </span>
                  </p>
                  <p className={s.mRight}>
                    <Check size={16} aria-hidden />
                    <span>
                      <span className={s.mLbl}>الصحيحة: </span>
                      {m.right}
                    </span>
                  </p>
                </div>
                <p className={s.ref}>
                  <BookOpen size={18} aria-hidden />
                  <span>{m.reference}</span>
                </p>
              </li>
            ))}
          </ol>
        </section>

        <nav className={s.resultsActions} aria-label="بعد المستوى">
          <Link className={s.fire} href="?screen=scene&freed=1">
            <span>المستوى التالي</span>
            <ArrowLeft size={22} aria-hidden />
          </Link>
          <Link className={s.retry} href="?screen=scene&freed=0">
            <RotateCcw size={20} aria-hidden />
            <span>أعد المحاولة</span>
          </Link>
          <Link className={s.textLink} href="?screen=map">
            <MapIcon size={18} aria-hidden /> خريطة العالم
          </Link>
        </nav>
        <p className={s.demoNote}>مختبر تصميم: بيانات تجريبية للمعاينة، ليست نتيجة طالب حقيقي.</p>
      </div>
    </main>
  );
}

/* ═════════════ خريطة العالم ═════════════ */

const BRIGHT: Record<Mastery, { r: number; halo: number; fill: string; inner: string; stroke: string }> = {
  mastered: { r: 17, halo: 0.55, fill: "#FF9F43", inner: "#FFE39A", stroke: "#141A3A" },
  progressing: { r: 14, halo: 0.32, fill: "#FFC531", inner: "#FFF1C4", stroke: "#141A3A" },
  review: { r: 13, halo: 0.18, fill: "#FF6B5A", inner: "#FFC7B8", stroke: "#141A3A" },
  few: { r: 12, halo: 0, fill: "#3B4888", inner: "#C9D3FF", stroke: "#C9D3FF" },
  locked: { r: 11, halo: 0, fill: "#1A2766", inner: "#1A2766", stroke: "#4A5794" },
};

function starPath(r: number, points = 4) {
  const k = r * 0.28;
  if (points === 4) return `M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}Z`;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const rr = i % 2 ? r * 0.5 : r;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

function MapNode({ st, unit }: { st: MapStar; unit: MapUnit }) {
  const b = BRIGHT[st.mastery];
  const r = st.challenge ? b.r + 5 : b.r;
  const earned = st.stars.filter(Boolean).length;
  const label = `${st.challenge ? `تحدّي الوحدة ${ar(unit.n)}` : `الدرس: ${st.name}`}، ${MASTERY[st.mastery].label}${st.mastery === "locked" ? "" : `، ${earned ? `${count(earned, { one: "نجمة", two: "نجمتان", plural: "نجوم", acc: "نجمة", oneSuffix: "واحدة" })} من ٣` : "بلا نجوم بعد"}`}${st.current ? "، أنت هنا" : ""}`;
  const locked = st.mastery === "locked";
  const inner = (
    <>
      <circle r="24" fill="transparent" />
      {b.halo > 0 && <circle r={r * 2.1} fill="#FFC531" opacity={b.halo * 0.5} />}
      {b.halo > 0 && <circle r={r * 1.45} fill="#FFC531" opacity={b.halo * 0.7} />}
      {st.current && <circle r={r + 9} fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeDasharray="5 4" className={s.hereRing} />}
      <path d={starPath(r, st.challenge ? 8 : 4)} fill={b.fill} stroke={b.stroke} strokeWidth="2.2" strokeLinejoin="round" />
      {!locked && <path d={starPath(r * 0.6, st.challenge ? 8 : 4)} fill={b.inner} />}
      {locked && (
        <g transform="translate(-6 -7)" stroke="#8A98D0" strokeWidth="2" fill="none">
          <rect x="0" y="6" width="12" height="9" rx="2" fill="#26306A" />
          <path d="M2.5 6V4a3.5 3.5 0 0 1 7 0v2" />
        </g>
      )}
      <text y={r + 20} textAnchor="middle" className={s.nodeName} data-locked={locked || undefined}>
        {st.challenge ? "تحدّي الوحدة" : st.name}
      </text>
      {!locked && (
        <g transform={`translate(-21 ${r + 28})`}>
          {st.stars.map((on, i) => (
            <path key={i} transform={`translate(${i * 15} 0) scale(.55)`} d="M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7L12 17.8l-6.2 3.3 1.2-7L1.9 9.2l7-1Z" fill={on ? "#FFC531" : "none"} stroke={on ? "#141A3A" : "#8A98D0"} strokeWidth="2.2" />
          ))}
        </g>
      )}
    </>
  );
  return (
    <g transform={`translate(${st.x} ${st.y})`}>
      {locked ? (
        <g role="img" aria-label={label}>
          {inner}
        </g>
      ) : (
        <a href="?screen=scene" aria-label={label} className={s.nodeLink}>
          {inner}
        </a>
      )}
    </g>
  );
}

function WorldMap({ skyline }: { skyline: ReactNode }) {
  const p = worldProgress();
  return (
    <main className={`${s.page} ${s.mapPage}`} data-screen="map">
      <SkyBand dawn={p.dawn} skyline={skyline} className={s.mapHero}>
        <div className={s.mapHead}>
          <Link className={s.iconBtn} href="?screen=scene" aria-label="العودة إلى المستوى">
            <ArrowLeft size={22} aria-hidden style={{ transform: "scaleX(-1)" }} />
          </Link>
          <div>
            <p className={s.heroKicker}>
              {WORLD.grade} · {WORLD.term}
            </p>
            <h1 className={s.mapTitle}>عالم {WORLD.subject}</h1>
          </div>
        </div>
        <div className={s.mapProgress}>
          <p className={s.mapProgText}>
            أكملت <strong>{count(p.done, GW.level)}</strong> من {ar(p.total)}، والسماء تقترب من الشروق
          </p>
          <div className={s.mapBar} role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-valuetext={`${ar(p.done)} من ${ar(p.total)}`} aria-label="تقدّم العالم">
            <span style={{ width: `${p.dawn * 100}%` }} />
          </div>
        </div>
      </SkyBand>

      <div className={s.mapBody}>
        <ul className={s.legend} aria-label="سطوع النجمة يعكس الإتقان">
          {(Object.keys(MASTERY) as Mastery[]).map((m) => (
            <li key={m}>
              <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden>
                {BRIGHT[m].halo > 0 && <circle r="14" fill="#FFC531" opacity={BRIGHT[m].halo * 0.6} />}
                <path d={starPath(10)} fill={BRIGHT[m].fill} stroke={BRIGHT[m].stroke} strokeWidth="1.8" />
              </svg>
              <span>
                <strong>{MASTERY[m].label}</strong> <span className={s.legendHint}>{MASTERY[m].hint}</span>
              </span>
            </li>
          ))}
        </ul>

        <ol className={s.clusters}>
          {WORLD.units.map((u) => {
            const locked = u.stars.every((x) => x.mastery === "locked");
            const pts = u.stars.map((x) => `${x.x},${x.y}`).join(" ");
            return (
              <li key={u.n} className={s.cluster} data-locked={locked || undefined} style={{ "--u": u.color } as CSSProperties}>
                <h2 className={s.clusterTitle}>
                  <span className={s.unitNum}>{ar(u.n)}</span>
                  <span>
                    <span className={s.unitLbl}>الوحدة {ar(u.n)}</span>
                    {u.title}
                  </span>
                  {locked && <Lock size={18} aria-label="مقفلة" />}
                </h2>
                <svg className={s.clusterSvg} viewBox="0 0 320 240" role="group" aria-label={`مستويات الوحدة ${ar(u.n)}`}>
                  <polyline points={pts} fill="none" stroke={locked ? "#4A5794" : u.color} strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" opacity=".9" />
                  {u.stars.map((st) => (
                    <MapNode key={st.id} st={st} unit={u} />
                  ))}
                </svg>
              </li>
            );
          })}
        </ol>
        <p className={`${s.demoNote} ${s.demoNight}`}>مختبر تصميم: بيانات تجريبية للمعاينة. كل وحدة عنقود، وكل درس نجمة، وتحدّي الوحدة في آخرها.</p>
      </div>
    </main>
  );
}
