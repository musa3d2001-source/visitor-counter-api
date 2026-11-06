"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type * as React from "react";
import { createPortal } from "react-dom";
import { ANGLE_STEPS, POWER_STEPS, YAW_CENTER, YAW_STEPS, speedOf } from "@/game/core/aim-table";
import type { Shot } from "@/game/core/sim";
import type { EngineSnapshot, Game } from "@/game/game";
import { dragToAim, isDrag, keyToCommand, targetHandlesKey, type AimSteps } from "@/game/input";
import { skyCss } from "@/game/render/style";
import { guidePoints } from "@/game/rules/guide";
import { runStars, STAR } from "@/game/rules/stars";

/**
 * مشغّل معاينة التصاميم للمالك: المحرك الحقيقي (createGame) بملء الشاشة، بلا أسئلة بعد.
 * three و Rapier والمحرك والتصاميم كلها بـ import() عند الضغط على «العب»، فلا تدخل حزمة أي صفحة أخرى.
 * الرمية الأولى شهاب مجاني، وكل خانة بعدها شهاب، والنيزك الثقيل من زر. النجوم محسوبة بـ runStars
 * بإجابات افتراضية (٥ من ٥) لأن المعاينة بلا أسئلة.
 */
export type LevelSummary = { key: string; title: string; tier: number; slots: number; par: number; bodies: number; lanterns: number; reward: string };
export type PlayRequest = { key: string; nonce: number };

type PlayState = "loading" | "ready" | "error" | "lost";
type NextAmmo = "meteor" | "heavy";

const AR = "٠١٢٣٤٥٦٧٨٩";
/** أرقام هندية (نسخة محلية: لا نستورد @/lib/design في مكوّن عميل حتى لا يكبر مقطع كل المسارات) */
const arNum = (n: number | string) => String(n).replace(/\d/g, (d) => AR[Number(d)]);
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);
/** الصف المفترض للمعاينة (ملاءمة العمر للمرحلة المتوسطة) */
const PREVIEW_GRADE = 7;
/** إجابات افتراضية للنجوم: المعاينة بلا أسئلة */
const PLACEHOLDER_ANSWERS = { answered: 5, correct: 5 } as const;
const rafTwice = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** بذرة العرض من مفتاح التصميم (الشكل نفسه في كل فتح؛ لا تمس الفيزياء) */
function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** «رمية واحدة»، «رميتان»، «٣ رميات»، «١١ رمية» */
function throwsWord(n: number): string {
  if (n === 1) return "رمية واحدة";
  if (n === 2) return "رميتان";
  if (n >= 3 && n <= 10) return `${arNum(n)} رميات`;
  return `${arNum(n)} رمية`;
}

/** بعد حرف الجر: «برمية واحدة»، «برميتين»، «بـ٣ رميات»، «بـ١١ رمية» */
function byThrows(n: number): string {
  if (n === 1) return "برمية واحدة";
  if (n === 2) return "برميتين";
  return `بـ${throwsWord(n)}`;
}

function yawText(step: number): string {
  const d = step - YAW_CENTER;
  if (d === 0) return "مستقيم";
  return `${arNum(Math.abs(d))}° ${d > 0 ? "يمينًا" : "يسارًا"}`;
}

/** اشتراك React في لقطة المحرك (تتبدل المحركات مع تبديل التصميم) */
function useGameSnapshot(game: Game | null): EngineSnapshot | null {
  const subscribe = useCallback((cb: () => void) => (game ? game.subscribe(cb) : () => {}), [game]);
  const get = useCallback(() => (game ? game.getSnapshot() : null), [game]);
  return useSyncExternalStore(subscribe, get, () => null);
}

