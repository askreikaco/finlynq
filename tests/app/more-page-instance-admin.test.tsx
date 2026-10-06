/**
 * @vitest-environment node
 *
 * MorePage instance admin wiring test (WP9a)
 *
 * Verifies that MorePage correctly:
 * 1. Imports and calls isInstanceAdminEnabled()
 * 2. Passes the result to MoreMenu as instanceAdminEnabled prop
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("MorePage instance admin wiring", () => {
  it("calls isInstanceAdminEnabled and passes result to MoreMenu prop", () => {
    // Read the source file
    const morePath = path.join(
      process.cwd(),
      "src/app/(app)/more/page.tsx"
    );
    const content = fs.readFileSync(morePath, "utf-8");

    // Verify the flag is imported
    expect(content).toContain(
      'import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag"'
    );

    // Verify isInstanceAdminEnabled() is called
    expect(content).toContain("isInstanceAdminEnabled()");

    // Verify the result is assigned to a variable
    expect(content).toContain("instanceAdminEnabled");

    // Verify the variable is passed to MoreMenu
    expect(content).toContain("instanceAdminEnabled={instanceAdminEnabled}");

    // Verify this is inside the MoreMenu component
    expect(content).toContain("<MoreMenu instanceAdminEnabled={instanceAdminEnabled}");
  });

  it("does not hard-code the flag value to true", () => {
    const morePath = path.join(
      process.cwd(),
      "src/app/(app)/more/page.tsx"
    );
    const content = fs.readFileSync(morePath, "utf-8");

    // This would catch the mutation: "more/page.tsx forces the flag true"
    const moreMenuLineMatch = content.match(
      /<MoreMenu[^>]*instanceAdminEnabled={[^}]*}/
    );
    if (moreMenuLineMatch) {
      const moreMenuLine = moreMenuLineMatch[0];
      // Should have the variable, not literal true
      expect(moreMenuLine).toContain("instanceAdminEnabled}");
      expect(moreMenuLine).not.toMatch(/instanceAdminEnabled=\{true\}/);
    }
  });

  it("does not drop the MoreMenu prop", () => {
    const morePath = path.join(
      process.cwd(),
      "src/app/(app)/more/page.tsx"
    );
    const content = fs.readFileSync(morePath, "utf-8");

    // Verify MoreMenu is rendered
    expect(content).toContain("<MoreMenu");

    // Verify instanceAdminEnabled prop is present on MoreMenu
    expect(content).toContain(
      "instanceAdminEnabled={instanceAdminEnabled}"
    );
  });
});
