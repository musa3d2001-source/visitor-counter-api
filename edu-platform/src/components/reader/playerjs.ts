/**
 * عميل مصغّر لبروتوكول player.js (المواصفة: node_modules/player.js/SPEC.rst) للتواصل مع مشغل Bunny المضمّن عبر postMessage:
 *  - ننتظر حدث ready ثم نشترك في timeupdate / ended / pause / play
 *  - setCurrentTime للاستكمال من آخر نقطة
 * لا يرسل أي بيانات حساسة؛ نتحقق من أصل الرسائل (origin) قبل التعامل معها.
 */
const VERSION = "0.0.11";

type Listener = (value: unknown) => void;

export class PlayerJsBridge {
  private ready = false;
  private queue: Record<string, unknown>[] = [];
  private listeners = new Map<string, Set<Listener>>();
  private readonly origin: string;
  private readonly onMessage: (e: MessageEvent) => void;

  constructor(private readonly iframe: HTMLIFrameElement) {
    this.origin = new URL(iframe.src).origin;
    this.onMessage = (e: MessageEvent) => {
      if (e.origin !== this.origin || e.source !== this.iframe.contentWindow) return;
      let data: { context?: string; event?: string; value?: unknown } | null = null;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!data || data.context !== "player.js" || !data.event) return;
      if (data.event === "ready") {
        if (this.ready) return;
        this.ready = true;
        for (const event of this.listeners.keys()) this.post({ method: "addEventListener", value: event, listener: event });
        for (const m of this.queue.splice(0)) this.post(m);
      }
      this.listeners.get(data.event)?.forEach((fn) => fn(data!.value));
    };
    window.addEventListener("message", this.onMessage);
  }

  private post(msg: Record<string, unknown>) {
    this.iframe.contentWindow?.postMessage(JSON.stringify({ context: "player.js", version: VERSION, ...msg }), this.origin);
  }

  private send(msg: Record<string, unknown>) {
    if (this.ready) this.post(msg);
    else this.queue.push(msg);
  }

  on(event: "ready" | "timeupdate" | "ended" | "pause" | "play" | "error", fn: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    const isNew = !this.listeners.has(event);
    set.add(fn);
    this.listeners.set(event, set);
    if (isNew && event !== "ready" && this.ready) this.post({ method: "addEventListener", value: event, listener: event });
  }

  setCurrentTime(seconds: number) {
    this.send({ method: "setCurrentTime", value: seconds });
  }

  play() {
    this.send({ method: "play" });
  }

  pause() {
    this.send({ method: "pause" });
  }

  destroy() {
    window.removeEventListener("message", this.onMessage);
    this.listeners.clear();
  }
}
