import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

describe("Portfolio page /cloud link", () => {
  it("should not have href=/login in any src files", () => {
    // Grep for href="/login" in source files - should find nothing
    try {
      const result = execSync('grep -r \'href=\\"/login\\"\' src/', { encoding: "utf-8" });
      // If grep finds matches, fail the test
      expect(result).toBe("");
    } catch (e: any) {
      // grep returns exit code 1 when no matches found, which is what we want
      expect(e.status).toBe(1);
    }
  });

  it("confirms /login route does not exist", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const appDir = path.join(process.cwd(), "src/app");
    const loginPathExists = fs.existsSync(path.join(appDir, "(app)", "login"));
    expect(loginPathExists).toBe(false);
  });
});
