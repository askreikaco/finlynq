/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf-8");

describe("W5-13 mobile touch targets", () => {
  it("action-center dismiss button is always visible on mobile and 44px", () => {
    const src = read("src/app/(app)/dashboard/_components/action-center.tsx");
    expect(src).toContain(
      'className="p-1 rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-regular:opacity-100 max-regular:p-3 max-regular:-m-3 hover:bg-muted/80 transition-all"'
    );
    expect(src).not.toContain(
      'className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted/80 transition-all"'
    );
  });

  it("notice dismiss button has label and 44px mobile target", () => {
    const src = read("src/components/notice/body.tsx");
    // The one Notice dismiss button: named by `dismissLabel` (the announcement feed passes "Dismiss announcement") and 44px on phones.
    expect(src).toContain("aria-label={label}");
    expect(src).toContain("max-regular:-m-3 max-regular:p-3");
    expect(read("src/components/notice/feeds.tsx")).toContain('dismissLabel="Dismiss announcement"');
  });
});
