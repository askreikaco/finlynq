// A card label renders exactly ONE icon tile: CardTitle / SectionCard / MetricCard / CardLabel given `icon=` draw the
// tile themselves, so the call site must not add a second lucide icon beside or inside the label.
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

const ICON_EL = /^\s*<[A-Z][A-Za-z0-9]*\s+className="[^"]*\b(?:h|size)-\d[^"]*"\s*\/>\s*$/;

describe("card label icon tile", () => {
  const files = walk("src");

  it("no stray icon on the line(s) before a <CardTitle icon=...>", () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, "utf8").split("\n");
      lines.forEach((l, i) => {
        if (/<CardTitle\b[^>]*\bicon=/.test(l) && [1, 2].some((k) => ICON_EL.test(lines[i - k] ?? ""))) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("no lucide icon inside the children of an icon-bearing <CardTitle>", () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      const re = /<CardTitle\b([^>]*?)\bicon=\{?[A-Za-z]+\}?[^>]*>([\s\S]*?)<\/CardTitle>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const icons = (m[2].match(/<[A-Z][A-Za-z0-9]*\s[^>]*className="[^"]*\b(?:h|size)-\d[^>]*\/>/g) ?? []).filter((x) => !/InfoTip|CheckCircle2/.test(x));
        if (icons.length) bad.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the card label draws one icon tile, from `icon`", () => {
    const card = fs.readFileSync("src/components/ui/card.tsx", "utf8");
    expect(card.match(/data-slot="card-label-icon"/g)).toHaveLength(1);
  });
});