export function LevelsRunner({ levels, request, onConsume }: { levels: LevelSummary[]; request: PlayRequest | null; onConsume: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  /** false بعد مغادرة الصفحة: كل عمل غير متزامن يتوقف عنده */
  const alive = useRef(true);
  /** رقم جيل اللعب: كل إغلاق أو بدء جديد يُبطل تحميلًا قيد الانتظار */
  const playToken = useRef(0);
  const live = useRef<{ game: Game | null; canvas: HTMLCanvasElement | null; offs: (() => void)[] }>({ game: null, canvas: null, offs: [] });
  /** الإخفاقات المتتالية لكل تصميم (GAME_DESIGN §6.9: «في المستوى»)، لا عدّاد واحد مشترك */
  const failsByLevel = useRef(new Map<string, number>());
  const failsRef = useRef(0);
  const [game, setGame] = useState<Game | null>(null);
  const [open, setOpen] = useState(false);
  const [playState, setPlayState] = useState<PlayState>("loading");
  const [error, setError] = useState("");
  const [levelKey, setLevelKey] = useState(levels[0]?.key ?? "");
  const [ammo, setAmmo] = useState<NextAmmo>("meteor");
  const [fails, setFails] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const snap = useGameSnapshot(game);
  const ammoRef = useRef(ammo);
  ammoRef.current = ammo;
  const playStateRef = useRef(playState);
  playStateRef.current = playState;

  const level = levels.find((l) => l.key === levelKey) ?? levels[0];
  // كما في createSession: خانة إضافية بعد 3 إخفاقات متتالية في المستوى، والافتتاح المجاني فوق الخانات
  const maxShots = (level?.slots ?? 0) + 1 + (fails >= 3 ? 1 : 0);
  /** للمعالجات المسجّلة مرة واحدة (لوحة المفاتيح): آخر قيمة دائمًا */
  const maxShotsRef = useRef(maxShots);
  maxShotsRef.current = maxShots;

  /** canvas جديد لكل محرك (سياق WebGL جديد؛ القديم فُقد عمدًا عند التحرير) */
  function mountCanvas(): HTMLCanvasElement {
    const stage = stageRef.current;
    if (!stage) throw new Error("stage is not mounted");
    const c = document.createElement("canvas");
    c.className = "absolute inset-0 block size-full touch-none";
    c.setAttribute("aria-label", "مشهد اللعبة ثلاثي الأبعاد: اسحب لتوجيه المرقاب");
    stage.appendChild(c);
    return c;
  }

  function stopPlay() {
    playToken.current++;
    const p = live.current;
    for (const off of p.offs) off();
    p.game?.destroy();
    p.canvas?.remove();
    live.current = { game: null, canvas: null, offs: [] };
    if (alive.current) setGame(null);
  }

  function closePlay() {
    stopPlay();
    setOpen(false);
    setPlayState("loading");
    const back = returnFocus.current;
    requestAnimationFrame(() => back?.focus());
  }

  async function startPlay(key: string) {
    stopPlay();
    const token = ++playToken.current;
    if (!open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
    setPlayState("loading");
    setError("");
    setLevelKey(key);
    setAmmo("meteor");
    failsRef.current = failsByLevel.current.get(key) ?? 0;
    setFails(failsRef.current);
    try {
      const [{ loadRapierClient }, { createGame }, { getLevel }] = await Promise.all([
        import("@/game/physics/rapier-client"),
        import("@/game/game"),
        import("@/game/levels"),
        import("@/game/render/scene"),
      ]);
      const { R } = await loadRapierClient();
      await rafTwice();
      if (token !== playToken.current || !alive.current) return;
      const lvl = getLevel(key);
      if (!lvl) throw new Error(`level ${key} not found`);
      const q = new URLSearchParams(window.location.search).get("quality");
      const canvas = mountCanvas();
      const g = createGame({
        R,
        level: lvl,
        seed: seedOf(lvl.key),
        canvas,
        quality: q === "low" || q === "high" ? q : "auto",
        guidePoints: guidePoints(lvl.tier, PREVIEW_GRADE, failsRef.current),
      });
      const offs = [
        g.on("contextLost", () => {
          if (alive.current) setPlayState("lost");
        }),
        g.on("frame", (p) => {
          if (alive.current) setFrameMs(p.ms);
        }),
        g.on("settled", (p) => {
          // نفاد الخانات بلا تحرير الكل: «كِدت!»، وبعد 3 إخفاقات يطول دليل التصويب في المحاولة التالية
          const extra = failsRef.current >= 3 ? 1 : 0;
          if (!p.cleared && p.shot.idx + 1 >= lvl.slots + 1 + extra) {
            failsRef.current++;
            failsByLevel.current.set(lvl.key, failsRef.current);
            if (alive.current) setFails(failsRef.current);
          }
          if (p.cleared) {
            failsRef.current = 0;
            failsByLevel.current.set(lvl.key, 0);
            if (alive.current) setFails(0);
          }
        }),
      ];
      live.current = { game: g, canvas, offs };
      g.dispatch({ type: "aim", ...g.getSnapshot().aim, ammo: "meteor" });
      setGame(g);
      setPlayState("ready");
    } catch (e) {
      if (token === playToken.current && alive.current) {
        stopPlay();
        setPlayState("error");
        setError(errText(e));
      }
    }
  }

  function aimTo(a: AimSteps, nextAmmo: NextAmmo = ammoRef.current) {
    const g = live.current.game;
    if (!g || g.getSnapshot().status === "flight") return;
    g.dispatch({ type: "aim", ...a, ammo: g.getSnapshot().shotsFired === 0 ? "meteor" : nextAmmo });
  }

  function chooseAmmo(next: NextAmmo) {
    setAmmo(next);
    ammoRef.current = next;
    const g = live.current.game;
    if (g) aimTo(g.getSnapshot().aim, next);
  }

  function fire() {
    const g = live.current.game;
    if (!g || playStateRef.current !== "ready") return;
    const s = g.getSnapshot();
    if (s.status === "flight") {
      if (s.activatable) g.dispatch({ type: "activate" });
      return;
    }
    if (s.cleared || s.shotsFired >= maxShotsRef.current) return;
    // الافتتاح شهاب مجاني دائمًا، وكل خانة بعده شهاب ما لم يُختر النيزك الثقيل
    const kind = s.shotsFired === 0 ? "meteor" : ammoRef.current;
    const shot: Shot = { idx: s.shotsFired, ammo: kind, yawStep: s.aim.yawStep, angleStep: s.aim.angleStep, powerStep: s.aim.powerStep, activateAt: -1 };
    g.dispatch({ type: "fire", shot });
    if (kind === "heavy") {
      setAmmo("meteor");
      ammoRef.current = "meteor";
    }
  }

  // سحب كالنابض على المشهد؛ ولمسة أثناء الطيران تفعّل الخاصة (إن وُجدت)
  const drag = useRef<{ id: number; x: number; y: number; start: AimSteps; moved: boolean } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const g = live.current.game;
    if (!g || playStateRef.current !== "ready") return;
    const s = g.getSnapshot();
    if (s.status === "flight") {
      if (s.activatable) g.dispatch({ type: "activate" });
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: s.aim, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && !isDrag(dx, dy)) return;
    d.moved = true;
    aimTo(dragToAim(d.start, dx, dy, { w: e.currentTarget.clientWidth, h: e.currentTarget.clientHeight }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // طلب «العب» من بطاقة: يُستهلك فور البدء
  useEffect(() => {
    if (!request) return;
    void startPlay(request.key);
    onConsume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  // الفجر يتقدم مع القناديل المحررة (العالم الكامل يشرق في صفحة اللعب؛ هنا لكل تصميم)
  const dawn = snap && snap.lanterns ? snap.freed / snap.lanterns : 0;
  useEffect(() => {
    game?.dispatch({ type: "setDawn", progress: dawn });
  }, [game, dawn]);

  // ملء الشاشة: منع تمرير الصفحة، وجعل ما خلف الطبقة خاملًا، والمفاتيح؛ وكل ذلك يُستعاد عند الإغلاق أو المغادرة
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const stageEl = document.querySelector('[data-levels-stage="fixed"]');
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === stageEl || el.hasAttribute("inert") || el.tagName === "SCRIPT") continue;
      el.setAttribute("inert", "");
      inerted.push(el);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePlay();
        return;
      }
      const g = live.current.game;
      if (!g || playStateRef.current !== "ready") return;
      if (targetHandlesKey(e.target instanceof HTMLElement ? e.target : null, e)) return;
      const cmd = keyToCommand(e, g.getSnapshot().aim);
      if (!cmd) return;
      e.preventDefault();
      if (cmd.type === "aim") aimTo(cmd);
      else if (cmd.type === "fire") fire();
      // 1..4 للإجابة: لا أسئلة في هذه المعاينة
    };
    window.addEventListener("keydown", onKey);
    // التركيز على الحوار نفسه لا على زر الإغلاق: المسافة للرمي، وعلى زر الإغلاق كانت تغلق المعاينة
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      html.style.overflow = prevOverflow;
      for (const el of inerted) el.removeAttribute("inert");
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = playState === "ready" && !!snap;
  const flying = snap?.status === "flight";
  const outOfShots = !!snap && !snap.cleared && snap.status !== "flight" && snap.shotsFired >= maxShots;
  const locked = !ready || flying || !!snap?.cleared || outOfShots;
  const stars = runStars({
    mode: "scene",
    cleared: !!snap?.cleared,
    answered: PLACEHOLDER_ANSWERS.answered,
    correct: PLACEHOLDER_ANSWERS.correct,
    shotsUsed: snap?.shotsFired ?? 0,
    par: level?.par ?? 1,
  });
  const aim = snap?.aim ?? { yawStep: YAW_CENTER, angleStep: 0, powerStep: 0 };
  const idx = levels.findIndex((l) => l.key === levelKey);
  const next = idx >= 0 && idx + 1 < levels.length ? levels[idx + 1] : null;
  const hint =
    !ready || snap?.cleared || outOfShots
      ? ""
      : flying
        ? snap?.activatable
          ? "المس الشاشة الآن لتفعيل القذيفة"
          : "انتظر حتى تهدأ القطع…"
        : snap?.shotsFired === 0
          ? "الرمية الأولى شهاب مجاني. اسحب يمينًا ويسارًا للاتجاه، وإلى الأسفل لقوة أكبر"
          : "اسحب على المشهد، أو اضبط المنزلقات، ثم ارمِ";
  const starRow = [
    { bit: STAR.completion, label: "الإتمام" },
    { bit: STAR.knowledge, label: "المعرفة" },
    { bit: STAR.skill, label: "المهارة" },
  ];

  const sliders: { id: string; label: string; value: number; max: number; text: string; set: (v: number) => AimSteps }[] = [
    { id: "levels-yaw", label: "الاتجاه", value: aim.yawStep, max: YAW_STEPS, text: yawText(aim.yawStep), set: (v) => ({ ...aim, yawStep: v }) },
    { id: "levels-angle", label: "الارتفاع", value: aim.angleStep, max: ANGLE_STEPS, text: `${arNum(aim.angleStep)}°`, set: (v) => ({ ...aim, angleStep: v }) },
    { id: "levels-power", label: "القوة", value: aim.powerStep, max: POWER_STEPS, text: `${arNum(String(speedOf(aim.powerStep)).replace(".", "٫"))} م/ث`, set: (v) => ({ ...aim, powerStep: v }) },
  ];

  const stage = (
    <div
      dir="rtl"
      data-levels-stage="fixed"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={level ? `معاينة «${level.title}»` : "معاينة التصميم"}
      className="fixed inset-0 z-[80] overflow-hidden outline-none"
      style={{ background: skyCss(dawn) }}
    >
      <div ref={stageRef} className="absolute inset-0 touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

      {/* الشريط العلوي: التصميم والعدّادات والنجوم، وزر الإغلاق */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 pt-[max(12px,env(safe-area-inset-top))] ps-[max(12px,env(safe-area-inset-right))] pe-[max(12px,env(safe-area-inset-left))]">
        <div className="min-w-0 space-y-1.5">
          <div className="w-fit max-w-full rounded-2xl bg-black/60 px-3 py-2 text-white">
            <p className="truncate font-display text-[0.98rem] font-black">{level?.title}</p>
            {/* كبسولات منفصلة لا نقطة وسطى: «·» تشبه الصفر الهندي «٠» بجوار الأرقام */}
            <p role="status" className="mt-1 flex flex-wrap gap-1.5 text-[0.8rem] leading-6 font-bold">
              <span className="rounded-full bg-white/15 px-2">
                القناديل {arNum(snap?.freed ?? 0)} من {arNum(snap?.lanterns ?? level?.lanterns ?? 0)}
              </span>
              <span className="rounded-full bg-white/15 px-2">
                رمية {arNum(Math.min(snap?.shotsFired ?? 0, maxShots))} من {arNum(maxShots)}
              </span>
              <span className="rounded-full bg-white/15 px-2">الحد {arNum(level?.par ?? 0)}</span>
            </p>
            <p className="mt-1 text-[0.75rem] font-bold text-white/85 [@media(max-height:500px)]:hidden">
              الجودة {snap?.quality === "low" ? "منخفضة" : "عالية"}
              {frameMs ? `، ${arNum(Math.round(frameMs))} م.ث للإطار` : ""}
            </p>
          </div>
          <div className="flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-black/60 px-2.5 py-1.5 text-white" aria-label="النجوم المتوقعة">
            {starRow.map((s) => {
              const on = (stars.mask & s.bit) !== 0;
              return (
                <span
                  key={s.bit}
                  className={
                    on
                      ? "inline-flex items-center gap-1 rounded-full bg-[#ffd25a] px-2 py-0.5 font-display text-[0.78rem] font-black text-[#3a2400]"
                      : "inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-display text-[0.78rem] font-bold text-white"
                  }
                >
                  <span aria-hidden>{on ? "★" : "☆"}</span>
                  <span className="[@media(max-height:500px)]:sr-only">{s.label}</span>
                  <span className="sr-only">{on ? "مكتسبة" : "غير مكتسبة"}</span>
                </span>
              );
            })}
            <span className="text-[0.72rem] font-bold text-white/90">بلا أسئلة في هذه المعاينة</span>
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full bg-black/60 text-xl font-black text-white"
          aria-label="إغلاق المعاينة"
          onClick={closePlay}
        >
          ×
        </button>
      </div>

      {/* التحميل والخطأ وفقد السياق */}
      {playState !== "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <div role="status" className="pointer-events-auto max-w-sm rounded-2xl bg-black/65 px-5 py-4 text-center font-display font-bold text-white">
            {playState === "error" ? (
              <>
                <p>تعذّر تشغيل المعاينة: {error}</p>
                <button type="button" className="btn btn-3d btn-accent btn-md mt-3 min-h-11" onClick={() => startPlay(levelKey)}>
                  أعد المحاولة
                </button>
              </>
            ) : playState === "lost" ? (
              <>
                <p>توقف الرسم ثلاثي الأبعاد على هذا الجهاز. في صفحة الطالب تنتقل الجولة إلى وضع الأسئلة فقط.</p>
                <button type="button" className="btn btn-3d btn-accent btn-md mt-3 min-h-11" onClick={() => startPlay(levelKey)}>
                  أعد التشغيل
                </button>
              </>
            ) : (
              <p>جارٍ تحميل المحرك…</p>
            )}
          </div>
        </div>
      )}

      {/* النتيجة: إشراق أو «كِدت!» */}
      {ready && snap && snap.status !== "flight" && (snap.cleared || outOfShots) && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-10 grid place-items-center px-4 [@media(max-height:500px)]:top-[22%]">
          <div role="status" className="pointer-events-auto w-full max-w-sm rounded-3xl border-2 border-white bg-[#fffaf0] px-5 py-4 text-center text-ink shadow-2xl">
            {snap.cleared ? (
              <>
                <p className="font-display text-xl font-black">أشرق الصباح! تحررت كل القناديل</p>
                <p className="mt-1 text-[0.92rem] font-bold text-[#5b4300]">
                  {byThrows(snap.shotsFired)}، والحد {arNum(level?.par ?? 0)}
                  {stars.badges.includes("farqad-shot") ? " · شارة «رمية الفرقد»" : ""}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl font-black">كِدت!</p>
                <p className="mt-1 text-[0.92rem] font-bold text-[#5b4300]">
                  {fails >= 3 ? "سيطول دليل التصويب في المحاولة التالية." : `تحرر ${arNum(snap.freed)} من ${arNum(snap.lanterns)}. جرّب زاوية أخرى.`}
                </p>
              </>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-3d btn-primary btn-md min-h-11" onClick={() => startPlay(levelKey)} data-testid="levels-retry">
                {snap.cleared ? "أعد المستوى" : "أعد المحاولة"}
              </button>
              {snap.cleared && next ? (
                <button type="button" className="btn btn-3d btn-accent btn-md min-h-11" onClick={() => startPlay(next.key)}>
                  المستوى التالي
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* اللوح السفلي: المنزلقات الثلاثة والإطلاق. لمسة عليه أثناء الطيران تفعّل الخاصة أيضًا (حيث يرتاح الإبهام) */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-black/0 pt-8 pb-[max(12px,env(safe-area-inset-bottom))] ps-[max(12px,env(safe-area-inset-right))] pe-[max(12px,env(safe-area-inset-left))] [@media(max-height:500px)]:pt-3"
        onPointerDown={() => {
          const g = live.current.game;
          if (g?.getSnapshot().activatable) g.dispatch({ type: "activate" });
        }}
      >
        <div className="mx-auto max-w-xl space-y-2 [@media(max-height:500px)]:max-w-5xl">
          {hint ? <p className="mx-auto w-fit rounded-full bg-black/65 px-3 py-1 text-center text-[0.82rem] font-bold text-white [@media(max-height:500px)]:hidden">{hint}</p> : null}
          <div className="grid gap-1.5 [@media(max-height:500px)]:grid-cols-3 [@media(max-height:500px)]:gap-2">
            {sliders.map((s) => (
              <div key={s.id} className="flex min-w-0 items-center gap-2">
                <label htmlFor={s.id} className="w-[4.6rem] shrink-0 rounded-full bg-black/65 px-2 py-1 text-center font-display text-[0.85rem] font-bold text-white [@media(max-height:500px)]:w-auto">
                  {s.label}
                </label>
                <input
                  id={s.id}
                  dir="ltr"
                  type="range"
                  min={0}
                  max={s.max}
                  step={1}
                  value={s.value}
                  aria-valuetext={s.text}
                  disabled={locked}
                  onChange={(e) => aimTo(s.set(Number(e.target.value)))}
                  className="h-11 min-w-0 flex-1 accent-[#ffd25a] disabled:opacity-60"
                  data-testid={s.id}
                />
                <span className="w-[4.9rem] shrink-0 rounded-full bg-black/65 px-2 py-1 text-center text-[0.8rem] font-bold text-white [@media(max-height:500px)]:hidden" aria-hidden>
                  {s.text}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={ammo === "heavy"}
              disabled={locked || (snap?.shotsFired ?? 0) === 0}
              onClick={() => chooseAmmo(ammo === "heavy" ? "meteor" : "heavy")}
              className={
                ammo === "heavy"
                  ? "min-h-11 shrink-0 rounded-full bg-[#ffd25a] px-4 font-display text-sm font-black text-[#3a2400] disabled:opacity-60"
                  : "min-h-11 shrink-0 rounded-full bg-black/65 px-4 font-display text-sm font-bold text-white ring-1 ring-white/40 disabled:opacity-60"
              }
            >
              {ammo === "heavy" ? "نيزك ثقيل للرمية التالية" : "نيزك ثقيل"}
            </button>
            <select
              aria-label="التصميم"
              value={levelKey}
              disabled={!ready && playState !== "error"}
              onChange={(e) => startPlay(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/95 px-3 font-display text-sm font-bold text-ink"
            >
              {levels.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-3d btn-soft btn-md min-h-11 shrink-0" disabled={!ready} onClick={() => startPlay(levelKey)}>
              أعد
            </button>
            <button type="button" className="btn btn-3d btn-accent btn-md min-h-11 shrink-0" onClick={fire} disabled={locked && !snap?.activatable} data-testid="levels-fire">
              {flying && snap?.activatable ? "فعّل" : "ارمِ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 text-[0.95rem] leading-7">
      <p className="font-display font-bold text-ink">اضغط «العب» على أي تصميم لتفتحه بملء الشاشة بالمحرك الحقيقي.</p>
      <ul className="list-disc space-y-1 ps-5 text-muted">
        <li>اسحب على المشهد يمينًا ويسارًا لتدير المرقاب (عكس السحب كالنابض)، وإلى الأسفل لتزيد القوة.</li>
        <li>المنزلقات للتصويب الدقيق، ولوحة المفاتيح: الأسهم للاتجاه والارتفاع، وPageUp وPageDown للقوة، والمسافة للرمي، وEscape للإغلاق.</li>
        <li>الرمية الأولى شهاب مجاني، ثم رمية لكل خانة (عددها في بطاقة التصميم). النجوم تقديرية بإجابات افتراضية لأن المعاينة بلا أسئلة.</li>
      </ul>
      {open ? createPortal(stage, document.body) : null}
    </div>
  );
}
