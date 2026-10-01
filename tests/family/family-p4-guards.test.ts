/**
 * P4 static guards (no database): the key-material import boundary, the read-only data layer, and
 * the section builders' import discipline. These fail the build if someone widens the boundary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|jsx)$/.test(e)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** key-material modules: grant (unseal/rotate), label decryptor, overview internals, low-level crypto */
const RESTRICTED = /family\/grant(\.ts)?['"]|family\/label-decrypt(\.ts)?['"]|family\/overview\/|crypto\/family-crypto(\.ts)?['"]|from\s+['"]\.{1,2}\/grant['"]|from\s+['"]\.\/label-decrypt['"]/;
const ALLOWED_DIRS = ["src/lib/family/", "src/app/api/family/overview/"];

export function importViolations(files: Array<{ path: string; text: string }>): string[] {
  const bad: string[] = [];
  for (const f of files) {
    if (ALLOWED_DIRS.some((d) => f.path.startsWith(d))) continue;
    if (f.path === "src/lib/crypto/family-crypto.ts") continue; // the module itself
    for (const line of stripComments(f.text).split("\n")) {
      if (/^\s*(import|export)\b[\s\S]*['"]/.test(line) || /\brequire\(|\bimport\(/.test(line)) {
        if (RESTRICTED.test(line)) bad.push(`${f.path}: ${line.trim()}`);
      }
    }
  }
  return bad;
}

describe("key-material import boundary", () => {
  const files = walk(SRC).map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));

  it("no file outside src/lib/family/** and src/app/api/family/overview/** imports grant / label-decrypt / overview internals / family-crypto", () => {
    expect(importViolations(files)).toEqual([]);
  });

  it("positive control: the scanner detects violations (and the allowed modules do import grant)", () => {
    const planted = [
      { path: "src/app/api/family/manage/x.ts", text: `import { withSectionKeys } from "@/lib/family/grant";` },
      { path: "src/lib/other.ts", text: `import { decryptLabel } from "@/lib/crypto/family-crypto";` },
      { path: "src/lib/other2.ts", text: `const m = await import("@/lib/family/label-decrypt");` },
      { path: "src/app/api/x/route.ts", text: `import { assembleFamilyOverview } from "@/lib/family/overview/assemble";` },
      { path: "src/lib/rel.ts", text: `import { rotateEpoch } from "../../lib/family/grant";` },
    ];
    expect(importViolations(planted)).toHaveLength(5);
    expect(importViolations([{ path: "src/lib/family/x.ts", text: `import a from "./grant";` }])).toEqual([]);
    const allowedUsers = files.filter((f) => ALLOWED_DIRS.some((d) => f.path.startsWith(d)) && /grant["']/.test(f.text));
    expect(allowedUsers.length).toBeGreaterThan(0);
  });

  it("the ESLint config enforces it (real config linting synthetic files)", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const code = `import { withSectionKeys } from "@/lib/family/grant";\nexport const x = withSectionKeys;\n`;
    const ruleErrors = async (filePath: string) => {
      const [r] = await eslint.lintText(code, { filePath: path.join(ROOT, filePath) });
      return r.messages.filter((m) => m.ruleId === "no-restricted-imports" && m.severity === 2);
    };
    expect(await ruleErrors("src/app/api/family/manage/zz.ts")).toHaveLength(1);
    expect(await ruleErrors("src/lib/zz.ts")).toHaveLength(1);
    expect(await ruleErrors("src/components/zz.tsx")).toHaveLength(1);
    expect(await ruleErrors("src/lib/family/zz.ts")).toHaveLength(0);
    expect(await ruleErrors("src/app/api/family/overview/zz.ts")).toHaveLength(0);
  }, 60_000);
});

describe("read-only data layer and builders", () => {
  const read = (p: string) => stripComments(readFileSync(path.join(ROOT, p), "utf8"));

  it("read-queries.ts has no write verb and never touches ciphertext/free-text columns", () => {
    const code = read("src/lib/family/read-queries.ts");
    expect(code).not.toMatch(/\.(insert|update|delete|execute|transaction|run)\s*\(/);
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/);
    expect(code).not.toMatch(/\b(nameCt|aliasCt|symbolCt|accountNameCt|categoryNameCt|payee|tags|noteCt)\b/);
  });

  it("builders import only the read-only barrel, sections registry, fx context and dto types", () => {
    const code = read("src/lib/family/overview/builders.ts");
    const specs = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.sort()).toEqual(["../read-queries", "../sections", "./dto", "./fx"].sort());
    expect(code).not.toMatch(/@\/db|drizzle|decrypt|Dek|\bdek\b|encrypted-columns|envelope|family-crypto|\.(insert|update|delete|execute|transaction)\s*\(/);
    expect(code).not.toMatch(/\b(nameCt|aliasCt|symbolCt)\b/);
  });

  it("every registry section has exactly one builder (new section without a builder fails)", async () => {
    const { FAMILY_SECTIONS_V1 } = await import("@/lib/family/sections");
    const code = read("src/lib/family/overview/builders.ts");
    const block = code.slice(code.indexOf("export const SECTION_BUILDERS"));
    for (const s of FAMILY_SECTIONS_V1) expect(block, s).toMatch(new RegExp(`\\b${s}:\\s*build`));
  });

  it("the overview route exports GET only and the MFA gate follows the login definition (mfaEnabled, not passkeys)", () => {
    const route = read("src/app/api/family/overview/route.ts");
    expect([...route.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])).toEqual(["GET"]);
    const gate = read("src/lib/family/overview/gate.ts");
    expect(gate).toMatch(/mfaEnabled/);
    expect(gate).not.toMatch(/passkey/i);
    const login = readFileSync(path.join(ROOT, "src/lib/auth/finish-login.ts"), "utf8");
    expect(login).toMatch(/if \(user\.mfaEnabled\)/);
  });
});

describe("FX context", () => {
  it("never looks up or converts a malformed owner-controlled currency code (null, not 1:1)", async () => {
    const { FxContext } = await import("@/lib/family/overview/fx");
    const fx = new FxContext("viewer", "USD", "2026-10-01");
    await fx.prepare(["bad code!!", "<script>", "x".repeat(200), "ab"]);
    for (const c of ["bad code!!", "<script>", "ab"]) {
      expect(fx.rate(c)).toBeNull();
      expect(fx.convert(100, c)).toBeNull();
    }
    expect(fx.rate("USD")).toBe(1);
    expect(fx.convert(100, "USD")).toBe(100);
  });
});
