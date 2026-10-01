import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Fixed-size icon tiles inside flex rows get squeezed into thin pills on
// narrow screens unless they opt out of flex-shrink (owner 2026-10-01).
const ROOT = join(__dirname, "../../src");
const TILE = /className="([^"]*\bflex h-(\d+) w-\2\b[^"]*)"/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("fixed-size flex icon tiles", () => {
  it("all carry shrink-0", () => {
    const offenders: string[] = [];
    for (const f of walk(ROOT)) {
      for (const m of readFileSync(f, "utf8").matchAll(TILE)) {
        if (!/\bshrink-0\b/.test(m[1])) offenders.push(`${f.replace(ROOT, "src")}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
