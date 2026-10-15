/**
 * The one Overlay must keep the safe-area insets (--sat / --sab / --sar) and lift above the on-screen
 * keyboard (--kb-inset, published by use-keyboard-inset.ts), and no overlay call site may drop them.
 * Reads sources as text (no DOM).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SAB = "pb-[var(--sab)]";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkTsx(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Every `<Overlay ...>` opening tag in src (attribute text only, up to the first `>` outside braces). */
function overlayTags(): Array<{ file: string; tag: string }> {
  const out: Array<{ file: string; tag: string }> = [];
  for (const f of walkTsx(join(ROOT, "src"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<Overlay\b/g)) {
      let i = m.index!;
      let depth = 0;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0 && src[i - 1] !== "=") break;
      }
      out.push({ file: relative(ROOT, f), tag: src.slice(m.index!, i + 1) });
    }
  }
  return out;
}

describe("overlay safe-area and keyboard insets", () => {
  const overlay = read("src/components/ui/overlay.tsx");

  it("the phone sheet keeps the bottom inset and lifts above the keyboard", () => {
    expect(overlay).toContain(SAB);
    expect(overlay).toContain("bottom-[var(--kb-inset,0px)]");
    expect(overlay).toContain("max-h-[calc(100dvh-var(--kb-inset,0px)-var(--sat))]");
  });

  it("the centred dialog subtracts both insets and the keyboard from its box", () => {
    expect(overlay).toContain("top-[calc(50%+(var(--sat)-var(--sab))/2-var(--kb-inset,0px)/2)]");
    expect(overlay).toContain("max-h-[calc(100dvh-2rem-var(--sat)-var(--sab)-var(--kb-inset,0px))]");
  });

  it("the right-hand drawer pads the top, right and bottom insets", () => {
    expect(overlay).toContain("pt-[var(--sat)]");
    expect(overlay).toContain("pr-[var(--sar)]");
    expect(overlay).toContain("pb-[var(--sab)]");
  });

  it("no overlay uses h-screen or a static vh unit (use dvh)", () => {
    expect(overlay).not.toMatch(/\bh-screen\b/);
    expect(overlay).not.toMatch(/\d(?:\.\d+)?vh\b(?!\])/);
    for (const { tag } of overlayTags()) {
      expect(tag).not.toMatch(/\bh-screen\b/);
      expect(tag).not.toMatch(/\d(?:\.\d+)?vh\b/);
    }
  });

  it("no call site overrides the popup class with padding that drops the bottom inset", () => {
    const DROPS = /className="[^"]*(?:^|\s)(?:p-0|pb-0|!pb-\S*|pb-(?!\[var\(--sab\)\])\S+)(?=\s|")/;
    for (const { file, tag } of overlayTags()) {
      expect(tag, `${file} sets className padding on the popup itself`).not.toMatch(DROPS);
    }
  });

  it("the keyboard inset hook still publishes --kb-inset", () => {
    expect(read("src/components/mobile/use-keyboard-inset.ts")).toContain('"--kb-inset"');
  });
});
