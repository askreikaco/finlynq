/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

let path = "/a";
vi.mock("next/navigation", () => ({ usePathname: () => path }));

type Answer = (url: string) => Promise<unknown>;
let answers: Record<string, Answer> = {};
const ok = (body: unknown): Answer => async () => ({ ok: true, json: async () => body });
const failStatus: Answer = async () => ({ ok: false, status: 500, json: async () => ({}) });
const reject: Answer = async () => {
  throw new Error("network");
};

const ANN = "/api/announcements";
const FB = "/api/feedback";

let mod: typeof import("@/components/nav-unread");

/** Let every pending fetch chain settle. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  vi.resetModules();
  mod = await import("@/components/nav-unread");
  path = "/a";
  answers = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const answer = answers[url];
      if (!answer) throw new Error(`unexpected fetch ${url}`);
      return answer(url);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useNavUnread counts", () => {
  it("counts unread announcements and feedback threads", async () => {
    answers = {
      [ANN]: ok([{ id: 1, read: false }, { id: 2, read: true }]),
      [FB]: ok([{ unread: true }, { unread: false }, { unread: true }]),
    };
    const { result } = renderHook(() => mod.useNavUnread());
    await flush();
    expect(result.current.announcements).toHaveLength(2);
    expect(result.current.announcementsUnread).toBe(1);
    expect(result.current.feedbackUnread).toBe(2);
  });
});

describe("transient failures keep the previous good state", () => {
  it("both endpoints failing (network error or non-ok) keeps the last counts, not zeros", async () => {
    answers = {
      [ANN]: ok([{ id: 1, read: false }]),
      [FB]: ok([{ unread: true }, { unread: true }]),
    };
    const first = renderHook(() => mod.useNavUnread());
    await flush();
    expect(first.result.current.announcementsUnread).toBe(1);
    expect(first.result.current.feedbackUnread).toBe(2);
    first.unmount();

    path = "/b";
    answers = { [ANN]: reject, [FB]: failStatus };
    const second = renderHook(() => mod.useNavUnread());
    await flush();
    expect(second.result.current.announcements).toHaveLength(1);
    expect(second.result.current.announcementsUnread).toBe(1);
    expect(second.result.current.feedbackUnread).toBe(2);
  });

  it("one endpoint failing keeps only that endpoint's previous value", async () => {
    answers = {
      [ANN]: ok([{ id: 1, read: false }]),
      [FB]: ok([{ unread: true }, { unread: true }]),
    };
    const first = renderHook(() => mod.useNavUnread());
    await flush();
    first.unmount();

    path = "/b";
    answers = {
      [ANN]: ok([{ id: 1, read: false }, { id: 2, read: false }, { id: 3, read: false }]),
      [FB]: failStatus,
    };
    const second = renderHook(() => mod.useNavUnread());
    await flush();
    expect(second.result.current.announcementsUnread).toBe(3);
    expect(second.result.current.feedbackUnread).toBe(2);
  });
});

describe("out-of-order responses", () => {
  it("a stale response that resolves after a newer load is ignored", async () => {
    const resolvers: Record<string, (v: unknown) => void> = {};
    answers = {
      [ANN]: () => new Promise((res) => (resolvers[ANN] = res)),
      [FB]: () => new Promise((res) => (resolvers[FB] = res)),
    };
    const { result, rerender } = renderHook(() => mod.useNavUnread());
    await flush();

    // Newer load (new path) answers immediately with fresh data.
    path = "/b";
    answers = {
      [ANN]: ok([{ id: 1, read: true }]),
      [FB]: ok([{ unread: true }, { unread: true }, { unread: true }, { unread: true }, { unread: true }]),
    };
    rerender();
    await flush();
    expect(result.current.announcementsUnread).toBe(0);
    expect(result.current.feedbackUnread).toBe(5);

    // The older request finally resolves with stale counts: must not overwrite.
    await act(async () => {
      resolvers[ANN]([{ id: 1, read: false }, { id: 2, read: false }, { id: 3, read: false }]);
      resolvers[FB]([{ unread: true }]);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.announcementsUnread).toBe(0);
    expect(result.current.feedbackUnread).toBe(5);
  });
});
