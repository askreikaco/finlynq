// G2-15: caller className overrides on ui primitives must not fight the pointer-based bases.
// Rule A: no viewport variant (sm/md/lg/xl/2xl, max-*, regular, wide, max-regular) WITHOUT a
//         pointer-fine/pointer-coarse modifier on a className passed to Input/Select/SelectTrigger/
//         Combobox/GroupCombobox/Button/TabsList/TabsTrigger, except the reasoned EXCEPTIONS below
//         (width and display toggles only). regular:pointer-fine:* is the sanctioned form.
// Rule B: no viewport-variant size or font-size override (h-, min-h-, size-, text-*) without a
//         pointer modifier, exceptions do not apply.
// Container-query tokens (@sm:, @[24rem]:) are not viewport tokens and are ignored.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

const ROOT = process.cwd();
const PRIMITIVES = new Set(["Input", "Select", "SelectTrigger", "Combobox", "GroupCombobox", "Button", "TabsList", "TabsTrigger"]);
const VIEWPORT_SEG = /^(max-)?(sm|md|lg|xl|2xl)$|^(regular|wide|max-regular)$/;
const SIZE_UTIL = /^(h|min-h|size|text)-/;
const POINTER_MOD = /pointer-(fine|coarse)/;

// file -> viewport tokens allowed on primitives there. Width or display toggles only, never sizes.
export const EXCEPTIONS: Record<string, string[]> = {
  "src/app/(app)/transactions/_components/transactions-workspace.tsx": ["regular:w-36"],
  "src/app/(app)/settings/general/page.tsx": ["regular:w-48"],
  "src/app/(app)/categories/[id]/page.tsx": ["max-regular:w-40"],
  "src/components/ui/pagination.tsx": ["regular:inline-flex"],
  "src/components/mobile/page-header.tsx": ["regular:hidden"],
  // Filter icon Button display toggle (hidden at regular width). Display-only, same category as page-header.
  "src/app/(app)/portfolio/dividends/page.tsx": ["regular:hidden"],
  "src/app/(app)/portfolio/realized-gains/page.tsx": ["regular:hidden"],
};

export interface Hit { file: string; line: number; tag: string; token: string }

