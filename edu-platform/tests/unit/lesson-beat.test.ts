import { describe, expect, it } from "vitest";
import { LESSON_BEAT_INTERVAL_MS, LESSON_BEAT_MIN_GAP_SECONDS, LessonBeatClock } from "@/lib/lesson-beat";

function clock() {
  const sent: { position: number; completed: boolean }[] = [];
  return { sent, beat: new LessonBeatClock((position, completed) => sent.push({ position, completed })) };
}

describe("the player's beat clock", () => {
  it("sends just after the gap the server enforces, so a normal beat is never refused as early", () => {
    expect(LESSON_BEAT_INTERVAL_MS).toBeGreaterThan(LESSON_BEAT_MIN_GAP_SECONDS * 1000);
    expect(LESSON_BEAT_INTERVAL_MS).toBeLessThanOrEqual((LESSON_BEAT_MIN_GAP_SECONDS + 2) * 1000);
  });

  it("sends once per interval however often the player reports", () => {
    const { sent, beat } = clock();
    for (let t = 0; t <= 64_000; t += 250) beat.tick(t / 1000, 3600, t);
    expect(sent.map((b) => b.position)).toEqual([0, 16, 32, 48, 64].map((n) => n)); // الأولى عند أول موضع يتحرك
  });

  it("does not send when the position has not moved", () => {
    const { sent, beat } = clock();
    beat.tick(30, 3600, 0);
    beat.tick(30.4, 3600, 20_000);
    expect(sent).toHaveLength(1);
  });

  it("sends completion at once, inside the interval, and keeps it on later beats", () => {
    const { sent, beat } = clock();
    beat.tick(500, 1000, 0);
    beat.tick(900, 1000, 1_000);
    expect(sent).toEqual([
      { position: 500, completed: false },
      { position: 900, completed: true },
    ]);
    beat.tick(950, 1000, 17_100);
    expect(sent.at(-1)).toEqual({ position: 950, completed: true });
  });

  it("a pause inside the interval asks for one later send instead of a request the server would refuse", () => {
    const { sent, beat } = clock();
    beat.tick(100, 3600, 0);
    expect(beat.flush(105, 3600, 5_000)).toBe(11_000);
    expect(sent).toHaveLength(1);
    expect(beat.settle(16_000)).toBeNull();
    expect(sent.at(-1)).toEqual({ position: 105, completed: false });
  });

  it("a pause after the interval sends immediately, and a pause with nothing new sends nothing", () => {
    const { sent, beat } = clock();
    beat.tick(100, 3600, 0);
    expect(beat.flush(120, 3600, 20_000)).toBeNull();
    expect(sent).toHaveLength(2);
    expect(beat.flush(120, 3600, 60_000)).toBeNull();
    expect(sent).toHaveLength(2);
  });

  it("reaching the end during a pause is completion and is not delayed", () => {
    const { sent, beat } = clock();
    beat.tick(100, 120, 0);
    expect(beat.flush(119, 120, 1_000)).toBeNull();
    expect(sent.at(-1)).toEqual({ position: 119, completed: true });
  });
});
