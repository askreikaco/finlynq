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
      'className="p-1 rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 max-md:p-3 max-md:-m-3 hover:bg-muted/80 transition-all"'
    );
    expect(src).not.toContain(
      'className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted/80 transition-all"'
    );
  });

  it("announcement-banner dismiss button has label and 44px mobile target", () => {
    const src = read("src/components/announcement-banner.tsx");
    expect(src).toContain(
      'aria-label="Dismiss announcement"\n          className="text-muted-foreground hover:text-foreground shrink-0 max-regular:p-3 max-regular:-m-3"'
    );
    expect(src).not.toContain(
      'aria-label="Dismiss announcement"\n          className="text-muted-foreground hover:text-foreground"'
    );
  });
});
