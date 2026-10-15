// A card title renders exactly ONE icon tile: a <Card icon=... title=...> draws the tile itself, so the call site must not
// add a second lucide icon inside the title or beside the Card.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const ICON_CLASS = /\b(?:h|size)-\d/;

/** Lucide-style icon elements (`<Foo className="h-4 w-4" />`) inside a node, except tips / status glyphs that are not label icons. */
function iconsIn(node: ts.Node): ts.JsxSelfClosingElement[] {
  const out: ts.JsxSelfClosingElement[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText();
      const cls = n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "className") as ts.JsxAttribute | undefined;
      if (/^[A-Z]/.test(tag) && !/InfoTip|CheckCircle2/.test(tag) && cls?.initializer && ICON_CLASS.test(cls.initializer.getText())) out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

describe("card title icon tile", () => {
  it("no lucide icon inside the `title` of an icon-bearing <Card>", () => {
    const bad: string[] = [];
    for (const f of walk("src")) {
      const text = fs.readFileSync(f, "utf8");
      if (!/<Card\b/.test(text)) continue;
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === "Card") {
          const attr = (name: string) => n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === name) as ts.JsxAttribute | undefined;
          const title = attr("title");
          if (attr("icon") && title?.initializer && iconsIn(title.initializer).length) bad.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });

  it("the card label draws one icon tile, from `icon`", () => {
    const label = fs.readFileSync("src/components/mobile/card-label.tsx", "utf8");
    expect(label.match(/data-slot="card-label-icon"/g)).toHaveLength(1);
    const card = fs.readFileSync("src/components/ui/card.tsx", "utf8");
    expect(card).not.toContain("card-label-icon");
  });
});
