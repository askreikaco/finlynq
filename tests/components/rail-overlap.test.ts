/**
 * Static guard: fixed bottom/left UI must clear the desktop tab rail (AppTabs rail, fixed left,
 * w-[calc(5rem+var(--sal))], z-50) from the regular breakpoint (640px) up. Viewport-free offsets only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const RAIL_OFFSET = "regular:left-[calc(5rem+var(--sal))]";
const RAIL_OFFSET_PLUS_GAP = "regular:left-[calc(5rem+var(--sal)+1rem)]";
const CENTRED_OFFSET = "regular:left-[calc(50%+2.5rem)]";

describe("desktop rail: fixed elements clear it at regular+", () => {
  it("rail container scrolls on short heights and keeps every item reachable", () => {
    const nav = read("src/components/nav.tsx");
    const m = nav.match(/aria-label="Main navigation"\s*\n\s*(?:data-testid="[^"]*"\s*\n\s*)?className="([^"]+)"/);
    expect(m, "rail <nav> className not found").not.toBeNull();
    const cls = m![1];
    expect(cls).toContain("fixed inset-y-0 left-0");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("overscroll-contain");
  });

  it("announcement banner (left-4) is offset past the rail", () => {
    expect(read("src/components/announcement-banner.tsx")).toContain(RAIL_OFFSET_PLUS_GAP);
  });

  it("account alert (left-4, z-[60]) is offset past the rail", () => {
    expect(read("src/components/account-switcher.tsx")).toContain(RAIL_OFFSET_PLUS_GAP);
  });

  it("analytics consent (left-0 right-0, z-9999) is offset past the rail", () => {
    expect(read("src/components/analytics-consent.tsx")).toContain(RAIL_OFFSET);
  });

  it("version gate and unlock panel (inset-x-0) are offset past the rail", () => {
    expect(read("src/components/version-gate.tsx")).toContain(RAIL_OFFSET);
    expect(read("src/components/unlock-panel.tsx")).toContain(RAIL_OFFSET);
  });

  it("centred toast and action bar (left-1/2) stay right of the rail", () => {
    expect(read("src/components/inbox/lens-toast.tsx")).toContain(CENTRED_OFFSET);
    expect(read("src/components/reconcile/bulk-link-action-bar.tsx")).toContain(CENTRED_OFFSET);
  });

  it("new-transaction numpad dock (inset-x-0, coarse pointers) is offset past the rail", () => {
    const src = read("src/components/transactions/entry/numpad-dock.tsx");
    const dock = src.split("\n").find((l) => l.includes("pointer-coarse:block") && l.includes("fixed"));
    expect(dock, "numpad dock class not found").toBeDefined();
    expect(dock!).toContain(RAIL_OFFSET);
  });
});
