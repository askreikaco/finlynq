/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

import { OnboardingTips } from "@/components/onboarding-tips";

const KEY = "pf-dismissed-tips:user-1"; // per-user key (multi-account): `${base}:${userId}`
let sessionUserId: string | null = "user-1";
let sessionFetch: ReturnType<typeof vi.fn>;

describe("OnboardingTips", () => {
  beforeEach(() => {
    cleanup();
    // Clear localStorage before each test
    localStorage.clear();
    sessionUserId = "user-1";
    // Active user comes from /api/auth/session; dismissed state is per-user
    sessionFetch = vi.fn(async () => ({ ok: true, json: async () => ({ authenticated: true, userId: sessionUserId }) }));
    vi.stubGlobal("fetch", sessionFetch);
  });

  /** Wait until the session answered AND the component re-rendered with it. */
  const settled = async () => {
    await waitFor(() => expect(sessionFetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
  };

  it("renders dashboard tips", async () => {
    const { findByText: getByText } = render(<OnboardingTips page="dashboard" />);
    expect(await getByText("This is your financial overview")).toBeTruthy();
    expect(await getByText("Import your bank statements")).toBeTruthy();
  });

  it("renders transaction tips", async () => {
    const { findByText: getByText } = render(<OnboardingTips page="transactions" />);
    expect(await getByText("Find any transaction")).toBeTruthy();
    expect(await getByText("Categorize for better insights")).toBeTruthy();
  });

  it("renders budget tips", async () => {
    const { findByText: getByText } = render(<OnboardingTips page="budgets" />);
    expect(await getByText("Set monthly spending limits")).toBeTruthy();
  });

  it("renders import tips", async () => {
    const { findByText: getByText } = render(<OnboardingTips page="import" />);
    expect(await getByText("Multiple formats supported")).toBeTruthy();
  });

  it("shows Dismiss all button", async () => {
    const { findByText } = render(<OnboardingTips page="dashboard" />);
    expect(await findByText("Dismiss all")).toBeTruthy();
  });

  it("dismiss all hides all tips", async () => {
    const { findByText, queryByText } = render(
      <OnboardingTips page="dashboard" />
    );
    fireEvent.click(await findByText("Dismiss all"));
    expect(queryByText("This is your financial overview")).toBeNull();
    expect(queryByText("Import your bank statements")).toBeNull();
  });

  it("persists dismissed tips to localStorage", async () => {
    const { findByText } = render(<OnboardingTips page="dashboard" />);
    fireEvent.click(await findByText("Dismiss all"));
    const stored = JSON.parse(
      localStorage.getItem(KEY) || "[]"
    );
    expect(localStorage.getItem("pf-dismissed-tips")).toBeNull(); // never the bare key
    expect(stored).toContain("dash-overview");
    expect(stored).toContain("dash-import");
  });

  it("renders action links for tips that have them", async () => {
    const { findByText } = render(<OnboardingTips page="dashboard" />);
    const link = await findByText("View accounts");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/accounts");
  });

  it("hides tips that were previously dismissed", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify(["dash-overview", "dash-import"])
    );
    const { container } = render(<OnboardingTips page="dashboard" />);
    await settled();
    // All dashboard tips dismissed — component should return null
    expect(container.innerHTML).toBe("");
  });

  // ── multi-account B2: namespacing ────────────────────────────────────────
  it("user B does not see A's dismissals, and nothing per-user renders before the userId is known", async () => {
    localStorage.setItem("pf-dismissed-tips:user-A", JSON.stringify(["dash-overview", "dash-import"]));
    sessionUserId = "user-B";
    let release!: (v: unknown) => void;
    const gate = new Promise((r) => { release = r; });
    sessionFetch.mockImplementation(async () => { await gate; return { ok: true, json: async () => ({ userId: "user-B" }) }; });
    const { queryByText, findByText } = render(<OnboardingTips page="dashboard" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(queryByText("This is your financial overview")).toBeNull(); // not rendered from any guessed key pre-resolve
    release(undefined);
    expect(await findByText("This is your financial overview")).toBeTruthy(); // B has A's tips undismissed
    fireEvent.click(await findByText("Dismiss all"));
    expect(localStorage.getItem("pf-dismissed-tips:user-B")).toContain("dash-overview");
    expect(JSON.parse(localStorage.getItem("pf-dismissed-tips:user-A")!)).toEqual(["dash-overview", "dash-import"]); // A untouched
  });

  it("legacy un-namespaced key is DROPPED, never migrated into the signed-in user", async () => {
    localStorage.setItem("pf-dismissed-tips", JSON.stringify(["dash-overview", "dash-import"]));
    localStorage.setItem("pf-chat-history", "[]");
    localStorage.setItem("pf-spotlight-dismissed", "[]");
    localStorage.setItem("pf-tx-cols-v1", "{}");
    localStorage.setItem("pf-font", "inter"); // device-level key must survive
    const { findByText } = render(<OnboardingTips page="dashboard" />);
    expect(await findByText("This is your financial overview")).toBeTruthy(); // A's legacy dismissals not applied
    expect(localStorage.getItem("pf-dismissed-tips")).toBeNull();
    expect(localStorage.getItem("pf-chat-history")).toBeNull();
    expect(localStorage.getItem("pf-spotlight-dismissed")).toBeNull();
    expect(localStorage.getItem("pf-tx-cols-v1")).toBeNull();
    expect(localStorage.getItem("pf-dismissed-tips:user-1")).toBeNull(); // no migration
    expect(localStorage.getItem("pf-font")).toBe("inter");
  });

  it("signed-out / failed session: reads and writes nothing", async () => {
    localStorage.setItem("pf-dismissed-tips:user-A", JSON.stringify(["dash-overview"]));
    sessionFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ authenticated: false, userId: null }) }));
    const { findByText } = render(<OnboardingTips page="dashboard" />);
    fireEvent.click(await findByText("Dismiss all"));
    expect(Object.keys(localStorage).filter((k) => k.startsWith("pf-dismissed-tips"))).toEqual(["pf-dismissed-tips:user-A"]);
    expect(JSON.parse(localStorage.getItem("pf-dismissed-tips:user-A")!)).toEqual(["dash-overview"]);
  });
});

describe("OnboardingTips on mobile (compact one-liner)", () => {
  it("renders a Tips (n) toggle, collapsed tip list below md, expands on tap, dismiss stays per-user", async () => {
    cleanup();
    localStorage.clear();
    sessionFetch = vi.fn(async () => ({ ok: true, json: async () => ({ authenticated: true, userId: "user-1" }) }));
    vi.stubGlobal("fetch", sessionFetch);
    const { findByTestId, getByRole } = render(<OnboardingTips page="dashboard" />);
    const root = await findByTestId("onboarding-tips-compact");
    expect(root.className).toContain("max-md:py-1");
    const toggle = getByRole("button", { name: /Tips \(2\)/ });
    expect(toggle.className).toContain("max-md:min-h-11");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.innerHTML).toContain("max-md:hidden");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(getByRole("button", { name: "Dismiss all" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(2));
  });
});
