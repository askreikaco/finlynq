/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SizeClass } from "@/components/ui/size-class";

// Size class and session are controlled per test. Everything else is the real code.
const size: { current: SizeClass } = { current: "compact" };
const session: { userId: string | null; ready: boolean } = { userId: null, ready: true };

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: session.ready }),
}));

import {
  useViewMode,
  ViewModeToggle,
  VIEW_MODE_DEFAULTS,
  VIEW_MODE_STORAGE_KEY,
  defaultViewMode,
  type ViewKey,
  type ViewMode,
} from "@/components/adaptive/view-mode";
import { PER_USER_STORAGE_KEYS } from "@/lib/client/user-storage";

const VIEW_KEYS: ViewKey[] = ["transactions", "accounts", "portfolio", "budgets", "goals", "loans", "subscriptions"];
const SIZES: SizeClass[] = ["compact", "regular", "wide"];

let uid = 0;
/** Unique user per test: the shared in-memory store keeps the loaded user between tests. */
function newUser(): string {
  uid += 1;
  return `vm-user-${uid}`;
}

function Probe({ viewKey }: { viewKey: ViewKey }) {
  const [mode, setMode] = useViewMode(viewKey);
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={() => setMode("list")}>set-list</button>
      <button type="button" onClick={() => setMode("cards")}>set-cards</button>
      <button type="button" onClick={() => setMode("grid" as ViewMode)}>set-bogus</button>
    </div>
  );
}

function modeOf(): string {
  return screen.getByTestId("mode").textContent ?? "";
}

function storedPrefs(userId: string): Record<string, string> | null {
  const raw = localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}:${userId}`);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  localStorage.clear();
  size.current = "compact";
  session.userId = null;
  session.ready = true;
});

afterEach(() => {
  cleanup();
});

describe("view-mode defaults (owner D6)", () => {
  it("table: compact cards for every view; regular cards except transactions (list); wide list", () => {
    for (const key of VIEW_KEYS) {
      expect(VIEW_MODE_DEFAULTS[key].compact).toBe("cards");
      expect(VIEW_MODE_DEFAULTS[key].regular).toBe(key === "transactions" ? "list" : "cards");
      expect(VIEW_MODE_DEFAULTS[key].wide).toBe("list");
    }
  });

  it.each(
    SIZES.flatMap((s) => VIEW_KEYS.map((k) => [s, k] as const)),
  )("%s / %s mounts the default view", (sizeClass, viewKey) => {
    size.current = sizeClass;
    session.userId = newUser();
    render(<Probe viewKey={viewKey} />);
    expect(modeOf()).toBe(defaultViewMode(viewKey, sizeClass));
  });

  it("transactions at regular is list, accounts at regular is cards", () => {
    size.current = "regular";
    session.userId = newUser();
    const { unmount } = render(<Probe viewKey="transactions" />);
    expect(modeOf()).toBe("list");
    unmount();
    render(<Probe viewKey="accounts" />);
    expect(modeOf()).toBe("cards");
  });
});

describe("view-mode persistence (owner D6b: per user, per view, per size class)", () => {
  it("writes one JSON object under pf-view-mode:<userId>, keyed viewKey:sizeClass", () => {
    size.current = "regular";
    session.userId = newUser();
    const user = session.userId;
    render(<Probe viewKey="accounts" />);
    fireEvent.click(screen.getByText("set-list"));
    expect(modeOf()).toBe("list");
    expect(storedPrefs(user)).toEqual({ "accounts:regular": "list" });
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBeNull(); // never a bare key
  });

  it("restores the saved choice after remount for the same user", () => {
    size.current = "wide";
    session.userId = newUser();
    const { unmount } = render(<Probe viewKey="budgets" />);
    fireEvent.click(screen.getByText("set-cards"));
    expect(modeOf()).toBe("cards");
    unmount();
    render(<Probe viewKey="budgets" />);
    expect(modeOf()).toBe("cards");
  });

  it("reads the stored choice once the session is ready", () => {
    size.current = "regular";
    session.userId = newUser();
    session.ready = false;
    localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${session.userId}`, JSON.stringify({ "accounts:regular": "list" }));
    const { rerender } = render(<Probe viewKey="accounts" />);
    expect(modeOf()).toBe("cards"); // not ready: default only, nothing read
    session.ready = true;
    act(() => {
      rerender(<Probe viewKey="accounts" />);
    });
    expect(modeOf()).toBe("list");
  });

  it("a different user never sees another user's choice", () => {
    size.current = "regular";
    const alice = newUser();
    const bob = newUser();
    session.userId = alice;
    const { unmount } = render(<Probe viewKey="accounts" />);
    fireEvent.click(screen.getByText("set-list"));
    unmount();

    session.userId = bob;
    render(<Probe viewKey="accounts" />);
    expect(modeOf()).toBe("cards");
    expect(storedPrefs(bob)).toBeNull();
    expect(storedPrefs(alice)).toEqual({ "accounts:regular": "list" });
  });

  it("a choice on one size class never changes another size class", () => {
    session.userId = newUser();
    const user = session.userId;
    size.current = "wide";
    const { rerender, unmount } = render(<Probe viewKey="accounts" />);
    expect(modeOf()).toBe("list"); // default at wide
    fireEvent.click(screen.getByText("set-cards")); // choice at wide
    expect(modeOf()).toBe("cards");

    size.current = "regular";
    act(() => rerender(<Probe viewKey="accounts" />));
    expect(modeOf()).toBe("cards"); // regular default, untouched by the wide choice

    size.current = "compact";
    act(() => rerender(<Probe viewKey="accounts" />));
    expect(modeOf()).toBe("cards");

    size.current = "wide";
    act(() => rerender(<Probe viewKey="accounts" />));
    expect(modeOf()).toBe("cards"); // the wide choice is still there
    unmount();
    expect(storedPrefs(user)).toEqual({ "accounts:wide": "cards" });
  });

  it("a choice on one view never changes another view", () => {
    size.current = "regular";
    session.userId = newUser();
    render(
      <>
        <Probe viewKey="transactions" />
        <Probe viewKey="accounts" />
      </>,
    );
    const [tx, acc] = screen.getAllByTestId("mode");
    expect(tx.textContent).toBe("list");
    expect(acc.textContent).toBe("cards");
    fireEvent.click(screen.getAllByText("set-cards")[0]);
    expect(screen.getAllByTestId("mode")[0].textContent).toBe("cards");
    expect(screen.getAllByTestId("mode")[1].textContent).toBe("cards");
  });

  it("ignores invalid stored values and invalid setMode calls", () => {
    size.current = "regular";
    session.userId = newUser();
    const user = session.userId;
    localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${user}`, JSON.stringify({ "accounts:regular": "grid", "transactions:regular": "list" }));
    render(<Probe viewKey="accounts" />);
    expect(modeOf()).toBe("cards");
    fireEvent.click(screen.getByText("set-bogus"));
    expect(modeOf()).toBe("cards");
    expect(storedPrefs(user)).toEqual({ "accounts:regular": "grid", "transactions:regular": "list" });
  });

  it("a corrupt stored value falls back to the default without throwing", () => {
    size.current = "regular";
    session.userId = newUser();
    localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${session.userId}`, "{not json");
    render(<Probe viewKey="transactions" />);
    expect(modeOf()).toBe("list");
  });

  it("registers pf-view-mode as a per-user key (namespaced, legacy bare key dropped)", () => {
    expect(PER_USER_STORAGE_KEYS).toContain(VIEW_MODE_STORAGE_KEY);
  });
});

