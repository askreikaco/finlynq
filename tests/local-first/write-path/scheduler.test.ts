// Drain scheduler (local-first L3): triggers, single-flight, backoff timer, stop.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDrainScheduler, SCHEDULER_MIN_DELAY_MS } from "@/lib/local-first/write-path/scheduler";
import type { DrainReport } from "@/lib/local-first/write-path/drain";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

const report = (over: Partial<DrainReport> = {}): DrainReport => ({ sent: 0, adopted: 0, failed: 0, retryLater: 0, paused: false, lost: {}, skipped: false, ...over });
const entry = (nextAttemptAt: number, status: "pending" | "failed" = "pending"): OutboxEntry => ({
  opId: `o${nextAttemptAt}`, kind: "create", rowId: "r", serverId: null, fields: {}, fieldHlc: {}, base: {},
  createdAt: 0, attempts: 1, nextAttemptAt, firstSendAt: null, status, failReason: null,
});

class Doc extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

let clock = 1_000_000;
let online = true;
let entries: OutboxEntry[] = [];
let drain: ReturnType<typeof vi.fn>;
let win: EventTarget;
let doc: Doc;
let allow = true;

function make() {
  return createDrainScheduler({
    drain: drain as unknown as () => Promise<DrainReport>,
    list: async () => entries,
    allow: () => allow,
    now: () => clock,
    isOnline: () => online,
    win: win as unknown as Window,
    doc: doc as unknown as Document,
  });
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000; online = true; entries = []; allow = true;
  drain = vi.fn(async () => report());
  win = new EventTarget(); doc = new Doc();
});
afterEach(() => vi.useRealTimers());

describe("drain scheduler", () => {
  it("start drains once; online event and visibility->visible drain again; hidden does not", async () => {
    const s = make(); s.start(); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("online")); await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(drain).toHaveBeenCalledTimes(3);
    s.stop();
  });

  it("kick drains right away", async () => {
    const s = make(); s.start(); await flush();
    await s.kick();
    expect(drain).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("is single-flight: triggers during a run fold into one follow-up run", async () => {
    let release!: () => void;
    drain.mockImplementationOnce(() => new Promise<DrainReport>((r) => { release = () => r(report()); }));
    const s = make(); s.start(); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("online")); win.dispatchEvent(new Event("online")); void s.kick(); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    release(); await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("arms a timer at the earliest pending nextAttemptAt (backoff) and drains when it fires", async () => {
    entries = [entry(clock + 30_000), entry(clock + 8_000), entry(clock + 1, "failed")];
    const s = make(); s.start(); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(7_999); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2); await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("never re-arms faster than the minimum delay (no hot loop on an already-due entry)", async () => {
    entries = [entry(clock - 5_000)];
    const s = make(); s.start(); await flush();
    vi.advanceTimersByTime(SCHEDULER_MIN_DELAY_MS - 1); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2); await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("no timer when the outbox is empty or only failed entries remain", async () => {
    entries = [entry(clock + 100, "failed")];
    const s = make(); s.start(); await flush();
    vi.advanceTimersByTime(60 * 60_000); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("does not drain while offline; the online event resumes", async () => {
    online = false;
    const s = make(); s.start(); await flush();
    expect(drain).not.toHaveBeenCalled();
    online = true; win.dispatchEvent(new Event("online")); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("a paused drain (locked / signed out) arms no timer", async () => {
    entries = [entry(clock + 1_000)];
    drain.mockResolvedValue(report({ paused: true }));
    const s = make(); s.start(); await flush();
    vi.advanceTimersByTime(60_000); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("stop removes listeners and the timer; an in-flight run does not re-arm", async () => {
    entries = [entry(clock + 5_000)];
    let release!: () => void;
    drain.mockImplementationOnce(() => new Promise<DrainReport>((r) => { release = () => r(report()); }));
    const s = make(); s.start(); await flush();
    s.stop();
    release(); await flush();
    win.dispatchEvent(new Event("online")); doc.dispatchEvent(new Event("visibilitychange")); void s.kick();
    vi.advanceTimersByTime(60_000); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    expect(s.running).toBe(false);
  });

  it("stops itself when allow() turns false (flag off / lock)", async () => {
    const s = make(); s.start(); await flush();
    allow = false;
    win.dispatchEvent(new Event("online")); await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    expect(s.running).toBe(false);
  });

  it("a throwing drain is swallowed and the scheduler stays alive", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    drain.mockRejectedValueOnce(new Error("boom"));
    const s = make(); s.start(); await flush();
    win.dispatchEvent(new Event("online")); await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    s.stop();
  });
});
