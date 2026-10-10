// Guard (CB-3): on/off options are Switch. Checkbox (<Checkbox> or native type="checkbox") is allowed only in files
// listed in tests/guards/checkbox-allowlist.json: multi-row selection controls (row select, select-all, bulk-select lists).
// Ratchet: the allowlist only shrinks. An entry whose file exists, has no checkbox and lacks "optional": true is stale
// and fails, so it gets removed. "optional": true marks sibling-owned entries that may be converted later.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const ALLOWLIST_FILE = path.join(__dirname, "checkbox-allowlist.json");
/** The primitive itself renders the native input. */
const PRIMITIVE = "src/components/ui/checkbox.tsx";

const PATTERNS: { id: string; re: RegExp; sample: string }[] = [
  { id: "<Checkbox", re: /<Checkbox\b/g, sample: "<Checkbox checked={a} />" },
  { id: 'type="checkbox"', re: /type=\{?(["'])checkbox\1\}?/g, sample: '<input type="checkbox" />' },
];

interface AllowEntry {
  reason: string;
  optional?: boolean;
}

const ALLOWLIST: Record<string, AllowEntry> = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));

function listTsx(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listTsx(p, out);
    else if (e.isFile() && e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");

function hitsIn(text: string): { line: number; id: string }[] {
  const out: { line: number; id: string }[] = [];
  for (const { id, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      out.push({ line: text.slice(0, m.index).split("\n").length, id });
    }
  }
  return out;
}

function scan(): Map<string, { line: number; id: string }[]> {
  const map = new Map<string, { line: number; id: string }[]>();
  for (const abs of listTsx(SRC)) {
    const r = rel(abs);
    if (r === PRIMITIVE) continue;
    const h = hitsIn(fs.readFileSync(abs, "utf8"));
    if (h.length) map.set(r, h);
  }
  return map;
}

describe("no-checkbox guard", () => {
  const hits = scan();

  it("allowlist entries are repo-relative .tsx paths with a reason", () => {
    const bad = Object.entries(ALLOWLIST)
      .filter(([k, v]) => !k.endsWith(".tsx") || k.startsWith("/") || k.includes("\\") || k.startsWith("./") || !v.reason?.trim())
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("no checkbox outside the allowlist (switch for on/off, checkbox only for multi-row selection)", () => {
    const violations: string[] = [];
    for (const [file, list] of hits) {
      if (ALLOWLIST[file]) continue;
      for (const h of list) violations.push(`${file}:${h.line} ${h.id}`);
    }
    expect(violations).toEqual([]);
  });

  it("no stale allowlist entry (file exists, has no checkbox, not optional)", () => {
    const stale = Object.entries(ALLOWLIST)
      .filter(([file, entry]) => {
        const abs = path.join(ROOT, file);
        if (!fs.existsSync(abs)) return false;
        if (hits.has(file)) return false;
        return !entry.optional;
      })
      .map(([file]) => file);
    expect(stale).toEqual([]);
  });

  it("self-check: each pattern matches its sample and Switch is not matched", () => {
    for (const { id, sample } of PATTERNS) {
      expect(hitsIn(sample).some((h) => h.id === id), id).toBe(true);
    }
    expect(hitsIn('<Switch checked={a} onCheckedChange={setA} aria-label="x" />')).toEqual([]);
  });
});
