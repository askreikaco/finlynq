// Next.js requires a "use client" / "use server" directive to be the FIRST statement of a module.
// vitest does not enforce this (only `next build` does), so a misplaced directive passed every test and failed the
// release build once (rules pages: imports inserted above the directive). This scan catches it in CI.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("module directives", () => {
  it('"use client" / "use server" is the first statement wherever it appears', () => {
    const bad: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      const m = /^[ \t]*(["'])use (client|server)\1;?[ \t]*$/m.exec(src);
      if (!m) continue;
      const head = src
        .slice(0, m.index)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      if (head.trim() !== "") bad.push(file);
    }
    expect(bad).toEqual([]);
  });
});
