/**
 * نبضة حفظ التقدم، بين المشغل والخادم.
 *
 * الخادم لا يقبل لكل مشاهد ودرس أكثر من نبضة كل LESSON_BEAT_MIN_GAP_SECONDS، والمشغل يرسل كل LESSON_BEAT_INTERVAL_MS:
 * الفرق ثانية واحدة لتذبذب الشبكة، حتى لا تُرفض نبضة عادية لأنها وصلت أبكر مما خرجت.
 * اكتمال الدرس لا ينتظر الفاصل، لأنه يحدث مرة واحدة ولا يُعوَّض إن ضاع.
 */
export const LESSON_BEAT_MIN_GAP_SECONDS = 15;
export const LESSON_BEAT_INTERVAL_MS = 16_000;

/** نسبة المشاهدة التي يُعد الدرس بعدها مكتملًا */
const COMPLETED_AT = 0.9;
/** حركة أقل من ثانية لا تستحق نبضة */
const MIN_MOVE_SECONDS = 1;

type Send = (position: number, completed: boolean) => void;

/** ساعة النبضات، بلا مؤقتات ولا DOM: الوقت والإرسال يأتيان من الخارج فتُختبر وحدها */
export class LessonBeatClock {
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private lastSentPosition = -1;
  private latest = -1;
  private completed = false;

  constructor(
    private readonly send: Send,
    private readonly intervalMs = LESSON_BEAT_INTERVAL_MS,
  ) {}

  private note(position: number, duration: number): boolean {
    this.latest = position;
    const done = duration > 0 && position / duration >= COMPLETED_AT;
    const became = done && !this.completed;
    if (done) this.completed = true;
    return became;
  }

  private fire(now: number) {
    this.lastSentAt = now;
    this.lastSentPosition = this.latest;
    this.send(Math.floor(this.latest), this.completed);
  }

  private moved(): boolean {
    return this.latest >= 0 && Math.abs(this.latest - this.lastSentPosition) >= MIN_MOVE_SECONDS;
  }

  /** عينة أثناء التشغيل: ترسل إن حان موعدها */
  tick(position: number, duration: number, now: number) {
    if (this.note(position, duration)) return this.fire(now);
    if (now - this.lastSentAt >= this.intervalMs && this.moved()) this.fire(now);
  }

  /**
   * إيقاف أو انتهاء: ترسل الآن إن كان الخادم سيقبلها.
   * وإلا تعيد عدد المليثانية حتى تقبل، فيضبط المشغل إرسالًا متأخرًا واحدًا بدل طلب يعرف أنه مرفوض. null: لا شيء ينتظر.
   */
  flush(position: number, duration: number, now: number): number | null {
    if (this.note(position, duration)) {
      this.fire(now);
      return null;
    }
    return this.settle(now);
  }

  /** موعد الإرسال المتأخر: يرسل آخر موضع معروف إن حان وقته */
  settle(now: number): number | null {
    if (!this.moved()) return null;
    const wait = this.lastSentAt + this.intervalMs - now;
    if (wait > 0) return wait;
    this.fire(now);
    return null;
  }
}
