// One notice: src/components/notice/ (`<Notice variant tone ...>`) is the ONLY empty state, error state, loading
// skeleton, alert and banner. EmptyState, ErrorState, PageSkeleton, Alert and the five banners are gone.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((f) => ({ rel: path.relative(process.cwd(), f).split(path.sep).join("/"), src: fs.readFileSync(f, "utf8") }));

const GONE = [
  "src/components/empty-state.tsx",
  "src/components/error-state.tsx",
  "src/components/page-skeleton.tsx",
  "src/components/ui/alert.tsx",
  "src/components/announcement-banner.tsx",
  "src/components/currency-audit-banner.tsx",
  "src/components/passkey-lock-banner.tsx",
  "src/components/onboarding-tips.tsx",
  "src/components/reporting-recompute-indicator.tsx",
];

describe("one notice", () => {
  it("the old component files are deleted", () => {
    for (const f of GONE) expect(fs.existsSync(path.join(process.cwd(), f)), f).toBe(false);
  });

  it("nothing imports or uses the old components", () => {
    const hits = FILES.filter((f) =>
      /\b(EmptyState|ErrorState|PageSkeleton|AlertDescription|AlertTitle|AnnouncementBanner|CurrencyAuditBanner|PasskeyLockBanner|OnboardingTips|ReportingRecomputeIndicator)\b/.test(f.src) ||
      /<Alert\b/.test(f.src) ||
      /@\/components\/(empty-state|error-state|page-skeleton|ui\/alert|announcement-banner|currency-audit-banner|passkey-lock-banner|onboarding-tips|reporting-recompute-indicator)/.test(f.src),
    ).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("self-fetching notices are mounted as <Notice source=...>", () => {
    const layout = FILES.find((f) => f.rel === "src/app/(app)/layout.tsx")!;
    expect(layout.src).toContain('<Notice source="announcement" />');
    expect(layout.src).toContain('<Notice source="reporting-recompute" />');
    const dash = FILES.find((f) => f.rel === "src/app/(app)/dashboard/page.tsx")!;
    expect(dash.src).toContain('<Notice source="currency-audit" />');
    expect(dash.src).toContain('<Notice source="tips:dashboard" />');
  });

  it("Notice never animates on mount (no framer-motion)", () => {
    for (const f of FILES.filter((x) => x.rel.startsWith("src/components/notice/"))) {
      expect(f.src, f.rel).not.toContain("framer-motion");
    }
  });
});
