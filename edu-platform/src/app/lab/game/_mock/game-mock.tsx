"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, Lightbulb, Map as MapIcon, RotateCcw, Sparkles, Star, Volume2, Zap } from "lucide-react";
import { ar } from "@/lib/design";
import { SPIKE_LAYOUTS } from "@/game/spike/layouts";
import { ANGLE_STEPS, POWER_STEPS, aimVelocity } from "@/game/spike/det";
import { DEMO, DIRECTIONS, type DirKey } from "./directions";
import a from "./a.module.css";
import b from "./b.module.css";
import c from "./c.module.css";

const CSS = { a, b, c };
export type MockState = "aim" | "question" | "result";
const LETTERS = ["أ", "ب", "ج", "د"];
const LAYOUT = SPIKE_LAYOUTS.find((l) => l.key === "lightbox-heart")!;
const AIM = { angle: 22, power: 21 };

function MeteorGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <path d="M30 2 14 13l5 5L30 2Z" fill="currentColor" opacity=".45" />
      <circle cx="11" cy="21" r="8" fill="currentColor" />
      <circle cx="8.5" cy="18.5" r="2.4" fill="#fff" opacity=".55" />
    </svg>
  );
}

/** حقل نجوم ثابت (مواضع محسوبة لا عشوائية) مع نجوم لامعة قليلة؛ بلا هلال لأن لكل اتجاه قمره */
let seed = 20261106;
const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const STARS = Array.from({ length: 70 }, (_, i) => ({ x: rnd() * 1000, y: 10 + rnd() * 560, r: 1 + (i % 3) * 0.6, o: 0.45 + rnd() * 0.5 }));
function StarField({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      {STARS.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff7df" opacity={st.o} />
      ))}
      {[[180, 120], [620, 80], [820, 260], [360, 300]].map(([x, y], i) => (
        <path key={i} transform={`translate(${x} ${y}) scale(${i % 2 ? 0.9 : 1.3})`} d="M0-14C1.5-4 4-1.5 14 0 4 1.5 1.5 4 0 14-1.5 4-4 1.5-14 0-4-1.5-1.5-4 0-14Z" fill="#ffe29a" />
      ))}
    </svg>
  );
}

/** نموذج مختبر لا يكتب شيئًا: يبني المشهد الحقيقي (Rapier + three) بحالة ثابتة للتصوير والمقارنة */
/**
 * الرسوم المشتركة (الأفق والشمس والنجوم اللامعة) تأتي من صفحة الخادم جاهزة: استيرادها هنا في مكوّن عميل
 * يجعل Turbopack يُبقي صادراتها في المقطع المشترك لكل المسارات (+145 بايت مضغوطة لكل صفحة، مقيس).
 */
export type MockArt = { skyline: ReactNode; sun: ReactNode; sparkle: ReactNode; sparkleWhite: ReactNode };

