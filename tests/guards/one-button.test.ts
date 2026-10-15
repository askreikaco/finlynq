// One button: src/components/ui/button.tsx (`<Button variant size shape iconOnly leading trailing loading badge pressed
// fullWidth href tooltip>`) is the ONLY button component. RoundIconButton, PillButton, RefreshButton, BackButton and
// ThemeToggle are gone, and no call site uses a retired Button API.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((f) => ({ rel: path.relative(process.cwd(), f).split(path.sep).join("/"), src: fs.readFileSync(f, "utf8") }));

/** Opening tags of <name ...> (the `>` of an arrow function or a generic does not end the tag). */
function tagsOf(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp("<" + name + "(?=[\\s>/])", "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0;
    let q: string | null = null;
    let j = m.index;
    for (; j < text.length; j++) {
      const c = text[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (depth === 0 && (c === '"' || c === "'")) { q = c; continue; }
      if (c === "{") { depth++; continue; }
      if (c === "}") { depth--; continue; }
      if (depth > 0) { if (c === '"' || c === "'" || c === "`") q = c; continue; }
      if (c === ">" && text[j - 1] !== "=") break;
    }
    out.push(text.slice(m.index, j + 1));
  }
  return out;
}

const GONE = [
  "src/components/ui/round-icon-button.tsx",
  "src/components/mobile/pill-button.tsx",
  "src/components/refresh-button.tsx",
  "src/components/mobile/back-button.tsx",
  "src/components/theme-toggle.tsx",
];

describe("one button", () => {
  it("the old component files are deleted", () => {
    for (const f of GONE) expect(fs.existsSync(path.join(process.cwd(), f)), f).toBe(false);
  });

  it("nothing imports or uses the old components", () => {
    const hits = FILES.filter(
      (f) =>
        /\b(RoundIconButton|PillButton|RefreshButton|BackButton|ThemeToggle|ROUND_ICON_BUTTON_CLASS)\b/.test(f.src) ||
        /@\/components\/(ui\/round-icon-button|mobile\/pill-button|refresh-button|mobile\/back-button|theme-toggle)/.test(f.src),
    ).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("buttonVariants is internal to button.tsx: a link is <Button href>, never a Link styled by class", () => {
    const users = FILES.filter((f) => /\bbuttonVariants\b/.test(f.src) && f.rel !== "src/components/ui/button.tsx").map((f) => f.rel);
    expect(users).toEqual([]);
  });

  it("no <Button> uses a retired prop or value", () => {
    const retired = /\b(size="(icon|icon-xs|icon-sm|icon-lg|xs|default)"|variant="default"|render=\{)/;
    const offenders: string[] = [];
    for (const f of FILES) for (const t of tagsOf(f.src, "Button")) if (retired.test(t)) offenders.push(`${f.rel}: ${t.replace(/\s+/g, " ").slice(0, 100)}`);
    expect(offenders).toEqual([]);
  });

  it("a round iconOnly Button is never sized by className", () => {
    const offenders: string[] = [];
    for (const f of FILES) for (const t of tagsOf(f.src, "Button")) if (/shape="round"/.test(t) && /\bclassName="[^"]*\b(size-(8|9|10|11)|h-(8|9|10|11)|w-(8|9|10|11))\b/.test(t)) offenders.push(f.rel);
    expect(offenders).toEqual([]);
  });

  it("the Button API: one set of props, one set of variants and sizes", () => {
    const src = fs.readFileSync(path.join(SRC, "components/ui/button.tsx"), "utf8");
    for (const v of ["primary:", "outline:", "secondary:", "ghost:", "destructive:", "link:"]) expect(src).toContain(v);
    for (const p of ["shape?:", "iconOnly?:", "leading?:", "trailing?:", "loading?:", "badge?:", "pressed?:", "fullWidth?:", "href?:", "tooltip?:", "surface?:"]) expect(src).toContain(p);
    expect(src).toContain("CONTROL_SURFACE");
  });

  it("the top bar's primary slot is the only yellow round Add / Edit / Save", () => {
    const header = fs.readFileSync(path.join(SRC, "components/mobile/page-header.tsx"), "utf8");
    expect(header).toContain('data-slot": "topbar-primary"');
  });
});
