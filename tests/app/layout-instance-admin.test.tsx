/**
 * @vitest-environment node
 *
 * AppLayout instance admin wiring test (WP9a)
 *
 * Verifies that AppLayout correctly:
 * 1. Imports and calls isInstanceAdminEnabled()
 * 2. Passes the result to Nav as instanceAdminEnabled prop
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("AppLayout instance admin wiring", () => {
  it("calls isInstanceAdminEnabled and passes result to Nav prop", () => {
    // Read the source file
    const layoutPath = path.join(
      process.cwd(),
      "src/app/(app)/layout.tsx"
    );
    const content = fs.readFileSync(layoutPath, "utf-8");

    // Verify the flag is imported
    expect(content).toContain(
      'import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag"'
    );

    // Verify isInstanceAdminEnabled() is called
    expect(content).toContain("isInstanceAdminEnabled()");

    // Verify the result is assigned to a variable
    expect(content).toContain("instanceAdminEnabled");

    // Verify the variable is passed to Nav
    expect(content).toContain("instanceAdminEnabled={instanceAdminEnabled}");

    // Verify this is inside the Nav component
    expect(content).toContain("<Nav instanceAdminEnabled={instanceAdminEnabled}");
  });

  it("does not hard-code the flag value to true", () => {
    const layoutPath = path.join(
      process.cwd(),
      "src/app/(app)/layout.tsx"
    );
    const content = fs.readFileSync(layoutPath, "utf-8");

    // This would catch the mutation: "layout.tsx forces the flag true"
    // Count how many times true is explicitly passed to instanceAdminEnabled
    const navLineMatch = content.match(
      /<Nav[^>]*instanceAdminEnabled={[^}]*}/
    );
    if (navLineMatch) {
      const navLine = navLineMatch[0];
      // Should have the variable, not literal true
      expect(navLine).toContain("instanceAdminEnabled}");
      expect(navLine).not.toMatch(/instanceAdminEnabled=\{true\}/);
    }
  });

  it("does not drop the Nav prop", () => {
    const layoutPath = path.join(
      process.cwd(),
      "src/app/(app)/layout.tsx"
    );
    const content = fs.readFileSync(layoutPath, "utf-8");

    // Verify Nav is rendered
    expect(content).toContain("<Nav");

    // Verify instanceAdminEnabled prop is present on Nav
    expect(content).toContain(
      "instanceAdminEnabled={instanceAdminEnabled}"
    );
  });
});