export function GameMock({ dir, state, art }: { dir: DirKey; state: MockState; art: MockArt }) {
  const s = CSS[dir];
  const d = DIRECTIONS[dir];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [angle, setAngle] = useState(AIM.angle);
  const [power, setPower] = useState(AIM.power);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const [{ loadRapier }, { createSim }, { createRenderer }] = await Promise.all([
        import("@/game/spike/rapier-loader"),
        import("@/game/spike/sim"),
        import("@/game/spike/render"),
      ]);
      const R = await loadRapier("split");
      if (disposed || !canvasRef.current) return;
      const sim = createSim(R, LAYOUT);
      if (state !== "aim") sim.runShot(LAYOUT.shots[0]);
      if (state === "result") for (const shot of LAYOUT.shots.slice(1)) sim.runShot(shot);
      const r = createRenderer(canvasRef.current, { style: d.style, quality: "high", maxBodies: LAYOUT.bodies.length + 4, view: { minX: 8.8, maxX: 37.6, minY: -0.6, maxY: 5.6 } });
      const draw = () => {
        r.draw(sim);
        // محاذاة طبقات DOM (الأفق والبحر) مع أرضية المشهد ثلاثي الأبعاد في أي نسبة عرض
        rootRef.current?.style.setProperty("--horizon", `${(r.projectY(0, -34) * 100).toFixed(2)}%`);
        rootRef.current?.style.setProperty("--shore", `${(r.projectY(0, -4) * 100).toFixed(2)}%`);
      };
      r.setLauncher(((5 + (75 * AIM.angle) / ANGLE_STEPS) * Math.PI) / 180);
      if (state === "aim") {
        const v = aimVelocity(AIM.angle, AIM.power);
        r.setGuide(Array.from({ length: 11 }, (_, i) => {
          const t = 0.07 * (i + 1);
          return { x: 34 + v.vx * t, y: 2.2 + v.vy * t - 4.905 * t * t };
        }));
      }
      draw();
      // المنطقة الآمنة: أسفل شريط الخانات وأعلى لوح التصويب/السؤال (في الوضع العمودي فقط؛ الأفقي يترك الوسط فارغًا للوح)
      const fitSafeArea = () => {
        const root = rootRef.current;
        if (!root) return;
        const H = root.clientHeight || 1;
        const top = (root.querySelector("[data-hud-top]")?.getBoundingClientRect().bottom ?? 0) / H;
        const panel = root.querySelector("[data-hud-bottom]")?.getBoundingClientRect();
        const portrait = root.clientHeight > root.clientWidth;
        const bottom = panel && portrait ? (H - panel.top) / H : 0;
        r.setInsets(Math.min(top + 0.02, 0.35), Math.min(bottom + 0.01, 0.6));
      };
      fitSafeArea();
      draw();
      const onResize = () => {
        fitSafeArea();
        draw();
      };
      window.addEventListener("resize", onResize);
      setReady(true);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        r.dispose();
        sim.free();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [d.style, state]);

  const slots = [
    { kind: "used", label: "الافتتاح: شهاب مجاني" },
    { kind: "used", label: "الخانة ١: شهاب" },
    { kind: state === "aim" ? "now" : "used", label: "الخانة ٢: شهاب" },
    { kind: state === "question" ? "now" : "rest", label: "الخانة ٣" },
    { kind: "rest", label: "الخانة ٤" },
    { kind: "rest", label: "الخانة ٥" },
  ];
  const freed = state === "result" ? 4 : state === "question" ? 1 : 0;

  return (
    <div ref={rootRef} className={s.root} data-dir={dir} data-state={state} data-ready={ready ? "1" : "0"}>
      <div className={`${s.sky} ${state === "result" ? s.dawn : ""}`} aria-hidden>
        {state === "result" ? <span className={s.sun}>{art.sun}</span> : <StarField className={s.stars} />}
        {state !== "result" && <span className={s.moon} />}
        <span className={s.layerFar} />
        <div className={s.skyline}>{art.skyline}</div>
        <span className={s.layerNear} />
      </div>
      <canvas ref={canvasRef} className={s.canvas} aria-label="مشهد المستوى: برج من الخشب والسعف والزجاج يحبس أربعة قناديل" />
      {state === "question" && <div className={s.dim} aria-hidden />}

      <header className={s.topbar}>
        <a href="#" className={s.iconBtn} aria-label="العودة إلى خريطة الكوكبة">
          <ChevronRight aria-hidden />
        </a>
        <div className={s.titleBox}>
          <span className={s.world}>{DEMO.world}</span>
          <h1 className={s.title}>
            {DEMO.level}: {DEMO.levelTitle}
          </h1>
        </div>
        <div className={s.stats}>
          <span className={s.lanterns} aria-label={`القناديل المحررة ${ar(freed)} من ${ar(4)}`}>
            <Sparkles aria-hidden />
            {ar(freed)}/{ar(4)}
          </span>
          <button type="button" className={s.iconBtn} aria-label="كتم الأصوات">
            <Volume2 aria-hidden />
          </button>
        </div>
      </header>

      <div className={s.slotBar} data-hud-top>
        <ol className={s.slots} aria-label="الخانات: كل خانة سؤال ثم طلقة">
          {slots.map((x, i) => (
            <li key={i} className={`${s.slot} ${s[x.kind]}`} aria-label={x.label}>
              {x.kind === "rest" ? <span className={s.qmark}>؟</span> : <MeteorGlyph className={s.glyph} />}
            </li>
          ))}
        </ol>
        <span className={s.stash} aria-label="قذيفة خاصة مخزّنة: مذنّب ثلاثي">
          <Zap aria-hidden />
          {ar(1)}
        </span>
        <span className={s.demoTag}>تجريبي</span>
      </div>

      {state === "aim" && (
        <section className={s.aimPanel} aria-label="التصويب" data-hud-bottom>
          <div className={s.ammo}>
            <MeteorGlyph className={s.ammoGlyph} />
            <div>
              <strong>شهاب</strong>
              <span>اسحب من المِرقاب أو استخدم المنزلقين</span>
            </div>
          </div>
          <label className={s.slider}>
            <span>
              الزاوية <b>{ar(angle)}</b>
            </span>
            <input type="range" min={0} max={ANGLE_STEPS} step={1} value={angle} onChange={(e) => setAngle(+e.target.value)} aria-valuetext={`الزاوية ${ar(angle)} من ${ar(ANGLE_STEPS)}`} />
          </label>
          <label className={s.slider}>
            <span>
              القوة <b>{ar(power)}</b>
            </span>
            <input type="range" min={0} max={POWER_STEPS} step={1} value={power} onChange={(e) => setPower(+e.target.value)} aria-valuetext={`القوة ${ar(power)} من ${ar(POWER_STEPS)}`} />
          </label>
          <button type="button" className={s.fire}>
            أطلق الشهاب
          </button>
        </section>
      )}

      {state === "question" && (
        <section className={s.sheet} role="dialog" aria-modal="false" aria-labelledby="q-stem" data-hud-bottom>
          <div className={s.qhead}>
            <span className={s.qchip}>
              <BookOpen aria-hidden /> سؤال الخانة {ar(3)}
            </span>
            <button type="button" className={s.challenge}>
              <Star aria-hidden /> تحدٍّ: سؤال أصعب
            </button>
          </div>
          <h2 id="q-stem" className={s.stem}>
            {DEMO.stem}
          </h2>
          <ul className={s.choices}>
            {DEMO.choices.map((ch, i) => (
              <li key={i}>
                <button type="button" className={s.choice}>
                  <span className={s.letter}>{LETTERS[i]}</span>
                  <span>{ch}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={s.hint}>
            <Lightbulb aria-hidden /> الإجابة الصحيحة تمنحك شهابًا، والخاطئة حصاة خفيفة مع الشرح.
          </p>
        </section>
      )}

      {state === "result" && (
        <section className={s.result} aria-labelledby="r-title">
          <div className={s.resultCard}>
            <span className={s.sparkA}>{art.sparkle}</span>
            <span className={s.sparkB}>{art.sparkleWhite}</span>
            <p className={s.eyebrow}>أشرق الفجر فوق الساحل</p>
            <h2 id="r-title" className={s.resultTitle}>
              حرّرت القناديل الأربعة!
            </h2>
            <ul className={s.starRow}>
              {[
                { on: true, name: "الإتمام", why: `حرّرت كل القناديل وأجبت عن ${ar(5)} أسئلة` },
                { on: true, name: "المعرفة", why: `${ar(4)} من ${ar(5)} إجابات صحيحة (${ar(80)}٪)` },
                { on: false, name: "المهارة", why: `استخدمت ${ar(5)} طلقات، والهدف ${ar(2)} أو أقل` },
              ].map((x) => (
                <li key={x.name} className={`${s.starItem} ${x.on ? s.starOn : s.starOff}`}>
                  <Star aria-hidden className={s.starIcon} />
                  <strong>نجمة {x.name}</strong>
                  <span>{x.why}</span>
                </li>
              ))}
            </ul>
            <div className={s.mistake}>
              <strong>راجع سؤالًا واحدًا:</strong> «{DEMO.stem}»
              <span>{DEMO.reference}</span>
            </div>
            <div className={s.actions}>
              <button type="button" className={s.fire}>
                المستوى التالي
              </button>
              <button type="button" className={s.ghost}>
                <RotateCcw aria-hidden /> أعد المحاولة
              </button>
              <button type="button" className={s.ghost}>
                <MapIcon aria-hidden /> الخريطة
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
