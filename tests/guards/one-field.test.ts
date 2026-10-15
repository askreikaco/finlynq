// Guard: ONE Field for every form input. Pages and components render <Field control="..." /> / <FieldGroup>; the
// primitives under src/components/ui/field/ are internal to it, and no second implementation of a label + input,
// select, textarea, switch, checkbox, radio or amount field exists anywhere else.
//
// Ratchet: RAW_ALLOWLIST only shrinks. An entry whose file no longer contains the pattern is stale and fails.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const FIELD_DIR = "src/components/ui/field/";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");
const FILES = walk(SRC).map((abs) => ({ file: rel(abs), text: fs.readFileSync(abs, "utf8") }));
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("one Field: public surface", () => {
  it("the field folder exports only Field and FieldGroup (plus types)", () => {
    const index = fs.readFileSync(path.join(ROOT, FIELD_DIR, "index.ts"), "utf8");
    const values = [...index.matchAll(/^export \{([^}]*)\} from/gm)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));
    expect(values.sort()).toEqual(["Field", "FieldGroup"]);
  });

  it("nothing outside the field folder imports its internals", () => {
    const bad: string[] = [];
    for (const { file, text } of FILES) {
      if (file.startsWith(FIELD_DIR)) continue;
      for (const m of text.matchAll(/from ["']([^"']*ui\/field\/[^"']+)["']/g)) bad.push(`${file} -> ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it("the old per-input components are gone", () => {
    const gone = [
      "src/components/ui/input.tsx",
      "src/components/ui/label.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/combobox.tsx",
      "src/components/ui/group-combobox.tsx",
      "src/components/ui/checkbox.tsx",
      "src/components/ui/auto-textarea.tsx",
      "src/components/amount-input.tsx",
      "src/components/date-picker.tsx",
      "src/components/forms/form-row.tsx",
      "src/components/forms/form-group.tsx",
      "src/components/forms/field-label.tsx",
      "src/components/transactions/entry/form-row.tsx",
      "src/components/transactions/entry/list-card.tsx",
      "src/components/transactions/entry/amount-row.tsx",
      "src/components/transactions/entry/type-segmented.tsx",
      "src/components/transactions/entry/toggle-card.tsx",
      "src/components/transactions/split-rows/split-count-row.tsx",
      "src/components/transactions/split-rows/split-amount-field.tsx",
    ];
    expect(gone.filter((f) => fs.existsSync(path.join(ROOT, f)))).toEqual([]);
  });

  /** ui/switch.tsx is the Switch base of the Field switch; only the sibling-owned InsetRow toggle still imports it. */
  const SWITCH_IMPORTERS = new Set(["src/components/mobile/inset-row.tsx"]);
  it("the Switch base is imported only by Field and the allow-listed sibling", () => {
    const importers = FILES.filter(({ file, text }) => !file.startsWith(FIELD_DIR) && /from ["'][^"']*ui\/switch["']/.test(text)).map((f) => f.file);
    expect(importers.filter((f) => !SWITCH_IMPORTERS.has(f))).toEqual([]);
    for (const f of SWITCH_IMPORTERS) expect(importers, `stale switch allowance: ${f}`).toContain(f);
  });
});

// Raw form markup outside Field. Hidden file choosers stay raw: the browser dialog is the control and nothing is drawn.
interface Pattern {
  id: string;
  re: RegExp;
  sample: string;
}
const PATTERNS: Pattern[] = [
  { id: "<input", re: /<input\b(?![^>]*\btype=["'](?:file|hidden)["'])/g, sample: '<input type="text" />' },
  { id: "<textarea", re: /<textarea\b/g, sample: "<textarea />" },
  { id: "<select", re: /<select\b/g, sample: "<select />" },
  { id: "<label", re: /<label\b/g, sample: "<label>x</label>" },
  { id: "<Label", re: /<Label\b/g, sample: "<Label>x</Label>" },
  { id: 'role="radio"', re: /role=["'](?:radio|radiogroup|switch|combobox)["']/g, sample: '<div role="radiogroup" />' },
];

/** file -> pattern ids still allowed there, with the reason. */
const RAW_ALLOWLIST: Record<string, { ids: string[]; reason: string }> = {
  "src/components/mobile/inset-row.tsx": { ids: ['role="radio"'], reason: "ThemePicker: preview thumbnails as a radiogroup (sibling-owned list family)." },
  "src/components/filter-sort-page.tsx": { ids: ['role="radio"'], reason: "Sort list: radio rows that each carry a direction button." },
  "src/components/settings/sections/data-section.tsx": { ids: ["<label"], reason: "A <label> that is a file-chooser tile around a hidden file input." },
  "src/components/settings/account-content.tsx": { ids: ["<label"], reason: "A <label> that is a file-chooser button around a hidden file input." },
  "src/app/(app)/dashboard/_components/quick-import.tsx": { ids: ["<label"], reason: "A <label> that is a file-chooser button around a hidden file input." },
  "src/app/(app)/account/info/page.tsx": { ids: ["<label"], reason: "A <label> that is a file-chooser button around a hidden file input." },
};

function hits(text: string): string[] {
  const t = code(text);
  const ids: string[] = [];
  for (const p of PATTERNS) if (new RegExp(p.re.source, "g").test(t)) ids.push(p.id);
  return ids;
}

describe("one Field: no raw form markup", () => {
  it("each pattern matches its sample (self-check)", () => {
    for (const p of PATTERNS) expect(new RegExp(p.re.source, "g").test(p.sample), p.id).toBe(true);
    expect(new RegExp(PATTERNS[0].re.source, "g").test('<input type="file" />')).toBe(false);
  });

  it("only Field internals and the allow-list use <input>, <textarea>, <select>, <label>, <Label> or radio roles", () => {
    const bad: string[] = [];
    for (const { file, text } of FILES) {
      if (file.startsWith(FIELD_DIR) || !file.endsWith(".tsx")) continue;
      const allowed = new Set(RAW_ALLOWLIST[file]?.ids ?? []);
      for (const id of hits(text)) if (!allowed.has(id)) bad.push(`${file}: ${id}`);
    }
    expect(bad).toEqual([]);
  });

  it("the allow-list holds no stale entry", () => {
    const stale: string[] = [];
    for (const [file, entry] of Object.entries(RAW_ALLOWLIST)) {
      const f = FILES.find((x) => x.file === file);
      if (!f) {
        stale.push(`${file}: file is gone`);
        continue;
      }
      const found = new Set(hits(f.text));
      for (const id of entry.ids) if (!found.has(id)) stale.push(`${file}: ${id}`);
    }
    expect(stale).toEqual([]);
  });

  it("a <label> exception sits in a file that has a hidden file input", () => {
    for (const [file, entry] of Object.entries(RAW_ALLOWLIST)) {
      if (!entry.ids.includes("<label")) continue;
      expect(FILES.find((x) => x.file === file)!.text, file).toMatch(/type=["']file["']/);
    }
  });
});

describe("one Field: no description paragraph under an input", () => {
  it("Field renders hint / warning / error only as short one-liners (no <p> in its source)", () => {
    const src = code(fs.readFileSync(path.join(ROOT, FIELD_DIR, "field.tsx"), "utf8"));
    expect(src).not.toMatch(/<p\b/);
  });
});
