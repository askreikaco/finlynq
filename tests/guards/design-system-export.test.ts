// REIKA design system export guard: `npm run ds:export` must produce a standalone @reika/ui package.
// Runs the export into a temp dir and fails if any output file imports `@/`, `next/` or a path outside the package,
// if peerDependencies miss a third-party import, if the lock drifts from the files, or if a missing manifest file is skipped silently.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
// @ts-ignore plain .mjs script (typed via allowJs in the repo tsconfig)
import { runExport } from "../../scripts/export-design-system.mjs";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "design-system/export.manifest.json");
let out: string;
let ui: string;
let result: { activeEntries: string[] };

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
/** Module specifiers of a TS/TSX file (comments stripped first). */
function specifiers(text: string): string[] {
  const t = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g)) out.push(m[2]);
  return out;
}
const pkgName = (s: string) => (s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "reika-ds-"));
  ui = path.join(out, "ui");
  result = runExport({ root: ROOT, manifestPath: MANIFEST, outDir: out });
});
afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

describe("design-system export", () => {
  it("output files never import the app alias, next/* or a path outside the package", () => {
    const bad: string[] = [];
    for (const f of walk(ui).filter((p) => /\.(ts|tsx)$/.test(p))) {
      for (const s of specifiers(fs.readFileSync(f, "utf8"))) {
        const rel = path.relative(ui, f);
        if (s.startsWith("@/") || s === "next" || s.startsWith("next/") || s.startsWith("@shared/")) bad.push(`${rel}: ${s}`);
        else if (s.startsWith(".")) {
          const target = path.resolve(path.dirname(f), s);
          if (path.relative(ui, target).startsWith("..")) bad.push(`${rel}: ${s} escapes the package`);
          else if (![target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`].some((c) => fs.existsSync(c) && fs.statSync(c).isFile())) bad.push(`${rel}: ${s} does not resolve`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("tokens.css relative imports stay inside the package", () => {
    const css = fs.readFileSync(path.join(ui, "tokens.css"), "utf8");
    for (const m of css.matchAll(/@import\s+["'](\.[^"']+)["']/g)) {
      expect(path.relative(ui, path.resolve(ui, m[1])).startsWith("..")).toBe(false);
    }
    expect(css).not.toMatch(/@import\s+["']shadcn/);
  });

  it("peerDependencies list every third-party package the output imports", () => {
    const used = new Set<string>();
    for (const f of walk(ui).filter((p) => /\.(ts|tsx)$/.test(p))) {
      for (const s of specifiers(fs.readFileSync(f, "utf8"))) if (!s.startsWith(".")) used.add(pkgName(s));
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(ui, "package.json"), "utf8"));
    const peers = Object.keys(pkg.peerDependencies);
    expect([...used].filter((u) => !peers.includes(u))).toEqual([]);
    for (const required of ["react", "tailwindcss", "tw-animate-css"]) expect(peers).toContain(required);
    for (const v of Object.values(pkg.peerDependencies)) expect(typeof v).toBe("string");
  });

  it("package.json: name, exports map targets exist, version carries the source sha", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ui, "package.json"), "utf8"));
    expect(pkg.name).toBe("@reika/ui");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+\+[0-9a-z]+$/);
    for (const [k, v] of Object.entries(pkg.exports as Record<string, string>)) expect(fs.existsSync(path.join(ui, v)), `${k} -> ${v}`).toBe(true);
  });

  it("MANIFEST.lock matches the generated files", () => {
    const lock = JSON.parse(fs.readFileSync(path.join(out, "MANIFEST.lock"), "utf8"));
    expect(Object.keys(lock.files).length).toBeGreaterThan(30);
    for (const [p, f] of Object.entries(lock.files as Record<string, { sha256: string; src: string }>)) {
      const file = path.join(out, p);
      expect(fs.existsSync(file), p).toBe(true);
      expect(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), p).toBe(f.sha256);
      expect(f.src.length).toBeGreaterThan(0);
    }
  });

  it("generates the web set: tokens, css primitives, web components", () => {
    for (const f of ["tokens/tokens.css", "tokens/tailwind-theme.css", "tokens/bricks-variables.json", "tokens/frappe-overrides.css", "css/reika.css", "web/reika-ds.js", "web/demo.html", "web/README.md", "ui/adapters.tsx", "ui/index.ts", "ui/README.usage.md"]) {
      expect(fs.existsSync(path.join(out, f)), f).toBe(true);
    }
  });

  it("a manifest entry whose file is missing fails loudly, listing it (no silent skip)", () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    m.entries.push({ id: "ghost", title: "Ghost", src: ["src/components/ui/does-not-exist.tsx"], public: [], usage: [] });
    const tmp = path.join(ROOT, "design-system", `.tmp-manifest-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(m));
    try {
      expect(() => runExport({ root: ROOT, manifestPath: tmp, outDir: null })).toThrow(/does-not-exist\.tsx/);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it("an entry retired by a sentinel file is skipped, not an error", () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    m.entries.push({ id: "ghost", title: "Ghost", retiredWhenPresent: ["package.json"], src: ["src/nope.tsx"], public: [], usage: [] });
    const tmp = path.join(ROOT, "design-system", `.tmp-manifest-${process.pid}-b.json`);
    fs.writeFileSync(tmp, JSON.stringify(m));
    try {
      const r = runExport({ root: ROOT, manifestPath: tmp, outDir: null });
      expect(r.activeEntries).not.toContain("ghost");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});