function walk(dir: string, out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// Class tokens of a className initializer: string literals, template parts, and
// same-file top-level const strings it references by identifier.
function classTokens(init: ts.Expression, sf: ts.SourceFile): string[] {
  const texts: string[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) texts.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) texts.push(n.text);
    else if (ts.isIdentifier(n)) {
      const decl = findConst(n.text, sf);
      if (decl) texts.push(decl);
    }
    ts.forEachChild(n, collect);
  };
  collect(init);
  return texts.join(" ").split(/[\s'"`{}(),]+/).filter(Boolean);
}

function findConst(id: string, sf: ts.SourceFile): string | undefined {
  let found: string | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === id && n.initializer) {
      if (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer)) found = n.initializer.text;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// Viewport-variant tokens: a segment before the utility is a viewport variant. Container tokens skipped.
export function viewportTokens(tokens: string[]): string[] {
  return tokens.filter((t) => {
    if (t.includes("@")) return false;
    const mods = t.split(":").slice(0, -1);
    return mods.some((s) => VIEWPORT_SEG.test(s)) && !mods.some((s) => POINTER_MOD.test(s));
  });
}

// Rule B: viewport-variant size/font-size utility without a pointer modifier.
export function unpointedSizeOverrides(tokens: string[]): string[] {
  return tokens.filter((t) => {
    if (t.includes("@")) return false;
    const segs = t.split(":");
    const util = segs[segs.length - 1];
    const mods = segs.slice(0, -1);
    const viewport = mods.some((s) => VIEWPORT_SEG.test(s));
    return viewport && SIZE_UTIL.test(util) && !mods.some((s) => POINTER_MOD.test(s));
  });
}

export function scanSource(file: string, src: string): { viewport: Hit[]; unpointed: Hit[] } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const viewport: Hit[] = [];
  const unpointed: Hit[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (PRIMITIVES.has(tag)) {
        for (const a of node.attributes.properties) {
          if (!ts.isJsxAttribute(a) || a.name.getText(sf) !== "className" || !a.initializer) continue;
          const init = ts.isJsxExpression(a.initializer) && a.initializer.expression ? a.initializer.expression : a.initializer;
          const tokens = classTokens(init, sf);
          const line = sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1;
          for (const t of viewportTokens(tokens)) viewport.push({ file, line, tag, token: t });
          for (const t of unpointedSizeOverrides(tokens)) unpointed.push({ file, line, tag, token: t });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { viewport, unpointed };
}

describe("ui caller overrides (G2-15)", () => {
  const files = walk(path.join(ROOT, "src"), []).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));

  it("no viewport-variant className on ui primitives outside the reasoned exceptions", () => {
    const hits = files
      .flatMap((f) => scanSource(f, fs.readFileSync(path.join(ROOT, f), "utf-8")).viewport)
      .filter((h) => !(EXCEPTIONS[h.file] ?? []).includes(h.token));
    expect(hits.map((h) => `${h.file}:${h.line} <${h.tag}> ${h.token}`)).toEqual([]);
  });

  it("no regular:/wide:/max-regular: size or font-size override without a pointer modifier", () => {
    const hits = files.flatMap((f) => scanSource(f, fs.readFileSync(path.join(ROOT, f), "utf-8")).unpointed);
    expect(hits.map((h) => `${h.file}:${h.line} <${h.tag}> ${h.token}`)).toEqual([]);
  });

  it("exceptions are real: each listed token still occurs in its file (no stale exceptions)", () => {
    const stale: string[] = [];
    for (const [file, tokens] of Object.entries(EXCEPTIONS)) {
      const seen = new Set(scanSource(file, fs.readFileSync(path.join(ROOT, file), "utf-8")).viewport.map((h) => h.token));
      for (const t of tokens) if (!seen.has(t)) stale.push(`${file}: ${t}`);
    }
    expect(stale).toEqual([]);
  });

  it("the shared size-constant overrides carry no viewport tokens", () => {
    for (const file of [
      "src/components/portfolio/forms/op-page.tsx",
      "src/components/portfolio/lot-allocation-matrix.tsx",
    ]) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf-8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      for (const id of ["OP_SELECT", "OP_INPUT", "inputCls"]) {
        const v = findConst(id, sf);
        if (v === undefined) continue;
        expect(viewportTokens(v.split(/\s+/)), `${file} ${id}`).toEqual([]);
      }
    }
  });

  describe("self-test (synthetic)", () => {
    const sample = (cls: string) =>
      scanSource("src/x.tsx", `export const A = () => <Button className="${cls}">x</Button>;`);
    it("flags md: and max-md: on a primitive", () => {
      expect(sample("md:h-8").viewport.map((h) => h.token)).toEqual(["md:h-8"]);
      expect(sample("max-md:min-h-11").viewport.map((h) => h.token)).toEqual(["max-md:min-h-11"]);
    });
    it("flags regular: size override without pointer modifier, passes with it", () => {
      expect(sample("regular:text-sm").unpointed.map((h) => h.token)).toEqual(["regular:text-sm"]);
      expect(sample("regular:pointer-fine:text-sm").unpointed).toEqual([]);
      expect(sample("regular:pointer-fine:h-8").unpointed).toEqual([]);
    });
    it("regular:pointer-fine:* is the sanctioned form, not a viewport override", () => {
      expect(sample("regular:pointer-fine:text-sm").viewport).toEqual([]);
      expect(sample("pointer-coarse:h-11 dense:pointer-fine:h-7").viewport).toEqual([]);
    });
    it("ignores container-query tokens", () => {
      expect(sample("@md:h-8 @xl:text-sm").viewport).toEqual([]);
      expect(sample("@md:h-8 @xl:text-sm").unpointed).toEqual([]);
    });
    it("ignores non-primitive elements", () => {
      const r = scanSource("src/x.tsx", `export const A = () => <span className="md:h-8">x</span>;`);
      expect(r.viewport).toEqual([]);
      expect(r.unpointed).toEqual([]);
    });
  });
});
