import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

describe("Ungated API routes", () => {
  it("loans/route.ts does not contain requireDevMode", async () => {
    const filePath = path.join(process.cwd(), "src/app/api/loans/route.ts");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).not.toContain("requireDevMode");
  });

  it("subscriptions/route.ts does not contain requireDevMode", async () => {
    const filePath = path.join(
      process.cwd(),
      "src/app/api/subscriptions/route.ts"
    );
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).not.toContain("requireDevMode");
  });

  it("recurring/route.ts does not contain requireDevMode", async () => {
    const filePath = path.join(process.cwd(), "src/app/api/recurring/route.ts");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).not.toContain("requireDevMode");
  });

  it("insights/route.ts DOES contain requireDevMode (remains gated)", async () => {
    const filePath = path.join(process.cwd(), "src/app/api/insights/route.ts");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("requireDevMode");
  });
});
