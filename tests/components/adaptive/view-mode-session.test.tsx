/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SizeClass } from "@/components/ui/size-class";

// Only the size class is controlled here. The session hook, storage and view mode are real.
const size: { current: SizeClass } = { current: "regular" };
vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));

import { DataView } from "@/components/adaptive/data-view";
import { ViewModeToggle, VIEW_MODE_STORAGE_KEY, VIEW_MODE_SESSION_WAIT_MS } from "@/components/adaptive/view-mode";
import { resetSessionUserIdCache, SESSION_CACHE_TTL_MS } from "@/lib/client/user-storage";

const mounted = { cards: 0, list: 0 };
const unmounted = { cards: 0, list: 0 };

function Cards() {
  React.useEffect(() => {
    mounted.cards += 1;
    return () => {
      unmounted.cards += 1;
    };
  }, []);
  return <p>card-content</p>;
}
function List() {
  React.useEffect(() => {
    mounted.list += 1;
    return () => {
      unmounted.list += 1;
    };
  }, []);
  return <p>list-content</p>;
}

/** Controls when /api/auth/session answers. */
let answer: (() => void) | null = null;
let sessionBody: { userId?: string | null } = { userId: "user-1" };
let sessionFetch: ReturnType<typeof vi.fn>;

function stubSession(deferred: boolean) {
  sessionFetch = vi.fn(async (url: string) => {
    if (String(url) !== "/api/auth/session") throw new Error(`unexpected ${url}`);
    if (deferred) await new Promise<void>((resolve) => (answer = resolve));
    return { ok: true, status: 200, json: async () => sessionBody };
  });
  vi.stubGlobal("fetch", sessionFetch);
}

async function resolveSession() {
  // The request starts one microtask after the effect; let it register its resolver first.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    answer?.();
    answer = null;
    await new Promise((r) => setTimeout(r, 0));
  });
}

let uid = 0;
/** Unique user per test: the view-mode store keeps the loaded user between tests. */
let user = "user-1";

beforeEach(() => {
  localStorage.clear();
  resetSessionUserIdCache();
  size.current = "regular";
  uid += 1;
  user = `vms-user-${uid}`;
  sessionBody = { userId: user };
  answer = null;
  mounted.cards = mounted.list = 0;
  unmounted.cards = unmounted.list = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("one session request for the page", () => {
  it("several DataView and toggle instances share a single /api/auth/session request", async () => {
    stubSession(false);
    render(
      <>
        <ViewModeToggle viewKey="accounts" />
        <DataView viewKey="accounts" cards={<Cards />} list={<List />} />
        <DataView viewKey="transactions" cards={<Cards />} list={<List />} />
        <DataView viewKey="budgets" cards={<Cards />} list={<List />} />
      </>,
    );
    await resolveSession();
    expect(sessionFetch).toHaveBeenCalledTimes(1);
  });

  it("a later page within the TTL reuses the answer and renders at once (no pending)", async () => {
    stubSession(false);
    const first = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await resolveSession();
    first.unmount();

    render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    expect(screen.getByText("card-content")).toBeTruthy();
    expect(sessionFetch).toHaveBeenCalledTimes(1);
  });

  it("asks again after the TTL has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    stubSession(false);
    const first = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await resolveSession();
    first.unmount();

    vi.setSystemTime(Date.now() + SESSION_CACHE_TTL_MS + 1);
    render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await resolveSession();
    expect(sessionFetch).toHaveBeenCalledTimes(2);
  });
});

describe("pending state and no flash of the default view", () => {
  it("renders only the pending placeholder until the session and stored choice are in", async () => {
    localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${user}`, JSON.stringify({ "accounts:regular": "list" }));
    stubSession(true);
    const { container } = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);

    const pending = container.querySelector("[data-view-pending]");
    expect(pending).not.toBeNull();
    expect(pending?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("[data-view]")).toBeNull();
    expect(screen.queryByText("card-content")).toBeNull();
    expect(screen.queryByText("list-content")).toBeNull();
    expect(mounted.cards).toBe(0);

    await resolveSession();
    expect(container.querySelector("[data-view-pending]")).toBeNull();
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("list");
    expect(screen.getByText("list-content")).toBeTruthy();
  });

  it("never mounts the default view when the stored choice differs (no mount-then-unmount)", async () => {
    localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${user}`, JSON.stringify({ "accounts:regular": "list" }));
    stubSession(true);
    render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await resolveSession();
    expect(mounted.cards).toBe(0);
    expect(mounted.list).toBe(1);
    expect(unmounted.list).toBe(0);
  });

  it("a signed-out user (userId null) is ready at once with the default, and reads no storage", async () => {
    sessionBody = { userId: null };
    stubSession(false);
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await resolveSession();
    expect(screen.getByText("card-content")).toBeTruthy();
    expect(getItem).not.toHaveBeenCalledWith(expect.stringContaining(VIEW_MODE_STORAGE_KEY));
    getItem.mockRestore();
  });
});