describe("view-mode with a null userId (signed out)", () => {
  it("writes nothing to localStorage, but the toggle still changes the view in memory", () => {
    size.current = "regular";
    session.userId = null;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<Probe viewKey="accounts" />);
    fireEvent.click(screen.getByText("set-list"));
    expect(modeOf()).toBe("list");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    setItem.mockRestore();
  });
});

describe("ViewModeToggle accessibility", () => {
  it("is a radiogroup named View with two radios, Cards and List, reflecting the mode", () => {
    size.current = "regular";
    session.userId = newUser();
    render(<ViewModeToggle viewKey="transactions" />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    expect(group).toBeTruthy();
    const cards = screen.getByRole("radio", { name: "Cards" });
    const list = screen.getByRole("radio", { name: "List" });
    expect(cards.getAttribute("aria-checked")).toBe("false");
    expect(list.getAttribute("aria-checked")).toBe("true");
    expect(list.getAttribute("tabindex")).toBe("0");
    expect(cards.getAttribute("tabindex")).toBe("-1");
  });

  it("click and arrow keys change the mode and move focus", () => {
    size.current = "compact";
    session.userId = newUser();
    render(<ViewModeToggle viewKey="accounts" />);
    const cards = screen.getByRole("radio", { name: "Cards" });
    const list = screen.getByRole("radio", { name: "List" });
    fireEvent.click(list);
    expect(list.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(cards.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(cards);
    fireEvent.keyDown(cards, { key: "ArrowRight" });
    expect(list.getAttribute("aria-checked")).toBe("true");
  });

  it("targets are 44px on coarse pointers and the icon is aria-hidden", () => {
    session.userId = newUser();
    render(<ViewModeToggle viewKey="accounts" />);
    const list = screen.getByRole("radio", { name: "List" });
    expect(list.className).toContain("pointer-coarse:h-11");
    expect(list.className).not.toMatch(/text-\[/);
    expect(list.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
