import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static source gate: the API docs page uses design tokens only (no raw zinc/rose palette).
const SRC = readFileSync(
  fileURLToPath(new URL("../../src/app/(app)/api-docs/page.tsx", import.meta.url)),
  "utf8",
);

describe("api-docs page uses design tokens (W5-10)", () => {
  it("has no zinc or rose palette classes", () => {
    const hits = SRC.match(/(?:zinc|rose)-\d+/g) ?? [];
    expect(hits).toEqual([]);
  });

  it("title renders through the shared SectionPage header (one centred report column)", () => {
    expect(SRC).toContain('title="API Docs"');
    expect(SRC).toContain('width="report"');
    expect(SRC).not.toContain("text-3xl");
  });

  it("wrapper and tab classes use tokens", () => {
    expect(SRC).toContain('className="min-h-screen bg-background"');
    expect(SRC).toContain('"bg-background text-foreground shadow-sm"');
  });
});