describe("choices made before the session resolves", () => {
  it("a toggle click while pending is queued and applied for the user after load", async () => {
    stubSession(true);
    render(
      <>
        <ViewModeToggle viewKey="accounts" />
        <DataView viewKey="accounts" cards={<Cards />} list={<List />} />
      </>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}:${user}`)).toBeNull();

    await resolveSession();
    expect(JSON.parse(localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}:${user}`) ?? "{}")).toEqual({
      "accounts:regular": "list",
    });
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("list-content")).toBeTruthy();
  });
});

describe("session failure paths: the default view for the size class, never a stuck placeholder", () => {
  /** Let a rejected or already-resolved request settle (real timers). */
  async function flush() {
    await act(async () => {
      for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    });
  }
  /** Microtasks only: safe under fake timers. */
  async function microFlush() {
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }
  function stubSessionWith(impl: () => Promise<unknown>) {
    sessionFetch = vi.fn(async (url: string) => {
      if (String(url) !== "/api/auth/session") throw new Error(`unexpected ${url}`);
      return impl();
    });
    vi.stubGlobal("fetch", sessionFetch);
  }
  function storeList() {
    localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${user}`, JSON.stringify({ "accounts:regular": "list" }));
  }
  function expectDefaultCards(container: HTMLElement) {
    expect(container.querySelector("[data-view-pending]")).toBeNull();
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("cards");
    expect(screen.getByText("card-content")).toBeTruthy();
    expect(screen.queryByText("list-content")).toBeNull();
  }

  it("network error (fetch rejects): default view, not pending", async () => {
    storeList();
    stubSessionWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { container } = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await flush();
    expectDefaultCards(container);
  });

  it("HTTP 500: default view, not pending, and the failure is not cached (next mount asks again)", async () => {
    storeList();
    stubSessionWith(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const first = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await flush();
    expectDefaultCards(first.container);
    first.unmount();

    render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await flush();
    expect(sessionFetch).toHaveBeenCalledTimes(2);
  });

  it("HTTP 401 (signed out): userId null, ready at once with the default, no stored read", async () => {
    storeList();
    stubSessionWith(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const { container } = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await flush();
    expectDefaultCards(container);
    expect(getItem).not.toHaveBeenCalledWith(expect.stringContaining(VIEW_MODE_STORAGE_KEY));
    getItem.mockRestore();
  });

  it("malformed JSON on a 200: default view, not pending, not cached", async () => {
    storeList();
    stubSessionWith(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    const first = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await flush();
    expectDefaultCards(first.container);
    first.unmount();

    render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
    await flush();
    expect(sessionFetch).toHaveBeenCalledTimes(2);
  });

  it("a hanging request: after 2.5 s the default view shows; a late answer then applies the stored choice", async () => {
    vi.useFakeTimers();
    try {
      storeList();
      let answerLate: (() => void) | null = null;
      stubSessionWith(
        () =>
          new Promise((resolve) => {
            answerLate = () => resolve({ ok: true, status: 200, json: async () => ({ userId: user }) });
          }),
      );
      const { container } = render(<DataView viewKey="accounts" cards={<Cards />} list={<List />} />);
      await microFlush();
      expect(container.querySelector("[data-view-pending]")).not.toBeNull();
      expect(screen.queryByText("card-content")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(VIEW_MODE_SESSION_WAIT_MS - 1);
      });
      expect(container.querySelector("[data-view-pending]")).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expectDefaultCards(container);

      // The request is still open: its late answer applies the stored choice.
      await act(async () => {
        answerLate?.();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("list");
      expect(screen.getByText("list-content")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
