// The top bar title is text only (back button left, actions right): no icon above or beside the label.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("top bar title has no icon", () => {
  it("no page passes an icon element in a PageHeader / SectionPage title", () => {
    const bad: string[] = [];
    for (const f of walk("src")) {
      const s = fs.readFileSync(f, "utf8");
      const re = /\btitle=\{<>\s*<[A-Z][A-Za-z0-9]*\s[^>]*className="[^"]*\b(?:h|w|size)-\d[^>]*\/>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) bad.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
    }
    expect(bad).toEqual([]);
  });

  it("the FIRE calculator header title is plain text", () => {
    const src = fs.readFileSync("src/app/(app)/fire/page.tsx", "utf8");
    expect(src).toMatch(/title="FIRE Calculator"/);
  });

  it("PageHeader's title block holds only the h1, subtitle and belowTitle (no icon slot)", () => {
    const src = fs.readFileSync("src/components/mobile/page-header.tsx", "utf8");
    const block = /const titleBlock = \(([\s\S]*?)\n  \);/.exec(src)![1];
    expect(block).not.toMatch(/icon/i);
    expect(block).not.toMatch(/<[A-Z][A-Za-z]*Icon\b/);
  });
});
