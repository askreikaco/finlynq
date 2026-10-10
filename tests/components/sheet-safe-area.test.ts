/**
 * Bottom sheets must keep the bottom safe-area inset (--sab) so their last rows
 * clear the mobile browser toolbar. Reads sources as text (no DOM).
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

/** The PICKER_SHEET_CLASS string literal from grouped-picker.tsx. */
function pickerSheetClass(): string {
  const src = read("src/components/transactions/entry/grouped-picker.tsx");
  const m = src.match(/export const PICKER_SHEET_CLASS =\s*"([^"]*)"/);
  expect(m, "PICKER_SHEET_CLASS literal not found").not.toBeNull();
  return m![1];
}

/** Every `<SheetContent ...>` opening tag in src, with its file path. */
function sheetContentTags(): Array<{ file: string; tag: string }> {
  const files = walkTsx(join(ROOT, "src"));
  const out: Array<{ file: string; tag: string }> = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<SheetContent\b[^>]*>/g)) {
      out.push({ file: relative(ROOT, f), tag: m[0] });
    }
  }
  return out;
}

/** Padding that drops the bottom inset: p-0, pb-0, !pb-*, or a pb that is not --sab. */
const DROPS_BOTTOM_INSET = /(?:^|[\s"'`{])(?:p-0|pb-0|!pb-\S*|pb-(?!\[var\(--sab\)\])\S+)(?=[\s"'`}]|$)/;

describe("sheet safe-area inset", () => {
  it("PICKER_SHEET_CLASS keeps a bottom safe-area inset on phones and drops it from regular up", () => {
    const cls = pickerSheetClass();
    expect(cls).toContain(SAB);
    expect(cls).toContain("regular:pb-0");
    // The inset must come after p-0, or tailwind-merge drops it again.
    expect(cls.indexOf(SAB)).toBeGreaterThan(cls.indexOf("p-0"));
  });

  it("the sheet primitive keeps the bottom safe-area inset by default", () => {
    expect(read("src/components/ui/sheet.tsx")).toContain(SAB);
  });

  it("every side=bottom SheetContent relies on the default padding or sets its own --sab inset", () => {
    const bottom = sheetContentTags().filter((t) => /side="bottom"/.test(t.tag));
    expect(bottom.length).toBeGreaterThan(0);
    for (const { file, tag } of bottom) {
      const usesPicker = tag.includes("PICKER_SHEET_CLASS");
      if (usesPicker) {
        expect(pickerSheetClass(), file).toContain(SAB);
        continue;
      }
      if (DROPS_BOTTOM_INSET.test(tag)) {
        expect(tag, `${file} drops the bottom inset without pb-[var(--sab)]`).toContain(SAB);
      }
    }
  });

  it("no sheet class uses h-screen or 100vh (use dvh)", () => {
    const sheetClasses = [
      ...sheetContentTags().map((t) => t.tag),
      read("src/components/ui/sheet.tsx"),
      pickerSheetClass(),
    ];
    for (const cls of sheetClasses) {
      expect(cls).not.toMatch(/\bh-screen\b/);
      // Any `<number>vh` (100vh, 85vh, ...) is a static viewport unit; `dvh` is allowed.
      expect(cls).not.toMatch(/\d(?:\.\d+)?vh\b/);
    }
  });
});
